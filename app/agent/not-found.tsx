import { PageMissing } from "@/components/PageStates";

export default function NotFound() {
  return <PageMissing what="case" href="/agent#cases" back="All cases" />;
}
