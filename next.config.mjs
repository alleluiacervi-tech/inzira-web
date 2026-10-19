import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Content Security Policy: everything is served from this site (fonts are self-hosted by next/font).
// Next.js inlines small scripts without nonces, so inline scripts are allowed; nothing from other
// domains is. Vercel preview deployments also load the Vercel toolbar.
const dev = process.env.NODE_ENV !== "production";
const preview = process.env.VERCEL_ENV === "preview";
const turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? " https://challenges.cloudflare.com" : "";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${turnstile}${dev ? " 'unsafe-eval'" : ""}${preview ? " https://vercel.live" : ""}`,
  `style-src 'self' 'unsafe-inline'${preview ? " https://vercel.live" : ""}`,
  `img-src 'self' data: blob:${preview ? " https://vercel.live https://vercel.com" : ""}`,
  `font-src 'self'${preview ? " https://vercel.live https://assets.vercel.com" : ""}`,
  `connect-src 'self'${dev ? " ws:" : ""}${preview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src ${preview || turnstile ? `${preview ? "https://vercel.live" : ""}${turnstile}`.trim() : "'none'"}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Shown in the staff console footer: the commit that was built, when Vercel gives one.
  env: {
    NEXT_PUBLIC_BUILD: [process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7), new Date().toISOString().slice(0, 10)].filter(Boolean).join(" · "),
  },
  outputFileTracingRoot: __dirname,
  // The database drivers run as plain Node modules, not bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Migrations are read at runtime by the local database and `npm run db:migrate`.
  outputFileTracingIncludes: { "/**/*": ["./drizzle/**/*"] },
  // Uploads go through server actions; allow files up to 10 MB plus form fields.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  // The agent workspace and the admin home now live in the staff console.
  async redirects() {
    return [
      { source: "/agent", destination: "/console/my-day", permanent: true },
      { source: "/agent/intake", destination: "/console/intake", permanent: true },
      { source: "/agent/cases/:ref", destination: "/console/requests/:ref", permanent: true },
      { source: "/admin", destination: "/console/overview", permanent: true },
    ];
  },
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
