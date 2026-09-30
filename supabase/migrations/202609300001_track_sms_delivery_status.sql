alter table public.sms_outbox
  rename column sent_at to accepted_at;

alter table public.sms_outbox
  add column delivered_at timestamptz;

alter table public.sms_outbox
  drop constraint sms_outbox_status_check;

update public.sms_outbox
set status = 'accepted'
where status = 'sent';

alter table public.sms_outbox
  add constraint sms_outbox_status_check
  check (status in ('pending', 'accepted', 'delivered', 'failed'));

create unique index idx_sms_outbox_provider_message_id
  on public.sms_outbox(provider_message_id)
  where provider_message_id is not null;
