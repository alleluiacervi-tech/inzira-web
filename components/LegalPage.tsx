import Link from "next/link";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";

export function LegalPage({
  title,
  lead,
  sections,
  more,
}: {
  title: string;
  lead: string;
  sections: { title: string; body: string }[];
  more: { href: string; label: string };
}) {
  return (
    <>
      <PublicNav />
      <main id="main" className="legal">
        <article className="wrap legal-in">
          <header className="stack g12">
            <h1 className="h-1">{title}</h1>
            <p className="sec-lead">{lead}</p>
          </header>
          {sections.map((s) => (
            <section key={s.title} className="stack g8">
              <h2 className="h-3">{s.title}</h2>
              <p>{s.body}</p>
            </section>
          ))}
          <p><Link href={more.href}>{more.label}</Link></p>
        </article>
      </main>
      <Footer />
    </>
  );
}
