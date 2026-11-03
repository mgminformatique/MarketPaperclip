# Recette avant lancement

## Vérifié pendant le développement

- Build de production et vérification TypeScript.
- Tests API avec appels Supabase/Stripe simulés et vraies routines SDK de vérification de signature Stripe.
- Exécution des migrations et des politiques RLS dans PostgreSQL embarqué PGlite, avec rôles Supabase simulés.
- Isolation des profils, brouillons, commandes, fichiers et privilèges administrateur.
- Validation des prix en centimes, calcul de commission, destination vendeur côté serveur, clé d’idempotence du Checkout.
- Rejet des événements Stripe falsifiés, déduplication transactionnelle, prix et acheteur rapprochés de la commande.
- Conservation de la version achetée après mise à jour du package, téléchargement refusé après remboursement.
- Protection de la publication contre les modifications concurrentes du fichier.

Ces tests utilisent des données de test. Aucun compte Supabase réel, paiement Stripe externe ni DNS final n’a été validé dans cette session.

## Vérifié le 2–3 novembre 2026 (marché utilisateur, hébergement Netlify)

Environnement : build de production Netlify (`netlify serve`) branché sur une pile **Supabase locale complète** (Postgres 17.11 identique à la production, Auth, REST, Storage, boîte courriel Mailpit), navigateur Chromium réel piloté par Playwright. Aucune donnée de production n'a été utilisée.

- **70 tests automatisés** (`npm test`) : API, Stripe simulé, SQL/RLS sur PGlite (dont 10 pour le marché), i18n, interactions.
- **Parcours navigateur, 40 vérifications** : inscriptions de 3 comptes avec courriel de confirmation réel (modèle personnalisé), profil, publication d'un agent (couverture + ZIP par upload direct) et d'un bundle gratuit (JSON) via l'éditeur, modérateur désigné par `MARKET_ADMIN_EMAILS`, approbation, page marché (annonces, plancher, activité), acquisition gratuite, téléchargement identique octet par octet, avis, offre de 35 $ avec message, acceptation par le vendeur, changement de prix et pause/remise en vente sans validation, refus clair si le vendeur n'a pas activé Stripe, paiement simulé par **webhook Stripe signé** (rejet d'un webhook falsifié, rejeu sans double effet), offre passée à *Payée*, statistiques et historique de prix mis à jour, bandeau d'accueil, récupération du mot de passe par courriel (lien réutilisé refusé), anglais, mobile 390 px sans débordement, **aucune erreur console**.
- **Sécurité, 37 vérifications** : un utilisateur ne peut modifier, mettre en pause, re-tarifer ni téléverser sur le produit d'un autre ; un package téléversé par un autre ne peut être rattaché ; une URL d'upload signée ne peut écraser un objet ; l'API REST publique (clé publishable) ne lit ni offres, ni événements bruts, ni commandes, ni comptes vendeurs, ni journaux, ni brouillons, ni notes de modération, et ne peut appeler aucune fonction serveur ; packages privés inaccessibles ; écritures cross-origin refusées ; JSON surdimensionné refusé ; en-têtes de sécurité et cookies HttpOnly/SameSite ; limitation des tentatives de connexion.
- Lint : aucune nouvelle erreur par rapport à l'état d'origine (45 erreurs préexistantes).

Restent à vérifier sur les services réels : livraison des courriels à des adresses hors organisation Supabase (SMTP), achat Stripe en mode TEST de bout en bout, DNS/TLS de marketpaperclip.com, comportement du CDN Netlify en production.

## Recette à exécuter sur les services configurés

### Comptes

- Inscription d’un vendeur et d’un acheteur distincts, réception du courriel de confirmation.
- Confirmation expirée et jeton réutilisé refusés; connexion après confirmation.
- Mot de passe erroné, récupération, nouveau mot de passe, déconnexion et expiration de session.
- Le profil A ne peut pas modifier le profil B; un acheteur ne peut pas ouvrir `/admin`.
- OAuth GitHub si activé, y compris annulation et callback erroné.

### Produits

- Enregistrer un brouillon, téléverser un ZIP/JSON réel, vérifier version, taille et empreinte.
- Refuser un fichier trop volumineux, un type interdit et un JSON invalide.
- Soumettre, examiner, refuser avec note, corriger et approuver.
- Vérifier le bundle dans le catalogue et son contenu réel.
- Modifier un produit publié : il doit sortir du catalogue jusqu’à nouvelle approbation.
- Vérifier la pagination avec plusieurs pages et les totaux du studio sur l’ensemble des ventes.

### Stripe TEST

- Terminer l’onboarding vendeur, puis vérifier charges et versements activés.
- Faire un achat avec l’acheteur; constater le prix, la commission et la destination corrects.
- Vérifier que le retour Checkout sans webhook ne livre aucun fichier.
- Vérifier le webhook payé, le téléchargement et la revue d’achat confirmé.
- Répéter le même webhook, vérifier l’absence de double effet.
- Annuler un Checkout, en laisser expirer un, puis recommencer.
- Vérifier qu’un second onglet ne crée pas un second achat actif.
- Rembourser depuis la modération; vérifier le transfert inversé et la révocation du téléchargement.
- Tester les événements de litige, y compris événement en retard et clôture gagnée.
- Vérifier les taxes si Stripe Tax est activé.

### Interface et exploitation

- Vérifier réellement desktop 1440 px, portable 1024 px, tablette et mobile 390 px.
- Navigation clavier, focus du dialogue, fermeture Escape, messages d’erreur et chargements.
- Vérifier les liens de profil, recherche globale, filtres combinés, favoris, pagination et retour arrière.
- Vérifier le fichier téléchargé et suivre le README sur une installation propre.
- Confirmer la configuration DNS/TLS et la réception des webhooks sur l’origine finale.
- Compléter conditions, politique de confidentialité, coordonnées, remboursement et licences commerciales.
- Vérifier sauvegardes, restauration et accès aux journaux sans secrets.

## Contrôle visuel

Le contrôle visuel a été réalisé le 3 novembre 2026 dans Chromium (1440 px et 390 px) sur le build de production : catalogue, marché, fiche produit (offre acceptée, activité), studio (offres, annonces), bibliothèque, profil créateur, accueil. Il reste à le refaire sur l'URL publique finale.
