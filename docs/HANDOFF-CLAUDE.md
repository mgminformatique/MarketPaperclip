# MarketPaperclip — Handoff pour Claude

État du projet au **1er novembre 2026 (America/Toronto)**. Ce document transmet les résultats observés et les limites connues; revérifier l’état distant avant toute nouvelle modification.

## Mission immédiate

Reprendre le projet existant et terminer sa configuration, sans reconstruire le site. **Supabase est déjà installé et relié au site déployé.** Le principal blocage restant concerne les courriels Auth : un lien de récupération généré par Supabase redirige encore vers `http://localhost:3000`.

Le propriétaire souhaite un marketplace d’agents et de bundles pour développeurs, avec comptes Supabase, profils de créateurs, studio de publication, acquisitions et transactions entre utilisateurs à terme. Identité visuelle MGM / Paperclip, sombre avec accents lime et visuels 3D. Le site doit rester bilingue français/anglais.

Décisions explicites à conserver :
- **Masquer tous les prix pour le moment**, agents comme bundles.
- À terme, **le vendeur choisira son prix**; ne pas inventer des prix de démonstration.
- Garder les paiements désactivés tant que le modèle commercial et Stripe ne sont pas finalisés.
- Conserver le travail existant et corriger les parcours réellement défaillants.
- Travailler de manière autonome dans le périmètre demandé. Ne pas redemander les clés déjà fournies ni répéter les mêmes confirmations.
- Ne jamais demander de coller un fichier `.env` ou des secrets dans le chat. Utiliser les accès disponibles dans l’environnement de travail.

## Sources et versions

| Élément | Référence |
| --- | --- |
| Dépôt GitHub, source à reprendre | https://github.com/mgminformatique/MarketPaperclip |
| Branche | `main` |
| Dernier commit applicatif GitHub avant ce handoff | `57d7c6ca2ea865496088ecc8f444fff328fb0202` |
| Site actuellement déployé | https://marketpaperclip.murphylexus.chatgpt.site |
| Domaine final souhaité | https://marketpaperclip.com |
| Projet Supabase | `ltommtumsvvqxdknpkfd` |
| Dashboard Supabase | https://supabase.com/dashboard/project/ltommtumsvvqxdknpkfd |
| URL API Supabase | https://ltommtumsvvqxdknpkfd.supabase.co |
| Identifiant du projet Sites | `appgprj_6ae6efb5009081918ef6d30eecc9661f` |
| Commit source Sites déployé | `2965136c7e70a1d699c9fb4e3647863d268dde09` |
| Dernier déploiement Sites réussi | `appgdep_6ae7e651392481918a914c3f1ab69c19` |
| Révision des variables de production | `1` |

L’hébergement est **privé, réservé au propriétaire via ChatGPT**. Une porte de connexion ChatGPT n’est donc pas une panne Supabase. Aucun changement d’audience publique n’a été effectué. Le domaine final n’a pas été confirmé opérationnel; son dernier état connu attendait la validation DNS/TLS.

Le dépôt GitHub contient les ajouts de déploiement Supabase que le checkout Sites ne contient pas tous. Les SHA diffèrent donc normalement. Les changements applicatifs modernes de clés et de jointures sont présents dans les deux sources. Ne pas écraser GitHub avec une ancienne archive ni remplacer une source complète par un dossier partiel.

## Stack et organisation

React 19, TypeScript, routes compatibles Next, **Vinext / Vite**, Worker Cloudflare, Supabase Auth/Postgres/Storage, SDK Stripe. Ce n’est pas simplement un déploiement Next/Vercel standard : inspecter les scripts et la configuration avant de changer d’hébergement.

Node requis : `>=22.13.0`. Respecter le lockfile présent.

Fichiers utiles :
- `lib/market/api.ts` : routes métier, Auth, catalogue, profils, studio, administration.
- `lib/market/server.ts` : clients Supabase et configuration serveur.
- `lib/market/config.ts` : capacités publiques exposées au client.
- `lib/market/presentation.ts` : `SHOW_PRODUCT_PRICES = false`.
- `supabase/migrations/001_marketplace.sql` à `006_product_covers.sql`.
- `supabase/templates/confirmation.html` et `recovery.html`.
- `docs/SUPABASE-DASHBOARD.md` : réglages manuels exacts.
- `docs/SUPABASE-SETUP.md` : autre parcours via GitHub Actions.
- `docs/DEPLOYMENT.md`, `ACCEPTANCE.md`, `OPERATIONS.md`, `RELEASE.md`.
- `.github/workflows/supabase-deploy.yml`.
- `scripts/configure-supabase-auth.mjs` et `scripts/build-supabase-installer.mjs`.

