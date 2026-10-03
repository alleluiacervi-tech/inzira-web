import { ImageResponse } from "next/og";

// The preview shown when a link to the site is shared on WhatsApp, Facebook, LinkedIn or X.
export const alt = "Inzira — government paperwork, handled for you";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STOPS = ["You tell us", "Documents checked", "With RDB", "Delivered"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#142850", color: "#f3f5fa", padding: "72px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="64" height="64" viewBox="0 0 30 30">
              <rect width="30" height="30" rx="8" fill="#f3f5fa" />
              <path d="M8 22.5c0-6 14-5 14-11.5" fill="none" stroke="#142850" strokeWidth="2.6" strokeLinecap="round" />
              <circle cx="8" cy="22.5" r="2.1" fill="#142850" />
              <circle cx="22" cy="9" r="3.4" fill="#C9962E" stroke="#142850" strokeWidth="1.4" />
            </svg>
            <span style={{ fontSize: 48 }}>inzira</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 72, lineHeight: 1.02, letterSpacing: "-0.03em" }}>
              <span>Government paperwork,</span>
              <span>handled while you work.</span>
            </div>
            <span style={{ fontSize: 28, color: "#c4ccdd", maxWidth: 640 }}>Company registration, taxes, EBM, land titles and transport permits, filed for you in Kigali.</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 300, position: "relative" }}>
          <div style={{ position: "absolute", left: 13, top: 120, bottom: 120, width: 6, background: "#2a3d66", borderRadius: 3 }} />
          {STOPS.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 22, height: 96 }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, display: "flex", background: i === 2 ? "#C9962E" : i < 2 ? "#dde4f0" : "#142850", border: i > 2 ? "4px solid #4a5b82" : "4px solid #142850" }} />
              <span style={{ fontSize: 28, color: i === 2 ? "#f3f5fa" : "#9ba6be" }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
