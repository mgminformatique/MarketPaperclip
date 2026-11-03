import Marketplace from "../../components/marketplace";
import { publicConfig } from "../../lib/market/config";
import { marketEnv } from "../../lib/market/runtime";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Marketplace initialConfig={publicConfig(marketEnv())} />;
}
