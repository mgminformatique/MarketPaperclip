// Search and sharing metadata for every route: titles, descriptions,
// canonical and hreflang URLs, robots directives, Open Graph and schema.org.
import type { Metadata } from "next";
import type { Locale } from "./i18n/locale";
import type { Product } from "./market/model";

export const DEFAULT_ORIGIN = "https://marketpaperclip.com";
export const SITE_NAME = "MarketPaperclip";

export function canonicalOrigin(siteUrl?: string) {
  try {
    const url = new URL(siteUrl || DEFAULT_ORIGIN);
    return url.protocol === "https:" ? url.origin : DEFAULT_ORIGIN;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

type Copy = { title: string; description: string };
type StaticPage = { fr: Copy; en: Copy; index?: boolean };

// Public pages with their own search copy. Titles stay under ~60 characters.
export const staticPages: Record<string, StaticPage> = {
  "/": {
    fr: {
      title: "MarketPaperclip — Marketplace d’agents IA pour développeurs",
      description:
        "Achetez et vendez des agents IA et des bundles d’agents prêts à l’emploi pour Claude, GPT, Gemini et Ollama : le marketplace des développeurs Paperclip.",
    },
    en: {
      title: "MarketPaperclip — The AI agent marketplace for developers",
      description:
        "Buy and sell ready-to-use AI agents and agent bundles for Claude, GPT, Gemini and Ollama. The developer marketplace built around Paperclip.",
    },
  },
  "/market": {
    fr: {
      title: "Le marché des agents IA en temps réel | MarketPaperclip",
      description:
        "Volume, ventes, prix plancher, tendances et meilleurs créateurs : suivez en direct le marché des agents IA. Prix fixés par les créateurs, paiements Stripe.",
    },
    en: {
      title: "The live AI agent market | MarketPaperclip",
      description:
        "Volume, sales, floor price, trends and top creators: follow the AI agent market live. Creator-set prices, Stripe payments.",
    },
  },
  "/agents": {
    fr: {
      title: "Agents IA à acheter — Catalogue | MarketPaperclip",
      description:
        "Agents IA pour le développement, la recherche, le marketing, les opérations, le design et le support client. Filtrez par modèle : Claude, GPT, Gemini, Ollama.",
    },
    en: {
      title: "AI agents for sale — Catalogue | MarketPaperclip",
      description:
        "AI agents for development, research, marketing, operations, design and customer support. Filter by model: Claude, GPT, Gemini, Ollama.",
    },
  },
  "/bundles": {
    fr: {
      title: "Bundles d’agents IA : des équipes prêtes à l’emploi",
      description:
        "Des équipes d’agents IA coordonnés, livrées dans un seul package : planification, rédaction, recherche, code. Installez une équipe complète en quelques minutes.",
    },
    en: {
      title: "AI agent bundles: ready-to-work teams | MarketPaperclip",
      description:
        "Coordinated teams of AI agents delivered in one package: planning, writing, research, code. Install a complete team in minutes.",
    },
  },
  "/creators": {
    fr: {
      title: "Créateurs d’agents IA — Studios et développeurs",
      description:
        "Les développeurs et studios qui conçoivent des agents IA : profils, créations publiées, ventes et avis d’acheteurs confirmés sur MarketPaperclip.",
    },
    en: {
      title: "AI agent creators — Studios and developers",
      description:
        "The developers and studios building AI agents: profiles, published creations, sales and verified buyer reviews on MarketPaperclip.",
    },
  },
  "/docs": {
    fr: {
      title: "Vendre ses agents IA : le guide du créateur",
      description:
        "Préparer un package d’agent, le documenter, le publier, fixer son prix et encaisser avec Stripe : le guide pour transformer vos agents IA en produits.",
    },
    en: {
      title: "Sell your AI agents: the creator guide | MarketPaperclip",
      description:
        "Package an agent, document it, publish it, set your price and get paid with Stripe: the guide to turning your AI agents into products.",
    },
  },
  "/licenses": {
    fr: {
      title: "Licences des agents IA | MarketPaperclip",
      description:
        "MIT, Apache 2.0 ou licences commerciales individuelle et équipe : ce que chaque licence permet pour les agents achetés sur MarketPaperclip.",
    },
    en: {
      title: "AI agent licenses | MarketPaperclip",
      description:
        "MIT, Apache 2.0 or commercial individual and team licenses: what each license allows for agents bought on MarketPaperclip.",
    },
  },
  "/terms": {
    fr: {
      title: "Conditions d’utilisation | MarketPaperclip",
      description:
        "Les conditions d’utilisation, de vente et de publication du marketplace d’agents IA MarketPaperclip.",
    },
    en: {
      title: "Terms of use | MarketPaperclip",
      description:
        "Terms of use, sale and publication for the MarketPaperclip AI agent marketplace.",
    },
  },
  "/privacy": {
    fr: {
      title: "Politique de confidentialité | MarketPaperclip",
      description:
        "Comment MarketPaperclip protège vos données : comptes, achats, paiements Stripe et téléchargements privés.",
    },
    en: {
      title: "Privacy policy | MarketPaperclip",
      description:
        "How MarketPaperclip protects your data: accounts, purchases, Stripe payments and private downloads.",
    },
  },
  "/support": {
    fr: {
      title: "Assistance et aide aux acheteurs | MarketPaperclip",
      description:
        "Une question sur un achat, un téléchargement ou une publication ? Contactez l’assistance de MarketPaperclip.",
    },
    en: {
      title: "Support for buyers and creators | MarketPaperclip",
      description:
        "A question about a purchase, a download or a listing? Contact MarketPaperclip support.",
    },
  },
};

// Signed-in areas: useful to people, not to search results.
const privatePrefixes = ["/studio", "/library", "/settings", "/admin", "/favorites"];

export type SeoRoute =
  | { kind: "static"; path: string }
  | { kind: "product"; path: string; slug: string }
  | { kind: "creator"; path: string; username: string }
  | { kind: "private"; path: string }
  | { kind: "missing"; path: string };

export function seoRoute(pathname: string): SeoRoute {
  const path = "/" + pathname.split("?")[0].replace(/^\/+|\/+$/g, "");
  if (staticPages[path]) return { kind: "static", path };
  if (privatePrefixes.some((p) => path === p || path.startsWith(p + "/")))
    return { kind: "private", path };
  const product = path.match(/^\/agents\/([a-z0-9-]{1,120})$/);
  if (product) return { kind: "product", path, slug: product[1] };
  const creator = path.match(/^\/creators\/([a-z0-9][a-z0-9_-]{2,29})$/);
  if (creator) return { kind: "creator", path, username: creator[1] };
  return { kind: "missing", path };
}

export function localizedUrl(origin: string, path: string, locale: Locale) {
  return origin + path + (locale === "en" ? "?lang=en" : "");
}

// Language-only codes: an English speaker anywhere (not only in Canada) is
// sent to the English page; other languages fall back to x-default.
export function languageAlternates(origin: string, path: string) {
  return {
    fr: localizedUrl(origin, path, "fr"),
    en: localizedUrl(origin, path, "en"),
    "x-default": localizedUrl(origin, path, "fr"),
  };
}

export function ogImage(origin: string, locale: Locale) {
  return {
    url: `${origin}/og/marketpaperclip-${locale}.jpg`,
    width: 1200,
    height: 630,
    alt:
      locale === "en"
        ? "MarketPaperclip — The AI agent marketplace"
        : "MarketPaperclip — Le marketplace des agents IA",
  };
}

export function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd() + "…";
}

type Review = {
  rating: number;
  body?: string;
  created_at?: string;
  profiles?: { display_name?: string } | null;
};
type ProductData = { product: Product; reviews?: unknown[] };
type CreatorData = {
  profile: { display_name: string; username: string; [field: string]: unknown };
  products?: Product[];
};
const text = (value: unknown) => (typeof value === "string" ? value : "");

export function routeMetadata(
  route: SeoRoute,
  locale: Locale,
  origin: string,
  data: { product?: ProductData | null; creator?: CreatorData | null } = {},
): Metadata {
  const en = locale === "en";
  const image = ogImage(origin, locale);
  const base = (copy: Copy, path: string, extra: Partial<Metadata> = {}): Metadata => ({
    title: { absolute: copy.title },
    description: copy.description,
    alternates: {
      canonical: localizedUrl(origin, path, locale),
      languages: languageAlternates(origin, path),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: copy.title,
      description: copy.description,
      url: localizedUrl(origin, path, locale),
      locale: en ? "en_CA" : "fr_CA",
      alternateLocale: en ? "fr_CA" : "en_CA",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [image.url],
    },
    robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    ...extra,
  });
  if (route.kind === "static") {
    const page = staticPages[route.path];
    return base(en ? page.en : page.fr, route.path);
  }
  if (route.kind === "product" && data.product?.product) {
    const p = data.product.product;
    const kind = p.kind === "bundle" ? (en ? "AI agent bundle" : "bundle d’agents IA") : en ? "AI agent" : "agent IA";
    const title = clip(`${p.title} — ${kind} ${p.engine}`, 58) + " | " + SITE_NAME;
    const description = clip(`${p.tagline} ${p.description}`, 158);
    const meta = base({ title, description }, route.path);
    if (p.cover_url && meta.openGraph && meta.twitter) {
      meta.openGraph.images = [{ url: p.cover_url, alt: p.title }, image];
      meta.twitter.images = [p.cover_url];
    }
    return meta;
  }
  if (route.kind === "creator" && data.creator?.profile) {
    const c = data.creator.profile;
    const title = clip(`${c.display_name} (@${c.username}) — ${en ? "AI agent creator" : "créateur d’agents IA"}`, 58);
    const count = data.creator.products?.length || 0;
    const description = clip(
      text(c.bio) ||
        (en
          ? `${c.display_name} builds AI agents on MarketPaperclip: ${count} published creation${count === 1 ? "" : "s"}, reviews and market activity.`
          : `${c.display_name} crée des agents IA sur MarketPaperclip : ${count} création${count > 1 ? "s" : ""} publiée${count > 1 ? "s" : ""}, avis et activité du marché.`),
      158,
    );
    const meta = base({ title, description }, route.path);
    if (meta.openGraph) meta.openGraph = { ...meta.openGraph, type: "profile" };
    // The creator's own banner (or photo) represents the profile when shared.
    const picture = text(c.banner_url) || text(c.avatar_url);
    if (picture.startsWith("https://") && meta.openGraph && meta.twitter) {
      meta.openGraph.images = [{ url: picture, alt: c.display_name }, image];
      meta.twitter.images = [picture];
    }
    return meta;
  }
  const notIndexed = { index: false, follow: route.kind === "private" ? false : true };
  return {
    title: {
      absolute:
        route.kind === "private"
          ? en
            ? "My workspace | MarketPaperclip"
            : "Mon espace | MarketPaperclip"
          : en
            ? "Page not found | MarketPaperclip"
            : "Page introuvable | MarketPaperclip",
    },
    robots: notIndexed,
  };
}

// --- schema.org -------------------------------------------------------------

type JsonLd = Record<string, unknown>;

export function organizationLd(origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": origin + "/#organization",
    name: SITE_NAME,
    url: origin + "/",
    logo: { "@type": "ImageObject", url: origin + "/icons/icon-512.png", width: 512, height: 512 },
    parentOrganization: {
      "@type": "Organization",
      name: "MGM Informatique",
      url: "https://mgminformatique.ca",
    },
  };
}

