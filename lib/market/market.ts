// Shared market types and pure helpers (server routes and browser views).
export const marketRanges = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  all: 0,
} as const;
export type MarketRange = keyof typeof marketRanges;
export function marketRange(value: string | null | undefined): {
  key: MarketRange;
  days: number;
} {
  const key = (
    value && value in marketRanges ? value : "7d"
  ) as MarketRange;
  return { key, days: marketRanges[key] };
}
export type MarketOverview = {
  volume_cents: number;
  sales: number;
  acquisitions: number;
  listed: number;
  creators: number;
  floor_cents: number | null;
  avg_cents: number | null;
  free: number;
  new_listings: number;
  open_offers: number;
  series: { day: string; volume_cents: number; sales: number }[];
};
export function emptyOverview(days: number): MarketOverview {
  const span = Math.min(Math.max(days || 30, 1), 90);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return {
    volume_cents: 0,
    sales: 0,
    acquisitions: 0,
    listed: 0,
    creators: 0,
    floor_cents: null,
    avg_cents: null,
    free: 0,
    new_listings: 0,
    open_offers: 0,
    series: Array.from({ length: span }, (_, i) => {
      const d = new Date(today.getTime() - (span - 1 - i) * 86400000);
      return {
        day: d.toISOString().slice(0, 10),
        volume_cents: 0,
        sales: 0,
      };
    }),
  };
}
export type MarketEvent = {
  id: number;
  kind:
    | "listed"
    | "relisted"
    | "delisted"
    | "price_changed"
    | "sold"
    | "offer";
  amount_cents: number | null;
  previous_cents: number | null;
  created_at: string;
  product: {
    slug: string;
    title: string;
    kind: "agent" | "bundle";
    engine: string;
    cover_url: string | null;
  };
  seller: { username: string; display_name: string };
};
export type ProductStats = {
  sales: number;
  acquisitions: number;
  volume_cents: number;
  last_sale_cents: number | null;
  last_sale_at: string | null;
  favorites: number;
  offers: number;
  best_offer_cents: number | null;
  listed_at: string | null;
};
export type CreatorStats = {
  sales: number;
  acquisitions: number;
  volume_cents: number;
  buyers: number;
  listed: number;
  rating: number | null;
  reviews: number;
  verified: boolean;
  member_since: string | null;
  first_listed: string | null;
};
export type LeaderboardRow = {
  username: string;
  display_name: string;
  volume_cents: number;
  sales: number;
  listed: number;
  verified: boolean;
};
export type Offer = {
  id: string;
  product_id: string;
  amount_cents: number;
  list_cents: number;
  message: string;
  status:
    | "pending"
    | "accepted"
    | "declined"
    | "withdrawn"
    | "expired"
    | "completed";
  expires_at: string;
  responded_at: string | null;
  created_at: string;
  product?: {
    title: string;
    slug: string;
    price_cents: number;
    status: string;
    kind: string;
  } | null;
  counterpart?: { display_name: string; username: string } | null;
};
// Offers need at least a fifth of the asking price and must stay below it.
export function offerBounds(priceCents: number) {
  return {
    min: Math.max(100, Math.ceil(priceCents / 5)),
    max: priceCents - 1,
  };
}
export function compactMoney(cents: number, locale: "fr" | "en" = "fr") {
  return new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA", {
    style: "currency",
    currency: "CAD",
    notation: cents >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: cents % 100 === 0 || cents >= 1000000 ? 0 : 2,
  }).format(cents / 100);
}
export function timeAgo(
  iso: string,
  locale: "fr" | "en" = "fr",
  now = Date.now(),
) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "en" ? "en-CA" : "fr-CA", {
    numeric: "auto",
  });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return rtf.format(0, "minute");
}
// Percentage change between the first and second half of a daily series.
export function trend(series: { volume_cents: number }[]) {
  if (series.length < 2) return null;
  const half = Math.floor(series.length / 2);
  const before = series.slice(0, half).reduce((s, d) => s + d.volume_cents, 0);
  const after = series.slice(half).reduce((s, d) => s + d.volume_cents, 0);
  if (!before) return after ? 100 : null;
  return Math.round(((after - before) / before) * 100);
}
