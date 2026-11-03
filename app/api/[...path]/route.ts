import { marketApi } from "../../../lib/market/api";
import { marketEnv } from "../../../lib/market/runtime";
export const dynamic = "force-dynamic";
function handle(req: Request) {
  return marketApi(req, marketEnv());
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
