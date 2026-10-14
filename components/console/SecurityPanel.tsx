"use client";
import { useState } from "react";
import { beginTotp, confirmTotp, disableTotp, newRecoveryCodesFor } from "@/app/actions/security";
import { Alert, Icon } from "@/components/ui";

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const failed = (): { ok: false; error: string } => ({ ok: false, error: "Not saved. Check your connection and try again." });
const grouped = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

/** Turning the authenticator-app step on and off, and the recovery codes that stand in for a lost phone. */
export default function SecurityPanel({ enabled, recoveryLeft, required, mustSetUp }: { enabled: boolean; recoveryLeft: number; required: boolean; mustSetUp: boolean }) {
  const [on, setOn] = useState(enabled);
  const [left, setLeft] = useState(recoveryLeft);
  const [setup, setSetup] = useState<{ secret: string; url: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const run = async <T,>(fn: () => Promise<Res<T>>): Promise<Res<T>> => {
    setBusy(true); setError(""); setNote("");
    const r = await fn().catch(failed);
    setBusy(false);
    if (!r.ok) setError(r.error);
    return r;
  };
  const show = (recovery: string[]) => { setCodes(recovery); setSaved(false); setLeft(recovery.length); setCode(""); };

  return (
    <div className="stack g16" style={{ maxWidth: 640 }}>
      {mustSetUp && <Alert kind="info" title="Your owner requires the authenticator step">Set it up below, then you can carry on.</Alert>}
      {error && <Alert kind="err" title="Not done" live>{error}</Alert>}
      {note && <Alert kind="ok" title="Done" live>{note}</Alert>}

      {codes && (
        <section className="card stack g12" style={{ padding: 20 }} aria-labelledby="rc-h">
          <h2 id="rc-h" className="d" style={{ fontSize: 18 }}>Save your recovery codes</h2>
          <p className="mut" style={{ fontSize: 14.5 }}>If you lose your phone, each of these signs you in once. They are shown only now. Store them somewhere safe, such as a password manager.</p>
          <ul className="m" style={{ columns: 2, fontSize: 16, lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <div className="row g8 wrapx">
            <button type="button" className="btn btn-s btn-sm" onClick={() => navigator.clipboard?.writeText(codes.join("\n")).then(() => setNote("Copied."))}>Copy codes</button>
          </div>
          <label className="row g8" style={{ alignItems: "center" }}><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} style={{ width: 20, height: 20 }} /> I have saved them</label>
          <button type="button" className="btn btn-p" disabled={!saved} onClick={() => { setCodes(null); if (mustSetUp) window.location.assign("/console"); }}>Done</button>
        </section>
      )}

      {!codes && !on && !setup && (
        <section className="card stack g12" style={{ padding: 20 }}>
          <h2 className="d" style={{ fontSize: 18 }}>Authenticator app</h2>
          <p className="mut" style={{ fontSize: 14.5 }}>Today you sign in with a code sent by SMS. Adding an authenticator app means a stolen or swapped SIM is not enough to open your account. It works offline and is free (Google Authenticator, Microsoft Authenticator, Authy, 1Password).</p>
          <button type="button" className="btn btn-p" disabled={busy} style={{ alignSelf: "flex-start" }} onClick={async () => { const r = await run(beginTotp); if (r.ok) setSetup({ secret: r.secret, url: r.url }); }}>Set up authenticator app</button>
        </section>
      )}

      {!codes && !on && setup && (
        <form className="card stack g14" style={{ padding: 20 }} onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => confirmTotp(code));
          if (r.ok) { setOn(true); setSetup(null); show(r.recovery); }
        }}>
          <h2 className="d" style={{ fontSize: 18 }}>Add Inzira to your app</h2>
          <ol className="stack g8" style={{ paddingLeft: 20, margin: 0, fontSize: 14.5 }}>
            <li>On this phone, <a href={setup.url}>open your authenticator app</a>, or add an account by hand with this key:</li>
            <li><span className="m" style={{ fontSize: 17, letterSpacing: 1, overflowWrap: "anywhere" }} data-totp-secret={setup.secret}>{grouped(setup.secret)}</span></li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          <div className="field"><label htmlFor="sec-code">Code from the app</label>
            <input id="sec-code" className="in code-in" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
          <div className="row g8"><button className="btn btn-p" type="submit" disabled={busy || code.length !== 6}>Turn on</button><button className="btn btn-g" type="button" disabled={busy} onClick={() => { setSetup(null); setCode(""); setError(""); }}>Cancel</button></div>
        </form>
      )}

      {!codes && on && (
        <section className="card stack g14" style={{ padding: 20 }}>
          <div className="row g8" style={{ alignItems: "center" }}><Icon name="check" size={18} /><h2 className="d" style={{ fontSize: 18 }}>Authenticator app is on</h2></div>
          <p className="mut" style={{ fontSize: 14.5 }}>You have {left} unused recovery code{left === 1 ? "" : "s"}. {left <= 2 && "Make new ones soon."}</p>
          <div className="field"><label htmlFor="sec-code2">Current code, to make changes</label>
            <input id="sec-code2" className="in code-in" inputMode="numeric" autoComplete="one-time-code" maxLength={12} value={code} onChange={(e) => setCode(e.target.value.trim())} /></div>
          <div className="row g8 wrapx">
            <button type="button" className="btn btn-s" disabled={busy || !code} onClick={async () => { const r = await run(() => newRecoveryCodesFor(code)); if (r.ok) show(r.recovery); }}>Make new recovery codes</button>
            {!required && <button type="button" className="btn btn-g" disabled={busy || !code} onClick={async () => { const r = await run(() => disableTotp(code)); if (r.ok) { setOn(false); setCode(""); setNote("Authenticator step turned off."); } }}>Turn off</button>}
          </div>
        </section>
      )}
    </div>
  );
}
