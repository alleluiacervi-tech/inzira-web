import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { asLocale, rememberLocale } from "@/lib/i18n/locale";
import { withLocale } from "@/lib/seo";

/**
 * Only a path on this site, never another site. Browsers drop tabs and newlines from a Location
 * before resolving it ("/\t/evil.example" becomes "//evil.example"), so control characters are
 * refused and the path is rebuilt from what the URL parser makes of it.
 */
function backTo(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  if (!raw.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(raw)) return "/";
  try {
    const url = new URL(raw, "http://local.invalid");
    return url.origin === "http://local.invalid" ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

/**
 * The language switch, a plain form post: it stores the choice and sends the visitor back to the page
 * they were on, which then renders in the new language. A signed-in customer's portal and SMS
 * follow what they pick. Works without JavaScript.
 */
export async function POST(req: Request) {
  const fd = await req.formData().catch(() => new FormData());
  const locale = asLocale(String(fd.get("locale") ?? ""));
  await rememberLocale(locale);
  const session = await getSession();
  if (session?.kind === "customer") await (await db()).update(s.accounts).set({ locale }).where(eq(s.accounts.id, session.subjectId));
  const referer = req.headers.get("referer");
  const fallback = referer && URL.canParse(referer) ? (({ pathname, search }) => pathname + search)(new URL(referer)) : "/";
  return new Response(null, { status: 303, headers: { Location: withLocale(locale, backTo(fd.get("back") || fallback)), "Cache-Control": "no-store" } });
}
