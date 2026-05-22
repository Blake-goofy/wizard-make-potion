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
}
