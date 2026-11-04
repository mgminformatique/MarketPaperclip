// Read-only inspection through the owner's authenticated Stripe CLI session.
// No API keys are read from files, printed, or passed as command arguments.
import { execFileSync } from "node:child_process";

const expectedPlatform = "acct_1UXHVqCzSwrXhCYK";
function get(path, extra = []) {
  try {
    const output = execFileSync("stripe", ["get", path, "--live", "--color", "off", ...extra], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(output);
  } catch {
    throw new Error("Stripe CLI access failed. Confirm login, the selected account, live-mode access and API permissions.");
  }
}

try {
  const platform = get("/v1/account");
  if (platform.id !== expectedPlatform)
    throw new Error("The CLI is not connected to the known MarketPaperClip platform. Select that account with stripe switch before continuing.");
  const accounts = [];
  let cursor;
  do {
    const page = get("/v1/accounts", ["--limit", "100", ...(cursor ? ["--starting-after", cursor] : [])]);
    accounts.push(...page.data);
    cursor = page.has_more ? page.data.at(-1)?.id : undefined;
    if (accounts.length >= 1000 && cursor)
      throw new Error("More than 1000 connected accounts: use a narrower operator inspection.");
  } while (cursor);
  const endpoints = get("/v1/webhook_endpoints", ["--limit", "100"]);
  const sellerState = (account) => ({
    id: account.id,
    name: account.business_profile?.name || account.settings?.dashboard?.display_name || null,
    country: account.country,
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    marketplaceUserId: account.metadata?.user_id || null,
    currentlyDue: account.requirements?.currently_due || [],
    disabledReason: account.requirements?.disabled_reason || null,
  });
  const webhook = endpoints.data.filter((e) => e.url === "https://marketpaperclip.com/api/webhooks/stripe");
  console.log(JSON.stringify({
    at: new Date().toISOString(), mode: "live", platform: sellerState(platform),
    connectedAccounts: accounts.map(sellerState),
    webhook: webhook.map((e) => ({ id: e.id, status: e.status, live: e.livemode, apiVersion: e.api_version, events: e.enabled_events })),
    writesPerformed: false,
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
