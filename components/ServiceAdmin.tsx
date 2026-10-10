"use client";
import { useState } from "react";
import { saveService } from "@/app/actions/admin";
import { fmtDate, officialLabel, oursLabel, rwf, totalLabel } from "@/lib/format";
import type { Category, DocGroup, Service } from "@/lib/types";
import { Badge, FeeTag, Icon } from "./ui";
import { useDialog } from "./useDialog";

const GROUPS: DocGroup[] = ["Identification", "Business documents", "Tax documents", "Land documents", "Certificates", "Other"];
type Kind = "fixed" | "case" | "direct" | "none";
const KIND_LABEL: Record<Kind, string> = {
  fixed: "Fixed amount, collected by Inzira",
  case: "Varies — the agent confirms it per case",
  direct: "Paid by the customer directly (tax or bill)",
  none: "No official fee (our own service)",
};
const kindOf = (s: Service): Kind => (s.official.mode === "none" ? "none" : s.official.mode === "direct" ? "direct" : s.official.amount === null ? "case" : "fixed");
const needsCheck = (s: Service) => s.official.mode !== "none" && !s.official.verifiedAt;
const slugify = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const blank = (category: string): Service => ({
  slug: "", name: "", category, authority: "", channel: "", via: "", summary: "", who: [], requirements: [], documents: [], steps: [], notes: [],
  official: { amount: null, note: "" }, ours: 0, time: "", docsShort: "", audience: ["individual"], visible: false,
});

