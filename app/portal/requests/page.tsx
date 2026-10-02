import Link from "next/link";
import { Icon, PageHead, RequestRow } from "@/components/ui";
import { listMyRequests } from "@/lib/repo";
import { isOpen } from "@/lib/status";

export const metadata = { title: "My requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [sp, all] = await Promise.all([searchParams, listMyRequests()]);
  const q = (sp.q ?? "").trim();
  const term = q.toLowerCase();
  const requests = term ? all.filter((r) => [r.ref, r.name, r.service.name, r.profile.name, r.officialRef].join(" ").toLowerCase().includes(term)) : all;
  const groups: [string, typeof requests][] = [
    ["Needs your action", requests.filter((r) => isOpen(r) && r.hold)],
    ["In progress", requests.filter((r) => isOpen(r) && !r.hold)],
    ["Finished", requests.filter((r) => !isOpen(r))],
  ];

  return (
    <>
      <PageHead title="My requests" sub={q ? `${requests.length} matching “${q}”` : `${all.filter(isOpen).length} open · ${all.length} in total`}>
        <form action="/portal/requests" role="search" className="card row g8" style={{ padding: "0 12px", height: 40, width: 280, maxWidth: "100%" }}>
          <Icon name="search" size={18} /><label htmlFor="rq" className="sr-only">Search your requests</label>
          <input id="rq" name="q" defaultValue={q} placeholder="Search requests or references" style={{ border: 0, outline: 0, fontSize: 14, width: "100%" }} />
        </form>
        <Link className="btn btn-s btn-sm m-hide" href="/services" style={{ height: 40 }}><Icon name="plus" size={18} /> Start a new request</Link>
      </PageHead>
      <div className="content">
        {groups.filter(([, list]) => list.length).map(([title, list]) => (
          <section key={title} className="card" aria-label={title}>
            <div className="card-head"><h2 className="d" style={{ fontSize: 19 }}>{title}</h2><span className="mut" style={{ fontSize: 13 }}>{list.length}</span></div>
            {list.map((r) => <RequestRow key={r.ref} r={r} />)}
          </section>
        ))}
        {requests.length === 0 && (
          <div className="card stack g12" style={{ padding: "40px 24px", alignItems: "center", textAlign: "center" }}>
            <strong>{q ? "No request matches that search" : "You haven’t started a request yet"}</strong>
            <span className="hint" style={{ maxWidth: 380 }}>{q ? "Try the reference from your SMS, e.g. INZ-2026-04817, or the name of the service." : "Pick a service, or describe what you need and an agent will tell you which procedure applies."}</span>
            <div className="row g8 wrapx" style={{ justifyContent: "center" }}>{q && <Link className="btn btn-s btn-sm" href="/portal/requests">Show all requests</Link>}<Link className="btn btn-p btn-sm" href="/services">Browse services</Link></div>
          </div>
        )}
      </div>
    </>
  );
}
