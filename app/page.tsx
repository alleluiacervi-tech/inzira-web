import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Alert, Icon } from "@/components/ui";
import { listServices } from "@/lib/repo";
import { rwf, shortTime } from "@/lib/format";
import { OFFICES, officeFor } from "@/lib/institutions";
import { isSet, mailUrl, SITE, telUrl } from "@/lib/site";
import { ContactList } from "@/components/Contact";
import type { Service } from "@/lib/types";

/** One example request on its way through RDB. The current step is the only gold thing on the page. */
const CASE_STEPS: { title: string; meta: string; state: "done" | "now" | "next" }[] = [
  { title: "Request received", meta: "Monday, 09:12", state: "done" },
  { title: "Documents checked", meta: "Monday, 14:30. All 3 accepted", state: "done" },
  { title: "Submitted to RDB", meta: "Today, 09:40", state: "now" },
  { title: "Certificate delivered", meta: "Expected in 1 to 2 working days", state: "next" },
];

/** The services most people come for, one or more per institution. */
const FEATURED = ["company-registration", "monthly-tax-declarations", "trading-licence-declaration", "ebm-installation", "e-title", "rura-vehicle-authorisation"];

const STEPS = [
  ["Tell us what you need", "Pick a service, or describe your situation in English, Kinyarwanda or French. Asking is free."],
  ["We check your documents", "You hear exactly what is missing before anything is filed. Most rejections start here."],
  ["We file and follow up", "Through the institution’s official channel. You get the reference number, and we chase it if it stalls."],
  ["You receive the result", "The certificate and the official receipt arrive in your account and on WhatsApp."],
];

const COMMITMENTS = [
  ["file-text", "Official receipts, always", "Every official payment comes with the institution’s own receipt, in your name."],
  ["lock", "Private documents", "Only the person handling your request can open them, and you can delete them once the work is done."],
  ["user", "One person, start to finish", "The same agent handles your request throughout, and you can call or message them directly."],
];

const FAQS = [
  ["Are you part of the government or Irembo?", "No. Inzira is a private, independent company. We use the official channels on your behalf: Irembo, RRA, RDB, RURA and others. Every decision is made by the institution."],
  ["Why are there two fees?", "The official fee or tax goes to the institution, exactly as they set it, and often you pay it to them directly. Our fee pays for checking, preparing, filing and following up. You see both before you pay."],
  ["Can you guarantee my application is approved?", "No one can; only the institution decides. We make sure your request is complete and correct when it is filed, and we follow it up."],
  ["What if my service isn’t listed?", "Tell us what you need. We often help with other online procedures, and we agree the process and our fee with you before we start."],
];

function CaseFile() {
  return (
    <figure className="case" aria-label="Example: a company registration on its way through RDB">
      <div className="case-tab fig">Case INZ-0612</div>
      <div className="case-sheet">
        <header className="case-head">
          <strong className="case-title">Company registration</strong>
          <span className="case-sub">Umucyo Tech Ltd</span>
        </header>
        <ol className="case-steps">
          {CASE_STEPS.map((s) => (
            <li key={s.title} className={`case-step is-${s.state}`} aria-current={s.state === "now" ? "step" : undefined}>
              <span className="case-dot" aria-hidden="true">{s.state === "done" && <Icon name="check" size={12} stroke={3} />}</span>
              <span className="stack" style={{ gap: 2 }}>
                <strong className="case-step-t">{s.title}{s.state === "now" && <span className="sr-only"> (current step)</span>}</strong>
                <span className="case-meta">{s.meta}</span>
              </span>
            </li>
          ))}
        </ol>
        <footer className="case-ref">
          <span className="stack" style={{ gap: 2 }}>
            <span className="case-meta">RDB reference</span>
            <strong className="fig">RDB-APP-778120</strong>
          </span>
          <span className="case-filed"><Icon name="check" size={14} stroke={2.6} />Filed</span>
        </footer>
      </div>
    </figure>
  );
}

