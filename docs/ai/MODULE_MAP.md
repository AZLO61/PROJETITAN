# AI Module Map

| Area | Entry point | Responsibility |
|---|---|---|
| Domain | `src/domain/index.js` | Canonical gameplay functions/constants |
| Board | `src/domain/board.js` | Board generation and end-game board checks |
| Cards | `src/domain/cards.js` | Card rules and card resolution |
| Movement | `src/domain/movement.js` | Reachability, paths, teleporters, free movement |
| Turns | `src/domain/turns.js` | Programming, recovery, fatigue, rest |
| Scoring | `src/domain/scoring.js` | Barèmes and final scoring |
| Application | `src/application/useBoardGeneratorController.jsx` | React state orchestration and user/AI flow |
| AI state | `src/ai/state.js` | Compact state snapshot boundary |
| AI commands | `src/ai/actions.js` | Valid AI command types |
| Main UI | `src/ui/GameView.jsx` | UI composition |
| 2D board | `src/ui/panels/BoardPanel.jsx` | Board display and interactions |
| 3D board | `src/ui/board3d/Board3D.jsx` | Three.js scene and 3D interactions |

## Important
The small domain files are semantic facades around `gameRules.js` in V6. This is intentional: it provides stable module boundaries without duplicating or rewriting rule implementations.
