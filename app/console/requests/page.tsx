import {
  getNow,
  listCategories,
  listSavedViews,
  listStaff,
  listStageTargets,
  loadRequests,
} from "@/lib/repo";
import { RequestsListView } from "@/components/console/RequestsListView";

export const metadata = { title: "Requests" };

export default async function RequestsPage() {
  const [requests, staff, categoriesList, stageTargets, savedViews, now] = await Promise.all([
    loadRequests(),
    listStaff(),
    listCategories(),
    listStageTargets(),
    listSavedViews("requests"),
    getNow(),
  ]);

  const agents = staff.filter((s) => s.active && s.role === "Agent");
  const categories = Object.fromEntries(categoriesList.map((c) => [c.id, c.short || c.name]));

  return (
    <RequestsListView
      requests={requests}
      agents={agents}
      categories={categories}
      stageTargets={stageTargets}
      savedViews={savedViews}
      now={now}
    />
  );
}
