# Product refinement and release readiness

## What changed

The public website, customer portal, staff console and administration screens share refined surface, control, spacing and focus treatments. Small-screen navigation no longer inherits a rule that stretches every button. Inputs retain readable mobile text, and long dialogs scroll within the viewport. The existing navy, gold and document-workflow identity is retained.

Dialog behavior is shared across client creation, manual payment records, confirmations, reminders, side panels, saved views, search and authenticator confirmation. It handles focus containment, Escape, focus restoration, scroll locking and nested dialogs. Customer and staff layouts now expose a main landmark and skip navigation.

Search ignores superseded responses and offers retry feedback. Bulk operations, clipboard actions and saved views report failures. Saved-view failures preserve the entered name and keep the dialog open. Toasts announce outcomes and remain visible longer. CSV exports quote data and neutralize spreadsheet formulas.

Payment screens explicitly identify tests and unavailable collection. Production sample accounts cannot fall back to simulated collection. Test receipts retain their warning when printed, and test transactions are identified in the administrative ledger and exports. Test refunds explicitly say no money moved; manual refund recording explicitly requires an externally completed refund and never claims to transfer funds. Receipt labels are available in English and Kinyarwanda. No real payment, refund, SMS or email was sent during this work.

The font is vendored with its SIL Open Font License. Builds no longer fetch Google Fonts. Production dependencies were patched, including Next.js, Nodemailer and Undici. Compatible PostCSS and Zod overrides address transitive advisories while retaining the Blob integration. Review those overrides when upstream dependencies update.

Resolved findings included:

| Priority | Finding | Resolution |
| --- | --- | --- |
| Critical | Published production dependency advisories | Patched direct dependencies and compatible transitive versions; production audit is clear. |
| High | A production sample account could fall back to simulated collection | Production now rejects simulator collection for reserved accounts too. |
| High | Test refunds could claim an actual mobile-money transfer | Test and externally recorded refunds have explicit, distinct wording. |
| High | Keyboard focus could escape staff dialogs | Shared nested-dialog handling, focus restoration and keyboard regression checks. |
| Moderate | Saved views and bulk actions could fail without useful feedback | Recoverable errors, preserved input, pending states and retry controls. |
| Moderate | Mobile permissions required a cramped horizontal matrix | Per-role mobile editor, verified persistence and busy-state protection. |
| Moderate | Local HTTP demo conflicted with production HTTPS headers | Explicit demo build mode, with separate verification that production keeps HTTPS and HSTS. |
| Moderate | Build depended on a remote font service | Licensed local font asset. |
| Moderate | Input boundaries and suppressed search focus needed stronger contrast | Dedicated 3.22:1 input border token and visible focus outlines. |

## Verification

Run commands from the repository root with Node 22:

```bash
npm ci
npm run lint -- --max-warnings=0
npm run typecheck
npm run check:i18n
npm run test:unit
npm run test:release
npm run check:backend
npm run build
```

Build with `INZIRA_DEMO=1` as well as starting with it: the demo build supports local HTTP, while a real production build retains HTTPS upgrades and HSTS. Never publish the demo artifact as the real production build.

Use a separate disposable database for browser tests. Never reset a database containing customer data. Run only one server from this checkout at a time, and stop it before rebuilding.

```bash
INZIRA_DEMO=1 npm run build
PGLITE_DIR="$(mktemp -d /tmp/inzira-review-db.XXXXXX)" INZIRA_DEMO=1 npm start
# In a separate terminal:
npm run smoke
npm run test:ui
npm run test:a11y
```

`test:ui` requires Chromium (or `CHROME_PATH`) and a demo server. It reviews 42 public, customer, staff and admin destinations at 360, 390, 768, 1024 and 1440 pixels. It checks page overflow, main landmarks, accessible control names, unexpected redirects and browser exceptions; captures representative screenshots; verifies that mobile role edits persist and restores the original permission; and checks dialog behavior plus recovery from intentionally blocked search and saved-view requests. JSON evidence and screenshots are written under `/tmp/inzira-ui-*`.

`test:a11y` checks 17 representative destinations in desktop, simulated 200% reflow and doubled-text modes (51 cases). It inspects the browser accessibility tree for named controls and a single main landmark, checks control clipping, verifies alert and modal semantics, tests client-tab keyboard navigation, and verifies that failed tag/note saves preserve entered text. These simulations do not replace native browser zoom, real devices or a screen-reader session. Evidence is written to `/tmp/inzira-accessibility.json`.

