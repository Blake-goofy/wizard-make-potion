import type { PoolClient } from 'pg';
import type { Database } from '@potion/db';
import { type EmailAttachment, type EmailProvider, renderTicketEmail } from '@potion/email';
import type { EventRecord, PricingQuote } from '@potion/shared';

type TicketEmailJob = {
  orderId: string;
  customerEmail: string;
  event: EventRecord;
  tickets: Array<{ id: string; ticketNumber: number; scanToken: string; usedAt: string | null }>;
  quote: PricingQuote;
};

export type EmailQueueService = ReturnType<typeof createEmailQueueService>;

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

export function createEmailQueueService(deps: { db: Database; emailProvider: EmailProvider; webOrigin: string }) {
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
        `select id, to_email as "toEmail", subject, html_body as "htmlBody", text_body as "textBody", attachments
         from email_outbox
         where status = 'pending'
         order by created_at asc
         limit 10`,
      );

      for (const email of result.rows) {
        try {
          const sent = await deps.emailProvider.send({
            to: email.toEmail,
            subject: email.subject,
            htmlBody: email.htmlBody,
            textBody: email.textBody,
            attachments: deserializeAttachments(email.attachments),
          });
          await deps.db.query(
            `update email_outbox
             set status = 'sent', provider_message_id = $2, sent_at = now(), last_error = null
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
