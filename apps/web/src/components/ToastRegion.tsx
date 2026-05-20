import type { TouchEventHandler } from 'react';

export type ToastTone = 'success' | 'error';

type ToastRegionProps = {
  message: string;
  tone: ToastTone;
  version: number;
  isClosing: boolean;
  onDismiss: () => void;
  onTouchStart: TouchEventHandler<HTMLDivElement>;
  onTouchEnd: TouchEventHandler<HTMLDivElement>;
  onTouchCancel: () => void;
};

export default function ToastRegion({
  message,
  tone,
  version,
  isClosing,
  onDismiss,
  onTouchStart,
  onTouchEnd,
  onTouchCancel,
}: ToastRegionProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="toast-stack" aria-live="assertive" aria-atomic="true">
      <div
        key={version}
        className={`toast-message ${tone === 'error' ? 'toast-message-error' : 'toast-message-success'}${isClosing ? ' toast-message-closing' : ''}`}
        role="alert"
        onClick={onDismiss}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        {message}
      </div>
    </div>
  );
}