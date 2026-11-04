# Paperclip Test

Version 1.0.0. Agent minimal pour vérifier le chargement d'un fichier d'instructions. Créé par MGM Informatique pour tester l'achat et le téléchargement sur MarketPaperclip. Licence MIT.

Le package contient des instructions, la licence, un manifeste descriptif, la documentation en anglais et en français et des exemples. Aucun service hébergé ni modèle IA n'est inclus. Le manifeste n'est pas un schéma d'import officiel de Paperclip.

## Installation manuelle

1. Décompressez le ZIP dans un nouveau dossier et lisez les fichiers.
2. Dans votre installation Paperclip, créez un agent de test avec un adaptateur déjà configuré. Gardez les exécutions récurrentes désactivées.
3. Dans la page Instructions de cet agent, copiez AGENTS.md dans le fichier d'entrée du dossier géré, ou utilisez le dossier extrait comme dossier d'instructions externe. Ne remplacez pas les instructions d'un autre agent.
4. Enregistrez et lancez le contrôle de configuration de l'adaptateur.
5. Donnez à l'agent la tâche `MP_TEST_PRET`. La réponse attendue est `PAPERCLIP_TEST_OK | 1.0.0 | fr`.
6. Pour le test anglais, envoyez `MP_TEST_READY`. Les exemples sont dans examples/smoke-test.md.

Les libellés peuvent varier selon votre version de Paperclip. La méthode suit la [documentation officielle des agents](https://github.com/paperclipai/paperclip-docs/blob/main/docs/guides/org/agents.md) consultée le 4 novembre 2026. L'exécution réelle dans votre installation reste à vérifier : aucun test de modèle dans votre runtime n'est annoncé comme réussi.

## Prérequis et limites

Vous fournissez Paperclip, un adaptateur compatible avec les dossiers d'instructions et votre accès au modèle. Les frais de modèle et d'infrastructure restent à votre charge. Le package ne contient ni script exécutable, ni dépendance tierce, ni tâche planifiée, ni identifiant secret.

L'agent confirme le chargement de ses instructions et résume les tâches fournies. Il ne valide pas un paiement, ne certifie pas la sécurité d'autres agents et ne constitue pas une automatisation de production. Vérifiez sa réponse réelle.

Pour arrêter le test, mettez cet agent en pause et conservez l'archive si vous souhaitez garder la version achetée.

Assistance : [info@mgminformatique.ca](mailto:info@mgminformatique.ca). Package indépendant de MGM Informatique, sans affiliation officielle avec Paperclip.
