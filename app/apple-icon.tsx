import { ImageResponse } from "next/og";

// Home-screen icon for iPhone and iPad: the logo mark on a full-bleed square (iOS rounds the corners itself).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#16181B" }}>
        <svg width="132" height="132" viewBox="0 0 30 30">
          <path d="M8.5 20.5L15 9.5l6.5 11" fill="none" stroke="#F08A4B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="15" cy="21" r="2" fill="#F6F4EF" />
        </svg>
      </div>
    ),
    size,
  );
}
