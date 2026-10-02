import { ImageResponse } from "next/og";

// The preview shown when a link to the site is shared on WhatsApp, Facebook, LinkedIn or X.
export const alt = "Inzira — Government & business services, made easier";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#F6F4EF", padding: "72px 80px", color: "#16181B" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 30 30">
            <rect width="30" height="30" rx="7" fill="#16181B" />
            <path d="M8.5 20.5L15 9.5l6.5 11" fill="none" stroke="#F08A4B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="15" cy="21" r="2" fill="#F6F4EF" />
          </svg>
          <span style={{ fontSize: 52, letterSpacing: "-0.03em" }}>inzira</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 78, lineHeight: 1.02, letterSpacing: "-0.04em" }}>
            <span>Government &amp; business</span>
            <span style={{ display: "flex", gap: 22 }}>services,<span style={{ color: "#C24A12" }}>made easier.</span></span>
          </div>
          <span style={{ fontSize: 30, color: "#3A3C40" }}>RDB · Taxes · EBM · Land · RURA · Irembo — help in Kigali</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: "#5E5C55" }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#1E6B3A" }} />
          <span>Independent assistance company · official fees always shown separately</span>
        </div>
      </div>
    ),
    size,
  );
}
