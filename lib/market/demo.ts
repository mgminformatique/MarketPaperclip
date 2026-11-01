import type { Product } from "./model";
const common = {
  currency: "cad",
  version: "1.0.0",
  license: "Commerciale — usage individuel",
  status: "published",
  created_at: "2026-11-01T00:00:00Z",
  demo: true,
  requirements:
    "Paperclip, Node.js 22 ou supérieur et une clé API du fournisseur de modèle. Les frais d’utilisation du modèle sont à votre charge.",
  setup:
    "1. Décompressez le package.\n2. Lisez README.md et les permissions demandées.\n3. Configurez vos clés API dans votre environnement.\n4. Importez la configuration dans votre instance Paperclip et vérifiez chaque permission avant l’exécution.",
  description:
    "Un exemple de produit pour découvrir le futur catalogue MarketPaperclip. Cette fiche illustre les informations qu’un créateur pourra publier : fonctionnement, prérequis, fichiers livrés et licence. Aucun achat ni téléchargement commercial n’est disponible pour ce produit de démonstration.",
};
export const demoProducts: Product[] = [
  {
    ...common,
    id: "demo-1",
    seller_id: "demo-mgm",
    slug: "code-pilot",
    title: "Code Pilot",
    tagline:
      "Du premier commit à la pull request. Votre nouveau binôme de code.",
    category: "Développement",
    kind: "agent",
    engine: "Claude",
    price_cents: 4900,
    tags: ["TypeScript", "GitHub", "Code review"],
    agent_count: 1,
    art: "code",
    profiles: {
      display_name: "MGM Labs",
      username: "mgm-labs",
      bio: "Des systèmes utiles. Du code soigné. Des agents conçus pour le travail réel.",
    },
  },
  {
    ...common,
    id: "demo-2",
    seller_id: "demo-orbit",
    slug: "deep-research",
    title: "Deep Research",
    tagline:
      "Transformez vos questions complexes en recherches structurées et sourcées.",
    category: "Recherche & data",
    kind: "agent",
    engine: "Multi-modèles",
    price_cents: 3900,
    tags: ["Recherche", "Analyse", "Sources"],
    agent_count: 1,
    art: "research",
    profiles: { display_name: "Orbit Studio", username: "orbit-studio" },
  },
  {
    ...common,
    id: "demo-3",
    seller_id: "demo-mgm",
    slug: "startup-crew",
    title: "Startup Crew",
    tagline:
      "Une équipe complète. Cinq agents pour lancer votre prochaine idée.",
    category: "Opérations",
    kind: "bundle",
    engine: "Multi-modèles",
    price_cents: null,
    tags: ["5 agents", "Orchestration", "Paperclip"],
    agent_count: 5,
    art: "bundle",
    profiles: { display_name: "MGM Labs", username: "mgm-labs" },
  },
  {
    ...common,
    id: "demo-4",
    seller_id: "demo-studio",
    slug: "growth-engine",
    title: "Growth Engine",
    tagline:
      "Recherche, contenu et campagnes. Donnez de l’élan à votre marketing.",
    category: "Marketing",
    kind: "agent",
    engine: "GPT",
    price_cents: 5900,
    tags: ["SEO", "Contenu", "Stratégie"],
    agent_count: 1,
    art: "growth",
    profiles: { display_name: "Build & Beyond", username: "build-beyond" },
  },
];
