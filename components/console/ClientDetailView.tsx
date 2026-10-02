"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addClientNote, addClientTag, removeClientTag, revealNationalId, revealTin } from "@/app/actions/console";
import { Icon } from "@/components/ui";
import { fmtAgo, fmtDay, fmtWhen, initials, rwf, shortName } from "@/lib/format";
import { payStatus } from "@/lib/status";
import type { ClientDetail } from "@/lib/types";
import { RequestStatusBadge, PaymentStatusBadge, DocStatusBadge } from "./StatusBadge";
import { Timeline } from "./Timeline";
import { Toast } from "./Toast";

export function ClientDetailView({
  client,
  now,
}: {
  client: ClientDetail;
  now: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [activeTab, setActiveTab] = useState<"overview" | "requests" | "payments" | "documents" | "messages" | "notes" | "activity">("overview");
  const [toast, setToast] = useState("");

  // Privacy reveal states
  const [unmaskedNid, setUnmaskedNid] = useState<string | null>(null);
  const [unmaskedTin, setUnmaskedTin] = useState<string | null>(null);
  const [revealingNid, setRevealingNid] = useState(false);
  const [revealingTin, setRevealingTin] = useState(false);

  // Tag and Note states
  const [newTag, setNewTag] = useState("");
  const [newNote, setNewNote] = useState("");

  const phone = client.phone.replace(/\D/g, "");

  const handleRevealNid = () => {
    setRevealingNid(true);
    start(async () => {
      const res = await revealNationalId(client.id);
      if (res.ok) {
        setUnmaskedNid(res.nationalId);
        setToast("National ID revealed (logged in audit)");
      }
      setRevealingNid(false);
    });
  };

  const handleRevealTin = () => {
    setRevealingTin(true);
    start(async () => {
      const res = await revealTin(client.id);
      if (res.ok) {
        setUnmaskedTin(res.tin);
        setToast("TIN revealed (logged in audit)");
      }
      setRevealingTin(false);
    });
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    start(async () => {
      const res = await addClientTag(client.id, newTag.trim());
      if (res.ok) {
        setNewTag("");
        setToast(`Tag “${newTag}” added`);
        router.refresh();
      }
    });
  };

  const handleRemoveTag = (tag: string) => {
    start(async () => {
      const res = await removeClientTag(client.id, tag);
      if (res.ok) {
        setToast(`Tag “${tag}” removed`);
        router.refresh();
      }
    });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    start(async () => {
      const res = await addClientNote(client.id, newNote.trim());
      if (res.ok) {
        setNewNote("");
        setToast("Client note saved");
        router.refresh();
      }
    });
  };

  return (
    <div className="stack g18">
      {/* Header Profile Card */}
      <div className="console-panel stack g14" style={{ padding: "18px 22px" }}>
        <div className="row between g16 wrapx">
          <div className="row g14">
            <span
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "var(--c-ember-bg)",
                color: "var(--c-ember)",
                fontSize: 16,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initials(client.name)}
            </span>
            <div className="stack" style={{ gap: 2 }}>
              <div className="row g8 wrapx">
                <h1 className="console-page-title">{client.name}</h1>
                <span className="c-badge c-badge-neutral" style={{ textTransform: "capitalize" }}>
                  {client.kind}
                </span>
                {client.tags.map((t) => (
                  <span key={t} className="c-badge c-badge-ember" style={{ fontSize: 11 }}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="row g12 wrapx" style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
                <span>Phone: {client.phone}</span>
                {client.district && <span>· District: {client.district}</span>}
                <span>· Member since {fmtDay(client.since)}</span>
              </div>
            </div>
          </div>

          <div className="row g8 wrapx">
            <a className="c-btn c-btn-secondary c-btn-sm" href={`tel:+${phone}`}>
              <Icon name="phone" size={14} />
              <span>Call</span>
            </a>
            <a className="c-btn c-btn-secondary c-btn-sm" href={`https://wa.me/${phone}`} target="_blank" rel="noopener">
              <Icon name="msg" size={14} />
              <span>WhatsApp</span>
            </a>
            <Link href="/agent/intake" className="c-btn c-btn-primary c-btn-sm">
              <Icon name="plus" size={14} />
              <span>Start request</span>
            </Link>
          </div>
        </div>

        {/* Quick Stats Summary */}
        <div className="grid cols-4" style={{ gap: 12, paddingTop: 12, borderTop: "1px solid var(--c-border)" }}>
          <div>
            <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>Active Requests</span>
            <div className="console-stat-figure" style={{ fontSize: 18, color: client.openRequests > 0 ? "var(--c-ember)" : "inherit" }}>
              {client.openRequests}
            </div>
          </div>
          <div>
            <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>Total Cases</span>
            <div className="console-stat-figure" style={{ fontSize: 18 }}>
              {client.totalRequests}
            </div>
          </div>
          <div>
            <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>Total Paid (Our Fee)</span>
            <div className="console-stat-figure" style={{ fontSize: 18, color: "var(--c-ember)" }}>
              {rwf(client.totalPaidOurs)}
            </div>
          </div>
          <div>
            <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>Outstanding Balance</span>
            <div className="console-stat-figure" style={{ fontSize: 18, color: client.balanceDue > 0 ? "var(--c-amber)" : "inherit" }}>
              {client.balanceDue > 0 ? rwf(client.balanceDue) : "0"}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="row console-tabs c-tabs" role="tablist" aria-label="Client sections">
        {[
          { id: "overview", label: "Overview", icon: "home" },
          { id: "requests", label: `Requests (${client.requests.length})`, icon: "list" },
          { id: "payments", label: "Payments", icon: "card" },
          { id: "documents", label: `Documents (${client.documents.length})`, icon: "file" },
          { id: "messages", label: `Messages (${client.messages.length})`, icon: "msg" },
          { id: "notes", label: `Notes (${client.notes.length})`, icon: "note" },
          { id: "activity", label: `Activity (${client.events.length})`, icon: "log" },
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

      {/* Tab Panels */}
      {activeTab === "overview" && (
        <div className="grid cols-2" style={{ gap: 20, alignItems: "start" }}>
          {/* Identification with Audited Unmasking */}
          <div className="console-panel stack g14" style={{ padding: 18 }}>
            <h3 className="console-section-title" style={{ margin: 0 }}>Identity &amp; Legal Numbers</h3>
            <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>
              National ID and TIN are masked by default. Clicking reveal is logged to the audit trail.
            </span>

            <div className="stack g10">
              {/* National ID Row */}
              <div className="row between g12 console-panel" style={{ padding: 12 }}>
                <div className="stack" style={{ gap: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-muted)" }}>National ID</span>
                  <strong className="tabular-nums" style={{ fontSize: 14 }}>
                    {unmaskedNid || client.idMasked || "—"}
                  </strong>
                </div>
                {!unmaskedNid && client.idMasked && (
                  <button
                    type="button"
                    className="c-btn c-btn-secondary c-btn-sm"
                    disabled={revealingNid || busy}
                    onClick={handleRevealNid}
                  >
                    <Icon name="eye" size={13} />
                    <span>Show ID</span>
                  </button>
                )}
              </div>

              {/* TIN Row */}
              <div className="row between g12 console-panel" style={{ padding: 12 }}>
                <div className="stack" style={{ gap: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-muted)" }}>TIN (Tax Identification Number)</span>
                  <strong className="tabular-nums" style={{ fontSize: 14 }}>
                    {unmaskedTin || client.tinMasked || "—"}
                  </strong>
                </div>
                {!unmaskedTin && client.tinMasked && (
                  <button
                    type="button"
                    className="c-btn c-btn-secondary c-btn-sm"
                    disabled={revealingTin || busy}
                    onClick={handleRevealTin}
                  >
                    <Icon name="eye" size={13} />
                    <span>Show TIN</span>
                  </button>
                )}
              </div>
            </div>

            {/* Tags Management */}
            <div className="stack g8" style={{ paddingTop: 10, borderTop: "1px solid var(--c-border)" }}>
              <span className="console-label">Client Tags</span>
              <div className="row g6 wrapx">
                {client.tags.map((t) => (
                  <span key={t} className="c-badge c-badge-ember" style={{ padding: "3px 8px" }}>
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "0 0 0 4px" }}
                      aria-label={`Remove tag ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddTag} className="row g6" style={{ marginTop: 4 }}>
                <input
                  className="console-input"
                  style={{ height: 30, fontSize: 12.5 }}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add tag (e.g. VIP)..."
                />
                <button type="submit" className="c-btn c-btn-secondary c-btn-sm" disabled={!newTag.trim() || busy}>
                  Add tag
                </button>
              </form>
            </div>
          </div>

          {/* Recent Summary */}
          <div className="console-panel stack g14" style={{ padding: 18 }}>
            <h3 className="console-section-title" style={{ margin: 0 }}>Recent cases for this client</h3>
            {client.requests.slice(0, 4).map((r) => (
              <Link
                key={r.ref}
                href={`/console/requests/${r.ref}`}
                className="console-panel row between g10 console-nav-item"
                style={{ margin: 0, padding: "10px 12px", border: "1px solid var(--c-border)" }}
              >
                <div className="stack" style={{ gap: 2 }}>
                  <div className="row g8">
                    <span className="c-mono-ref">{r.ref}</span>
                    <strong style={{ fontSize: 13 }}>{r.name}</strong>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>{r.channel} · {fmtAgo(r.openedAt, now)}</span>
                </div>
                <RequestStatusBadge r={r} viewer="staff" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {activeTab === "requests" && (
        <div className="console-panel stack g0" style={{ overflow: "hidden" }}>
          <div className="console-table-container" style={{ border: "none" }}>
            <table className="console-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Service</th>
                  <th>Stage</th>
                  <th>Payment</th>
                  <th>Assigned Agent</th>
                  <th>Opened</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {client.requests.map((r) => (
                  <tr key={r.ref}>
                    <td><span className="c-mono-ref">{r.ref}</span></td>
                    <td><strong>{r.name}</strong></td>
                    <td><RequestStatusBadge r={r} viewer="staff" /></td>
                    <td><PaymentStatusBadge status={payStatus(r.billing, now)} /></td>
                    <td>{r.agent ? shortName(r.agent.name) : <span style={{ color: "var(--c-ember)" }}>Unassigned</span>}</td>
                    <td className="tabular-nums mut">{fmtDay(r.openedAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/console/requests/${r.ref}`} className="c-btn c-btn-secondary c-btn-sm">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {client.requests.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--c-text-muted)" }}>
                      No requests opened for this client yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="console-panel stack g14" style={{ padding: 18 }}>
          <h3 className="console-section-title" style={{ margin: 0 }}>Payment Transactions</h3>
          <div className="stack g8">
            {client.requests.flatMap((r) => r.billing.transactions.map((t) => ({ ...t, ref: r.ref, name: r.name }))).map((tx, idx) => (
              <div key={idx} className="console-panel row between g12" style={{ padding: 12 }}>
                <div className="stack" style={{ gap: 2 }}>
                  <div className="row g8">
                    <span className="c-mono-ref">{tx.receipt}</span>
                    <strong style={{ fontSize: 13 }}>{tx.name} ({tx.ref})</strong>
                    <span className="c-badge c-badge-green">{tx.status}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>{tx.method} · {fmtWhen(tx.at, now)}</span>
                </div>
                <div className="stack" style={{ alignItems: "flex-end", gap: 1 }}>
                  <strong className="tabular-nums" style={{ fontSize: 14 }}>{rwf(tx.official + tx.ours)}</strong>
                  <span style={{ fontSize: 11.5, color: "var(--c-text-muted)" }}>Inzira {rwf(tx.ours)} · Official {rwf(tx.official)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="console-panel stack g14" style={{ padding: 18 }}>
          <h3 className="console-section-title" style={{ margin: 0 }}>Customer Document Library</h3>
          <div className="stack g8">
            {client.documents.map((d) => (
              <div key={d.key} className="console-panel row between g12" style={{ padding: 12 }}>
                <div className="stack" style={{ gap: 2 }}>
                  <div className="row g8">
                    <strong style={{ fontSize: 13.5 }}>{d.name}</strong>
                    <DocStatusBadge status={d.status} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>{d.meta}</span>
                </div>
                {d.fileId && (
                  <a className="c-btn c-btn-secondary c-btn-sm" href={`/files/${d.fileId}`} target="_blank" rel="noopener">
                    <Icon name="download" size={13} /> Download
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "messages" && (
        <div className="console-panel stack g12" style={{ padding: 18 }}>
          <h3 className="console-section-title" style={{ margin: 0 }}>All Messages History</h3>
          <div className="stack g10" style={{ maxHeight: 400, overflowY: "auto" }}>
            {client.messages.map((m) => (
              <div key={m.id} className="console-panel stack g4" style={{ padding: 12, background: m.by === "customer" ? "var(--c-surface)" : "var(--c-ember-bg)" }}>
                <div className="row between g8" style={{ fontSize: 12, color: "var(--c-text-muted)" }}>
                  <strong>{m.name || "Client"}</strong>
                  <span>{fmtWhen(m.at, now)}</span>
                </div>
                <div style={{ fontSize: 13.5 }}>{m.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "notes" && (
        <div className="console-panel stack g14" style={{ padding: 18 }}>
          <h3 className="console-section-title" style={{ margin: 0 }}>Client-level Internal Notes</h3>
          <div className="stack g8" style={{ maxHeight: 300, overflowY: "auto" }}>
            {client.notes.map((n) => (
              <div key={n.id} className="console-panel stack g4" style={{ padding: 12, background: "var(--c-bg)" }}>
                <div className="row between g8" style={{ fontSize: 12, color: "var(--c-text-muted)" }}>
                  <strong>{n.name}</strong>
                  <span>{fmtWhen(n.at, now)}</span>
                </div>
                <div style={{ fontSize: 13 }}>{n.body}</div>
              </div>
            ))}
            {client.notes.length === 0 && (
              <span style={{ color: "var(--c-text-muted)", fontSize: 13 }}>No notes recorded for this client.</span>
            )}
          </div>

          <form onSubmit={handleAddNote} className="stack g8" style={{ paddingTop: 10, borderTop: "1px solid var(--c-border)" }}>
            <label className="console-label">Add new note</label>
            <textarea
              className="console-textarea"
              rows={3}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Private note about client relationship or preferences..."
            />
            <button
              type="submit"
              className="c-btn c-btn-secondary c-btn-sm"
              style={{ alignSelf: "flex-end" }}
              disabled={!newNote.trim() || busy}
            >
              Save note
            </button>
          </form>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="console-panel stack g14" style={{ padding: 18 }}>
          <h3 className="console-section-title" style={{ margin: 0 }}>Client Event History</h3>
          <Timeline events={client.events} now={now} />
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </div>
  );
}
