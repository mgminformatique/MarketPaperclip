// Supabase Auth Send Email hook: signature, messages, links and Microsoft Graph sending.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  buildMessages,
  callbackUrl,
  handleAuthEmail,
  linkOrigin,
  resetMailerCache,
  verifyHookSignature,
  type MailerEnv,
} from "../supabase/functions/_shared/auth-email";

const secretBytes = randomBytes(32);
const secret = "v1,whsec_" + secretBytes.toString("base64");
const env: MailerEnv = {
  SEND_EMAIL_HOOK_SECRET: secret,
  MS_TENANT_ID: "tenant-unit",
  MS_CLIENT_ID: "client-unit",
  MS_CLIENT_SECRET: "client-secret-unit",
  MAIL_FROM: "info@mgminformatique.ca",
  SITE_URL: "https://marketpaperclip.com",
};
const now = Date.UTC(2026, 10, 3, 12, 0, 0);
function signed(body: string, at = now, key = secretBytes, id = "msg_unit") {
  const timestamp = String(Math.floor(at / 1000));
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
    "content-type": "application/json",
  });
}
const user = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "client@example.com",
};
const data = {
  token: "123456",
  token_hash: "hash_current",
  token_new: "654321",
  token_hash_new: "hash_new",
  redirect_to: "https://marketpaperclip.netlify.app/api/auth/callback",
  email_action_type: "signup",
  site_url: "https://marketpaperclip.com",
};
function graphMock(status = 202) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("https://login.microsoftonline.com/"))
      return Response.json({ access_token: "graph.unit.token", expires_in: 3600 });
    if (url.startsWith("https://graph.microsoft.com/"))
      return new Response(null, { status });
    throw new Error("Unexpected network call: " + url);
  }) as typeof fetch;
  return { calls, fetcher };
}
async function call(body: unknown, headers?: Headers, fetcher?: typeof fetch) {
  const raw = JSON.stringify(body);
  return handleAuthEmail(
    new Request("https://unit.supabase.co/functions/v1/send-email", {
      method: "POST",
      headers: headers ?? signed(raw),
      body: raw,
    }),
    env,
    { fetcher, now: () => now },
  );
}

test("Standard Webhooks signatures are verified, including expiry and wrong keys", async () => {
  const raw = JSON.stringify({ user, email_data: data });
  await verifyHookSignature(raw, signed(raw), secret, now);
  await assert.rejects(verifyHookSignature(raw + " ", signed(raw), secret, now), /invalide/);
  await assert.rejects(
    verifyHookSignature(raw, signed(raw, now - 6 * 60 * 1000), secret, now),
    /expirée/,
  );
  await assert.rejects(
    verifyHookSignature(raw, signed(raw, now, randomBytes(32)), secret, now),
    /invalide/,
  );
  await assert.rejects(verifyHookSignature(raw, new Headers(), secret, now), /manquante/);
  const several = signed(raw);
  several.set("webhook-signature", "v1,AAAA " + several.get("webhook-signature"));
  await verifyHookSignature(raw, several, secret, now);
});

test("Links reach the server callback on the marketplace origin the visitor used", () => {
  const [signup] = buildMessages(user, data);
  assert.equal(signup.to, "client@example.com");
  assert.equal(signup.subject, "MarketPaperclip — Confirmez votre compte / Confirm your account");
  const href = callbackUrl("https://marketpaperclip.netlify.app", "hash_current", "signup");
  assert.equal(href, "https://marketpaperclip.netlify.app/api/auth/callback?token_hash=hash_current&type=signup");
  assert.ok(signup.html.includes(href.replace(/&/g, "&amp;")));
  assert.match(signup.html, /Bienvenue dans le marketplace\./);
  assert.match(signup.html, /Confirm your email address to activate your account\./);
  const [recovery] = buildMessages(user, {
    ...data,
    email_action_type: "recovery",
    redirect_to: "https://marketpaperclip.com/api/auth/callback?next=%2Fsettings%3Freset%3D1",
  });
  assert.equal(recovery.subject, "MarketPaperclip — Nouveau mot de passe / Reset password");
  assert.ok(recovery.html.includes("https://marketpaperclip.com/api/auth/callback?token_hash=hash_current&amp;type=recovery"));
  // Deploy previews keep their own origin; foreign or missing returns fall back to the site.
  assert.equal(linkOrigin({ redirect_to: "https://6ae9d7a8--marketpaperclip.netlify.app/x" }), "https://6ae9d7a8--marketpaperclip.netlify.app");
  assert.equal(linkOrigin({ redirect_to: "https://evil.example/api/auth/callback", site_url: "https://marketpaperclip.com" }), "https://marketpaperclip.com");
  assert.equal(linkOrigin({ redirect_to: "https://marketpaperclip.netlify.app.evil.example/" }), "https://marketpaperclip.com");
  assert.equal(linkOrigin({ redirect_to: "not a url" }, "https://www.marketpaperclip.com"), "https://www.marketpaperclip.com");
});

test("The messages keep the wording of the Supabase templates they replace", () => {
  const template = readFileSync(new URL("../supabase/templates/confirmation.html", import.meta.url), "utf8");
  const [signup] = buildMessages(user, data);
  for (const text of ["MARKETPAPERCLIP", "Confirmez votre adresse courriel pour activer votre compte.", "Confirmer / Confirm", "#c9fa72"])
    assert.ok(template.includes(text) && signup.html.includes(text), text);
  const recoveryTemplate = readFileSync(new URL("../supabase/templates/recovery.html", import.meta.url), "utf8");
  const [recovery] = buildMessages(user, { ...data, email_action_type: "recovery" });
  for (const text of ["Un nouveau mot de passe.", "Suivez ce lien pour choisir un nouveau mot de passe.", "Réinitialiser / Reset password"])
    assert.ok(recoveryTemplate.includes(text) && recovery.html.includes(text), text);
});

