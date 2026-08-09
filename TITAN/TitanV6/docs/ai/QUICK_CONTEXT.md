# AI Quick Context

## Mission
Titan is a React/Vite game. The current repository is a refactor of the supplied `BoardGenerator_V4_15.jsx` source. The refactor goal is structural: preserve gameplay behavior while making the code easier to maintain and reason about.

## Source of truth
- Gameplay rules: `src/domain/gameRules.js`
- Public domain API: `src/domain/index.js`
- Application orchestration: `src/application/useBoardGeneratorController.jsx`
- UI composition: `src/ui/GameView.jsx`
- 3D rendering: `src/ui/board3d/Board3D.jsx`
- AI state contract: `src/ai/state.js`
- AI command contract: `src/ai/actions.js`
- JSON contracts: `schemas/`

## Dependency direction
`ui -> application -> domain`

`ai -> application/domain contracts`

The domain must not import React, Three.js, DOM APIs, or UI modules.

## Safe change rule
Do not alter gameplay rules during cleanup/refactoring. A gameplay change requires an explicit specification change and a regression test.

## Where to work
- Board generation/end-game rules: `src/domain/board.js` / `gameRules.js`
- Cards: `src/domain/cards.js` / `gameRules.js`
- Movement: `src/domain/movement.js` / `gameRules.js`
- Turns/rest/recovery: `src/domain/turns.js` / `gameRules.js`
- Scoring: `src/domain/scoring.js` / `gameRules.js`
- Player flow/AI timing/UI callbacks: `src/application/useBoardGeneratorController.jsx`
- Visual changes: `src/ui/`

## Validation
Run:

```bash
npm install
npm run check
npm run build
```

Never use the UI layer as a substitute for a domain rule.
