import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Alert, Icon } from "@/components/ui";
import { listServices } from "@/lib/repo";
import { OFFICES } from "@/lib/institutions";
import { SITE } from "@/lib/site";
import { ContactList } from "@/components/Contact";
import { PriceList } from "@/components/PriceList";

/** One example request on its way through RDB. The current step is the only gold thing on the page. */
const CASE_STEPS: { title: string; meta: string; state: "done" | "now" | "next" }[] = [
  { title: "Request received", meta: "Monday, 09:12", state: "done" },
  { title: "Documents checked", meta: "Monday, 14:30. All 3 accepted", state: "done" },
  { title: "Submitted to RDB", meta: "Today, 09:40", state: "now" },
  { title: "Certificate delivered", meta: "Expected in 1 to 2 working days", state: "next" },
];

const STEPS = [
  ["Tell us what you need", "Pick a service, or describe your situation in English, Kinyarwanda or French. Asking is free."],
  ["We check your documents", "You hear exactly what is missing before anything is filed. Most rejections start here."],
  ["We file and follow up", "Through the institution’s official channel. You get the reference number, and we chase it if it stalls."],
  ["You receive the result", "The certificate and the official receipt arrive in your account and on WhatsApp."],
];

const FAQS = [
  ["Who is Inzira?", `${SITE.legalName} is a private Rwandan company in ${SITE.city}. Our team prepares, files and follows up government procedures for businesses and professionals who would rather spend their time on their work. You can always do these procedures yourself; we save you the queues, the forms and the follow-up.`],
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

export default async function Home({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const deleted = (await searchParams).account === "deleted";
  const services = await listServices();

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
                <Link className="btn btn-ghost-light btn-lg" href="#prices">See services and fees</Link>
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

        <section id="prices" className="sec" aria-labelledby="prices-h">
          <div className="wrap fees">
            <header className="fees-head">
              <h2 id="prices-h" className="h-2">Services and fees</h2>
              <p className="sec-lead">Our fee for each service is fixed and agreed before we start.</p>
              <p className="fees-note">The official fee is set by the institution and shown on each service before you pay. Usually you pay it to them directly, with the receipt in your name. When it passes through us, it is never marked up.</p>
              <div className="fees-ctas m-hide">
                <Link className="btn btn-p" href="/services">Start a request</Link>
                <Link className="btn btn-s" href="/start">My service isn’t listed</Link>
              </div>
            </header>
            <div className="stack g24">
              <PriceList services={services} />
              <div className="fees-ctas d-hide">
                <Link className="btn btn-p btn-lg" href="/services">Start a request</Link>
                <Link className="btn btn-s btn-lg" href="/start">My service isn’t listed</Link>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="sec sec-ledger" aria-labelledby="how-h">
          <div className="wrap stack g40">
            <div className="stack g12" style={{ maxWidth: 620 }}>
              <h2 id="how-h" className="h-2">How it works</h2>
              <p className="sec-lead">Four steps, and only the first one needs you. One person handles your request from start to finish.</p>
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
              <p className="sec-lead">Tell us what you need on WhatsApp, by phone or by email. We’ll tell you the procedure, the documents and both fees, free and before you commit.</p>
              <div className="close-ctas">
                <Link className="btn btn-p btn-lg" href="/services">Start a request</Link>
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
