// Public data rendered on the server, so search engines and link previews
// receive real product, creator and catalogue content in the first HTML.
// It reuses the anonymous API routes (no cookie, no network round trip).
import { cache } from "react";
import { marketApi } from "./api";
import { marketEnv } from "./runtime";
import type { Product } from "./model";
import { seoRoute } from "../seo";

const internal = "https://marketpaperclip.internal/api/";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API JSON
export const publicGet = cache(async (path: string): Promise<any> => {
  try {
    const response = await marketApi(new Request(internal + path), marketEnv());
    return response.ok ? await response.json() : null;
  } catch {
    // Rendering must never fail because enrichment data is unavailable.
    return null;
  }
});

// The catalogue query the client issues first for each catalogue route, so the
// server-rendered grid and the client's first fetch agree.
export function catalogQuery(path: string) {
  const kind = path === "/bundles" ? "bundle" : path === "/agents" ? "agent" : "all";
  return new URLSearchParams({
    q: "",
    category: "Tout",
    kind,
    sort: "featured",
    engine: "all",
    page: "0",
  }).toString();
}

export type InitialData = {
  path: string;
  product?: {
    product: Product;
    reviews: unknown[];
    stats: unknown;
    activity: unknown[];
    owned?: boolean;
  } | null;
  creator?: {
    profile: Record<string, unknown> & { display_name: string; username: string };
    products: Product[];
    stats?: unknown;
    activity?: unknown[];
    demo?: boolean;
  } | null;
  catalog?: { products: Product[]; total: number; demo?: boolean } | null;
};

export async function initialData(pathname: string): Promise<InitialData> {
  const route = seoRoute(pathname);
  const path = route.path;
  if (route.kind === "product")
    return { path, product: await publicGet("products/" + encodeURIComponent(route.slug)) };
  if (route.kind === "creator")
    return { path, creator: await publicGet("creators/" + encodeURIComponent(route.username)) };
  if (["/", "/agents", "/bundles"].includes(path))
    return { path, catalog: await publicGet("catalog?" + catalogQuery(path)) };
  return { path };
}

// Every published listing and creator, for the sitemap (anonymous, RLS-bound).
export async function sitemapData() {
  const { createClient } = await import("@supabase/supabase-js");
  const c = marketEnv();
  const key = c.SUPABASE_PUBLISHABLE_KEY || c.SUPABASE_ANON_KEY;
  if (!c.SUPABASE_URL || !key) return { products: [], creators: [] };
  const db = createClient(c.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [products, creators] = await Promise.all([
    db
      .from("products")
      .select("slug,updated_at,cover_url")
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(5000),
    db
      .from("profiles")
      .select("username,products!products_seller_id_fkey!inner(updated_at)")
      .eq("products.status", "published")
      .limit(5000),
  ]);
  return {
    products: (products.data || []) as { slug: string; updated_at: string; cover_url: string | null }[],
    creators: ((creators.data || []) as { username: string; products: { updated_at: string }[] }[]).map((c) => ({
      username: c.username,
      updated_at: c.products.map((p) => p.updated_at).sort().at(-1) || null,
    })),
  };
}
