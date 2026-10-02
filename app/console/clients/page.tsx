import { getNow, listClients } from "@/lib/repo";
import { ClientsListView } from "@/components/console/ClientsListView";

export const metadata = { title: "Clients Directory" };

export default async function ClientsPage() {
  const [clients, now] = await Promise.all([listClients(), getNow()]);

  return <ClientsListView clients={clients} now={now} />;
}
