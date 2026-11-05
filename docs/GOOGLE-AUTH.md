# Connexion Google — MarketPaperclip

Le site utilise Supabase Auth et des cookies de session HttpOnly. Google revient
vers Supabase, qui redirige vers `/api/auth/callback` pour l'échange PKCE côté serveur.
Les identifiants OAuth Google restent dans Supabase; ils ne sont pas ajoutés au
JavaScript public ni aux variables Netlify.

## État au 3 novembre 2026

- Projet Google Cloud créé : `marketpaperclip-mgm`, nom **MarketPaperclip**.
- Client OAuth Google et écran de consentement : à configurer dans la console.
- Fournisseur Google Supabase : désactivé lors de la vérification.
- Intégration du bouton FR/EN et route `/api/auth/google` : déployées sur Netlify,
  version `6aea06d36b5c764eec52883d` (fournisseur toujours désactivé).
- `GOOGLE_AUTH_ENABLED` reste désactivé jusqu'à la configuration du fournisseur.
- Hébergement existant : site Netlify `4911687f-987b-4363-9982-50078b56f9ef`,
  accessible à `https://marketpaperclip.netlify.app`.
- Netlify déclare `marketpaperclip.com` et `www.marketpaperclip.com`, mais le domaine
  principal pointe encore vers le stationnement GoDaddy à cette date.
- Le domaine saisi dans la demande, `marketpapertclip.com`, ne résout pas en DNS;
  son orthographe reste à confirmer avant de modifier les domaines ou leur DNS.

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
