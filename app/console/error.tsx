"use client";
import { ConsoleError } from "@/components/console/ConsoleStates";

export default function ErrorPage(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ConsoleError {...props} />;
}
