# Inzira — service assistance platform (Next.js)

Next.js 15 (App Router, TypeScript) with a Postgres database: public website, service catalogue,
start-request flow, customer portal, agent workspace and admin console, with saved requests, uploads,
payments (simulated until a provider is connected), email updates and an audit trail.

**Customers don't need an account.** They send a request with their name, phone and email, and get a
private link to it on screen and by email. The link opens their request (documents, messages,
payment) with no password; every later update email carries the same link. Signing in with an email
code is optional: it shows all of a customer's requests in one place. Staff always sign in with an
email code.

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

In development no email is sent and payments are simulated: emails are printed in the terminal, the
sign-in code is **shown on screen**, and a mobile money prompt is "approved" after two seconds (a
number ending in `0000` is "declined").

**Sample sign-ins** (development only; `example.com` never receives mail):

| Who | Email | Lands in |
| --- | --- | --- |
| Aline Uwase, customer | aline@example.com | Customer portal |
| Eric Niyonzima, agent | eric@example.com | Agent workspace (sees only his cases) |
| Patrick Nshimiyimana, agent | patrick@example.com | Agent workspace |
| Jean Paul Hakizimana, supervisor | jeanpaul@example.com | Agent workspace (all cases, can change fees) |
| Solange Ishimwe, finance | solange@example.com | Admin console (payments, refunds) |
| Diane Mukamana, owner | diane@example.com | Admin console (everything) |

Anyone else starts a request from the catalogue; their account is created with their first request,
and the private link is shown on screen (and printed in the terminal).

```bash
npm run typecheck
npm run build && npm start   # production build; add INZIRA_DEMO=1 to keep demo codes and payments
npm run smoke                # with the app running: every page loads, is styled, private pages need sign-in
npm run flows                # with the app running in demo mode on a fresh database: 87 end-to-end checks
                             # (needs Chrome and Node 22+; CHROME_PATH, and CHROME_FLAGS=--no-sandbox as root)
npm run check:providers      # with real keys set: tests email, private links, MTN MoMo, Airtel Money and Blob storage end to end
```

Run one server at a time from this folder: two servers, or a build while a server is running,
fight over `.next` and the embedded database.

## Environment variables

Copy `.env.example` to `.env.local`. None are needed for development.

