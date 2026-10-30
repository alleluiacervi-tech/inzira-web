# Cloud development startup

Use the existing checkout at `/workspace/inzira-web`. Each cloud task is already isolated; do not create a Git worktree unless explicitly requested. Preserve existing changes and read repository guidance first. Setup alone must not change tracked source, tests, dependency declarations or lockfiles; an explicitly authorized coding task may do so.

Activate the retained Node 22 toolchain:

```bash
export PATH=/workspace/.tools/node22/node_modules/.bin:$PATH
cd /workspace/inzira-web
```

Refresh dependencies when the lockfile changes:

```bash
npm ci --no-audit --no-fund --cache /workspace/.cache/npm
```

Keep inherited proxy settings and CA verification. The command sandbox may require the approved execution mode for network access, local servers and browser sockets.

For normal development, run `npm run dev`. No `.env` file or external credentials are needed. The application uses `.data/pglite` and `.data/uploads` and clearly identifies the demonstration environment. Preserve existing local data.

Run only one server from this checkout at a time, and stop it before building. Check `/api/health` with a local request, then run `npm run smoke`. During onboarding, do not create localhost preview links.

For a production-style **local demo**, set the demo flag for both commands:

```bash
INZIRA_DEMO=1 npm run build
INZIRA_DEMO=1 npm start
```

Real production builds retain HTTPS upgrades and HSTS. Explicit demo builds support local HTTP. Never publish the demo artifact as the real production build. Fonts are vendored and do not need external downloads.

For browser tests, start with a new disposable database:

```bash
PGLITE_DIR="$(mktemp -d /tmp/inzira-test-db.XXXXXX)" INZIRA_DEMO=1 npm start
```

Run `npm run test:ui`, `npm run test:a11y` and `npm run flows` separately. Use a new database for each: these tests change sample data, language preferences, permissions, passwords and authenticator settings. The complete flow suite supplies the prerequisites that `FLOWS_ONLY` subsets may need. Chromium is available at `/usr/bin/chromium`; `CHROME_PATH` overrides it. Reports and screenshots are written under `/tmp`. Stop only services you started.

To check deferred collection, start a fresh demo server with `PAYMENT_PROVIDER=disabled`, then run:

```bash
npm run test:ui -- http://localhost:3000 --payment-unavailable
```

`npm run test:release` checks the release-policy rules without a running server or provider credentials. `test:a11y` reports 51 accessibility stress cases plus keyboard and failed-save recovery checks; native zoom and real assistive technology still require manual review.

For actual production, rebuild without `INZIRA_DEMO` and run `npm run check:release` with the intended deployment variables. Configure and verify persistent Postgres, `AUTH_SECRET`, `DATA_KEY`, the HTTPS public address, private document storage and messaging. Real-money processing remains unset/disabled for this release. See [Production readiness](PRODUCTION_READINESS.md) for the full checks and limitations.

These instructions are preserved here because the environment service rejected the startup-draft update with `draft_not_editable`. Persistence of that draft update was not confirmed; this file and the repository documentation contain the current tested instructions.
