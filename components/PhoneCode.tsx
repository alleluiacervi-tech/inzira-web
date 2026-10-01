"use client";
import { useEffect, useState } from "react";
import { Icon } from "./ui";

/** A Rwandan mobile number typed after +250: nine digits starting with 7 (a leading 0 is forgiven). */
export const mobile = (v: string) => v.replace(/\D/g, "").replace(/^250/, "").replace(/^0/, "");
export const isMobile = (v: string) => /^7\d{8}$/.test(mobile(v));
export const prettyMobile = (v: string) => mobile(v).replace(/^(\d{3})(\d{3})(\d{0,3}).*$/, "$1 $2 $3").trim();

/** Step two of signing in or confirming a request: type the code we sent by SMS.
 *  `onSubmit` returns an error message, or null when it worked (it may also navigate away). */
export function CodeEntry({ phone, demoCode, cta = "Confirm", onSubmit, onResend, onBack }: {
  phone: string; demoCode?: string; cta?: string;
  onSubmit: (code: string) => Promise<string | null>;
  onResend: () => Promise<{ demoCode?: string; error?: string }>;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(demoCode);
  const [wait, setWait] = useState(30);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  return (
    <form className="stack g20" onSubmit={async (e) => {
      e.preventDefault();
      if (code.length !== 6) { setError("Enter the 6-digit code from the SMS."); return; }
      setBusy(true);
      setError("");
      const problem = await onSubmit(code).catch(() => "Something went wrong. Please try again.");
      if (problem) { setError(problem); setBusy(false); }
    }}>
      <div className="stack g8">
        <h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>Enter the code we sent you</h1>
        <p className="mut" style={{ fontSize: 15 }}>We sent a 6-digit code by SMS to <strong style={{ color: "var(--ink)" }}>+250 {prettyMobile(phone)}</strong>. <button type="button" className="linkish" onClick={onBack}>Change number</button></p>
      </div>
      <div className="field">
        <label htmlFor="otp">6-digit code</label>
        <input id="otp" className={`in code-in ${error ? "in-err" : ""}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} autoFocus
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} aria-describedby="otp-err otp-hint" />
        {error && <span className="err-text" id="otp-err" role="alert"><Icon name="alert" size={15} /> {error}</span>}
        <span className="hint" id="otp-hint">{demo ? <>Demo mode: no SMS is sent. Your code is <strong className="m" data-demo-code={demo}>{demo}</strong>.</> : "The code can take a minute to arrive. It expires after 10 minutes."}</span>
      </div>
      <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> Checking…</> : cta}</button>
      <p className="hint" aria-live="polite">{wait > 0 ? `Didn’t get it? You can ask for a new code in ${wait}s.` : <>Didn’t get it? <button type="button" className="linkish" onClick={async () => {
        const r = await onResend();
        if (r.error) setError(r.error); else { setDemo(r.demoCode); setWait(30); setCode(""); }
      }}>Send a new code</button></>}</p>
    </form>
  );
}
