# Connexion Google — MarketPaperclip

Le site utilise Supabase Auth et des cookies de session HttpOnly. Google revient
vers Supabase, qui redirige vers `/api/auth/callback` pour l'échange PKCE côté serveur.
Les identifiants OAuth Google restent dans Supabase; ils ne sont pas ajoutés au
JavaScript public ni aux variables Netlify.

## État au 3 novembre 2026 : actif

- Connexion Google **en production** depuis le déploiement Netlify `6aea47008049355b373825a9` (branche `feature/profils`), `GOOGLE_AUTH_ENABLED=true`. Vérifié : bouton « Continuer avec Google » / « Continue with Google » dans la fenêtre de connexion et d'inscription, route `/api/auth/google` → Supabase (PKCE, cookie `HttpOnly; Secure`) → page de connexion Google sans erreur de client ni d'URI de redirection.
- Projet Google Cloud : `marketpaperclip` (numéro 209736611718), propriétaire `info@mgminformatique.ca`. Écran de consentement externe et client OAuth « MarketPaperclip Web » créés dans la console par le propriétaire ; l'ancien projet `marketpaperclip-mgm` (vide, sans facturation) a été supprimé le 3 novembre 2026 à la demande du propriétaire ; il reste récupérable pendant 30 jours avec `gcloud projects undelete marketpaperclip-mgm`.
- Fournisseur Google activé dans Supabase (`ltommtumsvvqxdknpkfd`) avec ce client. L'ID client est public ; le secret n'est conservé que dans Supabase.
- `scripts/supabase-config-push.mjs` ne touche pas ce réglage : avec le CLI 2.122, `--diff` le classe `remote_only` (non déclaré dans `config.toml`) et seules les propriétés déclarées sont envoyées. Toujours relire `--diff` avant un envoi.
- Si un visiteur voit « Accès bloqué » chez Google, l'application est restée en mode test : *Google Auth Platform → Audience → Publier l'application*.

## Configuration du client

Ouvrir [Google Auth Platform](https://console.cloud.google.com/auth/overview?project=marketpaperclip).

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
