# Exploitation

## Journaux et secrets

Les erreurs serveur journalisent la route et la classe d’erreur; les webhooks échoués journalisent l’identifiant et le type d’événement. Aucun corps de requête, mot de passe, clé ou cookie n’est volontairement journalisé.

Les clés service Supabase et Stripe sont réservées au Worker. Les cookies d’authentification sont HttpOnly, Secure en HTTPS et SameSite=Lax. Les mutations du navigateur exigent une origine identique. Les clés et cookies ne sont pas stockés dans localStorage.

## Commandes

Les commandes ont un état explicite. `paid` est le seul état autorisant un téléchargement. Les remboursements partiels et litiges sont suspendus en attendant leur résolution. La réconciliation des événements financiers est ordonnée; un événement de paiement en retard ne réactive pas un achat remboursé.

Le vendeur peut recevoir les fonds via Stripe Connect selon le calendrier et l’état de son compte. Le marketplace ne retient pas les fonds dans un séquestre. Les remboursements peuvent affecter le solde de la plateforme; surveiller le tableau Stripe et les responsabilités configurées.

## Webhooks en échec

1. Vérifier la livraison dans Stripe et les journaux de l’endpoint.
2. Vérifier l’environnement TEST/LIVE et le secret de signature.
3. Vérifier les migrations et la correspondance commande/session/montant/devise/acheteur.
4. Corriger la cause, puis relivrer l’événement depuis Stripe.
5. Vérifier `stripe_events` et `audit_log`. La procédure transactionnelle annule l’écriture de l’événement si son traitement échoue, ce qui permet sa relivraison.

Ne modifiez pas une commande en `paid` à partir d’un simple retour navigateur ou d’un message d’un utilisateur.

## Fichiers

Chaque upload reçoit un nouveau chemin aléatoire. La commande conserve le chemin et l’empreinte de la version achetée. Ne supprimez jamais un objet référencé par une commande active ou nécessaire à une obligation de conservation.

Un arrêt entre upload et enregistrement SQL peut laisser un objet orphelin. Une maintenance peut rapprocher les objets du bucket des références `product_files` et `orders`; ne supprimer qu’après vérification et délai de rétention décidé par l’exploitant. Aucun job destructif n’est installé.

L’inspection est humaine : ouvrir les archives en environnement isolé, sans exécuter leur contenu. Vérifier README, LICENSE, permissions, absence de secrets et cohérence du package avant approbation. Un antivirus automatique peut être ajouté ensuite; il n’est pas prétendu actif.

## Administration

Les administrateurs sont attribués uniquement via la table `market_admins` avec les droits base de données nécessaires. Garder un nombre limité de comptes et protéger leurs comptes Supabase/Stripe/Cloudflare par les mécanismes MFA des fournisseurs.

Les demandes d’assistance sont enregistrées dans la file de modération. Cette version n’envoie pas automatiquement de courriel aux vendeurs ou acheteurs. La liste des commandes administrateur présente les 100 plus récentes; Stripe conserve son historique complet.

## Sauvegarde et retour arrière

Sauvegarder les données Supabase et le bucket selon les options du projet. Les sauvegardes de la base ne remplacent pas celles des objets. Tester une restauration avant l’exploitation. Conserver le commit et la version de chaque déploiement.

Un rollback applicatif ne doit pas annuler les écritures de commandes déjà traitées. Les migrations sont versionnées; préparer des migrations correctives plutôt que supprimer les tables.
