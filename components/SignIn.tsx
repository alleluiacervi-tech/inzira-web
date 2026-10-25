"use client";
import Link from "next/link";
import { useState } from "react";
import { requestCode, requestEmailCode, signIn, signInSecondStep, signInWithEmail } from "@/app/actions/auth";
import { trError } from "@/lib/i18n/errors";
import { CodeEntry, isMobile } from "./PhoneCode";
import { useHuman } from "./Human";
import { useI18n } from "./I18n";
import { unlessRedirect } from "./keep-redirect";
import { Icon } from "./ui";

/** Staff with an authenticator app: the 6-digit code from the app, or one of their recovery codes. */
export function SecondStep({ next, onRestart }: { next?: string; onRestart: () => void }) {
  const { locale, t } = useI18n();
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form className="stack g20" onSubmit={async (e) => {
      e.preventDefault();
      if (!recovery && code.length !== 6) { setError(t("signIn.totpDigits")); return; }
      setBusy(true); setError("");
      const r = await signInSecondStep(code, next).catch(unlessRedirect({ ok: false as const, error: t("code.wrong"), restart: undefined }));
      // A successful sign-in redirects, so a result here is always a problem.
      if (r && !r.ok) { setError(trError(locale, r.error)); setBusy(false); if (r.restart) setTimeout(onRestart, 2500); }
    }}>
      <div className="stack g8"><h1 className="d" style={{ fontSize: 30, lineHeight: 1.15 }}>{t("signIn.totpTitle")}</h1><p className="mut" style={{ fontSize: 15 }}>{t("signIn.totpIntro")}</p></div>
      <div className="field">
        <label htmlFor="totp">{t(recovery ? "signIn.totpRecoveryLabel" : "signIn.totpLabel")}</label>
        <input id="totp" key={recovery ? "r" : "c"} className={`in code-in ${error ? "in-err" : ""}`} inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} maxLength={recovery ? 12 : 6} value={code} autoFocus
          onChange={(e) => { setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} aria-describedby="totp-err" />
        {error && <span className="err-text" id="totp-err" role="alert"><Icon name="alert" size={15} /> {error}</span>}
        {recovery && <span className="hint">{t("signIn.totpRecoveryHint")}</span>}
      </div>
      <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> {t("signIn.totpChecking")}</> : t("signIn.totpCta")}</button>
      <button type="button" className="linkish" style={{ alignSelf: "flex-start", textAlign: "left" }} onClick={() => { setRecovery(!recovery); setCode(""); setError(""); }}>{t(recovery ? "signIn.totpAppLink" : "signIn.totpRecoveryLink")}</button>
      <button type="button" className="linkish" style={{ alignSelf: "flex-start" }} onClick={onRestart}>{t("signIn.totpBack")}</button>
    </form>
  );
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** Sign-in is a one-time code: no password to remember. One field takes an email (customers) or a phone number (staff,
 *  and customers who have not added an email yet): an "@" sends the code by email, a mobile number by SMS. */
export default function SignIn({ next, demo: demoModes = { email: false, phone: false } }: { next?: string; demo?: { email: boolean; phone: boolean } }) {
  const { locale, t } = useI18n();
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState<"email" | "phone" | null>(null);
  const [second, setSecond] = useState(false);
  const human = useHuman();
  const [demoCode, setDemoCode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const email = contact.trim().toLowerCase();
  // Demo helpers (sample sign-ins, the code on screen) only appear where a channel has no real provider.
  const demos: [string, string][] = [
    ...(demoModes.email ? [["aline.uwase@example.com", t("signIn.aline")], ["admin@inzira.test", t("signIn.admin")]] as [string, string][] : []),
    ...(demoModes.phone ? [["780000001", t("signIn.eric")], ["780000008", t("signIn.diane")]] as [string, string][] : []),
  ];

  if (second) return <SecondStep next={next} onRestart={() => { setSecond(false); setSent(null); setDemoCode(undefined); }} />;
  if (sent === "email") {
    return <CodeEntry email={email} demoCode={demoCode} cta={t("signIn.cta")} onBack={() => setSent(null)}
      onResend={async () => { const r = await requestEmailCode(email, await human.get()); return r.ok ? { demoCode: r.demoCode } : { error: r.error }; }}
      onSubmit={async (code) => {
        const r = await signInWithEmail(email, code, next);
        if (r && r.ok) { setSecond(true); return null; }
        return r && !r.ok ? r.error : null;
      }} />;
  }
  if (sent === "phone") {
    return <CodeEntry phone={contact} demoCode={demoCode} cta={t("signIn.cta")} onBack={() => setSent(null)}
      onResend={async () => { const r = await requestCode(contact, await human.get()); return r.ok ? { demoCode: r.demoCode } : { error: r.error }; }}
      onSubmit={async (code) => {
        const r = await signIn(contact, code, next);
        // Staff with an authenticator app have one more step before they are signed in.
        if (r && r.ok) { setSecond(true); return null; }
        return r && !r.ok ? r.error : null;
      }} />;
  }
  return (
    <form className="stack g20" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const byEmail = contact.includes("@");
      if (byEmail ? !isEmail(contact) : !isMobile(contact)) { setError(t("authErr.badContact")); return; }
      setBusy(true);
      const token = await human.get();
      const r = await (byEmail ? requestEmailCode(email, token) : requestCode(contact, token)).catch(() => ({ ok: false as const, error: t("authErr.sendFail") }));
      setBusy(false);
      if (!r.ok) { setError(trError(locale, r.error)); return; }
      setDemoCode(r.demoCode);
      setSent(byEmail ? "email" : "phone");
    }}>
      <div className="auth-head"><h1>{t("signIn.title")}</h1><p>{t(demos.length ? "signIn.demoLead" : "signIn.lead")}</p></div>
      {demos.length > 0 && <div className="row g8 wrapx">{demos.map(([value, label]) => <button key={value} type="button" className="btn btn-s btn-sm" onClick={() => { setContact(value); setError(""); }}>{label}</button>)}</div>}
      <div className="field"><label htmlFor="si-contact">{t("signIn.contact")}</label>
        <input id="si-contact" type="text" className={`in ${error ? "in-err" : ""}`} inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={t("signIn.contactPh")} value={contact} autoFocus onChange={(e) => { setContact(e.target.value); setError(""); }} aria-describedby="si-err" />
        {error && <span className="err-text" id="si-err" role="alert"><Icon name="alert" size={15} /> {error}</span>}
      </div>
      <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> {t("signIn.sending")}</> : t("signIn.send")}</button>
      <nav className="auth-links" aria-label={t("signIn.more")}><Link href="/track">{t("signIn.track")}</Link><span aria-hidden="true">·</span><Link href="/services">{t("signIn.start")}</Link></nav>
    </form>
  );
}
