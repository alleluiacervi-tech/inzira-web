# Brand and technical SEO audit

Reviewed on 31 October 2026. The owner confirmed `https://inziraservices.com` and `contact@inziraservices.com`. This report describes code and local verification, not a live search-engine ranking or indexing result.

## Findings and implemented corrections

| Finding | Correction |
| --- | --- |
| Business email and public URL were inconsistent across configuration examples. | Confirmed brand data now lives in `lib/brand.json`; contacts, canonical metadata, structured data and release checks use that identity. Changing a displayed email does not provision a mailbox or configure its DNS. |
| Preview or unconfigured builds could emit indexable public metadata; catalogue metadata could override a parent noindex decision. | Centralized deployment-aware index policy, matching response/meta directives, dynamic robots, empty non-production sitemap and an independent `SEO_NOINDEX=1` staging switch. Release checks reject this switch and preview mode for launch. |
| Business schema was repeated with disconnected identities and service providers. | Stable Organization/WebSite IDs connect Service, CollectionPage, AboutPage and FAQ markup. The existing mark is served as a 256px SVG. No fabricated social accounts, ratings, awards, addresses or registration credentials. |
| Child-page metadata lost the inherited social image. | Public metadata explicitly references the common generated artwork. Titles, descriptions and URLs match each page. X and Open Graph share the same generator; the old PNG URL remains available. |
| Social artwork overlapped text after copy changes. | Fixed column dimensions, type scale and process labels; generated image inspected visually. |
| Long service snippets cut secondary context mid-sentence. | Prefer complete description parts and complete sentences, falling back to a word-boundary ellipsis only when necessary. |
| Sitemap lacked language annotations and included application forms. | Visible services and populated categories have reciprocal English/Kinyarwanda/x-default URLs; private/form pages are excluded. Modification dates are not fabricated. |
| Search/filter variants could multiply crawlable pages. | Search and additional filters are noindex; stable category canonicals keep only the category query. |
| English-prefixed private routes could serve duplicate URLs. | Permanent redirects to unprefixed private routes; private files also carry noindex headers. |
| Alternate `www` host lacked an application redirect. | Permanent redirect to the confirmed HTTPS apex, preserving path/query. DNS and certificates still require verification on the real host. |
| Brand copy used negative competitor comparisons and broad attendance/approval claims. | Public English/Kinyarwanda messaging now identifies Inzira, explains independent assistance and leaves approval and attendance requirements to the relevant institution. |
| Search Console verification had no configuration entry point. | Added optional `GOOGLE_SITE_VERIFICATION` metadata and owner setup instructions. Actual Google verification/submission remains external. |

## Verification obtained

- Eight SEO policy/entity/sitemap tests passed; 68 general unit checks passed.
- Eight release-policy tests passed, including official-origin matching and rejection of staging noindex/preview settings for launch.
- Zero-warning lint, TypeScript, 1,297-key English/Kinyarwanda parity and SMS encoding/length checks passed.
- Demonstration browser audit: **85 public page variants and 104 public links**, zero failures.
- Production server-HTML audit using disposable local Postgres: **85 page variants and 104 links**, zero failures. Positive indexing, reciprocal sitemap annotations and the verification meta-tag wiring were checked. The verification token was a local test fixture, not a real Google ownership token.
- Non-demo staging audit with `SEO_NOINDEX=1`: **85 page variants and 104 links**, zero failures. Robots, HTML/header noindex and the empty sitemap agreed.
- The checks cover all 35 visible service pages in both languages, public informational/utility pages, and representative category/search/filter variants. They verify one main H1, heading order, descriptions, canonical/hreflang, brand naming, duplicate metadata across distinct canonicals, valid JSON-LD, entity connections, alt-attribute presence, preview images, redirects and private/utility exclusions.
- The generated sharing image was inspected for overlap. Its layout and existing brand mark were retained in blue/gold.
- The actual `www` host redirect returned HTTP 308 to `https://inziraservices.com/en/services?category=tax` in a local Host-header test.

The production test used local HTTP and server-HTML inspection because its production CSP enforces HTTPS for browser resources. It verifies rendered metadata and routing, not the real domain’s TLS certificate or field Core Web Vitals. The demo browser audit executed the public frontend. No external email/SMS/payment operation or live data change was performed.

## Repeatable checks

```bash
npm run test:seo
npm run test:release
npm run check:i18n
npm run lint -- --max-warnings=0
npm run typecheck
```

Against a running disposable demo server:

```bash
npm run check:seo
```

For a deployed indexable public site (read-only; no sign-in, form submission or payments):

```bash
npm run check:seo -- https://inziraservices.com --seo-indexable
```

For an isolated production artifact on local HTTP, `--seo-html` inspects the server HTML without pretending its HTTP transport is a deployed HTTPS environment. `SEO_EXPECTED_ORIGIN` checks the intended canonical origin; `UI_REVIEW_PORT` selects a separate local Chromium debug port for parallel read-only audits. Reports are written to `/tmp/inzira-seo-{demo,production,staging}-audit.json`; command logs provide the corresponding run evidence.

## Remaining external work

Follow [Brand and SEO strategy](BRAND_SEO_STRATEGY.md) for Search Console/DNS verification, actual sitemap submission, public URL inspection, profile consistency and a measurement cadence. Production services, deployment, TLS, real email delivery, real-device/screen-reader checks, business details and catalogue facts still need their documented launch verification. No live SERP, backlink or competitor-position dataset was available; no ranking or search-volume claim is made.
