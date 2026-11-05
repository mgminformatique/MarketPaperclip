# Recette de vente et lancement international

Le site est accessible et l'agent **Paperclip Test 1.0.0** est publié à **1 $ CA**. La vente réelle reste à effectuer : Stripe a refusé la création du vendeur MGM parce que **Connect n'est pas encore activé sur le compte de la plateforme**. Le lancement publicitaire payant reste en attente de cette vente et des vérifications propres aux pays ciblés.

**Mise à jour du 5 novembre :** publication déplacée vers le compte confirmé **Paperclip Test — MGM**, distinct du compte principal et sans rôle administrateur. Nouvelle fiche ci-dessous; l'ancienne est archivée. L'essai entre ces deux comptes doit utiliser un environnement isolé et Stripe Sandbox : [les tests avec une vraie carte en mode réel sont interdits par Stripe](https://docs.stripe.com/testing). Aucune vente réelle n'a été exécutée.

## Vérification complémentaire et dernier déploiement

Le 4 novembre 2026 à 19 h 13 HE (5 novembre à 00 h 13 UTC), un contrôle exécuté dans Netlify avec les accès serveur existants a vérifié le compte Stripe attendu et demandé la préparation du vendeur MGM. Stripe a répondu HTTP 400 `invalid_request_error` à `POST /v1/accounts`, avec le motif « inscription à Connect requise ». Aucun compte vendeur n'a été créé et aucun paiement n'a été exécuté.

Dernier déploiement : `6aebcadc3ef825bed8ff8336`, code `1f4e1ce`, publié le 5 novembre 2026 à 00 h 16 UTC, état `ready`. Une seule fonction applicative est déployée et aucune planification ne reste active. La fonction temporaire du contrôle refusait les appels par URL publique (HTTP 403) et a été retirée après le diagnostic.

- TypeScript, **110 tests** et build Netlify réussis.
- Le Checkout vérifie le vendeur avant d'enregistrer une nouvelle commande en attente.
- Le studio affiche le motif de configuration Connect et propose le lien Stripe à l'administrateur; l'API n'expose pas les détails bruts du fournisseur.
- Le contrôle du studio compilé en FR/EN utilise un propriétaire et une réponse d'erreur simulés uniquement dans le DOM local, sans connexion réelle ni écriture distante. La recette interactive d'une session propriétaire reste distincte.

L'action qui bloque la suite est l'[activation Connect dans Stripe](https://dashboard.stripe.com/connect), sur le compte **MarketPaperClip**, puis la configuration du vendeur dans le studio. Les clés et le webhook de la veille restent configurés. L'autorisation supplémentaire du CLI n'est pas nécessaire pour ce diagnostic réalisé depuis Netlify.

## État vérifié le 4 novembre 2026

| Point | Résultat |
| --- | --- |
| Production | Netlify, site `4911687f-987b-4363-9982-50078b56f9ef`; source de départ `e1c9cfe`, branche de travail `feature/recette-internationale` |
| Corrections déployées | Commit `d665d38`, déploiement `6aebb6a3a93714f201f59d7b`, état `ready`, 4 novembre 2026 à 22 h 50 UTC; une fonction serveur |
| Comptes | Supabase actif; compte MGM confirmé, identité Google reliée; Google et courriel activés |
| Connexion | Redirection du site vers Supabase puis Google vérifiée; contrôles du module client compilé FR/EN réussis. Une authentification interactive complète n'a pas été effectuée dans cette session |
| Domaine | DNS public A `75.2.60.5`, www vers Netlify, HTTPS et redirection www fonctionnels depuis le poste. Le propriétaire a signalé un problème d'accès au domaine puis confirmé que l'adresse Netlify s'affiche. La cause côté appareil/réseau reste à identifier |
| Contrôles publics | 50 contrôles réussis : pages FR/EN, fiche, en-têtes, pages privées non indexables, vraie 404, commandes refusées sans session, webhook non signé refusé |
| Tests applicatifs | TypeScript et 103 tests réussis; build Netlify réussi |
| Dépendances de production | `npm audit --omit=dev` : aucune vulnérabilité connue signalée |
| Paiements | Portes de lancement ouvertes et commission configurée à 15 %. Ces indicateurs ne prouvent pas une transaction |
| Vendeurs | Aucun compte Connect relié lors du contrôle initial |
| Commandes et événements Stripe | Aucun lors du contrôle initial; aucune commande n'a été marquée payée artificiellement |
| Interface | Contrôles de connexion sur le client compilé exécutés en DOM. Le service d'accès au navigateur était indisponible : la recette visuelle desktop/mobile reste à faire |

## Agent publié

[Paperclip Test](https://marketpaperclip.com/agents/paperclip-test-d4f9db51) — [adresse Netlify de secours](https://marketpaperclip.netlify.app/agents/paperclip-test-d4f9db51). Vendeur : [Paperclip Test — MGM](https://marketpaperclip.com/creators/paperclip-test). Ancienne fiche `paperclip-test-bdbbb8c3` archivée le 5 novembre.

Agent minimal de test du chargement d'instructions, avec AGENTS.md, manifeste descriptif, guides anglais/français, exemples et licence MIT. Installation manuelle dans un dossier d'instructions Paperclip. Le package ne contient aucun exécutable, dépendance ou secret. Le runtime, les appels au modèle et une automatisation métier de production ne sont pas inclus.

- Archive versionnée : `packages/releases/paperclip-test-1.0.0.zip`, 5 550 octets, six fichiers.
- SHA-256 : `4e5bda2a5a71dad7a3363e8f07ac6a2b60f54100ac76f097613ee49a1bd54b4a`.
- Sources reproductibles : `packages/paperclip-test/` et `packages/paperclip-test.listing.json`.
- Dépôt privé et lecture des octets stockés vérifiés, version figée et publication approuvée par la procédure transactionnelle de modération.
- Republication du 5 novembre autorisée par le propriétaire : session réelle du compte technique, routes de brouillon, transfert et soumission vérifiées, puis procédure de modération. Elle ne constitue pas une recette du formulaire dans le navigateur.
- L'exécution du modèle dans une installation Paperclip et le téléchargement par un acheteur après paiement restent à vérifier.

## Corrections pour les visiteurs internationaux

Les prix ordinaires et les statistiques affichent désormais explicitement **CAD**, y compris en anglais. La langue choisie suit le visiteur dans Stripe Checkout et dans les URL de retour. Les prix Stripe sont explicitement hors taxes, conformément au rapprochement en base `total = prix + taxes`; ils ne dépendent plus du réglage implicite du tableau Stripe. Le contrôle de configuration reconnaît aussi les clés restreintes `rk_live_` comme des clés du mode réel.

Ces corrections n'activent pas Stripe Tax, ne créent aucune inscription fiscale et n'élargissent pas les pays des vendeurs.

## Terminer la recette puis ouvrir les ventes

1. Préparer un environnement isolé avec Stripe Sandbox et une base de test. Ne pas remplacer les clés de production par des clés de test sur le site public.
2. Avec deux comptes distincts dans cet environnement, ouvrir la fiche, accepter la licence et payer avec une carte de test Stripe. Vérifier le prix de 100 cents CAD et la commission de 15 cents.
3. Vérifier la confirmation par webhook, le transfert de test, le téléchargement et le SHA-256. Un autre compte ne doit pas obtenir le lien; le retour navigateur seul ne doit pas livrer le fichier. Tester le remboursement et la révocation dans cet environnement.
4. Installer le package dans Paperclip et vérifier les deux tâches d'exemple.
5. Pour les ventes réelles, terminer l'[activation Connect de la plateforme](https://dashboard.stripe.com/connect), puis celle du vendeur depuis [le studio](https://marketpaperclip.netlify.app/studio), avec ses informations exactes et les accords confirmés par le titulaire. Paiements et versements doivent être actifs.
6. Une véritable acquisition par un client pourra ensuite valider le parcours réel. Le plafond précédemment autorisé de 1 $ CA n'autorise pas un autoachat de test contraire aux instructions Stripe. Aucun paiement n'a été fait.

`npm run verify:sale` effectue les contrôles du statut, des montants et du téléchargement par les routes du même acheteur après paiement. Son entrée JSON arrive sur stdin : `cookie`, `orderId`, `expectedSha256`, et éventuellement `origin`, `amountCents`, `maxTotalCents`, `feeCents` (par défaut 100, 100 et 15). La session reste privée et ne doit pas être transmise dans le chat. Ce script n'achète rien; le tableau Stripe reste nécessaire pour prouver le mode réel et le transfert.

Pour répéter le contrôle public :

```sh
npm run audit:launch -- --output outputs/launch-audit.json
```

Un résultat public réussi ne signifie pas que la vente a été validée.

## Conditions avant la publicité internationale

| Sujet | Action attendue |
| --- | --- |
| Paiement et livraison | Réussir la recette isolée Stripe Sandbox ci-dessus, activer le vendeur réel, puis contrôler les premières acquisitions véritables; aucune vente synthétique en production |
| Catalogue | Publier des agents utiles pour le public visé, avec fichiers, installation et limites testés. Paperclip Test doit rester présenté comme un agent de test |
| Pays vendeurs | Le serveur crée les comptes Connect au Canada (`country: CA`). Ne pas promettre l'inscription de vendeurs du monde entier avant d'ajouter et de valider d'autres pays |
| Devise | Annoncer des prix en CAD. Aucun affichage USD/EUR ni règlement multidevise n'a été validé |
| Taxes | `STRIPE_TAX_ENABLED=false` en production. Définir le responsable fiscal, les inscriptions nécessaires et la classification des produits, puis tester le calcul pour chaque territoire avant de le cibler. [Stripe Tax avec Connect](https://docs.stripe.com/tax/connect) |
| Conditions et consommateurs | Compléter les coordonnées de l'exploitant. Pour cibler des consommateurs de l'UE avec une livraison numérique immédiate, examiner le consentement exprès, la reconnaissance du droit de rétractation et leur confirmation durable; la case générale de licence ne démontre pas ce parcours. [Your Europe](https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/ecommerce-distance-selling/index_en.htm) |
| Mesure | Le site n'intègre actuellement aucun traceur publicitaire. Définir la mesure des visites, débuts de Checkout, ventes confirmées et remboursements avant d'optimiser une campagne; ne pas compter le simple retour navigateur comme une conversion |
| Achat média | Choisir le canal, les pays et le budget. Seule la dépense de test de 1 $ est autorisée dans cette session; aucun budget publicitaire n'a été engagé |

## Textes de campagne à utiliser après validation

Les annonces doivent renvoyer vers le catalogue réel et ne pas promettre des résultats, des revenus ou une certification.

**Anglais — acheteurs**

Headline: Find your next AI agent

Copy: Explore agent packages with clear requirements, setup guides and licenses. Download your purchase and run it in your own environment. Prices in CAD. Model usage is separate.

Destination: `https://marketpaperclip.com/agents?utm_source=launch&utm_medium=paid&utm_campaign=international_en`

**Français — acheteurs**

Titre : Trouvez votre prochain agent IA

Texte : Découvrez des packages d'agents avec leurs prérequis, leur guide d'installation et leur licence. Téléchargez votre achat et utilisez-le dans votre environnement. Prix en CAD. Frais de modèle en supplément.

Destination : `https://marketpaperclip.com/agents?lang=fr&utm_source=launch&utm_medium=paid&utm_campaign=international_fr`

Ces paramètres servent à identifier les liens; ils n'installent pas à eux seuls un outil de mesure et ne prouvent aucune conversion. Les textes restent à relier à une offre adaptée aux pays retenus.
