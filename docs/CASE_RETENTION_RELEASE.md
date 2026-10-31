# Seven-day case privacy and executive dashboard

Working-tree release record — 31 October 2026. Not deployed by this work; not a legal compliance certificate.

## Task checklist

- [x] Trace completion, database relationships, reporting and scheduled cleanup.
- [x] Add seven-day completed-case eligibility and read-only privacy archive state.
- [x] Preserve case counts, service/date/team performance, invoices, transaction amounts/statuses and financial evidence.
- [x] Remove operational case content, messages, notes, supporting files and deliverables; detach the case from the original account/profile.
- [x] Retain file locators on failure, resume cleanup and expose failures/backlog rather than reporting false success.
- [x] Add expiring, purpose-specific owner/admin holds with step-up authentication and audit records.
- [x] Refresh the blue admin overview, prioritize business metrics and show the data lifecycle queue.
- [x] Update English/Kinyarwanda retention notices and intake information without provider-blind or Rwanda-only claims.
- [x] Test seven-day boundaries, retries, stale writes, retained totals, shared identity, active accounts and hold expiry using an isolated in-memory database.
- [x] Complete final build, UI review and recorded release checks below.
- [ ] Verify production Neon region/PITR, Blob locations, actual scheduler, provider contracts and applicable Rwandan legal requirements. These require live-account evidence and official-source review.

## What seven days means

A completed case becomes eligible when its recorded completion timestamp is at least seven full days old. The existing authenticated `/api/cron` job runs daily at 06:00 UTC (08:00 Rwanda time) under `vercel.json`. Actual deletion occurs on a successful scheduled run after eligibility, not at an exact second. Do not describe the policy as a Rwandan statutory seven-day rule: it is the owner's chosen operational retention window.

Cleanup processes up to 25 eligible cases per run to bound serverless work. Held cases and cases with pending payments/refunds are excluded before the batch limit. The dashboard displays overdue cases and in-progress/retry cases; a recent cron invocation alone does not establish healthy cleanup if a backlog remains. Higher throughput requires a suitable scheduled worker/queue and plan, monitored against the retention objective. Do not rely on a daily, unmonitored function for growing volume.

The timer uses the completion timestamp, not merely the last activity date. Moving out of completed state before cleanup excludes the case; re-completing records a new completion timestamp. After cleanup starts, database guards prevent reopening or adding operational content. A purged case cannot be restored through the UI.

## Remove, preserve, and separate

| Remove from active operational case storage | Preserve for a separate stated purpose |
| --- | --- |
| Supporting document bytes and delivered certificate bytes; document checklist/deliverable rows; case messages, notes and detailed timeline; free-text answers, title, summary, purpose, contact fields, follow-up/handover and operational institution references. | Minimal case skeleton: case/invoice references, service, stage/date information, agent assignment, broad intake channel category, completion/return measures and financial fields. This is minimized/pseudonymized reporting, not guaranteed anonymous data. |
| Ordinary operational case-to-client/profile link, replaced by a shared tombstone; unused profile ID/TIN/DOB/district data and ordinary notes/tags when no other case or active tax engagement needs that profile. | Necessary transactions, provider/receipt references, amounts/statuses, refund evidence, classified official financial receipt files and financial audit evidence. Identifying details in those records are not silently deleted merely to claim anonymity. Their legal retention periods still require verification and configuration; this release does not justify indefinite retention. |
| Guest contact details when no remaining case, registration or active tax engagement supplies an ongoing purpose; request links and queued case communications. | Registered account contact details for the continuing account relationship; identity needed by other cases or ongoing tax engagements. Those purposes need their own notices, minimization and retention review. |

Receipt uploads are classified as financial evidence going forward. Existing files that have neither a checklist nor a deliverable relationship are conservatively classified as financial for review, since that is how legacy official receipt uploads were stored. This can include unclassified legacy files: reconcile them rather than blindly deleting possible accounting evidence. Ordinary finance permissions protect access; a new separate finance database/encryption domain is **not** implemented in this release.

## Failure safety and concurrency

`privacy_started_at` is a durable lock, `privacy_purged_at` records finished active-store cleanup. Files retain their database IDs/locators until byte deletion succeeds. Storage failure aborts finalization, leaves the case locked, preserves retry locators and appears as a failed retention task. Retrying missing objects is idempotent. Financial files are excluded from operational byte deletion.

