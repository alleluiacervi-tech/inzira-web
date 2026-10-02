import Ledger from "@/components/Ledger";
import { NoAccess } from "@/components/PageStates";
import { FeeTag, Kpi, PageHead } from "@/components/ui";
import { getAdminOverview, getMyPermissions, getNow, listCases } from "@/lib/repo";

export const metadata = { title: "Payments" };
export default async function Page() {
  const perms = await getMyPermissions();
  if (!perms.includes("refund") && !perms.includes("viewAll")) return <><PageHead title="Payments" /><NoAccess what="the payments ledger" /></>;
  const [o, cases, now] = await Promise.all([getAdminOverview(), listCases(), getNow()]);
  const rows = [...cases].sort((a, b) => b.billing.invoice.localeCompare(a.billing.invoice));
  return (
    <>
      <PageHead title="Payments" sub="Official fees and our fees are ledgered separately · last 30 days" />
      <div className="content">
        <div className="grid cols-4 m-cols-2" style={{ gap: 14 }}>
          <div className="card stack g8" style={{ padding: "18px 20px" }}><span className="row g8"><FeeTag kind="ours" /><span className="mut" style={{ fontSize: 13, fontWeight: 600 }}>Our fees received</span></span><span className="d fee-ours" style={{ fontSize: 28 }}>{o.revenue.ours}</span><span className="mut" style={{ fontSize: 13 }}>Our revenue</span></div>
          <div className="card stack g8" style={{ padding: "18px 20px" }}><span className="row g8"><FeeTag kind="official" /><span className="mut" style={{ fontSize: 13, fontWeight: 600 }}>Official fees through us</span></span><span className="d" style={{ fontSize: 28 }}>{o.revenue.official}</span><span className="mut" style={{ fontSize: 13 }}>Passed on to institutions</span></div>
          <Kpi label="Waiting for payment" value={o.pending.value} sub={`${o.pending.invoices} requests · ${o.pending.overdue} overdue`} icon="clock" />
          <Kpi label="Refunds" value={o.revenue.refunds} sub={`${o.revenue.refundCount} refunds`} icon="refresh" />
        </div>
        <Ledger initial={rows} now={now} canRefund={perms.includes("refund")} />
      </div>
    </>
  );
}
