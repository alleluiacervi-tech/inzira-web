"use client";
import Link from "next/link";
import { useState } from "react";
import { requestCode, signIn } from "@/app/actions/auth";
import { trError } from "@/lib/i18n/errors";
import { CodeEntry, isMobile } from "./PhoneCode";
import { useI18n } from "./I18n";
import { Icon } from "./ui";

/** Sign-in is a phone number and a code sent by SMS: no password to remember.
 *  Staff and customers use the same page; staff land in their workspace. */
export default function SignIn({ next, demo = false }: { next?: string; demo?: boolean }) {
  const { locale, t } = useI18n();
  const demos: [string, string][] = [
    ["788123456", t("signIn.aline")],
    ["780000001", t("signIn.eric")],
    ["780000008", t("signIn.diane")],
  ];
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (sent) {
    return <CodeEntry phone={phone} demoCode={demoCode} cta={t("signIn.cta")} onBack={() => setSent(false)}
      onResend={async () => { const r = await requestCode(phone); return r.ok ? { demoCode: r.demoCode } : { error: r.error }; }}
      onSubmit={async (code) => { const r = await signIn(phone, code, next); return r && !r.ok ? r.error : null; }} />;
  }
  return (
    <form className="stack g20" onSubmit={async (e) => {
      e.preventDefault();
      if (!isMobile(phone)) { setError(t("authErr.badPhone")); return; }
      setBusy(true);
      const r = await requestCode(phone);
      setBusy(false);
      if (!r.ok) { setError(trError(locale, r.error)); return; }
      setDemoCode(r.demoCode);
      setSent(true);
    }}>
      <div className="stack g8"><h1 className="h-flow">{t("signIn.title")}</h1><p className="mut" style={{ fontSize: 15 }}>{demo ? t("signIn.demo") : t("signIn.live")}</p></div>
      {demo && <div className="row g8 wrapx">{demos.map(([number, label]) => <button key={number} type="button" className="btn btn-s btn-sm" onClick={() => { setPhone(number); setError(""); }}>{label}</button>)}</div>}
      <div className="field"><label htmlFor="si-phone">{t("signIn.phone")}</label>
        <div className="row g8"><span className="in in-prefix" aria-hidden="true">+250</span><input id="si-phone" className={`in ${error ? "in-err" : ""}`} inputMode="tel" autoComplete="tel-national" placeholder="788 123 456" value={phone} autoFocus onChange={(e) => { setPhone(e.target.value); setError(""); }} aria-describedby="si-err" /></div>
        {error && <span className="err-text" id="si-err" role="alert"><Icon name="alert" size={15} /> {error}</span>}
      </div>
      <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> {t("signIn.sending")}</> : t("signIn.send")}</button>
      <div className="stack g8" style={{ paddingTop: 12, borderTop: "1px solid var(--line)", fontSize: 14.5 }}>
        <span>{t("signIn.new")} <Link href="/services">{t("signIn.start")}</Link> {t("signIn.newRest")}</span>
        <span>{t("signIn.only")} <Link href="/track">{t("signIn.track")}</Link> {t("signIn.onlyRest")}</span>
        <span className="mut">{t("signIn.staff")}</span>
      </div>
    </form>
  );
}
