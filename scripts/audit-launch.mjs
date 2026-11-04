// Public production checks. Does not create accounts, orders, or payments.
import { writeFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : fallback;
};
const origin = new URL(option("origin", "https://marketpaperclip.com")).origin;
if (!/^https:\/\/(marketpaperclip\.com|marketpaperclip\.netlify\.app)$/.test(origin))
  throw new Error("Select the canonical site or its declared Netlify alias.");
const checks = [];
const record = (name, ok, details) => checks.push({ name, ok: !!ok, details });
async function get(path) {
  return fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(20000) });
}
async function checkPage(path, locale, privatePage = false, expected = 200) {
  const response = await get(path + (path.includes("?") ? "&" : "?") + "lang=" + locale);
  const dom = new JSDOM(await response.text());
  const doc = dom.window.document;
  record(`${path} ${locale}`, response.status === expected && doc.documentElement.lang === locale, {
    status: response.status,
    language: doc.documentElement.lang,
  });
  record(`${path} ${locale} security headers`,
    response.headers.has("content-security-policy") &&
    response.headers.has("strict-transport-security") &&
    response.headers.get("x-content-type-options") === "nosniff");
  if (privatePage)
    record(`${path} ${locale} noindex`, doc.querySelector('meta[name="robots"]')?.content.includes("noindex"));
  dom.window.close();
}

try {
  const configResponse = await get("/api/config");
  const config = await configResponse.json();
  record("production accounts and checkout gates", configResponse.ok && config.accounts && config.payments && config.launched && !config.demo);
  record("published commission", Number.isInteger(config.feeBps), { feeBps: config.feeBps });
  const catalogResponse = await get("/api/catalog");
  const catalog = await catalogResponse.json();
  record("published catalog", catalogResponse.ok && !catalog.demo && catalog.total > 0, { products: catalog.total });
  for (const product of catalog.products || []) {
    record(`listing ${product.slug}`, product.currency === "cad" && Number.isInteger(product.price_cents), {
      priceCents: product.price_cents, currency: product.currency,
    });
    await checkPage("/agents/" + encodeURIComponent(product.slug), "en");
  }
  await Promise.all(["en", "fr"].flatMap((locale) => [
    ...["/", "/market", "/docs", "/terms", "/privacy", "/licenses"].map((path) => checkPage(path, locale)),
    checkPage("/library", locale, true),
    checkPage("/admin", locale, true),
    checkPage("/agents/launch-audit-missing", locale, true, 404),
  ]));
  const orders = await get("/api/orders");
  record("anonymous order access refused", orders.status === 401, { status: orders.status });
  const webhook = await fetch(origin + "/api/webhooks/stripe", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    redirect: "manual", signal: AbortSignal.timeout(20000),
  });
  record("unsigned payment event refused", webhook.status === 400, { status: webhook.status });
  const report = {
    at: new Date().toISOString(), origin,
    checks: checks.sort((a, b) => a.name.localeCompare(b.name)),
    publicChecksPassed: checks.every((c) => c.ok),
    liveSaleVerified: false,
    remaining: [
      "Seller Connect onboarding: charges and payouts enabled at Stripe",
      "Real card payment within the owner's total spending limit",
      "Paid order reconciled by Stripe webhook and buyer's download hash verified",
      "Manual desktop/mobile and Paperclip runtime checks",
      "Tax registrations, merchant details and target-country consumer requirements reviewed",
    ],
  };
  if (option("output")) await writeFile(option("output"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.publicChecksPassed) process.exitCode = 1;
} catch {
  // Never echo request objects, provider URLs, or credentials on errors.
  console.error("Launch audit could not finish. Check access to the selected production origin.");
  process.exitCode = 1;
}
