/* eslint-disable @typescript-eslint/no-explicit-any -- untyped JSON fixtures */
// User-market routes with Supabase and Stripe simulated at the HTTP boundary.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { marketApi } from "../lib/market/api";
import { rateLimit, siteOrigin, type Config } from "../lib/market/server";
import { publicConfig } from "../lib/market/config";
import { mergeFeedEvents, matchesFeedFilter } from "../lib/market/feed";
import { createFeedDemo, FEED_DEMO_ID_BASE } from "../lib/market/feed-demo";
import type { MarketEvent } from "../lib/market/market";
import {
  emptyOverview,
  marketRange,
  offerBounds,
  trend,
} from "../lib/market/market";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const origin = "https://marketpaperclip.test";
const buyer = "11111111-1111-4111-8111-111111111111";
const seller = "22222222-2222-4222-8222-222222222222";
const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const offerId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const orderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const base: Config = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_not_real",
  SUPABASE_SECRET_KEY: "sb_secret_test_not_real",
  STRIPE_SECRET_KEY: "sk_test_fixture_not_real",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture_not_real",
  SITE_URL: origin,
};
const launched: Config = {
  ...base,
  LAUNCH_READY: "true",
  PAYMENTS_ENABLED: "true",
  PLATFORM_FEE_BPS: "1000",
};
function sessionCookie(id = buyer) {
  const session = {
    access_token: [
      { alg: "HS256", typ: "JWT" },
      { sub: id, role: "authenticated", exp: 4102444800 },
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
    user: { id, email: "user@example.test" },
  };
  return (
    "sb-test-auth-token=base64-" +
    Buffer.from(JSON.stringify(session)).toString("base64url")
  );
}
function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(origin + "/api/" + path, {
    method,
    headers: {
      ...(method === "GET" ? {} : { origin, "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
type Call = { method: string; url: URL; body: string; headers: Headers };
// Routes every outbound call; the auth user and rate limiter are built in.
function network(
  handle: (call: Call) => Response | Promise<Response> | undefined,
  user: Record<string, unknown> = {},
) {
  const calls: Call[] = [];
  globalThis.fetch = async (input: any, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const call = {
      method: req.method,
      url: new URL(req.url),
      body: req.method === "GET" ? "" : await req.clone().text(),
      headers: req.headers,
    };
    calls.push(call);
    if (call.url.pathname === "/auth/v1/user")
      return Response.json({
        id: buyer,
        email: "buyer@example.test",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        ...user,
      });
    if (call.url.pathname === "/rest/v1/rpc/market_rate_limit")
      return Response.json(true);
    const r = await handle(call);
    if (r) return r;
    throw new Error("Unexpected " + call.method + " " + call.url.pathname);
  };
  return calls;
}
const pgError = (code: string, message: string, status = 400) =>
  Response.json({ code, message, details: null, hint: null }, { status });

test("Market ranges are bounded and an empty preview never invents numbers", async () => {
  assert.deepEqual(marketRange("24h"), { key: "24h", days: 1 });
  assert.deepEqual(marketRange("all"), { key: "all", days: 0 });
  assert.deepEqual(marketRange("1y; drop table"), { key: "7d", days: 7 });
  const empty = emptyOverview(7);
  assert.equal(empty.series.length, 7);
  assert.ok(empty.series.every((d) => d.volume_cents === 0 && d.sales === 0));
  assert.equal(emptyOverview(0).series.length, 30);
  const r = await marketApi(request("market/overview?range=24h"), {});
  const b: any = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.demo, true);
  assert.equal(b.overview.volume_cents, 0);
  assert.equal(b.overview.series.length, 1);
  for (const name of ["activity", "leaderboard", "trending"]) {
    const res: any = await (await marketApi(request("market/" + name), {})).json();
    assert.deepEqual(Object.values(res).find(Array.isArray), []);
  }
});

test("Market overview and leaderboard pass only the parsed range to the database", async () => {
  const seen: any[] = [];
  network((call) => {
    if (call.url.pathname === "/rest/v1/rpc/market_overview") {
      seen.push(JSON.parse(call.body));
      return Response.json({ volume_cents: 4900, sales: 1, series: [] });
    }
    if (call.url.pathname === "/rest/v1/rpc/market_leaderboard") {
      seen.push(JSON.parse(call.body));
      return Response.json([{ username: "studio", volume_cents: 4900 }]);
    }
  });
  const o: any = await (
    await marketApi(request("market/overview?range=30d"), base)
  ).json();
  assert.equal(o.overview.volume_cents, 4900);
  assert.equal(o.range, "30d");
  await marketApi(request("market/overview?range=evil"), base);
  const l: any = await (
    await marketApi(request("market/leaderboard?range=all&limit=500"), base)
  ).json();
  assert.equal(l.creators[0].username, "studio");
  assert.deepEqual(seen, [
    { p_days: 30 },
    { p_days: 7 },
    { p_days: 0, p_limit: 50 },
  ]);
});

test("Trending keeps the database rank and drops products that are no longer public", async () => {
  const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  network((call) => {
    if (call.url.pathname === "/rest/v1/rpc/market_trending")
      return Response.json([
        { id: other, acquisitions: 9, volume_cents: 9000, favorites: 1, offers: 0 },
        { id: productId, acquisitions: 2, volume_cents: 0, favorites: 0, offers: 0 },
        { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", acquisitions: 1, volume_cents: 0, favorites: 0, offers: 0 },
      ]);
    if (call.url.pathname === "/rest/v1/products") {
      assert.equal(call.url.searchParams.get("status"), "eq.published");
      return Response.json([
        { id: productId, title: "Second" },
        { id: other, title: "First" },
      ]);
    }
  });
  const b: any = await (await marketApi(request("market/trending"), base)).json();
  assert.deepEqual(
    b.products.map((p: any) => p.title),
    ["First", "Second"],
  );
  assert.equal(b.products[0].market.acquisitions, 9);
});

const feedEvent = (id: number, kind: MarketEvent["kind"] = "listed", amount = 100): MarketEvent => ({
  id, kind, amount_cents: amount, previous_cents: null, created_at: "2026-11-05T12:00:00Z",
  product: { slug: "public-model", title: "Public model", kind: "agent", engine: "Claude", cover_url: null },
  seller: { username: "creator", display_name: "Creator" },
});
test("Feed stays honest when no database is configured", async () => {
  const response = await marketApi(request("market/feed"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { events: [], more: false, oldest: null, newest: null, demo: true });
});
test("Public feed reads published listings and explicitly whitelists event fields", async () => {
  const calls = network(call => {
    if (call.url.pathname === "/rest/v1/market_events") return Response.json([
      { ...feedEvent(5), buyer_id: buyer, email: "must-not-leak@example.test", product: { ...feedEvent(5).product, storage_path: "private.zip" }, seller: { ...feedEvent(5).seller, email: "private@example.test" } },
      feedEvent(4), feedEvent(3),
    ]);
  });
  const response = await marketApi(request("market/feed?limit=2"), base);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { events: [feedEvent(5), feedEvent(4)], more: true, oldest: 4, newest: 5 });
  const query = calls.find(call => call.url.pathname === "/rest/v1/market_events")!.url.searchParams;
  assert.equal(query.get("product.status"), "eq.published");
  assert.equal(query.get("order"), "id.desc");
  assert.equal(query.get("limit"), "3");
  assert.ok(query.get("select")!.includes("!inner"));
});
test("Feed history uses an exclusive cursor and listing filter", async () => {
  const calls = network(call => call.url.pathname === "/rest/v1/market_events" ? Response.json([feedEvent(2)]) : undefined);
  const response = await marketApi(request("market/feed?before=3&filter=listings"), base);
  assert.equal(response.status, 200);
  const query = calls.find(call => call.url.pathname === "/rest/v1/market_events")!.url.searchParams;
  assert.equal(query.get("id"), "lt.3");
  assert.equal(query.get("kind"), "in.(listed,relisted)");
  assert.equal(query.get("order"), "id.desc");
});
test("Live feed walks forward in order without skipping a burst; sales exclude free acquisitions", async () => {
  const calls = network(call => call.url.pathname === "/rest/v1/market_events" ? Response.json([feedEvent(6,"sold"),feedEvent(7,"sold"),feedEvent(8,"sold")]) : undefined);
  const response = await marketApi(request("market/feed?after=5&limit=2&filter=sales"), base);
  assert.deepEqual(await response.json(), { events: [feedEvent(6,"sold"),feedEvent(7,"sold")], more: true, oldest: 6, newest: 7 });
  const query = calls.find(call => call.url.pathname === "/rest/v1/market_events")!.url.searchParams;
  assert.equal(query.get("id"), "gt.5");
  assert.equal(query.get("kind"), "eq.sold");
  assert.equal(query.get("amount_cents"), "gt.0");
  assert.equal(query.get("order"), "id.asc");
});
test("Invalid and conflicting feed cursors are rejected before querying market data", async () => {
  const calls = network(() => { throw Error("No data request expected"); });
  for (const query of ["before=0", "before=-2", "after=NaN", "after=1.5", "before=2&after=1", "limit=0", "limit=61", "filter=private", "after=9007199254740992"])
    assert.equal((await marketApi(request("market/feed?" + query), base)).status, 400, query);
  assert.ok(!calls.some(call => call.url.pathname === "/rest/v1/market_events"));
});
test("A feed database error remains generic and is never reported as an empty successful feed", async () => {
  network(call => call.url.pathname === "/rest/v1/market_events" ? Response.json({ message:"private-database-details",code:"XX000" },{status:500}) : undefined);
  const response = await marketApi(request("market/feed"), base);
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("private-database-details"));
});
test("Overlapping feed pages keep chronological order and one copy of every record", () => {
  assert.deepEqual(mergeFeedEvents([feedEvent(3),feedEvent(2)],[feedEvent(1),feedEvent(3),feedEvent(4)]).map(event => event.id), [1,2,3,4]);
});
test("Feed filters distinguish actual paid sales, free acquisitions and listing announcements", () => {
  assert.ok(matchesFeedFilter(feedEvent(1,"sold",100),"sales"));
  assert.ok(!matchesFeedFilter(feedEvent(2,"sold",0),"sales"));
  assert.ok(!matchesFeedFilter(feedEvent(3,"listed",100),"sales"));
  assert.ok(matchesFeedFilter(feedEvent(4,"relisted"),"listings"));
  assert.ok(matchesFeedFilter(feedEvent(5,"offer"),"all"));
});

test("Temporary demo has explicit sample identities and isolated cursor pagination", () => {
  const source = createFeedDemo(Date.parse("2026-11-06T01:00:00Z"));
  const first = source.page({filter:"all"});
  assert.equal(first.demo, true);
  assert.equal(first.events.length, 6);
  assert.ok(first.more);
  assert.ok(first.events.every(event => event.id > FEED_DEMO_ID_BASE && event.product.title.includes("Démo") && event.seller.username.startsWith("demo-")));
  const second = source.page({filter:"all",before:first.oldest!});
  const third = source.page({filter:"all",before:second.oldest!});
  assert.equal(new Set([...first.events,...second.events,...third.events].map(event => event.id)).size,16);
  assert.equal(third.more,false);
});
test("Adding a demo sale supplies one new event without touching the genuine feed", () => {
  const source = createFeedDemo();
  const first = source.page({filter:"all"});
  assert.ok(source.addSale());
  const next = source.page({filter:"all",after:first.newest!});
  assert.equal(next.events.length,1);
  assert.equal(next.events[0].kind,"sold");
  assert.ok(next.events[0].amount_cents! > 0);
  assert.equal(next.demo,true);
  assert.equal(source.page({filter:"sales"}).events.every(event => event.kind==="sold" && event.amount_cents!>0),true);
  assert.equal(source.page({filter:"listings"}).events.every(event => ["listed","relisted"].includes(event.kind)),true);
});
test("Demo autoplay finishes its scenario and manual additions stay bounded", () => {
  const source = createFeedDemo();
  for(let index=0;index<8;index++) assert.ok(source.advance());
  assert.equal(source.advance(),false);
  while(!source.full) assert.ok(source.addSale());
  assert.equal(source.addSale(),false);
  assert.equal(source.page({filter:"all"}).newest,FEED_DEMO_ID_BASE+64);
});
test("Reloading the demo resets it and returned examples cannot mutate another view", () => {
  const source = createFeedDemo();
  const page = source.page({filter:"all"});
  const title = page.events[0].product.title;
  page.events[0].product.title = "Changed outside the demo";
  assert.equal(source.page({filter:"all"}).events[0].product.title,title);
  source.addSale();
  assert.equal(createFeedDemo().page({filter:"all"}).newest,FEED_DEMO_ID_BASE+16);
});

test("Product pages carry market stats and activity, and survive a stats failure", async () => {
  network((call) => {
    if (call.url.pathname === "/rest/v1/products")
      return Response.json([
        { id: productId, slug: "real-agent", status: "published", title: "Real" },
      ]);
    if (call.url.pathname === "/rest/v1/reviews") return Response.json([]);
    if (call.url.pathname === "/rest/v1/rpc/market_product_stats")
      return Response.json({ [productId]: { sales: 3, favorites: 2 } });
    if (call.url.pathname === "/rest/v1/rpc/market_activity")
      return pgError("XX000", "boom", 500);
  });
  const r = await marketApi(request("products/real-agent"), base);
  const b: any = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.stats.sales, 3);
  assert.deepEqual(b.activity, []);
});

test("Offers wait for payments, and the buyer always comes from the session", async () => {
  network(() => undefined);
  const closed = await marketApi(
    request(
      "offers",
      "POST",
      { product_id: productId, amount_cents: 3000 },
      { cookie: sessionCookie() },
    ),
    base,
  );
  assert.equal(closed.status, 503);
  let rpc: any = null;
  network((call) => {
    if (call.url.pathname === "/rest/v1/rpc/market_make_offer") {
      rpc = JSON.parse(call.body);
      return Response.json(offerId);
    }
  });
  const forged = await marketApi(
    request(
      "offers",
      "POST",
      { product_id: productId, amount_cents: 3000, buyer_id: seller },
      { cookie: sessionCookie() },
    ),
    launched,
  );
  assert.equal(forged.status, 400);
  const ok = await marketApi(
    request(
      "offers",
      "POST",
      { product_id: productId, amount_cents: 3000, message: " Bonjour " },
      { cookie: sessionCookie() },
    ),
    launched,
  );
  assert.equal(ok.status, 201);
  assert.deepEqual(rpc, {
    p_product: productId,
    p_buyer: buyer,
    p_amount: 3000,
    p_message: "Bonjour",
  });
});

test("Offer database refusals become clear messages; unknown failures stay generic", async () => {
  const cases: [Response, number, RegExp][] = [
    [pgError("23505", 'duplicate key value violates unique constraint "offers_one_active"', 409), 409, /déjà une offre/],
    [pgError("P0001", "Offer too low"), 400, /20 %/],
    [pgError("P0001", "Offer must be below the listing price"), 400, /inférieure/],
    [pgError("P0001", "Already owned"), 409, /acquisitions/],
    [pgError("P0001", "Something internal: secret detail"), 500, /Impossible/],
  ];
  for (const [response, status, message] of cases) {
    network((call) =>
      call.url.pathname === "/rest/v1/rpc/market_make_offer"
        ? response.clone()
        : undefined,
    );
    const r = await marketApi(
      request(
        "offers",
        "POST",
        { product_id: productId, amount_cents: 3000 },
        { cookie: sessionCookie() },
      ),
      launched,
    );
    const b: any = await r.json();
    assert.equal(r.status, status);
    assert.match(b.error, message);
    assert.ok(!b.error.includes("secret detail"));
  }
});

test("Only the session user responds to or withdraws an offer", async () => {
  const bodies: any[] = [];
  network((call) => {
    if (call.url.pathname === "/rest/v1/rpc/market_respond_offer") {
      bodies.push(JSON.parse(call.body));
      return pgError("P0001", "Offer not found");
    }
    if (call.url.pathname === "/rest/v1/rpc/market_withdraw_offer") {
      bodies.push(JSON.parse(call.body));
      return new Response(null, { status: 204 });
    }
  });
  const r = await marketApi(
    request(
      `offers/${offerId}/respond`,
      "POST",
      { action: "accept" },
      { cookie: sessionCookie() },
    ),
    launched,
  );
  assert.equal(r.status, 404);
  const w = await marketApi(
    request(`offers/${offerId}/withdraw`, "POST", {}, { cookie: sessionCookie() }),
    launched,
  );
  assert.equal(w.status, 200);
  assert.deepEqual(bodies, [
    { p_offer: offerId, p_seller: buyer, p_action: "accept" },
    { p_offer: offerId, p_buyer: buyer },
  ]);
  const bad = await marketApi(
    request(
      `offers/${offerId}/respond`,
      "POST",
      { action: "steal" },
      { cookie: sessionCookie() },
    ),
    launched,
  );
  assert.equal(bad.status, 400);
});

function checkoutNetwork(opts: {
  offer?: Record<string, unknown> | null;
  existing?: Record<string, unknown> | null;
  price?: number;
  sellerState?: "missing" | "restricted";
}) {
  const state = {
    inserted: null as any,
    stripeBody: null as URLSearchParams | null,
    expired: [] as string[],
    orderPatches: [] as any[],
  };
  const calls = network((call) => {
    const p = call.url.pathname;
    if (p === "/rest/v1/products")
      return Response.json([
        {
          id: productId,
          seller_id: seller,
          title: "Real Agent",
          slug: "real-agent",
          version: "1.0.0",
          license: "MIT",
          price_cents: opts.price ?? 5000,
          status: "published",
          product_files: {
            version: "1.0.0",
            storage_path: "seller/package.zip",
            sha256: "a".repeat(64),
          },
        },
      ]);
    if (p === "/rest/v1/offers") {
      assert.equal(call.url.searchParams.get("buyer_id"), "eq." + buyer);
      return Response.json(opts.offer ? [opts.offer] : []);
    }
    if (p === "/rest/v1/orders") {
      if (call.method === "GET")
        return Response.json(opts.existing ? [opts.existing] : []);
      if (call.method === "POST") {
        state.inserted = JSON.parse(call.body);
        return Response.json({ ...state.inserted, id: orderId }, { status: 201 });
      }
      if (call.method === "PATCH") {
        state.orderPatches.push(JSON.parse(call.body));
        return new Response(null, { status: 204 });
      }
    }
    if (p === "/rest/v1/seller_accounts")
      return Response.json(opts.sellerState === "missing" ? [] : [{ stripe_account_id: "acct_seller" }]);
    if (p === "/v1/accounts/acct_seller")
      return Response.json({
        object: "account",
        id: "acct_seller",
        charges_enabled: opts.sellerState !== "restricted",
        payouts_enabled: opts.sellerState !== "restricted",
      });
    if (p === "/v1/checkout/sessions/cs_old")
      return Response.json({
        object: "checkout.session",
        id: "cs_old",
        status: "open",
        payment_status: "unpaid",
        url: "https://checkout.stripe.com/c/pay/cs_old",
      });
    if (p === "/v1/checkout/sessions/cs_old/expire") {
      state.expired.push("cs_old");
      return Response.json({ object: "checkout.session", id: "cs_old", status: "expired" });
    }
    if (p === "/v1/checkout/sessions") {
      state.stripeBody = new URLSearchParams(call.body);
      return Response.json({
        object: "checkout.session",
        id: "cs_new",
        url: "https://checkout.stripe.com/c/pay/cs_new",
      });
    }
  });
  return { state, calls };
}

test("A platform that has not activated Connect receives an actionable setup error without leaking Stripe details", async () => {
  const calls = network((call) => {
    if (call.url.pathname === "/rest/v1/seller_accounts") return Response.json([]);
    if (call.url.origin === "https://api.stripe.com" && call.url.pathname === "/v1/accounts")
      return Response.json({ error: { type: "invalid_request_error", message: "You can only create new accounts if you've signed up for Connect, which you can do at https://dashboard.stripe.com/connect" } }, { status: 400 });
  });
  const response = await marketApi(
    request("connect/onboard", "POST", {}, { cookie: sessionCookie() }),
    launched,
  );
  assert.equal(response.status, 503);
  const data = await response.json() as { code: string; error: string };
  assert.equal(data.code, "stripe_connect_setup_required");
  assert.match(data.error, /Stripe Connect/);
  assert.ok(!JSON.stringify(data).includes("dashboard.stripe.com"));
  assert.ok(!calls.some((call) => call.url.pathname === "/rest/v1/seller_accounts" && call.method !== "GET"));
});

test("Unavailable sellers never create pending orders or Stripe Checkout sessions", async () => {
  for (const sellerState of ["missing", "restricted"] as const) {
    const { state } = checkoutNetwork({ sellerState });
    const response = await marketApi(
      request("checkout", "POST", { product_id: productId, license_accepted: true }, { cookie: sessionCookie() }),
      launched,
    );
    assert.equal(response.status, 409);
    assert.equal(state.inserted, null);
    assert.equal(state.stripeBody, null);
  }
});

test("Checkout keeps the chosen language and adds tax to the CAD price", async () => {
  for (const locale of ["en", "fr"]) {
    const { state } = checkoutNetwork({});
    const response = await marketApi(
      request(
        "checkout",
        "POST",
        { product_id: productId, license_accepted: true },
        { cookie: sessionCookie() + "; mp-language=" + locale },
      ),
      { ...launched, STRIPE_TAX_ENABLED: "true" },
    );
    assert.equal(response.status, 200);
    const body = state.stripeBody!;
    assert.equal(body.get("locale"), locale === "fr" ? "fr-CA" : "en");
    assert.equal(body.get("line_items[0][price_data][currency]"), "cad");
    assert.equal(body.get("line_items[0][price_data][tax_behavior]"), "exclusive");
    assert.equal(body.get("automatic_tax[enabled]"), "true");
    const success = new URL(body.get("success_url")!);
    const cancel = new URL(body.get("cancel_url")!);
    assert.equal(success.origin, origin);
    assert.equal(success.pathname, "/library");
    assert.equal(success.searchParams.get("payment"), "processing");
    assert.equal(success.searchParams.get("lang"), locale);
    assert.equal(cancel.origin, origin);
    assert.equal(cancel.searchParams.get("checkout"), "cancelled");
    assert.equal(cancel.searchParams.get("lang"), locale);
  }
});

test("Checkout charges an accepted offer, never more than the current price", async () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const { state } = checkoutNetwork({
    offer: {
      id: offerId,
      product_id: productId,
      buyer_id: buyer,
      amount_cents: 3500,
      status: "accepted",
      expires_at: future,
    },
  });
  const r = await marketApi(
    request(
      "checkout",
      "POST",
      { product_id: productId, license_accepted: true, offer_id: offerId },
      { cookie: sessionCookie() },
    ),
    launched,
  );
  assert.equal(r.status, 200);
  assert.equal(state.inserted.amount_cents, 3500);
  assert.equal(state.inserted.fee_cents, 350);
  assert.equal(state.inserted.offer_id, offerId);
  assert.equal(
    state.stripeBody!.get("line_items[0][price_data][unit_amount]"),
    "3500",
  );
  assert.equal(
    state.stripeBody!.get("payment_intent_data[application_fee_amount]"),
    "350",
  );
  // The seller later lowered the price below the offer: the buyer pays less.
  const lower = checkoutNetwork({
    price: 3000,
    offer: {
      id: offerId,
      product_id: productId,
      buyer_id: buyer,
      amount_cents: 3500,
      status: "accepted",
      expires_at: future,
    },
  });
  await marketApi(
    request(
      "checkout",
      "POST",
      { product_id: productId, license_accepted: true, offer_id: offerId },
      { cookie: sessionCookie() },
    ),
    launched,
  );
  assert.equal(lower.state.inserted.amount_cents, 3000);
});

test("Expired, pending or foreign offers cannot be paid", async () => {
  for (const offer of [
    { status: "accepted", expires_at: new Date(Date.now() - 1000).toISOString() },
    { status: "pending", expires_at: new Date(Date.now() + 3600_000).toISOString() },
    null,
  ]) {
    const { state } = checkoutNetwork({
      offer: offer && {
        id: offerId,
        product_id: productId,
        buyer_id: buyer,
        amount_cents: 3500,
        ...offer,
      },
    });
    const r = await marketApi(
      request(
        "checkout",
        "POST",
        { product_id: productId, license_accepted: true, offer_id: offerId },
        { cookie: sessionCookie() },
      ),
      launched,
    );
    assert.equal(r.status, offer ? 409 : 404);
    assert.equal(state.inserted, null);
  }
});

test("A new agreed amount closes the previous checkout before charging", async () => {
  const { state } = checkoutNetwork({
    existing: {
      id: "99999999-9999-4999-8999-999999999999",
      status: "pending",
      amount_cents: 5000,
      offer_id: null,
      stripe_session_id: "cs_old",
    },
    offer: {
      id: offerId,
      product_id: productId,
      buyer_id: buyer,
      amount_cents: 3500,
      status: "accepted",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    },
  });
  const r = await marketApi(
    request(
      "checkout",
      "POST",
      { product_id: productId, license_accepted: true, offer_id: offerId },
      { cookie: sessionCookie() },
    ),
    launched,
  );
  assert.equal(r.status, 200);
  assert.deepEqual(state.expired, ["cs_old"]);
  assert.equal(state.orderPatches[0].status, "expired");
  assert.equal(state.inserted.amount_cents, 3500);
});

test("Free agents need the launch gate only: no Stripe key and no fee configuration", async () => {
  const { state, calls } = checkoutNetwork({ price: 0 });
  const r = await marketApi(
    request(
      "checkout",
      "POST",
      { product_id: productId, license_accepted: true },
      { cookie: sessionCookie() },
    ),
    {
      SUPABASE_URL: base.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: base.SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: base.SUPABASE_SECRET_KEY,
      SITE_URL: origin,
      LAUNCH_READY: "true",
    },
  );
  const b: any = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.url, "/library");
  assert.equal(state.inserted.status, "paid");
  assert.equal(state.inserted.fee_cents, 0);
  assert.ok(!calls.some((c) => c.url.hostname === "api.stripe.com"));
  // A paid product still refuses to start without payments.
  checkoutNetwork({ price: 5000 });
  const paid = await marketApi(
    request(
      "checkout",
      "POST",
      { product_id: productId, license_accepted: true },
      { cookie: sessionCookie() },
    ),
    { ...base, LAUNCH_READY: "true" },
  );
  assert.equal(paid.status, 503);
});

test("Listing controls validate input and map database refusals", async () => {
  const sent: any[] = [];
  network((call) => {
    if (call.url.pathname === "/rest/v1/products")
      return Response.json([{ id: productId, seller_id: buyer, status: "draft", version: "1.0.0" }]);
    if (call.url.pathname === "/rest/v1/rpc/market_set_price") {
      sent.push(JSON.parse(call.body));
      return pgError("P0001", "Listing price applies to reviewed products");
    }
    if (call.url.pathname === "/rest/v1/rpc/market_set_listing") {
      sent.push(JSON.parse(call.body));
      return pgError("P0001", "Review required");
    }
  });
  const cookie = sessionCookie();
  assert.equal(
    (
      await marketApi(
        request(`products/${productId}/price`, "POST", { price_cents: 12.5 }, { cookie }),
        base,
      )
    ).status,
    400,
  );
  const price = await marketApi(
    request(`products/${productId}/price`, "POST", { price_cents: 1200 }, { cookie }),
    base,
  );
  assert.equal(price.status, 409);
  const resume = await marketApi(
    request(`products/${productId}/listing`, "POST", { action: "resume" }, { cookie }),
    base,
  );
  assert.equal(resume.status, 409);
  assert.match(((await resume.json()) as any).error, /validée/);
  assert.deepEqual(sent, [
    { p_id: productId, p_seller: buyer, p_price: 1200 },
    { p_id: productId, p_seller: buyer, p_action: "resume" },
  ]);
});

test("Direct package uploads are scoped to the owner's product and verified before attaching", async () => {
  let removed: string[] = [];
  let attached: any = null;
  let downloaded = 0;
  let zip = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]);
  network((call) => {
    const p = call.url.pathname;
    if (p === "/rest/v1/products")
      return Response.json([{ id: productId, seller_id: buyer, status: "draft", version: "1.2.0" }]);
    if (p.startsWith("/storage/v1/object/upload/sign/agent-packages/"))
      return Response.json({ url: p.replace("/storage/v1", "") + "?token=tok" });
    if (p.startsWith("/storage/v1/object/agent-packages/")) {
      downloaded++;
      return new Response(zip, { headers: { "content-type": "application/zip" } });
    }
    if (p === "/storage/v1/object/agent-packages" && call.method === "DELETE") {
      removed = JSON.parse(call.body).prefixes;
      return Response.json([]);
    }
    if (p === "/rest/v1/rpc/market_attach_file") {
      attached = JSON.parse(call.body);
      return new Response(null, { status: 204 });
    }
  });
  const cookie = sessionCookie();
  const refused = await marketApi(
    request(`products/${productId}/file/upload`, "POST", { name: "agent.exe", size: 10 }, { cookie }),
    base,
  );
  assert.equal(refused.status, 400);
  const tooBig = await marketApi(
    request(`products/${productId}/file/upload`, "POST", { name: "agent.zip", size: 20971521 }, { cookie }),
    base,
  );
  assert.equal(tooBig.status, 400);
  const up: any = await (
    await marketApi(
      request(`products/${productId}/file/upload`, "POST", { name: "agent.zip", size: 7 }, { cookie }),
      base,
    )
  ).json();
  assert.match(up.path, new RegExp(`^${buyer}/${productId}/[0-9a-f-]{36}\\.zip$`));
  assert.match(up.url, /token=tok/);
  assert.equal(up.contentType, "application/zip");
  // Another user's object is refused before any download.
  const foreign = await marketApi(
    request(
      `products/${productId}/file/attach`,
      "POST",
      { path: up.path.replace(buyer, seller), name: "agent.zip" },
      { cookie },
    ),
    base,
  );
  assert.equal(foreign.status, 400);
  assert.equal(downloaded, 0);
  const ok: any = await (
    await marketApi(
      request(`products/${productId}/file/attach`, "POST", { path: up.path, name: "agent.zip" }, { cookie }),
      base,
    )
  ).json();
  assert.equal(ok.size, 7);
  assert.match(ok.sha256, /^[a-f0-9]{64}$/);
  assert.equal(attached.p_version, "1.2.0");
  assert.equal(attached.p_path, up.path);
  // A forged archive is deleted and never attached.
  attached = null;
  zip = new Uint8Array([0x4d, 0x5a, 0, 0]);
  const forged = await marketApi(
    request(`products/${productId}/file/attach`, "POST", { path: up.path, name: "agent.zip" }, { cookie }),
    base,
  );
  assert.equal(forged.status, 400);
  assert.deepEqual(removed, [up.path]);
  assert.equal(attached, null);
});

