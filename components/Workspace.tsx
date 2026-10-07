"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addNote, assignCase, clearHold, closeCase, markSubmitted, messageCustomer, reviewDocument, saveFees, scheduleFollowUp, sendQuote, setStage, uploadCaseFile } from "@/app/actions/agent";
import { fmtMonth, fmtWhen, initials, rwf, shortName } from "@/lib/format";
import type { Permission } from "@/lib/permissions";
import { payStatus, stageLabel } from "@/lib/status";
import type { Closed, RequestView, Staff, Stage } from "@/lib/types";
import { KIND } from "./CaseBoard";
import { Alert, DocBadge, FeeTag, Icon, PayBadge, RequestBadge, StageTimeline, TimelineV } from "./ui";

type Res = { ok: true } | { ok: false; error: string };
const CHANNELS = ["Irembo", "RRA e-Tax", "RRA EBM", "RDB online registration", "RURA online services", "In person"];

/** One case, worked by an agent. Every button saves to the server and the page refreshes with the result. */
export default function Workspace({ c, me, perms, agents, category, now }: { c: RequestView; me: Staff; perms: Permission[]; agents: Staff[]; category: string; now: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const can = (p: Permission) => perms.includes(p);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flash = (m: string) => { setToast(m); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setToast(""), 2800); };
  /** Runs a server action; on success clears the form via `after`, shows `ok` and reloads the case. */
  const run = (ok: string, fn: () => Promise<Res>, after?: () => void) => start(async () => {
    setError("");
    const r = await fn().catch((): Res => ({ ok: false, error: "Not saved. Check your connection and try again." }));
    if (!r.ok) { setError(r.error); return; }
    after?.();
    flash(ok);
    router.refresh();
  });

  // Form fields only. Everything else comes from the case.
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"notes" | "activity">("notes");
  const [pending, setPending] = useState<Stage>(c.stage);
  const [statusMsg, setStatusMsg] = useState("");
  const [notify, setNotify] = useState(true);
  const [channel, setChannel] = useState(c.channel);
  const [officialRef, setOfficialRef] = useState(c.officialRef ?? "");
  const [official, setOfficial] = useState(c.billing.official === null ? "" : String(c.billing.official));
  const [ours, setOurs] = useState(String(c.billing.ours));
  const [closeKind, setCloseKind] = useState<Closed["kind"]>("cancelled");
  const [closeReason, setCloseReason] = useState("");
  // When the case changes on the server, show its new values.
  useEffect(() => { setPending(c.stage); }, [c.stage]);
  useEffect(() => { setOfficialRef(c.officialRef ?? ""); setChannel(c.channel); }, [c.officialRef, c.channel]);
  useEffect(() => { setOfficial(c.billing.official === null ? "" : String(c.billing.official)); setOurs(String(c.billing.ours)); }, [c.billing.official, c.billing.ours]);

  const { hold, closed, stage } = c;
  const first = c.account.first;
  const finished = stage === "completed" || !!closed;
  const mode = c.billing.officialMode;
  const officialValue = mode || official === "" ? null : Number(official);
  const oursValue = Number(ours) || 0;
  const feesDirty = officialValue !== c.billing.official || oursValue !== c.billing.ours;
  const oursChanged = oursValue !== c.billing.ours;
  const review = c.documents.find((d) => d.id === reviewId && d.status === "received") ?? c.documents.find((d) => d.status === "received");
  const quick = c.documents.filter((d) => d.status === "rejected" || (d.required && d.status === "required")).map((d) => d.name);
  const phone = c.account.phone.replace(/\D/g, "");
  const progress = { stage, stageDates: c.stageDates, hold, closed, flow: c.flow, labels: c.labels };
  const billing = { ...c.billing, official: officialValue, ours: oursValue };
  /** Sends one chosen file to the server as a deliverable, receipt or customer document. */
  const upload = (kind: "deliverable" | "receipt" | "document", file: File | undefined, extra: Record<string, string> = {}, ok = "File saved") => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("That file is larger than 10 MB."); return; }
    const fd = new FormData();
    fd.set("ref", c.ref); fd.set("kind", kind); fd.set("file", file);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    run(ok, () => uploadCaseFile(fd));
  };
  const [deliverableName, setDeliverableName] = useState("");
  const nope = (p: Permission) => !can(p) && <span className="hint">Your role can’t do this.</span>;

  return (
    <>
      <div className="page-band stack g16">
        <div className="row between g20 m-col" style={{ alignItems: "flex-start" }}>
          <div className="stack g8">
            <nav aria-label="Breadcrumb" className="mut row g8" style={{ fontSize: 13.5 }}><Link href="/agent#cases">Cases</Link><span>/</span><span className="m">{c.ref}</span></nav>
            <div className="row g12 wrapx"><h1 className="d" style={{ fontSize: "clamp(22px, 2.6vw, 28px)" }}>{c.name}</h1><RequestBadge r={progress} viewer="staff" /><span className="tag">{category}</span></div>
            <div className="row g12 wrapx mut" style={{ fontSize: 14 }}>
              <span>{c.profile.name} · {KIND[c.profile.kind]}</span>
              <label htmlFor="asg" className="row g8" style={{ fontWeight: 400, color: "var(--muted)" }}>Assigned to
                <select id="asg" className="in in-sm" value={c.agentId ?? ""} disabled={!can("assign") || busy} onChange={(e) => { const v = e.target.value || null; run(v ? `Assigned to ${shortName(agents.find((a) => a.id === v)?.name ?? "")}` : "Case unassigned", () => assignCase(c.ref, v)); }}>
                  <option value="">Unassigned</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.id === me.id ? " (me)" : ""}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="row g8 wrapx">
            <a className="btn btn-s" href="#ask"><Icon name="msg" size={18} /> Message customer</a>
            <button className="btn btn-p" type="button" disabled={finished || busy || !can("complete")} onClick={() => run("Request completed · customer notified", () => setStage(c.ref, "completed", "", true))}><Icon name="check" size={18} /> {stage === "completed" ? "Completed" : "Complete request"}</button>
          </div>
        </div>
        <StageTimeline r={progress} viewer="staff" />
      </div>

      <div className="content">
        {toast && <div role="status" className="toast"><Icon name="check" size={18} color="var(--ok-on-dark)" />{toast}</div>}
        {error && <Alert kind="err" title="Not saved" live action={<button type="button" className="btn btn-s btn-sm" onClick={() => setError("")}>Dismiss</button>}>{error}</Alert>}
        {closed && <Alert kind={closed.kind === "rejected" ? "err" : "info"} title={closed.kind === "rejected" ? "Rejected by the institution" : "Cancelled"}>{closed.reason}</Alert>}
        <div className="ws" aria-busy={busy}>
          <div className="stack g16">
            <section className="card stack g14" style={{ padding: 18 }} aria-label="Customer">
              <div className="row g12"><span className="av" style={{ width: 44, height: 44, fontSize: 14 }}>{initials(c.profile.name)}</span><div className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 16 }}>{c.profile.name}</strong><span className="mut" style={{ fontSize: 13 }}>{KIND[c.profile.kind]} · customer since {fmtMonth(c.account.since)}</span></div></div>
              <dl className="facts">
                {c.profile.name !== c.account.name && <><dt>Contact</dt><dd>{c.account.name}</dd></>}
                <dt>Phone</dt><dd>{c.account.phone}</dd>
                <dt>WhatsApp</dt><dd>{c.account.whatsapp ? "Same number · opted in" : "Not opted in"}</dd>
                {c.profile.idMasked && <><dt>National ID</dt><dd className="m" style={{ fontWeight: 500 }}>{c.profile.idMasked}</dd></>}
                {c.profile.district && <><dt>District</dt><dd>{c.profile.district}</dd></>}
                {c.account.languages.length > 0 && <><dt>Language</dt><dd>{c.account.languages.join(", ")}</dd></>}
                {c.purpose && <><dt>Purpose</dt><dd>{c.purpose}</dd></>}
              </dl>
              <div className="row g8"><a className="btn btn-s btn-sm grow" href={`tel:+${phone}`}><Icon name="phone" size={16} /> Call</a><a className="btn btn-s btn-sm grow" href={`https://wa.me/${phone}`}><Icon name="msg" size={16} /> WhatsApp</a></div>
            </section>
            <section className="card stack g6" style={{ padding: 18 }} aria-label="Service requirements">
              <div className="row between"><h2 className="d" style={{ fontSize: 16 }}>Service requirements</h2><Link className="lnk" href={`/services/${c.service.slug}`} style={{ fontSize: 13 }}>Guide</Link></div>
              {c.documents.map((d) => (
                <div key={d.id} className="row g12" style={{ padding: "10px 0", borderBottom: "1px solid var(--line-2)" }}>
                  <Icon name={d.status === "approved" ? "check" : d.status === "received" ? "eye" : "alert"} size={18} color={d.status === "approved" ? "var(--ok)" : d.status === "received" ? "var(--teal)" : d.required ? "var(--ember-deep)" : "var(--muted)"} />
                  <div className="stack grow" style={{ gap: 2, minWidth: 0 }}><strong style={{ fontSize: 14 }}>{d.name}</strong><span className="mut" style={{ fontSize: 12.5 }}>{d.status === "received" && d.file ? `${d.file.name} · uploaded ${fmtWhen(d.file.uploadedAt, now)}` : d.status === "approved" && d.reviewedAt ? `Approved ${fmtWhen(d.reviewedAt, now)}` : d.note ?? (d.required ? "Not received yet" : "Only if applicable")}</span></div>
                  {d.status === "received" && !finished ? <button type="button" className="btn btn-s btn-sm" onClick={() => { setReviewId(d.id); setRejecting(false); document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}>Review</button>
                    : (d.status === "required" || d.status === "rejected") && !finished && can("reviewDocs")
                      ? <label className="btn btn-s btn-sm" style={{ cursor: "pointer" }} title="Add a copy the customer gave you in person or on WhatsApp"><Icon name="upload" size={15} /> Add<input type="file" accept="image/*,application/pdf" className="sr-only" aria-label={`Add ${d.name} for the customer`} onChange={(e) => { upload("document", e.target.files?.[0], { docId: d.id }, `${d.name} added`); e.target.value = ""; }} /></label>
                      : <DocBadge s={d.status} />}
                </div>
              ))}
              {c.documents.length === 0 && <p className="hint" style={{ padding: "8px 0" }}>No documents are needed for this service.</p>}
              <p className="hint" style={{ paddingTop: 8 }}>Checklist comes from the service template in Admin › Services.</p>
            </section>
          </div>

          <div className="stack g16">
            {review && !finished && (
              <section id="review" className="card stack g14" style={{ padding: 18 }} aria-labelledby="rv-h">
                <div className="row between g8 wrapx"><h2 id="rv-h" className="d" style={{ fontSize: 17 }}>Review: {review.name}</h2><span className="mut" style={{ fontSize: 13 }}>{review.file?.name} · {review.file?.size}</span></div>
                {review.file?.id && can("downloadDocs")
                  ? <a className="btn btn-s" href={`/files/${review.file.id}`} target="_blank" rel="noopener" style={{ alignSelf: "flex-start" }}><Icon name="eye" size={18} /> Open the file</a>
                  : <p className="hint">{review.file?.id ? "Your role can’t open customer documents." : "No stored file for this sample document."}</p>}
                <div className="row g8 wrapx">
                  <button className="btn btn-p" type="button" disabled={busy || !can("reviewDocs")} onClick={() => run("Document approved", () => reviewDocument(c.ref, review.id, "approve"))}><Icon name="check" size={18} /> Approve</button>
                  <button className="btn btn-danger" type="button" disabled={!can("reviewDocs")} onClick={() => setRejecting(!rejecting)} aria-expanded={rejecting}>Reject with reason</button>
                </div>
                {rejecting && (
                  <div className="stack g8">
                    <label htmlFor="rj">Reason the customer will see</label>
                    <textarea id="rj" className="in" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The ID number is not readable. Please retake in daylight without flash." />
                    <button type="button" className="btn btn-danger btn-sm" style={{ alignSelf: "flex-start" }} disabled={!reason.trim() || busy} onClick={() => run("Customer notified with your reason", () => reviewDocument(c.ref, review.id, "reject", reason), () => { setRejecting(false); setReason(""); })}>Send rejection</button>
                  </div>
                )}
                <span className="hint">Rejecting puts the case on hold and sends your reason to the customer in plain words.</span>
              </section>
            )}

            <section id="ask" className="card" aria-labelledby="ask-h">
              <div className="card-head"><h2 id="ask-h" className="d" style={{ fontSize: 17 }}>Messages with {first}</h2><span className="mut" style={{ fontSize: 13 }}>Portal + email</span></div>
              <div className="stack g14" style={{ padding: 18 }} aria-live="polite">
                {c.messages.length === 0 && <p className="hint">No messages yet.</p>}
                {c.messages.map((m) => {
                  const staff = m.by !== "customer";
                  return (
                    <div key={m.id} className="row g10" style={{ alignItems: "flex-start", flexDirection: staff ? "row-reverse" : "row" }}>
                      <span className="av" style={{ width: 28, height: 28, fontSize: 11, background: staff ? "var(--ink)" : undefined, color: staff ? "#fff" : undefined }}>{initials(m.name ?? "")}</span>
                      <div className="stack g4" style={{ maxWidth: "82%", alignItems: staff ? "flex-end" : "flex-start" }}>
                        <span className="mut" style={{ fontSize: 12 }}><strong style={{ color: "var(--ink)" }}>{m.by === me.id ? "You" : m.name}</strong> · {fmtWhen(m.at, now)}</span>
                        <p className={`bubble ${staff ? "bubble-me" : ""}`}>{m.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!finished && (
                <div className="stack g10" style={{ padding: "14px 18px", borderTop: "1px solid var(--line)" }}>
                  {quick.length > 0 && <div className="row g8 wrapx" role="group" aria-label="Quick requests">{quick.map((qk) => <button key={qk} type="button" className="chip chip-sm" onClick={() => setMsg(`Mwiriwe ${first}, could you send the ${qk.toLowerCase()}? Clear photos from your phone are fine.`)}>{qk}</button>)}</div>}
                  <label htmlFor="mi" className="sr-only">Message to customer</label>
                  <textarea id="mi" className="in" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write in plain words. Shown in their portal; “Send and wait” also texts them." />
                  <div className="row g8 wrapx" style={{ justifyContent: "flex-end" }}>
                    <button className="btn btn-s btn-sm" type="button" disabled={!msg.trim() || busy} onClick={() => run("Message sent", () => messageCustomer(c.ref, msg, false), () => setMsg(""))}><Icon name="send" size={16} /> Send</button>
                    <button className="btn btn-d btn-sm" type="button" disabled={!msg.trim() || busy} onClick={() => run("Sent · case is now waiting on the customer", () => messageCustomer(c.ref, msg, true), () => setMsg(""))}>Send and wait on customer</button>
                  </div>
                  <span className="hint">“Send and wait” puts the case on hold until the customer replies, and shows them what is needed.</span>
                </div>
              )}
            </section>

            <section className="card" aria-label="Notes and activity">
              <div className="row g6 wrapx" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }} role="tablist" aria-label="Notes and activity">
                <button type="button" role="tab" id="tab-notes" aria-controls="panel-na" aria-selected={tab === "notes"} className={`chip chip-sm ${tab === "notes" ? "chip-on" : ""}`} onClick={() => setTab("notes")}>Internal notes · {c.notes.length}</button>
                <button type="button" role="tab" id="tab-activity" aria-controls="panel-na" aria-selected={tab === "activity"} className={`chip chip-sm ${tab === "activity" ? "chip-on" : ""}`} onClick={() => setTab("activity")}>Activity · {c.events.length}</button>
              </div>
              <div id="panel-na" role="tabpanel" aria-labelledby={`tab-${tab}`}>
                {tab === "notes" ? (
                  <>
                    <div className="stack g16" style={{ padding: 18 }}>
                      {c.notes.length === 0 && <p className="hint">No internal notes yet.</p>}
                      {c.notes.map((n) => (
                        <div key={n.id} className="row g10" style={{ alignItems: "flex-start" }}><span className="av" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(n.name ?? "")}</span><div className="stack" style={{ gap: 3 }}><span className="mut" style={{ fontSize: 12 }}><strong style={{ color: "var(--ink)" }}>{shortName(n.name ?? "")}</strong> · {fmtWhen(n.at, now)} · internal</span><p style={{ fontSize: 14, lineHeight: 1.5 }}>{n.body}</p></div></div>
                      ))}
                    </div>
                    <form className="stack g10" style={{ padding: "14px 18px", borderTop: "1px solid var(--line)" }} onSubmit={(e) => { e.preventDefault(); if (note.trim()) run("Note saved", () => addNote(c.ref, note), () => setNote("")); }}>
                      <label htmlFor="nt">Add internal note <span className="mut" style={{ fontWeight: 400 }}>— never visible to the customer</span></label>
                      <textarea id="nt" className="in" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the institution’s desk, expected tomorrow" />
                      <div className="row g8" style={{ justifyContent: "flex-end" }}><button className="btn btn-d btn-sm" type="submit" disabled={busy || !note.trim()}>Save note</button></div>
                    </form>
                  </>
                ) : (
                  <div style={{ padding: 18 }}>
                    <TimelineV events={c.events.map((e, i) => ({ state: i === 0 && !finished ? "cur" : "done", title: e.title, body: e.body, meta: [fmtWhen(e.at, now), e.by === "system" ? "" : e.by === "customer" ? e.name : shortName(e.name ?? "")].filter(Boolean).join(" · ") }))} />
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="stack g16">
            <section className="card stack g14" style={{ padding: 18 }} aria-labelledby="st-h">
              <h2 id="st-h" className="d" style={{ fontSize: 17 }}>Status</h2>
              {hold && !finished && (
                <Alert kind="act" title={hold.returned ? "Returned · waiting on customer" : "Waiting on customer"} action={<button type="button" className="btn btn-s btn-sm" disabled={busy || !can("updateStatus")} onClick={() => run("Hold cleared · case is moving again", () => clearHold(c.ref))}>Clear hold</button>}>
                  {hold.title} — since {fmtWhen(hold.since, now)}.
                </Alert>
              )}
              <div className="field"><label htmlFor="st">Stage</label><select id="st" className="in" value={pending} disabled={finished || !can("updateStatus")} onChange={(e) => setPending(e.target.value as Stage)}>{c.flow.map((s) => <option key={s} value={s}>{stageLabel(c, s)}</option>)}</select>
                <span className="hint">A stage says who has the work. If you are waiting on the customer, keep the stage and use “Send and wait”.</span></div>
              <div className="field"><label htmlFor="sm">Message to customer <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></label><textarea id="sm" className="in" rows={2} value={statusMsg} disabled={finished} onChange={(e) => setStatusMsg(e.target.value)} placeholder="Shown on their timeline" /></div>
              <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify by email</label>
              <button className="btn btn-d" type="button" disabled={finished || pending === stage || busy || !can("updateStatus")} onClick={() => run(notify ? "Stage updated · customer notified" : "Stage updated", () => setStage(c.ref, pending, statusMsg, notify), () => setStatusMsg(""))}>Update stage</button>
              {nope("updateStatus")}
            </section>

            {c.flow.includes("institution") && (
              <section className="card stack g12" style={{ padding: 18 }} aria-labelledby="sub-h">
                <h2 id="sub-h" className="d" style={{ fontSize: 17 }}>Official submission</h2>
                <div className="field"><label htmlFor="ch">Channel</label><select id="ch" className="in" value={channel} disabled={finished} onChange={(e) => setChannel(e.target.value)}>{[c.channel, ...CHANNELS].filter((v, i, a) => a.indexOf(v) === i).map((o) => <option key={o}>{o}</option>)}</select></div>
                <div className="field"><label htmlFor="rf">Official reference / application no.</label><input id="rf" className="in m" style={{ fontSize: 15 }} value={officialRef} disabled={finished} onChange={(e) => setOfficialRef(e.target.value)} placeholder="Added after submission" /></div>
                <div className="grid m-cols-2" style={{ gap: 8, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                  <button className="btn btn-s btn-sm" type="button" disabled={finished || !officialRef.trim() || busy || !can("updateStatus")} onClick={() => run(stage === "institution" ? "Marked as resubmitted" : "Marked as submitted", () => markSubmitted(c.ref, channel, officialRef))}>{stage === "institution" ? "Mark resubmitted" : "Mark submitted"}</button>
                  <button className="btn btn-s btn-sm" type="button" disabled={finished || busy} onClick={() => run("Follow-up set for tomorrow 10:00", () => scheduleFollowUp(c.ref, `Follow up on ${c.ref}`))}><Icon name="calendar" size={16} /> Follow-up</button>
                </div>
                {c.followUp && <span className="hint">Follow-up: {fmtWhen(c.followUp.at, now)} · {c.followUp.what}</span>}
              </section>
            )}

            <section className="card stack g14" style={{ padding: 18 }} aria-labelledby="fee-h">
              <div className="row between g8"><h2 id="fee-h" className="d" style={{ fontSize: 17 }}>Fees &amp; payment</h2><PayBadge s={payStatus(billing, now)} /></div>
              {mode ? (
                <div className="row between g12" style={{ fontSize: 14.5 }}><span className="row g8"><FeeTag kind="official" /> Official fee</span><strong>{mode === "none" ? "None" : "Paid by the customer"}</strong></div>
              ) : (
                <div className="field"><label htmlFor="of" className="row g8"><FeeTag kind="official" /> Official government fee (RWF)</label>
                  <input id="of" className="in" inputMode="numeric" value={official} disabled={finished || !can("recordOfficial")} onChange={(e) => setOfficial(e.target.value.replace(/\D/g, ""))} placeholder={c.service.official.label ?? "Amount for this case"} />
                  <span className="hint">Record exactly what the institution charges for this case.</span></div>
              )}
              {!mode && (
                <div className="row between g8 wrapx" style={{ fontSize: 14 }}>
                  <span className="mut">Official receipt: <strong style={{ color: "var(--ink)" }}>{c.billing.officialReceipt === "attached" ? "attached" : "not attached yet"}</strong></span>
                  {can("recordOfficial") && <label className="btn btn-s btn-sm" style={{ cursor: "pointer" }}><Icon name="clip" size={16} /> {c.billing.officialReceipt === "attached" ? "Replace receipt" : "Attach receipt"}<input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { upload("receipt", e.target.files?.[0], {}, "Official receipt attached"); e.target.value = ""; }} /></label>}
                </div>
              )}
              {mode === "direct" && <span className="hint">The customer pays the institution directly. Tell them the exact amount and how to pay it.</span>}
              <div className="field"><label htmlFor="sf" className="row g8"><FeeTag kind="ours" /> Service / assistance fee (RWF)</label><input id="sf" className="in" inputMode="numeric" value={ours} disabled={finished || !can("recordOfficial")} onChange={(e) => setOurs(e.target.value.replace(/\D/g, ""))} /><span className="hint">Price list: {rwf(c.billing.oursStandard)}{c.billing.oursUnit ? ` ${c.billing.oursUnit}` : ""}{c.billing.ours !== c.billing.oursStandard ? ` · this case: ${rwf(c.billing.ours)}` : ""}.</span></div>
              {oursChanged && <Alert kind="warn" title={can("changeOurs") ? "You are changing our fee" : "Needs a supervisor"}>{can("changeOurs") ? "The change is written to the audit log." : "Only a supervisor can change our fee on a case. Ask one, or put the price-list fee back."}</Alert>}
              <div className="total-row"><strong>Customer total</strong><strong>{officialValue === null ? `${rwf(oursValue)}${mode ? "" : " + official"}` : rwf(officialValue + oursValue)}</strong></div>
              {feesDirty && <button className="btn btn-s" type="button" disabled={busy || (oursChanged && !can("changeOurs"))} onClick={() => run("Fees saved", () => saveFees(c.ref, officialValue, oursValue))}>Save fees</button>}
              {c.billing.quote === "estimate"
                ? <><button className="btn btn-d" type="button" disabled={finished || busy || !can("recordOfficial") || (!mode && officialValue === null) || (oursChanged && !can("changeOurs"))} onClick={() => run("Fees sent · customer can approve and pay", async () => { if (feesDirty) { const a = await saveFees(c.ref, officialValue, oursValue); if (!a.ok) return a; } return sendQuote(c.ref); })}>Send fees to customer</button>
                    <span className="hint">{!mode && officialValue === null ? "Enter the official fee for this case first." : "The customer sees both lines and approves before paying."}</span></>
                : <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name={c.billing.quote === "approved" ? "check" : "clock"} size={16} color={c.billing.quote === "approved" ? "var(--ok)" : undefined} /><span>{c.billing.quote === "approved" ? "Fees approved by the customer." : "Fees sent. Waiting for the customer to approve and pay."}</span></p>}
            </section>

            <section className="card stack g12" style={{ padding: 18 }} aria-labelledby="out-h">
              <h2 id="out-h" className="d" style={{ fontSize: 17 }}>Documents for the customer</h2>
              {c.deliverables.length === 0 && <p className="hint">The final document from the institution goes here. The customer gets an email and downloads it from their portal.</p>}
              {c.deliverables.map((o) => (
                <div key={o.id} className="row between g8" style={{ fontSize: 14 }}>
                  <span className="stack" style={{ gap: 2 }}><strong>{o.name}</strong><span className="mut" style={{ fontSize: 12.5 }}>{fmtWhen(o.issuedAt, now)} · {o.issuedBy}</span></span>
                  {o.fileId ? <a className="btn btn-s btn-sm btn-ico" href={`/files/${o.fileId}`} target="_blank" rel="noopener" aria-label={`Open ${o.name}`}><Icon name="download" size={16} /></a> : <span className="hint">No file</span>}
                </div>
              ))}
              {can("complete") && !closed && (
                <div className="stack g8" style={{ paddingTop: 6, borderTop: c.deliverables.length ? "1px solid var(--line-2)" : undefined }}>
                  <label htmlFor="dn">Name the customer will see</label>
                  <input id="dn" className="in" style={{ height: 40 }} value={deliverableName} onChange={(e) => setDeliverableName(e.target.value)} placeholder={`e.g. ${c.service.name} — ${c.profile.name}`} />
                  <label className="btn btn-d btn-sm" style={{ alignSelf: "flex-start", cursor: "pointer" }}><Icon name="upload" size={16} /> Upload and deliver<input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { upload("deliverable", e.target.files?.[0], { name: deliverableName || `${c.service.name} — ${c.profile.name}` }, "Delivered · customer notified"); setDeliverableName(""); e.target.value = ""; }} /></label>
                </div>
              )}
            </section>

            {!finished && can("complete") && (
              <details className="card" style={{ padding: 18 }}>
                <summary className="row between g8"><strong style={{ fontSize: 15 }}>Close without completing</strong><span className="chev"><Icon name="down" size={18} /></span></summary>
                <div className="stack g12" style={{ paddingTop: 14 }}>
                  <div className="field"><label htmlFor="ck">How did it end?</label><select id="ck" className="in" value={closeKind} onChange={(e) => setCloseKind(e.target.value as Closed["kind"])}><option value="cancelled">Cancelled (customer or Inzira)</option><option value="rejected">Rejected by the institution</option></select></div>
                  <div className="field"><label htmlFor="cr">Reason the customer will see</label><textarea id="cr" className="in" rows={2} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} /></div>
                  <button type="button" className="btn btn-danger btn-sm" style={{ alignSelf: "flex-start" }} disabled={!closeReason.trim() || busy} onClick={() => run("Case closed · customer notified", () => closeCase(c.ref, closeKind, closeReason), () => setCloseReason(""))}>Close case</button>
                  <span className="hint">Refunds are issued by Finance from Admin › Payments.</span>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
