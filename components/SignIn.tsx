"use client";
import Link from "next/link";
import { useState } from "react";
import { requestCode, signIn } from "@/app/actions/auth";
import { CodeEntry, isMobile } from "./PhoneCode";
import { Icon } from "./ui";

/** Sign-in is a phone number and a code sent by SMS: no password to remember.
 *  Staff and customers use the same page; staff land in their workspace. */
export default function SignIn({ next }: { next?: string }) {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (sent) {
    return <CodeEntry phone={phone} demoCode={demoCode} cta="Sign in" onBack={() => setSent(false)}
      onResend={async () => { const r = await requestCode(phone); return r.ok ? { demoCode: r.demoCode } : { error: r.error }; }}
      onSubmit={async (code) => { const r = await signIn(phone, code, next); return r && !r.ok ? r.error : null; }} />;
  }
  return (
    <form className="stack g20" onSubmit={async (e) => {
      e.preventDefault();
      if (!isMobile(phone)) { setError("Enter a Rwandan mobile number, e.g. 788 123 456."); return; }
      setBusy(true);
      const r = await requestCode(phone);
      setBusy(false);
      if (!r.ok) { setError(r.error); return; }
      setDemoCode(r.demoCode);
      setSent(true);
    }}>
      <div className="stack g8"><h1 className="h-flow">Sign in to your portal</h1><p className="mut" style={{ fontSize: 15 }}>Use the phone number you gave us. We’ll send a code by SMS. There’s no password.</p></div>
      <div className="field"><label htmlFor="si-phone">Phone number</label>
        <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="si-phone" className={`in ${error ? "in-err" : ""}`} inputMode="tel" autoComplete="tel-national" placeholder="788 123 456" value={phone} autoFocus onChange={(e) => { setPhone(e.target.value); setError(""); }} aria-describedby="si-err" /></div>
        {error && <span className="err-text" id="si-err" role="alert"><Icon name="alert" size={15} /> {error}</span>}
      </div>
      <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> Sending…</> : "Send me a code"}</button>
      <div className="stack g8" style={{ paddingTop: 12, borderTop: "1px solid var(--line)", fontSize: 14.5 }}>
        <span>New here? <Link href="/services">Start a service</Link> — your portal is created when you send your first request.</span>
        <span>Only want to check progress? <Link href="/track">Track a request</Link> with its reference.</span>
        <span className="mut">Inzira staff sign in here too, with their work number.</span>
      </div>
    </form>
  );
}
