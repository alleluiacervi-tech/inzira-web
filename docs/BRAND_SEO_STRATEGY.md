# Inzira brand authority and search strategy

## Brand source of truth

The business owner confirmed **https://inziraservices.com** and **contact@inziraservices.com** on 31 October 2026. These are centralized in `lib/brand.json`. The primary public brand remains **Inzira**; **Inzira Services** is its search alias, not a second business or a replacement legal name. Preserve the existing navy/gold mark and blue product design.

Positioning: private paperwork assistance in Rwanda, based in Kigali. Explain preparation, submission through official channels, progress tracking, requirements and separate assistance/official fees. The relevant institution decides eligibility and approval. Do not imply government ownership, endorsement, guaranteed approval, guaranteed processing times, universal avoidance of in-person steps, or an operating payment gateway.

The legal name, telephone, business hours and Kigali locality come from the existing project. Their continued accuracy, company registration, tax information and any street address need business-owner verification. Hidden registration/address placeholders must never be published as real information.

## Search intent and page ownership

Use a distinct useful page for each actual service. Do not create near-duplicate city, district or keyword pages.

| Search intent | Primary destination | Content and linking responsibility |
| --- | --- | --- |
| Inzira; Inzira Services; Inzira Rwanda | `/` and `/en` | Clear brand, independent assistance, real service categories, contact options and company information. |
| Who is Inzira; Inzira Kigali; contact Inzira | `/about`, homepage contact section | Business identity, scope, independence, confirmed contact details and a descriptive link to services. |
| Inzira services and fees | `/services` and real category filters | Visible catalogue only; requirements, estimated timing and separated fees on each detail page. |
| Company registration assistance in Rwanda | `/services/company-registration` | Eligibility and documents from the actual catalogue, submission channel, fee breakdown and request CTA. |
| Tax filing and trading licence assistance | `/services/monthly-tax-declarations`, `/services/trading-licence-declaration`, `/services/property-tax-declaration` | Distinguish procedures and billing periods; link to related actual services without presenting tax/legal advice credentials. |
| Land and e-title assistance | `/services/e-title`, `/services/land-merging`, `/services/land-spouse-update` | Explain the specific procedure, identity requirements and any personal attendance obligations. |
| Certificates and police services | `/services/birth-certificate`, `/services/marriage-certificate`, `/services/criminal-record` | Say what document is requested, who issues it and what the customer needs to supply. |
| Driving licence and transport services | `/services/driving-licence-renewal`, `/services/rura-vehicle-authorisation` | Separate licence/permit procedures and avoid claims that assistance itself authorizes driving or transport. |
| EBM and Irembo training | `/services/ebm-training`, `/services/irembo-training` | Describe the existing training offer accurately; do not invent certification or accreditation. |
| Track an Inzira request | `/track` | Secure reference/contact lookup, useful branded utility, no request information in search results. |

Kinyarwanda uses the unprefixed URL. English uses `/en`. Match visible content, HTML language, canonical URL and reciprocal hreflang. Private customer/staff/account/capability pages and application forms are not search landing pages.

## Implemented technical foundation

- Owner-confirmed brand/domain/email, consistent brand name and stable Organization/WebSite entity IDs across public pages.
- Connected Service, BreadcrumbList, CollectionPage/ItemList and AboutPage markup. FAQ markup contains the actual visible questions and answers. No ratings, reviews, awards, registration numbers, invented social profiles or unsupported credentials.
- An enlarged version of the existing brand mark for structured data. Open Graph and X use the same generated artwork; the old PNG remains available at its original public URL.
- Page-specific titles, descriptions, canonical URLs and matching social metadata. Snippets prefer complete sentences or a clean word boundary.
- A dynamic XML sitemap with visible services, populated real categories, public informational pages and reciprocal `rw`, `en` and `x-default` annotations. No fabricated modification timestamps or sitemap entries for private/form pages.
- Production robots rules and page/header directives are evaluated consistently. Development, demonstration, preview, unconfigured or incorrect-origin deployments cannot become indexable merely through child-page metadata.
- Catalogue searches and extra filters are noindex, with a clean catalogue/category canonical. Canonicals keep only the intentional category query, rather than tracking/search/sort parameters.
- Duplicate `/rw` URLs and English-prefixed private URLs redirect to their proper address. Private file responses carry noindex headers and retain access controls.
- Optional `GOOGLE_SITE_VERIFICATION` support for the public Search Console verification meta tag. This is configuration support, not proof of Google ownership verification or indexing.
- Local fonts, existing optimized images, responsive layouts and explicit image alt attributes. Decorative images retain empty alt text when nearby text already describes their purpose.

