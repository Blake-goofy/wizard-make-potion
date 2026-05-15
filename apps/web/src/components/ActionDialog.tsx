type ActionDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  isOpen: boolean;
  isSubmitting: boolean;
  confirmTone?: 'default' | 'danger';
  onClose: () => void;
  onConfirm: () => void;
};

export default function ActionDialog({
  title,
  description,
  confirmLabel,
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
          <p>{description}</p>
        </div>
        <div className="action-row">
          <button disabled={isSubmitting} type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className={confirmTone === 'danger' ? 'danger-button' : undefined}
            disabled={isSubmitting}
            type="button"
            onClick={onConfirm}
          >
            {isSubmitting ? 'Saving' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}