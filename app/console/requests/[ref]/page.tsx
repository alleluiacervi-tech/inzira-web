import { notFound } from "next/navigation";
import {
  getMyPermissions,
  getNow,
  getRequest,
  getStaffUser,
  listAgents,
  listCategories,
} from "@/lib/repo";
import { RequestDetailView } from "@/components/console/RequestDetailView";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return { title: `Request ${ref}` };
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const [c, me, perms, agents, categories, now] = await Promise.all([
    getRequest(ref),
    getStaffUser(),
    getMyPermissions(),
    listAgents(),
    listCategories(),
    getNow(),
  ]);

  if (!c) notFound();

  const category = categories.find((cat) => cat.id === c.service.category)?.short || "";

  return (
    <RequestDetailView
      c={c}
      me={me}
      perms={perms}
      agents={agents}
      category={category}
      now={now}
    />
  );
}
