import { PageHead } from "@/components/ui";
import ServiceAdmin from "@/components/ServiceAdmin";

export const metadata = { title: "Services & categories" };
export default function Page() {
  return (
    <>
      <PageHead title="Services & categories" sub="What customers see in the catalogue · prices are always two lines" />
      <div className="content"><ServiceAdmin /></div>
    </>
  );
}