Commandes disponibles :

```sh
npm run install:ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preflight
```

`npm run check` regroupe typecheck et tests. `npm run preflight` contrôle les prérequis de lancement; les paiements volontairement désactivés et les configurations incomplètes doivent être interprétés comme tels. Ne pas affaiblir ses contrôles pour afficher un succès artificiel.

## Ce qui est réellement opérationnel

Le runtime publié répondait à `/api/config` :

```json
{"accounts":true,"payments":false,"demo":false,"github":false,"feeBps":null}
```

La base distante expose les **12 tables** suivantes :
`profiles`, `market_admins`, `seller_accounts`, `products`, `product_files`, `orders`, `favorites`, `reviews`, `support_requests`, `stripe_events`, `audit_log`, `rate_limits`.

Fonctions RPC observées :
`market_attach_file`, `market_moderate_product`, `market_apply_payment`, `market_save_product`, `market_rate_limit`, `market_seller_stats`.

Les six migrations ont été appliquées avec l’installateur initial transactionnel :
1. `001_marketplace.sql`
2. `002_atomic_publication.sql`
3. `003_payment_reconciliation.sql`
4. `004_public_column_grants.sql`
5. `005_seller_statistics.sql`
6. `006_product_covers.sql`

Les vérifications embarquées dans l’installateur couvrent les 12 tables avec RLS, les fonctions réservées au serveur et l’historique compatible CLI. Des tests locaux PostgreSQL/PGlite ont également couvert ces protections. Pour une future migration, inspecter l’historique distant avant de modifier quoi que ce soit.

Buckets créés et relus dans Supabase :

| Bucket | Visibilité | Limite | Types autorisés |
| --- | --- | --- | --- |
| `agent-packages` | privé | 20 971 520 octets | ZIP, x-zip-compressed, JSON |
| `product-covers` | public | 3 145 728 octets | JPEG, PNG, WebP |

Auth : fournisseur email actif, inscriptions autorisées, confirmation d’email requise, GitHub OAuth désactivé.

**Le vrai catalogue est actuellement vide.** Les produits de démonstration ont cessé d’être renvoyés après l’activation de Supabase. Ne pas confondre un catalogue vide HTTP 200 avec une erreur. Ne pas publier des produits fictifs pour le remplir.

## Variables et secrets — distinction importante

Les clés d’application ont déjà été fournies, validées et enregistrées dans le runtime d’hébergement. Ne pas repartir du principe qu’elles sont absentes.

| Variable | État / rôle |
| --- | --- |
| `SUPABASE_URL` | Configurée pour le bon projet |
| `SUPABASE_PUBLISHABLE_KEY` | Vraie publishable key validée |
| `SUPABASE_SECRET_KEY` | Vraie secret key validée, serveur uniquement |
| `SITE_URL` | `https://marketpaperclip.murphylexus.chatgpt.site` |
| `PAYMENTS_ENABLED` | `false` |
| `LAUNCH_READY` | `false` |
| `GITHUB_AUTH_ENABLED` | `false` |
| `STRIPE_TAX_ENABLED` | `false` |

Le code accepte aussi les anciens noms `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` en repli. Ne pas exposer une clé secrète/service-role dans le bundle navigateur, un fichier public ou un commit.

L’ancien fichier fourni avait une confusion de noms : une publishable key dans `SUPABASE_ACCESS_TOKEN` et une secret key dans `SUPABASE_DB_PASSWORD`. Les valeurs ont été correctement remappées pour l’application.

**Aucun vrai personal access token Supabase ni mot de passe PostgreSQL n’était disponible dans cette session.** Une application secret key n’est pas un personal access token de la Management API. Les clés applicatives fonctionnent pour Auth/REST/Storage mais ne suffisent pas à modifier les paramètres du projet avec l’API de gestion.

