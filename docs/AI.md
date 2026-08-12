# IA

L'IA doit consommer une projection de l'état via `createAiState` et produire une commande via `createAiCommand`.

Elle ne doit jamais dépendre de :

- React ;
- hooks ;
- DOM ;
- Three.js ;
- styles ;
- composants UI.

Le moteur du domaine reste responsable de la légalité des actions. L'IA choisit ; le moteur valide et exécute.
