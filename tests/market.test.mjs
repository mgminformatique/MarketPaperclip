// User market (migration 007) on embedded PostgreSQL with simulated Supabase roles.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db;
const seller = "22222222-2222-4222-8222-222222222222",
  buyer = "11111111-1111-4111-8111-111111111111",
  rival = "55555555-5555-4555-8555-555555555555",
  stranger = "33333333-3333-4333-8333-333333333333",
  admin = "44444444-4444-4444-8444-444444444444";
const product = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  draft = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  free = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const query = (s, p = []) => db.query(s, p);
const one = async (s, p = []) => (await query(s, p)).rows[0];
async function as(role, id, sql) {
  try {
    await db.exec(
      `set role ${role}; select set_config('request.jwt.claim.sub','${id || ""}',false);`,
    );
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
const migrations = [
  "001_marketplace.sql",
  "002_atomic_publication.sql",
  "003_payment_reconciliation.sql",
  "004_public_column_grants.sql",
  "005_seller_statistics.sql",
  "006_product_covers.sql",
  "007_market_exchange.sql",
];
async function publish(id, version = "1.0.0") {
  await query("select market_attach_file($1,$2,$3,$4,$5,$6,$7)", [
    id,
    seller,
    `${seller}/${id}/${version}.zip`,
    "agent.zip",
    1000,
    "a".repeat(64),
    version,
  ]);
  await query("update products set status='pending' where id=$1", [id]);
  const p = await one("select updated_at from products where id=$1", [id]);
  await query("select market_moderate_product($1,$2,'published','ok',$3)", [
    id,
    admin,
    p.updated_at,
  ]);
}
function insertProduct(id, slug, price) {
  return query(
    `insert into products(id,seller_id,slug,title,tagline,description,category,kind,engine,version,price_cents,license,requirements,setup,status)
     values($1,$2,$3,$4,'A useful developer agent','This real package has complete installation instructions and defined permissions for the buyer.','Développement','agent','Claude','1.0.0',$5,'MIT','Node.js 22 and Paperclip','Read the README and configure the environment variables.','draft')`,
    [id, seller, slug, "Agent " + slug, price],
  );
}
async function paidOrder(productId, buyerId, amount, extra = {}) {
  const r = await one(
    `insert into orders(buyer_id,seller_id,product_id,product_title,product_version,license,storage_path,file_sha256,amount_cents,fee_cents,status,paid_at,offer_id)
     values($1,$2,$3,'Agent','1.0.0','MIT','p.zip',$4,$5,0,$6,$7,$8) returning id`,
    [
      buyerId,
      seller,
      productId,
      "a".repeat(64),
      amount,
      extra.status || "paid",
      extra.status === "pending" ? null : new Date().toISOString(),
      extra.offer || null,
    ],
  );
  return r.id;
}

before(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const name of migrations)
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  for (const id of [buyer, seller, rival, stranger, admin])
    await query("insert into auth.users(id) values($1)", [id]);
  await query("update profiles set username='studio-one',display_name='Studio One' where id=$1", [seller]);
  await query("insert into market_admins values($1)", [admin]);
  await insertProduct(product, "real-agent", 5000);
  await insertProduct(draft, "secret-draft", 9000);
  await insertProduct(free, "free-agent", 0);
});
after(async () => {
  await db?.close();
});

test("Approval lists the product, records the reviewed version and emits a public event", async () => {
  await publish(product);
  const p = await one(
    "select status,approved_version,listed_at from products where id=$1",
    [product],
  );
  assert.equal(p.status, "published");
  assert.equal(p.approved_version, "1.0.0");
  assert.ok(p.listed_at);
  const e = await query(
    "select kind,amount_cents from market_events where product_id=$1",
    [product],
  );
  assert.deepEqual(e.rows, [{ kind: "listed", amount_cents: 5000 }]);
});

test("Sellers change a live price without review; only owners may do it", async () => {
  await assert.rejects(
    () => query("select market_set_price($1,$2,4000)", [product, stranger]),
    /not owned/,
  );
  await assert.rejects(
    () => query("select market_set_price($1,$2,-5)", [product, seller]),
    /Invalid price/,
  );
  await assert.rejects(
    () => query("select market_set_price($1,$2,100)", [draft, seller]),
    /reviewed products/,
  );
  await query("select market_set_price($1,$2,4500)", [product, seller]);
  const p = await one("select status,price_cents from products where id=$1", [
    product,
  ]);
  assert.equal(p.status, "published");
  assert.equal(p.price_cents, 4500);
  const e = await one(
    "select kind,amount_cents,previous_cents from market_events where product_id=$1 order by id desc limit 1",
    [product],
  );
  assert.deepEqual(e, {
    kind: "price_changed",
    amount_cents: 4500,
    previous_cents: 5000,
  });
});

