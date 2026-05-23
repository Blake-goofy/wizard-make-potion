import type { PoolClient } from 'pg';
import type { Database } from '@potion/db';
import {
  eventSchema,
  scanEventAttendanceSchema,
  scanTicketDetailSchema,
  type ScanTicketInput,
} from '@potion/shared';

export type ScannerService = ReturnType<typeof createScannerService>;

async function getEventAttendance(client: PoolClient, eventId: string) {
  const result = await client.query(
    `select e.id as "eventId", e.name as "eventName",
                 count(t.id) filter (where t.used_at is not null)::int as "usedTicketCount",
                 count(t.id)::int as "totalTicketCount"
     from events e
     left join orders o on o.event_id = e.id and o.status = 'completed'
     left join tickets t on t.order_id = o.id
     where e.id = $1
     group by e.id`,
    [eventId],
  );

  return result.rows[0] ? scanEventAttendanceSchema.parse(result.rows[0]) : null;
}

async function getTicketById(client: PoolClient, ticketId: string) {
  const result = await client.query(
    `select t.id,
            t.used_at as "usedAt",
            o.event_id as "eventId",
            o.id as "orderId",
            o.customer_email as "customerEmail",
            coalesce(o.customer_name, u.display_name, o.customer_email) as "customerName",
            (
              select count(*)::int
              from tickets order_tickets
              where order_tickets.order_id = t.order_id
                and order_tickets.used_at is not null
            ) as "orderUsedTicketCount",
            (
              select count(*)::int
              from tickets order_tickets
              where order_tickets.order_id = t.order_id
            ) as "orderTicketCount",
            e.name as "eventName",
            e.starts_at as "eventStartsAt",
            t.scan_token as "scanToken",
            (
              select count(*)::int
              from tickets prior_tickets
              where prior_tickets.order_id = t.order_id
                and (prior_tickets.created_at, prior_tickets.id) <= (t.created_at, t.id)
            ) as "ticketNumber"
     from tickets t
     join orders o on o.id = t.order_id
     left join users u on lower(u.email) = lower(o.customer_email)
     join events e on e.id = o.event_id
     where t.id = $1
       and o.status = 'completed'`,
    [ticketId],
  );

  return result.rows[0] ? scanTicketDetailSchema.parse(result.rows[0]) : null;
}

