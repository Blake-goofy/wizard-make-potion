import type { PoolClient } from 'pg';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Database } from '@potion/db';
import { type EmailAttachment, type EmailProvider, renderTicketEmail } from '@potion/email';
import type { EventRecord, PricingQuote } from '@potion/shared';
import type { AppSettingsService } from './appSettings.js';

type TicketEmailJob = {
  orderId: string;
  customerEmail: string;
  event: EventRecord;
  tickets: Array<{ id: string; ticketNumber: number; scanToken: string; usedAt: string | null }>;
  quote: PricingQuote;
};

export type EmailQueueService = ReturnType<typeof createEmailQueueService>;

export function encryptAuthEmail(email: { htmlBody: string; textBody: string }, secret: string) {
  const iv = randomBytes(12);
  const key = createHash('sha256').update(`auth-email:${secret}`).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(email), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptAuthEmail(value: string, secret: string): { htmlBody: string; textBody: string } {
  const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !ciphertext) throw new Error('Invalid encrypted email.');
  const key = createHash('sha256').update(`auth-email:${secret}`).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
}

type StoredEmailAttachment = {
  filename: string;
  contentBase64: string;
  contentType: string;
  contentId?: string;
};

function createOrderConfirmationUrl(webOrigin: string, orderId: string) {
  const url = new URL(webOrigin);
  url.searchParams.set('order', orderId);
  return url.toString();
}

function serializeAttachments(attachments: EmailAttachment[] = []): StoredEmailAttachment[] {
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    contentBase64: attachment.content.toString('base64'),
    contentType: attachment.contentType,
    contentId: attachment.contentId,
  }));
}

function deserializeAttachments(value: unknown): EmailAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((attachment) => {
    if (
      typeof attachment !== 'object' ||
      attachment === null ||
      !('filename' in attachment) ||
      !('contentBase64' in attachment) ||
      !('contentType' in attachment) ||
      typeof attachment.filename !== 'string' ||
      typeof attachment.contentBase64 !== 'string' ||
      typeof attachment.contentType !== 'string'
    ) {
      return [];
    }

    return [{
      filename: attachment.filename,
      content: Buffer.from(attachment.contentBase64, 'base64'),
      contentType: attachment.contentType,
      contentId: 'contentId' in attachment && typeof attachment.contentId === 'string' ? attachment.contentId : undefined,
    }];
  });
}

export function createEmailQueueService(deps: { db: Database; appSettings: AppSettingsService; emailProvider: EmailProvider; webOrigin: string; authSessionSecret: string }) {
  return {
    async enqueueTicketEmail(client: PoolClient, job: TicketEmailJob) {
      const email = await renderTicketEmail({
        ...job,
        orderConfirmationUrl: createOrderConfirmationUrl(deps.webOrigin, job.orderId),
      });
      await client.query(
        `insert into email_outbox (order_id, to_email, subject, html_body, text_body, attachments, status)
         values ($1, $2, $3, $4, $5, $6, 'pending')`,
        [job.orderId, job.customerEmail, email.subject, email.htmlBody, email.textBody, JSON.stringify(serializeAttachments(email.attachments))],
      );
    },

    async processPending() {
      const result = await deps.db.query(
        `select id, to_email as "toEmail", subject, html_body as "htmlBody", text_body as "textBody", attachments, encrypted_body as "encryptedBody"
         from email_outbox
         where status = 'pending'
         order by created_at asc
         limit 10`,
      );
      const emailSettings = await deps.appSettings.getEmailSettings();

      for (const email of result.rows) {
        try {
          const sent = await deps.emailProvider.send({
            to: email.toEmail,
            subject: email.subject,
            ...(email.encryptedBody ? decryptAuthEmail(email.encryptedBody, deps.authSessionSecret) : { htmlBody: email.htmlBody, textBody: email.textBody }),
            fromAddress: emailSettings.emailFromAddress,
            fromName: emailSettings.emailFromName,
            attachments: deserializeAttachments(email.attachments),
          });
          await deps.db.query(
            `update email_outbox
             set status = 'sent', provider_message_id = $2, sent_at = now(), last_error = null, encrypted_body = null
             where id = $1`,
            [email.id, sent.providerMessageId],
          );
        } catch (error) {
          await deps.db.query(
            `update email_outbox set status = 'failed', last_error = $2 where id = $1`,
            [email.id, error instanceof Error ? error.message : 'Unknown email error'],
          );
        }
      }

      return { processed: result.rowCount };
    },
  };
}
