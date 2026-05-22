import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerEventRoutes } from './events.js';

function createDb(rows: unknown[]) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  };
}

function createAppSettings(overrides?: Partial<{ eventExpiryBufferMinutes: number }>) {
  return {
    getEventSettings: vi.fn().mockResolvedValue({
      eventExpiryBufferMinutes: 180,
      ...overrides,
    }),
  };
}

describe('event routes', () => {
  it('filters active events using the expiry buffer', async () => {
    const db = createDb([{
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'test-event',
      name: 'Potion Night',
      startsAt: '2026-05-22T18:00:00.000Z',
      address: '123 Test Lane',
      description: null,
      ticketPriceCents: 2500,
      taxRateBps: 900,
      minTicketsPerOrder: 1,
      maxTicketsPerOrder: 8,
      isActive: true,
    }]);
    const appSettings = createAppSettings();
    const server = Fastify();

    await registerEventRoutes(server, { db: db as never, appSettings: appSettings as never });

    try {
      const response = await server.inject({ method: 'GET', url: '/api/events/active' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        event: expect.objectContaining({
          slug: 'test-event',
          taxRateBps: 900,
        }),
      });
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('starts_at >= $1'), [expect.any(String)]);
    } finally {
      await server.close();
    }
  });
});