import path from "node:path";
import brand from "./lib/brand.json" with { type: "json" };
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Content Security Policy: everything is served from this site (fonts are self-hosted by next/font).
// Next.js inlines small scripts without nonces, so inline scripts are allowed; nothing from other
// domains is. Vercel preview deployments also load the Vercel toolbar.
const dev = process.env.NODE_ENV !== "production";
// An explicitly built demo may run on local HTTP. Real production builds retain HTTPS upgrades and HSTS.
const secureTransport = !dev && process.env.INZIRA_DEMO !== "1";
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
  ...(secureTransport ? ["upgrade-insecure-requests"] : []),
].join("; ");

// Public pages that read nothing about the visitor (lib/seo.ts isSharedPage) are kept by Vercel's CDN for
// 2 minutes, then served stale while one request refreshes them in the background, so a visitor never waits on
// the server or the database for them. A price change in the console shows there within about 2 minutes.
// Browsers always ask again (max-age=0). Only full page loads: client-side navigations and prefetches (RSC)
// return other content at the same address. A visitor with the English cookie is redirected by middleware.ts,
// and that redirect must not be shared.
// On Vercel the page's own Cache-Control (no-store, from the dynamic render) wins over this file's, so the CDN is
// told through Vercel-CDN-Cache-Control, which outranks it and is not passed on to browsers. Cache-Control is
// kept for other hosts (`next start` behind a CDN).
const SHARED_CACHE = "public, max-age=0, s-maxage=120, stale-while-revalidate=86400";
const VERCEL_CDN_CACHE = "max-age=120, stale-while-revalidate=86400";
const SHARED_PATHS = ["/", "/services", "/services/:slug", "/about", "/privacy", "/terms"];
const notRsc = [{ type: "header", key: "rsc" }, { type: "header", key: "next-router-prefetch" }];
const sharedPageCache = dev ? [] : [
  ...SHARED_PATHS.map((source) => ({ source, missing: [...notRsc, { type: "cookie", key: "inzira_lang", value: "en" }] })),
  ...SHARED_PATHS.map((source) => ({ source: source === "/" ? "/en" : `/en${source}`, missing: notRsc })),
].map((rule) => ({ ...rule, headers: [{ key: "Cache-Control", value: SHARED_CACHE }, { key: "Vercel-CDN-Cache-Control", value: VERCEL_CDN_CACHE }] }));

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
      { source: "/:path*", has: [{ type: "host", value: `www\\.${new URL(brand.canonicalOrigin).hostname.split(".").join("\\.")}` }], destination: `${brand.canonicalOrigin}/:path*`, permanent: true },
      { source: "/agent", destination: "/console/my-day", permanent: true },
      { source: "/agent/intake", destination: "/console/intake", permanent: true },
      { source: "/agent/cases/:ref", destination: "/console/requests/:ref", permanent: true },
      { source: "/admin", destination: "/console/overview", permanent: true },
    ];
  },
  async headers() {
    return [...sharedPageCache, {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // The camera is used to photograph documents; nothing else is needed.
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
        ...(secureTransport ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
      ],
    }];
  },
};

export default nextConfig;
