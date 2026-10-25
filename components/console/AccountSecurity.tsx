"use client";
// Username, password and signed-in devices, on the Security page. The authenticator app is SecurityPanel.tsx.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setMyPassword, setMyUsername, signOutDevice, signOutOtherDevices } from "@/app/actions/staff-account";
import { PasswordField } from "@/components/StaffSignIn";
import { Alert } from "@/components/ui";

type Device = { id: string; label: string; since: string; lastSeen: string; trusted: boolean; current: boolean };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Kigali", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function PasswordCard({ username: initialName, hasPassword }: { username: string | null; hasPassword: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState(initialName ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const done = (msg: string) => { setNote(msg); setError(""); router.refresh(); };
  return (
    <section className="card stack g16" style={{ padding: 20 }} aria-labelledby="pw-h" data-password-card>
      <div className="stack g4"><h2 id="pw-h" className="d" style={{ fontSize: 18, margin: 0 }}>Username and password</h2>
        <p className="mut" style={{ margin: 0, fontSize: 14 }}>You sign in at /staff with these, then a code from your authenticator app.</p></div>
      {error && <Alert kind="err" title="Not saved" live>{error}</Alert>}
      {note && <Alert kind="ok" title="Saved" live>{note}</Alert>}
      <form className="row g8 wrapx" style={{ alignItems: "flex-end" }} onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        const r = await setMyUsername(username).catch(() => ({ ok: false as const, error: "Not saved. Check your connection." }));
        setBusy(false);
        if (r.ok) done(`Your username is ${r.username}.`); else setError(r.error);
      }}>
        <div className="field grow" style={{ minWidth: 200 }}><label htmlFor="sec-user">Username</label><input id="sec-user" className="in" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <button type="submit" className="btn btn-s" disabled={busy || !username.trim() || username === initialName}>Save username</button>
      </form>
      <form className="stack g12" noValidate onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        const r = await setMyPassword(current, next).catch(() => ({ ok: false as const, error: "Not saved. Check your connection." }));
        setBusy(false);
        if (r.ok) { setCurrent(""); setNext(""); done(hasPassword ? "Password changed. Your other devices were signed out." : "Password set. Sign in with it from now on."); } else setError(r.error);
      }}>
        {hasPassword && <PasswordField id="sec-current" value={current} onChange={setCurrent} autoComplete="current-password" label="Current password" />}
        <PasswordField id="sec-new" value={next} onChange={setNext} autoComplete="new-password" label={hasPassword ? "New password" : "Choose a password"} />
        <p className="hint" style={{ margin: 0 }}>At least 15 characters. Three or four words are easy to remember, e.g. “green mango river 47”.</p>
        <button type="submit" className="btn btn-p" style={{ alignSelf: "flex-start" }} disabled={busy || !next}>{hasPassword ? "Change password" : "Set password"}</button>
      </form>
    </section>
  );
}

export function DevicesCard({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const others = devices.filter((d) => !d.current).length;
  return (
    <section className="card stack g12" style={{ padding: 20 }} aria-labelledby="dev-h" data-devices>
      <div className="row between g12 wrapx">
        <h2 id="dev-h" className="d" style={{ fontSize: 18, margin: 0 }}>Where you’re signed in</h2>
        {others > 0 && <button type="button" className="btn btn-s btn-sm" disabled={busy} onClick={async () => {
          setBusy(true);
          const r = await signOutOtherDevices().catch(() => ({ ok: false as const, error: "" }));
          setBusy(false);
          if (r.ok) { setNote(`Signed out of ${r.ended} other device${r.ended === 1 ? "" : "s"}.`); router.refresh(); }
        }}>Sign out everywhere else</button>}
      </div>
      {note && <Alert kind="ok" title="Done" live>{note}</Alert>}
      <ul className="dev-list">
        {devices.map((d) => (
          <li key={d.id}>
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <strong>{d.label}{d.current && <span className="tag" style={{ marginLeft: 8 }}>This device</span>}</strong>
              <span className="hint">Signed in {when(d.since)} · last used {when(d.lastSeen)}{d.trusted ? " · kept 30 days" : ""}</span>
            </span>
            {!d.current && <button type="button" className="btn btn-g btn-sm" disabled={busy} onClick={async () => { setBusy(true); await signOutDevice(d.id).catch(() => null); setBusy(false); router.refresh(); }}>Sign out</button>}
          </li>
        ))}
      </ul>
      <p className="hint" style={{ margin: 0 }}>A new device is emailed to your work address. Don’t recognise one? Sign it out and change your password.</p>
    </section>
  );
}
