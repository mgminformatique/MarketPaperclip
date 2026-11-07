/* eslint-disable @typescript-eslint/no-explicit-any -- untyped JSON fixtures */
// Public profiles: pictures, posts and their moderation, with Supabase
// simulated at the HTTP boundary.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { marketApi } from "../lib/market/api";
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
const postProduct = {
  id: productId,
  seller_id: member,
  slug: "example-model",
  title: "Example model",
  tagline: "A complete public model.",
  description:
    "A complete public description for the model attached to this publication.",
  category: "Développement",
  kind: "agent",
  agent_count: 1,
  engine: "Claude",
  version: "1.0.0",
  price_cents: 100,
  currency: "cad",
  license: "MIT",
  tags: ["profile"],
  requirements: "A compatible model runtime.",
  setup: "Read the documentation and configure the instructions.",
  status: "published",
  created_at: "2026-11-01T12:00:00Z",
  cover_url: null,
};
const config: Config = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_not_real",
  SUPABASE_SECRET_KEY: "sb_secret_test_not_real",
  SITE_URL: origin,
};
const media =
  "https://test.supabase.co/storage/v1/object/public/profile-media/";
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
function request(
  path: string,
  method = "GET",
  body?: unknown,
  signedIn = true,
) {
  return new Request(origin + "/api/" + path, {
    method,
    headers: {
      ...(method === "GET"
        ? {}
        : { origin, "content-type": "application/json" }),
      ...(signedIn ? { cookie: cookie() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function upload(
  path: string,
  bytes: Uint8Array<ArrayBuffer>,
  type = "image/jpeg",
) {
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
      req.method === "GET"
        ? new Uint8Array()
        : new Uint8Array(await req.clone().arrayBuffer());
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
const conversation = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
test("All members can be searched by @handle, without a published-product requirement or private columns", async () => {
  const calls = network((c) =>
    c.url.pathname === "/rest/v1/profiles"
      ? Response.json([{ id: other, username: "alice", display_name: "Alice" }])
      : undefined,
  );
  const r = await marketApi(
    request("users?q=@alice", "GET", undefined, false),
    config,
  );
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as any).users[0].username, "alice");
  const q = calls.find((c) => c.url.pathname === "/rest/v1/profiles")!.url
    .searchParams;
  assert.match(q.get("or")!, /username.ilike.alice%/);
  assert.doesNotMatch(q.get("select")!, /\*|email|products|seller_accounts/);
});
test("Private inbox and alerts require a valid user; CSRF is rejected before mutations", async () => {
  network(() => undefined);
  for (const route of [
    "chat",
    "notifications",
    "chat/" + conversation + "/messages",
  ])
    assert.equal(
      (await marketApi(request(route, "GET", undefined, false), config)).status,
      401,
    );
  const r = await marketApi(
    new Request(origin + "/api/chat", {
      method: "POST",
      headers: { cookie: cookie(), "content-type": "application/json" },
      body: JSON.stringify({ username: "alice" }),
    }),
    config,
  );
  assert.equal(r.status, 403);
});
test("Starting a chat always derives the actor from Auth", async () => {
  const calls = network((c) => {
    if (c.url.pathname === "/rest/v1/profiles")
      return Response.json({ id: other });
    if (c.url.pathname === "/rest/v1/rpc/market_chat_start")
      return Response.json(conversation);
  });
  const r = await marketApi(
    request("chat", "POST", { username: "@alice" }),
    config,
  );
  assert.equal(r.status, 200);
  assert.deepEqual(
    JSON.parse(
      calls.find((c) => c.url.pathname.endsWith("/market_chat_start"))!.body,
    ),
    { p_actor: member, p_peer: other },
  );
  assert.equal(
    (
      await marketApi(
        request("chat", "POST", { username: "alice", actor: other }),
        config,
      )
    ).status,
    400,
  );
});
test("A conversation hidden by RLS cannot expose messages or sign photos", async () => {
  const calls = network((c) =>
    c.url.pathname === "/rest/v1/conversations"
      ? Response.json(null)
      : undefined,
  );
  const r = await marketApi(
    request("chat/" + conversation + "/messages"),
    config,
  );
  assert.equal(r.status, 404);
  assert.ok(!calls.some((c) => c.url.pathname.includes("/storage/")));
});
test("Sending rejects forged actors and empty content, and maps blocking to a clear refusal", async () => {
  const calls = network((c) => {
    if (c.url.pathname === "/rest/v1/conversations")
      return Response.json({
        id: conversation,
        member_a: member,
        member_b: other,
      });
    if (c.url.pathname === "/rest/v1/rpc/market_chat_action")
      return Response.json(
        { code: "P0001", message: "Blocked conversation" },
        { status: 400 },
      );
  });
  for (const data of [
    { action: "send", body: "", client_id: postId },
    { action: "send", body: "Hi", client_id: postId, sender_id: other },
    { action: "react", message_id: 1, emoji: "<script>" },
  ])
    assert.equal(
      (await marketApi(request("chat/" + conversation, "POST", data), config))
        .status,
      400,
    );
  const r = await marketApi(
    request("chat/" + conversation, "POST", {
      action: "send",
      body: "Hello",
      client_id: postId,
    }),
    config,
  );
  assert.equal(r.status, 403);
  assert.equal(
    JSON.parse(
      calls.find((c) => c.url.pathname.endsWith("/market_chat_action"))!.body,
    ).p_actor,
    member,
  );
});
test("Private photo URLs are short lived and storage paths are omitted from chat output", async () => {
  network((c) => {
    if (c.url.pathname === "/rest/v1/conversations")
      return Response.json({
        id: conversation,
        member_a: member,
        member_b: other,
      });
    if (c.url.pathname === "/rest/v1/messages")
      return Response.json([
        {
          id: 1,
          body: "Photo",
          image_path: member + "/" + conversation + "/secret.png",
          deleted_at: null,
          reactions: [],
        },
      ]);
    if (c.url.pathname.includes("/storage/v1/object/sign/")) {
      assert.equal(JSON.parse(c.body).expiresIn, 600);
      return Response.json([
        {
          path: member + "/" + conversation + "/secret.png",
          signedURL: "/object/sign/chat-images/private?token=test",
        },
      ]);
    }
  });
  const r = await marketApi(
    request("chat/" + conversation + "/messages"),
    config,
  );
  assert.equal(r.status, 200);
  const d: any = await r.json();
  assert.ok(d.messages[0].image_url);
  assert.equal(d.messages[0].image_path, undefined);
});
test("Notification read acknowledgements are bounded to supplied ids and the authenticated owner", async () => {
  const calls = network((c) =>
    c.url.pathname === "/rest/v1/notifications"
      ? new Response(null, { status: 204 })
      : undefined,
  );
  const r = await marketApi(
    request("notifications", "PATCH", { ids: [postId] }),
    config,
  );
  assert.equal(r.status, 200);
  const update = calls.find(
    (c) => c.url.pathname === "/rest/v1/notifications",
  )!;
  assert.equal(update.url.searchParams.get("user_id"), "eq." + member);
  assert.ok(update.url.searchParams.get("id")?.includes(postId));
  assert.equal(
    (
      await marketApi(
        request("notifications", "PATCH", { ids: [], user_id: other }),
        config,
      )
    ).status,
    400,
  );
});
test('Chat photos validate membership and image bytes before private storage upload',async()=>{
 const calls=network(c=>{
  if(c.url.pathname==='/rest/v1/conversations')return Response.json({id:conversation});
  if(c.url.pathname.startsWith('/storage/v1/object/chat-images/'))return Response.json({Key:'chat-images/test'});
 });
 const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,1]);
 const good=await marketApi(upload('chat/'+conversation+'/images',png,'image/png'),config);assert.equal(good.status,200);
 const data:any=await good.json();assert.ok(data.image_path.startsWith(member+'/'+conversation+'/'));
 const bad=await marketApi(upload('chat/'+conversation+'/images',new TextEncoder().encode('<svg><script>evil</script></svg>'),'image/png'),config);assert.equal(bad.status,400);
 assert.equal(calls.filter(c=>c.url.pathname.startsWith('/storage/v1/object/chat-images/')).length,1);
});
