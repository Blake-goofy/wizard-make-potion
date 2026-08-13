alter table public.account_verification_codes
  drop column event_reminder_opt_in,
  drop column upcoming_events_opt_in;

alter table public.orders
  drop column event_reminder_opt_in,
  drop column upcoming_events_opt_in;

alter table public.users
  drop column event_reminder_opt_in,
  drop column upcoming_events_opt_in;
