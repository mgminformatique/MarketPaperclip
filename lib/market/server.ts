import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import Stripe from "stripe";
export type Config = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SITE_URL?: string;
  PLATFORM_FEE_BPS?: string;
  PAYMENTS_ENABLED?: string;
  GITHUB_AUTH_ENABLED?: string;
  STRIPE_TAX_ENABLED?: string;
  LAUNCH_READY?: string;
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_error",
  ) {
    super(message);
  }
}
export function ready(c: Config) {
  return !!(
    c.SUPABASE_URL &&
    c.SUPABASE_ANON_KEY &&
    c.SUPABASE_SERVICE_ROLE_KEY
  );
}
export function paymentsReady(c: Config) {
  const bps = Number(c.PLATFORM_FEE_BPS);
  return (
    ready(c) &&
    !!c.STRIPE_SECRET_KEY &&
    !!c.STRIPE_WEBHOOK_SECRET &&
    !!c.SITE_URL &&
    c.LAUNCH_READY === "true" &&
    c.PAYMENTS_ENABLED === "true" &&
    !!c.PLATFORM_FEE_BPS &&
    Number.isInteger(bps) &&
    bps >= 0 &&
    bps <= 3000
  );
}
export function admin(c: Config) {
  if (!ready(c))
    throw new HttpError(
      503,
      "Les comptes ouvriront bientôt. Revenez au lancement du marketplace.",
      "setup_required",
    );
  return createClient(c.SUPABASE_URL!, c.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function context(request: Request, c: Config) {
  const cookies: string[] = [];
  const client = ready(c)
    ? createServerClient(c.SUPABASE_URL!, c.SUPABASE_ANON_KEY!, {
        cookieOptions: {
          httpOnly: true,
          secure: new URL(request.url).protocol === "https:",
          sameSite: "lax",
          path: "/",
        },
        cookies: {
          getAll() {
            return parseCookieHeader(
              request.headers.get("cookie") || "",
            ).filter((x) => x.value !== undefined) as {
              name: string;
              value: string;
            }[];
          },
          setAll(values) {
            values.forEach((v) =>
              cookies.push(serializeCookieHeader(v.name, v.value, v.options)),
            );
          },
        },
      })
    : null;
  const json = (data: unknown, status = 200) => {
    const h = new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    cookies.forEach((v) => h.append("set-cookie", v));
    return new Response(JSON.stringify(data), { status, headers: h });
  };
  const redirect = (url: string) => {
    const h = new Headers({ location: url, "cache-control": "no-store" });
    cookies.forEach((v) => h.append("set-cookie", v));
    return new Response(null, { status: 303, headers: h });
  };
  return { client, json, redirect };
}
export async function user(client: SupabaseClient | null) {
  if (!client)
    throw new HttpError(
      503,
      "Les comptes ouvriront bientôt.",
      "setup_required",
    );
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    throw new HttpError(
      401,
      "Connectez-vous pour continuer.",
      "sign_in_required",
    );
  return data.user;
}
export function originGuard(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin)
    throw new HttpError(403, "Origine de la requête refusée.");
  if (Number(req.headers.get("content-length") || 0) > 22000000)
    throw new HttpError(413, "Fichier trop volumineux.");
}
export async function rateLimit(
  db: SupabaseClient,
  req: Request,
  key: string,
  limit = 20,
  seconds = 60,
) {
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip + ":" + key),
  );
  const digest = Array.from(new Uint8Array(hash), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  const { data, error } = await db.rpc("market_rate_limit", {
    p_key: digest,
    p_limit: limit,
    p_seconds: seconds,
  });
  if (error)
    throw new HttpError(503, "Le service est temporairement indisponible.");
  if (!data)
    throw new HttpError(
      429,
      "Trop de tentatives. Réessayez dans quelques minutes.",
    );
}
export function stripe(c: Config) {
  if (!c.STRIPE_SECRET_KEY)
    throw new HttpError(
      503,
      "Les paiements ne sont pas encore ouverts.",
      "payments_unavailable",
    );
  return new Stripe(c.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}
export async function requireAdmin(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("market_admins")
    .select("user_id")
    .eq("user_id", id)
    .maybeSingle();
  if (error || !data)
    throw new HttpError(403, "Accès réservé à la modération.");
}
export function check(
  error: unknown,
  message = "Impossible de terminer cette action.",
) {
  if (error) throw new HttpError(500, message);
}
export function siteOrigin(c: Config) {
  if (!c.SITE_URL)
    throw new HttpError(503, "L’adresse du marketplace doit être configurée.");
  const u = new URL(c.SITE_URL);
  if (u.protocol !== "https:" && u.hostname !== "localhost")
    throw new HttpError(503, "Adresse de déploiement invalide.");
  return u.origin;
}
