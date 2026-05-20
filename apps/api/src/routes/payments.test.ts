import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config.js';
import type { OrderService } from '../services/orders.js';
import { registerPaymentRoutes } from './payments.js';

const stripeMocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  constructEvent: vi.fn(),
}));

vi.mock('stripe', () => ({
  default: vi.fn(function MockStripe() {
    return {
    checkout: { sessions: { create: stripeMocks.createCheckoutSession } },
    webhooks: { constructEvent: stripeMocks.constructEvent },
    };
  }),
}));

const eventId = '00000000-0000-4000-8000-000000000001';
const genericCheckoutMessage = 'Could not open Stripe checkout. Please try again.';

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'development',
    appEnv: 'development',
    apiPort: 8787,
    webOrigin: 'http://localhost:5173',
    databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    authSessionSecret: 'test-session-secret',
    emailProvider: 'local',
    emailFromAddress: 'tickets@wizardmakepotion.local',
    emailFromName: 'Wizard Make Potion Tickets',
    resendApiKey: undefined,
    stripeSecretKey: 'sk_test_configured',
    stripePublishableKey: 'pk_test_configured',
    stripeWebhookSecret: 'whsec_test_configured',
    ...overrides,
  };
}

function createOrders(): OrderService {
  return {
    quoteOrder: vi.fn().mockResolvedValue({
      event: {
        id: eventId,
        slug: 'test-event',
        name: 'Potion Class',
        startsAt: '2026-05-19T18:00:00.000Z',
        address: '123 Test Lane',
        description: null,
        ticketPriceCents: 2500,
        taxRateBps: 0,
        minTicketsPerOrder: 1,
        maxTicketsPerOrder: 8,
        isActive: true,
      },
      quote: {
        quantity: 1,
        subtotalCents: 2500,
        taxCents: 0,
        totalCents: 2500,
      },
    }),
    createDevCompletedOrder: vi.fn(),
    createPendingStripeOrder: vi.fn(),
    completeStripeOrder: vi.fn(),
    getOrderForConfirmation: vi.fn(),
    listOrdersForAccount: vi.fn(),
  } as unknown as OrderService;
}

async function createServer(config = createConfig(), orders = createOrders()) {
  const server = Fastify();

  server.setErrorHandler((error, _request, reply) => {
    const errorShape = error as { statusCode?: unknown; message?: unknown; expose?: unknown };
    const statusCode = typeof errorShape.statusCode === 'number' ? errorShape.statusCode : 500;
    const canExposeMessage = statusCode < 500 || errorShape.expose === true;
    const message = !canExposeMessage || typeof errorShape.message !== 'string'
      ? 'Something went wrong on the server. Please try again.'
      : errorShape.message;

    return reply.code(statusCode).send({ message });
  });

  await registerPaymentRoutes(server, { config, orders });
  return { server, orders };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('payment routes', () => {
  it('does not expose Stripe API key errors in checkout responses', async () => {
    stripeMocks.createCheckoutSession.mockRejectedValue(
      Object.assign(new Error('Expired API Key provided: sk_live_secret'), { statusCode: 401 }),
    );
    const { server, orders } = await createServer();

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/payments/stripe-checkout',
        payload: { eventId, customerEmail: 'guest@example.com', quantity: 1 },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ message: genericCheckoutMessage });
      expect(response.body).not.toContain('Expired API Key');
      expect(response.body).not.toContain('sk_live');
      expect(orders.createPendingStripeOrder).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});