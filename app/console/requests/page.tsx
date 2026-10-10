import {
  getNow,
  listAgents,
  listCases,
  listCategories,
  listSavedViews,
  listStageTargets,
} from "@/lib/repo";
import { RequestsListView } from "@/components/console/RequestsListView";

export const metadata = { title: "Requests" };

export default async function RequestsPage() {
  const [requests, agents, categoriesList, stageTargets, savedViews, now] = await Promise.all([
    listCases(),
    listAgents(),
    listCategories(),
    listStageTargets(),
    listSavedViews("requests"),
    getNow(),
  ]);

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
