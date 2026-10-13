import PublicNav from "@/components/PublicNav";

/** Shown while the services are read: the page shape, so nothing jumps when they arrive. */
export default function Loading() {
  return (
    <>
      <PublicNav />
      <main id="main" aria-busy="true">
        <section className="cat-head">
          <div className="wrap stack g20">
            <span className="skel" style={{ width: 160, height: 18 }} />
            <span className="skel" style={{ width: "min(420px, 80%)", height: 44 }} />
            <span className="skel" style={{ width: "min(760px, 100%)", height: 56, borderRadius: 16 }} />
          </div>
        </section>
        <section className="wrap cat-body">
          <div className="stack grow">
            {Array.from({ length: 7 }, (_, i) => <span key={i} className="skel" style={{ height: 72, marginBottom: 10, borderRadius: 10 }} />)}
          </div>
        </section>
      </main>
    </>
  );
}
