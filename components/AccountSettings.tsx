"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteMyAccount, deleteMyDocuments, signOutEverywhere, updateAccount } from "@/app/actions/customer";
import { trError } from "@/lib/i18n/errors";
import { useI18n } from "./I18n";
import { Alert, Icon } from "./ui";
import { useDialog } from "./useDialog";

type Props = {
  account: { name: string; phone: string; whatsapp: boolean; languages: string[]; since: string };
  profiles: { id: string; name: string; kind: string; relation?: string; idMasked?: string; tinMasked?: string | null }[];
  data: { files: number; requests: number; open: number; retentionDays: number };
};

const LANGUAGES = ["Kinyarwanda", "English", "French"];

export default function AccountSettings({ account, profiles, data }: Props) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [docsMsg, setDocsMsg] = useState("");
  const [docsBusy, setDocsBusy] = useState(false);
  const [confirmDocs, setConfirmDocs] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = (fd: FormData) => {
    setSaved(false); setError("");
    startSave(async () => {
      const r = await updateAccount(fd).catch(() => ({ ok: false as const, error: t("account.saveFail") }));
      if (!r.ok) { setError(trError(locale, r.error)); return; }
      setSaved(true);
      router.refresh();
    });
  };

  const removeDocs = async () => {
    setDocsBusy(true); setDocsMsg("");
    const r = await deleteMyDocuments().catch(() => ({ ok: false as const, error: t("account.deleteFail") }));
    setDocsBusy(false); setConfirmDocs(false);
    setDocsMsg(r.ok ? t("account.deleted", { n: r.deleted, what: r.deleted === 1 ? t("account.file") : t("account.files") }) : trError(locale, r.error));
    if (r.ok) router.refresh();
  };

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 760 }}>
      <section className="card acct" aria-labelledby="acct-details">
        <h2 id="acct-details" className="acct-h">{t("account.details")}</h2>
        <form action={save} className="stack g20">
          <div className="field"><label htmlFor="acct-name">{t("account.name")}</label><input id="acct-name" name="name" className="in" defaultValue={account.name} autoComplete="name" required minLength={2} maxLength={120} /></div>
          <div className="field">
            <span className="label">{t("account.phone")}</span>
            <span className="acct-static fig">{account.phone}</span>
            <span className="hint">{t("account.phoneHint")}</span>
          </div>
          <label className="check"><input type="checkbox" name="whatsapp" defaultChecked={account.whatsapp} /><span>{t("account.whatsapp")}</span></label>
          <fieldset className="acct-langs">
            <legend className="label">{t("account.langs")}</legend>
            <div className="row g20 wrapx">
              {LANGUAGES.map((l) => <label key={l} className="check"><input type="checkbox" name="languages" value={l} defaultChecked={account.languages.includes(l)} /><span>{l}</span></label>)}
            </div>
          </fieldset>
          {error && <Alert kind="err" title={t("account.notSaved")} live>{error}</Alert>}
          <div className="row g12 wrapx">
            <button className="btn btn-p" type="submit" disabled={saving}>{saving ? <><span className="spin" /> {t("account.saving")}</> : t("account.save")}</button>
            {saved && <span className="row g6 hint" role="status"><Icon name="check" size={16} color="var(--ok)" />{t("account.saved")}</span>}
          </div>
        </form>
      </section>

      <section className="card acct" aria-labelledby="acct-who">
        <h2 id="acct-who" className="acct-h">{t("account.who")}</h2>
        <ul className="acct-list">
          {profiles.map((p) => (
            <li key={p.id}>
              <span className="acct-ico"><Icon name={p.kind === "person" ? "user" : "briefcase"} size={18} /></span>
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <strong>{p.relation === "self" ? t("account.you", { name: p.name }) : p.name}</strong>
                <span className="hint">{[p.kind === "person" ? (p.relation === "family" ? t("account.family") : t("account.person")) : t("account.business"), p.idMasked && `ID ${p.idMasked}`, p.tinMasked && `TIN ${p.tinMasked}`].filter(Boolean).join(", ")}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="hint">{t("account.masked")}</p>
      </section>

      <section className="card acct" aria-labelledby="acct-sec">
        <h2 id="acct-sec" className="acct-h">{t("account.signing")}</h2>
        <p className="acct-p">{t("account.lost")}</p>
        <form action={signOutEverywhere}><button className="btn btn-s" type="submit"><Icon name="lock" size={17} />{t("account.everywhere")}</button></form>
      </section>

      <section className="card acct" aria-labelledby="acct-data">
        <h2 id="acct-data" className="acct-h">{t("account.data")}</h2>
        <p className="acct-p">{t("account.retention", { days: data.retentionDays })}</p>
        <div className="acct-row">
          <span className="stack" style={{ gap: 2 }}>
            <strong>{t("account.finished")}</strong>
            <span className="hint">{data.files ? t("account.stored", { files: `${data.files} ${data.files === 1 ? t("account.file") : t("account.files")}`, requests: `${data.requests} ${data.requests === 1 ? t("account.request") : t("account.requests")}` }) : t("account.nothing")}</span>
          </span>
          {confirmDocs ? (
            <span className="row g8 wrapx">
              <button className="btn btn-danger btn-sm" type="button" onClick={removeDocs} disabled={docsBusy}>{docsBusy ? <><span className="spin" /> {t("account.deleting")}</> : t("account.yesDelete")}</button>
              <button className="btn btn-g btn-sm" type="button" onClick={() => setConfirmDocs(false)} disabled={docsBusy}>{t("account.keep")}</button>
            </span>
          ) : (
            <button className="btn btn-s btn-sm" type="button" onClick={() => setConfirmDocs(true)} disabled={!data.files}>{t("account.deleteNow")}</button>
          )}
        </div>
        {docsMsg && <p className="hint" role="status">{docsMsg}</p>}
        <div className="acct-row acct-danger">
          <span className="stack" style={{ gap: 2 }}>
            <strong>{t("account.deleteAccount")}</strong>
            <span className="hint">{data.open ? t("account.openFirst", { n: data.open, what: data.open === 1 ? t("account.request") : t("account.requests") }) : t("account.deleteHint")}</span>
          </span>
          <button className="btn btn-danger btn-sm" type="button" onClick={() => setDeleting(true)} disabled={data.open > 0}>{t("account.deleteBtn")}</button>
        </div>
      </section>

      {deleting && <DeleteDialog onClose={() => setDeleting(false)} />}
    </div>
  );
}

function DeleteDialog({ onClose }: { onClose: () => void }) {
  const { locale, t } = useI18n();
  const ref = useDialog<HTMLDivElement>(true, onClose);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    // On success the action signs out and redirects, so only a failure returns here.
    const r = await deleteMyAccount(value).catch(() => ({ ok: false as const, error: t("account.accountFail") }));
    setBusy(false);
    if (r && !r.ok) setError(trError(locale, r.error));
  };
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="del-title">
        <h2 id="del-title" className="d" style={{ fontSize: 22 }}>{t("account.ask")}</h2>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>{t("account.askBody")}</p>
        <form onSubmit={submit} className="stack g16">
          <div className="field"><label htmlFor="del-confirm">{t("account.type")}</label><input id="del-confirm" className="in" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoCapitalize="characters" /></div>
          {error && <Alert kind="err" title={t("account.notDeleted")} live>{error}</Alert>}
          <div className="row g10 wrapx" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-g" type="button" onClick={onClose} disabled={busy}>{t("account.keepAccount")}</button>
            <button className="btn btn-danger" type="submit" disabled={busy || value.trim().toUpperCase() !== "DELETE"}>{busy ? <><span className="spin" /> {t("account.deleting")}</> : t("account.deleteMine")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
