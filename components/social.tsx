"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  MessageCircle,
  Send,
  ImagePlus,
  ArrowLeft,
  Search,
  X,
  Reply,
  Smile,
  Pencil,
  Trash2,
  ShieldBan,
  CheckCheck,
  RefreshCw,
} from "lucide-react";
import Link from "./navigation-link";
import {
  api,
  Avatar,
  Loading,
  Notice,
  Empty,
  usePricesVisible,
} from "./market-ui";
import { useI18n } from "./i18n";
import type { Session } from "./marketplace";
import type {
  Member,
  Conversation,
  ChatMessage,
  MarketNotification,
} from "../lib/market/social";
import { money } from "../lib/market/model";
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Une erreur est survenue.";
function useMembers(query: string) {
  const [result, setResult] = useState<{
    users: Member[];
    error: string;
    loading: boolean;
  }>({ users: [], error: "", loading: false });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setResult({ users: [], error: "", loading: true });
      api("users?q=" + encodeURIComponent(query))
        .then((d) => {
          if (active) setResult({ users: d.users, error: "", loading: false });
        })
        .catch((e) => {
          if (active)
            setResult({ users: [], error: errorText(e), loading: false });
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  return result;
}
export function MemberSuggestions({
  query,
  onSelect,
}: {
  query: string;
  onSelect: () => void;
}) {
  const { t } = useI18n(),
    result = useMembers(query);
  if (!query.trim()) return null;
  return (
    <div className="member-suggestions" aria-label={t("Membres")}>
      <strong>{t("Membres")}</strong>
      {result.error ? (
        <Notice error>{t(result.error)}</Notice>
      ) : result.loading ? (
        <small>{t("Recherche…")}</small>
      ) : (
        result.users.slice(0, 5).map((m) => (
          <Link key={m.id} href={"/creators/" + m.username} onClick={onSelect}>
            <Avatar name={m.display_name} src={m.avatar_url} />
            <span>
              {m.display_name}
              <small>@{m.username}</small>
            </span>
          </Link>
        ))
      )}
      {!result.loading && !result.error && !result.users.length && (
        <small>{t("Aucun membre trouvé.")}</small>
      )}
      <Link href={"/people?q=" + encodeURIComponent(query)} onClick={onSelect}>
        {t("Voir tous les membres")} →
      </Link>
    </div>
  );
}
export function PeoplePage() {
  const { t } = useI18n(),
    params = useSearchParams(),
    query = params.get("q") || "",
    router = useRouter();
  const [input, setInput] = useState(query),
    result = useMembers(query),
    [extra, setExtra] = useState<Member[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    setExtra([]);
    setPage(0);
    setMore(true);
    setInput(query);
  }, [query]);
  return (
    <section className="social-page">
      <div className="page-heading">
        <span className="eyebrow">{t("COMMUNAUTÉ")}</span>
        <h1>{t("Retrouvez-vous ici.")}</h1>
        <p>{t("Recherchez un membre par son nom ou son @pseudo.")}</p>
      </div>
      <form
        className="social-search"
        onSubmit={(e) => {
          e.preventDefault();
          router.push("/people?q=" + encodeURIComponent(input));
        }}
      >
        <Search size={18} />
        <input
          aria-label={t("Rechercher un membre")}
          placeholder={t("Nom ou @pseudo")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="button small">{t("Rechercher")}</button>
      </form>
      {(result.error || error) && (
        <Notice error>{t(result.error || error)}</Notice>
      )}
      {result.loading ? (
        <Loading />
      ) : (
        <div className="member-grid">
          {[...result.users, ...extra].map((m) => (
            <article className="member-card" key={m.id}>
              <Link href={"/creators/" + m.username}>
                <Avatar name={m.display_name} src={m.avatar_url} />
                <strong>{m.display_name}</strong>
                <span>@{m.username}</span>
              </Link>
              <Link
                className="button small"
                href={"/messages?to=" + encodeURIComponent(m.username)}
              >
                <MessageCircle size={16} />
                {t("Message")}
              </Link>
            </article>
          ))}
        </div>
      )}
      {!result.loading && !result.users.length && !result.error && (
        <Empty icon={Search} title={t("Aucun membre trouvé.")}>
          {t("Essayez un autre nom ou @pseudo.")}
        </Empty>
      )}
      {result.users.length === 24 && more && (
        <button
          className="button"
          onClick={async () => {
            try {
              const d = await api(
                "users?q=" + encodeURIComponent(query) + "&page=" + (page + 1),
              );
              setExtra((a) => [...a, ...d.users]);
              setPage((p) => p + 1);
              setMore(d.more);
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          {t("Charger plus")}
        </button>
      )}
    </section>
  );
}
export function SocialBadges({ enabled }: { enabled: boolean }) {
  const { t } = useI18n(),
    [counts, setCounts] = useState({ messages: 0, notifications: 0 }),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setCounts({ messages: 0, notifications: 0 });
      return;
    }
    let active = true,
      busy = false;
    const refresh = async () => {
      if (document.hidden || busy) return;
      busy = true;
      try {
        const [inbox, notices] = await Promise.all([
          api("chat"),
          api("notifications"),
        ]);
        if (active) {
          setCounts({ messages: inbox.unread, notifications: notices.unread });
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 12000);
    window.addEventListener("social:updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("social:updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [enabled]);
  if (!enabled) return null;
  return (
    <div className="social-badges">
      <Link
        href="/messages"
        className="social-icon"
        aria-label={t("Messages")}
        title={t(error ? "Actualisation indisponible" : "Messages")}
      >
        <MessageCircle size={20} />
        {counts.messages > 0 && <span>{Math.min(counts.messages, 99)}</span>}
      </Link>
      <Link
        href="/notifications"
        className="social-icon"
        aria-label={t("Notifications")}
      >
        <Bell size={20} />
        {counts.notifications > 0 && (
          <span>{Math.min(counts.notifications, 99)}</span>
        )}
      </Link>
    </div>
  );
}
const notificationLabels: Record<string, string> = {
  sale: "Nouvelle vente",
  purchase: "Achat confirmé",
  acquisition: "Nouvelle acquisition gratuite",
  refunded: "Remboursement",
  partially_refunded: "Remboursement partiel",
  disputed: "Paiement contesté",
  offer: "Nouvelle offre",
  offer_accepted: "Offre acceptée",
  offer_declined: "Offre refusée",
};
export function NotificationsPage({
  session,
  signIn,
}: {
  session: Session;
  signIn: () => void;
}) {
  const { t, locale } = useI18n(),
    prices = usePricesVisible(),
    [items, setItems] = useState<MarketNotification[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async (before?: string) => {
    try {
      const d = await api(
        "notifications" +
          (before ? "?before=" + encodeURIComponent(before) : ""),
      );
      setItems((old) =>
        before
          ? [...old, ...d.notifications]
          : [
              ...d.notifications,
              ...old.filter(
                (n) =>
                  !d.notifications.some(
                    (x: MarketNotification) => x.id === n.id,
                  ),
              ),
            ],
      );
      setMore(d.more);
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!session.user) return;
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [session.user, load]);
  const read = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      await api("notifications", { ids }, "PATCH");
      setItems((a) =>
        a.map((n) =>
          ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
      window.dispatchEvent(new Event("social:updated"));
    } catch (e) {
      setError(errorText(e));
    }
  };
  if (!session.user)
    return (
      <Empty
        icon={Bell}
        title={t("Vos notifications")}
        action={
          <button className="button primary" onClick={signIn}>
            {t("Me connecter")}
          </button>
        }
      >
        {t("Connectez-vous pour suivre vos ventes et vos achats.")}
      </Empty>
    );
  return (
    <section className="social-page">
      <div className="social-heading">
        <div>
          <span className="eyebrow">{t("VOTRE ACTIVITÉ")}</span>
          <h1>{t("Notifications")}</h1>
          <p>{t("Vos ventes, achats et offres, au même endroit.")}</p>
        </div>
        <button
          className="button small"
          disabled={!items.some((n) => !n.read_at)}
          onClick={() =>
            void read(items.filter((n) => !n.read_at).map((n) => n.id))
          }
        >
          <CheckCheck size={16} />
          {t("Marquer comme lues")}
        </button>
      </div>
      {error && (
        <Notice error>
          {t(error)}{" "}
          <button onClick={() => void load()}>{t("Réessayer")}</button>
        </Notice>
      )}
      {loading ? (
        <Loading />
      ) : !items.length ? (
        <Empty icon={Bell} title={t("Vous êtes à jour.")}>
          {t("Vos prochaines activités apparaîtront ici.")}
        </Empty>
      ) : (
        <div className="notification-list">
          {items.map((n) => (
            <article key={n.id} className={!n.read_at ? "unread" : ""}>
              <span className="notification-dot" />
              <Link href={n.href} onClick={() => void read([n.id])}>
                <strong>
                  {t(notificationLabels[n.kind] || "Nouvelle activité")}
                </strong>
                <p>{n.title}</p>
                <small>
                  {prices && n.amount_cents !== null
                    ? money(n.amount_cents, locale) + " · "
                    : ""}
                  {new Date(n.created_at).toLocaleString(locale)}
                </small>
              </Link>
              {!n.read_at && (
                <button
                  className="icon-button"
                  aria-label={t("Marquer comme lue")}
                  onClick={() => void read([n.id])}
                >
                  <CheckCheck size={17} />
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {more && (
        <button
          className="button"
          onClick={() => void load(items.at(-1)?.created_at)}
        >
          {t("Charger plus")}
        </button>
      )}
    </section>
  );
}
type ChatDetail = {
  id: string;
  peer: Member;
  members: {
    user_id: string;
    last_read_at: string;
    typing_until: string | null;
  }[];
  blocked_by_me: boolean;
  blocked_by_peer: boolean;
};
export function MessagesPage({
  session,
  signIn,
}: {
  session: Session;
  signIn: () => void;
}) {
  const { t } = useI18n(),
    params = useSearchParams(),
    router = useRouter(),
    cid = params.get("conversation"),
    to = params.get("to");
  const [inbox, setInbox] = useState<Conversation[]>([]),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [starting, setStarting] = useState(false),
    [page, setPage] = useState(0),
    [hasMore, setHasMore] = useState(false);
  const refresh = useCallback(async () => {
    const d = await api("chat");
    setInbox((old) => [
      ...d.conversations,
      ...old.filter(
        (x) => !d.conversations.some((v: Conversation) => v.id === x.id),
      ),
    ]);
    setHasMore(d.conversations.length === 30);
  }, []);
  useEffect(() => {
    if (!session.user) return;
    let active = true;
    const load = () =>
      refresh().catch((e) => {
        if (active) setError(errorText(e));
      });
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session.user, refresh]);
  useEffect(() => {
    if (!to || !session.user) return;
    let active = true;
    setStarting(true);
    api("chat", { username: to.toLowerCase() })
      .then((d) => {
        if (active) router.replace("/messages?conversation=" + d.id);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setStarting(false);
      });
    return () => {
      active = false;
    };
  }, [to, session.user, router]);
  const open = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true);
    setError("");
    try {
      const d = await api("chat", { username: query.toLowerCase() });
      router.push("/messages?conversation=" + d.id);
      setQuery("");
      void refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  };
  if (!session.user)
    return (
      <Empty
        icon={MessageCircle}
        title={t("Votre messagerie")}
        action={
          <button className="button primary" onClick={signIn}>
            {t("Me connecter")}
          </button>
        }
      >
        {t("Échangez directement avec les autres membres.")}
      </Empty>
    );
  return (
    <section className={"chat-layout " + (cid ? "chat-selected" : "")}>
      <aside className="chat-inbox">
        <div className="social-heading">
          <h1>{t("Messages")}</h1>
          <MessageCircle size={23} />
        </div>
        <form className="social-search" onSubmit={open}>
          <input
            aria-label={t("Démarrer avec un @pseudo")}
            placeholder={t("Démarrer avec un @pseudo")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={31}
          />
          <button
            className="icon-button"
            disabled={starting || !query.trim()}
            aria-label={t("Ouvrir la conversation")}
          >
            <Send size={17} />
          </button>
        </form>
        {query && (
          <MemberSuggestions query={query} onSelect={() => setQuery("")} />
        )}
        {error && <Notice error>{t(error)}</Notice>}
        {starting && <Loading />}
        <nav aria-label={t("Conversations")}>
          {inbox
            .filter(
              (c) =>
                !query ||
                [c.peer.display_name, c.peer.username].some((v) =>
                  v
                    .toLowerCase()
                    .includes(query.replace(/^@/, "").toLowerCase()),
                ),
            )
            .map((c) => (
              <Link
                key={c.id}
                href={"/messages?conversation=" + c.id}
                className={"chat-thread " + (c.id === cid ? "selected" : "")}
              >
                <Avatar name={c.peer.display_name} src={c.peer.avatar_url} />
                <span>
                  <strong>{c.peer.display_name}</strong>
                  <small>@{c.peer.username}</small>
                  <p>
                    {c.latest?.deleted
                      ? t("Message supprimé")
                      : c.latest?.body ||
                        (c.latest?.image ? t("Photo") : t("Dites bonjour 👋"))}
                  </p>
                </span>
                {c.unread > 0 && <b className="unread-badge">{c.unread}</b>}
              </Link>
            ))}
        </nav>
        {!inbox.length && !starting && (
          <p className="muted">
            {t("Commencez une conversation avec un @pseudo.")}
          </p>
        )}
        {hasMore && (
          <button
            className="button small"
            onClick={async () => {
              try {
                const d = await api("chat?page=" + (page + 1));
                setInbox((a) => [
                  ...a,
                  ...d.conversations.filter(
                    (v: Conversation) => !a.some((c) => c.id === v.id),
                  ),
                ]);
                setHasMore(d.conversations.length === 30);
                setPage((p) => p + 1);
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            {t("Charger plus")}
          </button>
        )}
      </aside>
      {cid ? (
        <ChatRoom
          key={cid}
          id={cid}
          userId={session.user.id}
          onUpdate={refresh}
        />
      ) : (
        <div className="chat-welcome">
          <MessageCircle size={48} />
          <h2>{t("La conversation commence ici.")}</h2>
          <p>
            {t("Choisissez un échange ou cherchez un membre avec son @pseudo.")}
          </p>
          <Link className="button" href="/people">
            {t("Trouver un membre")}
          </Link>
        </div>
      )}
    </section>
  );
}
function ChatRoom({
  id,
  userId,
  onUpdate,
}: {
  id: string;
  userId: string;
  onUpdate: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [detail, setDetail] = useState<ChatDetail | null>(null),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [reply, setReply] = useState<ChatMessage | null>(null),
    [editing, setEditing] = useState<ChatMessage | null>(null),
    [image, setImage] = useState<{ path: string; preview: string } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [reactions, setReactions] = useState<number | null>(null),
    [emojis, setEmojis] = useState(false),
    [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const loaded = useRef<ChatMessage[]>([]),
    scroll = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    lastTyped = useRef(0),
    ack = useRef(0),
    alive = useRef(true),
    sending = useRef(false),
    retry = useRef<{ key: string; client_id: string } | null>(null),
    imageRef = useRef(image),
    input = useRef<HTMLTextAreaElement>(null);
  imageRef.current = image;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (imageRef.current) URL.revokeObjectURL(imageRef.current.preview);
    };
  }, []);
  const action = useCallback((data: unknown) => api("chat/" + id, data), [id]);
  const read = useCallback(
    async (rows: ChatMessage[]) => {
      const last = rows.at(-1);
      if (
        document.hidden ||
        !document.hasFocus() ||
        !nearBottom.current ||
        !last ||
        last.id <= ack.current
      )
        return;
      await action({ action: "read", message_id: last.id });
      ack.current = last.id;
      window.dispatchEvent(new Event("social:updated"));
    },
    [action],
  );
  const refresh = useCallback(async () => {
    const previous = loaded.current;
    const suffix = previous.length
      ? "?after=" +
        previous.at(-1)!.id +
        "&known=" +
        previous
          .slice(-500)
          .map((m) => m.id)
          .join(",")
      : "";
    const [d, list] = await Promise.all([
      api("chat/" + id),
      api("chat/" + id + "/messages" + suffix),
    ]);
    if (!alive.current) return;
    setDetail(d);
    setMessages((old) => {
      const map = new Map<number, ChatMessage>(old.map((m) => [m.id, m]));
      for (const m of list.messages) map.set(m.id, m);
      const next = [...map.values()].sort((a, b) => a.id - b.id);
      loaded.current = next;
      return next;
    });
    if (!previous.length) setMore(list.more);
    setLoading(false);
    setError("");
    await read(list.messages);
  }, [id, read]);
  useEffect(() => {
    let running = false;
    const poll = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        await refresh();
      } catch (e) {
        if (alive.current) {
          setError(errorText(e));
          setLoading(false);
        }
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 3000);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [refresh]);
  useEffect(() => {
    if (nearBottom.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages.length]);
  const run = async (data: unknown) => {
    setError("");
    try {
      await action(data);
      await refresh();
      await onUpdate();
      window.dispatchEvent(new Event("social:updated"));
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current || uploading || (!text.trim() && !image) || blocked)
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      if (editing) {
        if (
          !(await run({ action: "edit", message_id: editing.id, body: text }))
        )
          return;
        setEditing(null);
      } else {
        const data = {
            body: text.trim(),
            ...(image ? { image_path: image.path } : {}),
            ...(reply ? { reply_to: reply.id } : {}),
          },
          key = JSON.stringify(data);
        if (retry.current?.key !== key)
          retry.current = { key, client_id: crypto.randomUUID() };
        const ok = await run({
          action: "send",
          ...data,
          client_id: retry.current.client_id,
        });
        if (!ok) return;
        retry.current = null;
      }
      setText("");
      setReply(null);
      if (image) {
        URL.revokeObjectURL(image.preview);
        setImage(null);
      }
      nearBottom.current = true;
      input.current?.focus();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 3145728) {
      setError("Choisissez une image JPG, PNG ou WebP de 3 Mo maximum.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const d = await api("chat/" + id + "/images", form);
      if (!alive.current) return;
      if (image) URL.revokeObjectURL(image.preview);
      setImage({ path: d.image_path, preview: URL.createObjectURL(file) });
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (alive.current) setUploading(false);
    }
  };
  const blocked = !!(detail?.blocked_by_me || detail?.blocked_by_peer),
    peerState = detail?.members.find((m) => m.user_id !== userId),
    typing =
      peerState?.typing_until &&
      Date.parse(peerState.typing_until) > Date.now();
  if (loading && !error)
    return (
      <div className="chat-room">
        <Loading />
      </div>
    );
  return (
    <div className="chat-room">
      <header className="chat-room-header">
        <Link
          href="/messages"
          className="icon-button chat-back"
          aria-label={t("Retour aux conversations")}
        >
          <ArrowLeft size={20} />
        </Link>
        {detail && (
          <>
            <Avatar
              name={detail.peer.display_name}
              src={detail.peer.avatar_url}
            />
            <Link href={"/creators/" + detail.peer.username}>
              <strong>{detail.peer.display_name}</strong>
              <small>@{detail.peer.username}</small>
            </Link>
            <button
              className="text-button block-button"
              onClick={() =>
                void run({ action: detail.blocked_by_me ? "unblock" : "block" })
              }
            >
              <ShieldBan size={16} />
              {t(detail.blocked_by_me ? "Débloquer" : "Bloquer")}
            </button>
          </>
        )}
      </header>
      {error && (
        <Notice error>
          {t(error)}{" "}
          <button
            className="text-button"
            onClick={() => void refresh().catch((e) => setError(errorText(e)))}
          >
            <RefreshCw size={14} />
            {t("Réessayer")}
          </button>
        </Notice>
      )}
      <div
        className="chat-history"
        ref={scroll}
        role="log"
        aria-label={t("Messages de la conversation")}
        aria-live="polite"
        onScroll={() => {
          const el = scroll.current!;
          nearBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (nearBottom.current) void read(messages).catch(() => {});
        }}
      >
        {more && (
          <button
            className="button small"
            onClick={async () => {
              try {
                const el = scroll.current!,
                  height = el.scrollHeight;
                const d = await api(
                  "chat/" + id + "/messages?before=" + messages[0].id,
                );
                setMessages((a) => {
                  const next = [
                    ...d.messages.filter(
                      (m: ChatMessage) => !a.some((x) => x.id === m.id),
                    ),
                    ...a,
                  ];
                  loaded.current = next;
                  return next;
                });
                setMore(d.more);
                requestAnimationFrame(() => {
                  el.scrollTop += el.scrollHeight - height;
                });
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            {t("Messages précédents")}
          </button>
        )}
        {!messages.length && !error && (
          <p className="chat-start">{t("Dites bonjour 👋")}</p>
        )}
        {messages.map((m) => {
          const own = m.sender_id === userId,
            quoted = messages.find((x) => x.id === m.reply_to);
          return (
            <article
              className={"chat-message " + (own ? "own" : "")}
              key={m.id}
            >
              <div className="chat-bubble">
                {m.reply_to && (
                  <blockquote>
                    {quoted?.deleted_at
                      ? t("Message supprimé")
                      : quoted?.body ||
                        (quoted?.image_url
                          ? t("Photo")
                          : t("Réponse à un message précédent"))}
                  </blockquote>
                )}
                {m.deleted_at ? (
                  <em>{t("Message supprimé")}</em>
                ) : (
                  <>
                    {m.image_url && (
                      <a href={m.image_url} target="_blank" rel="noreferrer">
                        <img
                          src={m.image_url}
                          alt={t("Photo partagée")}
                          loading="lazy"
                        />
                      </a>
                    )}
                    {m.body && <p>{m.body}</p>}
                  </>
                )}
              </div>
              <small className="chat-timestamp">
                {new Date(m.created_at).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {m.edited_at ? " · " + t("Modifié") : ""}
                {own && !m.deleted_at
                  ? " · " +
                    t(
                      peerState &&
                        Date.parse(peerState.last_read_at) >=
                          Date.parse(m.created_at)
                        ? "Lu"
                        : "Envoyé",
                    )
                  : ""}
              </small>
              {!!m.reactions.length && (
                <div className="chat-reactions">
                  {m.reactions.map((r) => (
                    <button
                      key={r.user_id}
                      className={r.user_id === userId ? "mine" : ""}
                      disabled={blocked}
                      aria-label={t("Retirer ou ajouter une réaction")}
                      onClick={() =>
                        void run({
                          action: "react",
                          message_id: m.id,
                          emoji: r.user_id === userId ? null : r.emoji,
                        })
                      }
                    >
                      {r.emoji}
                    </button>
                  ))}
                </div>
              )}
              {!m.deleted_at && !blocked && (
                <div className="chat-message-actions">
                  <button
                    aria-label={t("Répondre")}
                    onClick={() => {
                      setReply(m);
                      setEditing(null);
                      input.current?.focus();
                    }}
                  >
                    <Reply size={14} />
                  </button>
                  <button
                    aria-label={t("Réagir")}
                    onClick={() =>
                      setReactions(reactions === m.id ? null : m.id)
                    }
                  >
                    <Smile size={14} />
                  </button>
                  {own && (
                    <>
                      <button
                        aria-label={t("Modifier")}
                        onClick={() => {
                          setEditing(m);
                          setText(m.body);
                          setReply(null);
                          input.current?.focus();
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        aria-label={t("Supprimer")}
                        onClick={() => setConfirmDelete(m.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                  {reactions === m.id && (
                    <div className="emoji-picker">
                      {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            void run({
                              action: "react",
                              message_id: m.id,
                              emoji,
                            });
                            setReactions(null);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  {confirmDelete === m.id && (
                    <div className="delete-confirm">
                      <span>
                        {t("Supprimer ce message pour les deux membres ?")}
                      </span>
                      <button
                        onClick={async () => {
                          if (await run({ action: "delete", message_id: m.id }))
                            setConfirmDelete(null);
                        }}
                      >
                        {t("Supprimer")}
                      </button>
                      <button onClick={() => setConfirmDelete(null)}>
                        {t("Annuler")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div className="chat-status" role="status">
        {blocked
          ? t(
              detail?.blocked_by_me
                ? "Vous avez bloqué ce membre."
                : "Cette conversation est bloquée.",
            )
          : typing
            ? t("Écrit un message…")
            : t("Messages privés entre les deux membres.")}
      </div>
      {(reply || editing) && (
        <div className="chat-composer-context">
          <span>
            {t(editing ? "Modifier le message" : "Répondre à")}
            <small>{(editing || reply)?.body || t("Photo")}</small>
          </span>
          <button
            className="icon-button"
            aria-label={t("Annuler")}
            onClick={() => {
              setReply(null);
              if (editing) setText("");
              setEditing(null);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {image && (
        <div className="chat-attachment">
          <img src={image.preview} alt={t("Photo à envoyer")} />
          <button
            className="icon-button"
            aria-label={t("Retirer la photo")}
            onClick={() => {
              URL.revokeObjectURL(image.preview);
              setImage(null);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {emojis && (
        <div className="emoji-picker composer-emojis">
          {["😀", "👋", "❤️", "👍", "🎉", "🔥", "😊", "🙏", "🚀", "😂"].map(
            (emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  setText((a) => a + emoji);
                  setEmojis(false);
                  input.current?.focus();
                }}
              >
                {emoji}
              </button>
            ),
          )}
        </div>
      )}
      <form className="chat-composer" onSubmit={send}>
        <label
          className="icon-button"
          aria-label={t("Ajouter une photo")}
          title={t("Ajouter une photo")}
        >
          <ImagePlus size={21} />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={blocked || uploading || busy || !!editing}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label={t("Ajouter un emoji")}
          disabled={blocked || busy}
          onClick={() => setEmojis((a) => !a)}
        >
          <Smile size={21} />
        </button>
        <textarea
          ref={input}
          aria-label={t("Votre message")}
          placeholder={t("Votre message…")}
          maxLength={5000}
          rows={1}
          value={text}
          disabled={blocked || busy}
          onChange={(e) => {
            setText(e.target.value);
            if (Date.now() - lastTyped.current > 3000) {
              lastTyped.current = Date.now();
              void action({ action: "typing", active: true }).catch(() => {});
            }
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send(e);
            }
          }}
        />
        <button
          className="button primary"
          disabled={blocked || busy || uploading || (!text.trim() && !image)}
          aria-label={t("Envoyer")}
        >
          <Send size={18} />
          <span>
            {t(uploading ? "Transfert…" : busy ? "Envoi…" : "Envoyer")}
          </span>
        </button>
      </form>
    </div>
  );
}
