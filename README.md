# Inzira — service assistance platform (Next.js)

Next.js 15 (App Router, TypeScript) with a Postgres database: public website, service catalogue,
start-request flow, customer portal, staff console and admin settings, with real sign-in, saved
requests, uploads, payments (simulated until a provider is connected) and an audit trail.

> Inzira is a **private assistance company**. The UI never imitates Irembo, RRA, RDB, RURA or any
> government institution.

## Run it on your computer

```bash
npm install
npm run dev        # http://localhost:3000
```

No database to install: without `DATABASE_URL` the app uses **PGlite**, a real Postgres compiled to
WebAssembly, stored in `.data/pglite`. The first page load creates the tables and fills them with
the catalogue and sample data. `npm run db:reset` deletes it so it is rebuilt.

In development no SMS or email is sent and payments are simulated: the sign-in code is printed in the
terminal **and shown on screen**, and a mobile money prompt is "approved" after two seconds (a
number ending in `0000` is "declined"). Codes are shown on screen only in development and demo builds:
a live site without a real provider refuses to send a code instead.

**Sample sign-ins** (development and `INZIRA_DEMO=1` builds only):

| Who | Number | Lands in |
| --- | --- | --- |
| Aline Uwase, customer | aline.uwase@example.com | Customer portal (customers sign in with their email) |
| Eric Niyonzima, agent | 780 000 001 | Staff console · My day (only their own cases and clients) |
| Patrick Nshimiyimana, agent | 780 000 003 | Staff console · My day |
| Jean Paul Hakizimana, supervisor | 780 000 006 | Staff console · My day (all cases, triage, can change fees) |
| Solange Ishimwe, finance | 780 000 007 | Staff console · Overview (payments, refunds) |
| Diane Mukamana, owner | 780 000 008 | Staff console · Overview (everything) |
| Diane Mukamana, owner (email) | admin@inzira.test | Same dashboard, from the email sign-in form |

A live site never shows a code on screen, sample addresses included: anyone could type `admin@inzira.test`, and that account opens the whole staff console. Email sign-in waits for `SMTP_HOST`, and any session a sample account still has open is ended when the server starts.

**Staff** sign in at `/staff` with a username (or work email), a password and a code from an authenticator app.
"Keep me signed in" holds the session for 30 days on that device (12 hours otherwise); after an hour unused the
console locks and asks for the password only, and refunds, payouts, roles, staff accounts and unmasked ID numbers
ask for a fresh authenticator code once every 12 hours. The owner invites colleagues from Admin › Roles: each gets a
48-hour link to set a password. Staff without a password yet (the first owner, and the demo accounts) sign in once
with a code on `/sign-in`, then set a password and the authenticator under Security; after that a code no longer
opens their console.

**Customers** never need an account. They choose a service, give their name, ID number and where to send the result,
and pay with MoMo or Airtel Money: no code, since the PIN that approves the payment proves the number. Each request
gets a private link (`/r/<reference>#k=…`, lib/request-links.ts) kept in their browser and sent with the receipt; it
shows progress, takes documents, carries messages and the result. The receipt email offers to save the request to an
account. The customer sign-in page has one field: an email gets the code by email, a mobile number by SMS.

```bash
npm run typecheck
npm run check:i18n           # both languages have every key and placeholder; SMS texts stay GSM-7
npm run build && npm start   # production build; add INZIRA_DEMO=1 to keep demo codes and payments
npm run smoke                # with the app running: every page loads, is styled, private pages need sign-in
npm run test:unit            # authenticator codes (RFC 6238 vectors), encryption, upload sniffing, money maths
npm run check:backend        # in-memory database: encryption at rest, outbox retries, one payment prompt, one-use codes
npm run flows                # with the app running in demo mode on a fresh database: 143 end-to-end checks,
                             # including what each role can see (needs Chrome and Node 22+)
npm run check:providers      # with real keys set: tests SMS, MTN MoMo, Airtel Money and Blob storage end to end
npm run check:email          # with SMTP settings set: can this machine reach the mail server, log in, and send one message?
npm run db:remove-samples    # live database that may hold sample staff: lists them; add --yes to switch them off
```

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, the i18n check, build, smoke and flows on every pull request
and on pushes to `main`, against a fresh demo database.

Run one server at a time from this folder: two servers, or a build while a server is running,
fight over `.next` and the embedded database.

## Environment variables

Copy `.env.example` to `.env.local`. None are needed for development.

