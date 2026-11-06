# MarketPaperclip — Handoff

## Publication de test sur le véritable profil MGM Informatique — 5 novembre 2026

Le propriétaire a précisé que l'exemple devait apparaître sur **son profil MGM Informatique**, et non celui du compte Paperclip Test. Une publication temporaire illustrée est maintenant visible sur **https://marketpaperclip.com/creators/dev-d3dda9077cc7470c8b707dd7?lang=fr**, ainsi que dans **Mon profil** (`/profile`) lorsqu'il est connecté à son compte principal.

Auteur **`d3dda907-7cc7-470c-8b70-7dd7dd564aba`**, identifiant public **`dev-d3dda9077cc7470c8b707dd7`**, publication **`5c855f0b-8daf-45d4-9fdb-84135045ee66`**, créée le **2026-11-06T03:30:23.147839+00:00**. Texte : « Test de publication 👀 », puis un court exemple annonçant explicitement qu'il sert à voir l'affichage du profil et pourra être retiré. Une image reprend le visuel existant `public/art/nexus-prime-demo.webp`, copié dans `profile-media` sous le chemin de médias de cet auteur. Aucun modèle n'est joint; le profil conserve zéro modèle et compte maintenant une publication. Cette action concerne uniquement l'exemple de publication demandé, sans transfert de modèle entre comptes.

Écriture opérateur via le service authentifié Supabase, sur instruction explicite du propriétaire, après vérification de son UUID et du nom MGM Informatique. Texte, nombre d'images, signature WebP, taille et chemin de médias de l'auteur vérifiés; aucune session de navigateur ni mot de passe du propriétaire utilisé ou modifié. Action consignée dans `audit_log` sous `operator.profile.post_example`. L'API publique confirme le bon auteur, le texte et l'image; les octets publics correspondent au fichier source. Le HTML public rend bien ce post et son image dans l'onglet Publications actif. Aucune vérification visuelle de navigateur n'a été possible dans cette session.

Les données sont déjà en ligne : actualiser `/profile?lang=fr` suffit. Aucun changement du code ni déploiement applicatif nécessaire. Pour retirer cet exemple sur demande : supprimer la publication avec le compte principal; la route applicative retire ses médias. Les identifiants ci-dessus permettent de cibler cet exemple précisément.

## Agent créé depuis le compte de test et partagé sur son profil — 5 novembre 2026

À la demande du propriétaire, **Profil Pilot — Agent test** est créé et publié sous **Paperclip Test — MGM**, compte `3e76f7a7-04ad-4db3-9fd6-6d124fc1df7d`, sans droits administrateur. Profil public : **https://marketpaperclip.com/creators/paperclip-test?lang=fr**. Fiche : **https://marketpaperclip.com/agents/profil-pilot-agent-test-cc94c20d?lang=fr**. Produit **`cc94c20d-5d9d-4d28-865a-b68c9a6b6fb8`**, gratuit (**0 $ CA**), MIT, version 1.0.0, un agent Multi-modèles / Opérations. Publication du profil **`060b49b5-3d85-4ea4-a5cb-db5bda122da2`**, créée le **2026-11-06T03:20:57.162363+00:00**, contenant seulement la carte du modèle (texte vide, aucune image de publication ajoutée).

Le modèle est visible dès l'onglet **Publications**, avec sa couverture et le prix Gratuit, et dans **Modèles**. Le profil de test contient maintenant deux modèles et une publication. Le profil du compte principal MGM n'a pas été modifié. La création, le transfert signé du ZIP, l'ajout de couverture, la soumission et le partage sont passés par les routes applicatives avec la connexion normale du compte de test. La revue a confirmé l'archive MIT bilingue et l'identité du modérateur autorisé avant l'approbation atomique `market_moderate_product`; l'audit `product.published` est présent. Aucun rôle de compte n'a été modifié.

Source : `packages/profil-pilot-test/`. Archive : **`packages/releases/profil-pilot-test-1.0.0.zip`**, **4445 octets**, SHA-256 **`5fca962c288c698ca767c1a19e6ded842cbc7a7bd3132e179c39685ad98cc686`**. Les octets privés transférés ont été relus et sont identiques. Six fichiers : instructions, licence, documentation FR/EN, manifeste et exemples. L'agent prépare une fiche de modèle à partir de faits fournis; il ne possède ni service hébergé, script, connexion externe, paiement ou publication automatique. Exécution dans un environnement d'agent non testée. La couverture réutilise l'illustration existante `public/art/growth.webp`, transférée dans les médias du produit du compte test.

