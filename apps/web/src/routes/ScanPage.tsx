import { useEffect, useState } from 'react';
import type { ScanEventAttendance, ScanTicketResult, SessionUser } from '@potion/shared';
import ActionDialog from '../components/ActionDialog';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import { getScannerAttendance, getScannerEvents, scanTicket, updateTicketUsage, type EventView } from '../lib/api';
import { useQrScanner } from '../hooks/useQrScanner';

type PreviewScanStatus = ScanTicketResult['status'];
type UsageActionTicket = NonNullable<ScanTicketResult['ticket']>;

type ScanNotice = {
  id: number;
  status: PreviewScanStatus;
};

declare global {
  interface Window {
    __scannerPreview?: {
      show: (status: PreviewScanStatus) => void;
      reset: () => void;
    };
  }
}

const previewOrderIds: Record<Exclude<PreviewScanStatus, 'not_found'>, string> = {
  valid: '11111111-1111-4111-8111-111111111111',
  already_used: '22222222-2222-4222-8222-222222222222',
};

function buildPreviewResult(status: PreviewScanStatus): {
  result: ScanTicketResult;
  attendance: ScanEventAttendance | null;
} {
  if (status === 'not_found') {
    return {
      result: {
        status,
        message: 'No ticket matched that code.',
      },
      attendance: null,
    };
  }

  const attendance = {
    eventId: '33333333-3333-4333-8333-333333333333',
    eventName: 'Wizard Make Potion Night',
    usedTicketCount: status === 'valid' ? 50 : 49,
    totalTicketCount: 120,
  } satisfies ScanEventAttendance;

  return {
    result: {
      status,
      message: status === 'valid' ? 'Ticket accepted.' : 'Ticket was already used.',
      attendance,
      ticket: {
        id: '44444444-4444-4444-8444-444444444444',
        usedAt: status === 'valid' ? '2026-05-14T19:32:00.000Z' : '2026-05-14T19:12:00.000Z',
        eventId: attendance.eventId,
        eventName: attendance.eventName,
        eventStartsAt: '2026-10-31T19:00:00.000Z',
        orderId: previewOrderIds[status],
        customerEmail: 'preview@wizard.test',
        ticketNumber: status === 'valid' ? 18 : 19,
        scanToken: `preview-${status}`,
      },
    },
    attendance,
  };
}

function noticeCopy(status: PreviewScanStatus) {
  if (status === 'valid') return { title: 'Ticket accepted', detail: 'This ticket is now marked used.', iconLabel: 'Accepted' };
  if (status === 'already_used') return { title: 'Already used', detail: 'This ticket has already been scanned.', iconLabel: 'Warning' };
  return { title: 'Ticket not found', detail: 'No matching record in the database.', iconLabel: 'Not found' };
}

function ScanNoticeIcon({ status }: { status: PreviewScanStatus }) {
  if (status === 'valid') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10" />
        <path d="m7.5 12.5 3 3 6-7" />
      </svg>
    );
  }

  if (status === 'already_used') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.5 2.5 20h19L12 3.5Z" />
        <path d="M12 9v4.5" />
        <circle cx="12" cy="17" r="1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" />
      <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
    </svg>
  );
}

function ScanPendingIcon() {
  return <span aria-hidden="true" className="scan-notice-spinner" />;
}

function getStatusMessage(scanResult: ScanTicketResult | null, scannerError: string | null) {
  if (scannerError) return scannerError;
  if (!scanResult) return 'Point the camera at a ticket QR code.';
  if (scanResult.status === 'valid') return scanResult.message;
  if (scanResult.status === 'already_used') return scanResult.message;
  return 'No ticket matched that code.';
}

function formatTicketState(ticket: UsageActionTicket | null) {
  if (!ticket) return 'No Ticket';
  return ticket.usedAt ? 'Used' : 'Unused';
}

type ScanPageProps = {
  token: string;
  user: SessionUser | null;
  onViewOrder: (orderId: string) => void;
};

