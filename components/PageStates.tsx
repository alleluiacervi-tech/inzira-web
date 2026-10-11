"use client";
import Link from "next/link";
import { useI18n } from "./I18n";
import { Icon } from "./ui";

/** Shown while a screen's data is on its way. Same outline as the real screens so nothing jumps. */
export function PageSkeleton() {
  const { t } = useI18n();
  return (
    <div aria-busy="true" aria-label={t("error.loading")}>
      <div className="topbar"><div className="stack g8"><span className="skel" style={{ width: 220, height: 20 }} /><span className="skel" style={{ width: 150, height: 12 }} /></div></div>
      <div className="content">
        <div className="grid cols-4 m-cols-2" style={{ gap: 14 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="card stack g12" style={{ padding: "18px 20px" }}><span className="skel" style={{ width: "60%", height: 12 }} /><span className="skel" style={{ width: "35%", height: 28 }} /><span className="skel" style={{ width: "50%", height: 10 }} /></div>)}
        </div>
        <div className="card stack g20" style={{ padding: 20 }}>
          {[0, 1, 2].map((i) => <div key={i} className="stack g10"><span className="skel" style={{ width: "30%", height: 12 }} /><span className="skel" style={{ width: "70%", height: 16 }} /><span className="skel" style={{ width: "45%", height: 12 }} /></div>)}
        </div>
      </div>
    </div>
  );
}

/** Shown when a screen fails to load. Says what happened, that nothing was lost, and how to retry. */
export function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="content">
      <div className="card stack g12" style={{ padding: "40px 24px", alignItems: "center", textAlign: "center" }} role="alert">
        <span className="ico-tile t-err"><Icon name="alert" size={22} /></span>
        <strong>{t("error.load")}</strong>
        <span className="hint" style={{ maxWidth: 420 }}>{t("error.body")}{error.digest ? ` ${t("error.digest", { code: error.digest })}` : ""}</span>
        <div className="row g8 wrapx" style={{ justifyContent: "center" }}><button type="button" className="btn btn-p btn-sm" onClick={reset}>{t("error.retry")}</button><Link className="btn btn-s btn-sm" href="/">{t("error.home")}</Link></div>
      </div>
    </div>
  );
}

/** Shown inside a signed-in area when a request or case does not exist (or is not yours to see). */
export function PageMissing({ what, href, back, title, hint }: { what: string; href: string; back: string; title?: string; hint?: string }) {
  return (
    <div className="content">
      <div className="card stack g12" style={{ padding: "40px 24px", alignItems: "center", textAlign: "center" }}>
        <span className="ico-tile"><Icon name="search" size={22} /></span>
        <strong>{title ?? `We couldn’t find that ${what}`}</strong>
        <span className="hint" style={{ maxWidth: 420 }}>{hint ?? "Check the reference, or go back to the list and open it from there."}</span>
        <Link className="btn btn-p btn-sm" href={href}>{back}</Link>
      </div>
    </div>
  );
}

/** Shown when someone is signed in but their role does not include this screen. */
export function NoAccess({ what }: { what: string }) {
  return (
    <div className="content">
      <div className="card stack g12" style={{ padding: "40px 24px", alignItems: "center", textAlign: "center" }}>
        <span className="ico-tile"><Icon name="lock" size={22} /></span>
        <strong>Your role doesn’t include {what}</strong>
        <span className="hint" style={{ maxWidth: 420 }}>Ask the owner or an administrator if you need it. They can change roles in Admin › Roles &amp; people.</span>
        <Link className="btn btn-p btn-sm" href="/console">Go to the staff console</Link>
      </div>
    </div>
  );
}
