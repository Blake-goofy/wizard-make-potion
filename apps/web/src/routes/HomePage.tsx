import { FormEvent, useEffect, useState } from 'react';
import type { SessionUser } from '@potion/shared';
import LoadingOverlay from '../components/LoadingOverlay';
import { createStripeCheckout, type DevOrderResult, type EventView, getActiveEvent } from '../lib/api';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

type HomePageProps = {
  user: SessionUser | null;
};

export function HomePage({ user }: HomePageProps) {
  const [event, setEvent] = useState<EventView | null>(null);
  const [email, setEmail] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState('');
  const [order, setOrder] = useState<DevOrderResult | null>(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    setIsLoadingEvent(true);

    void getActiveEvent()
      .then((result) => {
        if (!isCurrent) return;
        setEvent(result.event);
        setStatus('');
      })
      .catch((error) => {
        if (!isCurrent) return;
        setEvent(null);
        setStatus(error instanceof Error ? error.message : 'Could not load the active event.');
      })
      .finally(() => {
        if (isCurrent) setIsLoadingEvent(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (user && !email) setEmail(user.email);
  }, [email, user]);

  async function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!event) return;

    setIsSubmitting(true);
    setStatus('');

    try {
      const result = await createStripeCheckout({ eventId: event.id, customerEmail: email, quantity });
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open Stripe checkout.');
      setIsSubmitting(false);
    }
  }

  function startAnotherOrder() {
    setOrder(null);
    setStatus('');
    setEmail('');
    setQuantity(event?.minTicketsPerOrder ?? 1);
  }

  if (!event) {
    return (
      <>
        <section className="content-panel loading-page-shell">
          <p className="status-text">{status || 'No active event is configured yet.'}</p>
        </section>
        {isLoadingEvent ? <LoadingOverlay label="Loading event" detail="Getting the active event and checkout details." variant="purchase" /> : null}
      </>
    );
  }

  const subtotalCents = event.ticketPriceCents * quantity;
  const taxCents = Math.round((subtotalCents * event.taxRateBps) / 10_000);
  const totalPrice = formatCurrency(subtotalCents + taxCents);
  const quantityOptions = Array.from(
    { length: event.maxTicketsPerOrder - event.minTicketsPerOrder + 1 },
    (_, index) => event.minTicketsPerOrder + index,
  );

  return (
    <>
    <section className="purchase-layout">
      <div className="event-summary">
        <p className="eyebrow">Ticketing</p>
        <h1>{event.name}</h1>
        <p>{new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(event.startsAt))}</p>
        <p>{event.address}</p>
        {event.description ? <p>{event.description}</p> : null}
      </div>

      {order ? (
        <div className="confirmation-panel">
          <div className="panel-header-row">
            <div>
              <p className="eyebrow">Confirmation</p>
              <h2>Tickets ready</h2>
            </div>
            <button type="button" onClick={startAnotherOrder}>
              Create Another Order
            </button>
          </div>
          <div className="info-grid">
            <article>
              <span>Order</span>
              <strong>{order.orderId}</strong>
            </article>
            <article>
              <span>Email</span>
              <strong>{email}</strong>
            </article>
            <article>
              <span>Total</span>
              <strong>{formatCurrency(order.quote.totalCents)}</strong>
            </article>
          </div>
          <div className="receipt-lines">
            <div>
              <span>Subtotal</span>
              <strong>{formatCurrency(order.quote.subtotalCents)}</strong>
            </div>
            <div>
              <span>Tax</span>
              <strong>{formatCurrency(order.quote.taxCents)}</strong>
            </div>
            <div>
              <span>Quantity</span>
              <strong>{order.quote.quantity}</strong>
            </div>
          </div>
          <div className="ticket-stack">
            {order.tickets.map((ticket) => (
              <article className="ticket-card" key={ticket.id}>
                <div className="ticket-card-header">
                  <span>Ticket {ticket.ticketNumber}</span>
                  <strong>{ticket.usedAt ? 'Used' : 'Active'}</strong>
                </div>
                <span className="status-text">Each ticket now carries its own QR code.</span>
                <code>{ticket.scanToken}</code>
              </article>
            ))}
          </div>
          {status ? <p className="status-text">{status}</p> : null}
        </div>
      ) : (
        <form className="purchase-form" onSubmit={handleSubmit}>
          <div className="price-row">
            <span>Total</span>
            <strong>{totalPrice}</strong>
          </div>
          <label>
            Email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="purchase-quantity-field">
            Quantity
            <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>
              {quantityOptions.map((value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? 'ticket' : 'tickets'}
                </option>
              ))}
            </select>
          </label>
          <button className="stripe-checkout-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <span aria-hidden="true" className="stripe-checkout-spinner" /> : null}
            <span>{isSubmitting ? 'Opening Stripe' : 'Pay With Stripe'}</span>
          </button>
          {!isSubmitting && status ? <p className="status-text">{status}</p> : null}
        </form>
      )}
    </section>
    </>
  );
}
