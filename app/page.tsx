import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { FeeTag, Icon, ServiceCard } from "@/components/ui";
import { listCategories, listServices } from "@/lib/repo";
import { SITE, whatsappUrl } from "@/lib/site";

/** One real request, shown as the route it travels. The current stop is the only yellow thing in the hero. */
const ROUTE: { title: string; meta: string; state: "done" | "now" | "next" }[] = [
  { title: "You tell us what you need", meta: "Monday 09:12 · Company registration for Umucyo Tech Ltd", state: "done" },
  { title: "Your documents are checked", meta: "Monday 14:30 · Grace confirmed all 3 documents", state: "done" },
  { title: "Submitted to RDB", meta: "Today 09:40 · RDB reference RDB-APP-778120", state: "now" },
  { title: "Certificate delivered", meta: "Usually 1–2 working days, to your portal and WhatsApp", state: "next" },
];

const STEPS = [
  ["Tell us what you need", "Pick a service, or describe your situation in English, Kinyarwanda or French. Asking is free."],
  ["We check every document", "Your agent tells you exactly what is missing before anything is filed. Most rejections start here."],
  ["We file it and follow up", "We submit through the right official channel and chase it. You can see where it is at any time."],
  ["You get the result", "Certificates and receipts arrive in your portal and on WhatsApp, with the official receipt attached."],
];

const PROMISES = [
  ["shield", "Two fees, never blended", "The official fee and our fee are separate lines on every quote, invoice and receipt."],
  ["user", "One named agent", "The same person handles your request from start to finish. You can call or WhatsApp them."],
  ["check", "Checked before it is filed", "We review every document against the institution's list before anything is submitted."],
  ["lock", "Private by default", "Only your agent sees your documents, and we delete them on request once the work is done."],
];

const PLANS = [
  { name: "One service", price: "From RWF 1,000", unit: "our fee", desc: "One request with a clear price before you start.", items: ["Official fee shown on its own line", "Documents checked before filing", "A named agent and WhatsApp updates", "Pay with MTN MoMo or Airtel Money"], cta: "Browse services", href: "/services", hl: false },
  { name: "Monthly tax declarations", price: "RWF 30,000", unit: "a month", desc: "For businesses that declare PAYE, income tax and other taxes every month.", items: ["Every monthly declaration prepared and filed", "We tell you each amount before the deadline", "You pay taxes straight to RRA, never through us", "One agent who knows your business"], cta: "Set up monthly declarations", href: "/services/monthly-tax-declarations", hl: true },
  { name: "Something else online", price: "Agreed first", unit: "before we start", desc: "Another online government service? Tell us which one.", items: ["We confirm the process with you", "You agree our fee before work starts", "The official fee still has its own line", "Same tracking and named agent"], cta: "Describe your situation", href: "/start", hl: false },
];

const FAQS = [
  ["Are you part of the government or Irembo?", "No. Inzira is a private, independent company. We help you use the official channels — Irembo, RRA, RDB, RURA and others — correctly. Every decision is made by the institution."],
  ["Why are there two fees?", "The official fee or tax goes to the institution, exactly as they set it, and often you pay it to them directly. Our fee pays for checking, preparing, filing and following up. You see both lines before you pay."],
  ["Can you guarantee my application is approved?", "No one can; only the institution decides. We make sure your request is complete and correct when it is filed, and we follow it up."],
  ["Can you help with a service that isn't listed?", "Often, especially if it is done online. Tell us what you need: we agree the process and our fee with you before we start."],
  ["What if I don't know which service I need?", "Describe your situation. An agent tells you which procedure applies, what it costs and what you need, before you commit to anything."],
];

const POPULAR = ["company-registration", "monthly-tax-declarations", "e-title", "ebm-installation"];

