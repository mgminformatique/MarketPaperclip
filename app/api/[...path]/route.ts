import { env } from "cloudflare:workers";
import { marketApi } from "../../../lib/market/api";
import type { Config } from "../../../lib/market/server";
export const dynamic = "force-dynamic";
function handle(req: Request) {
  return marketApi(req, env as unknown as Config);
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
