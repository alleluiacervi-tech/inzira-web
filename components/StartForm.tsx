"use client";
import Link from "next/link";
import { withLocale } from "@/lib/seo";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { displayOfficial, displayOurs, displayTotal } from "@/lib/i18n/present";
import { trError } from "@/lib/i18n/errors";
import { rwf } from "@/lib/format";
import { idAsk, nationalIdDigits, nationalIdError } from "@/lib/identity";
import { answerError, answerInput, cleanAnswer, isAsked } from "@/lib/identifiers";
import { checkoutPrice, optionRange, reviewFeeFor, withOption } from "@/lib/pricing";
import type { DeliverVia, Service } from "@/lib/types";
import { submitRequest } from "@/app/actions/customer";
import { useHuman } from "./Human";
import { useI18n } from "./I18n";
import { isMobile, prettyMobile } from "./PhoneCode";
import { Steps } from "./Steps";
import { Alert, FeeLines, Icon } from "./ui";

/** Puts React elements where a translated sentence has `{name}` placeholders, e.g. the reference in bold. */
function withStrong(sentence: string, parts: Record<string, ReactNode>) {
  return sentence.split(/(\{\w+\})/).map((piece, i) => {
    const key = /^\{(\w+)\}$/.exec(piece)?.[1];
    return key && key in parts ? <Fragment key={i}>{parts[key]}</Fragment> : piece;
  });
}

type Key = "about" | "review";
const EMPTY = { forWho: "me", name: "", subject: "", nid: "", via: "whatsapp" as DeliverVia, email: "", phone: "", purpose: "", option: "", notes: "" };
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const MAX_FILE = 10 * 1024 * 1024;
/** The slot for files that answer no document in particular. */
const EXTRA = "__extra";

/** Starts a request. With a service it asks only what that service needs: who it is for, the name and ID number, the
 *  service's own questions, and where to send the result (WhatsApp or email). Documents are added on the check step, or
 *  sent after paying. Without a service (`service` null) the customer describes their situation and an agent works out
 *  which procedure applies; `describeFee` is the review fee for that case. Nothing is confirmed with a code: the
 *  mobile money PIN that pays the request proves the number. */