Vérifications : archive relue, ZIP et manifeste valides, propriétaire/prix/version vérifiés, fichier privé et couverture comparés octet à octet, fiche et profil publics accessibles. Le HTML réel du profil ouvre Publications et contient la carte du nouveau modèle dans le fil, avec image et prix Gratuit; l'API publique contient aussi le modèle dans la liste et la publication. Le Feed réel reçoit une mise en ligne gratuite légitime, **aucune vente payée ni commande n'a été créée**. Aucun débit, achat gratuit simulé ou statistique de vente fabriquée. Pas de modification du code de l'application ni nouveau déploiement Netlify : les nouvelles données apparaissent immédiatement sur la version en ligne. Aucun navigateur visuel disponible pendant ce contrôle.

Conserver cet exemple jusqu'à la demande de retrait. Pour le retirer ensuite : supprimer la publication avec le compte propriétaire, puis mettre l'annonce en pause via l'API normale; conserver l'historique et le package des éventuelles acquisitions. Ne pas supprimer le compte de test ou les autres modèles.

## Buy now directement depuis le Feed — 5 novembre 2026

Publié sur **https://marketpaperclip.com/feed?lang=fr**. Source **`8181945`** sur `main`, déploiement Netlify **`6aed426d287f147f4a7d51c7`**, `ready`, publié le **6 novembre à 02 h 59 UTC** (5 novembre à 21 h 59 HE), aucune planification.

Le bouton **Buy now** remplace la commande de fiche dans le bloc prix, avec le tarif actuel du modèle. Licence et conditions à accepter sur place, connexion si nécessaire, puis `POST /api/checkout` et redirection vers Stripe Checkout sans passer par la page produit. Le clic sélectionne et fige le modèle; le montant vient toujours du serveur, jamais de la carte d'événement. État de chargement, verrou contre le double-clic, erreur explicite et nouvel essai. Le propriétaire voit Votre création; un modèle gratuit utilise Obtenir gratuitement et rejoint les acquisitions. Prix masqués et modèles sans UUID/prix ne peuvent pas démarrer un achat; copies décoratives désactivées. La projection publique du Feed ajoute seulement les UUID publics `id` et `seller_id`; aucun fichier ou acheteur privé exposé. Aucun changement du calcul des paiements, du webhook ou du schéma de base.

Dans **https://marketpaperclip.com/feed?demo=1&lang=fr**, **Buy now · DÉMO** ouvre l'aperçu fictif et indique **Modèle fictif — aucun paiement.** Aucun checkout ou débit n'est associé à NEXUS PRIME ou aux autres exemples.

**Vente réelle toujours bloquée :** le contrôle en lecture seule de `seller_accounts` confirme qu'aucun compte Connect n'est enregistré pour le vendeur Paperclip Test (`3e76f7a7-04ad-4db3-9fd6-6d124fc1df7d`). La configuration publique autorise les paiements, mais ne remplace pas cette activation. L'API checkout refuse un vendeur non connecté avant de créer une commande. L'accès Stripe CLI n'a pas permis de contrôler la plateforme pendant cette session; la clé de production est masquée à la lecture Netlify et n'a pas été exposée. Ne pas affirmer que l'inscription de la plateforme est maintenant résolue, ni qu'une vente a eu lieu. Aucune transaction réelle ni nouveau compte vendeur n'a été créé.

Validation : TypeScript, **129 tests**, build et CI **42153674487** réussis; **60 contrôles publics** après publication. Client compilé publié contrôlé en FR/EN pour Buy now : consentement explicite, UUID sans montant client, erreur vendeur, reprise, requête unique en cours, intention de redirection Stripe, connexion visiteur et démo sans checkout. Propriétaire, gratuit, démo EN, historique et prix masqués aussi contrôlés localement. Les POST des tests sont interceptés en mémoire, sans écriture sur le serveur; JSDOM signale l'intention de navigation sans suivre Stripe et ne prouve pas de paiement. L'API réelle retourne une annonce publiée et zéro vente payée, sans identifiant fictif. Aucun navigateur visuel disponible; rendu ordinateur/mobile et paiement réel restent non vérifiés.

## Carrousel du Feed plus compact — 5 novembre 2026

