import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EventCountdown, EventPrices } from './EventPurchaseDetails';
import type { EventView } from '../lib/api';

const startsAt = '2026-10-31T23:00:00.000Z';

describe('event purchase details', () => {
  it('formats the countdown and stops at the event start', () => {
    const remainingSeconds = 5 * 86400 + 8 * 3600 + 9 * 60 + 20;
    const html = renderToStaticMarkup(createElement(EventCountdown, { startsAt, now: Date.parse(startsAt) - remainingSeconds * 1000 }));
    expect(html).toContain('Event starts in 5 days, 8 hours, 9 minutes and 20 seconds.');
    expect(html).toContain('<strong>05</strong>');
    expect(html).toContain('<strong>09</strong>');
    for (const offset of [0, 1000]) {
      const started = renderToStaticMarkup(createElement(EventCountdown, { startsAt, now: Date.parse(startsAt) + offset }));
      expect(started).toContain('The event has started');
      expect(started).not.toContain('event-countdown-units');
    }
  });

  it('shows both prices, the deadline and the inactive price before and after the cutoff', () => {
    const event = { ticketPriceCents: 2500, earlyBirdPriceCents: 2000, earlyBirdEndsAt: startsAt } as EventView;
    for (const offset of [-1, 0]) {
      const html = renderToStaticMarkup(createElement(EventPrices, { event, now: Date.parse(startsAt) + offset }));
      expect(html).toContain('$20.00');
      expect(html).toContain('$25.00');
      expect(html).toContain(`dateTime="${startsAt}"`);
      expect(html.match(/is-inactive/g)).toHaveLength(1);
      expect(html).toContain(offset < 0 ? 'Early bird ends' : 'Early bird ended');
    }
  });
});
