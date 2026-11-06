// Temporary, browser-local scenario. It has no database or payment client.
// Set this to false and redeploy to remove the demo entry and query mode.
import type { MarketEvent } from "./market";
import { matchesFeedFilter, type FeedFilter, type FeedPage } from "./feed";

export const FEED_DEMO_ENABLED = true;
export const FEED_DEMO_POLL_MS = 4000;
export const FEED_DEMO_ID_BASE = 800_000_000;
const models = [
  {
    title: "Code Pilot — Démo",
    slug: "demo-code-pilot",
    kind: "agent" as const,
    engine: "Claude",
    cover_url: "/art/code.webp",
    price: 4900,
  },
  {
    title: "Deep Research — Démo",
    slug: "demo-deep-research",
    kind: "agent" as const,
    engine: "Multi-modèles",
    cover_url: "/art/research.webp",
    price: 3900,
  },
  {
    title: "Startup Crew — Démo",
    slug: "demo-startup-crew",
    kind: "bundle" as const,
    engine: "Multi-modèles",
    cover_url: "/art/bundle.webp",
    price: 7900,
  },
  {
    title: "Growth Engine — Démo",
    slug: "demo-growth-engine",
    kind: "agent" as const,
    engine: "GPT",
    cover_url: "/art/growth.webp",
    price: 5900,
  },
];
type DemoQuery = {
  filter: FeedFilter;
  before?: number;
  after?: number;
  limit?: number;
};

export function createFeedDemo(now = Date.now()) {
  const records: MarketEvent[] = [];
  let automaticRemaining = 8;
  function make(
    index: number,
    kind: MarketEvent["kind"],
    at: number,
  ): MarketEvent {
    const { price, ...product } = models[(index - 1) % models.length];
    return {
      id: FEED_DEMO_ID_BASE + index,
      kind,
      amount_cents: kind === "offer" ? price - 1000 : price,
      previous_cents: kind === "price_changed" ? price + 1000 : null,
      created_at: new Date(at).toISOString(),
      product,
      seller: {
        username: "demo-studio-" + (((index - 1) % 4) + 1),
        display_name: "Studio démo " + (((index - 1) % 4) + 1),
      },
    };
  }
  const kinds: MarketEvent["kind"][] = [
    "listed",
    "sold",
    "sold",
    "offer",
    "price_changed",
    "relisted",
  ];
  for (let index = 1; index <= 16; index++)
    records.push(
      make(
        index,
        kinds[(index - 1) % kinds.length],
        now - (16 - index) * 75000,
      ),
    );
  function addSale(at = Date.now()) {
    if (records.length >= 64) return false;
    records.push(make(records.length + 1, "sold", at));
    return true;
  }
  return {
    get full() {
      return records.length >= 64;
    },
    addSale,
    advance(at = Date.now()) {
      if (!automaticRemaining) return false;
      automaticRemaining--;
      return addSale(at);
    },
    page({ filter, before, after, limit = 6 }: DemoQuery): FeedPage {
      const size = Math.max(1, Math.min(6, limit));
      const rows = records
        .filter(
          (event) =>
            matchesFeedFilter(event, filter) &&
            (!before || event.id < before) &&
            (!after || event.id > after),
        )
        .sort((a, b) => (after ? a.id - b.id : b.id - a.id));
      const events = rows
        .slice(0, size)
        .map((event) => ({
          ...event,
          product: { ...event.product },
          seller: { ...event.seller },
        }));
      return {
        events,
        more: rows.length > size,
        oldest: events.length
          ? Math.min(...events.map((event) => event.id))
          : null,
        newest: events.length
          ? Math.max(...events.map((event) => event.id))
          : null,
        demo: true,
      };
    },
  };
}
export type FeedDemo = ReturnType<typeof createFeedDemo>;
