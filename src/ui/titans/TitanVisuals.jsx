import React from "react";
import { TITAN_COLORS } from "./constants.js";
import { TITAN_SPRITE_KEY, SPRITE_DATA } from "../board3d/constants.js";

export function TitanIcon({ titanId, size = 28, variant = "gradient" }) {
  const key = TITAN_SPRITE_KEY[titanId] || "escargot";
  const src = SPRITE_DATA[key];
  const tc = TITAN_COLORS[titanId];
  // variant="border" : panneau de configuration — contour de la couleur du
  // Titan sur fond neutre, plutôt qu'un aplat en dégradé (demande explicite).
  const isBorder = variant === "border";
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
      background: isBorder ? "rgba(255,255,255,.06)" : (tc?.gradient || "rgba(255,255,255,.1)"),
      border: isBorder ? `2px solid ${tc?.accent || "rgba(255,255,255,.4)"}` : "none",
      boxSizing: "border-box",
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    }}>
      <img src={src} alt={key} style={{ maxWidth: "88%", maxHeight: "88%", width: "auto", height: "auto", objectFit: "contain", display: "block", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.6))" }} />
    </div>
  );
}

export function TitanBadge({ titanId }) {
  const key = TITAN_SPRITE_KEY[titanId] || "escargot";
  const src = SPRITE_DATA[key];
  return <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, overflow: "hidden" }}><img src={src} alt={key} style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", display: "block", imageRendering: "auto", filter: "drop-shadow(0 1px 3px rgba(0,0,0,.7))" }} /></div>;
}
