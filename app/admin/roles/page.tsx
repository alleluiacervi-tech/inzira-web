import { NoAccess } from "@/components/PageStates";
import { PageHead } from "@/components/ui";
import RolesMatrix, { People } from "@/components/RolesMatrix";
import { getAdmin, getMyPermissions, getPermissionMatrix, listRoles, listStaff } from "@/lib/repo";

export const metadata = { title: "Roles & people" };
export default async function Page() {
  if (!(await getMyPermissions()).includes("manageStaff")) return <><PageHead title="Roles & people" /><NoAccess what="managing roles and people" /></>;
  const [roles, { groups, matrix }, staff, me] = await Promise.all([listRoles(), getPermissionMatrix(), listStaff(), getAdmin()]);
  return (
    <>
      <PageHead title="Roles & people" sub="Who can see and change what · every change is logged" />
      <div className="content">
        <RolesMatrix roles={roles} groups={groups} initial={matrix} />
        <People staff={staff} roles={roles} meId={me.id} />
      </div>
    </>
  );
}
