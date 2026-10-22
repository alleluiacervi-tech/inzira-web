"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { checkPayment, startPayment } from "@/app/actions/customer";
import { billOfficial, fmtDay, rwf } from "@/lib/format";
import { trError } from "@/lib/i18n/errors";
import { feeCaption, phrase } from "@/lib/i18n/present";
import { amountDue, paidSplit, payableNow } from "@/lib/status";
import type { Billing } from "@/lib/types";
import { useI18n } from "./I18n";
import { isMobile, mobile, prettyMobile } from "./PhoneCode";
import { FeeTag, Icon } from "./ui";

type Stage = "review" | "sending" | "pending" | "paid" | "failed" | "slow";
type Network = "MTN MoMo" | "Airtel Money";
/** The network a complete Rwandan number is on: 072 and 073 are Airtel, the rest MTN (as lib/payments.ts sends it). */
const networkOf = (v: string): Network | null => (isMobile(v) ? (/^7[23]/.test(mobile(v)) ? "Airtel Money" : "MTN MoMo") : null);
/** The two networks, as cards on the payment step. The tiles in public/pay are stand-ins: replace them with the official
 *  acceptance marks from MTN Rwanda and Airtel Rwanda, keeping the file names. */
const NETWORKS: { key: Network; logo: string; hint: string }[] = [
  { key: "MTN MoMo", logo: "/pay/mtn-momo.svg", hint: "pay.netMtn" },
  { key: "Airtel Money", logo: "/pay/airtel-money.svg", hint: "pay.netAirtel" },
];
/** The name the customer's phone shows on the prompt, when we know it (set by the account with IntouchPay). */
const MERCHANT = process.env.NEXT_PUBLIC_MOMO_MERCHANT_NAME?.trim() || "";
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** The payment screen: what is being paid, the phone that gets the prompt, then the wait and the outcome.
 *  With `checkout`, the request is waiting to be paid before it is sent to staff, and paying sends it: the whole price,
 *  or for a quoted service its review fee (lib/pricing.ts). */
