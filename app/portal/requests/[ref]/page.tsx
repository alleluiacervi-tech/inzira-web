import Link from "next/link";
import { notFound } from "next/navigation";
import { DocBadge, DocCard, Icon, RequestBadge, StageTimeline, TimelineV } from "@/components/ui";
import { CancelRequest, Messages, PaymentPanel } from "@/components/RequestSide";
import { fmtDate, fmtDay, fmtWhen, initials, shortName } from "@/lib/format";
import { getMyRequest, getNow } from "@/lib/repo";
import { whatsappUrl } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const r = await getMyRequest((await params).ref);
  return { title: r ? `${r.name} · ${r.ref}` : "Request" };
}

const HOLD_ACTION = {
  document: { href: "/portal/documents", icon: "upload", label: "Upload the document" },
  information: { href: "#messages", icon: "msg", label: "Reply to your agent" },
  payment: { href: "#payments", icon: "card", label: "Go to payment" },
};

export default async function RequestPage({ params }: { params: Promise<{ ref: string }> }) {
  const [r, now] = await Promise.all([getMyRequest((await params).ref), getNow()]);
  if (!r) notFound();
  const act = !!r.hold && !r.closed;
  const banner = r.closed ? { title: r.summary.title, body: r.closed.reason } : r.hold ? { title: r.hold.title, body: r.hold.detail } : r.summary;
  const action = act ? HOLD_ACTION[r.hold!.reason] : null;
  const agent = r.agent?.name ?? "Inzira";

  return (
    <>
      <div className="stack g18 page-band">
        <nav aria-label="Breadcrumb" className="mut row g8 wrapx" style={{ fontSize: 13.5 }}>
          <Link href="/portal/requests">My requests</Link><span>/</span><span className="m">{r.ref}</span>
        </nav>
        <div className="row between g24 m-col" style={{ alignItems: "flex-start" }}>
          <div className="stack g8">
            <div className="row g10 wrapx"><RequestBadge r={r} viewer="customer" /><span className="tag">via {r.channel}</span><span className="tag">For {r.profile.name}</span></div>
            <h1 className="d" style={{ fontSize: "clamp(24px, 3vw, 34px)" }}>{r.name}</h1>
            <div className="row wrapx mut" style={{ fontSize: 14, gap: "4px 24px" }}>
              <span>Our reference <strong className="m" style={{ color: "var(--ink)" }}>{r.ref}</strong></span>
              {r.officialRef && <span>Official application no. <strong className="m" style={{ color: "var(--ink)" }}>{r.officialRef}</strong></span>}
              <span>Opened {fmtDate(r.openedAt)}</span>
            </div>
          </div>
          <a className="btn btn-s" href="#messages"><Icon name="msg" size={18} /> Message agent</a>
        </div>
        <div style={{ paddingTop: 8 }}><StageTimeline r={r} viewer="customer" /></div>
      </div>
      <div className="content">
        <div className="split">
          <div className="stack g20">
            <div className={`card row g16 banner ${act ? "banner-act" : ""}`}>
              <span className="ico-tile"><Icon name={act ? "alert" : r.closed ? "info" : r.stage === "completed" ? "check" : "send"} size={22} /></span>
              <div className="stack g6 grow">
                <strong style={{ fontSize: 17 }}>{banner.title}</strong>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{banner.body}</p>
                {r.dependsOn && !r.closed && <Link className="lnk" href={`/portal/requests/${r.dependsOn}`} style={{ fontSize: 14 }}>See {r.dependsOn} →</Link>}
                {action && <Link className="btn btn-p" href={action.href} style={{ alignSelf: "flex-start", marginTop: 6 }}><Icon name={action.icon} size={18} /> {action.label}</Link>}
              </div>
            </div>
            <section className="card" aria-labelledby="docs-h">
              <div className="card-head"><h2 id="docs-h" className="d" style={{ fontSize: 18 }}>Documents</h2>{!r.closed && <Link className="btn btn-s btn-sm" href="/portal/documents"><Icon name="upload" size={16} /> Upload</Link>}</div>
              <div className="stack g18" style={{ padding: "16px 20px" }}>
                <div className="stack g10"><span className="eb" style={{ fontSize: 11 }}>Required for this service</span>
                  {r.documents.map((d) => (
                    <DocCard key={d.id} compact name={d.name} badge={<DocBadge s={d.status} />}
                      meta={d.status === "rejected" || d.status === "required" ? d.note ?? (d.required ? "Needed before we can submit" : "Only if it applies to you") : `${d.file?.name ?? ""}${d.reviewedAt ? ` · checked ${fmtDay(d.reviewedAt)}` : " · awaiting review"}`}
                      action={!r.closed && (d.status === "rejected" || d.status === "required") ? <Link className={`btn btn-sm ${d.status === "rejected" ? "btn-p" : "btn-s"}`} href="/portal/documents" aria-label={`${d.status === "rejected" ? "Replace" : "Upload"} ${d.name}`}>{d.status === "rejected" ? "Replace" : "Upload"}</Link> : undefined} />
                  ))}
                </div>
                <div className="stack g10"><span className="eb" style={{ fontSize: 11 }}>Completed documents</span>
                  {r.deliverables.map((d) => <DocCard key={d.id} compact name={d.name} meta={`Issued by ${d.issuedBy} · ${fmtDay(d.issuedAt)}`} badge={<DocBadge s="issued" />} action={d.fileId ? <a className="btn btn-s btn-sm" href={`/files/${d.fileId}`} target="_blank" rel="noopener" aria-label={`Download ${d.name}`}><Icon name="download" size={16} /> Download</a> : <span className="hint">Ask your agent for a copy</span>} />)}
                  {r.stage !== "completed" && !r.closed && <div className="row g12 mut" style={{ padding: "14px 16px", border: "1px dashed var(--line-3)", borderRadius: 8 }}><Icon name="clock" size={18} /><span style={{ fontSize: 14 }}>Your final document will appear here when the institution issues it.</span></div>}
                </div>
              </div>
            </section>
            <Messages reqRef={r.ref} initial={r.messages} agent={agent.split(" ")[0]} now={now} />
          </div>
          <div className="stack g16">
            <div className="card row g14" style={{ padding: 18 }}>
              <span className="av" style={{ width: 48, height: 48, fontSize: 15 }}>{initials(agent)}</span>
              <div className="stack grow" style={{ gap: 3 }}><span className="eb" style={{ fontSize: 10.5 }}>Your agent</span><strong style={{ fontSize: 16 }}>{agent}</strong><span className="mut" style={{ fontSize: 13 }}>{r.agent?.team ?? "Being assigned"} · replies in about 1 hour</span></div>
              <Link className="btn btn-s btn-ico" href={whatsappUrl(`Hello, this is about ${r.ref}.`)} aria-label={`Call or WhatsApp about ${r.ref}`}><Icon name="phone" size={19} /></Link>
            </div>
            <PaymentPanel reqRef={r.ref} billing={r.billing} now={now} phone={r.account.phone} />
            <section className="card stack g4" style={{ padding: 18 }} aria-labelledby="act-h">
              <h2 id="act-h" className="d" style={{ fontSize: 18, marginBottom: 8 }}>Activity</h2>
              <TimelineV events={r.events.map((e, i) => ({
                state: i === 0 && !r.closed && r.stage !== "completed" ? "cur" : "done", title: e.title, body: e.body,
                meta: [fmtWhen(e.at, now), e.by === "customer" ? "You" : e.by === "system" ? "" : shortName(e.name ?? "")].filter(Boolean).join(" · "),
              }))} />
            </section>
            {!r.closed && (r.stage === "received" || r.stage === "checking" || r.stage === "preparing") && !r.billing.transactions.some((t) => t.status === "paid" || t.status === "pending") && <CancelRequest reqRef={r.ref} />}
            <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} /><span>Decisions are made by the institution. Inzira prepares, submits and follows up on your behalf.</span></p>
          </div>
        </div>
      </div>
    </>
  );
}
