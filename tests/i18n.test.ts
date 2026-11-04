import { test } from "node:test";
import assert from "node:assert/strict";
import { requestLocale, localizedHref, crawlableHref } from "../lib/i18n/locale";
import { translate } from "../lib/i18n/translate";
import { money, productInput, categories } from "../lib/market/model";
import { demoProducts } from "../lib/market/demo";

test("language URLs take precedence over saved preference; unknown values fall back safely", () => {
  const make = (query: string, cookie = "") =>
    new Request("https://marketpaperclip.test/agents" + query, {
      headers: { cookie },
    });
  assert.equal(requestLocale(make("")), "fr");
  assert.equal(requestLocale(make("", "mp-language=en")), "en");
  assert.equal(requestLocale(make("?lang=fr", "mp-language=en")), "fr");
  assert.equal(requestLocale(make("?lang=en", "mp-language=fr")), "en");
  assert.equal(requestLocale(make("?lang=invalid", "mp-language=en")), "en");
  assert.equal(requestLocale(make("", "other-mp-language=en")), "fr");
  assert.equal(requestLocale(make("", "mp-language=english")), "fr");
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
test("crawlable French links point at the canonical URL, English keeps its parameter", () => {
  assert.equal(crawlableHref("/agents?q=code#catalogue", "fr"), "/agents?q=code#catalogue");
  assert.equal(crawlableHref("/studio/new?lang=en", "fr"), "/studio/new");
  assert.equal(crawlableHref("/", "fr"), "/");
  assert.equal(crawlableHref("/agents", "en"), "/agents?lang=en");
  assert.equal(crawlableHref("https://example.com", "fr"), "https://example.com");
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
  assert.equal(money(4999, "en"), "$49.99");
  assert.match(money(4999, "fr"), /49,99/);
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
