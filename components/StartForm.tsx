"use client";
import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { displayOfficial, displayOurs, displayTotal } from "@/lib/i18n/present";
import { trError } from "@/lib/i18n/errors";
import type { Service } from "@/lib/types";
import { requestEmailCode } from "@/app/actions/auth";
import { submitRequest } from "@/app/actions/customer";
import { useI18n } from "./I18n";
import { CodeEntry, isMobile, prettyMobile } from "./PhoneCode";
import { Alert, FeeLines, Icon } from "./ui";

/** Puts React elements where a translated sentence has `{name}` placeholders, e.g. the reference in bold. */
function withStrong(sentence: string, parts: Record<string, ReactNode>) {
  return sentence.split(/(\{\w+\})/).map((piece, i) => {
    const key = /^\{(\w+)\}$/.exec(piece)?.[1];
    return key && key in parts ? <Fragment key={i}>{parts[key]}</Fragment> : piece;
  });
}

type Key = "about" | "request" | "docs" | "review";
const EMPTY = { forWho: "me", name: "", subject: "", nid: "", dob: "", email: "", phone: "", purpose: "", notes: "" };
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
/** A real date, as a date field gives it ("YYYY-MM-DD"), not in the future and not before 1900. */
const isDob = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCMonth() === +m[2] - 1 && +m[1] >= 1900 && d.getTime() <= Date.now(); };

/** Starts a request. With a service it collects what that service needs; without one (`service` null)
 *  the customer describes their situation and an agent works out which procedure applies. */
