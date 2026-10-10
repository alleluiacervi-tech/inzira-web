import { redirect } from "next/navigation";
import { hasAdminAccess } from "@/lib/permissions";
import { getStaffUser, getMyPermissions } from "@/lib/repo";

export default async function ConsoleHome() {
  const [me, perms] = await Promise.all([getStaffUser(), getMyPermissions()]);
  redirect(hasAdminAccess(me.role, perms) ? "/console/overview" : "/console/my-day");
}
