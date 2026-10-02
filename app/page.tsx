import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Icon, Plate } from "@/components/ui";
import { listServices } from "@/lib/repo";
import { oursLabel, rwf } from "@/lib/format";
import { OFFICES } from "@/lib/institutions";
import { SITE, whatsappUrl } from "@/lib/site";
import type { Service } from "@/lib/types";

/** One example request, shown as the route it travels. The current stop is the only gold thing in the hero. */
const ROUTE: { title: string; meta: string; state: "done" | "now" | "next" }[] = [
  { title: "You told us what you need", meta: "Monday at 09:12", state: "done" },
  { title: "Documents checked", meta: "Monday at 14:30, all 3 accepted", state: "done" },
  { title: "Submitted to RDB", meta: "Today at 09:40, RDB reference RDB-APP-778120", state: "now" },
  { title: "Certificate delivered", meta: "Usually 1 to 2 working days", state: "next" },
];

const FILED_WITH: Record<string, string> = { rdb: "RDB", tax: "RRA", ebm: "RRA", land: "NLA, on Irembo", rura: "RURA", irembo: "Irembo" };
const PRICE_LIST = ["company-registration", "monthly-tax-declarations", "ebm-installation", "e-title", "rura-vehicle-authorisation"];

const STEPS = [
  ["Tell us what you need", "Pick a service, or describe your situation in English, Kinyarwanda or French. Asking is free."],
  ["We check every document", "You hear exactly what is missing before anything is filed. Most rejections start here."],
  ["We file it and follow up", "Through the official channel. We share the reference number and chase it if it stalls."],
  ["You get the result", "The certificate and the official receipt arrive in your account and on WhatsApp."],
];

const VOWS = [
  ["file-text", "Official receipts, always", "Every official payment comes with the institution’s own receipt, in your name, in your account."],
  ["lock", "Your documents stay private", "Only the agent handling your request can open them. We delete them on request once the work is done."],
  ["user", "One agent, start to finish", "The same person handles your request from start to finish, and you can call or message them directly."],
];

const FAQS = [
  ["Are you part of the government or Irembo?", "No. Inzira is a private, independent company. We use the official channels on your behalf: Irembo, RRA, RDB, RURA and others. Every decision is made by the institution."],
  ["Why are there two fees?", "The official fee or tax goes to the institution, exactly as they set it, and often you pay it to them directly. Our fee pays for checking, preparing, filing and following up. You see both lines before you pay."],
  ["Can you guarantee my application is approved?", "No one can; only the institution decides. We make sure your request is complete and correct when it is filed, and we follow it up."],
  ["Can you help with a service that isn’t listed?", "Often, especially if it is done online. Tell us what you need: we agree the process and our fee with you before we start."],
  ["What if I don’t know which service I need?", "Describe your situation. An agent tells you which procedure applies, what it costs and what you need, before you commit to anything."],
];

/** "From RWF 5,000" across an office's services, or the exact price when it offers only one. */
function feeFrom(list: Service[]): { label: string; value: string } | null {
  const paid = list.filter((s) => s.ours > 0).sort((a, b) => a.ours - b.ours);
  if (!paid.length) return null;
  return paid.length === 1 ? { label: "Our fee", value: oursLabel(paid[0]) } : { label: "Our fee from", value: rwf(paid[0].ours) };
}

