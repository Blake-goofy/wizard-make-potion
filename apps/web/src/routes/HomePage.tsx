import { FormEvent, useEffect, useRef, useState } from 'react';
import type { SessionUser } from '@potion/shared';
import ButtonArrowIcon from '../components/ButtonArrowIcon';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
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
  const checkoutAttemptIdRef = useRef<string | null>(null);
  const {
    toastMessage,
    toastTone,
    toastVersion,
    isToastClosing,
    showToast,
    dismissToast,
    handleToastTouchStart,
    handleToastTouchEnd,
    handleToastTouchCancel,
  } = useToast();

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
        setStatus('We could not load the active event right now.');
        showToast(error instanceof Error ? error.message : 'Could not load the active event.', 'error');
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
    if (!event || checkoutAttemptIdRef.current) return;

    const checkoutAttemptId = crypto.randomUUID();
    checkoutAttemptIdRef.current = checkoutAttemptId;
    setIsSubmitting(true);
    setStatus('');

    try {
      const result = await createStripeCheckout({ eventId: event.id, customerEmail: email, quantity }, checkoutAttemptId);
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open Stripe checkout.', 'error');
      checkoutAttemptIdRef.current = null;
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
        <ToastRegion
          message={toastMessage}
          tone={toastTone}
          version={toastVersion}
          isClosing={isToastClosing}
          onDismiss={dismissToast}
          onTouchStart={handleToastTouchStart}
          onTouchEnd={handleToastTouchEnd}
          onTouchCancel={handleToastTouchCancel}
        />
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
    <ToastRegion
      message={toastMessage}
      tone={toastTone}
      version={toastVersion}
      isClosing={isToastClosing}
      onDismiss={dismissToast}
      onTouchStart={handleToastTouchStart}
      onTouchEnd={handleToastTouchEnd}
      onTouchCancel={handleToastTouchCancel}
    />
    <section className="purchase-layout">
      <div className="event-summary">
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
            {!isSubmitting ? <ButtonArrowIcon /> : null}
          </button>
        </form>
      )}
    </section>
    </>
  );
}