Le workflow GitHub Actions existant attend un vrai `SUPABASE_ACCESS_TOKEN` et un vrai `SUPABASE_DB_PASSWORD`. Ce workflow n’a pas été exécuté avec succès dans cette session. L’installation effective s’est faite dans le SQL Editor, puis le runtime Sites a été configuré séparément.

## Correction récente à préserver

Après activation de Supabase, `/api/catalog` et `/api/creators` renvoyaient 500. Cause identifiée : **PGRST201 / HTTP 300**, plusieurs relations possibles entre `products` et `profiles` (vendeur direct et relation via favoris).

Quatre jointures de `lib/market/api.ts` ont été rendues explicites :
- Produits publics : `profiles!products_seller_id_fkey(display_name,username,bio)`.
- Avis : `profiles!reviews_user_id_fkey(display_name,username)`.
- Créateurs : `products!products_seller_id_fkey!inner(id)`.
- File de modération : `profiles!products_seller_id_fkey(display_name,username)`.

Le correctif est déployé et poussé sur GitHub. Les requêtes corrigées répondent 200. Ne pas réintroduire des jointures implicites ambiguës.

## Tests réellement effectués

Après le correctif : **typecheck réussi, 41 tests existants réussis, build de production réussi**. Scan du bundle client : aucune des clés secrètes configurées détectée.

Tests HTTP/API sur le site réellement déployé, avec un compte temporaire créé par l’API admin et marqué confirmé, **sans envoyer de courriel** :
- Configuration runtime : comptes actifs, démo et paiements désactivés.
- Catalogue public HTTP 200, zéro produit publié.
- Création Auth et déclencheur de profil automatique.
- Connexion par mot de passe, cookie de session Secure et HttpOnly.
- `/api/me`, modification de profil.
- Création d’un brouillon d’agent et d’un brouillon de bundle.
- Visibilité des deux brouillons dans le studio du propriétaire.
- Brouillons invisibles pour le rôle anonyme.
- Accès anonyme à `moderation_note` refusé.
- Génération d’un lien de récupération, sans envoi d’email.
- Callback direct avec `token_hash` et `type=recovery`, redirection vers `/settings?reset=1`.
- Changement de mot de passe, déconnexion, session absente après déconnexion.
- Suppression des deux brouillons, du compte temporaire et de son profil; nettoyage vérifié.

**Limites :** le parcours complet avec réception d’un email réel n’a pas été validé. Le test a constaté le mauvais redirect Supabase décrit ci-dessous. Aucune transaction Stripe réelle n’a été effectuée. L’interface n’a pas fait l’objet d’une recette complète par navigateur dans cette dernière session. Les tests API ne prouvent pas à eux seuls que chaque bouton et chaque affichage mobile fonctionnent.

## Priorité 1 — terminer Auth

Constat reproductible : un lien recovery généré en demandant
`https://marketpaperclip.murphylexus.chatgpt.site/settings?reset=1`
avait comme redirection effective **`http://localhost:3000`**.

Réglages préparés dans [SUPABASE-DASHBOARD.md](SUPABASE-DASHBOARD.md).

