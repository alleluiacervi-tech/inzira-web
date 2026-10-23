import { hasAdminAccess } from "@/lib/permissions";
import { getStaffUser, getMyPermissions } from "@/lib/repo";
import ConsoleMyDay from "./my-day/page";
import OverviewPage from "./overview/page";

/** The role's home, shown here rather than redirected to: a redirect from this page, under the console layout, made the
 *  Next.js router throw "Rendered more hooks than during the previous render" in the browser. */
export default async function ConsoleHome({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const [me, perms] = await Promise.all([getStaffUser(), getMyPermissions()]);
  return hasAdminAccess(me.role, perms) ? <OverviewPage searchParams={searchParams} /> : <ConsoleMyDay />;
}
