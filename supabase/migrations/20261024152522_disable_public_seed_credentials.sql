-- Public development credentials must never grant access after production migrations.
update public.users
set is_active = false, session_version = session_version + 1
where is_active
  and password_hash = 'pbkdf2$sha256$310000$bG9jYWwtZGV2LWFkbWluLXNhbHQtMjAyNg$ZLrlgXYN15HsuGCpw3NL1c117cFq0L3IFzeaDdg9ehA';
