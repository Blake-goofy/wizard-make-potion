# Aikido review — October 8, 2026

Reviewed all 28 subissues in `aikido-issues.txt`, in their original order. Each exposed a concrete security or operational gap and warranted a fix. None was dismissed as a false positive. Several findings share the same fix; the two development-checkout findings describe the same exposed endpoint.

| # | Finding | Decision and resulting behavior |
|---|---|---|
| 1 | Public verification reactivates privileged users | Fixed. Public signup cannot overwrite active accounts or reactivate inactive admins/scanners. Re-registration can restore an inactive customer only. Verification codes are consumed atomically. |
| 2 | Distributed brute force of authentication codes | Fixed. Login, signup verification, password reset, and phone verification use PostgreSQL-backed account quotas, independent of IP and API process. Local IP and aggregate admission limits add an earlier check. |
| 3 | Unauthenticated development checkout mints unpaid tickets | Fixed. The route is registered only in development, requires an administrator, and is throttled. The order service also refuses production calls. Stripe test checkout remains available for guest development testing. |
| 4 | Reused Stripe idempotency key fulfills the wrong order | Fixed. Stored checkout keys remain authoritative after Stripe forgets them: matching retries retrieve the original session; changed order details are rejected. Fulfillment checks the stored session ID, payment provider, total, currency, and allowed order state. |
| 5 | Stripe fulfillment before settlement | Fixed. Completed checkout events fulfill only paid sessions or genuine zero-total sessions where no payment is required. Asynchronous payment success is handled, and reconciliation uses the same payment validation. |
| 6 | International sender aliases a US subscriber | Fixed. US/NANP phone normalization rejects unsupported country numbers instead of discarding their prefixes. Application and database comparisons use the same accepted formats. |
| 7 | Inbound webhook dispatches the global SMS queue | Fixed. Replies carry their originating event ID. The webhook dispatches only its own reply and does not dispatch again for duplicate inbound events. |
| 8 | Pending messages survive STOP | Fixed. STOP cancels pending non-reply messages. Dispatch checks live suppression under the same per-phone transaction lock as STOP; messages already accepted by Telnyx cannot be recalled. Keyword acknowledgments remain allowed. |
| 9 | Unverified guest phones receive event SMS | Fixed. Campaign recipients must have an active account with a verified phone and current SMS consent. Event reminders also match the completed order's email and phone. Guest checkout explains the verification requirement. |
| 10 | Historical order consent overrides account opt-out | Fixed. Recipient selection uses current account consent, removes the historical-order-only recipient union, and clears historical order consent when the account opts out. Dispatch rechecks campaign eligibility. |
| 11 | Phone verification races with a phone change | Fixed. The final update requires the account's saved phone to still equal the phone validated by the challenge. Code consumption and the conditional update share a transaction. |
| 12 | Admin broadcasts ignore account opt-out | Fixed. Admin campaign selection requires `sms_opt_in`, an active admin account, and phone verification; dispatch rechecks eligibility. |
| 13 | STOP formatting mismatch in campaigns | Fixed. The database canonicalizes formatted ten-digit phones and `+1` phones before comparing recipients and suppression entries. |
| 14 | Reset codes stored in plaintext email bodies | Fixed. Authentication email bodies use authenticated AES-256-GCM encryption before entering the outbox. The application derives a separate purpose-specific key from its externally configured session secret. Ciphertext is removed after successful delivery. The migration retires legacy auth codes and deletes their plaintext outbox jobs. |
| 15 | Unauthenticated orders exhaust the connection pool | Fixed. Development order quoting runs before acquiring a transaction connection, removing the nested pool acquisition that can deadlock a full pool. Public checkout and confirmation requests are throttled; database connection, statement, and idle transaction waits are bounded. |
| 16 | Limiter allows unbounded attacker-controlled state | Fixed. Local state has a hard cap and periodic expiry cleanup. Persistent counters use a fixed set of 16,384 buckets, so identifier variation cannot create unlimited database rows. |
| 17 | Images buffered before authorization | Fixed. Upload authorization runs in Fastify's `onRequest` hook, before body parsing. The existing image size limit remains enforced. |
| 18 | Last active administrator can be removed | Fixed. Admin changes and self-deletion lock the active admin rows in stable order and reject removal of the last admin, including concurrent demotions. This is an operational lockout risk; the report's resource-exhaustion category is misleading. |
| 19 | Scanner ticket list exposes admission credentials | Fixed. The listing no longer selects or returns scan tokens; its frontend type no longer expects them. Ticket IDs and attendance details remain available for authorized workflows. |
| 20 | Password changes/resets preserve bearer sessions | Fixed. Tokens carry a per-user session version. Password changes and resets increment it, invalidating existing tokens without relying on clock synchronization. Access changes, deactivation, deletion, and customer reactivation also revoke stale sessions. The UI signs out after a password change. |
| 21 | Telnyx replay repeats effects or corrupts delivery state | Fixed. Signed requests must have a timestamp within five minutes and an event ID. Inbound event IDs deduplicate effects; duplicates do not dispatch replies. Delivery events require an occurrence timestamp, ignore older/identical updates, and cannot downgrade delivered messages. |
| 22 | Development checkout causes persistent email/resource abuse | Fixed by the same development-only, admin-only, throttled route in finding 3. |
| 23 | Changing signup email bypasses throttling | Fixed. IP quotas are independent of email, so changing email does not reset them. Account quotas and aggregate admission limits remain separate checks. |
| 24 | Unbounded verification SMS sends | Fixed. Each account gets three request attempts per fifteen minutes, shared across processes and IPs, before creating codes or dispatching SMS. |
| 25 | Unlimited SMS keyword replies | Fixed. Replies are limited to three per phone per fifteen minutes and 100 globally per fifteen minutes, enforced in PostgreSQL under transaction locks. STOP/START consent changes still execute when the reply quota is exhausted. Provider requests have a ten-second timeout. |
| 26 | Phone verification brute force | Fixed. Each account gets eight confirmation attempts per fifteen minutes across processes and IPs. Valid challenges are consumed atomically. |
| 27 | Registration reveals existing accounts | Fixed. Existing and new accounts receive the same HTTP response and perform the same password-hashing and email-queue work. Existing-account guidance is delivered privately by email; no public conflict response exposes account existence. |
| 28 | Scanner forges scan attribution | Fixed. The authenticated scanner's email overwrites any client-supplied scanner label before scan events are written. |

