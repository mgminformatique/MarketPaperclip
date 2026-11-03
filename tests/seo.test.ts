/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-LD fixtures */
// Search metadata, structured data and their safety with user-written content.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalOrigin,
  clip,
  jsonLdText,
  languageAlternates,
  productLd,
  profileLd,
  routeMetadata,
  seoRoute,
  staticPages,
} from "../lib/seo";
import { catalogQuery } from "../lib/market/public-data";
import type { Product } from "../lib/market/model";

const origin = "https://marketpaperclip.com";
const product: Product = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  seller_id: "22222222-2222-4222-8222-222222222222",
  slug: "recon-pro-1a2b3c4d",
  title: "Recon Pro",
  tagline: "Cartographie votre base de code et prépare un plan d’audit clair.",
  description:
    "Recon Pro inventorie les dépôts, repère les dépendances à risque et rédige un plan d’audit priorisé, constat par constat.",
  category: "Développement",
  kind: "agent",
  engine: "Claude",
  version: "1.2.0",
  price_cents: 4500,
  currency: "cad",
  license: "MIT",
  tags: ["Audit", "Sécurité"],
  requirements: "Node.js 22",
  setup: "Lisez le README.",
  agent_count: 1,
  status: "published",
  created_at: "2026-11-02T10:00:00Z",
  cover_url: "https://ltommtumsvvqxdknpkfd.supabase.co/storage/v1/object/public/product-covers/a.png",
  profiles: { display_name: "Atelier Nova", username: "atelier-nova" },
};

test("Routes are classified for indexing; private and unknown pages are not indexed", () => {
  assert.deepEqual(seoRoute("/"), { kind: "static", path: "/" });
  assert.deepEqual(seoRoute("/market/"), { kind: "static", path: "/market" });
  assert.deepEqual(seoRoute("/agents/recon-pro-1a2b3c4d"), {
    kind: "product",
    path: "/agents/recon-pro-1a2b3c4d",
    slug: "recon-pro-1a2b3c4d",
  });
  assert.equal(seoRoute("/creators/atelier-nova").kind, "creator");
  for (const p of ["/studio", "/studio/new", "/library", "/settings", "/admin", "/favorites"])
    assert.equal(seoRoute(p).kind, "private", p);
  for (const p of ["/agents/<script>", "/creators/x", "/whatever", "/agents/a/b"])
    assert.equal(seoRoute(p).kind, "missing", p);
  const hidden = routeMetadata(seoRoute("/library"), "fr", origin);
  assert.deepEqual(hidden.robots, { index: false, follow: false });
  const missing = routeMetadata(seoRoute("/agents/gone"), "en", origin, { product: null });
  assert.deepEqual(missing.robots, { index: false, follow: true });
});

test("Public pages carry their own copy, a self canonical and both language alternates", () => {
  for (const [path, page] of Object.entries(staticPages))
    for (const locale of ["fr", "en"] as const) {
      const copy = page[locale];
      assert.ok(copy.title.length <= 62, `${path} ${locale} title too long: ${copy.title.length}`);
      assert.ok(copy.description.length >= 70 && copy.description.length <= 170, `${path} ${locale} description length ${copy.description.length}`);
      const meta = routeMetadata(seoRoute(path), locale, origin);
      assert.equal(meta.alternates?.canonical, origin + path + (locale === "en" ? "?lang=en" : ""));
      assert.deepEqual(meta.alternates?.languages, languageAlternates(origin, path));
      assert.equal((meta.openGraph as { locale?: string })?.locale, locale === "en" ? "en_CA" : "fr_CA");
    }
  assert.equal(canonicalOrigin("http://localhost:8899"), origin);
  assert.equal(canonicalOrigin("not a url"), origin);
  assert.equal(canonicalOrigin("https://www.marketpaperclip.com/path"), "https://www.marketpaperclip.com");
});

test("Product metadata uses the listing's own words and cover", () => {
  const meta = routeMetadata(seoRoute("/agents/" + product.slug), "en", origin, {
    product: { product, reviews: [] },
  });
  const title = (meta.title as { absolute: string }).absolute;
  assert.match(title, /^Recon Pro — AI agent Claude \| MarketPaperclip$/);
  assert.ok((meta.description || "").length <= 158);
  assert.equal(meta.alternates?.canonical, origin + "/agents/" + product.slug + "?lang=en");
  const images = (meta.openGraph as { images: { url: string }[] }).images;
  assert.equal(images[0].url, product.cover_url);
  assert.equal(clip("a ".repeat(200), 20).length <= 20, true);
});

test("Product structured data: offer in CAD, rating from real reviews, price hidden when prices are", () => {
  const reviews = [
    { rating: 5, body: "Très utile", created_at: "2026-11-02T11:00:00Z", profiles: { display_name: "Julie" } },
    { rating: 4, body: "Bon agent", created_at: "2026-11-02T12:00:00Z", profiles: null },
    { rating: 9 },
  ];
  const ld = productLd(origin, "fr", { product, reviews }, true) as Record<string, any>;
  assert.equal(ld["@type"], "SoftwareApplication");
  assert.equal(ld.offers.price, "45.00");
  assert.equal(ld.offers.priceCurrency, "CAD");
  assert.equal(ld.aggregateRating.ratingValue, "4.5");
  assert.equal(ld.aggregateRating.reviewCount, 2);
  assert.equal(ld.review[1].author.name, "Acheteur confirmé");
  assert.equal(ld.author.url, origin + "/creators/atelier-nova");
  const hidden = productLd(origin, "fr", { product, reviews: [] }, false) as Record<string, any>;
  assert.equal(hidden.offers, undefined);
  assert.equal(hidden.aggregateRating, undefined);
  const profile = profileLd(origin, {
    profile: { display_name: "Atelier Nova", username: "atelier-nova", website: "javascript:alert(1)", bio: 42 },
    products: [product],
  }) as Record<string, any>;
  assert.equal(profile.mainEntity.sameAs, undefined);
  assert.equal(profile.mainEntity.description, undefined);
  assert.equal(profile.hasPart[0].url, origin + "/agents/" + product.slug);
});

test("User-written text cannot break out of the JSON-LD script", () => {
  const evil = { ...product, title: "</script><script>alert(1)</script><!--", tagline: "a b & c > d" };
  const text = jsonLdText(productLd(origin, "fr", { product: evil, reviews: [] }, true));
  assert.ok(!text.includes("<"), "no raw <");
  assert.ok(!text.includes(">"), "no raw >");
  assert.ok(!text.includes(" "), "no raw line separator");
  assert.equal((JSON.parse(text) as { name: string }).name, evil.title);
});

test("The server-rendered catalogue asks for exactly what the client asks first", () => {
  assert.equal(
    catalogQuery("/agents"),
    "q=&category=Tout&kind=agent&sort=featured&engine=all&page=0",
  );
  assert.match(catalogQuery("/"), /kind=all/);
  assert.match(catalogQuery("/bundles"), /kind=bundle/);
});

test("FAQ structured data mirrors the visible questions in both languages", async () => {
  const { faq, faqLd } = await import("../lib/faq");
  for (const locale of ["fr", "en"] as const) {
    const ld = faqLd(locale) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    assert.equal(ld.mainEntity.length, faq[locale].length);
    ld.mainEntity.forEach((q, i) => {
      assert.equal(q.name, faq[locale][i].q);
      assert.equal(q.acceptedAnswer.text, faq[locale][i].a);
    });
  }
  assert.equal(faq.fr.length, faq.en.length);
});
