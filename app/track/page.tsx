import type { Metadata } from "next";
import PublicNav from "@/components/PublicNav";
import Footer from "@/components/Footer";
import Track from "@/components/Track";

export const metadata: Metadata = { title: "Track a request", description: "Check the progress of an Inzira request with its reference and your phone number." };

export default function TrackPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap" style={{ paddingTop: 56, paddingBottom: 96 }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}><Track /></div>
      </main>
      <Footer />
    </>
  );
}
