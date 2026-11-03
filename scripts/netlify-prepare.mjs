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

console.log(
  "Netlify functions prepared: " + Object.keys(targets).join(", "),
);
