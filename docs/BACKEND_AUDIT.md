# Inzira backend audit

Scope: `lib/`, `app/actions/`, `app/api/`, `app/files/`, `next.config.mjs`, `drizzle/`, `scripts/`.
Method: full read of the code, `npm audit`, and the existing smoke and flows runs (40 and 112 checks, all passing).
Not done: no live penetration test, no load test, no run against a real Postgres, no review of Vercel project settings.
Findings below come from the code; each says where to look.

## Status of the first fixes (2026-10-13)

- **C1 fixed.** Codes are shown on screen and sample users are created only in development and demo builds (`showsCodeOnScreen`, `canDeliverCodes` in `lib/sms.ts`; guard in `ensureDemoSignIns`). On a live site without a real provider, requesting a code is refused. `SMS_PROVIDER=console` is refused outside demo. Checked for six environment combinations. For a database that may already hold sample staff, run `npm run db:remove-samples` (lists first; `--yes` switches them off).
- **H1 fixed.** The attempt counter is one atomic statement (30 parallel wrong guesses counted exactly 5), a code works once, and one number can receive at most 5 codes an hour. Set `AUTH_SECRET` on the live site so stored codes are keyed to the server.
- **H3 partly fixed.** `next` is now 15.5.27 and `npm audit fix` ran. Left: a copy of `postcss` bundled inside `next` (moderate and high; fixed only in Next 16.4). It processes our own CSS at build time, so the practical risk is low; plan the Next 16 upgrade separately.

## What is solid

- Authorization is checked on the server in every action: `caseScope`, `canSeeCase`, `canSeeClient` (`lib/access.ts`), and the same rules in the file route.
- Sign-in codes and session tokens are stored only as SHA-256 hashes; code comparison uses `timingSafeEqual`; cookies are httpOnly, SameSite=lax, secure in production.
- Payments are settled by asking the provider, never by trusting a callback (`lib/billing.ts`), and the update is conditional so two callers cannot settle twice.
- Prices are computed on the server; the two-fee model is enforced in data, not only in the UI.
- Full national ID and TIN reach a screen only through audited reveal actions.
- Privacy flows exist and are tested: document retention, delete my documents, delete my account.
- Uploads go to private storage and are served only after an ownership or permission check.

## Critical

**C1. Sign-in fails open when the SMS provider is not configured.**
`issueCode` (`lib/auth.ts`) returns the code to the browser whenever `SMS_PROVIDER` is not `africastalking`. It does not check demo mode. `sendSms` (`lib/sms.ts`) treats an empty provider as "console" and does not throw. `ensureDemoSignIns` (`lib/db/seed.ts`) runs every time the database opens and inserts the sample accounts and staff, including the Owner, with the phone numbers published in the README. `open()` (`lib/db/index.ts`) only refuses production without `DATABASE_URL`.
Result: a production deploy with a real `DATABASE_URL` and `SMS_PROVIDER` unset or mistyped lets anyone sign in as the owner by typing the sample number and reading the code off the screen. This is also the state between deploy steps 1 and 5 in the README.
Fix: show the code and seed sample users only when `isDemo()` is true. In production without a live provider, refuse to send codes and say so. Add a startup check that fails the build when demo mode and a production database are combined. Delete the sample staff and accounts from any real database that has already opened.
Confirmed by reading the code; not reproduced against a live Postgres.

## High

**H1. Sign-in code attempts can be raced, and there is no per-number limit.**
`consumeCode` reads `attempts`, then writes `attempts + 1` in a second statement. Parallel guesses all see the same value, so the limit of 5 can be exceeded. A 6-digit code hashed with only the phone as salt is also trivial to brute-force if the table leaks (short lifetime limits this).
Rate limiting is per IP only (`LIMITS.code` is 10 per 15 minutes). One number can be texted every 30 seconds from many IPs, which costs money and harasses the owner of the number.
Fix: do the increment and the check in one conditional `UPDATE ... RETURNING`; add per-number and per-email limits; use an HMAC with a server secret instead of plain SHA-256.

