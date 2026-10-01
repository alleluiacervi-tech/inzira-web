import { PageHead } from "@/components/ui";
import Intake from "@/components/Intake";
import { listServices } from "@/lib/repo";

export const metadata = { title: "New intake" };
export default async function IntakePage() {
  return (
    <>
      <PageHead title="New intake" sub="Open a case for a walk-in, a phone call or a WhatsApp message" />
      <div className="content"><Intake services={await listServices()} /></div>
    </>
  );
}
