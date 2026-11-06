"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  Layers3,
  Loader2,
  MousePointer2,
  Package,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Tag,
} from "lucide-react";
import Link from "./navigation-link";
import { useI18n } from "./i18n";
import { api, Avatar, Notice, usePricesVisible } from "./market-ui";
import { EventAmount, EventKind } from "./market-floor";
import { timeAgo, type MarketEvent } from "../lib/market/market";
import {
  FEED_ARRIVAL_MS,
  FEED_PAGE_SIZE,
  FEED_PLAY_MS,
  FEED_POLL_MS,
  matchesFeedFilter,
  mergeFeedEvents,
  type FeedFilter,
  type FeedPage,
} from "../lib/market/feed";

type FeedState = {
  events: MarketEvent[];
  loading: boolean;
  error: string;
  more: boolean;
  loadingOlder: boolean;
  arrival: number | null;
};
const emptyState: FeedState = {
  events: [],
  loading: true,
  error: "",
  more: false,
  loadingOlder: false,
  arrival: null,
};

function useFeedData(
  filter: FeedFilter,
  onArrival: (event: MarketEvent, previous: number | null) => void,
  onHistory: (id: number) => void,
) {
  const [data, setData] = useState<FeedState>(emptyState);
  const callback = useRef(onArrival);
  callback.current = onArrival;
  const history = useRef(onHistory);
  history.current = onHistory;
  const operations = useRef<{
    older: () => Promise<MarketEvent[]>;
    retry: () => void;
  } | null>(null);
  useEffect(() => {
    let active = true,
      busy = false,
      olderBusy = false,
      initialized = false;
    let newest: number | null = null,
      oldest: number | null = null,
      renderedNewest: number | null = null;
    const seen = new Set<number>();
    const queue: MarketEvent[] = [];
    let pollTimer: ReturnType<typeof setTimeout>;
    const path = (cursor = "") =>
      `market/feed?filter=${filter}&limit=${FEED_PAGE_SIZE}${cursor}`;
    const schedule = (ms = FEED_POLL_MS) => {
      if (active) pollTimer = setTimeout(poll, ms);
    };
    async function initial() {
      if (busy || !active) return;
      busy = true;
      setData(emptyState);
      try {
        const page = await api<FeedPage>(path());
        if (!active) return;
        const events = mergeFeedEvents(
          [],
          page.events.filter((event) => matchesFeedFilter(event, filter)),
        );
        events.forEach((event) => seen.add(event.id));
        newest = page.newest;
        oldest = page.oldest;
        renderedNewest = newest;
        initialized = true;
        setData({ ...emptyState, events, more: page.more, loading: false });
      } catch (error) {
        if (active)
          setData({
            ...emptyState,
            loading: false,
            error: (error as Error).message,
          });
      } finally {
        busy = false;
        schedule();
      }
    }
    async function poll() {
      clearTimeout(pollTimer);
      if (!active || busy) return;
      if (document.hidden) {
        schedule();
        return;
      }
      if (!initialized) {
        await initial();
        return;
      }
      busy = true;
      let catchUp = false;
      try {
        const hadCursor = newest !== null;
        const page = await api<FeedPage>(
          path(hadCursor ? "&after=" + newest : ""),
        );
        if (!active) return;
        const additions = mergeFeedEvents([], page.events).filter(
          (event) => matchesFeedFilter(event, filter) && !seen.has(event.id),
        );
        additions.forEach((event) => {
          seen.add(event.id);
          queue.push(event);
        });
        if (page.newest !== null) newest = Math.max(newest || 0, page.newest);
        if (oldest === null && page.oldest !== null) {
          oldest = page.oldest;
          setData((value) => ({ ...value, more: page.more }));
        }
        setData((value) => ({ ...value, error: "" }));
        catchUp = hadCursor && page.more;
      } catch (error) {
        if (active)
          setData((value) => ({ ...value, error: (error as Error).message }));
      } finally {
        busy = false;
        schedule(catchUp ? FEED_ARRIVAL_MS : FEED_POLL_MS);
      }
    }
    async function older() {
      if (!active || olderBusy || oldest === null) return [];
      olderBusy = true;
      setData((value) => ({ ...value, loadingOlder: true }));
      try {
        const page = await api<FeedPage>(path("&before=" + oldest));
        if (!active) return [];
        const events = page.events.filter((event) =>
          matchesFeedFilter(event, filter),
        );
        events.forEach((event) => seen.add(event.id));
        if (page.oldest !== null) oldest = page.oldest;
        if (events.length) history.current(events[0].id);
        setData((value) => ({
          ...value,
          events: mergeFeedEvents(value.events, events),
          more: page.more,
          error: "",
        }));
        return events;
      } catch (error) {
        if (active)
          setData((value) => ({ ...value, error: (error as Error).message }));
        return [];
      } finally {
        olderBusy = false;
        if (active) setData((value) => ({ ...value, loadingOlder: false }));
      }
    }
    operations.current = {
      older,
      retry: () => {
        if (initialized) void poll();
        else void initial();
      },
    };
    void initial();
    // A burst is presented one record at a time, in order, without duplicates.
    const arrivals = setInterval(() => {
      if (!active || document.hidden) return;
      const next = queue.shift();
      if (!next) return;
      callback.current(next, renderedNewest);
      renderedNewest = Math.max(renderedNewest || 0, next.id);
      setData((value) => ({
        ...value,
        events: mergeFeedEvents(value.events, [next]),
        arrival: next.id,
      }));
    }, FEED_ARRIVAL_MS);
    return () => {
      active = false;
      clearTimeout(pollTimer);
      clearInterval(arrivals);
      operations.current = null;
    };
  }, [filter]);
  return {
    ...data,
    loadOlder: () => operations.current?.older() ?? Promise.resolve([]),
    retry: () => operations.current?.retry(),
  };
}

