// Home page questions. The same text feeds the visible section and the
// FAQPage structured data, so search results always match the page.
import type { Locale } from "./i18n/locale";

export type Faq = { q: string; a: string };

export const faq: Record<Locale, Faq[]> = {
  fr: [
    {
      q: "Qu’est-ce qu’un agent IA sur MarketPaperclip ?",
      a: "Un agent est un package prêt à installer : instructions, configuration, code et documentation pour accomplir une mission précise, comme la revue de code, la recherche, le marketing ou le support client. Il s’exécute dans votre propre environnement Paperclip, avec vos propres clés de modèle.",
    },
    {
      q: "Quels modèles d’IA sont compatibles ?",
      a: "Chaque fiche indique son modèle principal : Claude, GPT, Gemini, Ollama ou multi-modèles. Les frais d’utilisation du modèle restent à votre charge, séparément du prix du package.",
    },
    {
      q: "Qu’est-ce qu’un bundle d’agents ?",
      a: "Un bundle réunit plusieurs agents qui travaillent ensemble, par exemple un planificateur, un rédacteur et un vérificateur, livrés et versionnés dans un seul package.",
    },
    {
      q: "Comment vendre mes agents IA ?",
      a: "Créez votre compte, préparez un package ZIP ou JSON documenté, fixez votre prix dans le studio et soumettez-le. Chaque publication est vérifiée par une personne avant sa mise en ligne, puis vous encaissez vos ventes avec Stripe Connect.",
    },
    {
      q: "Puis-je négocier le prix d’un agent ?",
      a: "Oui. Faites une offre d’au moins 20 % du prix demandé. Si le créateur l’accepte, vous avez 72 heures pour payer ce montant. Rien n’est prélevé avant votre paiement.",
    },
    {
      q: "Comment se passent le paiement et le téléchargement ?",
      a: "Le paiement se fait sur la page sécurisée de Stripe, en dollars canadiens. Une fois le paiement confirmé, la version achetée apparaît dans vos acquisitions avec un lien de téléchargement privé.",
    },
  ],
  en: [
    {
      q: "What is an AI agent on MarketPaperclip?",
      a: "An agent is a ready-to-install package: instructions, configuration, code and documentation to carry out a specific mission, such as code review, research, marketing or customer support. It runs in your own Paperclip environment, with your own model keys.",
    },
    {
      q: "Which AI models are supported?",
      a: "Each listing states its main model: Claude, GPT, Gemini, Ollama or multi-model. Model usage costs are yours, separate from the package price.",
    },
    {
      q: "What is an agent bundle?",
      a: "A bundle brings together several agents that work as a team, for example a planner, a writer and a reviewer, delivered and versioned as one package.",
    },
    {
      q: "How do I sell my AI agents?",
      a: "Create your account, prepare a documented ZIP or JSON package, set your price in the studio and submit it. Every listing is reviewed by a person before it goes live, then you get paid for your sales through Stripe Connect.",
    },
    {
      q: "Can I negotiate the price of an agent?",
      a: "Yes. Make an offer of at least 20% of the asking price. If the creator accepts it, you have 72 hours to pay that amount. Nothing is charged before you pay.",
    },
    {
      q: "How do payment and download work?",
      a: "Payment happens on Stripe’s secure page, in Canadian dollars. Once the payment is confirmed, the version you bought appears in your library with a private download link.",
    },
  ],
};

export function faqLd(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale === "en" ? "en-CA" : "fr-CA",
    mainEntity: faq[locale].map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
