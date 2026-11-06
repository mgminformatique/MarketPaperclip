/* eslint-disable @typescript-eslint/no-explicit-any -- untyped JSON fixtures */
// Public profiles: pictures, posts and their moderation, with Supabase
// simulated at the HTTP boundary.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { marketApi, stripJpegMetadata } from "../lib/market/api";
import type { Config } from "../lib/market/server";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const origin = "https://marketpaperclip.test";
const member = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const postId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const postProduct = { id:productId,seller_id:member,slug:"example-model",title:"Example model",tagline:"A complete public model.",description:"A complete public description for the model attached to this publication.",category:"Développement",kind:"agent",agent_count:1,engine:"Claude",version:"1.0.0",price_cents:100,currency:"cad",license:"MIT",tags:["profile"],requirements:"A compatible model runtime.",setup:"Read the documentation and configure the instructions.",status:"published",created_at:"2026-11-01T12:00:00Z",cover_url:null };
const config: Config = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_not_real",
  SUPABASE_SECRET_KEY: "sb_secret_test_not_real",
  SITE_URL: origin,
};
const media = "https://test.supabase.co/storage/v1/object/public/profile-media/";
const file = (owner: string, folder: string, ext = "jpg") =>
  `${media}${owner}/${folder}/${crypto.randomUUID()}.${ext}`;

function cookie(id = member) {
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
    user: { id, email: "member@example.test" },
  };
  return (
    "sb-test-auth-token=base64-" +
    Buffer.from(JSON.stringify(session)).toString("base64url")
  );
}
function request(path: string, method = "GET", body?: unknown, signedIn = true) {
  return new Request(origin + "/api/" + path, {
    method,
    headers: {
      ...(method === "GET" ? {} : { origin, "content-type": "application/json" }),
      ...(signedIn ? { cookie: cookie() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function upload(path: string, bytes: Uint8Array<ArrayBuffer>, type = "image/jpeg") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), "image");
  return new Request(origin + "/api/" + path, {
    method: "POST",
    headers: { origin, cookie: cookie() },
    body: form,
  });
}
type Call = { method: string; url: URL; body: string; bytes: Uint8Array };
function network(handle: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  globalThis.fetch = async (input: any, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const bytes =
      req.method === "GET" ? new Uint8Array() : new Uint8Array(await req.clone().arrayBuffer());
    const call = {
      method: req.method,
      url: new URL(req.url),
      body: new TextDecoder().decode(bytes),
      bytes,
    };
    calls.push(call);
    if (call.url.pathname === "/auth/v1/user")
      return Response.json({
        id: member,
        email: "member@example.test",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      });
    if (call.url.pathname === "/rest/v1/rpc/market_rate_limit")
      return Response.json(true);
    const r = handle(call);
    if (r) return r;
    throw new Error("Unexpected " + call.method + " " + call.url.pathname);
  };
  return calls;
}
// Smallest valid signatures; the server never decodes beyond them.
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1]);
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const segment = (marker: number, payload: string) => {
  const data = new TextEncoder().encode(payload);
  return [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff, ...data];
};
// SOI, JFIF, EXIF with a position, a comment, a quantization table, then
// the scan data and the end of image.
const cameraJpeg = new Uint8Array([
  0xff, 0xd8,
  ...segment(0xe0, "JFIF\0\x01\x01"),
  ...segment(0xe1, "Exif\0\0GPS 45.5017N 73.5673W"),
  ...segment(0xfe, "Shot on a phone"),
  ...segment(0xdb, "\0quant"),
  0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33,
  0xff, 0xd9,
]);

test("Every member has a public profile before publishing a model or activating payments", async () => {
  const calls = network(call => {
    if (call.url.pathname === "/rest/v1/profiles")
      return Response.json({ id: member, username: "new-member", display_name: "New member", bio: "", website: "", avatar_url: null, banner_url: null });
    if (call.url.pathname === "/rest/v1/products" || call.url.pathname === "/rest/v1/posts")
      return Response.json([]);
    if (call.url.pathname === "/rest/v1/rpc/market_creator_stats") return Response.json(null);
    if (call.url.pathname === "/rest/v1/rpc/market_activity") return Response.json([]);
  });
  const response = await marketApi(request("creators/new-member", "GET", undefined, false), config);
  assert.equal(response.status, 200);
  const data = await response.json() as { profile: { id: string; avatar_url: string | null; banner_url: string | null }; products: unknown[]; posts: unknown[] };
  assert.equal(data.profile.id, member);
  assert.equal(data.profile.avatar_url, null);
  assert.equal(data.profile.banner_url, null);
  assert.deepEqual(data.products, []);
  assert.deepEqual(data.posts, []);
  assert.equal(calls.find(call => call.url.pathname === "/rest/v1/products")?.url.searchParams.get("status"), "eq.published");
  assert.ok(!calls.some(call => call.url.pathname.includes("seller_accounts")));
});

test("Camera metadata is removed from JPEG files; image data is kept intact", () => {
  const clean = stripJpegMetadata(cameraJpeg);
  const text = new TextDecoder("latin1").decode(clean);
  assert.ok(!text.includes("Exif") && !text.includes("GPS") && !text.includes("phone"));
  assert.ok(text.includes("JFIF") && text.includes("quant"));
  assert.deepEqual([...clean.slice(0, 2)], [0xff, 0xd8]);
  // The scan (image data) and the end marker come through byte for byte.
  assert.deepEqual([...clean.slice(-11)], [...cameraJpeg.slice(-11)]);
  assert.equal(
    clean.length,
    cameraJpeg.length - segment(0xe1, "Exif\0\0GPS 45.5017N 73.5673W").length - segment(0xfe, "Shot on a phone").length,
  );
  // A truncated or malformed file is returned unharmed, never extended.
  const truncated = cameraJpeg.slice(0, 9);
  assert.ok(stripJpegMetadata(truncated).length <= truncated.length);
  const garbage = new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x02]);
  assert.deepEqual([...stripJpegMetadata(garbage)], [...garbage]);
});

