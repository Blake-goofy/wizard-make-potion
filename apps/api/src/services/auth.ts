import { createHmac, pbkdf2Sync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import {
  accountProfileSchema,
  adminManagedUserSchema,
  type ChangePasswordInput,
  sessionUserSchema,
  type AdminManagedUser,
  type AdminUserUpdateInput,
  type CreateAccountInput,
  type LoginInput,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type UpdateAccountInput,
  type SessionUser,
  type VerifyAccountInput,
  type VerifyPhoneNumberInput,
} from '@potion/shared';
import { renderAccountVerificationEmail, renderPasswordResetEmail } from '@potion/email';
import type { Database } from '@potion/db';
import type { AppConfig } from '../config.js';
import type { EmailQueueService } from './emailQueue.js';
import type { SmsService } from './sms.js';

type SessionPayload = {
  sub: string;
  iat: number;
};

export type AuthService = ReturnType<typeof createAuthService>;
const passwordIterations = 310000;

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function safeCompare(left: Buffer, right: Buffer) {
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function verifyPassword(password: string, storedHash: string) {
  const [scheme, digest, iterationsText, saltText, hashText] = storedHash.split('$');
  const iterations = Number(iterationsText);

  if (
    scheme !== 'pbkdf2' ||
    digest !== 'sha256' ||
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    !saltText ||
    !hashText
  ) {
    return false;
  }

  const expectedHash = Buffer.from(hashText, 'base64url');
  const actualHash = pbkdf2Sync(password, Buffer.from(saltText, 'base64url'), iterations, expectedHash.length, digest);

  return safeCompare(actualHash, expectedHash);
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, passwordIterations, 32, 'sha256');
  return `pbkdf2$sha256$${passwordIterations}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function readPhoneDigits(phoneNumber: string) {
  return phoneNumber.replace(/\D/g, '').slice(-10);
}

function formatPhoneNumber(phoneNumber: string) {
  const digits = readPhoneDigits(phoneNumber);

  if (digits.length !== 10) {
    throw createHttpError('Enter a 10-digit phone number to verify by text.', 400);
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function buildSmsVerificationMessage(code: string) {
  return `Wizard Make Potion verification code: ${code}. This code expires in 15 minutes.`;
}

function hashPhoneVerificationCode(userId: string, phoneNumber: string, code: string, secret: string) {
  return createHmac('sha256', secret).update(`${userId}:${phoneNumber}:${code}`).digest('hex');
}

function deriveSmsOptIn(preferences: {
  eventReminderOptIn?: boolean;
  upcomingEventsOptIn?: boolean;
}) {
  return Boolean(preferences.eventReminderOptIn || preferences.upcomingEventsOptIn);
}

export function createAuthService(
  config: AppConfig,
  db: Database,
  emailQueue: EmailQueueService,
  options: { sms: SmsService; canSendSms: boolean },
) {
  function sign(value: string) {
    return createHmac('sha256', config.authSessionSecret).update(value).digest('hex');
  }

  function createToken(userId: string) {
    const payload: SessionPayload = { sub: userId, iat: Date.now() };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encodedPayload}.${sign(encodedPayload)}`;
  }

  function hashVerificationCode(email: string, code: string) {
    return createHmac('sha256', config.authSessionSecret).update(`${normalizeEmail(email)}:${code}`).digest('hex');
  }

  function readBearerToken(request: FastifyRequest) {
    const header = request.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  }

  function verifyToken(token: string | undefined) {
    if (!token) return null;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);
    if (!safeCompare(received, expected)) return null;

    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload;
      if (!decoded.sub || Date.now() - decoded.iat > 1000 * 60 * 60 * 24 * 7) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  async function findSessionUser(userId: string) {
    const result = await db.query(
      `select id,
              email,
              display_name as "displayName",
              role,
              phone_number as "phoneNumber",
              phone_verified_at as "phoneVerifiedAt",
              event_reminder_opt_in as "eventReminderOptIn",
              upcoming_events_opt_in as "upcomingEventsOptIn",
              sms_opt_in as "smsOptIn"
       from users
       where id = $1 and is_active = true`,
      [userId],
    );

    const user = result.rows[0];
    return user ? sessionUserSchema.parse(user) : null;
  }

  async function requireUser(request: FastifyRequest) {
    const payload = verifyToken(readBearerToken(request));
    if (!payload) throw createHttpError('Sign-in required.', 401);

    const user = await findSessionUser(payload.sub);
    if (!user) throw createHttpError('Sign-in required.', 401);

    return user;
  }

  async function requireAdmin(request: FastifyRequest) {
    const user = await requireUser(request);
    if (user.role !== 'admin') throw createHttpError('Admin access required.', 403);
    return user;
  }

  async function requireScanner(request: FastifyRequest) {
    const user = await requireUser(request);
    if (user.role !== 'scanner' && user.role !== 'admin') {
      throw createHttpError('Scanner access required.', 403);
    }
    return user;
  }

  return {
    async createAccount(input: CreateAccountInput) {
      const email = normalizeEmail(input.email);
      const existing = await db.query(`select id from users where lower(email) = $1 and is_active = true`, [email]);

      if (existing.rowCount) {
        throw createHttpError('An account already exists for that email.', 409);
      }

      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const passwordHash = hashPassword(input.password);
      const codeHash = hashVerificationCode(email, code);
      const phoneNumber = input.phoneNumber?.trim() || null;
      const eventReminderOptIn = input.eventReminderOptIn;
      const upcomingEventsOptIn = input.upcomingEventsOptIn;
      const smsOptIn = deriveSmsOptIn(input);
      const verificationEmail = renderAccountVerificationEmail({ code });

      await db.transaction(async (client) => {
        await client.query(
          `insert into account_verification_codes (
             email,
             display_name,
             password_hash,
             code_hash,
             phone_number,
             event_reminder_opt_in,
             upcoming_events_opt_in,
             sms_opt_in,
             sms_consent_at,
             expires_at
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + interval '15 minutes')`,
          [
            email,
            input.displayName.trim(),
            passwordHash,
            codeHash,
            phoneNumber,
            eventReminderOptIn,
            upcomingEventsOptIn,
            smsOptIn,
            smsOptIn ? new Date().toISOString() : null,
          ],
        );

        await client.query(
          `insert into email_outbox (to_email, subject, html_body, text_body, status)
           values ($1, $2, $3, $4, 'pending')`,
          [
            email,
            verificationEmail.subject,
            verificationEmail.htmlBody,
            verificationEmail.textBody,
          ],
        );
      });

      await emailQueue.processPending();

      return {
        email,
        verificationDestination: email,
        message: 'Verification code queued for email delivery.',
      };
    },

    async verifyAccount(input: VerifyAccountInput) {
      const email = normalizeEmail(input.email);
      const result = await db.query(
        `select id,
          display_name as "displayName",
          password_hash as "passwordHash",
          code_hash as "codeHash",
          phone_number as "phoneNumber",
          event_reminder_opt_in as "eventReminderOptIn",
          upcoming_events_opt_in as "upcomingEventsOptIn",
          sms_opt_in as "smsOptIn",
          sms_consent_at as "smsConsentAt"
         from account_verification_codes
         where lower(email) = $1 and consumed_at is null and expires_at > now()
         order by created_at desc
         limit 1`,
        [email],
      );
      const pendingAccount = result.rows[0];

      if (!pendingAccount || !safeCompare(Buffer.from(pendingAccount.codeHash), Buffer.from(hashVerificationCode(email, input.code)))) {
        throw createHttpError('Invalid or expired verification code.', 401);
      }

      const userResult = await db.transaction(async (client) => {
        await client.query(`update account_verification_codes set consumed_at = now() where id = $1`, [pendingAccount.id]);
        const verified = await client.query(
          `insert into users (
             email,
             display_name,
             role,
             password_hash,
             phone_number,
             phone_verified_at,
             event_reminder_opt_in,
             upcoming_events_opt_in,
             sms_opt_in,
             sms_consent_at,
             sms_opted_out_at,
             is_active
           )
           values ($1, $2, 'customer', $3, $4, null, $5, $6, $7, $8, null, true)
           on conflict (email) do update
           set display_name = excluded.display_name,
               password_hash = excluded.password_hash,
               phone_number = excluded.phone_number,
               phone_verified_at = null,
               event_reminder_opt_in = excluded.event_reminder_opt_in,
               upcoming_events_opt_in = excluded.upcoming_events_opt_in,
               sms_opt_in = excluded.sms_opt_in,
               sms_consent_at = case
                 when excluded.sms_opt_in then coalesce(users.sms_consent_at, excluded.sms_consent_at)
                 else null
               end,
               sms_opted_out_at = case
                 when excluded.sms_opt_in then null
                 else users.sms_opted_out_at
               end,
               is_active = true,
               updated_at = now()
           returning id,
                     email,
                     display_name as "displayName",
                     role,
                     phone_number as "phoneNumber",
                     phone_verified_at as "phoneVerifiedAt",
                     event_reminder_opt_in as "eventReminderOptIn",
                     upcoming_events_opt_in as "upcomingEventsOptIn",
                     sms_opt_in as "smsOptIn"`,
          [
            email,
            pendingAccount.displayName,
            pendingAccount.passwordHash,
            pendingAccount.phoneNumber,
            pendingAccount.eventReminderOptIn,
            pendingAccount.upcomingEventsOptIn,
            pendingAccount.smsOptIn,
            pendingAccount.smsConsentAt,
          ],
        );
        return verified.rows[0];
      });

      const user = sessionUserSchema.parse(userResult);
      return { token: createToken(user.id), user };
    },

    async login(input: LoginInput) {
      const email = normalizeEmail(input.email);
      const result = await db.query(
        `select id,
                email,
                display_name as "displayName",
                role,
                phone_number as "phoneNumber",
                phone_verified_at as "phoneVerifiedAt",
                event_reminder_opt_in as "eventReminderOptIn",
                upcoming_events_opt_in as "upcomingEventsOptIn",
                  sms_opt_in as "smsOptIn",
                password_hash as "passwordHash"
         from users
         where lower(email) = lower($1) and is_active = true`,
        [email],
      );
      const user = result.rows[0];

      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw createHttpError('Invalid email or password.', 401);
      }

      const sessionUser = sessionUserSchema.parse(user);
      return { token: createToken(sessionUser.id), user: sessionUser };
    },

    async requestPasswordReset(input: RequestPasswordResetInput) {
      const email = normalizeEmail(input.email);
      const result = await db.query(`select id from users where lower(email) = $1 and is_active = true`, [email]);
      const user = result.rows[0];

      if (user) {
        const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
        const codeHash = hashVerificationCode(email, code);
        const resetEmail = renderPasswordResetEmail({ code });

        await db.transaction(async (client) => {
          await client.query(
            `insert into password_reset_codes (user_id, email, code_hash, expires_at)
             values ($1, $2, $3, now() + interval '15 minutes')`,
            [user.id, email, codeHash],
          );

          await client.query(
            `insert into email_outbox (to_email, subject, html_body, text_body, status)
             values ($1, $2, $3, $4, 'pending')`,
            [email, resetEmail.subject, resetEmail.htmlBody, resetEmail.textBody],
          );
        });

        await emailQueue.processPending();
      }

      return { email, message: 'If an account exists for that email, a reset code has been queued for delivery.' };
    },

    async resetPassword(input: ResetPasswordInput) {
      const email = normalizeEmail(input.email);
      const result = await db.query(
        `select prc.id, prc.code_hash as "codeHash", u.id as "userId"
         from password_reset_codes prc
         join users u on u.id = prc.user_id
         where lower(prc.email) = $1
           and lower(u.email) = $1
           and u.is_active = true
           and prc.consumed_at is null
           and prc.expires_at > now()
         order by prc.created_at desc
         limit 1`,
        [email],
      );
      const resetCode = result.rows[0];

      if (!resetCode || !safeCompare(Buffer.from(resetCode.codeHash), Buffer.from(hashVerificationCode(email, input.code)))) {
        throw createHttpError('Invalid or expired reset code.', 401);
      }

      const passwordHash = hashPassword(input.newPassword);

      await db.transaction(async (client) => {
        await client.query(`update password_reset_codes set consumed_at = now() where id = $1`, [resetCode.id]);
        await client.query(
          `update users
           set password_hash = $2,
               updated_at = now()
           where id = $1 and is_active = true`,
          [resetCode.userId, passwordHash],
        );
      });

      return { reset: true as const };
    },

    async requireUser(request: FastifyRequest): Promise<SessionUser> {
      return requireUser(request);
    },

    async requireAdmin(request: FastifyRequest): Promise<SessionUser> {
      return requireAdmin(request);
    },

    async requireScanner(request: FastifyRequest): Promise<SessionUser> {
      return requireScanner(request);
    },

    async getCurrentUser(request: FastifyRequest): Promise<SessionUser> {
      return requireUser(request);
    },

    async listAdminUsers(request: FastifyRequest): Promise<AdminManagedUser[]> {
      await requireAdmin(request);
      const result = await db.query(
        `select id,
                email,
                display_name as "displayName",
                role,
                is_active as "isActive"
         from users
         order by display_name asc, email asc`,
      );

      return result.rows.map((row) => adminManagedUserSchema.parse(row));
    },

    async updateAdminUser(request: FastifyRequest, userId: string, input: AdminUserUpdateInput): Promise<AdminManagedUser> {
      await requireAdmin(request);
      const result = await db.query(
        `update users
         set role = $2,
             is_active = $3,
             updated_at = now()
         where id = $1
         returning id,
                   email,
                   display_name as "displayName",
                   role,
                   is_active as "isActive"`,
        [userId, input.role, input.isActive],
      );

      const updatedUser = result.rows[0];
      if (!updatedUser) throw createHttpError('User was not found.', 404);

      return adminManagedUserSchema.parse(updatedUser);
    },

    async getAccountProfile(request: FastifyRequest) {
      const user = await requireUser(request);
      return accountProfileSchema.parse(user);
    },

    async requestPhoneVerification(request: FastifyRequest) {
      const user = await requireUser(request);

      if (!user.phoneNumber) {
        throw createHttpError('Add a phone number before requesting a verification code.', 400);
      }

      if (!options.canSendSms) {
        throw createHttpError('Text verification is not available right now.', 503);
      }

      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const phoneNumber = formatPhoneNumber(user.phoneNumber);
      const codeHash = hashPhoneVerificationCode(user.id, phoneNumber, code, config.authSessionSecret);

      await db.query(
        `insert into phone_verification_codes (user_id, phone_number, code_hash, expires_at)
         values ($1, $2, $3, now() + interval '15 minutes')`,
        [user.id, phoneNumber, codeHash],
      );

      await options.sms.queueMessage({
        toPhoneNumber: phoneNumber,
        messageBody: buildSmsVerificationMessage(code),
        messageType: 'transactional',
      });
      await options.sms.processPending();

      return {
        phoneNumber,
        message: 'Verification code queued for text delivery.',
      };
    },

    async verifyPhoneNumber(request: FastifyRequest, input: VerifyPhoneNumberInput) {
      const user = await requireUser(request);

      if (!user.phoneNumber) {
        throw createHttpError('Add a phone number before verifying it.', 400);
      }

      const phoneNumber = formatPhoneNumber(user.phoneNumber);
      const result = await db.query(
        `select id,
                code_hash as "codeHash"
         from phone_verification_codes
         where user_id = $1
           and phone_number = $2
           and consumed_at is null
           and expires_at > now()
         order by created_at desc
         limit 1`,
        [user.id, phoneNumber],
      );
      const pendingVerification = result.rows[0];

      if (!pendingVerification || !safeCompare(
        Buffer.from(pendingVerification.codeHash),
        Buffer.from(hashPhoneVerificationCode(user.id, phoneNumber, input.code, config.authSessionSecret)),
      )) {
        throw createHttpError('Invalid or expired verification code.', 401);
      }

      const updatedResult = await db.transaction(async (client) => {
        await client.query(`update phone_verification_codes set consumed_at = now() where id = $1`, [pendingVerification.id]);

        return client.query(
          `update users
           set phone_verified_at = now(),
               updated_at = now()
           where id = $1 and is_active = true
           returning id,
                     email,
                     display_name as "displayName",
                     role,
                     phone_number as "phoneNumber",
                     phone_verified_at as "phoneVerifiedAt",
                     event_reminder_opt_in as "eventReminderOptIn",
                     upcoming_events_opt_in as "upcomingEventsOptIn",
                     sms_opt_in as "smsOptIn"`,
          [user.id],
        );
      });

      const updatedUser = updatedResult.rows[0];
      if (!updatedUser) {
        throw createHttpError('Account was not found.', 404);
      }

      return accountProfileSchema.parse(updatedUser);
    },

    async updateAccount(request: FastifyRequest, input: UpdateAccountInput) {
      const user = await requireUser(request);
      const nextDisplayName = input.displayName.trim();
      const smsOptIn = deriveSmsOptIn(input);
      const result = await db.query(
        `update users
         set display_name = $2,
             phone_number = $3,
             phone_verified_at = case
               when phone_number is distinct from $3 then null
               else phone_verified_at
             end,
             event_reminder_opt_in = $4,
             upcoming_events_opt_in = $5,
             sms_opt_in = $6,
             sms_consent_at = case
               when $6 and not sms_opt_in then now()
               when $6 then sms_consent_at
               else null
             end,
             sms_opted_out_at = case
               when $6 then null
               when sms_opt_in then now()
               else sms_opted_out_at
             end,
             updated_at = now()
         where id = $1 and is_active = true
         returning id,
                   email,
                   display_name as "displayName",
                   role,
                   phone_number as "phoneNumber",
                   phone_verified_at as "phoneVerifiedAt",
                   event_reminder_opt_in as "eventReminderOptIn",
                   upcoming_events_opt_in as "upcomingEventsOptIn",
                   sms_opt_in as "smsOptIn"`,
        [user.id, nextDisplayName, input.phoneNumber, input.eventReminderOptIn, input.upcomingEventsOptIn, smsOptIn],
      );

      const updatedUser = result.rows[0];
      if (!updatedUser) throw createHttpError('Account was not found.', 404);

      return accountProfileSchema.parse(updatedUser);
    },

    async changePassword(request: FastifyRequest, input: ChangePasswordInput) {
      const user = await requireUser(request);
      const result = await db.query(
        `select password_hash as "passwordHash"
         from users
         where id = $1 and is_active = true`,
        [user.id],
      );
      const account = result.rows[0];

      if (!account) throw createHttpError('Account was not found.', 404);
      if (!verifyPassword(input.currentPassword, account.passwordHash)) {
        throw createHttpError('Current password was not accepted.', 401);
      }

      await db.query(
        `update users
         set password_hash = $2,
             updated_at = now()
         where id = $1 and is_active = true`,
        [user.id, hashPassword(input.newPassword)],
      );

      return { changed: true as const };
    },

    async deleteAccount(request: FastifyRequest) {
      const user = await requireUser(request);
      await db.query(
        `update users
         set is_active = false,
             phone_number = null,
             phone_verified_at = null,
             sms_opt_in = false,
             sms_consent_at = null,
             sms_opted_out_at = now(),
             updated_at = now()
         where id = $1 and is_active = true`,
        [user.id],
      );

      return { deleted: true as const };
    },
  };
}