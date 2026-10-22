"use client";

import Link from "next/link";
import { displayPrice, displayTime, officeText } from "@/lib/i18n/present";
import { OFFICES, officeFor } from "@/lib/institutions";
import type { Service } from "@/lib/types";
import { withLocale } from "@/lib/seo";
import { useI18n } from "./I18n";
import { Icon } from "./ui";

/** One service as a line of a fee schedule: name, how long it takes, what it costs (all in where the price is settled).
 *  The whole row opens the service. */
export function ServiceRow({ s, showOffice = false }: { s: Service; showOffice?: boolean }) {
  const { locale } = useI18n();
  const office = showOffice ? officeFor(s.category) : undefined;
  const price = displayPrice(s, locale);
  return (
    <li>
      <Link href={withLocale(locale, `/services/${s.slug}`)} className="pl-row">
        <span className="pl-main">
          <span className="pl-name">{s.name}</span>
          <span className="pl-time">{office && <span className="pl-code">{office.code}</span>}{displayTime(s, locale)}</span>
        </span>
        <span className="pl-fee">
          <strong className="fig">{price.amount}</strong>
          {price.note && <span className="pl-unit">{price.note}</span>}
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
  const { locale, t } = useI18n();
  const groups = OFFICES.map((o) => ({ office: o, copy: officeText(o.code, locale), list: services.filter((s) => (o.cats as readonly string[]).includes(s.category)) })).filter((g) => g.list.length);
  return (
    <div className="pl">
      <div className="pl-cols" aria-hidden="true"><span>{t("prices.service")}</span><span>{t("prices.fee")}</span></div>
      {groups.map(({ office, copy, list }) => (
        <section key={office.code} className="pl-group" aria-labelledby={`pl-${office.code}`}>
          <header className="pl-head">
            <h3 id={`pl-${office.code}`} className="pl-office">{copy?.name ?? office.name}</h3>
            <span className="pl-area">{copy?.area ?? office.area}</span>
          </header>
          <ul className="pl-rows">{list.map((s) => <ServiceRow key={s.slug} s={s} />)}</ul>
        </section>
      ))}
    </div>
  );
}
