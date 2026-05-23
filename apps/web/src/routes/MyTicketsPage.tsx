import { useEffect, useMemo, useState } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import { getAccountOrders, type AccountOrderView } from '../lib/api';

type MyTicketsPageProps = {
  token: string;
};

type ArrivalStatus = 'unused' | 'partial' | 'used';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function buildTicketLink(orderId: string) {
  const url = new URL(window.location.origin);

  url.searchParams.set('order', orderId);
  url.searchParams.set('from', 'myTickets');

  return url.toString();
}

function getOrderArrivalStatus(order: Pick<AccountOrderView, 'tickets'>): ArrivalStatus {
  const usedCount = order.tickets.filter((ticket) => ticket.usedAt).length;

  if (usedCount === 0) return 'unused';
  if (usedCount >= order.tickets.length) return 'used';
  return 'partial';
}

function formatOrderArrivalStatus(order: Pick<AccountOrderView, 'tickets'>) {
  const status = getOrderArrivalStatus(order);

  if (status === 'used') return 'Used';
  if (status === 'partial') return 'Partially used';
  return 'Unused';
}

function getTicketStatusClassName(status: ArrivalStatus) {
  if (status === 'used') return 'is-used';
  if (status === 'partial') return 'is-partial';
  return 'is-unused';
}

export default function MyTicketsPage({ token }: MyTicketsPageProps) {
  const [orders, setOrders] = useState<AccountOrderView[]>([]);
  const [message, setMessage] = useState('Loading tickets.');
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
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
    if (!token) return;

    let isCurrent = true;

    setIsLoadingOrders(true);

    getAccountOrders(token)
      .then((result) => {
        if (!isCurrent) return;
        setOrders(result.orders);
        setMessage('');
      })
      .catch((error) => {
        if (!isCurrent) return;
        setMessage('We could not load your tickets right now.');
        showToast(error instanceof Error ? error.message : 'Could not load tickets.', 'error');
      })
      .finally(() => {
        if (isCurrent) setIsLoadingOrders(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  const visibleOrders = useMemo(
    () =>
      orders
        .map((order) => ({
          ...order,
          peopleCount: order.tickets.length,
        }))
        .filter((order) => order.peopleCount > 0),
    [orders],
  );

  function openTicketConfirmation(orderId: string) {
    window.location.assign(buildTicketLink(orderId));
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
    <section className="account-tickets-page">
      <p className="status-text">Click a purchase record to view your ticket QR code.</p>
      <div className="account-tickets-legend" aria-label="Ticket status legend">
        <span className="account-tickets-legend-item">
          <span aria-hidden="true" className="ticket-sales-status-dot is-unused"></span>
          <span>Unused</span>
        </span>
        <span className="account-tickets-legend-item">
          <span aria-hidden="true" className="ticket-sales-status-dot is-partial"></span>
          <span>Partially used</span>
        </span>
        <span className="account-tickets-legend-item">
          <span aria-hidden="true" className="ticket-sales-status-dot is-used"></span>
          <span>Used</span>
        </span>
      </div>
      <div className="account-tickets-table-shell">
        <table className="account-tickets-table">
          <thead>
            <tr>
              <th scope="col">Event name</th>
              <th scope="col">People</th>
              <th scope="col">Sts</th>
            </tr>
          </thead>
          {visibleOrders.length ? (
            visibleOrders.map((order) => {
              const status = getOrderArrivalStatus(order);
              const statusLabel = formatOrderArrivalStatus(order);

              return (
                <tbody className="account-tickets-order-group" key={order.id}>
                  <tr
                    className="account-tickets-row account-tickets-row-primary"
                    tabIndex={0}
                    onClick={() => openTicketConfirmation(order.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openTicketConfirmation(order.id);
                      }
                    }}
                  >
                    <td className="account-tickets-cell-primary" title={order.eventName}>{order.eventName}</td>
                    <td className="account-tickets-cell-metric">{order.peopleCount}</td>
                    <td className="account-tickets-status-cell" rowSpan={2}>
                      <span
                        aria-hidden="true"
                        className={`ticket-sales-status-dot ${getTicketStatusClassName(status)}`}
                        title={statusLabel}
                      ></span>
                      <span className="visually-hidden">{statusLabel}</span>
                    </td>
                  </tr>
                  <tr className="account-tickets-row account-tickets-row-secondary" onClick={() => openTicketConfirmation(order.id)}>
                    <td className="account-tickets-cell-secondary">{formatDate(order.createdAt)}</td>
                    <td className="account-tickets-cell-secondary account-tickets-cell-metric">{formatCurrency(order.totalCents)}</td>
                  </tr>
                </tbody>
              );
            })
          ) : (
            <tbody>
              <tr>
                <td className="account-tickets-empty" colSpan={3}>
                  {message || 'No available tickets found for this account.'}
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </section>
    {isLoadingOrders ? <LoadingOverlay label="Loading tickets" detail="Fetching your purchases and ticket links." variant="tickets" /> : null}
    </>
  );
}
