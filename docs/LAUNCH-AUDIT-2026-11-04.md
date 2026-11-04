# Recette de vente et lancement international

Le site est accessible et l'agent **Paperclip Test 1.0.0** est publié à **1 $ CA**. La vente réelle reste à effectuer : aucun compte vendeur Stripe n'était relié lors du contrôle. Le lancement publicitaire payant reste en attente de cette vente et des vérifications propres aux pays ciblés.

## État vérifié le 4 novembre 2026

| Point | Résultat |
| --- | --- |
| Production | Netlify, site `4911687f-987b-4363-9982-50078b56f9ef`; source de départ `e1c9cfe`, branche de travail `feature/recette-internationale` |
| Comptes | Supabase actif; compte MGM confirmé, identité Google reliée; Google et courriel activés |
| Connexion | Redirection du site vers Supabase puis Google vérifiée; contrôles du module client compilé FR/EN réussis. Une authentification interactive complète n'a pas été effectuée dans cette session |
| Domaine | DNS public A `75.2.60.5`, www vers Netlify, HTTPS et redirection www fonctionnels depuis le poste. Le propriétaire a signalé un problème d'accès au domaine puis confirmé que l'adresse Netlify s'affiche. La cause côté appareil/réseau reste à identifier |
| Contrôles publics | 50 contrôles réussis : pages FR/EN, fiche, en-têtes, pages privées non indexables, vraie 404, commandes refusées sans session, webhook non signé refusé |
| Tests applicatifs | TypeScript et 103 tests réussis; build Netlify réussi |
| Paiements | Portes de lancement ouvertes et commission configurée à 15 %. Ces indicateurs ne prouvent pas une transaction |
| Vendeurs | Aucun compte Connect relié lors du contrôle initial |
| Commandes et événements Stripe | Aucun lors du contrôle initial; aucune commande n'a été marquée payée artificiellement |
| Interface | Contrôles de connexion sur le client compilé exécutés en DOM. Le service d'accès au navigateur était indisponible : la recette visuelle desktop/mobile reste à faire |

## Agent publié

[Paperclip Test](https://marketpaperclip.com/agents/paperclip-test-bdbbb8c3) — [adresse Netlify de secours](https://marketpaperclip.netlify.app/agents/paperclip-test-bdbbb8c3).

Agent minimal de test du chargement d'instructions, avec AGENTS.md, manifeste descriptif, guides anglais/français, exemples et licence MIT. Installation manuelle dans un dossier d'instructions Paperclip. Le package ne contient aucun exécutable, dépendance ou secret. Le runtime, les appels au modèle et une automatisation métier de production ne sont pas inclus.

- Archive : `outputs/paperclip-test-1.0.0.zip`, 5 550 octets, six fichiers.
- SHA-256 : `4e5bda2a5a71dad7a3363e8f07ac6a2b60f54100ac76f097613ee49a1bd54b4a`.
- Sources reproductibles : `packages/paperclip-test/` et `packages/paperclip-test.listing.json`.
- Dépôt privé et lecture des octets stockés vérifiés, version figée et publication approuvée par la procédure transactionnelle de modération.
- Publication opérateur au nom du compte MGM autorisée par le propriétaire. Elle ne constitue pas une recette du formulaire de publication dans le navigateur.
- L'exécution du modèle dans une installation Paperclip et le téléchargement par un acheteur après paiement restent à vérifier.

## Corrections pour les visiteurs internationaux

Les prix ordinaires et les statistiques affichent désormais explicitement **CAD**, y compris en anglais. La langue choisie suit le visiteur dans Stripe Checkout et dans les URL de retour. Les prix Stripe sont explicitement hors taxes, conformément au rapprochement en base `total = prix + taxes`; ils ne dépendent plus du réglage implicite du tableau Stripe. Le contrôle de configuration reconnaît aussi les clés restreintes `rk_live_` comme des clés du mode réel.

Ces corrections n'activent pas Stripe Tax, ne créent aucune inscription fiscale et n'élargissent pas les pays des vendeurs.

## Terminer la vente de 1 dollar

1. Sur le compte vendeur MGM, ouvrir [le studio](https://marketpaperclip.netlify.app/studio) et **Configurer les paiements**. Le propriétaire complète lui-même l'identité, les coordonnées bancaires et les accords demandés par Stripe. Les paiements **et** les versements doivent être actifs.
2. Utiliser un autre compte acheteur confirmé : le créateur ne peut pas acheter son propre produit. Ouvrir la fiche Paperclip Test, accepter la licence et passer par le Checkout normal du site.
3. Le plafond autorisé par le propriétaire est **1 $ CA au total**. Si le total affiché dépasse 1 $, arrêter avant de payer. La carte est saisie directement dans Stripe, jamais dans le chat ou un journal.
4. Constater un vrai paiement du mode réel dans Stripe, une commande passée à `paid` par le webhook, le montant total et la commission de 15 cents. Vérifier aussi la destination Connect et l'état du transfert; la commission brute n'est pas un bénéfice après frais Stripe.
5. Depuis les acquisitions du même acheteur, télécharger le ZIP et comparer son SHA-256 avec celui ci-dessus. Vérifier qu'un autre compte n'obtient pas le lien et qu'un retour Checkout sans webhook ne suffit pas à livrer le fichier.
6. Installer manuellement le package dans Paperclip et vérifier les deux tâches d'exemple. Un éventuel remboursement est une opération distincte, à effectuer à la demande du propriétaire, puis à contrôler jusqu'à la révocation du téléchargement.

`npm run verify:sale` effectue les contrôles du statut, des montants et du téléchargement par les routes du même acheteur après paiement. Son entrée JSON arrive sur stdin : `cookie`, `orderId`, `expectedSha256`, et éventuellement `origin`, `amountCents`, `maxTotalCents`, `feeCents` (par défaut 100, 100 et 15). La session reste privée et ne doit pas être transmise dans le chat. Ce script n'achète rien; le tableau Stripe reste nécessaire pour prouver le mode réel et le transfert.

Pour répéter le contrôle public :

```sh
npm run audit:launch -- --output outputs/launch-audit.json
```

Un résultat public réussi ne signifie pas que la vente a été validée.

## Conditions avant la publicité internationale

| Sujet | Action attendue |
| --- | --- |
| Première vente | Réussir le parcours réel de 1 $ ci-dessus; conserver les preuves sans carte, cookie ou lien privé |
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
