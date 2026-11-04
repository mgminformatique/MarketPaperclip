# MarketPaperclip — Handoff

## Mise à jour du 4 novembre 2026 après la recette de lancement

Production Netlify : déploiement `6aebb6a3a93714f201f59d7b` (`ready`), code `d665d38`, suite à `e1c9cfe`. Prix explicitement en CAD, langue du Checkout et des retours conservée, prix Stripe explicitement hors taxes, diagnostic des clés `rk_live_` corrigé. TypeScript, 103 tests, build Netlify, 50 contrôles publics et contrôle du client compilé FR/EN réussis; audit des dépendances de production sans vulnérabilité connue.

Le propriétaire a demandé la publication de **Paperclip Test** : fiche `paperclip-test-bdbbb8c3`, 1 $ CA, version 1.0.0, MIT. Package réel dans `packages/paperclip-test/`, copie privée stockée et SHA-256 vérifiés. La publication a été faite par les procédures serveur avec l'autorisation du propriétaire; aucun achat n'a été simulé en production. **Aucun vendeur Connect relié et aucune commande au dernier contrôle : la vente réelle est encore à faire.** Le plafond autorisé est de 1 $ CA au total sur la carte du propriétaire. Il faut terminer l'activation vendeur dans le studio, puis utiliser un autre compte acheteur.

Le domaine et les DNS publics répondent depuis le poste. Le propriétaire a signalé « unable to connect » au domaine principal mais a confirmé l'ouverture de `https://marketpaperclip.netlify.app/studio`. Ne pas déclarer la cause résolue. L'accès au navigateur de l'agent était indisponible pendant cette session.

Voir [le rapport et les conditions du lancement international](LAUNCH-AUDIT-2026-11-04.md). Scripts : `npm run audit:launch` (contrôles publics), `npm run verify:sale` (preuve du téléchargement par le vrai compte acheteur après paiement, entrée privée sur stdin). Aucun budget publicitaire n'a été engagé. Ne pas annoncer un onboarding vendeur mondial : le serveur crée encore les comptes Connect au Canada. Taxes et parcours consommateurs des pays ciblés restent à valider.

Les modifications anciennes du checkout `feature/marche-netlify` n'ont pas été écrasées. La recette est isolée dans `feature/recette-internationale`, puis intégrée par avance rapide à la branche de production `feature/profils`.

État au **3 novembre 2026 (America/Toronto)**. Revérifier l’état distant avant toute action.

## Demande du propriétaire (2 novembre 2026)

Un marché d’agents **entre utilisateurs**, à la manière d’un marché crypto mais réglé par **Stripe** : profils, annonces de vente de leurs agents, prix fixés par les vendeurs. Déployer sur **Netlify** avec le domaine **marketpaperclip.com** (GoDaddy). Supabase et Stripe sont déjà ouverts côté comptes. Ne pas modifier le style existant; les nouvelles sections reprennent le même style.

Décisions qui remplacent le handoff du 1er novembre :
- Les prix sont **visibles** (réglable par `SHOW_PRICES=false`), toujours fixés par le vendeur; aucun prix inventé.
- Les paiements restent fermés tant que les clés Stripe, le webhook et la commission ne sont pas saisis dans Netlify par le propriétaire. *Fait le 3 novembre 2026 au soir : paiements ouverts, commission de 15 %, voir [STRIPE.md](STRIPE.md).*

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

Mise à jour du 3 novembre (matin), avec l’accord du propriétaire :
- **Production publique** : protection d’équipe limitée aux déploiements hors production (`sso_login_context=non_production`). `*.netlify.app` répond avec `X-Robots-Tag: noindex`; seule l’origine `SITE_URL` est indexable.
- **SEO déployé** (déploiement `6ae9d7a88f026e0314f1fda2`, commit `8354e6a`) : voir [SEO.md](SEO.md). Lighthouse en ligne : performance 94–96, SEO 100 sur l’origine canonique (mesuré localement), 66–69 sur netlify.app à cause du `noindex` voulu.
- Courriels Auth : envoyés par Microsoft 365 (info@mgminformatique.ca, Microsoft Graph) via le crochet Supabase Send Email et la fonction `send-email`, comme ChantierConnect — voir [COURRIELS_MICROSOFT.md](COURRIELS_MICROSOFT.md). Configuration Auth : uniquement `node scripts/supabase-config-push.mjs`. Les liens suivent l’origine de l’inscription (netlify.app fonctionne avant la bascule DNS).

Reste à faire :
- **Domaine en service (3 novembre 2026)** : DNS GoDaddy A `@` → `75.2.60.5`, CNAME `www` → `marketpaperclip.netlify.app`; certificat Let’s Encrypt émis par Netlify pour `marketpaperclip.com` et `www`. `https://marketpaperclip.com` répond (HSTS), `www` et `http` redirigent en 301 vers lui; `marketpaperclip.netlify.app` reste servi avec `noindex`. Connexion vérifiée dans Firefox sur le domaine.
- SEO : `node scripts/indexnow.mjs` (refuse d’envoyer un sitemap qui n’est pas celui du site, p. ex. pendant qu’un cache DNS sert encore le parking GoDaddy); reste Search Console (TXT de vérification chez GoDaddy, sitemap) et Bing Webmaster.
- ~~Clés et webhook Stripe dans Netlify~~ (fait le 3 novembre 2026, [STRIPE.md](STRIPE.md)); restreindre « MarketPaperclip Courriels » à la boîte info@ (RBAC Exchange pour les applications).
- Branche `feature/marche-netlify` encore locale (non poussée sur GitHub).

## Accès disponibles sur le poste

`supabase` (jeton de gestion injecté par le lanceur MGM), `netlify` (compte MGM Informatique, équipe `info-oxcsesk`, plan Pro), `gh`. Aucune clé Stripe n’est disponible localement : ne pas en chercher, ne jamais demander de secret dans le chat.
