export type LoadingSkeletonVariant =
  | 'account'
  | 'auth'
  | 'confirmation'
  | 'email'
  | 'page'
  | 'purchase'
  | 'sales'
  | 'scanner'
  | 'session'
  | 'tickets';

type LoadingOverlayProps = {
  label: string;
  detail?: string;
  variant?: LoadingSkeletonVariant;
};

export default function LoadingOverlay({ label, detail }: LoadingOverlayProps) {
  return (
    <div aria-busy="true" aria-live="polite" aria-label={label} className="loading-overlay" role="status">
      <span aria-hidden="true" className="loading-spinner" />
      <span className="loading-overlay-copy-screenreader">
        <strong>{label}</strong>
        {detail ? <span>{detail}</span> : <span>Loading content.</span>}
      </span>
    </div>
  );
}
