# Brancher Stripe (paiements réels)

Décision du propriétaire (3 novembre 2026) : produits **payants** dès le lancement, commission de **15 %** (`PLATFORM_FEE_BPS=1500`).

## Mise à jour du 5 novembre 2026

[Paperclip Test](https://marketpaperclip.com/agents/paperclip-test-d4f9db51) est publié à 1 $ CA par le compte technique **Paperclip Test — MGM**, distinct du compte principal. L'ancienne fiche MGM est archivée. Ce vendeur n'a pas encore de compte Connect relié; sa publication ne signifie pas que l'encaissement est prêt.

La recette entre les comptes MGM doit utiliser **Stripe Sandbox dans un environnement isolé**, avec une carte de test. Elle ne doit pas créer de fausse vente en production. [Stripe interdit de tester en mode réel avec de vrais moyens de paiement](https://docs.stripe.com/testing). Les anciennes instructions de paiement réel de test sont remplacées par cette règle; une véritable vente reste un achat réel par un client.

## État (3 novembre 2026, 23 h 30, heure de l'Est)

**Contrôle réel du 4 novembre 2026, 19 h 13 HE : Stripe Connect reste à activer sur la plateforme.** L'opération serveur, exécutée dans Netlify avec la clé existante, a identifié le bon compte Stripe puis tenté la préparation du vendeur MGM. Stripe a refusé `POST /v1/accounts` avec HTTP 400 `invalid_request_error`, en indiquant qu'il faut d'abord s'inscrire à Connect. La lecture des comptes et la session Checkout annulée de la veille ne validaient pas cette création réelle.

Terminer l'[activation Connect dans le compte MarketPaperClip](https://dashboard.stripe.com/connect), puis reprendre **Configurer les paiements** dans le studio MGM. Le propriétaire confirme les informations et les accords demandés par Stripe. Aucune vente à 1 $ n'a été effectuée. Le studio conserve désormais le code d'erreur et affiche une action dédiée à l'administrateur. Une tentative d'achat chez un vendeur indisponible ne crée plus de commande en attente.

Le contrôle a utilisé une fonction Netlify temporaire sans URL publique, limitée à dix minutes, sans export des clés, sans acceptation de contrat et sans coordonnées bancaires fournies par l'opérateur. Cette fonction a ensuite été retirée de la production; aucun travail récurrent n'est conservé. La connexion CLI supplémentaire n'est pas nécessaire pour lire ce diagnostic.

- **Paiements ouverts en production.** Clé **restreinte** du mode réel saisie par le propriétaire dans la boîte de dialogue masquée. Le script a vérifié toutes les permissions nécessaires, y compris une session Checkout d'essai de 1 $ CAD, aussitôt annulée.
- Compte Stripe « MarketPaperClip » `acct_1UXHVqCzSwrXhCYK` : Canada, CAD, paiements, versements et dossier validés. L'API de lecture des comptes Connect était accessible; la création effective d'un vendeur n'avait pas été validée.
- Webhook `we_1UXvmdCzSwrXhCYKTl6aYCmI` : actif, 8 événements, API `2026-10-28.endive`.
- Netlify, contexte production : `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` (secrètes), `PLATFORM_FEE_BPS=1500` et `PAYMENTS_ENABLED=true`. Les aperçus de déploiement gardent `PAYMENTS_ENABLED=false` et n'ont pas la clé.
- Déploiement de production `6aeab46fe80c6a780cba706e` (commit `3473f69`). Vérifié en ligne :
  - `/api/config` répond `"payments":true,"feeBps":1500,"launched":true` ;
  - sans session, `connect/onboard`, `connect/status`, `connect/dashboard` et `checkout` répondent 401 ; avec une origine étrangère, 403 ;
  - un webhook non signé reçoit 400 « Invalid signature » ;
  - les pages publiques répondent 200 et une fiche inconnue 404.
- Catalogue au moment de ce contrôle historique : vide. Paperclip Test a depuis été publié; voir la mise à jour du 5 novembre ci-dessus.

Pour tester les routes `POST` avec curl, envoyer `Origin: https://marketpaperclip.com`. Sans cet en-tête, la garde d'origine répond 403 avant même la vérification de session.

## Ce qu'il faut dans Stripe

### Automatisation depuis le poste

Le CLI officiel Stripe `1.55.8` et son extension Projects `0.51.0` ont été installés sur le poste le 4 novembre 2026. La commande `stripe` est disponible dans `~/.local/bin/`. Cette installation ne change pas la clé de production Netlify et ne crée aucun compte, abonnement ou service cloud.

La première connexion se fait avec `stripe login --non-interactive`. Le propriétaire autorise le poste sur la page officielle Stripe, sélectionne le compte MarketPaperClip et l'accès au mode réel; l'opérateur exécute ensuite la commande de finalisation retournée par le CLI. Les identifiants sont gérés par le CLI, sans clé copiée dans le chat. Depuis le CLI 1.50, Stripe peut aussi exiger l'activation de l'accès CLI dans *Settings → Team and security → MCP and CLI access*. [Documentation de connexion](https://docs.stripe.com/cli/login).

Après connexion, `npm run stripe:readiness` vérifie en lecture seule le compte réel attendu `acct_1UXHVqCzSwrXhCYK`, les comptes Connect existants, leurs exigences et le webhook de MarketPaperclip. Il permet de rechercher une liaison vendeur manquante avant de recréer un compte. La sortie ne contient ni clé, ni adresse, ni information bancaire. Ce contrôle ne remplace pas une vente confirmée et un téléchargement par le véritable acheteur.

[Stripe Projects](https://docs.stripe.com/projects) automatise l'association et la gestion des services d'infrastructure et de leurs accès. MarketPaperclip dispose déjà de Supabase et Netlify : aucun nouveau service n'a été provisionné. Pour les vendeurs, l'API Connect permet de préparer le compte et le formulaire; Stripe peut proposer au propriétaire de réutiliser des informations déjà vérifiées pendant l'[onboarding partagé](https://docs.stripe.com/connect/networked-onboarding). L'autorisation d'accès, les accords et les vérifications demandés par Stripe restent à confirmer par le titulaire.

### Configuration du marketplace

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

Le script ne touche pas à `PAYMENTS_ENABLED`. Ouvrir les ventes est une étape distincte, avec l'accord du propriétaire : `PAYMENTS_ENABLED=true` (et `LAUNCH_READY=true`) dans Netlify, puis redéploiement depuis `main`. `/api/config` doit alors répondre `"payments":true` et `"feeBps":1500`.

## Recette du paiement et première vente

1. Répéter le parcours dans un environnement isolé, avec clés et vendeur Stripe Sandbox : compte acheteur distinct, carte de test, Checkout, webhook, commande payée et téléchargement. Tester aussi le remboursement et la révocation du téléchargement dans ce même environnement.
2. Pour ouvrir de véritables ventes, le vendeur termine son activation réelle depuis le studio avec ses informations exactes. Les comptes vendeurs sont créés au Canada (`country: "CA"`). La publication du produit et l'activation de l'encaissement sont deux étapes distinctes.
3. Lors de la première acquisition réelle par un client, vérifier la commande confirmée par webhook et la livraison. Ne pas utiliser un autoachat entre comptes MGM pour cette validation.

## À décider

- **Taxes (TPS/TVQ)** : avec les « destination charges », MarketPaperclip encaisse la vente. Si MGM Informatique est inscrite aux fichiers de la TPS et de la TVQ, les taxes doivent être perçues : activer Stripe Tax (inscriptions à déclarer dans Stripe) puis `STRIPE_TAX_ENABLED=true`. À valider avec le comptable.
- **Conditions** : la commission de 15 % figure dans `/terms` (`components/resources.tsx`) ; changer `PLATFORM_FEE_BPS` impose de mettre ce texte à jour. L'adresse civique de l'exploitant reste à ajouter avant la vente aux consommateurs.
