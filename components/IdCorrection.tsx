"use client";
import { useState } from "react";
import { correctSubmittedId } from "@/app/actions/customer";
import { nationalIdDigits, nationalIdError } from "@/lib/identity";
import { useI18n } from "./I18n";
import { Icon } from "./ui";

/** Lets the client replace an ID an agent sent back. The reference does not change, and the review outcome is not theirs to set. */
export default function IdCorrection({ reqRef }: { reqRef: string }) {
  const { t } = useI18n();
  const [nid, setNid] = useState("");
  const [dob, setDob] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const digits = nationalIdDigits(nid);
  const idErr = nationalIdError(digits);

  const send = async () => {
    if (idErr || !dob || !consent) { setError(idErr === "long" ? t("start.errIdLong", { n: digits.length }) : idErr ? t("start.errId", { n: digits.length }) : !dob ? t("start.errDob") : t("start.errIdConsent")); return; }
    setBusy(true); setError("");
    const fd = new FormData();
    fd.set("ref", reqRef); fd.set("nid", nid); fd.set("dob", dob); fd.set("idConsent", "1");
    const res = await correctSubmittedId(fd).catch(() => ({ ok: false as const, error: t("pay.notSaved") }));
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(true);
    setNid("");
  };

  if (done) return <p className="hint" role="status">{t("request.idSent")}</p>;

  return (
    <form className="stack g12" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <p className="hint" style={{ fontSize: 14, lineHeight: 1.5 }}>{t("start.nidPrivacy")}</p>
      <div className="field">
        <label htmlFor="id-correct-nid">{t("start.nid")}</label>
        <div className="row g8">
          <input id="id-correct-nid" className="in grow" inputMode="numeric" autoComplete="off" spellCheck={false} value={nid} onChange={(e) => setNid(e.target.value)} placeholder="1 1995 8 0045123 0 17" aria-describedby="id-correct-hint" />
          <button type="button" className="btn btn-s" onClick={() => setNid("")} disabled={!nid}>{t("start.nidClear")}</button>
        </div>
        <span className="hint" id="id-correct-hint">{t("start.nidHint")}</span>
      </div>
      <div className="field">
        <label htmlFor="id-correct-dob">{t("start.dob")}</label>
        <input id="id-correct-dob" type="date" className="in" value={dob} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} />
      </div>
      <label className="check"><input id="id-correct-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {t("start.nidConsent")}</label>
      {error && <p className="err-text" role="alert"><Icon name="alert" size={15} /> {error}</p>}
      <button className="btn btn-p" type="submit" disabled={busy} style={{ alignSelf: "flex-start" }}>{busy ? t("start.sendingCode") : t("request.idSave")}</button>
    </form>
  );
}
