import { z } from "zod";
import { publicConfig } from "./config";
import { demoProducts } from "./demo";
import {
  productInput,
  profileInput,
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
  HttpError,
  type Config,
} from "./server";
import { handleWebhook } from "./webhook";
const publicFields =
  "id,seller_id,slug,title,tagline,description,category,kind,engine,version,price_cents,currency,license,tags,requirements,setup,agent_count,status,created_at,cover_url,profiles(display_name,username,bio)";
const orderFields =
  "id,product_id,product_title,product_version,license,amount_cents,total_cents,tax_cents,fee_cents,currency,status,created_at,paid_at";
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
export async function marketApi(req: Request, c: Config) {
  const ctx = context(req, c);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\//, "").split("/");
  const route = path.join("/");
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
      const { data: reviews } = await ctx
        .client!.from("reviews")
        .select("rating,body,created_at,profiles(display_name,username)")
        .eq("product_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return ctx.json({ product: data, reviews: reviews || [] });
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
        .select("id,display_name,username,bio,website,products!inner(id)", {
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
      return ctx.json({ profile, products });
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
      return ctx.json({
        user: { id: u.id, email: u.email },
        profile,
        seller,
        isAdmin: !!role,
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
            redirectTo: siteOrigin(c) + "/api/auth/callback",
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
        else if (token && ["signup", "recovery", "email"].includes(type || ""))
          ({ error } = await ctx.client!.auth.verifyOtp({
            token_hash: token,
            type: type as "signup" | "recovery" | "email",
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
        await ctx.client!.auth.resetPasswordForEmail(email, {
          redirectTo: siteOrigin(c) + "/settings?reset=1",
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
            emailRedirectTo: siteOrigin(c) + "/api/auth/callback",
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
      if (path[2] === "cover" && req.method === "POST") {
        const form = await req.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size < 12 || file.size > 3145728)
          throw new HttpError(
            400,
            "Choisissez une image JPG, PNG ou WebP de 3 Mo maximum.",
          );
        const bytes = await file.arrayBuffer();
        const a = new Uint8Array(bytes);
        let ext = "";
        let mime = "";
        if (a[0] === 0xff && a[1] === 0xd8 && a[2] === 0xff) {
          ext = "jpg";
          mime = "image/jpeg";
        } else if (
          a[0] === 0x89 &&
          a[1] === 0x50 &&
          a[2] === 0x4e &&
          a[3] === 0x47
        ) {
          ext = "png";
          mime = "image/png";
        } else if (
          new TextDecoder().decode(a.slice(0, 4)) === "RIFF" &&
          new TextDecoder().decode(a.slice(8, 12)) === "WEBP"
        ) {
          ext = "webp";
          mime = "image/webp";
        } else
          throw new HttpError(
            400,
            "Format d’image invalide. Les SVG ne sont pas acceptés.",
          );
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
      if (path[2] === "file" && req.method === "POST") {
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
        refresh_url: siteOrigin(c) + "/studio?connect=refresh",
        return_url: siteOrigin(c) + "/studio?connect=returned",
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
        .object({ product_id: uuid, license_accepted: z.literal(true) })
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
      if (p.price_cents > 0 && !paymentsReady(c))
        throw new HttpError(503, "Les paiements ne sont pas encore ouverts.");
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
      let order = existing;
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
            amount_cents: p.price_cents,
            fee_cents: platformFee(p.price_cents, bps),
            currency: "cad",
            status: p.price_cents === 0 ? "paid" : "pending",
            paid_at: p.price_cents === 0 ? new Date().toISOString() : null,
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
          success_url: siteOrigin(c) + "/library?payment=processing",
          cancel_url:
            siteOrigin(c) + "/agents/" + p.slug + "?checkout=cancelled",
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
              "*,profiles(display_name,username),product_files(original_name,size_bytes,sha256)",
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
