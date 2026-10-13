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

/** The list filters a link may set, e.g. /console/requests?payment=overdue. */
const URL_FILTERS = ["stage", "agent", "payment", "channel", "waitingDays", "stageDays", "completedSince", "closed", "attention", "state"];

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const initialFilters = Object.fromEntries(URL_FILTERS.flatMap((k) => (typeof params[k] === "string" ? [[k, params[k] as string]] : [])));
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
      initialFilters={initialFilters}
      now={now}
    />
  );
}
