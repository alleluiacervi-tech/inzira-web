import { notFound } from "next/navigation";
import { getClient, getNow } from "@/lib/repo";
import { ClientDetailView } from "@/components/console/ClientDetailView";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Client ${id}` };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [client, now] = await Promise.all([getClient(id), getNow()]);

  if (!client) notFound();

  return <ClientDetailView client={client} now={now} />;
}
