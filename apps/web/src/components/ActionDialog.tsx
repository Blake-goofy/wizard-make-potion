import type { ReactNode } from 'react';

type ActionDialogProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  submittingLabel?: string;
  isOpen: boolean;
  isSubmitting: boolean;
  confirmTone?: 'default' | 'danger';
  onClose: () => void;
  onConfirm: () => void;
};

export default function ActionDialog({
  title,
  description,
  children,
  confirmLabel,
  submittingLabel = 'Saving',
  isOpen,
  isSubmitting,
  confirmTone = 'default',
  onClose,
  onConfirm,
}: ActionDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => (!isSubmitting ? onClose() : null)}>
      <div
        aria-labelledby="action-dialog-title"
        aria-modal="true"
        className="modal-panel"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-panel-copy">
          <h2 id="action-dialog-title">{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {children ? children : null}
        <div className="action-row">
          <button disabled={isSubmitting} type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className={confirmTone === 'danger' ? 'danger-button' : 'primary-button'}
            disabled={isSubmitting}
            type="button"
            onClick={onConfirm}
          >
            {isSubmitting ? submittingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}