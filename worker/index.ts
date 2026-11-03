import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { requestLocale } from "../lib/i18n/locale";
import { runWithMarketEnv } from "../lib/market/runtime";
import type { Config } from "../lib/market/server";

type WorkerProps = {
  CONNECTORS?: ConnectorBinding;
  // Set by a trusted host adapter (Netlify function) from its own connection data.
  clientIp?: string;
};

// The browser must be able to send package uploads straight to Storage.
function storageOrigin(env: Config) {
  try {
    const url = new URL(env.SUPABASE_URL || "");
    // Local Supabase stacks (tests, development) are served over plain HTTP.
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    return url.protocol === "https:" || local ? url.origin : "";
  } catch {
    return "";
  }
}

const worker = {
  async fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext<WorkerProps>,
  ) {
    const config = env as unknown as Config;
    const requestUrl = new URL(request.url);
    // Email links fall back to the bare Site URL when a redirect is not allowed.
    if (
      requestUrl.pathname === "/" &&
      requestUrl.searchParams.has("token_hash") &&
      requestUrl.searchParams.has("type")
    )
      return new Response(null, {
        status: 303,
        headers: {
          location: "/api/auth/callback" + requestUrl.search,
          "cache-control": "no-store",
        },
      });
    const locale = requestLocale(request);
    const localizedHeaders = new Headers(request.headers);
    localizedHeaders.set("x-market-language", locale);
    // Never trust a client-supplied value: only the platform knows the peer.
    localizedHeaders.delete("x-market-client-ip");
    const clientIp =
      ctx.props?.clientIp || request.headers.get("cf-connecting-ip") || "";
    if (clientIp) localizedHeaders.set("x-market-client-ip", clientIp);
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
    const original = await runWithMarketEnv(config, () =>
      runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx)),
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
      const storage = storageOrigin(config);
      response.headers.set(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:${storage ? " " + storage : ""}; font-src 'self' data:; connect-src 'self'${storage ? " " + storage : ""}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.chatgpt.site`,
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