Run `npm run flows` against a **new** disposable database. The flow suite deliberately changes sample accounts, languages, requests, permissions, passwords and authenticator settings. Do not run it concurrently with the UI review against the same database. The UI review also requires disposable data because it verifies permission persistence and creates sign-in audit events.

Verification obtained during this refinement on 30 October 2026:

- Production build, zero-warning lint, TypeScript and translation checks passed.
- 68 unit checks, 24 backend checks and 41 page smoke checks passed.
- The complete browser flow suite passed 247 checks with zero failures. After the final refund wording changes, the dependent checkout/customer/admin/role regression sequence passed another 82 checks with zero failures.
- The route review passed 210 viewport/route combinations, dialog checks and deliberate network-failure recovery checks.
- `npm audit --omit=dev` reported zero known production dependency vulnerabilities after the patches. This is a point-in-time advisory check, not a security certification.
- All 173 discovered internal URLs and 1,091 section-anchor references resolved in the public link audit.
- Local unthrottled, cache-disabled loading samples for the homepage, catalogue and sign-in recorded LCP between 84 and 488 ms. These localhost measurements are not field Web Vitals or a prediction for customer networks.
- Measured contrast on white: muted text 6.30:1, secondary text 4.78:1, primary actions 14.49:1 and input boundaries 3.22:1. These checks do not constitute a full WCAG certification.
- The accessibility pass passed all 51 cases, with no unnamed controls, clipped controls, root overflow or browser exceptions. Alert/modal semantics, client-tab keyboard navigation and failed-save recovery also passed.
- Seven release-policy regression tests passed. The preflight rejects missing/malformed build manifests, demo security headers, conditional-only headers, invalid public origins and unsupported provider settings. It performs no external operations and never prints credentials.

CI now runs lint, type checking, translations, unit checks, release-policy tests, backend checks, build, smoke and browser flows. The full visual/accessibility review is available separately as `npm run test:ui` and `npm run test:a11y`.

The route inventory records 46 page templates, 100 exported server actions and 36 components containing forms or dialogs. See [Route inventory](ROUTE_INVENTORY.md). Current cloud startup instructions are preserved in [Environment startup](ENVIRONMENT_STARTUP.md); updating the environment service’s setup draft was rejected because the draft is no longer editable, so persistence of that draft update was not confirmed.

## Production deployment prerequisites

This development environment is a demonstration environment. Passing local checks does **not** establish that a public production deployment is ready. Run the following with the intended production environment variables and after rebuilding for its public address:

```bash
npm run check:release
```

The current demo build is intentionally blocked by the compiled-build policy check. Rebuild without `INZIRA_DEMO=1` for deployment; changing runtime variables does not change the artifact. The current environment also lacks these seven requirements:

| Requirement | Configuration / verification needed |
| --- | --- |
| Persistent database | `DATABASE_URL`; use `DATABASE_URL_UNPOOLED` for migrations when using a pooler. Verify migrations, backups and restore on the real service. |
| Authentication secret | A unique production `AUTH_SECRET`. |
| Identity encryption | A 32-byte `DATA_KEY`, with a secure backup and a tested recovery process. |
| Public site address | The real HTTPS `NEXT_PUBLIC_SITE_URL`, supplied before building. Verify redirects, canonical URLs and HTTPS on the deployed host. |
| Private documents | A private Vercel Blob binding; verify upload, download, ownership enforcement and deletion from the deployed host. |
| Customer email | Resend or SMTP settings. Verify customer sign-in, receipt delivery and failure recovery using the real sending domain. |
| Customer phone sign-in | Africa’s Talking settings, or `CUSTOMER_PHONE_SIGNIN=0` for email-only customer sign-in. Staff invitations and other SMS-dependent workflows still require a verified SMS provider. |

Enter actual credentials only in secure deployment settings. Do not copy demo data into the production database. Disable `INZIRA_DEMO`, provision the real owner, and verify owner password/authenticator access before admitting customers. Confirm the business’s legal identity, contact details, catalogue fees and legal notices with the business owner; missing registration fields must not be fabricated.

For this release, leave `PAYMENT_PROVIDER` unset or set it to `disabled`. The customer sees that collection is unavailable and can return to the saved request. Payment providers and callbacks remain integration points for a later explicitly enabled release. Do not switch to `live`, `intouchpay`, `direct` or `simulator` on the public production deployment in this phase.

## Limits of the review

External Postgres, email, SMS, Blob, real browser/device combinations, deployed monitoring and backup restoration still need verification in the actual production environment. Keyboard and automated accessibility checks were performed; a full assistive-technology audit with a screen reader was not performed. The checks cover representative dynamic records and major conditional flows, not every possible content combination or concurrency condition. No deployment, Git push or publication was performed.
