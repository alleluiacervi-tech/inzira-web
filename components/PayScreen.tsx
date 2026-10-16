"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { checkPayment, startPayment } from "@/app/actions/customer";
import { billOfficial, rwf } from "@/lib/format";
import { trError } from "@/lib/i18n/errors";
import { feeCaption, phrase } from "@/lib/i18n/present";
import { amountDue, paidSplit } from "@/lib/status";
import type { Billing } from "@/lib/types";
import { useI18n } from "./I18n";
import { isMobile, prettyMobile } from "./PhoneCode";
import { FeeLines, Icon } from "./ui";

/** The payment screen: one amount, the phone that receives the prompt, and what happened. */
export default function PayScreen({ reqRef, billing: b, phone, serviceName }: { reqRef: string; billing: Billing; phone: string; serviceName: string }) {
  const { locale, t } = useI18n();
  const due = amountDue(b);
  const paid = paidSplit(b);
  const official = Math.max(0, (b.official ?? 0) - paid.official);
  const ours = Math.max(0, due - official);
  const canPay = b.quote !== "estimate" && due > 0;
  const [stage, setStage] = useState<"review" | "pending" | "paid" | "failed" | "slow">(canPay ? "review" : "review");
  const [txId, setTxId] = useState<number | null>(null);
  const [num, setNum] = useState(prettyMobile(phone));
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const poll = (id: number, tries = 0) => {
    const wait = tries < 20 ? 1500 : 4000;
    timer.current = setTimeout(async () => {
      const r = await checkPayment(id).catch(() => null);
      if (r?.ok && r.status === "paid") { setStage("paid"); return; }
      if (r?.ok && r.status === "failed") { setStage("failed"); return; }
      if (tries > 220) { setStage("slow"); return; }
      poll(id, tries + 1);
    }, wait);
  };
  const send = async () => {
    if (!agree) { setError(t("pay.tick")); return; }
    if (!isMobile(num)) { setError(t("pay.badNumber")); return; }
    setError("");
    setStage("pending");
    const r = await startPayment(reqRef, num).catch(() => ({ ok: false as const, error: t("pay.reach") }));
    if (!r.ok) { setError(trError(locale, r.error)); setStage("review"); return; }
    setReceipt(r.receipt);
    setTxId(r.txId);
    poll(r.txId);
  };

  return (
    <div className="card stack g16" style={{ padding: 24 }}>
      <div className="stack g6">
        <h1 className="h-flow" style={{ fontSize: 28 }}>{stage === "paid" ? t("pay.received") : stage === "failed" ? t("pay.failed") : stage === "pending" || stage === "slow" ? t("pay.checkPhone") : t("pay.approve")}</h1>
        <p className="mut" style={{ fontSize: 15, lineHeight: 1.5 }}>{serviceName}</p>
      </div>

      {!canPay && (
        <p style={{ fontSize: 15, lineHeight: 1.55 }}>{t("pay.notYet")}</p>
      )}

      {canPay && stage === "review" && (
        <>
          <p style={{ fontSize: 15, lineHeight: 1.55, margin: 0 }}>{t("pay.screenLead")}</p>
          <FeeLines officialLabel={feeCaption(locale, b.officialLabel)} official={b.officialMode ? phrase(locale, billOfficial(b)) : official === 0 ? (b.official === 0 ? t("pay.free") : t("pay.already")) : rwf(official)} ours={rwf(ours)} total={rwf(due)} totalLabel={t("pay.toPay")} />
          <label className="check"><input id="pay-agree" type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setError(""); }} /> {t("side.agree")}</label>
          <div className="field">
            <label htmlFor="mm">{t("side.number")}</label>
            <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="mm" className="in" value={num} onChange={(e) => { setNum(e.target.value); setError(""); }} inputMode="tel" autoComplete="tel-national" /></div>
            <span className="hint">{t("side.pin")}</span>
          </div>
          {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
          <button className="btn btn-p btn-lg" type="button" onClick={send}>{t("side.prompt")}</button>
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
          <Link className="btn btn-d" href={`/portal/requests/${reqRef}`}>{t("side.done")}</Link>
        </div>
      )}

      {stage === "slow" && txId !== null && (
        <div className="stack g14" role="status">
          <p style={{ fontSize: 15, lineHeight: 1.55 }}>{t("side.stillOpen")}</p>
          <button className="btn btn-p" type="button" onClick={() => { setStage("pending"); poll(txId); }}>{t("side.checkAgain")}</button>
        </div>
      )}

      {stage === "failed" && (
        <div className="stack g14" role="alert">
          <p style={{ fontSize: 15, lineHeight: 1.55 }}>{t("side.declined")}</p>
          <button className="btn btn-p" type="button" onClick={() => setStage("review")}>{t("side.again")}</button>
        </div>
      )}
    </div>
  );
}
