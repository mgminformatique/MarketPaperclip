# Pseudos, notifications et messagerie

Tous les membres ont un **@pseudo unique**, fondé sur `profiles.username` : aucun produit ni compte vendeur requis. Le pseudo se modifie depuis le profil ou les paramètres. La recherche du haut suggère les membres pour une recherche ordinaire; une recherche commençant par `@` ouvre `/people`. Les profils publics proposent **Envoyer un message**.

Sur téléphone, les cartes Membres occupent une colonne, les noms et @pseudos longs reviennent à la ligne et le bouton de recherche passe sous le champ. La barre du haut conserve ses accès avec un bouton Publier compact et nommé pour les lecteurs d'écran. Le menu latéral et les suggestions de recherche défilent dans leur propre zone.

`/messages` propose des échanges privés à deux : historique paginé, texte multiligne (Entrée pour envoyer, Maj + Entrée pour sauter une ligne), photos JPG/PNG/WebP de 3 Mo, emojis, réponses citées, réactions, modification et suppression de ses messages, indicateur de saisie, états envoyé/lu, compteurs non lus et blocage dans les deux sens. L'actualisation des échanges ouverts est de trois secondes lorsque l'onglet est visible; les compteurs sont actualisés toutes les douze secondes. Il n'y a pas d'appel audio/vidéo, de groupe, de notification système push ni de chiffrement de bout en bout.

Les photos utilisent un bucket **privé** `chat-images`, sans politique publique, et des liens signés de dix minutes après contrôle du participant. Les signatures de fichiers sont contrôlées et les métadonnées JPEG retirées. La suppression d'un message retire son contenu visible et ses réactions; l'objet de stockage historique est conservé et un ancien lien signé expire à son échéance. Une photo transférée puis abandonnée peut rester dans le stockage. Les messages sont consultables uniquement par les deux membres via RLS. Les écritures passent par l'API authentifiée avec protection d'origine, quotas et procédures transactionnelles. Un UUID par envoi permet de réessayer sans créer un doublon. Le blocage interdit les nouveaux messages et réactions; il conserve l'historique.

`/notifications` et la cloche affichent ventes payées confirmées, achats, acquisitions gratuites, offres reçues/acceptées/refusées, remboursements et litiges. Les alertes de commande viennent d'un trigger transactionnel lors du changement d'état confirmé par le webhook existant; aucun filtre de genre de produit ni faux événement sur un checkout commencé. Une contrainte unique déduplique par membre, événement et commande/offre. Les alertes sont privées, paginées, et peuvent être marquées comme lues. Aucun historique antérieur n'est transformé en nouvelles alertes.

## Migration et exploitation

- **009_catalog_audit.sql** : copie du SQL déjà présent dans le registre de production, rétablie pour conserver une suite de migrations cohérente. Aucun changement de cette fonctionnalité.
- **010_social_messaging.sql** : tables, index, RLS, bucket, fonctions serveur et triggers de notification. Migration additive, sans modification des profils existants, des packages ni du calcul des paiements.
- Préserver les notifications et les échanges lors d'un retour à un ancien build : ils peuvent rester en base sans effet sur les anciennes pages.

Les tests PGlite couvrent notamment les droits d'un tiers, les acteurs falsifiés, le blocage, les accusés de lecture, les réponses entre conversations et les doublons de webhook. Les tests HTTP couvrent Auth, CSRF, les signatures privées, les images et les champs publics. Les fixtures du client compilé couvrent FR/EN et n'envoient aucune donnée à de vrais membres ni aucun paiement.

Après un build et le démarrage du serveur local, exemple de vérification :

```sh
printf '%s' '{"origin":"http://127.0.0.1:8894","locale":"fr","socialFixture":"messages"}' | node --experimental-vm-modules scripts/check-client-interactions.mjs
```

Autres fixtures : `notifications`, `people`, `anonymous`. Le navigateur visuel était indisponible pendant l'implémentation : ces contrôles ne remplacent pas une validation visuelle ordinateur/mobile ni une vente Stripe réelle. Le blocage Connect déjà documenté reste distinct de cette livraison.
