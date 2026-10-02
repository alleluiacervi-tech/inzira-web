"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { officialLabel, oursLabel, totalLabel } from "@/lib/format";
import { SITE } from "@/lib/site";
import type { Service } from "@/lib/types";
import { requestCode } from "@/app/actions/auth";
import { submitRequest } from "@/app/actions/customer";
import { CodeEntry, isMobile, prettyMobile } from "./PhoneCode";
import { Alert, FeeLines, Icon } from "./ui";

const FOR = [["me", "Myself"], ["family", "A family member"], ["business", "My business"]] as const;
type Key = "about" | "request" | "docs" | "review";
const EMPTY = { forWho: "me", name: "", subject: "", nid: "", phone: "", purpose: "", notes: "" };

/** Starts a request. With a service it collects what that service needs; without one (`service` null)
 *  the customer describes their situation and an agent works out which procedure applies. */
export default function StartForm({ service: s }: { service: Service | null }) {
  const draftKey = `inzira:start:${s?.slug ?? "describe"}`;
  // A service that needs no documents (e.g. a training) skips that step.
  const keys: Key[] = s && s.documents.length === 0 ? ["about", "request", "review"] : ["about", "request", "docs", "review"];
  const names: Record<Key, string> = { about: "About you", request: s ? "Your request" : "Your situation", docs: "Documents", review: "Review" };
  const last = keys.length - 1;
  const docList = s ? s.documents : [{ name: "Anything you already have", detail: "A letter, a form, a photo of a notice — whatever explains the situation", required: false }];

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
    if (!f.name.trim()) errors.name = "Enter your full name as it appears on your ID.";
    if (f.forWho === "family" && !f.subject.trim()) errors.subject = "Enter the name of the person this is for.";
    if (f.forWho === "business" && !f.subject.trim()) errors.subject = "Enter the name of the business.";
    if (needId && nidDigits.length !== 16) errors.nid = `ID numbers have 16 digits. You entered ${nidDigits.length}.`;
    if (!isMobile(f.phone)) errors.phone = "Enter a Rwandan mobile number, e.g. 788 123 456.";
  }
  if (key === "request" && !s && f.notes.trim().length < 10) errors.notes = "Tell us a little more so the right agent can help.";
  if (key === "review" && !ack) errors.ack = "Please confirm you’ve read this.";
  const valid = Object.keys(errors).length === 0;

  const next = async () => {
    setTouched(true);
    if (!valid) return;
    setTouched(false);
    if (step < last) { setStep(step + 1); window.scrollTo({ top: 0 }); return; }
    // Last step: text a code to confirm the number before anything is created.
    setSending(true); setSendError("");
    const r = await requestCode(f.phone).catch(() => ({ ok: false as const, error: "We couldn’t send the code. Check your connection and try again." }));
    setSending(false);
    if (!r.ok) { setSendError(r.error); return; }
    setDemoCode(r.demoCode);
    setPhase("verify");
    window.scrollTo({ top: 0 });
  };
  const send = async (code: string) => {
    const fd = new FormData();
    fd.set("slug", s?.slug ?? "");
    for (const [k, v] of Object.entries(f)) fd.set(k, v);
    fd.set("code", code);
    if (s) s.documents.forEach((d, i) => { if (files[d.name]) fd.set(`file-${i}`, files[d.name]); });
    else Object.values(files).forEach((file) => fd.append("file-extra", file));
    const r = await submitRequest(fd).catch(() => ({ ok: false as const, error: "We couldn’t send your request. Check your connection and try again." }));
    if (!r.ok) return r.error;
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
    setRef(r.ref);
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
          <h1 className="d" style={{ fontSize: 30 }}>Request received</h1>
          <p style={{ fontSize: 16, lineHeight: 1.55 }}>Your reference is <strong className="m" style={{ fontSize: 15 }}>{ref}</strong>. An agent will {s ? "check your documents" : "read what you sent"} and contact you on <strong>+250 {prettyMobile(f.phone)}</strong> within {SITE.responseTime}.</p>
          <p className="hint">Your number is confirmed, so your portal is ready. You won’t be charged until you approve the fees.</p>
          <div className="row g10 wrapx" style={{ justifyContent: "center" }}><Link className="btn btn-d" href={`/portal/requests/${ref}`}>See my request</Link><Link className="btn btn-s" href="/services">Browse more services</Link></div>
        </div>
      </section>
    );
  }

  if (phase === "verify") {
    return (
      <section className="wrap" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <div className="stack g20" style={{ maxWidth: 460, margin: "0 auto" }}>
          <span className="eb" style={{ fontSize: 11 }}>Last step · confirm your number</span>
          <CodeEntry phone={f.phone} demoCode={demoCode} cta="Confirm and send request" onBack={() => { setPhase("form"); setStep(0); }}
            onResend={async () => { const r = await requestCode(f.phone); return r.ok ? { demoCode: r.demoCode } : { error: r.error }; }}
            onSubmit={send} />
          <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="lock" size={16} /><span>This number becomes your sign-in. We use it for SMS and WhatsApp updates about your request, nothing else.</span></p>
        </div>
      </section>
    );
  }

  return (
    <section className="wrap split" style={{ ["--aside" as string]: "380px", paddingTop: 32, paddingBottom: 96, gap: 40 }}>
      <div className="stack g24" style={{ maxWidth: 640 }}>
        <div className="stack g12">
          <Link href={s ? `/services/${s.slug}` : "/services"} className="lnk row g6" style={{ fontSize: 14 }}><Icon name="arrow-l" size={16} /> {s ? s.name : "All services"}</Link>
          <div className="row g8" role="img" aria-label={`Step ${step + 1} of ${keys.length}: ${names[key]}`}>
            {keys.map((k, i) => (
              <div key={k} className="stack g6 grow">
                <span style={{ height: 4, borderRadius: 2, background: i <= step ? "var(--ember)" : "var(--sand)" }} />
                <span className="m-hide" style={{ fontSize: 12.5, fontWeight: 700, color: i === step ? "var(--ink)" : "var(--muted)" }}>{i + 1}. {names[k]}</span>
              </div>
            ))}
          </div>
          <span className="eb d-hide" style={{ fontSize: 11 }}>Step {step + 1} of {keys.length} · {names[key]}</span>
        </div>

        {s && (
          <details className="card fee-peek">
            <summary className="row between g12">
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="eb" style={{ fontSize: 10.5 }}>What you pay</span>
                <strong className="nowrap" style={{ fontSize: 15 }}>{totalLabel(s)}</strong>
              </span>
              <span className="row g6 mut" style={{ fontSize: 13.5, fontWeight: 600 }}>Fee details <span className="chev"><Icon name="down" size={18} /></span></span>
            </summary>
            <div className="stack g12" style={{ paddingTop: 14 }}>
              <FeeLines officialLabel="Official fee" official={officialLabel(s)} ours={oursLabel(s)} total={totalLabel(s)} totalLabel="Estimate" />
              <p className="hint">{s.official.note}</p>
              <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} color="var(--ok)" /><span>You pay only after an agent has checked your documents.</span></p>
            </div>
          </details>
        )}

        {key === "about" && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>A few details about you</h1><p className="mut" style={{ fontSize: 15 }}>We use these exactly as they appear on the ID. It takes about 3 minutes.</p></div>
            <fieldset className="stack g10" style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className="label" style={{ marginBottom: 10 }}>Who is this request for?</legend>
              <div className="grid cols-3" style={{ gap: 10 }}>
                {FOR.map(([k, l]) => (
                  <label key={k} className="choice"><input type="radio" name="who" checked={f.forWho === k} onChange={() => set("forWho", k)} /> {l}</label>
                ))}
              </div>
            </fieldset>
            <div className="field"><label htmlFor="f-name">Your full name</label><input id="f-name" className={`in ${bad("name")}`} value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" aria-describedby="name-err" />{err("name")}</div>
            {f.forWho !== "me" && (
              <div className="field"><label htmlFor="f-subject">{f.forWho === "family" ? "Their full name (as on their ID)" : "Business name"}</label><input id="f-subject" className={`in ${bad("subject")}`} value={f.subject} onChange={(e) => set("subject", e.target.value)} autoComplete={f.forWho === "business" ? "organization" : "off"} aria-describedby="subject-err" />
                {f.forWho === "family" && <span className="hint">You confirm you have their consent to request this for them.</span>}{err("subject")}</div>
            )}
            {needId && (
              <div className="field"><label htmlFor="f-nid">{f.forWho === "family" ? "Their national ID number" : "National ID number"}</label><input id="f-nid" className={`in ${bad("nid")}`} inputMode="numeric" value={f.nid} onChange={(e) => set("nid", e.target.value)} placeholder="1 1995 8 0045123 0 17" aria-describedby="nid-err nid-hint" /><span className="hint" id="nid-hint">16 digits, on the front of the ID.</span>{err("nid")}</div>
            )}
            <div className="field"><label htmlFor="f-phone">Your phone, for updates</label>
              <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="f-phone" className={`in ${bad("phone")}`} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="788 123 456" autoComplete="tel-national" aria-describedby="phone-err phone-hint" /></div>
              <span className="hint" id="phone-hint">We send SMS and WhatsApp updates here, and a code to confirm it’s yours.</span>{err("phone")}</div>
          </div>
        )}

        {key === "request" && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>{s ? "Tell us about the request" : "Describe what you need"}</h1><p className="mut" style={{ fontSize: 15 }}>{s ? "This helps us prepare it correctly the first time." : "In your own words — English, Kinyarwanda or French. An agent will match it to the right procedure."}</p></div>
            {s?.purposes && (
              <fieldset className="stack g10" style={{ border: 0, margin: 0, padding: 0 }}>
                <legend className="label" style={{ marginBottom: 10 }}>{s.purposeLabel ?? "What is it for?"}</legend>
                {s.purposes.map((p) => (
                  <label key={p} className="choice"><input type="radio" name="purpose" checked={f.purpose === p} onChange={() => set("purpose", p)} /> {p}</label>
                ))}
              </fieldset>
            )}
            <div className="field"><label htmlFor="f-notes">{s ? <>Anything we should know? <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></> : "Your situation"}</label>
              <textarea id="f-notes" className={`in ${bad("notes")}`} rows={s ? 3 : 6} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder={s ? "e.g. I need it before the end of the month" : "e.g. I bought a plot in Bugesera and need the title in my name"} aria-describedby="notes-err" />{err("notes")}</div>
          </div>
        )}

        {key === "docs" && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>Add your documents</h1><p className="mut" style={{ fontSize: 15 }}>Photos from your phone are fine. You can also skip this and send them to your agent later.</p></div>
            {docList.map((d) => (
              <div key={d.name} className="card stack g12" style={{ padding: 16 }}>
                <div className="row between g12"><div className="stack" style={{ gap: 3 }}><strong>{d.name}</strong><span className="hint">{d.detail}</span></div>{files[d.name] ? <span className="b t-teal">Added</span> : d.required ? <span className="b t-neutral">Required</span> : <span className="tag">{s ? "If applicable" : "Optional"}</span>}</div>
                {files[d.name] ? (
                  <div className="row between g12" style={{ padding: "10px 12px", background: "var(--bone)", borderRadius: 6 }}><span className="row g8" style={{ fontSize: 14, minWidth: 0 }}><Icon name="file" size={17} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{files[d.name].name}</span></span><button type="button" className="btn btn-g btn-sm" onClick={() => { const rest = { ...files }; delete rest[d.name]; setFiles(rest); }}>Remove</button></div>
                ) : (
                  <label className="btn btn-s" style={{ alignSelf: "flex-start" }}>
                    <Icon name="upload" size={18} /> Take photo or choose file
                    <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) { alert("That file is larger than 10 MB. Try a photo instead of a scan, or compress the PDF."); return; }
                      setFiles({ ...files, [d.name]: file });
                    }} />
                  </label>
                )}
              </div>
            ))}
            <p className="hint row g8"><Icon name="lock" size={16} /> Only you, your agent and our quality team can open your files.</p>
          </div>
        )}

        {key === "review" && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>Check and send</h1><p className="mut" style={{ fontSize: 15 }}>An agent will check everything before any payment is taken.</p></div>
            <div className="card" style={{ padding: 18 }}>
              <dl className="review">
                <dt>Service</dt><dd>{s ? s.name : "Not sure yet — an agent will advise"}</dd>
                <dt>Your name</dt><dd>{f.name}</dd>
                {f.forWho !== "me" && <><dt>For</dt><dd>{f.subject}</dd></>}
                {needId && <><dt>National ID</dt><dd className="m" style={{ fontSize: 14, fontWeight: 500 }}>{f.nid}</dd></>}
                <dt>Phone</dt><dd>+250 {prettyMobile(f.phone)}</dd>
                {f.purpose && <><dt>{s?.noId ? "Attending" : "Purpose"}</dt><dd>{f.purpose}</dd></>}
                {f.notes.trim() && <><dt>{s ? "Notes" : "Situation"}</dt><dd style={{ fontWeight: 400 }}>{f.notes}</dd></>}
                <dt>Documents</dt><dd>{Object.keys(files).length} added</dd>
              </dl>
              <button type="button" className="btn btn-g btn-sm" style={{ marginTop: 12 }} onClick={() => { setStep(0); setTouched(false); }}><Icon name="edit" size={16} /> Edit details</button>
            </div>
            {missing > 0 && <Alert kind="warn" title="Some required documents are missing">That’s fine — your agent will ask for them. Nothing is submitted until they’re complete.</Alert>}
            <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-describedby="ack-err" /> I understand Inzira is a private assistance company, not a government institution, and that the official fee is separate from Inzira’s assistance fee.</label>
            {err("ack")}
          </div>
        )}

        {sendError && <Alert kind="err" title="We couldn’t send the code" live>{sendError}</Alert>}
        <div className="row g10" style={{ paddingTop: 8 }}>
          {step > 0 && <button type="button" className="btn btn-s btn-lg" onClick={() => { setStep(step - 1); setTouched(false); }}>Back</button>}
          <button type="button" className="btn btn-p btn-lg grow" onClick={next} disabled={sending}>{sending ? <><span className="spin" /> Sending the code…</> : key === "review" ? "Send request" : key === "docs" && !Object.keys(files).length ? "Skip for now" : "Continue"}</button>
        </div>
      </div>

      {s ? (
        <aside className="card stack g14 sticky-aside fee-aside" style={{ padding: 20 }}>
          <span className="eb" style={{ fontSize: 11 }}>Your request</span>
          <strong className="d" style={{ fontSize: 20 }}>{s.name}</strong>
          <span className="mut" style={{ fontSize: 13.5 }}>{s.via} · {s.time}</span>
          <FeeLines officialLabel="Official government fee" official={officialLabel(s)} ours={oursLabel(s)} total={totalLabel(s)} totalLabel="Total estimated" />
          <p className="hint">{s.official.note}</p>
          <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} color="var(--ok)" /><span>You pay only after an agent has checked your documents.</span></p>
        </aside>
      ) : (
        <aside className="card stack g14 sticky-aside" style={{ padding: 20 }}>
          <span className="eb" style={{ fontSize: 11 }}>Free to ask</span>
          <strong className="d" style={{ fontSize: 20 }}>We’ll tell you which procedure applies</strong>
          <ul className="stack g10" style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 14.5 }}>
            <li className="row g10" style={{ alignItems: "flex-start" }}><Icon name="clock" size={18} /><span>An agent replies within <strong>{SITE.responseTime}</strong></span></li>
            <li className="row g10" style={{ alignItems: "flex-start" }}><Icon name="card" size={18} /><span>You see the official fee and our fee separately before you commit</span></li>
            <li className="row g10" style={{ alignItems: "flex-start" }}><Icon name="shield" size={18} color="var(--ok)" /><span>Nothing is charged for asking</span></li>
          </ul>
        </aside>
      )}
    </section>
  );
}
