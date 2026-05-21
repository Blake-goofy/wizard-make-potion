import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import type { Database } from '@potion/db';
import { type CreateOrderInput, eventSchema, type PricingQuote } from '@potion/shared';
import type { AppConfig } from '../config.js';
import type { EmailQueueService } from './emailQueue.js';
import { quoteTickets } from './pricing.js';

type EventForOrder = ReturnType<typeof eventSchema.parse>;
type Queryable = Pick<Database, 'query'>;
type OrderTicketRecord = { id: string; ticketNumber: number; scanToken: string; usedAt: string | null };

export type OrderService = ReturnType<typeof createOrderService>;

function getStripe(config: AppConfig) {
  return config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;
}

async function createOrderTickets(queryable: Queryable, orderId: string, quantity: number): Promise<OrderTicketRecord[]> {
  const tickets: OrderTicketRecord[] = [];

  for (let index = 0; index < quantity; index += 1) {
    const ticketId = randomUUID();
    const scanToken = randomUUID();

    await queryable.query(`insert into tickets (id, order_id, scan_token) values ($1, $2, $3)`, [ticketId, orderId, scanToken]);

    tickets.push({
      id: ticketId,
      ticketNumber: index + 1,
      scanToken,
      usedAt: null,
    });
  }

  return tickets;
}

async function listOrderTickets(queryable: Queryable, orderId: string): Promise<OrderTicketRecord[]> {
  const result = await queryable.query(
    `select id,
            row_number() over (order by created_at asc, id asc)::int as "ticketNumber",
            scan_token as "scanToken",
            used_at as "usedAt"
     from tickets
     where order_id = $1
     order by created_at asc, id asc`,
    [orderId],
  );

  return result.rows as OrderTicketRecord[];
}

