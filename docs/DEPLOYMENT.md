# Déployer MarketPaperclip

## 1. Configuration requise

Le code est livré; il faut un projet Supabase dédié, un compte Stripe avec Connect, un hébergement (Netlify retenu, voir [NETLIFY.md](NETLIFY.md)) et le contrôle DNS de marketpaperclip.com. Ne réutilisez pas une base de production d’un autre projet.

| Variable serveur            | Usage                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | URL du projet Supabase                                                                                                     |
| `SUPABASE_PUBLISHABLE_KEY`  | Clé « Publishable key » (`sb_publishable_...`) de **Settings → API Keys**                                                   |
| `SUPABASE_SECRET_KEY`       | Clé « Secret key » (`sb_secret_...`) de **Settings → API Keys**; serveur uniquement                                          |
| `STRIPE_SECRET_KEY`         | Clé Stripe TEST pendant la recette; LIVE seulement après validation                                                        |
| `STRIPE_WEBHOOK_SECRET`     | Secret de signature de l’endpoint de webhook, même environnement Stripe                                                    |
| `SITE_URL`                  | Origine HTTPS exacte, sans chemin, par ex. `https://marketpaperclip.com`                                                   |
| `SITE_ALIASES`              | Autres origines HTTPS du même site, séparées par des virgules (www, `*.netlify.app`, aperçus `https://*--site.netlify.app`) |
| `MARKET_ADMIN_EMAILS`       | Courriels confirmés promus modérateurs à la connexion                                                                       |
| `SHOW_PRICES`               | `false` masque les prix partout; prix visibles par défaut                                                                   |
| `PLATFORM_FEE_BPS`          | Commission en points de base. `1000` signifie 10 %, exemple seulement. Plage 0–3000. Aucun taux commercial n’a été décidé. |
| `PAYMENTS_ENABLED`          | `false` pendant la préparation, `true` après configuration complète                                                        |
| `LAUNCH_READY`              | `false` jusqu’à la fin de la recette et à la finalisation des conditions                                                   |
| `GITHUB_AUTH_ENABLED`       | `true` uniquement après configuration OAuth GitHub dans Supabase                                                           |
| `STRIPE_TAX_ENABLED`        | `true` seulement après configuration et validation de Stripe Tax pour le modèle commercial retenu                          |

Les variables peuvent être configurées dans les secrets d’environnement du Site. Un déploiement doit suivre la modification des variables. Ne partagez pas les clés dans un ticket, dans un prompt, dans Git ou dans un fichier livré publiquement.

## 2. Supabase

1. Créer un projet dédié, activer les sauvegardes adaptées à l’exploitation.
2. Appliquer, dans l’ordre, les sept migrations SQL du dossier `supabase/migrations/` (`007_market_exchange.sql` ajoute le marché utilisateur).
3. Vérifier que le bucket `agent-packages` est privé. N’ajouter aucune politique de lecture publique pour les packages sur `storage.objects`. Le bucket `product-covers` est, lui, public pour les images de présentation; ses écritures passent uniquement par le serveur.
4. Activer la confirmation obligatoire du courriel; les courriels partent par Microsoft 365 (voir `COURRIELS_MICROSOFT.md`).
5. Configurer `Site URL` et les URLs de redirection autorisées :
   - `https://marketpaperclip.com/api/auth/callback`
   - `https://marketpaperclip.com/settings`
   - Ajouter l’origine de test pendant la recette, puis retirer les origines inutilisées.
6. Configurer les modèles de courriel pour l’authentification serveur :

**Confirmation d’inscription**

```html
<a
  href="{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=signup"
  >Confirmer mon compte</a
>
```

**Récupération du mot de passe**

```html
<a
  href="{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery"
  >Choisir un nouveau mot de passe</a
>
```

7. Optionnel : activer GitHub dans Supabase, enregistrer l’application OAuth et son callback Supabase, puis passer `GITHUB_AUTH_ENABLED=true`. Le flux applicatif utilise PKCE.
8. Créer le compte exploitant par le parcours normal, confirmer le courriel, puis attribuer le rôle administrateur depuis l’éditeur SQL autorisé :

```sql
insert into public.market_admins(user_id)
select id from auth.users where email = 'COURRIEL_ADMIN_A_REMPLACER'
on conflict do nothing;
```

Le navigateur ne peut pas s’attribuer ce rôle. Vérifier la bonne adresse avant d’exécuter cette requête.

