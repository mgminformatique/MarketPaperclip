# MarketPaperclip

Marketplace indépendant d’agents et de bundles d’agents, conçu pour MGM Informatique : un **marché entre utilisateurs** (prix fixés par les vendeurs, offres, activité et statistiques en direct) réglé par Stripe Connect. Interface responsive française et anglaise, backend Supabase, hébergement Netlify. L’affichage des prix se règle avec `SHOW_PRICES`.

## État livré

Le site est en production sur **https://marketpaperclip.com**, avec Supabase, la connexion Google et l'agent **Paperclip Test** publié à 1 $ CA. La vente réelle reste à valider : Stripe a confirmé que l'activation de Connect sur la plateforme doit être terminée par le titulaire. Voir [le diagnostic et les actions restantes](docs/HANDOFF-CLAUDE.md). Sans configuration locale, le site présente quatre fiches explicitement marquées comme démonstration.

### Fonctionnalités

- Catalogue avec recherche, catégories, modèles, tri, pagination, agents et bundles.
- **Le marché** (`/market`) : volume, ventes, prix plancher, tendances, top créateurs, activité en direct, nouvelles annonces; bandeau en direct sur l’accueil. Voir [docs/MARKET.md](docs/MARKET.md).
- **Offres** entre acheteurs et vendeurs (accepter/refuser, 72 h pour payer le montant convenu), gestion des annonces (prix et pause sans nouvelle validation), statistiques de fiche et de créateur.
- Fiches détaillées : prérequis, installation, version, licence, avis d’acheteurs confirmés.
- Profils publics avec publications et médias, favoris, studio créateur, brouillons, dépôt ZIP/JSON privé (20 Mo).
- Inscription, confirmation du courriel, connexion, récupération et changement du mot de passe via Supabase Auth. Connexion Google et OAuth GitHub optionnel.
- Onboarding vendeur Stripe Connect, Checkout, commission serveur configurable et tableau des ventes.
- Commandes privées, fichier et version figés lors de l’achat, liens de téléchargement de 60 secondes.
- Modération administrative, demandes d’assistance et remboursements avec inversion du transfert et de la commission.
- Réconciliation des paiements, remboursements et litiges par webhook signé, avec journal transactionnel et déduplication.

## Reprendre le projet sur un autre poste

La branche de référence est **`main`**. Elle regroupe les trois branches de travail du marché, des profils et de la recette internationale. Son état, les contrôles et le point restant pour Stripe sont consignés dans [docs/HANDOFF-CLAUDE.md](docs/HANDOFF-CLAUDE.md).

Avec Git, Node.js 24 et npm :

```bash
git clone --branch main https://github.com/mgminformatique/MarketPaperclip.git
cd MarketPaperclip
npm ci
npm run check
```

Si le dépôt est déjà cloné :

```bash
git fetch origin
git switch main
git pull --ff-only
```

Les variables de production restent configurées dans Netlify et Supabase. Pour travailler localement avec ces services, renseignez `.dev.vars` à partir de `.env.example` avec les accès du poste. Sans configuration, le site présente les fiches de démonstration.

L'archive publiée de l'agent de test est versionnée dans [packages/releases/paperclip-test-1.0.0.zip](packages/releases/paperclip-test-1.0.0.zip), avec son empreinte SHA-256 et ses sources dans `packages/paperclip-test/`.

## Installation

Node.js 22.13+ (tests exécutés sous Node.js 24), npm et un projet Supabase dédié.

```bash
npm ci
npm run check
npm run build
```

Pour le développement local, copiez `.env.example` dans `.dev.vars`, renseignez les valeurs puis lancez `npm run dev`. Les secrets ne doivent jamais être préfixés `NEXT_PUBLIC_` ni ajoutés à `.openai/hosting.json`.

Le projet utilise React 19, TypeScript et Vinext/Vite. Le build Worker s’exécute sur Netlify (fonction Node) ou sur Cloudflare Workers. Le SDK Supabase reste côté serveur; les sessions sont transmises par cookies HttpOnly. Les polices Manrope et DM Sans sont auto-hébergées via Fontsource.