export default function ScanPage({ token, user, onViewOrder }: ScanPageProps) {
  const [scanResult, setScanResult] = useState<ScanTicketResult | null>(null);
  const [events, setEvents] = useState<EventView[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [lastAttendance, setLastAttendance] = useState<ScanEventAttendance | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning'>('idle');
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [pendingUsageAction, setPendingUsageAction] = useState<{
    ticket: UsageActionTicket;
    nextUsed: boolean;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const scanner = useQrScanner({ onScan: handleScan, cooldownMs: 3000 });
  const scannedTicket = scanResult?.ticket ?? null;
  const attendance = scanResult?.attendance ?? lastAttendance;
  const canManageTicketUsage = Boolean(token && (user?.role === 'admin' || user?.role === 'scanner') && scannedTicket);

  useEffect(() => {
    if (!notice) return;

    const timeoutId = window.setTimeout(() => {
      setNotice((currentNotice) => (currentNotice?.id === notice.id ? null : currentNotice));
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    window.__scannerPreview = {
      show: (status) => {
        const preview = buildPreviewResult(status);
        setScanStatus('idle');
        setScanResult(preview.result);
        setLastAttendance(preview.attendance);
        setNotice({ id: Date.now(), status });
      },
      reset: () => {
        setScanStatus('idle');
        setScanResult(null);
        setLastAttendance(null);
        setNotice(null);
      },
    };

    return () => {
      delete window.__scannerPreview;
    };
  }, []);

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
        showToast(error instanceof Error ? error.message : 'Could not load events for scanning.', 'error');
      })
      .finally(() => {
        if (isCurrent) setIsLoadingEvents(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !selectedEventId) {
      setLastAttendance(null);
      return;
    }

    let isCurrent = true;
    setIsLoadingAttendance(true);

    getScannerAttendance(selectedEventId, token)
      .then((result) => {
        if (!isCurrent) return;
        setLastAttendance(result.attendance);
      })
      .catch((error) => {
        if (!isCurrent) return;
        setLastAttendance(null);
        showToast(error instanceof Error ? error.message : 'Could not load event attendance.', 'error');
      })
      .finally(() => {
        if (isCurrent) setIsLoadingAttendance(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedEventId, token]);

  async function handleScan(scanToken: string) {
    if (!token) {
      setScanResult({ status: 'not_found', message: 'Sign in before scanning tickets.' });
      return;
    }

    if (!selectedEventId) {
      setScanResult({ status: 'not_found', message: 'Select an event before scanning tickets.' });
      return;
    }

    setScanStatus('scanning');

    try {
      const result = await scanTicket({ scanToken, eventId: selectedEventId, scannerLabel: user?.email ?? 'local-scanner' }, token);
      setScanResult(result);
      if (result.attendance) setLastAttendance(result.attendance);
      setNotice({ id: Date.now(), status: result.status });
    } finally {
      setScanStatus('idle');
    }
  }

  function openUsageDialog(ticket: UsageActionTicket) {
    setPendingUsageAction({ ticket, nextUsed: !ticket.usedAt });
  }

  async function handleConfirmUsageAction() {
    if (!pendingUsageAction || !token) return;

    setIsSubmitting(true);

    try {
      const result = await updateTicketUsage(pendingUsageAction.ticket.id, { used: pendingUsageAction.nextUsed }, token);

      setScanResult((current) => {
        if (!current?.ticket || current.ticket.id !== result.ticket.id) return current;

        return {
          ...current,
          ticket: {
            ...current.ticket,
            usedAt: result.ticket.usedAt,
          },
        };
      });
      setLastAttendance(result.attendance);
      setPendingUsageAction(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update ticket usage.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  const scannedOrderId = scanResult?.ticket?.orderId ?? '';
  const activeNoticeCopy = notice ? noticeCopy(notice.status) : null;
  const actionLabel = scannedTicket?.usedAt ? 'Undo' : 'Redo';
  const isScanPending = scanStatus === 'scanning';
  const attendanceCountLabel = isLoadingAttendance ? '.../...'
    : attendance ? `${attendance.usedTicketCount}/${attendance.totalTicketCount}` : '-/-';

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
      <section className="scanner-layout">
        {isScanPending ? (
          <div className="scan-notice scan-notice-scanning" role="status" aria-live="polite" aria-label="Checking ticket">
            <div className="scan-notice-icon" aria-hidden="true">
              <ScanPendingIcon />
            </div>
            <div className="scan-notice-copy">
              <strong>QR detected</strong>
              <span>Checking the ticket now.</span>
            </div>
          </div>
        ) : notice && activeNoticeCopy ? (
          <div className={`scan-notice scan-notice-${notice.status}`} role="status" aria-live="polite" aria-label={activeNoticeCopy.iconLabel}>
            <div className="scan-notice-icon" aria-hidden="true">
              <ScanNoticeIcon status={notice.status} />
            </div>
            <div className="scan-notice-copy">
              <strong>{activeNoticeCopy.title}</strong>
              <span>{activeNoticeCopy.detail}</span>
            </div>
          </div>
        ) : null}
        <div className="scanner-frame">
          <video ref={scanner.videoRef} playsInline muted aria-label="Ticket scanner camera" />
          <div className="scanner-reticle" aria-hidden="true" />
        </div>
        <div className="scanner-panel">
          <div className="scanner-controls">
            <button onClick={scanner.isRunning ? scanner.stop : scanner.start}>
              {scanner.isRunning ? 'Stop Camera' : 'Start Camera'}
            </button>
            {scanner.canUseTorch ? (
              <button onClick={scanner.toggleTorch}>{scanner.torchEnabled ? 'Torch Off' : 'Torch On'}</button>
            ) : null}
          </div>
          <div className={`scan-status-card scan-status-${scanResult?.status ?? 'idle'}`}>
            <div className="scan-status-top-row">
              {scannedOrderId || (canManageTicketUsage && scannedTicket) ? (
                <div className="scan-status-actions">
                  {scannedOrderId ? (
                    <button type="button" onClick={() => onViewOrder(scannedOrderId)}>
                      View Ticket
                    </button>
                  ) : null}
                  {canManageTicketUsage && scannedTicket ? (
                    <button disabled={isSubmitting} type="button" onClick={() => openUsageDialog(scannedTicket)}>
                      {actionLabel}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="scan-status-actions" aria-hidden="true" />
              )}
              <div className="scan-ticket-state" aria-label="Current scanned ticket state">
                <strong>{formatTicketState(scannedTicket)}</strong>
                <span>ticket state</span>
              </div>
            </div>
            <p className="status-text">{getStatusMessage(scanResult, scanner.error)}</p>
            {scannedTicket ? (
              <p className="status-text">
                Ticket {scannedTicket.ticketNumber} for {scannedTicket.customerEmail}
              </p>
            ) : null}
          </div>
          <div className="scan-attendance-card" aria-label="Event attendance scan count">
            <label className="scan-attendance-select">
              <select
                aria-label="Event to scan"
                disabled={isLoadingEvents || events.length === 0}
                value={selectedEventId}
                onChange={(event) => {
                  setSelectedEventId(event.target.value);
                  setScanResult(null);
                  setNotice(null);
                }}
              >
                {events.length === 0 ? <option value="">No events</option> : null}
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            <strong>{attendanceCountLabel}</strong>
          </div>
        </div>
        <ActionDialog
          confirmLabel={pendingUsageAction?.nextUsed ? 'Redo' : 'Undo'}
          confirmTone={pendingUsageAction?.nextUsed ? 'default' : 'danger'}
          description={
            pendingUsageAction
              ? pendingUsageAction.nextUsed
                ? `Mark ticket ${pendingUsageAction.ticket.ticketNumber} as used again?`
                : `Mark ticket ${pendingUsageAction.ticket.ticketNumber} as unused and make it scannable again?`
              : ''
          }
          isOpen={Boolean(pendingUsageAction)}
          isSubmitting={isSubmitting}
          title={pendingUsageAction?.nextUsed ? 'Redo Ticket Use' : 'Undo Ticket Use'}
          onClose={() => setPendingUsageAction(null)}
          onConfirm={() => void handleConfirmUsageAction()}
        />
      </section>
      {isSubmitting ? <LoadingOverlay label="Saving ticket status" detail="Updating whether the scanned ticket is used." variant="scanner" /> : null}
    </>
  );
}