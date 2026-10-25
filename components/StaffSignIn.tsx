"use client";
// Staff sign-in: username (or work email) and password, then the authenticator code. "Keep me signed in" holds the
// session for 30 days on this device; the console still locks after an hour unused and asks for the password only.
import Link from "next/link";
import { useState } from "react";
import { staffPasswordSignIn, unlockConsole } from "@/app/actions/auth";
import { requestPasswordReset } from "@/app/actions/staff-account";
import { SecondStep } from "./SignIn";
import { DemoLink } from "./RequestLink";
import { unlessRedirect } from "./keep-redirect";
import { Alert, Icon } from "./ui";

function PasswordField({ id, value, onChange, autoComplete, label = "Password", error }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; label?: string; error?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw-wrap">
        <input id={id} type={shown ? "text" : "password"} className={`in ${error ? "in-err" : ""}`} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-err`} />
        <button type="button" className="pw-toggle" onClick={() => setShown(!shown)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}><Icon name="eye" size={18} /></button>
      </div>
      {error && <span className="err-text" id={`${id}-err`} role="alert"><Icon name="alert" size={15} /> {error}</span>}
    </div>
  );
}

export default function StaffSignIn({ next }: { next?: string }) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [second, setSecond] = useState(false);
  const [forgot, setForgot] = useState<"no" | "ask" | "sent">("no");
  const [demoUrl, setDemoUrl] = useState<string>();

  if (second) return <SecondStep next={next} onRestart={() => { setSecond(false); setPassword(""); }} />;
  if (forgot !== "no") {
    return (
      <form className="stack g20" noValidate onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError("");
        const r = await requestPasswordReset(user).catch(() => ({ ok: false as const, error: "Not sent. Check your connection and try again." }));
        setBusy(false);
        if (!r.ok) { setError(r.error); return; }
        setDemoUrl(r.demoUrl); setForgot("sent");
      }}>
        <div className="auth-head"><h1>Reset your password</h1><p>We email a link to the work email on your account. It works for one hour.</p></div>
        {forgot === "sent"
          ? <Alert kind="ok" title="Check your email" live>If that account has a work email, a link is on its way. No email on your account? Ask the owner to send you a link.</Alert>
          : <>
            <div className="field"><label htmlFor="st-user">Username or work email</label><input id="st-user" className="in" autoComplete="username" autoCapitalize="none" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} /></div>
            {error && <Alert kind="err" title="Not sent" live>{error}</Alert>}
            <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> Sending…</> : "Email me a link"}</button>
          </>}
        {demoUrl && <DemoLink url={demoUrl} />}
        <button type="button" className="linkish" style={{ alignSelf: "center" }} onClick={() => { setForgot("no"); setError(""); }}>Back to sign in</button>
      </form>
    );
  }
  return (
    <form className="stack g20" noValidate data-staff-sign-in onSubmit={async (e) => {
      e.preventDefault();
      if (!user.trim() || !password) { setError("Enter your username and password."); return; }
      setBusy(true); setError("");
      const r = await staffPasswordSignIn(user, password, trust, next).catch(unlessRedirect({ ok: false as const, error: "Not signed in. Check your connection and try again." }));
      // Success without the authenticator redirects, so a result here is the second step or a refusal.
      if (r && r.ok) { setSecond(true); setBusy(false); return; }
      if (r && !r.ok) { setError(r.error); setBusy(false); }
    }}>
      <div className="auth-head"><h1>Staff sign in</h1><p>For the Inzira team.</p></div>
      <div className="field"><label htmlFor="st-user">Username or work email</label>
        <input id="st-user" className="in" autoComplete="username" autoCapitalize="none" spellCheck={false} value={user} autoFocus onChange={(e) => { setUser(e.target.value); setError(""); }} />
      </div>
      <PasswordField id="st-pass" value={password} onChange={(v) => { setPassword(v); setError(""); }} autoComplete="current-password" />
      <label className="check"><input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} /> Keep me signed in on this device for 30 days</label>
      {error && <Alert kind="err" title="Not signed in" live>{error}</Alert>}
      <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> Signing in…</> : "Sign in"}</button>
      <nav className="auth-links" aria-label="More options"><button type="button" className="linkish" onClick={() => setForgot("ask")}>Forgot your password?</button><span aria-hidden="true">·</span><Link href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`}>No password yet?</Link></nav>
    </form>
  );
}

/** The console locked after an hour unused: the password only, inside the same session. */
export function StaffUnlock({ name, next }: { name: string; next?: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form className="stack g20" noValidate data-unlock onSubmit={async (e) => {
      e.preventDefault();
      if (!password) { setError("Enter your password."); return; }
      setBusy(true); setError("");
      const r = await unlockConsole(password, next).catch(unlessRedirect({ ok: false as const, error: "Not unlocked. Check your connection and try again.", restart: undefined }));
      setBusy(false);
      if (r && !r.ok) { setError(r.error); if (r.restart) window.location.href = "/staff"; }
    }}>
      <div className="auth-head"><span className="unlock-ico" aria-hidden="true"><Icon name="lock" size={24} /></span><h1>Welcome back, {name.split(" ")[0]}</h1><p>The console locked after an hour unused. Enter your password to carry on.</p></div>
      <PasswordField id="un-pass" value={password} onChange={(v) => { setPassword(v); setError(""); }} autoComplete="current-password" error={error} />
      <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> Unlocking…</> : "Unlock"}</button>
    </form>
  );
}

export { PasswordField };
