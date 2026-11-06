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
| `/feed` | grande banderole interactive : événements réels, arrivées de droite à gauche, défilement automatique, navigation et historique paginé |
| Accueil | bandeau « EN DIRECT » (affiché dès qu'il y a de l'activité) |
| Fiche produit | dernière vente, meilleure offre, acquisitions, favoris ; onglet *Activité* avec historique des prix de vente |
| Profil créateur | volume, ventes, acheteurs, annonces, note moyenne, ancienneté, badge « Vendeur vérifié par Stripe » ; activité du studio |

**Les acheteurs ne sont jamais identifiés publiquement.** Le registre `market_events` (mise en vente, remise en vente, pause, nouveau prix, offre, vente) ne contient aucun identifiant d'acheteur ; seules les annonces actuellement en ligne y sont visibles. Les statistiques sont des agrégats calculés en base. Aucun chiffre n'est inventé : un marché vide affiche des états vides.

## Implémentation

### Feed interactif — 5 novembre 2026

**Mise à jour pleine page :** chaque événement occupe maintenant 100 % de la scène, avec grand visuel conservé sur mobile, description, prix, créateur, tags, composition, version, licence et prérequis/installation. Le mouvement est continu et linéaire de droite à gauche (28 secondes par largeur), sans arrêt sur une carte. Le premier modèle est visible au chargement; les suivants entrent entièrement par le bord droit et sortent entièrement à gauche. Les nouvelles arrivées restent derrière le modèle suivant s'il est déjà partiellement visible. La position exacte est conservée lors des mises à jour. Survol, focus, aperçu et consultation manuelle mettent la lecture en pause; la préférence de mouvement réduit désactive le défilement. Une copie visuelle masquée aux lecteurs d'écran assure la boucle sans ajouter d'événement.

La démo présente **NEXUS PRIME**, concept fictif de 12 agents à **249 $ CA**, avec une couverture originale générée par ImageGen (`public/art/nexus-prime-demo.webp`, ~194 Ko), et deux autres concepts ORBIT RESEARCH et FORGE STUDIO. Les caractéristiques décrivent des exemples imaginaires, sans logiciel ni paiement. Les descriptions et champs des vrais modèles viennent uniquement des colonnes publiques de `products`; aucun fichier privé n'est sélectionné. Le scénario reste amovible avec le même interrupteur `FEED_DEMO_ENABLED`.


