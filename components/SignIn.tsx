"use client";
import Link from "next/link";
import { useState } from "react";
import { requestCode, requestEmailCode, signIn, signInWithEmail } from "@/app/actions/auth";
import { trError } from "@/lib/i18n/errors";
import { CodeEntry, isMobile } from "./PhoneCode";
import { useI18n } from "./I18n";
import { Icon } from "./ui";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** Sign-in is a one-time code: no password to remember. Customers use their email. Staff, and customers who have not
 *  added an email yet, use a phone number and an SMS. `method` chooses which form opens first. */
export default function SignIn({ next, demo: demoModes = { email: false, phone: false }, method = "email" }: { next?: string; demo?: { email: boolean; phone: boolean }; method?: "email" | "phone" }) {
  const { locale, t } = useI18n();
  const [mode, setMode] = useState<"email" | "phone">(method);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const byEmail = mode === "email";
  // Demo helpers (sample sign-ins, the code on screen) only appear where that channel has no real provider.
  const demo = byEmail ? demoModes.email : demoModes.phone;

  const demos: [string, string][] = byEmail
    ? [["aline.uwase@example.com", t("signIn.aline")]]
    : [["780000001", t("signIn.eric")], ["780000008", t("signIn.diane")]];
  const pick = (v: string) => { (byEmail ? setEmail : setPhone)(v); setError(""); };

  if (sent) {
    return byEmail
      ? <CodeEntry email={email.trim().toLowerCase()} demoCode={demoCode} cta={t("signIn.cta")} onBack={() => setSent(false)}
          onResend={async () => { const r = await requestEmailCode(email); return r.ok ? { demoCode: r.demoCode } : { error: r.error }; }}
          onSubmit={async (code) => { const r = await signInWithEmail(email, code, next); return r && !r.ok ? r.error : null; }} />
      : <CodeEntry phone={phone} demoCode={demoCode} cta={t("signIn.cta")} onBack={() => setSent(false)}
          onResend={async () => { const r = await requestCode(phone); return r.ok ? { demoCode: r.demoCode } : { error: r.error }; }}
          onSubmit={async (code) => { const r = await signIn(phone, code, next); return r && !r.ok ? r.error : null; }} />;
  }
  return (
    <form className="stack g20" noValidate onSubmit={async (e) => {
      e.preventDefault();
      if (byEmail ? !isEmail(email) : !isMobile(phone)) { setError(t(byEmail ? "authErr.badEmail" : "authErr.badPhone")); return; }
      setBusy(true);
      const r = await (byEmail ? requestEmailCode(email) : requestCode(phone)).catch(() => ({ ok: false as const, error: t("authErr.sendFail") }));
      setBusy(false);
      if (!r.ok) { setError(trError(locale, r.error)); return; }
      setDemoCode(r.demoCode);
      setSent(true);
    }}>
      <div className="stack g8"><h1 className="h-flow">{t("signIn.title")}</h1><p className="mut" style={{ fontSize: 15 }}>{demo ? t(byEmail ? "signIn.demoEmail" : "signIn.demo") : t(byEmail ? "signIn.liveEmail" : "signIn.livePhone")}</p></div>
      {demo && <div className="row g8 wrapx">{demos.map(([value, label]) => <button key={value} type="button" className="btn btn-s btn-sm" onClick={() => pick(value)}>{label}</button>)}</div>}
      {byEmail ? (
        <div className="field"><label htmlFor="si-email">{t("signIn.email")}</label>
          <input id="si-email" type="email" className={`in ${error ? "in-err" : ""}`} inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder={t("signIn.emailPh")} value={email} autoFocus onChange={(e) => { setEmail(e.target.value); setError(""); }} aria-describedby="si-err" />
          {error && <span className="err-text" id="si-err" role="alert"><Icon name="alert" size={15} /> {error}</span>}
        </div>
      ) : (
        <div className="field"><label htmlFor="si-phone">{t("signIn.phone")}</label>
          <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="si-phone" className={`in ${error ? "in-err" : ""}`} inputMode="tel" autoComplete="tel-national" placeholder="788 123 456" value={phone} autoFocus onChange={(e) => { setPhone(e.target.value); setError(""); }} aria-describedby="si-err" /></div>
          {error && <span className="err-text" id="si-err" role="alert"><Icon name="alert" size={15} /> {error}</span>}
        </div>
      )}
      <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> {t("signIn.sending")}</> : t("signIn.send")}</button>
      <button type="button" className="linkish" style={{ alignSelf: "flex-start", textAlign: "left" }} onClick={() => { setMode(byEmail ? "phone" : "email"); setError(""); }}>{t(byEmail ? "signIn.viaPhone" : "signIn.viaEmail")}</button>
      <div className="stack g8" style={{ paddingTop: 12, borderTop: "1px solid var(--line)", fontSize: 14.5 }}>
        <span>{t("signIn.new")} <Link href="/services">{t("signIn.start")}</Link> {t("signIn.newRest")}</span>
        <span>{t("signIn.only")} <Link href="/track">{t("signIn.track")}</Link> {t("signIn.onlyRest")}</span>
        <span className="mut">{t("signIn.staff")}</span>
      </div>
    </form>
  );
}
