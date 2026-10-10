"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui";
import { fmtAgo, fmtDay, rwf } from "@/lib/format";
import type { ClientSummary } from "@/lib/types";
import { DataTable, type ColumnDef, type FilterDef } from "./DataTable";
import { AddClientModal } from "./AddClientModal";
import { Toast } from "./Toast";

export function ClientsListView({
  clients,
  now,
}: {
  clients: ClientSummary[];
  now: string;
}) {
  const router = useRouter();
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [toast, setToast] = useState("");

  const columns: ColumnDef<ClientSummary>[] = useMemo(() => [
    {
      id: "name",
      header: "Client Name",
      accessor: (c) => c.name,
      cell: (c) => (
        <div className="stack" style={{ gap: 2 }}>
          <strong style={{ fontSize: 13.5 }}>
            {/* No prefetch: every row would have the server render the console in the background. The row
                navigates on click too, so the link keeps the click to itself: one click, one navigation. */}
            <Link href={`/console/clients/${c.id}`} prefetch={false} style={{ textDecoration: "none", color: "inherit" }} className="lnk" onClick={(e) => e.stopPropagation()}>
              {c.name}
            </Link>
          </strong>
          {c.tags.length > 0 && (
            <div className="row g4 wrapx">
              {c.tags.map((t) => (
                <span key={t} className="c-badge c-badge-ember" style={{ fontSize: 10, padding: "1px 5px" }}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
      sortable: true,
    },
    {
      id: "kind",
      header: "Type",
      accessor: (c) => c.kind,
      cell: (c) => (
        <span className="c-badge c-badge-neutral" style={{ textTransform: "capitalize" }}>
          {c.kind}
        </span>
      ),
      sortable: true,
    },
    {
      id: "phone",
      header: "Phone",
      accessor: (c) => c.phone,
      cell: (c) => <span className="tabular-nums" style={{ fontSize: 13 }}>{c.phone}</span>,
      sortable: true,
    },
    {
      id: "district",
      header: "District",
      accessor: (c) => c.district ?? "—",
      cell: (c) => <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>{c.district ?? "—"}</span>,
      sortable: true,
    },
    {
      id: "openRequests",
      header: "Open Cases",
      accessor: (c) => c.openRequests,
      cell: (c) => (
        <span
          className="tabular-nums"
          style={{
            fontWeight: c.openRequests > 0 ? 600 : 400,
            color: c.openRequests > 0 ? "var(--c-ember)" : "inherit",
          }}
        >
          {c.openRequests}
        </span>
      ),
      sortable: true,
      align: "right",
    },
    {
      id: "totalRequests",
      header: "Total Cases",
      accessor: (c) => c.totalRequests,
      cell: (c) => <span className="tabular-nums" style={{ fontSize: 12.5 }}>{c.totalRequests}</span>,
      sortable: true,
      align: "right",
    },
    {
      id: "totalPaidOurs",
      header: "Paid to Us",
      accessor: (c) => c.totalPaidOurs,
      cell: (c) => (
        <span className="tabular-nums" style={{ fontWeight: 600, color: "var(--c-ember)" }}>
          {rwf(c.totalPaidOurs)}
        </span>
      ),
      sortable: true,
      align: "right",
      total: (rows) => (
        <span className="tabular-nums" style={{ color: "var(--c-ember)" }}>
          {rwf(rows.reduce((sum, c) => sum + c.totalPaidOurs, 0))}
        </span>
      ),
    },
    {
      id: "balanceDue",
      header: "Balance Due",
      accessor: (c) => c.balanceDue,
      cell: (c) => (
        <span
          className="tabular-nums"
          style={{
            fontWeight: c.balanceDue > 0 ? 600 : 400,
            color: c.balanceDue > 0 ? "var(--c-amber)" : "var(--c-text-muted)",
          }}
        >
          {c.balanceDue > 0 ? rwf(c.balanceDue) : "—"}
        </span>
      ),
      sortable: true,
      align: "right",
      total: (rows) => (
        <span className="tabular-nums" style={{ color: "var(--c-amber)" }}>
          {rwf(rows.reduce((sum, c) => sum + c.balanceDue, 0))}
        </span>
      ),
    },
    {
      id: "lastActivity",
      header: "Last Active",
      accessor: (c) => c.lastActivity,
      cell: (c) => <span className="tabular-nums mut" style={{ fontSize: 12 }}>{fmtAgo(c.lastActivity, now)}</span>,
      sortable: true,
      align: "right",
    },
    {
      id: "since",
      header: "Client Since",
      accessor: (c) => c.since,
      cell: (c) => <span className="tabular-nums mut" style={{ fontSize: 12 }}>{fmtDay(c.since)}</span>,
      sortable: true,
      align: "right",
      defaultVisible: false,
    },
  ], [now]);

  const filtersDef: FilterDef<ClientSummary>[] = useMemo(() => [
    {
      id: "kind",
      label: "Type",
      options: [
        { label: "Person", value: "person" },
        { label: "Business", value: "business" },
        { label: "Organization", value: "organization" },
      ],
      filterFn: (c, val) => c.kind === val,
    },
    {
      id: "balance",
      label: "Balance",
      options: [
        { label: "Has Balance Due", value: "due" },
        { label: "No Balance", value: "zero" },
      ],
      filterFn: (c, val) => val === "due" ? c.balanceDue > 0 : c.balanceDue === 0,
    },
    {
      id: "open",
      label: "Active Cases",
      options: [
        { label: "Has Open Cases", value: "open" },
        { label: "No Open Cases", value: "none" },
      ],
      filterFn: (c, val) => val === "open" ? c.openRequests > 0 : c.openRequests === 0,
    },
  ], []);

  return (
    <div className="stack g18">
      {/* Header */}
      <div className="row between g16 wrapx">
        <div className="stack" style={{ gap: 2 }}>
          <h1 className="console-page-title">Client Directory</h1>
          <span style={{ fontSize: 13, color: "var(--c-text-muted)" }}>
            Directory of registered individuals, businesses, and organizations. ({clients.length} total)
          </span>
        </div>
        <button
          type="button"
          className="c-btn c-btn-primary c-btn-sm"
          onClick={() => setAddClientOpen(true)}
        >
          <Icon name="plus" size={14} />
          <span>Add new client</span>
        </button>
      </div>

      <DataTable
        data={clients}
        columns={columns}
        filters={filtersDef}
        exportFileName="clients.csv"
        searchPlaceholder="Search client name, phone, district, tags..."
        onRowClick={(c) => router.push(`/console/clients/${c.id}`)}
      />

      <AddClientModal
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onSuccess={(id, name) => setToast(`Client ${name} created.`)}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast("")} />}
    </div>
  );
}
