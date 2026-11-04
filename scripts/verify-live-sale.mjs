// After an actual card payment, verify the buyer's normal delivery route.
// JSON on stdin only: { origin?, cookie, orderId, expectedSha256,
//   amountCents?:100, maxTotalCents?:100, feeCents?:15 }
// Never creates/pays an order, impersonates a buyer, or prints a cookie/signed URL.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk;
  if (raw.length > 30000) throw new Error("Input too large.");
}
try {
  const input = JSON.parse(raw);
  const origin = new URL(input.origin || "https://marketpaperclip.com").origin;
  assert.match(origin, /^https:\/\/(marketpaperclip\.com|marketpaperclip\.netlify\.app)$/);
  assert.match(input.orderId, /^[a-f0-9-]{36}$/i);
  assert.match(input.expectedSha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof input.cookie, "string");
  assert.ok(input.cookie && !/[\r\n]/.test(input.cookie));
  const amount = input.amountCents ?? 100;
  const maximum = input.maxTotalCents ?? 100;
  const fee = input.feeCents ?? 15;
  assert.ok([amount, maximum, fee].every((v) => Number.isSafeInteger(v) && v >= 0));
  assert.ok(maximum >= amount && fee <= amount);

  async function api(path, method = "GET") {
    const response = await fetch(origin + "/api/" + path, {
      method, redirect: "manual", signal: AbortSignal.timeout(20000),
      headers: { cookie: input.cookie, origin, ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      body: method === "POST" ? "{}" : undefined,
    });
    assert.equal(response.status, 200, `Buyer API ${path.split("?")[0]} must succeed`);
    return response.json();
  }
  const me = await api("me");
  assert.ok(me.user?.id, "A current buyer session is required");
  let order;
  for (let page = 0; page < 10 && !order; page++) {
    const data = await api("orders?page=" + page);
    order = data.orders.find((o) => o.id === input.orderId);
    if ((page + 1) * 20 >= data.total) break;
  }
  assert.ok(order, "The order must appear in this buyer's purchases");
  assert.equal(order.status, "paid", "Only a webhook-confirmed paid order is accepted");
  assert.equal(order.currency, "cad");
  assert.equal(order.amount_cents, amount);
  assert.equal(order.fee_cents, fee);
  assert.ok(Number.isSafeInteger(order.total_cents));
  assert.ok(Number.isSafeInteger(order.tax_cents) && order.tax_cents >= 0);
  assert.equal(order.total_cents, amount + order.tax_cents);
  assert.ok(order.total_cents <= maximum, "The charged total must stay within the owner's limit");

  const delivery = await api("orders/" + input.orderId + "/download", "POST");
  assert.equal(delivery.sha256, input.expectedSha256);
  const signed = new URL(delivery.url);
  assert.equal(signed.origin, "https://ltommtumsvvqxdknpkfd.supabase.co");
  assert.ok(signed.pathname.startsWith("/storage/v1/object/sign/agent-packages/"));
  // This request deliberately carries no marketplace cookie or auth header.
  const file = await fetch(signed, { redirect: "error", signal: AbortSignal.timeout(20000) });
  assert.equal(file.status, 200);
  const bytes = Buffer.from(await file.arrayBuffer());
  assert.ok(bytes.length > 0 && bytes.length <= 20971520);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), input.expectedSha256);
  console.log(JSON.stringify({
    at: new Date().toISOString(), orderId: order.id,
    buyerRouteVerified: true, status: order.status, currency: order.currency,
    amountCents: amount, totalCents: order.total_cents, feeCents: fee,
    bytes: bytes.length, sha256: delivery.sha256, downloadVerified: true,
    // Stripe Dashboard remains the separate proof of live mode and transfer.
    stripeLiveModeAndTransferRequireDashboardConfirmation: true,
  }, null, 2));
} catch (error) {
  console.error("Sale verification failed: " + (error instanceof assert.AssertionError ? error.message.split("\n")[0] : "check the input and buyer session"));
  process.exitCode = 1;
}
