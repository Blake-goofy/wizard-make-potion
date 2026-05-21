import { createHmac } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import { createOrderInputSchema } from '@potion/shared';
import type { AppConfig } from '../config.js';
import type { OrderService } from '../services/orders.js';

const stripeCheckoutUnavailableMessage = 'Could not open Stripe checkout. Please try again.';
const idempotencyKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type HttpError = Error & { statusCode: number; expose?: boolean };

function summarizeUnknownError(error: unknown) {
  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: unknown; statusCode?: unknown; type?: unknown };

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: typeof errorWithCode.code === 'string' ? errorWithCode.code : undefined,
      statusCode: typeof errorWithCode.statusCode === 'number' ? errorWithCode.statusCode : undefined,
      type: typeof errorWithCode.type === 'string' ? errorWithCode.type : undefined,
    };
  }

  return {
    type: typeof error,
    value: typeof error === 'string' ? error : undefined,
  };
}

function formatErrorSummary(error: unknown) {
  const summary = summarizeUnknownError(error);

  return [summary.type, summary.code, summary.statusCode, summary.message ?? summary.value]
    .filter((value) => value !== undefined && value !== '')
    .join(' | ');
}

function createHttpError(message: string, statusCode: number, options?: { expose?: boolean }) {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  if (options?.expose !== undefined) error.expose = options.expose;
  return error;
}

function createStripeCheckoutError() {
  return createHttpError(stripeCheckoutUnavailableMessage, 502, { expose: true });
}

function getStripe(config: AppConfig) {
  if (!config.stripeSecretKey) {
    throw createStripeCheckoutError();
  }

  return new Stripe(config.stripeSecretKey);
}

function formatUuid(bytes: Buffer) {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createCheckoutOrderId(config: AppConfig, idempotencyKey: string) {
  const bytes = Buffer.from(createHmac('sha256', config.authSessionSecret).update(`stripe-checkout:${idempotencyKey}`).digest().subarray(0, 16));
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x40, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);
  return formatUuid(bytes);
}

function readCheckoutIdempotencyKey(request: FastifyRequest) {
  const header = request.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;

  if (typeof value !== 'string' || !idempotencyKeyPattern.test(value)) {
    throw createHttpError('Checkout idempotency key is required.', 400, { expose: true });
  }

  return value.toLowerCase();
}

export async function registerPaymentRoutes(
  server: FastifyInstance,
  deps: { config: AppConfig; orders: OrderService },
) {
  server.post('/api/payments/stripe-checkout', async (request, reply) => {
    const input = createOrderInputSchema.parse(request.body);
    const checkoutIdempotencyKey = readCheckoutIdempotencyKey(request);
    const stripe = getStripe(deps.config);
    const { event, quote } = await deps.orders.quoteOrder(input);
    const orderId = createCheckoutOrderId(deps.config, checkoutIdempotencyKey);
    const metadata = {
      orderId,
      eventId: input.eventId,
      customerEmail: input.customerEmail,
      quantity: String(input.quantity),
    };

    let session: Stripe.Checkout.Session;

    try {
      request.log.info({ orderId, eventId: input.eventId, quantity: input.quantity }, 'Creating Stripe checkout session');
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: input.customerEmail,
        line_items: [
          {
            quantity: input.quantity,
            price_data: {
              currency: 'usd',
              unit_amount: event.ticketPriceCents,
              product_data: {
                name: `${event.name} admission`,
              },
            },
          },
          ...(quote.taxCents > 0
            ? [
                {
                  quantity: 1,
                  price_data: {
                    currency: 'usd',
                    unit_amount: quote.taxCents,
                    product_data: {
                      name: 'Tax',
                    },
                  },
                },
              ]
            : []),
        ],
        metadata,
        payment_intent_data: { metadata },
        success_url: `${deps.config.webOrigin}/?order=${orderId}`,
        cancel_url: deps.config.webOrigin,
      }, { idempotencyKey: `stripe-checkout:${checkoutIdempotencyKey}` });
    } catch (error) {
      const errorSummary = formatErrorSummary(error);
      request.log.error(
        { err: summarizeUnknownError(error), orderId, eventId: input.eventId },
        `Stripe checkout session creation failed${errorSummary ? `: ${errorSummary}` : ''}`,
      );
      throw createStripeCheckoutError();
    }

    if (!session.url) {
      throw createStripeCheckoutError();
    }

    request.log.info({ orderId, stripeSessionId: session.id }, 'Stripe checkout session created');

    try {
      await deps.orders.createPendingStripeOrder({
        orderId,
        input,
        quote,
        providerReference: session.id,
        checkoutIdempotencyKey,
      });
    } catch (error) {
      const errorSummary = formatErrorSummary(error);
      request.log.error(
        { err: summarizeUnknownError(error), orderId, stripeSessionId: session.id },
        `Persisting pending Stripe order failed${errorSummary ? `: ${errorSummary}` : ''}`,
      );
      throw createStripeCheckoutError();
    }

    return reply.code(201).send({ orderId, checkoutUrl: session.url });
  });

  server.post('/api/stripe/webhook', async (request, reply) => {
    if (!deps.config.stripeWebhookSecret) {
      throw createHttpError('Stripe webhook signing secret is not configured.', 500);
    }

    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      throw createHttpError('Stripe webhook signature is missing.', 400);
    }

    if (!Buffer.isBuffer(request.body)) {
      throw createHttpError('Stripe webhook body was not received as raw bytes.', 400);
    }

    const stripe = getStripe(deps.config);
    const event = stripe.webhooks.constructEvent(request.body, signature, deps.config.stripeWebhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        await deps.orders.completeStripeOrder(orderId, session.id);
      }
    }

    return reply.send({ received: true });
  });
}