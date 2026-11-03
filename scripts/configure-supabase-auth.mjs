import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const PROJECT_REF = "ltommtumsvvqxdknpkfd";
const allowedOrigins = new Set([
  "https://marketpaperclip.murphylexus.chatgpt.site",
  "https://marketpaperclip.com",
  "https://www.marketpaperclip.com",
  "https://marketpaperclip.netlify.app",
]);
// Auth already accepts any redirect on the Site URL host. These patterns cover
// the other origins serving the same site, including Netlify deploy previews,
// with or without a query string (e.g. ?next=/settings?reset=1).
const redirectPatterns = [
  "https://www.marketpaperclip.com/**",
  "https://marketpaperclip.netlify.app/**",
  "https://*--marketpaperclip.netlify.app/**",
];

export async function desiredAuthConfig(current, siteUrl) {
  const site = new URL(siteUrl);
  if (!allowedOrigins.has(site.origin) || site.pathname !== "/" || site.search || site.hash || site.username || site.password) {
    throw new Error("SITE_URL must be the MarketPaperclip preview or production origin.");
  }
  const redirects = new Set((current.uri_allow_list || "").split(",").map((s) => s.trim()).filter(Boolean));
  for (const origin of allowedOrigins) {
    redirects.add(origin + "/api/auth/callback");
    redirects.add(origin + "/settings");
    redirects.add(origin + "/settings?reset=1");
  }
  for (const pattern of redirectPatterns) redirects.add(pattern);
  return {
    site_url: site.origin,
    uri_allow_list: [...redirects].join(","),
    external_email_enabled: true,
    disable_signup: false,
    mailer_autoconfirm: false,
    mailer_allow_unverified_email_sign_ins: false,
    password_min_length: Math.max(12, Number(current.password_min_length) || 0),
    mailer_subjects_confirmation: "MarketPaperclip — Confirmez votre compte / Confirm your account",
    mailer_subjects_recovery: "MarketPaperclip — Nouveau mot de passe / Reset password",
    mailer_templates_confirmation_content: await readFile(new URL("../supabase/templates/confirmation.html", import.meta.url), "utf8"),
    mailer_templates_recovery_content: await readFile(new URL("../supabase/templates/recovery.html", import.meta.url), "utf8"),
  };
}

export async function configureAuth({ env = process.env, fetchImpl = fetch, mode = "--plan" } = {}) {
  if (!["--plan", "--apply"].includes(mode)) throw new Error("Use --plan or --apply.");
  if (env.SUPABASE_PROJECT_REF !== PROJECT_REF) throw new Error("Unexpected Supabase project reference.");
  for (const key of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SITE_URL"]) {
    if (!env[key]?.trim()) throw new Error(`Missing ${key}. Add the deployment credentials in GitHub Actions secrets.`);
  }
  const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
  const request = async (method, body) => {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method,
        redirect: "error",
        headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new Error("Supabase Management API could not be reached.");
    }
    // Never print the response body: Auth settings can contain SMTP/provider secrets.
    if (!response.ok) throw new Error(`Supabase Auth ${method} failed (HTTP ${response.status}). Check token permissions and project access.`);
    try { return await response.json(); }
    catch { throw new Error("Supabase returned an unreadable configuration response."); }
  };
  const current = await request("GET");
  const desired = await desiredAuthConfig(current, env.SITE_URL);
  if (mode === "--apply") {
    await request("PATCH", desired);
    const actual = await request("GET");
    for (const [key, value] of Object.entries(desired)) {
      const matches = key === "uri_allow_list"
        ? value.split(",").every((url) => (actual[key] || "").split(",").map((s) => s.trim()).includes(url))
        : actual[key] === value;
      if (!matches) throw new Error(`Supabase verification failed for ${key}.`);
    }
  }
  console.log(`${mode === "--apply" ? "Verified" : "Prepared"} email/password Auth, confirmation and recovery for ${PROJECT_REF}.`);
  console.log(`Website origin: ${desired.site_url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  configureAuth({ mode: process.argv[2] || "--plan" }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
