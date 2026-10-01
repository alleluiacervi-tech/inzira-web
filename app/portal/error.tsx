"use client";
import { PageError } from "@/components/PageStates";

export default function ErrorPage(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} />;
}
