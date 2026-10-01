import { notFound } from "next/navigation";
import Workspace from "@/components/Workspace";
import { getAgent, getCase, getMyPermissions, getNow, listCategories, listStaff } from "@/lib/repo";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  return { title: `Case ${(await params).ref}` };
}
export default async function CasePage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = (await params).ref;
  const [c, me, perms, staff, categories, now] = await Promise.all([getCase(ref), getAgent(), getMyPermissions(), listStaff(), listCategories(), getNow()]);
  if (!c) notFound();
  const agents = staff.filter((s) => s.role === "Agent" && s.active).map(({ phone: _phone, ...rest }) => rest);
  return <Workspace c={c} me={me} perms={perms} agents={agents} category={categories.find((x) => x.id === c.service.category)?.short ?? ""} now={now} />;
}
