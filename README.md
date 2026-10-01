# Inzira — service assistance platform (Next.js)

Next.js 15 (App Router, TypeScript) with a Postgres database: public website, service catalogue,
start-request flow, customer portal, agent workspace and admin console, with real sign-in, saved
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

In development no SMS is sent and payments are simulated: the sign-in code is printed in the
terminal **and shown on screen**, and a mobile money prompt is "approved" after two seconds (a
number ending in `0000` is "declined").

**Sample sign-ins** (development only):

| Who | Number | Lands in |
| --- | --- | --- |
| Aline Uwase, customer | 788 123 456 | Customer portal |
| Eric Niyonzima, agent | 780 000 001 | Agent workspace (sees only his cases) |
| Patrick Nshimiyimana, agent | 780 000 003 | Agent workspace |
| Jean Paul Hakizimana, supervisor | 780 000 006 | Agent workspace (all cases, can change fees) |
| Solange Ishimwe, finance | 780 000 007 | Admin console (payments, refunds) |
| Diane Mukamana, owner | 780 000 008 | Admin console (everything) |

Anyone else starts a request from the catalogue; their account is created when they confirm their
number.

```bash
npm run typecheck
npm run build && npm start   # production build; add INZIRA_DEMO=1 to keep demo codes and payments
npm run smoke                # with the app running: every page loads, is styled, private pages need sign-in
npm run flows                # with the app running in demo mode on a fresh database: 59 end-to-end checks
                             # (needs Chrome and Node 22+)
```

Run one server at a time from this folder: two servers, or a build while a server is running,
fight over `.next` and the embedded database.

## Environment variables

Copy `.env.example` to `.env.local`. None are needed for development.

| Variable | What it does |
| --- | --- |
| `DATABASE_URL` | Persistent Postgres connection string. Required in production; PGlite is for local development only. |
| `DB_AUTO_MIGRATE=1` | Apply migrations when the server starts (otherwise run `npm run db:migrate`). |
| `INZIRA_DEMO=1` | Allow the console SMS and payment simulator in a production build (staging, demos). Never on the live site. |
| `SMS_PROVIDER` | `africastalking` to send real SMS (`AT_USERNAME`, `AT_API_KEY`, optional `AT_SENDER_ID`). |
| `PAYMENT_PROVIDER` | Only `simulator` exists today. See "Before launch". |
| `NEXT_PUBLIC_SITE_URL` | The public address, used in SMS links. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read/write token for local or non-Vercel deployments. On Vercel, connect a private Blob store to use OIDC instead. |
| `UPLOAD_DIR` | Local development upload directory (default `.data/uploads`). Production requires private Blob storage. |
| `OWNER_NAME`, `OWNER_PHONE` | Used once by `npm run db:setup`. |

## Deploying

1. Create a persistent Postgres database (for example Neon, Supabase or Railway) and set `DATABASE_URL`.
2. Create a **private** Vercel Blob store and connect it to this Vercel project. Vercel supplies the OIDC environment variables. For local or non-Vercel use, set `BLOB_READ_WRITE_TOKEN`.
3. Apply the schema: `npm run db:migrate`.
4. Load the catalogue and the first owner, without sample data:
   `OWNER_NAME="…" OWNER_PHONE="07…" npm run db:setup`.
5. Set `SMS_PROVIDER` and its keys, and `NEXT_PUBLIC_SITE_URL`.
6. The owner signs in, checks the official fees in Admin › Services & prices, and invites the team
   in Admin › Roles & people.

Schema changes: edit `lib/db/schema.ts`, run `npm run db:generate` to write a migration into
`drizzle/`, commit it, and run `npm run db:migrate` when deploying.

## Structure

```
app/
  actions/           server actions — every write (auth, customer, agent, admin). Each checks the
                     session and the role's permission, writes the timeline and the audit log.
  files/[id]/        serves an uploaded file to its owner or to staff allowed to download documents
  …                  pages: server components that read through lib/repo
components/          screens and building blocks (client components call app/actions)
lib/
  db/schema.ts       the database tables
  db/index.ts        connection: Postgres (DATABASE_URL) or PGlite
  db/seed.ts         catalogue + sample data (development), catalogue + owner (production setup)
  repo.ts            every read. Customers only ever receive their own requests, without internal notes
  auth.ts            phone + SMS code sign-in, sessions (hashed, httpOnly cookie), staff permissions
  permissions.ts     the permission list and the starting roles matrix
  sms.ts             SMS providers (console, Africa's Talking)
  payments.ts        mobile money providers (simulator)
  storage.ts         uploaded files (private Blob in production, local disk in development)
  types.ts           the domain model · status.ts, format.ts: how it is shown
  mock/              the catalogue and the sample data used to seed a database
drizzle/             SQL migrations
scripts/             db.mts (migrate / setup / seed / reset), smoke.mjs, flows.mjs
```

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

- **Mobile money.** Connect MTN MoMo (Collection API) and Airtel Money in `lib/payments.ts` once Inzira
  has API credentials; until then only the simulator exists, and production refuses payments. Refunds
  are recorded in the admin console but the money is sent back from the provider's dashboard.
- **SMS.** The Africa's Talking integration is written but has not been tested against a live account —
  send a test message first. WhatsApp messages are not sent yet.
- **File storage.** Production uploads use private Vercel Blob and are delivered only after the file
  route checks customer ownership or staff permissions. Create and connect a private Blob store before deployment.
- **Official fees, processing times and document lists** in the catalogue are drafts: check each with
  the institution, then mark the fee as checked in the admin console (customers see that date).
- **Abuse protection.** Codes expire after 10 minutes, allow 5 attempts and one resend per 30 seconds
  per number; add rate limiting per IP (e.g. at your host or CDN) for sign-in and request tracking.
- **Backups** of the Postgres database, and a retention rule for uploaded documents.
- **Placeholders:** company details in `lib/site.ts`, the sample testimonials, and the four legal pages
  the footer links to (terms, privacy, refunds, complaints).
- **Languages.** The EN/RW/FR switch is UI-only; all copy is English.
- Not set up: ESLint (`npm run lint` has no config yet).
