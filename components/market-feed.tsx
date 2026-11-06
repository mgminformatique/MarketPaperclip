"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useFeedMarquee } from "./use-feed-marquee";
import { money } from "../lib/market/model";
import { useSearchParams } from "next/navigation";
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
  Plus,
  Check,
  Sparkles,
  Radio,
  RotateCcw,
  Tag,
} from "lucide-react";
import Link from "./navigation-link";
import { useI18n } from "./i18n";
import { api, Avatar, Modal, Notice, usePricesVisible } from "./market-ui";
import {
  createFeedDemo,
  FEED_DEMO_ENABLED,
  FEED_DEMO_POLL_MS,
  type FeedDemo,
} from "../lib/market/feed-demo";
import { EventAmount, EventKind } from "./market-floor";
import { timeAgo, type MarketEvent } from "../lib/market/market";
import {
  FEED_ARRIVAL_MS,
  FEED_PAGE_SIZE,
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
  demoSource: FeedDemo | null,
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
    const read = (cursor = "") => {
      if (!demoSource) return api<FeedPage>(path(cursor));
      const query = new URLSearchParams(cursor);
      return Promise.resolve(
        demoSource.page({
          filter,
          limit: FEED_PAGE_SIZE,
          before: Number(query.get("before")) || undefined,
          after: Number(query.get("after")) || undefined,
        }),
      );
    };
    const schedule = (ms = demoSource ? FEED_DEMO_POLL_MS : FEED_POLL_MS) => {
      if (active) pollTimer = setTimeout(poll, ms);
    };
    async function initial() {
      if (busy || !active) return;
      busy = true;
      setData(emptyState);
      try {
        const page = await read();
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
    async function poll(automatic = true) {
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
        if (demoSource && automatic) demoSource.advance();
        const page = await read(hadCursor ? "&after=" + newest : "");
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
        schedule(
          catchUp
            ? FEED_ARRIVAL_MS
            : demoSource
              ? FEED_DEMO_POLL_MS
              : FEED_POLL_MS,
        );
      }
    }
    async function older() {
      if (!active || olderBusy || oldest === null) return [];
      olderBusy = true;
      setData((value) => ({ ...value, loadingOlder: true }));
      try {
        const page = await read("&before=" + oldest);
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
        if (initialized) void poll(false);
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
  }, [filter, demoSource]);
  return {
    ...data,
    loadOlder: () => operations.current?.older() ?? Promise.resolve([]),
    retry: () => operations.current?.retry(),
  };
}

export function MarketFeed() {
  const query = useSearchParams();
  const demo = FEED_DEMO_ENABLED && query.get("demo") === "1";
  return <MarketFeedCarousel key={demo ? "demo" : "live"} demo={demo} />;
}

function MarketFeedCarousel({ demo }: { demo: boolean }) {
  const { t, locale } = useI18n();
  const prices = usePricesVisible();
  const demoSource = useMemo(() => (demo ? createFeedDemo() : null), [demo]);
  const [preview, setPreview] = useState<MarketEvent | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [unread, setUnread] = useState(0);
  const wanted = useRef<number | null>(null);
  const following = useRef(true);
  const moving = playing && !hover && !focused && !preview && !reducedMotion;
  following.current = moving;
  const pause = useCallback(() => setPlaying(false), []);
  const data = useFeedData(
    filter,
    () => {
      if (!following.current) setUnread((value) => value + 1);
    },
    (id) => {
      wanted.current = id;
    },
    demoSource,
  );
  const marquee = useFeedMarquee(data.events, moving, reducedMotion);
  const { slides, selected, goTo } = marquee;
  const viewport = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<number | null>(null);
  const suppressClick = useRef(false);
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
  useLayoutEffect(() => {
    if (wanted.current === null) return;
    const index = data.events.findIndex((event) => event.id === wanted.current);
    if (index >= 0) {
      goTo(index);
      wanted.current = null;
    }
  }, [data.events, goTo]);
  const move = useCallback(
    (direction: "previous" | "next") => {
      pause();
      goTo(selected + (direction === "next" ? 1 : -1));
    },
    [pause, goTo, selected],
  );
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
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
      if (Date.now() - lastWheel < 250) return;
      lastWheel = Date.now();
      move(delta > 0 ? "next" : "previous");
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [move, data.loading, data.events.length]);
  const goLive = () => {
    setUnread(0);
    goTo(data.events.length - 1);
    setPlaying(!reducedMotion);
  };
  const older = async () => {
    pause();
    await data.loadOlder();
  };
  const chooseFilter = (value: FeedFilter) => {
    if (filter === value) return;
    wanted.current = null;
    setUnread(0);
    setFilter(value);
  };
  const active = data.events[selected];
  const inspect = (
    event: MarketEvent,
    click: MouseEvent<HTMLAnchorElement>,
  ) => {
    if (!demo) return;
    click.preventDefault();
    setPreview(event);
  };
  return (
    <section
      className={"mk-feed" + (demo ? " mk-feed-demo" : "")}
      aria-label={t("Feed du marché")}
    >
      <div className="mk-feed-heading">
        <div>
          <span className="eyebrow">{t("LE MARCHÉ EN MOUVEMENT")}</span>
          <h1>
            Feed<span>.</span>
          </h1>
          <p>
            {t("Un modèle, toute la scène. Le marché défile sous vos yeux.")}
          </p>
        </div>
        <div className="mk-feed-mode-actions">
          <span className="mk-feed-live">
            <span className="mk-live-dot" />
            {t(demo ? "DÉMO" : "EN DIRECT")}
          </span>
          {!demo && FEED_DEMO_ENABLED && (
            <Link
              className="button secondary small mk-feed-demo-start"
              href="/feed?demo=1"
            >
              <Play size={13} />
              {t("Essayer la démo")}
            </Link>
          )}
        </div>
      </div>
      {demo && (
        <div className="mk-feed-demo-notice" role="status">
          <div>
            <strong>{t("MODE DÉMO — VENTES FICTIVES")}</strong>
            <p>
              {t(
                "Exemples pour essayer le carrousel. Les arrivées sont simulées et aucun paiement n’est effectué.",
              )}
            </p>
          </div>
          <div className="mk-feed-demo-actions">
            <button
              type="button"
              className="button primary small mk-feed-demo-add"
              disabled={!!demoSource?.full}
              onClick={() => {
                if (demoSource?.addSale()) data.retry();
              }}
            >
              <Plus size={14} />
              {t("Ajouter une vente test")}
            </button>
            <Link
              className="button secondary small mk-feed-demo-exit"
              href="/feed"
            >
              {t("Revenir au Feed réel")}
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      )}
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
          disabled={!data.events.length || reducedMotion}
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
          <span>{t("DROITE → GAUCHE · DÉFILEMENT CONTINU")}</span>
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
            data-motion={moving ? "running" : "paused"}
            onPointerDown={(event) => {
              pointerStart.current = event.clientX;
              suppressClick.current = false;
              if (event.pointerType === "touch") pause();
            }}
            onPointerUp={(event) => {
              if (pointerStart.current === null) return;
              const delta = event.clientX - pointerStart.current;
              pointerStart.current = null;
              if (Math.abs(delta) > 45) {
                suppressClick.current = true;
                move(delta < 0 ? "next" : "previous");
              }
            }}
            onPointerCancel={() => {
              pointerStart.current = null;
            }}
            onDragStart={(event) => event.preventDefault()}
            onClickCapture={(event) => {
              if (suppressClick.current) {
                event.preventDefault();
                event.stopPropagation();
                suppressClick.current = false;
              }
            }}
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
                goTo(event.key === "Home" ? 0 : data.events.length - 1);
              }
            }}
          >
            <div className="mk-feed-track" ref={marquee.track}>
              {slides.map((event, index) => (
                <article
                  key={event.id + "-" + index}
                  data-event-id={event.id}
                  className={
                    "mk-feed-slide " +
                    (event.id === data.arrival ? "mk-feed-arrival " : "") +
                    (data.events[selected]?.id === event.id &&
                    index < data.events.length
                      ? "is-selected"
                      : "")
                  }
                  role="group"
                  aria-roledescription="slide"
                  aria-label={
                    t("Événement") +
                    " " +
                    (data.events.findIndex((item) => item.id === event.id) +
                      1) +
                    " / " +
                    data.events.length
                  }
                  aria-current={
                    data.events[selected]?.id === event.id &&
                    index < data.events.length
                      ? "true"
                      : undefined
                  }
                  aria-hidden={
                    index >= data.events.length ||
                    data.events[selected]?.id !== event.id ||
                    undefined
                  }
                >
                  <div className="mk-feed-card">
                    <div className="mk-feed-card-copy">
                      <div className="mk-feed-event-heading">
                        <EventKind event={event} />
                        {demo && (
                          <span className="mk-feed-demo-badge">
                            {t("TEST")}
                          </span>
                        )}
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
                        tabIndex={
                          index >= data.events.length ||
                          data.events[selected]?.id !== event.id
                            ? -1
                            : undefined
                        }
                        href={
                          demo
                            ? "/feed?demo=1"
                            : "/agents/" + event.product.slug
                        }
                        onClick={(click) => inspect(event, click)}
                      >
                        <h2>
                          {demo ? t(event.product.title) : event.product.title}
                        </h2>
                        <ArrowUpRight size={23} />
                      </Link>
                      {event.product.tagline && (
                        <p className="mk-feed-tagline">
                          {t(event.product.tagline)}
                        </p>
                      )}
                      {event.product.description && (
                        <p className="mk-feed-description">
                          {t(event.product.description)}
                        </p>
                      )}
                      {!!event.product.tags?.length && (
                        <ul className="mk-feed-features">
                          {event.product.tags.map((tag) => (
                            <li key={tag}>
                              <Check size={13} />
                              {t(tag)}
                            </li>
                          ))}
                        </ul>
                      )}
                      <dl className="mk-feed-specs">
                        {event.product.agent_count && (
                          <div>
                            <dt>{t("COMPOSITION")}</dt>
                            <dd>
                              {event.product.agent_count}{" "}
                              {t(
                                event.product.agent_count === 1
                                  ? "agent"
                                  : "agents",
                              )}
                            </dd>
                          </div>
                        )}
                        {event.product.version && (
                          <div>
                            <dt>{t("VERSION")}</dt>
                            <dd>v{event.product.version}</dd>
                          </div>
                        )}
                        {event.product.license && (
                          <div>
                            <dt>{t("LICENCE")}</dt>
                            <dd>{t(event.product.license)}</dd>
                          </div>
                        )}
                      </dl>
                      {(event.product.requirements || event.product.setup) && (
                        <details className="mk-feed-details">
                          <summary
                            tabIndex={
                              index >= data.events.length ||
                              data.events[selected]?.id !== event.id
                                ? -1
                                : undefined
                            }
                          >
                            {t("Prérequis et installation")}
                          </summary>
                          {event.product.requirements && (
                            <p>
                              <strong>{t("Prérequis")}</strong>
                              {t(event.product.requirements)}
                            </p>
                          )}
                          {event.product.setup && (
                            <p>
                              <strong>{t("Installation")}</strong>
                              {t(event.product.setup)}
                            </p>
                          )}
                        </details>
                      )}
                      <Link
                        className="mk-feed-seller"
                        tabIndex={
                          index >= data.events.length ||
                          data.events[selected]?.id !== event.id
                            ? -1
                            : undefined
                        }
                        href={
                          demo
                            ? "/feed?demo=1"
                            : "/creators/" + event.seller.username
                        }
                        onClick={(click) => inspect(event, click)}
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
                            {event.product.price_cents != null &&
                              event.product.price_cents !==
                                event.amount_cents && (
                                <p className="mk-feed-current-price">
                                  {t("Prix actuel :")}{" "}
                                  {money(event.product.price_cents, locale)}
                                </p>
                              )}
                          </div>
                        ) : (
                          <span className="mk-feed-price-hidden">
                            {t("Découvrez cette création")}
                          </span>
                        )}
                        <Link
                          href={
                            demo
                              ? "/feed?demo=1"
                              : "/agents/" + event.product.slug
                          }
                          onClick={(click) => inspect(event, click)}
                          className="mk-feed-open"
                          tabIndex={
                            index >= data.events.length ||
                            data.events[selected]?.id !== event.id
                              ? -1
                              : undefined
                          }
                          aria-label={
                            t("Voir la fiche") + " : " + event.product.title
                          }
                        >
                          {t(demo ? "Découvrir le concept" : "Voir la fiche")}{" "}
                          <ArrowUpRight size={18} />
                        </Link>
                      </div>
                    </div>
                    <Link
                      href={
                        demo ? "/feed?demo=1" : "/agents/" + event.product.slug
                      }
                      onClick={(click) => inspect(event, click)}
                      className="mk-feed-art"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      {event.product.cover_url ? (
                        <img
                          src={event.product.cover_url}
                          alt=""
                          loading={index === 0 ? "eager" : "lazy"}
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
                      <div className="mk-feed-art-caption">
                        <Sparkles size={15} />
                        <span>
                          {t(
                            demo
                              ? "CONCEPT ORIGINAL · DÉMO"
                              : "DÉCOUVREZ LE MODÈLE",
                          )}
                        </span>
                      </div>
                      <div className="mk-feed-art-number">
                        {String(
                          data.events.findIndex(
                            (item) => item.id === event.id,
                          ) + 1,
                        ).padStart(2, "0")}
                        <span>
                          {" "}
                          / {String(data.events.length).padStart(2, "0")}
                        </span>
                      </div>
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
              "Survolez pour lire. Glissez, utilisez les flèches ou Maj + molette pour revenir en arrière.",
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
              goTo(Number(event.target.value));
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
          demo
            ? "Les événements de cette démonstration sont fictifs."
            : "Les ventes sont confirmées par paiement. Les acheteurs restent privés.",
        )}
      </p>
      {demo && preview && (
        <Modal
          title="Aperçu de démonstration"
          className="mk-feed-demo-preview"
          onClose={() => setPreview(null)}
        >
          {preview.product.cover_url && (
            <img
              className="mk-feed-demo-preview-art"
              src={preview.product.cover_url}
              alt=""
            />
          )}
          <span className="mk-feed-demo-badge">{t("TEST")}</span>
          <h3>{preview.product.title}</h3>
          <p className="muted">
            {preview.product.engine} · {preview.seller.display_name}
          </p>
          <Notice>
            {t(
              "Fiche d’exemple : aucun achat ni téléchargement n’est associé à ce modèle de test.",
            )}
          </Notice>
          <button
            type="button"
            className="button primary"
            onClick={() => setPreview(null)}
          >
            {t("Continuer la démo")}
          </button>
        </Modal>
      )}
    </section>
  );
}