| Variable | What it does |
| --- | --- |
| `DATABASE_URL` | Persistent Postgres connection string. Required in production; PGlite is for local development and `INZIRA_DEMO=1` builds only. |
| `DATABASE_URL_UNPOOLED` | Optional. The direct (not pooled) address of the same database, used only to apply migrations at startup. Neon's Vercel integration sets it. A pooler can leave the startup lock held, so set it when `DATABASE_URL` goes through PgBouncer, Neon's pooler or Supabase's port 6543. |
| `DB_AUTO_MIGRATE=0` | Skip applying migrations on startup. By default the server applies `drizzle/` when it starts. |
| `INZIRA_DEMO=1` | Demo/staging builds: allows the console SMS, the payment simulator, PGlite and local file storage in a production build. Never on the live site. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Email through Nodemailer over SMTP: sign-in codes for customers and updates about their requests. Port 465 is implicit TLS (default), 587 is STARTTLS; `SMTP_SECURE=1/0` overrides. Use a dedicated `no-reply@` mailbox on your domain and set SPF, DKIM and DMARC. Optional: `EMAIL_REPLY_TO`, `EMAIL_DAILY_LIMIT` (default 400; the app stops short of the mailbox's own daily cap). |
| `DATA_KEY` | Encrypts customers' national ID and TIN numbers in the database (AES-256-GCM). Required on the live site: `openssl rand -hex 32`. **Keep a copy outside the server; without it the numbers cannot be read.** To rotate: put the new key in `DATA_KEY`, the old in `DATA_KEY_PREVIOUS`, run `npm run db:rekey`, then remove the old one. |
| `CLIENT_IP_HEADER` | Behind your own proxy (not Vercel): the header it sets with the caller's address (`x-real-ip`, `cf-connecting-ip`). Rate limits trust only this, never `X-Forwarded-For`. |
| `REQUIRE_STAFF_TOTP` | Staff need a password and the authenticator app before they can work. On by default on a live site (`0` turns it off); `1` turns it on in development and demos. |
| `PASSWORD_BREACH_CHECK` | `0` stops checking new staff passwords against the Have I Been Pwned list (only a 5-character hash prefix leaves the server). |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Optional bot check (Cloudflare Turnstile) on the forms that send a code. Off until both are set. |
| `AUTH_SECRET` | Keys stored sign-in codes to this server. Set a long random value on the live site (`openssl rand -hex 32`). |
| `CUSTOMER_PHONE_SIGNIN` | Set to `0` once customers have added their email, to end phone sign-in for customers. Staff keep it. |
| `SMS_PROVIDER` | `africastalking` to send real SMS (`AT_USERNAME`, `AT_API_KEY`, optional `AT_SENDER_ID`). |
| `PAYMENT_PROVIDER` | `live` for IntouchPay (MTN and Airtel through one API), `simulator` for demos, or `direct` for the older MTN MoMo and Airtel Money APIs. |
| `INTOUCHPAY_USERNAME`, `INTOUCHPAY_ACCOUNT_NO`, `INTOUCHPAY_PARTNER_PASSWORD` | Partner credentials from IntouchPay. The partner password is only used to build the SHA-256 request password and is never sent or shown. |
| `INTOUCHPAY_BASE_URL` | Defaults to `https://www.intouchpay.co.rw/api`. Must be HTTPS outside local development. The published guide uses this host for both test and production credentials. |
| `INTOUCHPAY_CALLBACK_USER`, `INTOUCHPAY_CALLBACK_PASSWORD` | Optional. `POST /api/payments/callback` always answers 200 `{ "message": "success", "success": true, "request_id": … }` straight away, as IntouchPay requires, and then checks the payment with IntouchPay; a callback never decides the outcome, so it needs no login. If IntouchPay ever sends HTTP Basic with these values, a callback that says a prompt failed also closes it at once instead of when IntouchPay's status says so. |
| `MTN_MOMO_*`, `AIRTEL_*` | Used only when `PAYMENT_PROVIDER=direct`. |
| `CRON_SECRET` | Protects `/api/cron`. Vercel sends it automatically to scheduled jobs. |
| `NEXT_PUBLIC_SITE_URL` | The public address (`https://inziraservices.com`), used in SMS links, the sitemap and canonical links. On the live deployment, requests to the project's `*.vercel.app` address redirect here. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read/write token for local or non-Vercel deployments. On Vercel, connect a private Blob store to use OIDC instead. |
| `UPLOAD_DIR` | Local development upload directory (default `.data/uploads`). Production requires private Blob storage. |
| `OWNER_NAME`, `OWNER_PHONE` | Used once by `npm run db:setup`. |
| `DOC_RETENTION_DAYS` | Days after a request finishes before the customer's uploaded documents are deleted (default 90). |
| `TEST_PHONE`, `TEST_AIRTEL_PHONE`, `CHECK_AMOUNT`, `CHECK_REFUND` | Used only by `npm run check:providers`. |

## Deploying

1. Create a persistent Postgres database (for example Neon, Supabase or Railway) and set `DATABASE_URL`.
2. Create a **private** Vercel Blob store and connect it to this Vercel project. Vercel supplies the OIDC environment variables. For local or non-Vercel use, set `BLOB_READ_WRITE_TOKEN`.
3. Schema in `drizzle/` is applied when the server starts. Set `DB_AUTO_MIGRATE=0` only if a release step runs `npm run db:migrate` first.
4. Load the catalogue and the first owner, without sample data:
   `OWNER_NAME="…" OWNER_PHONE="07…" npm run db:setup`.
5. Set `SMS_PROVIDER` and its keys, `NEXT_PUBLIC_SITE_URL` (https in production), `CRON_SECRET`, and —
   once IntouchPay has issued credentials — `PAYMENT_PROVIDER=live` with `INTOUCHPAY_USERNAME`,
   `INTOUCHPAY_ACCOUNT_NO` and `INTOUCHPAY_PARTNER_PASSWORD`. Register
   `https://<your site>/api/payments/callback` as the transaction-status URL. Each prompt also sends
   that address as `callbackurl`. Every call to it is acknowledged with 200 and a success body;
   the payment itself is then confirmed with `GetTransactionStatus`.
6. Run `TEST_PHONE=07… npm run check:providers` against the staging environment: it sends a real SMS,
   a mobile money prompt per provider (with the site's callback address, so IntouchPay's logs show the
   callback delivered), reads the IntouchPay balance and does a storage round trip through the site's own
   code. Add `CHECK_REFUND=1` to also send `CHECK_AMOUNT` back to `TEST_PHONE` through `RequestDeposit`.
7. The owner signs in and opens **Admin › System**: every item should read Live. It sends a test SMS
   and runs the daily job on demand. Then check the official fees in Admin › Services & prices and
   invite the team in Admin › Roles & people.

Schema changes: edit `lib/db/schema.ts`, run `npm run db:generate` to write a migration into
`drizzle/`, commit it, and deploy. The next startup applies it.

## Structure

```
app/
  actions/           server actions — every write (auth, customer, agent, admin). Each checks the
                     session and the role's permission, writes the timeline and the audit log.
  files/[id]/        serves an uploaded file to its owner or to staff allowed to download documents
  api/cron           scheduled job (vercel.json, daily at 08:00 Kigali): settles payments, holds overdue
                     requests with one SMS reminder, deletes old customer documents, texts each member
                     of staff their summary, removes expired codes and sessions. Every run is recorded.
  api/payments/callback   mobile money callbacks — only trigger a re-check with the provider
  api/health         200 when the database answers, for uptime monitors
  console/           the staff console: My day, triage inbox, requests, clients, intake, overview
  admin/             settings in the same shell: services & prices, payments, roles, audit, system
  portal/            the customer portal
  …                  pages: server components that read through lib/repo. /agent/* and /admin
                     redirect to their console pages (next.config.mjs)
components/          screens and building blocks (client components call app/actions)
lib/
  db/schema.ts       the database tables
  db/index.ts        connection: Postgres (DATABASE_URL) or PGlite
  db/seed.ts         catalogue + sample data (development), catalogue + owner (production setup)
  repo.ts            every read. Customers only ever receive their own requests, without internal notes
  access.ts          which cases and clients each member of staff may see; every staff read and write uses it.
                     Full national IDs and TINs never reach a screen: staff reveal them through an audited action.
                     ID review (console/identity) is Inzira comparing documents the client sent. It is not a NIDA or Irembo lookup.
                     A service's id_policy is required, none, or unsure. unsure stays optional until an administrator confirms it.
                     Each request stores the rule from the moment it was sent.
  auth.ts            phone + SMS code sign-in, sessions (hashed, httpOnly cookie), staff permissions
  permissions.ts     the permission list and the starting roles matrix
  sms.ts             SMS providers (console, Africa's Talking)
  payments.ts        mobile money providers (IntouchPay, direct MTN/Airtel, simulator)
  intouchpay.ts      IntouchPay request, status and callback field handling
  payment-callback.ts  callback identification; settlement stays in billing.ts
  billing.ts         settles a payment — the one place that decides paid or failed
  jobs.ts            the scheduled tasks and the staff daily summary
  privacy.ts         document retention, "delete my documents" and account deletion
  system.ts          what Admin › System reports: which services are connected, live or in test mode
  ratelimit.ts       per-IP limits for codes, sign-in, tracking, new requests and payment prompts
  storage.ts         uploaded files (private Blob in production, local disk in development)
  types.ts           the domain model · status.ts, format.ts: how it is shown
  mock/              the catalogue and the sample data used to seed a database
drizzle/             SQL migrations
scripts/             db.mts (migrate / setup / seed / reset), smoke.mjs, flows.mjs, i18n-check.mjs
```

## The model

**One request, three views.** A request is one row (plus its documents, messages, notes, events and
payments). The customer portal, the staff console and the admin ledger all read it.

**Progress and blockers are separate.** `stage` (received → checking → preparing → with the
institution → completed; trainings skip the institution) says who has the work. `hold` marks the
current stage as waiting on the customer (a document, information or a payment); `closed` records a
cancellation or rejection. `requestStatus()` in `lib/status.ts` turns these into the one badge people see.

**Two fee lines, always.** Every price is shown as **Official government fee** and **Our service /
assistance fee** — use `FeeBreakdown` / `FeeLines`, never a single combined price. An official fee is
passed through Inzira, paid by the customer directly to the institution, or does not exist (trainings).
Agents record the official fee and send the fees to the customer, who approves and pays. Changing our
fee on a case needs a supervisor; changing the price list is done in Admin › Services & prices and is
audited.

**Who can do what** is the roles matrix in Admin › Roles & people, stored in the database and checked
by every server action.

## Before launch

- **Mobile money.** Live prompts go through IntouchPay (`RequestPayment` and `GetTransactionStatus` in
  the HTTP API guide: <https://intouchpay.co.rw/static/files/http_intouchpay_api.pdf>). IntouchPay
  issues test credentials first; the guide uses the same base URL for test and production, and you
  replace the credentials when the production account is ready. A prompt is recorded before the call.
  The callback only names the prompt. Paid or failed is written after `GetTransactionStatus` says so,
  and a second callback does not record the payment again. This integration has been tested against
  IntouchPay's sandbox (`https://developer.intouchpay.co.rw/api/v1/sandbox`) and a local stand-in of
  the API: run `npm run check:providers` on staging with real credentials and approve a prompt on a
  phone before taking real money. Without a provider, production refuses payments.
  Refunds (Admin › Payments) send our fee back to the number that paid, through `RequestDeposit`, from
  the IntouchPay balance shown on that page. Each refund is recorded before the call; the request reads
  as refunded only once IntouchPay confirms (2001), and one IntouchPay did not clearly answer stays
  under "Refunds being sent" until its status is known, so it is never sent twice. `PAYMENT_PROVIDER=direct`
  still calls MTN MoMo and Airtel Money for an account that already has those keys; there, refunds are
  sent by hand and recorded.
- **Paying.** No payment, no work: a request can be checked and quoted for free, but preparing it, submitting it to an
  institution and completing it wait until it is paid in full. A supervisor or the owner can move a case on with a written
  reason, kept on the case and in the audit log. A service with a settled price (nothing passed through us, or an official
  fee Inzira has checked, and a fixed fee of ours with no per-year, per-month or per-property unit) is pay to submit: the
  form ends on the payment screen, and the request reaches staff only once it is paid. Until then it is an unpaid checkout
  (`requests.checkout = 'open'`), listed under Inbox › Awaiting payment and nowhere else in the console; the daily job
  reminds the customer once after two hours and closes it after three days. Paying hands it to the inbox, paid requests
  first, and staff with the console open get a live alert. Any other service is quoted by an agent, and is also pay to
  submit: it is sent with a review fee (`NEXT_PUBLIC_REVIEW_FEE_RWF`, RWF 1,000 by default, never more than our own fee;
  `0` sends quoted requests free). The fee is recorded as a payment of ours, so the quote asks only for the rest. A request
  declined or closed before it was quoted gets a "Refund due" note on the case. Quoted fees not paid a week after they were
  sent close the request (the daily job also reminds the customer once). To take a service back to quoting, mark its
  official fee as unchecked.
- **One payment for Irembo fees.** A fixed Irembo fee checked on Irembo's own pages (birth, marriage, single status,
  residence and death certificates, criminal record, licence renewal, ID replacement) is taken with our fee at checkout.
  Staff file, pay the Bill ID from Inzira's mobile money as soon as it exists (traffic fine bills lapse after an hour,
  driving test bills after 8 hours), save the Bill ID with the submission (the customer sees it) and attach the Irembo
  receipt. Until that receipt is attached, a refund sends the Irembo fee back too. Catalogue corrections reach an existing
  database once, by id (`REVISIONS` in lib/db/seed.ts); staff edits made afterwards are kept.
