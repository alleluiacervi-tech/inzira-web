"use client";

import { whatsappUrl, mailUrl, SITE, telUrl } from "@/lib/site";
import { useI18n } from "./I18n";
import { Icon } from "./ui";

/** The three ways to reach a person at Inzira, in the order people in Rwanda use them. */
export function ContactList({ dark = false }: { dark?: boolean }) {
  const { t } = useI18n();
  const ways = [
    { key: "whatsapp", icon: "whatsapp", label: t("contact.whatsapp"), value: SITE.phone, href: whatsappUrl(t("contact.waPrefill")), external: true },
    { key: "call", icon: "call", label: t("contact.call"), value: SITE.phone, href: telUrl(), external: false },
    { key: "mail", icon: "mail", label: t("contact.email"), value: SITE.email, href: mailUrl(t("contact.mailSubject")), external: false },
  ];
  return (
    <ul className={`contact ${dark ? "contact-dark" : ""}`}>
      {ways.map((c) => (
        <li key={c.key}>
          <a className="contact-row" href={c.href} {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            <span className={`contact-ico contact-${c.key}`}><Icon name={c.icon} size={20} /></span>
            <span className="stack" style={{ gap: 1, minWidth: 0 }}>
              <span className="contact-label">{c.label}</span>
              <strong className="contact-value fig">{c.value}</strong>
            </span>
            <Icon name="right" size={18} style={{ marginLeft: "auto" }} />
          </a>
        </li>
      ))}
    </ul>
  );
}
