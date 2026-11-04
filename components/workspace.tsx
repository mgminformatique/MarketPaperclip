"use client";
import { useI18n } from "./i18n";
import React, { useEffect, useState } from "react";
import Link from "./navigation-link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  CreditCard,
  Download,
  FileArchive,
  FileCode2,
  FolderOpen,
  Globe,
  Layers3,
  LockKeyhole,
  LogOut,
  Package,
  Plus,
  Rocket,
  Save,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Terminal,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  categories,
  engines,
  money,
  platformFee,
  priceInCents,
  type Product,
} from "../lib/market/model";
import {
  api,
  Avatar,
  Empty,
  Loading,
  Modal,
  Notice,
  usePricesVisible,
} from "./market-ui";
import type { Configuration, Session } from "./marketplace";
import {
  ListingsDesk,
  MyOffers,
  OffersDesk,
  uploadPackage,
} from "./market-desk";
type Props = {
  session: Session;
  signIn: () => void;
  notify: (s: string) => void;
};
const statuses: Record<string, string> = {
  draft: "Brouillon",
  pending: "En validation",
  published: "En ligne",
  rejected: "À corriger",
  archived: "Archivé",
  paid: "Confirmé",
  failed: "Échoué",
  expired: "Expiré",
  refunded: "Remboursé",
  partially_refunded: "Remboursement partiel",
  disputed: "En litige",
};
function Status({ value }: { value: string }) {
  const { t, locale } = useI18n();
  return (
    <span className={"status-pill status-" + value}>
      <i />
      {t(statuses[value] || value)}
    </span>
  );
}
export function Studio({
  session,
  config,
  signIn,
  notify,
}: Props & {
  config: Configuration;
}) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(0);
  const [salesPage, setSalesPage] = useState(0);
  const [data, setData] = useState<any>({
    products: [],
    orders: [],
    seller: null,
    stats: {
      total_products: 0,
      published_products: 0,
      paid_orders: 0,
      net_revenue: 0,
      orders_count: 0,
    },
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("products");
  const [pendingOffers, setPendingOffers] = useState(0);
  const load = () =>
    api("studio?page=" + page + "&salesPage=" + salesPage)
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (!session.user) return;
    api("offers?role=seller")
      .then((d) =>
        setPendingOffers(
          (d.offers as { status: string }[]).filter(
            (o) => o.status === "pending",
          ).length,
        ),
      )
      .catch(() => {});
  }, [session.user?.id]);
  useEffect(() => {
    if (session.user) {
      setLoading(true);
      load().finally(() => setLoading(false));
      if (new URLSearchParams(window.location.search).has("connect"))
        api("connect/status", {})
          .then(load)
          .catch((e) => notify(e.message));
    }
  }, [session.user?.id, page, salesPage]);
  async function connect(dashboard = false) {
    if (!session.user) {
      signIn();
      return;
    }
    setBusy(true);
    try {
      const d = await api(
        "connect/" + (dashboard ? "dashboard" : "onboard"),
        {},
      );
      window.location.assign(d.url);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const paid = data.orders.filter((o: any) => o.status === "paid");
  const revenue = data.stats.net_revenue;
  const connected =
    !!data.seller?.charges_enabled && !!data.seller?.payouts_enabled;
  return (
    <>
      <div className="page-kicker">
        <span>{t("VOTRE ESPACE DE CRÉATION")}</span>
        <span className="live-label">
          <i />
          {t(session.user ? "Studio personnel" : "Découvrez le studio")}
        </span>
      </div>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">{t("HELLO, BUILDER.")}</span>
          <h1>
            {t(
              session.profile
                ? "Bienvenue, " + session.profile.display_name + "."
                : "Vous construisez. Le monde découvre.",
            )}
          </h1>
          <p>
            {t(
              "Tout ce qu’il vous faut pour transformer vos agents en produits.",
            )}
          </p>
        </div>
        <Link className="button primary" href="/studio/new">
          <Plus size={17} />
          {t(" Nouveau produit")}
        </Link>
      </div>
      {t(
        !session.user && (
          <div className="studio-onboarding">
            <div className="onboarding-icon">
              <Terminal size={30} />
            </div>
            <div>
              <h3>{t("Votre prochain projet mérite son propre studio.")}</h3>
              <p>
                {t(
                  "Créez votre profil, publiez vos agents et retrouvez toutes vos ventes ici.",
                )}
              </p>
            </div>
            <button className="button secondary" onClick={signIn}>
              {t("Créer mon compte ")}
              <ArrowUpRight size={16} />
            </button>
          </div>
        ),
      )}
      {t(error && <Notice error>{t(error)}</Notice>)}
      <div className="metric-grid">
        <Metric
          icon={Wallet}
          title={t("Revenus nets des commandes")}
          value={money(revenue, locale)}
          note="Après commission · hors ajustements Stripe"
        />
        <Metric
          icon={ShoppingBag}
          title={t("Ventes confirmées")}
          value={String(data.stats.paid_orders)}
          note="Commandes disponibles dans votre historique"
        />
        <Metric
          icon={Package}
          title={t("Produits en ligne")}
          value={String(data.stats.published_products)}
          note={`${data.stats.total_products} produit${data.stats.total_products > 1 ? "s" : ""} dans votre studio`}
        />
        <Metric
          icon={Users}
          title={t("Votre vitrine")}
          value={session.profile ? "@" + session.profile.username : "À créer"}
          note="Votre identité dans le marketplace"
        />
      </div>
      <div className="studio-columns">
        <section className="panel">
          <div className="panel-title">
            <div className="workspace-tabs">
              <button
                className={tab === "products" ? "selected" : ""}
                onClick={() => setTab("products")}
              >
                {t("Mes créations ")}
                <span>{t(data.stats.total_products)}</span>
              </button>
              <button
                className={tab === "sales" ? "selected" : ""}
                onClick={() => setTab("sales")}
              >
                {t("Transactions")}
              </button>
              <button
                className={tab === "offers" ? "selected" : ""}
                onClick={() => setTab("offers")}
              >
                {t("Offres ")}
                {pendingOffers > 0 && <span>{pendingOffers}</span>}
              </button>
            </div>
            {t(
              session.profile && (
                <Link
                  className="subtle-link"
                  href={"/creators/" + session.profile.username}
                >
                  {t("Voir ma vitrine ")}
                  <ArrowUpRight size={14} />
                </Link>
              ),
            )}
          </div>
          {t(
            loading ? (
              <Loading />
            ) : tab === "offers" ? (
              session.user ? (
                <OffersDesk notify={notify} onCount={setPendingOffers} />
              ) : (
                <Empty icon={Users} title={t("Vos offres, au même endroit.")}>
                  {t("Connectez-vous pour répondre aux offres des acheteurs.")}
                </Empty>
              )
            ) : tab === "products" ? (
              data.products.length ? (
                <div className="data-table">
                  <div className="table-head">
                    <span>{t("PRODUIT")}</span>
                    <span>{t("STATUT")}</span>
                    <span>{t("PRIX")}</span>
                    <span />
                  </div>
                  {t(
                    data.products.map((p: any) => (
                      <div className="table-row" key={p.id}>
                        <div className="table-product">
                          <span className="table-icon">
                            {t(
                              p.kind === "bundle" ? (
                                <Layers3 size={20} />
                              ) : (
                                <Code2 size={20} />
                              ),
                            )}
                          </span>
                          <div>
                            <strong>{p.title}</strong>
                            <small>
                              {t("v")}
                              {t(p.version)}
                              {t(" ·")}{" "}
                              {t(
                                p.kind === "bundle"
                                  ? `${p.agent_count} agents`
                                  : "Agent individuel",
                              )}
                            </small>
                          </div>
                        </div>
                        <Status value={p.status} />
                        <span>{t(money(p.price_cents, locale))}</span>
                        <Link
                          className="icon-button"
                          href={"/studio/" + p.id}
                          aria-label={t("Modifier " + p.title)}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      </div>
                    )),
                  )}
                </div>
              ) : (
                <Empty
                  icon={Package}
                  title={t("Votre premier agent attend sa scène.")}
                  action={
                    <Link className="button primary" href="/studio/new">
                      <Plus size={16} />
                      {t(" Créer mon premier produit")}
                    </Link>
                  }
                >
                  {t(
                    "Un bon nom, une documentation claire et votre package. Le reste commence ici.",
                  )}
                </Empty>
              )
            ) : data.orders.length ? (
              <div className="data-table">
                <div className="table-head">
                  <span>{t("COMMANDE")}</span>
                  <span>{t("STATUT")}</span>
                  <span>{t("NET")}</span>
                  <span />
                </div>
                {t(
                  data.orders.map((o: any) => (
                    <div className="table-row" key={o.id}>
                      <div>
                        <strong>{o.product_title}</strong>
                        <small>
                          {t(o.id.slice(0, 8))}
                          {t(" ·")}{" "}
                          {t(
                            new Date(o.created_at).toLocaleDateString(
                              locale === "en" ? "en-CA" : "fr-CA",
                            ),
                          )}
                        </small>
                      </div>
                      <Status value={o.status} />
                      <span>
                        {t(money(o.amount_cents - o.fee_cents, locale))}
                      </span>
                      <span />
                    </div>
                  )),
                )}
              </div>
            ) : (
              <Empty
                icon={BarChart3}
                title={t("Vos premières ventes, bientôt ici.")}
              >
                {t(
                  "Chaque transaction apparaîtra avec son statut et son montant après commission.",
                )}
              </Empty>
            ),
          )}
          {t(
            tab !== "offers" &&
              (tab === "products"
                ? data.stats.total_products
                : data.stats.orders_count) > 12 && (
              <div className="pagination">
                <button
                  className="button secondary small"
                  disabled={(tab === "products" ? page : salesPage) === 0}
                  onClick={() =>
                    tab === "products"
                      ? setPage(page - 1)
                      : setSalesPage(salesPage - 1)
                  }
                >
                  {t("Précédent")}
                </button>
                <span>{t((tab === "products" ? page : salesPage) + 1)}</span>
                <button
                  className="button secondary small"
                  disabled={
                    ((tab === "products" ? page : salesPage) + 1) * 12 >=
                    (tab === "products"
                      ? data.stats.total_products
                      : data.stats.orders_count)
                  }
                  onClick={() =>
                    tab === "products"
                      ? setPage(page + 1)
                      : setSalesPage(salesPage + 1)
                  }
                >
                  {t("Suivant")}
                </button>
              </div>
            ),
          )}
        </section>
        <aside className="studio-aside">
          <section className="panel setup-panel">
            <div className="panel-title">
              <h3>{t("Prêt à décoller ?")}</h3>
              <Rocket size={18} />
            </div>
            <div className="setup-step">
              <span className={session.user ? "complete" : ""}>
                {t(session.user ? <Check size={14} /> : 1)}
              </span>
              <div>
                <strong>{t("Créez votre identité")}</strong>
                <small>{t("Un profil que les développeurs retiennent.")}</small>
                <Link href="/settings">
                  {t("Personnaliser mon profil ")}
                  <ArrowUpRight size={12} />
                </Link>
              </div>
            </div>
            <div className="setup-step">
              <span className={connected ? "complete" : ""}>
                {t(connected ? <Check size={14} /> : 2)}
              </span>
              <div>
                <strong>{t("Activez vos versements")}</strong>
                <small>
                  {t("Connectez votre compte vendeur avec Stripe.")}
                </small>
                <button onClick={() => connect()} disabled={busy}>
                  {t(
                    connected
                      ? "Mettre à jour mon compte"
                      : "Configurer les paiements",
                  )}{" "}
                  <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
            <div className="setup-step">
              <span className={data.products.length ? "complete" : ""}>
                {t(data.products.length ? <Check size={14} /> : 3)}
              </span>
              <div>
                <strong>{t("Publiez votre première création")}</strong>
                <small>{t("Un agent ou un bundle. À vous de jouer.")}</small>
                <Link href="/studio/new">
                  {t("Ouvrir l’éditeur ")}
                  <ArrowUpRight size={12} />
                </Link>
              </div>
            </div>
          </section>
          <section className="panel payout-card">
            <CreditCard size={24} />
            <h3>{t("Vos revenus. Votre contrôle.")}</h3>
            <p>
              {t(
                "Consultez vos versements et vos coordonnées bancaires dans votre espace Stripe.",
              )}
            </p>
            <button
              className="button secondary full small"
              onClick={() => connect(connected)}
              disabled={busy}
            >
              {t(
                connected
                  ? "Ouvrir mon espace Stripe"
                  : "Activer mon compte vendeur",
              )}
              <ArrowUpRight size={14} />
            </button>
            <small>
              {t(
                connected
                  ? "Compte vendeur actif"
                  : config.feeBps === null
                    ? "Commission affichée avant l’ouverture des ventes"
                    : `Commission du marketplace : ${config.feeBps / 100} %`,
              )}
            </small>
          </section>
        </aside>
      </div>
      {session.user && (
        <ListingsDesk products={data.products} notify={notify} reload={load} />
      )}
      <section className="studio-tip">
        <BookOpen size={23} />
        <div>
          <h3>
            {t("Les bons produits commencent par une bonne documentation.")}
          </h3>
          <p>
            {t(
              "Préparez un README, expliquez les permissions et montrez ce que votre agent sait faire.",
            )}
          </p>
        </div>
        <Link href="/docs" className="subtle-link">
          {t("Lire le guide ")}
          <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}
function Metric({
  icon: Icon,
  title,
  value,
  note,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  note: string;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="metric">
      <div>
        <span>{t(title)}</span>
        <Icon size={18} />
      </div>
      <strong>{t(value)}</strong>
      <small>{t(note)}</small>
    </div>
  );
}
const emptyProduct = {
  title: "",
  tagline: "",
  description: "",
  category: categories[0] as string,
  kind: "agent",
  engine: "Claude",
  version: "1.0.0",
  price_cents: null as number | null,
  currency: "cad",
  license: "Commerciale — usage individuel",
  tags: [] as string[],
  requirements:
    "Paperclip, Node.js 22 ou supérieur et une clé API du fournisseur de modèle.",
  setup: "",
  agent_count: 1,
  status: "draft",
};
export function ProductEditor({
  session,
  config,
  signIn,
  notify,
  id,
}: Props & {
  config: Configuration;
  id: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const showPrices = usePricesVisible();
  const [form, setForm] = useState(() => ({
    ...emptyProduct,
    requirements: t(emptyProduct.requirements),
  }));
  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState(id === "new" ? "" : id);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existingFile, setExistingFile] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(id !== "new");
  const [error, setError] = useState("");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("");
  const [priceEdited, setPriceEdited] = useState(false);
  const [dirty, setDirty] = useState(false);
  // The moderator's note when a submission was sent back for changes.
  const [note, setNote] = useState("");
  const set = (key: string, v: any) => {
    setForm((f) => ({ ...f, [key]: v }));
    setDirty(true);
  };
  useEffect(() => {
    if (id === "new") {
      try {
        const draft = JSON.parse(
          localStorage.getItem("mp-draft-" + (session.user?.id || "visitor")) ||
            "null",
        );
        if (draft) {
          setForm({ ...emptyProduct, ...draft });
          setTags((draft.tags || []).join(", "));
          setPrice(
            typeof draft.price_cents === "number"
              ? String(draft.price_cents / 100)
              : "",
          );
          setPriceEdited(true);
        }
      } catch {}
      return;
    }
    if (!session.user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api("studio/" + id)
      .then((d) => {
        const p = d.product;
        if (!p) throw new Error("Produit introuvable dans votre studio.");
        const clean = { ...emptyProduct };
        for (const k of Object.keys(clean)) (clean as any)[k] = p[k];
        clean.status = "draft";
        setForm(clean);
        setCoverPreview(p.cover_url || "");
        setTags(p.tags.join(", "));
        setPrice(String(p.price_cents / 100));
        setPriceEdited(true);
        const f = Array.isArray(p.product_files)
          ? p.product_files[0]
          : p.product_files;
        setExistingFile(f?.original_name || "");
        setNote(p.status === "rejected" ? p.moderation_note || "" : "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, session.user?.id]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const payload = () => ({
    ...form,
    price_cents: priceInCents(price),
    tags: tags
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    agent_count: form.kind === "agent" ? 1 : Number(form.agent_count),
  });
  async function submit(publish = false) {
    setError("");
    if (!session.user) {
      try {
        localStorage.setItem("mp-draft-visitor", JSON.stringify(payload()));
        notify(
          "Brouillon conservé sur cet appareil. Connectez-vous pour le publier.",
        );
      } catch {}
      signIn();
      return;
    }
    if (priceInCents(price) === null) {
      setStep(2);
      setError(
        "Choisissez votre prix avant d’enregistrer. Saisissez 0 pour proposer un produit gratuit.",
      );
      return;
    }
    setBusy(true);
    try {
      let pid = productId;
      const b = payload();
      if (!pid) {
        const d = await api("products", { ...b, status: "draft" });
        pid = d.product.id;
        setProductId(pid);
      } else await api("products/" + pid, { ...b, status: "draft" }, "PATCH");
      if (coverFile) {
        const fd = new FormData();
        fd.append("file", coverFile);
        const img = await api("products/" + pid + "/cover", fd);
        setCoverPreview(img.url);
        setCoverFile(null);
      }
      if (file) {
        await uploadPackage(pid, file);
        setExistingFile(file.name);
        setFile(null);
      }
      if (publish) {
        await api("products/" + pid, { ...b, status: "pending" }, "PATCH");
        notify("Votre produit a été envoyé en validation.");
      } else notify("Brouillon enregistré.");
      setDirty(false);
      localStorage.removeItem("mp-draft-" + (session.user?.id || "visitor"));
      if (publish) router.push("/studio");
      else if (id === "new") router.replace("/studio/" + pid);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  const cents = priceInCents(price);
  const fee =
    config.feeBps !== null &&
    cents !== null &&
    Number.isSafeInteger(cents) &&
    cents >= 0 &&
    cents <= 1000000
      ? platformFee(cents, config.feeBps)
      : null;
  return (
    <>
      <Link href="/studio" className="back-link">
        <ArrowLeft size={15} />
        {t(" Retour au studio")}
      </Link>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">{t("DU CODE AU PRODUIT")}</span>
          <h1>
            {t(
              id === "new"
                ? "Votre prochaine création."
                : "Peaufinez votre création.",
            )}
          </h1>
          <p>
            {t(
              "Donnez aux développeurs toutes les raisons de choisir votre agent.",
            )}
          </p>
        </div>
        <span className="pill">
          {t(productId ? "Brouillon enregistré" : "Nouveau produit")}
        </span>
      </div>
      <div className="editor-steps">
        {t(
          ["La création", "Le package", "Le lancement"].map((label, i) => (
            <button
              key={label}
              className={step === i ? "current" : step > i ? "done" : ""}
              onClick={() => setStep(i)}
            >
              <span>
                {t(
                  step > i ? (
                    <Check size={15} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  ),
                )}
              </span>
              {t(label)}
              <ChevronRight size={16} />
            </button>
          )),
        )}
      </div>
      {t(error && <Notice error>{t(error)}</Notice>)}
      {note && (
        <Notice error>
          {t("Correction demandée par la modération : ")}
          {note}
        </Notice>
      )}
      <div className="editor-layout">
        <section className="panel editor-form">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 2) setStep(step + 1);
              else submit(true);
            }}
          >
            {t(
              step === 0 ? (
                <>
                  <h2>{t("Présentez votre création.")}</h2>
                  <p className="muted">
                    {t("Les bons détails font les bons premiers contacts.")}
                  </p>
                  <div className="kind-choice">
                    <button
                      type="button"
                      className={form.kind === "agent" ? "selected" : ""}
                      onClick={() => set("kind", "agent")}
                    >
                      <Code2 size={25} />
                      <strong>{t("Un agent")}</strong>
                      <span>{t("Un spécialiste. Une mission claire.")}</span>
                    </button>
                    <button
                      type="button"
                      className={form.kind === "bundle" ? "selected" : ""}
                      onClick={() => {
                        set("kind", "bundle");
                        if (!priceEdited) setPrice("");
                      }}
                    >
                      <Layers3 size={25} />
                      <strong>{t("Un bundle")}</strong>
                      <span>{t("Une équipe qui travaille ensemble.")}</span>
                    </button>
                  </div>
                  <div className="form-stack">
                    <label>
                      {t("Couverture du produit")}{" "}
                      <small>
                        {t("Image publique · JPG, PNG ou WebP · 3 Mo maximum")}
                      </small>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 3145728) {
                            setError("La couverture dépasse 3 Mo.");
                            return;
                          }
                          if (coverPreview.startsWith("blob:"))
                            URL.revokeObjectURL(coverPreview);
                          setCoverFile(f);
                          setCoverPreview(URL.createObjectURL(f));
                          setDirty(true);
                        }}
                      />
                    </label>
                    <label>
                      {t("Nom du produit ")}
                      <span>{t("*")}</span>
                      <input
                        required
                        minLength={3}
                        maxLength={80}
                        value={form.title}
                        onChange={(e) => set("title", e.target.value)}
                        placeholder={t("Ex. Code Pilot")}
                      />
                    </label>
                    <label>
                      {t("Votre promesse, en une phrase ")}
                      <span>{t("*")}</span>
                      <input
                        required
                        minLength={15}
                        maxLength={160}
                        value={form.tagline}
                        onChange={(e) => set("tagline", e.target.value)}
                        placeholder={t(
                          "Qu’est-ce que votre agent aide à accomplir ?",
                        )}
                      />
                      <small>
                        {t(form.tagline.length)}
                        {t("/160 caractères")}
                      </small>
                    </label>
                    <label>
                      {t("Description complète ")}
                      <span>{t("*")}</span>
                      <textarea
                        required
                        minLength={80}
                        maxLength={20000}
                        rows={7}
                        value={form.description}
                        onChange={(e) => set("description", e.target.value)}
                        placeholder={t(
                          "Expliquez le problème, les capacités de l’agent, ses limites et un exemple d’utilisation concret.",
                        )}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        {t("Catégorie")}
                        <select
                          value={form.category}
                          onChange={(e) => set("category", e.target.value)}
                        >
                          {t(
                            categories.map((x) => (
                              <option key={x} value={x}>
                                {t(x)}
                              </option>
                            )),
                          )}
                        </select>
                      </label>
                      <label>
                        {t("Modèle principal")}
                        <select
                          value={form.engine}
                          onChange={(e) => set("engine", e.target.value)}
                        >
                          {t(
                            engines.map((x) => (
                              <option key={x} value={x}>
                                {t(x)}
                              </option>
                            )),
                          )}
                        </select>
                      </label>
                    </div>
                    <label>
                      {t("Tags ")}
                      <small>{t("Séparés par des virgules · 8 maximum")}</small>
                      <input
                        value={tags}
                        onChange={(e) => {
                          setTags(e.target.value);
                          setDirty(true);
                        }}
                        placeholder={t("TypeScript, GitHub, Automatisation")}
                      />
                    </label>
                    {t(
                      form.kind === "bundle" && (
                        <label>
                          {t("Nombre d’agents inclus")}
                          <input
                            type="number"
                            min={2}
                            max={1000}
                            required
                            value={form.agent_count}
                            onChange={(e) =>
                              set("agent_count", Number(e.target.value))
                            }
                          />
                        </label>
                      ),
                    )}
                  </div>
                </>
              ) : step === 1 ? (
                <>
                  <h2>{t("Ce que l’acheteur reçoit.")}</h2>
                  <p className="muted">
                    {t(
                      "Un package complet, une installation compréhensible et des permissions explicites.",
                    )}
                  </p>
                  <div className="upload-zone">
                    <Upload size={31} />
                    <h3>
                      {t(
                        file
                          ? file.name
                          : existingFile || "Ajoutez votre package",
                      )}
                    </h3>
                    <p>{t("ZIP ou manifeste JSON · 20 Mo maximum")}</p>
                    <label className="button secondary">
                      {t(
                        file || existingFile
                          ? "Changer le fichier"
                          : "Choisir un fichier",
                      )}
                      <input
                        type="file"
                        accept=".zip,.json,application/zip,application/json"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f && f.size > 20971520) {
                            setError("Le fichier dépasse 20 Mo.");
                            return;
                          }
                          setFile(f || null);
                          setDirty(true);
                        }}
                      />
                    </label>
                    {t(
                      file && (
                        <small>
                          {t((file.size / 1024 / 1024).toFixed(2))}
                          {t(" Mo · prêt à transférer")}
                        </small>
                      ),
                    )}
                  </div>
                  <div className="form-stack">
                    <label>
                      {t("Version du package")}
                      <input
                        required
                        pattern="[0-9]+\.[0-9]+\.[0-9]+"
                        value={form.version}
                        onChange={(e) => set("version", e.target.value)}
                        placeholder={t("1.0.0")}
                      />
                    </label>
                    <label>
                      {t("Prérequis et permissions")}
                      <textarea
                        required
                        minLength={10}
                        maxLength={3000}
                        rows={4}
                        value={form.requirements}
                        onChange={(e) => set("requirements", e.target.value)}
                        placeholder={t(
                          "Versions requises, clés API, accès réseau, budget indicatif…",
                        )}
                      />
                    </label>
                    <label>
                      {t("Instructions d’installation")}
                      <textarea
                        required
                        minLength={20}
                        maxLength={10000}
                        rows={7}
                        value={form.setup}
                        onChange={(e) => set("setup", e.target.value)}
                        placeholder={t(
                          "1. Décompressez le package…\\n2. Configurez votre environnement…",
                        )}
                      />
                    </label>
                  </div>
                  <div className="info-callout">
                    <LockKeyhole size={18} />
                    {t(
                      " Le package reste privé. Les acheteurs pourront télécharger la version achetée après confirmation de leur commande.",
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h2>{t("Prêt pour son premier utilisateur.")}</h2>
                  <p className="muted">
                    {t(
                      "Choisissez votre prix et précisez les droits accordés à l’acheteur.",
                    )}
                  </p>
                  <div className="form-stack">
                    <label>
                      {t("Prix de vente (CAD)")}
                      <div className="price-input">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="10000"
                          required
                          placeholder={t("Votre prix")}
                          value={price}
                          onChange={(e) => {
                            setPrice(e.target.value);
                            setPriceEdited(true);
                            setDirty(true);
                          }}
                        />
                        <span>{t("$ CAD")}</span>
                      </div>
                      <small>
                        {t("0 $ pour un agent gratuit. Paiement unique.")}
                      </small>
                    </label>
                    <label>
                      {t("Licence")}
                      <select
                        value={form.license}
                        onChange={(e) => set("license", e.target.value)}
                      >
                        {t(
                          [
                            "Commerciale — usage individuel",
                            "Commerciale — équipe",
                            "MIT",
                            "Apache-2.0",
                          ].map((x) => (
                            <option key={x} value={x}>
                              {t(x)}
                            </option>
                          )),
                        )}
                      </select>
                      <Link
                        href="/licenses"
                        className="subtle-link"
                        target="_blank"
                      >
                        {t("Comprendre les licences ")}
                        <ArrowUpRight size={12} />
                      </Link>
                    </label>
                  </div>
                  <div className="payout-preview">
                    <div>
                      <span>{t("Prix du produit")}</span>
                      <strong>
                        {cents === null
                          ? t("Votre prix")
                          : money(cents, locale)}
                      </strong>
                    </div>
                    <div>
                      <span>
                        {t("Commission MarketPaperclip")}{" "}
                        {t(
                          config.feeBps !== null
                            ? `(${config.feeBps / 100} %)`
                            : "",
                        )}
                      </span>
                      <span>
                        {t(
                          cents === null
                            ? "—"
                            : fee === null
                              ? "À configurer"
                              : money(fee, locale),
                        )}
                      </span>
                    </div>
                    <div>
                      <strong>{t("Votre part estimée")}</strong>
                      <strong className="lime">
                        {t(
                          fee === null || cents === null
                            ? "—"
                            : money(cents - fee, locale),
                        )}
                      </strong>
                    </div>
                    <small>
                      {t(
                        "Hors taxes et ajustements éventuels. Le montant définitif dépend du paiement confirmé.",
                      )}
                    </small>
                  </div>
                  <label className="checkbox-label">
                    <input type="checkbox" required />
                    <span>
                      {t(
                        "Je possède les droits nécessaires pour distribuer ce package. Il ne contient aucun secret et sa documentation décrit les accès demandés.",
                      )}
                    </span>
                  </label>
                  <Notice>
                    {t(
                      "Chaque publication est vérifiée avant son apparition dans le catalogue. Vous pourrez suivre son statut dans votre studio.",
                    )}
                  </Notice>
                </>
              ),
            )}
            <div className="editor-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => submit(false)}
              >
                <Save size={15} />
                {t(" Enregistrer")}
              </button>
              <button className="button primary" disabled={busy}>
                {t(
                  busy
                    ? "Enregistrement…"
                    : step < 2
                      ? "Continuer"
                      : "Soumettre à la validation",
                )}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </section>
        <aside className="editor-aside">
          <span className="eyebrow">{t("APERÇU DE VOTRE CRÉATION")}</span>
          <div className="editor-preview">
            <div className="editor-preview-art">
              {t(
                coverPreview ? (
                  <img
                    src={coverPreview}
                    alt={t("Aperçu de la couverture du produit")}
                  />
                ) : form.kind === "bundle" ? (
                  <Layers3 size={60} />
                ) : (
                  <Code2 size={60} />
                ),
              )}
              <span>{t(form.engine)}</span>
            </div>
            <div>
              <small>
                {session.profile?.display_name || t("Votre studio")}
              </small>
              <h2>{form.title || t("Le nom de votre agent")}</h2>
              <p>
                {form.tagline ||
                  t(
                    "Votre promesse, claire et directe. Donnez envie de découvrir ce que vous avez construit.",
                  )}
              </p>
              <div className="tag-line">
                {t(
                  tags
                    .split(",")
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((x) => <span key={x}>{x}</span>),
                )}
              </div>
              {showPrices && (
                <strong>
                  {cents === null ? (
                    t("Votre prix")
                  ) : (
                    money(cents, locale)
                  )}
                </strong>
              )}
            </div>
          </div>
          <div className="editor-advice">
            <SparkAdvice />
            <h3>{t("Un package qui inspire confiance.")}</h3>
            <ul>
              <li>{t("Un README utile, dès la première ligne.")}</li>
              <li>{t("Des prérequis précis et reproductibles.")}</li>
              <li>{t("Aucune clé API ni donnée personnelle.")}</li>
              <li>{t("Des exemples et une licence explicite.")}</li>
            </ul>
            <Link href="/docs" className="subtle-link">
              {t("Le guide du créateur ")}
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
function SparkAdvice() {
  const { t, locale } = useI18n();
  return <Terminal size={25} />;
}
export function Library({ session, signIn, notify }: Props) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<any>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (!session.user) return;
    let active = true;
    const load = () =>
      api("orders?page=" + page)
        .then((d) => {
          if (active) {
            setOrders(d.orders);
            setTotal(d.total);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    setLoading(true);
    load();
    let timer: ReturnType<typeof setInterval> | undefined;
    let n = 0;
    if (
      new URLSearchParams(window.location.search).get("payment") ===
      "processing"
    ) {
      timer = setInterval(() => {
        if (++n > 12) {
          clearInterval(timer);
          return;
        }
        load();
      }, 5000);
    }
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [session.user?.id, page]);
  async function download(o: any) {
    setBusy(o.id);
    try {
      const d = await api("orders/" + o.id + "/download", {});
      window.location.assign(d.url);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function sendReview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy("review");
    try {
      await api("reviews", {
        product_id: review.product_id,
        rating: Number(f.get("rating")),
        body: f.get("body"),
      });
      setReview(null);
      notify("Merci, votre avis a été publié.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("VOTRE NOUVELLE BOÎTE À OUTILS")}</span>
        <h1>{t("Les possibilités vous appartiennent.")}</h1>
        <p>
          {t(
            "Vos agents, vos versions et votre historique d’achat. Tout est ici.",
          )}
        </p>
      </div>
      {t(
        !session.user ? (
          <Empty
            icon={FolderOpen}
            title={t("Vos agents vous attendent.")}
            action={
              <button className="button primary" onClick={signIn}>
                {t("Me connecter ")}
                <ArrowRight size={16} />
              </button>
            }
          >
            {t(
              "Connectez-vous pour retrouver vos acquisitions et télécharger vos fichiers.",
            )}
          </Empty>
        ) : loading ? (
          <Loading />
        ) : (
          <>
            {t(error && <Notice error>{t(error)}</Notice>)}
            <MyOffers notify={notify} />
            {t(
              orders.some((o) => o.status === "pending") && (
                <Notice>
                  {t(
                    "Une commande attend la confirmation du paiement. Un retour de Stripe ne suffit pas à confirmer un achat; le statut se mettra à jour après vérification.",
                  )}
                </Notice>
              ),
            )}
            {t(
              orders.length ? (
                <div className="orders-list">
                  {t(
                    orders.map((o) => (
                      <article key={o.id} className="order-card">
                        <span className="order-icon">
                          <Package size={29} />
                        </span>
                        <div>
                          <span className="eyebrow">
                            {t("COMMANDE ")}
                            {t(o.id.slice(0, 8))}
                          </span>
                          <h2>{o.product_title}</h2>
                          <p>
                            {t("v")}
                            {t(o.product_version)}
                            {t(" · ")}
                            {t(o.license)}
                          </p>
                          <small>
                            {t(
                              new Date(o.created_at).toLocaleDateString(
                                locale === "en" ? "en-CA" : "fr-CA",
                              ),
                            )}
                            {t(" ·")}{" "}
                            {t(money(o.total_cents ?? o.amount_cents, locale))}
                          </small>
                        </div>
                        <div className="order-actions">
                          <Status value={o.status} />
                          <button
                            className="button primary small"
                            disabled={o.status !== "paid" || busy === o.id}
                            onClick={() => download(o)}
                          >
                            <Download size={15} />
                            {t(" Télécharger")}
                          </button>
                          {t(
                            o.status === "paid" && (
                              <button
                                className="text-button"
                                onClick={() => setReview(o)}
                              >
                                {t("Donner mon avis")}
                              </button>
                            ),
                          )}
                          <Link
                            href={"/support?order=" + o.id}
                            className="subtle-link"
                          >
                            {t("Besoin d’aide ?")}
                          </Link>
                        </div>
                      </article>
                    )),
                  )}
                </div>
              ) : (
                <Empty
                  icon={ShoppingBag}
                  title={t("Le début de votre collection.")}
                  action={
                    <Link className="button primary" href="/agents">
                      {t("Découvrir les agents ")}
                      <ArrowRight size={16} />
                    </Link>
                  }
                >
                  {t(
                    "Vos achats confirmés et vos agents gratuits apparaîtront ici.",
                  )}
                </Empty>
              ),
            )}
            {t(
              total > 20 && (
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
                    {t(Math.ceil(total / 20))}
                  </span>
                  <button
                    className="button secondary small"
                    disabled={(page + 1) * 20 >= total}
                    onClick={() => setPage(page + 1)}
                  >
                    {t("Suivant")}
                  </button>
                </div>
              ),
            )}
          </>
        ),
      )}
      {t(
        review && (
          <Modal
            title={t("Votre expérience avec " + review.product_title)}
            onClose={() => setReview(null)}
          >
            <form className="form-stack" onSubmit={sendReview}>
              <label>
                {t("Votre note")}
                <select name="rating" defaultValue="5">
                  {t(
                    [5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {t(n)}
                        {t(" / 5")}
                      </option>
                    )),
                  )}
                </select>
              </label>
              <label>
                {t("Votre avis")}
                <textarea
                  name="body"
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  placeholder={t(
                    "Ce qui vous a aidé, ce qui pourrait être amélioré…",
                  )}
                />
              </label>
              <button disabled={busy === "review"} className="button primary">
                {t("Publier mon avis")}
              </button>
            </form>
          </Modal>
        ),
      )}
    </>
  );
}
export function SettingsPage({
  session,
  refresh,
  signIn,
  notify,
}: Props & {
  refresh: () => Promise<Session>;
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        "profile",
        Object.fromEntries(new FormData(e.currentTarget)),
        "PATCH",
      );
      await refresh();
      notify("Profil mis à jour.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function password(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = e.currentTarget;
    try {
      await api("auth/password", Object.fromEntries(new FormData(f)));
      f.reset();
      notify("Mot de passe mis à jour.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!session.user)
    return (
      <Empty
        icon={Settings2}
        title={t("Un profil à votre image.")}
        action={
          <button className="button primary" onClick={signIn}>
            {t("Me connecter")}
          </button>
        }
      >
        {t(
          "Connectez-vous pour personnaliser votre identité et gérer votre compte.",
        )}
      </Empty>
    );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("VOTRE IDENTITÉ")}</span>
        <h1>{t("Faites bonne impression.")}</h1>
        <p>{t("Ce profil est votre signature dans le marketplace.")}</p>
      </div>
      {t(error && <Notice error>{t(error)}</Notice>)}
      <div className="settings-layout">
        <form
          className="panel form-stack"
          onSubmit={save}
          key={session.profile?.username}
        >
          <div className="settings-profile">
            <Avatar
              name={session.profile?.display_name || "Dev"}
              src={session.profile?.avatar_url}
              large
            />
            <div>
              <h2>{t("Profil public")}</h2>
              <p>{t(session.user.email)}</p>
              {session.profile?.username && (
                <Link
                  className="subtle-link"
                  href={"/creators/" + session.profile.username}
                >
                  {t("Photo, bannière et publications : voir mon profil ")}
                  <ArrowUpRight size={13} />
                </Link>
              )}
            </div>
          </div>
          <label>
            {t("Nom public")}
            <input
              name="display_name"
              defaultValue={session.profile?.display_name}
              required
              minLength={2}
              maxLength={60}
            />
          </label>
          <label>
            {t("Nom de profil")}
            <input
              name="username"
              defaultValue={session.profile?.username}
              required
              pattern="[a-z0-9][a-z0-9_\-]{2,29}"
            />
            <small>
              {t(
                "Lettres minuscules, chiffres, tirets. Votre adresse : /creators/votre-nom",
              )}
            </small>
          </label>
          <label>
            {t("Votre bio")}
            <textarea
              name="bio"
              defaultValue={session.profile?.bio}
              maxLength={600}
              rows={4}
              placeholder={t("Ce que vous construisez. Ce qui vous anime.")}
            />
          </label>
          <label>
            {t("Site web")}
            <input
              name="website"
              type="url"
              defaultValue={session.profile?.website}
              placeholder={t("https://votre-studio.dev")}
            />
          </label>
          <button className="button primary" disabled={busy}>
            <Save size={16} />
            {t(" Enregistrer le profil")}
          </button>
        </form>
        <div>
          <form className="panel form-stack" onSubmit={password}>
            <h2>{t("Sécurité du compte")}</h2>
            <p className="muted">
              {t("Choisissez un mot de passe unique d’au moins 12 caractères.")}
            </p>
            <label>
              {t("Nouveau mot de passe")}
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <button disabled={busy} className="button secondary">
              {t("Changer mon mot de passe")}
            </button>
          </form>
          <section className="panel account-actions">
            <h3>{t("Session actuelle")}</h3>
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("auth/logout", {});
                  await refresh();
                  notify("Vous êtes déconnecté.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={16} />
              {t(" Me déconnecter")}
            </button>
            <p>
              {t(
                "Pour une demande d’accès ou de suppression de vos données, utilisez ",
              )}
              <Link href="/support">{t("l’assistance")}</Link>
              {t(".")}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
export function Moderation({
  session,
  notify,
}: {
  session: Session;
  notify: (s: string) => void;
}) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refund, setRefund] = useState<any>(null);
  const load = () =>
    api("admin/queue")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (session.isAdmin) load();
  }, [session.isAdmin]);
  async function moderate(id: string, status: string, note: string) {
    setBusy(true);
    try {
      await api("admin/moderate", {
        product_id: id,
        status,
        note,
        expected_updated_at: data.products.find((p: any) => p.id === id)
          ?.updated_at,
      });
      notify("Décision enregistrée.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!session.isAdmin)
    return (
      <Empty icon={ShieldCheck} title={t("Espace de modération")}>
        {t("Cet espace est réservé aux administrateurs du marketplace.")}
      </Empty>
    );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("CONFIANCE & QUALITÉ")}</span>
        <h1>{t("Le poste de contrôle.")}</h1>
        <p>
          {t(
            "Publications, assistance et transactions. Les décisions restent humaines.",
          )}
        </p>
      </div>
      {t(error && <Notice error>{t(error)}</Notice>)}
      {t(
        !data ? (
          <Loading />
        ) : (
          <>
            <section className="panel">
              <h2>
                {t("Publications à examiner (")}
                {t(data.products.length)}
                {t(")")}
              </h2>
              {t(
                data.products.length ? (
                  data.products.map((p: any) => (
                    <form
                      key={p.id}
                      className="moderation-item"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        moderate(
                          p.id,
                          "published",
                          String(f.get("note") || ""),
                        );
                      }}
                    >
                      <h3>{p.title}</h3>
                      <p>{p.demo ? t(p.description) : p.description}</p>
                      <small>
                        {p.profiles?.display_name}
                        {t(" · ")}
                        {t(p.kind)}
                        {t(" · v")}
                        {t(p.version)}
                        {t(" ·")} {t(money(p.price_cents, locale))}
                      </small>
                      <p className="preserve-lines">
                        {t("Prérequis : ")}
                        {p.demo ? t(p.requirements) : p.requirements}
                      </p>
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={async () => {
                          try {
                            const d = await api("admin/file", {
                              product_id: p.id,
                            });
                            window.location.assign(d.url);
                          } catch (e) {
                            notify((e as Error).message);
                          }
                        }}
                      >
                        <Download size={15} />
                        {t(" Télécharger pour inspection")}
                      </button>
                      <label>
                        {t("Note de modération")}
                        <textarea name="note" rows={2} maxLength={2000} />
                      </label>
                      <label className="checkbox-label">
                        <input type="checkbox" required />
                        {t(
                          " J’ai examiné le package, la documentation, les permissions et les droits de distribution.",
                        )}
                      </label>
                      <div className="button-row">
                        <button
                          disabled={busy}
                          className="button primary small"
                        >
                          {t("Approuver")}
                        </button>
                        <button
                          disabled={busy}
                          type="button"
                          className="button secondary small"
                          onClick={(e) => {
                            const form = e.currentTarget.closest("form")!;
                            moderate(
                              p.id,
                              "rejected",
                              String(
                                new FormData(form).get("note") ||
                                  "Veuillez revoir votre package.",
                              ),
                            );
                          }}
                        >
                          {t("Demander une correction")}
                        </button>
                      </div>
                    </form>
                  ))
                ) : (
                  <p className="muted">{t("Aucune publication en attente.")}</p>
                ),
              )}
            </section>
            <section className="panel">
              <h2>
                {t("Demandes d’assistance (")}
                {t(data.requests.length)}
                {t(")")}
              </h2>
              {t(
                data.requests.map((r: any) => (
                  <article className="moderation-item" key={r.id}>
                    <h3>{r.subject}</h3>
                    <p className="preserve-lines">{r.body}</p>
                    <small>
                      {t("Utilisateur : ")}
                      {t(r.user_id)}
                      <br />
                      {t("Commande : ")}
                      {t(r.order_id || "Sans commande")}
                    </small>
                    <button
                      className="button secondary small"
                      onClick={async () => {
                        try {
                          await api("admin/resolve", { request_id: r.id });
                          await load();
                        } catch (e) {
                          notify((e as Error).message);
                        }
                      }}
                    >
                      {t("Marquer comme résolue")}
                    </button>
                  </article>
                )),
              )}
            </section>
            <section className="panel">
              <h2>{t("Dernières commandes")}</h2>
              {t(
                data.orders.map((o: any) => (
                  <div className="admin-order" key={o.id}>
                    <div>
                      <strong>{o.product_title}</strong>
                      <small>{t(o.id)}</small>
                    </div>
                    <Status value={o.status} />
                    <span>{t(money(o.amount_cents, locale))}</span>
                    <button
                      className="button secondary small"
                      disabled={o.status !== "paid" || o.amount_cents === 0}
                      onClick={() => setRefund(o)}
                    >
                      {t("Rembourser")}
                    </button>
                  </div>
                )),
              )}
            </section>
          </>
        ),
      )}
      {t(
        refund && (
          <Modal
            title={t("Confirmer le remboursement")}
            onClose={() => setRefund(null)}
          >
            <p>
              {t("Rembourser intégralement")}{" "}
              <strong>{t(money(refund.amount_cents, locale))}</strong>
              {t(" pour")} {refund.product_title}
              {t(
                " ? Le transfert vendeur et la commission seront également inversés.",
              )}
            </p>
            <button
              disabled={busy}
              className="button primary full"
              onClick={async () => {
                setBusy(true);
                try {
                  const d = await api("admin/refund", { order_id: refund.id });
                  notify(d.message);
                  setRefund(null);
                  await load();
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Confirmer le remboursement")}
            </button>
          </Modal>
        ),
      )}
    </>
  );
}
