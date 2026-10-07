"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addNote,
  assignCase,
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
import { Icon } from "@/components/ui";
import { billOfficial, billOurs, fmtAgo, fmtMonth, fmtWhen, initials, rwf, shortName } from "@/lib/format";
import type { Permission } from "@/lib/permissions";
import { payStatus, stageLabel } from "@/lib/status";
import type { Closed, RequestView, Staff, Stage } from "@/lib/types";
import { RequestStatusBadge, PaymentStatusBadge, DocStatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { Timeline } from "./Timeline";
import { Toast } from "./Toast";
import { RecordPaymentModal } from "./RecordPaymentModal";

const CHANNELS = ["Irembo", "RRA e-Tax", "RRA EBM", "RDB online registration", "RURA online services", "In person"];

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
  const router = useRouter();
  const [busy, start] = useTransition();
  const can = (p: Permission) => perms.includes(p) || me.role === "Owner";

  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "messages" | "payments" | "activity">("overview");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  // Modals & sub-state
  const [rejectDocId, setRejectDocId] = useState<string | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [manualPayOpen, setManualPayOpen] = useState(false);

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
      router.refresh();
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
                  run(val ? `Assigned to ${shortName(agents.find((a) => a.id === val)?.name ?? "")}` : "Unassigned", () => assignCase(c.ref, val));
                }}
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.id === me.id ? " (me)" : ""}</option>
                ))}
              </select>
            </div>

            {hold && !finished && (
              <button
                type="button"
                className="c-btn c-btn-secondary c-btn-sm"
                disabled={busy || !can("updateStatus")}
                onClick={() => run("Hold cleared", () => clearHold(c.ref))}
              >
                Clear hold
              </button>
            )}

            {!finished && can("complete") && (
              <button
                type="button"
                className="c-btn c-btn-primary c-btn-sm"
                disabled={busy}
                onClick={() => run("Case completed · client notified", () => setStage(c.ref, "completed", "", true))}
              >
                <Icon name="check" size={14} />
                <span>Complete</span>
              </button>
            )}

            {!finished && can("complete") && (
              <button
                type="button"
                className="c-btn c-btn-danger c-btn-sm"
                onClick={() => setCloseDialogOpen(true)}
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
              const state = active ? (finished ? "done" : "current") : isPast || finished ? "done" : "todo";
              return (
                <li key={st} className={`c-step is-${state}`}>
                  <button
                    type="button"
                    className="c-step-btn"
                    aria-current={active ? "step" : undefined}
                    disabled={finished || active || busy || !can("updateStatus")}
                    onClick={() => run(`Moved to ${stageLabel(c, st)}`, () => setStage(c.ref, st, "", true))}
                    title={active ? "Current stage" : `Move to ${stageLabel(c, st)}`}
                  >
                    <span className="c-step-dot">{state === "done" ? <Icon name="check" size={12} stroke={2.6} /> : idx + 1}</span>
                    <span className="c-step-label">{stageLabel(c, st)}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="row g6">
            <button
              type="button"
              className="c-btn c-btn-secondary c-btn-sm"
              disabled={finished || busy}
              onClick={() => run("Follow-up set for tomorrow 10:00", () => scheduleFollowUp(c.ref, `Follow up on ${c.ref}`))}
            >
              <Icon name="clock" size={13} />
              <span>Follow-up</span>
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
            onClick={() => setActiveTab(tab.id as any)}
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
                <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>Phone:</span><strong>{c.account.phone}</strong></div>
                {c.profile.district && <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>District:</span><span>{c.profile.district}</span></div>}
                {c.profile.idMasked && <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>National ID:</span><span className="tabular-nums">{c.profile.idMasked}</span></div>}
                {c.purpose && <div className="row between"><span style={{ color: "var(--c-text-muted)" }}>Purpose:</span><span>{c.purpose}</span></div>}
              </div>
              <div className="row g8">
                <a className="c-btn c-btn-secondary c-btn-sm grow" href={`tel:+${phone}`}><Icon name="phone" size={14} /> Call</a>
                <a className="c-btn c-btn-secondary c-btn-sm grow" href={`https://wa.me/${phone}`} target="_blank" rel="noopener"><Icon name="msg" size={14} /> WhatsApp</a>
              </div>
            </div>

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
                <label className="console-label">Channel</label>
                <select className="console-select" value={channel} onChange={(e) => setChannel(e.target.value)} disabled={finished}>
                  {[c.channel, ...CHANNELS].filter((v, i, a) => a.indexOf(v) === i).map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="console-form-group">
                <label className="console-label">Official reference / application no.</label>
                <input
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
                onClick={() => run("Marked submitted with official ref", () => markSubmitted(c.ref, channel, officialRef))}
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
                  <label className="console-label">Deliverable name</label>
                  <input
                    className="console-input"
                    value={deliverableName}
                    onChange={(e) => setDeliverableName(e.target.value)}
                    placeholder={`e.g. ${c.service.name} — ${c.profile.name}`}
                  />
                  <label className="c-btn c-btn-primary c-btn-sm" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
                    <Icon name="upload" size={14} /> Upload &amp; deliver to client
                    <input
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
                <Icon name="upload" size={14} /> Upload customer copy
                <input
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
            <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>Customer portal + email</span>
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
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-muted)" }}>Canned replies:</span>
                {["Mwiriwe, please upload a clearer copy of your ID.", "Official application submitted, awaiting approval."].map((qk) => (
                  <button
                    key={qk}
                    type="button"
                    className="c-btn c-btn-ghost c-btn-sm"
                    style={{ fontSize: 12 }}
                    onClick={() => setMsg(qk)}
                  >
                    “{qk.slice(0, 30)}...”
                  </button>
                ))}
              </div>
              <textarea
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
            <h3 className="console-section-title" style={{ margin: 0 }}>Fee breakdown (Two lines)</h3>

            <div className="console-form-group">
              <label className="console-label row g6">
                <span className="c-fee-tag-official">Official</span>
                <span>Official government fee (RWF)</span>
              </label>
              <input
                className="console-input tabular-nums"
                inputMode="numeric"
                value={officialFee}
                disabled={finished || !can("recordOfficial")}
                onChange={(e) => setOfficialFee(e.target.value.replace(/\D/g, ""))}
                placeholder={c.service.official.label ?? "Amount for this case"}
              />
            </div>

            <div className="console-form-group">
              <label className="console-label row g6">
                <span className="c-fee-tag-ours">Inzira</span>
                <span>Assistance fee (RWF)</span>
              </label>
              <input
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
                disabled={finished || busy || (!c.billing.officialMode && officialVal === null)}
                onClick={() => run("Fees sent to customer", () => sendQuote(c.ref))}
              >
                Send confirmed quote to client
              </button>
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
          run("Case closed", () => closeCase(c.ref, "cancelled", reason), () => setCloseDialogOpen(false));
        }}
        title={`Close request ${c.ref}`}
        description="The case will be marked as cancelled and the client will see your explanation."
        confirmLabel="Confirm close"
        confirmVariant="danger"
        requireReason
        reasonLabel="Reason for closing"
        reasonPlaceholder="e.g. Client withdrew application..."
        busy={busy}
      />

      {/* Record Manual Payment Modal */}
      <RecordPaymentModal
        open={manualPayOpen}
        onClose={() => setManualPayOpen(false)}
        prefilledRef={c.ref}
        onSuccess={(msg) => {
          setToast(msg);
          router.refresh();
        }}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </div>
  );
}
