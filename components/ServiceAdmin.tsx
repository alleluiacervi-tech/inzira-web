"use client";
import { useState } from "react";
import { CATEGORIES, SERVICES, catById, rwf, type Service } from "@/lib/data";
import { Badge, FeeTag, Icon } from "./ui";

type Row = Service & { visible: boolean; last30: number };
const LAST30: Record<string, number> = { "criminal-record-certificate": 96, "company-registration": 61, "tin-registration": 58, "ebm-setup": 33, "vat-declaration": 118, "land-title-transfer": 14, "birth-certificate": 22, "tax-clearance-certificate": 17, "court-filing-support": 7, "rssb-employer-registration": 9 };

export default function ServiceAdmin() {
  const [rows, setRows] = useState<Row[]>(SERVICES.map((s) => ({ ...s, visible: true, last30: LAST30[s.slug] ?? 0 })));
  const [cat, setCat] = useState("all");
  const [edit, setEdit] = useState<Row | null>(null);
  const [saved, setSaved] = useState("");
  const shown = rows.filter((r) => cat === "all" || r.category === cat);

  const off = (r: Row) => (r.official.amount === null ? r.official.label ?? "Varies" : r.official.amount === 0 ? "Free" : rwf(r.official.amount));

  return (
    <div className="stack g16">
      <div className="row between g12 wrapx">
        <div className="chips-scroll" role="group" aria-label="Category">
          <button type="button" className={`chip chip-sm ${cat === "all" ? "chip-on" : ""}`} onClick={() => setCat("all")} aria-pressed={cat === "all"}>All · {rows.length}</button>
          {CATEGORIES.map((c) => <button key={c.id} type="button" className={`chip chip-sm ${cat === c.id ? "chip-on" : ""}`} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}>{c.short} · {rows.filter((r) => r.category === c.id).length}</button>)}
        </div>
        <button type="button" className="btn btn-p btn-sm" onClick={() => setEdit({ ...SERVICES[0], slug: `new-${Date.now()}`, name: "", official: { amount: 0, note: "" }, ours: 0, visible: false, last30: 0 })}><Icon name="plus" size={16} /> New service</button>
      </div>
      {saved && <div className="alert" role="status" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}><Icon name="check" size={20} /><div className="alert-body"><strong>Saved</strong><span>{saved}</span></div></div>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Service</th><th>Category</th><th>Official channel</th><th>Official fee</th><th>Our fee</th><th>Typical</th><th>Status</th><th style={{ textAlign: "right" }}>30-day</th><th><span className="sr-only">Edit</span></th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.slug}>
              <td><strong>{r.name || "Untitled service"}</strong></td><td><span className="tag">{catById(r.category).short}</span></td><td className="mut">{r.channel}</td>
              <td style={{ fontWeight: 600 }}>{off(r)}</td><td className="fee-ours" style={{ fontWeight: 700 }}>{rwf(r.ours)}{r.oursUnit ? ` ${r.oursUnit}` : ""}</td><td className="mut">{r.time}</td>
              <td><Badge k={r.visible ? "active" : "draft"} /></td><td style={{ textAlign: "right" }}>{r.last30}</td>
              <td><button type="button" className="btn btn-g btn-sm btn-ico" aria-label={`Edit ${r.name}`} onClick={() => setEdit({ ...r })}><Icon name="edit" size={17} /></button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {edit && (
        <>
          <div className="drawer-bg" style={{ position: "fixed", zIndex: 65 }} onClick={() => setEdit(null)} />
          <aside className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="ed-h">
            <div className="card-head" style={{ padding: "20px 24px" }}><div className="stack" style={{ gap: 3 }}><span className="eb" style={{ fontSize: 11 }}>Edit service</span><h2 id="ed-h" className="d" style={{ fontSize: 20 }}>{edit.name || "New service"}</h2></div><button className="btn btn-g btn-ico" type="button" aria-label="Close panel" onClick={() => setEdit(null)}><Icon name="x" size={20} /></button></div>
            <div className="stack g18" style={{ padding: "20px 24px", overflowY: "auto", flexGrow: 1 }}>
              <div className="field"><label htmlFor="e1">Customer-facing name</label><input id="e1" className="in" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="grid cols-2" style={{ gap: 12 }}>
                <div className="field"><label htmlFor="e2">Category</label><select id="e2" className="in" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="field"><label htmlFor="e3">Official channel</label><input id="e3" className="in" value={edit.channel} onChange={(e) => setEdit({ ...edit, channel: e.target.value })} /></div>
              </div>
              <fieldset className="stack g14" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 16, margin: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 700, padding: "0 6px" }}>Pricing — shown as two separate lines</legend>
                <div className="field">
                  <label htmlFor="e5" className="row g8"><FeeTag kind="official" /> Official government fee (RWF)</label>
                  <input id="e5" className="in" inputMode="numeric" disabled={edit.official.amount === null} value={edit.official.amount ?? ""} onChange={(e) => setEdit({ ...edit, official: { ...edit.official, amount: Number(e.target.value.replace(/\D/g, "")) || 0 } })} />
                  <label className="check" style={{ fontSize: 13.5 }}><input type="checkbox" checked={edit.official.amount === null} onChange={(e) => setEdit({ ...edit, official: { ...edit.official, amount: e.target.checked ? null : 0, label: "Varies" } })} /> Varies — confirm per case before payment</label>
                </div>
                <div className="field"><label htmlFor="e6" className="row g8"><FeeTag kind="ours" /> Our assistance fee (RWF)</label><input id="e6" className="in" inputMode="numeric" value={edit.ours} onChange={(e) => setEdit({ ...edit, ours: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></div>
                <div className="total-row" style={{ fontSize: 14 }}><span>Customer sees total</span><strong>{edit.official.amount === null ? "Confirmed before payment" : rwf(edit.official.amount + edit.ours)}</strong></div>
                <span className="hint">Official fee last verified 12 Sep 2026 by Diane M. Re-verify with the institution whenever it changes.</span>
              </fieldset>
              <div className="field"><label htmlFor="e7">Typical processing</label><input id="e7" className="in" value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} /></div>
            </div>
            <div className="row between g8 wrapx" style={{ padding: "16px 24px", borderTop: "1px solid var(--line)" }}>
              <label className="check"><input type="checkbox" checked={edit.visible} onChange={(e) => setEdit({ ...edit, visible: e.target.checked })} /> Visible in catalogue</label>
              <div className="row g8"><button className="btn btn-g" type="button" onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn btn-p" type="button" disabled={!edit.name.trim()} onClick={() => { setRows((rs) => rs.some((r) => r.slug === edit.slug) ? rs.map((r) => (r.slug === edit.slug ? edit : r)) : [...rs, edit]); setSaved(`${edit.name} updated. The change is recorded in the audit log.`); setEdit(null); }}>Save changes</button></div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