export default function PayScreen({ reqRef, billing: b, phone, serviceName, contact, checkout: startedAtCheckout = false, waiting }: {
  reqRef: string; billing: Billing; phone: string; serviceName: string;
  /** Where the agent will reach the customer, for the confirmation. */
  contact: string;
  checkout?: boolean;
  /** A prompt already sent and not yet settled: the screen opens on it and keeps checking. */
  waiting?: { txId: number; receipt: string; amount: number; payer: string | null };
}) {
  const { locale, t } = useI18n();
  // Fixed when the screen opens: once paid, the server says the checkout is over, but this screen still finishes it.
  const [checkout] = useState(startedAtCheckout);
  const review = checkout && !!b.reviewFee;
  const due = payableNow(b, checkout).amount;
  const paid = paidSplit(b);
  const paidSum = paid.official + paid.ours;
  const canPay = due > 0;
  // Nothing to pay now because everything is paid, not because the fees are still being worked out.
  const settled = b.quote !== "estimate" && amountDue(b) === 0;
  const [stage, setStage] = useState<Stage>(waiting ? "pending" : "review");
  const [txId, setTxId] = useState<number | null>(waiting?.txId ?? null);
  const [num, setNum] = useState(prettyMobile(waiting?.payer ?? phone));
  const [sentAmount, setSentAmount] = useState(waiting?.amount ?? due);
  // At checkout the amounts were accepted on the request form; a quote's new amounts are approved here with a tick.
  const [agree, setAgree] = useState(checkout);
  const [picked, setPicked] = useState<Network>("MTN MoMo");
  const numberInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(waiting?.receipt ?? "");
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const network = networkOf(num);
  // The number decides the network; a tap only says which one they mean to use before typing it.
  const shownNet = network ?? picked;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // The waiting card counts up, so a long wait reads as progress rather than a frozen screen.
  useEffect(() => {
    if (stage !== "pending" && stage !== "sending") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stage]);
  // Screen readers and keyboard users land on the new state's heading each time it changes.
  useEffect(() => { if (stage !== "review") heading.current?.focus(); }, [stage]);

  // Approving takes a PIN on the phone, and the callback usually settles it first, so the screen asks slowly. The server
  // also limits how often the provider is asked (reconcileForScreen). About fifteen minutes in all: the prompt's own limit.
  const poll = (id: number, tries = 0) => {
    const wait = tries === 0 ? 3000 : tries < 12 ? 5000 : 10000;
    timer.current = setTimeout(async () => {
      const r = await checkPayment(id).catch(() => null);
      if (r?.ok && r.status === "paid") { setStage("paid"); return; }
      if (r?.ok && r.status === "failed") { setStage("failed"); return; }
      if (tries > 95) { setStage("slow"); return; }
      poll(id, tries + 1);
    }, wait);
  };
  // Picks up checking a prompt sent before this page was opened. Runs once: `poll` reschedules itself.
  useEffect(() => { if (waiting) poll(waiting.txId); }, []);
  const send = async () => {
    if (!isMobile(num)) { setError(t("pay.badNumber")); return; }
    if (!agree) { setError(t("pay.tick")); return; }
    setError("");
    setStartedAt(Date.now());
    setStage("sending");
    const r = await startPayment(reqRef, num).catch(() => ({ ok: false as const, error: t("pay.reach") }));
    if (!r.ok) { setError(trError(locale, r.error)); setStage("review"); return; }
    setReceipt(r.receipt);
    setTxId(r.txId);
    setSentAmount(due);
    setStage("pending");
    poll(r.txId);
  };

  // The lines are the whole fees; what was already paid (a review fee, say) is its own line, so the total adds up.
  const officialText = b.officialMode ? phrase(locale, billOfficial(b)) : !b.official ? t("pay.free") : rwf(b.official);
  const shownNumber = `+250 ${prettyMobile(num)}`;
  const busy = stage === "sending" || stage === "pending" || stage === "slow";

  const bill = (
    <section className="pay-bill" aria-labelledby="bill-h">
      <div className="stack g4">
        <span className="eb" style={{ fontSize: 10.5 }}>{t("pay.summary")}</span>
        <strong id="bill-h" className="d" style={{ fontSize: 19, lineHeight: 1.25 }}>{serviceName}</strong>
        <span className="mut m" style={{ fontSize: 13 }}>{t("pay.ref", { ref: reqRef })}</span>
      </div>
      {review ? (
        <div className="stack g8">
          <dl className="pay-lines">
            <div><dt><FeeTag kind="ours" /> {t("start.reviewFeeName")}</dt><dd className="fee-ours">{rwf(b.reviewFee!)}</dd></div>
          </dl>
          <p className="hint" style={{ margin: 0 }}>{t("pay.reviewLine")}</p>
        </div>
      ) : (
        <dl className="pay-lines">
          <div><dt><FeeTag kind="official" /> {feeCaption(locale, b.officialLabel)}</dt><dd>{officialText}</dd></div>
          <div><dt><FeeTag kind="ours" /> {t("service.assistShort")}</dt><dd className="fee-ours">{rwf(b.ours)}</dd></div>
          {paidSum > 0 && <div data-paid-line><dt>{t("pay.alreadyPaid")}</dt><dd>−{rwf(paidSum)}</dd></div>}
        </dl>
      )}
      <div className="pay-perf" aria-hidden="true" />
      <div className="row between g12" style={{ alignItems: "baseline" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{stage === "paid" ? t("pay.totalPaid") : t("pay.toPay")}</span>
        <strong className="d pay-total">{rwf(stage === "paid" ? sentAmount : due)}</strong>
      </div>
    </section>
  );

  if (!canPay && stage === "review") {
    return (
      <div className="stack g16">
        {bill}
        <div className="card stack g10" style={{ padding: 20 }}>
          <h1 className="d" style={{ fontSize: 22 }}>{settled ? t("pay.received") : t("pay.approve")}</h1>
          <p style={{ fontSize: 15, lineHeight: 1.55 }}>{settled ? t("pay.allPaid") : t("pay.notYet")}</p>
          <Link className="btn btn-s" href={`/portal/requests/${reqRef}`} style={{ alignSelf: "flex-start" }}>{t("pay.back")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack g16">
      {stage !== "paid" && bill}

      {stage === "review" && (
        <section className="card pay-form" aria-labelledby="pay-h">
          <div className="stack g6">
            <h1 id="pay-h" className="d" style={{ fontSize: 24 }}>{review ? t("pay.reviewTitle") : checkout ? t("pay.checkoutTitle") : t("pay.approve")}</h1>
            <p className="mut" style={{ fontSize: 15, lineHeight: 1.5 }}>{t("pay.screenLead")}</p>
          </div>
          <div className="pay-nets" role="radiogroup" aria-label={t("pay.networks")}>
            {NETWORKS.map((n) => (
              <button key={n.key} type="button" role="radio" aria-checked={shownNet === n.key} data-net={n.key === "MTN MoMo" ? "mtn" : "airtel"}
                className={`pay-netcard ${shownNet === n.key ? "on" : ""}`} onClick={() => { setPicked(n.key); numberInput.current?.focus(); }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={n.logo} alt="" width={44} height={44} />
                <span className="stack" style={{ gap: 2, minWidth: 0, textAlign: "left" }}>
                  <strong>{t(`pay.methods.${n.key}`)}</strong>
                  <span className="hint">{t(n.hint)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="mm">{t("pay.numberFor", { network: t(`pay.methods.${shownNet}`) })}</label>
            <div className="pay-phone">
              <span className="in in-prefix" aria-hidden="true">+250</span>
              <input id="mm" ref={numberInput} className={`in ${error && !isMobile(num) ? "in-err" : ""}`} value={num} inputMode="tel" autoComplete="tel-national" placeholder={shownNet === "Airtel Money" ? "722 123 456" : "788 123 456"}
                aria-describedby="mm-hint" onChange={(e) => { setNum(e.target.value); setError(""); }} />
            </div>
            <span className="hint" id="mm-hint">{t("side.pin")}</span>
          </div>
          {!checkout && <label className="check"><input id="pay-agree" type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setError(""); }} /> {t("side.agree")}</label>}
          {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
          <div className="pay-cta">
            <button className="btn btn-p btn-lg pay-btn" type="button" onClick={send} data-pay>
              <Icon name="lock" size={18} /> {t("pay.payBtn", { total: rwf(due) })}
            </button>
          </div>
          <ul className="pay-trust">
            <li><Icon name="shield" size={16} color="var(--ok)" /> {t("pay.trustApprove")}</li>
            <li><Icon name="file-text" size={16} /> {t("pay.trustReceipt")}</li>
            <li><Icon name="check-circle" size={16} /> {review ? t("start.reviewRefund") : b.official && !b.officialMode ? t("pay.refundAll") : t("service.refund")}</li>
          </ul>
          {checkout && <p className="hint" style={{ margin: 0 }}>{t("pay.later")} <Link className="lnk" href={`/portal/requests/${reqRef}`}>{t("pay.laterLink")}</Link></p>}
        </section>
      )}

      {busy && (
        <section className="card pay-wait" role="status" aria-live="polite">
          <div className="pay-phone-art" aria-hidden="true">
            <span className="pay-ring" /><span className="pay-ring pay-ring-2" />
            <span className="pay-handset"><span className="pay-pin"><i /><i /><i /><i /></span></span>
          </div>
          <div className="stack g6" style={{ textAlign: "center", alignItems: "center" }}>
            <h1 ref={heading} tabIndex={-1} className="d" style={{ fontSize: 24 }}>{stage === "sending" ? t("pay.sendingTitle") : t("pay.checkPhone")}</h1>
            <p style={{ fontSize: 15, lineHeight: 1.55, maxWidth: 400 }}>
              {stage === "sending" ? t("pay.sendingBody", { phone: shownNumber }) : stage === "slow" ? t("side.stillOpen") : t("side.sent", { amount: rwf(sentAmount), phone: shownNumber })}
            </p>
            {MERCHANT && stage !== "slow" && <p className="hint" style={{ margin: 0 }} data-merchant>{t("pay.merchant", { name: MERCHANT })}</p>}
          </div>
          <ol className="pay-steps">
            <li className={stage === "sending" ? "cur" : "done"}>{stage === "sending" ? t("pay.stepSending") : t("pay.stepSent")}</li>
            <li className={stage === "sending" ? "" : "cur"}>{t("pay.stepPin")}</li>
            <li>{checkout ? t("pay.stepSentToTeam") : t("pay.stepDone")}</li>
          </ol>
          {stage !== "slow" && <span className="pay-elapsed">{t("pay.elapsed", { time: clock(now - startedAt) })}</span>}
          {stage === "slow" && txId !== null
            ? <button className="btn btn-p" type="button" onClick={() => { setStage("pending"); poll(txId); }}>{t("side.checkAgain")}</button>
            : <p className="hint" style={{ textAlign: "center", maxWidth: 400 }}>{t("pay.noPrompt")}</p>}
        </section>
      )}

      {stage === "paid" && (
        <section className="card pay-done" role="status" aria-live="polite">
          <svg className="pay-tick" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
          <div className="stack g8" style={{ textAlign: "center", alignItems: "center" }}>
            <h1 ref={heading} tabIndex={-1} className="d" style={{ fontSize: 26 }}>{checkout ? t("pay.paidCheckoutTitle") : t("pay.received")}</h1>
            <p style={{ fontSize: 15.5, lineHeight: 1.55, maxWidth: 420 }}>
              {review ? t("pay.paidReviewBody", { time: t("responseTime"), contact, fee: rwf(b.reviewFee!) })
                : checkout ? t("pay.paidCheckoutBody", { time: t("responseTime"), contact }) : t("side.got", { amount: rwf(sentAmount), receipt })}
            </p>
          </div>
          <dl className="pay-receipt">
            <div><dt>{t("pay.receiptNo")}</dt><dd className="m">{receipt}</dd></div>
            <div><dt>{t("pay.amount")}</dt><dd>{rwf(sentAmount)}</dd></div>
            <div><dt>{t("pay.paidWith")}</dt><dd>{network ? t(`pay.methods.${network}`) : shownNumber}</dd></div>
            <div><dt>{t("pay.date")}</dt><dd>{fmtDay(new Date().toISOString(), locale)}</dd></div>
          </dl>
          {checkout && (
            <div className="stack g10" style={{ width: "100%" }}>
              <span className="eb" style={{ fontSize: 10.5 }}>{t("pay.nextTitle")}</span>
              <ol className="pay-next">
                <li><Icon name="user" size={17} /> {t("pay.next1", { time: t("responseTime") })}</li>
                <li><Icon name="send" size={17} /> {review ? t("pay.next2Review") : t("pay.next2")}</li>
                <li><Icon name="bell" size={17} /> {t("pay.next3")}</li>
              </ol>
            </div>
          )}
          <div className="stack g10" style={{ width: "100%" }}>
            <Link className="btn btn-p btn-lg" href={`/portal/requests/${reqRef}`} style={{ justifyContent: "center" }}>{checkout ? t("pay.follow") : t("side.done")}</Link>
            <Link className="btn btn-s" href={`/portal/requests/${reqRef}/receipt`} style={{ justifyContent: "center" }}><Icon name="file-text" size={17} /> {t("pay.viewReceipt")}</Link>
          </div>
        </section>
      )}

      {stage === "failed" && (
        <section className="card pay-failed" role="alert">
          <span className="pay-x" aria-hidden="true"><Icon name="x" size={26} /></span>
          <div className="stack g6" style={{ textAlign: "center", alignItems: "center" }}>
            <h1 ref={heading} tabIndex={-1} className="d" style={{ fontSize: 24 }}>{t("pay.failed")}</h1>
            <p style={{ fontSize: 15, lineHeight: 1.55, maxWidth: 420 }}>{t("side.declined")}</p>
          </div>
          <button className="btn btn-p btn-lg" type="button" onClick={() => { setStage("review"); setAgree(true); }} style={{ width: "100%", justifyContent: "center" }}>{t("side.again")}</button>
        </section>
      )}
    </div>
  );
}
