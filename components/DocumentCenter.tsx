"use client";
import { useRef, useState } from "react";
import { uploadDocument } from "@/app/actions/customer";
import { trError } from "@/lib/i18n/errors";
import { text } from "@/lib/i18n/messages";
import { displayDocName } from "@/lib/i18n/present";
import { DOC_STATUS } from "@/lib/status";
import type { LibraryDoc } from "@/lib/types";
import { useI18n } from "./I18n";
import { DocBadge, DocCard, Icon } from "./ui";

const GROUP_ICON: Record<string, string> = { Identification: "c-id", "Business documents": "c-biz", "Tax documents": "c-tax", "Land documents": "c-land", Certificates: "c-comp", Other: "c-other" };
const TABS: ("all" | LibraryDoc["status"])[] = ["all", "required", "received", "rejected", "approved", "issued"];
const MAX = 10 * 1024 * 1024;

export default function DocumentCenter({ initial: docs }: { initial: LibraryDoc[] }) {
  const { locale, t: tr } = useI18n();
  const groupName = (g: string) => {
    const next = text(locale, `groups.${g}`);
    return next === `groups.${g}` ? g : next;
  };
  const tabName = (k: (typeof TABS)[number]) => (k === "all" ? tr("doc.All") : text(locale, `doc.${DOC_STATUS[k].label}`));
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  // Start on whatever the customer most needs to do: replace a rejected file, else upload a missing one.
  const [target, setTarget] = useState(() => (docs.find((d) => d.action === "replace") ?? docs.find((d) => d.action === "upload"))?.key ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const t = docs.find((d) => d.key === target) ?? null;

  const pick = async (f: File | undefined) => {
    setError(""); setDone("");
    if (!f || !t) return;
    if (f.size > MAX) { setError(tr("docs.tooBig")); return; }
    if (!/^(image\/|application\/pdf)/.test(f.type)) { setError(tr("docs.type")); return; }
    setBusy(f.name);
    const fd = new FormData();
    fd.set("docId", t.key);
    fd.set("file", f);
    const r = await uploadDocument(fd).catch(() => ({ ok: false as const, error: tr("docs.fail") }));
    setBusy(null);
    if (!r.ok) { setError(trError(locale, r.error)); return; }
    setDone(f.name);
  };

  const count = (k: (typeof TABS)[number]) => (k === "all" ? docs.length : docs.filter((d) => d.status === k).length);
  const shown = docs.filter((d) => tab === "all" || d.status === tab);
  const groups = Array.from(new Set(shown.map((d) => d.group)));
  const choose = (key: string) => { setTarget(key); setError(""); setDone(""); panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); };

  return (
    <div className="split" style={{ ["--aside" as string]: "400px", gap: 28 }}>
      <div className="stack g20">
        <div className="chips-scroll" role="group" aria-label={tr("docs.filter")}>
          {TABS.map((k) => (
            <button key={k} type="button" className={`chip chip-sm ${tab === k ? "chip-on" : ""}`} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {tabName(k)} <span style={{ opacity: 0.7 }}>{count(k)}</span>
            </button>
          ))}
        </div>
        {groups.length === 0 && <div className="card stack g8" style={{ padding: 32, alignItems: "center", textAlign: "center" }}><Icon name="file" size={26} /><strong>{docs.length ? tr("docs.nothing") : tr("docs.empty")}</strong><span className="hint">{docs.length ? tr("docs.noneStatus") : tr("docs.emptyHint")}</span></div>}
        {groups.map((g) => (
          <section key={g} className="stack g10" aria-label={groupName(g)}>
            <div className="row g10"><Icon name={GROUP_ICON[g] ?? "file"} size={20} /><h2 style={{ fontSize: 15, fontWeight: 700 }}>{groupName(g)}</h2></div>
            {shown.filter((d) => d.group === g).map((d) => (
              <DocCard key={d.key} name={displayDocName(d.name, locale)} meta={d.meta} badge={<DocBadge s={d.status} />}
                action={d.action === "replace" || d.action === "upload"
                  ? <button className={`btn btn-sm ${d.action === "replace" ? "btn-p" : "btn-s"}`} type="button" aria-label={`${d.action === "replace" ? tr("request.replace") : tr("request.upload")} ${displayDocName(d.name, locale)}`} onClick={() => choose(d.key)}>{d.action === "replace" ? tr("request.replace") : <><Icon name="upload" size={16} /> {tr("request.upload")}</>}</button>
                  : d.fileId ? <a className="btn btn-s btn-sm btn-ico" href={`/files/${d.fileId}`} target="_blank" rel="noopener" aria-label={tr("docs.open", { name: displayDocName(d.name, locale) })}><Icon name="download" size={17} /></a> : undefined} />
            ))}
          </section>
        ))}
      </div>

      <div ref={panel} className={`card shadow stack g18 sticky-aside ${docs.some((d) => d.action === "replace") ? "m-first" : ""}`} style={{ padding: 22, top: 24 }}>
        {t ? (
          <>
            <div className="stack g6"><span className="eb" style={{ fontSize: 11 }}>{t.status === "rejected" ? tr("docs.replace") : t.status === "received" ? tr("docs.uploaded") : tr("docs.upload")}</span><h2 className="d" style={{ fontSize: 20 }}>{displayDocName(t.name, locale)}</h2><span className="row g8 wrapx"><DocBadge s={t.status} /><span className="mut" style={{ fontSize: 13 }}>{t.meta}</span></span></div>
            <label htmlFor="up" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
              className={`drop stack g10 ${drag ? "drop-on" : ""}`} aria-disabled={!!busy}>
              <span className="drop-ico">{busy ? <span className="spin spin-dark" /> : <Icon name="upload" size={22} />}</span>
              <strong style={{ fontSize: 15 }}>{busy ? tr("docs.uploading", { name: busy }) : tr("docs.drop")}</strong><span className="hint">{busy ? tr("docs.keepOpen") : tr("docs.types")}</span>{!busy && <span className="btn btn-s btn-sm">{tr("docs.choose")}</span>}
              <input id="up" type="file" accept="image/*,application/pdf" className="sr-only" disabled={!!busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {error && <div className="alert t-err" role="alert"><Icon name="alert" size={20} /><div className="alert-body"><strong>{tr("docs.failTitle")}</strong><span>{error}</span></div></div>}
            {done && <div className="alert t-ok" role="status"><Icon name="check" size={20} /><div className="alert-body"><strong>{tr("docs.okTitle")}</strong><span>{tr("docs.okBody", { name: done })}</span></div></div>}
          </>
        ) : (
          <div className="stack g8"><span className="eb" style={{ fontSize: 11 }}>{tr("docs.noneUpload")}</span><h2 className="d" style={{ fontSize: 20 }}>{tr("docs.upToDate")}</h2><p className="hint">{tr("docs.upToDateHint")}</p></div>
        )}
        <div className="stack g8"><strong style={{ fontSize: 14 }}>{tr("docs.photo")}</strong>
          <ul className="stack g6" style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.45, color: "var(--ink-2)" }}><li>{tr("docs.tip1")}</li><li>{tr("docs.tip2")}</li><li>{tr("docs.tip3")}</li></ul>
        </div>
        <p className="hint row g8"><Icon name="lock" size={16} /><span>{tr("docs.private")}</span></p>
      </div>
    </div>
  );
}
