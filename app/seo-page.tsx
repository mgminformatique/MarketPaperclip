// Server-only helpers shared by the home page and the catch-all page.
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { Locale } from "../lib/i18n/locale";
import { marketEnv } from "../lib/market/runtime";
import { pricesVisible } from "../lib/market/server";
import { initialData, type InitialData } from "../lib/market/public-data";
import { faqLd } from "../lib/faq";
import {
  breadcrumbLd,
  canonicalOrigin,
  itemListLd,
  jsonLdText,
  organizationLd,
  productLd,
  profileLd,
  routeMetadata,
  seoRoute,
  websiteLd,
} from "../lib/seo";

async function currentLocale(): Promise<Locale> {
  return (await headers()).get("x-market-language") === "en" ? "en" : "fr";
}

export async function pageMetadata(path: string): Promise<Metadata> {
  const origin = canonicalOrigin(marketEnv().SITE_URL);
  const route = seoRoute(path);
  const data = await initialData(path);
  const locale = await currentLocale();
  // Demonstration listings (no database configured) are never indexed.
  if (data.product?.product?.demo || data.creator?.demo)
    return {
      ...routeMetadata(route, locale, origin, {
        product: data.product ?? null,
        creator: data.creator ?? null,
      }),
      robots: { index: false, follow: true },
    };
  return routeMetadata(route, locale, origin, {
    product: data.product ?? null,
    creator: data.creator ?? null,
  });
}

export async function StructuredData({ data }: { data: InitialData }) {
  const origin = canonicalOrigin(marketEnv().SITE_URL);
  const locale = await currentLocale();
  const en = locale === "en";
  const route = seoRoute(data.path);
  const items: unknown[] = [];
  if (data.path === "/")
    items.push(organizationLd(origin), websiteLd(origin, locale), faqLd(locale));
  const catalog = data.catalog;
  if (catalog && !catalog.demo && catalog.products?.length)
    items.push(itemListLd(origin, catalog.products));
  const product = data.product;
  if (route.kind === "product" && product?.product && !product.product.demo) {
    const p = product.product;
    items.push(
      productLd(origin, locale, product, pricesVisible(marketEnv())),
      breadcrumbLd([
        { name: "MarketPaperclip", url: origin + "/" },
        p.kind === "bundle"
          ? { name: "Bundles", url: origin + "/bundles" }
          : { name: en ? "AI agents" : "Agents IA", url: origin + "/agents" },
        { name: p.title, url: origin + "/agents/" + p.slug },
      ]),
    );
  }
  const creator = data.creator;
  if (route.kind === "creator" && creator?.profile && !creator.demo) {
    items.push(
      profileLd(origin, creator),
      breadcrumbLd([
        { name: "MarketPaperclip", url: origin + "/" },
        { name: en ? "Creators" : "Créateurs", url: origin + "/creators" },
        { name: creator.profile.display_name, url: origin + "/creators/" + creator.profile.username },
      ]),
    );
  }
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdText(item) }}
        />
      ))}
    </>
  );
}
