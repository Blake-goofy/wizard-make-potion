# Wizard Make Potion

Primary codebase for the Wizard Make Potion ticketing site. This repository supports local development and production from environment configuration.

## Goals

- One TypeScript backend in `apps/api`.
- Mobile-first React frontend in `apps/web`.
- Supabase Postgres with local migrations and deployment-specific connection strings.
- Resend email with stage-specific provider credentials.
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
   - The web build can use `VITE_API_BASE_URL` when the frontend and API run on different origins in production.

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

   Email always sends through Resend. Set the app-mode `EMAIL_FROM_ADDRESS` to a verified sender or `onboarding@resend.dev`, and provide a real `RESEND_API_KEY_DEV` or `RESEND_API_KEY_PROD` value that matches `APP_ENV`.

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

## Railway And Supabase Production Setup

1. Create a Supabase project for production.
2. In Supabase, open `Connect` and copy a Postgres connection string for your runtime:
   - Prefer the Supavisor session pooler string as the safe default for a long-running Railway API service.
   - Use the direct connection string instead if you have verified IPv6 connectivity from Railway and want a direct connection.
   - Keep SSL enabled. Supabase recommends SSL for Postgres connections.
3. In Railway, deploy `@potion/api` as one service and `@potion/web` as another.
   - Preferred: set the API service custom config file to `/apps/api/railway.toml` and the web service custom config file to `/apps/web/railway.toml`.
   - If you keep the commands in the dashboard instead, use:
     - API build command: `npm run build -w @potion/api`
     - API start command: `npm run start -w @potion/api`
     - Web build command: `npm run build -w @potion/web`
     - Web start command: `npm run preview -w @potion/web -- --host 0.0.0.0 --port $PORT`
   - The API build script now compiles the internal shared, db, and email workspaces before compiling the API so Railway has the package `dist` files available at runtime.
4. Set these environment variables on the Railway API service:
   - `NODE_ENV=production`
   - `APP_ENV=production`
   - `PORT` is injected by Railway and already read by the app. Do not override it unless you have a specific reason.
   - `WEB_ORIGIN=https://your-web-service-domain`
   - `DATABASE_URL_PROD=postgresql://...` using the Supabase connection string from step 2
   - `AUTH_SESSION_SECRET=...`
   - `EMAIL_FROM_ADDRESS_PROD`, `EMAIL_FROM_NAME_PROD`, `RESEND_API_KEY_PROD`
   - `STRIPE_SECRET_KEY_PROD`, `STRIPE_PUBLISHABLE_KEY_PROD`, `STRIPE_WEBHOOK_SECRET_PROD`
5. Set these environment variables on the Railway web service:
   - `VITE_API_BASE_URL=https://your-api-service-domain`
6. After linking the repo to your Supabase project, apply the checked-in SQL migrations to production:

   ```powershell
   supabase link --project-ref your-project-ref
   npm run db:push
   ```

7. In Supabase dashboard production settings, review the production checklist items that matter for this app:
   - Turn on SSL enforcement.
   - Set network restrictions only after confirming Railway egress requirements.
   - Use Security Advisor and Performance Advisor.
   - Use a paid plan or another availability strategy if you cannot tolerate project pausing.

The app does not use the Supabase JavaScript client for production traffic today. Supabase is only the hosted Postgres database for the API.

## Useful Commands

- `npm run typecheck` - TypeScript across workspaces.
- `npm run lint` - ESLint across the repo.
- `npm test` - Unit tests.
- `npm run test:e2e` - Playwright tests.
- `npm run dev:api` - API only.
- `npm run dev:web` - Web only.