test("A profile photo is checked, stored without metadata and replaces the old one", async () => {
  const old = file(member, "avatar");
  let stored: Call | null = null;
  let saved: any = null;
  let removed: string[] = [];
  network((call) => {
    const p = call.url.pathname;
    if (p === "/rest/v1/profiles" && call.method === "GET")
      return Response.json({ avatar_url: old, banner_url: null });
    if (p.startsWith("/storage/v1/object/profile-media/") && call.method === "POST") {
      stored = call;
      return Response.json({ Key: p });
    }
    if (p === "/rest/v1/profiles" && call.method === "PATCH") {
      saved = { filter: call.url.searchParams.get("id"), body: JSON.parse(call.body) };
      return new Response(null, { status: 204 });
    }
    if (p === "/storage/v1/object/profile-media" && call.method === "DELETE") {
      removed = JSON.parse(call.body).prefixes;
      return Response.json([]);
    }
  });
  const refused = await marketApi(upload("profile/avatar", svg, "image/png"), config);
  assert.equal(refused.status, 400);
  assert.equal(stored, null);
  const r = await marketApi(upload("profile/avatar", cameraJpeg), config);
  const b: any = await r.json();
  assert.equal(r.status, 200);
  assert.match(b.url, new RegExp(`^${media}${member}/avatar/[0-9a-f-]{36}\\.jpg$`));
  assert.ok(stored);
  const sent = new TextDecoder("latin1").decode((stored as unknown as Call).bytes);
  assert.ok(!sent.includes("GPS") && sent.includes("JFIF"));
  assert.equal(saved.filter, "eq." + member);
  assert.deepEqual(saved.body, { avatar_url: b.url });
  assert.deepEqual(removed, [old.slice(media.length)]);
});

test("Removing a banner clears it and deletes only the member's own file", async () => {
  let saved: any = null;
  const removed: string[][] = [];
  network((call) => {
    const p = call.url.pathname;
    if (p === "/rest/v1/profiles" && call.method === "GET")
      // A URL outside the member's folder is never deleted.
      return Response.json({ avatar_url: null, banner_url: file(other, "banner") });
    if (p === "/rest/v1/profiles" && call.method === "PATCH") {
      saved = JSON.parse(call.body);
      return new Response(null, { status: 204 });
    }
    if (p === "/storage/v1/object/profile-media" && call.method === "DELETE") {
      removed.push(JSON.parse(call.body).prefixes);
      return Response.json([]);
    }
  });
  const r = await marketApi(request("profile/banner", "DELETE"), config);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { url: null });
  assert.deepEqual(saved, { banner_url: null });
  assert.deepEqual(removed, []);
});

