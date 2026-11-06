import type { MarketEvent } from "./market";

export type FeedFilter = "all" | "listings" | "sales";
export type FeedPage = {
  events: MarketEvent[];
  more: boolean;
  oldest: number | null;
  newest: number | null;
  demo?: boolean;
};
export const FEED_PAGE_SIZE = 24;
export const FEED_POLL_MS = 15000;
export const FEED_ARRIVAL_MS = 1100;

// Keep chronological positions stable when older pages or overlapping live
// responses arrive. An event is a single market record, never a fake sale.
export function mergeFeedEvents(
  current: MarketEvent[],
  incoming: MarketEvent[],
) {
  const events = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) events.set(event.id, event);
  return [...events.values()].sort((a, b) => a.id - b.id);
}

export function matchesFeedFilter(event: MarketEvent, filter: FeedFilter) {
  if (filter === "listings")
    return event.kind === "listed" || event.kind === "relisted";
  if (filter === "sales")
    return event.kind === "sold" && (event.amount_cents ?? 0) > 0;
  return true;
}
