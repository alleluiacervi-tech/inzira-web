"use client";
import Link from "next/link";
import { useState } from "react";
import { CASES, STATUS, STEPS, SERVICES, requestByRef, rwf, type StatusKey, type TimelineEvent } from "@/lib/data";
import { Alert, Badge, FeeTag, Icon, TimelineH, TimelineV, initials } from "./ui";

const STEP_KEY: StatusKey[] = ["new", "info", "rec", "prep", "sub", "proc", "act", "done"];
const QUICK = ["Clearer ID photo", "Passport photo", "Purpose letter", "Signed form"];

export default function Workspace({ caseRef }: { caseRef: string }) {
  const c = CASES.find((x) => x.ref === caseRef)!;
  const req = requestByRef(caseRef);
  const svc = SERVICES.find((s) => s.name.startsWith(c.service.split(" (")[0])) ?? SERVICES[0];
  const rich = caseRef === "INZ-2026-04817";

  const [status, setStatus] = useState<StatusKey>(c.status);
  const [pending, setPending] = useState<StatusKey>(rich ? "rec" : c.status);
  const [statusMsg, setStatusMsg] = useState("");
  const [notify, setNotify] = useState(true);
  const [docState, setDocState] = useState<"review" | "approved" | "rejected">("review");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("The ID number is still not readable. Please retake in daylight without flash.");
  const [notes, setNotes] = useState(rich ? [
    { who: "Eric N.", time: "28 Sep 15:20", body: "Submitted on Irembo, app no. 1240 8876 3321. Paid official fee from client float." },
    { who: "Eric N.", time: "Today 10:05", body: "Irembo returned: ID front unreadable. Asked customer for a new photo via WhatsApp + portal." },
  ] : [{ who: c.agent, time: c.updated, body: "Case opened from intake. Checklist loaded from the service template." }]);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"notes" | "activity">("notes");
  const [askMsg, setAskMsg] = useState("");
  const [officialRef, setOfficialRef] = useState(req?.officialRef ?? "");
  const [official, setOfficial] = useState(svc.official.amount === null ? "" : String(svc.official.amount));
  const [ours, setOurs] = useState(String(svc.ours));
  const [toast, setToast] = useState("");
  const [activity, setActivity] = useState<TimelineEvent[]>(req?.activity ?? [{ state: "cur", title: STATUS[c.status].label, meta: c.updated }]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };
  const log = (title: string, body?: string) => setActivity((a) => [{ state: "cur", title, meta: "Just now · Eric N.", body }, ...a.map((e) => ({ ...e, state: "done" as const }))]);
  const stage = STEP_KEY.indexOf(status);
  const oursChanged = Number(ours) !== svc.ours;
  const total = (Number(official) || 0) + (Number(ours) || 0);

  const checklist = rich ? [
    { name: "National ID — front", meta: docState === "approved" ? "Approved just now" : docState === "rejected" ? "Rejected — customer notified" : "Re-uploaded 11:52 · awaiting your review", status: (docState === "approved" ? "appr" : docState === "rejected" ? "rej" : "recd") as StatusKey },
    { name: "National ID — back", meta: "Approved 27 Sep", status: "appr" as StatusKey },
    { name: "Purpose", meta: "Employment in Rwanda — standard format", status: "appr" as StatusKey },
  ] : svc.documents.map((d, i) => ({ name: d.name, meta: d.detail, status: (i === 0 && c.status !== "new" ? "recd" : "req") as StatusKey }));

  return (
    <>
      <div className="page-band stack g16">
        <div className="row between g20 m-col" style={{ alignItems: "flex-start" }}>
          <div className="stack g8">
            <nav aria-label="Breadcrumb" className="mut row g8" style={{ fontSize: 13.5 }}><Link href="/agent">My cases</Link><span>/</span><span className="m">{c.ref}</span></nav>
            <div className="row g12 wrapx"><h1 className="d" style={{ fontSize: "clamp(22px, 2.6vw, 28px)" }}>{c.service}</h1><Badge k={status} /><span className="tag">{c.category}</span></div>
            <span className="mut" style={{ fontSize: 14 }}>{c.customer} · {c.type} · SLA: reply to customer uploads within 2 working hours</span>
          </div>
          <div className="row g8 wrapx">
            <a className="btn btn-s" href="#ask"><Icon name="msg" size={18} /> Message customer</a>
            <button className="btn btn-p" type="button" disabled={status === "done"} onClick={() => { setStatus("done"); setPending("done"); log("Completed", "Final documents delivered to the customer portal."); flash("Request completed · customer notified"); }}><Icon name="check" size={18} /> {status === "done" ? "Completed" : "Complete request"}</button>
          </div>
        </div>
        <TimelineH current={stage} dates={req?.stepDates ?? []} skipped={req?.skipped} />
      </div>

      <div className="content">
        {toast && <div role="status" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 90 }} className="dark row g10 shadow"><span className="row g10" style={{ padding: "12px 18px", borderRadius: 8, background: "var(--ink)", color: "#fff", fontWeight: 600, fontSize: 14 }}><Icon name="check" size={18} color="#8FD4A5" />{toast}</span></div>}
        <div className="ws">
          <div className="stack g16">
            <section className="card stack g14" style={{ padding: 18 }} aria-label="Customer">
              <div className="row g12"><span className="av" style={{ width: 44, height: 44, fontSize: 14 }}>{initials(c.customer)}</span><div className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 16 }}>{c.customer}</strong><span className="mut" style={{ fontSize: 13 }}>{c.type} · customer since Jan 2026</span></div></div>
              <dl style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr)", gap: "8px 10px", fontSize: 13.5 }}>
                <dt className="mut">Phone</dt><dd style={{ fontWeight: 600 }}>+250 788 123 456</dd>
                <dt className="mut">WhatsApp</dt><dd style={{ fontWeight: 600 }}>Same number · opted in</dd>
                <dt className="mut">National ID</dt><dd className="m">1 1995 8 •••• 0 17</dd>
                <dt className="mut">District</dt><dd style={{ fontWeight: 600 }}>Gasabo · Kacyiru</dd>
                <dt className="mut">Language</dt><dd style={{ fontWeight: 600 }}>Kinyarwanda, English</dd>
              </dl>
              <div className="row g8"><a className="btn btn-s btn-sm grow" href="tel:+250788123456"><Icon name="phone" size={16} /> Call</a><a className="btn btn-s btn-sm grow" href="https://wa.me/250788123456"><Icon name="msg" size={16} /> WhatsApp</a></div>
            </section>
            <section className="card stack g6" style={{ padding: 18 }} aria-label="Service requirements">
              <div className="row between"><h2 className="d" style={{ fontSize: 16 }}>Service requirements</h2><Link className="lnk" href={`/services/${svc.slug}`} style={{ fontSize: 13 }}>Guide</Link></div>
              {checklist.map((d) => (
                <div key={d.name} className="row g12" style={{ padding: "10px 0", borderBottom: "1px solid var(--line-2)" }}>
                  <Icon name={d.status === "appr" ? "check" : "alert"} size={18} color={d.status === "appr" ? "#1E6B3A" : "#A33C0C"} />
                  <div className="stack grow" style={{ gap: 2 }}><strong style={{ fontSize: 14 }}>{d.name}</strong><span className="mut" style={{ fontSize: 12.5 }}>{d.meta}</span></div>
                  <Badge k={d.status} />
                </div>
              ))}
              <p className="hint" style={{ paddingTop: 8 }}>Checklist comes from the service template in Admin › Services.</p>
            </section>
          </div>

          <div className="stack g16">
            {rich && (
              <section className="card stack g14" style={{ padding: 18 }} aria-labelledby="rv-h">
                <div className="row between g8 wrapx"><h2 id="rv-h" className="d" style={{ fontSize: 17 }}>Review uploaded document</h2><span className="mut" style={{ fontSize: 13 }}>id_front_new.jpg · 2.5 MB</span></div>
                <div style={{ height: 240, borderRadius: 6, background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <div className="row g16" style={{ width: "min(340px, 80%)", height: 200, background: "#fff", border: "1px solid #D3CDC1", borderRadius: 10, padding: 18, alignItems: "flex-start" }}>
                    <span style={{ width: 80, height: 100, borderRadius: 6, background: "var(--line)", flexShrink: 0 }} />
                    <div className="stack g10 grow" style={{ paddingTop: 6 }}>{[80, 60, 70, 50].map((w) => <span key={w} style={{ height: 10, width: `${w}%`, background: "#D3CDC1", borderRadius: 2 }} />)}</div>
                  </div>
                  <span className="tag" style={{ position: "absolute", left: 12, top: 12, background: "#fff" }}>Document preview</span>
                </div>
                {docState === "review" ? (
                  <div className="row g8 wrapx">
                    <button className="btn btn-p" type="button" onClick={() => { setDocState("approved"); setPending("prep"); log("Document approved", "National ID — front"); flash("Document approved"); }}><Icon name="check" size={18} /> Approve</button>
                    <button className="btn btn-danger" type="button" onClick={() => setRejectOpen(!rejectOpen)} aria-expanded={rejectOpen}>Reject with reason</button>
                  </div>
                ) : (
                  <Alert kind={docState === "approved" ? "ok" : "err"} title={docState === "approved" ? "Approved — ready to resubmit via Irembo" : "Rejected — customer asked for a new photo"} action={<button type="button" className="btn btn-s btn-sm" onClick={() => setDocState("review")}>Undo</button>} />
                )}
                {rejectOpen && docState === "review" && (
                  <div className="stack g8">
                    <label htmlFor="rj">Reason the customer will see</label>
                    <textarea id="rj" className="in" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <button type="button" className="btn btn-danger btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => { setDocState("rejected"); setRejectOpen(false); setStatus("act"); log("Document rejected", reason); flash("Customer notified with your reason"); }}>Send rejection</button>
                  </div>
                )}
                <span className="hint">The customer sees your rejection reason in plain words.</span>
              </section>
            )}

            <section className="card" aria-label="Notes and activity">
              <div className="row g6 wrapx" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }} role="tablist">
                <button type="button" role="tab" aria-selected={tab === "notes"} className={`chip chip-sm ${tab === "notes" ? "chip-on" : ""}`} onClick={() => setTab("notes")}>Internal notes · {notes.length}</button>
                <button type="button" role="tab" aria-selected={tab === "activity"} className={`chip chip-sm ${tab === "activity" ? "chip-on" : ""}`} onClick={() => setTab("activity")}>Activity · {activity.length}</button>
              </div>
              {tab === "notes" ? (
                <>
                  <div className="stack g16" style={{ padding: 18 }}>
                    {notes.map((n, i) => (
                      <div key={i} className="row g10" style={{ alignItems: "flex-start" }}><span className="av" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(n.who)}</span><div className="stack" style={{ gap: 3 }}><span className="mut" style={{ fontSize: 12 }}><strong style={{ color: "var(--ink)" }}>{n.who}</strong> · {n.time} · internal</span><p style={{ fontSize: 14, lineHeight: 1.5 }}>{n.body}</p></div></div>
                    ))}
                  </div>
                  <form className="stack g10" style={{ padding: "14px 18px", borderTop: "1px solid var(--line)" }} onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; setNotes([...notes, { who: "Eric N.", time: "Just now", body: note.trim() }]); setNote(""); }}>
                    <label htmlFor="nt">Add internal note <span className="mut" style={{ fontWeight: 400 }}>— never visible to the customer</span></label>
                    <textarea id="nt" className="in" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the institution’s desk, expected tomorrow" />
                    <div className="row between g8"><label className="check"><input type="checkbox" /> Set follow-up reminder</label><button className="btn btn-d btn-sm" type="submit">Save note</button></div>
                  </form>
                </>
              ) : <div style={{ padding: 18 }}><TimelineV events={activity} /></div>}
            </section>

            <section id="ask" className="card stack g12" style={{ padding: 18 }} aria-labelledby="ask-h">
              <h2 id="ask-h" className="d" style={{ fontSize: 17 }}>Request missing information</h2>
              <div className="row g8 wrapx">{QUICK.map((qk) => <button key={qk} type="button" className="chip chip-sm" onClick={() => setAskMsg(`Mwiriwe ${c.customer.split(" ")[0]}, could you send a ${qk.toLowerCase()}? ${qk === "Clearer ID photo" ? "Please retake it in daylight so the number is readable." : ""}`.trim())}>{qk}</button>)}</div>
              <label htmlFor="mi" className="sr-only">Message to customer</label>
              <textarea id="mi" className="in" rows={3} value={askMsg} onChange={(e) => setAskMsg(e.target.value)} placeholder="Write in plain words. Sent via portal + WhatsApp." />
              <div className="row between g8 wrapx"><span className="hint">Sets status to Information required</span><button className="btn btn-s btn-sm" type="button" disabled={!askMsg.trim()} onClick={() => { setStatus("info"); setPending("info"); log("Information requested", askMsg); setAskMsg(""); flash("Request sent to customer"); }}><Icon name="send" size={16} /> Send request</button></div>
            </section>
          </div>

          <div className="stack g16">
            <section className="card stack g14" style={{ padding: 18 }} aria-labelledby="st-h">
              <h2 id="st-h" className="d" style={{ fontSize: 17 }}>Update status</h2>
              <div className="field"><label htmlFor="st">New status</label><select id="st" className="in" value={pending} onChange={(e) => setPending(e.target.value as StatusKey)}>{STEP_KEY.map((k, i) => <option key={k} value={k}>{STEPS[i]}</option>)}</select></div>
              <div className="field"><label htmlFor="sm">Message to customer <span className="mut" style={{ fontWeight: 400 }}>(optional)</span></label><textarea id="sm" className="in" rows={2} value={statusMsg} onChange={(e) => setStatusMsg(e.target.value)} placeholder="Shown on their timeline" /></div>
              <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify by SMS &amp; WhatsApp</label>
              <button className="btn btn-d" type="button" disabled={pending === status} onClick={() => { setStatus(pending); log(`Status → ${STATUS[pending].label}`, statusMsg || undefined); setStatusMsg(""); flash(notify ? "Status updated · customer notified" : "Status updated"); }}>Update status</button>
            </section>
            <section className="card stack g12" style={{ padding: 18 }} aria-labelledby="sub-h">
              <h2 id="sub-h" className="d" style={{ fontSize: 17 }}>Official submission</h2>
              <div className="field"><label htmlFor="ch">Channel</label><select id="ch" className="in" defaultValue={svc.channel}>{[svc.channel, "Irembo", "RRA e-Tax", "RDB online", "Judiciary case system", "In person"].filter((v, i, a) => a.indexOf(v) === i).map((o) => <option key={o}>{o}</option>)}</select></div>
              <div className="field"><label htmlFor="rf">Official reference / application no.</label><input id="rf" className="in m" style={{ fontSize: 15 }} value={officialRef} onChange={(e) => setOfficialRef(e.target.value)} placeholder="Added after submission" /></div>
              <div className="grid cols-2" style={{ gap: 8 }}>
                <button className="btn btn-s btn-sm" type="button" disabled={!officialRef} onClick={() => { setStatus("sub"); setPending("sub"); log("Submitted", `Official ref ${officialRef}`); flash("Marked as submitted"); }}>Mark submitted</button>
                <button className="btn btn-s btn-sm" type="button" onClick={() => { log("Follow-up scheduled", "Tomorrow 10:00"); flash("Follow-up set for tomorrow 10:00"); }}><Icon name="calendar" size={16} /> Follow-up</button>
              </div>
            </section>
            <section className="card stack g14" style={{ padding: 18 }} aria-labelledby="fee-h">
              <div className="row between"><h2 id="fee-h" className="d" style={{ fontSize: 17 }}>Fees &amp; payment</h2><Badge k={c.payment} /></div>
              <div className="field"><label htmlFor="of" className="row g8"><FeeTag kind="official" /> Official government fee (RWF)</label><input id="of" className="in" inputMode="numeric" value={official} onChange={(e) => setOfficial(e.target.value.replace(/\D/g, ""))} placeholder={svc.official.label ?? "0"} /><span className="hint">Record exactly what the institution charged. Attach the official receipt.</span></div>
              <label className="btn btn-s btn-sm" style={{ alignSelf: "flex-start", cursor: "pointer" }}><Icon name="clip" size={16} /> Attach official receipt<input type="file" className="sr-only" /></label>
              <div className="field"><label htmlFor="sf" className="row g8"><FeeTag kind="ours" /> Service / assistance fee (RWF)</label><input id="sf" className="in" inputMode="numeric" value={ours} onChange={(e) => setOurs(e.target.value.replace(/\D/g, ""))} /><span className="hint">From the service template ({rwf(svc.ours)}).</span></div>
              {oursChanged && <Alert kind="warn" title="Needs supervisor approval">Changing our fee on a case is logged and sent to a supervisor before the customer sees it.</Alert>}
              <div className="total-row"><strong>Customer total</strong><strong>{official === "" ? `${rwf(Number(ours) || 0)} + official` : rwf(total)}</strong></div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
