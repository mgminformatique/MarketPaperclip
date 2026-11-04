import Marketplace from "../components/marketplace";
import { publicConfig } from "../lib/market/config";
import { marketEnv } from "../lib/market/runtime";

// Rendered with HTTP 404 when a page calls notFound(). The marketplace handles
// the path as before: « Page introuvable » for unknown pages; for a listing or
// a creator, its usual client-side load (an owner still sees an unpublished
// listing of their own, which the anonymous server render cannot read).
export default function NotFound() {
  return <Marketplace initialConfig={publicConfig(marketEnv())} />;
}
