# Agent Guidance

This repo is the primary Wizard Make Potion codebase. Use environment configuration to target local development or production. Keep secrets out of git and in deployment-specific environment files or secret stores.

## Architecture Rules

- Keep exactly one backend: `apps/api`.
- Do not add Cloudflare Worker code, D1 code, or a second server surface.
- Keep `wizard-make-potion-archive` as local reference only. Do not import from it or copy its visual styling.
- Use Supabase local migrations as the database source of truth.
- The browser should call `apps/api` for ticket, order, scanner, and admin operations.
- Shared request and response contracts live in `packages/shared`.
- Email provider logic lives in `packages/email`; delivery goes through Resend.

## UI Rules

- Build mobile-first and performance-first.
- Keep scanner and admin code lazy-loaded from the public purchase route.
- Centralize colors in `apps/web/src/styles/tokens.css`.
- Do not add raw component-level color literals when a semantic token exists.
- Do not use emoji in visible UI, transactional emails, or admin screens.
- Prefer simple custom vectors where visual marks are appropriate.
- Keep motion minimal and avoid decorative animation that costs mobile performance.

## Scanner Rules

- Request camera access only after explicit user action.
- Prefer `BarcodeDetector` when available and lazy-load `jsQR` as fallback.
- Use the environment-facing camera by default.
- Clean up camera streams on route changes and tab visibility changes.
- Backend scan validation must be idempotent; browser debounce is only a convenience.
- Keep a dev/admin manual token input for fallback testing.

## Local Development

- Use `.env.local` for local secrets and keys.
- Use `APP_ENV=development|production` to select dev or production Stripe and Resend settings from `.env.local`.
- Use `DATABASE_URL_DEV` for local Supabase Postgres and `DATABASE_URL_PROD` for production Postgres; Supabase URL and API keys are not used by the app today.
- Do not commit `.env.local` or production credentials.
- `npm run dev:db` starts local Supabase.
- `npm run db:reset` reapplies the schema from migrations.
- `npm run dev` starts the API and web app.
