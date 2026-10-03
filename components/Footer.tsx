import Link from "next/link";
import { DISCLAIMER, isSet, mailUrl, SITE, telUrl, whatsappUrl } from "@/lib/site";
import { Icon, Logo } from "./ui";

const COLS: [string, [string, string][]][] = [
  ["Services", [["Business registration (RDB)", "/services?category=rdb"], ["Taxes and EBM (RRA)", "/services?category=tax"], ["Land (NLA)", "/services?category=land"], ["Transport (RURA)", "/services?category=rura"], ["Irembo training", "/services?category=irembo"], ["All services", "/services"]]],
  ["Company", [["Services and fees", "/#prices"], ["How it works", "/#how"], ["Questions", "/#faq"], ["Contact", "/#talk"]]],
  ["Your request", [["Start a request", "/services"], ["Track a request", "/track"], ["Sign in", "/sign-in"], ["Describe your situation", "/start"]]],
];

export default function Footer() {
  // Details still set to placeholders in lib/site.ts stay off the public site until they are real.
  const contact = [
    SITE.whatsapp && { icon: "whatsapp", text: `WhatsApp ${SITE.phone}`, href: whatsappUrl(), external: true },
    isSet(SITE.phone) && { icon: "call", text: `Call ${SITE.phone}`, href: telUrl() },
    isSet(SITE.email) && { icon: "mail", text: SITE.email, href: mailUrl() },
    { icon: "pin", text: isSet(SITE.address) ? `${SITE.address}, ${SITE.city}` : `${SITE.city}, Rwanda` },
    { icon: "clock", text: SITE.hours.replace(" · ", ", ") },
  ].filter(Boolean) as { icon: string; text: string; href?: string; external?: boolean }[];

  return (
    <footer className="footer wrap" id="contact">
      <div className="footer-grid">
        <div className="stack g18">
          <Logo dark />
          <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 320 }}>Government paperwork for businesses and professionals in Rwanda, checked, filed and followed up for you.</p>
          <ul className="stack g10 ft-contact" style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 14.5 }}>
            {contact.map((c) => (
              <li key={c.text} className="row g10"><Icon name={c.icon} size={17} />{c.href ? <a className="ft" href={c.href} {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{c.text}</a> : c.text}</li>
            ))}
          </ul>
        </div>
        {COLS.map(([t, items]) => (
          <nav key={t} className="stack g12" aria-label={t}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--on-dark)" }}>{t}</span>
            {items.map(([l, h]) => <Link key={l} className="ft" href={h}>{l}</Link>)}
          </nav>
        ))}
      </div>
      <div className="row between g40 m-col" style={{ borderTop: "1px solid var(--on-dark-line)", paddingTop: 24, alignItems: "flex-start" }}>
        <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 820, color: "var(--on-dark-muted)" }}>{DISCLAIMER}</p>
        <span style={{ fontSize: 13, whiteSpace: "nowrap", color: "var(--on-dark-muted)" }}>© {new Date().getFullYear()} {SITE.legalName}{isSet(SITE.companyCode) ? `, company code ${SITE.companyCode}` : ""}</span>
      </div>
    </footer>
  );
}
