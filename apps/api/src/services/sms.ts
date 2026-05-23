import type { PoolClient } from 'pg';
import type { Database } from '@potion/db';
import type { SmsProvider } from './telnyxSmsProvider.js';

type Queryable = Pick<Database, 'query'> | PoolClient;
type SmsKeyword = 'STOP' | 'START' | 'HELP' | 'OTHER';

export type SmsService = ReturnType<typeof createSmsService>;

function runQuery(queryable: Queryable, text: string, values?: unknown[]) {
  return (queryable as { query: (queryText: string, queryValues?: unknown[]) => Promise<{ rowCount?: number }> }).query(text, values);
}

function readComparableDigits(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, '');

  if (digits.length < 10) {
    throw new Error('Inbound SMS phone number is invalid.');
  }

  return digits.slice(-10);
}

function formatE164(phoneNumber: string) {
  const comparableDigits = readComparableDigits(phoneNumber);
  return `+1${comparableDigits}`;
}

function formatStoredPhoneNumber(phoneNumber: string) {
  const comparableDigits = readComparableDigits(phoneNumber);
  return `(${comparableDigits.slice(0, 3)}) ${comparableDigits.slice(3, 6)}-${comparableDigits.slice(6)}`;
}

function readKeyword(messageText: string): SmsKeyword {
  const keyword = messageText.trim().split(/\s+/, 1)[0]?.replace(/[^a-z]/gi, '').toUpperCase();

  if (keyword === 'STOP' || keyword === 'START' || keyword === 'HELP') {
    return keyword;
  }

  return 'OTHER';
}

function buildReplyMessage(keyword: SmsKeyword) {
  switch (keyword) {
    case 'STOP':
      return 'You are unsubscribed from Wizard Make Potion text updates. Reply START to resubscribe or HELP for help.';
    case 'START':
      return 'You are subscribed again to Wizard Make Potion text updates. Reply STOP to unsubscribe or HELP for help.';
    case 'HELP':
      return 'Wizard Make Potion alerts: reply STOP to unsubscribe or START to resubscribe. For help email tickets@wizardmakepotion.com.';
    default:
      return null;
  }
}

async function updateSmsConsent(queryable: Queryable, comparableDigits: string, keyword: SmsKeyword) {
  if (keyword === 'HELP' || keyword === 'OTHER') {
    return;
  }

  if (keyword === 'STOP') {
    await runQuery(queryable,
      `update users
       set sms_opt_in = false,
           sms_consent_at = null,
           sms_opted_out_at = now(),
           updated_at = now()
       where regexp_replace(coalesce(phone_number, ''), '\\D', '', 'g') = $1`,
      [comparableDigits],
    );
    await runQuery(queryable,
      `update orders
       set sms_opt_in = false,
           sms_consent_at = null
       where regexp_replace(coalesce(customer_phone_number, ''), '\\D', '', 'g') = $1`,
      [comparableDigits],
    );
    return;
  }

  await runQuery(queryable,
    `update users
     set sms_opt_in = true,
         sms_consent_at = coalesce(sms_consent_at, now()),
         sms_opted_out_at = null,
         updated_at = now()
     where regexp_replace(coalesce(phone_number, ''), '\\D', '', 'g') = $1`,
    [comparableDigits],
  );
  await runQuery(queryable,
    `update orders
     set sms_opt_in = true,
         sms_consent_at = coalesce(sms_consent_at, now())
     where regexp_replace(coalesce(customer_phone_number, ''), '\\D', '', 'g') = $1`,
    [comparableDigits],
  );
}

