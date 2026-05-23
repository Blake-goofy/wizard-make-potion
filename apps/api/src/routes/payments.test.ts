import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config.js';
import type { AuthService } from '../services/auth.js';
import type { OrderService } from '../services/orders.js';
import { registerPaymentRoutes } from './payments.js';

type AuthenticatedUser = Awaited<ReturnType<AuthService['getCurrentUser']>>;

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
const checkoutIdempotencyKey = '11111111-1111-4111-8111-111111111111';

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'development',
    appEnv: 'development',
    apiPort: 8787,
    webOrigin: 'http://localhost:5173',
    databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    authSessionSecret: 'test-session-secret',
    resendApiKey: undefined,
    telnyxApiKey: undefined,
    telnyxSmsFromNumber: undefined,
    telnyxMessagingProfileId: undefined,
    telnyxPublicKey: undefined,
    stripeSecretKey: 'sk_test_configured',
    stripePublishableKey: 'pk_test_configured',
    stripeWebhookSecret: 'whsec_test_configured',
    ...overrides,
    corsOrigins: overrides.corsOrigins ?? ['http://localhost:5173'],
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

function createAuth(): AuthService {
  return {
    requireUser: vi.fn(async (request) => {
      const authorization = request.headers.authorization;

      if (authorization === 'Bearer signed-in-token') {
        return {
          id: '00000000-0000-4000-8000-000000000099',
          email: 'member@example.com',
          displayName: 'Signed In Member',
          role: 'customer',
          phoneNumber: '(555) 222-3333',
          phoneVerifiedAt: '2026-05-23T12:00:00.000Z',
          eventReminderOptIn: false,
          upcomingEventsOptIn: true,
          smsOptIn: true,
        } satisfies AuthenticatedUser;
      }

      throw Object.assign(new Error('Sign-in required.'), { statusCode: 401 });
    }),
  } as unknown as AuthService;
}