export function MarketFeed() {
  const { t, locale } = useI18n();
  const prices = usePricesVisible();
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [selected, setSelected] = useState(0);
  const [unread, setUnread] = useState(0);
  const currentId = useRef<number | null>(null);
  const wanted = useRef<{
    id: number;
    previous?: number | null;
    animate?: boolean;
  } | null>(null);
  const following = useRef(true);
  following.current = playing && !hover && !focused;
  const lastArrival = useRef(0);
  const pause = useCallback(() => setPlaying(false), []);
  const [viewport, carousel] = useEmblaCarousel({
    align: "center",
    loop: true,
    duration: reducedMotion ? 0 : 32,
    watchSlides: false,
  });
  const data = useFeedData(
    filter,
    (event, previous) => {
      lastArrival.current = Date.now();
      if (following.current)
        wanted.current = { id: event.id, previous, animate: true };
      else setUnread((value) => value + 1);
    },
    (id) => {
      wanted.current = { id };
    },
  );
  // Like the small ticker, a short feed uses visual copies for a seamless
  // loop. Copies never count as events and are hidden from assistive technology.
  const slides = useMemo(
    () =>
      data.events.length > 0 && data.events.length < 3
        ? Array.from({ length: Math.ceil(3 / data.events.length) }, () => data.events).flat()
        : data.events,
    [data.events],
  );
  const eventsRef = useRef(slides);
  eventsRef.current = slides;
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReducedMotion(query.matches);
      if (query.matches) setPlaying(false);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    if (!carousel) return;
    const select = () => {
      const index = carousel.selectedScrollSnap();
      setSelected(index % Math.max(1, data.events.length));
      currentId.current = eventsRef.current[index]?.id ?? null;
    };
    carousel.on("select", select).on("pointerDown", pause);
    return () => {
      carousel.off("select", select).off("pointerDown", pause);
    };
  }, [carousel, pause, data.events.length]);
  useLayoutEffect(() => {
    if (!carousel || !data.events.length) return;
    const target = wanted.current;
    const id = target?.previous ?? currentId.current ?? data.events.at(-1)?.id;
    const index = slides.findIndex((event) => event.id === id);
    carousel.reInit({ startIndex: Math.max(0, index) });
    carousel.scrollTo(Math.max(0, index), true);
    if (target) {
      const destination = slides.findIndex((event) => event.id === target.id);
      if (destination >= 0) {
        // New records are appended to the right: scrollNext keeps the same
        // right-to-left direction as Explore's ticker, even in a looping rail.
        if (target.animate && destination === index + 1)
          carousel.scrollNext(reducedMotion);
        else carousel.scrollTo(destination, !target.animate || reducedMotion);
      }
      wanted.current = null;
    }
    const active = carousel.selectedScrollSnap();
    currentId.current = slides[active]?.id ?? null;
    setSelected(active % data.events.length);
  }, [carousel, data.events, slides, reducedMotion]);
  useEffect(() => {
    if (!carousel || !playing || hover || focused || slides.length < 2)
      return;
    const timer = setInterval(() => {
      if (
        !document.hidden &&
        Date.now() - lastArrival.current > FEED_ARRIVAL_MS
      )
        carousel.scrollNext(reducedMotion);
    }, FEED_PLAY_MS);
    return () => clearInterval(timer);
  }, [carousel, playing, hover, focused, data.events.length, slides.length, reducedMotion]);
  useEffect(() => {
    if (!carousel) return;
    const element = carousel.rootNode();
    let lastWheel = 0;
    const wheel = (event: WheelEvent) => {
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.shiftKey
            ? event.deltaY
            : 0;
      if (Math.abs(delta) < 5) return;
      event.preventDefault();
      pause();
      if (Date.now() - lastWheel < 250) return;
      lastWheel = Date.now();
      if (delta > 0) carousel.scrollNext();
      else carousel.scrollPrev();
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [carousel, pause]);
  const move = (direction: "previous" | "next") => {
    pause();
    if (direction === "next") carousel?.scrollNext(reducedMotion);
    else carousel?.scrollPrev(reducedMotion);
  };
  const goLive = () => {
    setUnread(0);
    setPlaying(true);
    carousel?.scrollTo(Math.max(0, data.events.length - 1), reducedMotion);
  };
  const older = async () => {
    pause();
    await data.loadOlder();
  };
  const chooseFilter = (value: FeedFilter) => {
    if (filter === value) return;
    currentId.current = null;
    wanted.current = null;
    setUnread(0);
    setSelected(0);
    setFilter(value);
  };
  const active = data.events[selected];
  return (
    <section className="mk-feed" aria-label={t("Feed du marché")}>
      <div className="mk-feed-heading">
        <div>
          <span className="eyebrow">{t("LE MARCHÉ EN MOUVEMENT")}</span>
          <h1>
            Feed<span>.</span>
          </h1>
          <p>
            {t("La banderole du marché, en grand. Chaque arrivée a sa place.")}
          </p>
        </div>
        <span className="mk-feed-live">
          <span className="mk-live-dot" />
          {t("EN DIRECT")}
        </span>
      </div>
      <div className="mk-feed-toolbar">
        <div
          className="mk-feed-filters"
          role="group"
          aria-label={t("Filtrer le Feed")}
        >
          {(
            [
              ["all", "Tout", Activity],
              ["listings", "Mises en vente", Tag],
              ["sales", "Ventes payées", CircleDollarSign],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => chooseFilter(value)}
            >
              <Icon size={14} />
              {t(label)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="button secondary small mk-feed-play"
          aria-pressed={playing}
          onClick={() => setPlaying((value) => !value)}
          disabled={!data.events.length}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {t(playing ? "Pause" : "Lecture automatique")}
        </button>
      </div>
      {data.error && (
        <Notice error>
          {t(data.error)}{" "}
          <button type="button" className="text-button" onClick={data.retry}>
            {t("Réessayer")}
          </button>
        </Notice>
      )}
      <div className="mk-feed-stage">
        <div className="mk-feed-stage-label">
          <Radio size={14} />
          <span>{t("LE FIL DU MARCHÉ")}</span>
          <span className="mk-feed-loaded">
            {data.events.length} {t("événements chargés")}
          </span>
        </div>
        {data.loading ? (
          <div className="mk-feed-empty" role="status">
            <Loader2 size={36} className="spin" />
            <h2>{t("Le Feed arrive…")}</h2>
          </div>
        ) : !data.events.length ? (
          <div className="mk-feed-empty">
            <div className="mk-feed-empty-icon">
              <Radio size={40} />
            </div>
            <h2>
              {t(
                filter === "sales"
                  ? "La première vente ouvrira le bal."
                  : "Le marché attend sa prochaine arrivée.",
              )}
            </h2>
            <p>
              {t(
                filter === "sales"
                  ? "Les achats payants confirmés apparaîtront ici, un à un."
                  : "Mises en vente, offres et ventes apparaîtront ici dès qu’elles auront lieu.",
              )}
            </p>
            <Link className="button secondary" href="/agents">
              {t("Explorer les modèles")} <ArrowUpRight size={15} />
            </Link>
          </div>
        ) : (
          <div
            ref={viewport}
            className="mk-feed-viewport"
            role="region"
            aria-roledescription="carousel"
            aria-label={t("Carrousel du marché")}
            tabIndex={0}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setFocused(false);
            }}
            onKeyDown={(event) => {
              if (
                (event.target as HTMLElement).matches("input,textarea,select")
              )
                return;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                move(event.key === "ArrowLeft" ? "previous" : "next");
              }
              if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                pause();
                carousel?.scrollTo(
                  event.key === "Home" ? 0 : data.events.length - 1,
                  reducedMotion,
                );
              }
            }}
          >
            <div className="mk-feed-track">
              {slides.map((event, index) => (
                <article
                  key={event.id + "-" + index}
                  data-event-id={event.id}
                  className={
                    "mk-feed-slide " +
                    (event.id === data.arrival ? "mk-feed-arrival " : "") +
                    (selected === index % data.events.length
                      ? "is-selected"
                      : "")
                  }
                  role="group"
                  aria-roledescription="slide"
                  aria-label={
                    t("Événement") +
                    " " +
                    ((index % data.events.length) + 1) +
                    " / " +
                    data.events.length
                  }
                  aria-current={
                    selected === index % data.events.length ? "true" : undefined
                  }
                  aria-hidden={index >= data.events.length || undefined}
                >
                  <div className="mk-feed-card">
                    <div className="mk-feed-card-copy">
                      <div className="mk-feed-event-heading">
                        <EventKind event={event} />
                        <time
                          dateTime={event.created_at}
                          title={new Date(event.created_at).toLocaleString(
                            locale === "en" ? "en-CA" : "fr-CA",
                          )}
                        >
                          <Clock3 size={12} />
                          {timeAgo(event.created_at, locale)}
                        </time>
                      </div>
                      <span className="mk-feed-engine">
                        {event.product.engine} ·{" "}
                        {t(
                          event.product.kind === "bundle" ? "Bundle" : "Agent",
                        )}
                      </span>
                      <Link
                        className="mk-feed-title"
                        tabIndex={index >= data.events.length ? -1 : undefined}
                        href={"/agents/" + event.product.slug}
                      >
                        <h2>{event.product.title}</h2>
                        <ArrowUpRight size={23} />
                      </Link>
                      <Link
                        className="mk-feed-seller"
                        tabIndex={index >= data.events.length ? -1 : undefined}
                        href={"/creators/" + event.seller.username}
                      >
                        <Avatar name={event.seller.display_name} />
                        <span>
                          {event.seller.display_name}
                          <small>@{event.seller.username}</small>
                        </span>
                      </Link>
                      <div className="mk-feed-card-bottom">
                        {prices && event.amount_cents !== null ? (
                          <div className="mk-feed-price">
                            <small>
                              {t(
                                event.kind === "sold"
                                  ? "MONTANT DE L’ACQUISITION"
                                  : event.kind === "offer"
                                    ? "MONTANT DE L’OFFRE"
                                    : "PRIX DU MODÈLE",
                              )}
                            </small>
                            <EventAmount event={event} />
                          </div>
                        ) : (
                          <span className="mk-feed-price-hidden">
                            {t("Découvrez cette création")}
                          </span>
                        )}
                        <Link
                          href={"/agents/" + event.product.slug}
                          className="mk-feed-open"
                          tabIndex={
                            index >= data.events.length ? -1 : undefined
                          }
                          aria-label={
                            t("Voir la fiche") + " : " + event.product.title
                          }
                        >
                          <ArrowUpRight size={22} />
                        </Link>
                      </div>
                    </div>
                    <Link
                      href={"/agents/" + event.product.slug}
                      className="mk-feed-art"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      {event.product.cover_url ? (
                        <img
                          src={event.product.cover_url}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <>
                          <div className="mk-feed-art-grid" />
                          {event.product.kind === "bundle" ? (
                            <Layers3 size={100} strokeWidth={1} />
                          ) : (
                            <Package size={100} strokeWidth={1} />
                          )}
                          <span>marketpaperclip</span>
                        </>
                      )}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
        <div className="mk-feed-controls">
          <div className="mk-feed-arrows">
            <button
              type="button"
              className="icon-button"
              aria-label={t("Événement précédent")}
              onClick={() => move("previous")}
              disabled={data.events.length < 2}
            >
              <ArrowLeft size={20} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={t("Événement suivant")}
              onClick={() => move("next")}
              disabled={data.events.length < 2}
            >
              <ArrowRight size={20} />
            </button>
          </div>
          <div
            className="mk-feed-position"
            aria-live={playing ? "off" : "polite"}
          >
            {data.events.length ? (
              <>
                <strong>{String(selected + 1).padStart(2, "0")}</strong>
                <span>/ {String(data.events.length).padStart(2, "0")}</span>
              </>
            ) : (
              <span>— / —</span>
            )}
          </div>
          <button
            type="button"
            className="button secondary small mk-feed-return"
            onClick={goLive}
            disabled={!data.events.length}
          >
            <RotateCcw size={14} />
            {t("Revenir au direct")}
            {unread > 0 && <span className="mk-feed-unread">+{unread}</span>}
          </button>
        </div>
      </div>
      <div className="mk-feed-history">
        <div>
          <MousePointer2 size={14} />
          <span>
            {t(
              "Glissez, utilisez les flèches ou Maj + molette pour remonter le fil.",
            )}
          </span>
        </div>
        {data.events.length > 1 && (
          <input
            type="range"
            min={0}
            max={data.events.length - 1}
            value={selected}
            aria-label={t("Parcourir l’historique")}
            onChange={(event) => {
              pause();
              carousel?.scrollTo(Number(event.target.value), reducedMotion);
            }}
          />
        )}
        {active && (
          <time dateTime={active.created_at}>
            {new Date(active.created_at).toLocaleString(
              locale === "en" ? "en-CA" : "fr-CA",
              { dateStyle: "medium", timeStyle: "short" },
            )}
          </time>
        )}
      </div>
      {data.more && (
        <button
          type="button"
          className="button secondary mk-feed-older"
          onClick={older}
          disabled={data.loadingOlder}
        >
          {data.loadingOlder ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
          {t("Charger l’historique plus ancien")}
        </button>
      )}
      <p className="mk-feed-footnote">
        {t(
          "Les ventes sont confirmées par paiement. Les acheteurs restent privés.",
        )}
      </p>
    </section>
  );
}
