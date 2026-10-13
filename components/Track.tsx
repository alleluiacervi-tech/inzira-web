"use client";
import Link from "next/link";
import { useState } from "react";
import { track } from "@/app/track/actions";
import { trError } from "@/lib/i18n/errors";
import type { TrackResult } from "@/lib/types";
import { useI18n } from "./I18n";
import { isMobile } from "./PhoneCode";
import { Alert, Icon, RequestBadge, StageTimeline } from "./ui";

export default function Track() {
  const { locale, t } = useI18n();
  const [ref, setRef] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<TrackResult | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFound(null);
    const given = contact.trim();
    if (!ref.trim() || !(given.includes("@") ? /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(given) : isMobile(given))) { setError(t("track.needBoth")); return; }
    setError("");
    setBusy(true);
    try {
      const result = await track(ref, given);
      if (result) setFound(result);
      else setError(t("track.missing"));
    } catch {
      setError(t("track.down"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack g24">
      <form className="stack g20" onSubmit={submit}>
        <div className="stack g8"><h1 className="h-flow">{t("track.title")}</h1><p className="mut" style={{ fontSize: 15 }}>{t("track.lead")}</p></div>
        <div className="field"><label htmlFor="tr-ref">{t("track.ref")}</label><input id="tr-ref" className="in m" style={{ fontSize: 15 }} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="INZ-2026-04817" autoCapitalize="characters" autoComplete="off" /></div>
        <div className="field"><label htmlFor="tr-contact">{t("track.contact")}</label>
          <input id="tr-contact" className="in" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com · 788 123 456" value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        {error && <Alert kind="err" title={t("track.notFound")} live>{trError(locale, error)}</Alert>}
        <button className="btn btn-p btn-lg" type="submit" disabled={busy}>{busy ? <><span className="spin" /> {t("track.checking")}</> : t("track.check")}</button>
      </form>

      {found && (
        <section className="card stack g18" style={{ padding: 22 }} aria-live="polite" aria-label={t("track.progress")}>
          <div className="stack g8">
            <div className="row g10 wrapx"><RequestBadge r={found} viewer="customer" /><span className="m mut">{found.ref}</span></div>
            <h2 className="d" style={{ fontSize: 22 }}>{found.name}</h2>
            <span className="mut" style={{ fontSize: 14 }}>{found.via}</span>
          </div>
          {found.hold ? (
            <div className="needs" role="status">
              <span className="row g10"><span className="needs-dot" aria-hidden="true"><Icon name="alert" size={15} stroke={2.4} /></span><strong style={{ fontSize: 16.5 }}>{t("track.need")}</strong></span>
              <p style={{ fontSize: 15.5, lineHeight: 1.55 }}>{found.hold.title}</p>
              <Link className="btn btn-p btn-lg" href="/sign-in">{t("track.signIn")}</Link>
            </div>
          ) : (
            <div className="stack g4"><span className="req-next" style={{ color: "var(--muted)" }}>{t("track.next")}</span><span style={{ fontSize: 15, lineHeight: 1.5 }}>{found.next}</span></div>
          )}
          <StageTimeline r={found} viewer="customer" />
          {!found.hold && <div className="row g10 wrapx"><Link className="btn btn-s" href="/sign-in">{t("track.details")}</Link></div>}
          <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="lock" size={16} /><span>{t("track.private")}</span></p>
        </section>
      )}
    </div>
  );
}
