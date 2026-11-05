import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { marketApi } from "../lib/market/api";
import {
  productInput,
  priceInCents,
  profileInput,
  platformFee,
  filterProducts,
  safeReturn,
  canDownload,
} from "../lib/market/model";
import { demoProducts } from "../lib/market/demo";
import { originGuard, context } from "../lib/market/server";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const origin = "https://marketpaperclip.test";
function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(origin + "/api/" + path, {
    method,
    headers: {
      ...(method === "GET"
        ? {}
        : { origin, "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const c = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "anon_test_not_real",
  SUPABASE_SERVICE_ROLE_KEY: "service_test_not_real",
  STRIPE_SECRET_KEY: "sk_test_fixture_not_real",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture_not_real",
  SITE_URL: origin,
};
const buyer = "11111111-1111-4111-8111-111111111111";
const session = {
  access_token: [
    { alg: "HS256", typ: "JWT" },
    { sub: buyer, role: "authenticated", exp: 4102444800 },
    "test",
  ]
    .map((x) =>
      typeof x === "string"
        ? x
        : Buffer.from(JSON.stringify(x)).toString("base64url"),
    )
    .join("."),
  refresh_token: "test_refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: { id: buyer, email: "buyer@example.test" },
};
const cookie =
  "sb-test-auth-token=base64-" +
  Buffer.from(JSON.stringify(session)).toString("base64url");
function authFetch(
  extra: (url: URL, init?: RequestInit) => Response | Promise<Response>,
) {
  globalThis.fetch = async (input: any, init?: RequestInit) => {
    const u = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (u.pathname === "/auth/v1/user")
      return Response.json({
        id: buyer,
        email: "buyer@example.test",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      });
    if (u.pathname === "/rest/v1/rpc/market_rate_limit")
      return Response.json(true);
    return extra(u, init);
  };
}
test("Unconfigured app exposes no secret and clearly distinguishes demonstration data", async () => {
  const r = await marketApi(request("config"), {});
  assert.equal(r.status, 200);
  const b: any = await r.json();
  assert.equal(b.demo, true);
  assert.equal(b.accounts, false);
  assert.equal(b.payments, false);
  const catalog: any = await (await marketApi(request("catalog"), {})).json();
  assert.ok(catalog.products.every((p: any) => p.demo === true));
  assert.ok(!JSON.stringify(b).includes("KEY"));
});
test("Absent Supabase configuration cannot fabricate an account", async () => {
  const r = await marketApi(
    request("auth/signup", "POST", {
      email: "dev@example.test",
      password: "long-test-password",
    }),
    {},
  );
  assert.equal(r.status, 503);
});
test("Google remains hidden and unavailable until accounts and the provider are configured", async () => {
  for (const config of [{ GOOGLE_AUTH_ENABLED: "true" }, c]) {
    const response = await marketApi(request("config"), config);
    assert.equal(((await response.json()) as { google: boolean }).google, false);
  }
  authFetch(() => { throw new Error("Unexpected authentication request"); });
  const disabled = await marketApi(request("auth/google"), c);
  assert.equal(disabled.status, 503);
  assert.equal(disabled.headers.get("location"), null);
});
test("Google sign-in uses PKCE, a private verifier cookie and the configured callback", async () => {
  authFetch(() => { throw new Error("Unexpected authentication request"); });
  const response = await marketApi(request("auth/google"), {
    ...c, GOOGLE_AUTH_ENABLED: "true",
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.origin, c.SUPABASE_URL);
  assert.equal(location.pathname, "/auth/v1/authorize");
  assert.equal(location.searchParams.get("provider"), "google");
  assert.equal(location.searchParams.get("redirect_to"), origin + "/api/auth/callback");
  assert.equal(location.searchParams.get("scopes"), "email profile");
  assert.equal(location.searchParams.get("prompt"), "select_account");
  assert.equal(location.searchParams.get("access_type"), null);
  assert.equal(location.searchParams.get("code_challenge_method"), "s256");
  assert.match(location.searchParams.get("code_challenge")!, /^[\w-]{43}$/);
  const verifier = response.headers.get("set-cookie")!;
  assert.match(verifier, /auth-token-code-verifier=/);
  for (const attribute of [/HttpOnly/i, /Secure/i, /SameSite=Lax/i])
    assert.match(verifier, attribute);
});
test("OAuth returns to an approved alias so the PKCE cookie stays on the same host", async () => {
  authFetch(() => { throw new Error("Unexpected authentication request"); });
  const response = await marketApi(request("auth/google"), {
    ...c, SITE_URL: "https://marketpaperclip.com", SITE_ALIASES: origin,
    GOOGLE_AUTH_ENABLED: "true",
  });
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.searchParams.get("redirect_to"), origin + "/api/auth/callback");
});
test("OAuth exchanges the callback code server-side and refuses an external return destination", async () => {
  let exchanged = false;
  authFetch((url, init) => {
    assert.equal(url.pathname, "/auth/v1/token");
    assert.equal(url.searchParams.get("grant_type"), "pkce");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.auth_code, "test-authorization-code");
    assert.ok(body.code_verifier);
    exchanged = true;
    return Response.json(session);
  });
  const start = await marketApi(request("auth/google"), { ...c, GOOGLE_AUTH_ENABLED: "true" });
  const verifierCookie = start.headers.getSetCookie()
    .map((cookie) => cookie.split(";")[0]).join("; ");
  const response = await marketApi(
    request("auth/callback?code=test-authorization-code&next=https://evil.test", "GET", undefined, { cookie: verifierCookie }), c,
  );
  assert.equal(exchanged, true);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/library");
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
});
test("OAuth denial and invalid callbacks return a safe local message without exchanging tokens", async () => {
  authFetch(() => { throw new Error("Unexpected authentication request"); });
  for (const [query, expected] of [
    ["error=access_denied&error_description=untrusted&next=https://evil.test", "/?auth=cancelled"],
    ["error=server_error", "/?auth=invalid"],
    ["", "/?auth=invalid"],
  ]) {
    const response = await marketApi(request("auth/callback?" + query), c);
    assert.equal(response.headers.get("location"), expected);
  }
});
test("GitHub keeps its own feature switch and OAuth provider", async () => {
  authFetch(() => { throw new Error("Unexpected authentication request"); });
  const disabled = await marketApi(request("auth/github"), { ...c, GOOGLE_AUTH_ENABLED: "true" });
  assert.equal(disabled.status, 503);
  const enabled = await marketApi(request("auth/github"), { ...c, GITHUB_AUTH_ENABLED: "true" });
  const location = new URL(enabled.headers.get("location")!);
  assert.equal(location.searchParams.get("provider"), "github");
  assert.equal(location.searchParams.get("prompt"), null);
});
test("CSRF: cross-origin and missing-origin writes are refused", async () => {
  assert.throws(
    () =>
      originGuard(
        new Request(origin + "/api/profile", {
          method: "PATCH",
          headers: { origin: "https://evil.test" },
        }),
      ),
    /Origine/,
  );
  assert.throws(
    () =>
      originGuard(new Request(origin + "/api/profile", { method: "PATCH" })),
    /Origine/,
  );
  const r = await marketApi(
    request("checkout", "POST", {}, { origin: "https://evil.test" }),
    c,
  );
  assert.equal(r.status, 403);
});
test("Public config never echoes provided API credentials", async () => {
  const r = await marketApi(request("config"), c);
  const text = await r.text();
  assert.ok(!text.includes(c.SUPABASE_ANON_KEY));
  assert.ok(!text.includes(c.STRIPE_SECRET_KEY));
  assert.ok(!text.includes(c.SUPABASE_SERVICE_ROLE_KEY));
});
test("Unconfigured or anonymous visitors cannot download or enter administration", async () => {
  assert.equal(
    (
      await marketApi(
        request(
          "orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/download",
          "POST",
          {},
        ),
        {},
      )
    ).status,
    503,
  );
  assert.equal((await marketApi(request("admin/queue"), c)).status, 401);
});
test("Private download query is bound to the verified buyer and never signs another user’s file", async () => {
  let signed = false;
  authFetch((url) => {
    if (url.pathname === "/rest/v1/orders") {
      assert.equal(url.searchParams.get("buyer_id"), "eq." + buyer);
      return Response.json([]);
    }
    if (url.pathname.includes("/storage/")) signed = true;
    throw new Error("Unexpected request " + url.pathname);
  });
  const r = await marketApi(
    request(
      "orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/download",
      "POST",
      {},
      { cookie },
    ),
    c,
  );
  assert.equal(r.status, 403);
  assert.equal(signed, false);
});
test("A refunded order cannot generate a signed download URL", async () => {
  let signed = false;
  authFetch((url) => {
    if (url.pathname === "/rest/v1/orders")
      return Response.json([
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          buyer_id: buyer,
          status: "refunded",
          storage_path: "private.zip",
        },
      ]);
    if (url.pathname.includes("/storage/")) signed = true;
    throw new Error("Unexpected fetch");
  });
  const r = await marketApi(
    request(
      "orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/download",
      "POST",
      {},
      { cookie },
    ),
    c,
  );
  assert.equal(r.status, 403);
  assert.equal(signed, false);
});
test("Non-admin gets a 403 even with a valid session", async () => {
  authFetch((url) => {
    if (url.pathname === "/rest/v1/market_admins") return Response.json([]);
    throw new Error("Unexpected fetch");
  });
  assert.equal(
    (await marketApi(request("admin/queue", "GET", undefined, { cookie }), c))
      .status,
    403,
  );
});
test("Unverified and tampered Stripe webhooks are rejected before database writes", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("Network should not run");
  };
  const r = await marketApi(
    new Request(origin + "/api/webhooks/stripe", {
      method: "POST",
      body: '{"type":"checkout.session.completed"}',
      headers: { "stripe-signature": "t=1,v1=bad" },
    }),
    c,
  );
  assert.equal(r.status, 400);
  assert.equal(called, false);
});
test("Real Stripe signature verification accepts valid events and rejects altered bodies", async () => {
  const st = new Stripe(c.STRIPE_SECRET_KEY);
  const payload = JSON.stringify({
    id: "evt_test",
    object: "event",
    type: "irrelevant.test",
    data: { object: {} },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  });
  const signature = st.webhooks.generateTestHeaderString({
    payload,
    secret: c.STRIPE_WEBHOOK_SECRET,
  });
  const good = await marketApi(
    new Request(origin + "/api/webhooks/stripe", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": signature },
    }),
    c,
  );
  assert.equal(good.status, 200);
  const bad = await marketApi(
    new Request(origin + "/api/webhooks/stripe", {
      method: "POST",
      body: payload + " ",
      headers: { "stripe-signature": signature },
    }),
    c,
  );
  assert.equal(bad.status, 400);
});
test("Money is integer cents and platform rates are bounded", () => {
  assert.equal(platformFee(4900, 1000), 490);
  assert.equal(platformFee(14900, 1500), 2235);
  assert.equal(platformFee(0, 1000), 0);
  assert.throws(() => platformFee(-1, 1000));
  assert.throws(() => platformFee(1.3, 1000));
  assert.throws(() => platformFee(4900, 10001));
  assert.throws(() => platformFee(4900, NaN));
});
test("Product input rejects privilege fields, fractional prices and invalid bundles", () => {
  const { id, seller_id, slug, profiles, art, demo, created_at, ...base } =
    demoProducts[0];
  const valid = {
    ...base,
    status: "draft",
    description:
      "A complete description that explains the product thoroughly with enough detail for a buyer to evaluate it.",
  };
  assert.equal(productInput.safeParse(valid).success, true);
  assert.equal(
    productInput.safeParse({ ...valid, seller_id: buyer }).success,
    false,
  );
  assert.equal(
    productInput.safeParse({ ...valid, status: "published" }).success,
    false,
  );
  assert.equal(
    productInput.safeParse({ ...valid, price_cents: 49.5 }).success,
    false,
  );
  assert.equal(
    productInput.safeParse({ ...valid, kind: "bundle", agent_count: 1 })
      .success,
    false,
  );
});
test("Profile URLs cannot carry script schemes; redirects remain same-origin", () => {
  assert.equal(
    profileInput.safeParse({
      display_name: "Builder",
      username: "builder",
      bio: "",
      website: "javascript:alert(1)",
    }).success,
    false,
  );
  assert.equal(safeReturn("//evil.test"), "/library");
  assert.equal(safeReturn("/\\evil.test"), "/library");
  assert.equal(safeReturn("/studio"), "/studio");
  assert.equal(safeReturn("/\t/evil.test"), "/library");
  assert.equal(safeReturn("/%2Fsafe"), "/%2Fsafe");
});
test("Discovery filters normalize accents and combine category, type and price sort", () => {
  assert.equal(
    filterProducts(demoProducts, "developpement", "Tout", "agent", "featured")
      .length,
    1,
  );
  assert.equal(
    filterProducts(demoProducts, "", "Opérations", "bundle", "featured")[0]
      .slug,
    "startup-crew",
  );
  assert.equal(
    filterProducts(demoProducts, "", "Tout", "all", "price-asc")[0].slug,
    "deep-research",
  );
  assert.equal(
    filterProducts(demoProducts, "no-match", "Tout", "all", "featured").length,
    0,
  );
});
test("Entitlements require correct buyer and paid state", () => {
  assert.equal(canDownload({ buyer_id: buyer, status: "paid" }, buyer), true);
  assert.equal(
    canDownload({ buyer_id: buyer, status: "pending" }, buyer),
    false,
  );
  assert.equal(
    canDownload({ buyer_id: "other", status: "paid" }, buyer),
    false,
  );
  assert.equal(canDownload(null, buyer), false);
});

