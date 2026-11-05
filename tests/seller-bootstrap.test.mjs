import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { bootstrapSeller, ownerId, platformId, runId } from "../scripts/ops/bootstrap-mgm-seller.mjs";
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const env = { SUPABASE_URL: "https://ltommtumsvvqxdknpkfd.supabase.co", SUPABASE_SECRET_KEY: "fixture-server-secret", STRIPE_SECRET_KEY: "rk_live_fixture" };
const now = Date.now();
const options = { now, expiresAt: new Date(now + 60000).toISOString() };
function network({ wrongPlatform = false, previous = false, existing = false } = {}) {
  const calls = [];
  let linked = existing;
  let audit;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || "GET";
    calls.push({ url, method, body: init.body });
    assert.ok(!/checkout|payment_intents|charges|refunds/.test(url.pathname), "Setup must not move money");
    if (url.pathname === "/rest/v1/audit_log") {
      if (method === "GET") return Response.json(previous ? [{ detail: { runId, status: "complete" } }] : []);
      audit = JSON.parse(init.body); return Response.json([audit]);
    }
    if (url.pathname === "/rest/v1/market_admins") return Response.json([{ user_id: ownerId }]);
    if (url.pathname === "/rest/v1/profiles") return Response.json([{ id: ownerId, display_name: "MGM Informatique", username: "mgm" }]);
    if (url.pathname === "/auth/v1/admin/users/" + ownerId) return Response.json({ id: ownerId, email: "owner@example.test", email_confirmed_at: "2026-11-01" });
    if (url.pathname === "/v1/account") return Response.json({ id: wrongPlatform ? "acct_wrong" : platformId, charges_enabled: true });
    if (url.pathname === "/rest/v1/seller_accounts") {
      if (method === "POST") linked = true;
      return Response.json(linked ? [{ stripe_account_id: "acct_seller" }] : []);
    }
    if (url.pathname === "/v1/accounts/acct_seller") return Response.json({ id: "acct_seller", metadata: { user_id: ownerId }, charges_enabled: true, payouts_enabled: true });
    if (url.pathname === "/v1/accounts" && method === "GET") return Response.json({ data: [], has_more: false });
    if (url.pathname === "/v1/accounts" && method === "POST") {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get("metadata[user_id]"), ownerId);
      assert.equal(body.get("controller[stripe_dashboard][type]"), "express");
      assert.equal(init.headers["idempotency-key"], "seller-" + ownerId);
      for (const name of body.keys()) assert.ok(!/tos_acceptance|external_account|individual\[|company\[/.test(name));
      return Response.json({ id: "acct_seller", charges_enabled: false, payouts_enabled: false, requirements: { currently_due: ["tos_acceptance.date", "external_account"] } });
    }
    throw new Error("Unexpected fixture request");
  };
  return { calls, audit: () => audit };
}
test("Expired operator jobs make no request", async () => {
  const { calls } = network();
  assert.equal((await bootstrapSeller(env, { ...options, expiresAt: new Date(now - 1).toISOString() })).status, "expired");
  assert.equal(calls.length, 0);
});
test("Seller preparation is idempotent, leaves agreements and banking to the owner, and never moves money", async () => {
  const state = network();
  const result = await bootstrapSeller(env, options);
  assert.equal(result.status, "complete");
  assert.equal(result.chargesEnabled, false);
  assert.equal(result.paymentPerformed, false);
  assert.deepEqual(result.currentlyDue, ["tos_acceptance.date", "external_account"]);
  const output = JSON.stringify(state.audit());
  for (const secret of [env.SUPABASE_SECRET_KEY, env.STRIPE_SECRET_KEY, "owner@example.test"])
    assert.ok(!output.includes(secret));
});
test("Already-linked sellers are refreshed without creating another account", async () => {
  const { calls } = network({ existing: true });
  const result = await bootstrapSeller(env, options);
  assert.equal(result.status, "complete");
  assert.equal(result.source, "existing_database_link");
  assert.equal(result.chargesEnabled, true);
  assert.ok(!calls.some((c) => c.url.origin === "https://api.stripe.com" && c.method !== "GET"));
});
test("Wrong platforms and completed job replays cannot create a seller", async () => {
  let state = network({ wrongPlatform: true });
  assert.equal((await bootstrapSeller(env, options)).status, "failed");
  assert.ok(!state.calls.some((c) => c.url.pathname === "/v1/accounts" && c.method === "POST"));
  state = network({ previous: true });
  assert.equal((await bootstrapSeller(env, options)).status, "already_complete");
  assert.equal(state.calls.length, 1);
});
