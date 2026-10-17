import { requireStaff } from "@/lib/auth";
import { prettyDate, phaseLabel } from "@/lib/tax-calendar";
import { listDiary } from "@/lib/tax-diary";
import { getStaffUser, getMyDayData, getNow } from "@/lib/repo";
import { MyDayView } from "@/components/console/MyDayView";

export const metadata = { title: "My day" };

export default async function ConsoleMyDay() {
  const [me, auth, now] = await Promise.all([getStaffUser(), requireStaff("/console/my-day"), getNow()]);
  const [data, diary] = await Promise.all([getMyDayData(me.id), listDiary(auth)]);
  const taxes = diary.rows.filter((r) => r.attention).slice(0, 6).map((r) => ({
    id: r.id,
    title: `${r.client} · ${r.kindName}`,
    when: `${phaseLabel(r.phase)} · pay before ${prettyDate(r.workBy)}`,
    detail: r.payRoute === "through_us"
      ? (r.moneyReceipt ? `They sent money on ${r.moneyReceipt}. RRA is not paid yet.` : "They pay through Inzira. The money is not in yet.")
      : "They pay RRA themselves. No receipt is saved.",
  }));

  return <MyDayView staff={me} data={data} now={now} taxes={taxes} />;
}
