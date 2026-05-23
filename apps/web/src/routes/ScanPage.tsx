import { useEffect, useRef, useState } from 'react';
import type { ScanEventAttendance, ScanTicketResult, SessionUser } from '@potion/shared';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastRegion from '../components/ToastRegion';
import { useToast } from '../hooks/useToast';
import { getScannerAttendance, getScannerEvents, getScannerSettings, markTicketGroupArrived, scanTicket, type EventView } from '../lib/api';
import { useQrScanner } from '../hooks/useQrScanner';

const defaultScanDebounceMs = 3000;

type PreviewScanStatus = ScanTicketResult['status'];
type UsageActionTicket = NonNullable<ScanTicketResult['ticket']>;

type ScanNotice = {
  id: number;
  status: PreviewScanStatus;
};

type FeedbackTone = 'success' | 'failure';

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

function vibrateOnDetection() {
  navigator.vibrate?.(35);
}

function playToneSequence(context: AudioContext, tone: FeedbackTone) {
  const steps = tone === 'success'
    ? [
        { frequency: 880, duration: 0.08, gain: 0.05 },
        { frequency: 1174, duration: 0.12, gain: 0.045 },
      ]
    : [
        { frequency: 320, duration: 0.12, gain: 0.055 },
        { frequency: 220, duration: 0.18, gain: 0.05 },
      ];

  let startAt = context.currentTime;

  for (const step of steps) {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = tone === 'success' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(step.frequency, startAt);

    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.linearRampToValueAtTime(step.gain, startAt + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + step.duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + step.duration);

    startAt += step.duration + 0.04;
  }
}

function toneForStatus(status: PreviewScanStatus): FeedbackTone {
  return status === 'valid' ? 'success' : 'failure';
}

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
        customerName: 'Blake Becker',
        orderUsedTicketCount: status === 'valid' ? 1 : 2,
        orderTicketCount: 3,
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

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 8.5A1.5 1.5 0 0 1 6.5 7h2.35l1.1-1.6A1.5 1.5 0 0 1 11.18 4h1.64a1.5 1.5 0 0 1 1.23.64L15.15 7h2.35A1.5 1.5 0 0 1 19 8.5v8A1.5 1.5 0 0 1 17.5 18h-11A1.5 1.5 0 0 1 5 16.5Z" />
      <circle cx="12" cy="12.5" r="3.25" />
    </svg>
  );
}

function FlashlightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {/* Body: narrower top, flared bottom */}
      <path d="M9.5 3h5l1.5 5H8Z" />
      <rect x="8" y="8" width="8" height="9" rx="1" />
      {/* Lens ring at bottom of body */}
      <path d="M8 17h8" />
      {/* Light rays fanning out below */}
      <path d="M12 20v2.5" />
      <path d="M9.2 19.5 7.5 21.3" />
      <path d="M14.8 19.5l1.7 1.8" />
      <path d="M7.5 18l-2.2 1" />
      <path d="M16.5 18l2.2 1" />
    </svg>
  );
}

type ScanPanelState = 'used' | 'unused' | 'not-found' | 'ready' | 'scanning';

function formatRelativeScanTime(lastScannedAt: number, now: number) {
  const elapsedSeconds = Math.max(0, Math.floor((now - lastScannedAt) / 1000));

  if (elapsedSeconds < 10) return 'Scanned just now';
  if (elapsedSeconds < 60) return `Scanned ${elapsedSeconds} seconds ago`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  if (elapsedMinutes === 1) return 'Scanned 1 minute ago';
  if (elapsedMinutes < 60) return `Scanned ${elapsedMinutes} minutes ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours === 1) return 'Scanned 1 hour ago';
  if (elapsedHours < 24) return `Scanned ${elapsedHours} hours ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);

  if (elapsedDays === 1) return 'Scanned 1 day ago';
  return `Scanned ${elapsedDays} days ago`;
}

function getScanPanelState(isScanPending: boolean, scanResult: ScanTicketResult | null, scannedTicket: UsageActionTicket | null): ScanPanelState {
  if (isScanPending) return 'scanning';
  if (!scanResult) return 'ready';
  if (scanResult.status === 'not_found') return 'not-found';
  return scannedTicket?.usedAt ? 'used' : 'unused';
}

