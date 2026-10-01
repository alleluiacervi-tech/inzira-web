import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Alert, Badge, FeeBreakdown, Icon, ServiceCard } from "@/components/ui";
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
  const related = services.filter((x) => x.slug !== s.slug).sort((a, b) => Number(b.category === s.category) - Number(a.category === s.category)).slice(0, 4);

  return (
    <>
      <PublicNav />
      <main>
        <div className="wrap" style={{ paddingTop: 28 }}>
          <nav aria-label="Breadcrumb" className="mut row g8 wrapx" style={{ fontSize: 14 }}>
            <Link href="/">Home</Link><span>/</span><Link href="/services">Services</Link><span>/</span><Link href={`/services?category=${s.category}`}>{catName(s.category)}</Link><span>/</span><span>{s.name}</span>
          </nav>
        </div>
        <section className="wrap split" style={{ ["--aside" as string]: "440px", gap: 64, paddingTop: 28, paddingBottom: 80 }}>
          <div className="stack" style={{ gap: 48 }}>
            <div className="stack g18">
              <div className="row g8 wrapx"><span className="tag">{catName(s.category)}</span>{s.popular && <span className="tag tag-ember">Popular</span>}</div>
              <h1 className="d h-1">{s.name}</h1>
              {s.aka && <p className="mut" style={{ fontSize: 16 }}>Also called: {s.aka}</p>}
              <div className="card grid cols-3" style={{ padding: "18px 20px", gap: 20 }}>
                <div className="stack g4"><span className="eb" style={{ fontSize: 11 }}>{training ? "Delivered by" : "Responsible authority"}</span><strong>{s.authority}</strong></div>
                <div className="stack g4"><span className="eb" style={{ fontSize: 11 }}>{training ? "Format" : "Official channel"}</span><strong>{training ? s.via : s.channel}</strong></div>
                <div className="stack g4"><span className="eb" style={{ fontSize: 11 }}>{training ? "Fee" : "Typical processing"}</span><strong>{training ? oursLabel(s) : `${s.time}*`}</strong></div>
              </div>
            </div>
            <div className="stack g14"><h2 className="d h-3">In simple terms</h2><p style={{ fontSize: 17, lineHeight: 1.65, color: "var(--ink-2)", maxWidth: 720 }}>{s.summary}</p></div>
            <div className="stack g16"><h2 className="d h-3">Who needs this</h2>
              <div className="grid cols-3" style={{ gap: 12 }}>{s.who.map((w) => <div key={w.title} className="card stack g6" style={{ padding: 18 }}><strong>{w.title}</strong><span className="hint">{w.body}</span></div>)}</div>
            </div>
            <div className="stack g14"><h2 className="d h-3">Requirements</h2>
              <ul className="stack g12" style={{ listStyle: "none", margin: 0, padding: 0 }}>{s.requirements.map((r) => <li key={r} className="row g12" style={{ fontSize: 16, lineHeight: 1.5, alignItems: "flex-start" }}><Icon name="check" size={20} stroke={2.2} color="var(--ok)" />{r}</li>)}</ul>
            </div>
            {s.documents.length > 0 && <div className="stack g14"><h2 className="d h-3">Required documents</h2>
              <div className="card table-wrap"><table><thead><tr><th>Document</th><th>Details</th><th>Needed</th></tr></thead><tbody>
                {s.documents.map((d) => <tr key={d.name}><td><span className="row g10" style={{ fontWeight: 700 }}><Icon name="file" size={18} />{d.name}</span></td><td className="mut">{d.detail}</td><td>{d.required ? <Badge tone="neutral" label="Required" /> : <span className="tag">If applicable</span>}</td></tr>)}
              </tbody></table></div>
              <p className="hint">Photos from a phone are fine if all four corners are visible and the text is sharp.</p>
            </div>}
            <div className="stack g18"><h2 className="d h-3">Steps involved</h2>
              <ol className="grid cols-2" style={{ gap: 12, listStyle: "none", margin: 0, padding: 0 }}>
                {s.steps.map((st, i) => (
                  <li key={st.title} className="card row g14" style={{ padding: 18, alignItems: "flex-start" }}>
                    <span className="d" style={{ width: 32, height: 32, borderRadius: "50%", background: st.you ? "var(--ember)" : "var(--ink)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{i + 1}</span>
                    <div className="stack g4"><strong style={{ fontSize: 15.5 }}>{st.title}</strong><span className="hint">{st.body}</span></div>
                  </li>
                ))}
              </ol>
              <p className="hint">Orange steps need you. Everything else we handle.</p>
            </div>
            <div className="stack g12"><h2 className="d h-3">Important notes</h2>
              {!training && <Alert kind="info" title="Processing time is set by the institution">*{s.time.replace(/^Usually /, "")} is typical. Inzira cannot speed up or guarantee an official decision; we make sure nothing delays it on your side.</Alert>}
              {training && s.notes.length === 0 && <Alert kind="info" title="Sessions at a time that suits you">Your trainer agrees the dates and times with you before you pay.</Alert>}
              {s.notes.map((n) => <Alert key={n.title} kind={n.kind} title={n.title}>{n.body}</Alert>)}
            </div>
          </div>
          <aside className="stack g16 sticky-aside">
            <FeeBreakdown official={officialLabel(s)} officialNote={s.official.note} ours={oursLabel(s)} total={totalLabel(s)}>
              <Link className="btn btn-p btn-lg" href={`/start/${s.slug}`}>Start Request <Icon name="arrow" size={18} /></Link>
              <span className="hint" style={{ textAlign: "center" }}>No payment until an agent has checked your documents.</span>
            </FeeBreakdown>
            {s.official.verifiedAt && <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="calendar" size={16} /><span>Official fee last checked with {s.authority} on {fmtDate(s.official.verifiedAt)}.</span></p>}
            <div className="card stack g12" style={{ padding: 18 }}>
              <div className="row g10"><Icon name="clock" size={18} /><span style={{ fontSize: 14.5 }}>Agent responds within <strong>{SITE.responseTime}</strong></span></div>
              <div className="row g10"><Icon name="msg" size={18} /><span style={{ fontSize: 14.5 }}>Updates by SMS &amp; WhatsApp</span></div>
              {!training && <div className="row g10"><Icon name="refresh" size={18} /><span style={{ fontSize: 14.5 }}>Assistance fee refunded if we can’t submit</span></div>}
            </div>
            <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} /><span>Inzira is a private assistance company, not a government institution. You can also apply directly through the official channel yourself.</span></p>
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
