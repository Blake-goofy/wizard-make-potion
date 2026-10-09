import { useEffect, useState } from 'react';
import { formatCents, getTicketPriceCents } from '@potion/shared';
import type { EventView } from '../lib/api';

export function useEventClock(event: EventView | null) {
  const [now, setNow] = useState(Date.now);
  const startsAt = event?.startsAt;

  useEffect(() => {
    if (!startsAt) return;
    const start = Date.parse(startsAt);
    let timer: number | undefined;

    function tick() {
      const current = Date.now();
      setNow(current);
      if (current >= start) window.clearInterval(timer);
    }

    function resume() {
      window.clearInterval(timer);
      tick();
      if (!document.hidden && Date.now() < start) timer = window.setInterval(tick, 1000);
    }

    resume();
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [startsAt]);

  return now;
}

export function EventPrices({ event, now }: { event: EventView; now: number }) {
  if (event.earlyBirdPriceCents == null || !event.earlyBirdEndsAt) {
    return <p className="event-ticket-price">{formatCents(event.ticketPriceCents)} per ticket</p>;
  }

  const isEarlyBird = getTicketPriceCents(event, now) === event.earlyBirdPriceCents;
  const deadline = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(event.earlyBirdEndsAt));

  return (
    <div className="event-prices" aria-label="Ticket prices">
      <div className={`event-price-option${isEarlyBird ? '' : ' is-inactive'}`}>
        <span>Early bird <small>{isEarlyBird ? 'Available now' : 'Ended'}</small></span>
        <strong>{formatCents(event.earlyBirdPriceCents)} <small>per ticket</small></strong>
      </div>
      <div className={`event-price-option${isEarlyBird ? ' is-inactive' : ''}`}>
        <span>Regular <small>{isEarlyBird ? 'After early bird ends' : 'Available now'}</small></span>
        <strong>{formatCents(event.ticketPriceCents)} <small>per ticket</small></strong>
      </div>
      <p className="early-bird-deadline">
        Early bird {isEarlyBird ? 'ends' : 'ended'} <time dateTime={event.earlyBirdEndsAt}>{deadline}</time>.
      </p>
    </div>
  );
}

export function EventCountdown({ startsAt, now }: { startsAt: string; now: number }) {
  const seconds = Math.max(0, Math.ceil((Date.parse(startsAt) - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  const remainingSeconds = seconds % 60;

  return (
    <div className="event-countdown" role="timer" aria-live="off" aria-label={seconds === 0
      ? 'The event has started.'
      : `Event starts in ${days} days, ${hours} hours, ${minutes} minutes and ${remainingSeconds} seconds.`}>
      <p>{seconds === 0 ? 'The event has started' : 'Event starts in'}</p>
      {seconds > 0 ? (
        <div className="event-countdown-units" aria-hidden="true">
          {[[days, days === 1 ? 'day' : 'days'], [hours, 'hrs'], [minutes, 'min'], [remainingSeconds, 'sec']].map(([value, label]) => (
            <span key={label}><strong>{String(value).padStart(2, '0')}</strong><small>{label}</small></span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
