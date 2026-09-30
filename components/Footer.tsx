import Link from "next/link";
import { DISCLAIMER } from "@/lib/data";
import { Icon, Logo } from "./ui";

const COLS: [string, [string, string][]][] = [
  ["Services", [["Irembo / Public services", "/services?category=irembo"], ["RRA / Taxes", "/services?category=rra"], ["EBM", "/services?category=ebm"], ["RDB / Business", "/services?category=rdb"], ["Land services", "/services?category=land"]]],
  ["More", [["Judiciary / Urukiko", "/services?category=judiciary"], ["Business & compliance", "/services?category=compliance"], ["Other services", "/services?category=other"], ["All services", "/services"]]],
  ["Company", [["How it works", "/#how"], ["Pricing", "/#pricing"], ["For businesses", "/#business"], ["Contact", "/#contact"]]],
  ["Trust", [["Terms of service", "/#"], ["Privacy & data protection", "/#"], ["Refund policy", "/#"], ["Complaints", "/#"], ["Track a request", "/portal"]]],
];

export default function Footer() {
  return (
    <footer className="footer wrap" id="contact">
      <div className="footer-grid">
        <div className="stack g18">
          <Logo dark />
          <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 320 }}>You tell us what service you need. We help you understand, prepare, submit and follow up.</p>
          <div className="stack g8" style={{ fontSize: 14 }}>
            <span className="row g8"><Icon name="pin" size={16} /> [Office address], Kigali</span>
            <span className="row g8"><Icon name="phone" size={16} /> +250 7XX XXX XXX · WhatsApp</span>
            <span className="row g8"><Icon name="clock" size={16} /> Mon–Fri 8:00–18:00 · Sat 9:00–13:00</span>
          </div>
        </div>
        {COLS.map(([t, items]) => (
          <div key={t} className="stack g12">
            <span style={{ fontSize: 13, fontWeight: 700, color: "#F6F4EF" }}>{t}</span>
            {items.map(([l, h]) => <Link key={l} className="ft" href={h}>{l}</Link>)}
          </div>
        ))}
      </div>
      <div className="row between g40 m-col" style={{ borderTop: "1px solid #2E3136", paddingTop: 24, alignItems: "flex-start" }}>
        <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 820, color: "#B5B1A7" }}>{DISCLAIMER}</p>
        <span style={{ fontSize: 13, whiteSpace: "nowrap", color: "#B5B1A7" }}>© 2026 Inzira Ltd · [Company code / TIN]</span>
      </div>
    </footer>
  );
}
