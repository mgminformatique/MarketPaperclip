import { z } from "zod";
import { uuid } from "./model";
import {
  admin,
  user,
  rateLimit,
  check,
  HttpError,
  ready,
  type Config,
  type context,
} from "./server";
const memberFields = "id,username,display_name,avatar_url";
const messageId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const body = async (req: Request) => {
  const raw = await req.text();
  if (raw.length > 20000) throw new HttpError(413, "Requête trop volumineuse.");
  return JSON.parse(raw);
};
const fail = (error: { message?: string } | null) => {
  if (!error) return;
  if (/Blocked/.test(error.message || ""))
    throw new HttpError(403, "Cette conversation est bloquée.");
  if (
    /not found|Invalid recipient|Invalid reply|Invalid message|Invalid image|foreign key/.test(
      error.message || "",
    )
  )
    throw new HttpError(404, "Conversation ou message introuvable.");
  check(error);
};
export async function socialApi(
  req: Request,
  c: Config,
  ctx: ReturnType<typeof context>,
) {
  const url = new URL(req.url),
    path = url.pathname.replace(/^\/api\//, "").split("/");
  if (!["users", "chat", "notifications"].includes(path[0])) return null;
  if (path[0] === "users" && path.length === 1 && req.method === "GET") {
    if (!ready(c)) return ctx.json({ users: [], more: false });
    const q = (url.searchParams.get("q") || "")
      .replace(/^@/, "")
      .trim()
      .slice(0, 60)
      .replace(/[^\p{L}\p{N} -]/gu, "");
    // Allow literal underscores/hyphens in handles without SQL wildcard matching.
    const handle = (url.searchParams.get("q") || "")
      .replace(/^@/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 30)
      .replace(/_/g, "\\_");
    const page = Math.min(
      1000,
      Math.max(0, Number(url.searchParams.get("page")) || 0),
    );
    let query = ctx
      .client!.from("profiles")
      .select(memberFields + ",bio")
      .order("username")
      .range(page * 24, page * 24 + 24);
    if (q || handle)
      query = query.or(
        `username.ilike.${handle || q}%,display_name.ilike.%${q || handle}%`,
      );
    const { data, error } = await query;
    check(error);
    return ctx.json({
      users: data?.slice(0, 24) || [],
      more: (data?.length || 0) > 24,
    });
  }
  const u = await user(ctx.client),
    db = admin(c);
  await rateLimit(db, req, "social:" + u.id, 180, 60);
  if (path[0] === "notifications") {
    if (path.length === 1 && req.method === "GET") {
      const before = url.searchParams.get("before");
      let query = ctx
        .client!.from("notifications")
        .select("id,kind,title,href,amount_cents,created_at,read_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(31);
      if (before)
        query = query.lt(
          "created_at",
          z.string().datetime({ offset: true }).parse(before),
        );
      const [list, count] = await Promise.all([
        query,
        ctx
          .client!.from("notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null),
      ]);
      check(list.error);
      check(count.error);
      return ctx.json({
        notifications: list.data?.slice(0, 30) || [],
        more: (list.data?.length || 0) > 30,
        unread: count.count || 0,
      });
    }
    if (path.length === 1 && req.method === "PATCH") {
      const b = z
        .object({ ids: z.array(uuid).min(1).max(100) })
        .strict()
        .parse(await body(req));
      const { error } = await db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", u.id)
        .in("id", b.ids)
        .is("read_at", null);
      check(error);
      return ctx.json({ ok: true });
    }
  }
  if (path[0] === "chat" && path.length === 1) {
    if (req.method === "GET") {
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(url.searchParams.get("page") || 0);
      const { data, error } = await db.rpc("market_chat_inbox", {
        p_actor: u.id,
        p_page: page,
      });
      check(error);
      return ctx.json(data);
    }
    if (req.method === "POST") {
      const b = z
        .object({ username: z.string().regex(/^@?[a-z0-9][a-z0-9_-]{2,29}$/) })
        .strict()
        .parse(await body(req));
      await rateLimit(db, req, "chat-start:" + u.id, 30, 3600);
      const { data: peer, error } = await ctx
        .client!.from("profiles")
        .select("id")
        .eq("username", b.username.replace(/^@/, ""))
        .maybeSingle();
      check(error);
      if (!peer || peer.id === u.id)
        throw new HttpError(400, "Choisissez un autre membre.");
      const result = await db.rpc("market_chat_start", {
        p_actor: u.id,
        p_peer: peer.id,
      });
      fail(result.error);
      return ctx.json({ id: result.data });
    }
  }
  if (path[0] === "chat" && path.length >= 2) {
    const cid = uuid.parse(path[1]);
    // RLS applies before private images are signed or any action is allowed.
    const { data: conversation, error } = await ctx
      .client!.from("conversations")
      .select("id,member_a,member_b")
      .eq("id", cid)
      .maybeSingle();
    check(error);
    if (!conversation) throw new HttpError(404, "Conversation introuvable.");
    if (path.length === 2 && req.method === "GET") {
      const peer =
        conversation.member_a === u.id
          ? conversation.member_b
          : conversation.member_a;
      const [profile, state, blocks] = await Promise.all([
        ctx
          .client!.from("profiles")
          .select(memberFields)
          .eq("id", peer)
          .single(),
        ctx
          .client!.from("conversation_members")
          .select("user_id,last_read_at,typing_until")
          .eq("conversation_id", cid),
        db
          .from("user_blocks")
          .select("user_id")
          .or(
            `and(user_id.eq.${u.id},blocked_id.eq.${peer}),and(user_id.eq.${peer},blocked_id.eq.${u.id})`,
          ),
      ]);
      check(profile.error);
      check(state.error);
      check(blocks.error);
      return ctx.json({
        id: cid,
        peer: profile.data,
        members: state.data,
        blocked_by_me: blocks.data?.some((b) => b.user_id === u.id),
        blocked_by_peer: blocks.data?.some((b) => b.user_id === peer),
      });
    }
    if (path[2] === "messages" && path.length === 3 && req.method === "GET") {
      let query = ctx
        .client!.from("messages")
        .select(
          "id,conversation_id,sender_id,body,image_path,reply_to,created_at,edited_at,deleted_at,reactions:message_reactions(user_id,emoji)",
        )
        .eq("conversation_id", cid)
        .order("id", { ascending: url.searchParams.has("after") })
        .limit(51);
      if (url.searchParams.has("before"))
        query = query.lt(
          "id",
          z.coerce
            .number()
            .pipe(messageId)
            .parse(url.searchParams.get("before")),
        );
      if (url.searchParams.has("after"))
        query = query.gt(
          "id",
          z.coerce
            .number()
            .pipe(messageId)
            .parse(url.searchParams.get("after")),
        );
      const known = url.searchParams.get("known");
      const ids = known
        ? z
            .array(z.coerce.number().pipe(messageId))
            .max(500)
            .parse(known.split(","))
        : [];
      const [latest, existing] = await Promise.all([
        query,
        ids.length
          ? ctx
              .client!.from("messages")
              .select(
                "id,conversation_id,sender_id,body,image_path,reply_to,created_at,edited_at,deleted_at,reactions:message_reactions(user_id,emoji)",
              )
              .eq("conversation_id", cid)
              .in("id", ids)
          : Promise.resolve({ data: [], error: null }),
      ]);
      check(latest.error);
      check(existing.error);
      const rows = latest.data || [],
        map = new Map(
          [...rows.slice(0, 50), ...(existing.data || [])].map((m) => [
            m.id,
            m,
          ]),
        );
      const values = [...map.values()].sort((a, b) => a.id - b.id);
      const paths = [
        ...new Set(
          values
            .filter((m) => m.image_path && !m.deleted_at)
            .map((m) => m.image_path as string),
        ),
      ];
      const signed = paths.length
        ? await db.storage.from("chat-images").createSignedUrls(paths, 600)
        : { data: [], error: null };
      check(signed.error);
      const images = new Map(
        (signed.data || []).map((p) => [p.path, p.signedUrl]),
      );
      const messages = values.map((m) => {
        const { image_path, ...safe } = m;
        return {
          ...safe,
          image_url: m.deleted_at ? null : images.get(image_path) || null,
        };
      });
      return ctx.json({ messages, more: rows.length > 50 });
    }
    if (path.length === 2 && req.method === "POST") {
      const b = z
        .discriminatedUnion("action", [
          z
            .object({
              action: z.literal("send"),
              client_id: uuid,
              body: z.string().trim().max(5000).default(""),
              image_path: z.string().max(220).optional(),
              reply_to: messageId.optional(),
            })
            .strict(),
          z
            .object({
              action: z.literal("edit"),
              message_id: messageId,
              body: z.string().trim().min(1).max(5000),
            })
            .strict(),
          z
            .object({ action: z.literal("delete"), message_id: messageId })
            .strict(),
          z
            .object({
              action: z.literal("react"),
              message_id: messageId,
              emoji: z.enum(["👍", "❤️", "😂", "😮", "😢", "🙏"]).nullable(),
            })
            .strict(),
          z
            .object({ action: z.literal("read"), message_id: messageId })
            .strict(),
          z
            .object({ action: z.literal("typing"), active: z.boolean() })
            .strict(),
          z.object({ action: z.enum(["block", "unblock"]) }).strict(),
        ])
        .parse(await body(req));
      if (b.action === "send") {
        await rateLimit(db, req, "chat-send:" + u.id, 45, 60);
        if (!b.body && !b.image_path)
          throw new HttpError(400, "Écrivez un message ou ajoutez une photo.");
        if (b.image_path) {
          const prefix = `${u.id}/${cid}/`,
            name = b.image_path.slice(prefix.length);
          if (
            !b.image_path.startsWith(prefix) ||
            !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name)
          )
            throw new HttpError(400, "Image invalide.");
          const { data, error } = await db.storage
            .from("chat-images")
            .list(prefix.slice(0, -1), { search: name, limit: 1 });
          check(error);
          if (!data?.some((f) => f.name === name))
            throw new HttpError(400, "Transférez à nouveau la photo.");
        }
      }
      const { action, ...data } = b;
      const result = await db.rpc("market_chat_action", {
        p_actor: u.id,
        p_conversation: cid,
        p_action: action,
        p_data: data,
      });
      fail(result.error);
      return ctx.json(result.data);
    }
  }
  throw new HttpError(404, "Page introuvable.");
}