## 3. Stripe Connect

1. Compléter le profil de la plateforme Connect et son branding.
2. La version initiale crée des comptes vendeurs au Canada et facture en CAD. Valider les pays et devises avant toute ouverture à d’autres marchés.
3. L’intégration Accounts v1 utilise les propriétés `controller`, avec dashboard Express, vérifications gérées par Stripe, frais et pertes du compte connecté attribués à l’application. Il ne s’agit pas d’un séquestre.
4. Décider le taux de commission et configurer `PLATFORM_FEE_BPS`.
5. Créer l’endpoint public :

```text
https://marketpaperclip.com/api/webhooks/stripe
```

6. Souscrire aux événements de la plateforme :
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`
7. Les comptes connectés sont revalidés directement avant chaque Checkout et au retour d’onboarding. Pour `account.updated`, vous pouvez utiliser une destination Connect séparée vers le même endpoint seulement si son secret de signature est pris en charge. Dans cette version, un seul `STRIPE_WEBHOOK_SECRET` est configuré : privilégiez la relecture directe des comptes; ne mélangez pas deux secrets d’endpoint.
8. Configurer le secret correspondant, puis tester en mode TEST. Une page de succès ne débloque jamais à elle seule le fichier : seul le webhook signé et rapproché de la commande le fait.
9. Le Checkout utilise les prix, la commission et la destination venant du serveur. Les taxes, si activées, sont calculées au Checkout, enregistrées dans la commande et affichées au total.
10. Vérifier les responsabilités fiscales, le traitement des remboursements et le modèle de vente choisi avec les personnes responsables du commerce. Compléter les textes de lancement.

**Attention au mode privé de présentation :** un site protégé par l’accès propriétaire ChatGPT ne peut pas recevoir les webhooks publics Stripe. Conserver les paiements désactivés tant que l’origine finale n’est pas accessible à Stripe et aux clients. Le changement d’audience du Site est une opération distincte.

## 4. Hébergement

### Netlify (hébergement retenu)

Le build Worker est exécuté dans une fonction Netlify Node; les fichiers statiques sont servis par le CDN. La procédure complète (base, Auth, variables, domaine GoDaddy, Stripe) est dans [NETLIFY.md](NETLIFY.md).


### Instance Sites déjà créée

Le dépôt conserve `.openai/hosting.json` et l’intégration `sites()` du build. Les mises à jour doivent suivre le workflow source → vérification/build → commit/push → version → déploiement. Préserver le `project_id` existant.

### Hébergement Cloudflare autonome

Le build Vinext produit `dist/server/index.js`, `dist/server/wrangler.json` et `dist/client`. Après `npm ci` et `npm run build`, déployer le Worker via Wrangler dans le compte Cloudflare de l’exploitant. Le projet nécessite Node.js compatibility dans le Worker. Configurer les secrets dans ce compte, puis relancer le déploiement. N’utilisez pas un hébergement statique seul : les routes `/api/*` sont indispensables.

```bash
npx wrangler deploy --config dist/server/wrangler.json --name marketpaperclip
```

Cette variante autonome doit faire l’objet de sa propre recette; le déploiement effectué pendant le développement utilise Sites.

## 5. Domaine

Attacher `marketpaperclip.com` à l’hébergement retenu. Pour Sites, utiliser exactement les valeurs DNS retournées lors de l’ajout du domaine, y compris les enregistrements de validation; ne pas inventer une cible A ou CNAME. Préserver les autres enregistrements du domaine, notamment le courrier.

Attendre la validation du domaine et du certificat TLS, puis confirmer :

- `https://marketpaperclip.com` répond avec le site attendu.
- Les liens de confirmation de compte et de récupération utilisent cette origine.
- L’endpoint Stripe reçoit des événements TEST et les traite avec succès.
- Le `SITE_URL` déployé correspond à cette origine.

## 6. Ouvrir les ventes

Terminer `docs/ACCEPTANCE.md`, finaliser les textes commerciaux, vérifier la réception des courriels et la livraison d’un achat TEST. Après passage cohérent des clés et webhooks en LIVE, activer `LAUNCH_READY=true` et `PAYMENTS_ENABLED=true`, puis redéployer.

`npm run preflight` vérifie les variables de votre shell sans en afficher les valeurs; il ne prouve pas la disponibilité des services externes ni la configuration DNS.
