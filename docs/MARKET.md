# Le marché utilisateur

Un marché entre utilisateurs inspiré des places de marché crypto (volume, prix plancher, activité en direct, offres), mais réglé en dollars canadiens par **Stripe Connect** : chaque vendeur reçoit ses fonds sur son propre compte Stripe, le marketplace prélève sa commission. Les agents sont des produits numériques : chaque acheteur obtient sa copie privée de la version achetée.

## Parcours

**Vendeur** — crée son profil public (`/settings`), publie un agent ou un bundle depuis le studio (`/studio/new`) : couverture, package ZIP/JSON (jusqu'à 20 Mo, envoyé directement au stockage privé), documentation, **son prix**. Chaque publication passe par la modération. Ensuite, depuis *Mes annonces sur le marché* :
- changer le prix d'une annonce en ligne **sans nouvelle validation** ;
- mettre l'annonce en pause puis la remettre en vente (même version déjà validée) ;
- tout changement de contenu, de couverture ou de package renvoie en validation.

L'onglet **Offres** du studio liste les propositions reçues (montant, écart au prix, message) : *Accepter* ou *Refuser*.

**Acheteur** — parcourt le catalogue et la page **Le marché**, achète au prix affiché (Stripe Checkout) ou **fait une offre** :
- au moins 20 % du prix demandé, strictement en dessous ;
- une offre active par produit et par acheteur, valable 7 jours, 20 offres ouvertes au maximum ;
- acceptée : 72 heures pour payer ce montant (jamais plus que le prix courant si le vendeur l'a baissé entre-temps) ;
- l'offre passe à *Payée* quand Stripe confirme le paiement.

Les agents gratuits s'ajoutent directement aux acquisitions dès que `LAUNCH_READY=true`, sans Stripe. Le téléchargement est un lien privé de 60 secondes, uniquement pour une commande payée.

## Données publiques du marché

| Vue | Contenu |
| --- | --- |
| `/market` | volume, ventes, annonces, créateurs actifs, prix plancher et moyen, offres ouvertes, volume quotidien, tendances, top créateurs, activité, nouvelles annonces |
| Accueil | bandeau « EN DIRECT » (affiché dès qu'il y a de l'activité) |
| Fiche produit | dernière vente, meilleure offre, acquisitions, favoris ; onglet *Activité* avec historique des prix de vente |
| Profil créateur | volume, ventes, acheteurs, annonces, note moyenne, ancienneté, badge « Vendeur vérifié par Stripe » ; activité du studio |

**Les acheteurs ne sont jamais identifiés publiquement.** Le registre `market_events` (mise en vente, remise en vente, pause, nouveau prix, offre, vente) ne contient aucun identifiant d'acheteur ; seules les annonces actuellement en ligne y sont visibles. Les statistiques sont des agrégats calculés en base. Aucun chiffre n'est inventé : un marché vide affiche des états vides.

## Implémentation

- Base : `supabase/migrations/007_market_exchange.sql` — triggers d'événements, offres, contrôle des annonces, fonctions de statistiques. Toutes les écritures passent par des fonctions réservées au serveur ; les navigateurs ne lisent que leurs propres offres.
- API : `lib/market/api.ts` — `market/overview|activity|leaderboard|trending`, `offers`, `products/:id/price|listing|file/upload|file/attach`, `checkout` (offres acceptées).
- Interface : `components/market-floor.tsx` (marché public), `components/market-desk.tsx` (offres, annonces, upload direct), styles `app/market.css` (palette existante, préfixe `mk-`).
- Tests : `tests/market.test.mjs` (SQL/RLS sur PGlite), `tests/market-api.test.ts` (routes, Stripe simulé).

## Réglages

| Variable | Effet |
| --- | --- |
| `SHOW_PRICES=false` | masque tous les prix (mode vitrine) |
| `LAUNCH_READY=true` | ouvre les acquisitions (gratuites sans Stripe) |
| `PAYMENTS_ENABLED=true` + clés Stripe + `PLATFORM_FEE_BPS` | ouvre les achats payants et les offres |
| `MARKET_ADMIN_EMAILS` | modérateurs désignés par courriel confirmé |
