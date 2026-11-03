import type { MetadataRoute } from "next";
import { marketEnv } from "../lib/market/runtime";
import { canonicalOrigin } from "../lib/seo";
export const dynamic = "force-dynamic";
// Search engines and AI crawlers may read every public page; signed-in areas
// and the API stay out of results. Non-canonical hosts send X-Robots-Tag.
export default function robots(): MetadataRoute.Robots {
  const origin = canonicalOrigin(marketEnv().SITE_URL);
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/studio", "/library", "/settings", "/admin", "/favorites"],
      },
    ],
    sitemap: origin + "/sitemap.xml",
    host: origin,
  };
}