export default function StartForm({ service: s, describeFee = null }: { service: Service | null; describeFee?: number | null }) {
  const { locale, t } = useI18n();
  const draftKey = `inzira:start:${s?.slug ?? "describe"}`;
  // Pay to submit: a service with a settled price is paid for in full at the end of this form, any other with a small
  // review fee taken off our fee later (lib/pricing.ts). The request reaches our team once that is paid.
  // A service priced by option (passport type, test type) has its price once an option is picked.
  const range = s ? optionRange(s) : null;
  // Two steps: who you are and where to send it, then a short check with the documents. Paying is the third.
  const keys: Key[] = ["about", "review"];
  const names: Record<Key, string> = { about: t("start.about"), review: t("start.review") };
  const router = useRouter();
  const who: [string, string][] = [["me", t("start.me")], ["family", t("start.family")], ["business", t("start.myBiz")]];
  const last = keys.length - 1;
  const questions = s?.questions ?? [];
  const docs = s?.documents ?? [];

  const human = useHuman();
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"form" | "done">("form");
  const [f, setF] = useState(EMPTY);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Chosen files, by document name (EXTRA for anything else). They are sent with the request after the code.
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [fileError, setFileError] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [ref, setRef] = useState("");
  const [ack, setAck] = useState(false);
  const [portalOpened, setPortalOpened] = useState(true);
  const [payNow, setPayNow] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [restored, setRestored] = useState(false);
  const set = (k: keyof typeof EMPTY, v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const priced = s ? withOption(s, f.option === "" ? null : Number(f.option)) : null;
  const price = priced ? checkoutPrice(priced) : null;
  const reviewFee = s ? (priced ? reviewFeeFor(priced) : null) : describeFee;
  const payFirst = price?.total ?? reviewFee;
  // Questions that depend on the purpose (a ticket number, or a plate and TIN) are asked once it is picked.
  const purposeIndex = s?.purposes ? s.purposes.indexOf(f.purpose) : -1;
  const asked = questions.filter((q) => isAsked(q, purposeIndex));
  const stepNames = [...keys.map((k) => names[k]), ...(payFirst || range ? [t("start.stepPay")] : [])];

  // A refresh or an accidental back should not cost the customer what they typed.
  // Kept in this tab only, and cleared as soon as the request is sent. The ID number is never kept.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
      if (saved) {
        const savedForm = saved.f && typeof saved.f === "object" ? saved.f as Record<string, string> : {};
        const { nid: _dropped, ...rest } = savedForm;
        setF({ ...EMPTY, ...rest, via: rest.via === "email" ? "email" : "whatsapp", nid: "" });
        if (saved.answers && typeof saved.answers === "object") setAnswers(saved.answers as Record<string, string>);
        setStep(Math.min(Number(saved.step) || 0, last));
      }
    } catch { /* storage unavailable: start empty */ }
    setRestored(true);
  }, [draftKey, last]);
  useEffect(() => {
    if (!restored || phase === "done") return;
    try {
      const { nid: _nid, ...safe } = f;
      sessionStorage.setItem(draftKey, JSON.stringify({ step, f: safe, answers }));
    } catch { /* ignore */ }
  }, [draftKey, restored, phase, step, f, answers]);

  const key = keys[step];
  const ask = idAsk(s, f.forWho);
  const nidDigits = nationalIdDigits(f.nid);
  const idErr = nationalIdError(nidDigits);
  const storeId = ask === "required" || (ask === "optional" && nidDigits.length > 0);
  // No code: the MoMo PIN that pays the request proves the number. WhatsApp customers may add an email for the receipt.
  const byPhone = f.via === "whatsapp";
  const needsEmail = f.via === "email";
  const errors: Record<string, string> = {};
  if (key === "about") {
    if (!f.name.trim()) errors.name = t("start.errName");
    if (f.forWho === "family" && !f.subject.trim()) errors.subject = t("start.errPerson");
    if (f.forWho === "business" && !f.subject.trim()) errors.subject = t("start.errBiz");
    if (storeId && idErr) errors.nid = t(idErr === "long" ? "start.errIdLong" : "start.errId", { n: nidDigits.length });
    if (s?.feeOptions?.length && !priced) errors.option = t("start.errOption");
    for (const q of asked) {
      const v = (answers[q.key] ?? "").trim();
      if (q.required && !v) errors[`q-${q.key}`] = t("start.errAnswer");
      else if (v && cleanAnswer(q.kind, v) === null) errors[`q-${q.key}`] = t(`start.${answerError(q.kind)}`);
    }
    if (f.via === "whatsapp" && !isMobile(f.phone)) errors.phone = t("start.errWhatsapp");
    if (f.via === "email" && f.phone.trim() && !isMobile(f.phone)) errors.phone = t("authErr.badPhone");
    if ((needsEmail || f.email.trim()) && !isEmail(f.email)) errors.email = t("start.errEmail");
    if (!s && f.notes.trim().length < 10) errors.notes = t("start.errNotes");
  }
  if (key === "review" && !ack) errors.ack = t("start.errAck");
  const valid = Object.keys(errors).length === 0;

  const next = async () => {
    setTouched(true);
    if (!valid) return;
    setTouched(false);
    if (step < last) { setStep(step + 1); window.scrollTo({ top: 0 }); return; }
    // Last step: send it. Paying comes next and is what hands it to our team.
    setSending(true); setSendError("");
    const error = await send().catch(() => t("authErr.submitFail"));
    if (error) { setSending(false); setSendError(error); }
  };
  const send = async (): Promise<string | null> => {
    const fd = new FormData();
    fd.set("slug", s?.slug ?? "");
    for (const [k, v] of Object.entries(f)) fd.set(k, k === "nid" && ask === "hidden" ? "" : v);
    // The one tick on the check step covers how the ID number is used.
    fd.set("idConsent", storeId && ack ? "1" : "0");
    fd.set("human", (await human.get()) ?? "");
    for (const q of asked) fd.set(`answer-${q.key}`, cleanAnswer(q.kind, answers[q.key] ?? "") ?? "");
    docs.forEach((d, i) => { for (const file of files[d.name] ?? []) fd.append(`file-${i}`, file); });
    for (const file of files[EXTRA] ?? []) fd.append("file-extra", file);
    const r = await submitRequest(fd).catch(() => ({ ok: false as const, error: t("authErr.submitFail") }));
    if (!r.ok) return trError(locale, r.error);
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    // Straight on to paying, which is what sends the request: in the portal when signed in, else on its own page.
    const page = r.signedIn ? `/portal/requests/${r.ref}` : `/r/${r.ref}`;
    if (r.payNow !== null) { router.replace(`${page}/pay`); return null; }
    setRef(r.ref);
    setPortalOpened(r.signedIn);
    setPayNow(r.payNow);
    setPhase("done");
    window.scrollTo({ top: 0 });
    return null;
  };
  const addFiles = (slot: string, list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (!picked.length) return;
    const big = picked.find((x) => x.size > MAX_FILE);
    if (big) { setFileError(t("start.tooBig")); return; }
    setFileError("");
    setFiles((cur) => ({ ...cur, [slot]: [...(cur[slot] ?? []), ...picked].slice(0, 5) }));
  };
  const dropFile = (slot: string, i: number) => setFiles((cur) => ({ ...cur, [slot]: (cur[slot] ?? []).filter((_, j) => j !== i) }));
  const fileCount = Object.values(files).reduce((n, l) => n + l.length, 0);
  const channel = f.via === "whatsapp" ? t("start.viaWhatsapp") : t("start.viaEmail");

  // When and what is paid, said the same way in the fee summary and beside the form.
  const payNote = price ? t("start.payUpfront", { total: rwf(price.total) }) : reviewFee ? t("start.reviewUpfront", { fee: rwf(reviewFee) }) : t("start.payAfter");
  const err = (k: string) => touched && errors[k] ? <span className="err-text" id={`${k}-err`}><Icon name="alert" size={15} /> {errors[k]}</span> : null;
  const bad = (k: string) => (touched && errors[k] ? "in-err" : "");
  const contact = byPhone ? `+250 ${prettyMobile(f.phone)}` : f.email.trim().toLowerCase();

  const page = portalOpened ? `/portal/requests/${ref}` : `/r/${ref}`;
  if (phase === "done") {
    return (
      <section className="wrap" style={{ paddingTop: 64, paddingBottom: 96 }}>
        <div className="card stack g16" style={{ maxWidth: 560, margin: "0 auto", padding: 32, alignItems: "center", textAlign: "center" }}>
          <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--ok-bg)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={32} /></span>
          <h1 className="h-flow">{payNow !== null ? t("start.payTitle") : t("start.received")}</h1>
          {payNow !== null && (
            <p style={{ fontSize: 16, lineHeight: 1.55 }}>{withStrong(t("start.payBody", { ref: "{ref}", total: "{total}" }), {
              ref: <strong className="m" style={{ fontSize: 15 }} data-ref>{ref}</strong>,
              total: <strong>{rwf(payNow)}</strong>,
            })}</p>
          )}
          {payNow === null && <p style={{ fontSize: 16, lineHeight: 1.55 }}>{withStrong(t("start.receivedBody", { ref: "{ref}", contact: "{contact}", what: s ? t("start.checkDocs") : t("start.readSent"), time: t("responseTime") }), {
            ref: <strong className="m" style={{ fontSize: 15 }} data-ref>{ref}</strong>,
            contact: <strong style={{ overflowWrap: "anywhere" }}>{contact}</strong>,
          })}</p>}
          {payNow !== null && <Link className="btn btn-p btn-lg" href={`${page}/pay`} data-pay-now>{t("start.payNow", { total: rwf(payNow) })}</Link>}
          <p className="hint">{payNow !== null ? t("start.payLaterHint") : portalOpened ? t("start.receivedTrack") : t("start.ready")}</p>
          <div className="row g10 wrapx" style={{ justifyContent: "center" }}>
            <Link className="btn btn-d" href={page} data-request-page>{t("start.see")}</Link>
            <Link className="btn btn-s" href="/services">{t("start.more")}</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="wrap split application-workspace" style={{ ["--aside" as string]: "380px", paddingTop: 32, paddingBottom: 96, gap: 40 }}>
      <div className="stack g24" style={{ maxWidth: 640 }}>
        <div className="stack g12">
          <Link href={s ? `/services/${s.slug}` : "/services"} className="lnk row g6" style={{ fontSize: 14 }}><Icon name="arrow-l" size={16} /> {s ? s.name : t("start.all")}</Link>
          <Steps names={stepNames} current={step} label={t("start.stepLabel", { n: step + 1, total: stepNames.length, name: names[key] })} />
          <span className="eb d-hide" style={{ fontSize: 11 }}>{t("start.stepOf", { n: step + 1, total: stepNames.length })} · {names[key]}</span>
        </div>

        {s && (
          <details className="card fee-peek">
            <summary className="row between g12">
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="eb" style={{ fontSize: 10.5 }}>{price || !reviewFee ? t("start.pay") : t("service.estimate")}</span>
                <strong className="nowrap" style={{ fontSize: 15 }}>{displayTotal(s, locale)}</strong>
              </span>
              <span className="row g6 mut" style={{ fontSize: 13.5, fontWeight: 600 }}>{t("start.feeDetails")} <span className="chev"><Icon name="down" size={18} /></span></span>
            </summary>
            <div className="stack g12" style={{ paddingTop: 14 }}>
              <FeeLines officialLabel={t("service.officialShort")} official={displayOfficial(s, locale)} ours={displayOurs(s, locale)} total={displayTotal(s, locale)} totalLabel={t("service.estimate")} />
              <p className="hint">{s.official.note}</p>
              <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} color="var(--ok)" /><span>{payNote}</span></p>
            </div>
          </details>
        )}

        {key === "about" && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="h-flow">{t("start.aboutTitle")}</h1><p className="mut" style={{ fontSize: 15 }}>{t("start.aboutLead")}</p></div>
            {/* What can make the institution refuse, or a bill lapse, is said before anything is paid. */}
            {s?.notes.filter((n) => n.kind === "warn").map((n) => <Alert key={n.title} kind="warn" title={n.title}>{n.body}</Alert>)}
            <fieldset className="stack g10" style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className="label" style={{ marginBottom: 10 }}>{t("start.who")}</legend>
              <div className="grid cols-3" style={{ gap: 10 }}>
                {who.map(([k, l]) => (
                  <label key={k} className="choice"><input type="radio" name="who" checked={f.forWho === k} onChange={() => set("forWho", k)} /> {l}</label>
                ))}
              </div>
            </fieldset>
            <div className="field"><label htmlFor="f-name">{t("start.fullName")}</label><input id="f-name" className={`in ${bad("name")}`} value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" aria-describedby="name-err" />{err("name")}</div>
            {f.forWho !== "me" && (
              <div className="field"><label htmlFor="f-subject">{f.forWho === "family" ? t("start.theirName") : t("start.bizName")}</label><input id="f-subject" className={`in ${bad("subject")}`} value={f.subject} onChange={(e) => set("subject", e.target.value)} autoComplete={f.forWho === "business" ? "organization" : "off"} aria-describedby="subject-err" />
                {f.forWho === "family" && <span className="hint">{t("start.consent")}</span>}{err("subject")}</div>
            )}
            {ask !== "hidden" && (
              <div className="field">
                <label htmlFor="f-nid">{f.forWho === "family" ? t("start.theirId") : t("start.nid")}{ask === "optional" ? <span className="mut" style={{ fontWeight: 400 }}> {t("start.optional")}</span> : null}</label>
                <div className="row g8">
                  <input id="f-nid" className={`in grow ${bad("nid")}`} inputMode="numeric" autoComplete="off" spellCheck={false} value={f.nid} onChange={(e) => set("nid", e.target.value)} placeholder="1 1995 8 0045123 0 17" aria-describedby="nid-err nid-hint" aria-invalid={touched && !!errors.nid} />
                  <button type="button" className="btn btn-s" onClick={() => set("nid", "")} disabled={!f.nid}>{t("start.nidClear")}</button>
                </div>
                <span className="hint" id="nid-hint">{ask === "required" ? t("start.nidWhy") : s?.idPolicy === "unsure" || !s ? t("start.nidUnsureLead") : t("start.nidOptionalLead")}</span>
                {err("nid")}
              </div>
            )}
            {s?.feeOptions?.length ? (
              <fieldset className="stack g10" style={{ border: 0, margin: 0, padding: 0 }} aria-describedby="option-err">
                <legend className="label" style={{ marginBottom: 10 }}>{s.feeOptionLabel ?? t("start.option")}</legend>
                {s.feeOptions.map((o, i) => {
                  const total = checkoutPrice(withOption(s, i)!)?.total;
                  return (
                    <label key={o.label} className={`choice choice-priced ${f.option === String(i) ? "on" : ""}`} data-option={i}>
                      <input type="radio" name="option" checked={f.option === String(i)} onChange={() => set("option", String(i))} />
                      <span className="grow">{o.label}</span>
                      {total !== undefined && <strong className="fig nowrap">{rwf(total)}</strong>}
                    </label>
                  );
                })}
                {err("option")}
              </fieldset>
            ) : null}
            {s?.purposes && (
              <fieldset className="stack g10" style={{ border: 0, margin: 0, padding: 0 }}>
                <legend className="label" style={{ marginBottom: 10 }}>{s.purposeLabel ?? t("start.purpose")}</legend>
                {s.purposes.map((p) => (
                  <label key={p} className="choice"><input type="radio" name="purpose" checked={f.purpose === p} onChange={() => set("purpose", p)} /> {p}</label>
                ))}
              </fieldset>
            )}
            {asked.map((q) => {
              const input = answerInput(q.kind);
              return (
                <div className="field" key={q.key}>
                  <label htmlFor={`q-${q.key}`}>{q.label}{q.required ? null : <span className="mut" style={{ fontWeight: 400 }}> {t("start.optional")}</span>}</label>
                  <input id={`q-${q.key}`} className={`in ${bad(`q-${q.key}`)}`} value={answers[q.key] ?? ""} placeholder={q.placeholder} spellCheck={false} autoComplete="off" {...input}
                    onChange={(e) => setAnswers((cur) => ({ ...cur, [q.key]: e.target.value }))}
                    onBlur={(e) => { const clean = cleanAnswer(q.kind, e.target.value); if (clean && q.kind && q.kind !== "text" && q.kind !== "date") setAnswers((cur) => ({ ...cur, [q.key]: clean })); }}
                    aria-describedby={`q-${q.key}-err q-${q.key}-hint`} aria-invalid={touched && !!errors[`q-${q.key}`]} />
                  {q.hint && <span className="hint" id={`q-${q.key}-hint`}>{q.hint}</span>}
                  {err(`q-${q.key}`)}
                </div>
              );
            })}

            <fieldset className="stack g12" style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className="label" style={{ marginBottom: 4 }}>{t("start.viaTitle")}</legend>
              <span className="hint" style={{ marginTop: -4 }}>{t("start.viaLead")}</span>
              <div className="via-pick" role="radiogroup" aria-label={t("start.viaTitle")}>
                {(["whatsapp", "email"] as const).map((v) => (
                  <label key={v} className={`via-opt ${f.via === v ? "on" : ""}`} data-via={v}>
                    <input type="radio" name="via" className="sr-only" checked={f.via === v} onChange={() => set("via", v)} />
                    <span className={`via-ico via-ico-${v}`} aria-hidden="true"><Icon name={v === "whatsapp" ? "whatsapp" : "mail"} size={20} /></span>
                    <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                      <strong>{v === "whatsapp" ? t("start.viaWhatsapp") : t("start.viaEmail")}</strong>
                      <span className="hint">{v === "whatsapp" ? t("start.viaWhatsappSub") : t("start.viaEmailSub")}</span>
                    </span>
                    <span className="via-dot" aria-hidden="true" />
                  </label>
                ))}
              </div>
            </fieldset>
            {f.via === "whatsapp" ? (
              <div className="field"><label htmlFor="f-phone">{t("start.whatsappNumber")}</label>
                <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="f-phone" className={`in ${bad("phone")}`} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="788 123 456" autoComplete="tel-national" aria-describedby="phone-err phone-hint" /></div>
                <span className="hint" id="phone-hint">{t("start.whatsappHint")}</span>{err("phone")}</div>
            ) : (
              <div className="field"><label htmlFor="f-phone">{t("start.phoneOpt")}</label>
                <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="f-phone" className={`in ${bad("phone")}`} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="788 123 456" autoComplete="tel-national" aria-describedby="phone-err phone-hint" /></div>
                <span className="hint" id="phone-hint">{t("start.phoneOptHint")}</span>{err("phone")}</div>
            )}
            {(
              <div className="field"><label htmlFor="f-email">{f.via === "whatsapp" ? <>{t("start.emailForCode")} <span className="mut" style={{ fontWeight: 400 }}>{t("start.optional")}</span></> : t("start.email")}</label>
                <input id="f-email" type="email" className={`in ${bad("email")}`} inputMode="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder={t("signIn.emailPh")} autoComplete="email" autoCapitalize="none" spellCheck={false} aria-describedby="email-err email-hint" />
                <span className="hint" id="email-hint">{t("start.emailHint")}</span>{err("email")}</div>
            )}
            <div className="field"><label htmlFor="f-notes">{s ? <>{t("start.notesOpt")} <span className="mut" style={{ fontWeight: 400 }}>{t("start.optional")}</span></> : t("start.situationLabel")}</label>
              <textarea id="f-notes" className={`in ${bad("notes")}`} rows={s ? 2 : 5} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder={s ? t("start.notesPh") : t("start.situationPh")} aria-describedby="notes-err" />{err("notes")}</div>
          </div>
        )}

        {key === "review" && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="h-flow">{payFirst ? t("start.checkPay") : t("start.check")}</h1><p className="mut" style={{ fontSize: 15 }}>{price ? t(byPhone ? "start.checkPayLeadPhone" : "start.checkPayLead", { total: rwf(price.total) }) : reviewFee ? t(byPhone ? "start.checkReviewLeadPhone" : "start.checkReviewLead", { fee: rwf(reviewFee) }) : t("start.checkLead")}</p></div>
            <div className="card" style={{ padding: 18 }}>
              <dl className="review">
                <dt>{t("start.svc")}</dt><dd>{s ? s.name : t("start.unsureYet")}</dd>
                <dt>{t("start.yourName")}</dt><dd>{f.name}</dd>
                {f.forWho !== "me" && <><dt>{t("start.for")}</dt><dd>{f.subject}</dd></>}
                {storeId && <><dt>{t("start.id")}</dt><dd className="m" style={{ fontSize: 14, fontWeight: 500 }}>{f.nid}</dd></>}
                {s?.feeOptions && priced && <><dt>{s.feeOptionLabel ?? t("start.option")}</dt><dd>{s.feeOptions[Number(f.option)]?.label}</dd></>}
                {f.purpose && <><dt>{s?.noId ? t("start.attending") : s?.purposeLabel ?? t("start.purposeRow")}</dt><dd>{f.purpose}</dd></>}
                {asked.filter((q) => (answers[q.key] ?? "").trim()).map((q) => <Fragment key={q.key}><dt>{q.label}</dt><dd style={{ overflowWrap: "anywhere" }}>{cleanAnswer(q.kind, answers[q.key]) ?? answers[q.key]}</dd></Fragment>)}
                <dt>{t("start.deliverRow")}</dt><dd style={{ overflowWrap: "anywhere" }}>{f.via === "whatsapp" ? `WhatsApp · +250 ${prettyMobile(f.phone)}` : `${t("start.viaEmail")} · ${f.email.trim().toLowerCase()}`}</dd>
                {f.via === "email" && f.phone.trim() && <><dt>{t("start.phoneRow")}</dt><dd>+250 {prettyMobile(f.phone)}</dd></>}
                {f.via === "whatsapp" && f.email.trim() && <><dt>{t("start.emailRow")}</dt><dd style={{ overflowWrap: "anywhere" }}>{f.email.trim().toLowerCase()}</dd></>}
                {f.notes.trim() && <><dt>{s ? t("start.notes") : t("start.situationRow")}</dt><dd style={{ fontWeight: 400 }}>{f.notes}</dd></>}
              </dl>
              <button type="button" className="btn btn-g btn-sm" style={{ marginTop: 12 }} onClick={() => { setStep(0); setTouched(false); }}><Icon name="edit" size={16} /> {t("start.edit")}</button>
            </div>
            {/* Said before paying: the one thing the customer does in person. */}
            {s?.inPerson && <Alert kind="info" title={t("start.inPersonTitle")}><span data-in-person>{s.inPerson}</span></Alert>}

            {docs.length > 0 ? (
              <div className="stack g12" data-doc-list>
                <div className="stack g4"><strong style={{ fontSize: 16 }}>{t("start.docsTitle")}</strong><span className="hint">{t("start.docsLater", { channel })}</span></div>
                <ul className="doc-pick">
                  {docs.map((d) => {
                    const mine = files[d.name] ?? [];
                    return (
                      <li key={d.name} className={mine.length ? "has" : ""}>
                        <span className="doc-pick-mark" aria-hidden="true"><Icon name={mine.length ? "check" : "file"} size={16} /></span>
                        <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                          <span className="row g8 wrapx" style={{ alignItems: "baseline" }}><strong style={{ fontSize: 14.5 }}>{d.name}</strong>{d.required ? <span className="tag tag-warn">{t("start.needed")}</span> : <span className="mut" style={{ fontSize: 12.5 }}>{t("start.optionalTag")}</span>}</span>
                          <span className="hint">{d.detail}</span>
                          {mine.map((file, i) => (
                            <span key={`${file.name}-${i}`} className="row between g8 doc-pick-file"><span className="nowrap-ellipsis">{file.name}</span><button type="button" className="btn btn-g btn-sm" onClick={() => dropFile(d.name, i)}>{t("start.remove")}</button></span>
                          ))}
                        </span>
                        <label className="btn btn-s btn-sm doc-pick-add">
                          <Icon name="upload" size={16} /> {mine.length ? t("start.addMore") : t("start.add")}
                          <input type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => { addFiles(d.name, e.target.files); e.target.value = ""; }} />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="stack g10">
                <p className="hint" style={{ margin: 0 }}>{s ? t("start.noDocsNeeded") : t("start.docsLead")}</p>
                {(files[EXTRA] ?? []).map((file, i) => (
                  <div key={`${file.name}-${i}`} className="row between g12" style={{ padding: "10px 12px", background: "var(--bone)", borderRadius: 6 }}>
                    <span className="row g8" style={{ fontSize: 14, minWidth: 0 }}><Icon name="file" size={17} /><span className="nowrap-ellipsis">{file.name}</span></span>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => dropFile(EXTRA, i)}>{t("start.remove")}</button>
                  </div>
                ))}
                {!s && (
                  <label className="btn btn-s" style={{ alignSelf: "flex-start" }}>
                    <Icon name="upload" size={18} /> {t("start.choose")}
                    <input type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => { addFiles(EXTRA, e.target.files); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            )}
            {fileError && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {fileError}</span>}
            {fileCount > 0 && <p className="hint row g8" style={{ margin: 0 }}><Icon name="lock" size={15} /> {t("start.filesPrivate")}</p>}

            {!price && reviewFee && (
              <div className="card stack g12" style={{ padding: 16, background: "var(--bone)" }} data-checkout-total data-review-fee>
                <div className="row between g12" style={{ alignItems: "baseline" }}>
                  <span className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 15 }}>{t("start.toPayTotal")}</strong><span className="hint">{t("start.reviewFeeName")}</span></span>
                  <strong className="d fig" style={{ fontSize: 22, color: "var(--brand)" }}>{rwf(reviewFee)}</strong>
                </div>
                <ul className="stack g8" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {[t("start.reviewWhat", { time: t("responseTime") }), t("start.reviewCredit"), t("start.reviewRefund")].map((line) => (
                    <li key={line} className="hint row g8" style={{ alignItems: "flex-start", margin: 0 }}><Icon name="check" size={16} color="var(--ok)" /><span>{line}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {price && (
              <div className="card stack g12" style={{ padding: 16, background: "var(--bone)" }} data-checkout-total>
                {price.official > 0 && (
                  <dl className="stack g6" style={{ margin: 0 }}>
                    <div className="row between g12"><dt className="hint">{s?.official.label ?? t("service.officialShort")}</dt><dd className="fig" style={{ margin: 0 }}>{rwf(price.official)}</dd></div>
                    <div className="row between g12"><dt className="hint">{t("start.oursLine")}</dt><dd className="fig" style={{ margin: 0 }}>{rwf(price.ours)}</dd></div>
                  </dl>
                )}
                <div className="row between g12" style={{ alignItems: "baseline" }}>
                  <strong style={{ fontSize: 15 }}>{t("start.toPayTotal")}</strong>
                  <strong className="d fig" style={{ fontSize: 22, color: "var(--brand)" }}>{rwf(price.total)}</strong>
                </div>
                <p className="hint row g8" style={{ alignItems: "flex-start", margin: 0 }}><Icon name="lock" size={16} /><span>{t("start.payNote", { total: rwf(price.total) })}{price.direct ? ` ${t("start.payNoteDirect")}` : price.official > 0 ? ` ${t("start.payNoteOneBill")}` : ""}</span></p>
              </div>
            )}
            <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-describedby="ack-err" /> {storeId ? `${t("start.ack")} ${t("start.ackId")}` : t("start.ack")}</label>
            {err("ack")}
            <p className="hint">{t("start.retentionNotice")} <Link href={withLocale(locale, "/privacy")} target="_blank" rel="noopener noreferrer">{t("nav.privacy")}</Link></p>
          </div>
        )}

        {sendError && <Alert kind="err" title={t("start.codeFail")} live>{sendError}</Alert>}
        <div className="row g10 start-cta" style={{ paddingTop: 8 }}>
          {step > 0 && <button type="button" className="btn btn-s btn-lg" onClick={() => { setStep(step - 1); setTouched(false); }}>{t("start.back")}</button>}
          <button type="button" className="btn btn-p btn-lg grow" onClick={next} disabled={sending}>{sending ? <><span className="spin" /> {t("start.sendingCode")}</> : key === "review" ? (payFirst ? t("start.toPayment") : t("start.send")) : t("start.continue")}</button>
        </div>
      </div>

      {s ? (
        <aside className="card stack g14 sticky-aside fee-aside" style={{ padding: 20 }}>
          <span className="eb" style={{ fontSize: 11 }}>{t("start.yourRequest")}</span>
          <strong className="d" style={{ fontSize: 20 }}>{s.name}</strong>
          <span className="mut" style={{ fontSize: 13.5 }}>{s.via} · {s.time}</span>
          <FeeLines officialLabel={t("service.officialFee")} official={displayOfficial(s, locale)} ours={displayOurs(s, locale)} total={displayTotal(s, locale)} totalLabel={t("service.totalShort")} />
          <p className="hint">{s.official.note}</p>
          <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} color="var(--ok)" /><span>{payNote}</span></p>
        </aside>
      ) : (
        <aside className="card stack g14 sticky-aside" style={{ padding: 20 }}>
          <span className="eb" style={{ fontSize: 11 }}>{reviewFee ? t("start.reviewEb", { fee: rwf(reviewFee) }) : t("start.free")}</span>
          <strong className="d" style={{ fontSize: 20 }}>{t("start.which")}</strong>
          <ul className="stack g10" style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 14.5 }}>
            <li className="row g10" style={{ alignItems: "flex-start" }}><Icon name="clock" size={18} /><span>{t("start.reply", { time: t("responseTime") })}</span></li>
            <li className="row g10" style={{ alignItems: "flex-start" }}><Icon name="card" size={18} /><span>{t("start.bothFees")}</span></li>
            <li className="row g10" style={{ alignItems: "flex-start" }}><Icon name="shield" size={18} color="var(--ok)" /><span>{reviewFee ? `${t("start.reviewCredit")} ${t("start.reviewRefund")}` : t("start.noCharge")}</span></li>
          </ul>
        </aside>
      )}
    </section>
  );
}
