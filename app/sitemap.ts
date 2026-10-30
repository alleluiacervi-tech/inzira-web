import type { MetadataRoute } from "next";
import { listCategories, listServices } from "@/lib/repo";
import { siteOrigin } from "@/lib/site";
import { publicSearchEnabled } from "@/lib/search-policy";
import { publicSitemap } from "@/lib/seo-sitemap";

// Built on request from the live catalogue, never frozen at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Search engines need absolute addresses, so there is no sitemap until NEXT_PUBLIC_SITE_URL is set.
  const origin = siteOrigin();
  if (!origin || !publicSearchEnabled()) return [];
  const [services, categories] = await Promise.all([listServices(), listCategories()]);
  return publicSitemap(origin, services, categories);
}
