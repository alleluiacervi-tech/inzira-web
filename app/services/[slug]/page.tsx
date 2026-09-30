import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Alert, Badge, FeeBreakdown, Icon, ServiceCard } from "@/components/ui";
import { SERVICES, catById, officialLabel, oursLabel, serviceBySlug, totalLabel } from "@/lib/data";

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = serviceBySlug((await params).slug);
  return s ? { title: s.name, description: s.summary } : {};
}

export default async function ServiceDetail({ params }: { params: Promise<{ slug: string }> }) {
  const s = serviceBySlug((await params).slug);
  if (!s) notFound();
  const cat = catById(s.category);
  const related = SERVICES.filter((x) => x.slug !== s.slug).sort((a, b) => Number(b.category === s.category) - Number(a.category === s.category)).slice(0, 4);

  return (
    <>
      <PublicNav />
      <main>
        <div className="wrap" style={{ paddingTop: 28 }}>
          <nav aria-label="Breadcrumb" className="mut row g8 wrapx" style={{ fontSize: 14 }}>
            <Link href="/">Home</Link><span>/</span><Link href="/services">Services</Link><span>/</span><Link href={`/services?category=${cat.id}`}>{cat.name}</Link><span>/</span><span>{s.name}</span>
          </nav>
        </div>
        <section className="wrap split" style={{ ["--aside" as string]: "440px", gap: 64, paddingTop: 28, paddingBottom: 80 }}>
          <div className="stack" style={{ gap: 48 }}>
            <div className="stack g18">
              <div className="row g8 wrapx"><span className="tag">{cat.name}</span>{s.popular && <span className="tag" style={{ background: "var(--ember-tint)", color: "var(--ember-deep)" }}>Popular</span>}</div>
              <h1 className="d h-1">{s.name}</h1>
              {s.aka && <p className="mut" style={{ fontSize: 16 }}>Also called: {s.aka}</p>}
              <div className="card grid cols-3" style={{ padding: "18px 20px", gap: 20 }}>
                <div className="stack g4"><span className="eb" style={{ fontSize: 11 }}>Responsible authority</span><strong>{s.authority}</strong></div>
                <div className="stack g4"><span className="eb" style={{ fontSize: 11 }}>Official channel</span><strong style={{ textTransform: "capitalize" }}>{s.channel}</strong></div>
                <div className="stack g4"><span className="eb" style={{ fontSize: 11 }}>Typical processing</span><strong>{s.time}*</strong></div>
              </div>
            </div>
            <div className="stack g14"><h2 className="d h-3">In simple terms</h2><p style={{ fontSize: 17, lineHeight: 1.65, color: "var(--ink-2)", maxWidth: 720 }}>{s.summary}</p></div>
            <div className="stack g16"><h2 className="d h-3">Who needs this</h2>
              <div className="grid cols-3" style={{ gap: 12 }}>{s.who.map((w) => <div key={w.title} className="card stack g6" style={{ padding: 18 }}><strong>{w.title}</strong><span className="hint">{w.body}</span></div>)}</div>
            </div>
            <div className="stack g14"><h2 className="d h-3">Requirements</h2>
              <ul className="stack g12" style={{ listStyle: "none", margin: 0, padding: 0 }}>{s.requirements.map((r) => <li key={r} className="row g12" style={{ fontSize: 16, lineHeight: 1.5, alignItems: "flex-start" }}><Icon name="check" size={20} stroke={2.2} color="#1E6B3A" />{r}</li>)}</ul>
            </div>
            <div className="stack g14"><h2 className="d h-3">Required documents</h2>
              <div className="card table-wrap"><table><thead><tr><th>Document</th><th>Details</th><th>Needed</th></tr></thead><tbody>
                {s.documents.map((d) => <tr key={d.name}><td><span className="row g10" style={{ fontWeight: 700 }}><Icon name="file" size={18} />{d.name}</span></td><td className="mut">{d.detail}</td><td>{d.required ? <Badge k="req" /> : <span className="tag">If applicable</span>}</td></tr>)}
              </tbody></table></div>
              <p className="hint">Photos from a phone are fine if all four corners are visible and the text is sharp.</p>
            </div>
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
              <Alert kind="info" title="Processing time is set by the institution">*{s.time} is typical once submitted. Inzira cannot speed up or guarantee an official decision; we make sure nothing delays it on your side.</Alert>
              {s.notes.map((n) => <Alert key={n.title} kind={n.kind} title={n.title}>{n.body}</Alert>)}
            </div>
          </div>
          <aside className="stack g16" style={{ position: "sticky", top: 96 }}>
            <FeeBreakdown official={officialLabel(s)} officialNote={s.official.note} ours={oursLabel(s)} total={totalLabel(s)}>
              <Link className="btn btn-p btn-lg" href={`/start/${s.slug}`}>Start Request <Icon name="arrow" size={18} /></Link>
              <span className="hint" style={{ textAlign: "center" }}>No payment until an agent has checked your documents.</span>
            </FeeBreakdown>
            <div className="card stack g12" style={{ padding: 18 }}>
              <div className="row g10"><Icon name="clock" size={18} /><span style={{ fontSize: 14.5 }}>Agent responds within <strong>2 working hours</strong></span></div>
              <div className="row g10"><Icon name="msg" size={18} /><span style={{ fontSize: 14.5 }}>Updates by SMS &amp; WhatsApp</span></div>
              <div className="row g10"><Icon name="refresh" size={18} /><span style={{ fontSize: 14.5 }}>Assistance fee refunded if we can’t submit</span></div>
            </div>
            <p className="hint row g8" style={{ alignItems: "flex-start" }}><Icon name="shield" size={16} /><span>Inzira is a private assistance company, not a government institution. You can also apply directly through the official channel yourself.</span></p>
          </aside>
        </section>
        <section className="wrap stack g18" style={{ paddingBottom: 80 }}>
          <h2 className="d h-3">Often requested together</h2>
          <div className="grid cols-4">{related.map((r) => <ServiceCard key={r.slug} s={r} />)}</div>
        </section>
      </main>
      <Footer />
    </>
  );
}
