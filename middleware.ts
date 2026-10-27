import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LANG_COOKIE } from "@/lib/i18n/cookie";
import { barePath, blockedHost, isSharedPage, withLocale } from "@/lib/seo";
import { siteOrigin } from "@/lib/site";

/** The page that was asked for, so a signed-out visit can return there after sign-in.
 *  Set on the forwarded request; a value sent by the browser is replaced.
 *  The live deployment refuses its *.vercel.app address once the real domain (NEXT_PUBLIC_SITE_URL) is set.
 *  /en is rewritten to the same page in English. /rw redirects to the unprefixed Kinyarwanda address.
 *  Shared public pages take their language from the address alone, so the cached copy (next.config.mjs) fits
 *  every visitor: a visitor who chose English is sent to the /en address instead of getting English at the bare one. */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  const { pathname } = req.nextUrl;
  headers.set("x-inzira-path", pathname + req.nextUrl.search);

  const blocked = blockedHost({
    host: req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
    pathname,
    origin: siteOrigin(),
    production: process.env.VERCEL_ENV === "production",
  });
  if (blocked) return new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });

  if (pathname === "/rw" || pathname.startsWith("/rw/")) {
    const bare = barePath(pathname.replace(/^\/rw(?=\/|$)/, "") || "/");
    return NextResponse.redirect(publicUrl(req, bare), 308);
  }

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const bare = barePath(pathname);
    headers.set("x-inzira-locale", "en");
    const url = req.nextUrl.clone();
    url.pathname = bare;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  if (isSharedPage(pathname)) {
    if (req.cookies.get(LANG_COOKIE)?.value === "en") {
      const res = NextResponse.redirect(publicUrl(req, withLocale("en", pathname)), 307);
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }
    headers.set("x-inzira-locale", "rw");
  }

  return NextResponse.next({ request: { headers } });
}

/** An address on the host the visitor used, keeping the query. nextUrl's host is the internal one, which was localhost. */
function publicUrl(req: NextRequest, path: string) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) || "https";
  return `${proto}://${host}${path}${req.nextUrl.search}`;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
