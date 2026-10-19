import Link from "next/link";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { withLocale } from "@/lib/seo";
import { isSet, mailUrl, SITE, telUrl, whatsappUrl } from "@/lib/site";
import { Icon, Logo } from "./ui";

export default async function Footer() {
  const locale = await getLocale();
  const t = (path: string, vars?: Record<string, string | number>) => text(locale, path, vars);
  const cols: [string, [string, string][]][] = [
    [t("footer.services"), [[t("footer.rdb"), "/services?category=rdb"], [t("footer.tax"), "/services?category=tax"], [t("footer.land"), "/services?category=land"], [t("footer.rura"), "/services?category=rura"], [t("footer.police"), "/services?category=police"], [t("footer.papers"), "/services?category=papers"], [t("footer.irembo"), "/services?category=irembo"], [t("footer.all"), "/services"]]],
    [t("footer.company"), [[t("footer.fees"), "/#prices"], [t("footer.how"), "/#how"], [t("footer.questions"), "/#help"], [t("footer.contact"), "/#talk"], [t("footer.about"), "/about"], [t("footer.privacy"), "/privacy"], [t("footer.terms"), "/terms"]]],
    [t("footer.request"), [[t("footer.start"), "/services"], [t("footer.track"), "/track"], [t("footer.signIn"), "/sign-in"], [t("footer.describe"), "/start"]]],
  ];
  const contact = [
    SITE.whatsapp && { icon: "whatsapp", text: t("footer.whatsapp", { phone: SITE.phone }), href: whatsappUrl(), external: true },
    isSet(SITE.phone) && { icon: "call", text: t("footer.call", { phone: SITE.phone }), href: telUrl() },
    isSet(SITE.email) && { icon: "mail", text: SITE.email, href: mailUrl() },
    { icon: "pin", text: isSet(SITE.address) ? `${SITE.address}, ${SITE.city}` : t("footer.visit", { city: SITE.city }) },
    { icon: "clock", text: t("hours") },
  ].filter(Boolean) as { icon: string; text: string; href?: string; external?: boolean }[];

  return (
    <>
    <footer className="footer" id="contact">
      <div className="wrap footer-in">
      <div className="footer-grid">
        <div className="stack g18">
          <Logo dark label={t("shell.logo")} href={withLocale(locale, "/")} />
          <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 320 }}>{t("footer.blurb")}</p>
          <ul className="stack g10 ft-contact" style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 14.5 }}>
            {contact.map((c) => (
              <li key={c.icon + c.text} className="row g10"><Icon name={c.icon} size={17} />{c.href ? <a className="ft" href={c.href} {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{c.text}</a> : c.text}</li>
            ))}
          </ul>
        </div>
        {cols.map(([title, items]) => (
          <nav key={title} className="stack g12" aria-label={title}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--on-dark)" }}>{title}</span>
            {items.map(([l, h]) => <Link key={h + l} className="ft" href={withLocale(locale, h)}>{l}</Link>)}
          </nav>
        ))}
      </div>
      <div className="row between g40 m-col" style={{ borderTop: "1px solid var(--on-dark-line)", paddingTop: 24, alignItems: "flex-start" }}>
        <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 820, color: "var(--on-dark-muted)" }}>{t("footer.disclaimer")}</p>
        <span style={{ fontSize: 13, whiteSpace: "nowrap", color: "var(--on-dark-muted)" }}>{t("footer.copy", { year: new Date().getFullYear(), legal: SITE.legalName })}{isSet(SITE.companyCode) ? `, ${SITE.companyCode}` : ""}</span>
      </div>
      </div>
    </footer>
    </>
  );
}
