"use client";
import Link from "next/link";
import { useState } from "react";
import { officialLabel, oursLabel, serviceBySlug, totalLabel } from "@/lib/data";
import { Alert, FeeLines, Icon } from "./ui";

const STEP_NAMES = ["About you", "Your request", "Documents", "Review"];

export default function StartForm({ slug, describe }: { slug: string; describe: boolean }) {
  const s = serviceBySlug(slug)!;
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [name, setName] = useState("");
  const [nid, setNid] = useState("");
  const [phone, setPhone] = useState("");
  const [forWho, setForWho] = useState("me");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<Record<string, string>>({});
  const [ack, setAck] = useState(false);
  const [touched, setTouched] = useState(false);

  const nidDigits = nid.replace(/\D/g, "");
  const errors: Record<string, string> = {};
  if (step === 0) {
    if (!name.trim()) errors.name = "Enter your full name as it appears on your ID.";
    if (forWho !== "business" && nidDigits.length !== 16) errors.nid = `ID numbers have 16 digits. You entered ${nidDigits.length}.`;
    if (phone.replace(/\D/g, "").length < 9) errors.phone = "Enter a Rwandan mobile number, e.g. 788 123 456.";
  }
  if (step === 1 && describe && notes.trim().length < 10) errors.notes = "Tell us a little more so the right agent can help.";
  if (step === 3 && !ack) errors.ack = "Please confirm you’ve read this.";
  const valid = Object.keys(errors).length === 0;

  const next = () => {
    setTouched(true);
    if (!valid) return;
    setTouched(false);
    if (step < 3) setStep(step + 1);
    else setDone(true);
    window.scrollTo({ top: 0 });
  };
  const err = (k: string) => touched && errors[k] ? <span className="err-text" id={`${k}-err`}><Icon name="alert" size={15} /> {errors[k]}</span> : null;

  if (done) {
    return (
      <section className="wrap" style={{ paddingTop: 64, paddingBottom: 96 }}>
        <div className="card stack g16" style={{ maxWidth: 560, margin: "0 auto", padding: 32, alignItems: "center", textAlign: "center" }}>
          <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--ok-bg)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={32} /></span>
          <h1 className="d" style={{ fontSize: 30 }}>Request received</h1>
          <p style={{ fontSize: 16, lineHeight: 1.55 }}>Your reference is <strong className="m" style={{ fontSize: 15 }}>INZ-2026-04830</strong>. An agent will check your documents and contact you on <strong>+250 {phone}</strong> within 2 working hours.</p>
          <p className="hint">You won’t be charged until you approve the fees.</p>
          <div className="row g10 wrapx" style={{ justifyContent: "center" }}><Link className="btn btn-d" href="/portal">Go to my portal</Link><Link className="btn btn-s" href="/services">Browse more services</Link></div>
        </div>
      </section>
    );
  }

  return (
    <section className="wrap split" style={{ ["--aside" as string]: "380px", paddingTop: 32, paddingBottom: 96, gap: 40 }}>
      <div className="stack g24" style={{ maxWidth: 640 }}>
        <div className="stack g12">
          <Link href={`/services/${s.slug}`} className="lnk row g6" style={{ fontSize: 14 }}><Icon name="arrow-l" size={16} /> {s.name}</Link>
          <div className="row g8" aria-label={`Step ${step + 1} of 4`}>
            {STEP_NAMES.map((n, i) => (
              <div key={n} className="stack g6 grow">
                <span style={{ height: 4, borderRadius: 2, background: i <= step ? "var(--ember)" : "var(--sand)" }} />
                <span className="m-hide" style={{ fontSize: 12.5, fontWeight: 700, color: i === step ? "var(--ink)" : "var(--muted)" }}>{i + 1}. {n}</span>
              </div>
            ))}
          </div>
          <span className="eb d-hide" style={{ fontSize: 11 }}>Step {step + 1} of 4 · {STEP_NAMES[step]}</span>
        </div>

        {step === 0 && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>A few details about you</h1><p className="mut" style={{ fontSize: 15 }}>We use these exactly as they appear on your ID. It takes about 3 minutes.</p></div>
            <fieldset className="stack g10" style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className="label" style={{ marginBottom: 10 }}>Who is this request for?</legend>
              <div className="grid cols-3" style={{ gap: 10 }}>
                {[["me", "Myself"], ["family", "A family member"], ["business", "My business"]].map(([k, l]) => (
                  <label key={k} className="choice"><input type="radio" name="who" checked={forWho === k} onChange={() => setForWho(k)} /> {l}</label>
                ))}
              </div>
            </fieldset>
            <div className="field"><label htmlFor="f-name">{forWho === "business" ? "Your full name (contact person)" : "Full name (as on the ID)"}</label><input id="f-name" className={`in ${touched && errors.name ? "in-err" : ""}`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-describedby="name-err" />{err("name")}</div>
            {forWho !== "business" && (
              <div className="field"><label htmlFor="f-nid">National ID number</label><input id="f-nid" className={`in ${touched && errors.nid ? "in-err" : ""}`} inputMode="numeric" value={nid} onChange={(e) => setNid(e.target.value)} placeholder="1 1995 8 0045123 0 17" aria-describedby="nid-err nid-hint" /><span className="hint" id="nid-hint">16 digits, on the front of the ID.</span>{err("nid")}</div>
            )}
            <div className="field"><label htmlFor="f-phone">Phone for updates</label>
              <div className="row g8"><span className="in row" style={{ width: 88, fontWeight: 600 }}>+250</span><input id="f-phone" className={`in ${touched && errors.phone ? "in-err" : ""}`} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="788 123 456" autoComplete="tel-national" aria-describedby="phone-err" /></div>
              <span className="hint">We send SMS and WhatsApp updates to this number.</span>{err("phone")}</div>
          </div>
        )}

        {step === 1 && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>{describe ? "Describe what you need" : "Tell us about the request"}</h1><p className="mut" style={{ fontSize: 15 }}>{describe ? "In your own words — English, Kinyarwanda or French. An agent will match it to the right procedure." : "This helps us prepare it correctly the first time."}</p></div>
            {!describe && (
              <fieldset className="stack g10" style={{ border: 0, margin: 0, padding: 0 }}>
                <legend className="label" style={{ marginBottom: 10 }}>What is it for?</legend>
                {["A job or contract in Rwanda", "A visa or travel abroad", "Studies or a licence", "Something else"].map((p) => (
                  <label key={p} className="choice"><input type="radio" name="purpose" checked={purpose === p} onChange={() => setPurpose(p)} /> {p}</label>
                ))}
              </fieldset>
            )}
            <div className="field"><label htmlFor="f-notes">{describe ? "Your situation" : <>Anything we should know? <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></>}</label>
              <textarea id="f-notes" className={`in ${touched && errors.notes ? "in-err" : ""}`} rows={describe ? 6 : 3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={describe ? "e.g. I bought a plot in Bugesera and need the title in my name" : "e.g. The embassy needs it in English"} aria-describedby="notes-err" />{err("notes")}</div>
          </div>
        )}

        {step === 2 && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>Add your documents</h1><p className="mut" style={{ fontSize: 15 }}>Photos from your phone are fine. You can also skip this and send them to your agent later.</p></div>
            {s.documents.map((d) => (
              <div key={d.name} className="card stack g12" style={{ padding: 16 }}>
                <div className="row between g12"><div className="stack" style={{ gap: 3 }}><strong>{d.name}</strong><span className="hint">{d.detail}</span></div>{files[d.name] ? <span className="b" style={{ background: "#E3F1EE", color: "#1C6555" }}>Added</span> : d.required ? <span className="b" style={{ background: "#EEF0F3", color: "#3D4450" }}>Required</span> : <span className="tag">If applicable</span>}</div>
                {files[d.name] ? (
                  <div className="row between g12" style={{ padding: "10px 12px", background: "var(--bone)", borderRadius: 6 }}><span className="row g8" style={{ fontSize: 14, minWidth: 0 }}><Icon name="file" size={17} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{files[d.name]}</span></span><button type="button" className="btn btn-g btn-sm" onClick={() => { const f = { ...files }; delete f[d.name]; setFiles(f); }}>Remove</button></div>
                ) : (
                  <label className="btn btn-s" style={{ alignSelf: "flex-start" }}>
                    <Icon name="upload" size={18} /> Take photo or choose file
                    <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles({ ...files, [d.name]: f.name }); }} />
                  </label>
                )}
              </div>
            ))}
            <p className="hint row g8"><Icon name="lock" size={16} /> Encrypted. Only your agent and our quality team can see your files.</p>
          </div>
        )}

        {step === 3 && (
          <div className="stack g20">
            <div className="stack g8"><h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>Check and send</h1><p className="mut" style={{ fontSize: 15 }}>An agent will check everything before any payment is taken.</p></div>
            <div className="card" style={{ padding: 18 }}>
              <dl style={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr)", gap: "10px 16px", fontSize: 14.5 }}>
                <dt className="mut">Service</dt><dd style={{ fontWeight: 600 }}>{s.name}</dd>
                <dt className="mut">Name</dt><dd style={{ fontWeight: 600 }}>{name}</dd>
                {forWho !== "business" && <><dt className="mut">National ID</dt><dd className="m" style={{ fontSize: 14 }}>{nid}</dd></>}
                <dt className="mut">Phone</dt><dd style={{ fontWeight: 600 }}>+250 {phone}</dd>
                {purpose && <><dt className="mut">Purpose</dt><dd style={{ fontWeight: 600 }}>{purpose}</dd></>}
                <dt className="mut">Documents</dt><dd style={{ fontWeight: 600 }}>{Object.keys(files).length} added</dd>
              </dl>
            </div>
            {Object.keys(files).length < s.documents.filter((d) => d.required).length && <Alert kind="warn" title="Some required documents are missing">That’s fine — your agent will ask for them. Nothing is submitted until they’re complete.</Alert>}
            <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-describedby="ack-err" /> I understand Inzira is a private assistance company, not a government institution, and that the official fee is separate from Inzira’s assistance fee.</label>
            {err("ack")}
          </div>
        )}

        <div className="row g10" style={{ paddingTop: 8 }}>
          {step > 0 && <button type="button" className="btn btn-s btn-lg" onClick={() => { setStep(step - 1); setTouched(false); }}>Back</button>}
          <button type="button" className="btn btn-p btn-lg grow" onClick={next}>{step === 3 ? "Send request" : step === 2 && !Object.keys(files).length ? "Skip for now" : "Continue"}</button>
        </div>
      </div>

      <aside className="card stack g14" style={{ padding: 20, position: "sticky", top: 96 }}>
        <span className="eb" style={{ fontSize: 11 }}>Your request</span>
        <strong className="d" style={{ fontSize: 20 }}>{s.name}</strong>
        <span className="mut" style={{ fontSize: 13.5 }}>{s.via} · {s.time}</span>
        <FeeLines officialLabel="Official government fee" official={officialLabel(s)} ours={oursLabel(s)} total={totalLabel(s)} totalLabel="Total estimated" />
        <p className="hint">{s.official.note}</p>
        <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} color="#1E6B3A" /><span>You pay only after an agent has checked your documents.</span></p>
      </aside>
    </section>
  );
}
