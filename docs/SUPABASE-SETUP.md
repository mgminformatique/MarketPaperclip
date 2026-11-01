# Supabase — MarketPaperclip

Projet désigné : [`ltommtumsvvqxdknpkfd`](https://supabase.com/dashboard/project/ltommtumsvvqxdknpkfd).

Le dépôt contient les six migrations, les buckets, les politiques RLS et un déploiement GitHub manuel. La présence de ces fichiers ne signifie pas que la base distante est déjà configurée.

## 1. Ajouter les deux accès de déploiement

Ouvrir [GitHub → Settings → Secrets and variables → Actions](https://github.com/mgminformatique/MarketPaperclip/settings/secrets/actions), puis **New repository secret** pour chacun :

| Nom | Valeur à enregistrer dans GitHub |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Jeton personnel Supabase limité à ce projet. Le lien CLI nécessite Project Settings, API Keys et API Key Secrets en lecture; la configuration Auth nécessite les droits de lecture et d’écriture Auth. |
| `SUPABASE_DB_PASSWORD` | Mot de passe PostgreSQL de ce projet. Ce n’est pas une clé API. |

Créer le jeton dans [Supabase → Account → Access Tokens](https://supabase.com/dashboard/account/tokens). Conserver ces valeurs uniquement dans les champs secrets de GitHub.

## 2. Déployer

Ouvrir [Actions → Deploy Supabase](https://github.com/mgminformatique/MarketPaperclip/actions/workflows/supabase-deploy.yml), puis **Run workflow**, branche **main**.

Le workflow vérifie les accès, affiche les migrations à appliquer, applique uniquement les migrations en attente, configure les connexions par courriel/mot de passe et les courriels FR/EN, puis relit les réglages Auth pour les vérifier. Aucun `db reset` n’est exécuté. Les secrets SMTP et OAuth existants ne sont pas remplacés.

Si la base contient déjà des tables de ce marketplace ou des migrations inconnues, arrêter sur l’erreur et réconcilier l’historique avant de relancer. Ne pas effacer la base.

## 3. Relier le site à la base

Dans les variables serveur de l’hébergement du site, configurer :

| Variable | Valeur |
| --- | --- |
| `SUPABASE_URL` | `https://ltommtumsvvqxdknpkfd.supabase.co` |
| `SUPABASE_ANON_KEY` | Clé publishable ou anon du projet |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé secret ou service_role du projet; serveur uniquement |
| `SITE_URL` | `https://marketpaperclip.murphylexus.chatgpt.site` pendant la présentation privée |
| `PAYMENTS_ENABLED` | `false` |
| `LAUNCH_READY` | `false` |

Redéployer le site pour appliquer ces variables. Les secrets GitHub Actions et les variables du site sont deux configurations distinctes; le workflow ne transfère aucune clé vers l’hébergement.

L’origine de présentation reste protégée par l’accès propriétaire ChatGPT. Le test d’inscription doit donc être effectué par le propriétaire tant que l’audience reste privée. Configurer un SMTP de production pour les courriels destinés aux clients; le service de courriel par défaut Supabase est limité.

Lorsque `marketpaperclip.com` répond correctement en HTTPS et que son lancement est autorisé, définir la variable GitHub `MARKETPAPERCLIP_SITE_URL=https://marketpaperclip.com`, relancer le workflow et modifier également `SITE_URL` sur l’hébergement.

## 4. Validation après branchement

- Inscription, confirmation par courriel, connexion, déconnexion et récupération du mot de passe.
- Création du profil et isolation des données entre deux comptes.
- Brouillon d’agent/bundle, couverture, package privé et modération.
- Les commandes et paiements nécessitent encore la configuration et la recette Stripe Connect décrites dans [DEPLOYMENT.md](DEPLOYMENT.md).

Les prix restent masqués sur le site. Aucun compte de test, produit commercial ou paiement réel n’est créé par ce workflow.

Références officielles : [déploiement de migrations](https://supabase.com/docs/guides/deployment/managing-environments), [configuration Auth](https://supabase.com/docs/reference/api/v1-update-auth-service-config), [modèles de courriel](https://supabase.com/docs/guides/auth/auth-email-templates).
