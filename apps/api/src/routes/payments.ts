import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { createOrderInputSchema } from '@potion/shared';
import type { AppConfig } from '../config.js';
import type { OrderService } from '../services/orders.js';

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function getStripe(config: AppConfig) {
  if (!config.stripeSecretKey) {
    throw createHttpError('Stripe is not configured for this environment.', 500);
  }

  return new Stripe(config.stripeSecretKey);
}

export async function registerPaymentRoutes(
  server: FastifyInstance,
  deps: { config: AppConfig; orders: OrderService },
) {
  server.post('/api/payments/stripe-checkout', async (request, reply) => {
    const input = createOrderInputSchema.parse(request.body);
    const stripe = getStripe(deps.config);
    const { event, quote } = await deps.orders.quoteOrder(input);
    const orderId = randomUUID();
    const metadata = {
      orderId,
      eventId: input.eventId,
      customerEmail: input.customerEmail,
      quantity: String(input.quantity),
    };

    const session = await stripe.checkout.sessions.create({
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
    });

    if (!session.url) {
      throw createHttpError('Stripe did not return a checkout URL.', 502);
    }

    await deps.orders.createPendingStripeOrder({
      orderId,
      input,
      quote,
      providerReference: session.id,
    });

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