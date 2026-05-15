create extension if not exists pgcrypto;

create table public.app_settings (
  id boolean primary key default true,
  default_tax_rate_bps integer not null default 900,
  event_expiry_buffer_minutes integer not null default 360,
  scan_debounce_ms integer not null default 3000,
  email_from_address text not null default 'tickets@wizardmakepotion.local',
  email_from_name text not null default 'Wizard Make Potion Tickets',
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
  quantity integer not null check (quantity > 0),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  status text not null check (status in ('pending', 'completed', 'cancelled', 'refunded')),
  payment_provider text not null default 'dev',
  payment_provider_reference text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
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

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  role text not null default 'customer' check (role in ('customer', 'scanner', 'admin')),
  password_hash text not null,
  phone_number text,
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
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_events_starts_at on public.events(starts_at);
create index idx_orders_event_id on public.orders(event_id);
create index idx_orders_customer_email on public.orders(customer_email);
create index idx_orders_status_created_at on public.orders(status, created_at desc);
create index idx_tickets_order_id on public.tickets(order_id);
create index idx_tickets_used_at on public.tickets(used_at);
create index idx_scan_events_ticket_id on public.scan_events(ticket_id);
create index idx_scan_events_created_at on public.scan_events(created_at desc);
create index idx_email_outbox_status_created_at on public.email_outbox(status, created_at);
create index idx_users_email on public.users(email);
create index idx_users_role on public.users(role);
create index idx_account_verification_codes_email_created_at on public.account_verification_codes(email, created_at desc);
create index idx_account_verification_codes_expires_at on public.account_verification_codes(expires_at);

alter table public.app_settings enable row level security;
alter table public.events enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;
alter table public.scan_events enable row level security;
alter table public.email_outbox enable row level security;
alter table public.users enable row level security;
alter table public.account_verification_codes enable row level security;

revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.tickets from anon, authenticated;
revoke all on table public.scan_events from anon, authenticated;
revoke all on table public.email_outbox from anon, authenticated;
revoke all on table public.users from anon, authenticated;
revoke all on table public.account_verification_codes from anon, authenticated;
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
  'Wizard Make Potion Night',
  '2026-10-31 19:00:00-04',
  '123 Cauldron Lane, Local Dev',
  'A local development event for testing ticket purchase, email, and scanning flows.',
  2500,
  900,
  1,
  10,
  true
);

insert into public.users (email, display_name, role, password_hash)
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
  'Blake',
  'scanner',
  'pbkdf2$sha256$310000$Od2S2FyOjgG43ZwmPCogHw$f2uFW1NwKwSRJv2sWhTwfFK7Mab0JRIfpGEm9pa34xQ'
)
on conflict (email) do nothing;