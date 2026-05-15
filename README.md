# Wizard Make Potion

Primary codebase for the Wizard Make Potion ticketing site. This repository supports local development and production from environment configuration.

## Goals

- One TypeScript backend in `apps/api`.
- Mobile-first React frontend in `apps/web`.
- Supabase Postgres with local migrations and deployment-specific connection strings.
- Resend-ready email with local outbox support for development and stage-specific provider credentials.
- Fast public pages with scanner and admin code lazy-loaded.
- Central theme tokens instead of scattered color values.
- No emoji in the website or emails.

The `wizard-make-potion-archive` folder is intentionally ignored by git and kept only as a local reference.

## First Run

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy local environment values:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   Runtime behavior is controlled by `NODE_ENV`, while provider selection is controlled by `APP_ENV`:

   - `NODE_ENV=development|test|production` keeps standard Node and bundler behavior.
   - `APP_ENV=development|production` selects app-mode provider settings from `.env.local`.
   - `APP_ENV=development` runs locally with dev Stripe and dev Resend values from `*_DEV` keys.
   - `APP_ENV=production` requires `NODE_ENV=production` and uses production provider values from `*_PROD` keys.
   - Provider credentials are explicit per mode; unsuffixed Stripe and Resend keys are ignored.
   - The API uses `DATABASE_URL_DEV` in development and requires `DATABASE_URL_PROD` in production. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are not consumed by this codebase today.

3. Start Supabase locally:

   ```powershell
   npm run dev:db
   ```

4. In another terminal, reset the database from migrations:

   ```powershell
   npm run db:reset
   ```

5. Start the API and web app:

   ```powershell
   npm run dev
   ```

   To send through Resend, set `EMAIL_PROVIDER=resend`, set the app-mode `EMAIL_FROM_ADDRESS` to a verified sender or `onboarding@resend.dev`, and provide a real `RESEND_API_KEY_DEV` or `RESEND_API_KEY_PROD` value that matches `APP_ENV`.

6. Start Stripe webhook forwarding for the current environment

   ```powershell
   & "$env:LOCALAPPDATA\stripe-cli\stripe.exe" listen --forward-to localhost:8787/api/stripe/webhook
   ```

7. Local tunnel

```powershell
npx --yes localtunnel --port 5173
```

## Deployments

- Local development should set `NODE_ENV=development`, `APP_ENV=development`, a local `WEB_ORIGIN`, `DATABASE_URL_DEV`, and dev Stripe and Resend credentials.
- Production deployments should set `NODE_ENV=production`, `APP_ENV=production`, production origins, `DATABASE_URL_PROD`, and production Stripe and Resend credentials.
- The API rejects `APP_ENV=production` unless `NODE_ENV=production`, and rejects `APP_ENV=development` when `NODE_ENV=production`.
- Keep secrets in deployment-specific `.env.local` files or secret stores. Do not commit live credentials.

## Useful Commands

- `npm run typecheck` - TypeScript across workspaces.
- `npm run lint` - ESLint across the repo.
- `npm test` - Unit tests.
- `npm run test:e2e` - Playwright tests.
- `npm run dev:api` - API only.
- `npm run dev:web` - Web only.
