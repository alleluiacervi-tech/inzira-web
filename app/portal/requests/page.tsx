import Link from "next/link";
import { Icon, PageHead, RequestRow } from "@/components/ui";
import { DASHBOARD_LOCALE } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { listMyRequests } from "@/lib/repo";
import { isOpen } from "@/lib/status";

export async function generateMetadata() {
  return { title: text(DASHBOARD_LOCALE, "meta.requestsTitle") };
}

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const locale = DASHBOARD_LOCALE;
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const [sp, all] = await Promise.all([searchParams, listMyRequests()]);
  const q = (sp.q ?? "").trim();
  const term = q.toLowerCase();
  const requests = term ? all.filter((r) => [r.ref, r.name, r.service.name, r.profile.name, r.officialRef].join(" ").toLowerCase().includes(term)) : all;
  const groups: [string, typeof requests][] = [
    [t("portal.needsAction"), requests.filter((r) => isOpen(r) && r.hold)],
    [t("portal.inProgress"), requests.filter((r) => isOpen(r) && !r.hold)],
    [t("portal.finished"), requests.filter((r) => !isOpen(r))],
  ];

  return (
    <>
      <PageHead title={t("meta.requestsTitle")} sub={q ? t("portal.matching", { n: requests.length, q }) : t("portal.openTotal", { open: all.filter(isOpen).length, total: all.length })}>
        <form action="/portal/requests" role="search" className="card row g8" style={{ padding: "0 12px", height: 40, width: 280, maxWidth: "100%" }}>
          <Icon name="search" size={18} /><label htmlFor="rq" className="sr-only">{t("portal.searchLabel")}</label>
          <input id="rq" name="q" defaultValue={q} placeholder={t("portal.searchPh")} style={{ border: 0, outline: 0, fontSize: 14, width: "100%" }} />
        </form>
        <Link className="btn btn-s btn-sm m-hide" href="/services" style={{ height: 40 }}><Icon name="plus" size={18} /> {t("portal.start")}</Link>
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
            <strong>{q ? t("portal.noMatch") : t("portal.noneYet")}</strong>
            <span className="hint" style={{ maxWidth: 380 }}>{q ? t("portal.noMatchHint") : t("portal.noneHint")}</span>
            <div className="row g8 wrapx" style={{ justifyContent: "center" }}>{q && <Link className="btn btn-s btn-sm" href="/portal/requests">{t("portal.showAll")}</Link>}<Link className="btn btn-p btn-sm" href="/services">{t("portal.browse")}</Link></div>
          </div>
        )}
      </div>
    </>
  );
}