test("A confirmed owner email becomes moderator; unconfirmed or unlisted emails do not", async () => {
  for (const [user, expected] of [
    [{ email: "Owner@Example.test", email_confirmed_at: "2026-11-01T00:00:00Z" }, true],
    [{ email: "owner@example.test", email_confirmed_at: null }, false],
    [{ email: "someone@example.test", email_confirmed_at: "2026-11-01T00:00:00Z" }, false],
  ] as const) {
    let granted = false;
    network((call) => {
      const p = call.url.pathname;
      if (p === "/rest/v1/profiles") return Response.json([{ id: buyer, username: "dev-x" }]);
      if (p === "/rest/v1/seller_accounts") return Response.json([]);
      if (p === "/rest/v1/market_admins" && call.method === "GET") return Response.json([]);
      if (p === "/rest/v1/market_admins" && call.method === "POST") {
        granted = JSON.parse(call.body).user_id === buyer;
        return new Response(null, { status: 201 });
      }
      if (p === "/rest/v1/audit_log") return new Response(null, { status: 201 });
    }, user);
    const r: any = await (
      await marketApi(request("me", "GET", undefined, { cookie: sessionCookie() }), {
        ...base,
        MARKET_ADMIN_EMAILS: "owner@example.test, invalid-entry",
      })
    ).json();
    assert.equal(r.isAdmin, expected);
    assert.equal(granted, expected);
  }
});

