import { z } from "zod";
import { publicConfig } from "./config";
import { demoProducts } from "./demo";
import {
  productInput,
  profileInput,
  postInput,
  platformFee,
  uuid,
  safeReturn,
} from "./model";
import {
  admin,
  context,
  ready,
  paymentsReady,
  user,
  originGuard,
  rateLimit,
  stripe,
  requireAdmin,
  check,
  siteOrigin,
  adminEmails,
  HttpError,
  type Config,
} from "./server";
import { handleWebhook } from "./webhook";
import { emptyOverview, marketRange } from "./market";
const publicFields =
  "id,seller_id,slug,title,tagline,description,category,kind,engine,version,price_cents,currency,license,tags,requirements,setup,agent_count,status,created_at,listed_at,cover_url,profiles!products_seller_id_fkey(display_name,username,bio,avatar_url)";
// Posts on a public profile, with the presented listing when it is visible.
const postFields =
  "id,author_id,body,images,created_at,product:products(id,slug,title,tagline,kind,agent_count,engine,price_cents,currency,cover_url)";
const POSTS_PAGE = 10;
const orderFields =
  "id,product_id,product_title,product_version,license,amount_cents,total_cents,tax_cents,fee_cents,currency,status,created_at,paid_at,offer_id";
// Links sent by the Send Email hook (supabase/functions/send-email) and the
// Supabase templates verify a token hash of one of these types.
const OTP_TYPES = [
  "signup",
  "recovery",
  "email",
  "email_change",
  "magiclink",
  "invite",
] as const;
const isOtpType = (value: string | null): value is (typeof OTP_TYPES)[number] =>
  (OTP_TYPES as readonly string[]).includes(value || "");
const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  display_name: z.string().trim().min(2).max(60).optional(),
});
const parseBody = async (req: Request) => {
  const raw = await req.text();
  if (raw.length > 30000) throw new HttpError(413, "Requête trop volumineuse.");
  return JSON.parse(raw);
};
type DbError = { code?: string; message?: string } | null;
// Database functions raise English sentinels; buyers and sellers get a clear
// message, everything unexpected stays a generic failure.
function failOn(error: DbError, known: [RegExp, number, string][]) {
  if (!error) return;
  const text = error.message || "";
  for (const [pattern, status, message] of known)
    if (pattern.test(text) || pattern.test(error.code || ""))
      throw new HttpError(status, message);
  throw new HttpError(500, "Impossible de terminer cette action.");
}
const offerExpired = (o: { status: string; expires_at: string }) =>
  ["pending", "accepted"].includes(o.status) &&
  new Date(o.expires_at).getTime() < Date.now();
const packagePath = (userId: string, productId: string, value: string) =>
  new RegExp(
    `^${userId}/${productId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(zip|json)$`,
  ).test(value);
