"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { bulkAssignRequests, bulkMessageRequests, saveSavedView } from "@/app/actions/console";
import { Icon } from "@/components/ui";
import { fmtAgo, fmtDay, fmtWhen, initials, rwf, shortName } from "@/lib/format";
import { amountDue, isOpen, payStatus } from "@/lib/status";
import type { RequestView, SavedView, Staff, Stage } from "@/lib/types";
import { DataTable, type ColumnDef, type FilterDef } from "./DataTable";
import { RequestStatusBadge, PaymentStatusBadge } from "./StatusBadge";
import { SidePanel } from "./SidePanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toast } from "./Toast";

const STAGE_ORDER: Stage[] = ["received", "checking", "preparing", "institution", "completed"];

export function RequestsListView({
  requests,
  agents,
  categories,
  stageTargets,
  savedViews = [],
  now,
}: {
  requests: RequestView[];
  agents: Staff[];
  categories: Record<string, string>;
  stageTargets: Record<Stage, number>;
  savedViews?: SavedView[];
  now: string;
}) {
  const [viewMode, setViewMode] = useState<"table" | "board">("table");
  const [selectedReq, setSelectedReq] = useState<RequestView | null>(null);
  const [toast, setToast] = useState("");
  const [busy, start] = useTransition();

  // Bulk actions state
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [targetAgentId, setTargetAgentId] = useState("");
  const [selectedForBulk, setSelectedForBulk] = useState<RequestView[]>([]);
  const [clearSelectionFn, setClearSelectionFn] = useState<(() => void) | null>(null);

  // Copy helper
  const copyToClipboard = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setToast(`Copied ${text}`);
  };

  // Helper calculations for row
  const calcMetrics = (r: RequestView) => {
    const ageDays = Math.max(0, Math.floor((Date.parse(now) - Date.parse(r.openedAt)) / (864e5)));
    const stageEntered = r.stageDates[r.stage] ?? r.openedAt;
    const stageDays = Math.max(0, Math.floor((Date.parse(now) - Date.parse(stageEntered)) / (864e5)));
    const stageHours = Math.max(0, Math.floor((Date.parse(now) - Date.parse(stageEntered)) / (3600 * 1000)));
    const targetHours = stageTargets[r.stage] ?? 24;
    const isSlaBreached = isOpen(r) && targetHours > 0 && stageHours > targetHours;

    return { ageDays, stageDays, stageHours, isSlaBreached };
  };

  // DataTable Columns
  const columns: ColumnDef<RequestView>[] = useMemo(() => [
    {
      id: "ref",
      header: "Reference",
      accessor: (r) => r.ref,
      cell: (r) => (
        <span className="c-mono-ref">
          <span>{r.ref}</span>
          <button
            type="button"
            className="c-copy-btn"
            onClick={(e) => copyToClipboard(r.ref, e)}
            title="Copy reference"
          >
            <Icon name="file" size={11} />
          </button>
        </span>
      ),
      sortable: true,
    },
    {
      id: "client",
      header: "Customer",
      accessor: (r) => r.profile.name,
      cell: (r) => (
        <div className="stack" style={{ gap: 1 }}>
          <strong className="c-cell-clip" title={r.profile.name}>{r.profile.name}</strong>
          <span className="c-cell-sub">{r.account.phone}</span>
        </div>
      ),
      sortable: true,
    },
    {
      id: "service",
      header: "Service",
      accessor: (r) => r.name,
      cell: (r) => (
        <div className="stack" style={{ gap: 1 }}>
          <span className="c-cell-clip" style={{ fontWeight: 500 }} title={r.name}>{r.name}</span>
          <span className="c-cell-sub c-cell-clip">
            {categories[r.service.category] || r.service.category} · {r.channel}
          </span>
        </div>
      ),
      sortable: true,
    },
    {
      id: "agent",
      header: "Agent",
      accessor: (r) => r.agent?.name ?? "Unassigned",
      cell: (r) => (
        r.agent ? (
          <span className="row g6 nowrap" style={{ fontSize: 12.5 }} title={r.agent.name}>
            <span className="c-avatar c-avatar-sm">{initials(r.agent.name)}</span>
            <span>{r.agent.name.split(" ")[0]}</span>
          </span>
        ) : (
          <span style={{ color: "var(--c-ember)", fontSize: 12, fontWeight: 600 }}>Unassigned</span>
        )
      ),
      sortable: true,
    },
    {
      id: "stage",
      header: "Status / Stage",
      accessor: (r) => r.stage,
      cell: (r) => <RequestStatusBadge r={r} viewer="staff" />,
      sortable: true,
    },
    {
      id: "payment",
      header: "Payment",
      accessor: (r) => payStatus(r.billing, now),
      cell: (r) => <PaymentStatusBadge status={payStatus(r.billing, now)} />,
      sortable: true,
    },
    {
      id: "daysInStage",
      header: "In Stage",
      accessor: (r) => calcMetrics(r).stageDays,
      cell: (r) => {
        const { stageDays, isSlaBreached } = calcMetrics(r);
        return (
          <span
            className={`row g4 tabular-nums ${isSlaBreached ? "c-sla-late" : ""}`}
            style={{ justifyContent: "flex-end", fontSize: 12.5 }}
            title={isSlaBreached ? "Past the target time for this stage" : undefined}
          >
            {isSlaBreached && <Icon name="alert" size={13} stroke={2.2} />}
            {stageDays}d
            {isSlaBreached && <span className="sr-only">, past target time</span>}
          </span>
        );
      },
      sortable: true,
      align: "right",
    },
    {
      id: "age",
      header: "Age",
      accessor: (r) => calcMetrics(r).ageDays,
      cell: (r) => <span className="tabular-nums mut" style={{ fontSize: 12.5 }}>{calcMetrics(r).ageDays}d</span>,
      sortable: true,
      align: "right",
      defaultVisible: false,
    },
    {
      id: "ours",
      header: "Our Fee",
      accessor: (r) => r.billing.ours,
      cell: (r) => <span className="tabular-nums" style={{ fontWeight: 600, color: "var(--c-ember)" }}>{rwf(r.billing.ours)}</span>,
      sortable: true,
      align: "right",
      total: (rows) => (
        <span className="tabular-nums" style={{ color: "var(--c-ember)" }}>
          {rwf(rows.reduce((sum, r) => sum + r.billing.ours, 0))}
        </span>
      ),
    },
    {
      id: "updatedAt",
      header: "Updated",
      accessor: (r) => r.updatedAt,
      cell: (r) => <span className="tabular-nums mut" style={{ fontSize: 12 }}>{fmtAgo(r.updatedAt, now)}</span>,
      sortable: true,
      align: "right",
      defaultVisible: false,
    },
  ], [categories, now, stageTargets]);

  // Filters Definitions
  const filtersDef: FilterDef<RequestView>[] = useMemo(() => [
    {
      id: "stage",
      label: "Stage",
      options: [
        { label: "Received (New)", value: "received" },
        { label: "Checking", value: "checking" },
        { label: "Preparing", value: "preparing" },
        { label: "With Institution", value: "institution" },
        { label: "Completed", value: "completed" },
      ],
      filterFn: (r, val) => r.stage === val,
    },
    {
      id: "agent",
      label: "Agent",
      options: [
        { label: "Unassigned", value: "unassigned" },
        ...agents.filter((a) => a.active && a.role === "Agent").map((a) => ({ label: a.name, value: a.id })),
      ],
      filterFn: (r, val) => val === "unassigned" ? !r.agentId : r.agentId === val,
    },
    {
      id: "payment",
      label: "Payment",
      options: [
        { label: "Paid", value: "paid" },
        { label: "Awaiting", value: "pending" },
        { label: "Overdue", value: "overdue" },
        { label: "Estimate", value: "estimate" },
      ],
      filterFn: (r, val) => {
        const s = payStatus(r.billing, now);
        if (val === "estimate") return r.billing.quote === "estimate";
        return s === val;
      },
    },
    {
      id: "channel",
      label: "Channel",
      options: [
        { label: "Irembo", value: "Irembo" },
        { label: "RRA e-Tax", value: "RRA e-Tax" },
        { label: "RRA EBM", value: "RRA EBM" },
        { label: "RDB", value: "RDB" },
        { label: "In person", value: "In person" },
      ],
      filterFn: (r, val) => r.channel.toLowerCase().includes(val.toLowerCase()),
    },
    {
      id: "waitingDays",
      label: "Waiting on client",
      showInToolbar: false,
      options: [{ label: "Over 3 days", value: "3" }],
      filterFn: (r, val) => !!r.hold && isOpen(r) && Date.parse(now) - Date.parse(r.hold.since) >= Number(val) * 864e5,
    },
    {
      id: "stageDays",
      label: "Stage age",
      showInToolbar: false,
      options: [{ label: "Over 7 days", value: "7" }],
      filterFn: (r, val) => isOpen(r) && Date.parse(now) - Date.parse(r.stageDates[r.stage] ?? r.openedAt) >= Number(val) * 864e5,
    },
    {
      id: "completedSince",
      label: "Completed period",
      showInToolbar: false,
      options: [{ label: "This week", value: "week" }],
      filterFn: (r, val) => {
        if (r.stage !== "completed" || val !== "week") return false;
        const weekStart = new Date(now);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
        return Date.parse(r.stageDates.completed ?? "") >= weekStart.getTime();
      },
    },
    {
      id: "closed",
      label: "Closed status",
      showInToolbar: false,
      options: [{ label: "Cancelled", value: "cancelled" }],
      filterFn: (r, val) => r.closed?.kind === val,
    },
  ], [agents, now]);

  const usableSavedViews = useMemo(() => savedViews.map((view) => {
    const saved = view.filters as Record<string, unknown>;
    let filters: Record<string, string> = saved as Record<string, string>;
    if ("unassigned" in saved) filters = { agent: "unassigned" };
    else if ("waitingDays" in saved) filters = { waitingDays: String(saved.waitingDays) };
    else if ("paymentStatus" in saved) filters = { payment: String(saved.paymentStatus) };
    else if ("stageDays" in saved) filters = { stage: String(saved.stage), stageDays: String(saved.stageDays) };
    else if (saved.period === "week") filters = { stage: String(saved.stage), completedSince: "week" };
    else if ("closed" in saved) filters = { closed: String(saved.closed) };
    return { ...view, filters };
  }), [savedViews]);

  // Board Data: grouped by stage
  const boardColumns = useMemo(() => {
    return STAGE_ORDER.map((stage) => {
      const stageCases = requests.filter((r) => r.stage === stage && !r.closed);
      return {
        stage,
        label: stage === "received" ? "Received" : stage === "checking" ? "Checking" : stage === "preparing" ? "Preparing" : stage === "institution" ? "With Institution" : "Completed",
        items: stageCases,
      };
    });
  }, [requests]);

  const handleBulkAssign = (agentId: string) => {
    start(async () => {
      const refs = selectedForBulk.map((r) => r.ref);
      const res = await bulkAssignRequests(refs, agentId || null);
      if (res.ok) {
        setBulkAssignOpen(false);
        clearSelectionFn?.();
        setToast(`Assigned ${refs.length} requests.`);
      }
    });
  };

  const handleBulkMessage = (body: string) => {
    start(async () => {
      const refs = selectedForBulk.map((r) => r.ref);
      const res = await bulkMessageRequests(refs, body);
      if (res.ok) {
        setBulkMessageOpen(false);
        clearSelectionFn?.();
        setToast(`Messaged ${refs.length} customers.`);
      }
    });
  };

  return (
    <div className="stack g18">
      {/* Header & View Switcher */}
      <div className="row between g16 wrapx">
        <div className="stack" style={{ gap: 2 }}>
          <h1 className="console-page-title">Requests</h1>
          <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
            All cases across all services, stages, and agents. ({requests.length} total)
          </span>
        </div>
        <div className="row g6">
          <button
            type="button"
            className={`c-btn ${viewMode === "table" ? "c-btn-primary" : "c-btn-secondary"} c-btn-sm`}
            onClick={() => setViewMode("table")}
          >
            <Icon name="list" size={14} />
            <span>Table</span>
          </button>
          <button
            type="button"
            className={`c-btn ${viewMode === "board" ? "c-btn-primary" : "c-btn-secondary"} c-btn-sm`}
            onClick={() => setViewMode("board")}
          >
            <Icon name="grid" size={14} />
            <span>Board</span>
          </button>
        </div>
      </div>

      {/* Main View: Table or Board */}
      {viewMode === "table" ? (
        <DataTable
          data={requests}
          columns={columns}
          filters={filtersDef}
          savedViews={usableSavedViews}
          onRowClick={(r) => setSelectedReq(r)}
          searchPlaceholder="Search customer, ref, service, agent..."
          bulkActions={(selected, clear) => (
            <>
              <button
                type="button"
                className="c-btn c-btn-primary c-btn-sm"
                onClick={() => {
                  setSelectedForBulk(selected);
                  setClearSelectionFn(() => clear);
                  setBulkAssignOpen(true);
                }}
              >
                Assign {selected.length} cases
              </button>
              <button
                type="button"
                className="c-btn c-btn-secondary c-btn-sm"
                onClick={() => {
                  setSelectedForBulk(selected);
                  setClearSelectionFn(() => clear);
                  setBulkMessageOpen(true);
                }}
              >
                Message {selected.length} clients
              </button>
            </>
          )}
          onSaveCurrentView={async (name, filters, cols) => {
            const res = await saveSavedView({ entity: "requests", name, filters, columns: cols });
            if (res.ok) {
              setToast(`Saved view “${name}”`);
            }
          }}
        />
      ) : (
        /* Board / Kanban View */
        <div className="console-board-grid">
          {boardColumns.map((col) => (
            <div key={col.stage} className="console-board-col">
              <div className="console-board-col-header">
                <span>{col.label}</span>
                <span className="c-badge c-badge-neutral">{col.items.length}</span>
              </div>
              <div className="stack g8 grow">
                {col.items.map((r) => {
                  const { stageDays, isSlaBreached } = calcMetrics(r);
                  return (
                    <div
                      key={r.ref}
                      className="console-card-item"
                      onClick={() => setSelectedReq(r)}
                      style={{
                        borderLeft: isSlaBreached ? "3px solid var(--c-red)" : "1px solid var(--c-border)",
                      }}
                    >
                      <div className="row between g6">
                        <span className="c-mono-ref">{r.ref}</span>
                        <PaymentStatusBadge status={payStatus(r.billing, now)} />
                      </div>
                      <div className="stack" style={{ gap: 2 }}>
                        <strong style={{ fontSize: 13 }}>{r.profile.name}</strong>
                        <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>{r.name}</span>
                      </div>
                      <div className="row between g6" style={{ paddingTop: 6, borderTop: "1px solid var(--c-border-subtle)", fontSize: 11.5 }}>
                        <span style={{ color: r.agent ? "var(--c-text)" : "var(--c-ember)", fontWeight: 500 }}>
                          {r.agent ? shortName(r.agent.name) : "Unassigned"}
                        </span>
                        <span className="tabular-nums" style={{ color: isSlaBreached ? "var(--c-red)" : "var(--c-text-muted)" }}>
                          {stageDays}d in stage
                        </span>
                      </div>
                    </div>
                  );
                })}
                {col.items.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 8px", fontSize: 12, color: "var(--c-text-muted)" }}>
                    No cases in this stage
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SidePanel for Request Quick View */}
      <SidePanel
        open={!!selectedReq}
        onClose={() => setSelectedReq(null)}
        title={selectedReq ? `${selectedReq.ref} · ${selectedReq.profile.name}` : ""}
        subtitle={selectedReq ? `${selectedReq.name} · ${selectedReq.channel}` : ""}
        footer={
          selectedReq && (
            <div className="row g8">
              <Link href={`/console/requests/${selectedReq.ref}`} className="c-btn c-btn-primary c-btn-sm">
                Open workspace →
              </Link>
            </div>
          )
        }
      >
        {selectedReq && (
          <div className="stack g16">
            <div className="row between g8 console-panel" style={{ padding: 12, background: "var(--c-bg)" }}>
              <div className="stack" style={{ gap: 2 }}>
                <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>Status</span>
                <RequestStatusBadge r={selectedReq} viewer="staff" />
              </div>
              <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
                <span style={{ fontSize: 12, color: "var(--c-text-muted)" }}>Payment</span>
                <PaymentStatusBadge status={payStatus(selectedReq.billing, now)} />
              </div>
            </div>

            <div className="stack g6">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Customer</span>
              <div className="stack g2 console-panel" style={{ padding: 12 }}>
                <strong style={{ fontSize: 13.5 }}>{selectedReq.profile.name}</strong>
                <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>Phone: {selectedReq.account.phone}</span>
                {selectedReq.profile.district && <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>District: {selectedReq.profile.district}</span>}
                <Link href={`/console/clients/${selectedReq.profileId}`} className="linkish" style={{ fontSize: 12, marginTop: 4, color: "var(--c-ember)" }}>
                  View customer profile →
                </Link>
              </div>
            </div>

            <div className="stack g6">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Assigned Agent</span>
              <div className="row between g8 console-panel" style={{ padding: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {selectedReq.agent ? selectedReq.agent.name : "Unassigned"}
                </span>
                {selectedReq.agent && (
                  <span className="c-badge c-badge-neutral">{selectedReq.agent.team}</span>
                )}
              </div>
            </div>

            <div className="stack g6">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Pricing breakdown</span>
              <div className="stack g6 console-panel" style={{ padding: 12 }}>
                <div className="c-fee-line">
                  <span className="row g6"><span className="c-fee-tag-official">Official</span> Government fee</span>
                  <strong className="tabular-nums">{selectedReq.billing.official ? rwf(selectedReq.billing.official) : "Confirmed per case"}</strong>
                </div>
                <div className="c-fee-line">
                  <span className="row g6"><span className="c-fee-tag-ours">Inzira</span> Assistance fee</span>
                  <strong className="tabular-nums" style={{ color: "var(--c-ember)" }}>{rwf(selectedReq.billing.ours)}</strong>
                </div>
              </div>
            </div>

            <div className="stack g6">
              <span className="console-nav-group-title" style={{ padding: 0 }}>Documents ({selectedReq.documents.length})</span>
              {selectedReq.documents.map((d) => (
                <div key={d.id} className="row between g8" style={{ padding: "6px 0", borderBottom: "1px solid var(--c-border-subtle)", fontSize: 12.5 }}>
                  <span>{d.name}</span>
                  <span className="c-badge c-badge-neutral">{d.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SidePanel>

      {/* Bulk Assign Dialog */}
      {bulkAssignOpen && (
        <div className="console-dialog-overlay" onClick={() => setBulkAssignOpen(false)}>
          <div className="console-dialog stack" onClick={(e) => e.stopPropagation()}>
            <div className="console-panel-header">
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Bulk assign ({selectedForBulk.length} requests)
              </h3>
              <button type="button" className="c-btn c-btn-ghost c-btn-sm c-btn-icon" onClick={() => setBulkAssignOpen(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="console-panel-body stack g12">
              <label className="console-label">Assign selected requests to:</label>
              <select
                className="console-select"
                value={targetAgentId}
                onChange={(e) => setTargetAgentId(e.target.value)}
              >
                <option value="">Unassign</option>
                {agents.filter((a) => a.active && a.role === "Agent").map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.team})</option>
                ))}
              </select>
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--c-border)", background: "var(--c-bg)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="c-btn c-btn-secondary" onClick={() => setBulkAssignOpen(false)} disabled={busy}>Cancel</button>
              <button type="button" className="c-btn c-btn-primary" onClick={() => handleBulkAssign(targetAgentId)} disabled={busy}>
                {busy ? "Saving..." : "Apply assignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Message Dialog */}
      <ConfirmDialog
        open={bulkMessageOpen}
        onClose={() => setBulkMessageOpen(false)}
        onConfirm={handleBulkMessage}
        title={`Message ${selectedForBulk.length} clients`}
        description="This message will be added to each selected request and sent to the client via portal notification."
        confirmLabel="Send messages"
        requireReason
        reasonLabel="Message content"
        reasonPlaceholder="Write your message..."
        busy={busy}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </div>
  );
}
