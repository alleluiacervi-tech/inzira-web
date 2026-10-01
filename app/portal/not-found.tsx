import { PageMissing } from "@/components/PageStates";

export default function NotFound() {
  return <PageMissing what="request" href="/portal/requests" back="My requests" />;
}
