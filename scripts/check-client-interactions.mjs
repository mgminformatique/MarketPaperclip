// Run after deployment against the exact published client, without a browser.
// Input on stdin: {"origin":"https://…", "bearer":"optional private Site token"}
// The token stays in memory and is sent only to the specified HTTPS origin.
import assert from "node:assert/strict";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const {
  origin: suppliedOrigin,
  bearer,
  locale: initialLocale = "fr",
} = JSON.parse(input);
assert.ok(["fr", "en"].includes(initialLocale));
let browserWindow;
const origin = new URL(suppliedOrigin).origin;
assert.equal(new URL(origin).protocol, "https:");
const networkFetch = globalThis.fetch;
async function get(input, options = {}) {
  const url = new URL(typeof input === "string" ? input : input.url, origin);
  assert.equal(url.origin, origin, "QA requests must stay on the Site origin");
  assert.equal(
    options.method || "GET",
    "GET",
    "Smoke checks never mutate server data",
  );
  const headers = new Headers(options.headers);
  if (browserWindow?.document.cookie)
    headers.set("Cookie", browserWindow.document.cookie);
  if (bearer) headers.set("OAI-Sites-Authorization", `Bearer ${bearer}`);
  const response = await networkFetch(url, {
    ...options,
    headers,
    redirect: "error",
  });
  assert.equal(response.status, 200, `GET ${url.pathname}`);
  return response;
}
const initialUrl = origin + "/?lang=" + initialLocale;
const html = await (await get(initialUrl)).text();
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("error", (...args) =>
  errors.push(args.map(String).join(" ")),
);
virtualConsole.on("jsdomError", (error) => errors.push(error.message));
const dom = new JSDOM(html, {
  url: initialUrl,
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole,
});
const w = dom.window;
browserWindow = w;
assert.equal(
  w.document.documentElement.lang,
  initialLocale,
  "server-rendered language",
);
assert.match(
  w.document.title,
  initialLocale === "en"
    ? /The agent marketplace/
    : /Le marketplace des agents/,
);
Object.assign(w, {
  TextDecoder,
  TextEncoder,
  ReadableStream,
  TransformStream,
  Request,
  Response,
  Headers,
  AbortController,
  AbortSignal,
  fetch: get,
  scrollTo() {},
  matchMedia: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
});
w.addEventListener("error", (event) => errors.push(String(event.error)));
w.localStorage.setItem("mp-favorites", "null"); // Reproduce the stored-state regression.
const context = dom.getInternalVMContext();
const modules = new Map();
function loadModule(url) {
  if (modules.has(url)) return modules.get(url);
  const promise = (async () =>
    new vm.SourceTextModule(await (await get(url)).text(), {
      context,
      identifier: url,
      initializeImportMeta(meta) {
        meta.url = url;
      },
      async importModuleDynamically(specifier, ref) {
        const module = await loadModule(
          new URL(specifier, ref.identifier).href,
        );
        if (module.status === "unlinked") await module.link(link);
        if (module.status === "linked") await module.evaluate();
        return module;
      },
    }))();
  modules.set(url, promise);
  return promise;
}
function link(specifier, ref) {
  return loadModule(new URL(specifier, ref.identifier).href);
}
async function until(predicate, description) {
  const end = Date.now() + 15000;
  while (!predicate()) {
    assert.deepEqual(errors, [], description);
    assert.ok(Date.now() < end, `Timed out: ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
function click(element) {
  assert.ok(element, "Expected an interactive element");
  element.dispatchEvent(
    new w.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
  );
}
try {
  vm.runInContext(
    await (await get("/interaction-recovery.js")).text(),
    context,
  );
  for (const script of w.document.querySelectorAll("script:not([src])")) {
    vm.runInContext(script.textContent, context);
  }
  const entry = w.document.querySelector("script#_R_")?.getAttribute("src");
  assert.ok(entry, "Missing client bootstrap");
  const module = await loadModule(new URL(entry, origin).href);
  await module.link(link);
  await module.evaluate();
  await until(
    () => w.__NEXT_HYDRATED && w.document.querySelector(".save-button"),
    "hydration",
  );
  // Allow the effect that reads corrupt favorites to commit before testing clicks.
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(w.document.querySelector(".app-shell"));
  console.log("PASS client startup with invalid stored favorites");

  click(w.document.querySelector(".filter-button"));
  await until(() => w.document.querySelector(".extra-filters"), "filters");
  const favorite = w.document.querySelector(".save-button");
  click(favorite);
  await until(
    () => favorite.getAttribute("aria-pressed") === "true",
    "favorite click",
  );
  assert.equal(JSON.parse(w.localStorage.getItem("mp-favorites")).length, 1);
  click(
    [...w.document.querySelectorAll("button")].find(
      (b) =>
        b.textContent.trim() ===
        (initialLocale === "en" ? "Sign in" : "Connexion"),
    ),
  );
  await until(() => w.document.querySelector('[role="dialog"]'), "login modal");
  w.document.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await until(
    () => !w.document.querySelector('[role="dialog"]'),
    "modal close",
  );
  console.log("PASS filters, favorites, login dialog and keyboard dismissal");

  const languageButton = (code) =>
    w.document.querySelector(`.language-switch button[lang="${code}"]`);
  const linkTo = (selector, route) =>
    [...w.document.querySelectorAll(selector)].find(
      (a) => new URL(a.href).pathname === route,
    );
  async function setLanguage(code) {
    click(languageButton(code));
    await until(
      () =>
        w.document.documentElement.lang === code &&
        languageButton(code).getAttribute("aria-pressed") === "true",
      `switch to ${code}`,
    );
    assert.match(w.document.cookie, new RegExp(`mp-language=${code}`));
    assert.equal(new URL(w.location.href).searchParams.get("lang"), code);
  }
  await setLanguage("en");
  assert.match(w.document.querySelector(".hero h1").textContent, /superpower/);
  const engine = w.document.querySelector(".extra-filters select");
  const multi = [...engine.options].find(
    (option) => option.textContent === "Multi-model",
  );
  assert.equal(
    multi.value,
    "Multi-modèles",
    "localized label keeps canonical value",
  );
  engine.value = multi.value;
  engine.dispatchEvent(new w.Event("change", { bubbles: true }));
  await until(
    () => w.document.querySelectorAll(".product-card").length === 2,
    "English model filter",
  );
  await setLanguage("fr");
  assert.equal(
    engine.value,
    "Multi-modèles",
    "switching languages preserves filters",
  );
  assert.equal(w.document.querySelectorAll(".product-card").length, 2);
  await setLanguage("en");
  console.log("PASS FR/EN switch, persistent preference and canonical filters");

  for (const route of [
    "/agents",
    "/bundles",
    "/creators",
    "/favorites",
    "/library",
    "/studio",
    "/docs",
  ]) {
    click(linkTo(".sidebar a", route));
    await until(
      () => w.location.pathname === route && linkTo(".sidebar a.active", route),
      `navigation to ${route}`,
    );
    assert.equal(new URL(w.location.href).searchParams.get("lang"), "en");
    assert.equal(w.document.documentElement.lang, "en");
    if (route === "/agents" || route === "/bundles") {
      assert.equal(w.document.querySelector(".product-card .price"), null);
      assert.equal(w.document.querySelector('option[value="price-asc"]'), null);
      await setLanguage("fr");
      assert.equal(w.document.querySelector(".product-card .price"), null);
      await setLanguage("en");
      console.log(`PASS ${route} cards hide all pricing in FR/EN`);
    }
    console.log(`PASS English navigation ${route}`);
  }
  const expectedDocs = [
    "Expertise deserves a great format.",
    "A great download explains itself.",
    "A studio for your ideas.",
    "The right agent, in your environment.",
    "Transactions you can understand.",
  ];
  for (const [index, button] of [
    ...w.document.querySelectorAll(".docs-nav button"),
  ].entries()) {
    click(button);
    await until(
      () =>
        w.document.querySelector(".prose h2")?.textContent ===
        expectedDocs[index],
      "translated guide tab",
    );
  }
  console.log("PASS all English developer guide tabs");
  click(linkTo(".topbar a", "/studio/new"));
  await until(
    () =>
      w.location.pathname === "/studio/new" &&
      w.document.querySelector(".editor-form"),
    "publish button",
  );
  const title = w.document.querySelector(
    'input[placeholder="e.g. Code Pilot"]',
  );
  assert.ok(title);
  Object.getOwnPropertyDescriptor(
    w.HTMLInputElement.prototype,
    "value",
  ).set.call(title, "Connexion");
  title.dispatchEvent(new w.Event("input", { bubbles: true }));
  await until(
    () =>
      w.document.querySelector(".editor-preview h2").textContent ===
      "Connexion",
    "custom product title",
  );
  await setLanguage("fr");
  assert.equal(title.value, "Connexion");
  assert.equal(
    w.document.querySelector(".editor-preview h2").textContent,
    "Connexion",
  );
  await setLanguage("en");
  assert.equal(title.value, "Connexion");
  assert.equal(
    w.document.querySelector(".editor-preview h2").textContent,
    "Connexion",
  );
  assert.deepEqual(errors, []);
  console.log("PASS bilingual editor preserves user-entered content");
  click(
    [
      ...w.document.querySelectorAll(
        ".type-picker button, .kind-picker button",
      ),
    ].find((button) => button.textContent.includes("A bundle")) ||
      [...w.document.querySelectorAll(".editor-form button")].find((button) =>
        button.textContent.includes("A bundle"),
      ),
  );
  assert.equal(w.document.querySelector(".editor-preview strong"), null);
  assert.doesNotMatch(
    w.document.querySelector(".editor-preview").textContent,
    /\$|49/,
  );
  console.log("PASS creator preview hides all pricing");
  console.log(
    `PASS all compiled-client interaction checks; initial SSR locale ${initialLocale}`,
  );
} finally {
  dom.window.close();
}