test("Posts need content, own photos and an own published listing", async () => {
  let inserted: any = null;
  let listed: URLSearchParams | null = null;
  network((call) => {
    const p = call.url.pathname;
    if (p === "/rest/v1/products") {
      listed = call.url.searchParams;
      return Response.json(call.url.searchParams.get("id") === "eq." + productId ? [{ id: productId }] : []);
    }
    if (p === "/rest/v1/posts" && call.method === "POST") {
      inserted = JSON.parse(call.body);
      return Response.json(
        { id: postId, ...inserted, created_at: "2026-11-03T17:00:00+00:00", product: postProduct },
        { status: 201 },
      );
    }
  });
  const empty = await marketApi(request("posts", "POST", { body: "   " }), config);
  assert.equal(empty.status, 400);
  const foreignPhoto = await marketApi(
    request("posts", "POST", { product_id:productId, body: "Regardez", images: [file(other, "posts")] }),
    config,
  );
  assert.equal(foreignPhoto.status, 400);
  const outsidePhoto = await marketApi(
    request("posts", "POST", { product_id:productId, body: "Regardez", images: ["https://evil.test/x.jpg"] }),
    config,
  );
  assert.equal(outsidePhoto.status, 400);
  const tooMany = await marketApi(
    request("posts", "POST", { product_id:productId, images: [1, 2, 3, 4, 5].map(() => file(member, "posts")) }),
    config,
  );
  assert.equal(tooMany.status, 400);
  const notMine = await marketApi(
    request("posts", "POST", {
      body: "Mon agent",
      product_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }),
    config,
  );
  assert.equal(notMine.status, 400);
  assert.equal(listed!.get("seller_id"), "eq." + member);
  assert.equal(listed!.get("status"), "eq.published");
  assert.equal(inserted, null);
  const photo = file(member, "posts", "png");
  const r = await marketApi(
    request("posts", "POST", {
      body: "  Mon nouvel agent est en vente.  ",
      product_id: productId,
      images: [photo, photo],
      author_id: other,
    }),
    config,
  );
  // Unknown fields (such as another author) are refused outright.
  assert.equal(r.status, 400);
  assert.equal(inserted, null);
  const ok = await marketApi(
    request("posts", "POST", {
      body: "  Mon nouvel agent est en vente.  ",
      product_id: productId,
      images: [photo, photo],
    }),
    config,
  );
  assert.equal(ok.status, 201);
  assert.deepEqual(inserted, {
    author_id: member,
    body: "Mon nouvel agent est en vente.",
    product_id: productId,
    images: [photo],
  });
});

test("Authors delete their posts; others need moderation rights, on record", async () => {
  let author = member;
  let admin = false;
  let deleted = 0;
  let audited: any = null;
  let removed: string[] = [];
  const photo = () => file(author, "posts");
  let images: string[] = [];
  network((call) => {
    const p = call.url.pathname;
    if (p === "/rest/v1/posts" && call.method === "GET")
      return Response.json(
        call.url.searchParams.get("id") === "eq." + postId
          ? [{ id: postId, author_id: author, images }]
          : [],
      );
    if (p === "/rest/v1/posts" && call.method === "DELETE") {
      deleted++;
      return new Response(null, { status: 204 });
    }
    if (p === "/rest/v1/market_admins")
      return Response.json(admin ? [{ user_id: member }] : []);
    if (p === "/storage/v1/object/profile-media" && call.method === "DELETE") {
      removed = JSON.parse(call.body).prefixes;
      return Response.json([]);
    }
    if (p === "/rest/v1/audit_log") {
      audited = JSON.parse(call.body);
      return new Response(null, { status: 201 });
    }
  });
  const missing = await marketApi(
    request("posts/dddddddd-dddd-4ddd-8ddd-dddddddddddd", "DELETE"),
    config,
  );
  assert.equal(missing.status, 404);
  images = [photo()];
  const own = await marketApi(request("posts/" + postId, "DELETE"), config);
  assert.equal(own.status, 200);
  assert.equal(deleted, 1);
  assert.deepEqual(removed, [images[0].slice(media.length)]);
  assert.strictEqual(audited === null, true);
  author = other;
  images = [photo()];
  const refused = await marketApi(request("posts/" + postId, "DELETE"), config);
  assert.equal(refused.status, 403);
  assert.equal(deleted, 1);
  admin = true;
  const moderated = await marketApi(request("posts/" + postId, "DELETE"), config);
  assert.equal(moderated.status, 200);
  assert.equal(deleted, 2);
  assert.deepEqual(removed, [images[0].slice(media.length)]);
  assert.equal(audited.action, "post.removed");
  assert.equal(audited.actor, member);
  assert.equal(audited.target, postId);
  assert.equal(audited.detail.author, other);
});

