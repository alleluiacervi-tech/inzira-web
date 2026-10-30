import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";
import { publicSearchEnabled } from "@/lib/search-policy";

export const dynamic = "force-dynamic";

// Public pages are indexed; every signed-in area, file and API route is not.
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  if (!publicSearchEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/portal", "/admin", "/console", "/files", "/api", "/sign-in", "/r/", "/staff", "/start", "/en/start", "/en/portal", "/en/admin", "/en/console", "/en/files", "/en/api", "/en/sign-in", "/en/r/", "/en/staff"] },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
