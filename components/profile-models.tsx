"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
} from "lucide-react";
import Link from "./navigation-link";
import { useI18n } from "./i18n";
import {
  api,
  Empty,
  Loading,
  Modal,
  Notice,
  usePricesVisible,
} from "./market-ui";
import { money, type Product } from "../lib/market/model";
import type { PublicProfile } from "./profile";

type Model = Product & { moderation_note?: string };
const statuses: Record<string, string> = {
  draft: "Brouillon",
  pending: "En validation",
  published: "En ligne",
  rejected: "À corriger",
  archived: "Archivé",
};

// Uses the existing authenticated Studio API. Drafts are never added to the
// public creator response or rendered for another member.
export function ProfileModels({
  onCreate,
  onEdit,
  onShare,
}: {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onShare: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const prices = usePricesVisible();
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<{
    products: Model[];
    stats: { total_products: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    api<{ products: Model[]; stats: { total_products: number } }>(
      "studio?page=" + page,
    )
      .then((value) => {
        if (current) setData(value);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [page, attempt]);
  return (
    <section className="mk-models-desk" aria-label={t("Mes modèles")}>
      <div className="section-heading">
        <div>
          <h2>{t("Mes modèles")}</h2>
          <p className="muted">
            {t(
              "Créez vos agents et bundles ici. Vos brouillons et validations restent visibles seulement par vous.",
            )}
          </p>
        </div>
        <button
          className="button primary small"
          type="button"
          onClick={onCreate}
        >
          <Plus size={16} /> {t("Créer un modèle")}
        </button>
      </div>
      {error ? (
        <Notice error>
          {t(error)}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t("Réessayer")}
          </button>
        </Notice>
      ) : loading ? (
        <Loading />
      ) : !data?.products.length ? (
        <Empty
          icon={Box}
          title="Votre premier modèle commence ici."
          action={
            <button type="button" className="button primary" onClick={onCreate}>
              <Plus size={16} /> {t("Créer un modèle")}
            </button>
          }
        >
          Ajoutez une description, votre fichier et votre prix. Vous pourrez
          tout préparer depuis votre profil.
        </Empty>
      ) : (
        <div className="mk-owned-models">
          {data.products.map((model) => (
            <article className="panel mk-owned-model" key={model.id}>
              <div className="mk-owned-model-art">
                {model.cover_url ? (
                  <img src={model.cover_url} alt="" loading="lazy" />
                ) : (
                  <Box size={26} />
                )}
              </div>
              <div className="mk-owned-model-info">
                <span className={"status-pill status-" + model.status}>
                  <i />
                  {t(statuses[model.status] || model.status)}
                </span>
                <h3>{model.title}</h3>
                <p>
                  {t(model.kind === "bundle" ? "Bundle" : "Agent")} ·{" "}
                  {model.engine} · v{model.version}
                  {prices && model.price_cents !== null
                    ? " · " +
                      (model.price_cents === 0
                        ? t("Gratuit")
                        : money(model.price_cents, locale))
                    : ""}
                </p>
                {model.status === "pending" && (
                  <small>
                    {t("Votre modèle sera visible après validation.")}
                  </small>
                )}
                {model.status === "rejected" && model.moderation_note && (
                  <small className="mk-model-note">
                    {model.moderation_note}
                  </small>
                )}
              </div>
              <div className="mk-owned-model-actions">
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => onEdit(model.id)}
                >
                  <Pencil size={14} /> {t("Modifier")}
                </button>
                {model.status === "published" && (
                  <>
                    <button
                      type="button"
                      className="button primary small"
                      onClick={() => onShare(model.id)}
                    >
                      <Send size={14} /> {t("Partager sur mon profil")}
                    </button>
                    <Link
                      href={"/agents/" + model.slug}
                      className="text-button"
                    >
                      {t("Voir la fiche")} <ArrowUpRight size={13} />
                    </Link>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {data && data.stats.total_products > 12 && (
        <div className="mk-model-pagination">
          <button
            type="button"
            className="button secondary small"
            disabled={loading || page === 0}
            onClick={() => setPage((n) => n - 1)}
          >
            <ArrowLeft size={15} /> {t("Précédent")}
          </button>
          <span>
            {t("Page")} {page + 1}
          </span>
          <button
            type="button"
            className="button secondary small"
            disabled={loading || (page + 1) * 12 >= data.stats.total_products}
            onClick={() => setPage((n) => n + 1)}
          >
            {t("Suivant")} <ArrowRight size={15} />
          </button>
        </div>
      )}
    </section>
  );
}

export function ProfileDetailsModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: PublicProfile;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      await api("profile", body, "PATCH");
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Modifier le profil"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="muted">
        {t("Votre profil est public. Présentez ce que vous créez.")}
      </p>
      <form className="form-stack" onSubmit={save}>
        {error && <Notice error>{t(error)}</Notice>}
        <label>
          {t("Nom public")}
          <input
            name="display_name"
            defaultValue={profile.display_name}
            required
            minLength={2}
            maxLength={60}
          />
        </label>
        <label>
          {t("Pseudo unique (@)")}
          <input
            name="username"
            defaultValue={profile.username}
            required
            pattern="[a-z0-9][a-z0-9_\-]{2,29}"
            minLength={3}
            maxLength={30}
            autoCapitalize="none"
            spellCheck={false}
          />
          <small>
            {t(
              "De 3 à 30 lettres minuscules, chiffres, tirets ou _. Les membres vous retrouvent avec @votre-pseudo.",
            )}
          </small>
        </label>
        <label>
          {t("Votre bio")}
          <textarea
            name="bio"
            defaultValue={profile.bio || ""}
            maxLength={600}
            rows={4}
          />
        </label>
        <label>
          {t("Site web")}
          <input
            name="website"
            type="url"
            defaultValue={profile.website || ""}
            placeholder="https://"
          />
        </label>
        <div className="button-row">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("Annuler")}
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Save size={15} />}{" "}
            {t("Enregistrer le profil")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ProfileModelSaved() {
  const { t } = useI18n();
  return (
    <div className="mk-model-saved" role="status">
      <Check size={18} />
      <div>
        <strong>{t("Votre modèle est en validation.")}</strong>
        <p>
          {t(
            "Retrouvez-le dans Mes modèles. Une fois approuvé, partagez-le dans une publication.",
          )}
        </p>
      </div>
    </div>
  );
}