test("Checkout calculates price, fee, seller and idempotency exclusively on the server", async () => {
  const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sellerId = "22222222-2222-4222-8222-222222222222",
    orderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let inserted: any = null;
  let stripeBody: URLSearchParams | null = null;
  let stripeHeaders: Headers | null = null;
  let persisted = false;
  const configured = {
    ...c,
    LAUNCH_READY: "true",
    PAYMENTS_ENABLED: "true",
    PLATFORM_FEE_BPS: "1000",
  };
  globalThis.fetch = async (input: any, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const u = new URL(req.url);
    const body = req.method === "GET" ? "" : await req.clone().text();
    if (u.pathname === "/auth/v1/user")
      return Response.json({
        id: buyer,
        email: "buyer@example.test",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      });
    if (u.pathname === "/rest/v1/rpc/market_rate_limit")
      return Response.json(true);
    if (u.pathname === "/rest/v1/products")
      return Response.json([
        {
          id: productId,
          seller_id: sellerId,
          title: "Real Agent",
          slug: "real-agent",
          version: "1.0.0",
          license: "MIT",
          price_cents: 4900,
          product_files: {
            version: "1.0.0",
            storage_path: "seller/package.zip",
            sha256: "a".repeat(64),
          },
        },
      ]);
    if (u.pathname === "/rest/v1/orders") {
      if (req.method === "GET") return Response.json([]);
      if (req.method === "POST") {
        inserted = JSON.parse(body);
        return Response.json({ ...inserted, id: orderId }, { status: 201 });
      }
      if (req.method === "PATCH") {
        const p = JSON.parse(body);
        persisted = p.stripe_session_id === "cs_test_real";
        return new Response(null, { status: 204 });
      }
    }
    if (u.pathname === "/rest/v1/seller_accounts")
      return Response.json([
        {
          stripe_account_id: "acct_real_seller",
          charges_enabled: true,
          payouts_enabled: true,
        },
      ]);
    if (u.pathname === "/v1/accounts/acct_real_seller")
      return Response.json({
        object: "account",
        id: "acct_real_seller",
        charges_enabled: true,
        payouts_enabled: true,
      });
    if (u.pathname === "/v1/checkout/sessions") {
      stripeBody = new URLSearchParams(body);
      stripeHeaders = req.headers;
      return Response.json({
        object: "checkout.session",
        id: "cs_test_real",
        url: "https://checkout.stripe.com/c/pay/cs_test_real",
      });
    }
    throw new Error("Unexpected request " + req.method + " " + u.pathname);
  };
  const response = await marketApi(
    request(
      "checkout",
      "POST",
      {
        product_id: productId,
        license_accepted: true,
        price_cents: 1,
        seller_id: buyer,
      },
      { cookie },
    ),
    configured,
  );
  assert.equal(response.status, 200);
  assert.equal(inserted.amount_cents, 4900);
  assert.equal(inserted.fee_cents, 490);
  assert.equal(inserted.seller_id, sellerId);
  assert.equal(inserted.buyer_id, buyer);
  assert.equal(inserted.status, "pending");
  assert.equal(inserted.storage_path, "seller/package.zip");
  const body = stripeBody as unknown as URLSearchParams;
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "4900");
  assert.equal(body.get("payment_intent_data[application_fee_amount]"), "490");
  assert.equal(
    body.get("payment_intent_data[transfer_data][destination]"),
    "acct_real_seller",
  );
  assert.equal(body.get("metadata[buyer_id]"), buyer);
  assert.equal(
    (stripeHeaders as unknown as Headers).get("idempotency-key"),
    "checkout-" + orderId,
  );
  assert.equal(persisted, true);
});
test("A payment key alone never enables charging without a webhook and explicit launch gates", async () => {
  const { paymentsReady } = await import("../lib/market/server");
  assert.equal(paymentsReady(c), false);
  assert.equal(
    paymentsReady({
      ...c,
      PAYMENTS_ENABLED: "true",
      LAUNCH_READY: "true",
      PLATFORM_FEE_BPS: "1000",
    }),
    true,
  );
  assert.equal(
    paymentsReady({
      ...c,
      STRIPE_WEBHOOK_SECRET: "",
      PAYMENTS_ENABLED: "true",
      LAUNCH_READY: "true",
      PLATFORM_FEE_BPS: "1000",
    }),
    false,
  );
  assert.equal(
    paymentsReady({
      ...c,
      PAYMENTS_ENABLED: "true",
      LAUNCH_READY: "true",
      PLATFORM_FEE_BPS: "99999",
    }),
    false,
  );
});

test("an unset bundle price is distinct from a seller choosing a free product", () => {
  const bundle = demoProducts.find((product) => product.kind === "bundle")!;
  assert.equal(bundle.price_cents, null);
  for (const value of ["", "  ", "-1", "1.999", "10000.01", "free"])
    assert.equal(priceInCents(value), null);
  assert.equal(priceInCents("0"), 0);
  assert.equal(priceInCents("89,95"), 8995);
  assert.equal(priceInCents("149"), 14900);
});

test("price sorting places unpriced previews last in either direction", () => {
  for (const sort of ["price-asc", "price-desc"]) {
    const sorted = filterProducts(demoProducts, "", "Tout", "all", sort);
    assert.equal(sorted.at(-1)?.price_cents, null);
    assert.notEqual(sorted[0].price_cents, null);
  }
});
