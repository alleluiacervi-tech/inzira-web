import { ConsoleMissing } from "@/components/console/ConsoleStates";

export default function NotFound() {
  return <ConsoleMissing href="/admin" back="Back to the overview" />;
}
