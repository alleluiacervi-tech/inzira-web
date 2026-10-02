import Link from "next/link";
import { Alert, DocBadge, DocCard, FeeTag, Icon, Kpi, Notif, PageHead, RequestRow } from "@/components/ui";
import { dayPart, fmtAgo, fmtDay, fmtLong, fmtMonth, rwf } from "@/lib/format";
import { getAccount, getNow, listMyNotifications, listMyReminders, listMyRequests } from "@/lib/repo";
import { isOpen, paidSplit } from "@/lib/status";
import { markNotificationsRead } from "@/app/actions/customer";

export default async function PortalHome() {
  const [account, requests, notifications, reminders, now] = await Promise.all([getAccount(), listMyRequests(), listMyNotifications(), listMyReminders(), getNow()]);
  const open = requests.filter(isOpen);
  const holds = open.filter((r) => r.hold);
  const delivered = requests.filter((r) => r.stage === "completed").flatMap((r) => r.deliverables.map((d) => ({ ...d, ref: r.ref })));
  const paid = requests.map((r) => paidSplit(r.billing)).reduce((a, b) => ({ official: a.official + b.official, ours: a.ours + b.ours }), { official: 0, ours: 0 });
  const unread = notifications.filter((n) => n.unread).length;

  return (
    <>
      <PageHead title={`${dayPart(now) === "morning" ? "Mwaramutse" : "Mwiriwe"}, ${account.first}`} sub={fmtLong(now)}>
        <form action="/portal/requests" role="search" className="card row g8 m-hide" style={{ padding: "0 12px", height: 40, width: 280 }}>
          <Icon name="search" size={18} /><label htmlFor="ps" className="sr-only">Search your requests</label>
          <input id="ps" name="q" placeholder="Search requests or references" style={{ border: 0, outline: 0, fontSize: 14, width: "100%" }} />
        </form>
        <Link className="btn btn-p btn-sm m-hide" href="/services" style={{ height: 40 }}><Icon name="plus" size={18} /> Start New Service</Link>
      </PageHead>
      <div className="content">
        {holds.map((r) => (
          <Alert key={r.ref} kind="act" title={r.hold!.title} action={<Link className="btn btn-p btn-sm" href={`/portal/requests/${r.ref}`}>Resolve now</Link>}>
            {r.name} · {r.ref}. {r.hold!.reason === "payment" ? "We submit as soon as it’s paid." : "Nothing moves forward until this is fixed."}
          </Alert>
        ))}
        <div className="grid cols-4 m-cols-2" style={{ gap: 14 }}>
          <Kpi label="Active requests" value={String(open.length)} sub={`${open.filter((r) => r.stage === "institution" && !r.hold).length} with the institution`} icon="list" />
          <Kpi label="Requiring your action" value={String(holds.length)} sub={holds.length ? `Since ${fmtDay(holds[0].hold!.since)}` : "Nothing needed from you"} icon="alert" valueColor={holds.length ? "var(--ember-deep)" : undefined} />
          <Kpi label="Completed" value={String(requests.filter((r) => r.stage === "completed").length)} sub={`Since ${fmtMonth(account.since)}`} icon="check" />
          <div className="card stack g10" style={{ padding: "18px 20px" }}>
            <span className="mut" style={{ fontSize: 13.5, fontWeight: 600 }}>Paid to Inzira so far</span>
            <div className="row between g8 wrapx" style={{ fontSize: 14 }}><FeeTag kind="ours" /><strong className="fee-ours">{rwf(paid.ours)}</strong></div>
            <div className="row between g8 wrapx" style={{ fontSize: 14 }}><FeeTag kind="official" />{paid.official ? <strong>{rwf(paid.official)}</strong> : <span className="mut" style={{ fontSize: 13 }}>Paid by you directly</span>}</div>
          </div>
        </div>
        <div className="split" style={{ ["--aside" as string]: "360px" }}>
          <div className="stack g24">
            <section className="card" aria-labelledby="active-h">
              <div className="card-head"><h2 id="active-h" className="d" style={{ fontSize: 19 }}>Active requests</h2><Link className="lnk" href="/portal/requests" style={{ fontSize: 14 }}>All requests →</Link></div>
              {open.map((r) => <RequestRow key={r.ref} r={r} />)}
              {open.length === 0 && (
                <div className="stack g12" style={{ padding: "36px 24px", alignItems: "center", textAlign: "center" }}>
                  <strong>{requests.length ? "Nothing in progress" : "You haven’t started a request yet"}</strong>
                  <span className="hint" style={{ maxWidth: 380 }}>Pick a service, or describe what you need and an agent will tell you which procedure applies.</span>
                  <div className="row g8 wrapx" style={{ justifyContent: "center" }}><Link className="btn btn-p btn-sm" href="/services">Browse services</Link><Link className="btn btn-s btn-sm" href="/start">Describe what I need</Link></div>
                </div>
              )}
            </section>
            {delivered.length > 0 && (
              <section className="card" aria-labelledby="done-h">
                <div className="card-head"><h2 id="done-h" className="d" style={{ fontSize: 19 }}>Recently completed</h2><Link className="lnk" href="/portal/documents" style={{ fontSize: 14 }}>All documents →</Link></div>
                <div className="grid cols-2" style={{ padding: "16px 20px", gap: 12 }}>
                  {delivered.map((d) => (
                    <DocCard key={d.id} compact name={d.name} meta={`${d.ref} · Delivered ${fmtDay(d.issuedAt)}`} badge={<DocBadge s="issued" />} action={d.fileId ? <a className="btn btn-s btn-sm btn-ico" href={`/files/${d.fileId}`} target="_blank" rel="noopener" aria-label={`Download ${d.name}`}><Icon name="download" size={17} /></a> : undefined} />
                  ))}
                </div>
              </section>
            )}
          </div>
          <div className="stack g16">
            <section id="notifications" className="card" style={{ padding: "18px 20px 6px" }} aria-labelledby="n-h">
              <div className="row between"><h2 id="n-h" className="d" style={{ fontSize: 19 }}>Notifications</h2>{unread ? <form action={markNotificationsRead}><button className="linkish" type="submit" style={{ fontSize: 13 }}>Mark {unread} as read</button></form> : <span className="mut" style={{ fontSize: 13 }}>All read</span>}</div>
              {notifications.map((n) => <Notif key={n.id} icon={n.icon} title={n.title} meta={fmtAgo(n.at, now)} unread={n.unread} href={n.href} />)}
              {notifications.length === 0 && <p className="hint" style={{ padding: "14px 0" }}>Updates about your requests will appear here.</p>}
            </section>
            {reminders.map((m) => (
              <div key={m.id} className="card dark stack g12" style={{ padding: 20, borderColor: "var(--ink)" }}>
                <span className="eb" style={{ color: "var(--ember-light)" }}>Coming up</span>
                <strong style={{ fontSize: 16 }}>{m.title}</strong>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--on-dark-2)" }}>{m.body}</p>
                <Link className="btn btn-p btn-sm" href={m.href}>{m.cta}</Link>
              </div>
            ))}
            <div id="account" className="card stack g8" style={{ padding: 18 }}>
              <strong>Account</strong>
              <span className="mut" style={{ fontSize: 14 }}>{account.name} · {account.phone}</span>
              <span className="mut" style={{ fontSize: 14 }}>You can request for: {account.profiles.map((p) => (p.relation === "self" ? "yourself" : p.name)).join(", ")}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
