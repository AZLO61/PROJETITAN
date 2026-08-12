# Architecture

## Domain

`src/domain/gameRules.js` est la source de vérité comportementale extraite du fichier fourni. Les façades `board.js`, `cards.js`, `movement.js`, `turns.js` et `scoring.js` exposent des frontières sémantiques sans dupliquer les règles.

## Application

`src/application/useBoardGeneratorController.jsx` contient l'orchestration React : états, callbacks, effets et coordination. Il ne contient plus le rendu principal.

## UI

`src/ui/GameView.jsx` compose six zones spécialisées : header/phases, cycle de manche, plateau, panneau Titan, décisions et scoring.

## 3D

`src/ui/board3d/Board3D.jsx` contient uniquement la scène Three.js et ses interactions. Les constantes et assets sont dans des modules séparés.
