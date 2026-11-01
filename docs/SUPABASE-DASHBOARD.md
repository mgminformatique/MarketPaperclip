# Installer MarketPaperclip avec une session Supabase ouverte

Projet prévu : **ltommtumsvvqxdknpkfd**. Cette méthode utilise le Dashboard connecté; aucun jeton de déploiement ni mot de passe PostgreSQL n'est demandé.

## 1. Installer les tables

1. Ouvrir [INSTALL-MARKETPAPERCLIP.sql](../supabase/INSTALL-MARKETPAPERCLIP.sql), puis **Raw** et copier tout le contenu.
2. Ouvrir [le SQL Editor du projet](https://supabase.com/dashboard/project/ltommtumsvvqxdknpkfd/sql/new).
3. Coller le contenu et cliquer **Run**, avec le rôle **postgres**.

Le résultat attendu indique **6 migrations** et **12 tables avec RLS**. Le fichier contient exactement les six migrations du dépôt, enregistrées dans l'historique compatible avec la CLI. Leur installation est regroupée dans une transaction : si une étape échoue, aucune de ces migrations n'est validée. Une base qui contient déjà des tables applicatives ou un historique de migrations est refusée, sans effacement.

Le script est réservé à une première installation. Après réussite, les mises à jour passent par les migrations normales. Ne pas relancer l'installation complète pour mettre à jour le projet.

## 2. Régler les retours de connexion

Dans [Authentication → URL Configuration](https://supabase.com/dashboard/project/ltommtumsvvqxdknpkfd/auth/url-configuration), définir **Site URL** :

```text
https://marketpaperclip.murphylexus.chatgpt.site
```

Ajouter ces **Redirect URLs**, en conservant les autres adresses déjà autorisées :

```text
https://marketpaperclip.murphylexus.chatgpt.site/api/auth/callback
https://marketpaperclip.murphylexus.chatgpt.site/settings
https://marketpaperclip.murphylexus.chatgpt.site/settings?reset=1
https://marketpaperclip.com/api/auth/callback
https://marketpaperclip.com/settings
https://marketpaperclip.com/settings?reset=1
```

Dans les réglages du fournisseur Email, conserver les inscriptions et la confirmation du courriel activées; utiliser une longueur minimale de mot de passe de 12 caractères ou conserver une exigence existante plus forte.

## 3. Configurer les courriels

Dans [Authentication → Email Templates](https://supabase.com/dashboard/project/ltommtumsvvqxdknpkfd/auth/templates) :

- **Confirm signup** : copier [confirmation.html](../supabase/templates/confirmation.html).
- **Reset password** : copier [recovery.html](../supabase/templates/recovery.html).

Ces modèles utilisent le callback du site et permettent les parcours de confirmation et de récupération FR/EN. Conserver la configuration SMTP existante. Le service de courriel intégré à Supabase est limité; prévoir un SMTP avant l'ouverture aux clients.

## 4. Activer le site

Les clés d'application doivent être enregistrées dans les variables serveur de l'hébergement sous **SUPABASE_URL**, **SUPABASE_PUBLISHABLE_KEY** et **SUPABASE_SECRET_KEY**. Le jeton personnel et le mot de passe PostgreSQL ne sont pas des clés d'application.

Une fois le schéma et Auth configurés, redéployer la version du site pour appliquer ses variables. Vérifier ensuite inscription, confirmation, connexion, récupération et création d'un brouillon. Les paiements restent désactivés et les prix restent masqués.

## Régénérer le fichier SQL

Depuis la racine du dépôt :

```sh
node scripts/build-supabase-installer.mjs
```

Le générateur n'exécute aucune requête distante. Il refuse une liste de migrations différente de la base initiale révisée.
