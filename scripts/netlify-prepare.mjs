// Packages the Vinext Worker build as one Netlify Function (Node runtime).
// Static files stay in dist/client and are served by Netlify's CDN first.
// Netlify Frameworks API: https://docs.netlify.com/build/frameworks/frameworks-api/
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = path.join(root, "dist/server");
const client = path.join(root, "dist/client");
const name = "marketpaperclip-server";
const target = path.join(root, ".netlify/v1/functions", name);

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

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(server, path.join(target, "server"), { recursive: true });

// The entry adapts Netlify's (Request, Context) signature to the Worker
// contract. Only the platform-observed address is forwarded as the client IP.
await writeFile(
  path.join(target, `${name}.mjs`),
  `import worker from "./server/index.js";

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

export const config = {
  path: ["/", "/*"],
  preferStatic: true,
  displayName: "MarketPaperclip",
  generator: "marketpaperclip-netlify-prepare",
};
`,
);

// Keep the server chunks as plain ES modules next to the entry.
await writeFile(
  path.join(target, "package.json"),
  JSON.stringify({ type: "module", private: true }, null, 2) + "\n",
);

console.log(`Netlify function prepared: .netlify/v1/functions/${name}`);
