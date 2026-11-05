// Packages the Vinext Worker build as Netlify Functions (Node runtime).
// Static files stay in dist/client and are served by Netlify's CDN first.
// Netlify Frameworks API: https://docs.netlify.com/build/frameworks/frameworks-api/
//
// One function serves pages and the API, so a warm instance answers both and
// visitors pay at most one cold start. Static files win (preferStatic).
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = path.join(root, "dist/server");
const client = path.join(root, "dist/client");
const functions = path.join(root, ".netlify/v1/functions");

async function mustExist(file, hint) {
  try {
    await stat(file);
  } catch {
    throw new Error(`${path.relative(root, file)} is missing. ${hint}`);
  }
}

await mustExist(path.join(server, "index.js"), "Run the Vinext build first.");
await mustExist(client, "Run the Vinext build first.");
// A static index would shadow the server-rendered home page.
const htmlAtRoot = (await readdir(client)).filter((f) => f.endsWith(".html"));
if (htmlAtRoot.length)
  throw new Error(
    "dist/client contains HTML files; they would bypass server rendering.",
  );

// The entry adapts Netlify's (Request, Context) signature to the Worker
// contract. Only the platform-observed address is forwarded as the client IP.
const entry = (config) => `import worker from "./server/index.js";

export default async function marketpaperclip(request, context) {
  const env = { ...process.env };
  const ctx = {
    waitUntil(promise) {
      if (typeof context?.waitUntil === "function") context.waitUntil(promise);
    },
    passThroughOnException() {},
    props: { clientIp: context?.ip || "" },
  };
  return worker.fetch(request, env, ctx);
}

export const config = ${JSON.stringify(config, null, 2)};
`;

const targets = {
  "marketpaperclip-server": {
    path: ["/", "/*"],
    preferStatic: true,
    displayName: "MarketPaperclip",
    generator: "marketpaperclip-netlify-prepare",
  },
};

await rm(functions, { recursive: true, force: true });
for (const [name, config] of Object.entries(targets)) {
  const target = path.join(functions, name);
  await mkdir(target, { recursive: true });
  await cp(server, path.join(target, "server"), { recursive: true });
  await writeFile(path.join(target, `${name}.mjs`), entry(config));
  // Keep the server chunks as plain ES modules next to the entry.
  await writeFile(
    path.join(target, "package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2) + "\n",
  );
}

// Opt-in, short-lived operator job. Scheduled functions have no public URL.
// A normal packaging run omits it and removes it from the next deployment.
if (process.env.MARKET_SELLER_SETUP_JOB === "true") {
  const name = "marketpaperclip-seller-setup";
  const target = path.join(functions, name);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await mkdir(target, { recursive: true });
  await cp(path.join(root, "scripts/ops/bootstrap-mgm-seller.mjs"), path.join(target, "bootstrap.mjs"));
  await writeFile(path.join(target, `${name}.mjs`), `import { bootstrapSeller } from "./bootstrap.mjs";
export default async function run() {
  const result = await bootstrapSeller(process.env, { expiresAt: ${JSON.stringify(expiresAt)} });
  console.log("seller_setup", JSON.stringify({ runId: result.runId, status: result.status, stage: result.stage, code: result.code }));
  return new Response(null, { status: 204 });
}
export const config = { schedule: "* * * * *", generator: "marketpaperclip-operator-setup" };
`);
  await writeFile(path.join(target, "package.json"), JSON.stringify({ type: "module", private: true }));
  console.log("Temporary seller setup job included; expires " + expiresAt);
}

console.log(
  "Netlify functions prepared: " + Object.keys(targets).join(", "),
);
