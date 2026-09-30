import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DocCard, FeeLines, Icon, TimelineH, TimelineV } from "@/components/ui";
import { Messages, PayButton } from "@/components/RequestSide";
import { REQUESTS, requestByRef } from "@/lib/data";

export function generateStaticParams() {
  return REQUESTS.map((r) => ({ ref: r.ref }));
}
export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const r = requestByRef((await params).ref);
  return { title: r ? `${r.service} · ${r.ref}` : "Request" };
}

export default async function RequestPage({ params }: { params: Promise<{ ref: string }> }) {
  const r = requestByRef((await params).ref);
  if (!r) notFound();
  return (
    <>
      <div className="stack g18 page-band">
        <nav aria-label="Breadcrumb" className="mut row g8 wrapx" style={{ fontSize: 13.5 }}>
          <Link href="/portal">My requests</Link><span>/</span><span className="m">{r.ref}</span>
          <span className="m-hide" style={{ marginLeft: 16 }}>Other requests:</span>
          {REQUESTS.filter((x) => x.ref !== r.ref).map((x) => <Link key={x.ref} className="m-hide" href={`/portal/requests/${x.ref}`}>{x.service}</Link>)}
        </nav>
        <div className="row between g24 m-col" style={{ alignItems: "flex-start" }}>
          <div className="stack g8">
            <div className="row g10 wrapx"><Badge k={r.status} /><span className="tag">{r.forWho.split("· ")[1]}</span></div>
            <h1 className="d" style={{ fontSize: "clamp(24px, 3vw, 34px)" }}>{r.service}</h1>
            <div className="row g24 wrapx mut" style={{ fontSize: 14 }}>
              <span>Our reference <strong className="m" style={{ color: "var(--ink)" }}>{r.ref}</strong></span>
              {r.officialRef && <span>Official application no. <strong className="m" style={{ color: "var(--ink)" }}>{r.officialRef}</strong></span>}
              <span>Opened {r.opened}</span>
            </div>
          </div>
          <a className="btn btn-s" href="#messages"><Icon name="msg" size={18} /> Message agent</a>
        </div>
        <div style={{ paddingTop: 8 }}><TimelineH current={r.stage} dates={r.stepDates} skipped={r.skipped} /></div>
      </div>
      <div className="content">
        <div className="split">
          <div className="stack g20">
            <div className="card row g16" style={{ padding: 20, alignItems: "flex-start", background: r.yourAction ? "var(--ember-tint)" : undefined, borderColor: r.yourAction ? "#F3CDB6" : undefined }}>
              <span className="ico-tile" style={{ background: r.yourAction ? "#fff" : "var(--info-bg)", color: r.yourAction ? "var(--ember-deep)" : "var(--info)" }}><Icon name={r.yourAction ? "alert" : "send"} size={22} /></span>
              <div className="stack g6 grow">
                <strong style={{ fontSize: 17, color: r.yourAction ? "var(--ember-deep)" : undefined }}>{r.banner.title}</strong>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{r.banner.body}</p>
                {r.yourAction && <Link className="btn btn-p" href="/portal/documents" style={{ alignSelf: "flex-start", marginTop: 6 }}><Icon name="upload" size={18} /> Upload ID photo</Link>}
              </div>
            </div>
            <section className="card" aria-labelledby="docs-h">
              <div className="card-head"><h2 id="docs-h" className="d" style={{ fontSize: 18 }}>Documents</h2><Link className="btn btn-s btn-sm" href="/portal/documents"><Icon name="upload" size={16} /> Upload</Link></div>
              <div className="stack g18" style={{ padding: "16px 20px" }}>
                <div className="stack g10"><span className="eb" style={{ fontSize: 11 }}>Required for this service</span>
                  {r.docs.map((d) => <DocCard key={d.name} compact {...d} action={d.status === "rej" || d.status === "req" ? <Link className="btn btn-p btn-sm" href="/portal/documents">{d.status === "rej" ? "Replace" : "Upload"}</Link> : undefined} />)}
                </div>
                <div className="stack g10"><span className="eb" style={{ fontSize: 11 }}>Completed documents</span>
                  {r.completed.map((d) => <DocCard key={d.name} compact {...d} action={<button className="btn btn-s btn-sm" type="button"><Icon name="download" size={16} /> Download</button>} />)}
                  <div className="row g12 mut" style={{ padding: "14px 16px", border: "1px dashed #CFC9BD", borderRadius: 8 }}><Icon name="clock" size={18} /><span style={{ fontSize: 14 }}>Your final document will appear here when the institution issues it.</span></div>
                </div>
              </div>
            </section>
            <Messages r={r} />
          </div>
          <div className="stack g16">
            <div className="card row g14" style={{ padding: 18 }}>
              <span className="av" style={{ width: 48, height: 48, fontSize: 15 }}>{r.agentInitials}</span>
              <div className="stack grow" style={{ gap: 3 }}><span className="eb" style={{ fontSize: 10.5 }}>Your agent</span><strong style={{ fontSize: 16 }}>{r.agent}</strong><span className="mut" style={{ fontSize: 13 }}>Replies in about 1 hour</span></div>
              <a className="btn btn-s btn-ico" href="tel:+250700000000" aria-label={`Call ${r.agent}`}><Icon name="phone" size={19} /></a>
            </div>
            <section className="card stack g14" style={{ padding: 18 }} aria-labelledby="pay-h">
              <div className="row between"><h2 id="pay-h" className="d" style={{ fontSize: 18 }}>Payments</h2><Badge k={r.payment.status} /></div>
              <FeeLines officialLabel={r.payment.officialLabel} official={r.payment.official} ours={r.payment.ours} total={r.payment.total} totalLabel={r.payment.status === "paid" ? "Total paid" : "Total due"} />
              <span className="hint">{r.payment.note}</span>
              {r.payment.status !== "paid" && <PayButton r={r} />}
            </section>
            <section className="card stack g4" style={{ padding: 18 }} aria-labelledby="act-h">
              <h2 id="act-h" className="d" style={{ fontSize: 18, marginBottom: 8 }}>Activity</h2>
              <TimelineV events={r.activity} />
            </section>
            <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} /><span>Decisions are made by the institution. Inzira prepares, submits and follows up on your behalf.</span></p>
          </div>
        </div>
      </div>
    </>
  );
}
