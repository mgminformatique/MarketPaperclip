import type { Metadata } from "next";
import Marketplace from "../components/marketplace";
import { publicConfig } from "../lib/market/config";
import { marketEnv } from "../lib/market/runtime";
import { initialData } from "../lib/market/public-data";
import { pageMetadata, StructuredData } from "./seo-page";
export const dynamic = "force-dynamic";
export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/");
}
export default async function Page() {
  const data = await initialData("/");
  return (
    <>
      <StructuredData data={data} />
      <Marketplace initialConfig={publicConfig(marketEnv())} initialData={data} />
    </>
  );
}
