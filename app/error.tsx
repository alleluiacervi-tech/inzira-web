"use client";
import PublicNav from "@/components/PublicNav";
import { PageError } from "@/components/PageStates";

export default function ErrorPage(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <PublicNav />
      <main id="main" className="wrap" style={{ paddingTop: 48, paddingBottom: 96 }}><PageError {...props} /></main>
    </>
  );
}