function getScanPanelStatusLabel(panelState: ScanPanelState) {
  if (panelState === 'used') return 'Used';
  if (panelState === 'unused') return 'Unused';
  if (panelState === 'not-found') return 'Not found';
  if (panelState === 'scanning') return 'Scanning';
  return 'Ready';
}

function getScanHeadline(lastScannedAt: number | null, now: number, isScanPending: boolean, scannerError: string | null) {
  if (isScanPending) return 'Scanning now';
  if (scannerError) return 'Scanner unavailable';
  if (lastScannedAt) return formatRelativeScanTime(lastScannedAt, now);
  return 'Ready to scan';
}

function ScanStatusGlyph({ state }: { state: ScanPanelState }) {
  if (state === 'scanning') {
    return <span aria-hidden="true" className="scan-notice-spinner" />;
  }

  if (state === 'used') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v5" />
        <circle cx="12" cy="15.5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (state === 'unused') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10" />
        <path d="m7.5 12.5 3 3 6-7" />
      </svg>
    );
  }

  if (state === 'not-found') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10" />
        <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

type ScanPageProps = {
  token: string;
  user: SessionUser | null;
  onViewOrder: (orderId: string) => void;
};

export default function ScanPage({ token, user, onViewOrder }: ScanPageProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [scanResult, setScanResult] = useState<ScanTicketResult | null>(null);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(null);
  const [scanTimeNow, setScanTimeNow] = useState(() => Date.now());
  const [events, setEvents] = useState<EventView[]>([]);
  const [scanDebounceMs, setScanDebounceMs] = useState(defaultScanDebounceMs);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [lastAttendance, setLastAttendance] = useState<ScanEventAttendance | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning'>('idle');
  const [notice, setNotice] = useState<ScanNotice | null>(null);
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
  const scanner = useQrScanner({ onScan: handleScan, cooldownMs: scanDebounceMs });
  const scannedTicket = scanResult?.ticket ?? null;
  const attendance = scanResult?.attendance ?? lastAttendance;
  const canManageTicketUsage = Boolean(token && (user?.role === 'admin' || user?.role === 'scanner') && scannedTicket);

  function getAudioContext() {
    if (typeof window === 'undefined' || !window.AudioContext) return null;

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new window.AudioContext();
    }

    return audioContextRef.current;
  }

  async function primeAudioFeedback() {
    const context = getAudioContext();
    if (!context || context.state !== 'suspended') return;

    try {
      await context.resume();
    } catch {
      return;
    }
  }

  function playResultFeedback(status: PreviewScanStatus) {
    const context = getAudioContext();
    if (!context || context.state !== 'running') return;

    playToneSequence(context, toneForStatus(status));
  }

  function presentScanResult(result: ScanTicketResult, attendanceOverride?: ScanEventAttendance | null) {
    setScanResult(result);
    setLastScannedAt(Date.now());

    const nextAttendance = attendanceOverride === undefined ? result.attendance : attendanceOverride;
    if (nextAttendance) setLastAttendance(nextAttendance);

    setNotice({ id: Date.now(), status: result.status });
    playResultFeedback(result.status);
  }

  async function handleCameraToggle() {
    if (scanner.isRunning) {
      scanner.stop();
      return;
    }

    await primeAudioFeedback();
    await scanner.start();
  }

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
    if (!lastScannedAt) return;

    setScanTimeNow(Date.now());

    const intervalId = window.setInterval(() => {
      setScanTimeNow(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [lastScannedAt]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    window.__scannerPreview = {
      show: (status) => {
        const preview = buildPreviewResult(status);
        setScanStatus('idle');
        presentScanResult(preview.result, preview.attendance);
      },
      reset: () => {
        setScanStatus('idle');
        setScanResult(null);
        setLastScannedAt(null);
        setLastAttendance(null);
        setNotice(null);
      },
    };

    return () => {
      delete window.__scannerPreview;
    };
  }, []);

  useEffect(() => () => {
    const context = audioContextRef.current;
    audioContextRef.current = null;

    if (!context || context.state === 'closed') return;
    void context.close();
  }, []);

  useEffect(() => {
    if (!token) return;

    let isCurrent = true;

    getScannerSettings(token)
      .then((result) => {
        if (!isCurrent) return;
        setScanDebounceMs(result.settings.scanDebounceMs);
      })
      .catch(() => {
        if (!isCurrent) return;
        setScanDebounceMs(defaultScanDebounceMs);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

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
    vibrateOnDetection();

    if (!token) {
      presentScanResult({ status: 'not_found', message: 'Sign in before scanning tickets.' });
      return;
    }

    if (!selectedEventId) {
      presentScanResult({ status: 'not_found', message: 'Select an event before scanning tickets.' });
      return;
    }

    setScanStatus('scanning');

    try {
      const result = await scanTicket({ scanToken, eventId: selectedEventId, scannerLabel: user?.email ?? 'local-scanner' }, token);
      presentScanResult(result);
    } finally {
      setScanStatus('idle');
    }
  }

  async function handleGroupArrival() {
    if (!token || !scannedTicket) return;

    setIsSubmitting(true);

    try {
      const result = await markTicketGroupArrived(scannedTicket.id, token);

      setScanResult((current) => {
        if (!current?.ticket || current.ticket.id !== result.ticket.id) return current;

        return {
          ...current,
          ticket: result.ticket,
        };
      });
      setLastAttendance(result.attendance);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not mark the group as arrived.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  const scannedOrderId = scanResult?.ticket?.orderId ?? '';
  const activeNoticeCopy = notice ? noticeCopy(notice.status) : null;
  const isScanPending = scanStatus === 'scanning';
  const scanPanelState = getScanPanelState(isScanPending, scanResult, scannedTicket);
  const scanHeadline = getScanHeadline(lastScannedAt, scanTimeNow, isScanPending, scanner.error);
  const orderArrivalCount = scannedTicket ? `${scannedTicket.orderUsedTicketCount}/${scannedTicket.orderTicketCount}` : '';
  const canMarkGroupArrived = Boolean(
    canManageTicketUsage
      && scannedTicket
      && scannedTicket.orderUsedTicketCount < scannedTicket.orderTicketCount,
  );
  const isViewTicketDisabled = !scannedOrderId || isSubmitting;
  const isMarkGroupArrivedDisabled = !canMarkGroupArrived || isSubmitting;
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
        <div className="scanner-frame">
          <video ref={scanner.videoRef} playsInline muted aria-label="Ticket scanner camera" />
          <div className="scanner-reticle" aria-hidden="true" />
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
        </div>
        <div className="scanner-panel">
          <div className="scanner-controls">
            <button
              className={`scanner-control-button${scanner.isRunning ? '' : ' primary-button'}`}
              onClick={() => void handleCameraToggle()}
              type="button"
            >
              <CameraIcon />
              <span>{scanner.isRunning ? 'Stop Camera' : 'Start Camera'}</span>
            </button>
            {scanner.canUseTorch ? (
              <button className="scanner-control-button" onClick={scanner.toggleTorch} type="button">
                <FlashlightIcon />
                <span>{scanner.torchEnabled ? 'Torch Off' : 'Torch On'}</span>
              </button>
            ) : null}
          </div>
          <div className={`scan-status-card scan-status-${scanResult?.status ?? 'idle'}`}>
            <div className="scan-status-header">
              <div className="scan-status-copy">
                <strong className="scan-status-headline">{scanHeadline}</strong>
                <div className="scan-status-actions">
                  <button
                    className={`scan-status-action-button${isMarkGroupArrivedDisabled ? ' is-disabled' : ''}`}
                    disabled={isMarkGroupArrivedDisabled}
                    type="button"
                    onClick={() => void handleGroupArrival()}
                  >
                    Mark Group Arrived
                  </button>
                  <button
                    className={`scan-status-action-button scan-status-action-button-secondary${isViewTicketDisabled ? ' is-disabled' : ''}`}
                    disabled={isViewTicketDisabled}
                    type="button"
                    onClick={() => onViewOrder(scannedOrderId)}
                  >
                    View Ticket
                  </button>
                </div>
              </div>
              <div className={`scan-status-indicator is-${scanPanelState}`} aria-label={`Ticket status ${getScanPanelStatusLabel(scanPanelState)}`}>
                <div className="scan-status-glyph" aria-hidden="true">
                  <ScanStatusGlyph state={scanPanelState} />
                </div>
                <span>{getScanPanelStatusLabel(scanPanelState)}</span>
                {orderArrivalCount ? <strong className="scan-status-count">{orderArrivalCount}</strong> : null}
              </div>
            </div>
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
                  setLastScannedAt(null);
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
      </section>
      {isSubmitting ? <LoadingOverlay label="Saving arrival status" detail="Updating ticket arrival for the scanned order." variant="scanner" /> : null}
    </>
  );
}