import { ConsoleMissing } from "@/components/console/ConsoleStates";

export default function NotFound() {
  return <ConsoleMissing what="request or client" />;
}
