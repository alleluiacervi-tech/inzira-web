"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteMyAccount, deleteMyDocuments, signOutEverywhere, updateAccount } from "@/app/actions/customer";
import { Alert, Icon } from "./ui";
import { useDialog } from "./useDialog";

type Props = {
  account: { name: string; phone: string; whatsapp: boolean; languages: string[]; since: string };
  profiles: { id: string; name: string; kind: string; relation?: string; idMasked?: string; tinMasked?: string | null }[];
  data: { files: number; requests: number; open: number; retentionDays: number };
};

const LANGUAGES = ["Kinyarwanda", "English", "French"];

export default function AccountSettings({ account, profiles, data }: Props) {
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
      const r = await updateAccount(fd).catch(() => ({ ok: false as const, error: "We couldn’t save. Check your connection and try again." }));
      if (!r.ok) { setError(r.error); return; }
      setSaved(true);
      router.refresh();
    });
  };

  const removeDocs = async () => {
    setDocsBusy(true); setDocsMsg("");
    const r = await deleteMyDocuments().catch(() => ({ ok: false as const, error: "We couldn’t delete the files. Please try again." }));
    setDocsBusy(false); setConfirmDocs(false);
    setDocsMsg(r.ok ? `${r.deleted} ${r.deleted === 1 ? "file" : "files"} deleted.` : r.error);
    if (r.ok) router.refresh();
  };

  return (
    <div className="stack" style={{ gap: 24, maxWidth: 760 }}>
      <section className="card acct" aria-labelledby="acct-details">
        <h2 id="acct-details" className="acct-h">Your details</h2>
        <form action={save} className="stack g20">
          <div className="field"><label htmlFor="acct-name">Full name</label><input id="acct-name" name="name" className="in" defaultValue={account.name} autoComplete="name" required minLength={2} maxLength={120} /></div>
          <div className="field">
            <span className="label">Phone number</span>
            <span className="acct-static fig">{account.phone}</span>
            <span className="hint">This is how you sign in. To change it, message us and we’ll move your account after checking it’s you.</span>
          </div>
          <label className="check"><input type="checkbox" name="whatsapp" defaultChecked={account.whatsapp} /><span>Send me updates on WhatsApp as well as SMS</span></label>
          <fieldset className="acct-langs">
            <legend className="label">Languages you’re comfortable with</legend>
            <div className="row g20 wrapx">
              {LANGUAGES.map((l) => <label key={l} className="check"><input type="checkbox" name="languages" value={l} defaultChecked={account.languages.includes(l)} /><span>{l}</span></label>)}
            </div>
          </fieldset>
          {error && <Alert kind="err" title="Not saved" live>{error}</Alert>}
          <div className="row g12 wrapx">
            <button className="btn btn-p" type="submit" disabled={saving}>{saving ? <><span className="spin" /> Saving…</> : "Save changes"}</button>
            {saved && <span className="row g6 hint" role="status"><Icon name="check" size={16} color="var(--ok)" />Saved</span>}
          </div>
        </form>
      </section>

      <section className="card acct" aria-labelledby="acct-who">
        <h2 id="acct-who" className="acct-h">Who you request for</h2>
        <ul className="acct-list">
          {profiles.map((p) => (
            <li key={p.id}>
              <span className="acct-ico"><Icon name={p.kind === "person" ? "user" : "briefcase"} size={18} /></span>
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <strong>{p.relation === "self" ? `${p.name} (you)` : p.name}</strong>
                <span className="hint">{[p.kind === "person" ? (p.relation === "family" ? "Family member" : "Person") : "Business", p.idMasked && `ID ${p.idMasked}`, p.tinMasked && `TIN ${p.tinMasked}`].filter(Boolean).join(", ")}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="hint">ID and tax numbers are shown masked. Only the agent handling a request can see them in full, and every time they do it is logged.</p>
      </section>

      <section className="card acct" aria-labelledby="acct-sec">
        <h2 id="acct-sec" className="acct-h">Signing in</h2>
        <p className="acct-p">Lost a phone, or signed in on someone else’s computer? Sign out everywhere, then sign in again with a new code.</p>
        <form action={signOutEverywhere}><button className="btn btn-s" type="submit"><Icon name="lock" size={17} />Sign out of every device</button></form>
      </section>

      <section className="card acct" aria-labelledby="acct-data">
        <h2 id="acct-data" className="acct-h">Your documents and data</h2>
        <p className="acct-p">We delete the documents you uploaded {data.retentionDays} days after a request is finished. Certificates we delivered stay in your portal. Payments and official receipts are kept, because the law requires us to keep financial records.</p>
        <div className="acct-row">
          <span className="stack" style={{ gap: 2 }}>
            <strong>Documents from finished requests</strong>
            <span className="hint">{data.files ? `${data.files} ${data.files === 1 ? "file" : "files"} from ${data.requests} ${data.requests === 1 ? "request" : "requests"}` : "Nothing stored"}</span>
          </span>
          {confirmDocs ? (
            <span className="row g8 wrapx">
              <button className="btn btn-danger btn-sm" type="button" onClick={removeDocs} disabled={docsBusy}>{docsBusy ? <><span className="spin" /> Deleting…</> : "Yes, delete them"}</button>
              <button className="btn btn-g btn-sm" type="button" onClick={() => setConfirmDocs(false)} disabled={docsBusy}>Keep them</button>
            </span>
          ) : (
            <button className="btn btn-s btn-sm" type="button" onClick={() => setConfirmDocs(true)} disabled={!data.files}>Delete now</button>
          )}
        </div>
        {docsMsg && <p className="hint" role="status">{docsMsg}</p>}
        <div className="acct-row acct-danger">
          <span className="stack" style={{ gap: 2 }}>
            <strong>Delete your account</strong>
            <span className="hint">{data.open ? `Finish or cancel your ${data.open} open ${data.open === 1 ? "request" : "requests"} first.` : "Removes your details, documents, certificates and messages. This can’t be undone."}</span>
          </span>
          <button className="btn btn-danger btn-sm" type="button" onClick={() => setDeleting(true)} disabled={data.open > 0}>Delete account</button>
        </div>
      </section>

      {deleting && <DeleteDialog onClose={() => setDeleting(false)} />}
    </div>
  );
}

function DeleteDialog({ onClose }: { onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    // On success the action signs out and redirects, so only a failure returns here.
    const r = await deleteMyAccount(value).catch(() => ({ ok: false as const, error: "We couldn’t delete the account. Please try again." }));
    setBusy(false);
    if (r && !r.ok) setError(r.error);
  };
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="del-title">
        <h2 id="del-title" className="d" style={{ fontSize: 22 }}>Delete your account?</h2>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>Download any certificates you want to keep first. We remove your details, documents, certificates and messages. Payment records stay, without your name or number.</p>
        <form onSubmit={submit} className="stack g16">
          <div className="field"><label htmlFor="del-confirm">Type DELETE to confirm</label><input id="del-confirm" className="in" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoCapitalize="characters" /></div>
          {error && <Alert kind="err" title="Not deleted" live>{error}</Alert>}
          <div className="row g10 wrapx" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-g" type="button" onClick={onClose} disabled={busy}>Keep my account</button>
            <button className="btn btn-danger" type="submit" disabled={busy || value.trim().toUpperCase() !== "DELETE"}>{busy ? <><span className="spin" /> Deleting…</> : "Delete my account"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
