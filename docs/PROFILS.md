# Profils publics — bannière, photo et publications

Demande du propriétaire (3 novembre 2026) : « une section profil comme Facebook, bannière, photos, avec des posts de nos agents ou bundles d’agents à vendre ».

La page `/creators/<nom>` existante devient un profil social, dans le style déjà en place (mêmes panneaux, couleurs, boutons et onglets ; nouvelles règles `mk-` dans `app/market.css`, aucune règle existante modifiée) :

- **Bannière** : photo choisie par le créateur ; sans photo, la bannière décorative d’origine reste affichée.
- **Photo de profil** : remplace les initiales partout où l’avatar apparaît (profil, barre du haut, cartes d’agents, page produit, page Créateurs, paramètres).
- **Onglets** : *Publications*, *Agents et bundles* (la grille d’origine), *Photos*. Un créateur sans publication s’ouvre sur ses agents pour les visiteurs.
- **Publications** : texte (2 000 caractères), jusqu’à 4 photos et, au choix, un de ses agents ou bundles publiés, présenté en carte avec son prix et un lien vers la fiche. Colonne « À vendre » et aperçu des photos à côté du fil.
- **Modération** : l’auteur supprime ses publications ; un modérateur (`MARKET_ADMIN_EMAILS`) peut supprimer celles des autres, ce qui est consigné dans `audit_log` (`post.removed`).

Le contenu des publications est rendu côté serveur (référencement, aperçus de liens) ; la bannière (ou la photo) sert d’image de partage du profil.

## Sécurité et vie privée

- Les navigateurs ne peuvent que lire : ni écriture directe dans `posts`, ni modification de `avatar_url` / `banner_url` (droits SQL, testés dans `tests/database.test.mjs`).
- Images reconnues par leur signature (JPG, PNG, WebP ; SVG refusé), 3 Mo maximum, rangées dans le compartiment public `profile-media` sous `<id du membre>/avatar|banner|posts/`.
- Les photos sont redimensionnées et réencodées dans le navigateur avant l’envoi (moins lourdes depuis un cellulaire). Le serveur retire en plus les métadonnées EXIF, XMP et IPTC des JPEG : la position GPS et l’appareil photo ne sont jamais publiés.
- Une publication ne peut joindre que les photos téléversées par son auteur et qu’un de ses propres agents publiés.
- Une photo de profil ou une bannière remplacée ou retirée, et les photos d’une publication supprimée, sont effacées du stockage. (Une photo ajoutée au formulaire puis retirée avant de publier reste dans le stockage, sans être affichée nulle part.)
- Limites : 40 images et 20 publications par heure et par membre, en plus de la limite générale.

## Mise en production

**État au 3 novembre 2026 : en ligne**, avec l’accord du propriétaire. Migration 008 appliquée à la base de production (`ltommtumsvvqxdknpkfd`), puis déploiement Netlify de production `6aea2b28d4db1f119a9fe111` depuis la branche `feature/profils` (615c511). Vérifié en production : pages et API (catalogue, créateurs, publications refusées sans connexion), compartiment `profile-media`, nouveaux styles servis, démarrage de l’interface en français et en anglais (`node --experimental-vm-modules scripts/check-client-interactions.mjs`). La connexion Google en cours dans une autre session n’est pas incluse dans ce déploiement : fusionner `feature/profils` avant tout prochain déploiement depuis une autre branche, sinon les profils disparaîtraient du site.

L’ordre compte : la migration d’abord, puis le code (le catalogue lit `avatar_url`).

```sh
supabase db push --linked --project-ref ltommtumsvvqxdknpkfd --dry-run   # doit lister 008 seulement
supabase db push --linked --project-ref ltommtumsvvqxdknpkfd
netlify deploy --build --site <SITE_ID>          # aperçu
netlify deploy --build --site <SITE_ID> --prod   # production
```

`008_profile_posts.sql` est additive : la version actuellement en ligne continue de fonctionner avec elle.

## Vérifié le 3 novembre 2026

- `npm test` : 93 tests (dont 7 pour les profils et 1 SQL/RLS).
- Parcours navigateur réel (Chromium) sur le build Netlify local branché à une pile Supabase locale, 47 vérifications : visiteur, propriétaire, autre membre, modérateur, mobile 390 px sans défilement horizontal, anglais, rendu serveur, nettoyage du stockage, photo de 4000 px avec GPS → 2000 px sans métadonnées. Aucune erreur dans la console.