test("Pause and resume keep the reviewed package; a new version needs a review", async () => {
  await query("select market_set_listing($1,$2,'pause')", [product, seller]);
  assert.equal(
    (await one("select status from products where id=$1", [product])).status,
    "archived",
  );
  assert.equal(
    (await as("anon", null, `select id from products where id='${product}'`))
      .rows.length,
    0,
  );
  await query("select market_set_listing($1,$2,'resume')", [product, seller]);
  assert.equal(
    (await one("select status from products where id=$1", [product])).status,
    "published",
  );
  const kinds = (
    await query(
      "select kind from market_events where product_id=$1 order by id",
      [product],
    )
  ).rows.map((r) => r.kind);
  assert.deepEqual(kinds, ["listed", "price_changed", "delisted", "relisted"]);
  await assert.rejects(
    () => query("select market_set_listing($1,$2,'resume')", [product, seller]),
    /paused/,
  );
  await assert.rejects(
    () => query("select market_set_listing($1,$2,'pause')", [product, stranger]),
    /not owned/,
  );
  // A paused listing whose version no longer matches the reviewed one stays off.
  await query("select market_set_listing($1,$2,'pause')", [product, seller]);
  await query("update products set version='1.1.0' where id=$1", [product]);
  await assert.rejects(
    () => query("select market_set_listing($1,$2,'resume')", [product, seller]),
    /Review required/,
  );
  await query("update products set version='1.0.0' where id=$1", [product]);
  await query("select market_set_listing($1,$2,'resume')", [product, seller]);
});

test("Offers are validated: not on own, free, unpublished or overpriced products", async () => {
  await assert.rejects(
    () => query("select market_make_offer($1,$2,3000,'')", [product, seller]),
    /Own product/,
  );
  await assert.rejects(
    () => query("select market_make_offer($1,$2,3000,'')", [draft, buyer]),
    /unavailable/,
  );
  await assert.rejects(
    () => query("select market_make_offer($1,$2,4500,'')", [product, buyer]),
    /below the listing price/,
  );
  await assert.rejects(
    () => query("select market_make_offer($1,$2,800,'')", [product, buyer]),
    /too low/,
  );
  await assert.rejects(
    () => query("select market_make_offer($1,$2,99,'')", [product, buyer]),
    /below the listing price|too low/,
  );
  await publish(free);
  await assert.rejects(
    () => query("select market_make_offer($1,$2,100,'')", [free, buyer]),
    /Free product/,
  );
});

test("One active offer per buyer and product; offers are private to both parties", async () => {
  const id = (
    await one("select market_make_offer($1,$2,3500,'Hello') id", [
      product,
      buyer,
    ])
  ).id;
  await assert.rejects(
    () => query("select market_make_offer($1,$2,3600,'')", [product, buyer]),
    /duplicate key/,
  );
  await query("select market_make_offer($1,$2,3000,'')", [product, rival]);
  assert.equal(
    (await as("authenticated", buyer, "select id from offers")).rows.length,
    1,
  );
  assert.equal(
    (await as("authenticated", seller, "select id from offers")).rows.length,
    2,
  );
  assert.equal(
    (await as("authenticated", stranger, "select id from offers")).rows.length,
    0,
  );
  await assert.rejects(
    () => as("anon", null, "select id from offers"),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      as(
        "authenticated",
        buyer,
        `update offers set status='accepted' where id='${id}'`,
      ),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      as(
        "authenticated",
        buyer,
        `select market_make_offer('${product}','${buyer}',3000,'')`,
      ),
    /permission denied/,
  );
  // The public event shows a bid amount but no bidder.
  const e = await one(
    "select * from market_events where kind='offer' order by id limit 1",
  );
  assert.equal(e.amount_cents, 3500);
  assert.equal("buyer_id" in e, false);
});

test("Only the seller responds; acceptance opens a 72 hour payment window", async () => {
  const offer = await one(
    "select id from offers where buyer_id=$1 and product_id=$2",
    [buyer, product],
  );
  await assert.rejects(
    () =>
      query("select market_respond_offer($1,$2,'accept')", [offer.id, buyer]),
    /not found/,
  );
  await query("select market_respond_offer($1,$2,'accept')", [
    offer.id,
    seller,
  ]);
  const o = await one(
    "select status,extract(epoch from expires_at-now())/3600 hours from offers where id=$1",
    [offer.id],
  );
  assert.equal(o.status, "accepted");
  assert.ok(o.hours > 71 && o.hours <= 72);
  await assert.rejects(
    () =>
      query("select market_respond_offer($1,$2,'decline')", [offer.id, seller]),
    /closed/,
  );
  const rivalOffer = await one(
    "select id from offers where buyer_id=$1 and product_id=$2",
    [rival, product],
  );
  await query("select market_respond_offer($1,$2,'decline')", [
    rivalOffer.id,
    seller,
  ]);
  assert.equal(
    (await one("select status from offers where id=$1", [rivalOffer.id]))
      .status,
    "declined",
  );
  // A declined buyer may try again with a new offer.
  await query("select market_make_offer($1,$2,3200,'')", [product, rival]);
  const again = await one(
    "select id from offers where buyer_id=$1 and status='pending'",
    [rival],
  );
  await assert.rejects(
    () => query("select market_withdraw_offer($1,$2)", [again.id, buyer]),
    /not found/,
  );
  await query("select market_withdraw_offer($1,$2)", [again.id, rival]);
});

