import { useEffect, useMemo, useState } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import { getAccountOrders, type AccountOrderView } from '../lib/api';

type MyTicketsPageProps = {
  token: string;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function buildTicketLink(orderId: string) {
  return `${window.location.origin}/?order=${orderId}`;
}

export default function MyTicketsPage({ token }: MyTicketsPageProps) {
  const [orders, setOrders] = useState<AccountOrderView[]>([]);
  const [message, setMessage] = useState('Loading tickets.');
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);

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
        setMessage(error instanceof Error ? error.message : 'Could not load tickets.');
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
    <section className="account-tickets-page">
      <p className="status-text">Click a purchase record to view your ticket QR code.</p>
      <div className="account-tickets-table-shell">
        <table className="account-tickets-table">
          <thead>
            <tr>
              <th scope="col">Purchase date</th>
              <th scope="col">Total</th>
              <th scope="col">People</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.length ? (
              visibleOrders.map((order) => (
                <tr
                  className="account-tickets-row"
                  key={order.id}
                  tabIndex={0}
                  onClick={() => openTicketConfirmation(order.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openTicketConfirmation(order.id);
                    }
                  }}
                >
                  <td>{formatDate(order.createdAt)}</td>
                  <td>{formatCurrency(order.totalCents)}</td>
                  <td>{order.peopleCount}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="account-tickets-empty" colSpan={3}>
                  {message || 'No available tickets found for this account.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
    {isLoadingOrders ? <LoadingOverlay label="Loading tickets" detail="Fetching your purchases and ticket links." variant="tickets" /> : null}
    </>
  );
}
