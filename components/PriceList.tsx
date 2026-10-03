import Link from "next/link";
import { rwf, shortTime } from "@/lib/format";
import { OFFICES, officeFor } from "@/lib/institutions";
import type { Service } from "@/lib/types";
import { Icon } from "./ui";

/** One service as a line of a fee schedule: name, how long it takes, our fee. The whole row opens the service. */
export function ServiceRow({ s, showOffice = false }: { s: Service; showOffice?: boolean }) {
  const office = showOffice ? officeFor(s.category) : undefined;
  return (
    <li>
      <Link href={`/services/${s.slug}`} className="pl-row">
        <span className="pl-main">
          <span className="pl-name">{s.name}</span>
          <span className="pl-time">{office && <span className="pl-code">{office.code}</span>}{shortTime(s.time)}</span>
        </span>
        <span className="pl-fee">
          <strong className="fig">{rwf(s.ours)}</strong>
          {s.oursUnit && <span className="pl-unit">{s.oursUnit}</span>}
        </span>
        <Icon name="right" size={18} />
      </Link>
    </li>
  );
}

/** A flat list of service rows (search results, related services). */
export function ServiceRows({ services, showOffice = true }: { services: Service[]; showOffice?: boolean }) {
  return <ul className="pl-rows">{services.map((s) => <ServiceRow key={s.slug} s={s} showOffice={showOffice} />)}</ul>;
}

/** Every visible service, grouped by the institution it is filed with. */
export function PriceList({ services }: { services: Service[] }) {
  const groups = OFFICES.map((o) => ({ office: o, list: services.filter((s) => (o.cats as readonly string[]).includes(s.category)) })).filter((g) => g.list.length);
  return (
    <div className="pl">
      <div className="pl-cols" aria-hidden="true"><span>Service and usual time</span><span>Our fee</span></div>
      {groups.map(({ office, list }) => (
        <section key={office.code} className="pl-group" aria-labelledby={`pl-${office.code}`}>
          <header className="pl-head">
            <h3 id={`pl-${office.code}`} className="pl-office">{office.name}</h3>
            <span className="pl-area">{office.area}</span>
          </header>
          <ul className="pl-rows">{list.map((s) => <ServiceRow key={s.slug} s={s} />)}</ul>
        </section>
      ))}
    </div>
  );
}
