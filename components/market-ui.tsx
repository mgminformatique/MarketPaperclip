"use client";
import { useI18n } from "./i18n";
import React, { useEffect, useRef, useState } from "react";
import Link from "./navigation-link";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronRight,
  Code2,
  Loader2,
  Package,
  Paperclip,
  Search,
  X,
} from "lucide-react";
import { money, type Product } from "../lib/market/model";
import { SHOW_PRODUCT_PRICES } from "../lib/market/presentation";
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers:
      body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : undefined,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const d: any = await r.json();
  if (!r.ok) throw new Error(d.error || "Une erreur est survenue.");
  return d;
}
export function Brand() {
  const { t, locale } = useI18n();
  return (
    <Link
      href="/"
      className="brand"
      aria-label={t("MarketPaperclip — Accueil")}
    >
      <span className="brand-symbol">
        <Paperclip size={24} />
      </span>
      <span>
        {t("market")}
        <span className="brand-second">{t("paperclip")}</span>
        <small>{t("THE AGENT MARKETPLACE")}</small>
      </span>
    </Link>
  );
}
export function Avatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <span className={"avatar " + (large ? "large" : "")}>
      {t(
        name
          .split(" ")
          .slice(0, 2)
          .map((s) => s[0])
          .join("")
          .toUpperCase(),
      )}
    </span>
  );
}
export function ProductArt({
  product,
  large = false,
}: {
  product: Product;
  large?: boolean;
}) {
  const { t, locale } = useI18n();
  return product.cover_url || product.art ? (
    <img
      className={large ? "product-art large-art" : "product-art"}
      src={product.cover_url || "/art/" + product.art + ".webp"}
      alt={t(
        product.kind === "bundle"
          ? "Modules d’agents en 3D"
          : "Illustration 3D de " + product.title,
      )}
      loading="lazy"
    />
  ) : (
    <div className={"generated-cover " + (large ? "large-art" : "")}>
      <div className="cover-grid" />
      {t(
        product.kind === "bundle" ? <Package size={72} /> : <Code2 size={72} />,
      )}
      <span>{t(product.engine)}</span>
    </div>
  );
}
export function ProductCard({
  product: p,
  saved,
  onSave,
}: {
  product: Product;
  saved: boolean;
  onSave: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <article className="product-card">
      <div className="product-visual">
        <Link href={"/agents/" + p.slug} tabIndex={-1} aria-hidden="true">
          <ProductArt product={p} />
        </Link>
        <span
          className={
            "product-kind " + (p.kind === "bundle" ? "bundle-kind" : "")
          }
        >
          {t(p.kind === "bundle" ? <Package size={12} /> : <Code2 size={12} />)}{" "}
          {t(
            p.kind === "bundle" ? `${p.agent_count} agents · Bundle` : "Agent",
          )}
        </span>
        <button
          className={"save-button " + (saved ? "saved" : "")}
          aria-label={t(
            (saved ? "Retirer des" : "Ajouter aux") + " favoris : " + p.title,
          )}
          aria-pressed={saved}
          onClick={() => onSave(p.id)}
        >
          <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
        </button>
        <span className="visual-engine">
          <span
            className={
              "model-dot " + p.engine.toLowerCase().replace(/[^a-z]/g, "")
            }
          />
          {t(p.engine)}
        </span>
      </div>
      <div className="card-content">
        <Link
          href={"/creators/" + p.profiles?.username}
          className="creator-small"
        >
          <Avatar name={p.profiles?.display_name || "Créateur"} />
          {p.profiles?.display_name || t("Créateur")}
          <ChevronRight size={12} />
        </Link>
        <Link className="product-title" href={"/agents/" + p.slug}>
          <h3>{p.title}</h3>
          <ArrowUpRight size={18} />
        </Link>
        <p>{p.demo ? t(p.tagline) : p.tagline}</p>
        <div className="tag-line">
          {t(
            p.tags
              .slice(0, 3)
              .map((tag) => <span key={tag}>{p.demo ? t(tag) : tag}</span>),
          )}
        </div>
        <div className="card-bottom">
          {SHOW_PRODUCT_PRICES && (
            <span
              className={
                "price" + (p.price_cents === null ? " price-unset" : "")
              }
            >
              {t(
                p.price_cents === null
                  ? "Prix choisi par le créateur"
                  : p.price_cents === 0
                    ? "Gratuit"
                    : money(p.price_cents, locale),
              )}
              {p.price_cents !== null && (
                <small>
                  {t(
                    p.price_cents > 0
                      ? "CAD · paiement unique"
                      : "Licence incluse",
                  )}
                </small>
              )}
            </span>
          )}
          <span className="card-category">
            {t(p.demo ? "Aperçu" : p.category)}
          </span>
        </div>
      </div>
    </article>
  );
}
export function Empty({
  icon: Icon = Search,
  title,
  children,
  action,
}: {
  icon?: React.ElementType;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={30} />
      </div>
      <h2>{t(title)}</h2>
      <p>{t(children)}</p>
      {t(action)}
    </div>
  );
}
export function Loading() {
  const { t, locale } = useI18n();
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={26} />
      <span>{t("Un instant…")}</span>
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <div
      className={"notice " + (error ? "error" : "")}
      role={error ? "alert" : "status"}
    >
      {t(children)}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]',
        ) || [],
      );
    focusables()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const a = focusables();
        const first = a[0],
          last = a[a.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button
          className="modal-close icon-button"
          onClick={onClose}
          aria-label={t("Fermer")}
        >
          <X size={20} />
        </button>
        <h2 id="modal-title">{t(title)}</h2>
        {t(children)}
      </div>
    </div>
  );
}
export function CopyButton({
  value,
  label = "Copier",
}: {
  value: string;
  label?: string;
}) {
  const { t, locale } = useI18n();
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  return (
    <button
      className="button secondary small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          setError(true);
        }
      }}
    >
      {t(done ? <Check size={14} /> : null)}
      {t(done ? "Copié" : error ? "Copie indisponible" : label)}
    </button>
  );
}
