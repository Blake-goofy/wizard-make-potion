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

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <span className={`loading-skeleton-block ${className}`.trim()} />;
}

function SkeletonHeader({ headingClassName = '' }: { headingClassName?: string }) {
  return (
    <div className="loading-skeleton-header">
      <SkeletonBlock className="loading-skeleton-eyebrow" />
      <SkeletonBlock className={`loading-skeleton-heading ${headingClassName}`.trim()} />
      <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-medium" />
    </div>
  );
}

function FieldSkeleton() {
  return (
    <label className="loading-skeleton-field">
      <SkeletonBlock className="loading-skeleton-label" />
      <SkeletonBlock className="loading-skeleton-input" />
    </label>
  );
}

function PurchaseSkeleton() {
  return (
    <div className="loading-layout loading-layout-purchase">
      <section className="loading-region loading-purchase-summary">
        <SkeletonHeader headingClassName="loading-skeleton-heading-large" />
        <SkeletonBlock className="loading-skeleton-line" />
        <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-short" />
        <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-medium" />
      </section>
      <section className="loading-region loading-purchase-form">
        <div className="loading-skeleton-price-row">
          <SkeletonBlock className="loading-skeleton-label" />
          <SkeletonBlock className="loading-skeleton-total" />
        </div>
        <FieldSkeleton />
        <FieldSkeleton />
        <SkeletonBlock className="loading-skeleton-button" />
      </section>
    </div>
  );
}

function AuthSkeleton() {
  return (
    <div className="loading-layout loading-layout-form-page">
      <section className="loading-region">
        <SkeletonHeader />
        <div className="loading-skeleton-segmented">
          <SkeletonBlock />
          <SkeletonBlock />
        </div>
        <FieldSkeleton />
        <FieldSkeleton />
        <SkeletonBlock className="loading-skeleton-button" />
      </section>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="loading-layout loading-layout-form-page">
      <section className="loading-region">
        <SkeletonHeader />
        <div className="loading-skeleton-card-grid">
          <div className="loading-skeleton-card-small">
            <SkeletonBlock className="loading-skeleton-label" />
            <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-medium" />
          </div>
          <div className="loading-skeleton-card-small">
            <SkeletonBlock className="loading-skeleton-label" />
            <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-medium" />
          </div>
        </div>
        <FieldSkeleton />
        <SkeletonBlock className="loading-skeleton-button loading-skeleton-button-short" />
        <div className="loading-skeleton-danger-zone">
          <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-short" />
          <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-medium" />
        </div>
      </section>
    </div>
  );
}

function TableRows({ rows = 5, sales = false }: { rows?: number; sales?: boolean }) {
  return (
    <div className="loading-skeleton-table-body">
      {Array.from({ length: rows }, (_, index) => (
        <div className="loading-skeleton-table-row" key={index}>
          <SkeletonBlock className="loading-skeleton-table-primary" />
          <SkeletonBlock className="loading-skeleton-table-value" />
          <SkeletonBlock className={sales ? 'loading-skeleton-status-pill' : 'loading-skeleton-table-count'} />
        </div>
      ))}
    </div>
  );
}

function TicketsSkeleton() {
  return (
    <div className="loading-layout loading-layout-table-page">
      <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-medium" />
      <section className="loading-region loading-skeleton-table-shell">
        <div className="loading-skeleton-table-row loading-skeleton-table-head">
          <SkeletonBlock className="loading-skeleton-table-primary" />
          <SkeletonBlock className="loading-skeleton-table-value" />
          <SkeletonBlock className="loading-skeleton-table-count" />
        </div>
        <TableRows rows={4} />
      </section>
    </div>
  );
}

function SalesSkeleton() {
  return (
    <div className="loading-layout loading-layout-table-page">
      <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-short" />
      <section className="loading-region loading-skeleton-table-shell">
        <div className="loading-skeleton-table-row loading-skeleton-table-head">
          <SkeletonBlock className="loading-skeleton-filter-button" />
          <SkeletonBlock className="loading-skeleton-table-value" />
          <SkeletonBlock className="loading-skeleton-filter-button loading-skeleton-filter-button-small" />
        </div>
        <TableRows rows={6} sales />
        <div className="loading-skeleton-summary-grid">
          <SkeletonBlock className="loading-skeleton-summary-cell" />
          <SkeletonBlock className="loading-skeleton-summary-cell" />
          <SkeletonBlock className="loading-skeleton-summary-cell" />
        </div>
      </section>
    </div>
  );
}

