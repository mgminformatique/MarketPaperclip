import { env } from "cloudflare:workers";
import Marketplace from "../../components/marketplace";
import { publicConfig } from "../../lib/market/config";
import type { Config } from "../../lib/market/server";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Marketplace initialConfig={publicConfig(env as unknown as Config)} />;
}
