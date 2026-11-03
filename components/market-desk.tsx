"use client";
// Signed-in market tools: offers for buyers and sellers, listing controls and
// direct package uploads.
import { useI18n } from "./i18n";
import React, { useCallback, useEffect, useState } from "react";
import Link from "./navigation-link";
import {
  ArrowUpRight,
  Check,
  Clock3,
  Gavel,
  Handshake,
  Inbox,
  Pause,
  Play,
  Store,
  X,
} from "lucide-react";
import { money, priceInCents, type Product } from "../lib/market/model";
import { offerBounds, timeAgo, type Offer } from "../lib/market/market";
import { api, Modal, Notice } from "./market-ui";

const offerStatus: Record<Offer["status"], [string, string]> = {
  pending: ["En attente", "status-pending"],
  accepted: ["Acceptée", "status-published"],
  completed: ["Payée", "status-paid"],
  declined: ["Refusée", "status-rejected"],
  withdrawn: ["Retirée", ""],
  expired: ["Expirée", ""],
};
export function OfferStatus({ value }: { value: Offer["status"] }) {
  const { t } = useI18n();
  const [label, tone] = offerStatus[value] || [value, ""];
  return (
    <span className={"status-pill " + tone}>
      <i />
      {t(label)}
    </span>
  );
}
const active = (o: Offer) => o.status === "pending" || o.status === "accepted";
const dateTime = (iso: string, locale: "fr" | "en") =>
  new Date(iso).toLocaleString(locale === "en" ? "en-CA" : "fr-CA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function useMyOffer(productId: string | null, enabled: boolean) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const reload = useCallback(() => {
    if (!productId || !enabled) {
      setOffer(null);
      return Promise.resolve();
    }
    return api("offers?role=buyer")
      .then((d) =>
        setOffer(
          (d.offers as Offer[]).find(
            (o) => o.product_id === productId && active(o),
          ) || null,
        ),
      )
      .catch(() => setOffer(null));
  }, [productId, enabled]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { offer, reload };
}

export async function payOffer(offer: Offer) {
  const d = await api("checkout", {
    product_id: offer.product_id,
    license_accepted: true,
    offer_id: offer.id,
  });
  window.location.assign(d.url);
}

export function OfferModal({
  product,
  onClose,
  onDone,
  notify,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
  notify: (s: string) => void;
}) {
  const { t, locale } = useI18n();
  const price = product.price_cents || 0;
  const bounds = offerBounds(price);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cents = priceInCents(amount);
  const valid = cents !== null && cents >= bounds.min && cents <= bounds.max;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError(
        "Proposez un montant entre l’offre minimale et le prix demandé.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("offers", {
        product_id: product.id,
        amount_cents: cents,
        message,
      });
      notify("Offre envoyée au créateur.");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={t("Faire une offre")} onClose={onClose}>
      <p className="muted">
        {t("Proposez votre prix pour")} <strong>{product.title}</strong>
        {t(". Le créateur accepte ou refuse.")}
      </p>
      <form className="form-stack mk-offer-form" onSubmit={submit}>
        <dl className="mk-offer-terms">
          <div>
            <dt>{t("Prix demandé")}</dt>
            <dd>{money(price, locale)}</dd>
          </div>
          <div>
            <dt>{t("Offre minimale")}</dt>
            <dd>{money(bounds.min, locale)}</dd>
          </div>
        </dl>
        <label>
          {t("Votre offre (CAD)")}
          <div className="price-input">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={bounds.min / 100}
              max={bounds.max / 100}
              required
              autoFocus
              value={amount}
              placeholder={String(Math.round((price * 0.85) / 100))}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span>{t("$ CAD")}</span>
          </div>
          {cents !== null && price > 0 && (
            <small>
              {Math.round(((price - cents) / price) * 100)}
              {t(" % sous le prix demandé")}
            </small>
          )}
        </label>
        <label>
          {t("Message au créateur (optionnel)")}
          <textarea
            rows={3}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t(
              "Votre contexte d’utilisation, votre équipe, vos questions…",
            )}
          />
        </label>
        <div className="info-callout">
          <Clock3 size={17} />
          {t(
            " Votre offre reste valable 7 jours. Si elle est acceptée, vous aurez 72 heures pour payer ce montant par Stripe. Aucun montant n’est prélevé maintenant.",
          )}
        </div>
        {error && <Notice error>{t(error)}</Notice>}
        <button className="button primary full" disabled={busy || !valid}>
          <Gavel size={16} />
          {t(busy ? "Envoi…" : "Envoyer mon offre")}
        </button>
      </form>
    </Modal>
  );
}