test("Paying an accepted offer records one sale and completes the offer", async () => {
  const offer = await one(
    "select id,amount_cents from offers where buyer_id=$1 and status='accepted'",
    [buyer],
  );
  const orderId = await paidOrder(product, buyer, offer.amount_cents, {
    status: "pending",
    offer: offer.id,
  });
  await query(
    "update orders set stripe_session_id='cs_offer' where id=$1",
    [orderId],
  );
  await query(
    "select market_apply_payment('evt_offer_paid','paid',$1,'cs_offer','pi_offer',3500,'cad',$2,false)",
    [orderId, buyer],
  );
  assert.equal(
    (await one("select status from offers where id=$1", [offer.id])).status,
    "completed",
  );
  const sold = await query(
    "select amount_cents from market_events where kind='sold' and product_id=$1",
    [product],
  );
  assert.deepEqual(sold.rows, [{ amount_cents: 3500 }]);
  // A dispute won later is not a second sale.
  await query(
    "select market_apply_payment('evt_dispute','disputed',$1,null,'pi_offer',null,null,null,false,10)",
    [orderId],
  );
  await query(
    "select market_apply_payment('evt_dispute_won','dispute_won',$1,null,'pi_offer',null,null,null,false,20)",
    [orderId],
  );
  assert.equal(
    (
      await query(
        "select id from market_events where kind='sold' and product_id=$1",
        [product],
      )
    ).rows.length,
    1,
  );
  // An owner cannot make another offer.
  await assert.rejects(
    () => query("select market_make_offer($1,$2,3000,'')", [product, buyer]),
    /Already owned/,
  );
});

test("Market statistics aggregate sales without exposing buyers", async () => {
  await paidOrder(free, stranger, 0);
  const o = (await one("select market_overview(7) o")).o;
  assert.equal(o.volume_cents, 3500);
  assert.equal(o.sales, 1);
  assert.equal(o.acquisitions, 2);
  assert.equal(o.listed, 2);
  assert.equal(o.creators, 1);
  assert.equal(o.floor_cents, 4500);
  assert.equal(o.free, 1);
  assert.equal(o.series.length, 7);
  assert.equal(o.series.at(-1).volume_cents, 3500);
  const all = (await one("select market_overview(0) o")).o;
  assert.equal(all.series.length, 30);
  const board = (await one("select market_leaderboard(30,10) b")).b;
  assert.equal(board.length, 1);
  assert.equal(board[0].username, "studio-one");
  assert.equal(board[0].volume_cents, 3500);
  assert.equal(board[0].sales, 1);
  assert.equal(board[0].verified, false);
  const trending = (await one("select market_trending(7,8) t")).t;
  assert.deepEqual(
    trending.map((x) => x.id),
    [product, free],
  );
  const stats = (
    await one("select market_product_stats($1::uuid[]) s", [
      [product, draft],
    ])
  ).s;
  assert.equal(stats[product].sales, 1);
  assert.equal(stats[product].last_sale_cents, 3500);
  assert.equal(stats[draft], undefined);
  const creator = (await one("select market_creator_stats($1) c", [seller]))
    .c;
  assert.equal(creator.sales, 1);
  assert.equal(creator.buyers, 2);
  assert.equal(creator.listed, 2);
  const text = JSON.stringify([o, board, trending, stats, creator]);
  for (const id of [buyer, rival, stranger]) assert.ok(!text.includes(id));
});

test("Activity shows only currently published products and never a buyer", async () => {
  const feed = (await one("select market_activity(null,null,50) f")).f;
  assert.ok(feed.length >= 5);
  assert.ok(feed.every((e) => e.product.slug !== "secret-draft"));
  assert.ok(!JSON.stringify(feed).includes(buyer));
  const own = (await one("select market_activity($1,null,50) f", [product])).f;
  assert.ok(own.every((e) => e.product.slug === "real-agent"));
  assert.equal(own[0].seller.username, "studio-one");
  // Pausing hides the listing's history from the public feed.
  await query("select market_set_listing($1,$2,'pause')", [product, seller]);
  const hidden = (await one("select market_activity($1,null,50) f", [product]))
    .f;
  assert.equal(hidden.length, 0);
  await query("select market_set_listing($1,$2,'resume')", [product, seller]);
});

test("Browser roles cannot call market functions or read the event ledger", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const sql of [
      "select * from market_events",
      "select market_overview(7)",
      `select market_activity(null,null,5)`,
      `select market_set_price('${product}','${seller}',1)`,
      `select market_set_listing('${product}','${seller}','pause')`,
      `select market_respond_offer('${product}','${seller}','accept')`,
    ])
      await assert.rejects(
        () => as(role, seller, sql),
        /permission denied/,
        role + ": " + sql,
      );
  }
  await assert.rejects(
    () => as("authenticated", seller, "select approved_version from products"),
    /permission denied/,
  );
  assert.equal(
    (await as("anon", null, "select listed_at from products")).rows.length,
    2,
  );
});
