# Product refinement checklist

See [Production readiness](PRODUCTION_READINESS.md) for the implemented changes, reproducible verification and seven remaining deployment prerequisites. A complete 247-check flow run and a 210-case route/viewport review have passed. Live deployment and external-provider verification remain pending.

Work through these phases in order. A checked item requires implementation or recorded verification evidence; inspection alone does not establish completion. Preserve working integrations and the English/Kinyarwanda experience. Real-money processing is deferred.

## 1. Establish the baseline

- [x] Read repository guidance and audit architecture, permissions, integrations and existing tests.
- [x] Resolve build prerequisites, including reliable font loading, and record a successful baseline build.
- [x] Start the application and run the existing smoke and browser flow suites against isolated test data.
- [x] Inventory every route, navigation destination, form, dialog and action by user role.
- [x] Capture desktop, tablet and mobile screenshots of public, customer, staff and admin screens.
- [x] Record reproducible functional, visual, accessibility and performance issues with severity.

## 2. Define and implement the shared design system

- [x] Establish typography, semantic colors, spacing, grids, radii, elevation and motion tokens.
- [x] Refine buttons, links, inputs, selects, checkboxes, badges, cards and navigation components.
- [x] Standardize tables, filters, pagination, charts, timelines and detail panels.
- [x] Standardize dialogs, confirmations, toasts, inline validation and success feedback.
- [x] Provide consistent loading, empty, error, forbidden and not-found states.
- [x] Verify keyboard operation, visible focus, contrast, touch targets and reduced-motion behavior.
- [x] Consolidate conflicting styles while preserving legitimate differences between public and staff layouts.

## 3. Refine the public website

- [x] Header, category navigation, mobile menu, language switcher and footer.
- [x] Homepage: value proposition, service discovery, process explanation, trust and calls to action.
- [x] Service catalogue: search, categories, pricing clarity, empty results and navigation state.
- [x] Service detail pages: requirements, fees, timelines and request entry points.
- [x] About, privacy, terms, contact interactions and unavailable routes.
- [ ] Verify content accuracy, links, metadata and both languages throughout.

## 4. Complete request creation and tracking

- [x] Audit and refine `/start` and `/start/[slug]`, including validation and document requirements.
- [x] Verify data persistence, recovery from errors and prevention of duplicate submissions.
- [x] Refine `/track` and private request links at `/r/[ref]`.
- [x] Verify document upload, replacement, messages, status timelines and result downloads.
- [x] Review request saving and receipt routes, including expired, invalid and unauthorized links.

## 5. Refine authentication and customer accounts

- [x] Customer sign-in: code entry, resend limits, invalid/expired codes and safe redirects.
- [x] Staff sign-in, password setup, authenticator enrollment, recovery and session unlock.
- [x] Customer portal overview, requests, request details and documents.
- [x] Account settings, security, language preferences and account deletion feedback.
- [x] Verify sessions, logout, role boundaries and private-data handling.

## 6. Refine the staff workspace

- [x] Shared console shell, sidebar, mobile navigation, search, alerts and account controls.
- [x] Overview and My Day: useful metrics, charts, priorities and actionable empty states.
- [x] Requests: filtering, sorting, selection, detail views, assignments and stage transitions.
- [x] Intake: customer lookup, new requests, validation and document collection.
- [x] Clients: lists, details, related requests and account actions.
- [x] Inbox: conversations, unread state, sending feedback and failure recovery.
- [x] Tax diary, identity controls, security settings and sensitive-action confirmations.
- [x] Verify each staff role sees and can execute only permitted actions.

## 7. Refine administration

- [x] Services and categories: editing, pricing, ordering, visibility and translations.
- [x] Content management and replacement tools: preview, validation and persistence.
- [x] Roles and invitations: access matrix, password setup and safe permission changes.
- [x] Payments, pending refunds and ledger interfaces.
- [x] Audit log and system status: meaningful filters, readable events and diagnostic feedback.
- [ ] Verify destructive actions, stale data, concurrent updates and denied access.

## 8. Prepare payments without moving real money

- [x] Audit all payment entry points, provider selection and existing simulator behavior.
- [x] Clearly label test mode and test transactions across checkout, receipts, history and staff views.
- [x] Ensure deferred live payments never report successful collection or imply an operational gateway.
- [x] Refine amount breakdowns, fees, pending, unavailable, declined, cancelled and retry states.
- [x] Keep explicit future gateway integration points and accurate transaction status handling.
- [x] Verify callback authorization, idempotency and reconciliation logic using isolated tests only.
- [x] Ensure refunds and manual records cannot be mistaken for confirmed external transfers.

## 9. Cross-application quality pass

- [x] Review every inventoried route and interactive component after shared changes.
- [ ] Verify representative widths of 360, 390, 768, 1024 and 1440 pixels, plus zoom and long content.
- [ ] Check keyboard journeys, dialog focus management, labels and screen-reader announcements.
- [x] Verify English and Kinyarwanda for clipping, missing keys, formatting and translation consistency.
- [x] Inspect browser console, failed network requests, broken assets and hydration warnings.
- [x] Measure page responsiveness, loading behavior, image/font delivery and unnecessary client JavaScript.
- [x] Review authorization, input validation, uploads, error disclosure and production configuration.
- [x] Add targeted regression coverage for meaningful defects fixed during the work.

## 10. Release verification and handoff

- [x] Pass production build, typecheck, translation checks, unit tests and backend tests.
- [x] Pass smoke and browser flows against a fresh isolated demo database.
- [x] Verify customer request creation through delivery, customer account flows and staff/admin workflows.
- [x] Confirm every route has a recorded review outcome and every critical defect is resolved.
- [x] Record remaining external integration prerequisites and anything not verified.
- [x] Document setup, deployment requirements, operational checks and deferred payment integration.
- [x] Produce a concise change report with verification evidence and remaining limitations.

## Completion standard

Do not claim production readiness solely from a successful build or attractive screenshots. Completion requires functional and visual review across the route inventory, passing relevant checks, accessible responsive behavior, honest payment states and explicit disclosure of any external dependencies or unverified behavior. Deployment and live provider validation are separate from local verification.

## Remaining review limits

- Business details, legal wording and catalogue fees require confirmation by the business owner. Internal navigation, anchors, language parity and metadata were checked locally.
- Critical transaction concurrency, one-use codes, idempotency and permission denials passed automated checks. Broad production load and all concurrent-editor combinations were not tested.
- Five viewport widths and full-page long-content screenshots were checked. An additional 51 accessibility cases passed at desktop, simulated 200% reflow and doubled text, with no root overflow or clipped controls. Native browser zoom and real-device verification remain separate.
- Keyboard focus, accessibility-tree names, roles, alert/modal semantics and client-tab navigation were checked. Failed client tag/note saves retain entered text and show an error. A real screen-reader session is still required for a complete assistive-technology audit.
- Public launch is blocked by the seven deployment prerequisites in [Production readiness](PRODUCTION_READINESS.md), not by an enabled real-money gateway.
