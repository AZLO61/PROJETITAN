import React from "react";
import { useBoardGeneratorController } from "./application/useBoardGeneratorController.jsx";
import GameView from "./ui/GameView.jsx";

export default function BoardGenerator() {
  const vm = useBoardGeneratorController();
  // Pendant l'écran de configuration, le hook retourne directement du JSX
  // (pas un viewmodel à spreader dans GameView).
  if (React.isValidElement(vm)) return vm;
  return <GameView {...vm} />;
}