The generic remediation paragraphs were treated as reference material, not instructions to add infrastructure. A policy engine, replacement auth framework, Redis, KMS service, MFA, and bot-detection vendor were unnecessary to close these specific gaps. No dependency or backend was added.

## Validation

- The complete test suite passed, including real PostgreSQL regression tests in a uniquely named disposable database. Development data was not reset or migrated.
- Regression coverage exercises concurrent admin demotions, signup-code replay, session revocation, distributed code attempts, phone-change races, payment mismatches, SMS recipient consent and STOP suppression, concurrent dispatch, delivery-event replay, pre-parser upload authorization, and scanner attribution/token exposure.
- Type checking, lint, and the production build passed. Provider signatures and event routing use mocks; no live Stripe payment or Telnyx SMS was sent.
- Stripe's [idempotency documentation](https://docs.stripe.com/api/idempotent_requests) confirms keys may be pruned after 24 hours. Its [fulfillment guidance](https://docs.stripe.com/checkout/fulfillment) describes payment status checks and asynchronous payment success. Telnyx's [webhook documentation](https://support-v2.telnyx.com/en/articles/4334722-how-to-leverage-webhooks) describes signature headers and duplicate delivery handling.

## Deployment and intentional limits

Apply `supabase/migrations/202610080001_security_findings.sql` before deploying the API changes. It adds the required columns and rate-limit table, retires outstanding signup/reset codes, and deletes legacy authentication email jobs. Existing sessions require a fresh sign-in because old tokens have no session version. This review did not change production or the development database schema.

Campaign SMS now requires a verified, opted-in account; guest order consent alone is insufficient. International SMS is deliberately unsupported. Shared limiter buckets can collide and share a quota/window; this conservative, bounded approach suits the current small application. Replace buckets with bounded expiring exact keys if collisions become material. IP/aggregate admission limits are process-local, while account-code quotas and SMS reply quotas are database-backed.

Authentication email encryption protects against database-only disclosure. The session secret must remain outside the database; compromise of both the database and application secret remains outside that protection. Rotating that secret invalidates queued encrypted auth emails as well as sessions, so retire those queued auth jobs during rotation.

To rerun the database regressions from PowerShell with local Supabase running:

```powershell
$env:SECURITY_TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
npx vitest run apps/api/src/security/aikido.test.ts
```

The test creates, migrates, and drops its own database; it refuses non-local database hosts.
