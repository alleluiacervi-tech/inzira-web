"use client";
import { useState } from "react";
import { applyReplace, previewReplace } from "@/app/actions/content";
import type { Match, Part } from "@/lib/content-fields";
import { Icon } from "./ui";

const Parts = ({ parts, tone }: { parts: Part[]; tone: "old" | "new" }) => <>{parts.map((p, i) => (p.hit ? <mark key={i} className={`cx-mark cx-mark-${tone}`}>{p.text || "∅"}</mark> : <span key={i}>{p.text}</span>))}</>;

/**
 * Finds a word or phrase in every Kinyarwanda text and shows each change before it is made: untick the ones to leave.
 * Applied together or not at all. Only the texts the site shows now are searched, and English is never touched.
 */
export default function ReplaceTool() {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(true);
  const [result, setResult] = useState<{ matches: Match[]; total: number } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = { find, replace, caseSensitive, wholeWord };
  const stale = () => { setResult(null); setErrors({}); };

  async function preview(e: React.FormEvent) {
    e.preventDefault();
    if (!find.trim() || busy) return;
    setBusy(true); setNote(null); setErrors({});
    try {
      const r = await previewReplace(input);
      if (!r.ok) { setNote({ tone: "err", text: r.error }); setResult(null); return; }
      setResult({ matches: r.matches, total: r.total });
      setChosen(new Set(r.matches.map((m) => m.key)));
    } catch { setNote({ tone: "err", text: "Could not search. Check your connection and try again." }); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!result || !chosen.size || busy) return;
    if (!window.confirm(`Change ${chosen.size === 1 ? "1 text" : `${chosen.size} texts`}? The public pages show it within about 2 minutes. Every change is in the audit log.`)) return;
    setBusy(true); setNote(null);
    try {
      const r = await applyReplace(input, [...chosen]);
      if (r.ok) { setNote({ tone: "ok", text: `Changed ${r.saved + r.restored} ${r.saved + r.restored === 1 ? "text" : "texts"}.` }); setResult(null); setErrors({}); }
      else { setErrors("errors" in r ? r.errors : {}); setNote({ tone: "err", text: r.error }); }
    } catch { setNote({ tone: "err", text: "Could not save. Check your connection and try again. Nothing was changed." }); }
    finally { setBusy(false); }
  }

  const toggle = (key: string) => setChosen((cur) => { const next = new Set(cur); if (!next.delete(key)) next.add(key); return next; });
  return (
    <div className="stack g16 cx">
      <form className="card stack g14" style={{ padding: 18 }} onSubmit={preview}>
        <div className="grid cols-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="rp-find">Find</label><input id="rp-find" className="in" lang="rw" value={find} onChange={(e) => { setFind(e.target.value); stale(); }} placeholder="e.g. amafaranga y'urwego" autoComplete="off" maxLength={100} /></div>
          <div className="field"><label htmlFor="rp-with">Replace with</label><input id="rp-with" className="in" lang="rw" value={replace} onChange={(e) => { setReplace(e.target.value); stale(); }} placeholder="Leave empty to remove it" autoComplete="off" /></div>
        </div>
        <div className="row g16 wrapx">
          <label className="check"><input type="checkbox" checked={wholeWord} onChange={(e) => { setWholeWord(e.target.checked); stale(); }} /> Whole words only</label>
          <label className="check"><input type="checkbox" checked={caseSensitive} onChange={(e) => { setCaseSensitive(e.target.checked); stale(); }} /> Match capital letters</label>
        </div>
        <div className="row g12 wrapx"><button className="btn btn-p" type="submit" disabled={!find.trim() || busy}>{busy && !result ? "Searching…" : "Preview changes"}</button>
          <span className="hint">Nothing changes until you confirm.</span></div>
      </form>

      {note && <div className={`alert ${note.tone === "ok" ? "t-ok" : "t-err"}`} role={note.tone === "ok" ? "status" : "alert"}><Icon name={note.tone === "ok" ? "check" : "alert"} size={20} /><div className="alert-body"><span>{note.text}</span></div></div>}

      {result && result.total === 0 && <div className="card" style={{ padding: 28, textAlign: "center" }}><p className="hint">No text contains “{find.trim()}”.</p></div>}
      {result && result.total > 0 && (
        <>
          <div className="row between g12 wrapx">
            <p className="hint" role="status">{result.total} {result.total === 1 ? "text contains" : "texts contain"} it.{result.total > result.matches.length ? ` The first ${result.matches.length} are shown; apply them, then search again.` : ""}</p>
            <span className="row g12"><button type="button" className="cx-link" onClick={() => setChosen(new Set(result.matches.map((m) => m.key)))}>Select all</button><button type="button" className="cx-link" onClick={() => setChosen(new Set())}>Select none</button></span>
          </div>
          <ol className="cx-list">
            {result.matches.map((m) => (
              <li key={m.key} className={`cx-row ${errors[m.key] ? "cx-bad" : ""}`}>
                <label className="check cx-pick"><input type="checkbox" checked={chosen.has(m.key)} onChange={() => toggle(m.key)} /><span className="cx-label">{m.section} › {m.label}</span></label>
                <p className="cx-en cx-diff" lang="rw"><span className="cx-lang">NOW</span><Parts parts={m.before} tone="old" /></p>
                <p className="cx-en cx-diff" lang="rw"><span className="cx-lang">NEW</span><Parts parts={m.after} tone="new" /></p>
                {errors[m.key] && <p className="cx-error" role="alert">{errors[m.key]}</p>}
              </li>
            ))}
          </ol>
          <div className="cx-bar" role="region" aria-label="Apply the changes">
            <span className="cx-bar-msg"><strong>{chosen.size}</strong> of {result.matches.length} selected</span>
            <button type="button" className="btn btn-p" onClick={apply} disabled={!chosen.size || busy}>{busy ? "Saving…" : `Replace in ${chosen.size === 1 ? "1 text" : `${chosen.size} texts`}`}</button>
          </div>
        </>
      )}
    </div>
  );
}
