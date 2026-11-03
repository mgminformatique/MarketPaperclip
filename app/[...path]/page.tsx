import type { Metadata } from "next";
import Marketplace from "../../components/marketplace";
import { publicConfig } from "../../lib/market/config";
import { marketEnv } from "../../lib/market/runtime";
import { initialData } from "../../lib/market/public-data";
import { pageMetadata, StructuredData } from "../seo-page";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ path?: string[] }> };
async function pathOf(params: Props["params"]) {
  return "/" + ((await params).path || []).join("/");
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return pageMetadata(await pathOf(params));
}
export default async function Page({ params }: Props) {
  const data = await initialData(await pathOf(params));
  return (
    <>
      <StructuredData data={data} />
      <Marketplace initialConfig={publicConfig(marketEnv())} initialData={data} />
    </>
  );
}
