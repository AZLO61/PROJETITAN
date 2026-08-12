# Refactor audit V5

## Source

`BoardGenerator_V4_15.jsx` fourni dans la conversation.

## Changements

- extraction du moteur métier hors du composant React ;
- séparation sémantique du domaine ;
- extraction complète du rendu Three.js ;
- extraction des composants Titan/cartes/stock ;
- découpage du rendu principal en six panneaux ;
- assets PNG sortis du JavaScript base64 ;
- contrôleur React isolé ;
- contrat IA et schémas JSON ;
- tests smoke et CI GitHub.

## Sécurité comportementale

Aucune règle métier n'a été volontairement réécrite pendant cette passe. Les commentaires et hypothèses du fichier fourni restent dans la source métier.

## Validation

Le moteur domaine a été importé et exécuté localement pour un smoke test de génération du plateau et de placement de quatre Titans.

Le build React complet n'a pas pu être exécuté dans cet environnement car le registre npm interne ne fournit pas les paquets demandés. La CI GitHub est configurée pour effectuer l'installation, l'audit, les tests et le build dans un environnement réseau normal.
