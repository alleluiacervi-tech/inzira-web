"use client";
import { withStepUp } from "./console/StepUp";
import { useState } from "react";
import { refund as refundAction } from "@/app/actions/admin";
import { billOfficial, rwf } from "@/lib/format";
import { payStatus, refundSplit } from "@/lib/status";
import type { RequestView } from "@/lib/types";
import { Icon, PayBadge } from "./ui";
import { useDialog } from "./useDialog";

const RECEIPT = { attached: "Receipt attached", awaiting: "Awaiting receipt", na: "n/a" };

/** One row per request: what was quoted, what was paid, and whether the institution's receipt is on file. */
/** `autoRefund`: refunds are sent to the payer's phone through IntouchPay; otherwise staff send them and this records it. */
export default function Ledger({ initial: rows, now, canRefund, autoRefund = false }: { initial: RequestView[]; now: string; canRefund: boolean; autoRefund?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refund, setRefund] = useState<RequestView | null>(null);
  const [done, setDone] = useState("");
  const dialog = useDialog<HTMLDivElement>(!!refund, () => setRefund(null));
  const refundable = (r: RequestView) => refundSplit(r.billing).total;

  return (
    <>
      {done && <div className="alert t-ok" role="status"><Icon name="check" size={20} /><div className="alert-body"><strong>{autoRefund ? "Refund" : "Refund issued"}</strong><span>{done}</span></div></div>}
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
        <button type="button" className="btn btn-s btn-sm" onClick={() => {
          const header = ["Invoice", "Reference", "Customer", "Service", "Official fee", "Our fee", "Method", "Status", "Official receipt"];
          const lines = rows.map((r) => {
            const b = r.billing;
            const receipt = b.officialMode === "direct" ? "Paid by customer" : b.officialMode === "none" ? "n/a" : RECEIPT[b.officialReceipt];
            return [b.invoice, r.ref, r.profile.name, r.name, String(b.official ?? ""), String(b.ours), b.transactions[0]?.method ?? "", payStatus(b, now), receipt]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
          });
          const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "inzira-payments.csv";
          a.click();
          URL.revokeObjectURL(a.href);
        }}>Export CSV</button>
      </div>
      <div className="card table-wrap"><table>
        <thead><tr><th>Invoice</th><th>Customer</th><th>Service</th><th>Official fee</th><th>Our fee</th><th>Method</th><th>Status</th><th>Official receipt</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{rows.map((r) => {
          const b = r.billing;
          return (
            <tr key={r.ref}>
              <td className="nowrap"><span className="stack" style={{ gap: 1 }}><span className="m">{b.invoice}</span><span className="m mut" style={{ fontSize: 11.5 }}>{r.ref}</span></span></td>
              <td><strong>{r.profile.name}</strong></td><td className="mut">{r.name}</td>
              <td style={{ fontWeight: 600 }}>{billOfficial(b)}</td><td className="fee-ours nowrap" style={{ fontWeight: 700 }}>{rwf(b.ours)}</td>
              <td>{b.transactions[0]?.method ?? "—"}</td><td><PayBadge s={payStatus(b, now)} /></td><td className="mut" style={{ fontSize: 13 }}>{b.officialMode === "direct" ? "Paid by customer" : b.officialMode === "none" ? "n/a" : RECEIPT[b.officialReceipt]}</td>
              <td style={{ textAlign: "right" }}>{canRefund && refundable(r) > 0 && <button type="button" className="btn btn-s btn-sm" onClick={() => { setDone(""); setRefund(r); }}>Refund</button>}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      {refund && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setRefund(null)}>
          <div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="rf-t">
            <div className="row between" style={{ alignItems: "flex-start" }}><h3 id="rf-t" className="d" style={{ fontSize: 20 }}>Refund this request</h3><button className="btn btn-g btn-sm btn-ico" type="button" aria-label="Close" onClick={() => setRefund(null)}><Icon name="x" size={18} /></button></div>
            <p style={{ fontSize: 15, lineHeight: 1.55 }}>{autoRefund ? "Send" : "Return"} <strong className="fee-ours">{rwf(refundable(refund))}</strong> to {refund.profile.name} for <span className="m">{refund.ref}</span>, to the {refund.billing.transactions[0]?.method ?? "original"} account it was paid from{autoRefund ? ", through IntouchPay. It reads as refunded once IntouchPay confirms the money was sent." : "."}</p>
            {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
            <p className="hint">{refundSplit(refund.billing).official ? `This includes the ${rwf(refundSplit(refund.billing).official)} official fee we collected and have not paid to the institution yet. ` : ""}Only our assistance fee, and official fees we have not paid out, are refunded here. Official fees already paid to an institution are recovered from that institution, not from Inzira. The refund is written to the audit log.</p>
            <div className="row g10" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-g" type="button" onClick={() => setRefund(null)}>Cancel</button>
              <button className="btn btn-danger" type="button" disabled={busy} onClick={async () => {
                setBusy(true); setError("");
                const r = await withStepUp(() => refundAction(refund.ref)).catch(() => ({ ok: false as const, error: "Not sent. Check your connection, then look under Refunds being sent before trying again." }));
                setBusy(false);
                if (!r.ok) { setError(r.error); return; }
                const who = `${refund.profile.name} · ${refund.billing.invoice}`;
                setDone(r.outcome === "sent" ? `${rwf(r.amount)} sent back to ${who} by mobile money.`
                  : r.outcome === "pending" ? `${rwf(r.amount)} is being sent to ${who}. IntouchPay has not confirmed it yet: it is checked again, and shows under Refunds being sent until then.`
                  : `${rwf(r.amount)} recorded as refunded to ${who}. Send the money back from the mobile money dashboard.`);
                setRefund(null);
              }}>{busy ? (autoRefund ? "Sending…" : "Saving…") : autoRefund ? "Send refund" : "Issue refund"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
