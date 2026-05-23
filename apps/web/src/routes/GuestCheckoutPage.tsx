import { FormEvent, useEffect, useRef, useState } from 'react';
import ButtonArrowIcon from '../components/ButtonArrowIcon';
import LoadingOverlay from '../components/LoadingOverlay';
import { PhoneNumberInput, createPhoneMask, getPhoneDigits, getStoredPhoneNumber } from '../components/PhoneNumberInput';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import { createStripeCheckout, type EventView, getActiveEvent } from '../lib/api';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(value));
}

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

export default function GuestCheckoutPage() {
  const [event, setEvent] = useState<EventView | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(createPhoneMask(''));
  const [eventReminderOptIn, setEventReminderOptIn] = useState(false);
  const [upcomingEventsOptIn, setUpcomingEventsOptIn] = useState(false);
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
    if (!event || checkoutAttemptIdRef.current) return;

    const digits = getPhoneDigits(phoneNumber);
    const customerPhoneNumber = getStoredPhoneNumber(phoneNumber);
    const customerName = name.trim();
    const wantsSmsAlerts = eventReminderOptIn || upcomingEventsOptIn;

    if (!customerName) {
      showToast('Enter your name.', 'error');
      return;
    }

    if (digits.length > 0 && digits.length !== 10) {
      showToast('Enter a 10-digit phone number.', 'error');
      return;
    }

    if (wantsSmsAlerts && digits.length !== 10) {
      showToast('Enter a 10-digit phone number to get text alerts.', 'error');
      return;
    }

    const checkoutAttemptId = crypto.randomUUID();
    checkoutAttemptIdRef.current = checkoutAttemptId;
    setIsSubmitting(true);
    setStatus('');

    try {
      const result = await createStripeCheckout({
        eventId: event.id,
        customerEmail: email,
        customerName,
        customerPhoneNumber: customerPhoneNumber || undefined,
        eventReminderOptIn,
        upcomingEventsOptIn,
        quantity,
      }, checkoutAttemptId);
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
      <section className="guest-checkout-panel">
        <div className="guest-checkout-event">
          <h1>{event.name}</h1>
          <p>{formatEventDate(event.startsAt)}</p>
          <p>{event.address}</p>
        </div>
        <form className="stack-form guest-checkout-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <PhoneNumberInput label="Phone Number (Optional)" value={phoneNumber} onChange={setPhoneNumber} />
          <p className="status-text">Event reminders and upcoming event alerts are sent by text. Your order confirmation goes to email.</p>
          <label className="checkout-checkbox">
            <input
              type="checkbox"
              checked={eventReminderOptIn}
              onChange={(event) => setEventReminderOptIn(event.target.checked)}
            />
            <span>Text me a reminder about this event</span>
          </label>
          <label className="checkout-checkbox">
            <input
              type="checkbox"
              checked={upcomingEventsOptIn}
              onChange={(event) => setUpcomingEventsOptIn(event.target.checked)}
            />
            <span>Text me about other upcoming events</span>
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
          <OrderSummary event={event} quantity={quantity} />
          <button className="stripe-checkout-button primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <span aria-hidden="true" className="stripe-checkout-spinner" /> : null}
            <span>{isSubmitting ? 'Opening Stripe' : 'Pay With Stripe'}</span>
            {!isSubmitting ? <ButtonArrowIcon /> : null}
          </button>
        </form>
      </section>
      {isSubmitting ? <LoadingOverlay label="Opening Stripe" detail="Sending your order details to checkout." variant="purchase" /> : null}
    </>
  );
}