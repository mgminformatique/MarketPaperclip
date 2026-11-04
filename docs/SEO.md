# SEO — MarketPaperclip

## Ce que le site sert aux moteurs, aux assistants IA et aux aperçus de liens

| Élément | Mise en œuvre |
| --- | --- |
| Titres et descriptions | Propres à chaque page publique, en français et en anglais (`lib/seo.ts`). Fiches : nom, type, modèle; profils : nom et bio. |
| URL canonique + hreflang | Origine `SITE_URL` (`https://marketpaperclip.com`); **anglais par défaut, sans paramètre**, français `?lang=fr` (décision du propriétaire, 4 novembre 2026). hreflang `en` et `fr` (codes de langue seuls : un anglophone de n'importe quel pays reçoit la page anglaise), `x-default` = anglais. Les liens internes des pages anglaises pointent vers l'URL canonique, sans `?lang=en` (`crawlableHref`, `lib/i18n/locale.ts`) ; la navigation dans l'application garde le paramètre explicite. |
| Langue servie | `?lang=` d'abord, puis le choix mémorisé (cookie `mp-language`), puis la provenance : un visiteur qui arrive de `mgminformatique.ca` (ou d'un sous-domaine) reçoit le français, mémorisé dans le cookie; sinon l'anglais. mgminformatique.ca envoie son origine comme référent (`strict-origin-when-cross-origin`). Un lien qui doit ouvrir le français même sans référent (`rel="noreferrer"`, courriel, réseaux sociaux) : `https://marketpaperclip.com/?lang=fr`. |
| Rendu serveur | Catalogue, fiches produit et profils créateurs présents dans le HTML initial (`lib/market/public-data.ts`), plus d'état « chargement » pour les robots. |
| Métadonnées dans `<head>` | Pour tous les agents (`htmlLimitedBots: /.*/` dans `next.config.ts`) : Googlebot, Bingbot, GPTBot, ClaudeBot, réseaux sociaux. |
| Données structurées | Accueil : `Organization`, `WebSite` (recherche), `FAQPage`, `ItemList`. Fiches : `SoftwareApplication` + `Product` (offre en CAD : extraits « produit » avec prix dès la publication, sans attendre d'avis ; note agrégée d'avis réels ; seuls les avis dont l'auteur a un nom public sont listés) + `BreadcrumbList`. Profils : `ProfilePage` + `BreadcrumbList`. Échappement sûr du contenu des vendeurs. |
| Robots | `/robots.txt` : tout autorisé (moteurs et IA) sauf `/api/`. Les espaces connectés ne sont plus bloqués pour que les robots lisent leur `noindex, nofollow` (une page bloquée peut apparaître « indexée malgré le blocage »). `noindex` aussi sur les fiches de démonstration; `X-Robots-Tag: noindex` sur toute origine non canonique (`*.netlify.app`, aperçus). |
| Pages introuvables | Vrai code **404** (`app/not-found.tsx`, même cadre et message « Page introuvable ») pour une adresse inconnue, une fiche ou un créateur inexistant ou retiré. Uniquement quand l'API répond 404 : une panne de la base ne transforme jamais une vraie fiche en 404. |
| Documentation | Les cinq onglets de `/docs` sont dans le HTML (onglet choisi affiché, les autres `hidden`). |
| Performance | Image d'accueil (élément LCP) en 480/768/1024/1536 px avec `srcset`/`sizes` ; zod sans compilation `eval` (`z.config({ jitless: true })`), donc plus de violation CSP signalée sur chaque page. |
| Sitemap | `/sitemap.xml` dynamique : pages publiques, annonces publiées (avec image de couverture) et créateurs, en FR et EN avec alternatives et `lastmod`. |
| Partage | Images OpenGraph/Twitter 1200×630 FR/EN (`public/og/`), couverture du produit sur les fiches. |
| Identité | Icônes PNG 192/512, `apple-touch-icon`, manifeste web, `theme-color`. |
| Assistants IA | `/llms.txt` : description du marketplace et pages clés. |
| Découverte rapide | Clé IndexNow (`public/<clé>.txt`) et `scripts/indexnow.mjs`. |

Lighthouse (local, 3 novembre 2026) : **SEO 100/100** sur l'accueil, une fiche, un profil et le marché en anglais. Tests : `tests/seo.test.ts`.

Audit de la production (3 novembre 2026, soir, Lighthouse 12.8) : SEO 100 sur toutes les pages, performance 93–98 sur mobile et 100 sur ordinateur, accessibilité 86–93, bonnes pratiques 93–96. Corrigé ensuite : pages introuvables en 200 (« soft 404 »), hreflang `fr-CA`/`en-CA`, liens internes en `?lang=fr`, espaces connectés bloqués dans robots.txt, onglets de `/docs` absents du HTML, balisage des fiches inéligible sans avis, violation CSP de zod, image d'accueil trop lourde sur mobile, titre de `/support` trop court, `/licenses` sans lien. Restent, à décider : mise en cache CDN des pages publiques anonymes (TTFB à chaud ~0,4 s, ~2 s à froid), découpage du JavaScript par route, contraste et taille de certains petits textes (choix de design).

## Rendre le site trouvable — dans cet ordre

1. ~~Ouvrir l'accès public de la production~~ — fait le 3 novembre 2026.
2. ~~DNS chez GoDaddy et certificat HTTPS~~ — faits le 3 novembre 2026 (voir [NETLIFY.md](NETLIFY.md)).
3. ~~**Google Search Console**~~ — fait le 3 novembre 2026, sans intervention manuelle : propriété « Préfixe d'URL » `https://marketpaperclip.com/`, vérifiée par la méta-balise (variable Netlify `GOOGLE_SITE_VERIFICATION`, à ne pas retirer : Google revérifie) via l'API Site Verification. Propriétaires : `info@mgminformatique.ca` et le compte technique `search-console@marketpaperclip.iam.gserviceaccount.com` (projet Google Cloud `marketpaperclip`, propriétaire `info@mgminformatique.ca`, sans clé : `info@` l'emprunte avec le rôle *Service Account Token Creator*). Sitemap envoyé par l'API Search Console. Pour le renvoyer : `T=$(gcloud auth print-access-token --impersonate-service-account=search-console@marketpaperclip.iam.gserviceaccount.com --scopes=https://www.googleapis.com/auth/webmasters)` puis `curl -X PUT -H "Authorization: Bearer $T" https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fmarketpaperclip.com%2F/sitemaps/https%3A%2F%2Fmarketpaperclip.com%2Fsitemap.xml`. Facultatif dans l'interface : *Inspection de l'URL* → *Demander l'indexation* pour l'accueil, `/market`, `/agents`, `/bundles` (pas d'API pour cette action).
4. **Bing Webmaster Tools** : importer la propriété depuis Search Console (ou `BING_SITE_VERIFICATION`). Bing alimente aussi DuckDuckGo, Yahoo et Copilot.
5. **IndexNow** (Bing, Yandex, Seznam, Naver) : `node scripts/indexnow.mjs` une fois le site public, puis après chaque série de publications.
6. **Aperçus** : vérifier l'accueil et une fiche avec les outils de débogage de LinkedIn (Post Inspector) et de Facebook (Sharing Debugger).

L'indexation prend de quelques heures à quelques jours; le classement dépend ensuite du contenu, des liens entrants et de l'usage. Aucun réglage technique ne garantit une position.

## Pour monter dans les résultats

- **Annonces réelles et riches** : chaque fiche publiée est une page indexable. Titres explicites (« Agent de revue de code GitHub pour TypeScript »), descriptions détaillées, couverture, tags précis.
- **Avis d'acheteurs** : ils alimentent la note agrégée (étoiles possibles dans les résultats).
- **Liens entrants** : mgminformatique.ca, GitHub (README des agents), Product Hunt, Hacker News (Show HN), communautés Paperclip, Reddit (r/LocalLLaMA, r/ClaudeAI), annuaires d'outils IA.
- **Contenu** : guides d'usage et articles (« meilleurs agents IA pour… ») dans `/docs`.
- **Suivi** : Search Console (requêtes, pages indexées, Core Web Vitals) et Bing Webmaster chaque semaine.

## Pistes techniques suivantes

- Mise en cache CDN des pages publiques anonymes (aujourd'hui `no-store`) pour réduire le temps de réponse.
- Découpage du bundle JavaScript par route (code des espaces connectés chargé à la demande).
