import type { MetadataRoute } from "next";
import { marketEnv } from "../lib/market/runtime";
import { canonicalOrigin } from "../lib/seo";
export const dynamic = "force-dynamic";
// Search engines and AI crawlers may read every public page. Signed-in areas
// stay out of results through their own noindex meta tag, which crawlers can
// only see if robots.txt lets them fetch the page (a blocked page can still be
// listed as "Indexed, though blocked by robots.txt"). The API is not crawled.
// Non-canonical hosts send X-Robots-Tag.
export default function robots(): MetadataRoute.Robots {
  const origin = canonicalOrigin(marketEnv().SITE_URL);
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: origin + "/sitemap.xml",
    host: origin,
  };
}
