import { getStaffUser, getMyDayData, getNow } from "@/lib/repo";
import { MyDayView } from "@/components/console/MyDayView";

export const metadata = { title: "My day" };

export default async function ConsoleMyDay() {
  const [me, now] = await Promise.all([getStaffUser(), getNow()]);
  const data = await getMyDayData(me.id);

  return <MyDayView staff={me} data={data} now={now} />;
}
