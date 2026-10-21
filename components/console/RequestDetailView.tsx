"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  addNote,
  assignCase,
  clearFollowUp,
  clearHold,
  closeCase,
  markSubmitted,
  messageCustomer,
  reviewDocument,
  saveFees,
  scheduleFollowUp,
  sendQuote,
  setStage,
  uploadCaseFile,
} from "@/app/actions/agent";
import { customerWhatsAppUrl, deskChecks, handoverRequired, MESSAGE_TEMPLATES } from "@/lib/desk";
import { markIdChecked, revealNationalId, reviewIdentity } from "@/app/actions/console";
import { Icon } from "@/components/ui";
import { billOfficial, billOurs, fmtAgo, fmtMonth, fmtWhen, initials, rwf, shortName } from "@/lib/format";
import type { Permission } from "@/lib/permissions";
import { PAYMENT_LOCK, paymentLock } from "@/lib/payment-gate";
import { payableNow, payStatus, stageLabel } from "@/lib/status";
import type { Closed, IdReview, RequestView, Staff, Stage } from "@/lib/types";
import { RequestStatusBadge, PaymentStatusBadge, DocStatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { FollowUpDialog } from "./FollowUpDialog";
import { Timeline } from "./Timeline";
import { Toast } from "./Toast";
import { RecordPaymentModal } from "./RecordPaymentModal";

const CHANNELS = ["Irembo", "RRA e-Tax", "RRA EBM", "RDB online registration", "RURA online services", "In person"];

const TABS = ["overview", "documents", "messages", "payments", "activity"] as const;
type Tab = (typeof TABS)[number];

export function RequestDetailView({
  c,
  me,
  perms,
  agents,
  category,
  now,
}: {
  c: RequestView;
  me: Staff;
  perms: Permission[];
  agents: Staff[];
  category: string;
  now: string;
}) {
  const [busy, start] = useTransition();
  const can = (p: Permission) => perms.includes(p) || me.role === "Owner";

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  // Links from the dashboards open a tab by its hash: /console/requests/R-1#messages.
  useEffect(() => {
    const fromHash = () => { const h = window.location.hash.slice(1); if ((TABS as readonly string[]).includes(h)) setActiveTab(h as Tab); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const [toast, setToast] = useState("");
  const [shownId, setShownId] = useState<string | null>(null);
  const [idChecked, setIdChecked] = useState<string | null>(c.profile.idChecked ?? null);
  const [idReview, setIdReview] = useState<IdReview | null>(c.idReview ?? null);
  const [idNote, setIdNote] = useState("");
  const [error, setError] = useState("");

  // Modals & sub-state
  const [rejectDocId, setRejectDocId] = useState<string | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [manualPayOpen, setManualPayOpen] = useState(false);
  const [closeKind, setCloseKind] = useState<Closed["kind"]>("cancelled");
  const [followOpen, setFollowOpen] = useState(false);
  const [handoverFor, setHandoverFor] = useState<string | null>(null);
  // An action the payment lock refused, kept so a supervisor or the owner can run it again with a written reason.
  const [override, setOverride] = useState<{ ok: string; fn: (reason?: string) => Promise<{ ok: boolean; error?: string }> } | null>(null);

  // Form states
  const [msg, setMsg] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [officialRef, setOfficialRef] = useState(c.officialRef ?? "");
  const [channel, setChannel] = useState(c.channel);
  const [deliverableName, setDeliverableName] = useState("");

  // Fee state
  const [officialFee, setOfficialFee] = useState(c.billing.official === null ? "" : String(c.billing.official));
  const [oursFee, setOursFee] = useState(String(c.billing.ours));

  const { hold, closed, stage } = c;
  const finished = stage === "completed" || !!closed;
  const phone = c.account.phone.replace(/\D/g, "");

  const officialVal = c.billing.officialMode || officialFee === "" ? null : Number(officialFee);
  const oursVal = Number(oursFee) || 0;
  const feesDirty = officialVal !== c.billing.official || oursVal !== c.billing.ours;
  const oursChanged = oursVal !== c.billing.ours;

  const run = (ok: string, fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    start(async () => {
      setError("");
      const r = await fn().catch(() => ({ ok: false, error: "Network error. Try again." }));
      if (!r.ok) {
        setError(r.error || "Action failed.");
        return;
      }
      after?.();
      setToast(ok);
    });
  };

  const lock = paymentLock(c.billing);
  /** Like `run`, for the actions that wait for payment: when refused for no payment, someone who may override is asked for a reason. */
  const attempt = (ok: string, fn: (reason?: string) => Promise<{ ok: boolean; error?: string }>) => {
    start(async () => {
      setError("");
      const r = await fn().catch(() => ({ ok: false, error: "Network error. Try again." }));
      if (!r.ok) {
        if (r.error?.startsWith(PAYMENT_LOCK) && can("changeOurs")) { setOverride({ ok, fn }); return; }
        setError(r.error || "Action failed.");
        return;
      }
      setToast(ok);
    });
  };

  const copyRef = (text: string) => {
    navigator.clipboard.writeText(text);
    setToast(`Copied ${text}`);
  };

  const uploadFile = (kind: "deliverable" | "receipt" | "document", file: File | undefined, extra: Record<string, string> = {}, ok = "File saved") => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("File is larger than 10 MB."); return; }
    const fd = new FormData();
    fd.set("ref", c.ref);
    fd.set("kind", kind);
    fd.set("file", file);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    run(ok, () => uploadCaseFile(fd));
  };

  const ageDays = Math.max(0, Math.floor((Date.parse(now) - Date.parse(c.openedAt)) / 864e5));
  const stageDays = Math.max(0, Math.floor((Date.parse(now) - Date.parse(c.stageDates[c.stage] ?? c.openedAt)) / 864e5));

  return (
    <div className="stack g18">
      {/* 1. One-line key-facts header */}
      <div className="console-panel stack g12" style={{ padding: "16px 20px" }}>
        <div className="row between g16 wrapx">
          {/* Left: Monospace ref, Title, Customer, Category */}
          <div className="stack" style={{ gap: 4 }}>
            <div className="row g10 wrapx">
              <span className="c-mono-ref">
                <span>{c.ref}</span>
                <button
                  type="button"
                  className="c-copy-btn"
                  onClick={() => copyRef(c.ref)}
                  title="Copy reference"
                >
                  <Icon name="file" size={12} />
                </button>
              </span>
              <h1 className="console-page-title" style={{ fontSize: 18 }}>{c.name}</h1>
              <span className="c-badge c-badge-ember">{category}</span>
              <RequestStatusBadge r={c} viewer="staff" />
              <PaymentStatusBadge status={payStatus(c.billing, now)} />
            </div>

            <div className="c-facts">
              <Link href={`/console/clients/${c.profileId}`} className="c-ref-link" style={{ fontWeight: 600 }}>
                {c.profile.name} <span className="c-caption">({c.profile.kind})</span>
              </Link>
              <span>{c.account.phone}</span>
              <span>Opened {fmtAgo(c.openedAt, now)} · {ageDays}d</span>
              <span>{stageDays}d in {stageLabel(c, c.stage)}</span>
            </div>
            <div className="c-fee-summary" aria-label="Fees on this request">
              <span><span className="c-fee-tag-ours">Inzira</span><strong className="tnum">{billOurs(c.billing)}</strong></span>
              <span><span className="c-fee-tag-official">Official</span><strong className="tnum">{billOfficial(c.billing)}</strong></span>
            </div>
          </div>

          {/* Right: Assigned Agent & Quick Actions */}
          <div className="row g10 wrapx" style={{ alignItems: "center" }}>
            <div className="row g6">
              <label htmlFor="agent-asg" style={{ fontSize: 12.5, fontWeight: 500, color: "var(--c-text-muted)" }}>
                Assigned:
              </label>
              <select
                id="agent-asg"
                className="console-select"
                style={{ height: 32, fontSize: 12.5 }}
                value={c.agentId ?? ""}
                disabled={!can("assign") || busy}
                onChange={(e) => {
                  const val = e.target.value || null;
                  if (handoverRequired(c.agentId, val)) { setHandoverFor(val); return; }
                  run(val ? `Assigned to ${shortName(agents.find((a) => a.id === val)?.name ?? "")}` : "Unassigned", () => assignCase(c.ref, val));
                }}
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.id === me.id ? " (me)" : ""}</option>
                ))}
              </select>
            </div>

            {!finished && can("complete") && (
              <button
                type="button"
                className="c-btn c-btn-primary c-btn-sm"
                disabled={busy}
                onClick={() => attempt("Case completed · client notified", (reason) => setStage(c.ref, "completed", "", true, reason))}
              >
                <Icon name="check" size={14} />
                <span>Complete</span>
              </button>
            )}

            {!finished && can("complete") && (
              <button
                type="button"
                className="c-btn c-btn-danger c-btn-sm"
                onClick={() => { setCloseKind("cancelled"); setCloseDialogOpen(true); }}
              >
                Close...
              </button>
            )}
          </div>
        </div>

        {/* Action Bar: Contextual Stage Flow */}
        <div
          className="row between g12 wrapx"
          style={{
            padding: "10px 14px",
            background: "var(--c-bg)",
            border: "1px solid var(--c-border-subtle)",
            borderRadius: "var(--c-radius)",
          }}
        >
          <ol className="c-stepper" aria-label="Stage — choose a stage to move the case">
            {c.flow.map((st, idx) => {
              const active = c.stage === st;
              const isPast = !!c.stageDates[st] && !active && c.flow.indexOf(c.stage) > idx;
              // A closed case stops where it was: later stages stay open, not ticked as if completed.
              const completed = stage === "completed";
              const state = active ? (completed ? "done" : "current") : isPast || completed ? "done" : "todo";
              return (
                <li key={st} className={`c-step is-${state}`}>
                  <button
                    type="button"
                    className="c-step-btn"
                    aria-current={active ? "step" : undefined}
                    disabled={finished || active || busy || !can("updateStatus")}
                    onClick={() => attempt(`Moved to ${stageLabel(c, st)}`, (reason) => setStage(c.ref, st, "", true, reason))}
                    title={active ? "Current stage" : `Move to ${stageLabel(c, st)}`}
                  >
                    <span className="c-step-dot">{state === "done" ? <Icon name="check" size={12} stroke={2.6} /> : idx + 1}</span>
                    <span className="c-step-label">{stageLabel(c, st)}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="row g6 wrapx" style={{ alignItems: "center" }}>
            {c.followUp && !finished && (
              <span className="c-caption" title={c.followUp.what}>Reminder {fmtWhen(c.followUp.at, now)}</span>
            )}
            <button
              type="button"
              className="c-btn c-btn-secondary c-btn-sm"
              disabled={finished || busy}
              onClick={() => setFollowOpen(true)}
            >
              <Icon name="clock" size={13} />
              <span>{c.followUp ? "Edit reminder" : "Remind me"}</span>
            </button>
            <button
              type="button"
              className="c-btn c-btn-secondary c-btn-sm"
              onClick={() => setManualPayOpen(true)}
            >
              <Icon name="card" size={13} />
              <span>Record payment</span>
            </button>
          </div>
        </div>
      </div>

      {closed && (
        <div className={`c-notice ${closed.kind === "rejected" ? "c-notice-red" : "c-notice-neutral"}`} role="status">
          <Icon name={closed.kind === "rejected" ? "alert" : "x"} size={18} />
          <div className="c-notice-body">
            <span className="c-notice-title">{closed.kind === "rejected" ? "Rejected by the institution" : "Cancelled"} · {fmtWhen(closed.at, now)}</span>
            <span>{closed.reason}</span>
          </div>
        </div>
      )}
      {c.handover && (
        <div className="c-notice c-notice-neutral" role="status">
          <Icon name="users" size={18} />
          <div className="c-notice-body">
            <span className="c-notice-title">Handover · {fmtWhen(c.handover.at, now)}</span>
            <span>{c.handover.body}</span>
          </div>
        </div>
      )}
      {c.checkout === "open" && !finished && (
        <div className="c-notice c-notice-amber" role="status" data-checkout-open>
          <Icon name="card" size={18} />
          <div className="c-notice-body">
            <span className="c-notice-title">Unpaid checkout · {rwf(payableNow(c.billing, true).amount)}{c.billing.reviewFee ? " review fee" : ""} not paid yet</span>
            <span>The customer started this at checkout and has not paid. It is not in the inbox or anyone&rsquo;s queue, and it reaches the inbox by itself once paid. It closes after three days unpaid.</span>
          </div>
        </div>
      )}
      {c.checkout === "paid" && !!c.billing.reviewFee && c.billing.quote === "estimate" && !finished && (
        <div className="c-notice c-notice-neutral" role="status" data-review-paid>
          <Icon name="card" size={18} />
          <div className="c-notice-body">
            <span className="c-notice-title">Review fee paid · {rwf(c.billing.reviewFee)}</span>
            <span>The customer paid to have this request checked. Send the fees as usual: the review fee counts toward our fee, so they are asked only for the rest. If you decline it, the fee is refunded.</span>
          </div>
        </div>
      )}
      {c.checkout === "paid" && !c.billing.reviewFee && !finished && (c.stage === "received" || c.stage === "checking") && (
        <div className="c-notice c-notice-neutral" role="status">
          <Icon name="check-circle" size={18} />
          <div className="c-notice-body">
            <span className="c-notice-title">Paid at checkout</span>
            <span>The customer paid the catalogue price before sending this request, so there is no quote to send.</span>
          </div>
        </div>
      )}
      {lock.locked && !finished && c.checkout !== "open" && (
        <div className="c-notice c-notice-amber" role="status">
          <Icon name="card" size={18} />
          <div className="c-notice-body">
            <span className="c-notice-title">Payment not received{lock.feesKnown ? ` · ${rwf(lock.due)} due` : ""}</span>
            <span>
              {lock.feesKnown ? "Preparing, submitting to the institution and completing wait until the customer has paid." : "Confirm the fees and send the quote first. Preparing, submitting and completing wait until they are paid."}
              {can("changeOurs") ? " You can move it on anyway with a written reason." : " A supervisor or the owner can move it on without payment."}
            </span>
          </div>
        </div>
      )}
      {hold && !finished && c.checkout !== "open" && (
        <div className="c-notice c-notice-amber" role="status">
          <Icon name="clock" size={18} />
          <div className="c-notice-body">
            <span className="c-notice-title">{hold.returned ? "Returned · waiting on customer" : "Waiting on customer"} · since {fmtWhen(hold.since, now)}</span>
            {/* An information hold's title is written for the customer; the question itself is the detail. */}
            <span>{hold.reason === "information" ? hold.detail : [hold.title, hold.detail].filter(Boolean).join(" — ")}</span>
          </div>
          <button
            type="button"
            className="c-btn c-btn-secondary c-btn-sm"
            disabled={busy || !can("updateStatus")}
            onClick={() => run("Hold cleared", () => clearHold(c.ref))}
          >
            Clear hold
          </button>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="row console-tabs c-tabs" role="tablist" aria-label="Request sections">
        {[
          { id: "overview", label: "Overview", icon: "home" },
          { id: "documents", label: `Documents (${c.documents.length})`, icon: "file" },
          { id: "messages", label: `Messages (${c.messages.length})`, icon: "msg" },
          { id: "payments", label: "Payments & Fees", icon: "card" },
          { id: "activity", label: `Activity & Notes (${c.events.length + c.notes.length})`, icon: "log" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className="c-tab"
            onClick={() => setActiveTab(tab.id as Tab)}
          >
            <Icon name={tab.icon} size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: "var(--c-red-bg)", border: "1px solid var(--c-red-border)", padding: "10px 14px", borderRadius: 4, color: "var(--c-red)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* 2. Tab Content Panels */}
      {activeTab === "overview" && (
        <div className="grid cols-2" style={{ gap: 20, alignItems: "start" }}>
          <div className="console-panel stack g12" style={{ padding: 18, gridColumn: "1 / -1" }}>
            <h3 className="console-section-title" style={{ margin: 0 }}>Desk checklist</h3>
            <ul className="c-list">
              {deskChecks(c, now).map((item) => (
                <li key={item.id} className="row between g12" style={{ padding: "8px 0" }}>
                  <span className="stack" style={{ gap: 1 }}>
                    <strong className="c-list-name">{item.label}</strong>
                    <span className="c-caption">{item.detail}</span>
                  </span>
                  <span className={`c-badge ${item.done ? "c-badge-green" : "c-badge-amber"}`}>{item.done ? "Done" : "Open"}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Customer & Service Summary */}
          <div className="stack g16">
            <div className="console-panel stack g14" style={{ padding: 18 }}>
              <h3 className="console-section-title" style={{ margin: 0 }}>Client details</h3>
              <div className="row g10">
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: "var(--c-ember-bg)",
                    color: "var(--c-ember)",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {initials(c.profile.name)}
                </span>
                <div className="stack" style={{ gap: 2 }}>
                  <strong style={{ fontSize: 14 }}>{c.profile.name}</strong>
                  <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>{c.profile.kind} · since {fmtMonth(c.account.since)}</span>
                </div>
              </div>
              <div className="stack g6" style={{ fontSize: 13 }}>
                {c.profile.name !== c.account.name && <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>Contact:</span><span>{c.account.name}</span></div>}
                {c.account.email && <div className="row between g8"><span style={{ color: "var(--c-text-muted)" }}>Email:</span><strong style={{ overflowWrap: "anywhere", textAlign: "right" }}>{c.account.email}</strong></div>}
                {c.account.phone && <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>Phone:</span><strong>{c.account.phone}</strong></div>}
                {!c.account.registered && <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>Portal:</span><span>No account (contact only)</span></div>}
                <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>WhatsApp:</span><span>{c.account.whatsapp ? "Same number · opted in" : "Not opted in"}</span></div>
                <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>Messages and portal in:</span><span>{c.account.locale === "en" ? "English" : "Kinyarwanda"}</span></div>
                {c.account.languages.length > 0 && <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>Language:</span><span>{c.account.languages.join(", ")}</span></div>}
                {c.profile.district && <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>District:</span><span>{c.profile.district}</span></div>}
                {c.profile.idMasked && (
                  <div className="row between g8">
                    <span style={{ color: "var(--c-text-muted)" }}>National ID:</span>
                    <span className="row g8">
                      <span className="tabular-nums">{shownId ?? c.profile.idMasked}</span>
                      {!shownId && can("viewIdentity") && (
                        <button type="button" className="c-btn c-btn-secondary c-btn-sm" disabled={busy} onClick={() => start(async () => {
                          const res = await revealNationalId(c.profileId);
                          if (res.ok) { setShownId(res.nationalId); setToast("National ID shown (logged in the audit trail)"); } else setError(res.error);
                        })}>Show</button>
                      )}
                    </span>
                  </div>
                )}
                {c.profile.dateOfBirth && <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>Date of birth:</span><span className="tabular-nums">{c.profile.dateOfBirth}</span></div>}
                {c.profile.idMasked && !c.idRequired && (
                  <div className="row between g8">
                    <span style={{ color: "var(--c-text-muted)" }}>ID checked by Inzira:</span>
                    <span className="row g8">
                      <span>{idChecked ? fmtWhen(idChecked, now) : "Not yet"}</span>
                      {can("reviewDocs") && (
                        <button type="button" className="c-btn c-btn-secondary c-btn-sm" disabled={busy} onClick={() => start(async () => {
                          const res = await markIdChecked(c.profileId, !idChecked);
                          if (res.ok) { setIdChecked(res.at); setToast(res.at ? "ID marked as checked" : "ID check cleared"); } else setError(res.error);
                        })}>{idChecked ? "Undo" : "Mark checked"}</button>
                      )}
                    </span>
                  </div>
                )}
                {c.purpose && <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>Purpose:</span><span>{c.purpose}</span></div>}
              </div>
              <div className="row g8">
                <a className="c-btn c-btn-secondary c-btn-sm grow" href={`tel:+${phone}`}><Icon name="phone" size={14} /> Call</a>
                {customerWhatsAppUrl(c.account.phone || c.profile.phone || "", c.ref)
                  ? <a className="c-btn c-btn-secondary c-btn-sm grow" href={customerWhatsAppUrl(c.account.phone || c.profile.phone || "", c.ref)!} target="_blank" rel="noopener"><Icon name="msg" size={14} /> WhatsApp</a>
                  : <a className="c-btn c-btn-secondary c-btn-sm grow" href={`https://wa.me/${phone}`} target="_blank" rel="noopener"><Icon name="msg" size={14} /> WhatsApp</a>}
              </div>
            </div>

            {c.idRequired && (
              <div className="console-panel stack g12" id="id-review" style={{ padding: 18 }}>
                <h3 className="console-section-title" style={{ margin: 0 }}>National ID review</h3>
                <p style={{ margin: 0, fontSize: 13, color: "var(--c-text-muted)", lineHeight: 1.5 }}>
                  Compare the number and documents the client sent. This is Inzira’s own check. It does not look up NIDA or Irembo, and opening this page does not verify anything.
                </p>
                <div className="row between g8" style={{ fontSize: 13 }}>
                  <span style={{ color: "var(--c-text-muted)" }}>Status</span>
                  <strong>{idReview === "checked" ? "Checked against documents" : idReview === "correction" ? "Requires correction" : idReview === "unable" ? "Unable to verify" : idReview === "pending" ? "Pending verification" : "No review recorded"}</strong>
                </div>
                {can("reviewDocs") && c.idReviewNote && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>{c.idReviewNote}</p>}
                {(c.requirementsSnapshot ?? c.service.requirements).length > 0 && (
                  <div className="stack g6">
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text-muted)" }}>Requirements when this request was sent</span>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.45 }}>{(c.requirementsSnapshot ?? c.service.requirements).map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                )}
                {can("reviewDocs") && !c.closed && (
                  <div className="stack g8">
                    <label className="console-label" htmlFor="id-review-note">Review note</label>
                    <textarea id="id-review-note" className="console-input" rows={3} value={idNote} onChange={(e) => setIdNote(e.target.value)} placeholder="What you compared, and what is missing. Do not type the ID number." />
                    <div className="row g8 wrapx">
                      {([
                        ["checked", "Checked against documents"],
                        ["correction", "Requires correction"],
                        ["unable", "Unable to verify"],
                      ] as const).map(([outcome, label]) => (
                        <button key={outcome} type="button" className="c-btn c-btn-secondary c-btn-sm" disabled={busy} onClick={() => start(async () => {
                          const res = await reviewIdentity(c.ref, outcome, idNote);
                          if (res.ok) { setIdReview(outcome); setToast(outcome === "checked" ? "Recorded: checked against the documents sent" : outcome === "correction" ? "The client was asked to correct the ID details" : "Recorded: unable to verify from the documents sent"); }
                          else setError(res.error);
                        })}>{label}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="console-panel stack g12" style={{ padding: 18 }}>
              <h3 className="console-section-title" style={{ margin: 0 }}>Service guide &amp; authority</h3>
              <div className="stack g6" style={{ fontSize: 13 }}>
                <div><strong>{c.service.name}</strong></div>
                <div style={{ color: "var(--c-text-muted)" }}>{c.service.summary}</div>
                <div className="row between" style={{ paddingTop: 6, borderTop: "1px solid var(--c-border-subtle)" }}>
                  <span style={{ color: "var(--c-text-muted)" }}>Authority:</span>
                  <strong>{c.service.authority}</strong>
                </div>
                <div className="row between">
                  <span style={{ color: "var(--c-text-muted)" }}>Channel:</span>
                  <span>{c.channel}</span>
                </div>
              </div>
              <Link href={`/services/${c.service.slug}`} className="c-btn c-btn-secondary c-btn-sm" style={{ alignSelf: "flex-start" }}>
                View full service guide →
              </Link>
            </div>
          </div>

          {/* Deliverables & Institutional Reference */}
          <div className="stack g16">
            <div className="console-panel stack g14" style={{ padding: 18 }}>
              <h3 className="console-section-title" style={{ margin: 0 }}>Official submission</h3>
              <div className="console-form-group">
                <label className="console-label" htmlFor="rq-channel">Channel</label>
                <select id="rq-channel" className="console-select" value={channel} onChange={(e) => setChannel(e.target.value)} disabled={finished}>
                  {[c.channel, ...CHANNELS].filter((v, i, a) => a.indexOf(v) === i).map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="console-form-group">
                <label className="console-label" htmlFor="rq-oref">Official reference / application no.</label>
                <input
                  id="rq-oref"
                  className="console-input tabular-nums"
                  value={officialRef}
                  onChange={(e) => setOfficialRef(e.target.value)}
                  placeholder="e.g. RDB-2026-99124"
                  disabled={finished}
                />
              </div>
              <button
                type="button"
                className="c-btn c-btn-primary c-btn-sm"
                style={{ alignSelf: "flex-start" }}
                disabled={finished || !officialRef.trim() || busy || !can("updateStatus")}
                onClick={() => attempt("Marked submitted with official ref", (reason) => markSubmitted(c.ref, channel, officialRef, reason))}
              >
                Save submission reference
              </button>
            </div>

            <div className="console-panel stack g14" style={{ padding: 18 }}>
              <h3 className="console-section-title" style={{ margin: 0 }}>Final deliverable (certificates)</h3>
              {c.deliverables.length === 0 ? (
                <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
                  No final document delivered yet. When ready, upload the certificate below.
                </span>
              ) : (
                c.deliverables.map((o) => (
                  <div key={o.id} className="row between g8 console-panel" style={{ padding: 10 }}>
                    <div className="stack" style={{ gap: 2 }}>
                      <strong style={{ fontSize: 13 }}>{o.name}</strong>
                      <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>Issued {fmtWhen(o.issuedAt, now)} · {o.issuedBy}</span>
                    </div>
                    {o.fileId && (
                      <a className="c-btn c-btn-secondary c-btn-sm" href={`/files/${o.fileId}`} target="_blank" rel="noopener">
                        <Icon name="download" size={14} /> Download
                      </a>
                    )}
                  </div>
                ))
              )}

              {can("complete") && !closed && (
                <div className="stack g8" style={{ paddingTop: 8, borderTop: "1px solid var(--c-border-subtle)" }}>
                  <label className="console-label" htmlFor="rq-dname">Deliverable name</label>
                  <input
                    id="rq-dname"
                    className="console-input"
                    value={deliverableName}
                    onChange={(e) => setDeliverableName(e.target.value)}
                    placeholder={`e.g. ${c.service.name} — ${c.profile.name}`}
                  />
                  <label className="c-btn c-btn-primary c-btn-sm" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
                    <Icon name="upload" size={14} /> Upload &amp; deliver to client
                    <input
                      id="rq-dfile"
                      type="file"
                      accept="image/*,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        uploadFile("deliverable", e.target.files?.[0], { name: deliverableName || `${c.service.name} — ${c.profile.name}` }, "Delivered to client");
                        setDeliverableName("");
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="console-panel stack g14" style={{ padding: 18 }}>
          <div className="row between g12">
            <h3 className="console-section-title" style={{ margin: 0 }}>Required documents checklist</h3>
            {can("reviewDocs") && !finished && (
              <label className="c-btn c-btn-secondary c-btn-sm" style={{ cursor: "pointer" }}>
                <Icon name="upload" size={14} /> Add other document
                <input
                  id="rq-docfile"
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    uploadFile("document", e.target.files?.[0], {}, "Document added");
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          <div className="stack g8">
            {c.documents.map((d) => (
              <div key={d.id} className="row between g12 console-panel" style={{ padding: 14 }}>
                <div className="stack grow" style={{ gap: 2 }}>
                  <div className="row g8">
                    <strong style={{ fontSize: 13.5 }}>{d.name}</strong>
                    <DocStatusBadge status={d.status} />
                    {d.required && <span className="c-badge c-badge-amber">Required</span>}
                  </div>
                  <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>
                    {d.file ? `${d.file.name} (${d.file.size}) · uploaded ${fmtWhen(d.file.uploadedAt, now)}` : d.note || "Not uploaded yet"}
                  </span>
                </div>

                <div className="row g8">
                  {d.file?.id && can("downloadDocs") && (
                    <a className="c-btn c-btn-secondary c-btn-sm" href={`/files/${d.file.id}`} target="_blank" rel="noopener">
                      <Icon name="eye" size={13} /> View
                    </a>
                  )}

                  {(d.status === "required" || d.status === "rejected") && !finished && can("reviewDocs") && (
                    <label className="c-btn c-btn-secondary c-btn-sm" style={{ cursor: "pointer" }} title="Add a copy the customer gave you in person or on WhatsApp">
                      <Icon name="upload" size={13} /> Add copy
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="sr-only"
                        aria-label={`Add ${d.name} for the customer`}
                        onChange={(e) => {
                          uploadFile("document", e.target.files?.[0], { docId: d.id }, `${d.name} added`);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}

                  {d.status === "received" && !finished && can("reviewDocs") && (
                    <>
                      <button
                        type="button"
                        className="c-btn c-btn-primary c-btn-sm"
                        disabled={busy}
                        onClick={() => run("Document approved", () => reviewDocument(c.ref, d.id, "approve"))}
                      >
                        <Icon name="check" size={13} /> Approve
                      </button>
                      <button
                        type="button"
                        className="c-btn c-btn-danger c-btn-sm"
                        disabled={busy}
                        onClick={() => setRejectDocId(d.id)}
                      >
                        Reject...
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "messages" && (
        <div className="console-panel stack g0" style={{ overflow: "hidden" }}>
          <div className="console-panel-header">
            <h3 className="console-section-title" style={{ margin: 0 }}>Conversation with {c.profile.name}</h3>
            <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>Customer portal + SMS</span>
          </div>

          <div className="stack g12" style={{ padding: 18, maxHeight: 420, overflowY: "auto" }}>
            {c.messages.length === 0 && (
              <span style={{ color: "var(--c-text-muted)", fontSize: 13 }}>No messages exchanged yet.</span>
            )}
            {c.messages.map((m) => {
              const staff = m.by !== "customer";
              return (
                <div key={m.id} className="row g10" style={{ alignItems: "flex-start", flexDirection: staff ? "row-reverse" : "row" }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: staff ? "var(--c-ember)" : "var(--c-border)",
                      color: staff ? "var(--c-surface)" : "var(--c-text)",
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {initials(m.name || "Client")}
                  </span>
                  <div className="stack g2" style={{ maxWidth: "80%", alignItems: staff ? "flex-end" : "flex-start" }}>
                    <span style={{ fontSize: 11.5, color: "var(--c-text-muted)" }}>
                      <strong>{m.by === me.id ? "You" : m.name}</strong> · {fmtWhen(m.at, now)}
                    </span>
                    <div
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        background: staff ? "var(--c-ember-bg)" : "var(--c-surface-hover)",
                        color: "var(--c-text)",
                        fontSize: 13.5,
                        lineHeight: 1.4,
                      }}
                    >
                      {m.body}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!finished && (
            <div className="stack g10" style={{ padding: "14px 18px", borderTop: "1px solid var(--c-border)", background: "var(--c-bg)" }}>
              <div className="row g6 wrapx">
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-muted)" }}>Templates:</span>
                {MESSAGE_TEMPLATES.map((qk) => (
                  <button
                    key={qk.id}
                    type="button"
                    className="c-btn c-btn-ghost c-btn-sm"
                    style={{ fontSize: 12 }}
                    onClick={() => setMsg(qk.body)}
                  >
                    {qk.label}
                  </button>
                ))}
              </div>
              <textarea
                id="rq-msg"
                aria-label="Message to the client"
                className="console-textarea"
                rows={3}
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Write message to client (appears in portal, send & wait also texts them)..."
              />
              <div className="row g8" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="c-btn c-btn-secondary c-btn-sm"
                  disabled={!msg.trim() || busy}
                  onClick={() => run("Message sent", () => messageCustomer(c.ref, msg, false), () => setMsg(""))}
                >
                  <Icon name="send" size={13} /> Send message
                </button>
                <button
                  type="button"
                  className="c-btn c-btn-primary c-btn-sm"
                  disabled={!msg.trim() || busy}
                  onClick={() => run("Message sent · waiting on client", () => messageCustomer(c.ref, msg, true), () => setMsg(""))}
                >
                  Send &amp; wait on customer
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "payments" && (
        <div className="grid cols-2" style={{ gap: 20, alignItems: "start" }}>
          {/* Fees Breakdown & Quote */}
          <div className="console-panel stack g14" style={{ padding: 18 }}>
            <div className="row between g8">
              <h3 className="console-section-title" style={{ margin: 0 }}>Fee breakdown (Two lines)</h3>
              <Link href={`/console/requests/${c.ref}/receipt`} className="c-btn c-btn-ghost c-btn-sm">Receipt</Link>
            </div>

            {c.billing.officialMode ? (
              <div className="row between g12" style={{ fontSize: 13.5 }}>
                <span className="row g6"><span className="c-fee-tag-official">Official</span> Official government fee</span>
                <strong>{c.billing.officialMode === "none" ? "None" : "Paid by the customer directly"}</strong>
              </div>
            ) : (
              <div className="console-form-group">
                <label className="console-label row g6" htmlFor="rq-official">
                  <span className="c-fee-tag-official">Official</span>
                  <span>Official government fee (RWF)</span>
                </label>
                <input
                  id="rq-official"
                  className="console-input tabular-nums"
                  inputMode="numeric"
                  value={officialFee}
                  disabled={finished || !can("recordOfficial")}
                  onChange={(e) => setOfficialFee(e.target.value.replace(/\D/g, ""))}
                  placeholder={c.service.official.label ?? "Amount for this case"}
                />
              </div>
            )}

            <div className="console-form-group">
              <label className="console-label row g6" htmlFor="rq-ours">
                <span className="c-fee-tag-ours">Inzira</span>
                <span>Assistance fee (RWF)</span>
              </label>
              <input
                id="rq-ours"
                className="console-input tabular-nums"
                inputMode="numeric"
                value={oursFee}
                disabled={finished || !can("recordOfficial")}
                onChange={(e) => setOursFee(e.target.value.replace(/\D/g, ""))}
              />
              <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>
                Price list: {rwf(c.billing.oursStandard)}
              </span>
            </div>

            {oursChanged && (
              <div style={{ background: "var(--c-amber-bg)", border: "1px solid var(--c-amber-border)", padding: 10, borderRadius: 4, fontSize: 12.5 }}>
                {can("changeOurs")
                  ? "Changing our fee will be written to the audit log."
                  : "Only a supervisor or administrator can change our fee on a case."}
              </div>
            )}

            <div className="row between" style={{ padding: "10px 0", borderTop: "1px solid var(--c-border)" }}>
              <strong>Customer total</strong>
              <strong className="tabular-nums" style={{ fontSize: 16 }}>
                {officialVal === null ? `${rwf(oursVal)} + official` : rwf(officialVal + oursVal)}
              </strong>
            </div>

            {feesDirty && (
              <button
                type="button"
                className="c-btn c-btn-secondary c-btn-sm"
                disabled={busy || (oursChanged && !can("changeOurs"))}
                onClick={() => run("Fees saved", () => saveFees(c.ref, officialVal, oursVal))}
              >
                Save fee adjustments
              </button>
            )}

            {c.billing.quote === "estimate" && (
              <button
                type="button"
                className="c-btn c-btn-primary c-btn-sm"
                disabled={finished || busy || (!c.billing.officialMode && officialVal === null) || (oursChanged && !can("changeOurs"))}
                onClick={() => run("Fees sent to customer", async () => {
                  // Amounts typed but not saved yet are what the agent means to send.
                  if (feesDirty) {
                    const saved = await saveFees(c.ref, officialVal, oursVal);
                    if (!saved.ok) return saved;
                  }
                  return sendQuote(c.ref);
                })}
              >
                Send confirmed quote to client
              </button>
            )}

            {c.billing.officialReceipt !== "na" && (
              <div className="row between g12 wrapx" style={{ paddingTop: 12, borderTop: "1px solid var(--c-border-subtle)" }}>
                <div className="stack" style={{ gap: 2 }}>
                  <strong style={{ fontSize: 13 }}>Official receipt</strong>
                  <span style={{ fontSize: 12.5, color: c.billing.officialReceipt === "attached" ? "var(--c-green)" : "var(--c-text-muted)" }}>
                    {c.billing.officialReceipt === "attached" ? "Attached" : "Not attached yet. Add the institution’s receipt once the official fee is paid."}
                  </span>
                </div>
                {can("recordOfficial") && !closed && (
                  <label className="c-btn c-btn-secondary c-btn-sm" style={{ cursor: "pointer" }}>
                    <Icon name="upload" size={14} /> {c.billing.officialReceipt === "attached" ? "Replace receipt" : "Attach receipt"}
                    <input
                      id="rq-receipt"
                      type="file"
                      accept="image/*,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        uploadFile("receipt", e.target.files?.[0], {}, "Official receipt attached");
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Transactions & Manual Payment */}
          <div className="console-panel stack g14" style={{ padding: 18 }}>
            <div className="row between g12">
              <h3 className="console-section-title" style={{ margin: 0 }}>Recorded transactions</h3>
              <button
                type="button"
                className="c-btn c-btn-primary c-btn-sm"
                onClick={() => setManualPayOpen(true)}
              >
                + Record payment by hand
              </button>
            </div>

            {c.billing.transactions.length === 0 ? (
              <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
                No payments recorded yet.
              </span>
            ) : (
              <div className="stack g8">
                {c.billing.transactions.map((tx, idx) => (
                  <div key={idx} className="console-panel stack g6" style={{ padding: 12 }}>
                    <div className="row between g8">
                      <span className="c-mono-ref">{tx.receipt}</span>
                      <span className="c-badge c-badge-green">{tx.status}</span>
                    </div>
                    <div className="row between g8" style={{ fontSize: 13 }}>
                      <span>{tx.method} · {fmtWhen(tx.at, now)}</span>
                      <strong className="tabular-nums">{rwf(tx.official + tx.ours)}</strong>
                    </div>
                    <div className="row between g8" style={{ fontSize: 12, color: "var(--c-text-muted)" }}>
                      <span>Inzira: {rwf(tx.ours)}</span>
                      <span>Official: {rwf(tx.official)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="grid cols-2" style={{ gap: 20, alignItems: "start" }}>
          {/* Internal Notes */}
          <div className="console-panel stack g14" style={{ padding: 18 }}>
            <h3 className="console-section-title" style={{ margin: 0 }}>Internal staff notes</h3>
            <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>
              Private notes among staff. Never visible to the client.
            </span>

            <div className="stack g8" style={{ maxHeight: 280, overflowY: "auto" }}>
              {c.notes.length === 0 && (
                <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>No internal notes yet.</span>
              )}
              {c.notes.map((n) => (
                <div key={n.id} className="console-panel stack g4" style={{ padding: 10, background: "var(--c-bg)" }}>
                  <div className="row between g8" style={{ fontSize: 12, color: "var(--c-text-muted)" }}>
                    <strong>{n.name}</strong>
                    <span>{fmtWhen(n.at, now)}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>{n.body}</div>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (internalNote.trim()) {
                  run("Note saved", () => addNote(c.ref, internalNote), () => setInternalNote(""));
                }
              }}
              className="stack g8"
            >
              <textarea
                id="rq-note"
                aria-label="Private staff note"
                className="console-textarea"
                rows={2}
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Add private staff note..."
              />
              <button
                type="submit"
                className="c-btn c-btn-secondary c-btn-sm"
                style={{ alignSelf: "flex-end" }}
                disabled={!internalNote.trim() || busy}
              >
                Save note
              </button>
            </form>
          </div>

          {/* Activity Timeline */}
          <div className="console-panel stack g14" style={{ padding: 18 }}>
            <h3 className="console-section-title" style={{ margin: 0 }}>Audit &amp; event history</h3>
            <Timeline events={c.events} now={now} />
          </div>
        </div>
      )}

      {/* Payment lock override: supervisor or owner, with a reason kept on the case and in the audit log */}
      <ConfirmDialog
        open={!!override}
        onClose={() => setOverride(null)}
        onConfirm={(reason) => { if (override) run(override.ok, () => override.fn(reason), () => setOverride(null)); }}
        title="Move without payment?"
        description={`${lock.feesKnown ? `${rwf(lock.due)} is still due from the customer.` : "The fees have not been confirmed yet."} Moving on anyway is kept on the case and in the audit log with your reason.`}
        confirmLabel="Move anyway"
        confirmVariant="danger"
        requireReason
        reasonLabel="Reason (kept on the case)"
        reasonPlaceholder="e.g. Corporate client, paying by bank transfer on Friday."
        busy={busy}
      />

      {/* Reject Document Dialog */}
      <ConfirmDialog
        open={!!rejectDocId}
        onClose={() => setRejectDocId(null)}
        onConfirm={(reason) => {
          if (rejectDocId) {
            run("Document rejected · client notified", () => reviewDocument(c.ref, rejectDocId, "reject", reason), () => setRejectDocId(null));
          }
        }}
        title="Reject document with reason"
        description="Write the reason why this document was rejected. The case will be put on hold and the client will be notified to replace it."
        confirmLabel="Send rejection"
        confirmVariant="danger"
        requireReason
        reasonLabel="Reason for rejection (visible to client)"
        reasonPlaceholder="e.g. Image is blurry or edges are cut off..."
        busy={busy}
      />

      {/* Close Case Dialog */}
      <ConfirmDialog
        open={closeDialogOpen}
        onClose={() => setCloseDialogOpen(false)}
        onConfirm={(reason) => {
          run(closeKind === "rejected" ? "Rejection recorded · client notified" : "Case closed · client notified", () => closeCase(c.ref, closeKind, reason), () => setCloseDialogOpen(false));
        }}
        title={`Close request ${c.ref}`}
        description="The client is told by SMS and sees your reason in their portal. Refunds are issued by Finance from Admin › Payments."
        confirmLabel="Close case"
        confirmVariant="danger"
        requireReason
        reasonLabel="Reason the client will see"
        reasonPlaceholder={closeKind === "rejected" ? "e.g. RDB refused the company name: it is already registered." : "e.g. Client withdrew the application."}
        busy={busy}
      >
        <fieldset className="stack g4" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="console-label" style={{ marginBottom: 4 }}>How did it end?</legend>
          {([["cancelled", "Cancelled (by the client or by Inzira)"], ["rejected", "Rejected by the institution"]] as const).map(([kind, label]) => (
            <label key={kind} className="row g8" style={{ minHeight: 36, fontSize: 13.5, cursor: "pointer" }}>
              <input type="radio" name="close-kind" value={kind} checked={closeKind === kind} onChange={() => setCloseKind(kind)} />
              {label}
            </label>
          ))}
        </fieldset>
      </ConfirmDialog>

      <FollowUpDialog
        open={followOpen}
        initial={c.followUp}
        busy={busy}
        onClose={() => setFollowOpen(false)}
        onSave={(at, what) => run(`Reminder set for ${fmtWhen(at, now)}`, () => scheduleFollowUp(c.ref, what, at), () => setFollowOpen(false))}
        onClear={() => run("Reminder cleared", () => clearFollowUp(c.ref), () => setFollowOpen(false))}
      />

      <ConfirmDialog
        open={handoverFor !== null}
        onClose={() => setHandoverFor(null)}
        onConfirm={(reason) => {
          const id = handoverFor;
          if (!id) return;
          run(`Assigned to ${shortName(agents.find((a) => a.id === id)?.name ?? "")}`, () => assignCase(c.ref, id, reason), () => setHandoverFor(null));
        }}
        title="Handover this case"
        description={`Tell ${shortName(agents.find((a) => a.id === handoverFor)?.name ?? "the next agent")} what you already did and what is left.`}
        confirmLabel="Assign with handover"
        requireReason
        reasonLabel="Handover note"
        reasonPlaceholder="e.g. ID approved. Waiting on the lease. Official fee not quoted yet."
        busy={busy}
      />

      {/* Record Manual Payment Modal */}
      <RecordPaymentModal
        open={manualPayOpen}
        onClose={() => setManualPayOpen(false)}
        prefilledRef={c.ref}
        onSuccess={(msg) => setToast(msg)}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </div>
  );
}
