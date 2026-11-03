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

## Production — état au 3 novembre 2026, avec l’accord du propriétaire

Fait :
1. Migration `007_market_exchange.sql` appliquée sur `ltommtumsvvqxdknpkfd` (historique 001→007; RLS active sur `offers` et `market_events`; aucune fonction du marché exécutable par `anon`). Base encore vide.
2. Auth poussée avec `supabase config push` : Site URL `https://marketpaperclip.com`, redirections www/netlify.app/aperçus, modèles FR/EN, mot de passe minimum 12. `supabase config diff` ne montre plus d’écart sur les propriétés déclarées.
3. Site Netlify `marketpaperclip` (ID `4911687f-987b-4363-9982-50078b56f9ef`, équipe `info-oxcsesk`), variables posées par `scripts/netlify-configure.mjs` (clé secrète Supabase marquée secrète; `MARKET_ADMIN_EMAILS=info@mgminformatique.ca`; `LAUNCH_READY=false`; paiements fermés), fonctions en **us-west-2** (même région que Supabase).
4. Déploiement de production `6ae9b39266c8156e12f60119` (commit `91819c4`) : état *ready*, 1 fonction Node 24. URL : https://marketpaperclip.netlify.app.
5. `marketpaperclip.com` et `www.marketpaperclip.com` déclarés comme domaines du site Netlify.

Choix du propriétaire : **le site reste protégé** par la connexion d’équipe Netlify (politique d’équipe `site_sso_login`, contexte « all »). Le public voit une page de connexion Netlify; la recette HTTP en ligne n’a donc pas été faite depuis le poste. Les webhooks Stripe ne pourront pas atteindre un site protégé : ouvrir l’accès avant d’activer les paiements.

Reste à faire :
- DNS GoDaddy : A `@` → `75.2.60.5`, CNAME `www` → `marketpaperclip.netlify.app` (API GoDaddy non connectée : `mgm auth godaddy` ou interface GoDaddy). Tant que le DNS n’est pas basculé, les liens des courriels Auth (Site URL) mènent à la page de parking GoDaddy.
- SMTP Supabase avant les inscriptions publiques; clés et webhook Stripe dans Netlify; accès public du site au lancement.
- Branche `feature/marche-netlify` encore locale (non poussée sur GitHub).

## Accès disponibles sur le poste

`supabase` (jeton de gestion injecté par le lanceur MGM), `netlify` (compte MGM Informatique, équipe `info-oxcsesk`, plan Pro), `gh`. Aucune clé Stripe n’est disponible localement : ne pas en chercher, ne jamais demander de secret dans le chat.
