import type { FastifyInstance } from 'fastify';
import type { Database } from '@potion/db';
import {
  adminEventCreateInputSchema,
  adminEventUpdateInputSchema,
  adminUserUpdateInputSchema,
  createAccountInputSchema,
  eventSchema,
  loginInputSchema,
  requestPasswordResetInputSchema,
  resetPasswordInputSchema,
  updateTicketUsageInputSchema,
  verifyAccountInputSchema,
} from '@potion/shared';
import { z } from 'zod';
import { createRateLimitGuard } from '../security/rateLimit.js';
import type { AuthService } from '../services/auth.js';
import type { EmailQueueService } from '../services/emailQueue.js';
import type { ScannerService } from '../services/scanner.js';
import type { SmsMessageService } from '../services/smsMessages.js';
import { parseEventRecord } from '../services/eventRecords.js';

const authRateLimitMessage = 'Too many attempts. Please wait a moment and try again.';
const smsMessagePhoneNumberSchema = z.string().trim().regex(/^\(\d{3}\) \d{3}-\d{4}$/);

const limitLoginAttempts = createRateLimitGuard({ maxAttempts: 10, windowMs: 10 * 60 * 1000, message: authRateLimitMessage });
const limitAccountCreationAttempts = createRateLimitGuard({ maxAttempts: 3, windowMs: 15 * 60 * 1000, message: authRateLimitMessage });
const limitVerificationAttempts = createRateLimitGuard({ maxAttempts: 8, windowMs: 15 * 60 * 1000, message: authRateLimitMessage });
const limitPasswordResetRequests = createRateLimitGuard({ maxAttempts: 3, windowMs: 15 * 60 * 1000, message: authRateLimitMessage });
const limitPasswordResetConfirmations = createRateLimitGuard({ maxAttempts: 8, windowMs: 15 * 60 * 1000, message: authRateLimitMessage });

const smsMessageTypeSchema = z.enum(['reminder', 'upcoming_event', 'admin', 'test']);
const smsMessageStatusSchema = z.enum(['draft', 'sent']);
const smsMessageInputSchema = z.object({
  eventId: z.string().uuid().nullable().optional(),
  messageType: smsMessageTypeSchema,
  label: z.string().trim().min(1).max(120),
  messageBody: z.string().trim().min(1).max(1200),
  status: smsMessageStatusSchema,
  testPhoneNumber: smsMessagePhoneNumberSchema.nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.messageType === 'reminder' && !value.eventId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['eventId'],
      message: 'Reminder messages must target an event.',
    });
  }

  if (value.messageType === 'test' && !value.testPhoneNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['testPhoneNumber'],
      message: 'Test messages must target a phone number.',
    });
  }

  if (value.messageType !== 'test' && value.testPhoneNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['testPhoneNumber'],
      message: 'Only test messages can include a phone number override.',
    });
  }
});

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function createSlugFromName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'event';
}

