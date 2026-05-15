import { formatCents, type EventRecord, type PricingQuote } from '@potion/shared';
import QRCode from 'qrcode';
import type { EmailAttachment } from '../provider.js';

type TicketEmailInput = {
  orderId: string;
  orderConfirmationUrl: string;
  customerEmail: string;
  event: EventRecord;
  tickets: Array<{ ticketNumber: number; scanToken: string; usedAt: string | null }>;
  quote: PricingQuote;
};

export type AccountVerificationEmailInput = {
  code: string;
};

export function renderAccountVerificationEmail(input: AccountVerificationEmailInput) {
  return {
    subject: 'Your Wizard Make Potion verification code',
    htmlBody: `
      <main>
        <h1>Verify your account</h1>
        <p>Your verification code is <strong>${escapeHtml(input.code)}</strong>.</p>
        <p>This code expires in 15 minutes.</p>
      </main>
    `,
    textBody: `Your Wizard Make Potion verification code is ${input.code}. This code expires in 15 minutes.`,
  };
}

export async function renderTicketEmail(input: TicketEmailInput) {
  const attachments: EmailAttachment[] = [];
  const ticketRows = await Promise.all(
    input.tickets.map(async (ticket) => {
      const qrContentId = `ticket-${ticket.ticketNumber}-qr-${input.orderId}@wizardmakepotion`;
      const qrCodeImage = await QRCode.toBuffer(ticket.scanToken, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 220,
        color: {
          dark: '#17131c',
          light: '#ffffff',
        },
      });
      attachments.push({
        filename: `ticket-${ticket.ticketNumber}-qr.png`,
        content: qrCodeImage,
        contentType: 'image/png',
        contentId: qrContentId,
      });

      return `
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 24px 0; width: auto; border: 1px solid #d8d1df; border-radius: 8px; border-collapse: separate;">
          <tr>
            <td style="padding: 16px;">
              <p style="margin: 0 0 8px; font-weight: 700;">Ticket ${ticket.ticketNumber}</p>
              <img src="cid:${escapeHtml(qrContentId)}" alt="Ticket QR code" width="220" height="220" style="display: block; width: 220px; max-width: 100%; height: auto;" />
            </td>
          </tr>
        </table>
      `;
    }),
  );

  const subject = `Tickets for ${input.event.name}`;
  const startsAt = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(input.event.startsAt),
  );
  const htmlBody = `
    <main style="font-family: Arial, sans-serif; color: #17131c; line-height: 1.5;">
      <h1 style="margin: 0 0 16px; font-size: 28px;">${escapeHtml(input.event.name)}</h1>
      <p style="margin: 0 0 8px;">${escapeHtml(startsAt)}</p>
      <p style="margin: 0 0 8px;">${escapeHtml(input.event.address)}</p>
      <p style="margin: 0 0 8px;">${input.quote.quantity} ticket${input.quote.quantity === 1 ? '' : 's'} purchased</p>
      <p style="margin: 0 0 8px;">Total paid: ${formatCents(input.quote.totalCents)}</p>
      <p style="margin: 16px 0 24px;"><a href="${escapeHtml(input.orderConfirmationUrl)}" style="color: #4b256f; font-weight: 700;">View order confirmation</a></p>
      ${ticketRows.join('')}
      <p style="margin: 24px 0 0;">Sent to ${escapeHtml(input.customerEmail)}</p>
    </main>
  `;
  const textBody = [
    input.event.name,
    startsAt,
    input.event.address,
    `${input.quote.quantity} ticket${input.quote.quantity === 1 ? '' : 's'} purchased`,
    `Total paid: ${formatCents(input.quote.totalCents)}`,
    `Order confirmation: ${input.orderConfirmationUrl}`,
    ...input.tickets.map((ticket) => `Ticket ${ticket.ticketNumber}`),
    `Sent to ${input.customerEmail}`,
  ].join('\n');

  return { subject, htmlBody, textBody, attachments };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#039;',
      '"': '&quot;',
    };
    return replacements[character] ?? character;
  });
}
