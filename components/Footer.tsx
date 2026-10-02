import Link from "next/link";
import { DISCLAIMER, SITE } from "@/lib/site";
import { Icon, Logo } from "./ui";

const COLS: [string, [string, string][]][] = [
  ["Services", [["RDB / Business registration", "/services?category=rdb"], ["Taxes", "/services?category=tax"], ["EBM", "/services?category=ebm"], ["Land services", "/services?category=land"]]],
  ["More", [["RURA / Transport", "/services?category=rura"], ["Irembo training", "/services?category=irembo"], ["Other online services", "/start"], ["All services", "/services"]]],
  ["Company", [["About us", "/#about"], ["How it works", "/#how"], ["Prices", "/#prices"], ["Contact", "/#contact"]]],
  ["Legal", [["Terms of service", "/#"], ["Privacy & data protection", "/#"], ["Refund policy", "/#"], ["Complaints", "/#"]]],
];

export default function Footer() {
  return (
    <footer className="footer wrap" id="contact">
      <div className="footer-grid">
        <div className="stack g18">
          <Logo dark />
          <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 320 }}>You tell us what service you need. We help you understand, prepare, submit and follow up.</p>
          <div className="stack g8" style={{ fontSize: 14 }}>
            <span className="row g8"><Icon name="pin" size={16} /> {SITE.address}, {SITE.city}</span>
            <span className="row g8"><Icon name="phone" size={16} /> {SITE.phone} · WhatsApp</span>
            <span className="row g8"><Icon name="clock" size={16} /> {SITE.hours}</span>
          </div>
        </div>
        {COLS.map(([t, items]) => (
          <div key={t} className="stack g12">
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--on-dark)" }}>{t}</span>
            {items.map(([l, h]) => <Link key={l} className="ft" href={h}>{l}</Link>)}
          </div>
        ))}
      </div>
      <div className="row between g40 m-col" style={{ borderTop: "1px solid var(--on-dark-line)", paddingTop: 24, alignItems: "flex-start" }}>
        <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 820, color: "var(--on-dark-muted)" }}>{DISCLAIMER}</p>
        <span style={{ fontSize: 13, whiteSpace: "nowrap", color: "var(--on-dark-muted)" }}>© 2026 {SITE.legalName}, company code {SITE.companyCode}</span>
      </div>
    </footer>
  );
}
