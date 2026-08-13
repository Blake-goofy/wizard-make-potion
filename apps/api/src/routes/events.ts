import type { FastifyInstance } from 'fastify';
import type { Database } from '@potion/db';
import type { AppSettingsService } from '../services/appSettings.js';
import { createEventExpiryCutoff, parseEventRecord } from '../services/eventRecords.js';

export async function registerEventRoutes(server: FastifyInstance, deps: { db: Database; appSettings: AppSettingsService }) {
  server.get('/api/events/active', async () => {
    const settings = await deps.appSettings.getEventSettings();
    const expiryCutoff = createEventExpiryCutoff(settings.eventExpiryBufferMinutes);
    const result = await deps.db.query(
      `select id, slug, name, starts_at as "startsAt", address, description,
              ticket_price_cents as "ticketPriceCents", tax_rate_bps as "taxRateBps",
              min_tickets_per_order as "minTicketsPerOrder",
              max_tickets_per_order as "maxTicketsPerOrder", is_active as "isActive"
       from events
       where is_active = true
         and starts_at >= $1
       order by starts_at asc
       limit 1`,
      [expiryCutoff],
    );

    const event = result.rows[0];
    return { event: event ? parseEventRecord(event) : null };
  });

  server.get('/api/events', async () => {
    const settings = await deps.appSettings.getEventSettings();
    const expiryCutoff = createEventExpiryCutoff(settings.eventExpiryBufferMinutes);
    const result = await deps.db.query(
      `select id, slug, name, starts_at as "startsAt", address, description,
              ticket_price_cents as "ticketPriceCents", tax_rate_bps as "taxRateBps",
              min_tickets_per_order as "minTicketsPerOrder",
              max_tickets_per_order as "maxTicketsPerOrder", is_active as "isActive"
       from events
       where is_active = true
         and starts_at >= $1
       order by starts_at asc`,
      [expiryCutoff],
    );

    return { events: result.rows.map(parseEventRecord) };
  });

  server.get<{ Params: { slug: string } }>('/api/events/:slug', async (request, reply) => {
    const settings = await deps.appSettings.getEventSettings();
    const expiryCutoff = createEventExpiryCutoff(settings.eventExpiryBufferMinutes);
    const result = await deps.db.query(
      `select id, slug, name, starts_at as "startsAt", address, description,
              ticket_price_cents as "ticketPriceCents", tax_rate_bps as "taxRateBps",
              min_tickets_per_order as "minTicketsPerOrder",
              max_tickets_per_order as "maxTicketsPerOrder", is_active as "isActive"
       from events
       where slug = $1
         and is_active = true
         and starts_at >= $2
       limit 1`,
      [request.params.slug, expiryCutoff],
    );

    const event = result.rows[0];
    if (!event) return reply.code(404).send({ message: 'Event not found.' });

    return { event: parseEventRecord(event) };
  });
}