- **WhatsApp or email.** A customer picks where the document goes. A WhatsApp number is confirmed by an SMS code and is
  then that account's sign-in, like customers without an email; where no SMS can be sent, an email confirms it instead.
  WhatsApp messages are still sent by staff from the request page (wa.me): there is no WhatsApp Business Platform yet.
- **Network logos.** public/pay/mtn-momo.svg and airtel-money.svg are stand-in tiles. Replace them with the official
  acceptance marks from MTN Rwanda and Airtel Rwanda (same file names), following their usage rules.
- **Email.** Buy a mailbox on the business domain, put its SMTP settings in the environment and run
  `npm run check:email` from where the app runs (a VPS or cloud host can block outbound mail ports; the check says which).
  Send a real message to Gmail and Outlook and look for `spf=pass` and `dkim=pass` in its headers, or codes will land in spam.
  A mailbox's daily limit (Hostinger: 1,000 per mailbox on Business Starter, 3,000 on Standard and Premium, rolling 24 hours,
  subject to change) counts every sign-in code, so keep `EMAIL_DAILY_LIMIT` below it.
- **SMS.** Now only for staff sign-in and for customers who have no email yet. The Africa's Talking integration is
  written but has not been tested against a live account — send a test message first. WhatsApp messages are not sent yet.
