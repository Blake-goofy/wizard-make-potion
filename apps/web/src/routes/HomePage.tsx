import { FormEvent, useEffect, useRef, useState } from 'react';
import type { SessionUser } from '@potion/shared';
import ButtonArrowIcon from '../components/ButtonArrowIcon';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import { createStripeCheckout, type EventView, getActiveEvent } from '../lib/api';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

type HomePageProps = {
  token: string | null;
  user: SessionUser | null;
  onCreateAccount: () => void;
  onContinueAsGuest: () => void;
};

function OrderSummary({ event, quantity }: { event: EventView; quantity: number }) {
  const subtotalCents = event.ticketPriceCents * quantity;
  const taxCents = Math.round((subtotalCents * event.taxRateBps) / 10_000);
  const totalCents = subtotalCents + taxCents;

  return (
    <div className="receipt-lines order-summary" aria-live="polite">
      <div>
        <span>Tickets</span>
        <strong>{quantity}</strong>
      </div>
      <div>
        <span>Cost</span>
        <strong>{formatCurrency(subtotalCents)}</strong>
      </div>
      <div>
        <span>Tax</span>
        <strong>{formatCurrency(taxCents)}</strong>
      </div>
      <div className="order-summary-total">
        <span>Total</span>
        <strong>{formatCurrency(totalCents)}</strong>
      </div>
    </div>
  );
}

export function HomePage({ token, user, onCreateAccount, onContinueAsGuest }: HomePageProps) {
  const [event, setEvent] = useState<EventView | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState('');
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
        setQuantity(result.event?.minTicketsPerOrder ?? 1);
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

  async function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!event || !user || checkoutAttemptIdRef.current) return;

    const checkoutAttemptId = crypto.randomUUID();
    checkoutAttemptIdRef.current = checkoutAttemptId;
    setIsSubmitting(true);
    setStatus('');

    try {
      const result = await createStripeCheckout({ eventId: event.id, customerEmail: user.email, quantity }, checkoutAttemptId, token);
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open Stripe checkout.', 'error');
      checkoutAttemptIdRef.current = null;
      setIsSubmitting(false);
    }
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
        <div className="event-logistics">
          <p className="event-date">{new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(event.startsAt))}</p>
          <p className="event-address">{event.address}</p>
        </div>
        {event.description ? <p className="event-description">{event.description}</p> : null}
        {!user ? <p className="event-ticket-price">{formatCurrency(event.ticketPriceCents)} per ticket</p> : null}
      </div>

      {user ? (
        <form className="purchase-form" onSubmit={handleSubmit}>
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
          <OrderSummary event={event} quantity={quantity} />
          <button className="stripe-checkout-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <span aria-hidden="true" className="stripe-checkout-spinner" /> : null}
            <span>{isSubmitting ? 'Opening Stripe' : 'Pay With Stripe'}</span>
            {!isSubmitting ? <ButtonArrowIcon /> : null}
          </button>
        </form>
      ) : (
        <div className="purchase-form guest-choice-panel">
          <button className="primary-button button-with-arrow" type="button" onClick={onCreateAccount}>
            <span>Create account to buy tickets</span>
            <ButtonArrowIcon />
          </button>
          <button className="text-button" type="button" onClick={onContinueAsGuest}>
            Continue as guest
          </button>
        </div>
      )}
      <footer className="legal-footer" aria-label="Legal links">
        <a href="#privacy-policy">Privacy Policy</a>
        <span aria-hidden="true">|</span>
        <a href="#terms-and-conditions">Terms and Conditions</a>
      </footer>
    </section>
    {isSubmitting ? <LoadingOverlay label="Opening Stripe" detail="Sending your order details to checkout." variant="purchase" /> : null}
    </>
  );
}