À la demande du propriétaire, le conteneur défilant est réduit sur ordinateur et mobile. Modification CSS seulement (`app/market.css`) : hauteur minimale de la fiche de 660 px à 480 px, retrait de la hauteur imposée par le viewport, espacements et titres plus compacts; visuel mobile de 270 px à 190 px et retrait du minimum de 85svh. La largeur d'un modèle, le contenu complet, les prix et les commandes du défilement sont conservés.

Code **`82d4c89`** sur `main`, déploiement Netlify **`6aed3f2a4b0953737a2f5f76`**, `ready`, publié le **6 novembre à 02 h 45 UTC** (5 novembre à 21 h 45 HE), aucune planification. URL : **https://marketpaperclip.com/feed?demo=1&lang=fr**.

Validation : build et CI **42152265098** réussis; page, JavaScript et feuille CSS publiés répondent 200, règles compactes confirmées dans le CSS servi. Le parcours de la démo FR sur le client compilé publié passe (arrivées, historique, aperçu, filtres, sortie et remise à zéro, sans écriture serveur). Le navigateur visuel n'est pas disponible dans cette session; le rendu sur ordinateur/mobile n'a pas été vérifié visuellement.

## Modèles complets et défilement continu — 5 novembre 2026 au soir

Publié sur **https://marketpaperclip.com/feed?demo=1&lang=fr**. Code du Feed **`a7805f8`**, correction du paquet Netlify **`784b770`**, tous deux sur `main`. Déploiement final **`6aed37aa8c5801be7e01f89e`**, `ready`, publié le **6 novembre à 02 h 13 UTC** (5 novembre à 21 h 13 HE), aucune planification.

Chaque modèle occupe maintenant **100 % de la largeur de la scène**, avec grand visuel (également sur mobile), description complète, prix, créateur, tags, composition, licence, version et prérequis/installation. La lecture déplace la scène à vitesse constante de droite à gauche, **28 secondes par largeur**, sans les arrêts de l'ancien carrousel à cinq secondes. Le premier modèle est immédiatement visible au chargement; les suivants entrent par le bord droit et sortent complètement à gauche. Une copie visuelle du premier élément assure la boucle, sans gonfler les comptes ni créer de doublon accessible. Les arrivées préservent la position exacte et le modèle suivant déjà partiellement visible; elles se placent au-delà du bord droit. Pause, survol, focus, souris/tactile, flèches, clavier, molette, historique et retour au direct sont conservés; mouvement réduit = défilement désactivé.

**NEXUS PRIME — Démo** est le modèle fictif d'ouverture : concept de **12 agents, 249 $ CA**, couverture originale ImageGen (`public/art/nexus-prime-demo.webp`, 198 424 octets), description, capacités imaginaires et spécifications. ORBIT RESEARCH et FORGE STUDIO complètent les exemples. Le scénario reste exclusivement en mémoire du navigateur : **aucune annonce, vente, commande, donnée Stripe ou statistique n'a été créée**. L'API réelle retourne toujours une annonce publiée et zéro vente payée, sans identifiants de démo. Pour retirer les exemples sur demande du propriétaire : `FEED_DEMO_ENABLED = false` dans `lib/market/feed-demo.ts`, puis déployer.

Le Feed réel charge désormais les détails publics de `products` via une projection explicite : description, accroche, version, licence, tags, nombre d'agents, prérequis, installation et prix actuel. Les chemins et fichiers privés restent exclus. Les anciens endpoints d'activité restent compatibles avec ces champs optionnels. Aucune migration.

**Validation finale :** TypeScript, **129 tests**, build, CI GitHub **42148610610** et **42148867515** réussis; **60 contrôles publics** sur le déploiement final. Client compilé réellement publié contrôlé en FR/EN pour la démo et le Feed : mouvement intermédiaire linéaire vers la gauche, conservation de la fraction visible, file d'arrivées, navigation/historique, souris, reprise après erreur, absence de requêtes au Feed réel pendant la démo, sortie et remise à zéro. Un/deux événements, prix masqués et mouvement réduit également contrôlés localement. Image et JavaScript publics répondent 200. L'accès au navigateur de l'opérateur est indisponible : le rendu visuel desktop/mobile reste à vérifier dans un navigateur.

**Correction de publication :** le premier paquet avait réutilisé le ZIP de fonction mis en cache par `netlify serve`, qui référençait un ancien nom de chunk JavaScript et provoquait un 404 au démarrage. Les contrôles du client publié l'ont détecté. `scripts/netlify-prepare.mjs` supprime maintenant le cache généré `.netlify/functions` avant de préparer chaque build; le déploiement final a été repaqueté et les parcours compilés passent. Toujours exécuter la préparation après le dernier build et vérifier le client publié, en plus des contrôles HTTP.

