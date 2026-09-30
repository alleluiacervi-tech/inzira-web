import { notFound } from "next/navigation";
import Workspace from "@/components/Workspace";
import { CASES } from "@/lib/data";

export function generateStaticParams() {
  return CASES.map((c) => ({ ref: c.ref }));
}
export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  return { title: `Case ${(await params).ref}` };
}
export default async function CasePage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = (await params).ref;
  if (!CASES.some((c) => c.ref === ref)) notFound();
  return <Workspace caseRef={ref} />;
}
