import React from "react";
import HeaderPhase from "./panels/HeaderPhase.jsx";
import RoundPanels from "./panels/RoundPanels.jsx";
import BoardPanel from "./panels/BoardPanel.jsx";
import TitanPanel from "./panels/TitanPanel.jsx";
import DilRageBanner from "./panels/DilRageBanner.jsx";
import DecisionPanels from "./panels/DecisionPanels.jsx";
import ScoringPanel from "./panels/ScoringPanel.jsx";

export default function GameView(vm) {
  return (
    <div style={{
      fontFamily: "'Outfit', Arial, sans-serif",
      background: "linear-gradient(180deg, #2d1d5d 0%, #0a0212 100%)",
      color: "#fffaee", padding: "12px 10px", borderRadius: 16,
      maxWidth: 820, margin: "0 auto", boxSizing: "border-box",
    }}>
      <HeaderPhase vm={vm} />
      {/* Bug #6 : DIL/RAGE juste sous l'en-tête — décision bloquante,
          ne doit plus être cachée en bas de l'écran après le plateau. */}
      <DilRageBanner vm={vm} />
      <RoundPanels vm={vm} />
      <BoardPanel vm={vm} />
      <TitanPanel vm={vm} />
      <DecisionPanels vm={vm} />
      <ScoringPanel vm={vm} />
    </div>
  );
}
