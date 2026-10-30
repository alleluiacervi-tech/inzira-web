import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";
import { isDemo } from "@/lib/sms";

// Public pages are indexed; every signed-in area, file and API route is not.
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  if (isDemo()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/portal", "/admin", "/console", "/files", "/api", "/sign-in", "/r/", "/staff"] },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
