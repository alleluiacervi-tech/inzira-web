import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { barePath, canonicalRedirect } from "@/lib/seo";
import { siteOrigin } from "@/lib/site";

/** The page that was asked for, so a signed-out visit can return there after sign-in.
 *  Set on the forwarded request; a value sent by the browser is replaced.
 *  The *.vercel.app address of the live deployment redirects to the real domain (NEXT_PUBLIC_SITE_URL).
 *  /en is rewritten to the same page in English. /rw redirects to the unprefixed Kinyarwanda address. */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  const { pathname } = req.nextUrl;
  headers.set("x-inzira-path", pathname + req.nextUrl.search);

  const canonical = canonicalRedirect({
    host: req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
    pathname,
    search: req.nextUrl.search,
    origin: siteOrigin(),
    production: process.env.VERCEL_ENV === "production",
  });
  if (canonical) return NextResponse.redirect(canonical, 308);

  if (pathname === "/rw" || pathname.startsWith("/rw/")) {
    const bare = barePath(pathname.replace(/^\/rw(?=\/|$)/, "") || "/");
    // Use the host the visitor sent. nextUrl's host is the internal one, which was localhost.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
    const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) || "https";
    return NextResponse.redirect(`${proto}://${host}${bare}${req.nextUrl.search}`, 308);
  }

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const bare = barePath(pathname);
    headers.set("x-inzira-locale", "en");
    const url = req.nextUrl.clone();
    url.pathname = bare;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
