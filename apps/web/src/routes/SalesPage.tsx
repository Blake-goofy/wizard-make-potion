import { useEffect, useMemo, useRef, useState } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import { getAdminTickets, getScannerEvents, type AdminTicketView, type EventView } from '../lib/api';

type SalesPageProps = {
  token: string;
};

type FilterKey = 'email' | 'status' | null;
type ArrivalStatus = 'unused' | 'used';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function getTicketArrivalStatus(ticket: Pick<AdminTicketView, 'usedAt'>): ArrivalStatus {
  return ticket.usedAt ? 'used' : 'unused';
}

function formatTicketArrivalStatus(ticket: Pick<AdminTicketView, 'usedAt'>) {
  const status = getTicketArrivalStatus(ticket);

  if (status === 'used') return 'Used';
  return 'Unused';
}

function getTicketStatusClassName(status: ArrivalStatus) {
  if (status === 'used') return 'is-used';
  return 'is-unused';
}

function estimateNetCents(totalCents: number) {
  return Math.max(totalCents - Math.round(totalCents * 0.029 + 30), 0);
}

function buildTicketLink(orderId: string) {
  return `${window.location.origin}/?order=${orderId}`;
}

export default function SalesPage({ token }: SalesPageProps) {
  const [tickets, setTickets] = useState<AdminTicketView[]>([]);
  const [events, setEvents] = useState<EventView[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [message, setMessage] = useState('Loading purchased tickets.');
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [emailFilter, setEmailFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Record<ArrivalStatus, boolean>>({
    unused: true,
    used: true,
  });
  const [openFilter, setOpenFilter] = useState<FilterKey>(null);
  const emailFilterRef = useRef<HTMLDivElement | null>(null);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);

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
        setMessage(error instanceof Error ? error.message : 'Could not load events for ticket sales.');
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
    if (!openFilter) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node)) return;

      const activeFilterRef = openFilter === 'email' ? emailFilterRef : statusFilterRef;

      if (activeFilterRef.current?.contains(target)) return;

      setOpenFilter(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenFilter(null);
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openFilter]);

  const filteredTickets = useMemo(() => {
    const normalizedEmailFilter = emailFilter.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const matchesEmail =
        normalizedEmailFilter.length === 0 || ticket.customerEmail.toLowerCase().includes(normalizedEmailFilter);
      const matchesStatus = statusFilter[getTicketArrivalStatus(ticket)];

      return matchesEmail && matchesStatus;
    });
  }, [emailFilter, statusFilter, tickets]);

  const filteredSummary = useMemo(
    () => {
      const seenOrders = new Set<string>();
      let expectedEarningsCents = 0;

      for (const ticket of filteredTickets) {
        if (seenOrders.has(ticket.orderId)) continue;
        seenOrders.add(ticket.orderId);
        expectedEarningsCents += estimateNetCents(ticket.totalCents);
      }

      return {
        ticketCount: filteredTickets.length,
        usedCount: filteredTickets.filter((ticket) => ticket.usedAt !== null).length,
        expectedEarningsCents,
      };
    },
    [filteredTickets],
  );

  async function loadTickets(authToken: string, eventId: string) {
    setIsLoadingTickets(true);

    try {
      const result = await getAdminTickets(authToken, eventId);
      setTickets(result.tickets);
      setMessage(result.tickets.length ? '' : 'No ticket records found yet.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load purchased tickets.');
    } finally {
      setIsLoadingTickets(false);
    }
  }

  function toggleFilter(filter: Exclude<FilterKey, null>) {
    setOpenFilter((current) => (current === filter ? null : filter));
  }

  function toggleStatusOption(key: ArrivalStatus) {
    setStatusFilter((current) => {
      const selectedCount = Number(current.unused) + Number(current.used);

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

  return (
    <>
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
                <div className="ticket-sales-filter" ref={emailFilterRef}>
                  <button
                    aria-expanded={openFilter === 'email'}
                    className={`ticket-sales-filter-button${emailFilter ? ' has-value' : ''}`}
                    type="button"
                    onClick={() => toggleFilter('email')}
                  >
                    Email
                  </button>
                  {openFilter === 'email' ? (
                    <div aria-label="Filter by email" className="table-filter-popover" role="dialog">
                      <div className="table-filter-popover-header">
                        <strong>Email filter</strong>
                        <button
                          aria-label="Close email filter"
                          className="table-filter-close"
                          type="button"
                          onClick={() => setOpenFilter(null)}
                        >
                          x
                        </button>
                      </div>
                      <input
                        autoFocus
                        placeholder="Contains email"
                        type="text"
                        value={emailFilter}
                        onChange={(event) => setEmailFilter(event.target.value)}
                      />
                    </div>
                  ) : null}
                </div>
              </th>
              <th scope="col">Paid</th>
              <th scope="col">
                <div className="ticket-sales-filter ticket-sales-filter-align-end" ref={statusFilterRef}>
                  <button
                    aria-expanded={openFilter === 'status'}
                    className={`ticket-sales-filter-button${
                      statusFilter.unused && statusFilter.used ? '' : ' has-value'
                    }`}
                    type="button"
                    onClick={() => toggleFilter('status')}
                  >
                    Status
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
                          x
                        </button>
                      </div>
                      <label className="table-filter-checkbox">
                        <input
                          checked={statusFilter.unused}
                          disabled={statusFilter.unused && !statusFilter.used}
                          type="checkbox"
                          onChange={() => toggleStatusOption('unused')}
                        />
                        <span>Unused</span>
                      </label>
                      <label className="table-filter-checkbox">
                        <input
                          checked={statusFilter.used}
                          disabled={statusFilter.used && !statusFilter.unused}
                          type="checkbox"
                          onChange={() => toggleStatusOption('used')}
                        />
                        <span>Used</span>
                      </label>
                    </div>
                  ) : null}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredTickets.length ? (
              filteredTickets.map((ticket) => (
                <tr
                  className="ticket-sales-row"
                  key={ticket.id}
                  tabIndex={0}
                  onClick={() => openTicketConfirmation(ticket.orderId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openTicketConfirmation(ticket.orderId);
                    }
                  }}
                >
                  <td title={ticket.customerEmail}>{ticket.customerEmail}</td>
                  <td>{formatCurrency(ticket.totalCents)}</td>
                  <td>
                    <span className={`ticket-status-pill ${getTicketStatusClassName(getTicketArrivalStatus(ticket))}`}>
                      {formatTicketArrivalStatus(ticket)}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="ticket-sales-empty" colSpan={3}>
                  {tickets.length ? 'No tickets match the current filters.' : 'No ticket records found yet.'}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="ticket-sales-summary-row">
              <td colSpan={3}>
                <div className="ticket-sales-summary-grid">
                  <div className="ticket-sales-summary-cell">
                    <span className="ticket-sales-summary-label">Tickets total</span>
                    <strong>{filteredSummary.ticketCount}</strong>
                  </div>
                  <div className="ticket-sales-summary-cell">
                    <span className="ticket-sales-summary-label">Used total</span>
                    <strong>{filteredSummary.usedCount}</strong>
                  </div>
                  <div className="ticket-sales-summary-cell">
                    <span className="ticket-sales-summary-label">Expected earnings</span>
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
