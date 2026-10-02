"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cancelRequest, checkPayment, sendMessage, startPayment } from "@/app/actions/customer";
import { billOfficial, billOurs, billTotal, fmtDay, fmtWhen, initials, rwf } from "@/lib/format";
import { amountDue, paidSplit, payStatus } from "@/lib/status";
import type { Billing, Message } from "@/lib/types";
import { isMobile, prettyMobile } from "./PhoneCode";
import { FeeLines, Icon, PayBadge } from "./ui";
import { useDialog } from "./useDialog";

export function Messages({ reqRef, initial, agent, now }: { reqRef: string; initial: Message[]; agent: string; now: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true); setError("");
    const r = await sendMessage(reqRef, text).catch(() => ({ ok: false as const, error: "Not sent. Check your connection and try again." }));
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setText("");
    router.refresh();
  };
  return (
    <section id="messages" className="card" aria-labelledby="msg-h">
      <div className="card-head"><h2 id="msg-h" className="d" style={{ fontSize: 18 }}>Messages</h2><span className="mut" style={{ fontSize: 13 }}>Also on WhatsApp</span></div>
      <div className="stack g16" style={{ padding: 20 }} aria-live="polite">
        {initial.length === 0 && <p className="hint">No messages yet. Your agent will write here and on WhatsApp.</p>}
        {initial.map((m) => {
          const me = m.by === "customer";
          return (
            <div key={m.id} className="row g10" style={{ alignItems: "flex-start", flexDirection: me ? "row-reverse" : "row" }}>
              <span className="av" style={{ width: 32, height: 32, fontSize: 12, background: me ? "var(--ink)" : undefined, color: me ? "#fff" : undefined }}>{initials(m.name ?? "")}</span>
              <div className="stack g4" style={{ maxWidth: "78%", alignItems: me ? "flex-end" : "flex-start" }}>
                <span className="mut" style={{ fontSize: 12 }}><strong style={{ color: "var(--ink)" }}>{me ? "You" : m.name}</strong> · {fmtWhen(m.at, now)}</span>
                <p className={`bubble ${me ? "bubble-me" : ""}`}>{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="err-text" role="alert" style={{ padding: "0 20px 10px" }}><Icon name="alert" size={15} /> {error}</p>}
      <form className="row g10" style={{ padding: "14px 20px", borderTop: "1px solid var(--line)" }} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="rm" className="sr-only">Message</label>
        <input id="rm" className="in" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Write to ${agent}…`} style={{ height: 44 }} maxLength={4000} />
        <button className="btn btn-d" type="submit" aria-label="Send message" disabled={busy || !text.trim()}>{busy ? <span className="spin" /> : <Icon name="send" size={18} />}</button>
      </form>
    </section>
  );
}

/** What the customer owes and has paid, always as two lines. Paying is: review the amounts,
 *  approve them, get a prompt on the phone, then success or a clear failure. */
export function PaymentPanel({ reqRef, billing: b, now, phone }: { reqRef: string; billing: Billing; now: string; phone: string }) {
  const [open, setOpen] = useState(false);
  const status = payStatus(b, now);
  const due = amountDue(b);
  const paid = paidSplit(b);
  const paidSum = paid.official + paid.ours;
  const canPay = b.quote !== "estimate" && due > 0 && status !== "refunded" && status !== "pending";
  const shown = b.transactions.filter((t) => t.status !== "failed");

  return (
    <section id="payments" className="card stack g14" style={{ padding: 18 }} aria-labelledby="pay-h">
      <div className="row between g8"><h2 id="pay-h" className="d" style={{ fontSize: 18 }}>Payments</h2><PayBadge s={status} /></div>
      <FeeLines officialLabel={b.officialLabel} official={billOfficial(b)} ours={billOurs(b)} total={billTotal(b)} totalLabel={status === "paid" ? "Total paid" : "Total"} />
      {b.ours !== b.oursStandard && !b.oursNote && <span className="hint">Assistance fee adjusted from {rwf(b.oursStandard)}, approved by a supervisor.</span>}
      {b.oursNote && <span className="hint">Our fee: {b.oursNote}.</span>}
      {b.officialMode === "direct" && <span className="hint">The official amount is paid by you directly to the institution. We tell you how much and by when.</span>}
      {b.officialMode === "none" && <span className="hint">There is no government fee for this service.</span>}
      {paidSum > 0 && due > 0 && <div className="total-row" style={{ fontSize: 14.5 }}><span>Paid so far {rwf(paidSum)}</span><strong>Still to pay {rwf(due)}</strong></div>}
      {shown.length > 0 && (
        <ul className="stack g8" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {shown.map((t) => (
            <li key={t.receipt + t.at} className="row between g8" style={{ fontSize: 13.5 }}>
              <span className="mut">{t.status === "refunded" ? "Refunded" : t.status === "pending" ? "Waiting for approval:" : "Paid"} {rwf(t.official + t.ours)} · {fmtDay(t.at)} · {t.method}<br /><span className="m">{t.receipt}</span></span>
            </li>
          ))}
        </ul>
      )}
      {b.quote === "estimate" && <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="info" size={16} /><span>Your agent confirms the exact amounts for your case first. You approve them before anything is charged.</span></p>}
      {canPay && (
        <>
          <button className="btn btn-p" type="button" onClick={() => setOpen(true)}>{b.quote === "confirmed" ? "Review and pay" : "Pay"} {rwf(due)}</button>
          <span className="hint">{b.dueAt ? `Due ${fmtDay(b.dueAt)}. ` : ""}Pay by MTN MoMo or Airtel Money. Nothing is charged until you approve.</span>
        </>
      )}
      {open && <PayDialog reqRef={reqRef} b={b} due={due} phone={phone} onClose={() => setOpen(false)} />}
    </section>
  );
}

function PayDialog({ reqRef, b, due, phone, onClose }: { reqRef: string; b: Billing; due: number; phone: string; onClose: () => void }) {
  const router = useRouter();
  const [stage, setStage] = useState<"review" | "pending" | "paid" | "failed">("review");
  const [num, setNum] = useState(prettyMobile(phone));
  const [agree, setAgree] = useState(b.quote === "approved");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = () => { if (timer.current) clearTimeout(timer.current); router.refresh(); onClose(); };
  const dialog = useDialog<HTMLDivElement>(true, close);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const paid = paidSplit(b);
  const official = Math.max(0, (b.official ?? 0) - paid.official);
  const ours = Math.max(0, due - official);

  const poll = (txId: number, tries = 0) => {
    timer.current = setTimeout(async () => {
      const r = await checkPayment(txId).catch(() => null);
      if (r?.ok && r.status === "paid") { setStage("paid"); return; }
      if (r?.ok && r.status === "failed") { setStage("failed"); return; }
      if (tries > 60) { setStage("failed"); return; }
      poll(txId, tries + 1);
    }, 1500);
  };
  const send = async () => {
    if (!agree) { setError("Tick the box to approve these amounts."); return; }
    if (!isMobile(num)) { setError("Enter the MoMo or Airtel Money number to charge, e.g. 788 123 456."); return; }
    setError("");
    setStage("pending");
    const r = await startPayment(reqRef, num).catch(() => ({ ok: false as const, error: "We couldn’t reach mobile money. Nothing was charged." }));
    if (!r.ok) { setError(r.error); setStage("review"); return; }
    setReceipt(r.receipt);
    poll(r.txId);
  };
  const title = { review: "Approve and pay", pending: "Check your phone", paid: "Payment received", failed: "The payment didn’t go through" }[stage];

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && stage !== "pending" && close()}>
      <div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="pay-t">
        <div className="row between" style={{ alignItems: "flex-start" }}><h3 id="pay-t" className="d" style={{ fontSize: 20 }}>{title}</h3><button className="btn btn-g btn-sm btn-ico" type="button" aria-label="Close" onClick={close}><Icon name="x" size={18} /></button></div>
        {stage === "review" && (
          <>
            <FeeLines officialLabel={b.officialLabel} official={b.officialMode ? billOfficial(b) : official === 0 ? (b.official === 0 ? "Free" : "Already paid") : rwf(official)} ours={rwf(ours)} total={rwf(due)} totalLabel="To pay now" />
            <label className="check"><input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setError(""); }} /> I approve these amounts. The official fee goes to the institution; the assistance fee goes to Inzira.</label>
            <div className="field"><label htmlFor="mm">MTN MoMo or Airtel Money number</label>
              <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="mm" className="in" value={num} onChange={(e) => { setNum(e.target.value); setError(""); }} inputMode="tel" /></div>
              <span className="hint">You’ll get a prompt on this phone to approve with your PIN.</span></div>
            {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
            <div className="row g10" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-g" type="button" onClick={close}>Cancel</button>
              <button className="btn btn-p" type="button" onClick={send}>Send payment prompt</button>
            </div>
          </>
        )}
        {stage === "pending" && (
          <div className="stack g14" role="status">
            <p style={{ fontSize: 15, lineHeight: 1.55 }}>We sent a payment prompt for <strong>{rwf(due)}</strong> to <strong>+250 {prettyMobile(num)}</strong>. Approve it with your PIN.</p>
            <div className="row g10 mut" style={{ fontSize: 14 }}><span className="spin spin-dark" /> Waiting for your approval… this can take up to a minute.</div>
            <span className="hint">Keep this page open. If nothing appears on your phone, wait a minute and check your request again.</span>
          </div>
        )}
        {stage === "paid" && (
          <div className="stack g14" role="status">
            <div className="row g12"><span className="ok-dot"><Icon name="check" size={22} /></span><p style={{ fontSize: 15, lineHeight: 1.55 }}>We received <strong>{rwf(due)}</strong>. Receipt <span className="m">{receipt}</span> shows the official fee and our fee as separate lines.</p></div>
            <button className="btn btn-d" type="button" onClick={close}>Done</button>
          </div>
        )}
        {stage === "failed" && (
          <div className="stack g14" role="alert">
            <p style={{ fontSize: 15, lineHeight: 1.55 }}>The prompt was declined or timed out. <strong>Nothing was charged.</strong> Check the number and your balance, then try again.</p>
            <div className="row g10" style={{ justifyContent: "flex-end" }}><button className="btn btn-g" type="button" onClick={close}>Close</button><button className="btn btn-p" type="button" onClick={() => setStage("review")}>Try again</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Shown while a request can still be cancelled by the customer: before payment and submission. */
export function CancelRequest({ reqRef }: { reqRef: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <details className="card" style={{ padding: 18 }}>
      <summary className="row between g8"><strong style={{ fontSize: 15 }}>Cancel this request</strong><span className="chev"><Icon name="down" size={18} /></span></summary>
      <form className="stack g10" style={{ paddingTop: 14 }} onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError("");
        const r = await cancelRequest(reqRef, reason).catch(() => ({ ok: false as const, error: "Not saved. Check your connection and try again." }));
        setBusy(false);
        if (!r.ok) { setError(r.error); return; }
        router.refresh();
      }}>
        <p className="hint">Nothing has been charged, so cancelling costs nothing.</p>
        <label htmlFor="cx">Why are you cancelling? <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></label>
        <textarea id="cx" className="in" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
        <button className="btn btn-danger btn-sm" type="submit" disabled={busy} style={{ alignSelf: "flex-start" }}>{busy ? "Cancelling…" : "Cancel request"}</button>
      </form>
    </details>
  );
}