function ConfirmationSkeleton() {
  return (
    <div className="loading-layout loading-layout-confirmation">
      <section className="loading-region">
        <SkeletonHeader headingClassName="loading-skeleton-heading-large" />
        <SkeletonBlock className="loading-skeleton-line" />
        <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-medium" />
        <div className="loading-skeleton-ticket-grid">
          <div className="loading-skeleton-ticket-card">
            <SkeletonBlock className="loading-skeleton-label" />
            <SkeletonBlock className="loading-skeleton-qr" />
            <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-short" />
          </div>
          <div className="loading-skeleton-ticket-card">
            <SkeletonBlock className="loading-skeleton-label" />
            <SkeletonBlock className="loading-skeleton-qr" />
            <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-short" />
          </div>
        </div>
        <div className="loading-skeleton-summary-row">
          <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-short" />
          <SkeletonBlock className="loading-skeleton-total" />
        </div>
      </section>
    </div>
  );
}

function ScannerSkeleton() {
  return (
    <div className="loading-layout loading-layout-scanner">
      <SkeletonBlock className="loading-skeleton-camera" />
      <div className="loading-skeleton-controls">
        <SkeletonBlock className="loading-skeleton-button" />
        <SkeletonBlock className="loading-skeleton-button" />
      </div>
      <section className="loading-region loading-skeleton-scan-card">
        <div>
          <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-medium" />
          <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-short" />
        </div>
        <SkeletonBlock className="loading-skeleton-scan-state" />
      </section>
      <section className="loading-region loading-skeleton-attendance-card">
        <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-short" />
        <SkeletonBlock className="loading-skeleton-total" />
      </section>
    </div>
  );
}

function EmailSkeleton() {
  return (
    <div className="loading-layout loading-layout-email">
      <section className="loading-region">
        <div className="loading-skeleton-panel-header-row">
          <SkeletonHeader />
          <div className="loading-skeleton-actions">
            <SkeletonBlock className="loading-skeleton-button loading-skeleton-button-short" />
            <SkeletonBlock className="loading-skeleton-button loading-skeleton-button-short" />
          </div>
        </div>
        <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-medium" />
        <div className="loading-skeleton-split-panel">
          <div className="loading-skeleton-list">
            <SkeletonBlock className="loading-skeleton-list-card" />
            <SkeletonBlock className="loading-skeleton-list-card" />
            <SkeletonBlock className="loading-skeleton-list-card" />
          </div>
          <div className="loading-skeleton-preview">
            <div className="loading-skeleton-card-grid loading-skeleton-card-grid-three">
              <SkeletonBlock className="loading-skeleton-card-small" />
              <SkeletonBlock className="loading-skeleton-card-small" />
              <SkeletonBlock className="loading-skeleton-card-small" />
            </div>
            <SkeletonBlock className="loading-skeleton-textarea" />
          </div>
        </div>
      </section>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="loading-layout loading-layout-form-page">
      <section className="loading-region">
        <SkeletonHeader />
        <SkeletonBlock className="loading-skeleton-line" />
        <SkeletonBlock className="loading-skeleton-line loading-skeleton-line-medium" />
        <div className="loading-skeleton-card-grid">
          <SkeletonBlock className="loading-skeleton-card-small" />
          <SkeletonBlock className="loading-skeleton-card-small" />
        </div>
      </section>
    </div>
  );
}

function renderSkeleton(variant: LoadingSkeletonVariant) {
  if (variant === 'purchase') return <PurchaseSkeleton />;
  if (variant === 'auth') return <AuthSkeleton />;
  if (variant === 'account') return <AccountSkeleton />;
  if (variant === 'tickets') return <TicketsSkeleton />;
  if (variant === 'sales') return <SalesSkeleton />;
  if (variant === 'confirmation') return <ConfirmationSkeleton />;
  if (variant === 'scanner') return <ScannerSkeleton />;
  if (variant === 'email') return <EmailSkeleton />;
  return <PageSkeleton />;
}

export default function LoadingOverlay({ label, detail, variant = 'page' }: LoadingOverlayProps) {
  return (
    <div aria-busy="true" aria-live="polite" aria-label={label} className="loading-overlay" role="status">
      <div className={`loading-overlay-panel loading-overlay-panel-${variant}`}>
        <div aria-hidden="true">{renderSkeleton(variant)}</div>
        <div className="loading-overlay-copy loading-overlay-copy-screenreader">
          <strong>{label}</strong>
          {detail ? <span>{detail}</span> : <span>Loading content.</span>}
        </div>
      </div>
    </div>
  );
}