async function createServer(config = createConfig(), orders = createOrders(), auth = createAuth()) {
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

  await registerPaymentRoutes(server, { config, auth, orders });
  return { server, orders, auth };
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
        headers: { 'Idempotency-Key': checkoutIdempotencyKey },
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

  it('requires an idempotency key before opening Stripe checkout', async () => {
    const { server, orders } = await createServer();

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/payments/stripe-checkout',
        payload: { eventId, customerEmail: 'guest@example.com', quantity: 1 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: 'Checkout idempotency key is required.' });
      expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
      expect(orders.createPendingStripeOrder).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('uses the same order and Stripe idempotency key for repeated checkout submissions', async () => {
    stripeMocks.createCheckoutSession.mockResolvedValue({ id: 'cs_test_checkout', url: 'https://checkout.stripe.test/session' });
    const { server, orders } = await createServer();

    try {
      const firstResponse = await server.inject({
        method: 'POST',
        url: '/api/payments/stripe-checkout',
        headers: { 'Idempotency-Key': checkoutIdempotencyKey },
        payload: { eventId, customerEmail: 'guest@example.com', quantity: 1 },
      });
      const secondResponse = await server.inject({
        method: 'POST',
        url: '/api/payments/stripe-checkout',
        headers: { 'Idempotency-Key': checkoutIdempotencyKey },
        payload: { eventId, customerEmail: 'guest@example.com', quantity: 1 },
      });

      expect(firstResponse.statusCode).toBe(201);
      expect(secondResponse.statusCode).toBe(201);
      expect(firstResponse.json()).toEqual(secondResponse.json());
      expect(stripeMocks.createCheckoutSession).toHaveBeenCalledTimes(2);
      expect(stripeMocks.createCheckoutSession.mock.calls[0][1]).toEqual({ idempotencyKey: `stripe-checkout:${checkoutIdempotencyKey}` });
      expect(stripeMocks.createCheckoutSession.mock.calls[1][1]).toEqual({ idempotencyKey: `stripe-checkout:${checkoutIdempotencyKey}` });
      expect(stripeMocks.createCheckoutSession.mock.calls[0][0].metadata.orderId).toBe(stripeMocks.createCheckoutSession.mock.calls[1][0].metadata.orderId);
      expect(orders.createPendingStripeOrder).toHaveBeenCalledTimes(2);
      expect(orders.createPendingStripeOrder).toHaveBeenNthCalledWith(1, expect.objectContaining({ checkoutIdempotencyKey }));
      expect(orders.createPendingStripeOrder).toHaveBeenNthCalledWith(2, expect.objectContaining({ checkoutIdempotencyKey }));
    } finally {
      await server.close();
    }
  });

  it('passes guest checkout contact and opt-in fields to pending order creation', async () => {
    stripeMocks.createCheckoutSession.mockResolvedValue({ id: 'cs_test_checkout', url: 'https://checkout.stripe.test/session' });
    const { server, orders } = await createServer();

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/payments/stripe-checkout',
        headers: { 'Idempotency-Key': checkoutIdempotencyKey },
        payload: {
          eventId,
          customerEmail: 'guest@example.com',
          customerName: 'Guest Buyer',
          customerPhoneNumber: '(555) 123-4567',
          eventReminderOptIn: true,
          upcomingEventsOptIn: true,
          quantity: 1,
        },
      });

      expect(response.statusCode).toBe(201);
      const [firstCall] = vi.mocked(orders.createPendingStripeOrder).mock.calls;
      expect(firstCall?.[0].input).toMatchObject({
        customerName: 'Guest Buyer',
        customerPhoneNumber: '(555) 123-4567',
        eventReminderOptIn: true,
        upcomingEventsOptIn: true,
      });
    } finally {
      await server.close();
    }
  });

  it('overrides checkout email and opt-ins from the signed-in account', async () => {
    stripeMocks.createCheckoutSession.mockResolvedValue({ id: 'cs_test_checkout', url: 'https://checkout.stripe.test/session' });
    const { server, orders, auth } = await createServer();

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/payments/stripe-checkout',
        headers: {
          'Idempotency-Key': checkoutIdempotencyKey,
          Authorization: 'Bearer signed-in-token',
        },
        payload: {
          eventId,
          customerEmail: 'guest@example.com',
          eventReminderOptIn: true,
          upcomingEventsOptIn: false,
          quantity: 1,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(auth.requireUser).toHaveBeenCalledTimes(1);
      expect(orders.quoteOrder).toHaveBeenCalledWith(expect.objectContaining({
        customerEmail: 'member@example.com',
        eventReminderOptIn: false,
        upcomingEventsOptIn: true,
        customerPhoneNumber: '(555) 222-3333',
      }));
      expect(orders.createPendingStripeOrder).toHaveBeenCalledWith(expect.objectContaining({
        input: expect.objectContaining({
          customerEmail: 'member@example.com',
          eventReminderOptIn: false,
          upcomingEventsOptIn: true,
          customerPhoneNumber: '(555) 222-3333',
        }),
      }));
    } finally {
      await server.close();
    }
  });

  it('drops SMS opt-ins from signed-in accounts until the phone number is verified', async () => {
    stripeMocks.createCheckoutSession.mockResolvedValue({ id: 'cs_test_checkout', url: 'https://checkout.stripe.test/session' });
    const auth = {
      requireUser: vi.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000099',
        email: 'member@example.com',
        displayName: 'Signed In Member',
        role: 'customer',
        phoneNumber: '(555) 222-3333',
        phoneVerifiedAt: null,
        eventReminderOptIn: true,
        upcomingEventsOptIn: true,
        smsOptIn: true,
      } satisfies AuthenticatedUser),
    } as unknown as AuthService;
    const { server, orders } = await createServer(createConfig(), createOrders(), auth);

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/payments/stripe-checkout',
        headers: {
          'Idempotency-Key': checkoutIdempotencyKey,
          Authorization: 'Bearer signed-in-token',
        },
        payload: {
          eventId,
          customerEmail: 'guest@example.com',
          eventReminderOptIn: true,
          upcomingEventsOptIn: true,
          quantity: 1,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(orders.quoteOrder).toHaveBeenCalledWith(expect.objectContaining({
        customerEmail: 'member@example.com',
        customerPhoneNumber: '(555) 222-3333',
        eventReminderOptIn: false,
        upcomingEventsOptIn: false,
      }));
    } finally {
      await server.close();
    }
  });

  it('does not expose pending order persistence failures after Stripe session creation', async () => {
    stripeMocks.createCheckoutSession.mockResolvedValue({ id: 'cs_test_checkout', url: 'https://checkout.stripe.test/session' });
    const orders = createOrders();
    orders.createPendingStripeOrder = vi.fn().mockRejectedValue(new Error('column "checkout_idempotency_key" does not exist'));
    const { server } = await createServer(createConfig(), orders);

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/payments/stripe-checkout',
        headers: { 'Idempotency-Key': checkoutIdempotencyKey },
        payload: { eventId, customerEmail: 'guest@example.com', quantity: 1 },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ message: genericCheckoutMessage });
      expect(response.body).not.toContain('checkout_idempotency_key');
    } finally {
      await server.close();
    }
  });
});