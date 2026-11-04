# Brancher Stripe (paiements réels)

Décision du propriétaire (3 novembre 2026) : produits **payants** dès le lancement, commission de **15 %** (`PLATFORM_FEE_BPS=1500`).

## Ce qu'il faut dans Stripe

1. Compte Stripe activé en mode réel (identité de l'entreprise et compte bancaire validés) : *Paiements acceptés : oui* dans le résumé du script ci-dessous.
2. **Connect** activé, avec le profil de plateforme complété (*Connect → Démarrer*). Chaque vendeur, y compris MGM Informatique pour ses propres produits, ouvre ensuite son compte Express depuis le studio du site (vérification d'identité par Stripe).
3. Une clé du mode réel : la clé secrète standard (*Développeurs → Clés API → Clé secrète*) ou une **clé restreinte** (`rk_live_…`, choix du propriétaire le 3 novembre 2026). La clé publiable (`pk_…`) ne sert pas : le paiement passe par une redirection serveur vers Stripe Checkout. Permissions qu'une clé restreinte doit avoir (le script les vérifie et nomme celles qui manquent) : comptes Connect (*Accounts*) en écriture, liens d'activation et de connexion vendeur en écriture, *Checkout Sessions* en écriture, *Refunds* en écriture, *PaymentIntents* et *Charges* en lecture, *Webhook Endpoints* en écriture (pour la configuration).

## Saisir la clé sans qu'elle circule

```sh
node scripts/stripe-configure.mjs --site <SITE_ID> --fee-bps 1500           # vérification seulement
node scripts/stripe-configure.mjs --site <SITE_ID> --fee-bps 1500 --apply   # configuration
```

La clé se tape dans une invite masquée (jamais dans un chat, un commit, un journal ou l'historique du shell ; `STRIPE_SECRET_KEY` dans l'environnement est aussi accepté). Le script affiche le compte Stripe ouvert par la clé (nom, pays, mode réel ou test, paiements et versements actifs, accès Connect), demande confirmation, puis :

- crée le webhook `https://marketpaperclip.com/api/webhooks/stripe`, à la version d'API du SDK installé (`stripe` 23.1.0 : `2026-10-28.endive`), pour les événements `account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created` et `charge.dispute.closed`. Un ancien webhook à la même adresse est désactivé (Stripe ne remontre jamais un secret de signature) ;
- enregistre dans Netlify `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` (variables secrètes, contexte production seulement : les aperçus de déploiement n'ont jamais la clé réelle) et `PLATFORM_FEE_BPS`.

`--report <fichier>` écrit le même résumé, sans aucun secret.

L'état des comptes vendeurs est relu chez Stripe au retour de l'activation et avant chaque paiement (`connect/status`, checkout) : aucun second webhook « Connect » n'est nécessaire.

## Ouvrir les paiements

Le script ne touche pas à `PAYMENTS_ENABLED`. Ouvrir les ventes est une étape distincte, avec l'accord du propriétaire : `PAYMENTS_ENABLED=true` (et `LAUNCH_READY=true`) dans Netlify, puis redéploiement depuis `feature/profils`. `/api/config` doit alors répondre `"payments":true` et `"feeBps":1500`.

## Premier achat réel

1. Le vendeur active son compte Stripe depuis le studio, puis publie sa fiche (validation par un modérateur).
2. Achat avec une vraie carte depuis un autre compte : Stripe Checkout, retour sur le site, commande *Payée* (webhook), téléchargement.
3. Remboursement depuis la modération : transfert et commission inversés, téléchargement retiré.

## À décider

- **Taxes (TPS/TVQ)** : avec les « destination charges », MarketPaperclip encaisse la vente. Si MGM Informatique est inscrite aux fichiers de la TPS et de la TVQ, les taxes doivent être perçues : activer Stripe Tax (inscriptions à déclarer dans Stripe) puis `STRIPE_TAX_ENABLED=true`. À valider avec le comptable.
- **Conditions** : la commission de 15 % figure dans `/terms` (`components/resources.tsx`) ; changer `PLATFORM_FEE_BPS` impose de mettre ce texte à jour. L'adresse civique de l'exploitant reste à ajouter avant la vente aux consommateurs.
