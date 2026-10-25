"use client";
// "Confirm it's you" (lib/step-up.ts): one dialog for the whole console. An action that answers STEP_UP opens it; the
// code is checked, and the action runs once more.
import { useEffect, useRef, useState } from "react";
import { confirmSecondStep } from "@/app/actions/auth";
import { needsStepUp } from "@/lib/step-up";

type Ask = { resolve: (ok: boolean) => void };
const EVENT = "inzira:step-up";

/** Asks for an authenticator code. Resolves true once it was accepted, false when the person cancels. */
export function askStepUp(): Promise<boolean> {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent<Ask>(EVENT, { detail: { resolve } })));
}

/** Runs a sensitive action; if it wants a fresh authenticator code, asks for one and runs it once more. */
export async function withStepUp<R extends { ok: boolean; error?: string }>(run: () => Promise<R>): Promise<R> {
  const first = await run();
  if (!needsStepUp(first)) return first;
  return (await askStepUp()) ? run() : first;
}

/** Mounted once in the console and admin layouts. */
export function StepUpHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const open = (e: Event) => { setAsk((e as CustomEvent<Ask>).detail); setCode(""); setError(""); setRecovery(false); };
    window.addEventListener(EVENT, open);
    return () => window.removeEventListener(EVENT, open);
  }, []);
  useEffect(() => { if (ask) input.current?.focus(); }, [ask, recovery]);
  if (!ask) return null;
  const close = (ok: boolean) => { ask.resolve(ok); setAsk(null); };
  return (
    <div className="console-dialog-overlay" role="presentation" onKeyDown={(e) => { if (e.key === "Escape") close(false); }}>
      <form className="console-dialog stepup" role="dialog" aria-modal="true" aria-labelledby="stepup-h" data-step-up onSubmit={async (e) => {
        e.preventDefault();
        if (!recovery && !/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from the app."); return; }
        setBusy(true); setError("");
        const r = await confirmSecondStep(code).catch(() => ({ ok: false as const, error: "Not checked. Check your connection and try again." }));
        setBusy(false);
        if (r.ok) close(true); else setError(r.error);
      }}>
        <h2 id="stepup-h">Confirm it’s you</h2>
        <p>Money, roles and ID numbers need a code from your authenticator app. It covers the next 12 hours.</p>
        <label htmlFor="stepup-code">{recovery ? "Recovery code" : "6-digit code"}</label>
        <input ref={input} id="stepup-code" key={recovery ? "r" : "c"} className="c-input stepup-code" inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" maxLength={recovery ? 12 : 6}
          value={code} onChange={(e) => { setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} aria-describedby="stepup-err" />
        {error && <p className="stepup-err" id="stepup-err" role="alert">{error}</p>}
        <div className="stepup-actions">
          <button type="button" className="c-btn c-btn-secondary" onClick={() => close(false)} disabled={busy}>Cancel</button>
          <button type="submit" className="c-btn c-btn-primary" disabled={busy}>{busy ? "Checking…" : "Confirm"}</button>
        </div>
        <button type="button" className="stepup-switch" onClick={() => { setRecovery(!recovery); setCode(""); setError(""); }}>{recovery ? "Use the app instead" : "Lost your phone? Use a recovery code"}</button>
      </form>
    </div>
  );
}
