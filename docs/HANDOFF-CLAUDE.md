# MarketPaperclip — Handoff

État au **3 novembre 2026 (America/Toronto)**. Revérifier l’état distant avant toute action.

## Demande du propriétaire (2 novembre 2026)

Un marché d’agents **entre utilisateurs**, à la manière d’un marché crypto mais réglé par **Stripe** : profils, annonces de vente de leurs agents, prix fixés par les vendeurs. Déployer sur **Netlify** avec le domaine **marketpaperclip.com** (GoDaddy). Supabase et Stripe sont déjà ouverts côté comptes. Ne pas modifier le style existant; les nouvelles sections reprennent le même style.

Décisions qui remplacent le handoff du 1er novembre :
- Les prix sont **visibles** (réglable par `SHOW_PRICES=false`), toujours fixés par le vendeur; aucun prix inventé.
- Les paiements restent fermés tant que les clés Stripe, le webhook et la commission ne sont pas saisis dans Netlify par le propriétaire.

## Livré sur la branche `feature/marche-netlify`

- **Netlify** : le build Vinext tourne dans une fonction Node (`scripts/netlify-prepare.mjs`, `netlify.toml`); configuration lue via `lib/market/runtime.ts` (plus d’import `cloudflare:workers`); IP client fournie par la plateforme; `SITE_ALIASES` pour www/netlify.app/aperçus; upload direct des packages vers Storage (limite de 6 Mo des fonctions).
- **Marché** : migration `007_market_exchange.sql` (événements publics sans acheteur, offres, pause/prix sans revalidation, statistiques), API et interface (`/market`, bandeau d’accueil, stats et activité sur fiches et profils, offres dans studio et bibliothèque). Détails : [MARKET.md](MARKET.md).
- **Auth** : redirection de récupération via le callback serveur; `supabase/config.toml` déclare la configuration de production (Site URL, redirections, modèles, mot de passe 12); script `configure-supabase-auth.mjs` aligné.
- **Modération** : `MARKET_ADMIN_EMAILS` promeut un compte au courriel confirmé.
- Corrections trouvées en recette : toasts perdus à la navigation, `pattern` du nom de profil invalide pour les navigateurs, CSP bloquant un sous-ensemble de police, état « déjà acquis » sur la fiche.

## Tests effectués

`npm test` : 70 tests (API, Stripe simulé, SQL/RLS PGlite, i18n, interactions). Typecheck et build OK. Lint : aucune erreur nouvelle (45 préexistantes).

Recette de bout en bout sur une **pile Supabase locale** (Postgres 17.11, Auth, Storage, Mailpit) avec le build Netlify de production et Chromium : 40 vérifications de parcours, 37 vérifications de sécurité, aucune erreur console. Détail dans [ACCEPTANCE.md](ACCEPTANCE.md). Les scripts de recette ne sont pas dans le dépôt (outillage local de session).

## Production — rien n’a encore été modifié

Le classificateur de la session a bloqué l’application de la migration en production : chaque action distante attend l’accord explicite du propriétaire. Ordre prévu (commandes exactes dans [NETLIFY.md](NETLIFY.md)) :

1. `supabase db push` de la migration 007 (base distante vide au 2 novembre : 0 utilisateur, 0 produit).
2. `supabase config push` (Site URL encore à `http://localhost:3000`, aucune redirection autorisée, mot de passe minimum 6).
3. Création du site Netlify `marketpaperclip`, variables via `scripts/netlify-configure.mjs`, déploiement.
4. DNS GoDaddy : A `@` → `75.2.60.5`, CNAME `www` → `marketpaperclip.netlify.app` (API GoDaddy non connectée : `mgm auth godaddy` ou interface GoDaddy).
5. SMTP Supabase (les courriels par défaut ne partent qu’aux membres de l’organisation).
6. Stripe : clés et webhook saisis par le propriétaire dans Netlify, puis `LAUNCH_READY`/`PAYMENTS_ENABLED`, recette en mode TEST.

## Accès disponibles sur le poste

`supabase` (jeton de gestion injecté par le lanceur MGM), `netlify` (compte MGM Informatique, équipe `info-oxcsesk`, plan Pro), `gh`. Aucune clé Stripe n’est disponible localement : ne pas en chercher, ne jamais demander de secret dans le chat.
