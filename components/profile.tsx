"use client";
// Public profile in the style of a social page: banner, profile photo and
// posts presenting the creator's agents and bundles for sale. Built from the
// existing components and palette; new rules live in app/market.css (mk-).
import React, { useEffect, useRef, useState } from "react";
import Link from "./navigation-link";
import {
  ArrowUpRight,
  Camera,
  Code2,
  Globe,
  ImagePlus,
  Images,
  Loader2,
  Newspaper,
  Package,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "./i18n";
import {
  api,
  Avatar,
  Empty,
  Modal,
  Notice,
  usePricesVisible,
} from "./market-ui";
import {
  money,
  POST_IMAGE_LIMIT,
  type Post,
  type Product,
} from "../lib/market/model";
import { timeAgo } from "../lib/market/market";
import { MarketModelCard, type ModelCardControls } from "./market-model-card";

export type PublicProfile = {
  id?: string;
  username: string;
  display_name: string;
  bio?: string;
  website?: string;
  avatar_url?: string | null;
  banner_url?: string | null;
};
type Picture = "avatar_url" | "banner_url";
const IMAGE_TYPES = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 3145728;

// Photos leave the device resized and re-encoded: lighter uploads from a
// phone, and the camera's metadata (GPS position, device) stays private.
async function prepareImage(file: File, maxSide: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Format d’image invalide. Les SVG ne sont pas acceptés.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.88));
  // PNG keeps transparent logos; photos and oversized PNG become JPEG.
  let blob = file.type === "image/png" ? await encode("image/png") : null;
  if (!blob || blob.size > MAX_BYTES) blob = await encode("image/jpeg");
  if (!blob || blob.size > MAX_BYTES)
    throw new Error("Choisissez une image JPG, PNG ou WebP de 3 Mo maximum.");
  return blob;
}
function upload(path: string, blob: Blob) {
  const form = new FormData();
  form.append(
    "file",
    blob,
    blob.type === "image/png" ? "image.png" : "image.jpg",
  );
  return api<{ url: string | null }>(path, form);
}

// Hidden file pickers sit outside dialogs so the dialog focus trap only
// cycles through visible controls.
function FilePicker({
  input,
  multiple = false,
  onFiles,
}: {
  input: React.RefObject<HTMLInputElement | null>;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <input
      ref={input}
      className="mk-file-input"
      type="file"
      accept={IMAGE_TYPES}
      multiple={multiple}
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";
        if (files.length) onFiles(files);
      }}
    />
  );
}

function PictureModal({
  kind,
  profile,
  onChange,
  onClose,
}: {
  kind: "avatar" | "banner";
  profile: PublicProfile;
  onChange: (field: Picture, url: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field: Picture = kind === "avatar" ? "avatar_url" : "banner_url";
  const current = profile[field];
  async function run(task: () => Promise<string | null>) {
    setBusy(true);
    setError("");
    try {
      onChange(field, await task());
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title={kind === "avatar" ? "Photo de profil" : "Bannière du profil"}
        onClose={onClose}
      >
        <div className={"mk-picture-preview " + kind}>
          {kind === "avatar" ? (
            <Avatar large name={profile.display_name} src={current} />
          ) : current ? (
            <img src={current} alt="" />
          ) : (
            <span className="mk-picture-empty">
              <ImagePlus size={28} />
            </span>
          )}
        </div>
        <p className="mk-picture-hint">
          {t(
            kind === "avatar"
              ? "Une image carrée, au moins 400 × 400 px. JPG, PNG ou WebP."
              : "Une image large, idéalement 1500 × 500 px. JPG, PNG ou WebP.",
          )}
        </p>
        {error && <Notice error>{t(error)}</Notice>}
        <div className="button-row">
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <ImagePlus size={16} />
            )}
            {t(current ? " Changer l’image" : " Choisir une image")}
          </button>
          {current && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(
                  async () =>
                    (await api("profile/" + kind, undefined, "DELETE")).url,
                )
              }
            >
              <Trash2 size={16} />
              {t(" Retirer l’image")}
            </button>
          )}
        </div>
      </Modal>
      <FilePicker
        input={input}
        onFiles={([file]) =>
          run(
            async () =>
              (
                await upload(
                  "profile/" + kind,
                  await prepareImage(file, kind === "avatar" ? 640 : 2000),
                )
              ).url,
          )
        }
      />
    </>
  );
}

