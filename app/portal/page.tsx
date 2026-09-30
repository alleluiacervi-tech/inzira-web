import Link from "next/link";
import { Alert, Badge, DocCard, FeeTag, Icon, Kpi, Notif, PageHead } from "@/components/ui";
import { COMPLETED_REQUESTS, CUSTOMER, NOTIFICATIONS, REQUESTS } from "@/lib/data";

export default function PortalHome() {
  const action = REQUESTS.filter((r) => r.yourAction);
  return (
    <>
      <PageHead title={`Mwaramutse, ${CUSTOMER.first}`} sub="Wednesday, 30 September 2026">
        <form action="/portal" role="search" className="card row g8 m-hide" style={{ padding: "0 12px", height: 40, width: 280 }}>
          <Icon name="search" size={18} /><label htmlFor="ps" className="sr-only">Search your requests</label>
          <input id="ps" placeholder="Search requests or references" style={{ border: 0, outline: 0, fontSize: 14, width: "100%" }} />
        </form>
        <Link className="btn btn-p btn-sm m-hide" href="/services" style={{ height: 40 }}><Icon name="plus" size={18} /> Start New Service</Link>
      </PageHead>
      <div className="content">
        {action.map((r) => (
          <Alert key={r.ref} kind="act" title={`${action.length} request needs your action`} action={<Link className="btn btn-p btn-sm" href="/portal/documents">Upload now</Link>}>
            {r.agent.split(" ")[0]} needs a clearer photo of your ID for your {r.service.toLowerCase()}. Nothing will be submitted until it’s fixed.
          </Alert>
        ))}
        <div className="grid cols-4 m-cols-2" style={{ gap: 14 }}>
          <Kpi label="Active requests" value={String(REQUESTS.length)} sub="2 with the institution" icon="list" />
          <Kpi label="Requiring your action" value={String(action.length)} sub="Due today" icon="alert" valueColor="var(--ember-deep)" />
          <Kpi label="Completed" value="7" sub="Since Jan 2026" icon="check" />
          <div className="card stack g10" style={{ padding: "18px 20px" }}>
            <span className="mut" style={{ fontSize: 13.5, fontWeight: 600 }}>Paid in 2026</span>
            <div className="row between g8 wrapx" style={{ fontSize: 14 }}><FeeTag kind="official" /><strong>RWF 3,500</strong></div>
            <div className="row between g8 wrapx" style={{ fontSize: 14 }}><FeeTag kind="ours" /><strong className="fee-ours">RWF 49,000</strong></div>
          </div>
        </div>
        <div className="split" style={{ ["--aside" as string]: "360px" }}>
          <div className="stack g24">
            <section className="card" aria-labelledby="active-h">
              <div className="card-head"><h2 id="active-h" className="d" style={{ fontSize: 19 }}>Active requests</h2><span className="mut" style={{ fontSize: 13 }}>{REQUESTS.length} open</span></div>
              {REQUESTS.map((r) => (
                <div key={r.ref} className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, padding: "18px 20px", borderBottom: "1px solid var(--line-2)", alignItems: "center" }}>
                  <div className="stack" style={{ gap: 5 }}><span className="m mut">{r.ref}</span><Link className="lnk" href={`/portal/requests/${r.ref}`} style={{ fontSize: 16 }}>{r.service}</Link><span className="mut" style={{ fontSize: 13 }}>{r.forWho}</span></div>
                  <div className="stack g8"><Badge k={r.status} /><div className="progress"><span style={{ width: `${Math.round(((r.stage + 1) / 8) * 100)}%`, background: r.yourAction ? "var(--ember)" : undefined }} /></div><span className="mut" style={{ fontSize: 12.5 }}>Stage {r.stage + 1} of 8 · Agent: {r.agent}</span></div>
                  <div className="row between g12">
                    <div className="stack g4"><span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: r.yourAction ? "var(--ember-deep)" : "var(--muted)" }}>{r.yourAction ? "Your action" : "Next step"}</span><span style={{ fontSize: 14, lineHeight: 1.45 }}>{r.next}</span></div>
                    <Link className={`btn btn-sm ${r.yourAction ? "btn-p" : "btn-s"}`} href={r.yourAction ? "/portal/documents" : `/portal/requests/${r.ref}`}>{r.yourAction ? "Upload" : "View"}</Link>
                  </div>
                </div>
              ))}
            </section>
            <section className="card" aria-labelledby="done-h">
              <div className="card-head"><h2 id="done-h" className="d" style={{ fontSize: 19 }}>Recently completed</h2></div>
              <div className="grid cols-2" style={{ padding: "16px 20px", gap: 12 }}>
                {COMPLETED_REQUESTS.map((c) => (
                  <DocCard key={c.ref} compact name={c.name} meta={`${c.ref} · ${c.delivered}`} status="done" action={<button className="btn btn-s btn-sm btn-ico" type="button" aria-label={`Download ${c.name}`}><Icon name="download" size={17} /></button>} />
                ))}
              </div>
            </section>
          </div>
          <div className="stack g16">
            <section id="notifications" className="card" style={{ padding: "18px 20px 6px" }} aria-labelledby="n-h">
              <div className="row between"><h2 id="n-h" className="d" style={{ fontSize: 19 }}>Notifications</h2><span className="mut" style={{ fontSize: 13 }}>2 unread</span></div>
              {NOTIFICATIONS.map((n) => <Notif key={n.title} {...n} />)}
            </section>
            <div className="card dark stack g12" style={{ padding: 20, borderColor: "var(--ink)" }}>
              <span className="eb" style={{ color: "var(--ember-light)" }}>Coming up</span>
              <strong style={{ fontSize: 16 }}>Umucyo Tech Ltd: first VAT declaration due 15 Oct</strong>
              <p style={{ fontSize: 14, lineHeight: 1.5, color: "#C9C5BB" }}>Once your TIN is issued you’ll need to declare monthly. We can do this for you.</p>
              <Link className="btn btn-p btn-sm" href="/services/vat-declaration">Add VAT declarations</Link>
            </div>
            <div id="account" className="card stack g8" style={{ padding: 18 }}>
              <strong>Account</strong>
              <span className="mut" style={{ fontSize: 14 }}>{CUSTOMER.name} · {CUSTOMER.phone}</span>
              <span className="mut" style={{ fontSize: 14 }}>Linked business: Umucyo Tech Ltd</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
