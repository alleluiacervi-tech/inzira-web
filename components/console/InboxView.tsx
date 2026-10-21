"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { acceptAndAssignRequest, declineRequest, quoteCustomRequest } from "@/app/actions/console";
import { messageCustomer } from "@/app/actions/agent";
import { Icon } from "@/components/ui";
import { customerWhatsAppUrl } from "@/lib/desk";
import { fmtAgo, fmtWhen, initials, rwf, shortName } from "@/lib/format";
import { amountDue, paidSplit } from "@/lib/status";
import type { RequestView, Staff } from "@/lib/types";
import { RequestStatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { SidePanel } from "./SidePanel";
import { Toast } from "./Toast";

const paidTotal = (r: RequestView) => { const p = paidSplit(r.billing); return p.official + p.ours; };

export function InboxView({
  requests: queue,
  checkouts,
  agents,
  meId,
  now,
}: {
  requests: RequestView[];
  /** Started at checkout and not paid: people to follow up, not work. Not assignable until paid. */
  checkouts: RequestView[];
  agents: Staff[];
  /** The signed-in person: offered first, so a one-person team takes its own requests in one tap. */
  meId: string;
  now: string;
}) {
  const [busy, start] = useTransition();
  const [tab, setTab] = useState<"ready" | "unpaid">("ready");
  // Paid first: money is in and the customer was promised a reply. The rest, oldest first.
  const requests = [...queue].sort((a, b) => Number(b.checkout === "paid") - Number(a.checkout === "paid"));
  const [selectedReq, setSelectedReq] = useState<RequestView | null>(null);
  const [assignReq, setAssignReq] = useState<RequestView | null>(null);
  const [declineReq, setDeclineReq] = useState<RequestView | null>(null);
  const [infoReq, setInfoReq] = useState<RequestView | null>(null);
  const [quoteReq, setQuoteReq] = useState<RequestView | null>(null);
  const [chosenAgentId, setChosenAgentId] = useState("");
  const [toast, setToast] = useState("");

  // Quote modal fields
  const [quoteOfficial, setQuoteOfficial] = useState("");
  const [quoteOurs, setQuoteOurs] = useState("");
  const [quoteNote, setQuoteNote] = useState("");

  const canTake = agents.some((a) => a.id === meId);
  const others = agents.filter((a) => a.id !== meId);

  const handleAcceptAssign = (req: RequestView, agentId: string) => {
    start(async () => {
      const res = await acceptAndAssignRequest(req.ref, agentId);
      if (res.ok) {
        setAssignReq(null);
        setSelectedReq(null);
        setToast(agentId === meId ? `You took ${req.ref}.` : `Request ${req.ref} assigned to ${shortName(agents.find((a) => a.id === agentId)?.name ?? "agent")}.`);
      } else setToast(res.error);
    });
  };

  const handleDecline = (reason: string) => {
    if (!declineReq) return;
    start(async () => {
      const res = await declineRequest(declineReq.ref, reason);
      if (res.ok) {
        setDeclineReq(null);
        setSelectedReq(null);
        setToast(`Request ${declineReq.ref} declined.`);
      }
    });
  };

  const handleRequestInfo = (question: string) => {
    if (!infoReq) return;
    start(async () => {
      const res = await messageCustomer(infoReq.ref, question, true);
      if (res.ok) {
        setInfoReq(null);
        setSelectedReq(null);
        setToast(`Message sent. Request ${infoReq.ref} is waiting on customer.`);
      }
    });
  };

  const handleQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteReq) return;
    start(async () => {
      const off = quoteOfficial ? Number(quoteOfficial) : null;
      const ours = Number(quoteOurs) || quoteReq.billing.oursStandard;
      const res = await quoteCustomRequest(quoteReq.ref, off, ours, quoteNote);
      if (res.ok) {
        setQuoteReq(null);
        setSelectedReq(null);
        setToast(`Custom quote sent for ${quoteReq.ref}.`);
      }
    });
  };

  return (
    <div className="stack g18">
      {/* Header */}
      <div className="row between g16 wrapx">
        <div className="stack" style={{ gap: 2 }}>
          <h1 className="console-page-title">Inbox / Triage</h1>
          <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
            New requests waiting for an agent. Paid ones come first.
          </span>
        </div>
      </div>

      <div className="row console-tabs c-tabs" role="tablist" aria-label="Inbox">
        <button type="button" role="tab" className="c-tab" aria-selected={tab === "ready"} aria-controls="inbox-ready" onClick={() => setTab("ready")} data-tab="ready">
          <Icon name="inbox" size={15} /> Ready to work <span className="c-badge c-badge-neutral">{requests.length}</span>
        </button>
        <button type="button" role="tab" className="c-tab" aria-selected={tab === "unpaid"} aria-controls="inbox-unpaid" onClick={() => setTab("unpaid")} data-tab="unpaid">
          <Icon name="card" size={15} /> Awaiting payment <span className="c-badge c-badge-neutral">{checkouts.length}</span>
        </button>
      </div>

      {tab === "unpaid" && (
        <div id="inbox-unpaid" role="tabpanel" className="stack g10">
          <span style={{ fontSize: 13, color: "var(--c-text-muted)", lineHeight: 1.5 }}>
            Customers who started a fixed-price request and have not paid. These are not in anyone&rsquo;s queue and cannot be worked on.
            Each customer gets one reminder, and the request closes on its own after three days.
          </span>
          {checkouts.length === 0 ? (
            <div className="console-panel stack g8" style={{ padding: 40, textAlign: "center", alignItems: "center" }}>
              <Icon name="check" size={28} color="var(--c-green)" />
              <strong style={{ fontSize: 14.5 }}>No unpaid checkouts</strong>
              <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>Everyone who started a fixed-price request has paid.</span>
            </div>
          ) : checkouts.map((r) => {
            const wa = customerWhatsAppUrl(r.account.phone, r.ref);
            const pending = r.billing.transactions.some((t) => t.status === "pending");
            return (
              <div key={r.ref} className="console-panel row between g16 wrapx" style={{ padding: 16 }} data-checkout={r.ref}>
                <div className="stack grow" style={{ gap: 6, minWidth: 240 }}>
                  <div className="row g8 wrapx">
                    <span className="c-mono-ref">{r.ref}</span>
                    <strong style={{ fontSize: 14 }}>{r.profile.name}</strong>
                    {pending
                      ? <span className="c-badge c-badge-blue"><Icon name="phone" size={12} /><span>Approving on phone</span></span>
                      : <span className="c-badge c-badge-amber"><Icon name="clock" size={12} /><span>Unpaid</span></span>}
                    <span className="c-caption">started {fmtAgo(r.openedAt, now).toLowerCase()}</span>
                  </div>
                  <div className="row g10 wrapx" style={{ fontSize: 13 }}>
                    <strong style={{ color: "var(--c-text)" }}>{r.name}</strong>
                    <span className="tabular-nums" style={{ color: "var(--c-text)" }}>· {rwf(amountDue(r.billing))}</span>
                    <span style={{ color: "var(--c-text-muted)", overflowWrap: "anywhere" }}>· {[r.account.email, r.account.phone].filter(Boolean).join(" · ")}</span>
                  </div>
                </div>
                <div className="row g8 wrapx" style={{ alignItems: "center" }}>
                  {wa && <a className="c-btn c-btn-secondary c-btn-sm" href={wa} target="_blank" rel="noopener"><Icon name="whatsapp" size={13} /><span>WhatsApp</span></a>}
                  {r.account.phone && <a className="c-btn c-btn-secondary c-btn-sm" href={`tel:${r.account.phone.replace(/\s/g, "")}`}><Icon name="call" size={13} /><span>Call</span></a>}
                  {r.account.email && <a className="c-btn c-btn-secondary c-btn-sm" href={`mailto:${r.account.email}?subject=${encodeURIComponent(`Your Inzira request ${r.ref}`)}`}><Icon name="mail" size={13} /><span>Email</span></a>}
                  <Link className="c-btn c-btn-ghost c-btn-sm" href={`/console/requests/${r.ref}`}>Open</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Requests List */}
      {tab === "unpaid" ? null : requests.length === 0 ? (
        <div className="console-panel stack g8" style={{ padding: 48, textAlign: "center", alignItems: "center" }}>
          <Icon name="check" size={32} color="var(--c-green)" />
          <strong style={{ fontSize: 15 }}>All caught up!</strong>
          <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
            There are no unassigned requests waiting in the triage queue.
          </span>
        </div>
      ) : (
        <div id="inbox-ready" role="tabpanel" className="stack g10">
          {requests.map((r) => {
            const ageHours = Math.round((Date.parse(now) - Date.parse(r.openedAt)) / (3600 * 1000));
            const isUrgent = ageHours > 2;

            return (
              <div
                key={r.ref}
                className="console-panel row between g16 wrapx"
                style={{
                  padding: 16,
                  borderLeft: isUrgent ? "4px solid var(--c-ember)" : "1px solid var(--c-border)",
                }}
              >
                {/* Left: Ref, Customer, Service details */}
                <div className="stack grow" style={{ gap: 6, minWidth: 260 }}>
                  <div className="row g8 wrapx">
                    <span className="c-mono-ref">{r.ref}</span>
                    <strong style={{ fontSize: 14 }}>{r.profile.name}</strong>
                    <span className="c-badge c-badge-neutral">{r.profile.kind}</span>
                    <RequestStatusBadge r={r} viewer="staff" />
                    {r.checkout === "paid"
                      ? paidTotal(r) > 0
                        ? <span className="c-badge c-badge-green" data-paid><Icon name="card" size={12} /><span>Paid {rwf(paidTotal(r))}</span></span>
                        : <span className="c-badge c-badge-neutral" data-paid>Refunded</span>
                      : r.billing.quote === "estimate" && <span className="c-badge c-badge-neutral">Needs a quote</span>}
                    {isUrgent && (
                      <span className="c-badge c-badge-amber">
                        <Icon name="clock" size={12} />
                        <span>Waiting {ageHours}h</span>
                      </span>
                    )}
                  </div>
                  <div className="row g10 wrapx" style={{ fontSize: 13 }}>
                    <strong style={{ color: "var(--c-text)" }}>{r.name}</strong>
                    <span style={{ color: "var(--c-text-muted)" }}>· {r.channel}</span>
                    <span style={{ color: "var(--c-text-muted)", overflowWrap: "anywhere" }}>· Contact: {r.account.phone || r.account.email || "none given"}</span>
                  </div>
                  {r.purpose && (
                    <div style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>
                      Purpose: “{r.purpose}”
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="row g8 wrapx" style={{ alignItems: "center" }}>
                  <button
                    type="button"
                    className="c-btn c-btn-secondary c-btn-sm"
                    onClick={() => setSelectedReq(r)}
                  >
                    Quick look
                  </button>

                  <button
                    type="button"
                    className="c-btn c-btn-secondary c-btn-sm"
                    onClick={() => setInfoReq(r)}
                    title="Ask client for more information"
                  >
                    <Icon name="msg" size={13} />
                    <span>Ask info</span>
                  </button>

                  {r.checkout !== "paid" && <button
                    type="button"
                    className="c-btn c-btn-secondary c-btn-sm"
                    onClick={() => {
                      setQuoteReq(r);
                      setQuoteOfficial(r.billing.official ? String(r.billing.official) : "");
                      setQuoteOurs(String(r.billing.oursStandard));
                    }}
                    title="Quote fees"
                  >
                    <Icon name="card" size={13} />
                    <span>Quote</span>
                  </button>}

                  <button
                    type="button"
                    className="c-btn c-btn-danger c-btn-sm"
                    onClick={() => setDeclineReq(r)}
                    title="Decline request"
                  >
                    Decline
                  </button>

                  {others.length > 0 && (
                    <button
                      type="button"
                      className={`c-btn ${canTake ? "c-btn-secondary" : "c-btn-primary"} c-btn-sm`}
                      onClick={() => {
                        setAssignReq(r);
                        setChosenAgentId(canTake ? meId : others[0].id);
                      }}
                    >
                      <Icon name="users" size={13} />
                      <span>{canTake ? "Assign…" : "Accept & assign"}</span>
                    </button>
                  )}
                  {canTake && (
                    <button
                      type="button"
                      className="c-btn c-btn-primary c-btn-sm"
                      disabled={busy}
                      onClick={() => handleAcceptAssign(r, meId)}
                    >
                      <Icon name="check" size={13} />
                      <span>Accept &amp; take it</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SidePanel for Quick Look */}
      <SidePanel
        open={!!selectedReq}
        onClose={() => setSelectedReq(null)}
        title={selectedReq ? `${selectedReq.ref} · ${selectedReq.profile.name}` : ""}
        subtitle={selectedReq?.name}
        footer={
          selectedReq && (
            <div className="row g8">
              <Link href={`/console/requests/${selectedReq.ref}`} className="c-btn c-btn-secondary c-btn-sm">
                Open full page →
              </Link>
              {canTake && others.length === 0 ? (
                <button type="button" className="c-btn c-btn-primary c-btn-sm" disabled={busy} onClick={() => handleAcceptAssign(selectedReq, meId)}>
                  Accept &amp; take it
                </button>
              ) : (
                <button
                  type="button"
                  className="c-btn c-btn-primary c-btn-sm"
                  disabled={!agents.length}
                  onClick={() => {
                    const req = selectedReq;
                    setSelectedReq(null);
                    setAssignReq(req);
                    setChosenAgentId(canTake ? meId : agents[0]?.id ?? "");
                  }}
                >
                  Accept &amp; assign
                </button>
              )}
            </div>
          )
        }
      >
        {selectedReq && (
          <div className="stack g16">
            <div className="stack g4">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Customer info</span>
              <div className="stack g2" style={{ fontSize: 13 }}>
                <strong>{selectedReq.profile.name}</strong>
                <span style={{ color: "var(--c-text-muted)" }}>Phone: {selectedReq.account.phone}</span>
                {selectedReq.profile.district && <span style={{ color: "var(--c-text-muted)" }}>District: {selectedReq.profile.district}</span>}
              </div>
            </div>

            <div className="stack g4">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Service &amp; Channel</span>
              <div className="stack g2" style={{ fontSize: 13 }}>
                <strong>{selectedReq.service.name}</strong>
                <span style={{ color: "var(--c-text-muted)" }}>Authority: {selectedReq.service.authority}</span>
                <span style={{ color: "var(--c-text-muted)" }}>Channel: {selectedReq.channel}</span>
              </div>
            </div>

            <div className="stack g4">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Documents Uploaded ({selectedReq.documents.length})</span>
              {selectedReq.documents.map((d) => (
                <div key={d.id} className="row between g8" style={{ padding: "6px 0", borderBottom: "1px solid var(--c-border-subtle)", fontSize: 13 }}>
                  <span>{d.name}</span>
                  <span className="c-badge c-badge-neutral">{d.status}</span>
                </div>
              ))}
            </div>

            <div className="stack g4">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Pricing</span>
              <div className="stack g4 console-panel" style={{ padding: 12, background: "var(--c-bg)" }}>
                <div className="c-fee-line">
                  <span className="row g6"><span className="c-fee-tag-official">Official</span> Government fee</span>
                  <strong>{selectedReq.billing.official ? rwf(selectedReq.billing.official) : "Confirmed per case"}</strong>
                </div>
                <div className="c-fee-line">
                  <span className="row g6"><span className="c-fee-tag-ours">Inzira</span> Assistance fee</span>
                  <strong style={{ color: "var(--c-ember)" }}>{rwf(selectedReq.billing.ours)}</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </SidePanel>

      {/* Assign Modal with Recommendation */}
      {assignReq && (
        <div className="console-dialog-overlay" onClick={() => setAssignReq(null)}>
          <div className="console-dialog stack" onClick={(e) => e.stopPropagation()}>
            <div className="console-panel-header">
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Assign {assignReq.ref}
              </h3>
              <button type="button" className="c-btn c-btn-ghost c-btn-sm c-btn-icon" onClick={() => setAssignReq(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="console-panel-body stack g14">
              <div style={{ fontSize: 13.5, color: "var(--c-text-muted)" }}>
                Select an agent to handle <strong>{assignReq.name}</strong> for <strong>{assignReq.profile.name}</strong>.
              </div>

              <div className="console-form-group">
                <label className="console-label">Choose agent</label>
                <select
                  className="console-select"
                  value={chosenAgentId}
                  onChange={(e) => setChosenAgentId(e.target.value)}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id === meId ? `Me (${a.name})` : `${a.name} (${a.team})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid var(--c-border)",
                background: "var(--c-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button type="button" className="c-btn c-btn-secondary" onClick={() => setAssignReq(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="c-btn c-btn-primary"
                disabled={busy || !chosenAgentId}
                onClick={() => handleAcceptAssign(assignReq, chosenAgentId)}
              >
                {busy ? "Assigning..." : "Confirm & assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Dialog with Mandatory Reason */}
      <ConfirmDialog
        open={!!declineReq}
        onClose={() => setDeclineReq(null)}
        onConfirm={handleDecline}
        title={`Decline ${declineReq?.ref}`}
        description="The customer will receive an SMS and a portal notification explaining why their request was declined."
        confirmLabel="Decline request"
        confirmVariant="danger"
        requireReason
        reasonLabel="Reason for declining (visible to customer)"
        reasonPlaceholder="e.g. Incomplete information provided or out of jurisdiction..."
        busy={busy}
      />

      {/* Ask Info Dialog */}
      <ConfirmDialog
        open={!!infoReq}
        onClose={() => setInfoReq(null)}
        onConfirm={handleRequestInfo}
        title={`Ask for more information on ${infoReq?.ref}`}
        description="Write the question or document request. The request will be put on hold until the client replies."
        confirmLabel="Send question & wait"
        requireReason
        reasonLabel="Question for customer"
        reasonPlaceholder="e.g. Please clarify your company's primary business activity..."
        busy={busy}
      />

      {/* Quote Custom Fees Dialog */}
      {quoteReq && (
        <div className="console-dialog-overlay" onClick={() => setQuoteReq(null)}>
          <div className="console-dialog stack" onClick={(e) => e.stopPropagation()}>
            <div className="console-panel-header">
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Quote fees for {quoteReq.ref}</h3>
              <button type="button" className="c-btn c-btn-ghost c-btn-sm c-btn-icon" onClick={() => setQuoteReq(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <form onSubmit={handleQuote}>
              <div className="console-panel-body stack g14">
                <div style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
                  Set confirmed amounts for <strong>{quoteReq.name}</strong>. The client sees both lines and approves before paying.
                </div>

                <div className="console-form-group">
                  <label className="console-label">Official government fee (RWF)</label>
                  <input
                    className="console-input tabular-nums"
                    inputMode="numeric"
                    value={quoteOfficial}
                    onChange={(e) => setQuoteOfficial(e.target.value.replace(/\D/g, ""))}
                    placeholder="0 if none or direct"
                  />
                </div>

                <div className="console-form-group">
                  <label className="console-label">Inzira assistance fee (RWF) *</label>
                  <input
                    className="console-input tabular-nums"
                    inputMode="numeric"
                    value={quoteOurs}
                    onChange={(e) => setQuoteOurs(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>

                <div className="console-form-group">
                  <label className="console-label">Calculation note (optional)</label>
                  <input
                    className="console-input"
                    value={quoteNote}
                    onChange={(e) => setQuoteNote(e.target.value)}
                    placeholder="e.g. 2 parcels × RWF 5,000"
                  />
                </div>
              </div>

              <div
                style={{
                  padding: "12px 18px",
                  borderTop: "1px solid var(--c-border)",
                  background: "var(--c-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <button type="button" className="c-btn c-btn-secondary" onClick={() => setQuoteReq(null)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="c-btn c-btn-primary" disabled={busy || !quoteOurs}>
                  {busy ? "Sending quote..." : "Send quote to customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </div>
  );
}
