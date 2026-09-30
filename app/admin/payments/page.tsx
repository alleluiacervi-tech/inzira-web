import { Badge, FeeTag, Kpi, PageHead } from "@/components/ui";
import { PAYMENTS } from "@/lib/data";

export const metadata = { title: "Payments" };
export default function Page() {
  return (
    <>
      <PageHead title="Payments" sub="Official fees and our fees are ledgered separately" />
      <div className="content">
        <div className="grid cols-4 m-cols-2" style={{ gap: 14 }}>
          <div className="card stack g8" style={{ padding: "18px 20px" }}><span className="row g8"><FeeTag kind="ours" /><span className="mut" style={{ fontSize: 13, fontWeight: 600 }}>Service fees · Sept</span></span><span className="d fee-ours" style={{ fontSize: 28 }}>RWF 9.86M</span><span className="mut" style={{ fontSize: 13 }}>Our revenue</span></div>
          <div className="card stack g8" style={{ padding: "18px 20px" }}><span className="row g8"><FeeTag kind="official" /><span className="mut" style={{ fontSize: 13, fontWeight: 600 }}>Passed through · Sept</span></span><span className="d" style={{ fontSize: 28 }}>RWF 1.42M</span><span className="mut" style={{ fontSize: 13 }}>Client account · 100% receipted</span></div>
          <Kpi label="Pending payments" value="RWF 640k" sub="38 invoices" icon="clock" />
          <Kpi label="Refunds · Sept" value="RWF 45k" sub="3 cases couldn’t be submitted" icon="refresh" />
        </div>
        <div className="card table-wrap"><table>
          <thead><tr><th>Receipt</th><th>Customer</th><th>Service</th><th>Official fee</th><th>Our fee</th><th>Method</th><th>Status</th><th>Official receipt</th></tr></thead>
          <tbody>{PAYMENTS.map((p) => (
            <tr key={p.receipt}><td className="m">{p.receipt}</td><td><strong>{p.customer}</strong></td><td className="mut">{p.service}</td><td style={{ fontWeight: 600 }}>{p.official}</td><td className="fee-ours" style={{ fontWeight: 700 }}>{p.ours}</td><td>{p.method}</td><td><Badge k={p.status} /></td><td className="mut" style={{ fontSize: 13 }}>{p.officialReceipt}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}
