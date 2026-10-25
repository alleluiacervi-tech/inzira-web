"use client";
// The page behind an invite or reset link: the secret is read after "#" in the browser, never from the URL a server sees.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { readPasswordLink, setPasswordWithLink } from "@/app/actions/staff-account";
import { PasswordField } from "./StaffSignIn";
import { Alert } from "./ui";

type Who = { name: string; username: string | null; needsCode: boolean; kind: "invite" | "reset" };

export default function SetPassword() {
  const [token, setToken] = useState("");
  const [who, setWho] = useState<Who | null | "bad">(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const read = useRef(false);
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const m = /[#&]k=([A-Za-z0-9_-]{43})/.exec(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);
    if (!m) { setWho("bad"); return; }
    setToken(m[1]);
    readPasswordLink(m[1]).then((r) => setWho(r.ok ? r : "bad")).catch(() => setWho("bad"));
  }, []);

  if (who === null) return <div className="link-card" role="status"><span className="spin" /> Checking your link…</div>;
  if (who === "bad") {
    return (
      <div className="stack g16">
        <div className="auth-head"><h1>This link no longer works</h1><p>Links work once, for 48 hours (an invite) or one hour (a reset). Ask the owner for a new one, or reset your password from the sign-in page.</p></div>
        <Link className="btn btn-p btn-lg" href="/staff">Go to staff sign in</Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="stack g16" data-password-set>
        <div className="auth-head"><h1>Password saved</h1><p>Sign in with your username <strong>{done}</strong> and your new password.</p></div>
        <Link className="btn btn-p btn-lg" href="/staff">Sign in</Link>
      </div>
    );
  }
  return (
    <form className="stack g20" noValidate data-set-password onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setError("");
      const r = await setPasswordWithLink(token, password, code).catch(() => ({ ok: false as const, error: "Not saved. Check your connection and try again." }));
      setBusy(false);
      if (!r.ok) setError(r.error); else setDone(r.username);
    }}>
      <div className="auth-head"><h1>{who.kind === "invite" ? `Welcome, ${who.name.split(" ")[0]}` : "Choose a new password"}</h1><p>At least 15 characters. Three or four words are easy to remember and hard to guess.</p></div>
      {who.username && <p className="hint" style={{ margin: 0 }}>Your username: <strong>{who.username}</strong></p>}
      <PasswordField id="sp-pass" value={password} onChange={(v) => { setPassword(v); setError(""); }} autoComplete="new-password" label="New password" />
      <div className="pw-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (password.length / 15) * 100)}%` }} className={password.length >= 15 ? "ok" : ""} /></div>
      {who.needsCode && <div className="field"><label htmlFor="sp-code">Code from your authenticator app</label><input id="sp-code" className="in code-in" inputMode="numeric" autoComplete="one-time-code" maxLength={12} value={code} onChange={(e) => setCode(e.target.value.trim())} /></div>}
      {error && <Alert kind="err" title="Not saved" live>{error}</Alert>}
      <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> Saving…</> : "Save password"}</button>
    </form>
  );
}
