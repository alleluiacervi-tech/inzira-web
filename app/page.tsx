import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Badge, CategoryCard, FeeTag, Icon, ServiceCard, TimelineV } from "@/components/ui";
import { CATEGORIES, SERVICES } from "@/lib/data";

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
  { name: "Pay per service", price: "From RWF 3,000", unit: "assistance fee", desc: "For individuals. One request, one clear price shown before you start.", items: ["Official fee shown separately, paid at cost", "Document check before submission", "Named agent + WhatsApp updates", "Pay by MoMo, Airtel Money or card"], cta: "See services", hl: false },
  { name: "Business Care", price: "RWF [PRICE]", unit: "per month", desc: "For SMEs that need taxes, EBM and compliance handled every month.", items: ["Monthly VAT & PAYE declarations", "EBM support and invoice checks", "Compliance calendar & reminders", "Priority agent, same-day response", "Official fees always passed on at cost"], cta: "Talk to us", hl: true },
  { name: "Organizations", price: "Custom", unit: "volume pricing", desc: "For NGOs, schools and companies handling many staff or member requests.", items: ["Bulk requests and staff onboarding", "Multi-user account with roles", "Monthly statement of every fee", "Dedicated account manager"], cta: "Talk to us", hl: false },
];
const TESTS = [
  ["“I needed a criminal record certificate for a job abroad and had no idea where to start. They told me exactly what to send and I had it in three days.”", "Individual · Kicukiro"],
  ["“We registered our company, got our TIN and set up EBM in one week. The fee breakdown was clear from day one — no surprises.”", "Founder · [Company], Gasabo"],
  ["“Our accountant left in March. Business Care now handles our monthly declarations and reminds us before every deadline.”", "Operations lead · [Organization], Musanze"],
];
const FAQS = [
  ["Are you part of the government or Irembo?", "No. Inzira is a private, independent company. We help you use the official channels — Irembo, RRA, RDB, the judiciary’s systems and others — correctly. Official decisions are always made by the institution."],
  ["Why do I pay two fees?", "The official government fee goes to the institution, exactly as they set it. Our assistance fee pays for checking, preparing, submitting and following up. You always see both lines separately before you pay."],
  ["Can you guarantee my application will be approved?", "No one can — only the institution decides. What we guarantee is that your request is complete and correct when it is submitted, and that we follow it up."],
  ["Do you give legal advice or represent me in court?", "No. For Judiciary services we help with administrative steps — forms, document preparation and filing through official channels. For legal advice, please consult a licensed advocate."],
  ["What if I don’t know which service I need?", "Describe your situation. An agent will tell you which procedure applies, what it costs and what you need — before you commit to anything."],
];

function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="card shadow stack g18" style={{ position: "absolute", left: 0, top: 0, width: 430, padding: 22 }}>
        <div className="row between"><span className="m mut">INZ-2026-04802</span><Badge k="sub" /></div>
        <div className="stack g4"><span className="d" style={{ fontSize: 22 }}>Private company registration</span><span className="mut" style={{ fontSize: 14 }}>Umucyo Tech Ltd · via RDB</span></div>
        <TimelineV events={[{ state: "done", title: "Documents checked", meta: "Mon · Grace I." }, { state: "done", title: "Application prepared", meta: "Tue" }, { state: "cur", title: "Submitted to RDB", meta: "Today, 09:40" }, { state: "todo", title: "Certificate delivered" }]} />
        <div className="row g10" style={{ paddingTop: 14, borderTop: "1px solid var(--line-2)" }}><span className="av" style={{ width: 32, height: 32, fontSize: 12 }}>GI</span><span style={{ fontSize: 14 }}><strong>Grace</strong> is following up with RDB</span></div>
      </div>
      <div className="card shadow stack g10" style={{ position: "absolute", right: 0, top: 230, width: 230, padding: 16 }}>
        <span className="eb" style={{ fontSize: 10.5 }}>What you pay</span>
        <div className="row between" style={{ fontSize: 13.5 }}><FeeTag kind="official" /><strong>Free</strong></div>
        <div className="row between" style={{ fontSize: 13.5 }}><FeeTag kind="ours" /><strong className="fee-ours">RWF 30,000</strong></div>
      </div>
      <div className="card shadow row g12" style={{ position: "absolute", right: 0, bottom: 0, width: 280, padding: "14px 16px" }}>
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--ok-bg)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="check" size={20} /></span>
        <span style={{ fontSize: 14, lineHeight: 1.4 }}><strong>Certificate ready.</strong> Sent to your portal and WhatsApp.</span>
      </div>
    </div>
  );
}

