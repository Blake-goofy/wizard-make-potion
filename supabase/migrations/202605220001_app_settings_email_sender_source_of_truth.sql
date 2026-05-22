alter table public.app_settings
  alter column email_from_address set default 'onboarding@resend.dev';

update public.app_settings
set email_from_address = 'onboarding@resend.dev',
    updated_at = now()
where email_from_address = 'tickets@wizardmakepotion.local';