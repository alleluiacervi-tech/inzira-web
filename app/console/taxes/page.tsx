import { TaxDiary } from "@/components/console/TaxDiary";
import { requireStaff } from "@/lib/auth";
import { listDiary } from "@/lib/tax-diary";

export const metadata = { title: "Tax diary" };

export default async function TaxDiaryPage({ searchParams }: { searchParams: Promise<{ lane?: string; client?: string }> }) {
  const [{ lane, client }, me] = await Promise.all([searchParams, requireStaff("/console/taxes")]);
  const chosen = lane === "open" || lane === "paid" ? lane : "attention";
  const { today, rows, clients } = await listDiary(me, { profileId: client });
  const canWrite = me.permissions.has("updateStatus") || me.permissions.has("recordOfficial");
  return <TaxDiary today={today} rows={rows} clients={clients} lane={chosen} clientId={client} canWrite={canWrite} />;
}
