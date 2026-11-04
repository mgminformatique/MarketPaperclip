import { test } from "node:test";
import assert from "node:assert/strict";
import { requestLocale, localeChoice, localizedHref, crawlableHref } from "../lib/i18n/locale";
import { translate } from "../lib/i18n/translate";
import { money, productInput, categories } from "../lib/market/model";
import { demoProducts } from "../lib/market/demo";
import { compactMoney } from "../lib/market/market";

const make = (query: string, cookie = "", referer = "") =>
  new Request("https://marketpaperclip.test/agents" + query, {
    headers: referer ? { cookie, referer } : { cookie },
  });
test("English by default; language URLs take precedence over saved preference; unknown values fall back safely", () => {
  assert.equal(requestLocale(make("")), "en");
  assert.equal(requestLocale(make("", "mp-language=fr")), "fr");
  assert.equal(requestLocale(make("?lang=fr", "mp-language=en")), "fr");
  assert.equal(requestLocale(make("?lang=en", "mp-language=fr")), "en");
  assert.equal(requestLocale(make("?lang=invalid", "mp-language=fr")), "fr");
  assert.equal(requestLocale(make("", "other-mp-language=fr")), "en");
  assert.equal(requestLocale(make("", "mp-language=fresh")), "en");
});
test("French is the default only for visitors coming from mgminformatique.ca, and is remembered", () => {
  for (const referer of [
    "https://mgminformatique.ca/",
    "https://www.mgminformatique.ca/services",
    "https://MGMINFORMATIQUE.CA",
  ])
    assert.deepEqual(localeChoice(make("", "", referer)), { locale: "fr", remember: true }, referer);
  for (const referer of [
    "https://mgminformatique.ca.example.com/",
    "https://notmgminformatique.ca/",
    "https://example.com/?from=mgminformatique.ca",
    "https://www.google.com/",
    "android-app://mgminformatique.ca/",
    "not a url",
  ])
    assert.deepEqual(localeChoice(make("", "", referer)), { locale: "en", remember: false }, referer);
  // An explicit or saved choice wins over the referring site.
  assert.equal(requestLocale(make("?lang=en", "", "https://mgminformatique.ca/")), "en");
  assert.equal(requestLocale(make("", "mp-language=en", "https://mgminformatique.ca/")), "en");
  // Only explicit choices and the mgminformatique.ca default are saved.
  assert.deepEqual(localeChoice(make("?lang=en")), { locale: "en", remember: true });
  assert.deepEqual(localeChoice(make("", "mp-language=fr")), { locale: "fr", remember: false });
  assert.deepEqual(localeChoice(make("")), { locale: "en", remember: false });
});
test("localized links preserve searches and anchors without changing external destinations", () => {
  assert.equal(
    localizedHref("/agents?q=code#catalogue", "en"),
    "/agents?q=code&lang=en#catalogue",
  );
  assert.equal(
    localizedHref("/studio/new?lang=en", "fr"),
    "/studio/new?lang=fr",
  );
  assert.equal(
    localizedHref("https://example.com", "en"),
    "https://example.com",
  );
  assert.equal(localizedHref("//example.com", "en"), "//example.com");
  assert.equal(localizedHref("#catalogue", "en"), "#catalogue");
});
test("crawlable English links point at the canonical URL, French keeps its parameter", () => {
  assert.equal(crawlableHref("/agents?q=code#catalogue", "en"), "/agents?q=code#catalogue");
  assert.equal(crawlableHref("/studio/new?lang=fr", "en"), "/studio/new");
  assert.equal(crawlableHref("/", "en"), "/");
  assert.equal(crawlableHref("/agents", "fr"), "/agents?lang=fr");
  assert.equal(crawlableHref("/agents?q=code#catalogue", "fr"), "/agents?q=code&lang=fr#catalogue");
  assert.equal(crawlableHref("https://example.com", "en"), "https://example.com");
});
test("messages translate in both languages with whitespace and interpolated product names preserved", () => {
  assert.equal(translate("Connexion", "en"), "Sign in");
  assert.equal(translate("Connexion", "fr"), "Connexion");
  assert.equal(translate("Continuer avec Google", "en"), "Continue with Google");
  assert.equal(translate(" Créer mon compte ", "en"), " Create my account ");
  assert.equal(
    translate("Ajouter aux favoris : My custom agent", "en"),
    "Add to favorites: My custom agent",
  );
  assert.equal(translate("Avis (12)", "en"), "Reviews (12)");
  assert.equal(
    translate("5 agents dans ce bundle", "en"),
    "5 agents in this bundle",
  );
  assert.equal(
    translate("1 produit dans votre studio", "en"),
    "1 product in your studio",
  );
  assert.equal(
    translate("2 produits dans votre studio", "en"),
    "2 products in your studio",
  );
  assert.equal(
    translate("Original custom text not in the dictionary", "en"),
    "Original custom text not in the dictionary",
  );
  assert.equal(translate(null, "en"), null);
});
test("localized currency keeps Canadian dollars and canonical product enums stay valid", () => {
  assert.match(money(4999, "en"), /^CAD\s49\.99$/);
  assert.match(money(4999, "fr"), /49,99/);
  for (const locale of ["en", "fr"] as const) {
    assert.match(money(100, locale), /CAD/);
    assert.match(compactMoney(1234500, locale), /CAD/);
  }
  assert.equal(categories[0], "Développement");
  assert.equal(translate(categories[0], "en"), "Development");
  const p = demoProducts[0];
  assert.ok(
    productInput.safeParse({
      title: p.title,
      tagline: p.tagline,
      description: p.description,
      category: p.category,
      kind: p.kind,
      engine: p.engine,
      version: p.version,
      price_cents: p.price_cents,
      currency: p.currency,
      license: p.license,
      tags: p.tags,
      requirements: p.requirements,
      setup: p.setup,
      agent_count: p.agent_count,
      status: "draft",
    }).success,
  );
});
