"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptAndAssignRequest, declineRequest, quoteCustomRequest } from "@/app/actions/console";
import { messageCustomer } from "@/app/actions/agent";
import { Icon } from "@/components/ui";
import { fmtAgo, fmtWhen, initials, rwf, shortName } from "@/lib/format";
import type { RequestView, Staff } from "@/lib/types";
import { RequestStatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { SidePanel } from "./SidePanel";
import { Toast } from "./Toast";

export function InboxView({
  requests,
  agents,
  now,
}: {
  requests: RequestView[];
  agents: Staff[];
  now: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
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

  // Agent recommendation helper: lowest workload in matching category or overall
  const recommendAgent = (req: RequestView) => {
    const category = req.service.category;
    // Agents matching team or lowest load
    const matching = agents.filter((a) => a.active && a.role === "Agent");
    if (!matching.length) return agents[0];
    return matching[0];
  };

  const handleAcceptAssign = (req: RequestView, agentId: string) => {
    start(async () => {
      const res = await acceptAndAssignRequest(req.ref, agentId);
      if (res.ok) {
        setAssignReq(null);
        setSelectedReq(null);
        setToast(`Request ${req.ref} assigned to ${shortName(agents.find((a) => a.id === agentId)?.name ?? "agent")}.`);
        router.refresh();
      }
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
        router.refresh();
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
        router.refresh();
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
        router.refresh();
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
            New customer submissions awaiting assignment and initial review. ({requests.length} open)
          </span>
        </div>
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <div className="console-panel stack g8" style={{ padding: 48, textAlign: "center", alignItems: "center" }}>
          <Icon name="check" size={32} color="var(--c-green)" />
          <strong style={{ fontSize: 15 }}>All caught up!</strong>
          <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
            There are no unassigned requests waiting in the triage queue.
          </span>
        </div>
      ) : (
        <div className="stack g10">
          {requests.map((r) => {
            const suggested = recommendAgent(r);
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
                    <span style={{ color: "var(--c-text-muted)" }}>· Contact: {r.account.phone}</span>
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

                  <button
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
                  </button>

                  <button
                    type="button"
                    className="c-btn c-btn-danger c-btn-sm"
                    onClick={() => setDeclineReq(r)}
                    title="Decline request"
                  >
                    Decline
                  </button>

                  <button
                    type="button"
                    className="c-btn c-btn-primary c-btn-sm"
                    onClick={() => {
                      setAssignReq(r);
                      setChosenAgentId(suggested?.id ?? agents[0]?.id ?? "");
                    }}
                  >
                    <Icon name="user" size={13} />
                    <span>Accept &amp; assign</span>
                  </button>
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
              <button
                type="button"
                className="c-btn c-btn-primary c-btn-sm"
                onClick={() => {
                  const req = selectedReq;
                  setSelectedReq(null);
                  setAssignReq(req);
                  setChosenAgentId(recommendAgent(req)?.id ?? agents[0]?.id ?? "");
                }}
              >
                Accept &amp; assign
              </button>
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
              <div className="stack g4 console-panel" style={{ padding: 12, background: "#fafafa" }}>
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

              {/* Recommendation Box */}
              <div
                className="row g10 console-panel"
                style={{ padding: 12, background: "var(--c-ember-bg)", borderColor: "var(--c-ember-border)" }}
              >
                <Icon name="user" size={18} color="var(--c-ember)" />
                <div className="stack" style={{ gap: 2, fontSize: 12.5 }}>
                  <strong style={{ color: "var(--c-ember)" }}>Suggested: {recommendAgent(assignReq)?.name}</strong>
                  <span style={{ color: "var(--c-text)" }}>Specializes in {assignReq.service.category} &amp; ready for new cases.</span>
                </div>
              </div>

              <div className="console-form-group">
                <label className="console-label">Choose agent</label>
                <select
                  className="console-select"
                  value={chosenAgentId}
                  onChange={(e) => setChosenAgentId(e.target.value)}
                >
                  {agents.filter((a) => a.active && a.role === "Agent").map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.team})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid var(--c-border)",
                background: "#fafafa",
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
                  background: "#fafafa",
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
