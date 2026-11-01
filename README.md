# MarketPaperclip

Marketplace indépendant d’agents et de bundles d’agents, conçu pour MGM Informatique. Interface française responsive, prix en CAD, backend Supabase et paiements Stripe Connect.

## État livré

Le code de l’interface et du backend est implémenté. Sans configuration, le site fonctionne en avant-première avec quatre fiches explicitement marquées comme démonstration. Aucun faux compte, achat ou versement n’est créé. Les secrets Supabase, Stripe et les accès DNS n’étaient pas fournis pendant le développement : aucune transaction externe réelle n’a été validée.

### Fonctionnalités

- Catalogue avec recherche, catégories, modèles, tri, pagination, agents et bundles.
- Fiches détaillées : prérequis, installation, version, licence, avis d’acheteurs confirmés.
- Profils publics, favoris, studio créateur, brouillons, dépôt ZIP/JSON privé (20 Mo).
- Inscription, confirmation du courriel, connexion, récupération et changement du mot de passe via Supabase Auth. OAuth GitHub optionnel.
- Onboarding vendeur Stripe Connect, Checkout, commission serveur configurable et tableau des ventes.
- Commandes privées, fichier et version figés lors de l’achat, liens de téléchargement de 60 secondes.
- Modération administrative, demandes d’assistance et remboursements avec inversion du transfert et de la commission.
- Réconciliation des paiements, remboursements et litiges par webhook signé, avec journal transactionnel et déduplication.

## Installation

Node.js 22.13+ (tests exécutés sous Node.js 24), npm et un projet Supabase dédié.

```bash
npm ci
npm run check
npm run build
```

Pour le développement local, copiez `.env.example` dans `.dev.vars`, renseignez les valeurs puis lancez `npm run dev`. Les secrets ne doivent jamais être préfixés `NEXT_PUBLIC_` ni ajoutés à `.openai/hosting.json`.

Le projet utilise React 19, TypeScript, Vinext/Vite et Cloudflare Workers. Le SDK Supabase reste côté serveur; les sessions sont transmises par cookies HttpOnly. Les polices Manrope et DM Sans sont auto-hébergées via Fontsource.

## Mise en service

Lisez [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), puis [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md). Les scripts SQL à appliquer dans l’ordre sont dans `supabase/migrations/`.

Le domaine cible est **marketpaperclip.com**. L’instance de présentation hébergée est distincte de la configuration DNS finale. Les comptes, les paiements et le domaine ne sont pas réputés activés tant que les contrôles externes du guide n’ont pas été réalisés.

## Architecture

```text
app/                     Pages et point d’entrée API
components/              Catalogue, studio, acquisitions, documentation
lib/market/              Contrats, validation, Supabase, Stripe et orchestration API
supabase/migrations/     Tables, RLS, permissions et procédures transactionnelles
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
| `npm run preflight` | Vérification de la configuration fournie dans l’environnement |

Le fichier `.openai/hosting.json` identifie l’instance Sites existante. Préservez son identifiant pour mettre à jour cette instance; ne créez pas une nouvelle instance par erreur.

## Limites explicitement conservées

- Aucun agent n’est exécuté par le marketplace. Le package est téléchargé et installé dans l’environnement de l’acheteur.
- Paiement unique par produit, sans panier multi-vendeurs, abonnement ni séquestre. Les destination charges transfèrent les fonds selon le fonctionnement de Stripe Connect.
- La modération des fichiers est humaine. Il n’y a pas de scanner antivirus automatique ni de promesse de certification des agents.
- Une commande conserve sa version d’achat; les mises à jour futures ne sont pas automatiquement concédées.
- Les textes commerciaux sont des brouillons opérationnels à compléter avant lancement. Les options « licence commerciale » nécessitent un véritable fichier LICENSE fourni par le vendeur.
- La vérification visuelle desktop/mobile dans le navigateur n’a pas pu être exécutée dans cet environnement. Les tests ne remplacent pas la recette des services Supabase et Stripe réels.
