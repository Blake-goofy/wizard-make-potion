import type { FastifyInstance } from 'fastify';
import type { Database } from '@potion/db';
import {
  createAccountInputSchema,
  loginInputSchema,
  updateTicketUsageInputSchema,
  verifyAccountInputSchema,
} from '@potion/shared';
import { z } from 'zod';
import type { AuthService } from '../services/auth.js';
import type { EmailQueueService } from '../services/emailQueue.js';
import type { ScannerService } from '../services/scanner.js';

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export async function registerAdminRoutes(
  server: FastifyInstance,
  deps: { auth: AuthService; db: Database; emailQueue: EmailQueueService; scanner: ScannerService },
) {
  server.post('/api/auth/login', async (request, reply) => {
    const input = loginInputSchema.parse(request.body);
    const session = await deps.auth.login(input);

    return reply.send(session);
  });

  server.post('/api/auth/register', async (request, reply) => {
    const input = createAccountInputSchema.parse(request.body);
    const result = await deps.auth.createAccount(input);
    await deps.emailQueue.processPending();

    return reply.code(201).send(result);
  });

  server.post('/api/auth/verify', async (request, reply) => {
    const input = verifyAccountInputSchema.parse(request.body);
    const session = await deps.auth.verifyAccount(input);

    return reply.send(session);
  });

  server.get('/api/auth/me', async (request) => {
    const user = await deps.auth.getCurrentUser(request);

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
              o.customer_email as "customerEmail",
              o.total_cents as "totalCents",
              o.created_at as "createdAt",
              e.name as "eventName",
              e.starts_at as "eventStartsAt"
       from tickets t
       join orders o on o.id = t.order_id
       join events e on e.id = o.event_id
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
