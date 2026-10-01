import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import StartForm from "@/components/StartForm";

export const metadata: Metadata = { title: "Describe what you need", description: "Not sure which service you need? Describe your situation and an agent will tell you which procedure applies and what it costs — before you commit." };

export default function DescribePage() {
  return (
    <>
      <PublicNav />
      <main><StartForm service={null} /></main>
    </>
  );
}
