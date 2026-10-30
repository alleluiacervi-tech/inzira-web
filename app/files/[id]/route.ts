import { eq } from "drizzle-orm";
import { canSeeCase } from "@/lib/access";
import { getSession, getStaffUser } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { getLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { audit } from "@/lib/mutate";
import { hasLink } from "@/lib/request-links";
import { readFile } from "@/lib/storage";

/** Serves an uploaded file to its owner (signed in, or holding the request's private link), or to staff who may download
 *  customer documents. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  // Staff read the console in English; everyone else in the language they last picked.
  const locale = session?.kind === "staff" ? "en" : await getLocale();
  const say = (key: "signIn" | "notFound" | "gone", status: number) => new Response(text(locale, `fileRoute.${key}`), { status, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" } });
  const d = await db();
  const [file] = await d.select().from(s.files).where(eq(s.files.id, id));
  if (!file) return say(session ? "notFound" : "signIn", session ? 404 : 401);

  if (session?.kind !== "staff") {
    const [owner] = await d.select({ accountId: s.profiles.accountId }).from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).where(eq(s.requests.ref, file.ref));
    const mine = session?.kind === "customer" && owner?.accountId === session.subjectId;
    if (!mine && !(await hasLink(file.ref))) return say(session ? "notFound" : "signIn", session ? 404 : 401);
  } else {
    const me = await getStaffUser();
    const [r] = await d.select({ agentId: s.requests.agentId }).from(s.requests).where(eq(s.requests.ref, file.ref));
    if (!me || !r || !me.permissions.has("downloadDocs") || !canSeeCase(me, r)) return say("notFound", 404);
    await audit(d, { actor: me.name, role: me.role, action: "Viewed document", entity: `${file.ref} · ${file.name}` });
  }

  const bytes = await readFile(file.storageKey);
  if (!bytes) return say("gone", 410);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${file.name.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