## Exemple temporaire du Feed — 5 novembre 2026 au soir

À la demande du propriétaire, une démonstration amovible est publiée sur **https://marketpaperclip.com/feed?demo=1&lang=fr**. Code **`4932963`** sur `main`, déploiement Netlify **`6aed2fc9f8bec426be5a05e8`**, état `ready`, publié le **6 novembre à 01 h 39 UTC** (5 novembre à 20 h 39 HE), aucune planification.

La page affiche MODE DÉMO — VENTES FICTIVES et TEST sur chaque carte. Seize exemples illustrés sont disponibles, six au départ dans le carrousel; huit ventes test arrivent ensuite automatiquement toutes les quatre secondes. Le bouton Ajouter une vente test déclenche une arrivée à la demande. Les liens des exemples ouvrent un aperçu local, sans achat. Revenir au Feed réel quitte la simulation; une nouvelle ouverture de la démo remet son scénario à zéro.

**Aucune vente, commande, annonce, statistique ou donnée Stripe n'a été créée.** Le scénario est contenu dans la mémoire de la vue et ne lit pas le véritable endpoint du Feed. La page `/feed` ordinaire continue d'utiliser les événements réels. Le contrôle après publication retrouve une annonce réelle et zéro vente payée dans l'API, sans identifiant de démonstration.

**Retrait après les essais :** passer `FEED_DEMO_ENABLED` à `false` dans `lib/market/feed-demo.ts`, puis déployer. Le bouton disparaît et le paramètre `demo=1` ne déclenche plus la simulation. Aucune ligne en base à nettoyer. Ne pas retirer l'exemple avant la demande du propriétaire.

Validation : TypeScript, **128 tests**, build et CI GitHub **42145213334** réussis, **60 contrôles publics** après déploiement. Parcours du client compilé publié FR/EN : badges, ajout manuel et automatique, historique, aperçu, filtres, absence de lecture du Feed réel pendant la démo, sortie propre et remise à zéro. Le Feed réel est aussi contrôlé sur le build local; les quatre images publiques répondent 200. Vérification visuelle desktop/mobile indisponible, accès au navigateur de l'opérateur absent. Voir [MARKET.md](MARKET.md).

## Feed interactif — production du 5 novembre 2026 au soir

Code **`5c57d17`** sur `main`, déploiement Netlify **`6aed2748dbb5f99aa0f9cedb`**, état `ready`, publié le **6 novembre à 01 h 03 UTC** (5 novembre à 20 h 03 HE). Page **https://marketpaperclip.com/feed**, accessible depuis la navigation et le libellé EN DIRECT de la banderole d'Explore. Le déploiement contient aussi les profils livrés précédemment; aucune migration ni nouvelle planification.

Grande version de la banderole : mêmes événements, badges et palette, carrousel de droite à gauche, lecture toutes les cinq secondes, glissement, flèches, clavier, molette horizontale et curseur d'historique. Actualisation des données toutes les quinze secondes; les lots d'arrivées entrent un à un. La consultation manuelle reste sur l'événement choisi, avec compteur des nouvelles arrivées et retour au direct. Historique paginé, reprise après erreur et mouvement réduit pris en charge. Les copies visuelles nécessaires pour boucler un fil court ne comptent jamais comme de nouvelles ventes.

API publique `GET /api/market/feed`, filtres Tout / Mises en vente / Ventes payées, curseur `before` pour le passé ou `after` pour les nouveaux événements. Champs explicitement limités, annonces publiées seulement, aucune donnée d'acheteur ou de commande sélectionnée. Le contrôle de production retrouve une mise en vente réelle de Paperclip Test et **zéro vente payée**; aucun événement n'a été fabriqué pour remplir la page.

Validation : TypeScript, **124 tests**, build, CI GitHub **42082933699** pour les profils précédents et **42141102276** pour le Feed, cette dernière réussie. **60 contrôles publics** après déploiement; pages et métadonnées FR/EN, sitemap et trois filtres API vérifiés. Le client compilé publié passe la navigation, arrivées successives, maintien de position, retour au direct, clavier, molette, curseur, pagination, erreur/réessai et absence de doublons en FR/EN avec réponses isolées. Un ou deux événements, prix masqués et mouvement réduit sont aussi contrôlés sur le build local. Aucun paiement ni écriture de données de test en production. Le navigateur de l'opérateur est indisponible : ces contrôles de DOM ne constituent pas une vérification visuelle desktop/mobile. Voir [MARKET.md](MARKET.md).

