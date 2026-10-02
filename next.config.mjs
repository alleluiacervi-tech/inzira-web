import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Content Security Policy: everything is served from this site (fonts are self-hosted by next/font).
// Next.js inlines small scripts without nonces, so inline scripts are allowed; nothing from other
// domains is. Vercel preview deployments also load the Vercel toolbar.
const dev = process.env.NODE_ENV !== "production";
const preview = process.env.VERCEL_ENV === "preview";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${preview ? " https://vercel.live" : ""}`,
  `style-src 'self' 'unsafe-inline'${preview ? " https://vercel.live" : ""}`,
  `img-src 'self' data: blob:${preview ? " https://vercel.live https://vercel.com" : ""}`,
  `font-src 'self'${preview ? " https://vercel.live https://assets.vercel.com" : ""}`,
  `connect-src 'self'${dev ? " ws:" : ""}${preview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src ${preview ? "https://vercel.live" : "'none'"}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  // The database drivers run as plain Node modules, not bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Migrations are read at runtime by the local database and `npm run db:migrate`.
  outputFileTracingIncludes: { "/**/*": ["./drizzle/**/*"] },
  // Uploads go through server actions; allow files up to 10 MB plus form fields.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // The camera is used to photograph documents; nothing else is needed.
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
        ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
      ],
    }];
  },
};

export default nextConfig;
