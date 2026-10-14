"use client";
import { useState } from "react";
import { inviteStaff, resetStaffTotp, savePermissions, updateStaff } from "@/app/actions/admin";
import { initials } from "@/lib/format";
import type { Staff, StaffRole } from "@/lib/types";
import { isMobile } from "./PhoneCode";
import { Alert, Badge, Icon } from "./ui";

type Role = { name: StaffRole; short: string; count: number; desc: string };
type Groups = { group: string; items: { key: string; name: string }[] }[];
type Res = { ok: true } | { ok: false; error: string };
const failed = (): Res => ({ ok: false, error: "Not saved. Check your connection and try again." });

export default function RolesMatrix({ roles, groups, initial, canEdit }: { roles: Role[]; groups: Groups; initial: Record<string, boolean[]>; canEdit: boolean }) {
  const [m, setM] = useState(initial);
  const [role, setRole] = useState<StaffRole>("Agent");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flip = (p: string, i: number) => { setM({ ...m, [p]: m[p].map((v, j) => (j === i ? !v : v)) }); setDirty(true); setSaved(false); };

  return (
    <div className="roles">
      <nav className="card stack" style={{ padding: 8, gap: 2 }} aria-label="Roles">
        {roles.map((r) => (
          <button key={r.name} type="button" onClick={() => setRole(r.name)} aria-pressed={role === r.name} className={`role-btn stack ${role === r.name ? "role-on" : ""}`}>
            <span className="row between" style={{ fontWeight: 700, fontSize: 14.5 }}>{r.name}<span style={{ fontWeight: 600, opacity: 0.7 }}>{r.count}</span></span>
            <span style={{ fontSize: 12.5, opacity: 0.75 }}>{r.desc}</span>
          </button>
        ))}
      </nav>
      <div className="stack g14" style={{ minWidth: 0 }}>
        {!canEdit && <Alert kind="info" title="Only the owner can change this table">You can see what each role may do. The owner decides it, so no one can widen their own access.</Alert>}
        <Alert kind="info" title="Separation of fees is enforced by permission">Agents record official fees but cannot change our assistance fee on a case without a supervisor.</Alert>
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Permission</th>{roles.map((r) => <th key={r.name} style={{ textAlign: "center", color: r.name === role ? "var(--ember-deep)" : undefined }}>{r.short}</th>)}</tr></thead>
            <tbody>
              {groups.map((g) => [
                <tr key={g.group}><td colSpan={roles.length + 1} className="group-row">{g.group}</td></tr>,
                ...g.items.map((it) => (
                  <tr key={it.key}><td style={{ fontWeight: 600 }}>{it.name}</td>
                    {roles.map((r, i) => <td key={r.name} style={{ textAlign: "center", background: r.name === role ? "var(--bone)" : undefined }}><input type="checkbox" aria-label={`${it.name} — ${r.name}`} checked={i === 0 || !!m[it.key]?.[i]} disabled={i === 0 || !canEdit} onChange={() => flip(it.key, i)} style={{ width: 18, height: 18, accentColor: "var(--ink)" }} /></td>)}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <span className="hint d-hide">Swipe the table sideways to see every role.</span>
        {saved && <Alert kind="ok" title="Permissions saved" live>They apply the next time each person opens a page. The change is in the audit log.</Alert>}
        {error && <Alert kind="err" title="Not saved" live>{error}</Alert>}
        <div className="row g8" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-g" type="button" disabled={!canEdit || !dirty || busy} onClick={() => { setM(initial); setDirty(false); }}>Discard</button>
          <button className="btn btn-p" type="button" disabled={!canEdit || !dirty || busy} onClick={async () => {
            setBusy(true); setError("");
            const r = await savePermissions(m).catch(failed);
            setBusy(false);
            if (!r.ok) { setError(r.error); return; }
            setDirty(false); setSaved(true);
          }}>{busy ? "Saving…" : "Save permissions"}</button>
        </div>
      </div>
    </div>
  );
}

/** Who works here and which role each person holds. */
export function People({ staff, roles, meId, isOwner }: { staff: (Staff & { phone: string | null; twoStep: boolean })[]; roles: Role[]; meId: string; isOwner: boolean }) {
  // An Administrator can manage everyone except other Administrators and can't appoint one.
  const appointable = roles.filter((r) => r.name !== "Owner" && (isOwner || r.name !== "Administrator"));
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffRole>("Agent");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<Res>, ok: string) => {
    setBusy(true); setError(""); setNote("");
    const r = await fn().catch(failed);
    setBusy(false);
    if (!r.ok) { setError(r.error); return false; }
    setNote(ok);
    return true;
  };

  return (
    <section id="people" className="card" style={{ overflow: "hidden" }} aria-labelledby="pp-h">
      <div className="card-head"><h2 id="pp-h" className="d" style={{ fontSize: 18 }}>People</h2><button type="button" className="btn btn-p btn-sm" aria-expanded={adding} onClick={() => setAdding(!adding)}><Icon name="plus" size={16} /> Invite person</button></div>
      {adding && (
        <form className="row g10 wrapx" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", alignItems: "flex-end" }} onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || !isMobile(phone)) { setError("Enter their full name and Rwandan mobile number."); return; }
          if (await run(() => inviteStaff(name, phone, role), `${name.trim()} invited as ${role}. They sign in with their number.`)) { setName(""); setPhone(""); setAdding(false); }
        }}>
          <div className="field grow" style={{ minWidth: 180 }}><label htmlFor="pp-name">Full name</label><input id="pp-name" className="in" style={{ height: 40 }} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field" style={{ minWidth: 170 }}><label htmlFor="pp-phone">Mobile number</label><input id="pp-phone" className="in" style={{ height: 40 }} inputMode="tel" placeholder="788 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="field"><label htmlFor="pp-role">Role</label><select id="pp-role" className="in" style={{ height: 40, width: 170 }} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>{appointable.map((r) => <option key={r.name}>{r.name}</option>)}</select></div>
          <button className="btn btn-d btn-sm" type="submit" style={{ height: 40 }} disabled={busy}>Send invite</button>
        </form>
      )}
      {note && <div className="alert t-ok" role="status" style={{ borderRadius: 0 }}><Icon name="check" size={20} /><div className="alert-body"><strong>Saved</strong><span>{note} Recorded in the audit log.</span></div></div>}
      {error && <div className="alert t-err" role="alert" style={{ borderRadius: 0 }}><Icon name="alert" size={20} /><div className="alert-body"><strong>Not saved</strong><span>{error}</span></div></div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Person</th><th>Team</th><th>Role</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{staff.map((p) => {
          const locked = p.role === "Owner" || p.id === meId || (!isOwner && p.role === "Administrator");
          return (
            <tr key={p.id}>
              <td><span className="row g10"><span className="av" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(p.name)}</span><span className="stack" style={{ gap: 1 }}><strong>{p.name}</strong>{p.phone && <span className="mut m" style={{ fontSize: 12 }}>+250 {p.phone}</span>}</span></span></td>
              <td className="mut">{p.team}</td>
              <td>{locked ? <span className="tag">{p.role}</span> : <><label htmlFor={`r-${p.id}`} className="sr-only">Role for {p.name}</label><select id={`r-${p.id}`} className="in in-sm" value={p.role} disabled={busy} onChange={(e) => run(() => updateStaff(p.id, { role: e.target.value as StaffRole }), `${p.name} is now ${e.target.value}.`)}>{appointable.map((r) => <option key={r.name}>{r.name}</option>)}</select></>}</td>
              <td><span className="row g8 wrapx"><Badge tone={p.active ? "ok" : "neutral"} label={p.active ? "Active" : "Deactivated"} />{p.twoStep && <Badge tone="info" label="Authenticator" />}</span></td>
              <td style={{ textAlign: "right" }}>{isOwner && p.twoStep && p.id !== meId && <button type="button" className="btn btn-g btn-sm" disabled={busy} onClick={() => { if (window.confirm(`Remove ${p.name}'s authenticator step? They will sign in by SMS and set it up again.`)) run(() => resetStaffTotp(p.id), `${p.name}'s authenticator step was removed.`); }}>Reset authenticator</button>}{!locked && <button type="button" className="btn btn-s btn-sm" disabled={busy} onClick={() => run(() => updateStaff(p.id, { active: !p.active }), `${p.name} ${p.active ? "deactivated — they are signed out and can no longer sign in" : "reactivated"}.`)}>{p.active ? "Deactivate" : "Reactivate"}</button>}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </section>
  );
}
