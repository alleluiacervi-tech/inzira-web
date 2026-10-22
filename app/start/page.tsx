import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import StartForm from "@/components/StartForm";
import { reviewFeeFor } from "@/lib/pricing";
import { canDeliverCodes } from "@/lib/sms";
import { getService } from "@/lib/repo";

export const metadata: Metadata = { title: "Describe what you need", description: "Not sure which service you need? Describe your situation and an agent will tell you which procedure applies and what it costs — before you commit." };

export default async function DescribePage() {
  // A described situation is sent as the catch-all service, so it starts with that service's review fee.
  const other = await getService("other-online-service");
  return (
    <>
      <PublicNav />
      <main id="main"><StartForm service={null} describeFee={other ? reviewFeeFor(other) : null} smsCodes={canDeliverCodes()} /></main>
    </>
  );
}
