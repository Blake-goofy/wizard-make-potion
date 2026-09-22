import type { FastifyInstance } from 'fastify';
import type { Database } from '@potion/db';
import { z } from 'zod';
import type { AppSettingsService } from '../services/appSettings.js';
import { createEventExpiryCutoff, parseEventRecord } from '../services/eventRecords.js';

const eventSelect = `id, slug, name, starts_at as "startsAt", address, description,
  ticket_price_cents as "ticketPriceCents", tax_rate_bps as "taxRateBps",
  min_tickets_per_order as "minTicketsPerOrder", max_tickets_per_order as "maxTicketsPerOrder",
  is_active as "isActive",
  (select updated_at from event_images where event_id = events.id) as "imageUpdatedAt"`;

export async function registerEventRoutes(server: FastifyInstance, deps: { db: Database; appSettings: AppSettingsService }) {
  server.get('/api/events/active', async () => {
    const settings = await deps.appSettings.getEventSettings();
    const expiryCutoff = createEventExpiryCutoff(settings.eventExpiryBufferMinutes);
    const result = await deps.db.query(
      `select ${eventSelect}
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
      `select ${eventSelect}
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
      `select ${eventSelect}
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

  server.get<{ Params: { eventId: string } }>('/api/events/:eventId/image', async (request, reply) => {
    const eventId = z.string().uuid().parse(request.params.eventId);
    const result = await deps.db.query<{ contentType: string; imageData: Buffer }>(
      `select content_type as "contentType", image_data as "imageData"
       from event_images
       where event_id = $1`,
      [eventId],
    );
    const image = result.rows[0];

    if (!image) return reply.code(404).send({ message: 'Event image not found.' });

    return reply
      .header('Content-Type', image.contentType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(image.imageData);
  });
}
