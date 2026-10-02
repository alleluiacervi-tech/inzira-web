import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Badge, CategoryCard, FeeTag, Icon, ServiceCard, TimelineV } from "@/components/ui";
import { listCategories, listServices } from "@/lib/repo";
import { SITE, whatsappUrl } from "@/lib/site";

const HOW = [
  ["01", "Tell us what you need", "Search, pick a category, or just describe your situation in your own words — in English, Kinyarwanda or French."],
  ["02", "We prepare your request", "An agent checks your documents, tells you exactly what’s missing and prepares the application correctly the first time."],
  ["03", "We submit and follow up", "We submit through the right official channel and chase it for you. You see every step in your portal."],
  ["04", "You receive the result", "Certificates and documents are delivered to your portal, email or WhatsApp — with official receipts."],
];
const WHY = [
  ["shield", "We never blur the fees", "Official government fees and our assistance fee are always shown on separate lines, with official receipts."],
  ["users", "A named human agent", "Every request has one agent you can call or WhatsApp. No ticket queues, no chatbots pretending to be people."],
  ["check", "Checked before submission", "Most rejections come from small mistakes. We review every document before anything is sent."],
  ["lock", "Your documents stay private", "Encrypted storage, access limited to your agent, and deleted on request after completion."],
];
const PLANS = [
  { name: "Pay per service", price: "From RWF 1,000", unit: "assistance fee", desc: "One request, one clear price shown before you start.", items: ["Official fee shown separately, never marked up", "Document check before submission", "Named agent + WhatsApp updates", "Pay by MoMo or Airtel Money"], cta: "See services", hl: false },
  { name: "Monthly tax declarations", price: "RWF 30,000", unit: "per month", desc: "For businesses that declare PAYE, income tax, tourism tax and related taxes every month.", items: ["Every monthly declaration prepared and filed", "We tell you each amount and the deadline", "Taxes paid by you straight to RRA, never through us", "One named agent who knows your business"], cta: "Start monthly declarations", href: "/services/monthly-tax-declarations", hl: true },
  { name: "Anything else online", price: "Agreed with you", unit: "before we start", desc: "Need another online government service? Tell us what it is.", items: ["We confirm the process with you first", "You agree our fee before anything starts", "Official fees still shown on their own line", "Same tracking and named agent"], cta: "Tell us what you need", href: "/start", hl: false },
];
const TESTS = [
  ["“I needed the e-title for my plot and had no idea where to start. They told me exactly what to send and kept me updated on WhatsApp.”", "Land owner · Kicukiro"],
  ["“We registered our company and had the EBM installed the same month. The fee breakdown was clear from day one — no surprises.”", "Founder · [Company], Gasabo"],
  ["“Our accountant left in March. Inzira now files our PAYE and other declarations every month and tells us what to pay before the deadline.”", "Manager · [Hotel], Musanze"],
];
const FAQS = [
  ["Are you part of the government or Irembo?", "No. Inzira is a private, independent company. We help you use the official channels — Irembo, RRA, RDB, RURA and others — correctly. Official decisions are always made by the institution."],
  ["Why do I pay two fees?", "The official fee or tax goes to the institution, exactly as they set it — often you pay it to them directly. Our assistance fee pays for checking, preparing, submitting and following up. You always see both lines separately before you pay."],
  ["Can you guarantee my application will be approved?", "No one can — only the institution decides. What we guarantee is that your request is complete and correct when it is submitted, and that we follow it up."],
  ["Can you help with a service that isn’t listed?", "Often, yes — especially if it is done online. Tell us what you need: we agree the process and our fee with you before we start, and the official fee is still shown on its own line."],
  ["What if I don’t know which service I need?", "Describe your situation. An agent will tell you which procedure applies, what it costs and what you need — before you commit to anything."],
];
const POPULAR = ["company-registration", "monthly-tax-declarations", "e-title", "ebm-installation"];

