import type { PoolClient } from 'pg';
import type { Database } from '@potion/db';
import type { SmsProvider } from './telnyxSmsProvider.js';
import { normalizeSmsPhone } from './phoneNumbers.js';

type Queryable = Pick<Database, 'query'> | PoolClient;
type SmsKeyword = 'STOP' | 'START' | 'HELP' | 'OTHER';

export type SmsService = ReturnType<typeof createSmsService>;

function runQuery(queryable: Queryable, text: string, values?: unknown[]) {
  return (queryable as { query: (queryText: string, queryValues?: unknown[]) => Promise<{ rowCount?: number }> }).query(text, values);
}

function readComparableDigits(phoneNumber: string) {
  return normalizeSmsPhone(phoneNumber).slice(2);
}

const formatE164 = normalizeSmsPhone;

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
       where sms_phone(phone_number) = '+1' || $1`,
      [comparableDigits],
    );
    await runQuery(queryable,
      `update orders
       set sms_opt_in = false,
           sms_consent_at = null
       where sms_phone(customer_phone_number) = '+1' || $1`,
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
     where sms_phone(phone_number) = '+1' || $1`,
    [comparableDigits],
  );
  await runQuery(queryable,
    `update orders
     set sms_opt_in = true,
         sms_consent_at = coalesce(sms_consent_at, now())
     where sms_phone(customer_phone_number) = '+1' || $1`,
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
      if (!event.providerEventId) throw Object.assign(new Error('SMS event id is required.'), { statusCode: 400 });
      const comparableDigits = readComparableDigits(event.fromPhoneNumber);
      const fromPhoneNumber = formatE164(event.fromPhoneNumber);
      const toPhoneNumber = event.toPhoneNumber ? formatE164(event.toPhoneNumber) : null;
      const keyword = readKeyword(event.messageText);
      const storedPhoneNumber = formatStoredPhoneNumber(event.fromPhoneNumber);
      const replyMessage = buildReplyMessage(keyword);

      return deps.db.transaction(async (client) => {
        // ponytail: per-phone transaction lock orders consent changes and reply quotas across API replicas.
        await runQuery(client, `select pg_advisory_xact_lock(hashtextextended($1, 0))`, [fromPhoneNumber]);
        const insertResult = await runQuery(
          client,
          `insert into sms_inbound_events (provider_event_id, from_phone_number, to_phone_number, message_text, keyword, payload, received_at)
           values ($1, $2, $3, $4, $5, $6::jsonb, now())
           on conflict (provider_event_id) do nothing
           returning id`,
          [
            event.providerEventId ?? null,
            fromPhoneNumber,
            toPhoneNumber,
            event.messageText,
            keyword === 'OTHER' ? null : keyword,
            JSON.stringify(event.rawPayload ?? {}),
          ],
        );

        if (event.providerEventId && insertResult.rowCount === 0) {
          return { duplicate: true as const, keyword, replyMessage: null };
        }

        if (keyword === 'STOP') {
          await runQuery(client, `update sms_outbox set status = 'failed', last_error = 'Recipient opted out.' where status = 'pending' and message_type <> 'reply' and sms_phone(to_phone) = $1`, [fromPhoneNumber]);
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
          await runQuery(client, `delete from sms_stop_list where sms_phone(phone_number) = $1`, [fromPhoneNumber]);
        }

        await updateSmsConsent(client, comparableDigits, keyword);

        await runQuery(client, `select pg_advisory_xact_lock(hashtextextended('sms-reply-quota', 0))`);
        const replyQuota = await client.query<{ count: number; total: number }>(
          `select count(*)::int as count,
                  (select count(*)::int from sms_outbox where message_type = 'reply' and created_at > now() - interval '15 minutes') as total
           from sms_inbound_events where from_phone_number = $1 and keyword is not null and received_at > now() - interval '15 minutes'`,
          [fromPhoneNumber],
        );
        if (replyMessage && (replyQuota.rows[0]?.count ?? 4) <= 3 && (replyQuota.rows[0]?.total ?? 100) < 100) {
          await runQuery(
            client,
            `insert into sms_outbox (to_phone, from_phone_number, message_body, inbound_event_id, message_type, status)
             values ($1, $2, $3, $4, 'reply', 'pending')`,
            [fromPhoneNumber, toPhoneNumber, replyMessage, event.providerEventId],
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

    async recordDeliveryStatus(event: {
      providerMessageId: string;
      status: 'delivered' | 'failed';
      occurredAt?: string;
      errorMessage?: string | null;
    }) {
      const result = await deps.db.query(
        `update sms_outbox
         set status = $2,
             delivered_at = case when $2 = 'delivered' then $3::timestamptz else null end,
             last_error = $4,
             delivery_updated_at = $3::timestamptz
         where provider_message_id = $1
           and status <> 'delivered'
           and (delivery_updated_at is null or delivery_updated_at < $3::timestamptz)`,
        [
          event.providerMessageId,
          event.status,
          event.occurredAt ?? new Date().toISOString(),
          event.errorMessage ?? null,
        ],
      );

      return { updated: (result.rowCount ?? 0) > 0 };
    },

    async processPending(replyEventId?: string) {
      const result = await deps.db.query(
        `select id,
                to_phone as "toPhone",
                from_phone_number as "fromPhoneNumber",
                message_body as "messageBody", message_type as "messageType"
         from sms_outbox
         where status = 'pending'
           and ($1::text is null or (message_type = 'reply' and inbound_event_id = $1))
         order by created_at asc
         limit 10`,
        [replyEventId ?? null],
      );

      if (!deps.smsProvider) {
        return { processed: 0, pending: result.rowCount };
      }

      for (const sms of result.rows) {
        await deps.db.transaction(async (client) => {
          // ponytail: hold the per-phone lock through provider acceptance (10s timeout); STOP then suppresses every unsent job.
          await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [sms.toPhone]);
          const pending = await client.query(`select id from sms_outbox where id = $1 and status = 'pending' for update`, [sms.id]);
          if (!pending.rowCount) return;
          try {
            if (sms.messageType !== 'reply') {
              const suppression = await client.query(
                `select 1 from sms_stop_list where sms_phone(phone_number) = sms_phone($1)
                 union all
                 select 1 where $2::text in ('reminder', 'upcoming_event', 'admin') and not exists (
                   select 1 from users where is_active = true and sms_opt_in = true and phone_verified_at is not null
                     and sms_phone(phone_number) = sms_phone($1)
                     and ($2 <> 'admin' or role = 'admin')
                 )
                 limit 1`, [sms.toPhone, sms.messageType],
              );
              if (suppression.rowCount) {
                await client.query(`update sms_outbox set status = 'failed', last_error = 'Recipient opted out or no longer eligible.' where id = $1`, [sms.id]);
                return;
              }
            }
            const sent = await deps.smsProvider!.send({
              toPhoneNumber: sms.toPhone,
              fromPhoneNumber: sms.fromPhoneNumber,
              messageBody: sms.messageBody,
            });
            await client.query(
              `update sms_outbox
               set status = 'accepted', provider_message_id = $2, accepted_at = now(), last_error = null
               where id = $1`,
              [sms.id, sent.providerMessageId],
            );
          } catch (error) {
            await client.query(
              `update sms_outbox set status = 'failed', last_error = $2 where id = $1`,
              [sms.id, error instanceof Error ? error.message : 'Unknown SMS error'],
            );
          }
        });
      }

      return { processed: result.rowCount, pending: result.rowCount };
    },
  };
}