export default function ServiceAdmin({ services: rows, categories, demand }: { services: Service[]; categories: Category[]; demand: Record<string, number> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cat, setCat] = useState("all");
  const [edit, setEdit] = useState<Service | null>(null);
  const [saved, setSaved] = useState("");
  const dialog = useDialog<HTMLElement>(!!edit, () => setEdit(null));
  const shown = rows.filter((r) => cat === "all" || r.category === cat);
  const short = (id: string) => categories.find((c) => c.id === id)?.short ?? "";
  const isNew = !!edit && !rows.some((r) => r.slug === edit.slug);
  const unchecked = rows.filter(needsCheck).length;
  const setDocAt = (i: number, patch: Partial<Service["documents"][number]>) => edit && setEdit({ ...edit, documents: edit.documents.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const setKind = (k: Kind) => edit && setEdit({ ...edit, official: { ...edit.official, mode: k === "direct" ? "direct" : k === "none" ? "none" : undefined, amount: k === "fixed" ? edit.official.amount ?? 0 : k === "none" ? 0 : null, verifiedAt: undefined } });

  return (
    <div className="stack g16">
      {unchecked > 0 && <div className="alert t-warn"><Icon name="alert" size={20} /><div className="alert-body"><strong>{unchecked} official fees not yet checked</strong><span>Customers see “To be confirmed” and agents confirm the amount on each case. Check each fee with the institution, then mark it as checked.</span></div></div>}
      <div className="row between g12 wrapx">
        <div className="chips-scroll" role="group" aria-label="Category">
          <button type="button" className={`chip chip-sm ${cat === "all" ? "chip-on" : ""}`} onClick={() => setCat("all")} aria-pressed={cat === "all"}>All · {rows.length}</button>
          {categories.filter((c) => !c.href).map((c) => <button key={c.id} type="button" className={`chip chip-sm ${cat === c.id ? "chip-on" : ""}`} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}>{c.short} · {rows.filter((r) => r.category === c.id).length}</button>)}
        </div>
        <button type="button" className="btn btn-p btn-sm" onClick={() => setEdit(blank(cat === "all" ? categories[0].id : cat))}><Icon name="plus" size={16} /> New service</button>
      </div>
      {saved && <div className="alert t-ok" role="status"><Icon name="check" size={20} /><div className="alert-body"><strong>Saved</strong><span>{saved}</span></div></div>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Service</th><th>Category</th><th>Official fee</th><th>Our fee</th><th>Documents</th><th>Status</th><th style={{ textAlign: "right" }}>30-day</th><th><span className="sr-only">Edit</span></th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.slug}>
              <td><span className="stack" style={{ gap: 2 }}><strong>{r.name || "Untitled service"}</strong><span className="mut" style={{ fontSize: 12.5 }}>{r.via}</span></span></td><td><span className="tag">{short(r.category)}</span></td>
              <td><span className="stack" style={{ gap: 4, alignItems: "flex-start" }}><span style={{ fontWeight: 600 }}>{officialLabel(r)}</span>{needsCheck(r) && <Badge tone="warn" label="Not checked" />}</span></td>
              <td className="fee-ours" style={{ fontWeight: 700 }}>{oursLabel(r)}</td><td className="mut">{r.documents.length || "—"}</td>
              <td><Badge tone={r.visible ? "ok" : "neutral"} label={r.visible ? "Active" : "Draft"} /></td><td style={{ textAlign: "right" }}>{demand[r.slug] ?? 0}</td>
              <td><button type="button" className="btn btn-g btn-sm btn-ico" aria-label={`Edit ${r.name}`} onClick={() => { setSaved(""); setEdit({ ...r }); }}><Icon name="edit" size={17} /></button></td>
            </tr>
          ))}</tbody>
        </table>
        {shown.length === 0 && <p className="hint" style={{ padding: 24, textAlign: "center" }}>No services in this category yet.</p>}
      </div>

      {edit && (
        <>
          <div className="drawer-bg" style={{ position: "fixed", zIndex: 65 }} onClick={() => setEdit(null)} />
          <aside ref={dialog} className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="ed-h">
            <div className="card-head" style={{ padding: "20px 24px" }}><div className="stack" style={{ gap: 3 }}><span className="eb" style={{ fontSize: 11 }}>{isNew ? "New service" : "Edit service"}</span><h2 id="ed-h" className="d" style={{ fontSize: 20 }}>{edit.name || "New service"}</h2></div><button className="btn btn-g btn-ico" type="button" aria-label="Close panel" onClick={() => setEdit(null)}><Icon name="x" size={20} /></button></div>
            <div className="stack g18" style={{ padding: "20px 24px", overflowY: "auto", flexGrow: 1 }}>
              <div className="field"><label htmlFor="e1">Customer-facing name</label><input id="e1" className="in" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="grid cols-2" style={{ gap: 12 }}>
                <div className="field"><label htmlFor="e2">Category</label><select id="e2" className="in" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{categories.filter((c) => !c.href).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="field"><label htmlFor="e3">Official channel</label><input id="e3" className="in" value={edit.channel} onChange={(e) => setEdit({ ...edit, channel: e.target.value })} /></div>
              </div>
              <fieldset className="stack g14" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, margin: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 700, padding: "0 6px" }}>Pricing — shown as two separate lines</legend>
                <div className="field"><label htmlFor="e4" className="row g8"><FeeTag kind="official" /> Official fee</label>
                  <select id="e4" className="in" value={kindOf(edit)} onChange={(e) => setKind(e.target.value as Kind)}>{(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
                {kindOf(edit) === "fixed" && <div className="field"><label htmlFor="e5">Amount (RWF)</label><input id="e5" className="in" inputMode="numeric" value={edit.official.amount ?? 0} onChange={(e) => setEdit({ ...edit, official: { ...edit.official, amount: Number(e.target.value.replace(/\D/g, "")) || 0, verifiedAt: undefined } })} /><span className="hint">0 shows as “Free”.</span></div>}
                {kindOf(edit) !== "none" && <div className="field"><label htmlFor="e5n">What customers read under the official fee</label><input id="e5n" className="in" value={edit.official.note} onChange={(e) => setEdit({ ...edit, official: { ...edit.official, note: e.target.value } })} /></div>}
                <div className="grid cols-2" style={{ gap: 12 }}>
                  <div className="field"><label htmlFor="e6" className="row g8"><FeeTag kind="ours" /> Our fee (RWF)</label><input id="e6" className="in" inputMode="numeric" value={edit.ours} onChange={(e) => setEdit({ ...edit, ours: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></div>
                  <div className="field"><label htmlFor="e6u">Charged</label><select id="e6u" className="in" value={edit.oursUnit ?? ""} onChange={(e) => setEdit({ ...edit, oursUnit: e.target.value || undefined })}>
                    {[["", "Once"], ["per month", "Per month"], ["per year", "Per year"], ...(edit.oursUnit && !["per month", "per year"].includes(edit.oursUnit) ? [[edit.oursUnit, edit.oursUnit]] : [])].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
                </div>
                <div className="total-row" style={{ fontSize: 14 }}><span>Customer sees total</span><strong>{totalLabel(edit)}</strong></div>
                {kindOf(edit) !== "none" && (
                  <div className="row between g8 wrapx">
                    <span className="hint">{edit.official.verifiedAt ? `Checked with the institution on ${fmtDate(edit.official.verifiedAt)}. Customers see this date.` : "Not checked with the institution yet."}</span>
                    <button type="button" className="btn btn-s btn-sm" onClick={() => setEdit({ ...edit, official: { ...edit.official, verifiedAt: new Date().toISOString() } })}>{edit.official.verifiedAt ? "Checked again today" : "Mark as checked today"}</button>
                  </div>
                )}
              </fieldset>
              <fieldset className="stack g12" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, margin: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 700, padding: "0 6px" }}>Required documents — the agent’s checklist</legend>
                {edit.documents.length === 0 && <span className="hint">No documents. Add what the customer must send.</span>}
                {edit.documents.map((d, i) => (
                  <div key={i} className="stack g8" style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}>
                    <div className="row g8"><label htmlFor={`d${i}`} className="sr-only">Document {i + 1} name</label><input id={`d${i}`} className="in" style={{ height: 40 }} value={d.name} placeholder="Document name" onChange={(e) => setDocAt(i, { name: e.target.value })} />
                      <button type="button" className="btn btn-g btn-sm btn-ico" aria-label={`Remove ${d.name || `document ${i + 1}`}`} onClick={() => setEdit({ ...edit, documents: edit.documents.filter((_, j) => j !== i) })}><Icon name="trash" size={17} /></button></div>
                    <label htmlFor={`dd${i}`} className="sr-only">Document {i + 1} instructions</label><input id={`dd${i}`} className="in" style={{ height: 40 }} value={d.detail} placeholder="What the customer should send" onChange={(e) => setDocAt(i, { detail: e.target.value })} />
                    <div className="row between g8 wrapx">
                      <label className="check" style={{ fontSize: 13.5 }}><input type="checkbox" checked={d.required} onChange={(e) => setDocAt(i, { required: e.target.checked })} /> Required</label>
                      <span className="row g8"><label htmlFor={`dg${i}`} className="mut" style={{ fontSize: 13, fontWeight: 500 }}>Filed under</label><select id={`dg${i}`} className="in in-sm" value={d.group} onChange={(e) => setDocAt(i, { group: e.target.value as DocGroup })}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></span>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn-s btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setEdit({ ...edit, documents: [...edit.documents, { name: "", detail: "", required: true, group: "Other" }] })}><Icon name="plus" size={16} /> Add document</button>
              </fieldset>
              <div className="field"><label htmlFor="e7">Typical processing</label><input id="e7" className="in" value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} /></div>
              <fieldset className="stack g12" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, margin: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 700, padding: "0 6px" }}>What customers read</legend>
                <div className="field"><label htmlFor="e8">In simple terms</label><textarea id="e8" className="in" rows={4} value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></div>
                <div className="field"><label htmlFor="e9">Also called <span className="mut" style={{ fontWeight: 400 }}>(other names people search for)</span></label><input id="e9" className="in" value={edit.aka ?? ""} onChange={(e) => setEdit({ ...edit, aka: e.target.value || undefined })} /></div>
                <div className="grid cols-2" style={{ gap: 12 }}>
                  <div className="field"><label htmlFor="e10">Responsible authority</label><input id="e10" className="in" value={edit.authority} onChange={(e) => setEdit({ ...edit, authority: e.target.value })} /></div>
                  <div className="field"><label htmlFor="e11">Shown under the name</label><input id="e11" className="in" value={edit.via} placeholder={`Via ${edit.channel || "…"}`} onChange={(e) => setEdit({ ...edit, via: e.target.value })} /></div>
                </div>
                <div className="field"><label htmlFor="e12">Documents, in a few words</label><input id="e12" className="in" value={edit.docsShort} placeholder="e.g. National ID, UPI" onChange={(e) => setEdit({ ...edit, docsShort: e.target.value })} /></div>
                <div className="field"><label htmlFor="e13">Requirements <span className="mut" style={{ fontWeight: 400 }}>(one per line)</span></label><textarea id="e13" className="in" rows={3} value={edit.requirements.join("\n")} onChange={(e) => setEdit({ ...edit, requirements: e.target.value.split("\n") })} /></div>
                <label className="check"><input type="checkbox" checked={!!edit.popular} onChange={(e) => setEdit({ ...edit, popular: e.target.checked })} /> Mark as popular</label>
              </fieldset>
            </div>
            {error && <div className="alert t-err" role="alert" style={{ borderRadius: 0 }}><Icon name="alert" size={20} /><div className="alert-body"><strong>Not saved</strong><span>{error}</span></div></div>}
            <div className="row between g8 wrapx" style={{ padding: "16px 24px", borderTop: "1px solid var(--line)" }}>
              <label className="check"><input type="checkbox" checked={edit.visible} onChange={(e) => setEdit({ ...edit, visible: e.target.checked })} /> Visible in catalogue</label>
              <div className="row g8"><button className="btn btn-g" type="button" onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn btn-p" type="button" disabled={!edit.name.trim() || busy} onClick={async () => {
                  const clean = { ...edit, slug: edit.slug || slugify(edit.name), documents: edit.documents.filter((d) => d.name.trim()), requirements: edit.requirements.map((x) => x.trim()).filter(Boolean) };
                  setBusy(true); setError("");
                  const r = await saveService(clean, isNew).catch(() => ({ ok: false as const, error: "Not saved. Check your connection and try again." }));
                  setBusy(false);
                  if (!r.ok) { setError(r.error); return; }
                  setSaved(`${clean.name} ${isNew ? "added" : "updated"} · our fee ${rwf(clean.ours)}${clean.oursUnit ? ` ${clean.oursUnit}` : ""}. Customers see it now, and the change is in the audit log.`);
                  setEdit(null);
                }}>{busy ? "Saving…" : "Save changes"}</button></div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
