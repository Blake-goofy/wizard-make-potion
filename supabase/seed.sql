-- Supabase runs seeds after local db reset; production db push only applies migrations.
update public.users
set is_active = true
where email in ('admin@wizardmakepotion.local', 'scanner@wizardmakepotion.local')
  and password_hash = 'pbkdf2$sha256$310000$bG9jYWwtZGV2LWFkbWluLXNhbHQtMjAyNg$ZLrlgXYN15HsuGCpw3NL1c117cFq0L3IFzeaDdg9ehA';
