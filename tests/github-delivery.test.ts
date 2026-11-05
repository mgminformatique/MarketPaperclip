import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { marketApi } from "../lib/market/api";
import {
  githubDownload,
  trustedDownloadUrl,
  installationToken,
  verifySource,
} from "../lib/market/github";
import { publicConfig } from "../lib/market/config";
import type { Config } from "../lib/market/server";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const buyer = "11111111-1111-4111-8111-111111111111";
const seller = "22222222-2222-4222-8222-222222222222";
const product = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const origin = "https://marketpaperclip.test";
const secret = "installation-secret-never-in-browser";
const source = {
  installation_id: 123,
  repository_id: 456,
  release_id: 789,
  asset_id: 1001,
  owner: "seller",
  repo: "distribution",
  tag: "v1.2.0",
  commit_sha: "c".repeat(40),
  asset_name: "agent-1.2.0.zip",
  size_bytes: 8,
  sha256: "a".repeat(64),
  immutable: true,
};
const config: Config = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "anon-fixture",
  SUPABASE_SERVICE_ROLE_KEY: "service-fixture",
  SITE_URL: origin,
  LAUNCH_READY: "true",
  GITHUB_DELIVERY_ENABLED: "true",
  GITHUB_APP_ID: "42",
  GITHUB_APP_SLUG: "market-test",
  GITHUB_APP_CLIENT_ID: "client-fixture",
  GITHUB_APP_CLIENT_SECRET: "client-secret-fixture",
  GITHUB_APP_WEBHOOK_SECRET: "webhook-fixture",
};
let publicKey: CryptoKey;
before(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  publicKey = pair.publicKey;
  config.GITHUB_APP_PRIVATE_KEY =
    "-----BEGIN PRIVATE KEY-----\n" +
    Buffer.from(
      await crypto.subtle.exportKey("pkcs8", pair.privateKey),
    ).toString("base64") +
    "\n-----END PRIVATE KEY-----";
});
const session = {
  access_token: [
    Buffer.from('{"alg":"HS256"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({ sub: buyer, role: "authenticated", exp: 4102444800 }),
    ).toString("base64url"),
    "test",
  ].join("."),
  refresh_token: "test",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: { id: buyer, email: "buyer@example.test" },
};
const cookie =
  "sb-test-auth-token=base64-" +
  Buffer.from(JSON.stringify(session)).toString("base64url");