## Profils pour tous les membres et modèles depuis le profil — 5 novembre 2026

Code **`705fe5f`** sur `main`, déploiement Netlify **`6aecc872dd926bc802287a73`**, état `ready`, publié à **18 h 18 UTC** sur https://marketpaperclip.com. Aucune migration nécessaire : les profils, photos, couvertures et publications utilisent les tables et droits de la migration 008 existante. Aucune fonction planifiée.

La navigation et la photo du compte ouvrent **`/profile`**, profil personnel de tout membre connecté; le lien public reste `/creators/<nom>`. Photo et couverture modifiables, présentation, onglets Publications / Mes modèles / Photos, édition des détails sur place. **Créer un modèle** ouvre l'éditeur sur le profil : description, fichier, prix, licence, sauvegarde du brouillon et soumission sans redirection vers le studio. Les modèles approuvés peuvent être joints à une publication depuis Mes modèles. Les visiteurs voient seulement les modèles publiés; brouillons et commandes d'édition restent privés. Les formats restent ceux des agents et bundles du marketplace.

Validation : TypeScript, **116 tests**, build Netlify, **56 contrôles publics** après déploiement. Le client compilé publié passe les parcours propriétaire FR/EN avec réponses locales : photo, couverture, détails, publication avec modèle, brouillon, transfert du fichier, soumission, bouton global et confirmation avant abandon. Visiteur et accès anonyme contrôlés sur le build local. Aucun compte, modèle, média ni paiement de test n'a été ajouté à la production par ces contrôles. L'accès au navigateur est indisponible; la vérification visuelle desktop/mobile reste distincte. Voir [PROFILS.md](PROFILS.md).

Stripe Connect conserve son blocage décrit ci-dessous; cette évolution du profil ne l'active pas.

## Vendeur de test distinct — 5 novembre 2026