function Route() {
  return (
    <figure className="route" aria-label="Example: a company registration on its way through RDB">
      <ol className="route-stops">
        {ROUTE.map((s) => (
          <li key={s.title} className={`route-stop is-${s.state}`} aria-current={s.state === "now" ? "step" : undefined}>
            <span className="route-dot" aria-hidden="true">{s.state === "done" && <Icon name="check" size={13} stroke={2.8} />}</span>
            <span className="stack" style={{ gap: 4 }}>
              <strong className="route-title">{s.title}{s.state === "now" && <span className="route-here">You are here</span>}</strong>
              <span className="route-meta">{s.meta}</span>
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="route-bill">
        <span className="row between g12"><span className="row g8"><FeeTag kind="official" /> Paid to RDB</span><strong>Set by RDB</strong></span>
        <span className="row between g12"><span className="row g8"><FeeTag kind="ours" /> Our fee</span><strong className="fee-ours">RWF 10,000</strong></span>
        <span className="route-agent"><span className="av" aria-hidden="true">GI</span>Grace Ingabire is your agent</span>
      </figcaption>
    </figure>
  );
}

export default async function Home() {
  const [services, categories] = await Promise.all([listServices(), listCategories()]);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const popular = services.filter((s) => POPULAR.includes(s.slug)).sort((a, b) => POPULAR.indexOf(a.slug) - POPULAR.indexOf(b.slug));
  return (
    <>
      <PublicNav />
      <main className="home">
        <section className="hero wrap">
          <div className="stack g24 hero-copy">
            <h1 className="d h-hero">Your paperwork, walked for you.</h1>
            <p className="lead" style={{ maxWidth: 560 }}>Tell us what you need from RDB, RRA, the land office, RURA or Irembo. A named agent checks your documents, files them, follows up and sends you the result.</p>
            <div className="row g12 wrapx m-col">
              <Link className="btn btn-p btn-lg" href="/services">Start a request</Link>
              <Link className="btn btn-s btn-lg" href="/start">Describe your situation</Link>
            </div>
            <form action="/services" className="card searchbox" style={{ maxWidth: 560 }} role="search">
              <Icon name="search" size={22} />
              <label htmlFor="hs" className="sr-only">Which service do you need?</label>
              <input id="hs" name="q" placeholder="Which service? For example, register my company" />
              <button className="btn btn-d m-hide" type="submit">Search</button>
            </form>
            <p className="row g8 hint" style={{ alignItems: "flex-start" }}><Icon name="shield" size={18} color="var(--brand-2)" /><span>An independent company in {SITE.city}. Not a government office: official fees go to the institution, and you see them before you pay.</span></p>
          </div>
          <Route />
        </section>

        <div className="trail">
          <section className="section wrap stop" aria-labelledby="offices-h">
            <div className="stop-head">
              <h2 id="offices-h" className="d h-2">One place to start, whichever office it is</h2>
              <p className="mut" style={{ fontSize: 17, maxWidth: 620 }}>Each service lists the documents you need, how long it usually takes and both fees.</p>
            </div>
            <ul className="offices">
              {categories.map((c) => {
                const n = services.filter((s) => s.category === c.id).length;
                return (
                  <li key={c.id}>
                    <Link href={c.href ?? `/services?category=${c.id}`} className="office">
                      <span className="office-ico"><Icon name={c.icon} size={22} /></span>
                      <span className="stack grow" style={{ gap: 3, minWidth: 0 }}>
                        <strong className="office-name">{c.name}</strong>
                        <span className="mut office-desc">{c.desc}</span>
                      </span>
                      <span className="office-count">{c.href ? "Ask us" : `${n} ${n === 1 ? "service" : "services"}`}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section id="how" className="wrap stop" aria-labelledby="how-h">
            <div className="how">
              <h2 id="how-h" className="d h-2" style={{ color: "var(--on-dark)", maxWidth: 640 }}>How a request travels</h2>
              <ol className="how-route">
                {STEPS.map(([t, d]) => (
                  <li key={t} className="how-step"><span className="how-dot" aria-hidden="true" /><h3 className="d" style={{ fontSize: 21, color: "var(--on-dark)" }}>{t}</h3><p style={{ fontSize: 15.5, lineHeight: 1.6, color: "var(--on-dark-2)" }}>{d}</p></li>
                ))}
              </ol>
              <div className="row g12 wrapx"><Link className="btn btn-p" href="/services">Start a request</Link><Link className="btn btn-ghost-light" href="/track">Track a request</Link></div>
            </div>
          </section>

          <section className="section wrap stop" aria-labelledby="popular-h">
            <div className="row between g24 wrapx stop-head" style={{ alignItems: "flex-end" }}>
              <h2 id="popular-h" className="d h-2">Most requested</h2>
              <Link className="lnk" href="/services">All {services.length} services</Link>
            </div>
            <div className="grid cols-4 m-scroll">{popular.map((s) => <ServiceCard key={s.slug} s={s} category={catName(s.category)} />)}</div>
            <p className="hint">Official fees are set by each institution. Your agent confirms the exact amount before you pay anything.</p>
          </section>

          <section id="pricing" className="section wrap stop" aria-labelledby="pricing-h">
            <div className="split stop-head" style={{ ["--aside" as string]: "460px", alignItems: "end", gap: 48 }}>
              <div className="stack g14">
                <h2 id="pricing-h" className="d h-2">Two lines on every bill. Always.</h2>
                <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: 560 }}>The official fee is set by the institution and usually paid to them directly. When it passes through us, it is never marked up. Our fee is the only amount we earn.</p>
              </div>
              <div className="bill" aria-label="Example bill for an e-title">
                <span className="bill-head">E-title</span>
                <span className="row between g12"><span className="row g8"><FeeTag kind="official" /> Irembo fee, paid by you on Irembo</span><strong className="nowrap">Shown first</strong></span>
                <span className="row between g12"><span className="row g8"><FeeTag kind="ours" /> Our fee</span><strong className="fee-ours nowrap">RWF 2,000</strong></span>
                <span className="row between g12 bill-total"><strong>You pay Inzira</strong><strong className="d fig" style={{ fontSize: 22 }}>RWF 2,000</strong></span>
              </div>
            </div>
            <div id="business" className="grid cols-3">
              {PLANS.map((p) => (
                <div key={p.name} className={`plan stack g20 ${p.hl ? "plan-hl" : ""}`}>
                  <div className="stack g8"><strong style={{ fontSize: 17 }}>{p.name}</strong><p className="plan-mut" style={{ fontSize: 15, lineHeight: 1.5 }}>{p.desc}</p></div>
                  <div className="row wrapx" style={{ alignItems: "baseline", gap: "2px 8px" }}><span className="d fig nowrap" style={{ fontSize: "clamp(28px, 2.5vw, 36px)" }}>{p.price}</span><span className="plan-mut" style={{ fontSize: 14 }}>{p.unit}</span></div>
                  <ul className="stack g12" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {p.items.map((x) => <li key={x} className="row g10" style={{ fontSize: 15, lineHeight: 1.45, alignItems: "flex-start" }}><Icon name="check" size={18} stroke={2.2} color={p.hl ? "var(--signal)" : "var(--brand-2)"} />{x}</li>)}
                  </ul>
                  <Link className={`btn ${p.hl ? "btn-p" : "btn-s"}`} href={p.href} style={{ marginTop: "auto" }}>{p.cta}</Link>
                </div>
              ))}
            </div>
          </section>

          <section className="section wrap stop" aria-labelledby="why-h">
            <h2 id="why-h" className="d h-2 stop-head" style={{ maxWidth: 720 }}>Help you can check, from people you can reach</h2>
            <div className="promises">
              {PROMISES.map(([i, t, d]) => (
                <div key={t} className="stack g10"><Icon name={i} size={24} color="var(--brand-2)" /><h3 className="d" style={{ fontSize: 19 }}>{t}</h3><p className="mut" style={{ fontSize: 15.5, lineHeight: 1.6 }}>{d}</p></div>
              ))}
            </div>
          </section>

          <section id="faq" className="section wrap stop two-col" aria-labelledby="faq-h">
            <div className="stack g14 stop-head"><h2 id="faq-h" className="d h-2">Questions people ask first</h2><p className="mut" style={{ fontSize: 17, lineHeight: 1.6 }}>Something else? <Link href="/start">Ask an agent</Link>. Asking is free.</p></div>
            <div style={{ borderTop: "1px solid var(--line)" }}>
              {FAQS.map(([q, a], i) => (
                <details key={q} open={i === 0} style={{ borderBottom: "1px solid var(--line)", padding: "22px 0" }}>
                  <summary className="row between g16" style={{ fontWeight: 700, fontSize: 17 }}>{q}<span className="chev"><Icon name="down" size={20} /></span></summary>
                  <p className="mut" style={{ fontSize: 16, lineHeight: 1.65, marginTop: 12, maxWidth: 720 }}>{a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="wrap stop stop-end" style={{ paddingTop: 40, paddingBottom: 96 }} aria-labelledby="cta-h">
            <div className="cta-band">
              <div className="stack g14"><h2 id="cta-h" className="d" style={{ fontSize: "clamp(30px, 4vw, 50px)", lineHeight: 1.05, color: "var(--on-dark)" }}>Tell us what you need.<br />We’ll walk it from there.</h2><p style={{ fontSize: 18, color: "var(--on-dark-2)", lineHeight: 1.5 }}>Most requests take about three minutes to start. An agent contacts you within {SITE.responseTime}.</p></div>
              <div className="stack g12"><Link className="btn btn-p btn-lg" href="/services">Start a request</Link><Link className="btn btn-lg btn-ghost-light" href={whatsappUrl()}>Message us on WhatsApp</Link></div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
