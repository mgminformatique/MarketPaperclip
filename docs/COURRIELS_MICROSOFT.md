# Courriels d’authentification — Microsoft 365

Les courriels de MarketPaperclip (confirmation d’inscription, mot de passe oublié, changement d’adresse, codes et avis de sécurité) partent de **info@mgminformatique.ca** par Microsoft Graph, avec la même méthode que ChantierConnect. Aucun mot de passe de boîte courriel ni SMTP n’est utilisé : l’authentification SMTP est désactivée dans le locataire MGM, et Microsoft retire l’authentification de base SMTP.

**État au 3 novembre 2026 : actif.** Application Entra « MarketPaperclip Courriels » (`f208b79c-ac1e-43e5-94bc-cf00b71c1d09`, locataire `bde49dc5-c361-4828-82b8-f51d492bb9fc`), permission d’application `Mail.Send` accordée, secret client valide jusqu’au **3 novembre 2028** (relancer le script `--apply` avant cette date). Fonction `send-email` déployée, crochet Send Email activé dans Supabase Auth. Vérifié : courriel de test signé envoyé à info@mgminformatique.ca, puis vraie inscription sur https://marketpaperclip.netlify.app acceptée (HTTP 200) avec l’adresse de test `info+marketpaperclip-test@mgminformatique.ca` (compte non confirmé, supprimable).

Sans ce branchement, le service de courriel par défaut de Supabase n’envoie qu’aux membres de l’organisation Supabase : toute autre inscription échoue (« Inscription impossible… »).

## Fonctionnement

1. Supabase Auth appelle le crochet **Send Email** : `https://ltommtumsvvqxdknpkfd.supabase.co/functions/v1/send-email`.
2. La fonction `supabase/functions/send-email` vérifie la signature Standard Webhooks (`SEND_EMAIL_HOOK_SECRET`, tolérance 5 minutes), construit le message (français puis anglais, au style des modèles `supabase/templates/`) et l’envoie avec l’application Entra **MarketPaperclip Courriels** (permission d’application `Mail.Send`).
3. Les liens mènent au callback du site (`/api/auth/callback?token_hash=…&type=…`), sur l’origine utilisée par le visiteur quand elle appartient au marketplace (`marketpaperclip.com`, `www`, `marketpaperclip.netlify.app`, aperçus Netlify); sinon sur `https://marketpaperclip.com`.

Code partagé et testé : `supabase/functions/_shared/auth-email.ts` (`tests/auth-email.test.ts`). Un appel non signé reçoit HTTP 401; sans configuration, HTTP 503. L’adresse du crochet est celle de Supabase : elle ne dépend ni du DNS du site ni de Netlify.

## Mise en place ou renouvellement

Depuis MGM Mission Control, connecté à Microsoft 365 avec un compte administrateur :

```sh
mgm auth microsoft
# Déployer la fonction (la valeur jetable sert seulement à lire config.toml)
SEND_EMAIL_HOOK_SECRET="v1,whsec_$(head -c 32 /dev/urandom | base64 -w0)" \
  supabase functions deploy send-email --project-ref ltommtumsvvqxdknpkfd --no-verify-jwt
mgm exec microsoft -- node scripts/setup-microsoft-mailer.mjs                 # plan seulement
mgm exec microsoft -- node scripts/setup-microsoft-mailer.mjs --apply --test-to info@mgminformatique.ca
```

Le script crée ou réutilise l’application, accorde le consentement `Mail.Send`, crée un secret client valide 24 mois, range les secrets dans la fonction Supabase sans les afficher, conserve le secret du crochet dans `.sites-runtime/send-email-hook.private.env` (privé, ignoré par Git), envoie un courriel de test signé, puis active le crochet. Si le test échoue, le crochet n’est pas activé. Relancer `--apply` avant l’expiration du secret client pour le renouveler.

## Configuration Supabase Auth

`supabase/config.toml` déclare le crochet. Pousser cette configuration **uniquement** avec :

```sh
node scripts/supabase-config-push.mjs --diff
node scripts/supabase-config-push.mjs
```

Un `supabase config push` direct n’aurait pas le secret de signature et couperait les courriels.

## Sécurité recommandée

La permission d’application `Mail.Send` autorise l’envoi au nom de n’importe quelle boîte du locataire. Pour la limiter à info@mgminformatique.ca, appliquer une stratégie d’accès Exchange Online (RBAC pour les applications, ou `New-ApplicationAccessPolicy`) à l’application **MarketPaperclip Courriels**, comme pour ChantierConnect Courriels. Le secret client n’est stocké que dans les secrets de la fonction Supabase.

L’expéditeur affiché est celui de la boîte info@mgminformatique.ca. Pour un expéditeur `@marketpaperclip.com`, il faudra ajouter le domaine dans Microsoft 365 (enregistrements MX/SPF/DKIM chez GoDaddy) puis changer `MAIL_FROM`.
