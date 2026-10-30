import Link from "next/link";
import { NoAccess } from "@/components/PageStates";
import { getMyPermissions, listIdentityReviews } from "@/lib/repo";
import { fmtDay } from "@/lib/format";

export const metadata = { title: "ID review" };

const STATUS: Record<string, string> = {
  pending: "Pending verification",
  correction: "Requires correction",
  checked: "Checked against documents",
  unable: "Unable to verify",
  none: "No review recorded",
};

export default async function IdentityPage({ searchParams }: { searchParams: Promise<{ service?: string; status?: string; from?: string; to?: string; agent?: string }> }) {
  const perms = await getMyPermissions();
  if (!perms.includes("reviewDocs")) return <NoAccess what="ID review" />;

  const q = await searchParams;
  const rows = await listIdentityReviews();
  const services = [...new Map(rows.map((r) => [r.serviceSlug, r.serviceName])).entries()];
  const agents = [...new Set(rows.map((r) => r.agentName).filter((n): n is string => !!n))].sort();
  const status = q.status || "pending";
  const shown = rows.filter((r) => {
    if (q.service && r.serviceSlug !== q.service) return false;
    if (q.agent && r.agentName !== q.agent) return false;
    if (q.from && r.openedAt.slice(0, 10) < q.from) return false;
    if (q.to && r.openedAt.slice(0, 10) > q.to) return false;
    const key = r.idReview ?? "none";
    if (status === "all") return true;
    if (status === "open") return !r.closed && r.stage !== "completed" && key === "pending";
    return key === status;
  });
  const count = (key: string) => rows.filter((r) => (r.idReview ?? "none") === key && !r.closed).length;

  return (
    <div className="stack g16">
      <div className="stack g6">
        <h1 className="d" style={{ fontSize: 28, margin: 0 }}>National ID review</h1>
        <p style={{ margin: 0, color: "var(--c-text-muted)", maxWidth: 680, lineHeight: 1.5 }}>
          Only requests that required a National ID are listed. A 16-digit number is not a verification. Staff compare the documents the client sent. Inzira does not look up NIDA or Irembo.
        </p>
      </div>
      <div className="grid cols-4 m-cols-2" style={{ gap: 12 }}>
        {[
          ["Pending verification", count("pending")],
          ["Requires correction", count("correction")],
          ["Checked against documents", count("checked")],
          ["Unable to verify", count("unable")],
        ].map(([label, n]) => (
          <div key={String(label)} className="console-panel stack g6" style={{ padding: 16 }}>
            <span style={{ fontSize: 12.5, color: "var(--c-text-muted)" }}>{label}</span>
            <strong style={{ fontSize: 26 }}>{n}</strong>
          </div>
        ))}
      </div>
      <form className="console-panel row g10 wrapx" style={{ padding: 14 }} method="get">
        <label className="stack g4" style={{ fontSize: 12.5 }}>Service
          <select className="console-select" name="service" defaultValue={q.service ?? ""}>
            <option value="">All services</option>
            {services.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </select>
        </label>
        <label className="stack g4" style={{ fontSize: 12.5 }}>ID review
          <select className="console-select" name="status" defaultValue={status}>
            <option value="pending">Pending verification</option>
            <option value="correction">Requires correction</option>
            <option value="checked">Checked against documents</option>
            <option value="unable">Unable to verify</option>
            <option value="none">No review recorded</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="stack g4" style={{ fontSize: 12.5 }}>From
          <input className="console-input" type="date" name="from" defaultValue={q.from ?? ""} />
        </label>
        <label className="stack g4" style={{ fontSize: 12.5 }}>To
          <input className="console-input" type="date" name="to" defaultValue={q.to ?? ""} />
        </label>
        <label className="stack g4" style={{ fontSize: 12.5 }}>Assigned to
          <select className="console-select" name="agent" defaultValue={q.agent ?? ""}>
            <option value="">Anyone</option>
            {agents.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <button className="c-btn c-btn-primary c-btn-sm" type="submit" style={{ alignSelf: "end" }}>Filter</button>
      </form>
      <div className="console-panel" style={{ overflowX: "auto" }}>
        <table role="table" className="responsive-records" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead role="rowgroup">
            <tr style={{ textAlign: "left", color: "var(--c-text-muted)" }}>
              <th style={{ padding: "10px 12px" }}>Reference</th>
              <th style={{ padding: "10px 12px" }}>Client</th>
              <th style={{ padding: "10px 12px" }}>Service</th>
              <th style={{ padding: "10px 12px" }}>Submitted</th>
              <th style={{ padding: "10px 12px" }}>ID review</th>
              <th style={{ padding: "10px 12px" }}>National ID</th>
              <th style={{ padding: "10px 12px" }}>Assigned</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {shown.map((r) => (
              <tr role="row" key={r.ref} style={{ borderTop: "1px solid var(--c-border-subtle)" }}>
                <td role="cell" data-label="Reference" style={{ padding: "10px 12px" }}><Link href={`/console/requests/${r.ref}#id-review`}>{r.ref}</Link></td>
                <td role="cell" data-label="Client" style={{ padding: "10px 12px" }}>{r.profileName}</td>
                <td role="cell" data-label="Service" style={{ padding: "10px 12px" }}>{r.serviceName}</td>
                <td role="cell" data-label="Submitted" style={{ padding: "10px 12px" }}>{fmtDay(r.openedAt)}</td>
                <td role="cell" data-label="ID review" style={{ padding: "10px 12px" }}>{STATUS[r.idReview ?? "none"]}</td>
                <td role="cell" data-label="National ID" style={{ padding: "10px 12px" }} className="tabular-nums">{r.idMasked ?? "—"}</td>
                <td role="cell" data-label="Assigned" style={{ padding: "10px 12px" }}>{r.agentName ?? "Unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p style={{ padding: 24, textAlign: "center", color: "var(--c-text-muted)" }}>No requests in this view.</p>}
      </div>
    </div>
  );
}
