import Link from "next/link";
import { notFound } from "next/navigation";
import { DocBadge, DocCard, Icon, RequestBadge, StageTimeline, TimelineV } from "@/components/ui";
import { CancelRequest, Messages, PaymentPanel } from "@/components/RequestSide";
import { fmtDate, fmtDay, fmtWhen, initials, shortName } from "@/lib/format";
import { text } from "@/lib/i18n/messages";
import { displayDocName, requestChannel, requestTitle, teamName } from "@/lib/i18n/present";
import { getMyRequest, getNow, getPortalLocale } from "@/lib/repo";
import { whatsappUrl } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const r = await getMyRequest((await params).ref);
  const locale = await getPortalLocale();
  return { title: r ? `${requestTitle(r.name, r.service, locale)} · ${r.ref}` : text(locale, "request.missing") };
}

export default async function RequestPage({ params }: { params: Promise<{ ref: string }> }) {
  const locale = await getPortalLocale();
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const holdAction = {
    document: { href: "/portal/documents", icon: "upload", label: t("request.uploadDoc") },
    information: { href: "#messages", icon: "msg", label: t("request.reply") },
    payment: { href: "#payments", icon: "card", label: t("request.pay") },
  };
  const [r, now] = await Promise.all([getMyRequest((await params).ref), getNow()]);
  if (!r) notFound();
  const title = requestTitle(r.name, r.service, locale);
  const act = !!r.hold && !r.closed;
  const banner = r.closed ? { title: r.summary.title, body: r.closed.reason } : r.hold ? { title: r.hold.title, body: r.hold.detail } : r.summary;
  const action = act ? holdAction[r.hold!.reason] : null;
  const agent = r.agent?.name ?? "Inzira";

  return (
    <>
      <div className="stack g18 page-band">
        <nav aria-label={t("request.crumb")} className="mut row g8 wrapx" style={{ fontSize: 13.5 }}>
          <Link href="/portal/requests">{t("request.mine")}</Link><span>/</span><span className="m">{r.ref}</span>
        </nav>
        <div className="row between g24 m-col" style={{ alignItems: "flex-start" }}>
          <div className="stack g8">
            <div className="row g10 wrapx"><RequestBadge r={r} viewer="customer" /><span className="tag">{t("request.via", { channel: requestChannel(r.channel, r.service, locale) })}</span><span className="tag">{t("request.for", { name: r.profile.name })}</span></div>
            <h1 className="d" style={{ fontSize: "clamp(24px, 3vw, 34px)" }}>{title}</h1>
            <div className="row wrapx mut" style={{ fontSize: 14, gap: "4px 24px" }}>
              <span>{t("request.ourRef")} <strong className="m" style={{ color: "var(--ink)" }}>{r.ref}</strong></span>
              {r.officialRef && <span>{t("request.officialNo")} <strong className="m" style={{ color: "var(--ink)" }}>{r.officialRef}</strong></span>}
              <span>{t("request.opened", { date: fmtDate(r.openedAt, locale) })}</span>
            </div>
          </div>
          <a className="btn btn-s" href="#messages"><Icon name="msg" size={18} /> {t("request.message")}</a>
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
                {r.dependsOn && !r.closed && <Link className="lnk" href={`/portal/requests/${r.dependsOn}`} style={{ fontSize: 14 }}>{t("request.see", { ref: r.dependsOn })}</Link>}
                {action && <Link className="btn btn-p" href={action.href} style={{ alignSelf: "flex-start", marginTop: 6 }}><Icon name={action.icon} size={18} /> {action.label}</Link>}
              </div>
            </div>
            <section className="card" aria-labelledby="docs-h">
              <div className="card-head"><h2 id="docs-h" className="d" style={{ fontSize: 18 }}>{t("request.docs")}</h2>{!r.closed && <Link className="btn btn-s btn-sm" href="/portal/documents"><Icon name="upload" size={16} /> {t("request.upload")}</Link>}</div>
              <div className="stack g18" style={{ padding: "16px 20px" }}>
                <div className="stack g10"><span className="eb" style={{ fontSize: 11 }}>{t("request.required")}</span>
                  {r.documents.map((d) => (
                    <DocCard key={d.id} compact name={displayDocName(d.name, locale)} badge={<DocBadge s={d.status} />}
                      meta={d.status === "rejected" || d.status === "required" ? d.note ?? (d.required ? t("request.needed") : t("request.onlyIf")) : `${d.file?.name ?? ""}${d.reviewedAt ? ` · ${t("request.checked", { date: fmtDay(d.reviewedAt, locale) })}` : ` · ${t("request.awaiting")}`}`}
                      action={!r.closed && (d.status === "rejected" || d.status === "required") ? <Link className={`btn btn-sm ${d.status === "rejected" ? "btn-p" : "btn-s"}`} href="/portal/documents" aria-label={`${d.status === "rejected" ? t("request.replace") : t("request.upload")} ${displayDocName(d.name, locale)}`}>{d.status === "rejected" ? t("request.replace") : t("request.upload")}</Link> : undefined} />
                  ))}
                </div>
                <div className="stack g10"><span className="eb" style={{ fontSize: 11 }}>{t("request.completed")}</span>
                  {r.deliverables.map((d) => <DocCard key={d.id} compact name={displayDocName(d.name, locale)} meta={t("request.issued", { who: d.issuedBy, date: fmtDay(d.issuedAt, locale) })} badge={<DocBadge s="issued" />} action={d.fileId ? <a className="btn btn-s btn-sm" href={`/files/${d.fileId}`} target="_blank" rel="noopener" aria-label={t("portal.download", { name: displayDocName(d.name, locale) })}><Icon name="download" size={16} /> {t("request.download")}</a> : <span className="hint">{t("request.askCopy")}</span>} />)}
                  {r.stage !== "completed" && !r.closed && <div className="row g12 mut" style={{ padding: "14px 16px", border: "1px dashed var(--line-3)", borderRadius: 8 }}><Icon name="clock" size={18} /><span style={{ fontSize: 14 }}>{t("request.final")}</span></div>}
                </div>
              </div>
            </section>
            <Messages reqRef={r.ref} initial={r.messages} agent={agent.split(" ")[0]} now={now} />
          </div>
          <div className="stack g16">
            <div className="card row g14" style={{ padding: 18 }}>
              <span className="av" style={{ width: 48, height: 48, fontSize: 15 }}>{initials(agent)}</span>
              <div className="stack grow" style={{ gap: 3 }}><span className="eb" style={{ fontSize: 10.5 }}>{t("request.yourAgent")}</span><strong style={{ fontSize: 16 }}>{agent}</strong><span className="mut" style={{ fontSize: 13 }}>{r.agent?.team ? teamName(r.agent.team, locale) : t("request.assigning")} · {t("request.replies")}</span></div>
              <Link className="btn btn-s btn-ico" href={whatsappUrl(t("request.waHello", { ref: r.ref }))} aria-label={t("request.waAbout", { ref: r.ref })}><Icon name="whatsapp" size={19} /></Link>
            </div>
            <PaymentPanel reqRef={r.ref} billing={r.billing} now={now} phone={r.account.phone} />
            <section className="card stack g4" style={{ padding: 18 }} aria-labelledby="act-h">
              <h2 id="act-h" className="d" style={{ fontSize: 18, marginBottom: 8 }}>{t("request.activity")}</h2>
              <TimelineV events={r.events.map((e, i) => ({
                state: i === 0 && !r.closed && r.stage !== "completed" ? "cur" : "done", title: e.title, body: e.body,
                meta: [fmtWhen(e.at, now, locale), e.by === "customer" ? t("service.you") : e.by === "system" ? "" : shortName(e.name ?? "")].filter(Boolean).join(" · "),
              }))} />
            </section>
            {!r.closed && (r.stage === "received" || r.stage === "checking" || r.stage === "preparing") && !r.billing.transactions.some((t) => t.status === "paid" || t.status === "pending") && <CancelRequest reqRef={r.ref} />}
            <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} /><span>{t("request.decisions")}</span></p>
          </div>
        </div>
      </div>
    </>
  );
}