async function createUniqueEventSlug(
  db: Pick<Database, 'query'>,
  name: string,
  options: { excludeEventId?: string } = {},
) {
  const baseSlug = createSlugFromName(name);
  const result = await db.query<{ slug: string }>(
    `select slug
     from events
     where (slug = $1 or slug like $2)
       and ($3::uuid is null or id <> $3)`,
    [baseSlug, `${baseSlug}-%`, options.excludeEventId ?? null],
  );
  const usedSlugs = new Set(result.rows.map((row) => row.slug));

  if (!usedSlugs.has(baseSlug)) return baseSlug;

  let suffix = 2;
  while (usedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

export async function registerAdminRoutes(
  server: FastifyInstance,
  deps: { auth: AuthService; db: Database; emailQueue: EmailQueueService; scanner: ScannerService; smsMessages: SmsMessageService },
) {
  server.post('/api/auth/login', async (request, reply) => {
    const input = loginInputSchema.parse(request.body);
    limitLoginAttempts(request, [input.email]);
    const session = await deps.auth.login(input);

    return reply.send(session);
  });

  server.post('/api/auth/register', async (request, reply) => {
    const input = createAccountInputSchema.parse(request.body);
    limitAccountCreationAttempts(request, [input.email]);
    const result = await deps.auth.createAccount(input);

    return reply.code(201).send(result);
  });

  server.post('/api/auth/verify', async (request, reply) => {
    const input = verifyAccountInputSchema.parse(request.body);
    limitVerificationAttempts(request, [input.email]);
    const session = await deps.auth.verifyAccount(input);

    return reply.send(session);
  });

  server.post('/api/auth/password-reset/request', async (request, reply) => {
    const input = requestPasswordResetInputSchema.parse(request.body);
    limitPasswordResetRequests(request, [input.email]);
    const result = await deps.auth.requestPasswordReset(input);

    return reply.send(result);
  });

  server.post('/api/auth/password-reset/confirm', async (request, reply) => {
    const input = resetPasswordInputSchema.parse(request.body);
    limitPasswordResetConfirmations(request, [input.email]);
    const result = await deps.auth.resetPassword(input);

    return reply.send(result);
  });

  server.get('/api/auth/me', async (request) => {
    const user = await deps.auth.getCurrentUser(request);

    return { user };
  });

  server.get('/api/admin/users', async (request) => {
    const users = await deps.auth.listAdminUsers(request);

    return { users };
  });

  server.get('/api/admin/events', async (request) => {
    await deps.auth.requireAdmin(request);
    const result = await deps.db.query(
      `select id, slug, name, starts_at as "startsAt", address, description,
              ticket_price_cents as "ticketPriceCents", tax_rate_bps as "taxRateBps",
              min_tickets_per_order as "minTicketsPerOrder",
              max_tickets_per_order as "maxTicketsPerOrder", is_active as "isActive"
       from events
       order by is_active desc, starts_at desc`,
    );

    return { events: result.rows.map((row) => parseEventRecord(row)) };
  });

  server.post('/api/admin/events', async (request, reply) => {
    await deps.auth.requireAdmin(request);
    const input = adminEventCreateInputSchema.parse(request.body);
    const event = await deps.db.transaction(async (client) => {
      const slug = await createUniqueEventSlug(client, input.name);
      const result = await client.query(
        `insert into events (slug, name, starts_at, address, description, ticket_price_cents)
         values ($1, $2, $3, $4, $5, $6)
         returning id, slug, name, starts_at as "startsAt", address, description,
                   ticket_price_cents as "ticketPriceCents", tax_rate_bps as "taxRateBps",
                   min_tickets_per_order as "minTicketsPerOrder",
                   max_tickets_per_order as "maxTicketsPerOrder", is_active as "isActive"`,
        [slug, input.name, input.startsAt, input.address, input.description, input.ticketPriceCents],
      );

      return eventSchema.parse(result.rows[0]);
    });

    return reply.code(201).send({ event });
  });

  server.put('/api/admin/events/:eventId', async (request) => {
    await deps.auth.requireAdmin(request);
    const eventId = z
      .string()
      .uuid()
      .parse((request.params as { eventId?: string }).eventId);
    const input = adminEventUpdateInputSchema.parse(request.body);
    const event = await deps.db.transaction(async (client) => {
      const slug = await createUniqueEventSlug(client, input.name, { excludeEventId: eventId });
      const result = await client.query(
        `update events
         set slug = $2,
             name = $3,
             starts_at = $4,
             address = $5,
             description = $6,
             ticket_price_cents = $7,
             is_active = $8,
             updated_at = now()
         where id = $1
         returning id, slug, name, starts_at as "startsAt", address, description,
                   ticket_price_cents as "ticketPriceCents", tax_rate_bps as "taxRateBps",
                   min_tickets_per_order as "minTicketsPerOrder",
                   max_tickets_per_order as "maxTicketsPerOrder", is_active as "isActive"`,
        [eventId, slug, input.name, input.startsAt, input.address, input.description, input.ticketPriceCents, input.isActive],
      );
      const updatedEvent = result.rows[0];
      if (!updatedEvent) throw createHttpError('Event was not found.', 404);

      return eventSchema.parse(updatedEvent);
    });

    return { event };
  });

  server.get('/api/admin/sms-messages', async (request) => {
    await deps.auth.requireAdmin(request);
    const query = z.object({
      eventId: z.string().uuid().optional(),
    }).parse(request.query);

    const messages = await deps.smsMessages.listMessages(query.eventId ?? null);
    return { messages };
  });

  server.post('/api/admin/sms-messages', async (request, reply) => {
    await deps.auth.requireAdmin(request);
    const input = smsMessageInputSchema.parse(request.body);
    const message = await deps.smsMessages.createMessage(input);
    return reply.code(201).send({ message });
  });

  server.put('/api/admin/sms-messages/:messageId', async (request) => {
    await deps.auth.requireAdmin(request);
    const messageId = z.string().uuid().parse((request.params as { messageId?: string }).messageId);
    const input = smsMessageInputSchema.parse(request.body);
    const message = await deps.smsMessages.updateMessage(messageId, input);
    return { message };
  });

  server.post('/api/admin/sms-messages/:messageId/send-now', async (request) => {
    await deps.auth.requireAdmin(request);
    const messageId = z.string().uuid().parse((request.params as { messageId?: string }).messageId);
    const result = await deps.smsMessages.sendMessageNow(messageId);
    return result;
  });

  server.put('/api/admin/users/:userId', async (request) => {
    const userId = z
      .string()
      .uuid()
      .parse((request.params as { userId?: string }).userId);
    const input = adminUserUpdateInputSchema.parse(request.body);
    const user = await deps.auth.updateAdminUser(request, userId, input);

    return { user };
  });

  server.get('/api/admin/tickets', async (request) => {
    await deps.auth.requireScanner(request);
    const query = z
      .object({
        eventId: z.string().uuid().optional(),
      })
      .parse(request.query);
    const result = await deps.db.query(
      `select t.id,
              o.id as "orderId",
              row_number() over (partition by o.id order by t.created_at asc, t.id asc)::int as "ticketNumber",
              t.used_at as "usedAt",
              t.scan_token as "scanToken",
            coalesce(o.customer_name, u.display_name) as "customerDisplayName",
              o.customer_email as "customerEmail",
              o.total_cents as "totalCents",
              o.created_at as "createdAt",
              e.name as "eventName",
              e.starts_at as "eventStartsAt"
       from tickets t
       join orders o on o.id = t.order_id
       join events e on e.id = o.event_id
        left join users u on lower(u.email) = lower(o.customer_email)
       where o.status = 'completed'
            and ($1::uuid is null or o.event_id = $1)
       order by o.created_at desc, t.created_at asc, t.id asc
       limit 250`,
          [query.eventId ?? null],
    );

    return { tickets: result.rows };
  });

  server.post('/api/admin/tickets/:ticketId/usage', async (request) => {
    const user = await deps.auth.requireScanner(request);
    const ticketId = z
      .string()
      .uuid()
      .parse((request.params as { ticketId?: string }).ticketId);
    const input = updateTicketUsageInputSchema.parse(request.body);

    try {
      const result = await deps.scanner.setTicketUsage(ticketId, input.used, user.email);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Ticket was not found.') {
        throw createHttpError(error.message, 404);
      }

      throw error;
    }
  });
}