function ServiceTile({ s }: { s: Service }) {
  const office = officeFor(s.category);
  return (
    <li>
      <Link href={`/services/${s.slug}`} className="tile">
        <span className="tile-top">
          {office && <span className="tile-office">{office.code}</span>}
          <span className="tile-time"><Icon name="clock" size={14} />{shortTime(s.time)}</span>
        </span>
        <span className="stack" style={{ gap: 4 }}>
          <strong className="tile-name">{s.name}</strong>
          <span className="tile-aka">{s.aka ?? s.via}</span>
        </span>
        <span className="tile-foot">
          <span className="stack" style={{ gap: 1 }}>
            <span className="tile-label">Our fee</span>
            <span><strong className="tile-fee fig">{rwf(s.ours)}</strong>{s.oursUnit && <span className="tile-unit"> {s.oursUnit}</span>}</span>
          </span>
          <span className="tile-go" aria-hidden="true"><Icon name="right" size={18} /></span>
        </span>
      </Link>
    </li>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const deleted = (await searchParams).account === "deleted";
  const services = await listServices();
  const featured = FEATURED.map((slug) => services.find((s) => s.slug === slug)).filter((s): s is Service => !!s);
  const example = services.find((s) => s.slug === "company-registration");
  const record: [string, string, string?][] = ([
    ["Registered name", SITE.legalName],
    ["Company code", SITE.companyCode],
    ["Tax number (TIN)", SITE.tin],
    ["Office", isSet(SITE.address) ? `${SITE.address}, ${SITE.city}` : `${SITE.city}, Rwanda`],
    ["Phone and WhatsApp", SITE.phone, telUrl()],
    ["Email", SITE.email, mailUrl()],
    ["Opening hours", SITE.hours.replace(" · ", ", ")],
    ["Replies", `Within ${SITE.responseTime}`],
  ] as [string, string, string?][]).filter(([, v]) => isSet(v));

  return (
    <>
      <PublicNav />
      <main className="home">
        {deleted && <div className="wrap" style={{ paddingTop: 20, paddingBottom: 20 }}><Alert kind="ok" title="Your account is deleted" live>Your details and documents are gone. Payment records stay, without your name or number.</Alert></div>}

        <section className="top" aria-labelledby="hero-h">
          <div className="wrap top-grid">
            <div className="top-copy">
              <h1 id="hero-h" className="h-hero">Government paperwork, handled for you.</h1>
              <p className="top-lead">Company registration, taxes, EBM, land titles and RURA permits for businesses in Rwanda. We check your documents, file them through the official channel and follow up until it’s done.</p>
              <div className="top-ctas">
                <Link className="btn btn-p btn-lg" href="/services">Start a request</Link>
                <Link className="btn btn-ghost-light btn-lg" href="#services">See services and fees</Link>
              </div>
              <ul className="top-facts">
                <li><Icon name="clock" size={17} />Reply within {SITE.responseTime}</li>
                <li><Icon name="file-text" size={17} />Official receipts in your name</li>
                <li><Icon name="phone" size={17} />MTN MoMo or Airtel Money</li>
              </ul>
            </div>
            <CaseFile />
          </div>
          <div className="wrap">
            <div className="filed">
              <span className="filed-label">We file with</span>
              <ul className="filed-list">
                {OFFICES.map((o) => <li key={o.code}><abbr title={o.name}>{o.code}</abbr></li>)}
              </ul>
              <span className="filed-note">Independent company. Not part of, or endorsed by, these institutions.</span>
            </div>
          </div>
        </section>

        <section id="services" className="sec" aria-labelledby="services-h">
          <div className="wrap stack g32">
            <header className="sec-head">
              <div className="stack g12">
                <h2 id="services-h" className="h-2">What we handle</h2>
                <p className="sec-lead">A fixed fee for each service, agreed before we start. The official fee is always shown separately.</p>
              </div>
              <Link className="btn btn-s m-hide" href="/services">All {services.length} services</Link>
            </header>
            <ul className="tiles">{featured.map((s) => <ServiceTile key={s.slug} s={s} />)}</ul>
            <Link className="btn btn-s btn-lg d-hide" href="/services">See all {services.length} services</Link>
            <nav className="offices" aria-label="Services by institution">
              <span className="offices-label">Browse by institution</span>
              <div className="offices-list">
                {OFFICES.map((o) => {
                  const n = services.filter((s) => (o.cats as readonly string[]).includes(s.category)).length;
                  return (
                    <Link key={o.code} href={o.href} className="office">
                      <strong>{o.code}</strong><span>{o.area}</span>{n > 1 && <span className="office-n fig">{n}</span>}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
        </section>

        <section id="how" className="sec sec-ledger" aria-labelledby="how-h">
          <div className="wrap stack g40">
            <div className="stack g12" style={{ maxWidth: 620 }}>
              <h2 id="how-h" className="h-2">How it works</h2>
              <p className="sec-lead">Four steps, and only the first one needs you. You approve every fee before anything is paid.</p>
            </div>
            <ol className="steps4">
              {STEPS.map(([t, d], i) => (
                <li key={t}>
                  <span className="steps4-mark"><span className="steps4-n">{i + 1}</span>{i < STEPS.length - 1 && <span className="steps4-line" aria-hidden="true" />}</span>
                  <h3 className="steps4-t">{t}</h3>
                  <p className="steps4-d">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="prices" className="sec" aria-labelledby="prices-h">
          <div className="wrap split2">
            <div className="stack g20">
              <h2 id="prices-h" className="h-2">Two fees, both shown before you pay.</h2>
              <p className="sec-lead">The official fee is set by the institution. Usually you pay it to them directly, and the receipt is in your name. When it passes through us, it is never marked up.</p>
              <ul className="checks">
                <li><Icon name="check" size={18} stroke={2.4} />Our fee is fixed and listed for every service</li>
                <li><Icon name="check" size={18} stroke={2.4} />Nothing is added after you approve</li>
                <li><Icon name="check" size={18} stroke={2.4} />A receipt for every payment, by MoMo or Airtel Money</li>
              </ul>
            </div>
            <figure className="quote" aria-labelledby="quote-cap">
              <header className="quote-head"><strong>Company registration</strong><span className="mut">Example quote</span></header>
              <div className="quote-row">
                <span className="stack" style={{ gap: 3 }}><strong>Official fee</strong><span className="mut">Paid by you to RDB, receipt in your name</span></span>
                <span className="quote-amt">Set by RDB</span>
              </div>
              <div className="quote-row">
                <span className="stack" style={{ gap: 3 }}><strong>Inzira service fee</strong><span className="mut">Checking, filing and follow-up</span></span>
                <span className="quote-amt fig">{rwf(example?.ours ?? 10000)}</span>
              </div>
              <div className="quote-total"><span>You pay Inzira</span><strong className="fig">{rwf(example?.ours ?? 10000)}</strong></div>
              <figcaption id="quote-cap" className="quote-cap">Every service page shows both fees before you start.</figcaption>
            </figure>
          </div>
        </section>

        <section id="about" className="sec sec-ledger" aria-labelledby="about-h">
          <div className="wrap stack" style={{ gap: "clamp(40px, 5vw, 64px)" }}>
            <div className="split2">
              <div className="stack g20">
                <h2 id="about-h" className="h-2">Check who you’re dealing with.</h2>
                <p className="sec-lead">Inzira is a registered Rwandan company with an office in {SITE.city}. You can always do these procedures yourself; we save you the queues, the forms and the follow-up.</p>
              </div>
              <dl className="record">
                {record.map(([k, v, href]) => <div key={k}><dt>{k}</dt><dd className={k === "Company code" || k === "Tax number (TIN)" || k === "Phone and WhatsApp" ? "fig" : undefined}>{href ? <a href={href}>{v}</a> : v}</dd></div>)}
              </dl>
            </div>
            <ul className="commit">
              {COMMITMENTS.map(([i, t, d]) => (
                <li key={t}><span className="commit-ico"><Icon name={i} size={20} /></span><span className="stack g6"><strong>{t}</strong><span className="mut">{d}</span></span></li>
              ))}
            </ul>
          </div>
        </section>

        <section id="faq" className="sec" aria-labelledby="faq-h">
          <div className="wrap two-col">
            <div className="stack g12"><h2 id="faq-h" className="h-2">Questions</h2><p className="sec-lead">Something else? <Link href="#talk">Talk to us</Link>. Asking is free.</p></div>
            <div className="faq">
              {FAQS.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}<span className="chev"><Icon name="down" size={20} /></span></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="talk" className="close" aria-labelledby="cta-h">
          <div className="wrap close-grid">
            <div className="stack g20">
              <h2 id="cta-h" className="h-2">Talk to a person before you start.</h2>
              <p className="sec-lead">Asking is free. Tell us what you need on WhatsApp, by phone or by email, and we’ll tell you the procedure, the documents and both fees. You approve every fee before you pay.</p>
              <div className="close-ctas">
                <Link className="btn btn-p btn-lg" href="/services">Start a request</Link>
                <Link className="btn btn-s btn-lg" href="/start">Describe your situation</Link>
              </div>
            </div>
            <div className="contact-card">
              <ContactList />
              <p className="contact-hours"><Icon name="clock" size={16} />{SITE.hours.replace(" · ", ", ")}. Replies within {SITE.responseTime}.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
