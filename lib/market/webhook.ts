import { admin, stripe, check, ready, type Config } from "./server";
import Stripe from "stripe";
export async function handleWebhook(req: Request, c: Config) {
  if (!ready(c) || !c.STRIPE_WEBHOOK_SECRET || !c.STRIPE_SECRET_KEY)
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 1000000)
    return new Response("Payload too large", { status: 413 });
  const body = await req.text();
  if (body.length > 1000000)
    return new Response("Payload too large", { status: 413 });
  let event: Stripe.Event;
  const st = stripe(c);
  try {
    event = await st.webhooks.constructEventAsync(
      body,
      req.headers.get("stripe-signature") || "",
      c.STRIPE_WEBHOOK_SECRET,
      300,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  const db = admin(c);
  try {
    if (event.type === "account.updated") {
      const a = event.data.object as Stripe.Account;
      const { error } = await db
        .from("seller_accounts")
        .update({
          charges_enabled: a.charges_enabled,
          payouts_enabled: a.payouts_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", a.id);
      check(error);
      return Response.json({ received: true });
    }
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.expired",
        "checkout.session.async_payment_failed",
      ].includes(event.type)
    ) {
      const s = event.data.object as Stripe.Checkout.Session;
      const id = s.metadata?.order_id;
      if (!id) return Response.json({ received: true, ignored: true });
      const paid =
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded";
      if (paid && s.payment_status !== "paid")
        return Response.json({ received: true });
      const { error } = await db.rpc("market_apply_payment", {
        p_event_id: event.id,
        p_type: paid
          ? "paid"
          : event.type === "checkout.session.expired"
            ? "expired"
            : "failed",
        p_order_id: id,
        p_session_id: s.id,
        p_payment_intent:
          typeof s.payment_intent === "string" ? s.payment_intent : null,
        p_amount: s.amount_subtotal,
        p_currency: s.currency,
        p_buyer_id: s.metadata?.buyer_id || null,
        p_event_created: event.created,
        p_total: s.amount_total,
        p_tax: s.total_details?.amount_tax || 0,
      });
      check(error);
      return Response.json({ received: true });
    }
    if (
      [
        "charge.refunded",
        "charge.dispute.created",
        "charge.dispute.closed",
      ].includes(event.type)
    ) {
      const obj = event.data.object as Stripe.Charge | Stripe.Dispute;
      let pi =
        typeof obj.payment_intent === "string"
          ? obj.payment_intent
          : obj.payment_intent?.id;
      if (!pi && "charge" in obj) {
        const charge = await st.charges.retrieve(
          typeof obj.charge === "string" ? obj.charge : obj.charge.id,
        );
        pi =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
      }
      if (
        event.type === "charge.dispute.closed" &&
        (obj as Stripe.Dispute).status !== "won"
      )
        return Response.json({ received: true });
      if (pi) {
        const intent = await st.paymentIntents.retrieve(pi);
        if (intent.metadata.order_id) {
          const { error } = await db.rpc("market_apply_payment", {
            p_event_id: event.id,
            p_type:
              event.type === "charge.refunded"
                ? "refunded"
                : event.type === "charge.dispute.closed"
                  ? "dispute_won"
                  : "disputed",
            p_order_id: intent.metadata.order_id,
            p_payment_intent: pi,
            p_event_created: event.created,
            p_partial:
              event.type === "charge.refunded" &&
              (obj as Stripe.Charge).amount_refunded <
                (obj as Stripe.Charge).amount,
          });
          check(error);
        }
      }
      return Response.json({ received: true });
    }
    return Response.json({ received: true, ignored: true });
  } catch {
    console.error("stripe_webhook_processing_failed", {
      id: event.id,
      type: event.type,
    });
    return Response.json(
      { error: "Processing failed; retry required" },
      { status: 500 },
    );
  }
}
