"use client";
// The client side of private request links (lib/request-links.ts). The secret sits after "#k=" in the link, which
// browsers never send to a server; this reads it, trades it for a private cookie, and takes it out of the address bar.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { claimRequest, openRequestLink, sendSaveLink } from "@/app/actions/links";
import { uploadDocument } from "@/app/actions/customer";
import { trError } from "@/lib/i18n/errors";
import { useI18n } from "./I18n";
import { Alert, Icon } from "./ui";

const secretInHash = () => {
  const m = /[#&]k=([A-Za-z0-9_-]{43})/.exec(window.location.hash);
  return m ? m[1] : null;
};
const clearHash = () => window.history.replaceState(null, "", window.location.pathname + window.location.search);

/** On a request page this browser can already open: a link's secret left in the address bar is taken out of it. */
export function HashCleaner() {
  useEffect(() => { if (secretInHash()) clearHash(); }, []);
  return null;
}

/** Shown when this browser has no working link to the request: opens the one in the address bar, or explains. */
export function LinkGate({ reqRef }: { reqRef: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "none" | "bad">("checking");
  useEffect(() => {
    // Also when a link is pasted into this same tab, which changes only the part after "#".
    const tryLink = () => {
      const token = secretInHash();
      if (!token) { setState((s) => (s === "checking" ? "none" : s)); return; }
      clearHash();
      setState("checking");
      openRequestLink(reqRef, token).then((r) => (r.ok ? router.refresh() : setState("bad"))).catch(() => setState("bad"));
    };
    tryLink();
    window.addEventListener("hashchange", tryLink);
    return () => window.removeEventListener("hashchange", tryLink);
  }, [reqRef, router]);
  if (state === "checking") return <div className="link-card" role="status"><span className="spin" /> {t("link.opening")}</div>;
  return (
    <div className="link-card stack g16" data-link-gate={state}>
      <span className="ico-tile"><Icon name="lock" size={22} /></span>
      <h1 className="h-flow" style={{ margin: 0 }}>{t(state === "bad" ? "link.badTitle" : "link.privateTitle")}</h1>
      <p className="mut" style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55 }}>{t(state === "bad" ? "link.badBody" : "link.privateBody")}</p>
      <div className="row g10 wrapx"><Link className="btn btn-p" href="/track">{t("link.findIt")}</Link><Link className="btn btn-s" href="/sign-in">{t("link.signIn")}</Link></div>
    </div>
  );
}

/** Saves the request to an account: the claim link from an email, read the same way. */
export function ClaimGate({ reqRef }: { reqRef: string }) {
  const { locale, t } = useI18n();
  const [error, setError] = useState("");
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const token = secretInHash();
    if (!token) { setError(t("link.claimMissing")); return; }
    clearHash();
    // Success signs in and moves to the portal, so only a refusal comes back here.
    claimRequest(reqRef, token).then((r) => { if (r && !r.ok) setError(r.error === "tooMany" ? trError(locale, "tooMany") : t("link.claimBad")); }).catch(() => {});
  }, [reqRef, locale, t]);
  if (!error) return <div className="link-card" role="status"><span className="spin" /> {t("link.saving")}</div>;
  return (
    <div className="link-card stack g16">
      <h1 className="h-flow" style={{ margin: 0 }}>{t("link.claimTitle")}</h1>
      <p className="mut" style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55 }}>{error}</p>
      <div className="row g10 wrapx"><Link className="btn btn-p" href={`/r/${reqRef}`}>{t("link.openRequest")}</Link><Link className="btn btn-s" href="/sign-in">{t("link.signIn")}</Link></div>
    </div>
  );
}

/** Adds or replaces one document from the request page. */
export function DocUpload({ docId, label, primary }: { docId: string; label: string; primary?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="stack g6" style={{ alignItems: "flex-end" }}>
      <label className={`btn btn-sm ${primary ? "btn-p" : "btn-s"} ${busy ? "is-busy" : ""}`} data-upload={docId}>
        {busy ? <span className="spin" /> : <Icon name="upload" size={16} />} {label}
        <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={busy} onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) { setError(t("start.tooBig")); return; }
          setBusy(true); setError("");
          const fd = new FormData(); fd.set("docId", docId); fd.set("file", file);
          const r = await uploadDocument(fd).catch(() => ({ ok: false as const, error: t("authErr.submitFail") }));
          setBusy(false);
          if (!r.ok) setError(trError(locale, r.error)); else router.refresh();
        }} />
      </label>
      {error && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</span>}
    </span>
  );
}

/** Demo only, with no real email or SMS provider: the link that was "sent", so it can be followed. */
export function DemoLink({ url }: { url: string }) {
  const { t } = useI18n();
  const local = url.replace(/^https?:\/\/[^/]+/, "");
  return <p className="hint" style={{ margin: 0 }} data-demo-link={local}>{t("link.demo")} <a className="lnk" href={local}>{local.split("#")[0]}</a></p>;
}

/** Sends the "save to my account" link to the email on the request. */
export function SaveToAccount({ reqRef, email }: { reqRef: string; email: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");
  const [demoUrl, setDemoUrl] = useState<string>();
  return (
    <section className="card stack g12 save-card" style={{ padding: 18 }} aria-labelledby="save-h">
      <h2 id="save-h" className="d" style={{ fontSize: 17, margin: 0 }}>{t("link.saveTitle")}</h2>
      <p className="hint" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>{t("link.saveBody", { email })}</p>
      {state === "sent"
        ? <Alert kind="ok" title={t("link.saveSent")} live>{t("link.saveSentBody", { email })}</Alert>
        : <button type="button" className="btn btn-s" disabled={state === "busy"} onClick={async () => {
            setState("busy");
            const r: { ok: boolean; demoUrl?: string } = await sendSaveLink(reqRef).catch(() => ({ ok: false }));
            setDemoUrl(r.demoUrl);
            setState(r.ok ? "sent" : "failed");
          }} data-save-link>{state === "busy" ? <span className="spin" /> : <Icon name="mail" size={17} />} {t("link.saveButton", { email })}</button>}
      {state === "failed" && <span className="err-text" role="alert"><Icon name="alert" size={15} /> {t("link.saveFailed")}</span>}
      {demoUrl && <DemoLink url={demoUrl} />}
    </section>
  );
}