- **File storage.** Production uploads use private Vercel Blob and are delivered only after the file
  route checks customer ownership or staff permissions. Create and connect a private Blob store before deployment.
- **Official fees, processing times and document lists** in the catalogue are drafts: check each with
  the institution, then mark the fee as checked in the admin console (customers see that date).
- **Personal data.** Customers manage their details in Portal › Account, can delete the documents of
  finished requests, and can delete their account once nothing is open. Uploaded documents are deleted
  automatically `DOC_RETENTION_DAYS` after a request finishes. Payments and official receipts are kept
  (anonymised when an account is deleted), as financial records must be. Have the privacy policy say so.
- **Abuse protection.** Codes expire after 10 minutes, allow 5 attempts and one resend per 30 seconds
  per number, and every public action is rate-limited per IP (`lib/ratelimit.ts`). Responses carry
  security headers, including a Content Security Policy that only allows this site's own scripts, styles,
  fonts and images.
- **Scheduled job.** `vercel.json` runs `/api/cron` once a day (the most a Vercel Hobby plan allows). Message retries,
  the checkout reminder ("a couple of hours on") and abandoned payment prompts wait for it, so run it every 10–15 minutes:
  on a paid Vercel plan in `vercel.json`, or from a free scheduler such as cron-job.org calling
  `GET https://<site>/api/cron` with the header `Authorization: Bearer <CRON_SECRET>`. Every task is safe to repeat, and
  the staff SMS summary still goes once a day, after 07:00 Kigali.
- **Backups** of the Postgres database, and a retention rule for uploaded documents.
- **Placeholders:** company details in `lib/site.ts`, the sample testimonials, and the four legal pages
  the footer links to (terms, privacy, refunds, complaints).
- **Languages.** The public site, the customer portal and every SMS to a customer are in Kinyarwanda by
  default, with English as a choice. A customer's choice is saved on their account (portal switch or
  Account page; staff pick it for walk-ins) and every portal page and SMS follows it. Timeline events,
  notifications, holds and summaries are stored as message keys (`lib/i18n/stored.ts`) and shown in
  each reader's language; older rows fall back to an exact-match table (`lib/i18n/legacy-rw.json`).
  The staff console and staff SMS are English. The Kinyarwanda was not written by a native speaker:
  have one review `lib/i18n/rw.json` before launch.
- Not set up: ESLint (`npm run lint` has no config yet).
- **Staff alerts** are a daily SMS summary. Nothing alerts staff the moment a customer replies; they see it
  in the console.
