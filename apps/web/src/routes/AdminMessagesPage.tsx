import { useEffect, useMemo, useState } from 'react';
import type { SessionUser } from '@potion/shared';
import LoadingOverlay from '../components/LoadingOverlay';
import { PhoneNumberInput, createPhoneMask, getPhoneDigits, getStoredPhoneNumber } from '../components/PhoneNumberInput';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import {
  createAdminSmsMessage,
  getAdminEvents,
  getAdminSmsMessages,
  sendNowAdminSmsMessage,
  updateAdminSmsMessage,
  type EventView,
  type SmsMessageInput,
  type SmsMessageView,
} from '../lib/api';

type AdminMessagesPageProps = {
  token: string;
  currentUser: SessionUser | null;
};

type SmsMessageFormState = {
  id: string | null;
  messageType: 'reminder' | 'upcoming_event' | 'admin' | 'test';
  label: string;
  messageBody: string;
  testPhoneNumber: string;
  status: 'draft' | 'sent' | 'cancelled';
};

function createEmptySmsMessageForm(phoneNumber?: string | null): SmsMessageFormState {
  return {
    id: null,
    messageType: 'reminder',
    label: '',
    messageBody: '',
    testPhoneNumber: createPhoneMask(phoneNumber),
    status: 'draft',
  };
}

function formatMessageTypeLabel(messageType: SmsMessageFormState['messageType']) {
  if (messageType === 'upcoming_event') return 'Upcoming Alert';
  if (messageType === 'admin') return 'Admins';
  if (messageType === 'test') return 'Test';
  return 'Reminder';
}

