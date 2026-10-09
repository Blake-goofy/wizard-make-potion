import type { EventRecord } from './schemas.js';

export function getTicketPriceCents(
  event: Pick<EventRecord, 'ticketPriceCents' | 'earlyBirdPriceCents' | 'earlyBirdEndsAt'>,
  now = Date.now(),
) {
  return event.earlyBirdPriceCents != null && event.earlyBirdEndsAt && now < Date.parse(event.earlyBirdEndsAt)
    ? event.earlyBirdPriceCents
    : event.ticketPriceCents;
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
