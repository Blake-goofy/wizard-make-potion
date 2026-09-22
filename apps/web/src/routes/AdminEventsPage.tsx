import { useEffect, useMemo, useState } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import {
  createAdminEvent,
  getAdminEvents,
  getEventImageUrl,
  removeAdminEventImage,
  updateAdminEvent,
  uploadAdminEventImage,
  type EventView,
} from '../lib/api';

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
const MAX_EVENT_IMAGE_BYTES = 5 * 1024 * 1024;
const EVENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageInputVersion, setImageInputVersion] = useState(0);
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
  const pendingImageUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile]);
  const imagePreviewUrl = pendingImageUrl ?? (selectedEvent ? getEventImageUrl(selectedEvent) : null);

  useEffect(() => () => {
    if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
  }, [pendingImageUrl]);

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
    setImageFile(null);
    setImageInputVersion((currentVersion) => currentVersion + 1);

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

  function handleImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setImageFile(null);
      return;
    }

    if (!EVENT_IMAGE_TYPES.has(file.type)) {
      event.target.value = '';
      showToast('Choose a JPEG, PNG, or WebP image.', 'error');
      return;
    }

    if (file.size === 0 || file.size > MAX_EVENT_IMAGE_BYTES) {
      event.target.value = '';
      showToast('Choose an image smaller than 5 MB.', 'error');
      return;
    }

    setImageFile(file);
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
    let savedEvent: EventView | null = null;

    try {
      if (isCreatingEvent) {
        const response = await createAdminEvent(result.payload, token);
        savedEvent = response.event;
      } else if (!selectedEvent) {
        showToast('Choose an event to edit.', 'error');
        return;
      } else {
        const response = await updateAdminEvent(selectedEvent.id, { ...result.payload, isActive: form.isActive }, token);
        savedEvent = response.event;
      }

      if (imageFile) {
        const imageResponse = await uploadAdminEventImage(savedEvent.id, imageFile, token);
        savedEvent = { ...savedEvent, imageUpdatedAt: imageResponse.imageUpdatedAt };
      }

      const persistedEvent = savedEvent;
      setEvents((currentEvents) => {
        const eventExists = currentEvents.some((eventRecord) => eventRecord.id === persistedEvent.id);
        return eventExists
          ? currentEvents.map((eventRecord) => (eventRecord.id === persistedEvent.id ? persistedEvent : eventRecord))
          : [persistedEvent, ...currentEvents];
      });
      setSelectedEventId(persistedEvent.id);
      setForm(eventToFormState(persistedEvent));
      setImageFile(null);
      setImageInputVersion((currentVersion) => currentVersion + 1);
      showToast(isCreatingEvent ? 'Event created.' : 'Event saved.', 'success');
    } catch (error) {
      if (savedEvent) {
        const persistedEvent = savedEvent;
        setEvents((currentEvents) => {
          const eventExists = currentEvents.some((eventRecord) => eventRecord.id === persistedEvent.id);
          return eventExists
            ? currentEvents.map((eventRecord) => (eventRecord.id === persistedEvent.id ? persistedEvent : eventRecord))
            : [persistedEvent, ...currentEvents];
        });
        setSelectedEventId(persistedEvent.id);
      }

      const message = error instanceof Error ? error.message : 'Could not save the event.';
      showToast(savedEvent ? `Event saved, but the image could not be uploaded. ${message}` : message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveImage() {
    if (!selectedEvent?.imageUpdatedAt || isSaving) return;
    if (!window.confirm(`Remove the image from ${selectedEvent.name}?`)) return;

    setIsSaving(true);

    try {
      await removeAdminEventImage(selectedEvent.id, token);
      const updatedEvent = { ...selectedEvent, imageUpdatedAt: null };
      setEvents((currentEvents) => currentEvents.map((eventRecord) => (
        eventRecord.id === updatedEvent.id ? updatedEvent : eventRecord
      )));
      showToast('Event image removed.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not remove the event image.', 'error');
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

            <label>
              Event Image
              <input
                key={imageInputVersion}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={isSaving}
                onChange={handleImageSelection}
              />
              <span className="admin-events-inline-note">JPEG, PNG, or WebP. Maximum 5 MB.</span>
            </label>

            {imagePreviewUrl ? (
              <div className="admin-event-image-preview">
                <img src={imagePreviewUrl} alt={`${form.name || 'Event'} poster preview`} />
                {!imageFile && selectedEvent?.imageUpdatedAt ? (
                  <button className="danger-button" type="button" disabled={isSaving} onClick={() => void handleRemoveImage()}>
                    Remove Image
                  </button>
                ) : null}
              </div>
            ) : null}

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