**Exemple temporaire demandé par le propriétaire : [Feed de démonstration](https://marketpaperclip.com/feed?demo=1&lang=fr).** Le lien **Essayer la démo** est aussi disponible sur le Feed normal. Le bandeau **MODE DÉMO — VENTES FICTIVES**, le badge TEST de chaque carte et le libellé DÉMO distinguent les exemples du marché réel. Seize événements illustrés sont disponibles dans l'historique; la première page en affiche six. Huit ventes fictives supplémentaires arrivent automatiquement toutes les quatre secondes. **Ajouter une vente test** permet de déclencher une arrivée à la demande. Le scénario respecte les mêmes filtres, pauses et commandes que le Feed.

Les liens des modèles et créateurs fictifs ouvrent un aperçu local, sans accès à un achat ou téléchargement. **Revenir au Feed réel** quitte la simulation. Chaque ouverture de la démo repart de son scénario initial : les données sont gardées seulement dans la mémoire de cette vue. Aucune commande, publication, transaction Stripe, statistique ou ligne de base de données n'est créée. La source de démonstration ne lit pas non plus le véritable endpoint du Feed.

Pour retirer l'exemple après les essais, passer **`FEED_DEMO_ENABLED` à `false` dans `lib/market/feed-demo.ts`**, puis déployer : le bouton disparaît et `?demo=1` présente alors le vrai Feed. Aucun nettoyage de base de données n'est nécessaire. Les ajouts manuels sont bornés à 64 événements par session de démo. Les contrôles du Feed portent la suite à **129 tests**; le client compilé est aussi contrôlé en FR/EN pour l'ajout manuel/automatique, la consultation historique, l'aperçu, les filtres, l'absence de requête au Feed réel, la sortie et la remise à zéro.

Le lien **Feed** est disponible dans la navigation et sur le libellé **EN DIRECT** de la banderole d'Explore. La page reprend ses couleurs, badges, événements, prix CAD et liens vers les produits, en grand format. Le filtre **Tout** présente les mêmes catégories d'événements que la banderole; **Mises en vente** garde les annonces et remises en vente; **Ventes payées** garde uniquement les événements de vente d'un montant positif. Une annonce ou une acquisition gratuite n'est pas présentée comme une vente payée.

Le carrousel défile en continu de droite à gauche, à vitesse constante. Les nouvelles données sont recherchées toutes les quinze secondes, puis les arrivées d'un même lot sont présentées une par une. Comme la petite banderole, un fil très court réutilise des copies visuelles pour boucler; le compteur et les données restent ceux des événements uniques. Aucune activité n'est inventée pour remplir un fil vide.

Glissement souris/tactile, flèches, touches gauche/droite, Début/Fin, geste horizontal ou Maj + molette et curseur d'historique permettent de consulter les événements. Une navigation manuelle suspend la lecture. Les nouveaux événements continuent d'être reçus sans déplacer la carte consultée; **Revenir au direct** rejoint les dernières arrivées et reprend la lecture. Survol et focus suspendent temporairement l'avance. La préférence de mouvement réduit démarre avec la lecture en pause et supprime les animations.

**Charger l'historique plus ancien** remonte au-delà de la première page. Une interruption réseau laisse les cartes déjà chargées en place. Les réponses qui se recoupent sont dédupliquées par identifiant, avec conservation de l'événement consulté pendant les insertions.

**Buy now dans le Feed :** le bouton est placé avec le prix sur chaque modèle réel tarifé. Le montant affiché sur ce bouton est le prix actuel du produit, même lorsque l'événement montre un ancien prix, une offre ou une vente passée. Accepter la licence et les conditions active le bouton pour un acheteur connecté; un visiteur est invité à se connecter. Le clic fige et sélectionne le modèle, puis utilise directement `POST /api/checkout` et la redirection vers Stripe Checkout (ou les acquisitions pour un produit gratuit/déjà acquis), sans passage par la fiche produit. Le serveur conserve le calcul du montant, la disponibilité du vendeur, l'idempotence et la validation du paiement par webhook. Un vendeur ne voit pas de bouton pour acheter sa propre création, et les prix masqués n'affichent pas de commande d'achat. Une erreur laisse le bouton réessayable. Les copies décoratives de la boucle ne peuvent pas acheter.

Dans la démo, **Buy now · DÉMO** ouvre uniquement l'aperçu fictif avec la mention **Modèle fictif — aucun paiement.** Aucun appel checkout, carte ou transaction n'est déclenché. Le vendeur réel Paperclip Test n'a toujours aucun compte Connect enregistré lors du contrôle de cette mise à jour : la transaction à 1 $ reste bloquée par l'activation vendeur, pas par le bouton.

API publique : `GET /api/market/feed?filter=all|listings|sales&limit=24`, avec `before=<id>` pour le passé ou `after=<id>` pour le rattrapage des nouveautés. Les deux curseurs sont exclusifs. Limite de page : 1 à 60. Le rattrapage est renvoyé dans l'ordre croissant, pour ne pas sauter les premières arrivées d'un lot; l'historique est renvoyé dans l'ordre décroissant. Réponse : `events`, `more`, `oldest`, `newest`. Les champs sont explicitement sélectionnés et reconstruits côté serveur; seuls les événements d'annonces actuellement publiées sont exposés. Aucune commande, identité d'acheteur, adresse courriel ni liaison Stripe n'est lue par cette route. Elle réutilise les tables existantes : aucune migration.

Interface : `components/market-feed.tsx`, carrousel Embla déjà installé; paramètres et fusion des pages dans `lib/market/feed.ts`. Les **124 tests** de la suite couvrent notamment les curseurs, filtres, champs publics et recoupements. Les contrôles du client compilé utilisent des réponses locales avec l'implémentation réelle du carrousel : lecture, arrivées successives, historique préservé, retour au direct, clavier, molette, pagination, curseur, erreur/réessai, un ou deux événements, prix masqués et mouvement réduit, en français et anglais. Ils n'ajoutent aucune vente à la production. Exemple sur le build servi localement :

```sh
printf '%s' '{"origin":"http://127.0.0.1:8894","locale":"fr","feedFixture":"full"}' | node --experimental-vm-modules scripts/check-client-interactions.mjs
```

`feedFixture` accepte `full`, `single`, `two`, `hidden-prices` et `reduced`. JSDOM fournit une géométrie fixe pour ces contrôles; ils ne remplacent pas une vérification visuelle desktop/mobile, indisponible dans cette session.

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
