"use client";
import { useI18n, LanguageSwitcher } from "./i18n";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "./navigation-link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Box,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Compass,
  CreditCard,
  Download,
  ExternalLink,
  Gavel,
  FileCode2,
  FlaskConical,
  FolderOpen,
  GitFork as Github,
  Globe,
  Headphones,
  Images,
  Layers3,
  LayoutGrid,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Menu,
  Package,
  Palette,
  Pencil,
  Plus,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  TrendingUp,
  Users,
  Workflow,
  X,
} from "lucide-react";
import {
  categories,
  engines,
  filterProducts,
  money,
  type Post,
  type Product,
} from "../lib/market/model";
import { demoProducts } from "../lib/market/demo";
import { favoriteIds, readFavorites } from "../lib/market/browser-state";
import {
  api,
  Avatar,
  Brand,
  Empty,
  Loading,
  MarketSettings,
  Modal,
  Notice,
  ProductArt,
  ProductCard,
  CopyButton,
} from "./market-ui";
import {
  ActivityList,
  CreatorMarketStats,
  HomeFaq,
  MarketPage,
  MarketPulse,
  PriceHistory,
  ProductMarketStats,
} from "./market-floor";
import { MyOfferStatus, OfferModal, useMyOffer } from "./market-desk";
import type {
  CreatorStats,
  MarketEvent,
  ProductStats,
} from "../lib/market/market";
import type { InitialData } from "../lib/market/public-data";
import {
  Studio,
  ProductEditor,
  Library,
  SettingsPage,
  Moderation,
} from "./workspace";
import { DocsPage, LegalPage } from "./resources";
import {
  ProfileCover,
  ProfileFeed,
  ProfilePhoto,
  ProfilePhotos,
} from "./profile";
export type Session = {
  user: {
    id: string;
    email: string;
  } | null;
  profile?: {
    display_name: string;
    username: string;
    bio: string;
    website: string;
    avatar_url?: string | null;
    banner_url?: string | null;
  };
  seller?: {
    charges_enabled: boolean;
    payouts_enabled: boolean;
  } | null;
  isAdmin?: boolean;
};
export type Configuration = {
  accounts: boolean;
  payments: boolean;
  demo: boolean;
  github: boolean;
  google?: boolean;
  // Free acquisitions are open (launch gate), independently of Stripe.
  launched?: boolean;
  // Older servers omit it: prices then stay visible by default.
  prices?: boolean;
  feeBps: number | null;
};
const categoryIcons = [
  Code2,
  FlaskConical,
  TrendingUp,
  Workflow,
  Palette,
  Headphones,
];
export default function Marketplace({
  initialConfig,
  initialData,
}: {
  initialConfig: Configuration;
  // Server-rendered content for the first page (search engines, previews).
  initialData?: InitialData;
}) {
  const { t, locale } = useI18n();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [config, setConfig] = useState<Configuration>(initialConfig);
  const [session, setSession] = useState<Session>({ user: null });
  const [auth, setAuth] = useState<"login" | "signup" | "recover" | null>(null);
  const [mobile, setMobile] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [bootError, setBootError] = useState("");
  // Route changes remount this tree; a message sent just before navigating
  // (e.g. "submitted for review") is carried over for a few seconds.
  const notify = useCallback((s: string) => {
    setToast(s);
    try {
      sessionStorage.setItem("mp-toast", JSON.stringify({ s, at: Date.now() }));
    } catch {}
  }, []);
  useEffect(() => {
    // Read the external store once the tree is mounted.
    const restore = setTimeout(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem("mp-toast") || "null");
        if (saved && typeof saved.s === "string" && Date.now() - saved.at < 5000)
          setToast(saved.s);
      } catch {}
    }, 0);
    return () => clearTimeout(restore);
  }, []);
  const refresh = useCallback(async () => {
    const d = await api("me");
    setSession(d);
    return d;
  }, []);
  useEffect(() => {
    api("config")
      .then(setConfig)
      .catch(() =>
        setBootError(
          "Le service est momentanément inaccessible. Rechargez la page.",
        ),
      );
    refresh().catch(() => {});
    try {
      setFavorites(readFavorites(localStorage));
    } catch {}
    document.dispatchEvent(new Event("marketpaperclip:ready"));
  }, [refresh]);
  useEffect(() => {
    if (session.user)
      api("favorites")
        .then((d) => setFavorites(favoriteIds(d.ids)))
        .catch(() => {});
  }, [session.user?.id]);
  // Only an expired or dismissed message is forgotten; an empty state at
  // mount must not erase a message that is about to be restored.
  const dismissToast = useCallback(() => {
    setToast("");
    try {
      sessionStorage.removeItem("mp-toast");
    } catch {}
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 4500);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);
  useEffect(() => {
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (new URLSearchParams(window.location.search).get("auth") === "invalid")
      notify("Ce lien est invalide ou expiré. Demandez un nouveau lien.");
    if (new URLSearchParams(window.location.search).get("auth") === "cancelled")
      notify("Connexion annulée. Vous pouvez réessayer quand vous le souhaitez.");
  }, [pathname, notify]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const save = async (id: string) => {
    const exists = favorites.includes(id);
    const next = exists
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    setFavorites(next);
    try {
      if (session.user && !id.startsWith("demo"))
        await api("favorites", { product_id: id }, exists ? "DELETE" : "POST");
      else localStorage.setItem("mp-favorites", JSON.stringify(next));
      notify(exists ? "Retiré des favoris." : "Ajouté aux favoris.");
    } catch (e) {
      setFavorites(favorites);
      notify((e as Error).message);
    }
  };
  const signIn = () => setAuth("login");
  const catalog = ["/", "/agents", "/bundles", "/favorites"].includes(pathname);
  const initial = initialData?.path === pathname ? initialData : undefined;
  const settings = useMemo(
    () => ({ prices: config.prices !== false }),
    [config.prices],
  );
  return (
    <MarketSettings.Provider value={settings}>
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("Aller au contenu")}
      </a>
      {t(
        mobile && (
          <button
            className="sidebar-scrim"
            onClick={() => setMobile(false)}
            aria-label={t("Fermer le menu")}
          />
        ),
      )}
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <Brand />
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Box size={17} />
          </span>
          <div>
            {t("Le marketplace")}
            <span>{t("Built for builders.")}</span>
          </div>
          <span className="version-badge">{t("BETA")}</span>
        </div>
        <div className="side-section-label">{t("DÉCOUVRIR")}</div>
        <nav aria-label={t("Navigation principale")}>
          <Link
            className={"nav-item " + (pathname === "/" ? "active" : "")}
            href="/"
          >
            <Compass size={18} />
            {t(" Explorer ")}
            <span className="active-dot" />
          </Link>
          <Link
            className={"nav-item " + (pathname === "/market" ? "active" : "")}
            href="/market"
          >
            <Activity size={18} />
            {t(" Le marché")} <span className="nav-tag">{t("LIVE")}</span>
          </Link>
          <Link
            className={"nav-item " + (pathname === "/agents" ? "active" : "")}
            href="/agents"
          >
            <Box size={18} />
            {t(" Tous les agents")}
          </Link>
          <Link
            className={"nav-item " + (pathname === "/bundles" ? "active" : "")}
            href="/bundles"
          >
            <Layers3 size={18} />
            {t(" Bundles")} <span className="nav-tag">{t("ÉQUIPES")}</span>
          </Link>
          <Link
            className={"nav-item " + (pathname === "/creators" ? "active" : "")}
            href="/creators"
          >
            <Users size={18} />
            {t(" Les créateurs")}
          </Link>
          <Link
            className={
              "nav-item " + (pathname === "/favorites" ? "active" : "")
            }
            href="/favorites"
          >
            <Bookmark size={18} />
            {t(" Mes favoris")}{" "}
            {t(
              favorites.length > 0 && (
                <span className="nav-count">{t(favorites.length)}</span>
              ),
            )}
          </Link>
        </nav>
        <div className="side-section-label">{t("MON ESPACE")}</div>
        <nav aria-label={t("Mon espace")}>
          <Link
            className={"nav-item " + (pathname === "/library" ? "active" : "")}
            href="/library"
          >
            <FolderOpen size={18} />
            {t(" Mes acquisitions")}
          </Link>
          <Link
            className={
              "nav-item " + (pathname.startsWith("/studio") ? "active" : "")
            }
            href="/studio"
          >
            <Terminal size={18} />
            {t(" Studio créateur")}{" "}
            <ArrowUpRight size={13} className="nav-end" />
          </Link>
          {t(
            session.isAdmin && (
              <Link href="/admin" className="nav-item">
                <ShieldCheck size={18} />
                {t(" Modération")}
              </Link>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="creator-invite">
            <span className="invite-icon">
              <Sparkles size={19} />
            </span>
            <h3>{t("Votre code a de la valeur.")}</h3>
            <p>{t("Faites de vos agents votre prochain produit.")}</p>
            <Link className="button secondary small" href="/studio">
              {t("Devenir créateur ")}
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <Link
            className={"nav-item " + (pathname === "/docs" ? "active" : "")}
            href="/docs"
          >
            <BookOpen size={17} />
            {t(" Documentation")} <ArrowUpRight size={13} className="nav-end" />
          </Link>
          <div className="sidebar-footer">
            <span className="status-dot" />
            {t(" Pour ceux qui construisent.")}
            <span>{t("v1.0")}</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label={t("Ouvrir le menu")}
            onClick={() => setMobile(true)}
          >
            <Menu size={22} />
          </button>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push("/agents?q=" + encodeURIComponent(globalQuery));
              document.getElementById("global-search")?.blur();
            }}
          >
            <button
              type="button"
              className="search-trigger"
              aria-label={t("Ouvrir la recherche")}
              onClick={() => document.getElementById("global-search")?.focus()}
            >
              <Search size={17} />
            </button>
            <input
              id="global-search"
              aria-label={t("Rechercher des agents")}
              placeholder={t("Un agent, une idée, une possibilité…")}
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
            />
            <kbd>{t("⌘ K")}</kbd>
          </form>
          <div className="topbar-actions">
            <LanguageSwitcher />
            <Link href="/docs" className="top-docs">
              {t("Guide développeur ")}
              <ArrowUpRight size={13} />
            </Link>
            <span className="top-divider" />
            {t(
              session.user ? (
                <Link className="account-button" href="/settings">
                  <Avatar
                    name={session.profile?.display_name || "Dev"}
                    src={session.profile?.avatar_url}
                  />
                  <span>{session.profile?.display_name}</span>
                </Link>
              ) : (
                <button className="text-button login-link" onClick={signIn}>
                  {t("Connexion")}
                </button>
              ),
            )}
            <Link className="button primary small" href="/studio/new">
              <Plus size={16} />
              <span>{t("Publier un agent")}</span>
            </Link>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {t(bootError && <Notice error>{t(bootError)}</Notice>)}
          {t(
            catalog ? (
              <Catalog
                path={pathname}
                config={config}
                favorites={favorites}
                save={save}
                initial={initial?.catalog ?? undefined}
              />
            ) : pathname.startsWith("/agents/") ? (
              <ProductDetail
                slug={pathname.split("/")[2]}
                config={config}
                session={session}
                signIn={signIn}
                favorites={favorites}
                save={save}
                notify={notify}
                initial={initial?.product ?? undefined}
              />
            ) : pathname === "/market" ? (
              <MarketPage favorites={favorites} save={save} />
            ) : pathname === "/creators" ? (
              <Creators />
            ) : pathname.startsWith("/creators/") ? (
              <CreatorProfile
                name={pathname.split("/")[2]}
                favorites={favorites}
                save={save}
                initial={initial?.creator ?? undefined}
                session={session}
                refresh={refresh}
                notify={notify}
              />
            ) : pathname === "/studio" ? (
              <Studio
                session={session}
                config={config}
                signIn={signIn}
                notify={notify}
              />
            ) : pathname.startsWith("/studio/") ? (
              <ProductEditor
                key={pathname}
                session={session}
                config={config}
                signIn={signIn}
                notify={notify}
                id={pathname.split("/")[2]}
              />
            ) : pathname === "/library" ? (
              <Library session={session} signIn={signIn} notify={notify} />
            ) : pathname === "/settings" ? (
              <SettingsPage
                session={session}
                refresh={refresh}
                signIn={signIn}
                notify={notify}
              />
            ) : pathname === "/admin" ? (
              <Moderation session={session} notify={notify} />
            ) : pathname === "/docs" ? (
              <DocsPage />
            ) : ["/terms", "/privacy", "/licenses", "/support"].includes(
                pathname,
              ) ? (
              <LegalPage
                path={pathname}
                session={session}
                signIn={signIn}
                notify={notify}
              />
            ) : (
              <Empty
                title={t("Page introuvable")}
                action={
                  <Link className="button primary" href="/">
                    {t("Retour au marketplace")}
                  </Link>
                }
              >
                {t("Cette page n’existe pas ou a changé d’adresse.")}
              </Empty>
            ),
          )}
        </main>
        <footer className="site-footer">
          <div>
            <span className="footer-brand">{t("marketpaperclip")}</span>
            <p>
              {t("Un marketplace indépendant imaginé par")}{" "}
              <a
                href="https://mgminformatique.ca"
                target="_blank"
                rel="noreferrer"
              >
                {t("MGM Informatique ↗")}
              </a>
            </p>
          </div>
          <div>
            <Link href="/terms">{t("Conditions")}</Link>
            <Link href="/privacy">{t("Confidentialité")}</Link>
            <Link href="/support">{t("Assistance")}</Link>
            <span>{t("FR / CAD")}</span>
          </div>
        </footer>
      </div>
      {t(
        auth && (
          <AuthModal
            mode={auth}
            setMode={setAuth}
            config={config}
            onClose={() => setAuth(null)}
            onSuccess={async () => {
              await refresh();
              setAuth(null);
              notify("Bienvenue dans votre espace.");
            }}
          />
        ),
      )}
      {t(
        toast && (
          <div className="toast" role="status">
            <Check size={17} />
            {t(toast)}
            <button
              aria-label={t("Fermer la notification")}
              onClick={dismissToast}
            >
              <X size={15} />
            </button>
          </div>
        ),
      )}
    </div>
    </MarketSettings.Provider>
  );
}
function Catalog({
  path,
  config,
  favorites,
  save,
  initial,
}: {
  path: string;
  config: Configuration;
  favorites: string[];
  save: (id: string) => void;
  initial?: InitialData["catalog"];
}) {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const searchQuery = searchParams?.get("q") || "";
  const [products, setProducts] = useState<Product[]>(
    initial?.products ?? (config.demo ? demoProducts : []),
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tout");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("featured");
  const [engine, setEngine] = useState("all");
  const [filters, setFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setQuery(searchQuery);
    setKind(
      path === "/bundles" ? "bundle" : path === "/agents" ? "agent" : "all",
    );
    setCategory("Tout");
    setPage(0);
  }, [path, searchQuery]);
  useEffect(() => {
    setPage(0);
  }, [query, category, kind, sort, engine]);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const qs = new URLSearchParams({
        q: query,
        category,
        kind,
        sort,
        engine,
        page: String(page),
      });
      if (path === "/favorites" && favorites.length && !config.demo)
        qs.set(
          "ids",
          favorites
            .filter((x) => !x.startsWith("demo"))
            .slice(0, 200)
            .join(","),
        );
      api("catalog?" + qs)
        .then((d) => {
          if (current) {
            setProducts(d.products);
            setTotal(d.total);
            setError("");
          }
        })
        .catch((e) => {
          if (current) setError(e.message);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [
    query,
    category,
    kind,
    sort,
    engine,
    page,
    config.accounts,
    path,
    favorites.join(","),
  ]);
  const shown = useMemo(() => {
    let p = config.demo
      ? filterProducts(
          products.map((product) => ({
            ...product,
            tags: [
              ...product.tags,
              t(product.tagline),
              t(product.category),
              ...product.tags.map(t),
            ],
          })),
          query,
          category,
          kind,
          sort,
        ).map((product) =>
          products.find((original) => original.id === product.id)!,
        )
      : products;
    if (engine !== "all") p = p.filter((p) => p.engine === engine);
    if (path === "/favorites") p = p.filter((p) => favorites.includes(p.id));
    return p;
  }, [
    products,
    query,
    category,
    kind,
    sort,
    engine,
    path,
    favorites,
    config.demo,
    t,
  ]);
  const home = path === "/";
  return (
    <>
      <div className="page-kicker">
        <span>{t("LE TERRAIN DE JEU DES BUILDERS")}</span>
        <span className="live-label">
          <i />
          {t(config.demo ? "Avant-première" : "Le marketplace des agents")}
        </span>
      </div>
      {t(
        home ? (
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="mini-spark">{t("✳")}</span>
                {t(" MOINS DE LIMITES. PLUS DE POSSIBILITÉS.")}
              </span>
              <h1>
                {t("Votre prochain")}
                <br />
                {t("super-pouvoir")}
                <span className="lime">{t(" est ici.")}</span>
              </h1>
              <p>
                {t("Des agents qui font avancer vos idées.")}
                <br />
                {t("Découvrez le bon talent. Assemblez votre équipe.")}
                <br className="desktop-br" />
                {t(" Construisez la suite.")}
              </p>
              <div className="hero-actions">
                <a className="button primary" href="#catalogue">
                  {t("Explorer les agents ")}
                  <ArrowRight size={17} />
                </a>
                <Link className="button ghost" href="/studio">
                  {t("Vendre mes créations ")}
                  <ArrowUpRight size={17} />
                </Link>
              </div>
              <div className="hero-proof">
                <span>
                  <Code2 size={14} />
                  {t(" Pensé pour les développeurs")}
                </span>
                <span className="proof-line" />
                <span>
                  <PaperclipSmall />
                  {t(" Conçu autour de Paperclip")}
                </span>
              </div>
            </div>
            <div className="hero-art">
              <img
                src="/art/hero.webp"
                alt={t(
                  "Trombone vert métallique au-dessus d’un réseau de modules d’agents",
                )}
                fetchPriority="high"
              />
              <div className="hero-floating top-float">
                <span className="float-icon">
                  <Terminal size={15} />
                </span>
                <div>
                  {t("Votre prochain agent")}
                  <span>{t("Prêt à rejoindre votre stack")}</span>
                </div>
                <span className="status-dot" />
              </div>
              <div className="hero-floating bottom-float">
                <span className="float-symbol">{t("⌘")}</span>
                <span>
                  {t("Build less.")}
                  <br />
                  <strong>{t("Launch more.")}</strong>
                </span>
                <ArrowUpRight size={20} />
              </div>
              <span className="hero-caption">
                {t("HUMAN IDEAS. AGENT POWER.")}
              </span>
            </div>
          </section>
        ) : (
          <div className="page-heading">
            <span className="eyebrow">
              {t(
                path === "/bundles"
                  ? "LE POUVOIR DU COLLECTIF"
                  : path === "/favorites"
                    ? "VOTRE SÉLECTION"
                    : "TROUVEZ VOTRE PROCHAIN ALLIÉ",
              )}
            </span>
            <h1>
              {t(
                path === "/bundles"
                  ? "Une équipe. Toutes les possibilités."
                  : path === "/favorites"
                    ? "Vos prochains coups de cœur."
                    : "Les agents qui changent la donne.",
              )}
            </h1>
            <p>
              {t(
                path === "/bundles"
                  ? "Des ensembles d’agents coordonnés, réunis dans un seul package."
                  : path === "/favorites"
                    ? "Gardez les bonnes idées à portée de main."
                    : "Du code, de la recherche, du marketing. Un agent pour chaque ambition.",
              )}
            </p>
          </div>
        ),
      )}
      {t(home && !config.demo && <MarketPulse />)}
      {t(
        home && (
          <div className="ecosystem-bar">
            <span>
              {t("VOTRE STACK.")}
              <br />
              <strong>{t("VOS RÈGLES.")}</strong>
            </span>
            <span className="ecosystem-name claude-mark">{t("✳ Claude")}</span>
            <span className="ecosystem-name">
              <span className="openai-mark">{t("◎")}</span>
              {t(" OpenAI")}
            </span>
            <span className="ecosystem-name">
              <span className="gemini-mark">{t("✦")}</span>
              {t(" Gemini")}
            </span>
            <span className="ecosystem-name">
              <Terminal size={21} />
              {t(" Ollama")}
            </span>
            <span className="ecosystem-name">
              <Github size={21} />
              {t(" GitHub")}
            </span>
            <span className="ecosystem-more">
              {t("Et votre imagination ")}
              <ArrowUpRight size={14} />
            </span>
          </div>
        ),
      )}
      <section id="catalogue" className="catalog-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              {t(
                path === "/favorites"
                  ? "À GARDER SOUS LA MAIN"
                  : "LE BON AGENT. AU BON MOMENT.",
              )}
            </span>
            <h2>
              {t(
                path === "/favorites"
                  ? "Vos favoris"
                  : path === "/bundles"
                    ? "Des agents faits pour collaborer"
                    : "Explorez les possibilités",
              )}{" "}
              <span className="title-dot">{t(".")}</span>
            </h2>
          </div>
          {t(
            home && (
              <Link href="/agents" className="subtle-link">
                {t("Tout le catalogue ")}
                <ArrowRight size={15} />
              </Link>
            ),
          )}
        </div>
        <div
          className="category-tabs"
          role="group"
          aria-label={t("Catégories")}
        >
          <button
            className={category === "Tout" ? "selected" : ""}
            onClick={() => setCategory("Tout")}
          >
            <LayoutGrid size={15} />
            {t(" Tout explorer")}
          </button>
          {t(
            categories.map((cat, i) => {
              const Icon = categoryIcons[i];
              return (
                <button
                  className={category === cat ? "selected" : ""}
                  key={cat}
                  onClick={() => setCategory(cat)}
                >
                  <Icon size={15} />
                  {t(cat)}
                </button>
              );
            }),
          )}
        </div>
        <div className="catalog-tools">
          <div className="catalog-search">
            <Search size={16} />
            <input
              aria-label={t("Filtrer le catalogue")}
              placeholder={t("Trouvez votre prochain agent…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {t(
              query && (
                <button
                  aria-label={t("Effacer la recherche")}
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              ),
            )}
          </div>
          <div className="catalog-options">
            <button
              className={"filter-button " + (filters ? "selected" : "")}
              onClick={() => setFilters(!filters)}
              aria-expanded={filters}
            >
              <SlidersHorizontal size={15} />
              {t(" Filtres")}
              {t(engine !== "all" && <span className="status-dot" />)}
            </button>
            <span className="results-count">
              {t(config.demo ? shown.length : total)}
              {t(" résultat")}
              {t((config.demo ? shown.length : total) > 1 ? "s" : "")}
            </span>
            <div className="sort-wrap">
              <select
                aria-label={t("Trier les agents")}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="featured">{t("À découvrir")}</option>
                <option value="new">{t("Plus récents")}</option>
                {config.prices !== false && (
                  <>
                    <option value="price-asc">{t("Prix croissant")}</option>
                    <option value="price-desc">{t("Prix décroissant")}</option>
                  </>
                )}
              </select>
              <ChevronDown size={14} />
            </div>
          </div>
        </div>
        {t(
          filters && (
            <div className="extra-filters">
              <label>
                {t("Modèle")}
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                >
                  <option value="all">{t("Tous les modèles")}</option>
                  {t(
                    engines.map((x) => (
                      <option key={x} value={x}>
                        {t(x)}
                      </option>
                    )),
                  )}
                </select>
              </label>
              <label>
                {t("Format")}
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="all">{t("Agents et bundles")}</option>
                  <option value="agent">{t("Agent individuel")}</option>
                  <option value="bundle">{t("Bundle d’agents")}</option>
                </select>
              </label>
              <button
                className="text-button"
                onClick={() => {
                  setEngine("all");
                  setKind(path === "/bundles" ? "bundle" : "all");
                  setCategory("Tout");
                  setQuery("");
                }}
              >
                {t("Réinitialiser")}
              </button>
            </div>
          ),
        )}
        {t(
          config.demo && (
            <div className="demo-caption">
              <span className="status-dot" />
              {t(
                " Catalogue de démonstration · Explorez les fiches et l’expérience. Les ventes ouvriront au lancement.",
              )}
            </div>
          ),
        )}
        {t(
          error ? (
            <Notice error>{t(error)}</Notice>
          ) : (
            <div
              aria-busy={loading}
              className={"product-grid " + (loading ? "updating" : "")}
            >
              {t(
                shown.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    saved={favorites.includes(p.id)}
                    onSave={save}
                  />
                )),
              )}
            </div>
          ),
        )}
        {t(
          !error && !shown.length && !loading && (
            <Empty
              title={t(
                path === "/favorites"
                  ? "Votre sélection commence ici."
                  : "Aucun agent pour ces critères.",
              )}
              action={
                <button
                  className="button secondary"
                  onClick={() => {
                    setQuery("");
                    setCategory("Tout");
                    setEngine("all");
                    setKind("all");
                  }}
                >
                  {t("Explorer le catalogue")}
                </button>
              }
            >
              {t(
                path === "/favorites"
                  ? "Touchez le signet d’un agent pour le retrouver ici."
                  : "Essayez une autre recherche ou élargissez vos filtres.",
              )}
            </Empty>
          ),
        )}
        {t(
          !config.demo && total > 24 && (
            <div className="pagination">
              <button
                className="button secondary small"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                {t("Précédent")}
              </button>
              <span>
                {t("Page ")}
                {t(page + 1)}
                {t(" / ")}
                {t(Math.ceil(total / 24))}
              </span>
              <button
                className="button secondary small"
                disabled={(page + 1) * 24 >= total}
                onClick={() => setPage(page + 1)}
              >
                {t("Suivant")}
              </button>
            </div>
          ),
        )}
      </section>
      {t(
        home && (
          <>
            <section className="creator-banner">
              <div className="banner-symbol">
                <Braces size={54} />
                <span>{t("_")}</span>
              </div>
              <div>
                <span className="eyebrow">
                  {t("FROM SIDE PROJECT TO NEXT BIG THING")}
                </span>
                <h2>
                  {t("Vous avez construit quelque chose de fort.")}
                  <br />
                  {t("Donnez-lui une vitrine à sa hauteur.")}
                </h2>
                <p>
                  {t(
                    "Votre profil. Vos agents. Vos prix. Une nouvelle façon de valoriser votre savoir-faire.",
                  )}
                </p>
              </div>
              <Link href="/studio" className="button primary">
                {t("Ouvrir mon studio ")}
                <ArrowUpRight size={17} />
              </Link>
            </section>
            <section className="value-row">
              <div>
                <Package size={21} />
                <h3>{t("Un vrai produit.")}</h3>
                <p>
                  {t(
                    "Versions, documentation et licence. Tout ce qu’il faut pour choisir en confiance.",
                  )}
                </p>
              </div>
              <div>
                <Users size={21} />
                <h3>{t("Une communauté de créateurs.")}</h3>
                <p>
                  {t(
                    "Découvrez les personnes derrière les agents et retrouvez toutes leurs créations.",
                  )}
                </p>
              </div>
              <div>
                <LockKeyhole size={21} />
                <h3>{t("Votre achat, dans votre espace.")}</h3>
                <p>
                  {t(
                    "Un accès privé à vos fichiers, avec votre historique d’achat au même endroit.",
                  )}
                </p>
              </div>
            </section>
            <HomeFaq />
          </>
        ),
      )}
    </>
  );
}
function PaperclipSmall() {
  const { t, locale } = useI18n();
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="m9 13 7-7a3 3 0 0 1 4 4L10 20a5 5 0 0 1-7-7L14 2M7 15l9-9" />
    </svg>
  );
}
function AuthModal({
  mode,
  setMode,
  config,
  onClose,
  onSuccess,
}: {
  mode: "login" | "signup" | "recover";
  setMode: (x: "login" | "signup" | "recover") => void;
  config: Configuration;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setError("");
    setMessage("");
  }, [mode]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const b = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const d = await api("auth/" + mode, b);
      if (mode === "login") onSuccess();
      else setMessage(d.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={t(
        mode === "signup"
          ? "Votre prochaine idée commence ici."
          : mode === "recover"
            ? "Retrouvez votre espace."
            : "Bon retour parmi les builders.",
      )}
      onClose={onClose}
    >
      <div className="auth-logo">
        <Terminal size={24} />
      </div>
      <p className="muted">
        {t(
          mode === "signup"
            ? "Un compte pour découvrir, acheter et publier vos agents."
            : mode === "recover"
              ? "Recevez un lien pour choisir un nouveau mot de passe."
              : "Vos agents, vos créations et vos prochaines possibilités.",
        )}
      </p>
      {t(
        !config.accounts && (
          <Notice>
            {t("Avant-première : la création de comptes ouvrira au lancement.")}
          </Notice>
        ),
      )}
      {config.accounts && config.google && mode !== "recover" && (
        // OAuth starts with a full-page redirect through the server route.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a className="button secondary full" href="/api/auth/google">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.86 46.98 24.55Z" />
            <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
          </svg>
          {t("Continuer avec Google")}
        </a>
      )}
      {t(
        config.github && mode !== "recover" && (
          <a className="button secondary full" href="/api/auth/github">
            <Github size={18} />
            {t(" Continuer avec GitHub")}
          </a>
        ),
      )}
      {t(
        message ? (
          <Notice>{t(message)}</Notice>
        ) : (
          <form onSubmit={submit} className="form-stack">
            {t(
              mode === "signup" && (
                <label>
                  {t("Nom public")}
                  <input
                    name="display_name"
                    autoComplete="nickname"
                    required
                    minLength={2}
                    maxLength={60}
                    placeholder={t("Votre nom ou votre studio")}
                  />
                </label>
              ),
            )}
            <label>
              {t("Adresse courriel")}
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder={t("vous@studio.dev")}
              />
            </label>
            {t(
              mode !== "recover" && (
                <label>
                  {t("Mot de passe")}
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    required
                    minLength={mode === "signup" ? 12 : 1}
                    maxLength={128}
                    placeholder={t(
                      mode === "signup"
                        ? "12 caractères minimum"
                        : "Votre mot de passe",
                    )}
                  />
                </label>
              ),
            )}
            {t(
              mode === "signup" && (
                <label className="checkbox-label">
                  <input type="checkbox" required />
                  <span>
                    {t("J’accepte les")}{" "}
                    <Link href="/terms" onClick={onClose}>
                      {t("conditions")}
                    </Link>{" "}
                    {t("et la")}{" "}
                    <Link href="/privacy" onClick={onClose}>
                      {t("politique de confidentialité")}
                    </Link>
                    {t(".")}
                  </span>
                </label>
              ),
            )}
            {t(error && <Notice error>{t(error)}</Notice>)}
            <button
              disabled={busy || !config.accounts}
              className="button primary full"
            >
              {t(
                busy
                  ? "Un instant…"
                  : mode === "signup"
                    ? "Créer mon compte"
                    : mode === "recover"
                      ? "Recevoir un lien"
                      : "Me connecter",
              )}
              <ArrowRight size={16} />
            </button>
          </form>
        ),
      )}
      {t(
        mode === "login" && (
          <button className="auth-link" onClick={() => setMode("recover")}>
            {t("Mot de passe oublié ?")}
          </button>
        ),
      )}
      <div className="auth-switch">
        {t(mode === "signup" ? "Vous avez déjà un compte ?" : "Nouveau ici ?")}{" "}
        <button onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
          {t(mode === "signup" ? "Se connecter" : "Créer un compte")}
        </button>
      </div>
    </Modal>
  );
}
function ProductDetail({
  slug,
  config,
  session,
  signIn,
  favorites,
  save,
  notify,
  initial,
}: {
  slug: string;
  config: Configuration;
  session: Session;
  signIn: () => void;
  favorites: string[];
  save: (id: string) => void;
  notify: (s: string) => void;
  initial?: InitialData["product"];
}) {
  const { t, locale } = useI18n();
  const [p, setP] = useState<Product | null>(initial?.product ?? null);
  const [reviews, setReviews] = useState<any[]>(initial?.reviews ?? []);
  const [stats, setStats] = useState<ProductStats | null>(
    (initial?.stats as ProductStats | null) ?? null,
  );
  const [activity, setActivity] = useState<MarketEvent[]>(
    (initial?.activity as MarketEvent[]) ?? [],
  );
  const [tab, setTab] = useState("about");
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offering, setOffering] = useState(false);
  const [owned, setOwned] = useState(false);
  const showPrices = config.prices !== false;
  const load = useCallback(
    () =>
      api("products/" + encodeURIComponent(slug))
        .then((d) => {
          setP(d.product);
          setReviews(d.reviews);
          setStats(d.stats || null);
          setActivity(d.activity || []);
          setOwned(!!d.owned);
        })
        .catch((e) => setError(e.message)),
    [slug],
  );
  useEffect(() => {
    // Keep server-rendered content on screen; a different product starts blank.
    setP((current) => (current && current.slug === slug ? current : null));
    setError("");
    setTab("about");
    setAccepted(false);
    load();
    if (
      new URLSearchParams(window.location.search).get("checkout") ===
      "cancelled"
    )
      notify("Paiement annulé. Vous pouvez reprendre votre achat à tout moment.");
  }, [slug, load, notify]);
  const own = !!(p && session.user && p.seller_id === session.user.id);
  const free = p?.price_cents === 0;
  // Free agents open with the launch gate; paid ones need Stripe payments.
  const open = !!p && !p.demo && (free ? !!config.launched : config.payments);
  const offersOpen =
    !!p &&
    !p.demo &&
    config.payments &&
    !own &&
    !owned &&
    (p.price_cents ?? 0) > 0;
  const { offer, reload: reloadOffer } = useMyOffer(
    p && !p.demo ? p.id : null,
    !!session.user && offersOpen,
  );
  const buy = async () => {
    if (!session.user) {
      signIn();
      return;
    }
    if (!showPrices || !p || p.price_cents === null || !open || own) return;
    setBusy(true);
    try {
      const d = await api("checkout", {
        product_id: p.id,
        license_accepted: accepted,
      });
      window.location.assign(d.url);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (error) return <Notice error>{t(error)}</Notice>;
  if (!p) return <Loading />;
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/">{t("Marketplace")}</Link>
        <ChevronRight size={13} />
        <Link href={p.kind === "bundle" ? "/bundles" : "/agents"}>
          {t(p.kind === "bundle" ? "Bundles" : "Agents")}
        </Link>
        <ChevronRight size={13} />
        <span>{p.title}</span>
      </div>
      <div className="product-detail-layout">
        <div>
          <div className="detail-art">
            <ProductArt product={p} large />
            <span className="detail-art-label">
              <span className="status-dot" />
              {t(p.demo ? "PRODUIT DE DÉMONSTRATION" : "PACKAGE NUMÉRIQUE")}
            </span>
          </div>
          <div
            className="detail-tabs"
            role="tablist"
            aria-label={t("Informations produit")}
          >
            {t(
              [
                ["about", "Vue d’ensemble"],
                ["setup", "Installation"],
                ...(p.demo ? [] : [["activity", "Activité"]]),
                ["reviews", `Avis (${reviews.length})`],
              ].map(([id, label]) => (
                <button
                  role="tab"
                  aria-selected={tab === id}
                  key={id}
                  onClick={() => setTab(id)}
                >
                  {t(label)}
                </button>
              )),
            )}
          </div>
          <div className="detail-body" role="tabpanel">
            {t(
              tab === "about" ? (
                <>
                  <h2>{t("Conçu pour faire avancer votre travail.")}</h2>
                  <p className="preserve-lines">
                    {p.demo ? t(p.description) : p.description}
                  </p>
                  <h3>{t("Ce que vous obtenez")}</h3>
                  <div className="included-grid">
                    <span>
                      <FileCode2 size={18} />
                      {t(" Package de l’agent · v")}
                      {t(p.version)}
                    </span>
                    <span>
                      <BookOpen size={18} />
                      {t(" Instructions d’installation")}
                    </span>
                    <span>
                      <LockKeyhole size={18} />
                      {t(" Téléchargement privé")}
                    </span>
                    <span>
                      <Package size={18} />
                      {t(
                        p.kind === "bundle"
                          ? `${p.agent_count} agents dans ce bundle`
                          : "Configuration d’un agent",
                      )}
                    </span>
                  </div>
                  <h3>{t("Avant de commencer")}</h3>
                  <p>{p.demo ? t(p.requirements) : p.requirements}</p>
                  <div className="info-callout">
                    {t(
                      "Les coûts des modèles et des services tiers sont distincts du prix du package. Vérifiez les permissions et les prérequis avant l’exécution.",
                    )}
                  </div>
                </>
              ) : tab === "activity" ? (
                <>
                  <h2>{t("L’historique du marché.")}</h2>
                  <p className="muted mk-tab-lead">
                    {t(
                      "Mises en vente, changements de prix, offres et ventes. Les acheteurs restent anonymes.",
                    )}
                  </p>
                  {showPrices && (
                    <PriceHistory events={activity} price={p.price_cents} />
                  )}
                  <ActivityList
                    events={activity}
                    showProduct={false}
                    showSeller={false}
                    empty="Aucune activité publique pour ce produit."
                  />
                </>
              ) : tab === "setup" ? (
                <>
                  <h2>{t("Votre prochaine étape.")}</h2>
                  <p className="preserve-lines">
                    {p.demo ? t(p.setup) : p.setup}
                  </p>
                  <div className="code-block">
                    <div>
                      <span>{t("PACKAGE / README.md")}</span>
                      <CopyButton value={p.setup} />
                    </div>
                    <pre>{p.demo ? t(p.setup) : p.setup}</pre>
                  </div>
                </>
              ) : (
                <>
                  {t(
                    reviews.length ? (
                      reviews.map((r, i) => (
                        <article className="review" key={i}>
                          <div>
                            <Avatar
                              name={r.profiles?.display_name || "Acheteur"}
                            />
                            <strong>{r.profiles?.display_name}</strong>
                            <span className="lime">
                              {t("★".repeat(r.rating))}
                            </span>
                            <small>{t("Achat confirmé")}</small>
                          </div>
                          <p>{r.body}</p>
                        </article>
                      ))
                    ) : (
                      <Empty
                        icon={Users}
                        title={t("L’histoire reste à écrire.")}
                      >
                        {t(
                          "Les avis des acheteurs confirmés apparaîtront ici.",
                        )}
                      </Empty>
                    ),
                  )}
                </>
              ),
            )}
          </div>
        </div>
        <aside className="purchase-panel">
          <div className="product-meta-line">
            <span className="pill lime-pill">
              {t(
                p.kind === "bundle"
                  ? `${p.agent_count} AGENTS · BUNDLE`
                  : "AGENT",
              )}
            </span>
            <span className="muted">
              {t("v")}
              {t(p.version)}
            </span>
          </div>
          <h1>{p.title}</h1>
          <p className="product-lead">{p.demo ? t(p.tagline) : p.tagline}</p>
          <Link
            className="seller-link"
            href={"/creators/" + p.profiles?.username}
          >
            <Avatar
              name={p.profiles?.display_name || "Créateur"}
              src={p.profiles?.avatar_url}
            />
            <span>
              {t("Créé par")}
              <strong>{p.profiles?.display_name}</strong>
            </span>
            <ArrowUpRight size={18} />
          </Link>
          {showPrices && (
            <div
              className={
                "purchase-price" +
                (p.price_cents === null ? " price-unset" : "")
              }
            >
              {t(
                p.price_cents === null
                  ? "Prix choisi par le créateur"
                  : p.price_cents
                    ? money(p.price_cents, locale)
                    : "Gratuit",
              )}
              {p.price_cents !== null && (
                <span>
                  {t(
                    p.price_cents ? "CAD / paiement unique" : "Licence incluse",
                  )}
                </span>
              )}
            </div>
          )}
          {!p.demo && <ProductMarketStats stats={stats} />}
          {t(
            p.demo ? (
              <Notice>
                {t("Fiche de démonstration. Ce produit n’est pas en vente.")}
              </Notice>
            ) : showPrices && !own && !owned ? (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  {t("J’accepte la licence ")}
                  <Link href="/licenses">{t(p.license)}</Link>{" "}
                  {t("et les conditions de vente.")}
                </span>
              </label>
            ) : null,
          )}
          {owned ? (
            <Link className="button primary full" href="/library">
              {t("Dans vos acquisitions")}
              <FolderOpen size={18} />
            </Link>
          ) : (
          <button
            className="button primary full"
            disabled={
              !showPrices ||
              p.demo ||
              p.price_cents === null ||
              busy ||
              own ||
              !open ||
              (!accepted && !!session.user)
            }
            onClick={buy}
          >
            {t(
              own
                ? "Votre création"
                : !showPrices || p.demo || !open
                  ? "Disponible au lancement"
                  : busy
                    ? "Préparation…"
                    : p.price_cents
                      ? "Obtenir cet agent"
                      : "Ajouter à mes acquisitions",
            )}
            <ArrowUpRight size={18} />
          </button>
          )}
          {offersOpen &&
            (offer ? (
              <MyOfferStatus
                offer={offer}
                licenseAccepted={accepted}
                reload={reloadOffer}
                notify={notify}
              />
            ) : (
              <button
                className="button secondary full mk-offer-button"
                onClick={() => (session.user ? setOffering(true) : signIn())}
              >
                <Gavel size={16} />
                {t("Faire une offre")}
              </button>
            ))}
          <button className="button secondary full" onClick={() => save(p.id)}>
            <Bookmark
              size={17}
              fill={favorites.includes(p.id) ? "currentColor" : "none"}
            />
            {t(
              favorites.includes(p.id)
                ? "Enregistré dans les favoris"
                : "Garder pour plus tard",
            )}
          </button>
          {showPrices && (
            <div className="purchase-note">
              <LockKeyhole size={13} />
              {t(" Accès privé après confirmation du paiement")}
            </div>
          )}
          <dl className="spec-list">
            <div>
              <dt>{t("Environnement")}</dt>
              <dd>{t("Paperclip")}</dd>
            </div>
            <div>
              <dt>{t("Modèle")}</dt>
              <dd>{t(p.engine)}</dd>
            </div>
            <div>
              <dt>{t("Catégorie")}</dt>
              <dd>{t(p.category)}</dd>
            </div>
            <div>
              <dt>{t("Version")}</dt>
              <dd>{t(p.version)}</dd>
            </div>
            <div>
              <dt>{t("Licence")}</dt>
              <dd>{t(p.license)}</dd>
            </div>
          </dl>
          <div className="tag-line">
            {t(
              p.tags.map((tag) => (
                <span key={tag}>{p.demo ? t(tag) : tag}</span>
              )),
            )}
          </div>
          <Link className="subtle-link support-link" href="/support">
            {t("Une question sur ce produit ? ")}
            <ArrowUpRight size={13} />
          </Link>
        </aside>
      </div>
      {offering && (
        <OfferModal
          product={p}
          notify={notify}
          onClose={() => setOffering(false)}
          onDone={() => {
            setOffering(false);
            reloadOffer();
            load();
          }}
        />
      )}
    </>
  );
}
function Creators() {
  const { t, locale } = useI18n();
  const [creators, setCreators] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api("creators")
      .then((d) => setCreators(d.creators))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("LES HUMAINS DERRIÈRE LES AGENTS")}</span>
        <h1>{t("Les bonnes idées ont un visage.")}</h1>
        <p>
          {t(
            "Découvrez les développeurs et studios qui construisent la prochaine génération d’outils.",
          )}
        </p>
      </div>
      {t(error && <Notice error>{t(error)}</Notice>)}
      <div className="creators-grid">
        {t(
          creators.map((c) => (
            <Link
              href={"/creators/" + c.username}
              key={c.username}
              className="creator-card"
            >
              <div className="creator-cover">
                {c.banner_url ? (
                  <img className="mk-cover-photo" src={c.banner_url} alt="" loading="lazy" />
                ) : (
                  <Braces size={40} />
                )}
              </div>
              <Avatar large name={c.display_name} src={c.avatar_url} />
              <h2>{c.display_name}</h2>
              <span className="muted">
                {t("@")}
                {c.username}
              </span>
              <p>
                {c.bio
                  ? c.demo
                    ? t(c.bio)
                    : c.bio
                  : t("Des outils pour transformer les idées en projets.")}
              </p>
              <div>
                <span>
                  {t(c.count)}
                  {t(" création")}
                  {t(c.count > 1 ? "s" : "")}
                  {t(c.demo ? " · Démonstration" : "")}
                </span>
                <ArrowUpRight size={20} />
              </div>
            </Link>
          )),
        )}
      </div>
      {t(
        !creators.length && !error && (
          <Empty icon={Users} title={t("Place aux premiers créateurs.")}>
            {t("Votre studio pourrait ouvrir la voie.")}
          </Empty>
        ),
      )}
      <Link className="button primary" href="/studio">
        {t("Créer mon profil de vendeur ")}
        <ArrowRight size={16} />
      </Link>
    </>
  );
}
type ProfileTab = "posts" | "products" | "photos";
function CreatorProfile({
  name,
  favorites,
  save,
  initial,
  session,
  refresh,
  notify,
}: {
  name: string;
  favorites: string[];
  save: (id: string) => void;
  initial?: InitialData["creator"];
  session: Session;
  refresh: () => Promise<Session>;
  notify: (message: string) => void;
}) {
  const { t, locale } = useI18n();
  type CreatorView = {
    profile: any;
    products: Product[];
    demo?: boolean;
    stats?: CreatorStats | null;
    activity?: MarketEvent[];
    posts?: Post[];
    more_posts?: boolean;
  };
  const [data, setData] = useState<CreatorView | null>(
    (initial as CreatorView | null) ?? null,
  );
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ProfileTab | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    setData((current) =>
      current && current.profile?.username === name ? current : null,
    );
    setError("");
    setTab(null);
    api("creators/" + encodeURIComponent(name))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [name]);
  if (error) return <Notice error>{t(error)}</Notice>;
  if (!data) return <Loading />;
  const owner =
    !data.demo && !!session.user && session.user.id === data.profile.id;
  const posts = data.posts || [];
  // Posts first, as on a social profile; a creator who has not posted yet
  // opens on the listings for visitors.
  const active: ProfileTab = tab ?? (posts.length || owner ? "posts" : "products");
  const setPosts = (update: (posts: Post[]) => Post[]) =>
    setData((d) => d && { ...d, posts: update(d.posts || []) });
  const setPicture = (field: "avatar_url" | "banner_url", url: string | null) => {
    setData((d) => d && { ...d, profile: { ...d.profile, [field]: url } });
    notify(
      field === "avatar_url"
        ? "Photo de profil mise à jour."
        : "Bannière mise à jour.",
    );
    refresh().catch(() => {});
  };
  const website = data.profile.website && (
    <a
      href={data.profile.website}
      target="_blank"
      rel="noreferrer"
      className="button secondary"
    >
      <Globe size={15} />
      {t(" Site du créateur ")}
      <ArrowUpRight size={15} />
    </a>
  );
  const tabButton = (key: ProfileTab, label: string, count?: number) => (
    <button
      type="button"
      role="tab"
      id={"profile-tab-" + key}
      aria-controls={"profile-panel-" + key}
      aria-selected={active === key}
      className={active === key ? "selected" : ""}
      onClick={() => setTab(key)}
    >
      {t(label)}
      {count !== undefined && <span>{t(count)}</span>}
    </button>
  );
  return (
    <>
      <ProfileCover
        profile={data.profile}
        owner={owner}
        onChange={setPicture}
      />
      <div className="public-profile">
        <ProfilePhoto
          profile={data.profile}
          owner={owner}
          onChange={setPicture}
        />
        <div>
          <h1>{data.profile.display_name}</h1>
          <p>
            {t("@")}
            {data.profile.username}
          </p>
        </div>
        {owner ? (
          <div className="mk-profile-actions">
            {website}
            <Link className="button secondary" href="/settings">
              <Pencil size={15} />
              {t(" Modifier le profil")}
            </Link>
          </div>
        ) : (
          t(website)
        )}
      </div>
      <p className="profile-bio">
        {data.profile.bio
          ? data.demo
            ? t(data.profile.bio)
            : data.profile.bio
          : t("Bienvenue dans mon studio. Découvrez mes agents et bundles.")}
      </p>
      {t(
        data.demo && (
          <div className="demo-caption">
            {t("Profil de démonstration · aucune vente active")}
          </div>
        ),
      )}
      {!data.demo && <CreatorMarketStats stats={data.stats ?? null} />}
      <div
        className="workspace-tabs mk-profile-tabs"
        role="tablist"
        aria-label={t("Sections du profil")}
      >
        {tabButton("posts", "Publications")}
        {tabButton("products", "Agents et bundles ", data.products.length)}
        {tabButton("photos", "Photos")}
      </div>
      <div
        role="tabpanel"
        id="profile-panel-posts"
        aria-labelledby="profile-tab-posts"
        hidden={active !== "posts"}
      >
        <ProfileFeed
          profile={data.profile}
          products={data.products}
          posts={posts}
          setPosts={setPosts}
          more={!!data.more_posts}
          setMore={(more) => setData((d) => d && { ...d, more_posts: more })}
          owner={owner}
          moderator={!!session.isAdmin}
          notify={notify}
          onOpen={setPhoto}
          onTab={setTab}
        />
      </div>
      <div
        role="tabpanel"
        id="profile-panel-products"
        aria-labelledby="profile-tab-products"
        hidden={active !== "products"}
      >
        <div className="section-heading">
          <h2>
            {t("Les créations du studio")}{" "}
            <span className="muted">
              {t("(")}
              {t(data.products.length)}
              {t(")")}
            </span>
          </h2>
        </div>
        <div className="product-grid">
          {t(
            data.products.map((p: Product) => (
              <ProductCard
                key={p.id}
                product={p}
                saved={favorites.includes(p.id)}
                onSave={save}
              />
            )),
          )}
        </div>
      </div>
      <div
        role="tabpanel"
        id="profile-panel-photos"
        aria-labelledby="profile-tab-photos"
        hidden={active !== "photos"}
      >
        <section className="panel mk-panel">
          <div className="panel-title">
            <h3>
              <Images size={15} /> {t("Photos")}
            </h3>
          </div>
          <ProfilePhotos posts={posts} onOpen={setPhoto} />
        </section>
      </div>
      {photo && (
        <Modal title="Photo" onClose={() => setPhoto(null)}>
          <img className="mk-lightbox" src={photo} alt="" />
        </Modal>
      )}
      {!data.demo && (
        <section className="panel mk-panel mk-profile-activity">
          <div className="panel-title">
            <h3>
              <Activity size={15} /> {t("Activité du studio")}
            </h3>
          </div>
          <ActivityList events={data.activity || []} showSeller={false} />
        </section>
      )}
    </>
  );
}