// Accepts ZIP archives and JSON object manifests; returns the stored type.
function inspectPackage(bytes: ArrayBuffer, ext: "zip" | "json") {
  if (ext === "zip") {
    const h = new Uint8Array(bytes);
    if (h[0] !== 0x50 || h[1] !== 0x4b || h[2] !== 3 || h[3] !== 4)
      throw new HttpError(400, "Archive ZIP invalide.");
    return "application/zip";
  }
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes));
    if (!v || typeof v !== "object" || Array.isArray(v)) throw 0;
  } catch {
    throw new HttpError(400, "Le manifeste JSON doit être un objet valide.");
  }
  return "application/json";
}
async function sha256(bytes: ArrayBuffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
// Public images are recognized by their signature, never by the declared
// type: JPEG, PNG and WebP only (an SVG can carry scripts).
async function readImage(req: Request) {
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Requête invalide.");
  });
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 12 || file.size > 3145728)
    throw new HttpError(
      400,
      "Choisissez une image JPG, PNG ou WebP de 3 Mo maximum.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (from: number, to: number) =>
    new TextDecoder().decode(bytes.slice(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { bytes, ext: "jpg", mime: "image/jpeg" };
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return { bytes, ext: "png", mime: "image/png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return { bytes, ext: "webp", mime: "image/webp" };
  throw new HttpError(
    400,
    "Format d’image invalide. Les SVG ne sont pas acceptés.",
  );
}
// Camera photos carry EXIF/XMP blocks (often the GPS position) and IPTC data.
// A public profile keeps only what is needed to display the picture.
export function stripJpegMetadata(input: Uint8Array) {
  const keep: Uint8Array[] = [input.subarray(0, 2)];
  let i = 2;
  while (i + 1 < input.length && input[i] === 0xff) {
    const marker = input[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      keep.push(input.subarray(i, i + 2)); // markers without a length
      i += 2;
      continue;
    }
    // Start of scan (image data follows) or end of image.
    if (marker === 0xda || marker === 0xd9 || i + 4 > input.length) break;
    const end = i + 2 + ((input[i + 2] << 8) | input[i + 3]);
    if (end < i + 4 || end > input.length) break;
    // APP1 (EXIF, XMP), APP13 (IPTC) and comments are dropped.
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe)
      keep.push(input.subarray(i, end));
    i = end;
  }
  keep.push(input.subarray(i));
  const output = new Uint8Array(keep.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of keep) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
type Media = ReturnType<ReturnType<typeof admin>["storage"]["from"]>;
type MediaFolder = "avatar" | "banner" | "posts";
const MEDIA_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
// Storage key of a profile-media URL this server issued for this owner and
// folder; anything else (another member's file, an outside URL) gives null.
function mediaKey(media: Media, url: unknown, owner: string, folder: MediaFolder) {
  if (typeof url !== "string") return null;
  const dir = `${owner}/${folder}/`;
  const prefix = media.getPublicUrl(dir + "x").data.publicUrl.slice(0, -1);
  const name = url.startsWith(prefix) ? url.slice(prefix.length) : "";
  return MEDIA_FILE.test(name) ? dir + name : null;
}
async function uploadMedia(
  media: Media,
  req: Request,
  owner: string,
  folder: MediaFolder,
) {
  const image = await readImage(req);
  const bytes =
    image.ext === "jpg" ? stripJpegMetadata(image.bytes) : image.bytes;
  const key = `${owner}/${folder}/${crypto.randomUUID()}.${image.ext}`;
  const { error } = await media.upload(key, bytes, {
    contentType: image.mime,
    upsert: false,
  });
  check(error, "Le transfert de l’image a échoué.");
  return { key, url: media.getPublicUrl(key).data.publicUrl };
}
async function creatorPosts(
  client: NonNullable<ReturnType<typeof context>["client"]>,
  author: string,
  before?: string,
) {
  let query = client
    .from("posts")
    .select(postFields)
    .eq("author_id", author)
    .order("created_at", { ascending: false })
    .limit(POSTS_PAGE + 1);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  const rows = data || [];
  return {
    error,
    posts: rows.slice(0, POSTS_PAGE),
    more: rows.length > POSTS_PAGE,
  };
}
export async function marketApi(req: Request, c: Config) {
  const ctx = context(req, c);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\//, "").split("/");
  const route = path.join("/");
  // No API route ends with an HTML extension. Proxies that emulate "pretty
  // URLs" retry a 404 as /path.html; answer those without side effects.
  if (/\.html?$/i.test(url.pathname))
    return ctx.json({ error: "Page introuvable.", code: "not_found" }, 404);
  try {
    if (route === "webhooks/stripe" && req.method === "POST")
      return await handleWebhook(req, c);
    originGuard(req);
    if (route === "config" && req.method === "GET")
      return ctx.json(publicConfig(c));
    if (route === "catalog" && req.method === "GET") {
      if (!ready(c))
        return ctx.json({
          products: demoProducts,
          total: demoProducts.length,
          demo: true,
        });
      const db = ctx.client!;
      const page = Math.max(
        0,
        Math.min(10000, Number(url.searchParams.get("page")) || 0),
      );
      let query = db
        .from("products")
        .select(publicFields, { count: "exact" })
        .eq("status", "published");
      const ids = url.searchParams.get("ids");
      if (ids) {
        const values = z.array(uuid).max(200).parse(ids.split(","));
        query = query.in("id", values);
      }
      const q = (url.searchParams.get("q") || "")
        .trim()
        .slice(0, 100)
        .replace(/[^\p{L}\p{N} _-]/gu, "");
      if (q) query = query.or(`title.ilike.%${q}%,tagline.ilike.%${q}%`);
      for (const key of ["category", "kind", "engine"]) {
        const val = url.searchParams.get(key);
        if (val && val !== "all" && val !== "Tout") query = query.eq(key, val);
      }
      const sort = url.searchParams.get("sort");
      query = sort?.startsWith("price")
        ? query.order("price_cents", { ascending: sort === "price-asc" })
        : sort === "listed"
          ? query.order("listed_at", { ascending: false, nullsFirst: false })
          : query.order("created_at", { ascending: false });
      const { data, count, error } = await query
        .order("id")
        .range(page * 24, page * 24 + 23);
      check(error);
      return ctx.json({ products: data, total: count, demo: false });
    }
    if (path[0] === "products" && path.length === 2 && req.method === "GET") {
      if (!ready(c)) {
        const p = demoProducts.find(
          (p) => p.slug === path[1] || p.id === path[1],
        );
        if (!p) throw new HttpError(404, "Agent introuvable.");
        return ctx.json({ product: p, reviews: [] });
      }
      const { data, error } = await ctx
        .client!.from("products")
        .select(publicFields)
        .eq("slug", path[1])
        .maybeSingle();
      check(error);
      if (!data) throw new HttpError(404, "Agent introuvable.");
      const live = data.status === "published";
      const market = admin(c);
      const [{ data: reviews }, stats, activity] = await Promise.all([
        ctx
          .client!.from("reviews")
          .select(
            "rating,body,created_at,profiles!reviews_user_id_fkey(display_name,username)",
          )
          .eq("product_id", data.id)
          .order("created_at", { ascending: false })
          .limit(50),
        live
          ? market.rpc("market_product_stats", { p_ids: [data.id] })
          : Promise.resolve({ data: null, error: null }),
        live
          ? market.rpc("market_activity", {
              p_product: data.id,
              p_seller: null,
              p_limit: 25,
            })
          : Promise.resolve({ data: [], error: null }),
      ]);
      // A signed-in visitor sees whether this product is already theirs.
      let owned = false;
      if (live) {
        const {
          data: { user: viewer },
        } = await ctx.client!.auth.getUser();
        if (viewer) {
          const { data: mine } = await market
            .from("orders")
            .select("id")
            .eq("buyer_id", viewer.id)
            .eq("product_id", data.id)
            .in("status", ["paid", "partially_refunded"])
            .limit(1);
          owned = !!mine?.length;
        }
      }
      // Market data enriches the page; its absence never hides the product.
      return ctx.json({
        product: data,
        reviews: reviews || [],
        stats: (stats.data as Record<string, unknown> | null)?.[data.id] ?? null,
        activity: activity.error ? [] : activity.data || [],
        owned,
      });
    }
    if (route === "creators" && req.method === "GET") {
      if (!ready(c)) {
        const map = new Map();
        demoProducts.forEach((p) => {
          const old = map.get(p.seller_id);
          map.set(p.seller_id, {
            ...p.profiles,
            count: (old?.count || 0) + 1,
            demo: true,
          });
        });
        return ctx.json({ creators: [...map.values()], total: map.size });
      }
      const page = Math.max(
        0,
        Math.min(10000, Number(url.searchParams.get("page")) || 0),
      );
      const { data, count, error } = await ctx
        .client!.from("profiles")
        .select("id,display_name,username,bio,website,avatar_url,banner_url,products!products_seller_id_fkey!inner(id)", {
          count: "exact",
        })
        .eq("products.status", "published")
        .order("created_at", { ascending: false })
        .range(page * 24, page * 24 + 23);
      check(error);
      return ctx.json({
        creators: data?.map((p) => ({ ...p, count: p.products.length })),
        total: count,
      });
    }
    if (path[0] === "creators" && path.length === 2 && req.method === "GET") {
      if (!ready(c)) {
        const products = demoProducts.filter(
          (p) => p.profiles?.username === path[1],
        );
        if (!products.length) throw new HttpError(404, "Créateur introuvable.");
        return ctx.json({
          profile: {
            ...products[0].profiles,
            bio:
              products[0].profiles?.bio ||
              "Créateur de démonstration. Découvrez les possibilités du marketplace.",
          },
          products,
          demo: true,
        });
      }
      const { data: profile, error } = await ctx
        .client!.from("profiles")
        .select("*")
        .eq("username", path[1])
        .maybeSingle();
      check(error);
      if (!profile) throw new HttpError(404, "Créateur introuvable.");
      const { data: products, error: pe } = await ctx
        .client!.from("products")
        .select(publicFields)
        .eq("seller_id", profile.id)
        .eq("status", "published")
        .limit(100);
      check(pe);
      const market = admin(c);
      const [stats, activity, feed] = await Promise.all([
        market.rpc("market_creator_stats", { p_seller: profile.id }),
        market.rpc("market_activity", {
          p_product: null,
          p_seller: profile.id,
          p_limit: 25,
        }),
        creatorPosts(ctx.client!, profile.id),
      ]);
      return ctx.json({
        profile,
        products,
        stats: stats.error ? null : stats.data,
        activity: activity.error ? [] : activity.data || [],
        // Enrichment: a failure leaves the profile readable without posts.
        posts: feed.error ? [] : feed.posts,
        more_posts: !feed.error && feed.more,
      });
    }
    if (
      path[0] === "creators" &&
      path.length === 3 &&
      path[2] === "posts" &&
      req.method === "GET"
    ) {
      if (!ready(c)) return ctx.json({ posts: [], more: false });
      // "+" of a timezone offset arrives as a space when left unencoded.
      const before = z
        .string()
        .datetime({ offset: true })
        .parse((url.searchParams.get("before") || "").replace(" ", "+"));
      const { data: profile, error } = await ctx
        .client!.from("profiles")
        .select("id")
        .eq("username", path[1])
        .maybeSingle();
      check(error);
      if (!profile) throw new HttpError(404, "Créateur introuvable.");
      const feed = await creatorPosts(ctx.client!, profile.id, before);
      check(feed.error);
      return ctx.json({ posts: feed.posts, more: feed.more });
    }
    if (path[0] === "market" && path.length === 2 && req.method === "GET") {
      const range = marketRange(url.searchParams.get("range"));
      const limit = Math.max(
        1,
        Math.min(100, Number(url.searchParams.get("limit")) || 30),
      );
      if (!ready(c)) {
        // Preview mode: an empty, honest market instead of invented numbers.
        if (path[1] === "overview")
          return ctx.json({
            overview: emptyOverview(range.days),
            range: range.key,
            demo: true,
          });
        if (["activity", "leaderboard", "trending"].includes(path[1]))
          return ctx.json({
            [path[1] === "trending" ? "products" : path[1] === "activity" ? "events" : "creators"]: [],
            range: range.key,
            demo: true,
          });
      }
      const market = admin(c);
      if (path[1] === "overview") {
        const { data, error } = await market.rpc("market_overview", {
          p_days: range.days,
        });
        check(error);
        return ctx.json({ overview: data, range: range.key });
      }
      if (path[1] === "activity") {
        const { data, error } = await market.rpc("market_activity", {
          p_product: null,
          p_seller: null,
          p_limit: limit,
        });
        check(error);
        return ctx.json({ events: data || [] });
      }
      if (path[1] === "leaderboard") {
        const { data, error } = await market.rpc("market_leaderboard", {
          p_days: range.days,
          p_limit: Math.min(limit, 50),
        });
        check(error);
        return ctx.json({ creators: data || [], range: range.key });
      }
      if (path[1] === "trending") {
        const { data: ranked, error } = await market.rpc("market_trending", {
          p_days: range.days,
          p_limit: Math.min(limit, 24),
        });
        check(error);
        const rows = (ranked || []) as {
          id: string;
          acquisitions: number;
          volume_cents: number;
          favorites: number;
          offers: number;
        }[];
        if (!rows.length) return ctx.json({ products: [], range: range.key });
        const { data: products, error: pe } = await ctx
          .client!.from("products")
          .select(publicFields)
          .eq("status", "published")
          .in(
            "id",
            rows.map((r) => r.id),
          );
        check(pe);
        const byId = new Map(
          ((products || []) as unknown as { id: string }[]).map((p) => [p.id, p]),
        );
        return ctx.json({
          products: rows
            .filter((r) => byId.has(r.id))
            .map((r) => ({ ...byId.get(r.id), market: r })),
          range: range.key,
        });
      }
    }
    if (route === "me" && req.method === "GET") {
      if (!ctx.client) return ctx.json({ user: null });
      const {
        data: { user: u },
      } = await ctx.client.auth.getUser();
      if (!u) return ctx.json({ user: null });
      const db = admin(c);
      const [{ data: profile }, { data: seller }, { data: role }] =
        await Promise.all([
          ctx.client.from("profiles").select("*").eq("id", u.id).single(),
          db
            .from("seller_accounts")
            .select("charges_enabled,payouts_enabled")
            .eq("user_id", u.id)
            .maybeSingle(),
          db
            .from("market_admins")
            .select("user_id")
            .eq("user_id", u.id)
            .maybeSingle(),
        ]);
      let isAdmin = !!role;
      // The owner's mailbox is the trust anchor: a confirmed address listed in
      // MARKET_ADMIN_EMAILS becomes a moderator; browsers cannot grant this.
      if (
        !isAdmin &&
        u.email &&
        u.email_confirmed_at &&
        adminEmails(c).includes(u.email.toLowerCase())
      ) {
        const { error } = await db
          .from("market_admins")
          .upsert(
            { user_id: u.id },
            { onConflict: "user_id", ignoreDuplicates: true },
          );
        if (!error) {
          isAdmin = true;
          await db.from("audit_log").insert({
            actor: u.id,
            action: "admin.bootstrap",
            target: u.id,
          });
        }
      }
      return ctx.json({
        user: { id: u.id, email: u.email },
        profile,
        seller,
        isAdmin,
      });
    }
    if (route.startsWith("auth/")) {
      const db = admin(c);
      await rateLimit(
        db,
        req,
        "auth:" + route,
        route === "auth/recover" ? 5 : 15,
        600,
      );
      if (route === "auth/github" && req.method === "GET") {
        if (c.GITHUB_AUTH_ENABLED !== "true")
          throw new HttpError(
            503,
            "La connexion GitHub sera disponible au lancement.",
          );
        const { data, error } = await ctx.client!.auth.signInWithOAuth({
          provider: "github",
          options: {
            redirectTo: siteOrigin(c, req) + "/api/auth/callback",
            skipBrowserRedirect: true,
          },
        });
        check(error);
        return ctx.redirect(data.url!);
      }
      if (route === "auth/callback" && req.method === "GET") {
        let error;
        const code = url.searchParams.get("code");
        const token = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        if (code)
          ({ error } = await ctx.client!.auth.exchangeCodeForSession(code));
        else if (token && isOtpType(type))
          ({ error } = await ctx.client!.auth.verifyOtp({
            token_hash: token,
            type,
          }));
        else return ctx.redirect("/?auth=invalid");
        if (error) return ctx.redirect("/?auth=invalid");
        return ctx.redirect(
          type === "recovery"
            ? "/settings?reset=1"
            : safeReturn(url.searchParams.get("next")),
        );
      }
      if (req.method !== "POST")
        throw new HttpError(405, "Méthode non autorisée.");
      if (route === "auth/logout") {
        await ctx.client!.auth.signOut();
        return ctx.json({ ok: true });
      }
      if (route === "auth/recover") {
        const { email } = z
          .object({ email: z.string().email() })
          .parse(await parseBody(req));
        // Email templates link to the server callback with a token hash; the
        // PKCE fallback (default templates) also returns through the callback.
        await ctx.client!.auth.resetPasswordForEmail(email, {
          redirectTo:
            siteOrigin(c, req) +
            "/api/auth/callback?next=" +
            encodeURIComponent("/settings?reset=1"),
        });
        return ctx.json({
          message:
            "Si ce courriel est associé à un compte, un lien de récupération vous a été envoyé.",
        });
      }
      if (route === "auth/password") {
        await user(ctx.client);
        const { password } = z
          .object({ password: z.string().min(12).max(128) })
          .parse(await parseBody(req));
        const { error } = await ctx.client!.auth.updateUser({ password });
        check(
          error,
          "Impossible de modifier ce mot de passe. Réauthentifiez-vous.",
        );
        return ctx.json({ message: "Mot de passe mis à jour." });
      }
      if (route === "auth/signup") {
        const b = credentials.parse(await parseBody(req));
        const { error } = await ctx.client!.auth.signUp({
          email: b.email,
          password: b.password,
          options: {
            data: { display_name: b.display_name || "Développeur" },
            emailRedirectTo: siteOrigin(c, req) + "/api/auth/callback",
          },
        });
        if (error)
          throw new HttpError(
            400,
            "Inscription impossible. Vérifiez vos informations ou réessayez plus tard.",
          );
        return ctx.json({
          message:
            "Vérifiez votre courriel pour confirmer votre compte avant de vous connecter.",
        });
      }
      if (route === "auth/login") {
        const b = z
          .object({
            email: z.string().email(),
            password: z.string().min(1).max(128),
          })
          .parse(await parseBody(req));
        const { error } = await ctx.client!.auth.signInWithPassword(b);
        if (error)
          throw new HttpError(
            401,
            "Courriel ou mot de passe incorrect, ou courriel non confirmé.",
          );
        return ctx.json({ ok: true });
      }
      throw new HttpError(404, "Page introuvable.");
    }
    const u = await user(ctx.client);
    const db = admin(c);
    await rateLimit(db, req, "user:" + u.id, 120, 60);
    if (route === "profile" && req.method === "PATCH") {
      const b = profileInput.parse(await parseBody(req));
      const { error } = await ctx
        .client!.from("profiles")
        .update(b)
        .eq("id", u.id);
      if (error?.code === "23505")
        throw new HttpError(409, "Ce nom de profil est déjà utilisé.");
      check(error);
      return ctx.json({ ok: true });
    }
    if (
      (route === "profile/avatar" || route === "profile/banner") &&
      ["POST", "DELETE"].includes(req.method)
    ) {
      const folder = path[1] as "avatar" | "banner";
      const field = folder === "avatar" ? "avatar_url" : "banner_url";
      const media = db.storage.from("profile-media");
      const { data: current, error } = await db
        .from("profiles")
        .select("avatar_url,banner_url")
        .eq("id", u.id)
        .single();
      check(error);
      let image: { key: string; url: string } | null = null;
      if (req.method === "POST") {
        await rateLimit(db, req, "media:" + u.id, 40, 3600);
        image = await uploadMedia(media, req, u.id, folder);
      }
      const { error: ue } = await db
        .from("profiles")
        .update({ [field]: image?.url ?? null })
        .eq("id", u.id);
      if (ue) {
        if (image) await media.remove([image.key]);
        check(ue);
      }
      // The replaced picture is no longer shown anywhere.
      const previous = mediaKey(media, current?.[field], u.id, folder);
      if (previous) await media.remove([previous]);
      return ctx.json({ url: image?.url ?? null });
    }
    if (route === "posts/images" && req.method === "POST") {
      await rateLimit(db, req, "media:" + u.id, 40, 3600);
      const image = await uploadMedia(
        db.storage.from("profile-media"),
        req,
        u.id,
        "posts",
      );
      return ctx.json({ url: image.url }, 201);
    }
    if (route === "posts" && req.method === "POST") {
      const b = postInput.parse(await parseBody(req));
      const images = [...new Set(b.images)];
      if (!b.body && !images.length && !b.product_id)
        throw new HttpError(
          400,
          "Écrivez un message, ajoutez une photo ou un agent à présenter.",
        );
      const media = db.storage.from("profile-media");
      if (images.some((url) => !mediaKey(media, url, u.id, "posts")))
        throw new HttpError(
          400,
          "Ajoutez les photos depuis le formulaire de publication.",
        );
      if (b.product_id) {
        const { data: listed, error } = await db
          .from("products")
          .select("id")
          .eq("id", b.product_id)
          .eq("seller_id", u.id)
          .eq("status", "published")
          .maybeSingle();
        check(error);
        if (!listed)
          throw new HttpError(
            400,
            "Choisissez un de vos agents ou bundles publiés.",
          );
      }
      await rateLimit(db, req, "post:" + u.id, 20, 3600);
      const { data: post, error } = await db
        .from("posts")
        .insert({
          author_id: u.id,
          body: b.body,
          product_id: b.product_id,
          images,
        })
        .select(postFields)
        .single();
      check(error);
      return ctx.json({ post }, 201);
    }
    if (path[0] === "posts" && path.length === 2 && req.method === "DELETE") {
      const id = uuid.parse(path[1]);
      const { data: post, error } = await db
        .from("posts")
        .select("id,author_id,images")
        .eq("id", id)
        .maybeSingle();
      check(error);
      if (!post) throw new HttpError(404, "Publication introuvable.");
      // Authors delete their posts; moderators remove anyone's, on record.
      const moderated = post.author_id !== u.id;
      if (moderated) await requireAdmin(db, u.id);
      const { error: de } = await db.from("posts").delete().eq("id", id);
      check(de);
      const media = db.storage.from("profile-media");
      const keys = (post.images as string[])
        .map((url) => mediaKey(media, url, post.author_id, "posts"))
        .filter((key): key is string => !!key);
      if (keys.length) await media.remove(keys);
      if (moderated)
        await db.from("audit_log").insert({
          actor: u.id,
          action: "post.removed",
          target: id,
          detail: { author: post.author_id },
        });
      return ctx.json({ ok: true });
    }
    if (route === "favorites" && req.method === "GET") {
      const { data, error } = await ctx
        .client!.from("favorites")
        .select("product_id")
        .eq("user_id", u.id);
      check(error);
      return ctx.json({ ids: data?.map((v) => v.product_id) || [] });
    }
    if (route === "favorites" && ["POST", "DELETE"].includes(req.method)) {
      const b = z.object({ product_id: uuid }).parse(await parseBody(req));
      const { error } =
        req.method === "POST"
          ? await ctx
              .client!.from("favorites")
              .upsert(
                { user_id: u.id, product_id: b.product_id },
                { onConflict: "user_id,product_id", ignoreDuplicates: true },
              )
          : await ctx
              .client!.from("favorites")
              .delete()
              .eq("user_id", u.id)
              .eq("product_id", b.product_id);
      check(error);
      return ctx.json({ ok: true });
    }
    if (route === "studio" && req.method === "GET") {
      const page = Math.max(
        0,
        Math.min(10000, Number(url.searchParams.get("page")) || 0),
      );
      const salesPage = Math.max(
        0,
        Math.min(10000, Number(url.searchParams.get("salesPage")) || 0),
      );
      const [
        { data: products, error: pe },
        { data: orders, error: oe },
        { data: seller, error: se },
        { data: stats, error: ste },
      ] = await Promise.all([
        db
          .from("products")
          .select("*,product_files(original_name,size_bytes,version,sha256)")
          .eq("seller_id", u.id)
          .order("created_at", { ascending: false })
          .range(page * 12, page * 12 + 11),
        db
          .from("orders")
          .select(orderFields)
          .eq("seller_id", u.id)
          .order("created_at", { ascending: false })
          .range(salesPage * 12, salesPage * 12 + 11),
        db
          .from("seller_accounts")
          .select("charges_enabled,payouts_enabled")
          .eq("user_id", u.id)
          .maybeSingle(),
        db.rpc("market_seller_stats", { p_seller: u.id }),
      ]);
      check(pe || oe || se || ste);
      return ctx.json({ products, orders, seller, stats });
    }
    if (path[0] === "studio" && path.length === 2 && req.method === "GET") {
      const id = uuid.parse(path[1]);
      const { data: product, error } = await db
        .from("products")
        .select("*,product_files(original_name,size_bytes,version,sha256)")
        .eq("id", id)
        .eq("seller_id", u.id)
        .maybeSingle();
      check(error);
      if (!product) throw new HttpError(404, "Produit introuvable.");
      return ctx.json({ product });
    }
    if (route === "products" && req.method === "POST") {
      const b = productInput.parse(await parseBody(req));
      if (b.status !== "draft")
        throw new HttpError(
          400,
          "Enregistrez un brouillon et ajoutez le fichier avant de soumettre.",
        );
      const id = crypto.randomUUID();
      const slug =
        b.title
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") +
        "-" +
        id.slice(0, 8);
      const { data, error } = await db
        .from("products")
        .insert({ ...b, id, slug, seller_id: u.id })
        .select()
        .single();
      check(error);
      return ctx.json({ product: data }, 201);
    }
    if (
      path[0] === "products" &&
      path.length >= 2 &&
      ["PATCH", "POST"].includes(req.method)
    ) {
      const id = uuid.parse(path[1]);
      const { data: p, error } = await db
        .from("products")
        .select("*")
        .eq("id", id)
        .eq("seller_id", u.id)
        .maybeSingle();
      check(error);
      if (!p) throw new HttpError(404, "Produit introuvable.");
      if (path.length === 2 && req.method === "PATCH") {
        const b = productInput.parse(await parseBody(req));
        if (b.status === "pending") {
          const { data: f } = await db
            .from("product_files")
            .select("version")
            .eq("product_id", id)
            .maybeSingle();
          if (!f || f.version !== b.version)
            throw new HttpError(
              400,
              "Ajoutez le fichier correspondant à cette version avant la soumission.",
            );
        }
        const { error } = await db.rpc("market_save_product", {
          p_id: id,
          p_seller: u.id,
          p_data: b,
        });
        if (error)
          throw new HttpError(
            409,
            "Le produit a changé. Vérifiez le package et réessayez.",
          );
        return ctx.json({ ok: true });
      }
      if (path.length === 3 && path[2] === "price" && req.method === "POST") {
        const b = z
          .object({ price_cents: z.number().int().min(0).max(1000000) })
          .strict()
          .parse(await parseBody(req));
        const { error } = await db.rpc("market_set_price", {
          p_id: id,
          p_seller: u.id,
          p_price: b.price_cents,
        });
        failOn(error, [
          [
            /reviewed products/,
            409,
            "Le prix d’un brouillon se modifie dans l’éditeur.",
          ],
          [/not owned/, 404, "Produit introuvable."],
          [/Invalid price/, 400, "Prix invalide."],
        ]);
        return ctx.json({ ok: true, price_cents: b.price_cents });
      }
      if (
        path.length === 3 &&
        path[2] === "listing" &&
        req.method === "POST"
      ) {
        const b = z
          .object({ action: z.enum(["pause", "resume"]) })
          .strict()
          .parse(await parseBody(req));
        const { error } = await db.rpc("market_set_listing", {
          p_id: id,
          p_seller: u.id,
          p_action: b.action,
        });
        failOn(error, [
          [
            /Review required/,
            409,
            "Cette version doit être validée avant de revenir dans le catalogue.",
          ],
          [/published listing/, 409, "Seule une annonce en ligne peut être mise en pause."],
          [/paused listing/, 409, "Cette annonce n’est pas en pause."],
          [/not owned/, 404, "Produit introuvable."],
        ]);
        return ctx.json({ ok: true, status: b.action === "pause" ? "archived" : "published" });
      }
      // Packages go straight from the browser to private Storage with a
      // one-time signed URL, then the server verifies them before attaching.
      if (
        path.length === 4 &&
        path[2] === "file" &&
        path[3] === "upload" &&
        req.method === "POST"
      ) {
        if (!["draft", "rejected"].includes(p.status))
          throw new HttpError(
            409,
            "Repassez le produit en brouillon avant de remplacer son fichier.",
          );
        const b = z
          .object({
            name: z.string().trim().min(5).max(200),
            size: z.number().int().min(1).max(20971520),
          })
          .strict()
          .parse(await parseBody(req));
        const lower = b.name.toLowerCase();
        const ext = lower.endsWith(".zip")
          ? "zip"
          : lower.endsWith(".json")
            ? "json"
            : null;
        if (!ext)
          throw new HttpError(
            400,
            "Seuls les fichiers ZIP et JSON sont acceptés.",
          );
        const storagePath = `${u.id}/${id}/${crypto.randomUUID()}.${ext}`;
        const { data, error } = await db.storage
          .from("agent-packages")
          .createSignedUploadUrl(storagePath);
        check(error, "Le transfert du fichier n’a pas pu être préparé.");
        return ctx.json({
          url: data!.signedUrl,
          path: storagePath,
          contentType: ext === "zip" ? "application/zip" : "application/json",
        });
      }
      if (
        path.length === 4 &&
        path[2] === "file" &&
        path[3] === "attach" &&
        req.method === "POST"
      ) {
        if (!["draft", "rejected"].includes(p.status))
          throw new HttpError(
            409,
            "Repassez le produit en brouillon avant de remplacer son fichier.",
          );
        const b = z
          .object({
            path: z.string().max(300),
            name: z.string().trim().min(1).max(200),
          })
          .strict()
          .parse(await parseBody(req));
        if (!packagePath(u.id, id, b.path))
          throw new HttpError(400, "Fichier de package invalide.");
        const bucket = db.storage.from("agent-packages");
        const { data: blob, error: de } = await bucket.download(b.path);
        if (de || !blob)
          throw new HttpError(
            400,
            "Le fichier transféré est introuvable. Recommencez le transfert.",
          );
        const bytes = await blob.arrayBuffer();
        const ext = b.path.endsWith(".zip") ? "zip" : "json";
        let sha = "";
        try {
          if (bytes.byteLength < 1 || bytes.byteLength > 20971520)
            throw new HttpError(
              400,
              "Ajoutez un ZIP ou un manifeste JSON, de 20 Mo maximum.",
            );
          inspectPackage(bytes, ext);
          sha = await sha256(bytes);
        } catch (e) {
          await bucket.remove([b.path]);
          throw e;
        }
        const { error: saveError } = await db.rpc("market_attach_file", {
          p_id: id,
          p_seller: u.id,
          p_path: b.path,
          p_name: b.name.slice(0, 200),
          p_size: bytes.byteLength,
          p_sha: sha,
          p_version: p.version,
        });
        if (saveError) {
          await bucket.remove([b.path]);
          throw new HttpError(
            409,
            "Le produit a changé pendant le transfert. Enregistrez le brouillon et recommencez.",
          );
        }
        return ctx.json({
          ok: true,
          name: b.name,
          size: bytes.byteLength,
          sha256: sha,
        });
      }
      if (path.length === 3 && path[2] === "cover" && req.method === "POST") {
        const { bytes, ext, mime } = await readImage(req);
        const key = `${u.id}/${id}/${crypto.randomUUID()}.${ext}`;
        const { error: ce } = await db.storage
          .from("product-covers")
          .upload(key, bytes, { contentType: mime, upsert: false });
        check(ce, "Le transfert de la couverture a échoué.");
        const { data: image } = db.storage
          .from("product-covers")
          .getPublicUrl(key);
        const { error: ue } = await db
          .from("products")
          .update({
            cover_url: image.publicUrl,
            status: "draft",
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("seller_id", u.id);
        if (ue) {
          await db.storage.from("product-covers").remove([key]);
          check(ue);
        }
        return ctx.json({ url: image.publicUrl });
      }
      if (path.length === 3 && path[2] === "file" && req.method === "POST") {
        if (!["draft", "rejected"].includes(p.status))
          throw new HttpError(
            409,
            "Repassez le produit en brouillon avant de remplacer son fichier.",
          );
        const form = await req.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size < 1 || file.size > 20971520)
          throw new HttpError(
            400,
            "Ajoutez un ZIP ou un manifeste JSON, de 20 Mo maximum.",
          );
        const ext = file.name.toLowerCase().endsWith(".zip")
          ? "zip"
          : file.name.toLowerCase().endsWith(".json")
            ? "json"
            : null;
        if (!ext)
          throw new HttpError(
            400,
            "Seuls les fichiers ZIP et JSON sont acceptés.",
          );
        const bytes = await file.arrayBuffer();
        if (ext === "zip") {
          const h = new Uint8Array(bytes);
          if (h[0] !== 0x50 || h[1] !== 0x4b || h[2] !== 3 || h[3] !== 4)
            throw new HttpError(400, "Archive ZIP invalide.");
        } else {
          try {
            const v = JSON.parse(new TextDecoder().decode(bytes));
            if (!v || typeof v !== "object" || Array.isArray(v)) throw 0;
          } catch {
            throw new HttpError(
              400,
              "Le manifeste JSON doit être un objet valide.",
            );
          }
        }
        const sha = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
        const storagePath = `${u.id}/${id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await db.storage
          .from("agent-packages")
          .upload(storagePath, bytes, {
            contentType: ext === "zip" ? "application/zip" : "application/json",
            upsert: false,
          });
        check(uploadError, "Le transfert du fichier a échoué.");
        const { error: saveError } = await db.rpc("market_attach_file", {
          p_id: id,
          p_seller: u.id,
          p_path: storagePath,
          p_name: file.name.slice(0, 200),
          p_size: file.size,
          p_sha: sha,
          p_version: p.version,
        });
        if (saveError) {
          await db.storage.from("agent-packages").remove([storagePath]);
          check(saveError);
        }
        return ctx.json({
          ok: true,
          name: file.name,
          size: file.size,
          sha256: sha,
        });
      }
    }
    if (route === "connect/onboard" && req.method === "POST") {
      const st = stripe(c);
      let { data: seller } = await db
        .from("seller_accounts")
        .select("*")
        .eq("user_id", u.id)
        .maybeSingle();
      if (!seller) {
        const account = await st.accounts.create(
          {
            country: "CA",
            email: u.email,
            controller: {
              fees: { payer: "application" },
              losses: { payments: "application" },
              stripe_dashboard: { type: "express" },
              requirement_collection: "stripe",
            },
            capabilities: {
              card_payments: { requested: true },
              transfers: { requested: true },
            },
            metadata: { user_id: u.id },
          },
          { idempotencyKey: "seller-" + u.id },
        );
        const { error } = await db
          .from("seller_accounts")
          .upsert(
            { user_id: u.id, stripe_account_id: account.id },
            { onConflict: "user_id" },
          );
        check(error);
        seller = { stripe_account_id: account.id };
      }
      const link = await st.accountLinks.create({
        account: seller.stripe_account_id,
        refresh_url: siteOrigin(c, req) + "/studio?connect=refresh",
        return_url: siteOrigin(c, req) + "/studio?connect=returned",
        type: "account_onboarding",
      });
      return ctx.json({ url: link.url });
    }
    if (route === "connect/status" && req.method === "POST") {
      const { data: s } = await db
        .from("seller_accounts")
        .select("*")
        .eq("user_id", u.id)
        .maybeSingle();
      if (!s) return ctx.json({ seller: null });
      const a = await stripe(c).accounts.retrieve(s.stripe_account_id);
      const seller = {
        charges_enabled: a.charges_enabled,
        payouts_enabled: a.payouts_enabled,
      };
      const { error } = await db
        .from("seller_accounts")
        .update({ ...seller, updated_at: new Date().toISOString() })
        .eq("user_id", u.id);
      check(error);
      return ctx.json({ seller });
    }
    if (route === "connect/dashboard" && req.method === "POST") {
      const { data: s } = await db
        .from("seller_accounts")
        .select("stripe_account_id")
        .eq("user_id", u.id)
        .maybeSingle();
      if (!s) throw new HttpError(400, "Activez d’abord votre compte vendeur.");
      const link = await stripe(c).accounts.createLoginLink(
        s.stripe_account_id,
      );
      return ctx.json({ url: link.url });
    }
    if (route === "checkout" && req.method === "POST") {
      if (c.LAUNCH_READY !== "true")
        throw new HttpError(
          503,
          "Les achats ouvriront au lancement du marketplace.",
        );
      const b = z
        .object({
          product_id: uuid,
          license_accepted: z.literal(true),
          offer_id: uuid.optional(),
        })
        .parse(await parseBody(req));
      const { data: p, error } = await db
        .from("products")
        .select("*,product_files(*)")
        .eq("id", b.product_id)
        .eq("status", "published")
        .maybeSingle();
      check(error);
      if (!p) throw new HttpError(404, "Ce produit n’est plus disponible.");
      if (p.seller_id === u.id)
        throw new HttpError(400, "Vous êtes le créateur de ce produit.");
      const f = Array.isArray(p.product_files)
        ? p.product_files[0]
        : p.product_files;
      if (!f || f.version !== p.version)
        throw new HttpError(
          409,
          "Le fichier de cette version n’est pas disponible.",
        );
      // The amount is always decided here: the listing price, or an offer the
      // seller accepted for this buyer (never above the current price).
      let amount: number = p.price_cents;
      let offerId: string | null = null;
      if (b.offer_id) {
        const { data: offer, error: oe } = await db
          .from("offers")
          .select("id,product_id,buyer_id,amount_cents,status,expires_at")
          .eq("id", b.offer_id)
          .eq("buyer_id", u.id)
          .maybeSingle();
        check(oe);
        if (!offer || offer.product_id !== p.id)
          throw new HttpError(404, "Offre introuvable.");
        if (offer.status !== "accepted" || offerExpired(offer))
          throw new HttpError(
            409,
            "Cette offre n’est plus payable. Faites une nouvelle offre.",
          );
        amount = Math.min(offer.amount_cents, p.price_cents);
        offerId = offer.id;
      }
      const { data: existing, error: ee } = await db
        .from("orders")
        .select("*")
        .eq("buyer_id", u.id)
        .eq("product_id", p.id)
        .in("status", ["paid", "pending", "partially_refunded", "disputed"])
        .maybeSingle();
      check(ee);
      if (existing && existing.status !== "pending")
        return ctx.json({ url: "/library" });
      if (amount > 0 && !paymentsReady(c))
        throw new HttpError(503, "Les paiements ne sont pas encore ouverts.");
      let fee = 0;
      if (amount > 0) {
        const bps = Number(c.PLATFORM_FEE_BPS);
        if (
          !c.PLATFORM_FEE_BPS ||
          !Number.isInteger(bps) ||
          bps < 0 ||
          bps > 3000
        )
          throw new HttpError(
            503,
            "La commission du marketplace doit être configurée.",
          );
        fee = platformFee(amount, bps);
      }
      let order = existing;
      if (
        order &&
        (order.amount_cents !== amount || (order.offer_id ?? null) !== offerId)
      ) {
        // A different amount was agreed since this checkout began: close the
        // previous session so the buyer can never pay the stale amount.
        if (order.stripe_session_id) {
          const st = stripe(c);
          const previous = await st.checkout.sessions.retrieve(
            order.stripe_session_id,
          );
          if (previous.payment_status === "paid")
            return ctx.json({ url: "/library?payment=processing" });
          if (previous.status === "open")
            await st.checkout.sessions.expire(order.stripe_session_id);
        }
        const { error: xe } = await db
          .from("orders")
          .update({ status: "expired" })
          .eq("id", order.id)
          .eq("status", "pending");
        check(xe);
        order = null;
      }
      if (!order) {
        const { data, error } = await db
          .from("orders")
          .insert({
            buyer_id: u.id,
            seller_id: p.seller_id,
            product_id: p.id,
            product_title: p.title,
            product_version: p.version,
            license: p.license,
            storage_path: f.storage_path,
            file_sha256: f.sha256,
            amount_cents: amount,
            fee_cents: fee,
            currency: "cad",
            offer_id: offerId,
            status: amount === 0 ? "paid" : "pending",
            paid_at: amount === 0 ? new Date().toISOString() : null,
          })
          .select()
          .single();
        if (error?.code === "23505")
          throw new HttpError(
            409,
            "Une commande existe déjà. Réessayez dans un instant.",
          );
        check(error);
        order = data;
      }
      if (order.amount_cents === 0) return ctx.json({ url: "/library" });
      const st = stripe(c);
      if (order.stripe_session_id) {
        const session = await st.checkout.sessions.retrieve(
          order.stripe_session_id,
        );
        if (session.status === "open" && session.url)
          return ctx.json({ url: session.url });
        if (session.payment_status === "paid")
          return ctx.json({ url: "/library?payment=processing" });
        const { error } = await db
          .from("orders")
          .update({ status: "expired" })
          .eq("id", order.id)
          .eq("status", "pending");
        check(error);
        throw new HttpError(
          409,
          "Cette session a expiré. Relancez votre achat.",
        );
      }
      const { data: seller, error: se } = await db
        .from("seller_accounts")
        .select("*")
        .eq("user_id", p.seller_id)
        .maybeSingle();
      check(se);
      if (!seller)
        throw new HttpError(409, "Ce vendeur doit activer ses paiements.");
      const a = await st.accounts.retrieve(seller.stripe_account_id);
      if (!a.charges_enabled || !a.payouts_enabled)
        throw new HttpError(
          409,
          "Les paiements de ce vendeur sont temporairement indisponibles.",
        );
      const session = await st.checkout.sessions.create(
        {
          mode: "payment",
          customer_email: u.email,
          client_reference_id: u.id,
          metadata: { order_id: order.id, buyer_id: u.id },
          line_items: [
            {
              price_data: {
                currency: order.currency,
                unit_amount: order.amount_cents,
                product_data: {
                  name: order.product_title,
                  description: `Version ${order.product_version} · ${order.license}`,
                },
              },
              quantity: 1,
            },
          ],
          payment_intent_data: {
            application_fee_amount: order.fee_cents,
            transfer_data: { destination: seller.stripe_account_id },
            metadata: { order_id: order.id, buyer_id: u.id },
          },
          billing_address_collection: "required",
          automatic_tax: { enabled: c.STRIPE_TAX_ENABLED === "true" },
          success_url: siteOrigin(c, req) + "/library?payment=processing",
          cancel_url:
            siteOrigin(c, req) + "/agents/" + p.slug + "?checkout=cancelled",
        },
        { idempotencyKey: "checkout-" + order.id },
      );
      const { error: save } = await db
        .from("orders")
        .update({ stripe_session_id: session.id, checkout_url: session.url })
        .eq("id", order.id);
      check(save);
      return ctx.json({ url: session.url });
    }
    if (route === "orders" && req.method === "GET") {
      const page = Math.max(
        0,
        Math.min(10000, Number(url.searchParams.get("page")) || 0),
      );
      const { data, count, error } = await db
        .from("orders")
        .select(orderFields, { count: "exact" })
        .eq("buyer_id", u.id)
        .order("created_at", { ascending: false })
        .range(page * 20, page * 20 + 19);
      check(error);
      return ctx.json({ orders: data, total: count });
    }
    if (
      path[0] === "orders" &&
      path[2] === "download" &&
      req.method === "POST"
    ) {
      const id = uuid.parse(path[1]);
      const { data: o, error } = await db
        .from("orders")
        .select("*")
        .eq("id", id)
        .eq("buyer_id", u.id)
        .maybeSingle();
      check(error);
      if (!o || o.status !== "paid")
        throw new HttpError(
          403,
          "Le téléchargement nécessite un achat confirmé et actif.",
        );
      const { data, error: de } = await db.storage
        .from("agent-packages")
        .createSignedUrl(o.storage_path, 60, { download: true });
      check(de);
      return ctx.json({ url: data!.signedUrl, sha256: o.file_sha256 });
    }
    if (route === "reviews" && req.method === "POST") {
      const b = z
        .object({
          product_id: uuid,
          rating: z.number().int().min(1).max(5),
          body: z.string().trim().min(10).max(2000),
        })
        .parse(await parseBody(req));
      const { error } = await ctx
        .client!.from("reviews")
        .insert({ ...b, user_id: u.id });
      if (error)
        throw new HttpError(
          400,
          "Un seul avis par achat confirmé est autorisé.",
        );
      return ctx.json({ ok: true });
    }
    if (route === "support" && req.method === "POST") {
      const b = z
        .object({
          order_id: uuid.nullable().optional(),
          subject: z.string().trim().min(3).max(150),
          body: z.string().trim().min(20).max(5000),
        })
        .parse(await parseBody(req));
      const { data, error } = await ctx
        .client!.from("support_requests")
        .insert({ ...b, user_id: u.id })
        .select("id")
        .single();
      check(error);
      return ctx.json({ id: data?.id });
    }
    if (route === "offers" && req.method === "GET") {
      const seller = url.searchParams.get("role") === "seller";
      // Explicit relationship names: orders also links offers to products/profiles.
      const { data, error } = await db
        .from("offers")
        .select(
          "id,product_id,amount_cents,list_cents,message,status,expires_at,responded_at,created_at," +
            "product:products!offers_product_id_fkey(title,slug,price_cents,status,kind)," +
            (seller
              ? "counterpart:profiles!offers_buyer_id_fkey(display_name,username)"
              : "counterpart:profiles!offers_seller_id_fkey(display_name,username)"),
        )
        .eq(seller ? "seller_id" : "buyer_id", u.id)
        .order("created_at", { ascending: false })
        .limit(60);
      check(error);
      return ctx.json({
        offers: ((data || []) as unknown as {
          status: string;
          expires_at: string;
        }[]).map((o) => (offerExpired(o) ? { ...o, status: "expired" } : o)),
      });
    }
    if (route === "offers" && req.method === "POST") {
      if (!paymentsReady(c))
        throw new HttpError(
          503,
          "Les offres ouvriront avec les paiements.",
          "payments_unavailable",
        );
      await rateLimit(db, req, "offer:" + u.id, 10, 600);
      const b = z
        .object({
          product_id: uuid,
          amount_cents: z.number().int().min(100).max(1000000),
          message: z.string().trim().max(500).default(""),
        })
        .strict()
        .parse(await parseBody(req));
      const { data, error } = await db.rpc("market_make_offer", {
        p_product: b.product_id,
        p_buyer: u.id,
        p_amount: b.amount_cents,
        p_message: b.message,
      });
      failOn(error, [
        [/23505/, 409, "Vous avez déjà une offre active pour ce produit."],
        [
          /below the listing price/,
          400,
          "Votre offre doit être inférieure au prix demandé. Au prix affiché, achetez directement.",
        ],
        [
          /too low/,
          400,
          "Offre trop basse : proposez au moins 20 % du prix demandé.",
        ],
        [/Already owned/, 409, "Ce produit est déjà dans vos acquisitions."],
        [/Own product/, 400, "Vous êtes le créateur de ce produit."],
        [
          /Free product/,
          400,
          "Ce produit est gratuit : ajoutez-le directement à vos acquisitions.",
        ],
        [/unavailable/, 404, "Ce produit n’est plus disponible."],
        [
          /Too many open offers/,
          429,
          "Vous avez trop d’offres en attente. Retirez-en avant d’en faire de nouvelles.",
        ],
      ]);
      return ctx.json({ id: data }, 201);
    }
    if (path[0] === "offers" && path.length === 3 && req.method === "POST") {
      const id = uuid.parse(path[1]);
      if (path[2] === "respond") {
        const b = z
          .object({ action: z.enum(["accept", "decline"]) })
          .strict()
          .parse(await parseBody(req));
        const { error } = await db.rpc("market_respond_offer", {
          p_offer: id,
          p_seller: u.id,
          p_action: b.action,
        });
        failOn(error, [
          [/not found/, 404, "Offre introuvable."],
          [/closed/, 409, "Cette offre n’est plus en attente."],
          [
            /unavailable/,
            409,
            "Remettez l’annonce en ligne avant d’accepter une offre.",
          ],
        ]);
        return ctx.json({
          ok: true,
          status: b.action === "accept" ? "accepted" : "declined",
        });
      }
      if (path[2] === "withdraw") {
        const { error } = await db.rpc("market_withdraw_offer", {
          p_offer: id,
          p_buyer: u.id,
        });
        failOn(error, [
          [/not found/, 404, "Offre introuvable."],
          [/closed/, 409, "Cette offre est déjà close."],
        ]);
        return ctx.json({ ok: true, status: "withdrawn" });
      }
    }
    if (path[0] === "admin") {
      await requireAdmin(db, u.id);
      if (route === "admin/queue" && req.method === "GET") {
        const [
          { data: products, error: pe },
          { data: requests, error: re },
          { data: orders, error: oe },
        ] = await Promise.all([
          db
            .from("products")
            .select(
              "*,profiles!products_seller_id_fkey(display_name,username),product_files(original_name,size_bytes,sha256)",
            )
            .eq("status", "pending")
            .limit(100),
          db
            .from("support_requests")
            .select("*")
            .eq("status", "open")
            .limit(100),
          db
            .from("orders")
            .select(orderFields)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);
        check(pe || re || oe);
        return ctx.json({ products, requests, orders });
      }
      if (route === "admin/moderate" && req.method === "POST") {
        const b = z
          .object({
            product_id: uuid,
            status: z.enum(["published", "rejected"]),
            note: z.string().max(2000),
            expected_updated_at: z.string().datetime({ offset: true }),
          })
          .parse(await parseBody(req));
        const { error } = await db.rpc("market_moderate_product", {
          p_id: b.product_id,
          p_admin: u.id,
          p_status: b.status,
          p_note: b.note,
          p_expected_updated: b.expected_updated_at,
        });
        if (error)
          throw new HttpError(
            409,
            "La publication a changé ou son package est incomplet. Rechargez la file et vérifiez à nouveau.",
          );
        return ctx.json({ ok: true });
      }
      if (route === "admin/file" && req.method === "POST") {
        const b = z.object({ product_id: uuid }).parse(await parseBody(req));
        const { data: f } = await db
          .from("product_files")
          .select("storage_path")
          .eq("product_id", b.product_id)
          .single();
        if (!f) throw new HttpError(404, "Fichier introuvable.");
        const { data, error } = await db.storage
          .from("agent-packages")
          .createSignedUrl(f.storage_path, 60, { download: true });
        check(error);
        return ctx.json({ url: data!.signedUrl });
      }
      if (route === "admin/resolve" && req.method === "POST") {
        const b = z.object({ request_id: uuid }).parse(await parseBody(req));
        const { error } = await db
          .from("support_requests")
          .update({ status: "resolved" })
          .eq("id", b.request_id);
        check(error);
        return ctx.json({ ok: true });
      }
      if (route === "admin/refund" && req.method === "POST") {
        const b = z.object({ order_id: uuid }).parse(await parseBody(req));
        const { data: o } = await db
          .from("orders")
          .select("*")
          .eq("id", b.order_id)
          .single();
        if (!o || o.status !== "paid" || !o.stripe_payment_intent)
          throw new HttpError(
            400,
            "Cette commande ne peut pas être remboursée automatiquement.",
          );
        const refund = await stripe(c).refunds.create(
          {
            payment_intent: o.stripe_payment_intent,
            reverse_transfer: true,
            refund_application_fee: true,
          },
          { idempotencyKey: "full-refund-" + o.id },
        );
        await db.from("audit_log").insert({
          actor: u.id,
          action: "refund.requested",
          target: o.id,
          detail: { refund_id: refund.id },
        });
        return ctx.json({
          message: "Remboursement demandé. Le statut sera confirmé par Stripe.",
        });
      }
    }
    throw new HttpError(404, "Cette action n’existe pas.");
  } catch (e) {
    if (e instanceof z.ZodError)
      return ctx.json(
        {
          error: e.issues
            .map((x) => `${x.path.join(".")}: ${x.message}`)
            .join(" "),
          code: "validation",
        },
        400,
      );
    if (e instanceof SyntaxError)
      return ctx.json({ error: "Requête invalide." }, 400);
    if (e instanceof HttpError)
      return ctx.json({ error: e.message, code: e.code }, e.status);
    console.error("market_api_error", { route, name: (e as Error)?.name });
    return ctx.json(
      { error: "Un problème est survenu. Réessayez dans un instant." },
      500,
    );
  }
}
