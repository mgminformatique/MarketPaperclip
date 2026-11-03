# SEO — MarketPaperclip

## Ce que le site sert aux moteurs, aux assistants IA et aux aperçus de liens

| Élément | Mise en œuvre |
| --- | --- |
| Titres et descriptions | Propres à chaque page publique, en français et en anglais (`lib/seo.ts`). Fiches : nom, type, modèle; profils : nom et bio. |
| URL canonique + hreflang | Origine `SITE_URL` (`https://marketpaperclip.com`); français sans paramètre, anglais `?lang=en`; `x-default` = français. |
| Rendu serveur | Catalogue, fiches produit et profils créateurs présents dans le HTML initial (`lib/market/public-data.ts`), plus d'état « chargement » pour les robots. |
| Métadonnées dans `<head>` | Pour tous les agents (`htmlLimitedBots: /.*/` dans `next.config.ts`) : Googlebot, Bingbot, GPTBot, ClaudeBot, réseaux sociaux. |
| Données structurées | Accueil : `Organization`, `WebSite` (recherche), `FAQPage`, `ItemList`. Fiches : `SoftwareApplication` (offre en CAD, note agrégée d'avis réels) + `BreadcrumbList`. Profils : `ProfilePage` + `BreadcrumbList`. Échappement sûr du contenu des vendeurs. |
| Robots | `/robots.txt` : tout public autorisé (moteurs et IA), `/api/` et espaces connectés exclus; `noindex` sur les espaces connectés, pages introuvables et fiches de démonstration; `X-Robots-Tag: noindex` sur toute origine non canonique (`*.netlify.app`, aperçus). |
| Sitemap | `/sitemap.xml` dynamique : pages publiques, annonces publiées (avec image de couverture) et créateurs, en FR et EN avec alternatives et `lastmod`. |
| Partage | Images OpenGraph/Twitter 1200×630 FR/EN (`public/og/`), couverture du produit sur les fiches. |
| Identité | Icônes PNG 192/512, `apple-touch-icon`, manifeste web, `theme-color`. |
| Assistants IA | `/llms.txt` : description du marketplace et pages clés. |
| Découverte rapide | Clé IndexNow (`public/<clé>.txt`) et `scripts/indexnow.mjs`. |

Lighthouse (local, 3 novembre 2026) : **SEO 100/100** sur l'accueil, une fiche, un profil et le marché en anglais. Tests : `tests/seo.test.ts`.

## Rendre le site trouvable — dans cet ordre

1. ~~Ouvrir l'accès public de la production~~ — fait le 3 novembre 2026.
2. ~~DNS chez GoDaddy et certificat HTTPS~~ — faits le 3 novembre 2026 (voir [NETLIFY.md](NETLIFY.md)).
3. **Google Search Console** : propriété « Domaine » `marketpaperclip.com`, vérifiée par l'enregistrement TXT que Google fournit (à ajouter dans la zone DNS GoDaddy). Puis *Sitemaps* → `https://marketpaperclip.com/sitemap.xml`, et *Inspection de l'URL* → *Demander l'indexation* pour l'accueil, `/market`, `/agents`, `/bundles`. Variante sans DNS : méta-balise via la variable Netlify `GOOGLE_SITE_VERIFICATION`.
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
