"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { restoreKinyarwanda, saveKinyarwanda } from "@/app/actions/content";
import { fmtDate } from "@/lib/format";
import type { Row } from "@/lib/content-fields";
import { Badge, Icon } from "./ui";

type Edit = { by: string; at: string };
type Filter = "all" | "edited" | "missing";

const rowsFor = (text: string, long: boolean) => Math.min(long ? 12 : 4, Math.max(long ? 3 : 1, Math.ceil(text.length / 56) + text.split("\n").length - 1));

/**
 * Edits Kinyarwanda text, side by side with the English it comes from. Changes stay in the page until Save, and are
 * saved together; the site shows them within about two minutes. `where` names the screen each row belongs to when
 * rows from several screens are shown together (search results).
 */
export default function ContentEditor({ rows, edits, where }: { rows: Row[]; edits: Record<string, Edit>; where?: Record<string, string> }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [focusKey, setFocusKey] = useState("");
  // Text typed before the page is interactive would be lost or mixed with the saved text: the boxes wait for it.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const current = (r: Row) => drafts[r.key] ?? r.value;
  const dirty = useMemo(() => rows.filter((r) => drafts[r.key] !== undefined && drafts[r.key] !== r.value), [rows, drafts]);
  const editedCount = rows.filter((r) => r.edited).length;
  const missingCount = rows.filter((r) => !r.value.trim()).length;
  const needle = find.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (filter === "edited" && !r.edited) return false;
    if (filter === "missing" && r.value.trim()) return false;
    return !needle || [r.label, r.en, current(r), r.key].some((v) => v.toLowerCase().includes(needle));
  });

  // After a refused save, bring the first refused text into view: the Save bar covers the bottom of the screen.
  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(`cx-${focusKey.replace(/[^a-z0-9]+/gi, "-")}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFocusKey("");
  }, [focusKey]);

  // Leaving with unsaved changes loses them: ask first.
  useEffect(() => {
    if (!dirty.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.length]);

  const change = (key: string, value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }));
    setErrors((e) => { if (!(key in e)) return e; const { [key]: _gone, ...rest } = e; return rest; });
    setNote(null);
  };
  const forget = (key: string) => {
    setDrafts((d) => { const { [key]: _gone, ...rest } = d; return rest; });
    setErrors((e) => { const { [key]: _gone, ...rest } = e; return rest; });
  };

  async function save() {
    if (!dirty.length || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await saveKinyarwanda(dirty.map((r) => ({ key: r.key, value: drafts[r.key] })));
      if (res.ok) {
        setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !dirty.some((r) => r.key === k))));
        setErrors({});
        setNote({ tone: "ok", text: `Saved ${dirty.length === 1 ? "1 text" : `${dirty.length} texts`}. The public pages show it within about 2 minutes.` });
        router.refresh();
      } else {
        const refused = "errors" in res ? res.errors : {};
        setErrors(refused);
        setFocusKey(rows.find((r) => r.key in refused)?.key ?? "");
        setNote({ tone: "err", text: res.error });
      }
    } catch {
      setNote({ tone: "err", text: "Could not save. Check your connection and try again. Your changes are still here." });
    } finally {
      setBusy(false);
    }
  }

  async function resetAll() {
    const keys = rows.filter((r) => r.edited).map((r) => r.key);
    if (!keys.length || busy) return;
    if (!window.confirm(`Put ${keys.length === 1 ? "this 1 text" : `these ${keys.length} texts`} back to the original Kinyarwanda? Your edits will be removed.`)) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await restoreKinyarwanda(keys);
      if (res.ok) { setDrafts({}); setErrors({}); setNote({ tone: "ok", text: `Restored ${res.restored} ${res.restored === 1 ? "text" : "texts"} to the original.` }); router.refresh(); }
      else setNote({ tone: "err", text: res.error });
    } catch {
      setNote({ tone: "err", text: "Could not restore. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack g16 cx">
      <div className="cx-tools">
        <div className="cx-find">
          <Icon name="search" size={18} />
          <input className="in" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find in this list" aria-label="Find in this list" autoComplete="off" />
        </div>
        <div className="chips-scroll" role="group" aria-label="Show">
          <button type="button" className={`chip chip-sm ${filter === "all" ? "chip-on" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All · {rows.length}</button>
          <button type="button" className={`chip chip-sm ${filter === "edited" ? "chip-on" : ""}`} aria-pressed={filter === "edited"} onClick={() => setFilter("edited")}>Edited · {editedCount}</button>
          <button type="button" className={`chip chip-sm ${filter === "missing" ? "chip-on" : ""}`} aria-pressed={filter === "missing"} onClick={() => setFilter("missing")}>Not translated · {missingCount}</button>
        </div>
        {editedCount > 0 && <button type="button" className="cx-link cx-restore" onClick={resetAll} disabled={busy}>Restore {editedCount === 1 ? "the edit" : `all ${editedCount} edits`} to the original text</button>}
      </div>

      {note && (
        <div className={`alert ${note.tone === "ok" ? "t-ok" : "t-err"}`} role={note.tone === "ok" ? "status" : "alert"}>
          <Icon name={note.tone === "ok" ? "check" : "alert"} size={20} />
          <div className="alert-body"><span>{note.text}</span></div>
        </div>
      )}

      {shown.length === 0 && (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <p className="hint">{needle ? "Nothing here matches your search." : filter === "edited" ? "Nothing has been edited here yet." : filter === "missing" ? "Everything here has Kinyarwanda." : "Nothing to show."}</p>
        </div>
      )}

      <ol className="cx-list">
        {shown.map((r) => {
          const text = current(r);
          const changed = drafts[r.key] !== undefined && drafts[r.key] !== r.value;
          const missing = !text.trim();
          const edit = edits[r.key];
          const id = `cx-${r.key.replace(/[^a-z0-9]+/gi, "-")}`;
          return (
            <li key={r.key} className={`cx-row ${changed ? "cx-changed" : ""} ${errors[r.key] ? "cx-bad" : ""}`}>
              <div className="cx-head">
                <label htmlFor={id} className="cx-label">{r.label}</label>
                <span className="row g6 wrapx">
                  {changed && <Badge tone="info" label="Unsaved" />}
                  {r.edited && !changed && <Badge tone="ok" label="Edited" />}
                  {missing && <Badge tone="warn" label="Not translated" />}
                </span>
              </div>
              {where?.[r.key] && <span className="cx-where">{where[r.key]}</span>}
              <p className="cx-en" lang="en"><span className="cx-lang">EN</span>{r.en}</p>
              <textarea
                id={id}
                className="in"
                lang="rw"
                spellCheck={false}
                rows={rowsFor(text, r.long)}
                value={text}
                readOnly={!ready}
                placeholder={missing ? "Write the Kinyarwanda here. Until then visitors see the English." : undefined}
                aria-invalid={!!errors[r.key]}
                aria-describedby={`${id}-n`}
                onChange={(e) => change(r.key, e.target.value)}
              />
              <div className="cx-foot" id={`${id}-n`}>
                {errors[r.key] && <p className="cx-error" role="alert">{errors[r.key]}</p>}
                {r.vars.length > 0 && (
                  <span className="row g6 wrapx">
                    <span className="hint">Keep:</span>
                    {r.vars.map((v) => <code key={v} className={text.includes(`{${v}}`) ? "cx-var" : "cx-var cx-var-off"}>{`{${v}}`}</code>)}
                  </span>
                )}
                <span className="row g12 wrapx">
                  {edit && r.edited && <span className="hint">Edited by {edit.by} · {fmtDate(edit.at, "en")}</span>}
                  {changed && <button type="button" className="cx-link" onClick={() => forget(r.key)}>Undo</button>}
                  {r.shipped && text !== r.shipped && <button type="button" className="cx-link" onClick={() => change(r.key, r.shipped)}>Use original</button>}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {dirty.length > 0 && (
        <div className="cx-bar" role="region" aria-label="Unsaved changes">
          <span className="cx-bar-msg"><strong>{dirty.length}</strong> {dirty.length === 1 ? "change" : "changes"} not saved</span>
          <button type="button" className="btn btn-g btn-sm" onClick={() => { setDrafts({}); setErrors({}); setNote(null); }} disabled={busy}>Discard</button>
          <button type="button" className="btn btn-p" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      )}
    </div>
  );
}
