// Supabase Auth Send Email hook. Public at the HTTP layer: every call must
// carry the Standard Webhooks signature shared with Supabase Auth.
import { handleAuthEmail, type MailerEnv } from "../_shared/auth-email.ts";

type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
const runtime = (globalThis as unknown as { Deno: DenoRuntime }).Deno;
const names = [
  "SEND_EMAIL_HOOK_SECRET",
  "MS_TENANT_ID",
  "MS_CLIENT_ID",
  "MS_CLIENT_SECRET",
  "MAIL_FROM",
  "SITE_URL",
] as const;
const config = Object.fromEntries(
  names.map((name) => [name, runtime.env.get(name)]),
) as MailerEnv;
runtime.serve((request) => handleAuthEmail(request, config));
