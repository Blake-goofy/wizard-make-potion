create extension if not exists pgcrypto;

create table public.app_settings (
  id boolean primary key default true,
  event_expiry_buffer_minutes integer not null default 360,
  scan_debounce_ms integer not null default 3000,
  email_from_address text not null default 'info@wizardmakepotion.com',
  email_from_name text not null default 'Wizard Make Potion',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_single_row check (id = true)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  starts_at timestamptz not null,
  address text not null,
  description text,
  ticket_price_cents integer not null check (ticket_price_cents >= 0),
  tax_rate_bps integer not null default 900 check (tax_rate_bps >= 0),
  min_tickets_per_order integer not null default 1 check (min_tickets_per_order > 0),
  max_tickets_per_order integer not null default 10 check (max_tickets_per_order >= min_tickets_per_order),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  customer_email text not null,
  customer_name text,
  customer_phone_number text,
  event_reminder_opt_in boolean not null default false,
  upcoming_events_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  sms_consent_at timestamptz,
  quantity integer not null check (quantity > 0),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  status text not null check (status in ('pending', 'completed', 'cancelled', 'refunded')),
  payment_provider text not null default 'dev',
  payment_provider_reference text not null,
  checkout_idempotency_key text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint orders_checkout_idempotency_key_unique unique (checkout_idempotency_key),
  unique (payment_provider, payment_provider_reference),
  constraint orders_completed_requires_timestamp check (status <> 'completed' or completed_at is not null)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  scan_token text not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.scan_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete set null,
  scan_token text not null,
  result text not null check (result in ('valid', 'already_used', 'not_found', 'manually_used', 'manually_unused')),
  scanner_label text,
  created_at timestamptz not null default now()
);

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  to_email text not null,
  subject text not null,
  html_body text not null,
  text_body text not null,
  attachments jsonb not null default '[]'::jsonb,
  status text not null check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  to_phone text not null,
  from_phone_number text,
  message_body text not null,
  message_type text not null check (message_type in ('transactional', 'reminder', 'upcoming_event', 'admin', 'test', 'reply')),
  status text not null check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.sms_inbound_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text unique,
  from_phone_number text not null,
  to_phone_number text,
  message_text text not null,
  keyword text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create table public.sms_stop_list (
  phone_number text primary key,
  source text not null default 'keyword',
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  message_type text not null check (message_type in ('reminder', 'upcoming_event', 'admin', 'test')),
  label text not null,
  message_body text not null,
  test_phone_number text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'cancelled')),
  recipient_count integer,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_messages_reminder_requires_event check (message_type <> 'reminder' or event_id is not null),
  constraint sms_messages_test_requires_phone check (message_type <> 'test' or test_phone_number is not null),
  constraint sms_messages_non_test_phone check (message_type = 'test' or test_phone_number is null)
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  role text not null default 'customer' check (role in ('customer', 'scanner', 'admin')),
  password_hash text not null,
  phone_number text,
  event_reminder_opt_in boolean not null default false,
  upcoming_events_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  sms_consent_at timestamptz,
  sms_opted_out_at timestamptz,
  phone_verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  phone_number text,
  password_hash text not null,
  event_reminder_opt_in boolean not null default false,
  upcoming_events_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  sms_consent_at timestamptz,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.phone_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  phone_number text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_events_starts_at on public.events(starts_at);