function request(
  path: string,
  method = "GET",
  body?: unknown,
  extraCookie = "",
) {
  return new Request(origin + "/api/" + path, {
    method,
    headers: {
      origin,
      cookie: cookie + (extraCookie ? "; " + extraCookie : ""),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const order = {
  id: orderId,
  product_id: product,
  buyer_id: buyer,
  seller_id: seller,
  product_version: "1.2.0",
  status: "paid",
  source_provider: "github_release",
  github_source: source,
  file_sha256: source.sha256,
};
function mockFetch(
  extra: (url: URL, req: Request) => Response | Promise<Response>,
  github?: (url: URL, req: Request) => Response | Promise<Response>,
) {
  globalThis.fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    if (url.pathname === "/auth/v1/user")
      return Response.json({
        id: buyer,
        email: "buyer@example.test",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01",
      });
    if (url.pathname === "/rest/v1/rpc/market_rate_limit")
      return Response.json(true);
    if (url.hostname === "api.github.com") {
      assert.equal(req.redirect, "manual");
      if (url.pathname === "/app/installations/123/access_tokens") {
        assert.deepEqual(await req.json(), {
          repository_ids: [456],
          permissions: { contents: "read" },
        });
        assert.ok(req.headers.get("authorization")?.startsWith("Bearer ey"));
        return Response.json({ token: secret });
      }
      if (github) return github(url, req);
      assert.equal(req.headers.get("authorization"), "Bearer " + secret);
      if (url.pathname === "/repositories/456")
        return Response.json({
          id: 456,
          name: source.repo,
          owner: { login: source.owner },
        });
      if (url.pathname === "/repos/seller/distribution/releases/789")
        return Response.json({
          id: 789,
          tag_name: source.tag,
          immutable: true,
          draft: false,
          assets: [
            {
              id: source.asset_id,
              name: source.asset_name,
              size: source.size_bytes,
              state: "uploaded",
              digest: "sha256:" + source.sha256,
            },
          ],
        });
      if (url.pathname === "/repos/seller/distribution/commits/v1.2.0")
        return Response.json({ sha: source.commit_sha });
    }
    return extra(url, req);
  };
}
test("installation JWT is signed and every token is limited to the selected repository and contents:read", async () => {
  let verified = false;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const [header, payload, signature] = req.headers
      .get("authorization")!
      .slice(7)
      .split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    assert.equal(claims.iss, "42");
    assert.ok(claims.exp - claims.iat <= 600);
    verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(header + "." + payload),
    );
    assert.deepEqual(await req.json(), {
      permissions: { contents: "read" },
      repository_ids: [456],
    });
    return Response.json({ token: secret });
  };
  assert.equal(await installationToken(config, 123, 456), secret);
  assert.equal(verified, true);
});
test("paid buyer receives the purchased Release, following a 302 without exposing GitHub credentials", async () => {
  mockFetch((url) => {
    if (url.pathname === "/rest/v1/orders") {
      assert.equal(url.searchParams.get("buyer_id"), "eq." + buyer);
      return Response.json([order]);
    }
    if (url.pathname.endsWith("/releases/assets/1001"))
      return new Response(null, {
        status: 302,
        headers: {
          Location:
            "https://release-assets.githubusercontent.com/github-production-release-asset/file?sig=short-lived",
        },
      });
    throw new Error("Unexpected " + url);
  });
  const start = await marketApi(
    request(`orders/${orderId}/download`, "POST", {}),
    config,
  );
  const data = (await start.json()) as { url: string; sha256: string };
  assert.equal(data.url, `/api/orders/${orderId}/download`);
  assert.equal(data.sha256, source.sha256);
  const response = await marketApi(
    request(data.url.replace("/api/", "")),
    config,
  );
  assert.equal(response.status, 303);
  assert.match(
    response.headers.get("location")!,
    /^https:\/\/release-assets\.githubusercontent\.com\//,
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("authorization"), null);
  assert.ok(!JSON.stringify([...response.headers]).includes(secret));
});
test("200 asset responses stream directly with an attachment and never use marketplace storage", async () => {
  const chunks = [new Uint8Array([80, 75, 3, 4]), new Uint8Array([1, 2, 3, 4])];
  mockFetch((url) => {
    assert.ok(!url.pathname.includes("storage"));
    if (url.pathname.endsWith("/releases/assets/1001"))
      return new Response(
        new ReadableStream({
          pull(controller) {
            const chunk = chunks.shift();
            if (chunk) controller.enqueue(chunk);
            else controller.close();
          },
        }),
        { headers: { "content-length": "8" } },
      );
    throw new Error("Unexpected " + url);
  });
  const response = await githubDownload(config, source, [
    "session=renewed; HttpOnly",
  ]);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition")!, /agent-1.2.0.zip/);
  assert.equal(response.headers.get("set-cookie"), "session=renewed; HttpOnly");
  assert.deepEqual(
    [...new Uint8Array(await response.arrayBuffer())],
    [80, 75, 3, 4, 1, 2, 3, 4],
  );
});
test("unpaid, refunded and foreign purchases cannot fetch GitHub assets, including direct GET", async () => {
  for (const method of ["GET", "POST"])
    for (const status of ["pending", "refunded", "disputed", "missing"]) {
      mockFetch(
        (url) => {
          if (url.pathname === "/rest/v1/orders")
            return Response.json(
              status === "missing" ? [] : [{ ...order, status }],
            );
          throw new Error("No GitHub or storage access allowed: " + url);
        },
        () => {
          throw new Error("No GitHub access allowed");
        },
      );
      assert.equal(
        (
          await marketApi(
            request(
              `orders/${orderId}/download`,
              method,
              method === "POST" ? {} : undefined,
            ),
            config,
          )
        ).status,
        403,
      );
    }
});
test("metadata replacement is refused before any file is downloaded", async () => {
  mockFetch(() => {
    throw new Error("No download permitted");
  });
  await assert.rejects(
    () => verifySource(config, { ...source, sha256: "b".repeat(64) }),
    /correspond plus/,
  );
  await assert.rejects(
    () => verifySource(config, { ...source, commit_sha: "d".repeat(40) }),
    /correspond plus/,
  );
});
test("download redirects cannot point at arbitrary hosts or carry injected user credentials", () => {
  for (const url of [
    "https://evil.test/file",
    "http://release-assets.githubusercontent.com/file",
    "https://release-assets.githubusercontent.com.evil.test/file",
    "https://token@release-assets.githubusercontent.com/file",
    "https://release-assets.githubusercontent.com:444/file",
    "/relative",
  ])
    assert.throws(() => trustedDownloadUrl(url));
});
test("a missing source suspends only the matching product snapshot; a GitHub rate limit does not", async () => {
  for (const upstream of [404, 403, 500]) {
    let suspended = false;
    mockFetch(
      async (url, req) => {
        if (url.pathname === "/rest/v1/orders") return Response.json([order]);
        if (url.pathname === "/rest/v1/rpc/market_github_source_health") {
          assert.deepEqual(await req.json(), {
            p_product: product,
            p_source: source,
            p_available: false,
          });
          suspended = true;
          return Response.json(null);
        }
        throw new Error("Unexpected " + url);
      },
      () => new Response(null, { status: upstream }),
    );
    const response = await marketApi(
      request(`orders/${orderId}/download`),
      config,
    );
    assert.equal(response.status, upstream === 500 ? 503 : 409);
    assert.equal(suspended, upstream === 404);
  }
});
test("checkout freezes GitHub references and verifies availability before creating an order", async () => {
  let inserted: Record<string, unknown> | undefined;
  let checked = false;
  mockFetch(async (url, req) => {
    if (url.pathname === "/rest/v1/products")
      return Response.json([
        {
          id: product,
          seller_id: seller,
          title: "Agent",
          version: "1.2.0",
          price_cents: 0,
          license: "MIT",
          product_files: {
            source_provider: "github_release",
            github_source: source,
            version: "1.2.0",
            sha256: source.sha256,
            storage_path: null,
          },
        },
      ]);
    if (url.pathname === "/rest/v1/rpc/market_github_source_health") {
      checked = true;
      return Response.json(null);
    }
    if (url.pathname === "/rest/v1/orders") {
      if (req.method === "GET") return Response.json([]);
      assert.equal(checked, true);
      inserted = await req.json();
      return Response.json({ ...inserted, id: orderId });
    }
    throw new Error("Unexpected " + url);
  });
  const response = await marketApi(
    request("checkout", "POST", {
      product_id: product,
      license_accepted: true,
    }),
    config,
  );
  assert.equal(response.status, 200);
  assert.equal(inserted?.source_provider, "github_release");
  assert.deepEqual(inserted?.github_source, source);
  assert.equal(inserted?.product_version, "1.2.0");
  assert.equal(inserted?.storage_path, null);
});
test("seller cannot attach a repository outside their verified installation grants", async () => {
  mockFetch(
    (url) => {
      if (url.pathname === "/rest/v1/products")
        return Response.json([
          { id: product, seller_id: buyer, status: "draft", version: "1.2.0" },
        ]);
      if (url.pathname === "/rest/v1/github_connections")
        return Response.json([{ repositories: [{ id: 999 }] }]);
      throw new Error("No token should be minted: " + url);
    },
    () => {
      throw new Error("No GitHub access permitted");
    },
  );
  const response = await marketApi(
    request(`products/${product}/file/github`, "POST", {
      installation_id: 123,
      repository_id: 456,
      release_id: 789,
      asset_id: 1001,
    }),
    config,
  );
  assert.equal(response.status, 403);
});
test("installation callback requires a matching state cookie and a single-use unexpired seller claim", async () => {
  mockFetch(() => {
    throw new Error("State mismatch must stop before network access");
  });
  const bad = await marketApi(
    request("github/callback?state=forged&code=code&installation_id=123"),
    config,
  );
  assert.equal(bad.status, 403);
  mockFetch((url) => {
    assert.equal(url.pathname, "/rest/v1/github_oauth_states");
    assert.equal(url.searchParams.get("seller_id"), "eq." + buyer);
    assert.ok(url.searchParams.get("expires_at")?.startsWith("gt."));
    return Response.json([]);
  });
  const expired = await marketApi(
    request(
      "github/callback?state=matching&code=code&installation_id=123",
      "GET",
      undefined,
      "mp-github-state=matching",
    ),
    config,
  );
  assert.equal(expired.status, 403);
});
test("installation callback verifies repository admin rights and stores no OAuth or installation token", async () => {
  for (const isAdmin of [false, true]) {
    let saved: Record<string, unknown> | undefined;
    mockFetch(
      async (url, req) => {
        if (url.pathname === "/rest/v1/github_oauth_states")
          return Response.json([{ next_path: "/studio" }]);
        if (url.pathname === "/login/oauth/access_token")
          return Response.json({ access_token: "oauth-secret" });
        if (url.pathname === "/rest/v1/github_connections") {
          saved = await req.json();
          return new Response(null, { status: 201 });
        }
        throw new Error("Unexpected " + url);
      },
      (url, req) => {
        if (url.pathname === "/app/installations/123")
          return Response.json({ app_id: 42, account: { login: "seller" } });
        assert.equal(req.headers.get("authorization"), "Bearer oauth-secret");
        assert.equal(url.pathname, "/user/installations/123/repositories");
        return Response.json({
          repositories: [
            {
              id: 456,
              name: "distribution",
              full_name: "seller/distribution",
              owner: { login: "seller" },
              permissions: { admin: isAdmin },
            },
          ],
        });
      },
    );
    const response = await marketApi(
      request(
        "github/callback?state=matching&code=code&installation_id=123",
        "GET",
        undefined,
        "mp-github-state=matching",
      ),
      config,
    );
    assert.equal(response.status, isAdmin ? 303 : 403);
    if (isAdmin) {
      assert.equal(saved?.installation_id, 123);
      assert.ok(!JSON.stringify(saved).includes("secret"));
    } else assert.equal(saved, undefined);
  }
});
test("setup and installation updates start OAuth with a fresh state before any repository is linked", async () => {
  let nextClaim: Record<string, unknown> | undefined;
  mockFetch(
    async (url, req) => {
      assert.equal(url.pathname, "/rest/v1/github_oauth_states");
      if (req.method === "DELETE")
        return Response.json([{ next_path: "/studio", installation_id: null }]);
      nextClaim = await req.json();
      return new Response(null, { status: 201 });
    },
    () => {
      throw new Error("No app or repository access before OAuth");
    },
  );
  const response = await marketApi(
    request(
      "github/callback?state=matching&installation_id=123",
      "GET",
      undefined,
      "mp-github-state=matching",
    ),
    config,
  );
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.pathname, "/login/oauth/authorize");
  assert.equal(
    location.searchParams.get("client_id"),
    config.GITHUB_APP_CLIENT_ID,
  );
  assert.notEqual(location.searchParams.get("state"), "matching");
  assert.equal(nextClaim?.installation_id, 123);
  assert.equal(nextClaim?.seller_id, buyer);
  assert.match(response.headers.getSetCookie().at(-1)!, /HttpOnly/);
});
test("moderators inspect the same GitHub source through a separately authorized route", async () => {
  mockFetch((url) => {
    if (url.pathname === "/rest/v1/market_admins")
      return Response.json([{ user_id: buyer }]);
    if (url.pathname === "/rest/v1/product_files")
      return Response.json({
        source_provider: "github_release",
        github_source: source,
        sha256: source.sha256,
      });
    if (url.pathname.endsWith("/releases/assets/1001"))
      return new Response(null, {
        status: 302,
        headers: {
          Location: "https://release-assets.githubusercontent.com/file",
        },
      });
    throw new Error("Unexpected " + url);
  });
  const prepared = await marketApi(
    request("admin/file", "POST", { product_id: product }),
    config,
  );
  assert.equal(prepared.status, 200);
  const data = (await prepared.json()) as { url: string };
  const inspected = await marketApi(
    request(data.url.replace("/api/", "")),
    config,
  );
  assert.equal(inspected.status, 303);
  assert.equal(
    inspected.headers.get("location"),
    "https://release-assets.githubusercontent.com/file",
  );
});
test("webhook signature is verified before database writes and signed removal events invalidate sources", async () => {
  const raw = JSON.stringify({ action: "deleted", installation: { id: 123 } });
  let writes = 0;
  mockFetch(() => {
    writes++;
    return Response.json(null);
  });
  const invalid = await marketApi(
    new Request(origin + "/api/webhooks/github", {
      method: "POST",
      body: raw,
      headers: {
        "x-github-event": "installation",
        "x-hub-signature-256": "sha256=" + "0".repeat(64),
      },
    }),
    config,
  );
  assert.equal(invalid.status, 400);
  assert.equal(writes, 0);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.GITHUB_APP_WEBHOOK_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Buffer.from(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  ).toString("hex");
  const valid = await marketApi(
    new Request(origin + "/api/webhooks/github", {
      method: "POST",
      body: raw,
      headers: {
        "x-github-event": "installation",
        "x-hub-signature-256": "sha256=" + signature,
      },
    }),
    config,
  );
  assert.equal(valid.status, 200);
  assert.equal(writes, 2);
});
test("the public feature flag is independent of GitHub login and exposes no app configuration", () => {
  const text = JSON.stringify(
    publicConfig({ ...config, GITHUB_AUTH_ENABLED: "false" }),
  );
  assert.equal(JSON.parse(text).githubDelivery, true);
  assert.equal(JSON.parse(text).github, false);
  for (const key of [
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_WEBHOOK_SECRET",
  ] as const)
    assert.ok(!text.includes(config[key]!));
});