export function ProfileCover({
  profile,
  owner,
  onChange,
}: {
  profile: PublicProfile;
  owner: boolean;
  onChange: (field: Picture, url: string | null) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const edit = owner && (
    <button
      type="button"
      className="button secondary small mk-cover-edit"
      onClick={() => setEditing(true)}
    >
      <Camera size={15} />
      {t(" Modifier la couverture")}
    </button>
  );
  return (
    <>
      {profile.banner_url ? (
        <div className="profile-banner mk-banner-photo">
          <img src={profile.banner_url} alt="" />
          {edit}
        </div>
      ) : (
        <div className="profile-banner">
          <div className="profile-grid" />
          <span>{t("BUILT WITH PURPOSE.")}</span>
          <Code2 size={96} />
          {edit}
        </div>
      )}
      {editing && (
        <PictureModal
          kind="banner"
          profile={profile}
          onChange={onChange}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

export function ProfilePhoto({
  profile,
  owner,
  onChange,
}: {
  profile: PublicProfile;
  owner: boolean;
  onChange: (field: Picture, url: string | null) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  if (!owner)
    return (
      <Avatar large name={profile.display_name} src={profile.avatar_url} />
    );
  return (
    <span className="mk-avatar-edit">
      <Avatar large name={profile.display_name} src={profile.avatar_url} />
      <button
        type="button"
        className="mk-avatar-camera"
        aria-label={t("Changer la photo de profil")}
        onClick={() => setEditing(true)}
      >
        <Camera size={15} />
      </button>
      {editing && (
        <PictureModal
          kind="avatar"
          profile={profile}
          onChange={onChange}
          onClose={() => setEditing(false)}
        />
      )}
    </span>
  );
}

function PostComposer({
  profile,
  products,
  onPosted,
  notify,
  onCreateModel,
  attachProduct,
}: {
  profile: PublicProfile;
  products: Product[];
  onPosted: (post: Post) => void;
  notify: (message: string) => void;
  onCreateModel: () => void;
  attachProduct: { id: string } | null;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (attachProduct) setProductId(attachProduct.id);
  }, [attachProduct]);
  async function add(files: File[]) {
    if (!productId) {
      setError("Choisissez un produit publié de votre catalogue.");
      return;
    }
    const room = POST_IMAGE_LIMIT - images.length - uploading;
    const chosen = files.slice(0, Math.max(0, room));
    setError("");
    setUploading((n) => n + chosen.length);
    for (const file of chosen) {
      try {
        const { url } = await upload(
          "posts/images",
          await prepareImage(file, 1800),
        );
        if (url)
          setImages((current) =>
            current.length < POST_IMAGE_LIMIT ? [...current, url] : current,
          );
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }
  async function publish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !products.some(
        (product) => product.id === productId && product.status === "published",
      )
    ) {
      setError("Choisissez un produit publié de votre catalogue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { post } = await api<{ post: Post }>("posts", {
        body,
        images,
        product_id: productId,
      });
      onPosted(post);
      setBody("");
      setImages([]);
      setProductId("");
      notify("Publication partagée sur votre profil.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const empty = !productId;
  return (
    <form className="panel mk-panel mk-composer" onSubmit={publish}>
      <div className="mk-composer-title">
        <h3>{t("Publier un produit")}</h3>
        <span>
          <Globe size={12} /> {t("Public")}
        </span>
      </div>
      <p className="mk-composer-rule">
        {t("Chaque publication présente un produit publié de votre catalogue.")}
      </p>
      <div className="mk-composer-head">
        <Avatar name={profile.display_name} src={profile.avatar_url} />
        <textarea
          aria-label={t("Votre publication")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={t("Ajoutez une note sur ce produit (facultatif)…")}
        />
      </div>
      {(images.length > 0 || uploading > 0) && (
        <div className="mk-composer-images">
          {images.map((url) => (
            <span className="mk-composer-image" key={url}>
              <img src={url} alt="" />
              <button
                type="button"
                className="icon-button"
                aria-label={t("Retirer la photo")}
                onClick={() =>
                  setImages((current) => current.filter((x) => x !== url))
                }
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <span className="mk-composer-image loading" key={"uploading-" + i}>
              <Loader2 className="spin" size={18} />
            </span>
          ))}
        </div>
      )}
      {error && <Notice error>{t(error)}</Notice>}
      <div className="mk-composer-tools">
        <button
          type="button"
          className="button secondary small mk-create-model"
          disabled={busy || uploading > 0}
          onClick={onCreateModel}
        >
          <Plus size={15} /> {t("Modèle")}
        </button>
        <button
          type="button"
          className="button secondary small"
          disabled={
            busy || !productId || images.length + uploading >= POST_IMAGE_LIMIT
          }
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={15} />
          {t(" Photos du produit")}
        </button>
        <select
          aria-label={t("Produit présenté")}
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          disabled={!products.length}
        >
          <option value="">
            {t(
              products.length
                ? "Choisir un produit publié"
                : "Publiez d’abord un modèle dans votre catalogue",
            )}
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <button
          className="button primary small"
          disabled={busy || uploading > 0 || empty}
        >
          {busy ? <Loader2 className="spin" size={15} /> : <Send size={15} />}
          {t(" Publier")}
        </button>
      </div>
      <FilePicker input={input} multiple onFiles={add} />
    </form>
  );
}

function PostCard({
  post,
  profile,
  canDelete,
  onDelete,
  onOpen,
  controls,
}: {
  post: Post;
  profile: PublicProfile;
  canDelete: boolean;
  onDelete: (post: Post) => void;
  onOpen: (url: string) => void;
  controls: ModelCardControls;
}) {
  const { t, locale } = useI18n();
  if (!post.product || post.product.status !== "published") return null;
  return (
    <article className="panel mk-panel mk-post" id={"post-" + post.id}>
      <header className="mk-post-head">
        <Avatar name={profile.display_name} src={profile.avatar_url} />
        <div>
          <strong>{profile.display_name}</strong>
          <time
            suppressHydrationWarning
            dateTime={post.created_at}
            title={new Date(post.created_at).toLocaleString(
              locale === "en" ? "en-CA" : "fr-CA",
            )}
          >
            {timeAgo(post.created_at, locale)}
          </time>
        </div>
        {canDelete && (
          <button
            type="button"
            className="icon-button"
            aria-label={t("Supprimer la publication")}
            onClick={() => onDelete(post)}
          >
            <Trash2 size={16} />
          </button>
        )}
      </header>
      {post.body && <p className="mk-post-body">{post.body}</p>}
      {post.images.length > 0 && (
        <div className={"mk-post-images count-" + post.images.length}>
          {post.images.map((url) => (
            <button
              type="button"
              key={url}
              aria-label={t("Agrandir la photo")}
              onClick={() => onOpen(url)}
            >
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="mk-profile-product-card">
        <MarketModelCard
          product={{
            ...post.product,
            cover_url: post.product.cover_url ?? null,
          }}
          seller={{
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          }}
          {...controls}
        />
      </div>
    </article>
  );
}

export function ProfilePhotos({
  posts,
  limit,
  onOpen,
}: {
  posts: Post[];
  limit?: number;
  onOpen: (url: string) => void;
}) {
  const { t } = useI18n();
  const photos = [
    ...new Set(
      posts
        .filter((post) => post.product?.status === "published")
        .flatMap((post) =>
          [post.product?.cover_url, ...post.images].filter(
            (url): url is string => !!url,
          ),
        ),
    ),
  ].slice(0, limit);
  if (!photos.length)
    return (
      <div className="mk-empty-line">
        <Images size={16} />
        {t("Les photos des publications apparaîtront ici.")}
      </div>
    );
  return (
    <div className="mk-photo-grid">
      {photos.map((url) => (
        <button
          type="button"
          key={url}
          aria-label={t("Agrandir la photo")}
          onClick={() => onOpen(url)}
        >
          <img src={url} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

function ForSale({
  products,
  onAll,
}: {
  products: Product[];
  onAll: () => void;
}) {
  const { t, locale } = useI18n();
  const showPrices = usePricesVisible();
  return (
    <section className="panel mk-panel mk-profile-aside">
      <div className="panel-title">
        <h3>
          <Package size={15} /> {t("À vendre")}
        </h3>
        {products.length > 4 && (
          <button type="button" className="text-button" onClick={onAll}>
            {t("Tout voir")}
          </button>
        )}
      </div>
      {products.length ? (
        <div className="mk-sale-list">
          {products.slice(0, 4).map((p) => (
            <Link key={p.id} href={"/agents/" + p.slug}>
              <span className="mk-thumb">
                {p.cover_url ? (
                  <img src={p.cover_url} alt="" loading="lazy" />
                ) : p.kind === "bundle" ? (
                  <Package size={14} />
                ) : (
                  <Code2 size={14} />
                )}
              </span>
              <span>
                <strong>{p.title}</strong>
                <small>
                  {t(
                    p.kind === "bundle"
                      ? `${p.agent_count} agents · Bundle`
                      : "Agent",
                  )}
                </small>
              </span>
              {showPrices && p.price_cents !== null && (
                <b>
                  {t(
                    p.price_cents === 0
                      ? "Gratuit"
                      : money(p.price_cents, locale),
                  )}
                </b>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="mk-empty-line">
          <Package size={16} />
          {t("Aucun agent ou bundle en vente pour le moment.")}
        </div>
      )}
    </section>
  );
}

// Posts tab: the creator's listings and photos beside the feed, as on a
// social profile. Posts are owned by the page so the Photos tab shares them.
export function ProfileFeed({
  profile,
  products,
  posts,
  setPosts,
  more,
  setMore,
  owner,
  moderator,
  notify,
  onOpen,
  onTab,
  onCreateModel,
  attachProduct,
  website,
  bio,
  controls,
}: {
  profile: PublicProfile;
  products: Product[];
  posts: Post[];
  setPosts: (update: (posts: Post[]) => Post[]) => void;
  more: boolean;
  setMore: (more: boolean) => void;
  owner: boolean;
  moderator: boolean;
  notify: (message: string) => void;
  onOpen: (url: string) => void;
  onTab: (tab: "products" | "photos") => void;
  onCreateModel: () => void;
  attachProduct: { id: string } | null;
  website: string;
  bio: string;
  controls: ModelCardControls;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);
  async function loadMore() {
    const last = posts.at(-1);
    if (!last) return;
    setLoading(true);
    setError("");
    try {
      const d = await api<{ posts: Post[]; more: boolean }>(
        `creators/${encodeURIComponent(profile.username)}/posts?before=${encodeURIComponent(last.created_at)}`,
      );
      setPosts((current) => [
        ...current,
        ...d.posts.filter((p) => !current.some((c) => c.id === p.id)),
      ]);
      setMore(d.more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function remove(post: Post) {
    setBusy(true);
    try {
      await api("posts/" + post.id, undefined, "DELETE");
      setPosts((current) => current.filter((p) => p.id !== post.id));
      notify("Publication supprimée.");
      setRemoving(null);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mk-profile-feed">
      <aside className="mk-profile-side">
        <section className="panel mk-panel mk-profile-aside mk-profile-intro">
          <h3>{t("À propos")}</h3>
          <p>
            {bio ||
              t(
                "Découvrez mes modèles, mes agents et les coulisses de mes créations.",
              )}
          </p>
          {website && (
            <a href={website} target="_blank" rel="noreferrer">
              <Globe size={15} />
              <span>{website.replace(/^https:\/\//, "")}</span>
              <ArrowUpRight size={13} />
            </a>
          )}
          {owner && (
            <button
              type="button"
              className="button secondary small"
              onClick={onCreateModel}
            >
              <Plus size={15} /> {t("Créer mon prochain modèle")}
            </button>
          )}
        </section>
        <ForSale products={products} onAll={() => onTab("products")} />
        <section className="panel mk-panel mk-profile-aside">
          <div className="panel-title">
            <h3>
              <Images size={15} /> {t("Photos")}
            </h3>
            {posts.some((p) => p.images.length || p.product?.cover_url) && (
              <button
                type="button"
                className="text-button"
                onClick={() => onTab("photos")}
              >
                {t("Tout voir")}
              </button>
            )}
          </div>
          <ProfilePhotos posts={posts} limit={9} onOpen={onOpen} />
        </section>
      </aside>
      <div className="mk-profile-posts">
        {owner && (
          <PostComposer
            profile={profile}
            products={products}
            notify={notify}
            onCreateModel={onCreateModel}
            attachProduct={attachProduct}
            onPosted={(post) => setPosts((current) => [post, ...current])}
          />
        )}
        {error && <Notice error>{t(error)}</Notice>}
        {posts.length ? (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              profile={profile}
              canDelete={owner || moderator}
              onDelete={setRemoving}
              onOpen={onOpen}
              controls={controls}
            />
          ))
        ) : (
          <Empty icon={Newspaper} title="Aucun produit partagé pour le moment.">
            {owner
              ? "Choisissez un produit publié ou créez un modèle avec le bouton Modèle, juste au-dessus."
              : "Ce créateur n’a encore rien publié. Découvrez ses agents et bundles."}
          </Empty>
        )}
        {more && (
          <button
            type="button"
            className="button secondary mk-more"
            onClick={loadMore}
            disabled={loading}
          >
            {loading && <Loader2 className="spin" size={15} />}
            {t("Voir plus de publications")}
          </button>
        )}
      </div>
      {removing && (
        <Modal
          title="Supprimer cette publication ?"
          onClose={() => setRemoving(null)}
        >
          <p className="muted">
            {t("Elle disparaîtra de ce profil, avec ses photos.")}
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              onClick={() => setRemoving(null)}
            >
              {t("Annuler")}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => remove(removing)}
            >
              <Trash2 size={15} />
              {t(" Supprimer")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
