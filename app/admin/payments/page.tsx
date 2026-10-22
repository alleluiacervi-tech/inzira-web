import Ledger from "@/components/Ledger";
import PendingRefunds from "@/components/PendingRefunds";
import { intouchBalance } from "@/lib/intouchpay";
import { payoutProvider } from "@/lib/payments";
import { listPendingPayouts } from "@/lib/payouts";
import { rwf } from "@/lib/format";
import { NoAccess } from "@/components/PageStates";
import { FeeTag, Kpi, PageHead } from "@/components/ui";
import { getAdminOverview, getMyPermissions, getNow, listCases } from "@/lib/repo";

export const metadata = { title: "Payments" };
export default async function Page() {
  const perms = await getMyPermissions();
  // The summary and the ledger both read every case, so this page needs "View all cases". Refund alone would open it
  // and then fail where the totals are built.
  if (!perms.includes("viewAll")) return <><PageHead title="Payments" /><NoAccess what="the payments ledger" /></>;
  const provider = payoutProvider();
  // Refunds are sent from the IntouchPay balance, so it is shown here. A slow or failed answer does not hold the page.
  const [o, cases, now, pending, balance] = await Promise.all([
    getAdminOverview(), listCases(), getNow(), listPendingPayouts(),
    provider === "intouch" ? intouchBalance().catch((e) => { console.error("[payments] balance", e); return null; }) : Promise.resolve(undefined),
  ]);
  const rows = [...cases].sort((a, b) => b.billing.invoice.localeCompare(a.billing.invoice));
  return (
    <>
      <PageHead title="Payments" sub="Official fees and our fees are ledgered separately · last 30 days" />
      <div className="content">
        <div className="grid cols-4 m-cols-2" style={{ gap: 14 }}>
          <div className="card stack g8" style={{ padding: "18px 20px" }}><span className="row g8"><FeeTag kind="ours" /><span className="mut" style={{ fontSize: 13, fontWeight: 600 }}>Our fees received</span></span><span className="d fee-ours" style={{ fontSize: 28 }}>{o.revenue.ours}</span><span className="mut" style={{ fontSize: 13 }}>Our revenue</span></div>
          <div className="card stack g8" style={{ padding: "18px 20px" }}><span className="row g8"><FeeTag kind="official" /><span className="mut" style={{ fontSize: 13, fontWeight: 600 }}>Official fees through us</span></span><span className="d" style={{ fontSize: 28 }}>{o.revenue.official}</span><span className="mut" style={{ fontSize: 13 }}>Passed on to institutions</span></div>
          <Kpi label="Waiting for payment" value={o.pending.value} sub={`${o.pending.invoices} requests · ${o.pending.overdue} overdue`} icon="clock" />
          <Kpi label="Refunds" value={o.revenue.refunds} sub={balance === undefined ? `${o.revenue.refundCount} refunds` : balance === null ? "IntouchPay balance unavailable" : `IntouchPay balance ${rwf(balance)}`} icon="refresh" />
        </div>
        <PendingRefunds initial={pending} now={now} />
        <Ledger initial={rows} now={now} canRefund={perms.includes("refund")} autoRefund={!!provider} />
      </div>
    </>
  );
}