export default function StartForm({ service: s }: { service: Service | null }) {
  const { locale, t } = useI18n();
  const draftKey = `inzira:start:${s?.slug ?? "describe"}`;
  // A service that needs no documents (e.g. a training) skips that step.
  const keys: Key[] = s && s.documents.length === 0 ? ["about", "request", "review"] : ["about", "request", "docs", "review"];
  const names: Record<Key, string> = { about: t("start.about"), request: s ? t("start.request") : t("start.situation"), docs: t("start.docs"), review: t("start.review") };
  const who: [string, string][] = [["me", t("start.me")], ["family", t("start.family")], ["business", t("start.myBiz")]];
  const last = keys.length - 1;
  const docList = s ? s.documents : [{ name: t("start.extraDoc"), detail: t("start.extraDetail"), required: false }];

  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"form" | "verify" | "done">("form");
  const [f, setF] = useState(EMPTY);
  // Chosen files, by document name. They are sent with the request after the phone is confirmed.
  const [files, setFiles] = useState<Record<string, File>>({});
  const [demoCode, setDemoCode] = useState<string>();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [ref, setRef] = useState("");
  const [ack, setAck] = useState(false);
  // Making a portal is a choice: without it the customer is a contact, followed with the reference and email.
  const [portal, setPortal] = useState(true);
  const [portalOpened, setPortalOpened] = useState(true);
  const [touched, setTouched] = useState(false);
  const [restored, setRestored] = useState(false);
  const set = (k: keyof typeof EMPTY, v: string) => setF((cur) => ({ ...cur, [k]: v }));

  // A refresh or an accidental back should not cost the customer what they typed.
  // Kept in this tab only, and cleared as soon as the request is sent.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
      if (saved) { setF({ ...EMPTY, ...saved.f }); setStep(Math.min(Number(saved.step) || 0, last)); }
    } catch { /* storage unavailable: start empty */ }
    setRestored(true);
  }, [draftKey, last]);
  useEffect(() => {
    if (!restored || phase === "done") return;
    try { sessionStorage.setItem(draftKey, JSON.stringify({ step, f })); } catch { /* ignore */ }
  }, [draftKey, restored, phase, step, f]);

  const key = keys[step];
  const needId = !s?.noId && f.forWho !== "business";
  const nidDigits = f.nid.replace(/\D/g, "");
  const errors: Record<string, string> = {};
  if (key === "about") {
    if (!f.name.trim()) errors.name = t("start.errName");
    if (f.forWho === "family" && !f.subject.trim()) errors.subject = t("start.errPerson");
    if (f.forWho === "business" && !f.subject.trim()) errors.subject = t("start.errBiz");
    if (needId && nidDigits.length !== 16) errors.nid = t("start.errId", { n: nidDigits.length });
    if (needId && !isDob(f.dob)) errors.dob = t("start.errDob");
    if (!isEmail(f.email)) errors.email = t("start.errEmail");
    if (f.phone.trim() && !isMobile(f.phone)) errors.phone = t("authErr.badPhone");
  }
  if (key === "request" && !s && f.notes.trim().length < 10) errors.notes = t("start.errNotes");
  if (key === "review" && !ack) errors.ack = t("start.errAck");
  const valid = Object.keys(errors).length === 0;

  const next = async () => {
    setTouched(true);
    if (!valid) return;
    setTouched(false);
    if (step < last) { setStep(step + 1); window.scrollTo({ top: 0 }); return; }
    // Last step: email a code to confirm the address before anything is created.
    setSending(true); setSendError("");
    const r = await requestEmailCode(f.email).catch(() => ({ ok: false as const, error: t("authErr.sendFail") }));
    setSending(false);
    if (!r.ok) { setSendError(trError(locale, r.error)); return; }
    setDemoCode(r.demoCode);
    setPhase("verify");
    window.scrollTo({ top: 0 });
  };
  const send = async (code: string) => {
    const fd = new FormData();
    fd.set("slug", s?.slug ?? "");
    for (const [k, v] of Object.entries(f)) fd.set(k, v);
    fd.set("code", code);
    fd.set("portal", portal ? "1" : "0");
    if (s) s.documents.forEach((d, i) => { if (files[d.name]) fd.set(`file-${i}`, files[d.name]); });
    else Object.values(files).forEach((file) => fd.append("file-extra", file));
    const r = await submitRequest(fd).catch(() => ({ ok: false as const, error: t("authErr.submitFail") }));
    if (!r.ok) return trError(locale, r.error);
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    setRef(r.ref);
    setPortalOpened(r.portal);
    setPhase("done");
    window.scrollTo({ top: 0 });
    return null;
  };
  const err = (k: string) => touched && errors[k] ? <span className="err-text" id={`${k}-err`}><Icon name="alert" size={15} /> {errors[k]}</span> : null;
  const bad = (k: string) => (touched && errors[k] ? "in-err" : "");
  const missing = s ? s.documents.filter((d) => d.required && !files[d.name]).length : 0;

  if (phase === "done") {
    return (
      <section className="wrap" style={{ paddingTop: 64, paddingBottom: 96 }}>
        <div className="card stack g16" style={{ maxWidth: 560, margin: "0 auto", padding: 32, alignItems: "center", textAlign: "center" }}>
          <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--ok-bg)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={32} /></span>
          <h1 className="h-flow">{t("start.received")}</h1>
          <p style={{ fontSize: 16, lineHeight: 1.55 }}>{withStrong(t("start.receivedBody", { ref: "{ref}", contact: "{contact}", what: s ? t("start.checkDocs") : t("start.readSent"), time: t("responseTime") }), {
            ref: <strong className="m" style={{ fontSize: 15 }} data-ref>{ref}</strong>,
            contact: <strong style={{ overflowWrap: "anywhere" }}>{f.email.trim().toLowerCase()}</strong>,
          })}</p>
          <p className="hint">{portalOpened ? t("start.ready") : t("start.receivedTrack")}</p>
          <div className="row g10 wrapx" style={{ justifyContent: "center" }}>
            {portalOpened ? <Link className="btn btn-d" href={`/portal/requests/${ref}`}>{t("start.see")}</Link> : <Link className="btn btn-d" href="/track">{t("start.trackIt")}</Link>}
            <Link className="btn btn-s" href="/services">{t("start.more")}</Link>
          </div>
        </div>
      </section>
    );
  }

  if (phase === "verify") {
    return (
      <section className="wrap" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <div className="stack g20" style={{ maxWidth: 460, margin: "0 auto" }}>
          <span className="eb" style={{ fontSize: 11 }}>{t("start.last")}</span>
          <CodeEntry email={f.email.trim().toLowerCase()} demoCode={demoCode} cta={t("start.confirm")} onBack={() => { setPhase("form"); setStep(0); }}
            onResend={async () => { const r = await requestEmailCode(f.email); return r.ok ? { demoCode: r.demoCode } : { error: r.error }; }}
            onSubmit={send} />
          <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="lock" size={16} /><span>{t("start.emailUse")}</span></p>
        </div>
      </section>
    );
  }

  return (
    <section className="wrap split" style={{ ["--aside" as string]: "380px", paddingTop: 32, paddingBottom: 96, gap: 40 }}>
      <div className="stack g24" style={{ maxWidth: 640 }}>
        <div className="stack g12">
          <Link href={s ? `/services/${s.slug}` : "/services"} className="lnk row g6" style={{ fontSize: 14 }}><Icon name="arrow-l" size={16} /> {s ? s.name : t("start.all")}</Link>
          <div className="row g8" role="img" aria-label={t("start.stepLabel", { n: step + 1, total: keys.length, name: names[key] })}>
            {keys.map((k, i) => (
              <div key={k} className="stack g6 grow">
                <span style={{ height: 4, borderRadius: 2, background: i <= step ? "var(--ember)" : "var(--sand)" }} />
                <span className="m-hide" style={{ fontSize: 12.5, fontWeight: 700, color: i === step ? "var(--ink)" : "var(--muted)" }}>{i + 1}. {names[k]}</span>
              </div>
            ))}
          </div>
          <span className="eb d-hide" style={{ fontSize: 11 }}>{t("start.stepOf", { n: step + 1, total: keys.length })} · {names[key]}</span>
        </div>

        {s && (
          <details className="card fee-peek">
            <summary className="row between g12">
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="eb" style={{ fontSize: 10.5 }}>{t("start.pay")}</span>
                <strong className="nowrap" style={{ fontSize: 15 }}>{displayTotal(s, locale)}</strong>
              </span>
              <span className="row g6 mut" style={{ fontSize: 13.5, fontWeight: 600 }}>{t("start.feeDetails")} <span className="chev"><Icon name="down" size={18} /></span></span>
            </summary>
            <div className="stack g12" style={{ paddingTop: 14 }}>
              <FeeLines officialLabel={t("service.officialShort")} official={displayOfficial(s, locale)} ours={displayOurs(s, locale)} total={displayTotal(s, locale)} totalLabel={t("service.estimate")} />
              <p className="hint">{s.official.note}</p>
              <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} color="var(--ok)" /><span>{t("start.payAfter")}</span></p>
            </div>
          </details>
        )}

        {key === "about" && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="h-flow">{t("start.aboutTitle")}</h1><p className="mut" style={{ fontSize: 15 }}>{t("start.aboutLead")}</p></div>
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
            {needId && (
              <div className="field"><label htmlFor="f-nid">{f.forWho === "family" ? t("start.theirId") : t("start.nid")}</label><input id="f-nid" className={`in ${bad("nid")}`} inputMode="numeric" value={f.nid} onChange={(e) => set("nid", e.target.value)} placeholder="1 1995 8 0045123 0 17" aria-describedby="nid-err nid-hint" /><span className="hint" id="nid-hint">{t("start.nidHint")}</span>{err("nid")}</div>
            )}
            {needId && (
              <div className="field"><label htmlFor="f-dob">{t("start.dob")}</label><input id="f-dob" type="date" className={`in ${bad("dob")}`} value={f.dob} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("dob", e.target.value)} autoComplete={f.forWho === "me" ? "bday" : "off"} aria-describedby="dob-err dob-hint" /><span className="hint" id="dob-hint">{t("start.dobHint")}</span>{err("dob")}</div>
            )}
            <div className="field"><label htmlFor="f-email">{t("start.email")}</label>
              <input id="f-email" type="email" className={`in ${bad("email")}`} inputMode="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder={t("signIn.emailPh")} autoComplete="email" autoCapitalize="none" spellCheck={false} aria-describedby="email-err email-hint" />
              <span className="hint" id="email-hint">{t("start.emailHint")}</span>{err("email")}</div>
            <div className="field"><label htmlFor="f-phone">{t("start.phoneOpt")}</label>
              <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="f-phone" className={`in ${bad("phone")}`} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="788 123 456" autoComplete="tel-national" aria-describedby="phone-err phone-hint" /></div>
              <span className="hint" id="phone-hint">{t("start.phoneOptHint")}</span>{err("phone")}</div>
          </div>
        )}

        {key === "request" && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="h-flow">{s ? t("start.aboutReq") : t("start.describe")}</h1><p className="mut" style={{ fontSize: 15 }}>{s ? t("start.aboutReqLead") : t("start.describeLead")}</p></div>
            {s?.purposes && (
              <fieldset className="stack g10" style={{ border: 0, margin: 0, padding: 0 }}>
                <legend className="label" style={{ marginBottom: 10 }}>{s.purposeLabel ?? t("start.purpose")}</legend>
                {s.purposes.map((p) => (
                  <label key={p} className="choice"><input type="radio" name="purpose" checked={f.purpose === p} onChange={() => set("purpose", p)} /> {p}</label>
                ))}
              </fieldset>
            )}
            <div className="field"><label htmlFor="f-notes">{s ? <>{t("start.notesOpt")} <span className="mut" style={{ fontWeight: 400 }}>{t("start.optional")}</span></> : t("start.situationLabel")}</label>
              <textarea id="f-notes" className={`in ${bad("notes")}`} rows={s ? 3 : 6} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder={s ? t("start.notesPh") : t("start.situationPh")} aria-describedby="notes-err" />{err("notes")}</div>
          </div>
        )}

        {key === "docs" && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="h-flow">{t("start.docsTitle")}</h1><p className="mut" style={{ fontSize: 15 }}>{t("start.docsLead")}</p></div>
            {docList.map((d) => (
              <div key={d.name} className="card stack g12" style={{ padding: 16 }}>
                <div className="row between g12"><div className="stack" style={{ gap: 3 }}><strong>{d.name}</strong><span className="hint">{d.detail}</span></div>{files[d.name] ? <span className="b t-teal">{t("start.added")}</span> : d.required ? <span className="b t-neutral">{t("service.required")}</span> : <span className="tag">{s ? t("service.ifApplicable") : t("start.optionalTag")}</span>}</div>
                {files[d.name] ? (
                  <div className="row between g12" style={{ padding: "10px 12px", background: "var(--bone)", borderRadius: 6 }}><span className="row g8" style={{ fontSize: 14, minWidth: 0 }}><Icon name="file" size={17} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{files[d.name].name}</span></span><button type="button" className="btn btn-g btn-sm" onClick={() => { const rest = { ...files }; delete rest[d.name]; setFiles(rest); }}>{t("start.remove")}</button></div>
                ) : (
                  <label className="btn btn-s" style={{ alignSelf: "flex-start" }}>
                    <Icon name="upload" size={18} /> {t("start.choose")}
                    <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) { alert(t("start.tooBig")); return; }
                      setFiles({ ...files, [d.name]: file });
                    }} />
                  </label>
                )}
              </div>
            ))}
            <p className="hint row g8"><Icon name="lock" size={16} /> {t("start.filesPrivate")}</p>
          </div>
        )}

        {key === "review" && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="h-flow">{t("start.check")}</h1><p className="mut" style={{ fontSize: 15 }}>{t("start.checkLead")}</p></div>
            <div className="card" style={{ padding: 18 }}>
              <dl className="review">
                <dt>{t("start.svc")}</dt><dd>{s ? s.name : t("start.unsureYet")}</dd>
                <dt>{t("start.yourName")}</dt><dd>{f.name}</dd>
                {f.forWho !== "me" && <><dt>{t("start.for")}</dt><dd>{f.subject}</dd></>}
                {needId && <><dt>{t("start.id")}</dt><dd className="m" style={{ fontSize: 14, fontWeight: 500 }}>{f.nid}</dd></>}
                {needId && <><dt>{t("start.dobRow")}</dt><dd>{f.dob}</dd></>}
                <dt>{t("start.emailRow")}</dt><dd style={{ overflowWrap: "anywhere" }}>{f.email.trim().toLowerCase()}</dd>
                {f.phone.trim() && <><dt>{t("start.phoneRow")}</dt><dd>+250 {prettyMobile(f.phone)}</dd></>}
                {f.purpose && <><dt>{s?.noId ? t("start.attending") : t("start.purposeRow")}</dt><dd>{f.purpose}</dd></>}
                {f.notes.trim() && <><dt>{s ? t("start.notes") : t("start.situationRow")}</dt><dd style={{ fontWeight: 400 }}>{f.notes}</dd></>}
                <dt>{t("start.documents")}</dt><dd>{t("start.addedN", { n: Object.keys(files).length })}</dd>
              </dl>
              <button type="button" className="btn btn-g btn-sm" style={{ marginTop: 12 }} onClick={() => { setStep(0); setTouched(false); }}><Icon name="edit" size={16} /> {t("start.edit")}</button>
            </div>
            {missing > 0 && <Alert kind="warn" title={t("start.missingTitle")}>{t("start.missingBody")}</Alert>}
            <div className="stack g6">
              <label className="check"><input type="checkbox" checked={portal} onChange={(e) => setPortal(e.target.checked)} aria-describedby="portal-hint" /> {t("start.portalAsk")}</label>
              <span className="hint" id="portal-hint" style={{ paddingLeft: 28 }}>{t("start.portalHint")}</span>
            </div>
            <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-describedby="ack-err" /> {t("start.ack")}</label>
            {err("ack")}
          </div>
        )}

        {sendError && <Alert kind="err" title={t("start.codeFail")} live>{sendError}</Alert>}
        <div className="row g10" style={{ paddingTop: 8 }}>
          {step > 0 && <button type="button" className="btn btn-s btn-lg" onClick={() => { setStep(step - 1); setTouched(false); }}>{t("start.back")}</button>}
          <button type="button" className="btn btn-p btn-lg grow" onClick={next} disabled={sending}>{sending ? <><span className="spin" /> {t("start.sendingCode")}</> : key === "review" ? t("start.send") : key === "docs" && !Object.keys(files).length ? t("start.skip") : t("start.continue")}</button>
        </div>
      </div>

      {s ? (
        <aside className="card stack g14 sticky-aside fee-aside" style={{ padding: 20 }}>
          <span className="eb" style={{ fontSize: 11 }}>{t("start.yourRequest")}</span>
          <strong className="d" style={{ fontSize: 20 }}>{s.name}</strong>
          <span className="mut" style={{ fontSize: 13.5 }}>{s.via} · {s.time}</span>
          <FeeLines officialLabel={t("service.officialFee")} official={displayOfficial(s, locale)} ours={displayOurs(s, locale)} total={displayTotal(s, locale)} totalLabel={t("service.totalShort")} />
          <p className="hint">{s.official.note}</p>
          <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} color="var(--ok)" /><span>{t("start.payAfter")}</span></p>
        </aside>
      ) : (
        <aside className="card stack g14 sticky-aside" style={{ padding: 20 }}>
          <span className="eb" style={{ fontSize: 11 }}>{t("start.free")}</span>
          <strong className="d" style={{ fontSize: 20 }}>{t("start.which")}</strong>
          <ul className="stack g10" style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 14.5 }}>
            <li className="row g10" style={{ alignItems: "flex-start" }}><Icon name="clock" size={18} /><span>{t("start.reply", { time: t("responseTime") })}</span></li>
            <li className="row g10" style={{ alignItems: "flex-start" }}><Icon name="card" size={18} /><span>{t("start.bothFees")}</span></li>
            <li className="row g10" style={{ alignItems: "flex-start" }}><Icon name="shield" size={18} color="var(--ok)" /><span>{t("start.noCharge")}</span></li>
          </ul>
        </aside>
      )}
    </section>
  );
}
