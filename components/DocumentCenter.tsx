"use client";
import { useEffect, useRef, useState } from "react";
import { DOC_LIBRARY, STATUS, type StatusKey } from "@/lib/data";
import { Badge, DocCard, Icon } from "./ui";

const GROUP_ICON: Record<string, string> = { Identification: "c-id", "Business documents": "c-biz", "Tax documents": "c-tax", "Land documents": "c-land", Certificates: "c-comp", Other: "c-other" };
const TABS: ("all" | StatusKey)[] = ["all", "req", "recd", "rej", "appr", "done"];
const TYPES = ["National ID — front", "National ID — back", "Passport data page", "Certificate", "Business document", "Tax document", "Land document", "Other"];

export default function DocumentCenter() {
  const [docs, setDocs] = useState(DOC_LIBRARY);
  const [tab, setTab] = useState<"all" | StatusKey>("all");
  const [target, setTarget] = useState(0);
  const [type, setType] = useState(TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const pick = (f: File | undefined) => {
    setError("");
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setError("That file is larger than 10 MB. Try a photo instead of a scan, or compress the PDF."); return; }
    if (!/^(image\/|application\/pdf)/.test(f.type)) { setError("Please upload a PDF, JPG or PNG."); return; }
    setFile(f);
    setProgress(0);
    timer.current = setInterval(() => {
      setProgress((p) => {
        if (p === null) return p;
        if (p >= 100) {
          if (timer.current) clearInterval(timer.current);
          setDocs((d) => d.map((x, i) => (i === target ? { ...x, status: "recd", meta: `${f.name} · just uploaded · awaiting agent review`, action: undefined } : x)));
          return 100;
        }
        return Math.min(100, p + 12);
      });
    }, 160);
  };

  const count = (k: "all" | StatusKey) => (k === "all" ? docs.length : docs.filter((d) => d.status === k).length);
  const shown = docs.map((d, i) => ({ ...d, i })).filter((d) => tab === "all" || d.status === tab);
  const groups = Array.from(new Set(shown.map((d) => d.group)));
  const t = docs[target];

  return (
    <div className="split" style={{ ["--aside" as string]: "400px", gap: 28 }}>
      <div className="stack g20">
        <div className="chips-scroll" role="group" aria-label="Filter by status">
          {TABS.map((k) => (
            <button key={k} type="button" className={`chip chip-sm ${tab === k ? "chip-on" : ""}`} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {k === "all" ? "All" : STATUS[k].label} <span style={{ opacity: 0.7 }}>{count(k)}</span>
            </button>
          ))}
        </div>
        {groups.length === 0 && <div className="card stack g8" style={{ padding: 32, alignItems: "center", textAlign: "center" }}><Icon name="file" size={26} /><strong>Nothing here</strong><span className="hint">No documents with this status.</span></div>}
        {groups.map((g) => (
          <section key={g} className="stack g10" aria-label={g}>
            <div className="row g10"><Icon name={GROUP_ICON[g] ?? "file"} size={20} /><h2 style={{ fontSize: 15, fontWeight: 700 }}>{g}</h2></div>
            {shown.filter((d) => d.group === g).map((d) => (
              <DocCard key={d.i} name={d.name} meta={d.meta} status={d.status}
                action={d.action === "download" ? <button className="btn btn-s btn-sm btn-ico" type="button" aria-label={`Download ${d.name}`}><Icon name="download" size={17} /></button>
                  : d.action ? <button className={`btn btn-sm ${d.action === "replace" ? "btn-p" : "btn-s"}`} type="button" onClick={() => { setTarget(d.i); setFile(null); setProgress(null); panel.current?.scrollIntoView({ behavior: "smooth" }); }}>{d.action === "replace" ? "Replace" : <><Icon name="upload" size={16} /> Upload</>}</button> : undefined} />
            ))}
          </section>
        ))}
      </div>

      <div ref={panel} className="card shadow stack g18" style={{ padding: 22, position: "sticky", top: 24 }}>
        <div className="stack g6"><span className="eb" style={{ fontSize: 11 }}>{t.status === "rej" ? "Replace document" : "Upload document"}</span><h2 className="d" style={{ fontSize: 20 }}>{t.name.split(" · ")[0]}</h2><span className="row g8"><Badge k={t.status} /><span className="mut" style={{ fontSize: 13 }}>{t.meta}</span></span></div>
        <div className="field"><label htmlFor="dt">Document type</label><select id="dt" className="in" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <label htmlFor="up" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
          className="stack g10" style={{ border: `2px dashed ${drag ? "var(--ember)" : "#CFC9BD"}`, borderRadius: 8, padding: "28px 20px", alignItems: "center", textAlign: "center", background: drag ? "var(--ember-tint)" : "#FAF8F4", cursor: "pointer" }}>
          <span style={{ width: 48, height: 48, borderRadius: "50%", background: "#fff", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="upload" size={22} /></span>
          <strong style={{ fontSize: 15 }}>Drop a file here, take a photo or choose one</strong><span className="hint">PDF, JPG or PNG · up to 10 MB</span><span className="btn btn-s btn-sm">Choose file</span>
          <input id="up" type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {error && <div className="alert" role="alert" style={{ background: "var(--err-bg)", color: "var(--err)" }}><Icon name="alert" size={20} /><div className="alert-body"><strong>We couldn’t upload that file</strong><span>{error}</span></div></div>}
        {file && progress !== null && (
          <div className="stack g8" style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 6 }} aria-live="polite">
            <div className="row between" style={{ fontSize: 14 }}><span className="row g8" style={{ minWidth: 0 }}><Icon name="file" size={17} /><strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</strong></span><span className="mut">{progress < 100 ? `${progress}%` : "Uploaded"}</span></div>
            <div className="progress"><span style={{ width: `${progress}%`, background: progress < 100 ? "var(--ember)" : "var(--ok)" }} /></div>
            <span className="hint">{progress < 100 ? "Keep this page open" : "Sent to your agent for review. You’ll get a WhatsApp message once it’s checked."}</span>
          </div>
        )}
        <div className="stack g8"><strong style={{ fontSize: 14 }}>For a photo that passes first time</strong>
          <ul className="stack g6" style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.45, color: "var(--ink-2)" }}><li>Lay the document flat in daylight, no flash</li><li>All four corners visible</li><li>Numbers readable when you zoom in</li></ul>
        </div>
        <p className="hint row g8"><Icon name="lock" size={16} /><span>Encrypted. Only your agent and our quality team can see it.</span></p>
      </div>
    </div>
  );
}
