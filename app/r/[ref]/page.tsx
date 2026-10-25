import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Footer from "@/components/Footer";
import PublicNav from "@/components/PublicNav";
import { DocUpload, HashCleaner, LinkGate, SaveToAccount } from "@/components/RequestLink";
import { Messages, PaymentPanel } from "@/components/RequestSide";
import IdCorrection from "@/components/IdCorrection";
import { DocBadge, DocCard, Icon, RequestBadge, StageTimeline, TimelineV } from "@/components/ui";
import { forgetRequest } from "@/app/actions/links";
import { fmtDate, fmtDay, fmtWhen, initials, shortName } from "@/lib/format";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { channelName, displayDocName, localizeService, requestChannel, requestTitle, teamName } from "@/lib/i18n/present";
import { getLinkedRequest, getNow, ownsRequest } from "@/lib/repo";
import { whatsappUrl } from "@/lib/site";

// A private page: never indexed, and no link out carries its address.
export async function generateMetadata(): Promise<Metadata> {
  return { title: text(await getLocale(), "link.privateTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** One request, for the person who sent it without an account: opened with its private link (lib/request-links.ts). */
export default async function LinkedRequestPage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref).toUpperCase();
  if (await ownsRequest(ref)) redirect(`/portal/requests/${ref}`);
  const [r, now, locale] = await Promise.all([getLinkedRequest(ref), getNow(), getLocale()]);
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  if (!r) {
    return (
      <>
        <PublicNav />
        <main id="main" className="wrap auth-main"><div className="auth-card"><LinkGate reqRef={ref} /></div></main>
      </>
    );
  }
  const base = `/r/${r.ref}`;
  const service = localizeService(r.service, locale);
  const title = requestTitle(r.name, r.service, locale);
  const act = !!r.hold && !r.closed;
  const banner = r.closed ? { title: r.summary.title, body: r.closed.reason } : r.hold ? { title: r.hold.title, body: r.hold.detail } : r.summary;
  const action = act ? { document: { href: "#docs", icon: "upload", label: t("request.uploadDoc") }, information: { href: "#messages", icon: "msg", label: t("request.reply") }, payment: { href: `${base}/pay`, icon: "card", label: t("request.pay") } }[r.hold!.reason] : null;
  const agent = r.agent?.name ?? "Inzira";
  const open = !r.closed && r.stage !== "completed";
  const missing = r.documents.filter((d) => d.status === "required" || d.status === "rejected");
  const via = r.deliverVia === "email" ? t("start.viaEmail") : "WhatsApp";

  return (
    <>
      <PublicNav />
      <main id="main" className="wrap rq" data-linked-request={r.ref}>
        <HashCleaner />
        <header className="stack g10 rq-head">
          <div className="row g8 wrapx"><RequestBadge r={r} viewer="customer" /><span className="tag m">{r.ref}</span></div>
          <h1 className="d rq-title">{title}</h1>
          <p className="mut rq-meta">{t("request.via", { channel: requestChannel(r.channel, r.service, locale) })} · {t("request.for", { name: r.profile.name })} · {t("request.opened", { date: fmtDate(r.openedAt, locale) })}</p>
          {(r.officialRef || r.officialBill) && <p className="mut rq-meta">
            {r.officialRef && <span>{t("request.officialNo")} <strong className="m">{r.officialRef}</strong></span>}
            {r.officialBill && <span data-official-bill> {t("request.billNo")} <strong className="m">{r.officialBill}</strong></span>}
          </p>}
          <div style={{ paddingTop: 6 }}><StageTimeline r={r} viewer="customer" /></div>
        </header>

        <div className="rq-grid">
          <div className="stack g16">
            <div className={`card row g14 banner ${act ? "banner-act" : ""}`}>
              <span className="ico-tile"><Icon name={act ? "alert" : r.closed ? "info" : r.stage === "completed" ? "check" : "send"} size={22} /></span>
              <div className="stack g6 grow">
                <strong style={{ fontSize: 17 }}>{banner.title}</strong>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>{banner.body}</p>
                {action && <a className="btn btn-p" href={action.href} style={{ alignSelf: "flex-start", marginTop: 6 }}><Icon name={action.icon} size={18} /> {action.label}</a>}
              </div>
            </div>

            {open && service.inPerson && <div className="card row g12 rq-inperson" style={{ padding: 16 }}><Icon name="pin" size={20} /><span><strong>{t("start.inPersonTitle")}.</strong> {service.inPerson}</span></div>}

            {r.idRequired && (
              <section className="card stack g10" style={{ padding: 18 }} aria-labelledby="id-h">
                <h2 id="id-h" className="d" style={{ fontSize: 18, margin: 0 }}>{t("request.idHeading")}</h2>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}><strong>{t(`request.id_${r.idReview ?? "none"}`)}</strong></p>
                <p className="hint" style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>{t(`request.id_${r.idReview ?? "none"}Body`)}</p>
                {r.idReview === "correction" && !r.closed && <IdCorrection reqRef={r.ref} />}
              </section>
            )}

            <section className="card" id="docs" aria-labelledby="docs-h">
              <div className="card-head"><h2 id="docs-h" className="d" style={{ fontSize: 18 }}>{open && missing.length ? t("link.docsNeeded") : t("request.docs")}</h2></div>
              <div className="stack g10" style={{ padding: "14px 16px" }}>
                {r.documents.length === 0 && <p className="hint" style={{ margin: 0 }}>{t("link.noDocs")}</p>}
                {r.documents.map((d) => {
                  const needed = d.status === "required" || d.status === "rejected";
                  return (
                    <DocCard key={d.id} compact name={displayDocName(d.name, locale)} badge={d.status === "required" && !d.required ? <span className="tag">{t("start.optionalTag")}</span> : <DocBadge s={d.status} />}
                      meta={needed ? d.note ?? (d.required ? t("request.needed") : t("request.onlyIf")) : `${d.file?.name ?? ""}${d.reviewedAt ? ` · ${t("request.checked", { date: fmtDay(d.reviewedAt, locale) })}` : ` · ${t("request.awaiting")}`}`}
                      action={open && needed ? <DocUpload docId={d.id} primary={d.status === "rejected"} label={d.status === "rejected" ? t("request.replace") : t("request.upload")} /> : undefined} />
                  );
                })}
              </div>
            </section>

            <section className="card" aria-labelledby="out-h">
              <div className="card-head"><h2 id="out-h" className="d" style={{ fontSize: 18 }}>{t("link.result")}</h2></div>
              <div className="stack g10" style={{ padding: "14px 16px" }}>
                {r.deliverables.map((d) => <DocCard key={d.id} compact name={displayDocName(d.name, locale)} meta={t("request.issued", { who: channelName(d.issuedBy, locale), date: fmtDay(d.issuedAt, locale) })} badge={<DocBadge s="issued" />} action={d.fileId ? <a className="btn btn-p btn-sm" href={`/files/${d.fileId}`} target="_blank" rel="noopener noreferrer"><Icon name="download" size={16} /> {t("request.download")}</a> : <span className="hint">{t("request.askCopy")}</span>} />)}
                {!r.deliverables.length && <p className="hint row g8" style={{ margin: 0 }}><Icon name="clock" size={17} /> {r.closed ? r.summary.body : t("link.resultWait", { via })}</p>}
              </div>
            </section>

            <Messages reqRef={r.ref} initial={r.messages} agent={agent.split(" ")[0]} now={now} />
          </div>

          <div className="stack g16">
            <PaymentPanel reqRef={r.ref} billing={r.billing} now={now} phone={r.account.phone} checkoutOpen={r.checkout === "open" && !r.closed} base={base} />
            <div className="card row g14" style={{ padding: 16 }}>
              <span className="av" style={{ width: 44, height: 44, fontSize: 14 }}>{initials(agent)}</span>
              <div className="stack grow" style={{ gap: 3 }}><span className="eb" style={{ fontSize: 10.5 }}>{t("request.yourAgent")}</span><strong style={{ fontSize: 15.5 }}>{agent}</strong><span className="mut" style={{ fontSize: 13 }}>{r.agent?.team ? teamName(r.agent.team, locale) : t("request.assigning")}</span></div>
              <a className="btn btn-s btn-ico" href={whatsappUrl(t("request.waHello", { ref: r.ref }))} target="_blank" rel="noopener noreferrer" aria-label={t("request.waAbout", { ref: r.ref })}><Icon name="whatsapp" size={19} /></a>
            </div>
            {!r.account.registered && r.account.email && <SaveToAccount reqRef={r.ref} email={r.account.email} />}
            <section className="card stack g4" style={{ padding: 16 }} aria-labelledby="act-h">
              <h2 id="act-h" className="d" style={{ fontSize: 17, marginBottom: 8 }}>{t("request.activity")}</h2>
              <TimelineV events={r.events.map((e, i) => ({
                state: i === 0 && open ? "cur" : "done", title: e.title, body: e.body,
                meta: [fmtWhen(e.at, now, locale), e.by === "customer" ? t("service.you") : e.by === "system" ? "" : shortName(e.name ?? "")].filter(Boolean).join(" · "),
              }))} />
            </section>
            <p className="hint row g8" style={{ alignItems: "flex-start", margin: 0 }}><Icon name="lock" size={16} /><span>{t("link.privateNote")}</span></p>
            <form action={forgetRequest.bind(null, r.ref)}><button type="submit" className="linkish" style={{ fontSize: 13.5 }} data-forget>{t("link.forget")}</button></form>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
