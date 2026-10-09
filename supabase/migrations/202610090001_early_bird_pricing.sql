alter table events
  add column early_bird_price_cents integer,
  add column early_bird_ends_at timestamptz,
  add constraint events_early_bird_pricing_check check (
    (early_bird_price_cents is null and early_bird_ends_at is null)
    or (
      early_bird_price_cents is not null
      and early_bird_ends_at is not null
      and early_bird_price_cents >= 0
      and early_bird_price_cents < ticket_price_cents
      and early_bird_ends_at < starts_at
    )
  );
