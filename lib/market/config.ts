import { paymentsReady, type Config } from "./server";
export function publicConfig(c: Config) {
  const accounts = !!(
    c.SUPABASE_URL &&
    (c.SUPABASE_PUBLISHABLE_KEY || c.SUPABASE_ANON_KEY) &&
    (c.SUPABASE_SECRET_KEY || c.SUPABASE_SERVICE_ROLE_KEY)
  );
  return {
    accounts,
    payments: paymentsReady(c),
    demo: !accounts,
    github: c.GITHUB_AUTH_ENABLED === "true",
    feeBps:
      c.PLATFORM_FEE_BPS &&
      Number.isInteger(Number(c.PLATFORM_FEE_BPS)) &&
      Number(c.PLATFORM_FEE_BPS) >= 0 &&
      Number(c.PLATFORM_FEE_BPS) <= 3000
        ? Number(c.PLATFORM_FEE_BPS)
        : null,
  };
}
