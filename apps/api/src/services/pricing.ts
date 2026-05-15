import type { EventRecord, PricingQuote } from '@potion/shared';

export function quoteTickets(event: EventRecord, quantity: number): PricingQuote {
  const subtotalCents = event.ticketPriceCents * quantity;
  const taxCents = Math.round((subtotalCents * event.taxRateBps) / 10_000);

  return {
    quantity,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}
