alter table public.app_settings
  alter column theme_background_color set default '#000000',
  alter column theme_text_color set default '#FEFEFE',
  alter column theme_accent_color set default '#FC0101';

update public.app_settings
set theme_background_color = '#000000',
    theme_text_color = '#FEFEFE',
    theme_accent_color = '#FC0101',
    updated_at = now()
where lower(theme_background_color) = '#312a53'
  and lower(theme_text_color) = '#fff8f0'
  and lower(theme_accent_color) = '#f39442'
  and lower(theme_danger_color) = '#ff8f97'
  and lower(theme_success_color) = '#7fd4a5'
  and lower(theme_warning_color) = '#f3c36b';
