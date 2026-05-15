import { useState } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import { getEmailOutbox, processEmailOutbox, type EmailOutboxItem } from '../lib/api';

type EmailOutboxPageProps = {
  token: string;
};

export default function EmailOutboxPage({ token }: EmailOutboxPageProps) {
  const [emails, setEmails] = useState<EmailOutboxItem[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState('');
  const [message, setMessage] = useState('Sign in with an admin account to preview the local outbox.');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  async function loadOutbox() {
    setIsLoading(true);

    try {
      const result = await getEmailOutbox(token);
      setEmails(result.emails);
      setSelectedEmailId((current) => current || result.emails[0]?.id || '');
      setMessage(`${result.emails.length} email records loaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load email outbox.');
    } finally {
      setIsLoading(false);
    }
  }

  async function processOutbox() {
    setIsProcessing(true);

    try {
      const result = await processEmailOutbox(token);
      setMessage(`Processed ${result.processed} pending email record(s).`);
      await loadOutbox();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not process email outbox.');
    } finally {
      setIsProcessing(false);
    }
  }

  const selectedEmail = emails.find((email) => email.id === selectedEmailId) ?? emails[0] ?? null;

  return (
    <>
    <section className="content-panel">
      <div className="panel-header-row">
        <div>
          <h1>Email Outbox</h1>
          <p className="status-text">Preview queued email messages and delivery state.</p>
        </div>
        <div className="action-row">
          <button type="button" disabled={isLoading || isProcessing} onClick={loadOutbox}>
            Load Outbox
          </button>
          <button type="button" disabled={isLoading || isProcessing} onClick={processOutbox}>
            Process Pending
          </button>
        </div>
      </div>
      <p className="status-text">{message}</p>
      <div className="split-panel">
        <div className="table-list">
        {emails.map((email) => (
          <article
            className={email.id === selectedEmail?.id ? 'is-selected' : ''}
            key={email.id}
            onClick={() => setSelectedEmailId(email.id)}
          >
            <div className="ticket-card-header">
              <strong>{email.subject}</strong>
              <span>{email.status}</span>
            </div>
            <span>{email.toEmail}</span>
            <span>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(email.createdAt))}</span>
          </article>
        ))}
        </div>
        {selectedEmail ? (
          <article className="email-preview">
            <div className="info-grid">
              <article>
                <span>To</span>
                <strong>{selectedEmail.toEmail}</strong>
              </article>
              <article>
                <span>Status</span>
                <strong>{selectedEmail.status}</strong>
              </article>
              <article>
                <span>Order</span>
                <strong>{selectedEmail.orderId ?? 'No order linked'}</strong>
              </article>
            </div>
            {selectedEmail.lastError ? <p className="status-text">{selectedEmail.lastError}</p> : null}
            <label>
              Text body
              <textarea readOnly value={selectedEmail.textBody} />
            </label>
          </article>
        ) : (
          <article className="email-preview">
            <p className="status-text">Select an email to preview it.</p>
          </article>
        )}
      </div>
    </section>
    {isLoading || isProcessing ? (
      <LoadingOverlay
        label={isProcessing ? 'Processing email outbox' : 'Loading email outbox'}
        detail={isProcessing ? 'Sending pending records and refreshing the queue.' : 'Fetching the latest local email records.'}
        variant="email"
      />
    ) : null}
    </>
  );
}
