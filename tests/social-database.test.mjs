import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
let db;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  x = "33333333-3333-4333-8333-333333333333";
const product = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let cid, mid;
const q = (sql, params = []) => db.query(sql, params);
async function asUser(id, sql) {
  try {
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
    return await q(sql);
  } finally {
    await db.exec("reset role");
  }
}
const action = (actor, act, data = {}, conversation = cid) =>
  q("select market_chat_action($1,$2,$3,$4::jsonb) result", [
    actor,
    conversation,
    act,
    JSON.stringify(data),
  ]);
before(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const file of (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  )
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  for (const id of [a, b, x])
    await q("insert into auth.users(id) values($1)", [id]);
  await q(
    `insert into products(id,seller_id,slug,title,tagline,description,category,kind,engine,version,price_cents,license,requirements,setup,status) values($1,$2,'social-test','Any product','A useful developer product','A complete package with documented permissions and installation instructions for its buyer.','Développement','agent','Claude','1.0.0',4900,'MIT','Node.js 22 and Paperclip','Read the README and configure the environment variables.','published')`,
    [product, b],
  );
});
after(async () => await db?.close());
test("Concurrent starts use one conversation; self conversations are refused", async () => {
  cid = (await q("select market_chat_start($1,$2) id", [a, b])).rows[0].id;
  assert.equal(
    (await q("select market_chat_start($1,$2) id", [b, a])).rows[0].id,
    cid,
  );
  await assert.rejects(
    () => q("select market_chat_start($1,$1)", [a]),
    /Invalid recipient/,
  );
});
test("Messages are persisted once across retries; sender identity and replies are constrained", async () => {
  const data = { body: "Hello privately", client_id: crypto.randomUUID() };
  mid = (await action(a, "send", data)).rows[0].result.id;
  assert.equal((await action(a, "send", data)).rows[0].result.id, mid);
  assert.equal((await q("select count(*)::int n from messages")).rows[0].n, 1);
  await assert.rejects(
    () =>
      action(x, "send", { body: "Intrusion", client_id: crypto.randomUUID() }),
    /Conversation not found/,
  );
  const other = (await q("select market_chat_start($1,$2) id", [a, x])).rows[0]
    .id;
  await assert.rejects(
    () =>
      action(
        a,
        "send",
        {
          body: "Cross-thread reply",
          reply_to: mid,
          client_id: crypto.randomUUID(),
        },
        other,
      ),
    /Invalid reply/,
  );
  await assert.rejects(
    () =>
      action(a, "send", {
        image_path: b + "/" + cid + "/image.png",
        client_id: crypto.randomUUID(),
      }),
    /Invalid image/,
  );
});
test("RLS hides private exchanges, member state, reactions and alerts from third parties", async () => {
  assert.equal((await asUser(b, "select * from messages")).rows.length, 1);
  assert.equal((await asUser(x, "select * from messages")).rows.length, 0);
  assert.equal(
    (
      await asUser(
        x,
        `select * from conversation_members where conversation_id='${cid}'`,
      )
    ).rows.length,
    0,
  );
  await action(b, "react", { message_id: mid, emoji: "❤️" });
  assert.equal(
    (await asUser(x, "select * from message_reactions")).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      asUser(
        a,
        `select market_chat_action('${b}','${cid}','delete','{"message_id":${mid}}')`,
      ),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      asUser(
        a,
        `insert into messages(conversation_id,sender_id,client_id,body) values('${cid}','${b}','${crypto.randomUUID()}','Forged')`,
      ),
    /permission denied/,
  );
});
test("Unread counts, bounded acknowledgements, reactions, edits and typing work", async () => {
  assert.equal(
    (await q("select market_chat_inbox($1) data", [b])).rows[0].data.unread,
    1,
  );
  await action(b, "read", { message_id: mid });
  assert.equal(
    (await q("select market_chat_inbox($1) data", [b])).rows[0].data.unread,
    0,
  );
  await action(a, "typing", { active: true });
  assert.ok(
    (
      await q(
        "select typing_until>now() active from conversation_members where conversation_id=$1 and user_id=$2",
        [cid, a],
      )
    ).rows[0].active,
  );
  await action(a, "edit", { message_id: mid, body: "Edited privately" });
  assert.equal(
    (await q("select body from messages where id=$1", [mid])).rows[0].body,
    "Edited privately",
  );
  await assert.rejects(
    () => action(b, "edit", { message_id: mid, body: "Hacked" }),
    /Message not found/,
  );
  await assert.rejects(
    () => action(b, "react", { message_id: mid, emoji: "arbitrary" }),
    /check constraint/,
  );
  await action(b, "react", { message_id: mid, emoji: null });
  assert.equal((await q("select * from message_reactions")).rows.length, 0);
});
test("Blocking works in both directions and can only be undone by its owner", async () => {
  await action(b, "block");
  await action(a, "unblock");
  await assert.rejects(
    () =>
      action(a, "send", { body: "Blocked", client_id: crypto.randomUUID() }),
    /Blocked conversation/,
  );
  await assert.rejects(
    () => action(b, "typing", { active: true }),
    /Blocked conversation/,
  );
  await assert.rejects(
    () => q("select market_chat_start($1,$2)", [a, b]),
    /Blocked conversation/,
  );
  await action(b, "unblock");
  await action(a, "delete", { message_id: mid });
  const m = (
    await q("select body,image_path,deleted_at from messages where id=$1", [
      mid,
    ])
  ).rows[0];
  assert.equal(m.body, "");
  assert.equal(m.image_path, null);
  assert.ok(m.deleted_at);
});
async function order(amount = 4900) {
  const id = crypto.randomUUID();
  await q(
    `insert into orders(id,buyer_id,seller_id,product_id,product_title,product_version,license,storage_path,file_sha256,amount_cents,fee_cents,status,stripe_session_id) values($1,$2,$3,$4,'Any product','1.0.0','MIT','private.zip',repeat('a',64),$5,0,'pending',$6)`,
    [id, a, b, product, amount, "cs_" + id],
  );
  return id;
}
test("Only confirmed payments notify both parties, with deduplication and private access", async () => {
  const id = await order();
  assert.equal((await q("select * from notifications")).rows.length, 0);
  await q(
    "select market_apply_payment('evt_social','paid',$1,$2,'pi_social',4900,'cad',$3)",
    [id, "cs_" + id, a],
  );
  await q(
    "select market_apply_payment('evt_social','paid',$1,$2,'pi_social',4900,'cad',$3)",
    [id, "cs_" + id, a],
  );
  await q(
    "select market_apply_payment('evt_social_again','paid',$1,$2,'pi_social',4900,'cad',$3)",
    [id, "cs_" + id, a],
  );
  assert.equal((await q("select * from notifications")).rows.length, 2);
  assert.equal((await asUser(x, "select * from notifications")).rows.length, 0);
  assert.equal(
    (await asUser(b, "select * from notifications where kind='sale'")).rows
      .length,
    1,
  );
  await q("update orders set status='refunded' where id=$1", [id]);
  await q("update orders set status='refunded' where id=$1", [id]);
  assert.equal(
    (await q("select * from notifications where kind='refunded'")).rows.length,
    2,
  );
});
test("Free acquisitions and offers create distinct, truthful notifications", async () => {
  const id = await order(0);
  await q("update orders set status='paid' where id=$1", [id]);
  assert.equal(
    (await q("select * from notifications where kind='acquisition'")).rows
      .length,
    1,
  );
  const offer = crypto.randomUUID();
  await q(
    "insert into offers(id,product_id,buyer_id,seller_id,amount_cents,list_cents) values($1,$2,$3,$4,2000,4900)",
    [offer, product, a, b],
  );
  assert.equal(
    (await q("select * from notifications where kind='offer'")).rows.length,
    1,
  );
  await q("update offers set status='accepted' where id=$1", [offer]);
  await q("update offers set status='accepted' where id=$1", [offer]);
  assert.equal(
    (await q("select * from notifications where kind='offer_accepted'")).rows
      .length,
    1,
  );
  assert.equal(
    (await q("select public from storage.buckets where id='chat-images'"))
      .rows[0].public,
    false,
  );
});
