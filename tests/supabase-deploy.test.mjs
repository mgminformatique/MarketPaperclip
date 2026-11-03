import { test } from "node:test";
import assert from "node:assert/strict";
import { configureAuth, desiredAuthConfig, PROJECT_REF } from "../scripts/configure-supabase-auth.mjs";

const env = {
  SUPABASE_PROJECT_REF: PROJECT_REF,
  SUPABASE_ACCESS_TOKEN: "test-token-never-real",
  SUPABASE_DB_PASSWORD: "test-password-never-real",
  SITE_URL: "https://marketpaperclip.murphylexus.chatgpt.site",
};
test("Auth configuration preserves unrelated settings and stronger password requirements", async () => {
  const config = await desiredAuthConfig({
    uri_allow_list: "https://existing.example/callback",
    password_min_length: 16,
    smtp_pass: "must-not-copy",
  }, env.SITE_URL);
  assert.equal(config.password_min_length, 16);
  assert.match(config.uri_allow_list, /https:\/\/existing.example\/callback/);
  assert.equal(config.smtp_pass, undefined);
  assert.equal(config.mailer_autoconfirm, false);
  assert.match(config.mailer_templates_confirmation_content, /token_hash=\{\{ \.TokenHash \}\}&amp;type=signup/);
  assert.match(config.mailer_templates_recovery_content, /token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery/);
  await assert.rejects(() => desiredAuthConfig({}, "https://unrelated.example"), /SITE_URL/);
});
test("Wrong project or missing credentials stop before any network request", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw Error("Unexpected network"); };
  await assert.rejects(() => configureAuth({ env: { ...env, SUPABASE_PROJECT_REF: "wrong" }, fetchImpl }), /project reference/);
  await assert.rejects(() => configureAuth({ env: { ...env, SUPABASE_ACCESS_TOKEN: "" }, fetchImpl }), /Missing SUPABASE_ACCESS_TOKEN/);
  assert.equal(calls, 0);
});
test("Plan is read-only; apply verifies the actual remote settings", async () => {
  const methods = [];
  let remote = { uri_allow_list: "", password_min_length: 8 };
  const fetchImpl = async (url, options) => {
    assert.equal(url, `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`);
    assert.equal(options.redirect, "error");
    methods.push(options.method);
    if (options.method === "PATCH") remote = { ...remote, ...JSON.parse(options.body) };
    return new Response(JSON.stringify(remote));
  };
  await configureAuth({ env, fetchImpl, mode: "--plan" });
  assert.deepEqual(methods, ["GET"]);
  methods.length = 0;
  await configureAuth({ env, fetchImpl, mode: "--apply" });
  assert.deepEqual(methods, ["GET", "PATCH", "GET"]);
  assert.equal(remote.site_url, env.SITE_URL);
});
test("An API refusal fails without disclosing the response body", async () => {
  await assert.rejects(() => configureAuth({
    env,
    fetchImpl: async () => new Response("sensitive-provider-settings", { status: 403 }),
  }), (error) => /HTTP 403/.test(error.message) && !error.message.includes("sensitive-provider-settings"));
});

test("Production, www, Netlify and deploy-preview origins are allowed redirect targets", async () => {
  for (const site of ["https://marketpaperclip.com", "https://marketpaperclip.netlify.app", "https://www.marketpaperclip.com"]) {
    const config = await desiredAuthConfig({ uri_allow_list: "" }, site);
    assert.equal(config.site_url, site);
    for (const pattern of ["https://www.marketpaperclip.com/**", "https://marketpaperclip.netlify.app/**", "https://*--marketpaperclip.netlify.app/**", "https://marketpaperclip.com/api/auth/callback"])
      assert.ok(config.uri_allow_list.split(",").includes(pattern), pattern);
  }
  await assert.rejects(() => desiredAuthConfig({}, "https://marketpaperclip.netlify.app.evil.example"), /SITE_URL/);
});
