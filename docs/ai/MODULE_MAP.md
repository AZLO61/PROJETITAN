# AI Module Map

| Area | Entry point | Responsibility |
|---|---|---|
| Domain | `src/domain/index.js` | Canonical gameplay functions/constants |
| Rules | `src/domain/gameRules.js` | Board, cards, movement, turns, scoring |
| Robot Titans | `src/domain/aiPlanner.js` / `aiEvaluation.js` | Move search, decisions, position scoring |
| Simulation | `src/domain/simulation.js` | Seeded campaigns (`npm run simulate`, `duel`, `forces`) |
| Application | `src/application/useBoardGeneratorController.jsx` | React state orchestration and user/AI flow |
| AI worker | `src/application/penseeIA.js` / `iaWorker.js` | Runs the search off the main thread |
| Main UI | `src/ui/GameView.jsx` | UI composition |
| 2D board | `src/ui/panels/BoardPanel.jsx` | Board display and interactions |
| 3D board | `src/ui/board3d/Board3D.jsx` | Three.js scene and 3D interactions |