// Purchase-panel status for the signed-in buyer's own offer on this product.
export function MyOfferStatus({
  offer,
  licenseAccepted,
  reload,
  notify,
}: {
  offer: Offer;
  licenseAccepted: boolean;
  reload: () => void;
  notify: (s: string) => void;
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  async function withdraw() {
    setBusy(true);
    try {
      await api("offers/" + offer.id + "/withdraw", {});
      notify("Offre retirée.");
      reload();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    setBusy(true);
    try {
      await payOffer(offer);
    } catch (e) {
      notify((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className={"mk-my-offer " + (offer.status === "accepted" ? "accepted" : "")}>
      <div>
        <span>
          <Handshake size={14} />
          {t(offer.status === "accepted" ? "Offre acceptée" : "Votre offre")}
        </span>
        <strong>{money(offer.amount_cents, locale)}</strong>
      </div>
      <small>
        {t(
          offer.status === "accepted"
            ? "À payer avant le "
            : "En attente de réponse · expire le ",
        )}
        {dateTime(offer.expires_at, locale)}
      </small>
      {offer.status === "accepted" && (
        <button
          className="button primary full small"
          disabled={busy || !licenseAccepted}
          onClick={pay}
        >
          {t("Payer l’offre acceptée")}
          <ArrowUpRight size={15} />
        </button>
      )}
      <button className="text-button mk-link-button" disabled={busy} onClick={withdraw}>
        {t("Retirer mon offre")}
      </button>
    </div>
  );
}

export function MyOffers({ notify }: { notify: (s: string) => void }) {
  const { t, locale } = useI18n();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [paying, setPaying] = useState<Offer | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState("");
  const load = useCallback(
    () =>
      api("offers?role=buyer")
        .then((d) => setOffers(d.offers))
        .catch(() => setOffers([])),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  if (!offers?.length) return null;
  async function withdraw(o: Offer) {
    setBusy(o.id);
    try {
      await api("offers/" + o.id + "/withdraw", {});
      notify("Offre retirée.");
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel mk-panel mk-offers">
      <div className="panel-title">
        <h3>
          <Gavel size={15} /> {t("Mes offres")}
        </h3>
        <span className="muted mk-caption">
          {offers.filter(active).length} {t("active(s)")}
        </span>
      </div>
      <OfferRows
        offers={offers}
        render={(o) =>
          active(o) && (
            <>
              {o.status === "accepted" && (
                <button
                  className="button primary small"
                  onClick={() => {
                    setAccepted(false);
                    setPaying(o);
                  }}
                >
                  {t("Payer")}
                </button>
              )}
              <button
                className="button secondary small"
                disabled={busy === o.id}
                onClick={() => withdraw(o)}
              >
                {t("Retirer")}
              </button>
            </>
          )
        }
      />
      {paying && (
        <Modal title={t("Payer l’offre acceptée")} onClose={() => setPaying(null)}>
          <p className="muted">
            {t("Le créateur a accepté")}{" "}
            <strong>{money(paying.amount_cents, locale)}</strong>
            {t(" pour ")}
            <strong>{paying.product?.title}</strong>
            {t(". Le paiement se fait sur la page sécurisée de Stripe.")}
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              {t("J’accepte la licence du produit et les ")}
              <Link href="/terms">{t("conditions de vente")}</Link>
              {t(".")}
            </span>
          </label>
          <button
            className="button primary full"
            disabled={!accepted || busy === "pay"}
            onClick={async () => {
              setBusy("pay");
              try {
                await payOffer(paying);
              } catch (e) {
                notify((e as Error).message);
                setBusy("");
              }
            }}
          >
            {t("Continuer vers le paiement")}
            <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
    </section>
  );
}

function OfferRows({
  offers,
  seller = false,
  render,
}: {
  offers: Offer[];
  seller?: boolean;
  render: (o: Offer) => React.ReactNode;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="mk-offer-list">
      {offers.map((o) => {
        const discount = o.list_cents
          ? Math.round(((o.list_cents - o.amount_cents) / o.list_cents) * 100)
          : 0;
        return (
          <article className="mk-offer-row" key={o.id}>
            <div className="mk-offer-main">
              {o.product ? (
                <Link href={"/agents/" + o.product.slug}>
                  <strong>{o.product.title}</strong>
                </Link>
              ) : (
                <strong>{t("Produit retiré")}</strong>
              )}
              <small>
                {seller ? t("De ") : t("Créateur : ")}
                {o.counterpart ? (
                  <Link href={"/creators/" + o.counterpart.username}>
                    {o.counterpart.display_name}
                  </Link>
                ) : (
                  t("—")
                )}
                {" · "}
                {timeAgo(o.created_at, locale)}
              </small>
              {o.message && <q className="mk-offer-message">{o.message}</q>}
            </div>
            <div className="mk-offer-amount">
              <strong>{money(o.amount_cents, locale)}</strong>
              <small>
                {t("sur")} {money(o.list_cents, locale)}
                {discount > 0 && <> · −{discount} %</>}
              </small>
            </div>
            <div className="mk-offer-state">
              <OfferStatus value={o.status} />
              {active(o) && (
                <small>
                  {t(o.status === "accepted" ? "Paiement avant le " : "Expire le ")}
                  {dateTime(o.expires_at, locale)}
                </small>
              )}
            </div>
            <div className="mk-offer-actions">{render(o)}</div>
          </article>
        );
      })}
    </div>
  );
}

export function OffersDesk({
  notify,
  onCount,
}: {
  notify: (s: string) => void;
  onCount?: (n: number) => void;
}) {
  const { t } = useI18n();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      api("offers?role=seller")
        .then((d) => {
          setOffers(d.offers);
          onCount?.((d.offers as Offer[]).filter((o) => o.status === "pending").length);
        })
        .catch((e) => setError(e.message)),
    [onCount],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function respond(o: Offer, action: "accept" | "decline") {
    setBusy(o.id);
    try {
      await api("offers/" + o.id + "/respond", { action });
      notify(
        action === "accept"
          ? "Offre acceptée. L’acheteur a 72 heures pour payer."
          : "Offre refusée.",
      );
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (error) return <Notice error>{t(error)}</Notice>;
  if (!offers) return null;
  if (!offers.length)
    return (
      <div className="mk-empty-line mk-empty-block">
        <Inbox size={18} />
        {t(
          "Aucune offre reçue pour l’instant. Les acheteurs peuvent proposer un prix sur vos annonces payantes.",
        )}
      </div>
    );
  return (
    <OfferRows
      offers={offers}
      seller
      render={(o) =>
        o.status === "pending" && (
          <>
            <button
              className="button primary small"
              disabled={busy === o.id}
              onClick={() => respond(o, "accept")}
            >
              <Check size={14} />
              {t("Accepter")}
            </button>
            <button
              className="button secondary small"
              disabled={busy === o.id}
              onClick={() => respond(o, "decline")}
            >
              <X size={14} />
              {t("Refuser")}
            </button>
          </>
        )
      }
    />
  );
}

type Listing = Product & {
  approved_version?: string | null;
  listed_at?: string | null;
};
export function ListingsDesk({
  products,
  notify,
  reload,
}: {
  products: Listing[];
  notify: (s: string) => void;
  reload: () => void;
}) {
  const { t, locale } = useI18n();
  const listings = products.filter((p) =>
    ["published", "archived"].includes(p.status),
  );
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  if (!listings.length) return null;
  async function run(id: string, call: () => Promise<unknown>, done: string) {
    setBusy(id);
    try {
      await call();
      notify(done);
      reload();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel mk-panel mk-listings">
      <div className="panel-title">
        <h3>
          <Store size={15} /> {t("Mes annonces sur le marché")}
        </h3>
        <span className="muted mk-caption">
          {t("Prix et disponibilité, sans nouvelle validation")}
        </span>
      </div>
      <div className="mk-listing-list">
        {listings.map((p) => {
          const draft = prices[p.id] ?? String(p.price_cents! / 100);
          const cents = priceInCents(draft);
          const live = p.status === "published";
          const reviewed = p.approved_version === p.version;
          return (
            <article className="mk-listing" key={p.id}>
              <div className="mk-listing-main">
                <span className={"status-pill " + (live ? "status-published" : "")}>
                  <i />
                  {t(live ? "En vente" : "En pause")}
                </span>
                <Link href={"/agents/" + p.slug}>
                  <strong>{p.title}</strong>
                </Link>
                <small>
                  {t("v")}
                  {p.version}
                  {p.listed_at && (
                    <>
                      {" · "}
                      {t("en vente depuis")} {timeAgo(p.listed_at, locale)}
                    </>
                  )}
                </small>
              </div>
              <form
                className="mk-listing-price"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (cents === null) return;
                  run(
                    p.id,
                    () => api("products/" + p.id + "/price", { price_cents: cents }),
                    "Prix mis à jour sur le marché.",
                  );
                }}
              >
                <label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10000"
                    value={draft}
                    aria-label={t("Prix de vente (CAD)")}
                    onChange={(e) =>
                      setPrices((v) => ({ ...v, [p.id]: e.target.value }))
                    }
                  />
                  <span>{t("$")}</span>
                </label>
                <button
                  className="button secondary small"
                  disabled={
                    busy === p.id || cents === null || cents === p.price_cents
                  }
                >
                  {t("Mettre à jour")}
                </button>
              </form>
              <div className="mk-listing-actions">
                {live ? (
                  <button
                    className="button secondary small"
                    disabled={busy === p.id}
                    onClick={() =>
                      run(
                        p.id,
                        () => api("products/" + p.id + "/listing", { action: "pause" }),
                        "Annonce mise en pause.",
                      )
                    }
                  >
                    <Pause size={14} />
                    {t("Mettre en pause")}
                  </button>
                ) : (
                  <button
                    className="button primary small"
                    disabled={busy === p.id || !reviewed}
                    title={reviewed ? undefined : t("Cette version doit être validée.")}
                    onClick={() =>
                      run(
                        p.id,
                        () => api("products/" + p.id + "/listing", { action: "resume" }),
                        "Annonce remise en vente.",
                      )
                    }
                  >
                    <Play size={14} />
                    {t("Remettre en vente")}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <small className="mk-footnote">
        {t(
          "Modifier le contenu, la couverture ou le package d’une annonce la renvoie en validation avant son retour dans le catalogue.",
        )}
      </small>
    </section>
  );
}

// Sends the package straight to private Storage, then asks the server to
// verify and attach it. Small files fall back to the legacy form upload.
export async function uploadPackage(productId: string, file: File) {
  let prepared: { url: string; path: string; contentType: string };
  try {
    prepared = await api("products/" + productId + "/file/upload", {
      name: file.name,
      size: file.size,
    });
  } catch (e) {
    if (file.size > 4 * 1024 * 1024) throw e;
    const fd = new FormData();
    fd.append("file", file);
    return api("products/" + productId + "/file", fd);
  }
  let sent: Response;
  try {
    sent = await fetch(prepared.url, {
      method: "PUT",
      headers: {
        "content-type": prepared.contentType,
        "x-upsert": "false",
        "cache-control": "max-age=3600",
      },
      body: file,
    });
  } catch {
    throw new Error("Le transfert du fichier a échoué. Vérifiez votre connexion et réessayez.");
  }
  if (!sent.ok)
    throw new Error("Le transfert du fichier a échoué. Réessayez dans un instant.");
  return api("products/" + productId + "/file/attach", {
    path: prepared.path,
    name: file.name,
  });
}
