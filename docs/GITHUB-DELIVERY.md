# Livraison depuis le GitHub du vendeur

Supabase conserve les comptes, fiches, achats, licences, empreintes et références. Les ZIP/JSON sont des fichiers joints aux GitHub Releases publiques ou privées des vendeurs. Les acheteurs utilisent MarketPaperclip sans invitation ni compte GitHub. Le connecteur est livré derrière `GITHUB_DELIVERY_ENABLED=false`, indépendamment de `GITHUB_AUTH_ENABLED` (connexion Supabase). Les anciennes livraisons Supabase restent utilisables.

## Mise en service

1. Appliquer `009_github_delivery.sql` après les migrations 001–008, **avant de déployer le nouveau serveur**. Le workflow manuel Deploy Supabase applique les migrations en attente sur `main`; l’installateur SQL complet inclut aussi la migration 009.
2. Créer une [GitHub App](https://github.com/settings/apps/new) installable par les vendeurs. Demander seulement **Contents: Read-only** et **Metadata: Read-only**. Aucune permission d’écriture du contenu.
3. Définir **Callback URL** et **Setup URL** sur `https://marketpaperclip.com/api/github/callback`. Laisser **Request user authorization (OAuth) during installation** désactivé et activer **Redirect on update**. Le callback de configuration démarre ensuite OAuth pour vérifier les droits du vendeur. Le serveur accepte aussi le callback combiné code + installation des Apps utilisant OAuth pendant l’installation.
4. Définir le webhook sur `https://marketpaperclip.com/api/webhooks/github`, avec un secret aléatoire. Souscrire à **Installation**, **Installation repositories**, **Repository** et **Release**, selon les événements proposés par GitHub. Un retrait de fichier sans événement exploitable sera détecté avant l’achat ou au téléchargement.
5. Ajouter les variables ci-dessous dans l’environnement serveur Netlify, puis déployer. Utiliser les champs secrets de l’hébergeur, jamais le chat, Git ou des variables `NEXT_PUBLIC_`.
6. Effectuer la recette privée ci-dessous avant d’ouvrir la fonctionnalité aux vendeurs. Les achats respectent toujours les interrupteurs de lancement et de paiement existants.

| Variable | Valeur attendue |
| --- | --- |
| `GITHUB_DELIVERY_ENABLED` | `true` pour activer le connecteur |
| `GITHUB_APP_ID` | Identifiant numérique de l’application |
| `GITHUB_APP_SLUG` | Nom dans `github.com/apps/<slug>` |
| `GITHUB_APP_CLIENT_ID` | Client ID OAuth de cette GitHub App |
| `GITHUB_APP_CLIENT_SECRET` | Secret OAuth, serveur seulement |
| `GITHUB_APP_PRIVATE_KEY` | Clé PEM **PKCS#8**, retours à la ligne réels ou `\n` |
| `GITHUB_APP_WEBHOOK_SECRET` | Secret correspondant au webhook GitHub |

Convertir localement la clé PKCS#1 fournie par GitHub en PKCS#8 : `openssl pkcs8 -topk8 -nocrypt -in github-app.pem -out github-app-pkcs8.pem`. Ne pas versionner ces fichiers. `SITE_URL` et les éventuels `SITE_ALIASES` doivent désigner le déploiement courant. En recette, utiliser une App de test, ses URLs propres et Stripe Sandbox. `npm run preflight` vérifie la présence des variables sans révéler leurs valeurs.

## Publication et livraison

Dans « Ce que l’acheteur reçoit », le vendeur choisit GitHub Release, connecte ses dépôts, puis sélectionne dépôt → Release → archive. Seuls les dépôts qu’il administre sont liés à son profil. Une installation d’organisation ne lui donne pas accès à tous ses dépôts. Après un changement de sélection, « Gérer les dépôts GitHub » renouvelle les références autorisées.

Le fichier doit être publié, inférieur à 2 Gio et accompagné du `digest` SHA-256 GitHub. Republier une ancienne archive sans empreinte. Le tag est résolu en commit exact. Préférer les Releases immuables et un dépôt de distribution contenant uniquement le produit livré.

Les jetons d’installation sont créés à la demande avec la lecture du contenu de **ce seul dépôt**. Les jetons OAuth vivent uniquement pendant le callback. Aucun jeton n’est enregistré dans Supabase ou transmis au navigateur.

Chaque commande conserve fournisseur, installation, dépôt, Release, fichier, tag, commit, nom, taille et SHA-256. PostgreSQL refuse une commande basée sur un fichier remplacé pendant l’achat et interdit de modifier sa référence après création. La version suivante d’un produit ne modifie pas les achats précédents.

Le bouton Télécharger obtient une URL du marketplace. Son ouverture vérifie à nouveau session, acheteur, statut `paid` et métadonnées exactes GitHub. Un remboursement ou litige bloque les prochains téléchargements. La modération utilise le même connecteur avec son contrôle administrateur.

Pour une réponse GitHub 302, seuls les hôtes HTTPS de fichiers GitHub autorisés sont acceptés; la redirection ne contient aucun jeton d’application. Pour une réponse 200, le serveur transmet le flux avec un nom de pièce jointe, sans copie permanente ni chargement complet du ZIP en mémoire. Aucun délai fixe n’est promis pour les liens de fichiers de Release. Le flux 200 consomme la bande passante de l’hébergeur et reste soumis à ses limites : commencer la recette avec de petits packages.

## Disponibilité

Les webhooks signés suspendent les sources concernées par désinstallation, suspension, retrait de dépôt ou suppression de Release. Achat, soumission, approbation et reprise vérifient aussi la source. Un fichier changé ou définitivement introuvable suspend cette version. Une panne réseau, un quota GitHub ou une erreur de configuration bloque l’action sans dépublier une source saine. Un échec sur une ancienne commande ne suspend pas une nouvelle version du produit.

Après restauration du fichier exact et de l’installation, le vendeur peut reprendre l’annonce vérifiée. Une nouvelle archive nécessite un brouillon et une nouvelle modération. Sans copie dans le marketplace, MarketPaperclip ne peut pas restaurer une archive supprimée; l’acheteur contacte l’assistance depuis sa commande.

Les états OAuth expirent après dix minutes et se consomment une seule fois. Supprimer régulièrement les lignes expirées de `github_oauth_states`; elles ne contiennent que des empreintes et des références internes.

## Recette privée avant activation

Les tests automatisés utilisent GitHub simulé et PostgreSQL PGlite. Ils ne remplacent pas la recette sur un vrai dépôt privé avec une App configurée.

| Vérification | Résultat attendu |
| --- | --- |
| Connexion vendeur à un dépôt privé | Seul un dépôt administré apparaît |
| Archive v1.2.0, modération et achat | Commande liée à cette archive et ce SHA-256 |
| Acheteur payé sans compte GitHub | Archive attendue et empreinte locale identique |
| Autre utilisateur ou absence d’achat | Refus avant récupération du fichier |
| Commande remboursée ou en litige | Téléchargement refusé |
| Publication d’une version 2 | L’ancienne commande livre encore la version 1.2 |
| GitHub répond 302 | Redirection vers le fichier, aucun jeton dans le navigateur |
| GitHub répond 200 | Flux de fichier sans archive créée dans le stockage du marketplace |
| Retrait du fichier ou de l’installation | Nouvelle vente refusée, version suspendue, assistance accessible |
| Modification des dépôts autorisés | OAuth renouvelé, aucun accès à un dépôt tiers |
| Inspection par un modérateur | Même fichier et même empreinte que la version validée |

Exécuter `npm run check` et `npm run build:netlify`. Les tests du connecteur font partie de `npm test`.

Vérification du 5 novembre 2026 : TypeScript, 133 tests et build Netlify réussis. Le client compilé a été vérifié dans Chromium sur ordinateur et mobile avec des réponses API simulées : retour de connexion avec brouillon conservé, sélection dépôt/Release/archive, version reprise du tag et enregistrement des identifiants exacts. La recette avec une vraie GitHub App et un dépôt privé reste à effectuer; les variables de cette App étaient absentes de Netlify lors du contrôle.

Références officielles : [sécurité du callback](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url), [droits sur les dépôts](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token), [jetons d’installation limités](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), [téléchargement des fichiers](https://docs.github.com/en/rest/releases/assets#get-a-release-asset).