Database triggers serialize operational attachment/message/note writes with the parent case lock and refuse stale submissions once cleanup starts. New pending payment/refund records cannot be created during the purge itself. After active-store purge, authorized financial settlement and financial-only receipt uploads remain possible without reopening operational content. Operational request fields become read-only, while financial settlement fields remain separate. The server redacts the case before sending it to the browser during cleanup, including failed attempts where original data still awaits removal. Request bearer links are revoked; operational file delivery is denied. This is ordinary access control, not cryptographic provider blindness.

The earlier supporting-document/account deletion byte-order defect is also corrected: delete stored bytes before removing the final locator. A failed deletion does not now silently count that batch as successful. Historical orphaned objects created before this release still need a provider inventory; they cannot be recovered or verified absent storage evidence.

A provider message already in delivery, an agent's downloaded copy or an intended institution's copy cannot be recalled by database deletion. Prevent unnecessary downloads, use staff confidentiality controls and review recipient retention obligations. Durable retry locators and financial records remain personal data where linkable.

## Retention exceptions

Owner/administrator actions may set a seven-, 30- or 90-day review period for a legal obligation, active dispute or security investigation; the server enforces a maximum of 90 days per action, with identity step-up, case lock and audit record. Releasing a hold returns an overdue case to the next scheduled sweep. A case already being purged cannot be put back on hold or recovered through this mechanism. Legal obligations may require a longer retention decision: review and renew a justified hold before expiry; do not confuse these UI review periods with statutory limits. Keep supporting legal justification in a suitably restricted compliance record without copying case content into dashboard forms.

Pending payments/refunds defer cleanup until resolved and must be monitored; this is not an indefinite retention justification. Financial receipt retention remains separate and cannot be replaced by a claim that money totals alone always satisfy accounting law.

## Neon, Vercel, Blob and backups

Neon is owner-confirmed as the database provider. Vercel remains the current application host; Hostinger VPS is a future option. Physical country, Neon branches/read replicas/PITR/restore windows, Vercel compute/log locations, Blob location/replication and provider/support access remain unverified. This release neither moves infrastructure to Rwanda nor establishes an overseas authorization.

SQL/object deletion affects active stores. It does not delete Neon historical restore points, provider snapshots/logs, downloaded copies or every replica. Configure verified backup retention, prohibit unmanaged exports and implement a restricted deletion ledger/restore-reconciliation procedure before claiming erasure from recovered backups. This release does not implement cryptographic erasure, client-side encryption or provider-blind key custody. Existing server-held encryption remains unchanged.

## Release procedure and rollback

1. Review additive migration `0023_case_privacy_retention.sql` in an isolated staging database; it adds nullable lifecycle fields, a file retention class and write guards. No production database was accessed during development.
2. Use synthetic completed/open/shared/held/paid/refunded cases and injected storage failures. Verify that financial totals and counts remain identical while operational records disappear. Check both languages and desktop/mobile flows.
3. Before deployment, obtain a suitably protected recovery capability and inventory legal holds/financial receipt classification on existing completed cases. Older cases already past seven days become eligible at the next successful scheduled run; do not overlook historical data.
4. Verify secret presence, job executions and backlog without exposing `CRON_SECRET`, URLs or client data. Do not manually call the full cron endpoint as a read-only health check: it performs payments, messages and deletions.
5. Publish only descriptions that match the deployed behavior and required legal disclosures. Confirm backup/financial retention limitations and any content overrides with the owner/privacy lead and qualified Rwandan review.
6. Rollback the application before cleanup can stop future code execution but cannot undo completed deletion. If pausing a faulty rollout, pause the schedule/worker through controlled operations; do not restore deleted personal data into active use without reapplying the deletion ledger and legal review. No “undelete” button is provided.

## Validation record

Ten isolated privacy integration checks passed, including storage failure, stale operational writes, retained totals and post-purge financial settlement/evidence. Existing 68 unit checks passed. Final optimized demo build, TypeScript, lint, bilingual keys and whitespace checks passed.

The full browser regression passed 240 page/viewport checks with no recorded layout, label, route or console failures. Dialog focus containment, mobile role persistence, manual-payment form labels and offline save/search recovery passed. The final focused privacy browser test passed hold creation/release, stable lifetime metrics, date-range switching, archived-case controls, financial-only receipt upload/read, retained financial record access, English routing and five responsive widths (360, 390, 768, 1024, 1440). All test providers/data were disposable or mocked; no real-money payment was initiated.

Local browser verification binds both Next.js and the test URL to `localhost`. Binding Next.js 15 to `127.0.0.1` triggered loopback rewrite normalization and caused the initial public-prefetch/language failures; the corrected test setup passed. No production routing change is included.

The nine broader privacy-framework drafts remain review documents. Official statutory article text/current guidance, registration, overseas arrangements and financial retention periods remain unverified in this environment.
