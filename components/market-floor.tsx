"use client";
// The public market: live activity, statistics, rankings and price history.
import { useI18n } from "./i18n";
import React, { useEffect, useMemo, useState } from "react";
import Link from "./navigation-link";
import {
  Activity,
  ChevronDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bookmark,
  CircleDollarSign,
  Gavel,
  Layers3,
  LineChart,
  Package,
  Sparkles,
  Store,
  Tag,
  Trophy,
  Users,
} from "lucide-react";
import { money, type Product } from "../lib/market/model";
import { faq } from "../lib/faq";
import {
  compactMoney,
  marketRanges,
  timeAgo,
  trend,
  type CreatorStats,
  type LeaderboardRow,
  type MarketEvent,
  type MarketOverview,
  type MarketRange,
  type ProductStats,
} from "../lib/market/market";
import {
  api,
  Avatar,
  Empty,
  Loading,
  Notice,
  ProductCard,
  usePricesVisible,
} from "./market-ui";

const eventLabels: Record<MarketEvent["kind"], string> = {
  listed: "Mise en vente",
  relisted: "Remise en vente",
  delisted: "Mise en pause",
  price_changed: "Nouveau prix",
  sold: "Vente",
  offer: "Offre",
};
const eventIcons: Record<MarketEvent["kind"], React.ElementType> = {
  listed: Tag,
  relisted: Tag,
  delisted: Package,
  price_changed: LineChart,
  sold: CircleDollarSign,
  offer: Gavel,
};
const rangeLabels: Record<MarketRange, string> = {
  "24h": "24 h",
  "7d": "7 jours",
  "30d": "30 jours",
  all: "Depuis le début",
};

function EventKind({ event }: { event: MarketEvent }) {
  const { t } = useI18n();
  const Icon = eventIcons[event.kind];
  const label =
    event.kind === "sold" && !event.amount_cents
      ? "Acquisition gratuite"
      : eventLabels[event.kind];
  return (
    <span className={"mk-kind mk-kind-" + event.kind}>
      <Icon size={12} />
      {t(label)}
    </span>
  );
}

