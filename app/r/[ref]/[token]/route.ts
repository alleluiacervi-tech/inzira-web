import { redirect } from "next/navigation";
import { verifyAccess } from "@/lib/access";
import { enterRequest } from "@/lib/auth";
import { allowIp } from "@/lib/ratelimit";

/** A customer's private link. Opens a session limited to this one request and shows it. */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string; token: string }> }) {
  const { ref, token } = await params;
  const found = (await allowIp("link")) ? await verifyAccess(decodeURIComponent(ref), token) : null;
  // Wrong, revoked or expired: the same answer in every case, and a way back in.
  if (!found) redirect("/sign-in?link=invalid");
  const who = await enterRequest(found.accountId, found.ref);
  redirect(who === "staff" ? `/console/requests/${found.ref}` : `/portal/requests/${found.ref}`);
}