test("Profiles list posts newest first and page on with a validated cursor", async () => {
  const posts = Array.from({ length: 11 }, (_, i) => ({
    id: crypto.randomUUID(),
    author_id: member,
    body: "Post " + i,
    images: [],
    created_at: `2026-11-03T17:${String(59 - i).padStart(2, "0")}:00+00:00`,
    product: postProduct,
  }));
  let postQuery: URLSearchParams | null = null;
  let failPosts = false;
  network((call) => {
    const p = call.url.pathname;
    if (p === "/rest/v1/profiles")
      return Response.json([{ id: member, username: "studio-a", display_name: "Studio A", avatar_url: null, banner_url: null }]);
    if (p === "/rest/v1/products") return Response.json([]);
    if (p === "/rest/v1/rpc/market_creator_stats") return Response.json({});
    if (p === "/rest/v1/rpc/market_activity") return Response.json([]);
    if (p === "/rest/v1/posts") {
      postQuery = call.url.searchParams;
      return failPosts
        ? Response.json({ code: "42P01", message: "relation does not exist" }, { status: 404 })
        : Response.json(posts);
    }
  });
  const r = await marketApi(request("creators/studio-a", "GET", undefined, false), config);
  const b: any = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.posts.length, 10);
  assert.equal(b.more_posts, true);
  assert.equal(postQuery!.get("author_id"), "eq." + member);
  assert.equal(postQuery!.get("product.status"), "eq.published");
  assert.equal(postQuery!.get("product.seller_id"), "eq."+member);
  assert.ok(postQuery!.get("select")!.includes("products!inner"));
  assert.equal(postQuery!.get("order"), "created_at.desc");
  // Before the migration (or on a database error) the profile still renders.
  failPosts = true;
  const degraded: any = await (
    await marketApi(request("creators/studio-a", "GET", undefined, false), config)
  ).json();
  assert.deepEqual(degraded.posts, []);
  assert.equal(degraded.more_posts, false);
  failPosts = false;
  const bad = await marketApi(
    request("creators/studio-a/posts?before=yesterday", "GET", undefined, false),
    config,
  );
  assert.equal(bad.status, 400);
  // An unencoded "+" offset arrives as a space and is still understood.
  const next = await marketApi(
    request("creators/studio-a/posts?before=2026-11-03T17:50:00+00:00", "GET", undefined, false),
    config,
  );
  const page: any = await next.json();
  assert.equal(next.status, 200);
  assert.equal(page.more, true);
  assert.equal(postQuery!.get("created_at"), "lt.2026-11-03T17:50:00+00:00");
});

test("Product covers keep their checks after sharing the image reader", async () => {
  let stored = 0;
  network((call) => {
    const p = call.url.pathname;
    if (p === "/rest/v1/products" && call.method === "GET")
      return Response.json([{ id: productId, seller_id: member, status: "draft" }]);
    if (p.startsWith("/storage/v1/object/product-covers/")) {
      stored++;
      return Response.json({ Key: p });
    }
    if (p === "/rest/v1/products" && call.method === "PATCH")
      return new Response(null, { status: 204 });
  });
  const refused = await marketApi(upload(`products/${productId}/cover`, svg), config);
  assert.equal(refused.status, 400);
  assert.equal(stored, 0);
  const notMultipart = await marketApi(
    request(`products/${productId}/cover`, "POST", { file: "x" }),
    config,
  );
  assert.equal(notMultipart.status, 400);
  const ok = await marketApi(upload(`products/${productId}/cover`, png, "image/png"), config);
  assert.equal(ok.status, 200);
  assert.match(((await ok.json()) as any).url, /\/product-covers\/.+\.png$/);
  assert.equal(stored, 1);
});


test("Every new publication requires a product, even when text or photos are supplied", async () => {
  const calls=network(()=>{ throw new Error("An unlinked publication must be rejected before a database write"); });
  for(const body of [{body:"Text alone"},{body:"Text and photo",images:[file(member,"posts")]},{product_id:null,body:"No product"},{product_id:"not-a-product",images:[]}]) {
    const response=await marketApi(request("posts","POST",body),config);
    assert.equal(response.status,400);
  }
  assert.ok(!calls.some(call=>call.url.pathname==="/rest/v1/posts"));
});

test("Public profile cards exclude unlinked, private and foreign products and whitelist full listing fields", async () => {
  const linked={id:postId,author_id:member,body:"This model",images:[],created_at:"2026-11-06T00:00:00Z",product:postProduct};
  network(call=>{
    if(call.url.pathname==="/rest/v1/profiles") return Response.json([{id:member,username:"studio-a",display_name:"Studio A"}]);
    if(call.url.pathname==="/rest/v1/products") return Response.json([]);
    if(call.url.pathname==="/rest/v1/rpc/market_creator_stats") return Response.json({});
    if(call.url.pathname==="/rest/v1/rpc/market_activity") return Response.json([]);
    if(call.url.pathname==="/rest/v1/posts") return Response.json([
      {...linked,email:"private@example.test",product:{...postProduct,storage_path:"private.zip",product_files:[{storage_path:"private.zip"}]}},
      {...linked,id:other,product:null},
      {...linked,id:productId,product:{...postProduct,status:"draft"}},
      {...linked,id:member,product:{...postProduct,seller_id:other}},
    ]);
  });
  const response=await marketApi(request("creators/studio-a","GET",undefined,false),config);
  const body=await response.json() as any;
  assert.equal(body.posts.length,1);
  assert.deepEqual(body.posts[0],linked);
  for(const field of ["description","version","license","requirements","setup","tags","seller_id"]) assert.ok(field in body.posts[0].product);
  assert.ok(!JSON.stringify(body.posts).includes("private.zip"));
});