export function createOrderService(deps: { db: Database; emailQueue: EmailQueueService; config: AppConfig }) {
  return {
    async quoteOrder(input: CreateOrderInput) {
      const eventResult = await deps.db.query(
        `select id, slug, name, starts_at as "startsAt", address, description,
                ticket_price_cents as "ticketPriceCents", tax_rate_bps as "taxRateBps",
                min_tickets_per_order as "minTicketsPerOrder",
                max_tickets_per_order as "maxTicketsPerOrder", is_active as "isActive"
         from events
         where id = $1 and is_active = true`,
        [input.eventId],
      );
      const event = eventSchema.parse(eventResult.rows[0]);

      if (input.quantity < event.minTicketsPerOrder || input.quantity > event.maxTicketsPerOrder) {
        throw new Error('Requested quantity is outside the event limits');
      }

      return { event, quote: quoteTickets(event, input.quantity) };
    },

    async createDevCompletedOrder(input: CreateOrderInput) {
      const result = await deps.db.transaction(async (client) => {
        const { event, quote } = await this.quoteOrder(input);
        const orderId = randomUUID();
        const providerReference = `dev_${orderId}`;

        await client.query(
          `insert into orders (id, event_id, customer_email, quantity, subtotal_cents, tax_cents,
                               total_cents, status, payment_provider, payment_provider_reference, completed_at)
           values ($1, $2, $3, $4, $5, $6, $7, 'completed', 'dev', $8, now())`,
          [
            orderId,
            input.eventId,
            input.customerEmail,
            input.quantity,
            quote.subtotalCents,
            quote.taxCents,
            quote.totalCents,
            providerReference,
          ],
        );

        const tickets = await createOrderTickets(client, orderId, input.quantity);

        await deps.emailQueue.enqueueTicketEmail(client, {
          orderId,
          customerEmail: input.customerEmail,
          event,
          tickets,
          quote,
        });

        return { orderId, event, quote, tickets };
      });

      await deps.emailQueue.processPending();
      return result;
    },

    async createPendingStripeOrder(options: {
      orderId: string;
      input: CreateOrderInput;
      quote: PricingQuote;
      providerReference: string;
      checkoutIdempotencyKey: string;
    }) {
      await deps.db.query(
        `insert into orders (id, event_id, customer_email, quantity, subtotal_cents, tax_cents,
                             total_cents, status, payment_provider, payment_provider_reference, checkout_idempotency_key)
         values ($1, $2, $3, $4, $5, $6, $7, 'pending', 'stripe', $8, $9)
         on conflict (checkout_idempotency_key) do nothing`,
        [
          options.orderId,
          options.input.eventId,
          options.input.customerEmail,
          options.input.quantity,
          options.quote.subtotalCents,
          options.quote.taxCents,
          options.quote.totalCents,
          options.providerReference,
          options.checkoutIdempotencyKey,
        ],
      );
    },

    async completeStripeOrder(orderId: string, providerReference: string) {
      const result = await deps.db.transaction(async (client) => {
        const orderResult = await client.query(
          `select o.id, o.event_id as "eventId", o.customer_email as "customerEmail", o.quantity,
                  o.subtotal_cents as "subtotalCents", o.tax_cents as "taxCents", o.total_cents as "totalCents",
                  o.status, e.slug, e.name, e.starts_at as "startsAt", e.address, e.description,
                  e.ticket_price_cents as "ticketPriceCents", e.tax_rate_bps as "taxRateBps",
                  e.min_tickets_per_order as "minTicketsPerOrder",
                  e.max_tickets_per_order as "maxTicketsPerOrder", e.is_active as "isActive"
           from orders o
           join events e on e.id = o.event_id
           where o.id = $1
           for update`,
          [orderId],
        );
        const order = orderResult.rows[0] as
          | {
              id: string;
              eventId: string;
              customerEmail: string;
              quantity: number;
              subtotalCents: number;
              taxCents: number;
              totalCents: number;
              status: string;
              slug: string;
              name: string;
              startsAt: string | Date;
              address: string;
              description: string | null;
              ticketPriceCents: number;
              taxRateBps: number;
              minTicketsPerOrder: number;
              maxTicketsPerOrder: number;
              isActive: boolean;
            }
          | undefined;

        if (!order) {
          throw new Error('Stripe order was not found.');
        }

        const event = eventSchema.parse({
          id: order.eventId,
          slug: order.slug,
          name: order.name,
          startsAt: order.startsAt,
          address: order.address,
          description: order.description,
          ticketPriceCents: order.ticketPriceCents,
          taxRateBps: order.taxRateBps,
          minTicketsPerOrder: order.minTicketsPerOrder,
          maxTicketsPerOrder: order.maxTicketsPerOrder,
          isActive: order.isActive,
        }) as EventForOrder;
        const quote = {
          quantity: order.quantity,
          subtotalCents: order.subtotalCents,
          taxCents: order.taxCents,
          totalCents: order.totalCents,
        };
        let tickets = await listOrderTickets(client, orderId);

        if (order.status !== 'completed') {
          await client.query(
            `update orders
             set status = 'completed', completed_at = now(), payment_provider_reference = $2
             where id = $1`,
            [orderId, providerReference],
          );

          tickets = await createOrderTickets(client, orderId, order.quantity);
        } else if (!tickets.length) {
          tickets = await createOrderTickets(client, orderId, order.quantity);
        }

        if (order.status !== 'completed') {
          await deps.emailQueue.enqueueTicketEmail(client, {
            orderId,
            customerEmail: order.customerEmail,
            event,
            tickets,
            quote,
          });
        }

        return { orderId, event, quote, tickets };
      });

      await deps.emailQueue.processPending();
      return result;
    },

    async reconcilePendingStripeOrder(orderId: string) {
      const stripe = getStripe(deps.config);

      if (!stripe) return false;

      const orderResult = await deps.db.query(
        `select id, status, payment_provider as "paymentProvider",
                payment_provider_reference as "providerReference"
         from orders
         where id = $1
         limit 1`,
        [orderId],
      );
      const order = orderResult.rows[0] as
        | { id: string; status: string; paymentProvider: string; providerReference: string }
        | undefined;

      if (!order || order.status !== 'pending' || order.paymentProvider !== 'stripe') {
        return false;
      }

      try {
        const session = await stripe.checkout.sessions.retrieve(order.providerReference);

        if (session.payment_status !== 'paid') {
          return false;
        }

        await this.completeStripeOrder(orderId, session.id);
        return true;
      } catch {
        return false;
      }
    },

    async listCustomerOrders(email: string) {
      const result = await deps.db.query(
        `select o.id, o.customer_email as "customerEmail", o.quantity, o.total_cents as "totalCents",
                o.status, o.created_at as "createdAt", e.name as "eventName", e.starts_at as "eventStartsAt",
                coalesce(ticket_summary.tickets, '[]'::json) as tickets
         from orders o
         join events e on e.id = o.event_id
         left join lateral (
           select json_agg(
                    json_build_object(
                      'id', t.id,
                      'ticketNumber', t.ticket_number,
                      'scanToken', t.scan_token,
                      'usedAt', t.used_at
                    )
                    order by t.ticket_number
                  ) as tickets
           from (
             select id,
                    row_number() over (order by created_at asc, id asc)::int as ticket_number,
                    scan_token,
                    used_at
             from tickets
             where order_id = o.id
           ) t
         ) ticket_summary on true
         where lower(o.customer_email) = lower($1)
           and o.status = 'completed'
         order by o.created_at desc
         limit 100`,
        [email],
      );

      return { orders: result.rows };
    },

    async getOrderConfirmation(orderId: string) {
      await this.reconcilePendingStripeOrder(orderId);

      const result = await deps.db.query(
        `select o.id, o.customer_email as "customerEmail", o.quantity,
                o.subtotal_cents as "subtotalCents", o.tax_cents as "taxCents", o.total_cents as "totalCents",
                o.status, o.created_at as "createdAt", e.name as "eventName", e.starts_at as "eventStartsAt",
                e.address as "eventAddress",
                coalesce(ticket_summary.tickets, '[]'::json) as tickets
         from orders o
         join events e on e.id = o.event_id
         left join lateral (
           select json_agg(
                    json_build_object(
                      'id', t.id,
                      'ticketNumber', t.ticket_number,
                      'scanToken', t.scan_token,
                      'usedAt', t.used_at
                    )
                    order by t.ticket_number
                  ) as tickets
           from (
             select id,
                    row_number() over (order by created_at asc, id asc)::int as ticket_number,
                    scan_token,
                    used_at
             from tickets
             where order_id = o.id
           ) t
         ) ticket_summary on true
         where o.id = $1
         limit 1`,
        [orderId],
      );

      return result.rows[0] ?? null;
    },
  };
}
