import { describe, expect, it, vi } from 'vitest';
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

  it('quotes early bird tickets with tax, then regular tickets at the cutoff', () => {
    const deadline = '2026-10-20T18:00:00.000Z';
    const discountedEvent = { ...event, earlyBirdPriceCents: 1800, earlyBirdEndsAt: deadline };
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(Date.parse(deadline) - 1);
      expect(quoteTickets(discountedEvent, 2)).toEqual({ quantity: 2, subtotalCents: 3600, taxCents: 324, totalCents: 3924 });
      now.mockReturnValue(Date.parse(deadline));
      expect(quoteTickets(discountedEvent, 2)).toEqual({ quantity: 2, subtotalCents: 5000, taxCents: 450, totalCents: 5450 });
    } finally {
      now.mockRestore();
    }
  });
});
