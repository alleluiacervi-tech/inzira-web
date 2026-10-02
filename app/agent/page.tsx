import { getAgent, getMyDayData, getNow } from "@/lib/repo";
import { MyDayView } from "@/components/console/MyDayView";

export const metadata = { title: "My day" };

export default async function AgentHome() {
  const [me, now] = await Promise.all([getAgent(), getNow()]);
  const data = await getMyDayData(me.id);

  return <MyDayView staff={me} data={data} now={now} />;
}
