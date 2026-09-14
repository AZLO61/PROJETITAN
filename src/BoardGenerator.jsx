import React from "react";
import { useBoardGeneratorController } from "./application/useBoardGeneratorController.jsx";
import GameView from "./ui/GameView.jsx";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";

export default function BoardGenerator() {
  const vm = useBoardGeneratorController();
  /* La frontière d'erreur vit SOUS le contrôleur (2026-09-14). Celle de
     `main.jsx` est au-dessus : un plantage d'affichage démontait le contrôleur
     avec la vue, donc le moteur de la partie — chez l'hôte d'une table à
     distance, c'est la partie de tout le monde. Ici, seule la vue tombe ;
     « Réessayer » la remonte sur un moteur intact, et les invités continuent.
     Pendant l'écran de configuration, le hook retourne directement du JSX
     (pas un viewmodel à spreader dans GameView). */
  return (
    <ErrorBoundary>
      {React.isValidElement(vm) ? vm : <GameView {...vm} />}
    </ErrorBoundary>
  );
}
