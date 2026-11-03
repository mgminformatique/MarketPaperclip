import { AsyncLocalStorage } from "node:async_hooks";
import type { Config } from "./server";

// Server configuration for the current request. Cloudflare passes bindings to
// the Worker entry; Netlify and other Node hosts expose them on process.env.
// Keeping the lookup here lets the same build run on either host.
const scope = new AsyncLocalStorage<Config>();

export function runWithMarketEnv<T>(env: Config, run: () => T): T {
  return scope.run(env, run);
}

export function marketEnv(): Config {
  const current = scope.getStore();
  if (current) return current;
  if (typeof process !== "undefined" && process.env)
    return process.env as unknown as Config;
  return {};
}
