import type { MetadataRoute } from "next";
import { listServices } from "@/lib/repo";
import { siteOrigin } from "@/lib/site";

// Built on request from the live catalogue, never frozen at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Search engines need absolute addresses, so there is no sitemap until NEXT_PUBLIC_SITE_URL is set.
  const origin = siteOrigin();
  if (!origin) return [];
  const services = await listServices();
  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/services`, changeFrequency: "weekly", priority: 0.9 },
    ...services.map((s) => ({ url: `${origin}/services/${s.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: `${origin}/start`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/track`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
