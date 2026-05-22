import { Resend } from 'resend';

export type EmailMessage = {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  fromAddress?: string;
  fromName?: string;
  attachments?: EmailAttachment[];
};

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  contentId?: string;
};

export type EmailProvider = {
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
};

export function createEmailProvider(options: {
  defaultFromAddress?: string;
  defaultFromName?: string;
  resendApiKey?: string;
}): EmailProvider {
  const defaultFromAddress = options.defaultFromAddress ?? 'onboarding@resend.dev';
  const defaultFromName = options.defaultFromName ?? 'Wizard Make Potion Tickets';

  if (!options.resendApiKey || options.resendApiKey === 're_xxxxxxxxx') {
    throw new Error('Set RESEND_API_KEY_DEV or RESEND_API_KEY_PROD for the active APP_ENV before starting the API');
  }

  const client = new Resend(options.resendApiKey);

  return {
    async send(message) {
      const fromAddress = message.fromAddress ?? defaultFromAddress;
      const fromName = message.fromName ?? defaultFromName;

      if (fromAddress.toLowerCase().endsWith('.local')) {
        throw new Error('email_from_address in app settings must be a verified sender or onboarding@resend.dev when using Resend');
      }

      const result = await client.emails.send({
        from: `${fromName} <${fromAddress}>`,
        to: message.to,
        subject: message.subject,
        html: message.htmlBody,
        text: message.textBody,
        attachments: message.attachments,
      });

      if (result.error) {
        throw new Error(`Resend email failed: ${result.error.message}`);
      }

      if (!result.data?.id) {
        throw new Error('Resend did not return a message id.');
      }

      return { providerMessageId: result.data.id };
    },
  };
}
