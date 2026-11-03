import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
let db;
const buyer = "11111111-1111-4111-8111-111111111111",
  seller = "22222222-2222-4222-8222-222222222222",
  stranger = "33333333-3333-4333-8333-333333333333",
  admin = "44444444-4444-4444-8444-444444444444";
const product = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  order = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const query = (s, p = []) => db.query(s, p);
async function asUser(id, sql) {
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
    );
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
before(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const name of [
    "001_marketplace.sql",
    "002_atomic_publication.sql",
    "003_payment_reconciliation.sql",
    "004_public_column_grants.sql",
    "005_seller_statistics.sql",
    "006_product_covers.sql",
    "007_market_exchange.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  for (const id of [buyer, seller, stranger, admin])
    await query("insert into auth.users(id) values($1)", [id]);
  await query("insert into public.market_admins values($1)", [admin]);
  await query(
    `insert into products(id,seller_id,slug,title,tagline,description,category,kind,engine,version,price_cents,license,requirements,setup,status) values($1,$2,'real-agent','Real Agent','A useful developer agent','This real package has complete installation instructions and defined permissions for the buyer.','Développement','agent','Claude','1.0.0',4900,'MIT','Node.js 22 and Paperclip','Read the README and configure the environment variables.','draft')`,
    [product, seller],
  );
});
after(async () => {
  await db?.close();
});
test("Signup creates public profile, never an admin role", async () => {
  assert.equal(
    (await query("select count(*)::int n from profiles")).rows[0].n,
    4,
  );
  assert.equal(
    (await query("select count(*)::int n from market_admins")).rows[0].n,
    1,
  );
  assert.ok(
    (
      await query("select username from profiles where id=$1", [buyer])
    ).rows[0].username.startsWith("dev-"),
  );
});
test("Buyer cannot see another seller’s draft; owner can", async () => {
  assert.equal(
    (await asUser(buyer, "select id,title,status from products")).rows.length,
    0,
  );
  assert.equal(
    (await asUser(seller, "select id,title,status from products")).rows.length,
    1,
  );
});
test("Browser cannot publish or change monetary state", async () => {
  await assert.rejects(
    () =>
      asUser(
        seller,
        `update products set status='published' where id='${product}'`,
      ),
    /permission denied/,
  );
  await assert.rejects(
    () => asUser(buyer, `insert into market_admins values('${buyer}')`),
    /permission denied/,
  );
  await assert.rejects(
    () => asUser(buyer, `select * from seller_accounts`),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      asUser(
        seller,
        `select market_save_product('${product}','${seller}','{}')`,
      ),
    /permission denied/,
  );
});
test("Profile editing is limited to the current user", async () => {
  await asUser(
    buyer,
    `update profiles set display_name='Hacked' where id='${seller}'`,
  );
  assert.equal(
    (await query("select display_name from profiles where id=$1", [seller]))
      .rows[0].display_name,
    "Développeur",
  );
  await asUser(
    buyer,
    `update profiles set display_name='Buyer Name' where id='${buyer}'`,
  );
  assert.equal(
    (await query("select display_name from profiles where id=$1", [buyer]))
      .rows[0].display_name,
    "Buyer Name",
  );
});
test("Package ownership and publication transitions are checked atomically", async () => {
  await assert.rejects(
    () =>
      query("select market_attach_file($1,$2,$3,$4,$5,$6,$7)", [
        product,
        stranger,
        "bad.zip",
        "bad.zip",
        10,
        "a".repeat(64),
        "1.0.0",
      ]),
    /not owned/,
  );
  await query("select market_attach_file($1,$2,$3,$4,$5,$6,$7)", [
    product,
    seller,
    "seller/old.zip",
    "agent.zip",
    100,
    "a".repeat(64),
    "1.0.0",
  ]);
  await query("update products set status='pending' where id=$1", [product]);
  const p = (await query("select * from products where id=$1", [product]))
    .rows[0];
  await assert.rejects(
    () =>
      query("select market_moderate_product($1,$2,$3,$4,$5)", [
        product,
        seller,
        "published",
        "",
        p.updated_at,
      ]),
    /Admin required/,
  );
  await assert.rejects(
    () =>
      query("select market_moderate_product($1,$2,$3,$4,$5)", [
        product,
        admin,
        "published",
        "",
        "2000-01-01T00:00:00Z",
      ]),
    /changed/,
  );
  await query("select market_moderate_product($1,$2,$3,$4,$5)", [
    product,
    admin,
    "published",
    "Reviewed",
    p.updated_at,
  ]);
  assert.equal(
    (await asUser(buyer, "select id,title,status from products")).rows.length,
    1,
  );
  await assert.rejects(
    () =>
      query("select market_attach_file($1,$2,$3,$4,$5,$6,$7)", [
        product,
        seller,
        "replacement.zip",
        "new.zip",
        100,
        "b".repeat(64),
        "1.0.0",
      ]),
    /changed/,
  );
});
test("Nonbuyers cannot leave reviews", async () => {
  await assert.rejects(
    () =>
      asUser(
        buyer,
        `insert into reviews(product_id,user_id,rating,body) values('${product}','${buyer}',5,'Looks great but I never bought it')`,
      ),
    /row-level security/,
  );
});
test("Pending orders are unique per buyer and product and private to the parties", async () => {
  await query(
    `insert into orders(id,buyer_id,seller_id,product_id,product_title,product_version,license,storage_path,file_sha256,amount_cents,fee_cents,stripe_session_id) values($1,$2,$3,$4,'Real Agent','1.0.0','MIT','seller/old.zip',$5,4900,490,'cs_test_verified')`,
    [order, buyer, seller, product, "a".repeat(64)],
  );
  assert.equal(
    (await asUser(stranger, "select id,status from orders")).rows.length,
    0,
  );
  assert.equal(
    (await asUser(buyer, "select id,status from orders")).rows.length,
    1,
  );
  await assert.rejects(
    () =>
      query(
        `insert into orders(buyer_id,seller_id,product_id,product_title,product_version,license,storage_path,file_sha256,amount_cents,fee_cents) select buyer_id,seller_id,product_id,product_title,product_version,license,storage_path,file_sha256,amount_cents,fee_cents from orders where id=$1`,
        [order],
      ),
    /duplicate key/,
  );
});
test("Payment mismatch rolls back its event ledger; replay can be retried safely", async () => {
  await assert.rejects(
    () =>
      query(
        "select market_apply_payment($1,'paid',$2,'cs_test_verified','pi_test',1,'cad',$3,false)",
        ["evt_mismatch", order, buyer],
      ),
    /mismatch/,
  );
  assert.equal(
    (await query("select * from stripe_events where id='evt_mismatch'")).rows
      .length,
    0,
  );
  assert.equal(
    (await query("select status from orders where id=$1", [order])).rows[0]
      .status,
    "pending",
  );
});
test("Signed paid event grants purchase exactly once; review policy now succeeds", async () => {
  const args = ["evt_paid", order, buyer];
  assert.equal(
    (
      await query(
        "select market_apply_payment($1,'paid',$2,'cs_test_verified','pi_test',4900,'cad',$3,false) result",
        args,
      )
    ).rows[0].result,
    "applied",
  );
  assert.equal(
    (
      await query(
        "select market_apply_payment($1,'paid',$2,'cs_test_verified','pi_test',4900,'cad',$3,false) result",
        args,
      )
    ).rows[0].result,
    "duplicate",
  );
  assert.equal(
    (await query("select status from orders where id=$1", [order])).rows[0]
      .status,
    "paid",
  );
  await asUser(
    buyer,
    `insert into reviews(product_id,user_id,rating,body) values('${product}','${buyer}',5,'A verified purchase review with useful details.')`,
  );
  await assert.rejects(
    () =>
      asUser(
        stranger,
        `insert into reviews(product_id,user_id,rating,body) values('${product}','${buyer}',5,'Forged buyer identity in a review.')`,
      ),
    /row-level security/,
  );
});
test("A seller’s later update cannot replace the purchased delivery snapshot", async () => {
  await query(
    "update products set status='draft',version='2.0.0' where id=$1",
    [product],
  );
  await query("select market_attach_file($1,$2,$3,$4,$5,$6,$7)", [
    product,
    seller,
    "seller/v2.zip",
    "agent-v2.zip",
    200,
    "b".repeat(64),
    "2.0.0",
  ]);
  const o = (
    await query(
      "select storage_path,product_version,file_sha256 from orders where id=$1",
      [order],
    )
  ).rows[0];
  assert.equal(o.storage_path, "seller/old.zip");
  assert.equal(o.product_version, "1.0.0");
  assert.equal(o.file_sha256, "a".repeat(64));
});
test("Refund cannot be undone by a delayed paid event", async () => {
  await query(
    "select market_apply_payment('evt_refund','refunded',$1,null,'pi_test',null,null,null,false)",
    [order],
  );
  await query(
    "select market_apply_payment('evt_paid_late','paid',$1,'cs_test_verified','pi_test',4900,'cad',$2,false)",
    [order, buyer],
  );
  assert.equal(
    (await query("select status from orders where id=$1", [order])).rows[0]
      .status,
    "refunded",
  );
});
test("Rate limiting is durable and bounded", async () => {
  assert.equal(
    (await query("select market_rate_limit('test-rate',2,60) ok")).rows[0].ok,
    true,
  );
  assert.equal(
    (await query("select market_rate_limit('test-rate',2,60) ok")).rows[0].ok,
    true,
  );
  assert.equal(
    (await query("select market_rate_limit('test-rate',2,60) ok")).rows[0].ok,
    false,
  );
});

