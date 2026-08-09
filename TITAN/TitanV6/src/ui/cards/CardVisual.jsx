import React from "react";
import { COLOR_HEX } from "../../domain/gameRules.js";
const CARD_CONFIG = {
  tout_casser:       { label: "Tout Casser",       force: 1, color1: "#FF6B1A", color2: "#FF2E63", icon: "💥" },
  tete_en_avant:     { label: "Tête en Avant",     force: 2, color1: "#9333EA", color2: "#5421A0", icon: "🏃" },
  graouhhh:          { label: "Graouhhh",           force: 2, color1: "#2DD4BF", color2: "#0E7C7B", icon: "😤" },
  boing_boing:       { label: "Boing Boing",        force: 2, color1: "#FFD93D", color2: "#FF6B1A", icon: "🦘" },
  faut_pas_me_chauffer: { label: "Faut Pas Me Chauffer", force: 3, color1: "#F44336", color2: "#C2185B", icon: "🔥" },
  je_ne_partage_pas: { label: "Je Ne Partage Pas", force: 3, color1: "#2D8DF5", color2: "#1E3A8A", icon: "🤐" },
};
export default function CardVisual({ cardId, selected, selectable, played, inRepos, onClick, size = "normal" }) {
  const cfg = CARD_CONFIG[cardId];
  if (!cfg) return null;
  const isSmall = size === "small";
  const w = isSmall ? 72 : 100;
  const h = isSmall ? 96 : 134;
  const opacity = played ? 0.35 : inRepos ? 0.45 : selectable === false ? 0.4 : 1;
  const border = selected
    ? "2.5px solid #16E08C"
    : selectable
    ? "2px solid rgba(255,255,255,.45)"
    : "1.5px solid rgba(255,255,255,.12)";
  const boxShadow = selected
    ? "0 0 14px rgba(22,224,140,.8)"
    : selectable
    ? "0 2px 8px rgba(0,0,0,.4)"
    : "none";

  return (
    <div
      onClick={selectable !== false && !played ? onClick : undefined}
      title={`${cfg.label} — Force ${cfg.force}${played ? " (jouée)" : inRepos ? " (Repos)" : ""}`}
      style={{
        width: w, height: h, borderRadius: 10, cursor: selectable !== false && !played ? "pointer" : "default",
        background: `linear-gradient(160deg, ${cfg.color1}22, ${cfg.color2}44)`,
        border, boxShadow, opacity,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: isSmall ? "6px 4px" : "8px 6px",
        position: "relative", transition: "box-shadow .15s, border-color .15s",
        userSelect: "none",
      }}
    >
      <div style={{
        fontSize: isSmall ? ".55rem" : ".65rem", fontFamily: "'Bowlby One', sans-serif",
        color: "#fff", textAlign: "center", lineHeight: 1.2, textShadow: "0 1px 3px rgba(0,0,0,.7)",
      }}>
        {cfg.label}
      </div>
      <div style={{ fontSize: isSmall ? "1.6rem" : "2.2rem" }}>{cfg.icon}</div>
      <div style={{
        fontSize: isSmall ? ".5rem" : ".6rem", color: "rgba(255,255,255,.7)",
        fontFamily: "'Outfit', sans-serif", textAlign: "center",
      }}>
        ⚡ F{cfg.force}
      </div>
      {played && <div style={{
        position: "absolute", inset: 0, borderRadius: 10,
        background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: ".55rem", color: "rgba(255,255,255,.7)", fontWeight: 700,
      }}>JOUÉE</div>}
      {inRepos && <div style={{
        position: "absolute", inset: 0, borderRadius: 10,
        background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: ".5rem", color: "#FFD93D", fontWeight: 700, textAlign: "center", padding: "0 4px",
      }}>REPOS</div>}
    </div>
  );
}

// ============================================================
// BANDEAU RESSOURCES TITAN
