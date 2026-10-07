"use client";
import Link from "next/link";
import { useState } from "react";
import { createIntake } from "@/app/actions/agent";
import { officialLabel, oursLabel } from "@/lib/format";
import type { Service } from "@/lib/types";
import { isEmail, isMobile, prettyMobile } from "@/lib/contact";
import { FeeLines, Icon } from "./ui";

const SOURCES = ["Walk-in", "Phone call", "WhatsApp", "Referred by a customer"];

/** Opens a case for someone who came to the office or called, so they get the same tracking as
 *  a customer who started online. With an email address they get their private link by email; either way
 *  the agent gets the link to send on WhatsApp. */
export default function Intake({ services }: { services: Service[] }) {
  const [f, setF] = useState({ slug: "", name: "", phone: "", email: "", kind: "person", source: SOURCES[0], notes: "" });
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<{ ref: string; link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const s = services.find((x) => x.slug === f.slug);
  const errors = { name: !f.name.trim() ? "Enter the customer’s name." : "", phone: !isMobile(f.phone) ? "Enter a Rwandan mobile number, e.g. 788 123 456." : "", email: f.email.trim() && !isEmail(f.email) ? "That email address doesn’t look right." : "" };
  const valid = !errors.name && !errors.phone && !errors.email;
  const wa = `https://wa.me/250${f.phone.replace(/\D/g, "").replace(/^250/, "").replace(/^0/, "")}?text=${encodeURIComponent(`Inzira: your request is open. Follow it here: ${done?.link ?? ""}`)}`;

  if (done) {
    return (
      <div className="card stack g14" style={{ maxWidth: 560, padding: 28 }} role="status">
        <span className="ok-dot"><Icon name="check" size={22} /></span>
        <h2 className="d" style={{ fontSize: 22 }}>Case {done.ref} opened</h2>
        <p style={{ fontSize: 15, lineHeight: 1.55 }}>The case is assigned to you. {done.emailed ? <>{f.name} was emailed their private link at {f.email.trim()}.</> : f.email.trim() ? <>We couldn’t email {f.email.trim()} just now, so send {f.name} the private link yourself.</> : <>{f.name} has no email on file, so send them the private link yourself.</>} It opens the request without a password.</p>
        <div className="stack g8" style={{ padding: 14, background: "var(--bone)", borderRadius: 8, border: "1px solid var(--line)" }}>
          <input className="in m" style={{ fontSize: 13.5 }} readOnly value={done.link} aria-label="Private link" onFocus={(e) => e.currentTarget.select()} />
          <div className="row g8 wrapx">
            <button type="button" className="btn btn-s btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(done.link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* select by hand */ } }}><Icon name={copied ? "check" : "file"} size={16} /> {copied ? "Copied" : "Copy link"}</button>
            <a className="btn btn-s btn-sm" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={16} /> Send on WhatsApp (+250 {prettyMobile(f.phone)})</a>
          </div>
        </div>
        <div className="row g8 wrapx"><Link className="btn btn-d" href={`/agent/cases/${done.ref}`}>Open the case</Link><button type="button" className="btn btn-s" onClick={() => { setDone(null); setTouched(false); setF({ ...f, name: "", phone: "", email: "", notes: "" }); }}>Open another</button></div>
      </div>
    );
  }

  return (
    <div className="split" style={{ ["--aside" as string]: "360px" }}>
      <form className="card stack g18" style={{ padding: 22 }} onSubmit={async (e) => {
        e.preventDefault(); setTouched(true);
        if (!valid) return;
        setBusy(true); setError("");
        const r = await createIntake({ ...f, kind: f.kind as "person" | "business" | "organization" }).catch(() => ({ ok: false as const, error: "Not saved. Check your connection and try again." }));
        setBusy(false);
        if (!r.ok) { setError(r.error); return; }
        setDone({ ref: r.ref, link: r.link, emailed: r.emailed });
      }} noValidate>
        <div className="field"><label htmlFor="in-svc">Service</label>
          <select id="in-svc" className="in" value={f.slug} onChange={(e) => set("slug", e.target.value)}><option value="">Not sure yet — describe the situation below</option>{services.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}</select></div>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="in-name">Customer name</label><input id="in-name" className={`in ${touched && errors.name ? "in-err" : ""}`} value={f.name} onChange={(e) => set("name", e.target.value)} aria-describedby="in-name-err" />{touched && errors.name && <span className="err-text" id="in-name-err"><Icon name="alert" size={15} /> {errors.name}</span>}</div>
          <div className="field"><label htmlFor="in-kind">Customer type</label><select id="in-kind" className="in" value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="person">Individual</option><option value="business">Business</option><option value="organization">Organization</option></select></div>
        </div>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="in-phone">Phone</label><div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="in-phone" className={`in ${touched && errors.phone ? "in-err" : ""}`} inputMode="tel" placeholder="788 123 456" value={f.phone} onChange={(e) => set("phone", e.target.value)} aria-describedby="in-phone-err" /></div>{touched && errors.phone && <span className="err-text" id="in-phone-err"><Icon name="alert" size={15} /> {errors.phone}</span>}</div>
          <div className="field"><label htmlFor="in-email">Email <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></label><input id="in-email" className={`in ${touched && errors.email ? "in-err" : ""}`} type="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" value={f.email} onChange={(e) => set("email", e.target.value)} aria-describedby="in-email-err" />{touched && errors.email && <span className="err-text" id="in-email-err"><Icon name="alert" size={15} /> {errors.email}</span>}<span className="hint">Their updates and private link are emailed here.</span></div>
        </div>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="in-src">How did they reach us?</label><select id="in-src" className="in" value={f.source} onChange={(e) => set("source", e.target.value)}>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
        {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
        <div className="field"><label htmlFor="in-notes">What they need <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></label><textarea id="in-notes" className="in" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="In their words. Becomes the first internal note." /></div>
        <div className="row g8" style={{ justifyContent: "flex-end" }}><Link className="btn btn-g" href="/agent">Cancel</Link><button className="btn btn-p" type="submit" disabled={busy}>{busy ? <><span className="spin" /> Opening…</> : "Open case"}</button></div>
      </form>
      <aside className="card stack g14" style={{ padding: 20 }}>
        <span className="eb" style={{ fontSize: 11 }}>Tell the customer</span>
        {s ? (
          <>
            <strong className="d" style={{ fontSize: 18 }}>{s.name}</strong>
            <span className="mut" style={{ fontSize: 13.5 }}>{s.via} · {s.time}</span>
            <FeeLines officialLabel="Official government fee" official={officialLabel(s)} ours={oursLabel(s)} />
            <span className="hint">Documents: {s.docsShort}.</span>
          </>
        ) : <p className="hint">Pick a service to see the two fees and the documents to ask for. If you are not sure, open the case anyway and decide after checking.</p>}
        <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} /><span>Always say both fees separately, and that Inzira is a private company, not the institution.</span></p>
      </aside>
    </div>
  );
}
