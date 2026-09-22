alter table public.app_settings
  add column theme_background_color text not null default '#312a53',
  add column theme_text_color text not null default '#fff8f0',
  add column theme_accent_color text not null default '#f39442',
  add column theme_danger_color text not null default '#ff8f97',
  add column theme_success_color text not null default '#7fd4a5',
  add column theme_warning_color text not null default '#f3c36b',
  add constraint app_settings_theme_background_color_hex check (theme_background_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint app_settings_theme_text_color_hex check (theme_text_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint app_settings_theme_accent_color_hex check (theme_accent_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint app_settings_theme_danger_color_hex check (theme_danger_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint app_settings_theme_success_color_hex check (theme_success_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint app_settings_theme_warning_color_hex check (theme_warning_color ~ '^#[0-9a-fA-F]{6}$');
