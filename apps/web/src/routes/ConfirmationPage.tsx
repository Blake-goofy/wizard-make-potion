import { useEffect, useRef, useState } from 'react';
import type { SessionUser } from '@potion/shared';
import QRCode from 'qrcode';
import ActionDialog from '../components/ActionDialog';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import { getOrderConfirmation, updateTicketUsage, type ConfirmationOrderView } from '../lib/api';

type ConfirmationPageProps = {
  orderId: string;
  token: string;
  user: SessionUser | null;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(value));
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M5 15V7a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="copyable-address-field">
      <code>{address}</code>
      <span className={`copyable-address-status${copied ? ' is-visible' : ''}`} aria-live="polite">
        Copied
      </span>
      <button type="button" aria-label="Copy address" title={copied ? 'Copied' : 'Copy address'} onClick={() => void copyAddress()}>
        <CopyIcon />
      </button>
    </div>
  );
}

function getThemeColor(cssVariableName: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVariableName).trim();

  return value || fallback;
}

function TicketQrCode({ scanToken }: { scanToken: string }) {
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    let isCurrent = true;
    const qrDark = getThemeColor('--color-background', '#17131c');
    const qrLight = getThemeColor('--color-surface-inverse', '#f8f4ff');

    void QRCode.toDataURL(scanToken, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 220,
      color: {
        dark: qrDark,
        light: qrLight,
      },
    }).then((url) => {
      if (isCurrent) setQrCodeUrl(url);
    });

    return () => {
      isCurrent = false;
    };
  }, [scanToken]);

  return (
    <div className="ticket-qr-frame">
      {qrCodeUrl ? <img className="ticket-qr-image" src={qrCodeUrl} alt="QR code" /> : <span>Loading QR</span>}
    </div>
  );
}

