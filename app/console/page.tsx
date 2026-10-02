import { redirect } from "next/navigation";
import { getStaffUser, getMyPermissions } from "@/lib/repo";

export default async function ConsoleHome() {
  const [me, perms] = await Promise.all([getStaffUser(), getMyPermissions()]);
  const isAdmin = ["editServices", "manageStaff", "refund", "viewAudit"].some((p) =>
    perms.includes(p as never)
  ) || me.role === "Owner" || me.role === "Administrator" || me.role === "Finance";

  if (isAdmin) {
    redirect("/console/overview");
  } else {
    redirect("/console/my-day");
  }
}
