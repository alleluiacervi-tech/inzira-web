import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <>
      <PublicNav />
      <main className="wrap stack g16" style={{ paddingTop: 96, paddingBottom: 96, alignItems: "flex-start", minHeight: "50vh" }}>
        <span className="eb">404</span>
        <h1 className="d h-1">We couldn’t find that page</h1>
        <p className="mut" style={{ fontSize: 17 }}>It may have moved. Try the service catalogue, or tell us what you need.</p>
        <div className="row g12"><Link className="btn btn-p" href="/services">Browse services</Link><Link className="btn btn-s" href="/">Home</Link></div>
      </main>
      <Footer />
    </>
  );
}