**H2. National ID and TIN are stored in plain text** (`profiles.national_id`, `profiles.tin`). Any database read, backup or SQL export exposes them.
Fix: encrypt these two columns at the application level with a key held outside the database, keeping the masked versions for display.

**H3. Dependencies with known advisories** (`npm audit --omit=dev`): `next` 15.5.26 (moderate, fixed in 15.5.27), plus `postcss`, `sharp` and `source-map-js` (high, transitive, `npm audit fix` available).
Fix: update `next` to 15.5.27, run `npm audit fix`, re-run CI. `sharp` is relevant because uploads include HEIC and images.

**H4. Staff management can escalate itself.** `savePermissions`, `inviteStaff` and `updateStaff` (`app/actions/admin.ts`) need only `manageStaff`. An Administrator can edit the whole matrix (everything except the Owner column) and make others Administrators.
Fix: restrict the matrix and appointing Administrators to the Owner; log and alert on matrix changes.

## Medium

**M1. Notifications are sent outside the transaction's guarantees.** `notify()` (`lib/mutate.ts`) sends the SMS before the surrounding transaction commits and does not await it. On a serverless host the process may stop before the SMS leaves; if the transaction rolls back, the customer was still told.
Fix: queue the message in a table inside the transaction and send from a worker or after commit with `waitUntil`.

**M2. Payment prompts are not idempotent.** `startPayment` (`app/actions/customer.ts`) checks for a pending prompt and then inserts, with no lock or unique rule, so two taps can send two prompts. The provider reference is created inside the provider call and saved afterward; if the call times out after the provider accepted it, the row is marked failed and the customer is prompted again.
Fix: generate and store the provider reference first; add a partial unique index on one pending transaction per request; treat a timeout as unknown and reconcile before retrying.

**M3. The payment callback is public and unthrottled** (`app/api/payments/callback/route.ts`). The body is correctly ignored, but each call can trigger a request to the provider's API.
Fix: rate-limit by IP and by transaction; verify the provider's signature or shared secret if either provider offers one.

**M4. Tracking is protected by a guessable pair.** `trackRequest` (`lib/repo.ts`) accepts a sequential reference and a 9-digit phone number, limited per IP only, and loads the full request for every attempt.
Fix: per-reference lockout after repeated misses; a cheap existence check before the full load. With email login, track by reference plus the contact (email or phone) on the request.

**M5. Upload checks trust the browser.** `ALLOWED` tests `file.type`, which the client sets. Files are written to storage before the database transaction commits, so a rollback leaves orphan files.
Fix: check the file's first bytes; write to storage after commit or clean up on failure; consider malware scanning for documents staff open.

**M6. Scheduled job scales and fails badly.** `retentionSweep` and `staffDigest` load every request into memory on each run; `holdOverduePayments` queries per request. `runAll` stops at the first thrown error, so a failure in one task skips the rest, including `cleanUp`.
Fix: filter in SQL; run each task in its own try/catch and record each result.

**M7. Sessions.** Customer sessions last 30 days with no renewal rule, no list of devices and no rotation. `sessions.subject_id` has no index, which "sign out everywhere" and staff deactivation rely on.
Fix: sliding expiry with a hard cap, an index on `subject_id`, and rotate the token after sign-in.

**M8. Rate-limit identity.** `clientIp` trusts the first `x-forwarded-for` value. That is correct behind Vercel and spoofable anywhere else. In non-production every limit is multiplied by 10.
Fix: read the platform's trusted client-IP header; fail closed if it is absent in production.

**M9. Two sources of schema truth.** `lib/db/align.ts` runs hand-written DDL at every boot alongside Drizzle migrations; `0004` contains no `CREATE TABLE`. Every instance migrates on start, so a scale-out can run migrations concurrently.
Fix: one source (Drizzle migrations), run in a release step, with an advisory lock if auto-migrate stays.

