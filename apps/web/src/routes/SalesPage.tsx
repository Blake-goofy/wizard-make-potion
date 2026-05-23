import { useEffect, useMemo, useRef, useState } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import { getAdminTickets, getScannerEvents, type AdminTicketView, type EventView } from '../lib/api';

type SalesPageProps = {
  token: string;
};

type FilterKey = 'status' | null;
type ArrivalStatus = 'unused' | 'partial' | 'used';

type AdminOrderView = {
  id: string;
  customerDisplayName: string | null;
  customerEmail: string;
  totalCents: number;
  createdAt: string;
  eventName: string;
  eventStartsAt: string;
  ticketCount: number;
  usedCount: number;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function getOrderArrivalStatus(order: Pick<AdminOrderView, 'ticketCount' | 'usedCount'>): ArrivalStatus {
  if (order.usedCount === 0) return 'unused';
  if (order.usedCount >= order.ticketCount) return 'used';
  return 'partial';
}

function formatOrderArrivalStatus(order: Pick<AdminOrderView, 'ticketCount' | 'usedCount'>) {
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

function estimateNetCents(totalCents: number) {
  return Math.max(totalCents - Math.round(totalCents * 0.029 + 30), 0);
}

function buildTicketLink(orderId: string) {
  const url = new URL(window.location.origin);

  url.searchParams.set('order', orderId);
  url.searchParams.set('from', 'sales');

  return url.toString();
}

function getOrderCustomerLabel(order: Pick<AdminOrderView, 'customerDisplayName' | 'customerEmail'>) {
  const displayName = order.customerDisplayName?.trim();

  return displayName && displayName.length > 0 ? displayName : order.customerEmail;
}

export default function SalesPage({ token }: SalesPageProps) {
  const [tickets, setTickets] = useState<AdminTicketView[]>([]);
  const [events, setEvents] = useState<EventView[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [message, setMessage] = useState('Loading purchased tickets.');
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [nameFilter, setNameFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Record<ArrivalStatus, boolean>>({
    unused: true,
    partial: true,
    used: true,
  });
  const [openFilter, setOpenFilter] = useState<FilterKey>(null);
  const nameFilterInputRef = useRef<HTMLInputElement | null>(null);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
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
    setIsLoadingEvents(true);

    getScannerEvents(token)
      .then((result) => {
        if (!isCurrent) return;

        setEvents(result.events);
        setSelectedEventId((current) => {
          if (current && result.events.some((event) => event.id === current)) {
            return current;
          }

          return result.events.find((event) => event.isActive)?.id ?? result.events[0]?.id ?? '';
        });
      })
      .catch((error) => {
        if (!isCurrent) return;
        setEvents([]);
        setSelectedEventId('');
        setMessage('We could not load ticket sales right now.');
        showToast(error instanceof Error ? error.message : 'Could not load events for ticket sales.', 'error');
      })
      .finally(() => {
        if (isCurrent) setIsLoadingEvents(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (!selectedEventId) {
      setTickets([]);
      if (!isLoadingEvents) setMessage('No events available for ticket sales.');
      setIsLoadingTickets(false);
      return;
    }

    void loadTickets(token, selectedEventId);
  }, [isLoadingEvents, selectedEventId, token]);

  useEffect(() => {
    if (openFilter !== 'status') return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) return;

      if (statusFilterRef.current?.contains(target)) return;

      setOpenFilter(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenFilter(null);
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openFilter]);

  const orders = useMemo(() => {
    const ordersById = new Map<string, AdminOrderView>();

    for (const ticket of tickets) {
      const existingOrder = ordersById.get(ticket.orderId);

      if (existingOrder) {
        existingOrder.ticketCount += 1;
        if (ticket.usedAt) {
          existingOrder.usedCount += 1;
        }
        continue;
      }

      ordersById.set(ticket.orderId, {
        id: ticket.orderId,
        customerDisplayName: ticket.customerDisplayName,
        customerEmail: ticket.customerEmail,
        totalCents: ticket.totalCents,
        createdAt: ticket.createdAt,
        eventName: ticket.eventName,
        eventStartsAt: ticket.eventStartsAt,
        ticketCount: 1,
        usedCount: ticket.usedAt ? 1 : 0,
      });
    }

    return Array.from(ordersById.values());
  }, [tickets]);

  const filteredOrders = useMemo(() => {
    const normalizedNameFilter = nameFilter.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesName =
        normalizedNameFilter.length === 0 || getOrderCustomerLabel(order).toLowerCase().includes(normalizedNameFilter);
      const matchesStatus = statusFilter[getOrderArrivalStatus(order)];

      return matchesName && matchesStatus;
    });
  }, [nameFilter, orders, statusFilter]);

  const filteredSummary = useMemo(
    () => {
      let expectedEarningsCents = 0;
      let ticketCount = 0;
      let usedTicketCount = 0;

      for (const order of filteredOrders) {
        expectedEarningsCents += estimateNetCents(order.totalCents);
        ticketCount += order.ticketCount;
        usedTicketCount += order.usedCount;
      }

      return {
        ticketCount,
        usedTicketCount,
        expectedEarningsCents,
      };
    },
    [filteredOrders],
  );

  async function loadTickets(authToken: string, eventId: string) {
    setIsLoadingTickets(true);

    try {
      const result = await getAdminTickets(authToken, eventId);
      setTickets(result.tickets);
      setMessage(result.tickets.length ? '' : 'No order records found yet.');
    } catch (error) {
      setMessage('We could not load purchased tickets right now.');
      showToast(error instanceof Error ? error.message : 'Could not load purchased tickets.', 'error');
    } finally {
      setIsLoadingTickets(false);
    }
  }

  function toggleFilter(filter: Exclude<FilterKey, null>) {
    setOpenFilter((current) => (current === filter ? null : filter));
  }

  function toggleStatusOption(key: ArrivalStatus) {
    setStatusFilter((current) => {
      const selectedCount = Object.values(current).filter(Boolean).length;

      if (current[key] && selectedCount === 1) {
        return current;
      }

      return {
        ...current,
        [key]: !current[key],
      };
    });
  }

  function openTicketConfirmation(orderId: string) {
    window.location.assign(buildTicketLink(orderId));
  }

  function clearNameFilter() {
    setNameFilter('');
    nameFilterInputRef.current?.focus();
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
    <section className="ticket-sales-page">
      {message ? <p className="status-text">{message}</p> : null}
      <div className="ticket-sales-toolbar">
        <label className="ticket-sales-event-select">
          <span>Event</span>
          <select
            aria-label="Event for ticket sales"
            disabled={isLoadingEvents || events.length === 0}
            value={selectedEventId}
            onChange={(event) => setSelectedEventId(event.target.value)}
          >
            {events.length === 0 ? <option value="">No events</option> : null}
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="ticket-sales-table-shell">
        <table className="ticket-sales-table">
          <thead>
            <tr>
              <th scope="col">
                <div className={`ticket-sales-name-filter table-filter-input-shell${nameFilter ? ' has-action' : ''}`}>
                  <input
                    aria-label="Search name"
                    ref={nameFilterInputRef}
                    placeholder="Search name"
                    type="text"
                    value={nameFilter}
                    onChange={(event) => setNameFilter(event.target.value)}
                  />
                  {nameFilter ? (
                    <button className="table-filter-input-action" type="button" onClick={clearNameFilter}>
                      Clear
                    </button>
                  ) : null}
                </div>
              </th>
              <th scope="col">People</th>
              <th className="ticket-sales-status-header" scope="col">
                <div className="ticket-sales-filter ticket-sales-filter-align-end" ref={statusFilterRef}>
                  <button
                    aria-expanded={openFilter === 'status'}
                    className={`ticket-sales-filter-button${
                      statusFilter.unused && statusFilter.partial && statusFilter.used ? '' : ' has-value'
                    }`}
                    type="button"
                    onClick={() => toggleFilter('status')}
                  >
                    Sts
                  </button>
                  {openFilter === 'status' ? (
                    <div aria-label="Filter by status" className="table-filter-popover table-filter-popover-status" role="dialog">
                      <div className="table-filter-popover-header">
                        <strong>Status filter</strong>
                        <button
                          aria-label="Close status filter"
                          className="table-filter-close"
                          type="button"
                          onClick={() => setOpenFilter(null)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M6 6 18 18" />
                            <path d="M18 6 6 18" />
                          </svg>
                        </button>
                      </div>
                      <label className="table-filter-checkbox">
                        <input
                          checked={statusFilter.unused}
                          className="is-unused"
                          disabled={statusFilter.unused && !statusFilter.partial && !statusFilter.used}
                          type="checkbox"
                          onChange={() => toggleStatusOption('unused')}
                        />
                        <span className="ticket-sales-filter-key is-unused">
                          <span>Unused</span>
                        </span>
                      </label>
                      <label className="table-filter-checkbox">
                        <input
                          checked={statusFilter.partial}
                          className="is-partial"
                          disabled={statusFilter.partial && !statusFilter.unused && !statusFilter.used}
                          type="checkbox"
                          onChange={() => toggleStatusOption('partial')}
                        />
                        <span className="ticket-sales-filter-key is-partial">
                          <span>Partially used</span>
                        </span>
                      </label>
                      <label className="table-filter-checkbox">
                        <input
                          checked={statusFilter.used}
                          className="is-used"
                          disabled={statusFilter.used && !statusFilter.unused && !statusFilter.partial}
                          type="checkbox"
                          onChange={() => toggleStatusOption('used')}
                        />
                        <span className="ticket-sales-filter-key is-used">
                          <span>Used</span>
                        </span>
                      </label>
                    </div>
                  ) : null}
                </div>
              </th>
            </tr>
          </thead>
          {filteredOrders.length ? (
            filteredOrders.map((order) => {
              const status = getOrderArrivalStatus(order);
              const statusLabel = formatOrderArrivalStatus(order);

              return (
                <tbody className="ticket-sales-order-group" key={order.id}>
                  <tr
                    className="ticket-sales-row ticket-sales-row-primary"
                    tabIndex={0}
                    onClick={() => openTicketConfirmation(order.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openTicketConfirmation(order.id);
                      }
                    }}
                  >
                    <td className="ticket-sales-cell-primary" title={getOrderCustomerLabel(order)}>{getOrderCustomerLabel(order)}</td>
                    <td className="ticket-sales-cell-metric">{order.ticketCount}</td>
                    <td className="ticket-sales-status-cell" rowSpan={2}>
                      <span
                        aria-hidden="true"
                        className={`ticket-sales-status-dot ${getTicketStatusClassName(status)}`}
                        title={statusLabel}
                      ></span>
                      <span className="visually-hidden">{statusLabel}</span>
                    </td>
                  </tr>
                  <tr className="ticket-sales-row ticket-sales-row-secondary" onClick={() => openTicketConfirmation(order.id)}>
                    <td className="ticket-sales-cell-secondary">{formatDate(order.createdAt)}</td>
                    <td className="ticket-sales-cell-secondary ticket-sales-cell-metric">{formatCurrency(order.totalCents)}</td>
                  </tr>
                </tbody>
              );
            })
          ) : (
            <tbody>
              <tr>
                <td className="ticket-sales-empty" colSpan={3}>
                  {orders.length ? 'No orders match the current filters.' : 'No order records found yet.'}
                </td>
              </tr>
            </tbody>
          )}
          <tfoot>
            <tr className="ticket-sales-summary-row">
              <td colSpan={3}>
                <div className="ticket-sales-summary-grid">
                  <div className="ticket-sales-summary-cell">
                    <span className="ticket-sales-summary-label">Tickets</span>
                    <strong>{filteredSummary.ticketCount}</strong>
                  </div>
                  <div className="ticket-sales-summary-cell">
                    <span className="ticket-sales-summary-label">Used</span>
                    <strong>{filteredSummary.usedTicketCount}</strong>
                  </div>
                  <div className="ticket-sales-summary-cell">
                    <span className="ticket-sales-summary-label">Earnings</span>
                    <strong>{formatCurrency(filteredSummary.expectedEarningsCents)}</strong>
                  </div>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
    {isLoadingTickets ? <LoadingOverlay label="Loading ticket sales" detail="Fetching the latest sales and arrival totals." variant="sales" /> : null}
    </>
  );
}