export default function Home() {
  const popular = ["criminal-record-certificate", "company-registration", "tin-registration", "ebm-setup"].map((s) => SERVICES.find((x) => x.slug === s)!);
  return (
    <>
      <PublicNav />
      <main>
        <section className="hero wrap">
          <div className="stack g28">
            <span className="tag" style={{ alignSelf: "flex-start", height: 30, padding: "0 12px", background: "#fff", border: "1px solid var(--line)" }}><Icon name="shield" size={16} color="#1E6B3A" /> Independent assistance service · Kigali</span>
            <h1 className="d h-hero">Government &amp; business services, <span className="accent">made easier.</span></h1>
            <p className="lead" style={{ maxWidth: 580 }}>Professional help with public services, taxes, EBM, business registration, land and court paperwork. You tell us what you need — we help you understand, prepare, submit and follow up.</p>
            <div className="row g12 wrapx m-col">
              <Link className="btn btn-p btn-lg" href="/services">Start a Service <Icon name="arrow" size={18} /></Link>
              <Link className="btn btn-s btn-lg" href="/services">Explore Services</Link>
            </div>
            <form action="/services" className="card searchbox" style={{ maxWidth: 600 }} role="search">
              <Icon name="search" size={22} />
              <label htmlFor="hs" className="sr-only">What service do you need?</label>
              <input id="hs" name="q" placeholder="What service do you need? e.g. “register my company”" />
              <button className="btn btn-p m-hide" type="submit">Search</button>
            </form>
            <div className="row g8 wrapx"><span className="mut" style={{ fontSize: 14 }}>Popular:</span>
              <Link className="tag" href="/services/criminal-record-certificate">Police clearance</Link>
              <Link className="tag" href="/services/tin-registration">TIN registration</Link>
              <Link className="tag" href="/services/company-registration">Company registration</Link>
              <Link className="tag" href="/services/ebm-setup">EBM setup</Link>
            </div>
          </div>
          <HeroVisual />
        </section>

        <section aria-label="Commitments" className="wrap">
          <div className="grid cols-4 m-cols-2" style={{ padding: "26px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", gap: 24 }}>
            {[["card", "Official fees at cost, always itemised"], ["user", "One named agent per request"], ["msg", "Updates by SMS & WhatsApp"], ["globe", "English · Kinyarwanda · Français"]].map(([i, t]) => (
              <div key={t} className="row g12"><Icon name={i} size={22} /><span style={{ fontSize: 15, fontWeight: 600 }}>{t}</span></div>
            ))}
          </div>
        </section>

        <section className="section wrap stack g40">
          <div className="row between g24 wrapx" style={{ alignItems: "flex-end" }}>
            <div className="stack g12"><span className="eb">Service categories</span><h2 className="d h-2" style={{ maxWidth: 720 }}>One place for every office you’d otherwise have to visit.</h2></div>
            <Link className="btn btn-s" href="/services">All 160+ services <Icon name="arrow" size={18} /></Link>
          </div>
          <div className="grid cols-4">{CATEGORIES.map((c) => <CategoryCard key={c.id} id={c.id} />)}</div>
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
          <div className="grid cols-4">{popular.map((s) => <ServiceCard key={s.slug} s={s} />)}</div>
          <p className="hint">Official fees are indicative and set by each institution. Your exact total is confirmed before you pay.</p>
        </section>

        <section className="section wrap two-col">
          <div className="stack g16"><span className="eb">Why Inzira</span><h2 className="d h-2">Help you can check, from people you can reach.</h2><p className="mut" style={{ fontSize: 16, lineHeight: 1.6 }}>We’re a professional service centre, not a government office — and we built the whole service around being clear about that.</p></div>
          <div className="grid cols-2" style={{ gap: "44px 48px" }}>
            {WHY.map(([i, t, d]) => (
              <div key={t} className="stack g12"><span className="ico-tile" style={{ background: "var(--ember-tint)", color: "var(--ember-deep)" }}><Icon name={i} size={22} /></span><h3 className="d" style={{ fontSize: 20 }}>{t}</h3><p className="mut" style={{ fontSize: 15, lineHeight: 1.6 }}>{d}</p></div>
            ))}
          </div>
        </section>

        <section id="pricing" className="wrap" style={{ paddingTop: 80, paddingBottom: 80, background: "var(--sand)", marginTop: 40 }}>
          <div className="stack g40">
            <div className="split" style={{ ["--aside" as string]: "520px", alignItems: "end", gap: 48 }}>
              <div className="stack g12"><span className="eb">Transparent pricing</span><h2 className="d h-2">Two lines on every bill. Always.</h2><p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: 560 }}>The official government fee is set by the institution and passed on at cost. Our assistance fee is ours — and it’s the only amount we earn.</p></div>
              <div className="card stack g12" style={{ padding: 20 }}>
                <span className="eb" style={{ fontSize: 10.5 }}>Example · Criminal record certificate</span>
                <div className="row between g12" style={{ fontSize: 15 }}><span className="row g8"><FeeTag kind="official" /> Paid to NPPA via Irembo</span><strong>RWF 1,000</strong></div>
                <div className="row between g12" style={{ fontSize: 15 }}><span className="row g8"><FeeTag kind="ours" /> Our assistance fee</span><strong className="fee-ours">RWF 5,000</strong></div>
                <div className="row between" style={{ paddingTop: 10, borderTop: "1px solid var(--line-2)" }}><strong>Total estimated</strong><strong className="d" style={{ fontSize: 20 }}>RWF 6,000</strong></div>
              </div>
            </div>
            <div id="business" className="grid cols-3">
              {PLANS.map((p) => (
                <div key={p.name} className="stack g20" style={{ background: p.hl ? "var(--ink)" : "#fff", border: `1px solid ${p.hl ? "var(--ink)" : "var(--line)"}`, borderRadius: 8, padding: 28, color: p.hl ? "#F6F4EF" : "var(--ink)" }}>
                  <div className="stack g8"><strong style={{ fontSize: 16 }}>{p.name}</strong><p style={{ fontSize: 14.5, lineHeight: 1.5, color: p.hl ? "#C9C5BB" : "var(--muted)" }}>{p.desc}</p></div>
                  <div className="row g8" style={{ alignItems: "baseline" }}><span className="d" style={{ fontSize: 38 }}>{p.price}</span><span style={{ fontSize: 14, color: p.hl ? "#C9C5BB" : "var(--muted)" }}>{p.unit}</span></div>
                  <ul className="stack g12" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {p.items.map((x) => <li key={x} className="row g10" style={{ fontSize: 14.5, lineHeight: 1.45, alignItems: "flex-start" }}><Icon name="check" size={18} stroke={2.2} color={p.hl ? "#F08A4B" : "#1E6B3A"} />{x}</li>)}
                  </ul>
                  <Link className={`btn ${p.hl ? "btn-p" : "btn-s"}`} href={p.cta === "See services" ? "/services" : "/#contact"} style={{ marginTop: "auto" }}>{p.cta}</Link>
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
          <div className="grid cols-3">
            {TESTS.map(([q, r]) => (
              <figure key={r} className="card stack g20" style={{ padding: 28 }}>
                <blockquote style={{ fontSize: 17, lineHeight: 1.55 }}>{q}</blockquote>
                <figcaption className="row g12" style={{ marginTop: "auto" }}><span className="av" style={{ width: 40, height: 40 }}>··</span><span className="stack" style={{ gap: 2 }}><strong style={{ fontSize: 14.5 }}>[Customer name]</strong><span className="mut" style={{ fontSize: 13 }}>{r}</span></span></figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="faq" className="section wrap two-col">
          <div className="stack g16"><span className="eb">FAQ</span><h2 className="d h-2">Questions we hear every day</h2><p className="mut" style={{ fontSize: 16, lineHeight: 1.6 }}>Still unsure? <Link href="/start/criminal-record-certificate">Ask an agent</Link> — it’s free to ask.</p></div>
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
            <div className="stack g14"><h2 className="d" style={{ fontSize: "clamp(30px, 4vw, 52px)", lineHeight: 1.04, color: "#fff" }}>Tell us what you need.<br />We’ll handle the rest.</h2><p style={{ fontSize: 18, color: "#FFE9DC", lineHeight: 1.5 }}>Most requests start in under three minutes. An agent contacts you within 2 working hours.</p></div>
            <div className="stack g12"><Link className="btn btn-d btn-lg" href="/services">Start a Service <Icon name="arrow" size={18} /></Link><a className="btn btn-lg btn-ghost-light" href="#contact">WhatsApp an agent</a></div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
