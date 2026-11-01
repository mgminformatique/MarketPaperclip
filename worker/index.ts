import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { requestLocale } from "../lib/i18n/locale";

const worker = {
  async fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>,
  ) {
    const locale = requestLocale(request);
    const localizedHeaders = new Headers(request.headers);
    localizedHeaders.set("x-market-language", locale);
    request = new Request(request, { headers: localizedHeaders });
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt)
            return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return {
              status: "request_context_expired",
              message: "This request has expired. Please try again.",
            };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const original = await runWithConnectorBinding(binding, () =>
      handler.fetch(request, env, ctx),
    );
    const response = new Response(original.body, original);
    if (
      ["en", "fr"].includes(new URL(request.url).searchParams.get("lang") || "")
    ) {
      response.headers.append(
        "Set-Cookie",
        `mp-language=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
      );
    }
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (!import.meta.env.DEV) {
      response.headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.chatgpt.site",
      );
      response.headers.set("Strict-Transport-Security", "max-age=31536000");
    }
    if (
      request.url.includes("/api/") ||
      original.headers.get("content-type")?.includes("text/html")
    )
      response.headers.set("Cache-Control", "no-store");
    return response;
  },
};

export default worker;
