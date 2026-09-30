"use client";
import { useState } from "react";
import { PERMISSION_GROUPS, ROLES } from "@/lib/data";
import { Alert } from "./ui";

const COLS = ["Owner", "Admin", "Supervisor", "Agent", "Finance", "Quality"];

export default function RolesMatrix() {
  const init = () => Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.name, i.bits.split("").map((b) => b === "1")])));
  const [m, setM] = useState<Record<string, boolean[]>>(init);
  const [role, setRole] = useState("Agent");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const flip = (p: string, i: number) => { setM({ ...m, [p]: m[p].map((v, j) => (j === i ? !v : v)) }); setDirty(true); setSaved(false); };

  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, alignItems: "start" }}>
      <nav className="card stack" style={{ padding: 8, gap: 2 }} aria-label="Roles">
        {ROLES.map((r) => (
          <button key={r.name} type="button" onClick={() => setRole(r.name)} aria-pressed={role === r.name} className="stack" style={{ gap: 3, padding: "12px 14px", borderRadius: 6, border: 0, textAlign: "left", cursor: "pointer", background: role === r.name ? "var(--ink)" : "transparent", color: role === r.name ? "var(--bone)" : "var(--ink)" }}>
            <span className="row between" style={{ fontWeight: 700, fontSize: 14.5 }}>{r.name}<span style={{ fontWeight: 600, opacity: 0.7 }}>{r.count}</span></span>
            <span style={{ fontSize: 12.5, opacity: 0.75 }}>{r.desc}</span>
          </button>
        ))}
      </nav>
      <div className="stack g14" style={{ gridColumn: "span 3", minWidth: 0 }}>
        <Alert kind="info" title="Separation of fees is enforced by permission">Agents record official fees but cannot change our assistance fee on a case without supervisor approval.</Alert>
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Permission</th>{COLS.map((c) => <th key={c} style={{ textAlign: "center", color: c.startsWith(role.slice(0, 4)) ? "var(--ember-deep)" : undefined }}>{c}</th>)}</tr></thead>
            <tbody>
              {PERMISSION_GROUPS.map((g) => [
                <tr key={g.group}><td colSpan={7} style={{ background: "#FAF8F4", fontSize: 12, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--muted)", padding: "9px 14px" }}>{g.group}</td></tr>,
                ...g.items.map((it) => (
                  <tr key={it.name}><td style={{ fontWeight: 600 }}>{it.name}</td>
                    {COLS.map((c, i) => <td key={c} style={{ textAlign: "center" }}><input type="checkbox" aria-label={`${it.name} — ${c}`} checked={m[it.name][i]} disabled={i === 0} onChange={() => flip(it.name, i)} style={{ width: 18, height: 18, accentColor: "var(--ink)" }} /></td>)}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        {saved && <Alert kind="ok" title="Permissions saved">The change has been written to the audit log.</Alert>}
        <div className="row g8" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-g" type="button" disabled={!dirty} onClick={() => { setM(init()); setDirty(false); }}>Discard</button>
          <button className="btn btn-p" type="button" disabled={!dirty} onClick={() => { setDirty(false); setSaved(true); }}>Save permissions</button>
        </div>
      </div>
    </div>
  );
}
