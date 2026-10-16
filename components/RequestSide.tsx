"use client";
import Link from "next/link";
import { useState } from "react";
import { cancelRequest, sendMessage } from "@/app/actions/customer";
import { billOfficial, fmtDay, fmtWhen, initials, rwf } from "@/lib/format";
import { trError } from "@/lib/i18n/errors";
import { feeCaption, methodName, phrase, unitLabel } from "@/lib/i18n/present";
import { amountDue, paidSplit, payStatus } from "@/lib/status";
import type { Billing, Message } from "@/lib/types";
import { useI18n } from "./I18n";
import { FeeLines, Icon, PayBadge } from "./ui";

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

/** What the customer owes and has paid. The actual prompt happens on the payment screen. */
export function PaymentPanel({ reqRef, billing: b, now }: { reqRef: string; billing: Billing; now: string; phone: string }) {
  const { locale, t } = useI18n();
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
              <span className="mut">{tx.status === "refunded" ? t("pay.refunded") : tx.status === "pending" ? t("pay.waiting") : t("pay.paid")} {rwf(tx.official + tx.ours)} · {fmtDay(tx.at, locale)} · {methodName(tx.method, locale)}<br /><span className="m">{tx.receipt}</span></span>
            </li>
          ))}
        </ul>
      )}
      {b.quote === "estimate" && <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="info" size={16} /><span>{t("side.estimate")}</span></p>}
      {canPay && (
        <>
          <Link className="btn btn-p" href={`/portal/requests/${reqRef}/pay`}>{b.quote === "confirmed" ? t("pay.review") : t("pay.pay")} {rwf(due)}</Link>
          <span className="hint">{b.dueAt ? `${t("side.due", { date: fmtDay(b.dueAt, locale) })} ` : ""}{t("side.payHint")}</span>
        </>
      )}
    </section>
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
        <label htmlFor="cx">{t("side.why")} <span className="mut" style={{ fontWeight: 400 }}>{t("start.optional")}</span></label>
        <textarea id="cx" className="in" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("side.ph")} />
        {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
        <button className="btn btn-danger btn-sm" type="submit" disabled={busy} style={{ alignSelf: "flex-start" }}>{busy ? t("pay.cancelling") : t("pay.cancel")}</button>
      </form>
    </details>
  );
}
