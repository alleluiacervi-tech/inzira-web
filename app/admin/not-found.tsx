import { PageMissing } from "@/components/PageStates";

export default function NotFound() {
  return <PageMissing what="page" href="/admin" back="Admin overview" />;
}