function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="card shadow stack g18" style={{ position: "absolute", left: 0, top: 0, width: 430, padding: 22 }}>
        <div className="row between"><span className="m mut">INZ-2026-04802</span><Badge tone="info" label="With the institution" /></div>
        <div className="stack g4"><span className="d" style={{ fontSize: 22 }}>Company registration</span><span className="mut" style={{ fontSize: 14 }}>Umucyo Tech Ltd · via RDB</span></div>
        <TimelineV events={[{ state: "done", title: "Documents checked", meta: "Mon · Grace I." }, { state: "done", title: "Application prepared", meta: "Tue" }, { state: "cur", title: "Submitted to RDB", meta: "Today, 09:40" }, { state: "todo", title: "Certificate delivered" }]} />
        <div className="row g10" style={{ paddingTop: 14, borderTop: "1px solid var(--line-2)" }}><span className="av" style={{ width: 32, height: 32, fontSize: 12 }}>GI</span><span style={{ fontSize: 14 }}><strong>Grace</strong> is following up with RDB</span></div>
      </div>
      <div className="card shadow stack g10" style={{ position: "absolute", right: 0, top: 230, width: 230, padding: 16 }}>
        <span className="eb" style={{ fontSize: 10.5 }}>What you pay</span>
        <div className="row between" style={{ fontSize: 13.5 }}><FeeTag kind="official" /><strong>Set by RDB</strong></div>
        <div className="row between" style={{ fontSize: 13.5 }}><FeeTag kind="ours" /><strong className="fee-ours">RWF 10,000</strong></div>
      </div>
      <div className="card shadow row g12" style={{ position: "absolute", right: 0, bottom: 0, width: 280, padding: "14px 16px" }}>
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--ok-bg)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="check" size={20} /></span>
        <span style={{ fontSize: 14, lineHeight: 1.4 }}><strong>Certificate ready.</strong> Sent to your portal and WhatsApp.</span>
      </div>
    </div>
  );
}

