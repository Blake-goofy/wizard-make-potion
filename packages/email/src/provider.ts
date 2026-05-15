import { Resend } from 'resend';

export type EmailProviderName = 'local' | 'resend';

export type EmailMessage = {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
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
  provider: EmailProviderName;
  fromAddress: string;
  fromName: string;
  resendApiKey?: string;
}): EmailProvider {
  const from = `${options.fromName} <${options.fromAddress}>`;

  if (options.provider === 'resend') {
    if (!options.resendApiKey || options.resendApiKey === 're_xxxxxxxxx') {
      throw new Error('Set RESEND_API_KEY_DEV or RESEND_API_KEY_PROD for the active APP_ENV when EMAIL_PROVIDER=resend');
    }

    if (options.fromAddress.toLowerCase().endsWith('.local')) {
      throw new Error('EMAIL_FROM_ADDRESS must be a verified sender or onboarding@resend.dev when EMAIL_PROVIDER=resend');
    }

    const client = new Resend(options.resendApiKey);

    return {
      async send(message) {
        const result = await client.emails.send({
          from,
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

  return {
    async send(message) {
      return { providerMessageId: `local-${message.to}-${Date.now()}` };
    },
  };
}