export function EventAmount({ event }: { event: MarketEvent }) {
  const { t, locale } = useI18n();
  const prices = usePricesVisible();
  if (!prices || event.amount_cents === null) return <span>{t("—")}</span>;
  if (!event.amount_cents && event.kind !== "price_changed")
    return <span>{t("Gratuit")}</span>;
  const moved =
    event.kind === "price_changed" && event.previous_cents !== null
      ? event.amount_cents - event.previous_cents
      : 0;
  return (
    <span className="mk-amount">
      {money(event.amount_cents, locale)}
      {moved !== 0 && (
        <small className={moved > 0 ? "mk-up" : "mk-down"}>
          {moved > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          {money(Math.abs(moved), locale)}
        </small>
      )}
    </span>
  );
}

export function ActivityList({
  events,
  showProduct = true,
  showSeller = true,
  empty = "L’activité de cette vitrine apparaîtra ici.",
}: {
  events: MarketEvent[];
  showProduct?: boolean;
  showSeller?: boolean;
  empty?: string;
}) {
  const { t, locale } = useI18n();
  if (!events.length)
    return (
      <div className="mk-empty-line">
        <Activity size={16} />
        {t(empty)}
      </div>
    );
  return (
    <div className="mk-activity" role="table" aria-label={t("Activité du marché")}>
      <div className="mk-activity-row mk-activity-head" role="row">
        <span role="columnheader">{t("ÉVÉNEMENT")}</span>
        {showProduct && <span role="columnheader">{t("PRODUIT")}</span>}
        <span role="columnheader">{t("PRIX")}</span>
        {showSeller && <span role="columnheader">{t("CRÉATEUR")}</span>}
        <span role="columnheader">{t("QUAND")}</span>
      </div>
      {events.map((e) => (
        <div className="mk-activity-row" role="row" key={e.id}>
          <span role="cell">
            <EventKind event={e} />
          </span>
          {showProduct && (
            <Link
              role="cell"
              className="mk-activity-product"
              href={"/agents/" + e.product.slug}
            >
              <span className="mk-thumb">
                {e.product.cover_url ? (
                  <img src={e.product.cover_url} alt="" loading="lazy" />
                ) : e.product.kind === "bundle" ? (
                  <Layers3 size={14} />
                ) : (
                  <Package size={14} />
                )}
              </span>
              <strong>{e.product.title}</strong>
            </Link>
          )}
          <span role="cell">
            <EventAmount event={e} />
          </span>
          {showSeller && (
            <Link
              role="cell"
              className="mk-activity-seller"
              href={"/creators/" + e.seller.username}
            >
              {t("@")}
              {e.seller.username}
            </Link>
          )}
          <time role="cell" suppressHydrationWarning dateTime={e.created_at} title={new Date(e.created_at).toLocaleString(locale === "en" ? "en-CA" : "fr-CA")}>
            {timeAgo(e.created_at, locale)}
          </time>
        </div>
      ))}
    </div>
  );
}

export function VolumeChart({
  series,
}: {
  series: MarketOverview["series"];
}) {
  const { t, locale } = useI18n();
  const max = Math.max(...series.map((d) => d.volume_cents), 0);
  const fmt = (day: string) =>
    new Date(day + "T12:00:00Z").toLocaleDateString(
      locale === "en" ? "en-CA" : "fr-CA",
      { day: "numeric", month: "short" },
    );
  return (
    <figure className="mk-chart">
      <div className="mk-chart-plot">
        <svg
          viewBox={`0 0 ${series.length * 10} 100`}
          preserveAspectRatio="none"
          role="img"
          aria-label={t("Volume quotidien des ventes")}
        >
          {[25, 50, 75].map((y) => (
            <line key={y} x1="0" x2={series.length * 10} y1={y} y2={y} className="mk-grid" />
          ))}
          {series.map((d, i) => {
            const h = max ? Math.max((d.volume_cents / max) * 92, d.volume_cents ? 3 : 0) : 0;
            return (
              <rect
                key={d.day}
                x={i * 10 + 2}
                y={100 - h}
                width="6"
                height={h}
                rx="1.2"
                className="mk-bar"
              >
                <title>
                  {fmt(d.day)} · {money(d.volume_cents, locale)} · {d.sales}{" "}
                  {t(d.sales > 1 ? "ventes" : "vente")}
                </title>
              </rect>
            );
          })}
        </svg>
        {!max && <span className="mk-chart-empty">{t("Aucune vente sur cette période.")}</span>}
      </div>
      <figcaption>
        <span>{series.length ? fmt(series[0].day) : ""}</span>
        <span>
          {t("Sommet :")} {max ? money(max, locale) : t("—")}
        </span>
        <span>{series.length ? fmt(series[series.length - 1].day) : ""}</span>
      </figcaption>
    </figure>
  );
}

export function PriceHistory({
  events,
  price,
}: {
  events: MarketEvent[];
  price: number | null;
}) {
  const { t, locale } = useI18n();
  const sales = useMemo(
    () =>
      events
        .filter((e) => e.kind === "sold" && (e.amount_cents || 0) > 0)
        .slice()
        .reverse(),
    [events],
  );
  const values = [...sales.map((s) => s.amount_cents || 0), price || 0];
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = Math.max(max - min, max * 0.2, 1);
  // Percent coordinates keep dots round while the plot stretches.
  const y = (v: number) => 90 - ((v - (min - span * 0.25)) / (span * 1.5)) * 80;
  const x = (i: number) =>
    sales.length === 1 ? 50 : 4 + (i / Math.max(sales.length - 1, 1)) * 92;
  return (
    <figure className="mk-price-history">
      <div className="mk-chart-plot short">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={t("Historique des prix de vente")}
        >
          {price !== null && (
            <line x1="0" x2="100" y1={y(price)} y2={y(price)} className="mk-ask" />
          )}
          {sales.length > 1 && (
            <polyline
              points={sales
                .map((s, i) => x(i) + "," + y(s.amount_cents || 0))
                .join(" ")}
              className="mk-line"
            />
          )}
        </svg>
        {sales.map((s, i) => (
          <span
            key={s.id}
            className="mk-dot"
            style={{ left: x(i) + "%", top: y(s.amount_cents || 0) + "%" }}
            title={money(s.amount_cents || 0, locale) + " · " + timeAgo(s.created_at, locale)}
          />
        ))}
        {!sales.length && (
          <span className="mk-chart-empty">{t("Aucune vente payée pour l’instant.")}</span>
        )}
      </div>
      <figcaption>
        <span>
          <i className="mk-legend-line" /> {t("Ventes")}
        </span>
        {price !== null && (
          <span>
            <i className="mk-legend-ask" /> {t("Prix actuel :")} {money(price, locale)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

export function ProductMarketStats({
  stats,
}: {
  stats: ProductStats | null;
}) {
  const { t, locale } = useI18n();
  const prices = usePricesVisible();
  if (!stats) return null;
  return (
    <dl className="mk-quote">
      <div>
        <dt>{t("Dernière vente")}</dt>
        <dd>
          {prices && stats.last_sale_cents !== null
            ? money(stats.last_sale_cents, locale)
            : t("—")}
        </dd>
      </div>
      <div>
        <dt>{t("Meilleure offre")}</dt>
        <dd>
          {prices && stats.best_offer_cents !== null
            ? money(stats.best_offer_cents, locale)
            : t("—")}
        </dd>
      </div>
      <div>
        <dt>{t("Acquisitions")}</dt>
        <dd>{stats.acquisitions}</dd>
      </div>
      <div>
        <dt>{t("Favoris")}</dt>
        <dd>
          <Bookmark size={11} /> {stats.favorites}
        </dd>
      </div>
    </dl>
  );
}

export function CreatorMarketStats({ stats }: { stats: CreatorStats | null }) {
  const { t, locale } = useI18n();
  const prices = usePricesVisible();
  if (!stats) return null;
  const since = stats.member_since
    ? new Date(stats.member_since).toLocaleDateString(
        locale === "en" ? "en-CA" : "fr-CA",
        { month: "long", year: "numeric" },
      )
    : "—";
  return (
    <div className="mk-creator-stats">
      {stats.verified && (
        <span className="mk-verified">
          <BadgeCheck size={14} />
          {t("Vendeur vérifié par Stripe")}
        </span>
      )}
      <dl>
        <div>
          <dt>{t("Volume")}</dt>
          <dd>{prices ? compactMoney(stats.volume_cents, locale) : t("—")}</dd>
        </div>
        <div>
          <dt>{t("Ventes")}</dt>
          <dd>{stats.sales}</dd>
        </div>
        <div>
          <dt>{t("Acheteurs")}</dt>
          <dd>{stats.buyers}</dd>
        </div>
        <div>
          <dt>{t("En vente")}</dt>
          <dd>{stats.listed}</dd>
        </div>
        <div>
          <dt>{t("Note moyenne")}</dt>
          <dd>
            {stats.rating !== null ? (
              <>
                <span className="lime">{t("★")}</span> {Number(stats.rating).toFixed(1)}{" "}
                <small>({stats.reviews})</small>
              </>
            ) : (
              t("—")
            )}
          </dd>
        </div>
        <div>
          <dt>{t("Membre depuis")}</dt>
          <dd>{since}</dd>
        </div>
      </dl>
    </div>
  );
}

// Slim live strip for the home page; hidden until the market has activity.
export function MarketPulse() {
  const { t, locale } = useI18n();
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const prices = usePricesVisible();
  useEffect(() => {
    let live = true;
    Promise.all([api("market/activity?limit=14"), api("market/overview?range=7d")])
      .then(([a, o]) => {
        if (!live) return;
        setEvents(a.events || []);
        setOverview(o.overview || null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!events.length || !overview) return null;
  return (
    <section className="mk-pulse" aria-label={t("Le marché en direct")}>
      <Link href="/market" className="mk-pulse-label">
        <span className="mk-live-dot" />
        {t("EN DIRECT")}
      </Link>
      <div className="mk-ticker">
        <div className="mk-ticker-track">
          {[...events, ...events].map((e, i) => (
            <Link
              href={"/agents/" + e.product.slug}
              key={i}
              className="mk-tick"
              aria-hidden={i >= events.length}
              tabIndex={i >= events.length ? -1 : undefined}
            >
              <EventKind event={e} />
              <strong>{e.product.title}</strong>
              {prices && e.amount_cents !== null && (
                <EventAmount event={e} />
              )}
              <small>{timeAgo(e.created_at, locale)}</small>
            </Link>
          ))}
        </div>
      </div>
      <Link href="/market" className="mk-pulse-stat">
        <small>{t("VOLUME 7 J")}</small>
        <strong>{prices ? compactMoney(overview.volume_cents, locale) : overview.sales}</strong>
        <ArrowUpRight size={14} />
      </Link>
    </section>
  );
}

type Trending = Product & {
  market: {
    acquisitions: number;
    volume_cents: number;
    favorites: number;
    offers: number;
  };
};

export function MarketPage({
  favorites,
  save,
}: {
  favorites: string[];
  save: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const prices = usePricesVisible();
  const [range, setRange] = useState<MarketRange>("7d");
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [trending, setTrending] = useState<Trending[]>([]);
  const [fresh, setFresh] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState<MarketRange | null>(null);
  const loading = loaded !== range;
  useEffect(() => {
    let live = true;
    Promise.all([
      api("market/overview?range=" + range),
      api("market/leaderboard?limit=8&range=" + (range === "24h" ? "7d" : range)),
      api("market/trending?limit=6&range=" + (range === "24h" ? "7d" : range)),
    ])
      .then(([o, l, tr]) => {
        if (!live) return;
        setOverview(o.overview);
        setBoard(l.creators || []);
        setTrending(tr.products || []);
        setError("");
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoaded(range));
    return () => {
      live = false;
    };
  }, [range]);
  useEffect(() => {
    let live = true;
    const load = () =>
      Promise.all([api("market/activity?limit=25"), api("catalog?sort=listed")])
        .then(([a, c]) => {
          if (!live) return;
          setEvents(a.events || []);
          setFresh((c.products || []).slice(0, 4));
        })
        .catch(() => {});
    load();
    // The floor refreshes itself while it is open.
    const timer = setInterval(load, 45000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const change = overview ? trend(overview.series) : null;
  const empty = overview && !overview.listed;
  return (
    <>
      <div className="page-kicker">
        <span>{t("LE MARCHÉ EN DIRECT")}</span>
        <span className="live-label">
          <i />
          {t("Actualisation automatique")}
        </span>
      </div>
      <div className="page-heading mk-heading">
        <span className="eyebrow">{t("LE POULS DU MARKETPLACE")}</span>
        <h1>
          {t("Le marché des agents,")}
          <span className="lime">{t(" en temps réel.")}</span>
        </h1>
        <p>
          {t(
            "Volume, ventes, tendances et créateurs. Chaque prix est fixé par son créateur, chaque paiement passe par Stripe.",
          )}
        </p>
      </div>
      <div className="category-tabs mk-ranges" role="group" aria-label={t("Période")}>
        {(Object.keys(marketRanges) as MarketRange[]).map((key) => (
          <button
            key={key}
            className={range === key ? "selected" : ""}
            aria-pressed={range === key}
            onClick={() => setRange(key)}
          >
            {t(rangeLabels[key])}
          </button>
        ))}
      </div>
      {error && <Notice error>{t(error)}</Notice>}
      {loading && !overview ? (
        <Loading />
      ) : overview ? (
        <>
          <div className="mk-stats" aria-busy={loading}>
            <div className="mk-stat mk-stat-main">
              <span>
                {t("Volume des ventes")}
                <CircleDollarSign size={16} />
              </span>
              <strong>{prices ? money(overview.volume_cents, locale) : overview.sales}</strong>
              <small className={change === null ? "" : change >= 0 ? "mk-up" : "mk-down"}>
                {change === null ? (
                  t("Pas encore de tendance")
                ) : (
                  <>
                    {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(change)}
                    {t(" % sur la période")}
                  </>
                )}
              </small>
            </div>
            <div className="mk-stat">
              <span>
                {t("Ventes")}
                <Activity size={16} />
              </span>
              <strong>{overview.sales}</strong>
              <small>
                {overview.acquisitions - overview.sales}{" "}
                {t("acquisition(s) gratuite(s)")}
              </small>
            </div>
            <div className="mk-stat">
              <span>
                {t("Agents en vente")}
                <Store size={16} />
              </span>
              <strong>{overview.listed}</strong>
              <small>
                {overview.new_listings} {t("nouvelle(s) annonce(s)")}
              </small>
            </div>
            <div className="mk-stat">
              <span>
                {t("Créateurs actifs")}
                <Users size={16} />
              </span>
              <strong>{overview.creators}</strong>
              <small>{t("avec au moins une annonce")}</small>
            </div>
            <div className="mk-stat">
              <span>
                {t("Prix plancher")}
                <Tag size={16} />
              </span>
              <strong>
                {prices && overview.floor_cents !== null
                  ? money(overview.floor_cents, locale)
                  : t("—")}
              </strong>
              <small>
                {t("Moyenne :")}{" "}
                {prices && overview.avg_cents !== null
                  ? money(overview.avg_cents, locale)
                  : t("—")}
              </small>
            </div>
            <div className="mk-stat">
              <span>
                {t("Offres ouvertes")}
                <Gavel size={16} />
              </span>
              <strong>{overview.open_offers}</strong>
              <small>{t("négociations en cours")}</small>
            </div>
          </div>
          <section className="panel mk-panel">
            <div className="panel-title">
              <h3>{t("Volume quotidien")}</h3>
              <span className="muted mk-caption">
                {t(range === "all" ? "30 derniers jours" : rangeLabels[range])}
              </span>
            </div>
            <VolumeChart series={overview.series} />
          </section>
        </>
      ) : null}
      {empty ? (
        <section className="panel mk-panel">
          <Empty
            icon={Sparkles}
            title={t("Le marché ouvre ses portes.")}
            action={
              <Link className="button primary" href="/studio/new">
                {t("Mettre mon premier agent en vente ")}
                <ArrowUpRight size={16} />
              </Link>
            }
          >
            {t(
              "Les premières annonces, ventes et offres apparaîtront ici dès leur publication. Aucun chiffre n’est inventé.",
            )}
          </Empty>
        </section>
      ) : (
        <div className="mk-columns">
          <section className="panel mk-panel">
            <div className="panel-title">
              <h3>
                <LineChart size={15} /> {t("Tendances")}
              </h3>
              <Link href="/agents" className="subtle-link">
                {t("Tout le catalogue ")}
                <ArrowRight size={13} />
              </Link>
            </div>
            {trending.length ? (
              <ol className="mk-rank">
                {trending.map((p, i) => (
                  <li key={p.id}>
                    <span className="mk-rank-n">{i + 1}</span>
                    <Link href={"/agents/" + p.slug} className="mk-rank-main">
                      <strong>{p.title}</strong>
                      <small>
                        {p.profiles?.display_name} · {t(p.kind === "bundle" ? "Bundle" : "Agent")}
                      </small>
                    </Link>
                    <span className="mk-rank-figure">
                      <strong>
                        {prices
                          ? p.price_cents
                            ? money(p.price_cents, locale)
                            : t("Gratuit")
                          : t("—")}
                      </strong>
                      <small>
                        {p.market.acquisitions} {t("acq.")} · {p.market.favorites}{" "}
                        <Bookmark size={9} />
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mk-empty-line">
                <LineChart size={16} />
                {t("Les tendances apparaîtront avec les premières ventes.")}
              </div>
            )}
          </section>
          <section className="panel mk-panel">
            <div className="panel-title">
              <h3>
                <Trophy size={15} /> {t("Top créateurs")}
              </h3>
              <Link href="/creators" className="subtle-link">
                {t("Tous les créateurs ")}
                <ArrowRight size={13} />
              </Link>
            </div>
            {board.length ? (
              <ol className="mk-rank">
                {board.map((c, i) => (
                  <li key={c.username}>
                    <span className="mk-rank-n">{i + 1}</span>
                    <Link href={"/creators/" + c.username} className="mk-rank-main mk-rank-creator">
                      <Avatar name={c.display_name} />
                      <span>
                        <strong>
                          {c.display_name}
                          {c.verified && (
                            <BadgeCheck size={12} className="mk-badge" aria-label={t("Vendeur vérifié")} />
                          )}
                        </strong>
                        <small>
                          {t("@")}
                          {c.username} · {c.listed} {t("en vente")}
                        </small>
                      </span>
                    </Link>
                    <span className="mk-rank-figure">
                      <strong>{prices ? compactMoney(c.volume_cents, locale) : c.sales}</strong>
                      <small>
                        {c.sales} {t(c.sales > 1 ? "ventes" : "vente")}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mk-empty-line">
                <Trophy size={16} />
                {t("Le classement se remplira avec les premières annonces.")}
              </div>
            )}
          </section>
        </div>
      )}
      <section className="panel mk-panel">
        <div className="panel-title">
          <h3>
            <Activity size={15} /> {t("Activité récente")}
          </h3>
          <span className="live-label">
            <i />
            {t("En direct")}
          </span>
        </div>
        <ActivityList
          events={events}
          empty="Aucune activité pour l’instant. La première mise en vente ouvrira le fil."
        />
      </section>
      {fresh.length > 0 && (
        <section className="catalog-section mk-fresh">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t("TOUT JUSTE ARRIVÉS")}</span>
              <h2>
                {t("Nouvelles annonces")} <span className="title-dot">{t(".")}</span>
              </h2>
            </div>
            <Link href="/agents" className="subtle-link">
              {t("Voir le catalogue ")}
              <ArrowRight size={15} />
            </Link>
          </div>
          <div className="product-grid">
            {fresh.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                saved={favorites.includes(p.id)}
                onSave={save}
              />
            ))}
          </div>
        </section>
      )}
      <section className="creator-banner mk-cta">
        <div className="banner-symbol">
          <Store size={50} />
          <span>{t("_")}</span>
        </div>
        <div>
          <span className="eyebrow">{t("VOTRE PRIX. VOTRE VITRINE. VOS REVENUS.")}</span>
          <h2>{t("Mettez vos agents sur le marché.")}</h2>
          <p>
            {t(
              "Fixez votre prix, recevez des offres et encaissez avec Stripe. Le marketplace s’occupe de la vitrine et de la livraison privée.",
            )}
          </p>
        </div>
        <Link href="/studio/new" className="button primary">
          {t("Vendre un agent ")}
          <ArrowUpRight size={17} />
        </Link>
      </section>
    </>
  );
}

// Home page questions; the same text is published as FAQPage structured data.
export function HomeFaq() {
  const { t, locale } = useI18n();
  return (
    <section className="mk-faq" aria-labelledby="mk-faq-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("QUESTIONS FRÉQUENTES")}</span>
          <h2 id="mk-faq-title">
            {t("Tout savoir avant de commencer")}{" "}
            <span className="title-dot">{t(".")}</span>
          </h2>
        </div>
        <Link href="/docs" className="subtle-link">
          {t("Le guide complet ")}
          <ArrowRight size={15} />
        </Link>
      </div>
      <div className="mk-faq-list">
        {faq[locale].map((item, i) => (
          <details key={item.q} className="mk-faq-item" open={i === 0}>
            <summary>
              <h3>{item.q}</h3>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
