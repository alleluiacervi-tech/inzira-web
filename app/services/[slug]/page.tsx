import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Alert, FeeBreakdown, Icon, Plate, ServiceCard } from "@/components/ui";
import { officeFor } from "@/lib/institutions";
import { fmtDate, officialLabel, oursLabel, totalLabel } from "@/lib/format";
import { getService, listCategories, listServices } from "@/lib/repo";
import { SITE } from "@/lib/site";


export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await getService((await params).slug);
  return s ? { title: s.name, description: s.summary } : {};
}

export default async function ServiceDetail({ params }: { params: Promise<{ slug: string }> }) {
  const [s, services, categories] = await Promise.all([getService((await params).slug), listServices(), listCategories()]);
  if (!s || !s.visible) notFound();
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const training = s.official.mode === "none";
  const office = officeFor(s.category);
  const related = services.filter((x) => x.slug !== s.slug).sort((a, b) => Number(b.category === s.category) - Number(a.category === s.category)).slice(0, 4);

  return (
    <>
      <PublicNav />
      <main>
        <div className="wrap" style={{ paddingTop: 28 }}>
          <nav aria-label="Breadcrumb" className="crumbs">
            <Link href="/services">Services</Link><Icon name="right" size={14} /><Link href={`/services?category=${s.category}`}>{office?.name ?? catName(s.category)}</Link><Icon name="right" size={14} /><span aria-current="page">{s.name}</span>
          </nav>
        </div>
        <section className="wrap split" style={{ ["--aside" as string]: "440px", gap: 64, paddingTop: 28, paddingBottom: 80 }}>
          <div className="stack" style={{ gap: 48 }}>
            <div className="stack g18">
              {office && <p className="row g12" style={{ fontSize: 15, color: "var(--ink-2)" }}><Plate code={office.code} size="sm" />{training ? `Training by Inzira, ${s.via.toLowerCase()}` : `Filed with ${office.name === "Irembo" ? "Irembo" : `the ${office.name}`}, through ${s.channel}`}</p>}
              <h1 className="d h-1">{s.name}</h1>
              {s.aka && <p className="mut" style={{ fontSize: 16 }}>Also called: {s.aka}</p>}
              <p style={{ fontSize: 18, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: 720 }}>{s.summary}</p>
              <ul className="svc-facts">
                {!training && <li><Icon name="clock" size={18} />{s.time}*</li>}
                {s.documents.length > 0 && <li><Icon name="file-text" size={18} />{s.documents.length} {s.documents.length === 1 ? "document" : "documents"}</li>}
                <li><Icon name="file" size={18} />{training ? `Our fee ${oursLabel(s)}` : "Official receipt in your name"}</li>
              </ul>
            </div>
            <div className="stack g16"><h2 className="d h-3">Who it’s for</h2>
              <div className="grid cols-3" style={{ gap: 12 }}>{s.who.map((w) => <div key={w.title} className="card stack g6" style={{ padding: 18 }}><strong>{w.title}</strong><span className="hint">{w.body}</span></div>)}</div>
            </div>
            <div className="stack g14"><h2 className="d h-3">What you need</h2>
              <ul className="stack g12" style={{ listStyle: "none", margin: 0, padding: 0 }}>{s.requirements.map((r) => <li key={r} className="row g12" style={{ fontSize: 16, lineHeight: 1.5, alignItems: "flex-start" }}><Icon name="check" size={20} stroke={2.2} color="var(--brand-2)" />{r}</li>)}</ul>
            </div>
            {s.documents.length > 0 && <div className="stack g14"><h2 className="d h-3">What you’ll send us</h2>
              <p className="hint" style={{ marginTop: -4 }}>Photos from your phone are fine if all four corners are visible and the text is sharp. Your agent checks each one before anything is filed.</p>
              <ul className="doc-list">
                {s.documents.map((d) => (
                  <li key={d.name}>
                    <span className="doc-ico"><Icon name="file-text" size={20} /></span>
                    <span className="stack" style={{ gap: 3, minWidth: 0 }}><strong>{d.name}</strong><span className="hint">{d.detail}</span></span>
                    <span className={`tag ${d.required ? "tag-ember" : ""}`}>{d.required ? "Required" : "If applicable"}</span>
                  </li>
                ))}
              </ul>
            </div>}
            <div className="stack g18"><h2 className="d h-3">How it goes</h2>
              <ol className="svc-steps">
                {s.steps.map((st, i) => (
                  <li key={st.title} className={st.you ? "is-you" : undefined}>
                    <span className="svc-step-n" aria-hidden="true">{i + 1}</span>
                    <div className="stack g4"><strong className="row g10 wrapx" style={{ fontSize: 16.5 }}>{st.title}{st.you && <span className="tag tag-ember">You</span>}</strong><span className="hint" style={{ fontSize: 15 }}>{st.body}</span></div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="stack g12"><h2 className="d h-3">Important notes</h2>
              {!training && <Alert kind="info" title="Processing time is set by the institution">*{s.time.replace(/^Usually /, "")} is typical. Inzira cannot speed up or guarantee an official decision; we make sure nothing delays it on your side.</Alert>}
              {training && s.notes.length === 0 && <Alert kind="info" title="Sessions at a time that suits you">Your trainer agrees the dates and times with you before you pay.</Alert>}
              {s.notes.map((n) => <Alert key={n.title} kind={n.kind} title={n.title}>{n.body}</Alert>)}
            </div>
          </div>
          <aside className="stack g16 sticky-aside">
            <FeeBreakdown official={officialLabel(s)} officialNote={s.official.note} ours={oursLabel(s)} total={totalLabel(s)}>
              <Link className="btn btn-p btn-lg" href={`/start/${s.slug}`}>Start this request</Link>
              <span className="hint" style={{ textAlign: "center" }}>No payment until an agent has checked your documents.</span>
            </FeeBreakdown>
            {s.official.verifiedAt && <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="calendar" size={16} /><span>Official fee last checked with {s.authority} on {fmtDate(s.official.verifiedAt)}.</span></p>}
            <div className="card stack g12" style={{ padding: 18 }}>
              <div className="row g10"><Icon name="clock" size={18} /><span style={{ fontSize: 14.5 }}>Agent responds within <strong>{SITE.responseTime}</strong></span></div>
              <div className="row g10"><Icon name="msg" size={18} /><span style={{ fontSize: 14.5 }}>Updates by SMS &amp; WhatsApp</span></div>
              {!training && <div className="row g10"><Icon name="refresh" size={18} /><span style={{ fontSize: 14.5 }}>Assistance fee refunded if we can’t submit</span></div>}
            </div>
            <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} /><span>Inzira is a private company, not {office && office.code !== "Irembo" ? office.code : "a government institution"}. You can also apply directly through the official channel yourself.</span></p>
          </aside>
        </section>
        <section className="wrap stack g18" style={{ paddingBottom: 80 }}>
          <h2 className="d h-3">Often requested together</h2>
          <div className="grid cols-4 m-scroll">{related.map((r) => <ServiceCard key={r.slug} s={r} category={catName(r.category)} />)}</div>
        </section>
      </main>
      <Footer />
    </>
  );
}