export default async function Home() {
  const [services, categories] = await Promise.all([listServices(), listCategories()]);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const popular = services.filter((s) => POPULAR.includes(s.slug)).sort((a, b) => POPULAR.indexOf(a.slug) - POPULAR.indexOf(b.slug));
  return (
    <>
      <PublicNav />
      <main>
        <section className="hero wrap">
          <div className="stack g28">
            <span className="tag" style={{ alignSelf: "flex-start", height: 30, padding: "0 12px", background: "#fff", border: "1px solid var(--line)" }}><Icon name="shield" size={16} color="var(--ok)" /> Independent assistance service · {SITE.city}</span>
            <h1 className="d h-hero">Government &amp; business services, <span className="accent">made easier.</span></h1>
            <p className="lead" style={{ maxWidth: 580 }}>Professional help with business registration, taxes, EBM, land, RURA authorisations and Irembo. You tell us what you need — we help you understand, prepare, submit and follow up.</p>
            <div className="row g12 wrapx m-col">
              <Link className="btn btn-p btn-lg" href="/services">Start a Service <Icon name="arrow" size={18} /></Link>
              <Link className="btn btn-s btn-lg" href="/start">Describe what you need</Link>
            </div>
            <form action="/services" className="card searchbox" style={{ maxWidth: 600 }} role="search">
              <Icon name="search" size={22} />
              <label htmlFor="hs" className="sr-only">What service do you need?</label>
              <input id="hs" name="q" placeholder="What service do you need? e.g. “register my company”" />
              <button className="btn btn-p m-hide" type="submit">Search</button>
            </form>
            <div className="row g8 wrapx"><span className="mut" style={{ fontSize: 14 }}>Popular:</span>
              <Link className="tag" href="/services/company-registration">Company registration</Link>
              <Link className="tag" href="/services/trading-licence-declaration">Trading licence</Link>
              <Link className="tag" href="/services/e-title">E-title</Link>
              <Link className="tag" href="/services/ebm-installation">EBM installation</Link>
            </div>
          </div>
          <HeroVisual />
        </section>

        <section aria-label="Commitments" className="wrap">
          <div className="grid cols-4 m-cols-2" style={{ padding: "26px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", gap: 24 }}>
            {[["card", "Official fees at cost, always itemised"], ["user", "One named agent per request"], ["msg", "Updates by SMS & WhatsApp"], ["globe", "Help in English, Kinyarwanda or French"]].map(([i, t]) => (
              <div key={t} className="row g12"><Icon name={i} size={22} /><span style={{ fontSize: 15, fontWeight: 600 }}>{t}</span></div>
            ))}
          </div>
        </section>

        <section className="section wrap stack g40">
          <div className="row between g24 wrapx" style={{ alignItems: "flex-end" }}>
            <div className="stack g12"><span className="eb">Service categories</span><h2 className="d h-2" style={{ maxWidth: 720 }}>One place for every office you’d otherwise have to visit.</h2></div>
            <Link className="btn btn-s" href="/services">All {services.length} services <Icon name="arrow" size={18} /></Link>
          </div>
          <div className="grid cols-4 m-cols-2">{categories.map((c) => <CategoryCard key={c.id} c={c} count={services.filter((s) => s.category === c.id).length} />)}</div>
        </section>

        <section id="how" className="wrap" style={{ paddingTop: 48 }}>
          <div className="how">
            <div className="row between g24 wrapx" style={{ alignItems: "flex-end" }}>
              <div className="stack g12"><span className="eb" style={{ color: "var(--ember-light)" }}>How it works</span><h2 className="d h-2" style={{ color: "#F6F4EF", maxWidth: 640 }}>You don’t need to know which system to use.</h2></div>
              <Link className="btn btn-p" href="/services">Start a Service</Link>
            </div>
            <ol className="grid cols-4" style={{ gap: 0, listStyle: "none", margin: 0, padding: 0 }}>
              {HOW.map(([n, t, d]) => (
                <li key={n} className="how-step"><span className="m" style={{ color: "var(--ember-light)", fontSize: 14 }}>{n}</span><h3 className="d" style={{ fontSize: 24, color: "#F6F4EF" }}>{t}</h3><p style={{ fontSize: 15, lineHeight: 1.6, color: "#C9C5BB" }}>{d}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section wrap stack g32">
          <div className="row between g24 wrapx" style={{ alignItems: "flex-end" }}>
            <div className="stack g12"><span className="eb">Popular services</span><h2 className="d h-3" style={{ fontSize: "clamp(26px, 3vw, 40px)" }}>What people ask us for most</h2></div>
            <Link className="lnk row g6" href="/services">Browse the catalogue <Icon name="arrow" size={18} /></Link>
          </div>
          <div className="grid cols-4 m-scroll">{popular.map((s) => <ServiceCard key={s.slug} s={s} category={catName(s.category)} />)}</div>
          <p className="hint">Official fees and taxes are set by each institution. Your agent confirms the exact amount before you pay anything.</p>
        </section>

        <section className="section wrap two-col">
          <div className="stack g16"><span className="eb">Why Inzira</span><h2 className="d h-2">Help you can check, from people you can reach.</h2><p className="mut" style={{ fontSize: 16, lineHeight: 1.6 }}>We’re a professional service centre, not a government office — and we built the whole service around being clear about that.</p></div>
          <div className="grid cols-2 why">
            {WHY.map(([i, t, d]) => (
              <div key={t} className="stack g12"><span className="ico-tile" style={{ background: "var(--ember-tint)", color: "var(--ember-deep)" }}><Icon name={i} size={22} /></span><h3 className="d" style={{ fontSize: 20 }}>{t}</h3><p className="mut" style={{ fontSize: 15, lineHeight: 1.6 }}>{d}</p></div>
            ))}
          </div>
        </section>

        <section id="pricing" className="wrap pricing">
          <div className="stack g40">
            <div className="split" style={{ ["--aside" as string]: "520px", alignItems: "end", gap: 48 }}>
              <div className="stack g12"><span className="eb">Transparent pricing</span><h2 className="d h-2">Two lines on every bill. Always.</h2><p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: 560 }}>The official fee or tax is set by the institution — you usually pay it to them directly, and when it passes through us it is never marked up. Our assistance fee is ours, and it’s the only amount we earn.</p></div>
              <div className="card stack g12" style={{ padding: 20 }}>
                <span className="eb" style={{ fontSize: 10.5 }}>Example · E-title</span>
                <div className="row between g12" style={{ fontSize: 15 }}><span className="row g8"><FeeTag kind="official" /> Irembo fee, paid by you on Irembo</span><strong className="nowrap">Shown first</strong></div>
                <div className="row between g12" style={{ fontSize: 15 }}><span className="row g8"><FeeTag kind="ours" /> Our assistance fee</span><strong className="fee-ours nowrap">RWF 2,000</strong></div>
                <div className="row between g12" style={{ paddingTop: 10, borderTop: "1px solid var(--line-2)" }}><strong>Paid to Inzira</strong><strong className="d" style={{ fontSize: 20 }}>RWF 2,000</strong></div>
              </div>
            </div>
            <div id="business" className="grid cols-3">
              {PLANS.map((p) => (
                <div key={p.name} className={`plan stack g20 ${p.hl ? "plan-hl" : ""}`}>
                  <div className="stack g8"><strong style={{ fontSize: 16 }}>{p.name}</strong><p className="plan-mut" style={{ fontSize: 14.5, lineHeight: 1.5 }}>{p.desc}</p></div>
                  <div className="row wrapx" style={{ alignItems: "baseline", gap: "2px 8px" }}><span className="d nowrap" style={{ fontSize: "clamp(28px, 2.5vw, 38px)" }}>{p.price}</span><span className="plan-mut" style={{ fontSize: 14 }}>{p.unit}</span></div>
                  <ul className="stack g12" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {p.items.map((x) => <li key={x} className="row g10" style={{ fontSize: 14.5, lineHeight: 1.45, alignItems: "flex-start" }}><Icon name="check" size={18} stroke={2.2} color={p.hl ? "var(--ember-light)" : "var(--ok)"} />{x}</li>)}
                  </ul>
                  <Link className={`btn ${p.hl ? "btn-p" : "btn-s"}`} href={p.href ?? "/services"} style={{ marginTop: "auto" }}>{p.cta}</Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section wrap stack g32">
          <div className="row between g16 wrapx" style={{ alignItems: "flex-end" }}>
            <div className="stack g12"><span className="eb">Customers</span><h2 className="d" style={{ fontSize: "clamp(26px, 3vw, 40px)" }}>In their words</h2></div>
            <span className="tag" style={{ whiteSpace: "normal", height: "auto", padding: "4px 8px" }}>Sample copy — replace with verified, consented reviews</span>
          </div>
          <div className="grid cols-3 m-scroll">
            {TESTS.map(([q, r]) => (
              <figure key={r} className="card stack g20" style={{ padding: 28 }}>
                <blockquote style={{ fontSize: 17, lineHeight: 1.55 }}>{q}</blockquote>
                <figcaption className="row g12" style={{ marginTop: "auto" }}><span className="av" style={{ width: 40, height: 40 }}>··</span><span className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 14.5 }}>[Customer name]</strong><span className="mut" style={{ fontSize: 13 }}>{r}</span></span></figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="faq" className="section wrap two-col">
          <div className="stack g16"><span className="eb">FAQ</span><h2 className="d h-2">Questions we hear every day</h2><p className="mut" style={{ fontSize: 16, lineHeight: 1.6 }}>Still unsure? <Link href="/start">Ask an agent</Link> — it’s free to ask.</p></div>
          <div style={{ borderTop: "1px solid var(--line)" }}>
            {FAQS.map(([q, a], i) => (
              <details key={q} open={i === 0} style={{ borderBottom: "1px solid var(--line)", padding: "22px 0" }}>
                <summary className="row between g16" style={{ fontWeight: 700, fontSize: 17 }}>{q}<span className="chev"><Icon name="down" size={20} /></span></summary>
                <p className="mut" style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 12, maxWidth: 760 }}>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="wrap" style={{ paddingTop: 40, paddingBottom: 96 }}>
          <div className="cta-band">
            <div className="stack g14"><h2 className="d" style={{ fontSize: "clamp(30px, 4vw, 52px)", lineHeight: 1.04, color: "#fff" }}>Tell us what you need.<br />We’ll handle the rest.</h2><p style={{ fontSize: 18, color: "#FFE9DC", lineHeight: 1.5 }}>Most requests start in under three minutes. An agent contacts you within {SITE.responseTime}.</p></div>
            <div className="stack g12"><Link className="btn btn-d btn-lg" href="/services">Start a Service <Icon name="arrow" size={18} /></Link><Link className="btn btn-lg btn-ghost-light" href={whatsappUrl()}>WhatsApp an agent</Link></div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