À la demande du propriétaire, Paperclip Test est maintenant publié sous **Paperclip Test — MGM**, profil [paperclip-test](https://marketpaperclip.com/creators/paperclip-test), compte `3e76f7a7-04ad-4db3-9fd6-6d124fc1df7d`. Le compte de test de courriels existant, déjà confirmé, a été réutilisé plutôt que dupliqué. Son adresse est `info+marketpaperclip-test@mgminformatique.ca`. Sa connexion normale et `/api/me` ont été vérifiés; il n'est pas administrateur. Le mot de passe aléatoire est conservé uniquement dans le coffre du poste MGM, entrée `marketpaperclip-test-seller`; une récupération passe par la boîte du propriétaire. Aucun secret ni lien de session dans Git.

**Fiche active : [paperclip-test-d4f9db51](https://marketpaperclip.com/agents/paperclip-test-d4f9db51)**, produit `d4f9db51-312c-4660-936c-16cec15a880f`, 1 $ CA, MIT, version 1.0.0. Brouillon, transfert du ZIP et soumission effectués par les routes applicatives avec la session du compte de test; octets privés relus et SHA-256 identique à l'archive versionnée. Publication autorisée par la procédure de modération; audit `operator.test_seller.publish`. L'ancienne fiche `paperclip-test-bdbbb8c3`, détenue par le compte principal MGM, est archivée. Elle n'avait ni commande ni offre. Le compte principal est maintenant distinct du vendeur de la fiche active.

Aucun compte Stripe vendeur n'a été créé et aucun paiement n'a été exécuté. **Correction du plan précédent : un essai entre les deux comptes MGM doit passer par un environnement isolé avec Stripe Sandbox**, sans vraie carte et sans commande de test dans les statistiques de production. [Stripe interdit les tests en mode réel avec de vrais moyens de paiement](https://docs.stripe.com/testing). Les mentions historiques d'un achat de test réel à 1 $ ci-dessous ne doivent plus être suivies. La première vente réelle désigne une véritable acquisition par un client, après activation du vendeur, et non un autoachat destiné à tester l'intégration.

Nouvel essai d'activation le **5 novembre à 16 h 15 UTC**, avec la session normale du compte de test : `POST /api/connect/onboard` renvoie **503**, code **`stripe_connect_setup_required`**. `connect/status` confirme `seller: null`; aucun compte Connect relié, paiements et versements inactifs, aucun accord accepté et aucun paiement. Le blocage de la plateforme persiste avant même l'ouverture du formulaire vendeur. L'accès au navigateur de l'opérateur est indisponible dans cette session. Le [README](../README.md#reprendre-le-projet-sur-un-autre-poste) contient les identifiants publics et commandes d'association des services sur un autre poste; les clés et sessions restent dans leurs stockages sécurisés.

## Consolidation sur `main` du 4 novembre 2026

`main` devient la branche de référence pour reprendre le projet sur un autre poste. GitHub ne présentait aucune pull request ouverte lors de la revue : les travaux étaient sur trois branches. Elles sont toutes incluses dans l'historique de `main` : `feature/profils` (`fd6de45`), `feature/recette-internationale` (`b78aa91`) et `feature/marche-netlify` (`5322d0d`). Les branches sont conservées.

Les trois conflits avec l'ancienne copie de la connexion Google ont été relus et résolus en conservant la version actuelle : fournisseur Google actif, profils et contrôles du studio Stripe. L'arbre du commit de fusion est identique à celui de `feature/profils`; aucune fonctionnalité ancienne n'a remplacé les corrections récentes.

Corrections de la revue : URL canonique `https://marketpaperclip.com` par défaut dans le workflow Supabase; ses cinq tests de protection sont désormais inclus dans `npm test`. Le nouveau workflow **CI** vérifie l'installation verrouillée, TypeScript, les tests et le build Netlify sur les push et PR vers `main`, sous Node.js 24, sans secrets de production. Les actions GitHub sont fixées à leurs commits officiels. Le déploiement Supabase reste manuel et limité à `main`.

Validation locale : **115 tests réussis**, TypeScript et build Netlify réussis, une fonction applicative générée et aucune fonction planifiée. Le lint conserve exactement les **45 erreurs préexistantes** de l'ancien `main`, sans nouvelle signature d'erreur. Le contrôle Gitleaks des commits entrants ne signale que la clé de vérification IndexNow, volontairement publique et identique au fichier de preuve servi par le site; aucun identifiant privé détecté.

La production reste le déploiement propre indiqué ci-dessous; le site Netlify n'est pas relié à un dépôt Git pour les builds automatiques. Le blocage Stripe Connect et l'absence de vente réelle restent inchangés. Les instructions Git de reprise sont dans le [README](../README.md#reprendre-le-projet-sur-un-autre-poste).

## Diagnostic confirmé et production du 4 novembre 2026 au soir

Déploiement `6aebcadc3ef825bed8ff8336` (`ready`), code `1f4e1ce`, publié à 00 h 16 UTC le 5 novembre (19 h 16 HE le 4). **110 tests**, TypeScript et build réussis. Le Checkout valide le vendeur avant la création d'une commande en attente. Le studio distingue maintenant une plateforme Connect non activée, avec message FR/EN et lien Stripe réservé à l'administrateur.

**Le blocage réel est l'activation de Stripe Connect sur la plateforme**, et pas seulement une liaison manquante en base. Le contrôle serveur a authentifié le compte attendu `acct_1UXHVqCzSwrXhCYK`; Stripe a refusé la préparation du vendeur (`POST /v1/accounts`, HTTP 400 `invalid_request_error`) en indiquant qu'il faut s'inscrire à Connect. La preuve expurgée est dans `audit_log`, action `operator.seller.setup`, notamment à `2026-11-05T00:13:06.791684Z`. Aucun vendeur ni achat n'a été créé. La vérification de la veille utilisait une requête de création volontairement invalide pour sonder les permissions : elle ne prouvait pas que l'inscription Connect était terminée.

L'opération a utilisé les clés déjà stockées dans Netlify, sans les sortir du serveur. Sa fonction temporaire n'avait pas d'URL publique et était limitée à dix minutes. Elle est retirée du déploiement final : une fonction applicative, zéro planification. Le code opérateur reste sous `scripts/ops/`; un build normal ne le déploie pas. Le CLI Stripe et Projects sont installés; la demande de connexion du CLI a expiré sans autorisation. Ne pas en faire un prérequis au diagnostic déjà obtenu.

Prochaine action externe : le titulaire termine [Connect dans son tableau Stripe](https://dashboard.stripe.com/connect), compte MarketPaperClip, puis l'activation vendeur dans le studio. Ensuite seulement : vrai Checkout à 1 $ CA maximum depuis un autre compte acheteur, webhook, téléchargement et SHA-256. La publicité internationale et les validations fiscales/pays restent en attente de la recette complète. Voir [le rapport](LAUNCH-AUDIT-2026-11-04.md) et [Stripe](STRIPE.md).

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
