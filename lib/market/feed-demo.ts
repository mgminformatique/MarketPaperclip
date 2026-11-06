// Temporary, browser-local scenario. It has no database or payment client.
// Set this to false and redeploy to remove the demo entry and query mode.
import type { MarketEvent } from "./market";
import { matchesFeedFilter, type FeedFilter, type FeedPage } from "./feed";

export const FEED_DEMO_ENABLED = true;
export const FEED_DEMO_POLL_MS = 4000;
export const FEED_DEMO_ID_BASE = 800_000_000;
const models = [
  {
    title: "NEXUS PRIME — Démo",
    slug: "demo-nexus-prime",
    kind: "bundle" as const,
    engine: "Multi-modèles",
    cover_url: "/art/nexus-prime-demo.webp",
    price: 24900,
    tagline: "Une idée. Douze agents. Un univers à construire.",
    description:
      "Imaginez un atelier numérique où douze agents spécialisés travaillent ensemble : un architecte dessine le plan, des développeurs construisent, un chercheur vérifie les sources et un directeur créatif affine le résultat. NEXUS PRIME réunit cette équipe fictive dans un seul modèle, du premier brief à la présentation finale. Vous gardez la main sur chaque décision.",
    tags: [
      "12 agents spécialisés",
      "Mémoire partagée",
      "Validation humaine",
      "FR / EN",
    ],
    agent_count: 12,
    version: "3.0.0",
    license: "Commerciale — équipe",
    requirements:
      "Concept de démonstration : clés API personnelles et environnement Node.js 22 envisagés. Aucun logiciel fonctionnel n’est fourni.",
    setup:
      "Scénario fictif : connecter ses outils, choisir les rôles, rédiger un brief, puis approuver le plan avant toute action.",
  },
  {
    title: "ORBIT RESEARCH — Démo",
    slug: "demo-orbit-research",
    kind: "agent" as const,
    engine: "Claude",
    cover_url: "/art/research.webp",
    price: 8900,
    tagline: "De la première question à la grande découverte.",
    description:
      "Un observatoire de recherche imaginé pour explorer un sujet, confronter les sources et faire émerger les bonnes questions. ORBIT assemble une carte des idées, un journal de recherche et une synthèse lisible. Ce modèle fictif illustre une fiche complète dans le Feed.",
    tags: ["Carte des idées", "Sources commentées", "Synthèses", "FR / EN"],
    agent_count: 1,
    version: "2.1.0",
    license: "MIT",
    requirements:
      "Exemple fictif : accès à un modèle de langage et connexion Internet envisagés.",
    setup:
      "Scénario de test : saisir une question, choisir les axes de recherche, examiner la synthèse.",
  },
  {
    title: "FORGE STUDIO — Démo",
    slug: "demo-forge-studio",
    kind: "bundle" as const,
    engine: "Multi-modèles",
    cover_url: "/art/code.webp",
    price: 17900,
    tagline: "Votre prochain produit commence ici.",
    description:
      "Une équipe de création logicielle fictive qui transforme un brief en parcours utilisateur, composants et plan de livraison. Six rôles se passent le relais : produit, design, développement, tests, documentation et revue. Un concept pour visualiser les possibilités du marché, sans achat réel.",
    tags: [
      "6 rôles créatifs",
      "Design & code",
      "Revue de qualité",
      "Documentation",
    ],
    agent_count: 6,
    version: "1.4.0",
    license: "Apache-2.0",
    requirements:
      "Exemple fictif : Git, Node.js et clés API personnelles envisagés.",
    setup:
      "Scénario de test : décrire un projet, choisir la stack, valider le plan de construction.",
  },
];
type DemoQuery = {
  filter: FeedFilter;
  before?: number;
  after?: number;
  limit?: number;
};

export function createFeedDemo(now = Date.now()) {
  const records: MarketEvent[] = [];
  let automaticRemaining = 8;
  function make(
    index: number,
    kind: MarketEvent["kind"],
    at: number,
  ): MarketEvent {
    const { price, ...product } = models[(index - 1) % models.length];
    return {
      id: FEED_DEMO_ID_BASE + index,
      kind,
      amount_cents: kind === "offer" ? price - 1000 : price,
      previous_cents: kind === "price_changed" ? price + 1000 : null,
      created_at: new Date(at).toISOString(),
      product: { ...product, price_cents: price, tags: [...product.tags] },
      seller: {
        username: "demo-studio-" + (((index - 1) % 4) + 1),
        display_name: "Studio démo " + (((index - 1) % 4) + 1),
      },
    };
  }
  const kinds: MarketEvent["kind"][] = [
    "listed",
    "sold",
    "sold",
    "offer",
    "price_changed",
    "relisted",
  ];
  for (let index = 1; index <= 16; index++)
    records.push(
      make(
        index,
        index === 16 ? "listed" : kinds[(index - 1) % kinds.length],
        now - (16 - index) * 75000,
      ),
    );
  function addSale(at = Date.now()) {
    if (records.length >= 64) return false;
    records.push(make(records.length + 1, "sold", at));
    return true;
  }
  return {
    get full() {
      return records.length >= 64;
    },
    addSale,
    advance(at = Date.now()) {
      if (!automaticRemaining) return false;
      automaticRemaining--;
      return addSale(at);
    },
    page({ filter, before, after, limit = 6 }: DemoQuery): FeedPage {
      const size = Math.max(1, Math.min(6, limit));
      const rows = records
        .filter(
          (event) =>
            matchesFeedFilter(event, filter) &&
            (!before || event.id < before) &&
            (!after || event.id > after),
        )
        .sort((a, b) => (after ? a.id - b.id : b.id - a.id));
      const events = rows.slice(0, size).map((event) => ({
        ...event,
        product: { ...event.product, tags: [...(event.product.tags ?? [])] },
        seller: { ...event.seller },
      }));
      return {
        events,
        more: rows.length > size,
        oldest: events.length
          ? Math.min(...events.map((event) => event.id))
          : null,
        newest: events.length
          ? Math.max(...events.map((event) => event.id))
          : null,
        demo: true,
      };
    },
  };
}
export type FeedDemo = ReturnType<typeof createFeedDemo>;
