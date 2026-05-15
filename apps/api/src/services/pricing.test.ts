import { describe, expect, it } from 'vitest';
import type { EventRecord } from '@potion/shared';
import { quoteTickets } from './pricing.js';

const event: EventRecord = {
  id: 'd4649f21-8d60-4633-97c6-53f9549f3378',
  slug: 'local-potion-night',
  name: 'Wizard Make Potion Night',
  startsAt: '2026-10-31T23:00:00.000Z',
  address: '123 Cauldron Lane, Local Dev',
  description: null,
  ticketPriceCents: 2500,
  taxRateBps: 900,
  minTicketsPerOrder: 1,
  maxTicketsPerOrder: 10,
  isActive: true,
};

describe('quoteTickets', () => {
  it('calculates subtotal, tax, and total in cents', () => {
    expect(quoteTickets(event, 2)).toEqual({
      quantity: 2,
      subtotalCents: 5000,
      taxCents: 450,
      totalCents: 5450,
    });
  });
});
