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

## Limite du contrôle visuel

Le navigateur de vérification n’a pas démarré dans l’environnement de développement (erreur d’infrastructure sur un chemin système en lecture seule). Aucun navigateur alternatif ni contournement n’a été utilisé. La recette visuelle et interactive reste donc à effectuer sur l’URL déployée.
