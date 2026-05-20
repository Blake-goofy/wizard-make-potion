create table public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_password_reset_codes_email_created_at on public.password_reset_codes(email, created_at desc);
create index idx_password_reset_codes_user_id on public.password_reset_codes(user_id);
create index idx_password_reset_codes_expires_at on public.password_reset_codes(expires_at);

alter table public.password_reset_codes enable row level security;

revoke all on table public.password_reset_codes from anon, authenticated;