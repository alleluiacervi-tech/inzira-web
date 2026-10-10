"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cancelRequest, checkPayment, sendMessage, startPayment } from "@/app/actions/customer";
import { billOfficial, fmtDay, fmtWhen, initials, rwf } from "@/lib/format";
import { trError } from "@/lib/i18n/errors";
import { feeCaption, phrase, unitLabel } from "@/lib/i18n/present";
import { amountDue, paidSplit, payStatus } from "@/lib/status";
import type { Billing, Message } from "@/lib/types";
import { useI18n } from "./I18n";
import { isMobile, prettyMobile } from "./PhoneCode";
import { FeeLines, Icon, PayBadge } from "./ui";
import { useDialog } from "./useDialog";

export function Messages({ reqRef, initial, agent, now }: { reqRef: string; initial: Message[]; agent: string; now: string }) {
  const { locale, t } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true); setError("");
    const r = await sendMessage(reqRef, text).catch(() => ({ ok: false as const, error: t("pay.notSent") }));
    setBusy(false);
    if (!r.ok) { setError(trError(locale, r.error)); return; }
    setText("");
  };
  return (
    <section id="messages" className="card" aria-labelledby="msg-h">
      <div className="card-head"><h2 id="msg-h" className="d" style={{ fontSize: 18 }}>{t("side.messages")}</h2><span className="mut" style={{ fontSize: 13 }}>{t("side.whatsapp")}</span></div>
      <div className="stack g16" style={{ padding: 20 }} aria-live="polite">
        {initial.length === 0 && <p className="hint">{t("side.noMessages")}</p>}
        {initial.map((m) => {
          const me = m.by === "customer";
          return (
            <div key={m.id} className="row g10" style={{ alignItems: "flex-start", flexDirection: me ? "row-reverse" : "row" }}>
              <span className="av" style={{ width: 32, height: 32, fontSize: 12, background: me ? "var(--ink)" : undefined, color: me ? "#fff" : undefined }}>{initials(m.name ?? "")}</span>
              <div className="stack g4" style={{ maxWidth: "78%", alignItems: me ? "flex-end" : "flex-start" }}>
                <span className="mut" style={{ fontSize: 12 }}><strong style={{ color: "var(--ink)" }}>{me ? t("service.you") : m.name}</strong> · {fmtWhen(m.at, now, locale)}</span>
                <p className={`bubble ${me ? "bubble-me" : ""}`}>{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="err-text" role="alert" style={{ padding: "0 20px 10px" }}><Icon name="alert" size={15} /> {error}</p>}
      <form className="row g10" style={{ padding: "14px 20px", borderTop: "1px solid var(--line)" }} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="rm" className="sr-only">{t("side.message")}</label>
        <input id="rm" className="in" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("side.placeholder", { agent })} style={{ height: 44 }} maxLength={4000} />
        <button className="btn btn-d" type="submit" aria-label={t("pay.send")} disabled={busy || !text.trim()}>{busy ? <span className="spin" /> : <Icon name="send" size={18} />}</button>
      </form>
    </section>
  );
}

/** What the customer owes and has paid, always as two lines. Paying is: review the amounts,
 *  approve them, get a prompt on the phone, then success or a clear failure. */
export function PaymentPanel({ reqRef, billing: b, now, phone }: { reqRef: string; billing: Billing; now: string; phone: string }) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ours = rwf(b.ours) + (b.oursUnit ? ` ${unitLabel(b.oursUnit, locale)}` : "");
  const total = b.officialMode || b.official === null
    ? `${rwf(b.ours)}${b.officialMode ? "" : ` + ${phrase(locale, "official fee")}`}`
    : rwf(b.official + b.ours);
  const status = payStatus(b, now);
  const due = amountDue(b);
  const paid = paidSplit(b);
  const paidSum = paid.official + paid.ours;
  const canPay = b.quote !== "estimate" && due > 0 && status !== "refunded" && status !== "pending";
  const shown = b.transactions.filter((tx) => tx.status !== "failed");

  return (
    <section id="payments" className="card stack g14" style={{ padding: 18 }} aria-labelledby="pay-h">
      <div className="row between g8"><h2 id="pay-h" className="d" style={{ fontSize: 18 }}>{t("side.payments")}</h2><PayBadge s={status} /></div>
      <FeeLines officialLabel={feeCaption(locale, b.officialLabel)} official={phrase(locale, billOfficial(b))} ours={ours} total={total} totalLabel={status === "paid" ? t("pay.totalPaid") : t("pay.total")} />
      {b.ours !== b.oursStandard && !b.oursNote && <span className="hint">{t("side.adjusted", { amount: rwf(b.oursStandard) })}</span>}
      {b.oursNote && <span className="hint">{t("side.ourFee", { note: b.oursNote })}</span>}
      {b.officialMode === "direct" && <span className="hint">{t("side.direct")}</span>}
      {b.officialMode === "none" && <span className="hint">{t("side.noGov")}</span>}
      {paidSum > 0 && due > 0 && <div className="total-row" style={{ fontSize: 14.5 }}><span>{t("side.paidSoFar", { amount: rwf(paidSum) })}</span><strong>{t("side.still", { amount: rwf(due) })}</strong></div>}
      {shown.length > 0 && (
        <ul className="stack g8" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {shown.map((tx) => (
            <li key={tx.receipt + tx.at} className="row between g8" style={{ fontSize: 13.5 }}>
              <span className="mut">{tx.status === "refunded" ? t("pay.refunded") : tx.status === "pending" ? t("pay.waiting") : t("pay.paid")} {rwf(tx.official + tx.ours)} · {fmtDay(tx.at, locale)} · {tx.method}<br /><span className="m">{tx.receipt}</span></span>
            </li>
          ))}
        </ul>
      )}
      {b.quote === "estimate" && <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="info" size={16} /><span>{t("side.estimate")}</span></p>}
      {canPay && (
        <>
          <button className="btn btn-p" type="button" onClick={() => setOpen(true)}>{b.quote === "confirmed" ? t("pay.review") : t("pay.pay")} {rwf(due)}</button>
          <span className="hint">{b.dueAt ? `${t("side.due", { date: fmtDay(b.dueAt, locale) })} ` : ""}{t("side.payHint")}</span>
        </>
      )}
      {open && <PayDialog reqRef={reqRef} b={b} due={due} phone={phone} onClose={() => setOpen(false)} />}
    </section>
  );
}

function PayDialog({ reqRef, b, due, phone, onClose }: { reqRef: string; b: Billing; due: number; phone: string; onClose: () => void }) {
  const { locale, t } = useI18n();
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
    if (!agree) { setError(t("pay.tick")); return; }
    if (!isMobile(num)) { setError(t("pay.badNumber")); return; }
    setError("");
    setStage("pending");
    const r = await startPayment(reqRef, num).catch(() => ({ ok: false as const, error: t("pay.reach") }));
    if (!r.ok) { setError(trError(locale, r.error)); setStage("review"); return; }
    setReceipt(r.receipt);
    poll(r.txId);
  };
  const title = { review: t("pay.approve"), pending: t("pay.checkPhone"), paid: t("pay.received"), failed: t("pay.failed") }[stage];

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && stage !== "pending" && close()}>
      <div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby="pay-t">
        <div className="row between" style={{ alignItems: "flex-start" }}><h3 id="pay-t" className="d" style={{ fontSize: 20 }}>{title}</h3><button className="btn btn-g btn-sm btn-ico" type="button" aria-label={t("side.close")} onClick={close}><Icon name="x" size={18} /></button></div>
        {stage === "review" && (
          <>
            <FeeLines officialLabel={feeCaption(locale, b.officialLabel)} official={b.officialMode ? phrase(locale, billOfficial(b)) : official === 0 ? (b.official === 0 ? t("pay.free") : t("pay.already")) : rwf(official)} ours={rwf(ours)} total={rwf(due)} totalLabel={t("pay.toPay")} />
            <label className="check"><input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setError(""); }} /> {t("side.agree")}</label>
            <div className="field"><label htmlFor="mm">{t("side.number")}</label>
              <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="mm" className="in" value={num} onChange={(e) => { setNum(e.target.value); setError(""); }} inputMode="tel" /></div>
              <span className="hint">{t("side.pin")}</span></div>
            {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
            <div className="row g10" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-g" type="button" onClick={close}>{t("side.cancel")}</button>
              <button className="btn btn-p" type="button" onClick={send}>{t("side.prompt")}</button>
            </div>
          </>
        )}
        {stage === "pending" && (
          <div className="stack g14" role="status">
            <p style={{ fontSize: 15, lineHeight: 1.55 }}>{t("side.sent", { amount: rwf(due), phone: `+250 ${prettyMobile(num)}` })}</p>
            <div className="row g10 mut" style={{ fontSize: 14 }}><span className="spin spin-dark" /> {t("side.waiting")}</div>
            <span className="hint">{t("side.keep")}</span>
          </div>
        )}
        {stage === "paid" && (
          <div className="stack g14" role="status">
            <div className="row g12"><span className="ok-dot"><Icon name="check" size={22} /></span><p style={{ fontSize: 15, lineHeight: 1.55 }}>{t("side.got", { amount: rwf(due), receipt })}</p></div>
            <button className="btn btn-d" type="button" onClick={close}>{t("side.done")}</button>
          </div>
        )}
        {stage === "failed" && (
          <div className="stack g14" role="alert">
            <p style={{ fontSize: 15, lineHeight: 1.55 }}>{t("side.declined")}</p>
            <div className="row g10" style={{ justifyContent: "flex-end" }}><button className="btn btn-g" type="button" onClick={close}>{t("side.close")}</button><button className="btn btn-p" type="button" onClick={() => setStage("review")}>{t("side.again")}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Shown while a request can still be cancelled by the customer: before payment and submission. */
export function CancelRequest({ reqRef }: { reqRef: string }) {
  const { locale, t } = useI18n();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <details className="card" style={{ padding: 18 }}>
      <summary className="row between g8"><strong style={{ fontSize: 15 }}>{t("side.cancelReq")}</strong><span className="chev"><Icon name="down" size={18} /></span></summary>
      <form className="stack g10" style={{ paddingTop: 14 }} onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError("");
        const r = await cancelRequest(reqRef, reason).catch(() => ({ ok: false as const, error: t("pay.notSaved") }));
        setBusy(false);
        if (!r.ok) { setError(trError(locale, r.error)); return; }
      }}>
        <p className="hint">{t("side.cancelFree")}</p>
        <label htmlFor="cx">{t("side.why")} <span className="mut" style={{ fontWeight: 400 }}>{t("form.optional")}</span></label>
        <textarea id="cx" className="in" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("side.ph")} />
        {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
        <button className="btn btn-danger btn-sm" type="submit" disabled={busy} style={{ alignSelf: "flex-start" }}>{busy ? t("pay.cancelling") : t("pay.cancel")}</button>
      </form>
    </details>
  );
}
