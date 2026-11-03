// Configures the Netlify site's server variables for MarketPaperclip.
// Supabase keys are read from the authenticated Supabase CLI and handed to the
// Netlify CLI directly; no value is ever printed. Stripe keys are entered by
// the owner in the Netlify UI (never in a chat, a commit or a log).
//
//   node scripts/netlify-configure.mjs --site <site-id>            # preview
//   node scripts/netlify-configure.mjs --site <site-id> --apply    # write
// Options: --site-url https://marketpaperclip.com  --admin owner@example.com
//          --launch true|false (free acquisitions)
import { execFileSync } from "node:child_process";

const REF = "ltommtumsvvqxdknpkfd";
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : fallback;
};
const site = opt("site");
const apply = argv.includes("--apply");
const siteUrl = opt("site-url", "https://marketpaperclip.com");
const admin = opt("admin", "");
const launch = opt("launch", "false");
if (!site) throw new Error("Usage: --site <netlify-site-id> [--apply]");
if (!/^https:\/\/[a-z0-9.-]+$/i.test(siteUrl))
  throw new Error("--site-url must be an https origin without a path.");
if (!["true", "false"].includes(launch))
  throw new Error("--launch must be true or false.");
if (admin && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin))
  throw new Error("--admin must be an email address.");

function supabaseKeys() {
  const raw = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", REF, "--reveal", "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const keys = JSON.parse(raw);
  const publishable = keys.find((k) => k.type === "publishable")?.api_key;
  const secret = keys.find((k) => k.type === "secret")?.api_key;
  if (!publishable?.startsWith("sb_publishable_") || !secret?.startsWith("sb_secret_"))
    throw new Error("Supabase CLI did not return the project's API keys.");
  return { publishable, secret };
}

const keys = apply ? supabaseKeys() : { publishable: "", secret: "" };
const vars = [
  ["SUPABASE_URL", `https://${REF}.supabase.co`, false],
  ["SUPABASE_PUBLISHABLE_KEY", keys.publishable, false],
  ["SUPABASE_SECRET_KEY", keys.secret, true],
  ["SITE_URL", siteUrl, false],
  [
    "SITE_ALIASES",
    "https://www.marketpaperclip.com,https://marketpaperclip.netlify.app,https://*--marketpaperclip.netlify.app",
    false,
  ],
  ["MARKET_ADMIN_EMAILS", admin, false],
  ["SHOW_PRICES", "true", false],
  ["LAUNCH_READY", launch, false],
  ["PAYMENTS_ENABLED", "false", false],
  ["GITHUB_AUTH_ENABLED", "false", false],
  ["STRIPE_TAX_ENABLED", "false", false],
];

for (const [key, value, secret] of vars) {
  if (!value && key === "MARKET_ADMIN_EMAILS") {
    console.log(`skip  ${key} (no --admin given)`);
    continue;
  }
  if (!apply) {
    console.log(`plan  ${key}${secret ? " (secret)" : ""}`);
    continue;
  }
  try {
    execFileSync(
      "netlify",
      [
        "env:set",
        key,
        value,
        "--site",
        site,
        "--force",
        ...(secret
          ? ["--secret", "--context", "production", "deploy-preview", "branch-deploy"]
          : []),
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    console.log(`set   ${key}${secret ? " (secret)" : ""}`);
  } catch {
    // The CLI's own error text could echo arguments: report the key only.
    console.error(`FAIL  ${key}`);
    process.exitCode = 1;
  }
}
console.log(
  apply
    ? "Done. Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and PLATFORM_FEE_BPS in the Netlify UI, then redeploy."
    : "Preview only. Re-run with --apply to write these variables.",
);
