"use client";
import Link from "next/link";
import { useState } from "react";
import { requestCode, signIn } from "@/app/actions/auth";
import { isEmail } from "@/lib/contact";
import { trError } from "@/lib/i18n/errors";
import { CodeEntry } from "./CodeEntry";
import { useI18n } from "./I18n";
import { Alert, Icon } from "./ui";

/** Sign-in is an email address and a code sent to it: no password to remember.
 *  Staff and customers use the same page; staff land in their workspace.
 *  Most customers never need it: their private link opens their request directly. */
export default function SignIn({ next, demo = false, invalidLink = false }: { next?: string; demo?: boolean; invalidLink?: boolean }) {
  const { locale, t } = useI18n();
  const demos: [string, string][] = [
    ["aline@example.com", t("signIn.aline")],
    ["eric@example.com", t("signIn.eric")],
    ["diane@example.com", t("signIn.diane")],
  ];
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [demoCode, setDemoCode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (sent) {
    return <CodeEntry email={email.trim().toLowerCase()} demoCode={demoCode} cta={t("signIn.cta")} onBack={() => setSent(false)}
      onResend={async () => { const r = await requestCode(email); return r.ok ? { demoCode: r.demoCode } : { error: r.error }; }}
      onSubmit={async (code) => { const r = await signIn(email, code, next); return r && !r.ok ? r.error : null; }} />;
  }
  return (
    <form className="stack g20" noValidate onSubmit={async (e) => {
      e.preventDefault();
      if (!isEmail(email)) { setError(t("authErr.badEmail")); return; }
      setBusy(true);
      const r = await requestCode(email).catch(() => ({ ok: false as const, error: t("authErr.sendFail") }));
      setBusy(false);
      if (!r.ok) { setError(trError(locale, r.error)); return; }
      setDemoCode(r.demoCode);
      setSent(true);
    }}>
      {invalidLink && <Alert kind="warn" title={t("signIn.linkTitle")} live>{t("signIn.linkBody")}</Alert>}
      <div className="stack g8"><h1 className="h-flow">{t("signIn.title")}</h1><p className="mut" style={{ fontSize: 15 }}>{demo ? t("signIn.demo") : t("signIn.live")}</p></div>
      {demo && <div className="row g8 wrapx">{demos.map(([address, label]) => <button key={address} type="button" className="btn btn-s btn-sm" onClick={() => { setEmail(address); setError(""); }}>{label}</button>)}</div>}
      <div className="field"><label htmlFor="si-email">{t("signIn.email")}</label>
        <input id="si-email" className={`in ${error ? "in-err" : ""}`} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" value={email} autoFocus onChange={(e) => { setEmail(e.target.value); setError(""); }} aria-describedby="si-err" />
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