test("Password recovery returns through the server callback to the reset form", async () => {
  let recover: any = null;
  network((call) => {
    if (call.url.pathname === "/auth/v1/recover") {
      recover = { body: JSON.parse(call.body), redirect: call.url.searchParams.get("redirect_to") };
      return Response.json({});
    }
  });
  const r = await marketApi(
    request("auth/recover", "POST", { email: "dev@example.test" }),
    base,
  );
  assert.equal(r.status, 200);
  assert.equal(
    recover.redirect,
    origin + "/api/auth/callback?next=%2Fsettings%3Freset%3D1",
  );
  const back = await marketApi(
    request("auth/callback?token_hash=hash&type=recovery"),
    base,
  );
  // verifyOtp is not mocked: an invalid link must never reach the reset form.
  assert.equal(back.headers.get("location"), "/?auth=invalid");
});

test("Site aliases keep visitors on declared origins and reject look-alikes", () => {
  const c = {
    SITE_URL: "https://marketpaperclip.com",
    SITE_ALIASES:
      "https://www.marketpaperclip.com, https://*--marketpaperclip.netlify.app,https://marketpaperclip.netlify.app",
  };
  const at = (u: string) => siteOrigin(c, new Request(u + "/api/x"));
  assert.equal(at("https://marketpaperclip.com"), "https://marketpaperclip.com");
  assert.equal(at("https://www.marketpaperclip.com"), "https://www.marketpaperclip.com");
  assert.equal(at("https://marketpaperclip.netlify.app"), "https://marketpaperclip.netlify.app");
  assert.equal(
    at("https://6740fa0e--marketpaperclip.netlify.app"),
    "https://6740fa0e--marketpaperclip.netlify.app",
  );
  for (const evil of [
    "https://evil.com",
    "http://www.marketpaperclip.com",
    "https://a.b--marketpaperclip.netlify.app",
    "https://x--marketpaperclip.netlify.app.evil.com",
    "https://--marketpaperclip.netlify.app",
  ])
    assert.equal(at(evil), "https://marketpaperclip.com", evil);
  assert.equal(
    siteOrigin({ SITE_URL: "https://marketpaperclip.com" }, new Request("https://evil.com/x")),
    "https://marketpaperclip.com",
  );
});

