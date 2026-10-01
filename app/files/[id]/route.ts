import { eq } from "drizzle-orm";
import { getSession, getStaffUser } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { audit } from "@/lib/mutate";
import { readFile } from "@/lib/storage";

/** Serves an uploaded file to its owner, or to staff who may download customer documents. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new Response("Sign in to see this file.", { status: 401 });
  const d = await db();
  const [file] = await d.select().from(s.files).where(eq(s.files.id, id));
  if (!file) return new Response("Not found", { status: 404 });

  if (session.kind === "customer") {
    const [owner] = await d.select({ accountId: s.profiles.accountId }).from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).where(eq(s.requests.ref, file.ref));
    if (owner?.accountId !== session.subjectId) return new Response("Not found", { status: 404 });
  } else {
    const me = await getStaffUser();
    const [r] = await d.select({ agentId: s.requests.agentId }).from(s.requests).where(eq(s.requests.ref, file.ref));
    if (!me || !me.permissions.has("downloadDocs") || (!me.permissions.has("viewAll") && r?.agentId !== me.id)) return new Response("Not found", { status: 404 });
    await audit(d, { actor: me.name, role: me.role, action: "Viewed document", entity: `${file.ref} · ${file.name}` });
  }

  const bytes = await readFile(file.storageKey);
  if (!bytes) return new Response("The file is no longer stored.", { status: 410 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${file.name.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
