import type { Database } from '@potion/db';
import type { SmsService } from './sms.js';
import { normalizeSmsPhone } from './phoneNumbers.js';

type SmsMessageStatus = 'draft' | 'sent' | 'cancelled';
type SmsMessageType = 'reminder' | 'upcoming_event' | 'admin' | 'test';
type SmsMessageInputStatus = 'draft' | 'sent';

type SmsMessageRow = {
  id: string;
  eventId: string | null;
  messageType: SmsMessageType;
  label: string;
  messageBody: string;
  testPhoneNumber: string | null;
  status: SmsMessageStatus;
  recipientCount: number | null;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SmsMessageService = ReturnType<typeof createSmsMessageService>;

function formatE164(phoneNumber: string) {
  return normalizeSmsPhone(phoneNumber);
}

function parseMessageRow(row: SmsMessageRow) {
  return row;
}

async function insertOutboxRows(db: Database, messageType: SmsMessageType, rows: Array<{ toPhone: string; messageBody: string }>) {
  for (const row of rows) {
    await db.query(
      `insert into sms_outbox (to_phone, message_body, message_type, status)
       values ($1, $2, $3, 'pending')`,
      [row.toPhone, row.messageBody, messageType],
    );
  }
}

export function createSmsMessageService(deps: { db: Database; sms: SmsService }) {
  async function processMessages(result: Awaited<ReturnType<typeof deps.db.query<Pick<SmsMessageRow, 'id' | 'eventId' | 'messageType' | 'messageBody' | 'testPhoneNumber'>>>>) {
    let queuedMessages = 0;

    for (const message of result.rows) {
      let recipients: Array<{ toPhone: string; messageBody: string }> = [];

      if (message.messageType === 'reminder') {
        const recipientsResult = await deps.db.query<{ phoneNumber: string }>(
          `select distinct on (sms_phone(u.phone_number)) u.phone_number as "phoneNumber"
           from users u
           where u.is_active = true and u.sms_opt_in = true and u.phone_verified_at is not null
             and sms_phone(u.phone_number) is not null
             and exists (
               select 1 from orders o where o.event_id = $1 and o.status = 'completed' and o.sms_opt_in = true
                 and lower(o.customer_email) = lower(u.email)
                 and sms_phone(o.customer_phone_number) = sms_phone(u.phone_number)
             )
             and not exists (select 1 from sms_stop_list sl where sms_phone(sl.phone_number) = sms_phone(u.phone_number))
           order by sms_phone(u.phone_number), u.phone_number`,
          [message.eventId],
        );

        recipients = recipientsResult.rows
          .map((row) => formatE164(row.phoneNumber))
          .filter((phoneNumber) => phoneNumber.length > 0)
          .map((phoneNumber) => ({ toPhone: phoneNumber, messageBody: message.messageBody }));
      } else if (message.messageType === 'upcoming_event') {
        const recipientsResult = await deps.db.query<{ phoneNumber: string }>(
          `select distinct on (sms_phone(phone_number)) phone_number as "phoneNumber"
           from users
           where is_active = true and sms_opt_in = true and phone_verified_at is not null
             and sms_phone(phone_number) is not null
             and not exists (select 1 from sms_stop_list sl where sms_phone(sl.phone_number) = sms_phone(users.phone_number))
           order by sms_phone(phone_number), phone_number`,
        );

        recipients = recipientsResult.rows
          .map((row) => formatE164(row.phoneNumber))
          .filter((phoneNumber) => phoneNumber.length > 0)
          .map((phoneNumber) => ({ toPhone: phoneNumber, messageBody: message.messageBody }));
      } else if (message.messageType === 'admin') {
        const recipientsResult = await deps.db.query<{ phoneNumber: string }>(
          `select distinct on (sms_phone(phone_number)) phone_number as "phoneNumber"
           from users
           where is_active = true and role = 'admin' and sms_opt_in = true and phone_verified_at is not null
             and sms_phone(phone_number) is not null
             and not exists (select 1 from sms_stop_list sl where sms_phone(sl.phone_number) = sms_phone(users.phone_number))
           order by sms_phone(phone_number), phone_number`,
        );

        recipients = recipientsResult.rows
          .map((row) => formatE164(row.phoneNumber))
          .filter((phoneNumber) => phoneNumber.length > 0)
          .map((phoneNumber) => ({ toPhone: phoneNumber, messageBody: message.messageBody }));
      } else if (message.testPhoneNumber) {
        const phoneNumber = formatE164(message.testPhoneNumber);
        recipients = phoneNumber ? [{ toPhone: phoneNumber, messageBody: message.messageBody }] : [];
      }

      await insertOutboxRows(deps.db, message.messageType, recipients);
      queuedMessages += recipients.length;

      await deps.db.query(
        `update sms_messages
         set status = 'sent',
             sent_at = now(),
             recipient_count = $2,
             last_error = null,
             updated_at = now()
         where id = $1`,
        [message.id, recipients.length],
      );
    }

    const delivery = await deps.sms.processPending();
    return {
      processedMessages: result.rowCount,
      queuedMessages,
      delivery,
    };
  }

  return {
    async listMessages(eventId: string | null = null) {
      const result = await deps.db.query<SmsMessageRow>(
        `select id,
                event_id as "eventId",
                message_type as "messageType",
                label,
                message_body as "messageBody",
                test_phone_number as "testPhoneNumber",
                status,
                recipient_count as "recipientCount",
                sent_at as "sentAt",
                last_error as "lastError",
                created_at as "createdAt",
                updated_at as "updatedAt"
         from sms_messages
         where ($1::uuid is null or event_id = $1 or (message_type <> 'reminder' and $1::uuid is not null))
         order by updated_at desc, created_at desc`,
        [eventId],
      );

      return result.rows.map(parseMessageRow);
    },

    async createMessage(input: {
      eventId?: string | null;
      messageType: SmsMessageType;
      label: string;
      messageBody: string;
      testPhoneNumber?: string | null;
      status: SmsMessageInputStatus;
    }) {
      const result = await deps.db.query<SmsMessageRow>(
        `insert into sms_messages (event_id, message_type, label, message_body, test_phone_number, status)
         values ($1, $2, $3, $4, $5, $6)
         returning id,
                   event_id as "eventId",
                   message_type as "messageType",
                   label,
                   message_body as "messageBody",
                   test_phone_number as "testPhoneNumber",
                   status,
                   recipient_count as "recipientCount",
                   sent_at as "sentAt",
                   last_error as "lastError",
                   created_at as "createdAt",
                   updated_at as "updatedAt"`,
        [input.eventId ?? null, input.messageType, input.label, input.messageBody, input.testPhoneNumber ?? null, input.status],
      );

      const message = result.rows[0];
      if (!message) {
        throw new Error('SMS message could not be created.');
      }

      return parseMessageRow(message);
    },

    async updateMessage(messageId: string, input: {
      eventId?: string | null;
      messageType: SmsMessageType;
      label: string;
      messageBody: string;
      testPhoneNumber?: string | null;
      status: SmsMessageInputStatus;
    }) {
      const result = await deps.db.query<SmsMessageRow>(
        `update sms_messages
         set event_id = $2,
             message_type = $3,
             label = $4,
             message_body = $5,
             test_phone_number = $6,
             status = $7,
             updated_at = now()
         where id = $1
         returning id,
                   event_id as "eventId",
                   message_type as "messageType",
                   label,
                   message_body as "messageBody",
                   test_phone_number as "testPhoneNumber",
                   status,
                   recipient_count as "recipientCount",
                   sent_at as "sentAt",
                   last_error as "lastError",
                   created_at as "createdAt",
                   updated_at as "updatedAt"`,
        [messageId, input.eventId ?? null, input.messageType, input.label, input.messageBody, input.testPhoneNumber ?? null, input.status],
      );

      const message = result.rows[0];
      if (!message) {
        throw Object.assign(new Error('SMS message was not found.'), { statusCode: 404 });
      }

      return parseMessageRow(message);
    },

    async sendMessageNow(messageId: string) {
      const result = await deps.db.query<Pick<SmsMessageRow, 'id' | 'eventId' | 'messageType' | 'messageBody' | 'testPhoneNumber'>>(
        `select id,
                event_id as "eventId",
                message_type as "messageType",
                message_body as "messageBody",
                test_phone_number as "testPhoneNumber"
         from sms_messages
         where id = $1
         limit 1`,
        [messageId],
      );

      if (!result.rows[0]) {
        throw Object.assign(new Error('SMS message was not found.'), { statusCode: 404 });
      }

      return processMessages(result);
    },
  };
}