test("Rate limits key on the platform client address, hashed", async () => {
  const keys: string[] = [];
  globalThis.fetch = async (input: any, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    keys.push(JSON.parse(await req.text()).p_key);
    return Response.json(true);
  };
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient("https://test.supabase.co", "sb_secret_test");
  const at = (ip?: string) =>
    new Request(origin + "/api/auth/login", {
      headers: ip ? { "x-market-client-ip": ip } : {},
    });
  await rateLimit(db, at("203.0.113.1"), "auth");
  await rateLimit(db, at("203.0.113.2"), "auth");
  await rateLimit(db, at("203.0.113.1"), "auth");
  await rateLimit(db, at(), "auth");
  assert.equal(keys[0], keys[2]);
  assert.notEqual(keys[0], keys[1]);
  assert.notEqual(keys[0], keys[3]);
  assert.ok(keys.every((k) => /^[a-f0-9]{64}$/.test(k) && !k.includes("203")));
});

test("Public configuration exposes launch state and price visibility, never secrets", () => {
  const cfg = publicConfig({ ...launched, SHOW_PRICES: "false" });
  assert.equal(cfg.prices, false);
  assert.equal(cfg.launched, true);
  assert.equal(cfg.payments, true);
  assert.equal(publicConfig(base).prices, true);
  assert.equal(publicConfig({}).launched, false);
  assert.ok(!JSON.stringify(cfg).includes("not_real"));
  assert.deepEqual(offerBounds(5000), { min: 1000, max: 4999 });
  assert.deepEqual(offerBounds(300), { min: 100, max: 299 });
  assert.equal(trend([{ volume_cents: 100 }, { volume_cents: 150 }]), 50);
  assert.equal(trend([{ volume_cents: 0 }, { volume_cents: 0 }]), null);
});

test("Pretty-URL retries such as /api/x.html are answered 404 without side effects", async () => {
  let touched = false;
  globalThis.fetch = async () => {
    touched = true;
    throw new Error("No network expected");
  };
  for (const [path, method] of [
    [`studio/${productId}.html`, "GET"],
    [`products/${productId}.html`, "PATCH"],
    ["offers.htm", "POST"],
  ] as const) {
    const r = await marketApi(
      request(path, method, method === "GET" ? undefined : {}, { cookie: sessionCookie() }),
      launched,
    );
    assert.equal(r.status, 404, path);
  }
  assert.equal(touched, false);
});
