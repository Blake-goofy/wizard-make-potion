import type { FastifyInstance } from 'fastify';
import type { Database } from '@potion/db';
import { eventSchema } from '@potion/shared';

export async function registerEventRoutes(server: FastifyInstance, deps: { db: Database }) {
  server.get('/api/events/active', async () => {
    const result = await deps.db.query(
      `select id, slug, name, starts_at as "startsAt", address, description,
              ticket_price_cents as "ticketPriceCents", tax_rate_bps as "taxRateBps",
              min_tickets_per_order as "minTicketsPerOrder",
              max_tickets_per_order as "maxTicketsPerOrder", is_active as "isActive"
       from events
       where is_active = true
       order by starts_at asc
       limit 1`,
    );

    const event = result.rows[0];
    return { event: event ? eventSchema.parse(event) : null };
  });
}