export default function ConfirmationPage({ orderId, token, user }: ConfirmationPageProps) {
  const [order, setOrder] = useState<ConfirmationOrderView | null>(null);
  const [message, setMessage] = useState('Loading purchased tickets.');
  const [pendingUsageAction, setPendingUsageAction] = useState<{
    ticket: ConfirmationOrderView['tickets'][number];
    nextUsed: boolean;
  } | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const ticketScrollerRef = useRef<HTMLDivElement | null>(null);
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

  const canManageTicketUsage = Boolean(token && (user?.role === 'admin' || user?.role === 'scanner'));

  useEffect(() => {
    setIsLoadingOrder(true);

    void getOrderConfirmation(orderId)
      .then((result) => {
        setOrder(result.order);
        setMessage(
          result.order.status === 'pending'
            ? 'Payment is processing. Tickets will appear here once Stripe confirms the order.'
            : '',
        );
      })
      .catch((error) => {
        setOrder(null);
        setMessage('We could not load your purchased tickets right now.');
        showToast(error instanceof Error ? error.message : 'Could not load purchased tickets.', 'error');
      })
      .finally(() => {
        setIsLoadingOrder(false);
      });
  }, [orderId]);

  useEffect(() => {
    if (!order || order.status !== 'pending') return;

    const timeoutId = window.setTimeout(() => {
      void getOrderConfirmation(orderId)
        .then((result) => {
          setOrder(result.order);
          setMessage(
            result.order.status === 'pending'
              ? 'Payment is processing. Tickets will appear here once Stripe confirms the order.'
              : '',
          );
        })
        .catch((error) => {
          showToast(error instanceof Error ? error.message : 'Could not load purchased tickets.', 'error');
        });
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [order, orderId]);

  function openTicketUsageDialog(ticket: ConfirmationOrderView['tickets'][number]) {
    setPendingUsageAction({ ticket, nextUsed: !ticket.usedAt });
  }

  async function handleConfirmTicketUsage() {
    if (!pendingUsageAction || !token) return;

    setIsSubmitting(true);

    try {
      const result = await updateTicketUsage(pendingUsageAction.ticket.id, { used: pendingUsageAction.nextUsed }, token);

      setOrder((current) => {
        if (!current) return current;

        return {
          ...current,
          tickets: current.tickets.map((ticket) =>
            ticket.id === result.ticket.id
              ? {
                  ...ticket,
                  usedAt: result.ticket.usedAt,
                }
              : ticket,
          ),
        };
      });
      setPendingUsageAction(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update ticket status.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

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
      <section className="content-panel confirmation-page">
        {order ? (
          <>
            <div className="confirmation-hero">
              <div className="confirmation-status-row">
                <p className="eyebrow">{order.status === 'pending' ? 'Processing' : 'Order Confirmed'}</p>
              </div>
              <h1>{order.status === 'pending' ? 'Preparing your tickets' : "You're all set"}</h1>
              <div className="confirmation-event-block">
                <strong>{order.eventName}</strong>
                <span>{formatEventDate(order.eventStartsAt)}</span>
                <CopyableAddress address={order.eventAddress} />
              </div>
              {message ? <p className="status-text">{message}</p> : null}
            </div>
            {order.tickets.length ? (
              <div className="confirmation-ticket-section">
                <div className="confirmation-ticket-grid" ref={ticketScrollerRef}>
                  {order.tickets.map((ticket) => (
                    <article className="confirmation-ticket-card" key={ticket.id}>
                      <div className="confirmation-ticket-card-header">
                        <span className="confirmation-ticket-label">Ticket {ticket.ticketNumber}</span>
                        {canManageTicketUsage ? (
                          <button
                            aria-pressed={Boolean(ticket.usedAt)}
                            className={`ticket-usage-toggle${ticket.usedAt ? ' is-used' : ''}`}
                            disabled={isSubmitting}
                            type="button"
                            onClick={() => openTicketUsageDialog(ticket)}
                          >
                            <span className="ticket-usage-toggle-handle" aria-hidden="true" />
                            <span>{ticket.usedAt ? 'Used' : 'Unused'}</span>
                          </button>
                        ) : null}
                      </div>
                      <TicketQrCode scanToken={ticket.scanToken} />
                      {canManageTicketUsage ? (
                        <span className="status-text confirmation-ticket-meta">
                          {ticket.usedAt ? `Marked used ${formatDate(ticket.usedAt)}` : 'Ready to scan'}
                        </span>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="confirmation-summary">
              <div className="confirmation-summary-heading">
                <h2>Order Summary</h2>
                <strong>{formatCurrency(order.totalCents)}</strong>
              </div>
              <div className="confirmation-summary-row">
                <span>{order.quantity} ticket{order.quantity === 1 ? '' : 's'} purchased</span>
                <strong>{formatDate(order.createdAt)}</strong>
              </div>
              <span className="status-text">{order.customerEmail}</span>
            </div>
          </>
        ) : (
          <div className="confirmation-hero">
            <p className="eyebrow">Purchased Tickets</p>
            <h1>Loading tickets</h1>
            <p className="status-text">{message}</p>
          </div>
        )}
        <ActionDialog
          confirmLabel={pendingUsageAction?.nextUsed ? 'Mark Used' : 'Mark Unused'}
          confirmTone={pendingUsageAction?.nextUsed ? 'default' : 'danger'}
          description={
            pendingUsageAction
              ? pendingUsageAction.nextUsed
                ? `Mark ticket ${pendingUsageAction.ticket.ticketNumber} as used?`
                : `Mark ticket ${pendingUsageAction.ticket.ticketNumber} as unused and make it scannable again?`
              : ''
          }
          isOpen={Boolean(pendingUsageAction)}
          isSubmitting={isSubmitting}
          title={pendingUsageAction?.nextUsed ? 'Confirm Ticket Use' : 'Undo Ticket Use'}
          onClose={() => setPendingUsageAction(null)}
          onConfirm={() => void handleConfirmTicketUsage()}
        />
      </section>
      {isLoadingOrder || isSubmitting ? (
        <LoadingOverlay
          label={isSubmitting ? 'Saving ticket status' : 'Loading tickets'}
          detail={isSubmitting ? 'Updating whether this ticket is used.' : 'Fetching your order confirmation and ticket details.'}
          variant="confirmation"
        />
      ) : null}
    </>
  );
}