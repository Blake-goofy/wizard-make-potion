import { createHmac, pbkdf2Sync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import {
  accountProfileSchema,
  sessionUserSchema,
  type CreateAccountInput,
  type LoginInput,
  type UpdateAccountInput,
  type SessionUser,
  type VerifyAccountInput,
} from '@potion/shared';
import { renderAccountVerificationEmail } from '@potion/email';
import type { Database } from '@potion/db';
import type { AppConfig } from '../config.js';
import type { EmailQueueService } from './emailQueue.js';

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

export function createAuthService(config: AppConfig, db: Database, emailQueue: EmailQueueService) {
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
      `select id, email, display_name as "displayName", role, phone_number as "phoneNumber"
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
      const verificationEmail = renderAccountVerificationEmail({ code });

      await db.transaction(async (client) => {
        await client.query(
          `insert into account_verification_codes (email, display_name, password_hash, code_hash, phone_number, expires_at)
           values ($1, $2, $3, $4, $5, now() + interval '15 minutes')`,
          [email, input.displayName.trim(), passwordHash, codeHash, phoneNumber],
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

      return { email, message: 'Verification code queued for email delivery.' };
    },

    async verifyAccount(input: VerifyAccountInput) {
      const email = normalizeEmail(input.email);
      const result = await db.query(
        `select id, display_name as "displayName", password_hash as "passwordHash", code_hash as "codeHash", phone_number as "phoneNumber"
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
          `insert into users (email, display_name, role, password_hash, phone_number, is_active)
           values ($1, $2, 'customer', $3, $4, true)
           on conflict (email) do update
           set display_name = excluded.display_name,
               password_hash = excluded.password_hash,
               phone_number = excluded.phone_number,
               is_active = true,
               updated_at = now()
           returning id, email, display_name as "displayName", role, phone_number as "phoneNumber"`,
          [email, pendingAccount.displayName, pendingAccount.passwordHash, pendingAccount.phoneNumber],
        );
        return verified.rows[0];
      });

      const user = sessionUserSchema.parse(userResult);
      return { token: createToken(user.id), user };
    },

    async login(input: LoginInput) {
      const email = normalizeEmail(input.email);
      const result = await db.query(
        `select id, email, display_name as "displayName", role, phone_number as "phoneNumber", password_hash as "passwordHash"
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

    async requireUser(request: FastifyRequest) {
      return requireUser(request);
    },

    async requireAdmin(request: FastifyRequest) {
      const user = await requireUser(request);
      if (user.role !== 'admin') throw createHttpError('Admin access required.', 403);
      return user;
    },

    async requireScanner(request: FastifyRequest) {
      const user = await requireUser(request);
      if (user.role !== 'scanner' && user.role !== 'admin') {
        throw createHttpError('Scanner access required.', 403);
      }
      return user;
    },

    async getCurrentUser(request: FastifyRequest): Promise<SessionUser> {
      return requireUser(request);
    },

    async getAccountProfile(request: FastifyRequest) {
      const user = await requireUser(request);
      return accountProfileSchema.parse(user);
    },

    async updateAccount(request: FastifyRequest, input: UpdateAccountInput) {
      const user = await requireUser(request);
      const result = await db.query(
        `update users
         set phone_number = $2,
             updated_at = now()
         where id = $1 and is_active = true
         returning id, email, display_name as "displayName", role, phone_number as "phoneNumber"`,
        [user.id, input.phoneNumber],
      );

      const updatedUser = result.rows[0];
      if (!updatedUser) throw createHttpError('Account was not found.', 404);

      return accountProfileSchema.parse(updatedUser);
    },

    async deleteAccount(request: FastifyRequest) {
      const user = await requireUser(request);
      await db.query(
        `update users
         set is_active = false,
             phone_number = null,
             updated_at = now()
         where id = $1 and is_active = true`,
        [user.id],
      );

      return { deleted: true as const };
    },
  };
}