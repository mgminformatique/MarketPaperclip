# Mise en ligne sur Netlify — marketpaperclip.com

Le build Vinext (Worker) tourne dans **une fonction Netlify (Node 24)** générée par `scripts/netlify-prepare.mjs` ; `dist/client` est servi par le CDN (`preferStatic`). Aucune adaptation Next.js de Netlify n'est utilisée : `netlify.toml` désactive le plugin auto-détecté (`NETLIFY_NEXT_PLUGIN_SKIP`).

```sh
npm run build:netlify     # vinext build + .netlify/v1/functions/marketpaperclip-server
netlify build --offline   # build complet tel que Netlify le fera
netlify serve --offline   # serveur de production local (port 8888 par défaut)
```

Limites prises en compte :
- **Corps de requête des fonctions ≤ 6 Mo** : les packages (jusqu'à 20 Mo) partent directement du navigateur vers Supabase Storage par URL signée (`/api/products/:id/file/upload`), puis le serveur les vérifie (type, taille, SHA-256) avant de les rattacher (`/file/attach`). Les couvertures (≤ 3 Mo) passent par la fonction.
- **Limiteur de tentatives** : l'IP vient du contexte Netlify (`context.ip`), jamais d'un en-tête du client.
- **Origines** : `SITE_URL` est l'origine canonique ; `SITE_ALIASES` liste les autres origines du même site (www, `*.netlify.app`, aperçus) pour les retours Stripe et les liens Auth.

## Ordre de mise en service

Chaque étape distante modifie la production : elle s'exécute avec l'accord explicite du propriétaire.

### 1. Base de données (Supabase `ltommtumsvvqxdknpkfd`)

```sh
supabase db push --linked --project-ref ltommtumsvvqxdknpkfd --dry-run   # doit lister 007 seulement
supabase db push --linked --project-ref ltommtumsvvqxdknpkfd
```

`007_market_exchange.sql` est additive (tables `offers`, `market_events`, colonnes `approved_version`/`listed_at`, fonctions serveur). Elle est compatible avec l'ancien code déployé.

### 2. Authentification

```sh
node scripts/supabase-config-push.mjs --diff   # lecture seule
node scripts/supabase-config-push.mjs
```

Applique uniquement ce que déclare `supabase/config.toml` : Site URL `https://marketpaperclip.com`, redirections (www, netlify.app, aperçus), modèles de courriels FR/EN, mot de passe 12 caractères minimum (la production était à 6), crochet d’envoi des courriels. Ne jamais lancer `supabase config push` directement : il pousserait le crochet sans son secret de signature.

**Courriels d’authentification** : le service de courriel par défaut de Supabase n’envoie qu’aux membres de l’organisation Supabase. Les courriels partent par Microsoft 365 (info@mgminformatique.ca, Microsoft Graph, crochet Supabase *Send Email*), comme pour ChantierConnect : voir [COURRIELS_MICROSOFT.md](COURRIELS_MICROSOFT.md).

### 3. Site Netlify

```sh
netlify sites:create --name marketpaperclip --account-slug info-oxcsesk
mgm link MarketPaperclip netlify <SITE_ID>
node scripts/netlify-configure.mjs --site <SITE_ID> --admin info@mgminformatique.ca            # aperçu
node scripts/netlify-configure.mjs --site <SITE_ID> --admin info@mgminformatique.ca --apply    # écrit
netlify deploy --build --site <SITE_ID>          # aperçu (draft)
netlify deploy --build --site <SITE_ID> --prod   # production
```

`netlify-configure.mjs` lit les clés Supabase avec le CLI Supabase et les transmet au CLI Netlify sans les afficher. `SUPABASE_SECRET_KEY` est marquée secrète. Par défaut : prix visibles, `LAUNCH_READY=false`, paiements désactivés.

Le compte `info@mgminformatique.ca` devient modérateur à sa première connexion après confirmation du courriel (`MARKET_ADMIN_EMAILS`). Sans modérateur, aucune annonce ne peut être publiée.

### 4. Domaine chez GoDaddy

Dans Netlify : *Domain management → Add domain* `marketpaperclip.com` (principal) et `www.marketpaperclip.com`.

Chez GoDaddy (*Mes produits → DNS* de marketpaperclip.com), garder les enregistrements MX/TXT existants et :

| Type | Nom | Valeur | Remarque |
| --- | --- | --- | --- |
| A | `@` | `75.2.60.5` | remplace les A de parking `3.33.130.190` et `15.197.148.33` |
| CNAME | `www` | `marketpaperclip.netlify.app` | remplace `www → @` |

Désactiver tout « Transfert de domaine » GoDaddy actif. Avec l'API GoDaddy connectée (`mgm auth godaddy`) :

```sh
mgm dns marketpaperclip.com
mgm dns marketpaperclip.com set A @ 75.2.60.5
mgm dns marketpaperclip.com set CNAME www marketpaperclip.netlify.app
```

Netlify émet ensuite le certificat Let's Encrypt (quelques minutes après la propagation). Vérifier `https://marketpaperclip.com` et `https://www.marketpaperclip.com`.

### 5. Stripe (paiements)

Le plus simple : `node scripts/stripe-configure.mjs --site <SITE_ID> --fee-bps 1500 --apply` crée le webhook et enregistre les clés dans Netlify à partir d'une invite masquée. Voir [STRIPE.md](STRIPE.md). À la main :

1. Mode **TEST** d'abord. Connect activé (comptes Express, Canada, CAD).
2. Endpoint webhook : `https://marketpaperclip.com/api/webhooks/stripe`, événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
3. Dans Netlify (*Site configuration → Environment variables*), saisir vous-même : `STRIPE_SECRET_KEY` (secrète), `STRIPE_WEBHOOK_SECRET` (secrète), `PLATFORM_FEE_BPS` (ex. `1000` = 10 %), puis `LAUNCH_READY=true` et `PAYMENTS_ENABLED=true`. Redéployer.
4. Recette TEST : onboarding vendeur, achat, offre acceptée puis payée, remboursement depuis la modération.

## Variables serveur

| Variable | Valeur |
| --- | --- |
| `SUPABASE_URL` | `https://ltommtumsvvqxdknpkfd.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` | clés du projet (script) |
| `SITE_URL` | `https://marketpaperclip.com` |
| `SITE_ALIASES` | `https://www.marketpaperclip.com,https://marketpaperclip.netlify.app,https://*--marketpaperclip.netlify.app` |
| `MARKET_ADMIN_EMAILS` | courriel(s) des modérateurs |
| `GOOGLE_AUTH_ENABLED` | `true` seulement après configuration du client Google dans Supabase; voir [GOOGLE-AUTH.md](GOOGLE-AUTH.md) |
| `SHOW_PRICES` | `true` (ou `false` pour masquer les prix) |
| `LAUNCH_READY` | `true` ouvre les acquisitions gratuites (et payantes avec Stripe) |
| `PAYMENTS_ENABLED`, `STRIPE_*`, `PLATFORM_FEE_BPS` | paiements, voir étape 5 |
