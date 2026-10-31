"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCaseRetentionHold } from "@/app/actions/privacy";
import { Icon } from "@/components/ui";
import { fmtDay, fmtWhen } from "@/lib/format";
import type { PrivacyOverview } from "@/lib/privacy-overview";
import { withStepUp } from "./StepUp";

export function PrivacyPanel({ data: p, now, canManage }: { data: PrivacyOverview; now: string; canManage: boolean }) {
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("legal");
  const [days, setDays] = useState("30");
  const [feedback, setFeedback] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <section className="console-panel c-privacy-panel" aria-labelledby="privacy-heading">
      <header className="console-panel-header">
        <div className="row g12"><span className="c-privacy-mark"><Icon name="shield" size={20} /></span><div className="stack g4"><h2 id="privacy-heading" className="console-section-title">Client data lifecycle</h2><span className="c-caption">Seven-day case cleanup. Business reporting stays intact.</span></div></div>
        <span className={`c-health-label ${p.healthy ? "is-current" : "is-pending"}`}><span aria-hidden="true" />{p.healthy ? "Cleanup checked recently" : "Cleanup needs verification"}</span>
      </header>
      <div className="c-privacy-body">
        <div className="c-privacy-summary">
          <div><span className="c-subhead">Retention window</span><strong>7 <small>days</small></strong><p className="c-caption">After completion, operational case details and documents become eligible for scheduled removal.</p></div>
          <dl><div><dt>Privacy archived</dt><dd>{p.archived}</dd></div><div><dt>Awaiting cleanup</dt><dd>{p.waiting}</dd></div><div><dt>Past retention window</dt><dd>{p.overdue}</dd></div><div><dt>Active retention holds</dt><dd>{p.held}</dd></div><div><dt>Cleanup in progress / retry</dt><dd>{p.retrying}</dd></div></dl>
          <p className="c-caption c-privacy-note"><Icon name="info" size={15} />Necessary finance records, receipt evidence, active accounts and separate ongoing services follow their own retention rules. Backup expiry is separate.</p>
          <span className="c-caption">{p.lastRunAt ? `Last cleanup check: ${fmtWhen(p.lastRunAt, now)}` : "No scheduled cleanup run has been recorded yet."}</span>
        </div>
        <div className="c-privacy-queue">
          <div className="row between g8"><h3 className="c-subhead">Completion queue</h3><span className="c-caption">Oldest first · up to 10 cases</span></div>
          {p.rows.length ? <ul>{p.rows.map((r) => {
            const held = !!r.holdUntil && Date.parse(r.holdUntil) > Date.parse(now);
            const due = !!r.dueAt && Date.parse(r.dueAt) <= Date.parse(now);
            const label = held ? `Hold · review ${fmtDay(r.holdUntil!)}` : r.pendingFinance ? "Awaiting payment / refund resolution" : r.startedAt ? "Locked · cleanup will retry" : r.dueAt ? `${due ? "Eligible since" : "Eligible"} ${fmtDay(r.dueAt)}` : "Completion date needs review";
            return <li key={r.ref}><div className="stack g4"><Link className="c-mono-ref c-ref-link" href={`/console/requests/${r.ref}`}>{r.ref}</Link><span className="c-caption">{label}</span></div><span className={`c-lifecycle-status ${held || r.pendingFinance || r.startedAt ? "needs-review" : ""}`}>{held ? "On hold" : r.pendingFinance ? "Finance review" : r.startedAt ? "Retry" : due ? "Due" : "Scheduled"}</span></li>;
          })}</ul> : <div className="c-privacy-empty"><Icon name="check-circle" size={24} /><strong>No cases awaiting cleanup</strong><p className="c-caption">Completed cases will appear here during their retention window.</p></div>}
          {canManage && <details className="c-retention-controls"><summary>Manage a justified retention exception</summary><p className="c-caption">Use only for a documented legal obligation, dispute or security investigation. Holds expire automatically. Do not enter client details.</p><form onSubmit={(e) => {
            e.preventDefault(); setFeedback(""); start(async () => {
              try {
                const result = await withStepUp(() => setCaseRetentionHold(ref.trim().toUpperCase(), reason, Number(days)));
                setFeedback(result.ok ? Number(days) ? "Retention hold saved. Review it before expiry." : "Hold released. The case will be checked at the next scheduled run." : result.error ?? "Could not save the hold.");
                if (result.ok) router.refresh();
              } catch { setFeedback("Could not save. Check your connection and try again."); }
            });
          }}><label>Case reference<input className="console-input" required value={ref} placeholder="INZ-2026-00001" onChange={(e) => setRef(e.target.value)} maxLength={24} /></label><label>Purpose<select className="console-select" value={reason} onChange={(e) => setReason(e.target.value)}><option value="legal">Legal obligation</option><option value="dispute">Active dispute</option><option value="security">Security investigation</option></select></label><label>Review period<select className="console-select" value={days} onChange={(e) => setDays(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="0">Release existing hold</option></select></label><button type="submit" className="c-btn c-btn-primary" disabled={busy}>{busy ? "Saving…" : "Save exception"}</button></form><p role="status" className="c-caption">{feedback}</p></details>}
        </div>
      </div>
    </section>
  );
}
