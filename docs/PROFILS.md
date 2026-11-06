# Profils des membres — photo, couverture et modèles

Chaque inscription crée automatiquement un profil, même sans agent publié ni compte Stripe. La page personnelle **`/profile`** permet à chaque membre connecté de gérer son identité et ses créations. Le profil public reste accessible à **`/creators/<nom>`**.

## Utilisation

- **Mon profil** dans la navigation, ou un clic sur sa photo dans la barre du haut, ouvre son propre profil.
- **Photo et couverture** : modification depuis les boutons caméra du profil. Sans image, les initiales et la couverture décorative restent disponibles.
- **Modifier le profil** : nom public, identifiant, bio et site web se modifient dans une fenêtre sur place. Le lien public peut être copié depuis la page.
- **Publications** : chaque carte doit être reliée à un produit publié du propriétaire. Une note et jusqu’à quatre photos peuvent compléter ce produit; aucun texte ou photo seul ne peut être publié. La colonne de présentation contient la bio, les produits en vente et leurs photos.
- **Créer un modèle**, ou le bouton **Modèle** du formulaire de publication, ouvre l'éditeur directement sur le profil : description, couverture du produit, fichier ZIP/JSON, prérequis, installation, prix et licence. Les modèles du marketplace restent des agents ou bundles; cette évolution ne change pas les formats de fichiers acceptés.
- **Enregistrer** conserve le brouillon et laisse l'éditeur ouvert. **Soumettre à la validation** ferme l'éditeur et affiche son statut dans **Mes modèles**, sans passage par le studio. Une confirmation protège les modifications non enregistrées à la fermeture.
- **Mes modèles** présente au propriétaire ses brouillons, validations, corrections, archives et modèles publiés, avec pagination. Le bouton **Partager sur mon profil** d'un modèle publié le joint au formulaire de publication.
- Pour un visiteur, l'onglet **Modèles** affiche uniquement les créations publiées. Aucun brouillon ni commande d'édition n'est rendu. Les photos des publications sont réunies dans l'onglet **Photos**.

Le studio reste accessible pour les ventes, les offres et les paiements. La publication d'un modèle payant ne remplace pas l'activation du vendeur Stripe.

## Données et accès

L'évolution réutilise la migration **008**, déjà appliquée en production. **Aucune nouvelle migration ni modification des droits n'est nécessaire.** Le profil personnel est exclu de l'indexation; les profils publics conservent leur rendu serveur et leurs métadonnées de partage.

Les navigateurs ne peuvent que lire les publications. Toute écriture passe par les routes authentifiées : identité du membre, possession du produit et droits de modération sont vérifiés côté serveur. Les brouillons viennent de l'API privée du studio, uniquement pour le propriétaire du profil.

Les images JPG, PNG et WebP sont reconnues par leur signature, limitées à 3 Mo, redimensionnées et réencodées côté client. Le serveur retire aussi les métadonnées EXIF, XMP et IPTC des JPEG. Les SVG sont refusés. Les médias sont rangés sous l'identifiant de leur propriétaire dans `profile-media`; une publication ne peut joindre que les médias et modèles publiés de son auteur.

Une photo de profil ou couverture remplacée est effacée du stockage. La suppression d'une publication retire aussi ses photos; les photos retirées du formulaire avant sa publication peuvent rester sans être affichées. Les limites existantes restent de 40 images et 20 publications par heure et par membre. La suppression par un modérateur est consignée dans `audit_log`.

## Publications liées aux produits — 6 novembre 2026

Le choix d’un produit publié est obligatoire dans le formulaire et dans `POST /api/posts`. Le contrôle ne dépend pas du genre de produit : il réutilise le catalogue du vendeur. Une note et les photos du produit sont facultatives. L’éditeur de modèle reste accessible depuis le profil, puis le modèle publié peut être partagé dans ce fil.

Le profil et le Feed utilisent **le même composant `MarketModelCard`** : couverture, description complète, prix actuel, moteur, tags, composition, version, licence, prérequis/installation, créateur et accès à la fiche. Les commandes comprennent favoris, copie du lien, offre lorsque le montant et l’utilisateur le permettent, et achat direct par Stripe Checkout après acceptation de la licence. Un produit gratuit utilise les acquisitions; le propriétaire voit Votre création. Ces commandes respectent les prix masqués et les copies du carrousel ne peuvent pas déclencher d’achat. Les cartes du profil restent dans un fil vertical et s’adaptent à la largeur de leur colonne.

Les lectures publiques joignent uniquement un produit encore publié appartenant à l’auteur, avant pagination, puis limitent explicitement les champs publics. Les anciennes publications sans produit et celles d’un produit non publié ne sont plus rendues. Aucune ligne historique n’est supprimée automatiquement et aucune migration n’est nécessaire. Les photos du profil comprennent les couvertures des produits présentés et leurs photos complémentaires.

Les tests d’API couvrent le produit obligatoire, la possession et la publication, la pagination, les anciens messages non liés, les produits privés/étrangers et les champs de package exclus. Les parcours du client compilé contrôlent les cartes propriétaire/visiteur, les favoris, les offres, la copie du lien, l’achat direct et le refus des publications sans produit, avec réponses isolées et aucun paiement réel.

## Vérifications du 5 novembre 2026

TypeScript et **116 tests** couvrent notamment les droits, les images et métadonnées, les publications, l'accès au profil avant toute vente et l'exclusion de `/profile` de l'indexation.

Les contrôles du client compilé utilisent JSDOM et des réponses locales, sans écriture distante : propriétaire en français et anglais (photo, couverture, détails, partage d'un modèle, publication, brouillon, fichier, soumission, bouton global et fermeture sans enregistrer), visiteur sans brouillons ni commandes d'édition, accès anonyme avec invitation à se connecter. Exemple après lancement du serveur de production local :

```sh
printf '%s' '{"origin":"http://127.0.0.1:8893","locale":"fr","profileFixture":"owner"}' | node --experimental-vm-modules scripts/check-client-interactions.mjs
```

`profileFixture` accepte `owner`, `visitor` ou `anonymous`. Pour la fixture visiteur locale, le profil de démonstration `mgm-labs` sert de page initiale. Ces contrôles ne constituent pas une vérification visuelle desktop/mobile : l'accès au navigateur de l'opérateur était indisponible pendant la session.


## Exemple réel sur le compte de test — 5 novembre 2026

[Profil Pilot — Agent test](https://marketpaperclip.com/agents/profil-pilot-agent-test-cc94c20d?lang=fr) est un modèle gratuit MIT, avec un vrai bundle d'instructions FR/EN, créé via le compte Paperclip Test. Sa carte illustrée est partagée dans [le profil public du compte de test](https://marketpaperclip.com/creators/paperclip-test?lang=fr), dans Publications et Modèles. Aucun achat ni paiement n'a été exécuté. Le package et ses limites sont dans `packages/profil-pilot-test/`; l'environnement de modèle n'est pas inclus et son exécution n'a pas été validée ici. Cet exemple est une donnée de démonstration explicitement demandée, sans changement du fonctionnement des profils des autres utilisateurs.