test("A delayed partial refund cannot downgrade a completed full refund", async () => {
  await query(
    "select market_apply_payment('evt_partial_late','refunded',$1,null,'pi_test',null,null,null,true,1)",
    [order],
  );
  assert.equal(
    (await query("select status from orders where id=$1", [order])).rows[0]
      .status,
    "refunded",
  );
});

test("Browser roles cannot read moderation notes or private package paths", async () => {
  await assert.rejects(
    () => asUser(buyer, "select moderation_note from products"),
    /permission denied/,
  );
  await assert.rejects(
    () => asUser(buyer, "select storage_path from orders"),
    /permission denied/,
  );
});

test("Seller totals are aggregated beyond a single page of transactions", async () => {
  await query(
    `insert into orders(buyer_id,seller_id,product_id,product_title,product_version,license,storage_path,file_sha256,amount_cents,fee_cents,status) select $1,$2,$3,'Agent','1.0.0','MIT','old.zip',$4,1000,100,'failed' from generate_series(1,120)`,
    [buyer, seller, product, "a".repeat(64)],
  );
  const stats = (await query("select market_seller_stats($1) stats", [seller]))
    .rows[0].stats;
  assert.equal(stats.orders_count, 121);
  assert.equal(stats.net_revenue, 0);
  assert.equal(stats.total_products, 1);
  await assert.rejects(
    () => asUser(stranger, `select market_seller_stats('${seller}')`),
    /permission denied/,
  );
});
