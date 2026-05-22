import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config.js';
import { createOrderService } from './orders.js';

function createConfig(): AppConfig {
  return {
    nodeEnv: 'development',
    appEnv: 'development',
    apiPort: 8787,
    webOrigin: 'http://localhost:5173',
    corsOrigins: ['http://localhost:5173'],
    databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    authSessionSecret: 'test-session-secret',
    resendApiKey: undefined,
    stripeSecretKey: 'sk_test_configured',
    stripePublishableKey: 'pk_test_configured',
    stripeWebhookSecret: 'whsec_test_configured',
  };
}

describe('order service', () => {
  it('uses app settings for event expiry when quoting an order', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{
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
        }],
      }),
    };
    const appSettings = {
      getEventSettings: vi.fn().mockResolvedValue({
        eventExpiryBufferMinutes: 180,
      }),
    };
    const emailQueue = {
      enqueueTicketEmail: vi.fn(),
      processPending: vi.fn(),
    };
    const orders = createOrderService({
      db: db as never,
      emailQueue: emailQueue as never,
      config: createConfig(),
      appSettings: appSettings as never,
    });

    const result = await orders.quoteOrder({
      eventId: '00000000-0000-4000-8000-000000000001',
      customerEmail: 'guest@example.com',
      quantity: 2,
    });

    expect(result.event.taxRateBps).toBe(900);
    expect(result.quote).toEqual({
      quantity: 2,
      subtotalCents: 5000,
      taxCents: 450,
      totalCents: 5450,
    });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('starts_at >= $2'), [
      '00000000-0000-4000-8000-000000000001',
      expect.any(String),
    ]);
  });
});