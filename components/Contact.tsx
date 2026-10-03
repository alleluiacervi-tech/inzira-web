import { mailUrl, SITE, telUrl, whatsappUrl } from "@/lib/site";
import { Icon } from "./ui";

/** The three ways to reach a person at Inzira, in the order people in Rwanda use them. */
export function contactWays() {
  return [
    { key: "whatsapp", icon: "whatsapp", label: "WhatsApp", value: SITE.phone, href: whatsappUrl("Hello Inzira, I need help with a request."), external: true },
    { key: "call", icon: "call", label: "Call", value: SITE.phone, href: telUrl(), external: false },
    { key: "mail", icon: "mail", label: "Email", value: SITE.email, href: mailUrl("Request for help"), external: false },
  ];
}

/** A list of contact rows: icon, what it is, the number or address. `dark` for navy surfaces. */
export function ContactList({ dark = false }: { dark?: boolean }) {
  return (
    <ul className={`contact ${dark ? "contact-dark" : ""}`}>
      {contactWays().map((c) => (
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
