import type { MetadataRoute } from "next";
import { marketEnv } from "../lib/market/runtime";
import { sitemapData } from "../lib/market/public-data";
import { canonicalOrigin, languageAlternates, localizedUrl, staticPages } from "../lib/seo";
export const dynamic = "force-dynamic";
// Each page appears in French and English with its hreflang alternates.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = canonicalOrigin(marketEnv().SITE_URL);
  const entries: MetadataRoute.Sitemap = [];
  const add = (path: string, lastModified?: string | null, images?: string[]) => {
    for (const locale of ["fr", "en"] as const)
      entries.push({
        url: localizedUrl(origin, path, locale),
        lastModified: lastModified || undefined,
        alternates: { languages: languageAlternates(origin, path) },
        ...(images?.length ? { images } : {}),
      });
  };
  for (const path of Object.keys(staticPages)) add(path);
  const { products, creators } = await sitemapData().catch(() => ({ products: [], creators: [] }));
  for (const p of products)
    add("/agents/" + p.slug, p.updated_at, p.cover_url ? [p.cover_url] : undefined);
  for (const c of creators) add("/creators/" + c.username, c.updated_at);
  return entries;
}
