alter table public.orders
  add column checkout_idempotency_key text;

alter table public.orders
  add constraint orders_checkout_idempotency_key_unique unique (checkout_idempotency_key);