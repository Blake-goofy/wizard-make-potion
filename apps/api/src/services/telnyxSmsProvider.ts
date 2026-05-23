export type SmsProvider = {
  send(message: {
    toPhoneNumber: string;
    messageBody: string;
    fromPhoneNumber?: string | null;
  }): Promise<{ providerMessageId: string }>;
};

type TelnyxMessageResponse = {
  data?: {
    id?: string;
  };
  errors?: Array<{ detail?: string; title?: string }>;
};

function readAuthorizationHeader(telnyxApiKey: string) {
  return `Bearer ${telnyxApiKey}`;
}

export function createTelnyxSmsProvider(options: {
  telnyxApiKey: string;
  defaultFromPhoneNumber?: string;
  messagingProfileId?: string;
}): SmsProvider {
  return {
    async send(message) {
      const fromPhoneNumber = message.fromPhoneNumber ?? options.defaultFromPhoneNumber;

      if (!fromPhoneNumber && !options.messagingProfileId) {
        throw new Error('Configure TELNYX_SMS_FROM_NUMBER_* or TELNYX_MESSAGING_PROFILE_ID_* before sending SMS.');
      }

      const response = await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: {
          Authorization: readAuthorizationHeader(options.telnyxApiKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromPhoneNumber,
          messaging_profile_id: options.messagingProfileId,
          to: message.toPhoneNumber,
          text: message.messageBody,
          type: 'SMS',
        }),
      });

      const payload = await response.json() as TelnyxMessageResponse;

      if (!response.ok) {
        const errorMessage = payload.errors?.[0]?.detail ?? payload.errors?.[0]?.title ?? `Telnyx SMS failed with status ${response.status}.`;
        throw new Error(errorMessage);
      }

      if (!payload.data?.id) {
        throw new Error('Telnyx did not return a message id.');
      }

      return { providerMessageId: payload.data.id };
    },
  };
}