| Variable | What it does |
| --- | --- |
| `DATABASE_URL` | Persistent Postgres connection string. Required in production; PGlite is for local development and `INZIRA_DEMO=1` builds only. |
| `DB_AUTO_MIGRATE=0` | Skip applying migrations on startup. By default the server applies `drizzle/` when it starts. |
| `INZIRA_DEMO=1` | Demo/staging builds: shows sign-in codes on screen, allows the payment simulator, PGlite and local file storage in a production build. Never on the live site. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email through [Resend](https://resend.com): sign-in codes, request updates with the private link, staff invites and summaries. `EMAIL_FROM` is an address on a domain verified in Resend, e.g. `Inzira <hello@inzira.rw>`. Without a key, development and demo builds print emails to the log; a live site refuses to run without it. |
| `ACCESS_SECRET` | Signs private links (`openssl rand -base64 32`). Required on a live site. Changing it later breaks every link already sent. |
| `PAYMENT_PROVIDER` | `live` for real mobile money (MTN numbers → MTN MoMo, 072/073 → Airtel Money), or `simulator` for demos. |
| `MTN_MOMO_*` | `MTN_MOMO_SUBSCRIPTION_KEY`, `MTN_MOMO_API_USER`, `MTN_MOMO_API_KEY`, `MTN_MOMO_ENVIRONMENT` (`sandbox` or the live name MTN gives you, e.g. `mtnrwanda`), `MTN_MOMO_BASE_URL` (live base URL from MTN), `MTN_MOMO_CURRENCY` (default `RWF`; the sandbox uses `EUR`). |
| `AIRTEL_*` | `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`, `AIRTEL_BASE_URL` (`https://openapiuat.airtel.africa` for testing, `https://openapi.airtel.africa` live). |
| `CRON_SECRET` | Protects `/api/cron`. Vercel sends it automatically to scheduled jobs. |
| `NEXT_PUBLIC_SITE_URL` | The public address, used in links inside emails. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read/write token for local or non-Vercel deployments. On Vercel, connect a private Blob store to use OIDC instead. |
| `UPLOAD_DIR` | Local development upload directory (default `.data/uploads`). Production requires private Blob storage. |
| `OWNER_NAME`, `OWNER_EMAIL`, `OWNER_PHONE` | Used once by `npm run db:setup`. The owner signs in with the email; the phone is optional. |
| `DOC_RETENTION_DAYS` | Days after a request finishes before the customer's uploaded documents are deleted (default 90). |
| `TEST_EMAIL`, `TEST_PHONE`, `TEST_AIRTEL_PHONE`, `CHECK_AMOUNT` | Used only by `npm run check:providers`. |

## Deploying

1. Create a persistent Postgres database (for example Neon, Supabase or Railway) and set `DATABASE_URL`.
2. Create a **private** Vercel Blob store and connect it to this Vercel project. Vercel supplies the OIDC environment variables. For local or non-Vercel use, set `BLOB_READ_WRITE_TOKEN`.
3. Schema in `drizzle/` is applied when the server starts. Set `DB_AUTO_MIGRATE=0` only if a release step runs `npm run db:migrate` first.
4. Load the catalogue and the first owner, without sample data:
   `OWNER_NAME="…" OWNER_EMAIL="you@inzira.rw" npm run db:setup`.
5. Create a Resend account, verify your domain (add the DNS records it shows), and set
   `RESEND_API_KEY` and `EMAIL_FROM`. Set `ACCESS_SECRET`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, and —
   once you have credentials — `PAYMENT_PROVIDER=live` with the MTN and Airtel keys. Point the Airtel
   callback URL in their portal at `https://<your site>/api/payments/callback`; MTN receives it with
   each prompt.
6. Run `TEST_EMAIL=you@inzira.rw TEST_PHONE=07… npm run check:providers` against the staging
   environment: it sends a real email, a mobile money prompt per provider and a storage round trip
   through the site's own code.
7. The owner signs in and opens **Admin › System**: every item should read Live. It sends a test email
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
  r/[ref]/[token]    a customer's private link: opens a session limited to that one request
  api/cron           scheduled job (vercel.json, daily at 08:00 Kigali): settles payments, holds overdue
                     requests with one email reminder, deletes old customer documents, emails each member
                     of staff their summary, removes expired codes and sessions. Every run is recorded.
  api/payments/callback   mobile money callbacks — only trigger a re-check with the provider
  api/health         200 when the database answers, for uptime monitors
  …                  pages: server components that read through lib/repo
components/          screens and building blocks (client components call app/actions)
lib/
  db/schema.ts       the database tables
  db/index.ts        connection: Postgres (DATABASE_URL) or PGlite
  db/seed.ts         catalogue + sample data (development), catalogue + owner (production setup)
  repo.ts            every read. Customers only ever receive their own requests, without internal notes
  auth.ts            email + code sign-in, sessions (hashed, httpOnly cookie; a private-link session is
                     limited to one request), staff permissions
  access.ts          private links: signed with ACCESS_SECRET, nothing secret stored, revocable per request
  permissions.ts     the permission list and the starting roles matrix
  email.ts, mail.ts  outgoing email (Resend) and the templates, in Kinyarwanda or English
  contact.ts         phone and email normalisation shared by server and client
  payments.ts        mobile money providers (MTN MoMo, Airtel Money, simulator)
  billing.ts         settles a payment — the one place that decides paid or failed
  jobs.ts            the scheduled tasks and the staff daily summary
  privacy.ts         document retention, "delete my documents" and account deletion
  system.ts          what Admin › System reports: which services are connected, live or in test mode
  ratelimit.ts       per-IP limits for codes, sign-in, tracking, new requests, links and payment prompts
  storage.ts         uploaded files (private Blob in production, local disk in development)
  types.ts           the domain model · status.ts, format.ts: how it is shown
  mock/              the catalogue and the sample data used to seed a database
drizzle/             SQL migrations
scripts/             db.mts (migrate / setup / seed / reset), smoke.mjs, flows.mjs
```

## Private links

A link is `/r/<reference>/<signature>`. The signature is an HMAC of the reference and the request's
`access_version`, keyed with `ACCESS_SECRET`: nothing secret is stored, the server can rebuild the link
for any request (so every update email carries it), and raising `access_version` on a request makes
every link already sent for it stop working. A link stops working `DOC_RETENTION_DAYS` after the
request finishes, and when the customer deletes their account. Opening it starts a session limited to
that one request: the portal shows only that request and its documents, and the account page, other
requests and other customers' files are refused.

Anyone holding the link can see the request and its documents, like a tracking link on any order
email. The emails say so; keep that wording when you change them.

## The model

**One request, three views.** A request is one row (plus its documents, messages, notes, events and
payments). The customer portal, the agent workspace and the admin ledger all read it.

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

- **Mobile money.** MTN MoMo and Airtel Money are written from their published APIs but have not been
  run against either provider. Get sandbox credentials, set `PAYMENT_PROVIDER=live` on a staging
  build, and pay a few requests end to end before taking real money. Without a provider, production
  refuses payments. Refunds are recorded in the admin console; the money itself is sent back from the
  provider's dashboard.
- **Email.** Verify your domain in Resend (SPF and DKIM records) before launch, or codes land in spam
  and `resend.dev` only delivers to your own address. Send the test email from Admin › System. Update
  emails to Kinyarwanda customers have a Kinyarwanda wrapper (greeting, button, footer) but the
  sentence about the update itself is still English; have a Kinyarwanda speaker review the templates in
  `lib/mail.ts`. WhatsApp messages are not sent yet.
- **File storage.** Production uploads use private Vercel Blob and are delivered only after the file
  route checks customer ownership or staff permissions. Create and connect a private Blob store before deployment.
- **Official fees, processing times and document lists** in the catalogue are drafts: check each with
  the institution, then mark the fee as checked in the admin console (customers see that date).
- **Personal data.** Customers manage their details in Portal › Account, can delete the documents of
  finished requests, and can delete their account once nothing is open. Uploaded documents are deleted
  automatically `DOC_RETENTION_DAYS` after a request finishes. Payments and official receipts are kept
  (anonymised when an account is deleted), as financial records must be. Have the privacy policy say so.
- **Abuse protection.** Codes expire after 10 minutes, allow 5 attempts, one resend per 30 seconds and
  5 per hour per address, and only addresses that have an account are emailed (the answer is the same
  either way). Sending a request needs no code, so it is limited per IP and per email address, has a
  hidden field that bots fill in, and every public action is rate-limited per IP (`lib/ratelimit.ts`). Responses carry
  security headers, including a Content Security Policy that only allows this site's own scripts, styles,
  fonts and images.
- **Scheduled job.** `vercel.json` runs `/api/cron` once a day (the most a Vercel Hobby plan allows).
  On a paid plan, run it every 10–15 minutes so abandoned payment prompts settle sooner.
- **Backups** of the Postgres database, and a retention rule for uploaded documents.
- **Placeholders:** company details in `lib/site.ts`, the sample testimonials, and the four legal pages
  the footer links to (terms, privacy, refunds, complaints).
- **Languages.** The public site is in Kinyarwanda by default with an EN switch; dashboards are English.
  There is no French.
- Not set up: ESLint (`npm run lint` has no config yet).
- **Staff alerts** are a daily email summary. Nothing alerts staff the moment a customer replies; they see it
  in the console.
