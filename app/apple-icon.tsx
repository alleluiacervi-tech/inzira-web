import { ImageResponse } from "next/og";

// Home-screen icon for iPhone and iPad: the logo mark on a full-bleed square (iOS rounds the corners itself).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#142850" }}>
        <svg width="132" height="132" viewBox="0 0 30 30">
          <path d="M8 22.5c0-6 14-5 14-11.5" fill="none" stroke="#dde4f0" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="8" cy="22.5" r="2.1" fill="#dde4f0" />
          <circle cx="22" cy="9" r="3.4" fill="#C9962E" stroke="#142850" strokeWidth="1.4" />
        </svg>
      </div>
    ),
    size,
  );
}
