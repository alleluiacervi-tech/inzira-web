"use client";
import Link from "next/link";
import { useState } from "react";
import { track } from "@/app/track/actions";
import type { TrackResult } from "@/lib/types";
import { isMobile } from "./PhoneCode";
import { Alert, Icon, RequestBadge, StageTimeline } from "./ui";

export default function Track() {
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<TrackResult | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFound(null);
    if (!ref.trim() || !isMobile(phone)) { setError("Enter the reference from your SMS and the phone number you gave us."); return; }
    setError("");
    setBusy(true);
    try {
      const result = await track(ref, phone);
      if (result) setFound(result);
      else setError("We couldn’t find a request with that reference and phone number. Check both and try again.");
    } catch {
      setError("We couldn’t check right now. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack g24">
      <form className="stack g20" onSubmit={submit}>
        <div className="stack g8"><h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>Track a request</h1><p className="mut" style={{ fontSize: 15 }}>Enter the reference we sent you by SMS and the phone number on the request. No sign-in needed.</p></div>
        <div className="field"><label htmlFor="tr-ref">Reference</label><input id="tr-ref" className="in m" style={{ fontSize: 15 }} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="INZ-2026-04817" autoCapitalize="characters" autoComplete="off" /></div>
        <div className="field"><label htmlFor="tr-phone">Phone number</label>
          <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="tr-phone" className="in" inputMode="tel" autoComplete="tel-national" placeholder="788 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        {error && <Alert kind="err" title="Not found" live>{error}</Alert>}
        <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> Checking…</> : "Check progress"}</button>
      </form>

      {found && (
        <section className="card stack g18" style={{ padding: 22 }} aria-live="polite" aria-label="Request progress">
          <div className="stack g8">
            <div className="row g10 wrapx"><RequestBadge r={found} viewer="customer" /><span className="m mut">{found.ref}</span></div>
            <h2 className="d" style={{ fontSize: 22 }}>{found.name}</h2>
            <span className="mut" style={{ fontSize: 14 }}>{found.via}</span>
          </div>
          <StageTimeline r={found} viewer="customer" />
          <div className="stack g4"><span className="req-next" style={{ color: found.hold ? "var(--ember-deep)" : "var(--muted)" }}>{found.hold ? "Your action" : "Next step"}</span><span style={{ fontSize: 15, lineHeight: 1.5 }}>{found.hold ? found.hold.title : found.next}</span></div>
          <div className="row g10 wrapx"><Link className="btn btn-d" href="/sign-in">Sign in for details</Link></div>
          <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="lock" size={16} /><span>Documents, messages and payments are only shown after you sign in.</span></p>
        </section>
      )}
    </div>
  );
}