export function createScannerService(deps: { db: Database }) {
  return {
    async listEvents() {
      const result = await deps.db.query(
        `select id, slug, name, starts_at as "startsAt", address, description,
                ticket_price_cents as "ticketPriceCents", tax_rate_bps as "taxRateBps",
                min_tickets_per_order as "minTicketsPerOrder",
                max_tickets_per_order as "maxTicketsPerOrder", is_active as "isActive"
         from events
         order by is_active desc, starts_at desc`,
      );

      return result.rows.map((row) => eventSchema.parse(row));
    },

    async getEventAttendance(eventId: string) {
      return deps.db.transaction(async (client) => getEventAttendance(client, eventId));
    },

    async scanTicket(input: ScanTicketInput) {
      return deps.db.transaction(async (client) => {
        const ticketResult = await client.query(
          `select t.id,
                  t.used_at as "usedAt",
                  o.event_id as "eventId",
                  o.id as "orderId",
                  o.customer_email as "customerEmail",
                  coalesce(o.customer_name, u.display_name, o.customer_email) as "customerName",
                  (
                    select count(*)::int
                    from tickets order_tickets
                    where order_tickets.order_id = t.order_id
                      and order_tickets.used_at is not null
                  ) as "orderUsedTicketCount",
                  (
                    select count(*)::int
                    from tickets order_tickets
                    where order_tickets.order_id = t.order_id
                  ) as "orderTicketCount",
                  e.name as "eventName",
                  e.starts_at as "eventStartsAt",
                  t.scan_token as "scanToken",
                  (
                    select count(*)::int
                    from tickets prior_tickets
                    where prior_tickets.order_id = t.order_id
                      and (prior_tickets.created_at, prior_tickets.id) <= (t.created_at, t.id)
                  ) as "ticketNumber"
           from tickets t
           join orders o on o.id = t.order_id
           left join users u on lower(u.email) = lower(o.customer_email)
           join events e on e.id = o.event_id
           where t.scan_token = $1
             and o.event_id = $2
             and o.status = 'completed'
           for update of t`,
          [input.scanToken, input.eventId],
        );
        const ticketRow = ticketResult.rows[0];

        if (!ticketRow) {
          await client.query(
            `insert into scan_events (scan_token, result, scanner_label) values ($1, 'not_found', $2)`,
            [input.scanToken, input.scannerLabel ?? null],
          );
          return { status: 'not_found' as const, message: 'Ticket was not found.' };
        }

        const ticket = scanTicketDetailSchema.parse(ticketRow);
        const resultStatus = ticket.usedAt ? 'already_used' : 'valid';
        const message = resultStatus === 'already_used' ? 'Ticket was already used.' : 'Ticket accepted.';

        if (!ticket.usedAt) {
          await client.query(`update tickets set used_at = now() where id = $1`, [ticket.id]);
        }

        await client.query(
          `insert into scan_events (ticket_id, scan_token, result, scanner_label)
           values ($1, $2, $3, $4)`,
          [ticket.id, input.scanToken, resultStatus, input.scannerLabel ?? null],
        );

        const updatedTicket = await getTicketById(client, ticket.id);
        if (!updatedTicket) {
          throw new Error('Ticket was not found after scanning.');
        }
        const attendance = await getEventAttendance(client, updatedTicket.eventId);

        if (!attendance) {
          throw new Error('Attendance was not found for the selected event.');
        }

        return { status: resultStatus, message, ticket: updatedTicket, attendance };
      });
    },

    async setTicketUsage(ticketId: string, used: boolean, scannerLabel?: string) {
      return deps.db.transaction(async (client) => {
        const currentTicket = await client.query(
          `select t.id,
                  t.used_at as "usedAt",
                  o.event_id as "eventId"
           from tickets t
           join orders o on o.id = t.order_id
           where t.id = $1
             and o.status = 'completed'
           for update of t`,
          [ticketId],
        );
        const ticket = currentTicket.rows[0] as
          | { id: string; usedAt: string | null; eventId: string }
          | undefined;

        if (!ticket) {
          throw new Error('Ticket was not found.');
        }

        if (used && !ticket.usedAt) {
          await client.query(`update tickets set used_at = now() where id = $1`, [ticketId]);
          await client.query(
            `insert into scan_events (ticket_id, scan_token, result, scanner_label)
             select id, scan_token, 'manually_used', $2
             from tickets
             where id = $1`,
            [ticketId, scannerLabel ?? null],
          );
        }

        if (!used && ticket.usedAt) {
          await client.query(`update tickets set used_at = null where id = $1`, [ticketId]);
          await client.query(
            `insert into scan_events (ticket_id, scan_token, result, scanner_label)
             select id, scan_token, 'manually_unused', $2
             from tickets
             where id = $1`,
            [ticketId, scannerLabel ?? null],
          );
        }

        const updatedTicket = await getTicketById(client, ticketId);
        if (!updatedTicket) {
          throw new Error('Ticket was not found after updating usage.');
        }

        const attendance = await getEventAttendance(client, ticket.eventId);
        if (!attendance) {
          throw new Error('Attendance was not found for the selected event.');
        }
        return { ticket: updatedTicket, attendance };
      });
    },

    async markGroupArrived(ticketId: string, scannerLabel?: string) {
      return deps.db.transaction(async (client) => {
        const currentTicket = await client.query(
          `select t.id,
                  o.id as "orderId",
                  o.event_id as "eventId"
           from tickets t
           join orders o on o.id = t.order_id
           where t.id = $1
             and o.status = 'completed'
           for update of t`,
          [ticketId],
        );
        const ticket = currentTicket.rows[0] as
          | { id: string; orderId: string; eventId: string }
          | undefined;

        if (!ticket) {
          throw new Error('Ticket was not found.');
        }

        await client.query(
          `with updated_tickets as (
             update tickets
             set used_at = now()
             where order_id = $1
               and used_at is null
             returning id, scan_token
           )
           insert into scan_events (ticket_id, scan_token, result, scanner_label)
           select id, scan_token, 'manually_used', $2
           from updated_tickets`,
          [ticket.orderId, scannerLabel ?? null],
        );

        const updatedTicket = await getTicketById(client, ticketId);
        if (!updatedTicket) {
          throw new Error('Ticket was not found after updating usage.');
        }

        const attendance = await getEventAttendance(client, ticket.eventId);
        if (!attendance) {
          throw new Error('Attendance was not found for the selected event.');
        }

        return { ticket: updatedTicket, attendance };
      });
    },
  };
}
