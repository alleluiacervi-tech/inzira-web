"use client";
import { useState } from "react";
import { AUDIT } from "@/lib/data";
import { Icon } from "./ui";

export default function AuditLog() {
  const [q, setQ] = useState("");
  const [feeOnly, setFeeOnly] = useState(false);
  const [role, setRole] = useState("all");
  const rows = AUDIT.filter((a) => (!feeOnly || a.fee) && (role === "all" || a.role === role) && (!q || [a.actor, a.action, a.entity].join(" ").toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="stack g16">
      <div className="row g10 wrapx">
        <div className="card row g8" style={{ padding: "0 12px", height: 44, width: 340, maxWidth: "100%" }}><Icon name="search" size={18} /><label htmlFor="al" className="sr-only">Search logs</label><input id="al" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, person or action" style={{ border: 0, outline: 0, fontSize: 14, width: "100%" }} /></div>
        <label htmlFor="rl" className="sr-only">Actor role</label>
        <select id="rl" className="in" style={{ width: 180, height: 44 }} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="all">Actor: anyone</option>{["Owner", "Supervisor", "Agent", "Customer", "—"].map((r) => <option key={r} value={r}>{r === "—" ? "System" : r}</option>)}
        </select>
        <label className="check" style={{ marginLeft: "auto" }}><input type="checkbox" checked={feeOnly} onChange={(e) => setFeeOnly(e.target.checked)} /> Fee &amp; payment events only</label>
      </div>
      <div className="card table-wrap"><table>
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Source</th></tr></thead>
        <tbody>{rows.map((a) => (
          <tr key={a.time + a.action}><td className="m" style={{ whiteSpace: "nowrap" }}>{a.time}</td><td><span className="stack" style={{ gap: 1 }}><strong>{a.actor}</strong><span className="mut" style={{ fontSize: 12.5 }}>{a.role}</span></span></td><td><span className="tag" style={a.fee ? { background: "var(--ember-tint)", color: "var(--ember-deep)" } : undefined}>{a.action}</span></td><td>{a.entity}</td><td className="mut" style={{ fontSize: 13 }}>{a.source}</td></tr>
        ))}</tbody>
      </table>
      {rows.length === 0 && <p className="hint" style={{ padding: 24, textAlign: "center" }}>No events match these filters.</p>}
      </div>
    </div>
  );
}
