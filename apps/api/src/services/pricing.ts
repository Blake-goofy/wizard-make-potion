import { getTicketPriceCents, type EventRecord, type PricingQuote } from '@potion/shared';

export function quoteTickets(event: EventRecord, quantity: number): PricingQuote {
  const subtotalCents = getTicketPriceCents(event) * quantity;
  const taxCents = Math.round((subtotalCents * event.taxRateBps) / 10_000);

  return {
    quantity,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}
