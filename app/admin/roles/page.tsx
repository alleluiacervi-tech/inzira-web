import { PageHead } from "@/components/ui";
import RolesMatrix from "@/components/RolesMatrix";

export const metadata = { title: "Roles & permissions" };
export default function Page() {
  return (
    <>
      <PageHead title="Roles & permissions" sub="Who can see and change what · every change is logged" />
      <div className="content"><RolesMatrix /></div>
    </>
  );
}