function CaseCard() {
  return (
    <figure className="ex" aria-label="Example: a company registration on its way through RDB">
      <div className="ex-head">
        <span className="stack" style={{ gap: 4 }}>
          <strong className="ex-title">Company registration</strong>
          <span className="ex-sub">For Umucyo Tech Ltd</span>
        </span>
        <span className="ex-sub fig nowrap">Case INZ-0612</span>
      </div>
      <ol className="ex-stops">
        {ROUTE.map((s) => (
          <li key={s.title} className={`ex-stop is-${s.state}`} aria-current={s.state === "now" ? "step" : undefined}>
            <span className="ex-dot" aria-hidden="true">{s.state === "done" && <Icon name="check" size={13} stroke={3} />}</span>
            <span className="stack" style={{ gap: 3 }}>
              <strong className="ex-step">{s.title}{s.state === "now" && <span className="ex-here">You are here</span>}</strong>
              <span className="ex-meta">{s.meta}</span>
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="ex-bill">
        <span className="row between g12"><span className="ex-soft">Official fee, paid by you to RDB</span><strong>Set by RDB</strong></span>
        <span className="row between g12"><span className="ex-soft">Inzira service fee</span><strong className="fig">RWF 10,000</strong></span>
        <span className="ex-agent"><Icon name="user" size={18} />One agent follows it from start to finish</span>
      </figcaption>
    </figure>
  );
}

export default async function Home() {
  const services = await listServices();
  const priced = PRICE_LIST.map((slug) => services.find((s) => s.slug === slug)).filter((s): s is Service => !!s);
  return (
    <>
      <PublicNav />
      <main className="home">
        <section className="hero wrap" aria-labelledby="hero-h">
          <div className="stack g24 hero-copy">
            <p className="hero-for">For business owners and professionals in Rwanda</p>
            <h1 id="hero-h" className="d h-hero">Government paperwork, handled while you work.</h1>
            <p className="lead" style={{ maxWidth: 560 }}>Company registration, taxes, EBM, land titles and transport permits. One agent checks your documents, files them through the official channel, follows up and sends you the result.</p>
            <div className="row g12 wrapx m-col">
              <Link className="btn btn-p btn-lg" href="/services">Start a request</Link>
              <Link className="btn btn-s btn-lg" href="#prices">See services and prices</Link>
            </div>
            <ul className="hero-facts">
              <li><Icon name="clock" size={18} />Reply within {SITE.responseTime}</li>
              <li><Icon name="file-text" size={18} />Official receipts in your name</li>
              <li><Icon name="phone" size={18} />Pay by MTN MoMo or Airtel Money</li>
            </ul>
          </div>
          <CaseCard />
        </section>

        <section id="services" className="band" aria-labelledby="offices-h">
          <div className="wrap stack g32">
            <div className="band-head">
              <div className="stack g14" style={{ maxWidth: 640 }}>
                <h2 id="offices-h" className="d h-2">The offices we deal with, so you don’t have to.</h2>
                <p className="band-lead">Every request is filed through the institution’s own official channel. You get their reference number and their receipt.</p>
              </div>
              <Link className="btn btn-s" href="/services">See all {services.length} services</Link>
            </div>
            <div>
              <div className="dir-cols" aria-hidden="true"><span>Institution</span><span /><span>What we do there</span><span>Our fee</span><span /></div>
              <ul className="dir">
                {OFFICES.map((o) => {
                  const list = services.filter((s) => (o.cats as readonly string[]).includes(s.category));
                  const fee = feeFrom(list);
                  return (
                    <li key={o.code}>
                      <Link href={o.href} className="dir-row">
                        <Plate code={o.code} />
                        <span className="stack" style={{ gap: 4, minWidth: 0 }}>
                          <strong className="dir-name">{o.name}</strong>
                          <span className="mut dir-area">{o.area}{list.length > 1 ? `, ${list.length} services` : ""}</span>
                        </span>
                        <span className="dir-does">{o.does}</span>
                        <span className="dir-fee">{fee && <><span className="mut">{fee.label}</span><strong className="fig">{fee.value}</strong></>}</span>
                        <Icon name="right" size={20} color="var(--muted)" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="hint" style={{ marginTop: 20, maxWidth: 720 }}>Inzira is a private, independent company. We are not part of these institutions and do not speak for them. Their names appear here only to tell you where your request is filed.</p>
            </div>
          </div>
        </section>

        <section id="how" className="section wrap stack g40" aria-labelledby="how-h">
          <div className="stack g14" style={{ maxWidth: 640 }}>
            <h2 id="how-h" className="d h-2">Four steps. You only do the first one.</h2>
            <p className="band-lead">You approve every fee before anything is paid, and you can see where your request is at any time.</p>
          </div>
          <ol className="steps4">
            {STEPS.map(([t, d], i) => (
              <li key={t}>
                <span className="steps4-mark"><span className={`steps4-n ${i === STEPS.length - 1 ? "is-end" : ""}`}>{i + 1}</span>{i < STEPS.length - 1 && <span className="steps4-line" aria-hidden="true" />}</span>
                <h3 className="steps4-t">{t}</h3>
                <p className="mut steps4-d">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="prices" className="band" aria-labelledby="prices-h">
          <div className="wrap price-grid">
            <div className="stack g18">
              <h2 id="prices-h" className="d h-2">Two lines on every bill. Always.</h2>
              <p className="band-lead">The official fee is set by the institution and usually paid by you, directly to them, with the receipt in your name. When it passes through us, it is never marked up.</p>
              <p className="band-lead">Our fee is fixed and agreed before we start. Nothing is added later.</p>
              <div className="two-lines">
                <span className="row between g12"><span>Official fee, to the institution</span><strong>Shown before you pay</strong></span>
                <span className="row between g12"><span>Inzira service fee</span><strong>Fixed, from the list</strong></span>
              </div>
            </div>
            <div>
              <table className="price-table">
                <caption>Our fee for the most requested services</caption>
                <thead><tr><th scope="col">Service</th><th scope="col">Filed with</th><th scope="col" className="num">Our fee</th></tr></thead>
                <tbody>
                  {priced.map((s) => (
                    <tr key={s.slug}>
                      <td><Link href={`/services/${s.slug}`} className="price-link">{s.name}</Link></td>
                      <td className="mut">{FILED_WITH[s.category] ?? ""}</td>
                      <td className="num"><strong className="fig">{rwf(s.ours)}</strong>{s.oursUnit && <span className="mut price-unit">{s.oursUnit}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint" style={{ marginTop: 16 }}>Something not listed? <Link href="/start">Tell us what you need</Link>. We agree the process and our fee with you before any work starts.</p>
            </div>
          </div>
        </section>

        <section id="about" className="section wrap" aria-labelledby="about-h">
          <div className="trust-grid">
            <div className="stack g18">
              <h2 id="about-h" className="d h-2">Check us before you hand anything over.</h2>
              <p className="band-lead">Inzira is a registered Rwandan company with an office in {SITE.city} you can walk into. Every detail here can be checked.</p>
              <p className="band-lead">We are not Irembo, RRA, RDB, RURA, the National Land Authority or any government institution. You can always do these requests yourself. We save you the queues, the forms and the follow-up.</p>
            </div>
            <dl className="record">
              <div><dt>Registered name</dt><dd>{SITE.legalName}</dd></div>
              <div><dt>Company code</dt><dd className="fig">{SITE.companyCode}</dd></div>
              <div><dt>Tax number (TIN)</dt><dd className="fig">{SITE.tin}</dd></div>
              <div><dt>Office</dt><dd>{SITE.address}, {SITE.city}</dd></div>
              <div><dt>Opening hours</dt><dd>{SITE.hours}</dd></div>
              <div><dt>Phone and WhatsApp</dt><dd className="fig">{SITE.phone}</dd></div>
            </dl>
          </div>
          <div className="vows">
            {VOWS.map(([i, t, d]) => (
              <div key={t} className="stack g10"><Icon name={i} size={24} color="var(--brand)" /><h3 className="steps4-t">{t}</h3><p className="mut steps4-d">{d}</p></div>
            ))}
          </div>
        </section>

        <section id="faq" className="band" aria-labelledby="faq-h">
          <div className="wrap two-col">
            <div className="stack g14"><h2 id="faq-h" className="d h-2">Before you start</h2><p className="band-lead">Something else? <Link href="/start">Ask an agent</Link>. Asking is free.</p></div>
            <div style={{ borderTop: "1px solid var(--line)" }}>
              {FAQS.map(([q, a], i) => (
                <details key={q} open={i === 0} style={{ borderBottom: "1px solid var(--line)", padding: "22px 0" }}>
                  <summary className="row between g16" style={{ fontWeight: 600, fontSize: 17.5 }}>{q}<span className="chev"><Icon name="down" size={20} /></span></summary>
                  <p className="mut" style={{ fontSize: 16, lineHeight: 1.65, marginTop: 12, maxWidth: 720 }}>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="wrap" style={{ paddingTop: 72, paddingBottom: 96 }} aria-labelledby="cta-h">
          <div className="cta-band">
            <div className="stack g14"><h2 id="cta-h" className="d" style={{ fontSize: "clamp(30px, 4vw, 48px)", lineHeight: 1.05, color: "#fff" }}>Hand over the paperwork. Keep your day.</h2><p style={{ fontSize: 18, color: "var(--on-dark-2)", lineHeight: 1.5 }}>Asking is free. You approve every fee before you pay anything.</p></div>
            <div className="stack g12"><Link className="btn btn-p btn-lg" href="/services">Start a request</Link><Link className="btn btn-lg btn-ghost-light" href={whatsappUrl()}><Icon name="message-square" size={18} />Message us on WhatsApp</Link></div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
