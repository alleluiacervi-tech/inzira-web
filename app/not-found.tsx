import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import { Icon } from "@/components/ui";

const POPULAR = [["Company registration", "/services/company-registration"], ["Trading licence", "/services/trading-licence-declaration"], ["E-title", "/services/e-title"], ["EBM installation", "/services/ebm-installation"]];

export default function NotFound() {
  return (
    <>
      <PublicNav />
      <main className="wrap stack g24" style={{ paddingTop: "clamp(48px, 9vw, 96px)", paddingBottom: 96, maxWidth: 820, marginLeft: 0 }}>
        <div className="stack g12">
          <span className="eb">Page not found</span>
          <h1 className="d h-1">We couldn’t find that page</h1>
          <p className="lead" style={{ maxWidth: 600 }}>The link may be old or mistyped. Search for the service you need, or pick one people ask for most.</p>
        </div>
        <form action="/services" className="card searchbox" style={{ maxWidth: 600 }} role="search">
          <Icon name="search" size={22} />
          <label htmlFor="nf-q" className="sr-only">What service do you need?</label>
          <input id="nf-q" name="q" placeholder="e.g. “register my company”" />
          <button className="btn btn-p" type="submit">Search</button>
        </form>
        <div className="row g8 wrapx"><span className="mut" style={{ fontSize: 14 }}>Popular:</span>{POPULAR.map(([l, h]) => <Link key={h} className="tag" href={h}>{l}</Link>)}</div>
        <div className="row g12 wrapx" style={{ paddingTop: 8 }}>
          <Link className="btn btn-s" href="/track"><Icon name="search" size={18} /> Track a request</Link>
          <Link className="btn btn-g" href="/">Back to home</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
