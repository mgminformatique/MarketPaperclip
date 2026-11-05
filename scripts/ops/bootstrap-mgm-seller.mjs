// Explicit, bounded operator job. Deploy only through MARKET_SELLER_SETUP_JOB.
// It keeps production credentials inside Netlify, never accepts contracts,
// never supplies bank/identity details, and never creates or pays an order.
export const ownerId = "d3dda907-7cc7-470c-8b70-7dd7dd564aba";
export const platformId = "acct_1UXHVqCzSwrXhCYK";
export const runId = "mgm-seller-setup-2026-11-04-v1";
const databaseOrigin = "https://ltommtumsvvqxdknpkfd.supabase.co";
const action = "operator.seller.setup";

export async function bootstrapSeller(env, { expiresAt, now = Date.now() } = {}) {
  if (!Number.isFinite(Date.parse(expiresAt)) || now >= Date.parse(expiresAt))
    return { status: "expired", runId };
  if (env.SUPABASE_URL !== databaseOrigin || !env.SUPABASE_SECRET_KEY || !/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || ""))
    return { status: "configuration_refused", runId };

  async function call(origin, path, { method = "GET", body, idempotency } = {}) {
    const stripe = origin === "https://api.stripe.com";
    const response = await fetch(origin + path, {
      method, redirect: "error", signal: AbortSignal.timeout(8000),
      headers: stripe ? {
        authorization: "Bearer " + env.STRIPE_SECRET_KEY,
        "stripe-version": "2026-10-28.endive",
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotency ? { "idempotency-key": idempotency } : {}),
      } : {
        apikey: env.SUPABASE_SECRET_KEY,
        authorization: "Bearer " + env.SUPABASE_SECRET_KEY,
        ...(body ? { "content-type": "application/json", prefer: "resolution=ignore-duplicates,return=representation" } : {}),
      },
      body: body ? stripe ? new URLSearchParams(body) : JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error("Operator request failed");
      error.stage = stripe ? "stripe:" + path.split("?")[0] : "database:" + path.split("?")[0];
      error.httpStatus = response.status;
      // Provider codes only, never its message or response body.
      const code = data?.error?.code || data?.code || "request_failed";
      error.providerCode = /^[a-zA-Z0-9_-]{1,80}$/.test(code) ? code : "request_failed";
      throw error;
    }
    return data;
  }
  const db = (path, options) => call(databaseOrigin, path, options);
  const stripe = (path, options) => call("https://api.stripe.com", path, options);
  const audit = (detail) => db("/rest/v1/audit_log", {
    method: "POST", body: { actor: ownerId, action, target: ownerId, detail: { runId, ...detail } },
  });

  try {
    const previous = await db(`/rest/v1/audit_log?select=detail&action=eq.${action}&target=eq.${ownerId}&order=id.desc&limit=20`);
    if (previous.some((row) => row.detail?.runId === runId && row.detail?.status === "complete"))
      return { status: "already_complete", runId };
    const admins = await db(`/rest/v1/market_admins?select=user_id&user_id=eq.${ownerId}`);
    if (admins.length !== 1) throw new Error("Owner moderator missing");
    const platform = await stripe("/v1/account");
    if (platform.id !== platformId) throw new Error("Unexpected Stripe platform");
    const profile = (await db(`/rest/v1/profiles?select=id,display_name,username&id=eq.${ownerId}`))[0];
    const user = await db("/auth/v1/admin/users/" + ownerId);
    if (!profile || profile.display_name !== "MGM Informatique" || user.id !== ownerId || !user.email_confirmed_at || !user.email)
      throw new Error("Confirmed owner identity missing");
    const rows = await db(`/rest/v1/seller_accounts?select=stripe_account_id&user_id=eq.${ownerId}`);
    let account;
    let source;
    if (rows.length) {
      account = await stripe("/v1/accounts/" + rows[0].stripe_account_id);
      if (account.metadata?.user_id && account.metadata.user_id !== ownerId)
        throw new Error("Connected account belongs to a different profile");
      source = "existing_database_link";
    } else {
      const page = await stripe("/v1/accounts?limit=100");
      if (page.has_more) throw new Error("Account pagination requires operator review");
      const matches = page.data.filter((a) => a.metadata?.user_id === ownerId);
      if (matches.length > 1) throw new Error("Multiple matching seller accounts");
      account = matches[0];
      source = "existing_metadata_link";
      if (!account) {
        // Do not create a duplicate when an account may already belong to MGM.
        if (page.data.some((a) => a.email?.toLowerCase() === user.email.toLowerCase()))
          throw new Error("Existing email match requires operator association");
        account = await stripe("/v1/accounts", {
          method: "POST", idempotency: "seller-" + ownerId,
          body: {
            country: "CA", email: user.email,
            "controller[fees][payer]": "application",
            "controller[losses][payments]": "application",
            "controller[stripe_dashboard][type]": "express",
            "controller[requirement_collection]": "stripe",
            "capabilities[card_payments][requested]": "true",
            "capabilities[transfers][requested]": "true",
            "metadata[user_id]": ownerId,
            "business_profile[name]": profile.display_name,
            "business_profile[url]": "https://marketpaperclip.com/creators/" + profile.username,
            "business_profile[product_description]": "Downloadable AI agent instruction packages and documentation.",
          },
        });
        source = "created_for_confirmed_owner";
      }
      await db("/rest/v1/seller_accounts?on_conflict=user_id", {
        method: "POST", body: {
          user_id: ownerId, stripe_account_id: account.id,
          charges_enabled: !!account.charges_enabled, payouts_enabled: !!account.payouts_enabled,
          updated_at: new Date(now).toISOString(),
        },
      });
    }
    const linked = (await db(`/rest/v1/seller_accounts?select=stripe_account_id&user_id=eq.${ownerId}`))[0];
    if (linked?.stripe_account_id !== account.id) throw new Error("Seller link changed concurrently");
    await db(`/rest/v1/seller_accounts?user_id=eq.${ownerId}&stripe_account_id=eq.${account.id}`, {
      method: "PATCH", body: { charges_enabled: !!account.charges_enabled, payouts_enabled: !!account.payouts_enabled, updated_at: new Date(now).toISOString() },
    });
    const result = {
      status: "complete", source, platformId: platform.id, platformChargesEnabled: !!platform.charges_enabled,
      sellerAccountId: account.id, chargesEnabled: !!account.charges_enabled, payoutsEnabled: !!account.payouts_enabled,
      currentlyDue: account.requirements?.currently_due || [],
      disabledReason: account.requirements?.disabled_reason || null,
      paymentPerformed: false,
    };
    await audit(result);
    return { runId, ...result };
  } catch (error) {
    const result = { status: "failed", stage: error.stage || "identity_or_link_check", httpStatus: error.httpStatus || null, code: error.providerCode || "operator_review_required", paymentPerformed: false };
    await audit(result).catch(() => {});
    return { runId, ...result };
  }
}