1. Ouvrir [Authentication → URL Configuration](https://supabase.com/dashboard/project/ltommtumsvvqxdknpkfd/auth/url-configuration) avec une session réellement accessible.
2. Mettre `Site URL` à `https://marketpaperclip.murphylexus.chatgpt.site`.
3. Ajouter les redirections suivantes, en conservant celles déjà nécessaires :

```text
https://marketpaperclip.murphylexus.chatgpt.site/api/auth/callback
https://marketpaperclip.murphylexus.chatgpt.site/settings
https://marketpaperclip.murphylexus.chatgpt.site/settings?reset=1
https://marketpaperclip.com/api/auth/callback
https://marketpaperclip.com/settings
https://marketpaperclip.com/settings?reset=1
```

4. Dans [Email Templates](https://supabase.com/dashboard/project/ltommtumsvvqxdknpkfd/auth/templates), appliquer les modèles existants `confirmation.html` et `recovery.html`.
5. Garder confirmation email et inscriptions actives; minimum de mot de passe 12 caractères ou exigence existante plus forte. Conserver les paramètres SMTP/OAuth non concernés.
6. Vérifier les nouvelles valeurs et générer un nouveau lien pour confirmer l’origine effective. Puis effectuer une recette consentie avec une vraie boîte contrôlée par le propriétaire.
7. Vérifier/configurer le SMTP de production avant d’ouvrir les inscriptions aux clients. La livraison commerciale des courriels n’a pas été validée.

Les modèles passent par `{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=signup` ou `type=recovery` (avec échappement HTML des esperluettes).

Point technique à surveiller : `auth/recover` utilise actuellement `resetPasswordForEmail` avec `redirectTo: siteOrigin(c) + "/settings?reset=1"`. Le code s’appuie sur les modèles personnalisés pour passer par le callback serveur. Ne pas supposer que les modèles Supabase par défaut et le flux PKCE fonctionneront sans adaptation; tester l’ensemble ou corriger ce parcours avec des tests ciblés.

## Priorité 2 — recette et lancement

Après Auth :
- Vérifier FR/EN, navigation, menus mobiles, filtres, favoris, fiches, profils et boutons du studio.
- Tester deux utilisateurs distincts pour l’isolation des données.
- Vérifier upload de couverture, package privé, publication/modération et contrôle de téléchargement.
- Déterminer le compte propriétaire à ajouter à `market_admins` seulement après vérification de son identité; aucun compte admin définitif n’a été attribué dans cette session.
- Vérifier DNS et HTTPS de `marketpaperclip.com`, puis coordonner `SITE_URL`, paramètres Auth et URLs de callback.
- Distinguer la validation technique du changement d’audience de l’hébergement, encore privé.
- Conserver les prix masqués. Reporter la décision tarifaire et l’activation des transactions jusqu’aux consignes du propriétaire.
- La présence du code Stripe Connect ne signifie pas que Stripe est configuré : onboarding vendeurs, webhooks, remboursements, commissions, taxes et tests financiers restent à valider avant paiements.

## Ne pas refaire l’installation initiale

`supabase/INSTALL-MARKETPAPERCLIP.sql` est un **installateur pour base vide**, pas une mise à jour. Il utilise une seule commande `DO`, enregistre 001–006 et refuse une base applicative déjà installée. Ne pas le relancer maintenant, ne pas faire de `db reset`, ne pas supprimer les tables pour « débloquer » la configuration Auth.

L’ancien affichage SQL Editor montrant seulement `pg_advisory_xact_lock` concernait une version précédente multi-commandes. L’installateur a été corrigé et la base est maintenant réellement installée. Cette ancienne difficulté n’est plus le problème courant.

## Accès et environnement de reprise

Dans la session Codex précédente :
- Source complète Sites : `/workspace/sites/marketpaperclip`.
- Ajouts Supabase seulement : `/workspace/repos/marketpaperclip-supabase` (**dossier partiel**, pas un clone complet).
- Les fichiers locaux et secrets de cette session ne sont pas automatiquement disponibles dans Claude.
- Le `.env` de travail est ignoré par Git; il n’est volontairement pas joint à ce handoff.
- Le contrôle du Chrome Windows du propriétaire n’était pas disponible. Ouvrir ChatGPT dans Chrome n’avait pas créé cet accès. L’outil de bureau échouait à l’initialisation; aucune prise de contrôle effective n’avait eu lieu.

Pour Claude, commencer par un clone à jour du dépôt ou le checkout local existant, vérifier les modifications non commitées et les accès réellement disponibles. Utiliser une session Dashboard connectée si elle est accessible. Sinon, signaler précisément le manque d’accès administratif, sans confondre ce manque avec les clés applicatives déjà valides. Ne pas promettre de contrôler une souris sans accès réel.

Si l’environnement expose le service Sites, conserver le projet et son audience actuels, utiliser son workflow de build/deploiement et ses variables serveur. Une authentification de service de recette, lorsqu’elle est fournie par l’hébergeur, ne remplace pas un compte Supabase et doit rester secrète. Si Claude ne peut pas piloter cet hébergement, préparer les changements dans GitHub et nommer exactement l’étape de déploiement restante, sans annoncer une mise en production non effectuée.

## Critères de reprise réussie

Le prochain compte rendu doit distinguer :
1. ce qui a effectivement été corrigé et déployé;
2. ce qui a été testé sur le site distant;
3. ce qui exige encore un accès ou une décision précise.

Objectif immédiat : obtenir des liens Auth pointant sur le bon site et valider confirmation/récupération de bout en bout, **sans perdre la base installée, sans réexposer les prix et sans activer les paiements**.
