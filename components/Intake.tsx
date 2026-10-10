"use client";
import Link from "next/link";
import { useState } from "react";
import { createIntake } from "@/app/actions/agent";
import { officialLabel, oursLabel } from "@/lib/format";
import type { Service } from "@/lib/types";
import { isMobile, prettyMobile } from "./PhoneCode";
import { FeeLines, Icon } from "./ui";

const SOURCES = ["Walk-in", "Phone call", "WhatsApp", "Referred by a customer"];

/** Opens a case for someone who came to the office or called, so they get the same tracking as
 *  a customer who started online. Prototype: nothing is saved. */
export default function Intake({ services }: { services: Service[] }) {
  const [f, setF] = useState({ slug: "", name: "", phone: "", kind: "person", source: SOURCES[0], notes: "" });
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const s = services.find((x) => x.slug === f.slug);
  const errors = { name: !f.name.trim() ? "Enter the customer’s name." : "", phone: !isMobile(f.phone) ? "Enter a Rwandan mobile number, e.g. 788 123 456." : "" };
  const valid = !errors.name && !errors.phone;

  if (done) {
    return (
      <div className="card stack g14" style={{ maxWidth: 560, padding: 28 }} role="status">
        <span className="ok-dot"><Icon name="check" size={22} /></span>
        <h2 className="d" style={{ fontSize: 22 }}>Case {done} opened</h2>
        <p style={{ fontSize: 15, lineHeight: 1.55 }}>{f.name} will get an SMS on +250 {prettyMobile(f.phone)} with the reference. They can sign in with that number to follow it. The case is assigned to you.</p>
        <div className="row g8 wrapx"><Link className="btn btn-d" href={`/console/requests/${done}`}>Open the case</Link><button type="button" className="btn btn-s" onClick={() => { setDone(""); setTouched(false); setF({ ...f, name: "", phone: "", notes: "" }); }}>Open another</button></div>
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
        setDone(r.ref);
      }} noValidate>
        <div className="field"><label htmlFor="in-svc">Service</label>
          <select id="in-svc" className="in" value={f.slug} onChange={(e) => set("slug", e.target.value)}><option value="">Not sure yet — describe the situation below</option>{services.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}</select></div>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="in-name">Customer name</label><input id="in-name" className={`in ${touched && errors.name ? "in-err" : ""}`} value={f.name} onChange={(e) => set("name", e.target.value)} aria-describedby="in-name-err" />{touched && errors.name && <span className="err-text" id="in-name-err"><Icon name="alert" size={15} /> {errors.name}</span>}</div>
          <div className="field"><label htmlFor="in-kind">Customer type</label><select id="in-kind" className="in" value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="person">Individual</option><option value="business">Business</option><option value="organization">Organization</option></select></div>
        </div>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="in-phone">Phone</label><div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="in-phone" className={`in ${touched && errors.phone ? "in-err" : ""}`} inputMode="tel" placeholder="788 123 456" value={f.phone} onChange={(e) => set("phone", e.target.value)} aria-describedby="in-phone-err" /></div>{touched && errors.phone && <span className="err-text" id="in-phone-err"><Icon name="alert" size={15} /> {errors.phone}</span>}</div>
          <div className="field"><label htmlFor="in-src">How did they reach us?</label><select id="in-src" className="in" value={f.source} onChange={(e) => set("source", e.target.value)}>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
        {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
        <div className="field"><label htmlFor="in-notes">What they need <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></label><textarea id="in-notes" className="in" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="In their words. Becomes the first internal note." /></div>
        <div className="row g8" style={{ justifyContent: "flex-end" }}><Link className="btn btn-g" href="/console/my-day">Cancel</Link><button className="btn btn-p" type="submit" disabled={busy}>{busy ? <><span className="spin" /> Opening…</> : "Open case"}</button></div>
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