export default function AdminMessagesPage({ token, currentUser }: AdminMessagesPageProps) {
  const [events, setEvents] = useState<EventView[]>([]);
  const [messages, setMessages] = useState<SmsMessageView[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [messageForm, setMessageForm] = useState<SmsMessageFormState>(() => createEmptySmsMessageForm(currentUser?.phoneNumber));
  const [isLoading, setIsLoading] = useState(true);
  const [isMessageSaving, setIsMessageSaving] = useState(false);
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
  const draftMessages = useMemo(
    () => messages.filter((message) => message.status === 'draft'),
    [messages],
  );

  useEffect(() => {
    let isCurrent = true;

    setIsLoading(true);

    getAdminEvents(token)
      .then((result) => {
        if (!isCurrent) return;

        setEvents(result.events);
        setSelectedEventId((currentSelection) => {
          if (currentSelection && result.events.some((event) => event.id === currentSelection)) {
            return currentSelection;
          }

          return result.events[0]?.id ?? '';
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
    let isCurrent = true;

    getAdminSmsMessages(token, selectedEventId || undefined)
      .then((result) => {
        if (!isCurrent) return;
        setMessages(result.messages);
      })
      .catch((error) => {
        if (!isCurrent) return;
        showToast(error instanceof Error ? error.message : 'Could not load saved messages.', 'error');
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedEventId, token]);

  useEffect(() => {
    if (messageForm.id) {
      return;
    }

    setMessageForm((currentForm) => {
      if (getPhoneDigits(currentForm.testPhoneNumber).length > 0) {
        return currentForm;
      }

      return {
        ...currentForm,
        testPhoneNumber: createPhoneMask(currentUser?.phoneNumber),
      };
    });
  }, [currentUser?.phoneNumber, messageForm.id, messageForm.testPhoneNumber]);

  function updateMessageField<Key extends keyof SmsMessageFormState>(key: Key, value: SmsMessageFormState[Key]) {
    setMessageForm((currentForm) => ({ ...currentForm, [key]: value }));
  }

  function messageToFormState(message: SmsMessageView): SmsMessageFormState {
    return {
      id: message.id,
      messageType: message.messageType,
      label: message.label,
      messageBody: message.messageBody,
      testPhoneNumber: createPhoneMask(message.testPhoneNumber),
      status: message.status,
    };
  }

  function resetMessageForm() {
    setMessageForm(createEmptySmsMessageForm(currentUser?.phoneNumber));
  }

  function handleMessageSelection(messageId: string) {
    if (!messageId) {
      resetMessageForm();
      return;
    }

    const selectedMessage = draftMessages.find((message) => message.id === messageId);

    if (!selectedMessage) {
      resetMessageForm();
      return;
    }

    if (selectedMessage.messageType === 'reminder' && selectedMessage.eventId) {
      setSelectedEventId(selectedMessage.eventId);
    }

    setMessageForm(messageToFormState(selectedMessage));
  }

  function buildMessagePayload(action: 'draft' | 'immediate'): { payload: SmsMessageInput } | { error: string } {
    if (!messageForm.label.trim()) return { error: 'Message label is required.' };
    if (!messageForm.messageBody.trim()) return { error: 'SMS message is required.' };
    if (messageForm.messageType === 'reminder' && !selectedEventId) return { error: 'Choose an event before creating a reminder message.' };

    const testPhoneNumber = getStoredPhoneNumber(messageForm.testPhoneNumber);

    if (messageForm.messageType === 'test' && !testPhoneNumber) {
      return { error: 'Enter a 10-digit phone number for the test SMS.' };
    }

    return {
      payload: {
        eventId: messageForm.messageType === 'reminder' ? selectedEventId : null,
        messageType: messageForm.messageType,
        label: messageForm.label.trim(),
        messageBody: messageForm.messageBody.trim(),
        testPhoneNumber: messageForm.messageType === 'test' ? testPhoneNumber : null,
        status: action === 'draft' ? 'draft' : 'sent',
      },
    };
  }

  async function refreshMessages() {
    const result = await getAdminSmsMessages(token, selectedEventId || undefined);
    setMessages(result.messages);
  }

  async function handleSaveMessage(action: 'draft' | 'immediate') {
    if (isMessageSaving) return;

    const result = buildMessagePayload(action);
    if ('error' in result) {
      showToast(result.error, 'error');
      return;
    }

    setIsMessageSaving(true);

    try {
      const response = messageForm.id
        ? await updateAdminSmsMessage(messageForm.id, result.payload, token)
        : await createAdminSmsMessage(result.payload, token);

      if (action === 'immediate') {
        const processResult = await sendNowAdminSmsMessage(response.message.id, token);
        showToast(`Queued ${processResult.queuedMessages} messages for immediate delivery.`, 'success');
      } else {
        showToast('Draft saved.', 'success');
      }

      await refreshMessages();
      resetMessageForm();
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Could not ${action === 'draft' ? 'save draft' : 'send SMS'}.`, 'error');
    } finally {
      setIsMessageSaving(false);
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
        <section className="stack-form admin-events-form" aria-label="SMS composer">
          <label>
            Message
            <select value={messageForm.id ?? ''} onChange={(event) => handleMessageSelection(event.target.value)}>
              <option value="">New</option>
              {draftMessages.map((message) => (
                <option key={message.id} value={message.id}>
                  {message.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Audience
            <select
              value={messageForm.messageType}
              onChange={(event) => {
                const nextType = event.target.value as SmsMessageFormState['messageType'];
                setMessageForm((currentForm) => ({
                  ...currentForm,
                  messageType: nextType,
                  testPhoneNumber: nextType === 'test' && getPhoneDigits(currentForm.testPhoneNumber).length === 0
                    ? createPhoneMask(currentUser?.phoneNumber)
                    : currentForm.testPhoneNumber,
                }));
              }}
            >
              <option value="reminder">Reminder</option>
              <option value="upcoming_event">Upcoming Alert</option>
              <option value="admin">Admins</option>
              <option value="test">Test</option>
            </select>
          </label>

          {messageForm.messageType === 'reminder' ? (
            <label>
              Event
              <select
                value={selectedEventId}
                disabled={isLoading || events.length === 0}
                onChange={(event) => setSelectedEventId(event.target.value)}
              >
                {events.length === 0 ? <option value="">No events available</option> : null}
                {events.map((eventRecord) => (
                  <option key={eventRecord.id} value={eventRecord.id}>
                    {eventRecord.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {messageForm.messageType === 'reminder' && selectedEvent ? (
            <p className="status-text">Reminder messages will target attendees for {selectedEvent.name} who opted into text reminders.</p>
          ) : null}
          {messageForm.messageType === 'upcoming_event' ? <p className="status-text">Upcoming alerts will send to people who opted into text alerts for future events.</p> : null}
          {messageForm.messageType === 'admin' ? <p className="status-text">This sends to active admins who have configured phone numbers.</p> : null}
          {messageForm.messageType === 'test' ? (
            <PhoneNumberInput label="Test Phone Number" value={messageForm.testPhoneNumber} onChange={(value) => updateMessageField('testPhoneNumber', value)} />
          ) : null}

          <label>
            Label
            <input value={messageForm.label} onChange={(event) => updateMessageField('label', event.target.value)} placeholder="Friday reminder" />
          </label>

          <label>
            Message
            <textarea value={messageForm.messageBody} onChange={(event) => updateMessageField('messageBody', event.target.value)} placeholder="Reply STOP to unsubscribe." />
          </label>

          <div className="admin-events-action-row">
            <button type="button" disabled={isMessageSaving} onClick={() => void handleSaveMessage('draft')}>
              {isMessageSaving ? 'Saving...' : 'Save Draft'}
            </button>
            <button type="button" className="primary-button" disabled={isMessageSaving} onClick={() => void handleSaveMessage('immediate')}>
              {isMessageSaving ? 'Saving...' : 'Send Now'}
            </button>
          </div>
        </section>
      </section>
      {isLoading ? <LoadingOverlay label="Loading messages" detail="Fetching message targets and saved drafts." variant="account" /> : null}
    </>
  );
}