// Runs outside the Worker. Prints only configuration names/status; never values.
const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SITE_URL",
  "PLATFORM_FEE_BPS",
];
let failed = false;
for (const name of required) {
  const present = !!process.env[name];
  console.log(`${present ? "OK" : "MISSING"} ${name}`);
  if (!present) failed = true;
}
if (process.env.SITE_URL) {
  try {
    const u = new URL(process.env.SITE_URL);
    if (u.protocol !== "https:") throw 0;
    console.log("OK HTTPS origin");
  } catch {
    console.log("INVALID SITE_URL");
    failed = true;
  }
}
const rate = Number(process.env.PLATFORM_FEE_BPS);
if (
  process.env.PLATFORM_FEE_BPS &&
  (!Number.isInteger(rate) || rate < 0 || rate > 3000)
) {
  console.log("INVALID PLATFORM_FEE_BPS (0–3000)");
  failed = true;
}
if (process.env.STRIPE_SECRET_KEY) {
  console.log(
    process.env.STRIPE_SECRET_KEY.startsWith("sk_live_")
      ? "MODE LIVE: perform the documented live acceptance review before launch"
      : "MODE TEST: no live payment acceptance verified",
  );
}
for (const name of ["MARKET_ADMIN_EMAILS", "SITE_ALIASES"])
  console.log(`${process.env[name] ? "OK" : "OPTIONAL"} ${name}`);
if (process.env.SITE_ALIASES)
  for (const alias of process.env.SITE_ALIASES.split(",").map((v) => v.trim()))
    if (!/^https:\/\/(\*)?[a-z0-9.-]+$/i.test(alias)) {
      console.log("INVALID SITE_ALIASES entry (https origin, optional leading *)");
      failed = true;
    }
console.log(
  `INFO prices ${process.env.SHOW_PRICES === "false" ? "hidden" : "shown"}; launch ${process.env.LAUNCH_READY === "true" ? "open (free acquisitions)" : "closed"}; payments ${process.env.PAYMENTS_ENABLED === "true" ? "enabled" : "disabled"}`,
);
console.log(
  "REVIEW Apply all migrations (001-007), verify SMTP and redirects, Stripe Connect/webhook, DNS and terms.",
);
console.log(
  "REVIEW Verify browser desktop/mobile and complete a Stripe TEST purchase before enabling launch flags.",
);
process.exitCode = failed ? 1 : 0;