test("A secure email change confirms each address with its own reversed hash", () => {
  const messages = buildMessages(
    { ...user, new_email: "nouveau@example.com" },
    { ...data, email_action_type: "email_change" },
  );
  assert.deepEqual(messages.map((m) => m.to), ["client@example.com", "nouveau@example.com"]);
  assert.ok(messages[0].html.includes("token_hash=hash_new&amp;type=email_change"));
  assert.ok(messages[1].html.includes("token_hash=hash_current&amp;type=email_change"));
});

test("Codes, notifications, the setup test and unsafe values are rendered safely", () => {
  const [code] = buildMessages(user, { ...data, email_action_type: "reauthentication" });
  assert.ok(code.html.includes("123456"));
  const [notice] = buildMessages(user, { ...data, email_action_type: "mfa_factor_enrolled_notification" });
  assert.match(notice.subject, /Activité de sécurité/);
  const [moved] = buildMessages(
    { ...user, email: "x@example.com" },
    { ...data, email_action_type: "email_changed_notification", old_email: "old@example.com" },
  );
  assert.equal(moved.to, "old@example.com");
  const [setup] = buildMessages(user, { email_action_type: "mgm_test" });
  assert.match(setup.subject, /Courriel de test/);
  assert.equal(setup.html.includes("/api/auth/callback"), false);
  const [hostile] = buildMessages(
    { ...user, new_email: '"><script>alert(1)</script>@x' },
    { ...data, email_action_type: "email_change", token_hash: '"><img src=x onerror=alert(1)>' },
  );
  assert.equal(hostile.html.includes("<script>"), false);
  assert.equal(hostile.html.includes("<img"), false);
  assert.throws(() => buildMessages(user, { ...data, email_action_type: "unknown" }), /non pris en charge/);
  assert.throws(() => buildMessages(user, { ...data, token_hash: "" }), /manquant/);
  assert.deepEqual(buildMessages({ ...user, email: "pas une adresse" }, data), []);
});

test("A signed signup is sent once from the MGM mailbox through Microsoft Graph", async () => {
  resetMailerCache();
  const { calls, fetcher } = graphMock();
  const response = await call({ user, email_data: data }, undefined, fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {});
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://login.microsoftonline.com/tenant-unit/oauth2/v2.0/token");
  const form = new URLSearchParams(String(calls[0].init?.body));
  assert.equal(form.get("grant_type"), "client_credentials");
  assert.equal(form.get("scope"), "https://graph.microsoft.com/.default");
  assert.equal(calls[1].url, "https://graph.microsoft.com/v1.0/users/info%40mgminformatique.ca/sendMail");
  const sent = JSON.parse(String(calls[1].init?.body));
  assert.equal(sent.message.toRecipients[0].emailAddress.address, "client@example.com");
  assert.equal(sent.message.body.contentType, "HTML");
  assert.ok(sent.message.body.content.includes("https://marketpaperclip.netlify.app/api/auth/callback?token_hash=hash_current&amp;type=signup"));
  assert.equal(sent.saveToSentItems, false);
  // The Graph token is reused for the next message.
  const again = await call({ user, email_data: data }, undefined, fetcher);
  assert.equal(again.status, 200);
  assert.equal(calls.length, 3);
});

test("Unsigned, misconfigured or failed sends are refused without leaking details", async () => {
  resetMailerCache();
  const { calls, fetcher } = graphMock(500);
  const forged = await call(
    { user, email_data: data },
    new Headers({ "webhook-id": "x", "webhook-timestamp": String(now / 1000), "webhook-signature": "v1,forged" }),
    fetcher,
  );
  assert.equal(forged.status, 401);
  assert.equal(calls.length, 0);
  const failed = await call({ user, email_data: data }, undefined, fetcher);
  assert.equal(failed.status, 502);
  const text = await failed.text();
  assert.equal(text.includes("graph.unit.token"), false);
  assert.equal(text.includes("client@example.com"), false);
  const unconfigured = await handleAuthEmail(
    new Request("https://unit.supabase.co/functions/v1/send-email", { method: "POST", body: "{}" }),
    { ...env, MS_CLIENT_SECRET: "" },
  );
  assert.equal(unconfigured.status, 503);
  const wrongMethod = await handleAuthEmail(new Request("https://unit.supabase.co/functions/v1/send-email"), env);
  assert.equal(wrongMethod.status, 405);
});

test("The Auth config enables the signed hook and is never pushed without its secret", () => {
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  assert.match(config, /\[auth\.hook\.send_email\]\nenabled = true\nuri = "https:\/\/ltommtumsvvqxdknpkfd\.supabase\.co\/functions\/v1\/send-email"\nsecrets = "env\(SEND_EMAIL_HOOK_SECRET\)"/);
  assert.match(config, /\[functions\.send-email\]\nverify_jwt = false/);
  assert.equal(/whsec_|client_secret|MS_CLIENT_SECRET=/.test(config), false);
  const push = readFileSync(new URL("../scripts/supabase-config-push.mjs", import.meta.url), "utf8");
  assert.match(push, /startsWith\("v1,whsec_"\)/);
});
