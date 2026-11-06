import { z } from "zod";
// The site's CSP forbids eval: without this, zod probes `new Function("")` when
// the first object schema is created and the browser reports a CSP violation
// on every page. Must run before any z.object() below.
z.config({ jitless: true });
export const categories = [
  "Développement",
  "Recherche & data",
  "Marketing",
  "Opérations",
  "Design",
  "Support client",
] as const;
export const engines = [
  "Claude",
  "GPT",
  "Gemini",
  "Ollama",
  "Multi-modèles",
] as const;
export const productInput = z
  .object({
    title: z.string().trim().min(3).max(80),
    tagline: z.string().trim().min(15).max(160),
    description: z.string().trim().min(80).max(20000),
    category: z.enum(categories),
    kind: z.enum(["agent", "bundle"]),
    engine: z.enum(engines),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    price_cents: z.number().int().min(0).max(1000000),
    currency: z.literal("cad").default("cad"),
    license: z.enum([
      "MIT",
      "Apache-2.0",
      "Commerciale — usage individuel",
      "Commerciale — équipe",
    ]),
    tags: z.array(z.string().trim().min(1).max(24)).max(8),
    requirements: z.string().trim().min(10).max(3000),
    setup: z.string().trim().min(20).max(10000),
    agent_count: z.number().int().min(1).max(1000).default(1),
    status: z.enum(["draft", "pending"]).default("draft"),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.kind === "agent" && v.agent_count !== 1)
      c.addIssue({
        code: "custom",
        path: ["agent_count"],
        message: "Un agent individuel contient un seul agent.",
      });
    if (v.kind === "bundle" && v.agent_count < 2)
      c.addIssue({
        code: "custom",
        path: ["agent_count"],
        message: "Un bundle contient au moins deux agents.",
      });
  });
export const profileInput = z
  .object({
    display_name: z.string().trim().min(2).max(60),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9_-]{2,29}$/),
    bio: z.string().trim().max(600),
    website: z.union([
      z.literal(""),
      z
        .string()
        .url()
        .refine((v) => v.startsWith("https://"), "Utilisez une adresse HTTPS."),
    ]),
  })
  .strict();
export type Product = {
  id: string;
  seller_id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  category: string;
  kind: "agent" | "bundle";
  engine: string;
  version: string;
  // Preview listings can have no price yet; published products require a number.
  price_cents: number | null;
  currency: string;
  license: string;
  tags: string[];
  requirements: string;
  setup: string;
  agent_count: number;
  status: string;
  created_at: string;
  art?: string;
  cover_url?: string | null;
  demo?: boolean;
  profiles?: {
    display_name: string;
    username: string;
    bio?: string;
    avatar_url?: string | null;
  };
};
// A listing as shown inside a post (public columns only).
export type PostProduct = Pick<
  Product,
  | "id"
  | "seller_id"
  | "slug"
  | "title"
  | "tagline"
  | "description"
  | "category"
  | "kind"
  | "agent_count"
  | "engine"
  | "version"
  | "price_cents"
  | "currency"
  | "license"
  | "tags"
  | "requirements"
  | "setup"
  | "status"
  | "created_at"
  | "cover_url"
>;
export type Post = {
  id: string;
  author_id: string;
  body: string;
  images: string[];
  created_at: string;
  product: PostProduct | null;
};
export const POST_IMAGE_LIMIT = 4;
export function platformFee(amount: number, bps: number) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !Number.isInteger(bps) ||
    bps < 0 ||
    bps > 3000
  )
    throw new Error("Configuration de commission invalide.");
  return Math.round((amount * bps) / 10000);
}
export function money(cents: number, locale: "fr" | "en" = "fr") {
  return new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA", {
    style: "currency",
    currency: "CAD",
    currencyDisplay: "code",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
export function priceInCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 1000000
    ? cents
    : null;
}
export const uuid = z.string().uuid();
export const postInput = z
  .object({
    body: z.string().trim().max(2000).default(""),
    product_id: uuid,
    images: z.array(z.string().max(500)).max(POST_IMAGE_LIMIT).default([]),
  })
  .strict();
export function safeReturn(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20]/.test(value)
  )
    return "/library";
  try {
    const u = new URL(value, "https://marketpaperclip.invalid");
    return u.origin === "https://marketpaperclip.invalid"
      ? u.pathname + u.search + u.hash
      : "/library";
  } catch {
    return "/library";
  }
}
export function canDownload(
  order: { buyer_id: string; status: string } | null,
  buyerId: string,
) {
  return !!order && order.buyer_id === buyerId && order.status === "paid";
}
export function filterProducts(
  products: Product[],
  q: string,
  category: string,
  kind: string,
  sort: string,
) {
  let r = products.filter(
    (p) =>
      (category === "Tout" || p.category === category) &&
      (kind === "all" || p.kind === kind) &&
      (!q ||
        [p.title, p.tagline, p.engine, p.category, ...p.tags]
          .join(" ")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(
            q
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, ""),
          )),
  );
  return [...r].sort((a, b) => {
    if (sort === "price-asc" || sort === "price-desc") {
      if (a.price_cents === null) return b.price_cents === null ? 0 : 1;
      if (b.price_cents === null) return -1;
      return sort === "price-asc"
        ? a.price_cents - b.price_cents
        : b.price_cents - a.price_cents;
    }
    return sort === "new" ? b.created_at.localeCompare(a.created_at) : 0;
  });
}
