import { describe, expect, it } from 'vitest';
import { formatCents, getTicketPriceCents } from './money.js';

describe('formatCents', () => {
  it('formats cents as US dollars', () => {
    expect(formatCents(2599)).toBe('$25.99');
  });
});

describe('getTicketPriceCents', () => {
  const deadline = '2026-10-20T18:00:00.000Z';
  const event = { ticketPriceCents: 2500, earlyBirdPriceCents: 2000, earlyBirdEndsAt: deadline };

  it('switches to the regular price exactly at the deadline', () => {
    expect(getTicketPriceCents(event, Date.parse(deadline) - 1)).toBe(2000);
    expect(getTicketPriceCents(event, Date.parse(deadline))).toBe(2500);
    expect(getTicketPriceCents(event, Date.parse(deadline) + 1)).toBe(2500);
  });

  it('supports free early bird tickets and events without early bird pricing', () => {
    const beforeDeadline = Date.parse(deadline) - 1;
    expect(getTicketPriceCents({ ...event, earlyBirdPriceCents: 0 }, beforeDeadline)).toBe(0);
    expect(getTicketPriceCents({ ticketPriceCents: 2500 }, beforeDeadline)).toBe(2500);
    expect(getTicketPriceCents({ ...event, earlyBirdEndsAt: null }, beforeDeadline)).toBe(2500);
  });
});
