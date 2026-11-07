"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Clock3,
  Layers3,
  Package,
  Sparkles,
  Tag,
} from "lucide-react";
import Link from "./navigation-link";
import { useI18n } from "./i18n";
import { Avatar, CopyButton, Notice, usePricesVisible } from "./market-ui";
import { FeedBuyNow, type FeedBuyer } from "./feed-buy-now";
import { EventAmount, EventKind } from "./market-floor";
import { OfferModal } from "./market-desk";
import { money } from "../lib/market/model";
import { offerBounds, timeAgo, type MarketEvent } from "../lib/market/market";

export type ModelCardControls = FeedBuyer & {
  favorites?: string[];
  onSave?: (id: string) => void;
  payments?: boolean;
};
const idle = () => {};
function CardLink({ passive, children, ...link }: {
  passive: boolean;
  children: ReactNode;
  href: string;
  className: string;
  tabIndex?: number;
  "aria-hidden"?: boolean | "true" | "false";
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  if (passive)
    return <div className={link.className} aria-hidden={link["aria-hidden"]}>{children}</div>;
  return <Link {...link}>{children}</Link>;
}
const listingLabel = (kind: string) =>
  kind === "agent"
    ? "Agent"
    : kind === "bundle"
      ? "Bundle"
      : kind === "plugin"
        ? "Plugin"
        : "Produit";

// The same complete listing card is used by the moving market Feed and by
// product-linked profile publications. Activity is optional, never invented.
export function MarketModelCard({
  product,
  seller,
  activity,
  demo = false,
  inactive = false,
  duplicate = false,
  purchaseOnly = false,
  onPause = idle,
  onDemo = idle,
  position,
  eager = false,
  ...buyer
}: ModelCardControls & {
  product: MarketEvent["product"];
  seller: MarketEvent["seller"] & { avatar_url?: string | null };
  activity?: MarketEvent;
  demo?: boolean;
  inactive?: boolean;
  duplicate?: boolean;
  purchaseOnly?: boolean;
  onPause?: () => void;
  onDemo?: () => void;
  position?: { index: number; count: number };
  eager?: boolean;
}) {
  const { t, locale } = useI18n();
  const prices = usePricesVisible();
  const [offering, setOffering] = useState(false);
  const [notice, setNotice] = useState("");
  const tabIndex = inactive || duplicate ? -1 : undefined;
  const href = demo ? "/feed?demo=1" : "/agents/" + product.slug;
  const inspect = (event: MouseEvent<HTMLAnchorElement>) => {
    if (demo) {
      event.preventDefault();
      onPause();
      onDemo();
    }
  };
  const amount = activity ? activity.amount_cents : product.price_cents;
  const own = !!buyer.userId && buyer.userId === product.seller_id;
  const offerLimits = offerBounds(product.price_cents ?? 0);
  const canOffer =
    offerLimits.max >= offerLimits.min &&
    prices &&
    buyer.payments &&
    !own &&
    (product.price_cents ?? 0) > 0 &&
    (demo || !!product.id);
  const saved = !!product.id && !!buyer.favorites?.includes(product.id);
  const instructions = <>
    {product.requirements && <p><strong>{t("Prérequis")}</strong>{demo ? t(product.requirements) : product.requirements}</p>}
    {product.setup && <p><strong>{t("Installation")}</strong>{demo ? t(product.setup) : product.setup}</p>}
  </>;
  return (
    <div className="mk-feed-card">
      <div className="mk-feed-card-copy">
        <div className="mk-feed-event-heading">
          {activity ? (
            <EventKind event={activity} />
          ) : (
            <span className="mk-kind mk-kind-listed">
              <Tag size={13} />
              {t("PRODUIT PUBLIÉ")}
            </span>
          )}
          {demo && <span className="mk-feed-demo-badge">{t("TEST")}</span>}
          {activity && (
            <time
              dateTime={activity.created_at}
              title={new Date(activity.created_at).toLocaleString(
                locale === "en" ? "en-CA" : "fr-CA",
              )}
            >
              <Clock3 size={12} />
              {timeAgo(activity.created_at, locale)}
            </time>
          )}
        </div>
        <span className="mk-feed-engine">
          {product.engine} · {t(listingLabel(product.kind))}
        </span>
        <CardLink
          passive={purchaseOnly}
          className="mk-feed-title"
          tabIndex={tabIndex}
          href={href}
          onClick={inspect}
        >
          <h2>{demo ? t(product.title) : product.title}</h2>
          <ArrowUpRight size={23} />
        </CardLink>
        {product.tagline && (
          <p className="mk-feed-tagline">
            {demo ? t(product.tagline) : product.tagline}
          </p>
        )}
        {product.description && (
          <p className="mk-feed-description">
            {demo ? t(product.description) : product.description}
          </p>
        )}
        {!!product.tags?.length && (
          <ul className="mk-feed-features">
            {product.tags.map((tag) => (
              <li key={tag}>
                <Check size={13} />
                {demo ? t(tag) : tag}
              </li>
            ))}
          </ul>
        )}
        <dl className="mk-feed-specs">
          {!!product.agent_count && (
            <div>
              <dt>{t("COMPOSITION")}</dt>
              <dd>
                {product.agent_count}{" "}
                {t(product.agent_count === 1 ? "agent" : "agents")}
              </dd>
            </div>
          )}
          {product.version && (
            <div>
              <dt>{t("VERSION")}</dt>
              <dd>v{product.version}</dd>
            </div>
          )}
          {product.license && (
            <div>
              <dt>{t("LICENCE")}</dt>
              <dd>{t(product.license)}</dd>
            </div>
          )}
        </dl>
        {(product.requirements || product.setup) && (
          purchaseOnly ? <div className="mk-feed-details">
            <strong>{t("Prérequis et installation")}</strong>
            {instructions}
          </div> : <details className="mk-feed-details">
            <summary tabIndex={tabIndex}>{t("Prérequis et installation")}</summary>
            {instructions}
          </details>
        )}
        <CardLink
          passive={purchaseOnly}
          className="mk-feed-seller"
          tabIndex={tabIndex}
          href={demo ? "/feed?demo=1" : "/creators/" + seller.username}
          onClick={inspect}
        >
          <Avatar name={seller.display_name} src={seller.avatar_url} />
          <span>
            {seller.display_name}
            <small>@{seller.username}</small>
          </span>
        </CardLink>
        <div className="mk-feed-card-bottom">
          {prices && amount != null ? (
            <div className="mk-feed-price">
              <small>
                {t(
                  activity?.kind === "sold"
                    ? "MONTANT DE L’ACQUISITION"
                    : activity?.kind === "offer"
                      ? "MONTANT DE L’OFFRE"
                      : "PRIX DU MODÈLE",
                )}
              </small>
              {activity ? (
                <EventAmount event={activity} />
              ) : (
                <span className="mk-amount">
                  {amount === 0 ? t("Gratuit") : money(amount, locale)}
                </span>
              )}
              {activity &&
                product.price_cents != null &&
                product.price_cents !== amount && (
                  <p className="mk-feed-current-price">
                    {t("Prix actuel :")} {money(product.price_cents, locale)}
                  </p>
                )}
            </div>
          ) : (
            <span className="mk-feed-price-hidden">
              {t("Découvrez cette création")}
            </span>
          )}
          <FeedBuyNow
            product={product}
            demo={demo}
            inactive={inactive}
            duplicate={duplicate}
            userId={buyer.userId}
            onSignIn={buyer.onSignIn}
            onPause={onPause}
            onDemo={onDemo}
          />
        </div>
        {!purchaseOnly && <div className="mk-model-actions">
          <Link href={href} tabIndex={tabIndex} onClick={inspect}>
            {t("Voir la fiche")} <ArrowUpRight size={13} />
          </Link>
          {(buyer.onSave || demo) && (
            <button
              type="button"
              tabIndex={tabIndex}
              disabled={duplicate || (!demo && !product.id)}
              className={"mk-model-save" + (saved ? " saved" : "")}
              aria-pressed={saved}
              aria-label={t(
                (saved ? "Retirer des" : "Ajouter aux") +
                  " favoris : " +
                  product.title,
              )}
              onClick={() => {
                onPause();
                if (demo) onDemo();
                else if (product.id) buyer.onSave?.(product.id);
              }}
            >
              <Bookmark size={13} fill={saved ? "currentColor" : "none"} />
              {t("Favoris")}
            </button>
          )}
          {canOffer && (
            <button
              type="button"
              className="mk-model-offer"
              tabIndex={tabIndex}
              disabled={duplicate}
              onClick={() => {
                onPause();
                if (demo) onDemo();
                else if (!buyer.userId) buyer.onSignIn();
                else setOffering(true);
              }}
            >
              {t("Faire une offre")}
            </button>
          )}
          <CopyButton
            tabIndex={tabIndex}
            disabled={duplicate}
            value={
              (typeof window === "undefined"
                ? "https://marketpaperclip.com"
                : window.location.origin) + href
            }
            label="Copier le lien"
          />
        </div>}
        {notice && <Notice>{t(notice)}</Notice>}
      </div>
      <CardLink
        passive={purchaseOnly}
        href={href}
        onClick={inspect}
        className="mk-feed-art"
        tabIndex={-1}
        aria-hidden="true"
      >
        {product.cover_url ? (
          <img
            src={product.cover_url}
            alt=""
            loading={eager ? "eager" : "lazy"}
          />
        ) : (
          <>
            <div className="mk-feed-art-grid" />
            {product.kind === "bundle" ? (
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
            {t(demo ? "CONCEPT ORIGINAL · DÉMO" : "DÉCOUVREZ LE MODÈLE")}
          </span>
        </div>
        {position && (
          <div className="mk-feed-art-number">
            {String(position.index).padStart(2, "0")}
            <span> / {String(position.count).padStart(2, "0")}</span>
          </div>
        )}
      </CardLink>
      {offering && product.id && (
        <OfferModal
          product={{
            id: product.id,
            title: product.title,
            price_cents: product.price_cents ?? null,
          }}
          onClose={() => setOffering(false)}
          onDone={() => setOffering(false)}
          notify={setNotice}
        />
      )}
    </div>
  );
}
