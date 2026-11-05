// Run after deployment against the exact published client, without a browser.
// Input on stdin: {"origin":"https://…", "bearer":"optional private Site token"}
// The token stays in memory and is sent only to the specified HTTPS origin.
// Optional googleFixture:true enables Google only inside this test's DOM;
// it never changes the site configuration or starts an OAuth request.
// authOnly:true checks the login dialog on production without demo catalogue assumptions.
// studioFixture:true checks seller setup errors using local API fixtures only;
// it never signs in a real user or sends a write to production.
import assert from "node:assert/strict";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const {
  origin: suppliedOrigin,
  bearer,
  locale: initialLocale = "fr",
  googleFixture = false,
  authOnly = false,
  studioFixture = false,
} = JSON.parse(input);
assert.ok(["fr", "en"].includes(initialLocale));
let browserWindow;
const origin = new URL(suppliedOrigin).origin;
assert.equal(new URL(origin).protocol, "https:");
const networkFetch = globalThis.fetch;
let fixtureOnboardingCalls = 0;
async function get(input, options = {}) {
  const url = new URL(typeof input === "string" ? input : input.url, origin);
  assert.equal(url.origin, origin, "QA requests must stay on the Site origin");
  if (studioFixture) {
    if (url.pathname === "/api/me") return Response.json({
      user: { id: "11111111-1111-4111-8111-111111111111", email: "qa@example.test" },
      profile: { display_name: "QA Seller", username: "qa-seller", bio: "", website: "" },
      seller: null, isAdmin: true,
    });
    if (url.pathname === "/api/studio") return Response.json({
      products: [], orders: [], seller: null,
      stats: { total_products: 0, published_products: 0, paid_orders: 0, net_revenue: 0, orders_count: 0 },
    });
    if (url.pathname === "/api/offers") return Response.json({ offers: [] });
    if (url.pathname === "/api/connect/onboard") {
      assert.equal(options.method, "POST");
      fixtureOnboardingCalls++;
      return Response.json({
        code: "stripe_connect_setup_required",
        error: "L’activation Stripe Connect du marketplace doit être terminée avant de configurer les vendeurs.",
      }, { status: 503 });
    }
  }
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
  if (googleFixture && url.pathname === "/api/config") {
    const config = await response.json();
    return Response.json({ ...config, accounts: true, google: true });
  }
  return response;
}
const initialUrl = origin + (studioFixture ? "/studio" : "/") + "?lang=" + initialLocale;
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
  studioFixture ? /My workspace|Mon espace/ : initialLocale === "en"
    ? /The AI agent marketplace for developers/
    : /Marketplace d’agents IA pour développeurs/,
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
    // Metadata such as JSON-LD is data, not an executable inline script.
    if (script.type && !["text/javascript", "application/javascript"].includes(script.type))
      continue;
    vm.runInContext(script.textContent, context);
  }
  const entry = w.document.querySelector("script#_R_")?.getAttribute("src");
  assert.ok(entry, "Missing client bootstrap");
  const module = await loadModule(new URL(entry, origin).href);
  await module.link(link);
  await module.evaluate();
  await until(
    () => w.__NEXT_HYDRATED && w.document.querySelector(authOnly || studioFixture ? ".app-shell" : ".save-button"),
    "hydration",
  );
  // Allow the effect that reads corrupt favorites to commit before testing clicks.
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(w.document.querySelector(".app-shell"));
  console.log("PASS client startup with invalid stored favorites");

  if (studioFixture) {
    await until(() => w.document.body.textContent.includes("QA Seller"), "local owner fixture");
    click(w.document.querySelector(".setup-step button"));
    await until(() => w.document.querySelector('a[href="https://dashboard.stripe.com/connect"]'), "Connect activation action");
    const action = w.document.querySelector('a[href="https://dashboard.stripe.com/connect"]');
    assert.equal(action.textContent.trim(), initialLocale === "en" ? "Activate Stripe Connect" : "Activer Stripe Connect");
    assert.equal(action.getAttribute("rel"), "noopener noreferrer");
    assert.equal(fixtureOnboardingCalls, 1);
    assert.deepEqual(errors, []);
    console.log(`PASS compiled studio Connect error and owner action (${initialLocale}; local fixture; no remote write)`);
    dom.window.close();
    process.exit(0);
  }

  if (!authOnly) {
    click(w.document.querySelector(".filter-button"));
    await until(() => w.document.querySelector(".extra-filters"), "filters");
    const favorite = w.document.querySelector(".save-button");
    click(favorite);
    await until(
      () => favorite.getAttribute("aria-pressed") === "true",
      "favorite click",
    );
    assert.equal(JSON.parse(w.localStorage.getItem("mp-favorites")).length, 1);
  }
  click(
    [...w.document.querySelectorAll("button")].find(
      (b) =>
        b.textContent.trim() ===
        (initialLocale === "en" ? "Sign in" : "Connexion"),
    ),
  );
  await until(() => w.document.querySelector('[role="dialog"]'), "login modal");
  const google = () => w.document.querySelector('a[href="/api/auth/google"]');
  const config = await (await get("/api/config")).json();
  if (config.accounts && config.google) {
    await until(google, "Google sign-in button");
    assert.equal(google().textContent.trim(), initialLocale === "en" ? "Continue with Google" : "Continuer avec Google");
    click(w.document.querySelector(".auth-link"));
    await until(() => !w.document.querySelector('input[name="password"]'), "password recovery mode");
    assert.equal(google(), null, "Google is absent from password recovery");
    click(w.document.querySelector(".auth-switch button"));
    await until(() => w.document.querySelector('input[name="display_name"]'), "signup mode");
    assert.ok(google(), "Google also appears on signup");
    console.log(`PASS Google login/signup and recovery exclusion${googleFixture ? " (local config fixture)" : ""}`);
  } else {
    assert.equal(google(), null, "Google stays hidden until configured");
    console.log("PASS unconfigured Google is hidden");
  }
  w.document.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await until(
    () => !w.document.querySelector('[role="dialog"]'),
    "modal close",
  );
  console.log("PASS login dialog and keyboard dismissal");
  if (authOnly) {
    assert.deepEqual(errors, []);
    console.log(`PASS compiled-client authentication checks; initial SSR locale ${initialLocale}`);
    dom.window.close();
    process.exit(0);
  }

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
