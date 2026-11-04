// Connects Stripe to the MarketPaperclip site without the key ever appearing
// in a chat, a commit, a log or the shell history.
//
//   node scripts/stripe-configure.mjs --site <netlify-site-id> --fee-bps 1500           # check only
//   node scripts/stripe-configure.mjs --site <netlify-site-id> --fee-bps 1500 --apply   # configure
//
// The owner types the Stripe secret key (sk_live_…, sk_test_… or a restricted
// rk_ key) at a hidden prompt (or provides STRIPE_SECRET_KEY in the
// environment, e.g. from a credential store or a dialog). The script shows
// which Stripe account the key opens, checks that a restricted key has every
// permission the site uses (exit code 2 and the list of missing permissions
// otherwise), and, with --apply and after confirmation:
//   1. creates the webhook endpoint <site-url>/api/webhooks/stripe, pinned to
//      the API version of the installed stripe SDK (an older endpoint with the
//      same URL is disabled, not deleted: Stripe never shows a signing secret
//      twice);
//   2. stores STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET as secret Netlify
//      variables (production context only) and PLATFORM_FEE_BPS.
// PAYMENTS_ENABLED is not touched: opening payments is a separate, explicit
// step followed by a redeploy. Only non-secret facts are printed, and written
// to --report <file> when given.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import Stripe from "stripe";

const API_VERSION = Stripe.API_VERSION;
const EVENTS = [
  "account.updated",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
];

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : fallback;
};
const fail = (msg) => {
  console.error("\n" + msg);
  process.exit(1);
};
const site = opt("site");
const apply = argv.includes("--apply");
const siteUrl = opt("site-url", "https://marketpaperclip.com");
const feeBps = opt("fee-bps");
const reportFile = opt("report");
if (!site) fail("Usage: --site <netlify-site-id> --fee-bps <0-3000> [--apply]");
if (!/^https:\/\/[a-z0-9.-]+$/i.test(siteUrl))
  fail("--site-url must be an https origin without a path.");
if (!/^\d+$/.test(feeBps || "") || Number(feeBps) > 3000)
  fail("--fee-bps must be an integer between 0 and 3000 (1500 = 15 %).");
const webhookUrl = `${siteUrl}/api/webhooks/stripe`;
const report = { at: new Date().toISOString(), site, webhookUrl, feeBps: Number(feeBps), apply };
const save = () => {
  if (reportFile) writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
};
// Stripe error messages can quote part of a key: mask anything key-shaped.
const mask = (s) =>
  String(s).replace(/\b(sk|rk|pk|whsec)_[A-Za-z0-9_*.…]+/g, "$1_[masqué]");

// Drop bracketed-paste markers, control characters (a Ctrl+V typed before
// pasting) and whitespace copied with the key.
const clean = (v) =>
  String(v)
    .replace(/\x1b\[20[01]~/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, "");

function askHidden(prompt) {
  if (!process.stdin.isTTY)
    fail("Lancez ce script dans un terminal : la clé se saisit sans affichage.");
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    let value = "";
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
    };
    function onData(chunk) {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          cleanup();
          resolve(clean(value));
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          fail("Annulé : rien n’a été modifié.");
          return;
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    }
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    stdin.resume();
  });
}

function askLine(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (d) => {
      process.stdin.pause();
      resolve(String(d).trim());
    });
    process.stdin.resume();
  });
}