**M10. Missing indexes.** `deliverables.ref`, `notes.ref`, `files.ref`, `audit.at`, `sessions.subject_id`, and `transactions.provider_ref` (looked up with `LIKE` by the Airtel callback).

## Low

- CSP allows `'unsafe-inline'` scripts (documented; moving to nonces would remove it).
- Staff sign in with a single SMS code; no second factor, and no throttle or alert on repeated failures.
- The audit log stores display names, not IDs, and does not record failed sign-ins or code requests.
- `refund` marks transactions refunded and returns only our fee; the official portion and the actual money movement are manual.
- No unit tests on money logic (`amountDue`, refunds); `npm run lint` has no ESLint config.
- `/api/health` runs a query on every call without a limit.

## Requested change: sign in with email, registration optional for some users

Assumptions, since this was not spelled out:

1. Customers sign in with their email and a one-time code sent by email (no passwords).
2. "Registration is not mandatory" means a person can be a client without a portal account: walk-ins entered by staff, and people who only track a request. They keep a phone number as a contact. A portal account needs an email.
3. Staff keep a second channel: email codes for staff alone would put the whole system behind one mailbox.

**What the code looks like today.** The phone number is the identity everywhere:

- `accounts.phone` is required and unique; `staff.phone` is unique; `otp_codes` is keyed by phone.
- Sign-in, the first request (`submitRequest`), tracking, staff invites, the daily digest, every customer notification and every SMS use it.
- `submitRequest` creates the account the moment a new number is confirmed, so registration is currently automatic.
- Staff-created clients (`createIntake`, `createClient`) also get an `accounts` row, so a "contact" and a "portal account" are not separate things.
- Customers cannot change the phone number; support does (`updateAccount`).

**Proposed design.**

1. **Schema (one migration):**
   - `accounts.email` nullable, unique on lower-case; `accounts.phone` nullable (unique when present).
   - `accounts.registered_at` nullable: set when the person confirms an email and gets a portal; null for walk-ins and guests.
   - `staff.email` nullable, unique.
   - `login_codes` keyed by email, replacing `otp_codes` for sign-in.
2. **Sign-in (`lib/auth.ts`):** `normaliseEmail`, `issueCode(email)`, `consumeCode(email, code)` with an atomic attempt counter (fixes H1). Answers must not reveal whether an email has an account. Limits per email and per IP.
3. **Email sending:** there is no provider in the code today. Add `lib/email.ts` (Resend, Postmark or SES), with sign-in code and notification templates in both languages.
4. **Request flow:** `StartForm` asks for email (required to get a portal) and phone (optional, for SMS and WhatsApp updates and for mobile money). A staff-created client with no email stays a contact; an agent can invite them later, which sets `registered_at` on first sign-in.
5. **Notifications (`notify`):** send email when the account has one, SMS when it has a phone and has opted in; log which channel was used.
6. **Tracking:** reference plus the email or phone on the request.
7. **Existing users:** all have phone only. Keep phone sign-in during a transition, ask for an email at the next sign-in (confirmed by a code sent to it), then switch phone sign-in off after a cutoff date.
8. **Staff:** keep the SMS code for staff, or add email plus an authenticator app. Their invite becomes an email link.
9. **Also touched:** `deleteAccount` (placeholder email), seed and `ensureDemoSignIns`, `scripts/db.mts setup` (`OWNER_EMAIL`), the sample-numbers table in the README, the sign-in and start screens, and the flows tests.

**Do first, whatever the login method:** C1, H1, H3. They do not depend on the email work.

## Suggested order

1. C1 (fail-open sign-in), H3 (dependency updates), H1 (atomic attempts and per-identifier limits).
2. Email login with optional registration (design above), built on the fixed sign-in code.
3. H2 (encrypt ID and TIN), H4 (owner-only role changes), M1 and M2 (message queue, payment idempotency).
4. M3 to M10, then the low items.
