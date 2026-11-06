"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MarketEvent } from "../lib/market/market";

// One viewport every 28 seconds, at constant speed. The following model enters
// from the right while the preceding one leaves completely through the left.
export const FEED_MARQUEE_MS = 28000;

export function useFeedMarquee(
  events: MarketEvent[],
  running: boolean,
  reduced: boolean,
) {
  const track = useRef<HTMLDivElement>(null);
  const current = useRef<number | null>(null);
  const cursor = useRef(0);
  const sequence = useRef<MarketEvent[]>([]);
  const [selected, setSelected] = useState(0);
  const ordered = useMemo(() => {
    const byId = new Map(events.map((event) => [event.id, event]));
    const existing = sequence.current
      .filter((event) => byId.has(event.id))
      .map((event) => byId.get(event.id)!);
    if (!existing.length) {
      sequence.current = events.length
        ? [events.at(-1)!, ...events.slice(0, -1)]
        : [];
      return sequence.current;
    }
    const known = new Set(existing.map((event) => event.id));
    const previousNewest = Math.max(...existing.map((event) => event.id));
    const additions = events.filter((event) => !known.has(event.id));
    const arrivals = additions.filter((event) => event.id > previousNewest);
    const history = additions.filter((event) => event.id < previousNewest);
    if (arrivals.length) {
      const active = Math.max(
        0,
        existing.findIndex((event) => event.id === current.current),
      );
      const lastArrival = existing.findIndex(
        (event) => event.id === previousNewest,
      );
      // Keep the next, partially visible model in place. New sales are queued
      // beyond the right edge, in arrival order, and enter from fully outside.
      const insert = Math.min(
        existing.length,
        Math.max(active + (cursor.current % 1 > 0 ? 2 : 1), lastArrival + 1),
      );
      // At the loop seam, the duplicated first model is already visible.
      // Insert after that model rather than replacing it with a new arrival.
      const seam = active === existing.length - 1 && cursor.current % 1 > 0;
      const destination = seam
        ? lastArrival > 0 && lastArrival < active
          ? lastArrival + 1
          : 1
        : insert;
      existing.splice(destination, 0, ...arrivals);
    }
    sequence.current = [...existing, ...history];
    return sequence.current;
  }, [events]);
  const refs = useRef({ events, ordered });
  refs.current = { events, ordered };
  const paint = useCallback(() => {
    const { events, ordered } = refs.current;
    if (!ordered.length) return;
    cursor.current =
      ((cursor.current % ordered.length) + ordered.length) % ordered.length;
    const index = Math.floor(cursor.current);
    current.current = ordered[index].id;
    const next = events.findIndex((event) => event.id === current.current);
    setSelected((previous) => (previous === next ? previous : next));
    if (track.current)
      track.current.style.transform = `translate3d(${-cursor.current * 100}%, 0, 0)`;
  }, []);
  useLayoutEffect(() => {
    if (!events.length) {
      current.current = null;
      cursor.current = 0;
      return;
    }
    const id = current.current ?? events.at(-1)!.id;
    const index = ordered.findIndex((event) => event.id === id);
    // Appending or prepending records preserves both the model and its exact
    // on-screen fraction. New arrivals never teleport over the current model.
    const fraction = cursor.current % 1;
    cursor.current = Math.max(0, index) + fraction;
    paint();
  }, [events, ordered, paint]);
  useEffect(() => {
    if (!running || reduced || !events.length) return;
    let frame = 0;
    let previous = performance.now();
    const step = (now: number) => {
      if (!document.hidden) {
        // Discard suspension time, so returning to a hidden tab cannot jump.
        cursor.current +=
          Math.min(64, Math.max(0, now - previous)) / FEED_MARQUEE_MS;
        paint();
      }
      previous = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running, reduced, events.length, paint]);
  const goTo = useCallback(
    (index: number) => {
      const { events, ordered } = refs.current;
      const target =
        events[((index % events.length) + events.length) % events.length];
      if (!target) return;
      cursor.current = ordered.findIndex((event) => event.id === target.id);
      paint();
    },
    [paint],
  );
  return {
    track,
    selected,
    goTo,
    slides: ordered.length ? [...ordered, ordered[0]] : [],
  };
}
