type FieldActionButtonsProps = {
  label: string;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function FieldActionButtons({ label, disabled, onCancel, onConfirm }: FieldActionButtonsProps) {
  return (
    <div className="field-editor-actions">
      <button aria-label={`Revert ${label}`} className="field-editor-button" disabled={disabled} type="button" onClick={onCancel}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6 18 18" />
          <path d="M18 6 6 18" />
        </svg>
      </button>
      <button aria-label={`Save ${label}`} className="field-editor-button field-editor-button-confirm" disabled={disabled} type="button" onClick={onConfirm}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 12 4.2 4.2L19 6.8" />
        </svg>
      </button>
    </div>
  );
}