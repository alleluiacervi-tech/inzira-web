import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { asLocale, rememberLocale } from "@/lib/i18n/locale";

/** Only a path on this site, never another site ("//evil.example", "/\evil.example"). */
function backTo(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
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
  return new Response(null, { status: 303, headers: { Location: backTo(fd.get("back") || fallback), "Cache-Control": "no-store" } });
}