export function createSmsService(deps: { db: Database; smsProvider?: SmsProvider | null }) {
  return {
    async queueMessage(message: {
      toPhoneNumber: string;
      messageBody: string;
      fromPhoneNumber?: string | null;
      messageType?: 'transactional' | 'reply';
    }) {
      await deps.db.query(
        `insert into sms_outbox (to_phone, from_phone_number, message_body, message_type, status)
         values ($1, $2, $3, $4, 'pending')`,
        [
          formatE164(message.toPhoneNumber),
          message.fromPhoneNumber ? formatE164(message.fromPhoneNumber) : null,
          message.messageBody,
          message.messageType ?? 'transactional',
        ],
      );
    },

    async handleInboundMessage(event: {
      providerEventId?: string;
      occurredAt?: string;
      fromPhoneNumber: string;
      toPhoneNumber?: string;
      messageText: string;
      rawPayload: unknown;
    }) {
      const comparableDigits = readComparableDigits(event.fromPhoneNumber);
      const fromPhoneNumber = formatE164(event.fromPhoneNumber);
      const toPhoneNumber = event.toPhoneNumber ? formatE164(event.toPhoneNumber) : null;
      const keyword = readKeyword(event.messageText);
      const storedPhoneNumber = formatStoredPhoneNumber(event.fromPhoneNumber);
      const replyMessage = buildReplyMessage(keyword);

      return deps.db.transaction(async (client) => {
        const insertResult = await runQuery(
          client,
          `insert into sms_inbound_events (provider_event_id, from_phone_number, to_phone_number, message_text, keyword, payload, received_at)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7)
           on conflict (provider_event_id) do nothing
           returning id`,
          [
            event.providerEventId ?? null,
            fromPhoneNumber,
            toPhoneNumber,
            event.messageText,
            keyword === 'OTHER' ? null : keyword,
            JSON.stringify(event.rawPayload ?? {}),
            event.occurredAt ?? new Date().toISOString(),
          ],
        );

        if (event.providerEventId && insertResult.rowCount === 0) {
          return { duplicate: true as const, keyword, replyMessage: null };
        }

        if (keyword === 'STOP') {
          await runQuery(
            client,
            `insert into sms_stop_list (phone_number, source, reason, created_at, updated_at)
             values ($1, 'keyword', $2, now(), now())
             on conflict (phone_number) do update
             set reason = excluded.reason,
                 updated_at = now()`,
            [fromPhoneNumber, `Received ${keyword}`],
          );
        }

        if (keyword === 'START') {
          await runQuery(client, `delete from sms_stop_list where phone_number = $1`, [fromPhoneNumber]);
        }

        await updateSmsConsent(client, comparableDigits, keyword);

        if (replyMessage) {
          await runQuery(
            client,
            `insert into sms_outbox (to_phone, from_phone_number, message_body, message_type, status)
             values ($1, $2, $3, 'reply', 'pending')`,
            [fromPhoneNumber, toPhoneNumber, replyMessage],
          );
        }

        return {
          duplicate: false as const,
          keyword,
          replyMessage,
          storedPhoneNumber,
        };
      });
    },

    async processPending() {
      const result = await deps.db.query(
        `select id,
                to_phone as "toPhone",
                from_phone_number as "fromPhoneNumber",
                message_body as "messageBody"
         from sms_outbox
         where status = 'pending'
         order by created_at asc
         limit 10`,
      );

      if (!deps.smsProvider) {
        return { processed: 0, pending: result.rowCount };
      }

      for (const sms of result.rows) {
        try {
          const sent = await deps.smsProvider.send({
            toPhoneNumber: sms.toPhone,
            fromPhoneNumber: sms.fromPhoneNumber,
            messageBody: sms.messageBody,
          });
          await deps.db.query(
            `update sms_outbox
             set status = 'sent', provider_message_id = $2, sent_at = now(), last_error = null
             where id = $1`,
            [sms.id, sent.providerMessageId],
          );
        } catch (error) {
          await deps.db.query(
            `update sms_outbox
             set status = 'failed', last_error = $2
             where id = $1`,
            [sms.id, error instanceof Error ? error.message : 'Unknown SMS error'],
          );
        }
      }

      return { processed: result.rowCount, pending: result.rowCount };
    },
  };
}