import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** The page that was asked for, so a signed-out visit can return there after sign-in.
 *  Set on the forwarded request; a value sent by the browser is replaced. */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-inzira-path", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/portal", "/portal/:path*", "/console", "/console/:path*", "/admin", "/admin/:path*"],
};
