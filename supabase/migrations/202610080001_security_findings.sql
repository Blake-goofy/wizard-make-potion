create table public.security_rate_limits (
  bucket integer primary key check (bucket >= 0 and bucket < 16384),
  count bigint not null,
  reset_at timestamptz not null
);
alter table public.security_rate_limits enable row level security;
revoke all on public.security_rate_limits from anon, authenticated;

alter table public.users add column session_version integer not null default 0;
alter table public.email_outbox add column encrypted_body text;
alter table public.sms_outbox add column delivery_updated_at timestamptz;
alter table public.sms_outbox add column inbound_event_id text;

create function public.sms_phone(phone text) returns text
language sql immutable strict parallel safe
set search_path = public
as $$
  select case
    when digits ~ '^[0-9]{10}$' and btrim(phone) not like '+%' then '+1' || digits
    when digits ~ '^1[0-9]{10}$' then '+' || digits
    else null
  end
  from (select regexp_replace(phone, '\D', '', 'g') as digits) normalized;
$$;
create index idx_sms_inbound_phone_received on public.sms_inbound_events(from_phone_number, received_at);
create index idx_sms_outbox_reply_event on public.sms_outbox(inbound_event_id) where inbound_event_id is not null;

-- Retire authentication codes and their legacy plaintext delivery jobs.
update public.account_verification_codes set consumed_at = now() where consumed_at is null;
update public.password_reset_codes set consumed_at = now() where consumed_at is null;
delete from public.email_outbox where order_id is null;
