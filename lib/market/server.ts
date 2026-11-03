import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import Stripe from "stripe";
export type Config = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  // Legacy environment names remain supported for existing deployments.
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
  // Prices are shown unless explicitly hidden ("false").
  SHOW_PRICES?: string;
  // Comma-separated confirmed emails promoted to moderators on sign-in.
  MARKET_ADMIN_EMAILS?: string;
  // Comma-separated extra HTTPS origins serving this same deployment, e.g.
  // https://www.marketpaperclip.com,https://*--marketpaperclip.netlify.app
  SITE_ALIASES?: string;
};
const publishableKey = (c: Config) =>
  c.SUPABASE_PUBLISHABLE_KEY || c.SUPABASE_ANON_KEY;
const serverSecretKey = (c: Config) =>
  c.SUPABASE_SECRET_KEY || c.SUPABASE_SERVICE_ROLE_KEY;
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
    publishableKey(c) &&
    serverSecretKey(c)
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
  return createClient(c.SUPABASE_URL!, serverSecretKey(c)!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function context(request: Request, c: Config) {
  const cookies: string[] = [];
  const client = ready(c)
    ? createServerClient(c.SUPABASE_URL!, publishableKey(c)!, {
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
  // x-market-client-ip is overwritten by the Worker entry from platform data.
  const ip =
    req.headers.get("x-market-client-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "local";
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
function aliasMatches(pattern: string, origin: string) {
  const p = pattern.trim().replace(/\/+$/, "");
  if (!p.startsWith("https://")) return false;
  if (!p.includes("*")) return p === origin;
  // A single leading wildcard label, e.g. https://*--site.netlify.app
  const m = p.match(/^https:\/\/\*([a-z0-9.-]+)$/i);
  if (!m) return false;
  const host = origin.slice("https://".length);
  return (
    origin.startsWith("https://") &&
    host.toLowerCase().endsWith(m[1].toLowerCase()) &&
    /^[a-z0-9-]+$/i.test(host.slice(0, host.length - m[1].length))
  );
}
export function siteOrigin(c: Config, req?: Request) {
  if (!c.SITE_URL)
    throw new HttpError(503, "L’adresse du marketplace doit être configurée.");
  const u = new URL(c.SITE_URL);
  if (u.protocol !== "https:" && u.hostname !== "localhost")
    throw new HttpError(503, "Adresse de déploiement invalide.");
  if (req && c.SITE_ALIASES) {
    // Keep visitors on the origin they used when it is a declared alias.
    const origin = new URL(req.url).origin;
    if (
      origin !== u.origin &&
      c.SITE_ALIASES.split(",").some((a) => aliasMatches(a, origin))
    )
      return origin;
  }
  return u.origin;
}
export function pricesVisible(c: Config) {
  return c.SHOW_PRICES !== "false";
}
export function adminEmails(c: Config) {
  return (c.MARKET_ADMIN_EMAILS || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v));
}
