create table public.event_images (
  event_id uuid primary key references public.events(id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  image_data bytea not null,
  updated_at timestamptz not null default now()
);

alter table public.event_images enable row level security;
revoke all on table public.event_images from anon, authenticated;
