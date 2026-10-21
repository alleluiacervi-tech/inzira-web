"use client";
import { useState } from "react";
import { checkRefund, closeUnclearRefund } from "@/app/actions/admin";
import { fmtAgo, rwf } from "@/lib/format";
import { Icon } from "./ui";

type Pending = { id: number; ref: string; amount: number; phone: string; at: string; requestId: string; unclear: boolean };

/** Refunds IntouchPay has not confirmed yet. Most settle on their own; these can be checked now. One IntouchPay never
 *  answered at all has no id to ask about: staff look it up in the IntouchPay portal and close it if it was not sent. */
export default function PendingRefunds({ initial, now }: { initial: Pending[]; now: string }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  if (!rows.length) return null;
  const act = async (id: number, run: () => Promise<{ ok: true; status?: string } | { ok: false; error: string }>) => {
    setBusy(id); setNote("");
    const r = await run().catch(() => ({ ok: false as const, error: "Not checked. Check your connection and try again." }));
    setBusy(null);
    if (!r.ok) { setNote(r.error); return; }
    if (!("status" in r) || r.status !== "pending") setRows((xs) => xs.filter((x) => x.id !== id));
    setNote(!("status" in r) ? "Closed as not sent. You can send the refund again." : r.status === "sent" ? "Sent. The request now reads as refunded." : r.status === "failed" ? "IntouchPay did not send it. You can send the refund again." : "Still waiting for IntouchPay.");
  };
  return (
    <section className="card stack g12" style={{ padding: 18 }} aria-labelledby="pr-h" data-pending-refunds>
      <div className="row between g8"><h2 id="pr-h" className="d" style={{ fontSize: 18, margin: 0 }}>Refunds being sent</h2><span className="tag">{rows.length}</span></div>
      <ul className="stack g10" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((p) => (
          <li key={p.id} className="row between g12 wrapx" style={{ padding: "10px 0", borderTop: "1px solid var(--line-2)" }}>
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <strong style={{ fontSize: 14.5 }}><span className="m">{p.ref}</span> · {rwf(p.amount)} to {p.phone}</strong>
              <span className="hint">{p.unclear ? `IntouchPay did not answer. Look up ${p.requestId} in the IntouchPay portal: if it was not sent, close it here.` : "Waiting for IntouchPay to confirm."} Started {fmtAgo(p.at, now).toLowerCase()}.</span>
            </span>
            <span className="row g8">
              {!p.unclear && <button type="button" className="btn btn-s btn-sm" disabled={busy === p.id} onClick={() => act(p.id, () => checkRefund(p.id))}><Icon name="refresh" size={16} /> Check again</button>}
              {p.unclear && <button type="button" className="btn btn-s btn-sm" disabled={busy === p.id} onClick={() => act(p.id, () => closeUnclearRefund(p.id))}>Not sent: close it</button>}
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="hint" role="status" style={{ margin: 0 }}>{note}</p>}
    </section>
  );
}
