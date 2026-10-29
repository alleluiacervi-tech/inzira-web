"use client";

import Link from "next/link";
import { displayPrice, displayTime } from "@/lib/i18n/present";
import { officeFor } from "@/lib/institutions";
import type { Category, Service } from "@/lib/types";
import { withLocale } from "@/lib/seo";
import { useI18n } from "./I18n";
import { Icon } from "./ui";

/** One service as a line of a fee schedule: name, how long it takes, what it costs (all in where the price is settled).
 *  The whole row opens the service. */
export function ServiceRow({ s, categories, showOffice = false }: { s: Service; categories: Category[]; showOffice?: boolean }) {
  const { locale } = useI18n();
  const office = showOffice ? officeFor(s.category, categories) : undefined;
  const price = displayPrice(s, locale);
  return (
    <li>
      <Link href={withLocale(locale, `/services/${s.slug}`)} className="pl-row">
        <span className="pl-main">
          <span className="pl-name">{s.name}</span>
          <span className="pl-time">{office && <span className="pl-code">{office.fromCategory ? office.area : office.code}</span>}{displayTime(s, locale)}</span>
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
export function ServiceRows({ services, categories, showOffice = true }: { services: Service[]; categories: Category[]; showOffice?: boolean }) {
  return <ul className="pl-rows">{services.map((s) => <ServiceRow key={s.slug} s={s} categories={categories} showOffice={showOffice} />)}</ul>;
}