export function websiteLd(origin: string, locale: Locale): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": origin + "/#website",
    name: SITE_NAME,
    alternateName: ["Market Paperclip", "marketpaperclip"],
    url: origin + "/",
    inLanguage: locale === "en" ? "en-CA" : "fr-CA",
    publisher: { "@id": origin + "/#organization" },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: origin + "/agents?q={search_term_string}" },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function itemListLd(origin: string, products: Product[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.slice(0, 24).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: origin + "/agents/" + p.slug,
      name: p.title,
    })),
  };
}

export function productLd(
  origin: string,
  locale: Locale,
  data: ProductData,
  showPrice: boolean,
): JsonLd {
  const p = data.product;
  const url = origin + "/agents/" + p.slug;
  const reviews = ((data.reviews || []) as Review[]).filter(
    (r) => Number.isInteger(r?.rating) && r.rating >= 1 && r.rating <= 5,
  );
  // Also a Product: with its Offer it qualifies for product snippets (price)
  // before it has any review, which SoftwareApplication alone does not.
  const ld: JsonLd = {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "Product"],
    "@id": url + "#software",
    name: p.title,
    description: clip(`${p.tagline} ${p.description}`, 500),
    url,
    image: p.cover_url || ogImage(origin, locale).url,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: p.category,
    operatingSystem: "Windows, macOS, Linux",
    softwareVersion: p.version,
    inLanguage: locale === "en" ? "en-CA" : "fr-CA",
    keywords: [...p.tags, p.engine, "AI agent", "Paperclip"].join(", "),
    author: p.profiles
      ? {
          "@type": "Person",
          name: p.profiles.display_name,
          url: origin + "/creators/" + p.profiles.username,
        }
      : undefined,
    publisher: { "@id": origin + "/#organization" },
  };
  if (showPrice && typeof p.price_cents === "number")
    ld.offers = {
      "@type": "Offer",
      price: (p.price_cents / 100).toFixed(2),
      priceCurrency: "CAD",
      availability: "https://schema.org/InStock",
      url,
      seller: p.profiles ? { "@type": "Person", name: p.profiles.display_name } : undefined,
    };
  if (reviews.length) {
    ld.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1),
      reviewCount: reviews.length,
      bestRating: 5,
      worstRating: 1,
    };
    // Google requires a real author name: reviews without a public profile
    // count in the rating but are not listed.
    const named = reviews.filter((r) => text(r.profiles?.display_name));
    if (named.length)
      ld.review = named.slice(0, 5).map((r) => ({
        "@type": "Review",
        reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        author: { "@type": "Person", name: text(r.profiles?.display_name) },
        reviewBody: r.body ? clip(r.body, 400) : undefined,
        datePublished: r.created_at?.slice(0, 10),
      }));
  }
  return ld;
}

export function profileLd(origin: string, data: CreatorData): JsonLd {
  const c = data.profile;
  const url = origin + "/creators/" + c.username;
  const website = text(c.website);
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    dateCreated: text(c.created_at) || undefined,
    mainEntity: {
      "@type": "Person",
      name: c.display_name,
      alternateName: "@" + c.username,
      identifier: c.username,
      description: text(c.bio) || undefined,
      image: text(c.avatar_url).startsWith("https://") ? text(c.avatar_url) : undefined,
      url,
      sameAs: website.startsWith("https://") ? [website] : undefined,
    },
    hasPart: (data.products || []).slice(0, 24).map((p) => ({
      "@type": "SoftwareApplication",
      name: p.title,
      url: origin + "/agents/" + p.slug,
    })),
  };
}

// Script-safe JSON for <script type="application/ld+json">: user text can never
// close the tag or open an HTML comment.
export function jsonLdText(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}
