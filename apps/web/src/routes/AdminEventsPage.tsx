import { useEffect, useMemo, useState } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import { createAdminEvent, getAdminEvents, updateAdminEvent, type EventView } from '../lib/api';

type AdminEventsPageProps = {
  token: string;
};

type EventFormState = {
  name: string;
  startsAtDate: string;
  startsAtTime: string;
  address: string;
  description: string;
  ticketPrice: string;
  isActive: boolean;
};

type EventPayload = {
  name: string;
  startsAt: string;
  address: string;
  description: string;
  ticketPriceCents: number;
};

type EventPayloadResult = { payload: EventPayload } | { error: string };

const emptyEventForm: EventFormState = {
  name: '',
  startsAtDate: '',
  startsAtTime: '',
  address: '',
  description: '',
  ticketPrice: '',
  isActive: true,
};

const CREATE_EVENT_OPTION = '__create_event__';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function parseCurrencyToCents(value: string) {
  const normalizedValue = value.replace(/[$,\s]/g, '');

  if (!/^\d+(\.\d{0,2})?$/.test(normalizedValue)) {
    return null;
  }

  return Math.round(Number(normalizedValue) * 100);
}

function formatDatetimeLocal(isoValue: string) {
  const date = new Date(isoValue);

  if (Number.isNaN(date.getTime())) {
    return { date: '', time: '' };
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return {
    date: localDate.toISOString().slice(0, 10),
    time: localDate.toISOString().slice(11, 16),
  };
}

function eventToFormState(event: EventView): EventFormState {
  const startsAtLocal = formatDatetimeLocal(event.startsAt);

  return {
    name: event.name,
    startsAtDate: startsAtLocal.date,
    startsAtTime: startsAtLocal.time,
    address: event.address,
    description: event.description ?? '',
    ticketPrice: formatCurrency(event.ticketPriceCents),
    isActive: event.isActive,
  };
}

export default function AdminEventsPage({ token }: AdminEventsPageProps) {
  const [events, setEvents] = useState<EventView[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(CREATE_EVENT_OPTION);
  const [form, setForm] = useState<EventFormState>(emptyEventForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );
  const isCreatingEvent = selectedEventId === CREATE_EVENT_OPTION;

  useEffect(() => {
    let isCurrent = true;

    setIsLoading(true);

    getAdminEvents(token)
      .then((result) => {
        if (!isCurrent) return;

        setEvents(result.events);
        setSelectedEventId((currentSelection) => {
          if (currentSelection === CREATE_EVENT_OPTION) {
            return currentSelection;
          }

          if (currentSelection && result.events.some((event) => event.id === currentSelection)) {
            return currentSelection;
          }

          return result.events[0]?.id ?? CREATE_EVENT_OPTION;
        });
      })
      .catch((error) => {
        if (!isCurrent) return;
        showToast(error instanceof Error ? error.message : 'Could not load events.', 'error');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  useEffect(() => {
    if (isCreatingEvent) {
      setForm(emptyEventForm);
      return;
    }

    if (selectedEvent) {
      setForm(eventToFormState(selectedEvent));
    }
  }, [isCreatingEvent, selectedEvent]);

  function updateField<Key extends keyof EventFormState>(key: Key, value: EventFormState[Key]) {
    setForm((currentForm) => ({ ...currentForm, [key]: value }));
  }

  function formatTicketPriceDraft() {
    const ticketPriceCents = parseCurrencyToCents(form.ticketPrice);

    if (ticketPriceCents === null) return;

    updateField('ticketPrice', formatCurrency(ticketPriceCents));
  }

  function buildPayload(): EventPayloadResult {
    const ticketPriceCents = parseCurrencyToCents(form.ticketPrice);
    const startsAtLocal = form.startsAtDate && form.startsAtTime ? `${form.startsAtDate}T${form.startsAtTime}` : '';
    const startsAtDate = startsAtLocal ? new Date(startsAtLocal) : null;

    if (!form.name.trim()) return { error: 'Name is required.' };
    if (!startsAtDate || Number.isNaN(startsAtDate.getTime())) return { error: 'Start date and time are required.' };
    if (!form.address.trim()) return { error: 'Address is required.' };
    if (!form.description.trim()) return { error: 'Description is required.' };
    if (ticketPriceCents === null) return { error: 'Enter a ticket price like $12.00.' };

    return {
      payload: {
        name: form.name.trim(),
        startsAt: startsAtDate.toISOString(),
        address: form.address.trim(),
        description: form.description.trim(),
        ticketPriceCents,
      },
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    const result = buildPayload();

    if ('error' in result) {
      showToast(result.error, 'error');
      return;
    }

    setIsSaving(true);

    try {
      if (isCreatingEvent) {
        const response = await createAdminEvent(result.payload, token);
        setEvents((currentEvents) => [response.event, ...currentEvents]);
        setSelectedEventId(response.event.id);
        setForm(eventToFormState(response.event));
        showToast('Event created.', 'success');
        return;
      }

      if (!selectedEvent) {
        showToast('Choose an event to edit.', 'error');
        return;
      }

      const response = await updateAdminEvent(selectedEvent.id, { ...result.payload, isActive: form.isActive }, token);
      setEvents((currentEvents) => currentEvents.map((eventRecord) => (eventRecord.id === response.event.id ? response.event : eventRecord)));
      setForm(eventToFormState(response.event));
      showToast('Event saved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save the event.', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <ToastRegion
        isClosing={isToastClosing}
        message={toastMessage}
        tone={toastTone}
        version={toastVersion}
        onDismiss={dismissToast}
        onTouchStart={handleToastTouchStart}
        onTouchEnd={handleToastTouchEnd}
        onTouchCancel={handleToastTouchCancel}
      />
      <section className="content-panel admin-events-panel">
        <section className="stack-form admin-events-form" aria-label="Event management">
          <div className="admin-events-header">
            <h1>Event Management</h1>
            <p className="status-text">Create new events or update the event details used by reminder messages.</p>
          </div>

          <div className="admin-events-mode-row">
            <label>
              Event
              <select value={selectedEventId} disabled={isLoading} onChange={(event) => setSelectedEventId(event.target.value)}>
                <option value={CREATE_EVENT_OPTION}>Create New Event</option>
                {events.length === 0 ? <option value="" disabled>No events available</option> : null}
                {events.map((eventRecord) => (
                  <option key={eventRecord.id} value={eventRecord.id}>
                    {eventRecord.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <form className="stack-form" onSubmit={(event) => void handleSubmit(event)}>
            <label>
              Name
              <input value={form.name} onChange={(event) => updateField('name', event.target.value)} required />
            </label>

            <div className="admin-events-field-row">
              <div className="admin-events-datetime-group admin-events-compact-field" aria-label="Starts at">
                <label>
                  Start Date
                  <input type="date" value={form.startsAtDate} onChange={(event) => updateField('startsAtDate', event.target.value)} required />
                </label>

                <label>
                  Start Time
                  <input type="time" value={form.startsAtTime} onChange={(event) => updateField('startsAtTime', event.target.value)} required />
                </label>
              </div>

              <label className="admin-events-price-field">
                Ticket Price
                <input
                  value={form.ticketPrice}
                  inputMode="decimal"
                  placeholder="$12.00"
                  onBlur={formatTicketPriceDraft}
                  onChange={(event) => updateField('ticketPrice', event.target.value)}
                  required
                />
              </label>
            </div>

            <label>
              Address
              <input value={form.address} onChange={(event) => updateField('address', event.target.value)} required />
            </label>

            <label>
              Description
              <textarea value={form.description} onChange={(event) => updateField('description', event.target.value)} required />
            </label>

            {!isCreatingEvent ? (
              <label>
                Active
                <select value={form.isActive ? 'active' : 'inactive'} onChange={(event) => updateField('isActive', event.target.value === 'active')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            ) : null}

            <button type="submit" disabled={isSaving || (!isCreatingEvent && !selectedEvent)}>
              {isSaving ? 'Saving...' : isCreatingEvent ? 'Create Event' : 'Save Event'}
            </button>
          </form>
        </section>
      </section>
      {isLoading ? <LoadingOverlay label="Loading events" detail="Fetching event settings." variant="account" /> : null}
    </>
  );
}