async function stripeApi(key, method, path, pairs) {
  const body = pairs ? new URLSearchParams(pairs) : undefined;
  const res = await fetch(`${process.env.STRIPE_API_BASE || "https://api.stripe.com"}/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": API_VERSION,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(mask(json?.error?.message || `Stripe HTTP ${res.status}`));
  return json;
}

function netlifySet(key, value, secret) {
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
        ...(secret ? ["--secret", "--context", "production"] : []),
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    return "set";
  } catch {
    // The CLI's own error text could echo arguments: report the key only.
    return "fail";
  }
}

const KEY = /^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$/;
// A restricted key (rk_) is accepted once its permissions are checked below.
// What is wrong with a pasted value, without ever repeating it.
const keyKind = (k) =>
  !k
    ? "empty"
    : /^pk_/.test(k)
      ? "publishable"
      : /^whsec_/.test(k)
        ? "webhook-secret"
        : /^(sk|rk)_/.test(k)
          ? "masked-or-truncated"
          : "other";
const keyProblem = (k) =>
  ({
    empty: "Rien n’a été collé (collez avec Ctrl+Maj+V ou clic droit → Coller).",
    publishable:
      "C’est la clé publiable (pk_…). Il faut la clé secrète : cliquez « Révéler » à côté de « Clé secrète », puis copiez-la.",
    "webhook-secret": "C’est un secret de webhook (whsec_…). Il faut la clé secrète de l’API (sk_…).",
    "masked-or-truncated":
      "La clé est masquée ou incomplète : cliquez « Révéler » à côté de « Clé secrète » avant de la copier.",
    other: "Ce n’est pas une clé secrète Stripe (attendu : sk_live_…, sk_test_…, rk_live_… ou rk_test_…).",
  })[keyKind(k)];
let key = clean(process.env.STRIPE_SECRET_KEY || "");
let kind = KEY.exec(key);
if (!process.env.STRIPE_SECRET_KEY)
  for (let attempt = 1; attempt <= 3 && !kind; attempt++) {
    key = await askHidden(
      attempt === 1
        ? "Clé secrète Stripe (sk_live_…), invisible à la saisie : "
        : "Nouvel essai — clé secrète Stripe : ",
    );
    kind = KEY.exec(key);
    if (!kind) console.log(keyProblem(key));
  }
if (!kind) {
  report.error = "format: " + keyKind(key);
  save();
  fail(keyProblem(key));
}
const live = kind[2] === "live";
report.mode = live ? "live" : "test";
report.restricted = kind[1] === "rk";

try {
  const a = await stripeApi(key, "GET", "account");
  report.account = {
    id: a.id,
    name: a.settings?.dashboard?.display_name || a.business_profile?.name || null,
    country: a.country,
    currency: a.default_currency,
    charges_enabled: a.charges_enabled,
    payouts_enabled: a.payouts_enabled,
    details_submitted: a.details_submitted,
  };
} catch (e) {
  report.error = "account: " + e.message;
  save();
  fail("Stripe refuse cette clé : " + e.message);
}
try {
  await stripeApi(key, "GET", "accounts?limit=1");
  report.connect = "ok";
} catch (e) {
  report.connect = e.message;
}
try {
  const list = await stripeApi(key, "GET", "webhook_endpoints?limit=100");
  report.existingWebhooks = list.data
    .filter((w) => w.url === webhookUrl)
    .map((w) => ({ id: w.id, status: w.status }));
} catch (e) {
  report.existingWebhooks = "error: " + e.message;
}

// A restricted key must allow everything the site does. Each probe is
// harmless: a read, or a write aimed at an object that does not exist (Stripe
// checks the key's permissions first, then answers "No such …"). The Checkout
// probe creates a 1 $ session like the site does and expires it at once, so it
// can never be paid.
report.missing = [];
function denied(label, message) {
  if (!/required permissions/i.test(message)) return; // "No such …": allowed
  const need = /Enabling (.+?) permissions? on this key/i.exec(message)?.[1] || "?";
  const url = /https:\/\/dashboard\.stripe\.com\/[^\s'"]+/.exec(message)?.[0];
  report.missing.push({ label, need });
  if (url) report.editUrl = url.replace(/[.,]+$/, "");
}
if (report.restricted) {
  const ghost = "acct_1MGMProbeDoesNotExist";
  const probes = [
    ["Comptes vendeurs (lecture)", "GET", "accounts?limit=1"],
    ["Comptes vendeurs (création)", "POST", "accounts", [["mgm_probe_unknown_parameter", "1"]]],
    ["Liens d’activation vendeur", "POST", "account_links",
      [["account", ghost], ["type", "account_onboarding"], ["refresh_url", siteUrl], ["return_url", siteUrl]]],
    ["Liens de connexion vendeur", "POST", `accounts/${ghost}/login_links`],
    ["Remboursements", "POST", "refunds", [["payment_intent", "pi_MGMProbeDoesNotExist"]]],
    ["Paiements (lecture)", "GET", "payment_intents?limit=1"],
    ["Charges (lecture)", "GET", "charges?limit=1"],
    ["Webhooks", "POST", "webhook_endpoints/we_MGMProbeDoesNotExist", [["disabled", "true"]]],
  ];
  for (const [label, method, path, pairs] of probes)
    await stripeApi(key, method, path, pairs).catch((e) => denied(label, e.message));
  try {
    const cs = await stripeApi(key, "POST", "checkout/sessions", [
      ["mode", "payment"],
      ["line_items[0][quantity]", "1"],
      ["line_items[0][price_data][currency]", "cad"],
      ["line_items[0][price_data][unit_amount]", "100"],
      ["line_items[0][price_data][product_data][name]", "Vérification MarketPaperclip (annulée)"],
      ["success_url", siteUrl + "/library"],
      ["cancel_url", siteUrl + "/"],
    ]);
    await stripeApi(key, "POST", `checkout/sessions/${cs.id}/expire`).catch((e) =>
      denied("Sessions Checkout (annulation)", e.message),
    );
  } catch (e) {
    denied("Sessions Checkout (création)", e.message);
    if (!/required permissions/i.test(e.message)) report.checkoutProbe = e.message;
  }
}

const A = report.account;
console.log(`
Compte Stripe : ${A.name || "(sans nom)"} — ${A.id} (${A.country}, ${String(A.currency).toUpperCase()})
Mode : ${live ? "RÉEL (live)" : "TEST"}${report.restricted ? ", clé restreinte" : ""}
Paiements acceptés : ${A.charges_enabled ? "oui" : "NON — activation du compte à terminer dans Stripe"}
Versements : ${A.payouts_enabled ? "oui" : "non"} · Dossier complété : ${A.details_submitted ? "oui" : "non"}
Connect : ${report.connect === "ok" ? "accessible" : report.connect}
Webhook visé : ${webhookUrl}
Commission : ${(Number(feeBps) / 100).toLocaleString("fr-CA")} %`);
if (report.restricted)
  console.log(
    report.missing.length
      ? "\nPermissions manquantes sur cette clé restreinte :\n" +
          report.missing.map((m) => `  - ${m.label} : ${m.need}`).join("\n") +
          (report.editUrl ? `\nModifier la clé : ${report.editUrl}` : "")
      : "Permissions de la clé restreinte : toutes celles du site sont présentes.",
  );
if (report.checkoutProbe) console.log("Session Checkout d’essai refusée : " + report.checkoutProbe);
save();
if (report.missing.length) {
  console.log("\nRien n’a été modifié. Ajoutez ces permissions à la clé dans Stripe, enregistrez, puis réessayez.");
  process.exit(2);
}

if (!apply) {
  console.log("\nVérification seulement : rien n’a été modifié (ajoutez --apply pour configurer).");
  process.exit(0);
}
const answer = process.env.STRIPE_SECRET_KEY ? "o" : await askLine("\nConfigurer ce compte pour MarketPaperclip ? (o/N) ");
if (!/^(o|oui|y|yes)$/i.test(answer)) {
  report.cancelled = true;
  save();
  console.log("Annulé : rien n’a été modifié.");
  process.exit(0);
}

let endpoint;
try {
  const pairs = [
    ["url", webhookUrl],
    ["api_version", API_VERSION],
    ["description", "MarketPaperclip — commandes, remboursements et litiges"],
    ...EVENTS.map((e) => ["enabled_events[]", e]),
  ];
  endpoint = await stripeApi(key, "POST", "webhook_endpoints", pairs);
  report.webhook = { id: endpoint.id, status: endpoint.status, api_version: API_VERSION };
} catch (e) {
  report.error = "webhook: " + e.message;
  save();
  fail("Création du webhook refusée : " + e.message);
}
for (const old of Array.isArray(report.existingWebhooks) ? report.existingWebhooks : []) {
  if (old.status === "disabled") continue;
  try {
    await stripeApi(key, "POST", `webhook_endpoints/${old.id}`, [["disabled", "true"]]);
    old.disabled = true;
  } catch (e) {
    old.disableError = e.message;
  }
}

report.netlify = {
  STRIPE_SECRET_KEY: netlifySet("STRIPE_SECRET_KEY", key, true),
  STRIPE_WEBHOOK_SECRET: netlifySet("STRIPE_WEBHOOK_SECRET", endpoint.secret, true),
  PLATFORM_FEE_BPS: netlifySet("PLATFORM_FEE_BPS", String(Number(feeBps)), false),
};
save();
const failed = Object.entries(report.netlify).filter(([, v]) => v !== "set");
console.log(`
Webhook créé : ${endpoint.id} (${EVENTS.length} événements, API ${API_VERSION})
Netlify : ${Object.entries(report.netlify).map(([k, v]) => `${k} ${v === "set" ? "enregistrée" : "ÉCHEC"}`).join(" · ")}`);
if (failed.length) {
  process.exitCode = 1;
  console.log("Une variable n’a pas pu être enregistrée : rien n’est ouvert. Relancez le script.");
} else {
  console.log("\nC’est prêt. Les paiements restent fermés jusqu’à l’activation (PAYMENTS_ENABLED) et au prochain déploiement.");
}