## Mise en service

Le projet Supabase désigné est `ltommtumsvvqxdknpkfd`. Le déploiement des huit migrations et de la configuration Auth est préparé dans le workflow manuel **Deploy Supabase**, limité à `main`. Suivre [docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md) pour ajouter les accès sécurisés, exécuter le workflow et relier les variables serveur du site. Ce workflow ne déploie pas automatiquement le site ni ses secrets.

Lisez [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), puis [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). Les scripts SQL à appliquer dans l’ordre sont dans `supabase/migrations/`.

La mise en ligne Netlify + GoDaddy + Stripe est décrite pas à pas dans [docs/NETLIFY.md](docs/NETLIFY.md). Le référencement (métadonnées, données structurées, sitemap, Search Console, IndexNow) est décrit dans [docs/SEO.md](docs/SEO.md). Le domaine cible est **marketpaperclip.com**. L’instance de présentation hébergée est distincte de la configuration DNS finale. Les comptes, les paiements et le domaine ne sont pas réputés activés tant que les contrôles externes du guide n’ont pas été réalisés.

## Architecture

```text
app/                     Pages et point d’entrée API (market.css : styles du marché)
components/              Catalogue, studio, acquisitions, documentation, marché (market-floor, market-desk)
lib/market/              Contrats, validation, Supabase, Stripe et orchestration API
supabase/migrations/     Tables, RLS, permissions et procédures transactionnelles (001–008)
worker/                  Adaptateur Cloudflare et en-têtes de sécurité
public/art/              Illustrations originales optimisées en WebP
scripts/preflight.mjs    Contrôle des noms de variables requis, sans révéler les valeurs
tests/                   Tests HTTP, Stripe et PostgreSQL embarqué PGlite
docs/                    Déploiement, exploitation, validation et provenance des visuels
```

## Commandes utiles

| Commande            | Effet                                                         |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Développement avec le runtime Cloudflare local                |
| `npm run typecheck` | Vérification TypeScript                                       |
| `npm test`          | Tests d’API et tests SQL/RLS                                  |
| `npm run check`     | TypeScript puis tests                                         |
| `npm run build`     | Build de production Worker + assets                           |
| `npm run build:netlify` | Build + fonction Netlify (`.netlify/v1/functions`)        |
| `npm run preflight` | Vérification de la configuration fournie dans l’environnement |

Le workflow **CI** exécute `npm ci`, `npm run check` et `npm run build:netlify` sur chaque push et pull request vers `main`, sous Node.js 24. Les tests de configuration Supabase font partie de la suite normale. Ce contrôle n'applique aucune migration et n'utilise aucun secret de production.

Le fichier `.openai/hosting.json` identifie l’instance Sites existante. Préservez son identifiant pour mettre à jour cette instance; ne créez pas une nouvelle instance par erreur.

## Limites explicitement conservées

- Aucun agent n’est exécuté par le marketplace. Le package est téléchargé et installé dans l’environnement de l’acheteur.
- Paiement unique par produit, sans panier multi-vendeurs, abonnement ni séquestre. Les destination charges transfèrent les fonds selon le fonctionnement de Stripe Connect.
- La modération des fichiers est humaine. Il n’y a pas de scanner antivirus automatique ni de promesse de certification des agents.
- Une commande conserve sa version d’achat; les mises à jour futures ne sont pas automatiquement concédées.
- Conditions d’utilisation et de vente (commission de 15 %, livraison, remboursements) et politique de confidentialité (Loi 25) de lancement rédigées le 3 novembre 2026 ; l’adresse civique de l’exploitant reste à ajouter avant la vente aux consommateurs, et une relecture juridique est recommandée. Les options « licence commerciale » nécessitent un véritable fichier LICENSE fourni par le vendeur. Paiements : voir [docs/STRIPE.md](docs/STRIPE.md).
- La vérification visuelle desktop/mobile dans le navigateur n’a pas pu être exécutée dans cet environnement. Les tests ne remplacent pas la recette des services Supabase et Stripe réels.
