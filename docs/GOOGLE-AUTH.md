# Connexion Google — MarketPaperclip

Le site utilise Supabase Auth et des cookies de session HttpOnly. Google revient
vers Supabase, qui redirige vers `/api/auth/callback` pour l'échange PKCE côté serveur.
Les identifiants OAuth Google restent dans Supabase; ils ne sont pas ajoutés au
JavaScript public ni aux variables Netlify.

## État au 3 novembre 2026

- Code : bouton « Continuer avec Google » (FR/EN) et route `/api/auth/google`, en production depuis le déploiement Netlify `6aea3798e8d525d49728bbc2` (branche `feature/profils`, commit 1609acc), masqués tant que `GOOGLE_AUTH_ENABLED` n'est pas `true` (la route répond 503).
- Projet Google Cloud : `marketpaperclip-mgm` (nom **MarketPaperclip**), propriétaire `info@mgminformatique.ca`. Le domaine `https://marketpaperclip.com/` y est vérifié dans Search Console pour `info@` (voir [SEO.md](SEO.md)), ce qui sert aussi aux domaines autorisés de l'écran de consentement.
- Reste à faire dans la console (pas d'API publique pour les clients OAuth « Application Web ») : écran de consentement et client OAuth, puis fournisseur Google dans Supabase, puis `GOOGLE_AUTH_ENABLED=true` et redéploiement.
- Site Netlify `4911687f-987b-4363-9982-50078b56f9ef`, domaine `marketpaperclip.com` actif.
- Attention : après l'activation dans le tableau de bord Supabase, un `supabase config push` (même via `scripts/supabase-config-push.mjs`) repousserait `config.toml`, qui ne déclare pas Google, et désactiverait le fournisseur. Vérifier `node scripts/supabase-config-push.mjs --diff` avant tout envoi.

## Configuration du client

Ouvrir [Google Auth Platform](https://console.cloud.google.com/auth/overview?project=marketpaperclip-mgm).

1. Configurer l'application **MarketPaperclip**, le contact
   `info@mgminformatique.ca` et une audience externe pour permettre la connexion
   des visiteurs. Limiter les données demandées à OpenID, courriel et profil.
   Renseigner les liens d'accueil, de confidentialité et de conditions sur le
   domaine confirmé et accessible. Publier l'application lorsque ces réglages
   sont terminés; le mode test limite l'accès aux utilisateurs de test.
2. Créer un client **Application Web**, nommé **MarketPaperclip Web**.
3. Ajouter cette URI de redirection autorisée, exactement :

   ```text
   https://ltommtumsvvqxdknpkfd.supabase.co/auth/v1/callback
   ```

   Le bouton utilise une redirection côté serveur : il ne charge pas Google One
   Tap et ne nécessite pas d'origine JavaScript Google.
4. Dans [Supabase — Google](https://supabase.com/dashboard/project/ltommtumsvvqxdknpkfd/auth/providers),
   enregistrer l'ID client et son secret dans le fournisseur Google, puis
   l'activer. Garder la vérification du nonce active. Ne pas remplacer les
   paramètres de courriels ou du crochet Microsoft 365.
5. Vérifier que les URL de retour de l'application figurent dans les redirections
   autorisées Supabase : `/api/auth/callback` sur le domaine final et sur
   `https://marketpaperclip.netlify.app`. Les alias existants sont décrits dans
   `supabase/config.toml`.
6. Définir `GOOGLE_AUTH_ENABLED=true` dans l'environnement Netlify du site
   ci-dessus, puis redéployer. Le bouton apparaît pour la connexion et
   l'inscription, en français et en anglais.

Ne pas commettre le fichier JSON téléchargé depuis Google ni afficher son secret
dans un journal ou un message.

## Vérification

`npm run check` vérifie notamment le déclenchement OAuth, les cookies PKCE,
l'échange du code, les retours sur les alias approuvés, l'annulation, le refus
d'une redirection externe et la compatibilité avec GitHub.

Résultat : 91 tests réussis, TypeScript et build Netlify réussis.
Le script `scripts/check-client-interactions.mjs` accepte `authOnly:true` pour
tester le dialogue sur un catalogue réel, et `googleFixture:true` pour activer
le bouton uniquement dans son DOM de test. Ce dernier mode ne change aucun
réglage distant et ne prouve pas une connexion Google réelle.

Après activation, vérifier dans un navigateur : bouton Google → sélection du
compte → retour dans la bibliothèque → compte connecté après rechargement →
déconnexion. Vérifier également l'annulation et les deux langues. Ces tests
nécessitent un vrai client Google configuré et un compte de test autorisé.

Référence : [documentation Supabase — Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
