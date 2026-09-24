# IA

Les Titans robots vivent dans le domaine : `aiPlanner.js` énumère les coups légaux et les simule avec les vrais résolveurs, `aiEvaluation.js` note chaque position au score réel (`computeFinalScore`). Le contrôleur lance la recherche par `penser` (`src/application/penseeIA.js`), dans un Web Worker quand le navigateur en a un.

Elle ne doit jamais dépendre de :

- React ;
- hooks ;
- DOM ;
- Three.js ;
- styles ;
- composants UI.

Le moteur du domaine reste responsable de la légalité des actions. L'IA choisit ; le moteur valide et exécute.