create index idx_orders_event_id on public.orders(event_id);
create index idx_orders_customer_email on public.orders(customer_email);
create index idx_orders_status_created_at on public.orders(status, created_at desc);
create index idx_orders_sms_opt_in on public.orders(sms_opt_in) where sms_opt_in = true;
create index idx_tickets_order_id on public.tickets(order_id);
create index idx_tickets_used_at on public.tickets(used_at);
create index idx_scan_events_ticket_id on public.scan_events(ticket_id);
create index idx_scan_events_created_at on public.scan_events(created_at desc);
create index idx_email_outbox_status_created_at on public.email_outbox(status, created_at);
create index idx_sms_outbox_status_created_at on public.sms_outbox(status, created_at);
create index idx_sms_inbound_events_received_at on public.sms_inbound_events(received_at desc);
create index idx_sms_messages_status_updated_at on public.sms_messages(status, updated_at desc);
create index idx_sms_messages_event_id on public.sms_messages(event_id);
create index idx_users_email on public.users(email);
create index idx_users_role on public.users(role);
create index idx_users_sms_opt_in on public.users(sms_opt_in) where sms_opt_in = true;
create index idx_account_verification_codes_email_created_at on public.account_verification_codes(email, created_at desc);
create index idx_account_verification_codes_expires_at on public.account_verification_codes(expires_at);
create index idx_password_reset_codes_email_created_at on public.password_reset_codes(email, created_at desc);
create index idx_password_reset_codes_user_id on public.password_reset_codes(user_id);
create index idx_password_reset_codes_expires_at on public.password_reset_codes(expires_at);
create index idx_phone_verification_codes_user_id_created_at on public.phone_verification_codes(user_id, created_at desc);
create index idx_phone_verification_codes_expires_at on public.phone_verification_codes(expires_at);

alter table public.app_settings enable row level security;
alter table public.events enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;
alter table public.scan_events enable row level security;
alter table public.email_outbox enable row level security;
alter table public.sms_outbox enable row level security;
alter table public.sms_inbound_events enable row level security;
alter table public.sms_stop_list enable row level security;
alter table public.sms_messages enable row level security;
alter table public.users enable row level security;
alter table public.account_verification_codes enable row level security;
alter table public.password_reset_codes enable row level security;
alter table public.phone_verification_codes enable row level security;

revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.tickets from anon, authenticated;
revoke all on table public.scan_events from anon, authenticated;
revoke all on table public.email_outbox from anon, authenticated;
revoke all on table public.sms_outbox from anon, authenticated;
revoke all on table public.sms_inbound_events from anon, authenticated;
revoke all on table public.sms_stop_list from anon, authenticated;
revoke all on table public.sms_messages from anon, authenticated;
revoke all on table public.users from anon, authenticated;
revoke all on table public.account_verification_codes from anon, authenticated;
revoke all on table public.password_reset_codes from anon, authenticated;
revoke all on table public.phone_verification_codes from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

insert into public.app_settings (id) values (true)
on conflict (id) do nothing;

insert into public.events (
  slug,
  name,
  starts_at,
  address,
  description,
  ticket_price_cents,
  tax_rate_bps,
  min_tickets_per_order,
  max_tickets_per_order,
  is_active
) values (
  'local-potion-night',
  'Test Event Name',
  '2026-10-10 19:00:00-04',
  '1001 E rd, Edmond Ok',
  'A local development event for testing ticket purchase, email, and scanning flows.',
  1200,
  900,
  1,
  10,
  false
);

insert into public.users (email, display_name, phone_number, role, password_hash)
values (
  'admin@wizardmakepotion.local',
  'Local Admin',
  'admin',
  'pbkdf2$sha256$310000$bG9jYWwtZGV2LWFkbWluLXNhbHQtMjAyNg$ZLrlgXYN15HsuGCpw3NL1c117cFq0L3IFzeaDdg9ehA'
),
(
  'scanner@wizardmakepotion.local',
  'Scanner User',
  'scanner',
  'pbkdf2$sha256$310000$bG9jYWwtZGV2LWFkbWluLXNhbHQtMjAyNg$ZLrlgXYN15HsuGCpw3NL1c117cFq0L3IFzeaDdg9ehA'
),
(
  'blake13becker@gmail.com',
  'Blake Becker',
  'admin',
  'pbkdf2$sha256$310000$bG9jYWwtZGV2LWFkbWluLXNhbHQtMjAyNg$ZLrlgXYN15HsuGCpw3NL1c117cFq0L3IFzeaDdg9ehA'
)
on conflict (email) do nothing;