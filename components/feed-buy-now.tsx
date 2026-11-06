"use client";

import { useRef, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { money } from "../lib/market/model";
import type { MarketEvent } from "../lib/market/market";
import { useI18n } from "./i18n";
import Link from "./navigation-link";
import { api, Notice, usePricesVisible } from "./market-ui";

export type FeedBuyer = { userId: string | null; onSignIn: () => void };

export function FeedBuyNow({
  product,
  demo,
  inactive,
  duplicate,
  userId,
  onSignIn,
  onPause,
  onDemo,
}: FeedBuyer & {
  product: MarketEvent["product"];
  demo: boolean;
  inactive: boolean;
  duplicate: boolean;
  onPause: () => void;
  onDemo: () => void;
}) {
  const { t, locale } = useI18n();
  const prices = usePricesVisible();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  if (!prices) return null;
  const tabIndex = inactive ? -1 : undefined;
  const free = product.price_cents === 0;
  const own = !!userId && product.seller_id === userId;
  if (own && !demo)
    return <p className="mk-feed-buy-own">{t("Votre création")}</p>;
  // Only the real Feed API supplies a public product UUID. Older activity
  // responses and unpriced previews cannot accidentally start a purchase.
  if (!demo && (!product.id || product.price_cents == null)) return null;
  const buy = async () => {
    if (duplicate || submitting.current) return;
    onPause();
    if (demo) {
      onDemo();
      return;
    }
    if (!userId) {
      onSignIn();
      return;
    }
    if (!accepted || !product.id) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      // No amount is accepted from this card: the server checks the current
      // listing, owner, licence, existing orders and live seller readiness.
      const result = await api<{ url: string }>("checkout", {
        product_id: product.id,
        license_accepted: true,
      });
      window.location.assign(result.url);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="mk-feed-buy">
      {!demo && (
        <label className="mk-feed-buy-license">
          <input
            type="checkbox"
            checked={accepted}
            disabled={duplicate || busy}
            tabIndex={tabIndex}
            onChange={(event) => {
              onPause();
              setAccepted(event.target.checked);
              setError("");
            }}
          />
          <span>
            {t("J’accepte la licence ")}
            <Link href="/licenses" tabIndex={tabIndex}>
              {t(product.license || "du produit")}
            </Link>{" "}
            {t("et les ")}
            <Link href="/terms" tabIndex={tabIndex}>
              {t("conditions de vente")}
            </Link>
            .
          </span>
        </label>
      )}
      <button
        type="button"
        className="button primary mk-feed-buy-button"
        tabIndex={tabIndex}
        disabled={duplicate || busy || (!demo && !!userId && !accepted)}
        aria-busy={busy}
        onClick={buy}
      >
        {busy ? (
          <Loader2 size={16} className="spin" />
        ) : (
          <CreditCard size={16} />
        )}
        <span>
          {busy
            ? t(free ? "Préparation…" : "Ouverture de Stripe…")
            : free && !demo
              ? t("Obtenir gratuitement")
              : "Buy now"}
          {demo && " · " + t("DÉMO")}
        </span>
        {!busy && product.price_cents != null && !free && (
          <strong>{money(product.price_cents, locale)}</strong>
        )}
      </button>
      <small className="mk-feed-buy-caption">
        {t(
          demo
            ? "Modèle fictif — aucun paiement."
            : free
              ? "Retrouvez le modèle dans vos acquisitions."
              : "Paiement sécurisé sur Stripe · CAD",
        )}
      </small>
      {error && <Notice error>{t(error)}</Notice>}
    </div>
  );
}