## Deployment and Search Console checklist

1. Configure the production environment and rebuild with `NEXT_PUBLIC_SITE_URL=https://inziraservices.com`, `INZIRA_DEMO` removed, real Postgres and the documented security/storage/messaging settings. Never publish a demo or test artifact.
2. Connect the actual domain, confirm its certificate, and verify HTTP redirects to HTTPS. The application includes a permanent `www.inziraservices.com` redirect to the confirmed apex; both hosts still need correct DNS and certificates. Canonical tags do not replace working host redirects.
3. In the owner's Google Search Console account, create a **Domain property for inziraservices.com** and publish the supplied DNS TXT record. A URL-prefix property can instead use `GOOGLE_SITE_VERIFICATION`; set its exact meta-tag content value securely and redeploy. Never insert a fabricated verification token.
4. Confirm ownership in Search Console. Submit `https://inziraservices.com/sitemap.xml` once the deployed robots/sitemap and real service catalogue are verified. Inspect `/`, `/en`, the catalogue, About and representative service URLs using URL Inspection; request indexing selectively after material changes.
5. Use Google's Rich Results Test and Schema Markup Validator against deployed URLs. Valid markup does not guarantee enhanced search presentation; FAQ rich results in particular have eligibility restrictions.
6. Check Pages/Indexing for exclusions, alternate canonicals, crawl errors and accidental preview indexing. Do not submit signed URLs, private references, document URLs, forms or account pages.
7. Update legitimate owned profiles, business directories, email signatures and any verified public listings to the same brand, domain and contact information. Claim Google Business Profile only if the real business meets its eligibility requirements; do not invent an office or public street address.

Search Console, DNS, the hosting account and public brand profiles are not connected to this execution environment. No external verification, sitemap submission, profile claim, backlink acquisition or search-engine indexing was performed automatically.

## Content and authority work after launch

Use actual customer questions and Search Console queries to improve existing service pages. Explain eligibility, documents, official channels, pricing basis, realistic estimates, customer responsibilities and how to obtain support. Expand only where the business can supply verifiable information. Correct service fees/requirements with the institution and record the actual verification date in the catalogue rather than implying all fees have been checked.

Seek relevant references earned through real business relationships, useful resources and accurate listings. Do not buy fabricated endorsements, create fake reviews, mass-produce keyword pages, or add unrelated `sameAs` profiles. Ask actual customers for honest reviews only through a compliant process without inventing review counts or selectively presenting them as structured ratings.

## Measurement and operating cadence

- Weekly after launch: review branded queries (Inzira and Inzira Services), service query/page pairs, impressions, clicks, CTR, indexed URLs and crawl errors. Compare actual Search Console data; no search volume or ranking claim has been invented for this plan.
- Monthly: inspect title/description performance, internal links, catalogue accuracy, brand/contact consistency, conversion friction and public profile accuracy. Improve the relevant existing page instead of creating duplicates.
- Monitor field Core Web Vitals at the 75th percentile: LCP ≤2.5 seconds, INP ≤200 ms and CLS ≤0.1. Use Search Console/CrUX when sufficient real traffic exists. Local tests are diagnostics, not field performance guarantees.
- Verify database backup restoration, uptime/error monitoring and provider delivery in the real deployment. Keep test/private information out of analytics and crawler-visible URLs.

There is no ranking guarantee. These changes strengthen legitimate relevance, technical accessibility and brand consistency; search placement also depends on competition, reputation, crawl timing and real user signals.
