import React from "react";
import { TitanIcon } from "../titans/TitanVisuals.jsx";

/* ============================================================
   CHOIX DU JOUEUR À LA RENTRÉE PAR UN COIN BLOQUÉ
   ============================================================
   Demande de Nikola du 2026-08-24 : un Titan éjecté par un coin (ex. sortie
   par I1 → rentrée en A9) qui trouve son coin bloqué à son retour ne doit
   plus se voir attribuer automatiquement l'une des deux cases également
   proches (une sur chaque rebord, ex. A8 ou B9) — c'est au joueur de
   choisir, et ça se tranche à la rentrée réelle (le plateau a pu changer
   depuis l'éjection), pas au moment où il est sorti.

   Traitement aligné sur les autres bandeaux de décision bloquante (DIL,
   Repli, FPMC) : tant que ce n'est pas tranché, rien d'autre n'avance.
============================================================ */
export default function CornerChoiceBanner({ vm }) {
  const { cornerChoice, chooseCornerEntry, titanDisplayName } = vm;
  if (!cornerChoice) return null;

  const mainColor = "#71dbff";
  const glow = "rgba(113,219,255,.45)";

  return (
    <div style={{
      background: "rgba(113,219,255,.14)",
      border: `2.5px solid ${mainColor}`,
      boxShadow: `0 0 0 3px ${glow}, 0 4px 18px ${glow}`,
      borderRadius: 14, padding: "14px 18px", marginBottom: 14, fontSize: ".9rem",
    }}>
      <div style={{
        fontFamily: "'Bowlby One', sans-serif", marginBottom: 8, fontSize: "1.05rem",
        color: "#a3e8ff", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      }}>
        <span aria-hidden="true">🥊</span>
        RENTRÉE PAR UN COIN BLOQUÉ
      </div>

      <p style={{ margin: "0 0 10px", color: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {cornerChoice.titanId != null && <TitanIcon titanId={cornerChoice.titanId} size={18} />}
        {titanDisplayName ? titanDisplayName(cornerChoice.titanId) : `Titan ${cornerChoice.titanId}`} devait rentrer par{" "}
        <strong style={{ color: "#a3e8ff" }}>{cornerChoice.coinBloque}</strong>, occupé. Choisis par où il entre :
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {cornerChoice.options.map((cle) => (
          <button
            key={cle}
            onClick={() => chooseCornerEntry(cle)}
            style={{
              background: "rgba(113,219,255,.18)", border: `1.5px solid ${mainColor}`,
              color: "#fffaee", borderRadius: 10, padding: "10px 20px",
              fontSize: ".9rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            {cle}
          </button>
        ))}
      </div>
    </div>
  );
}
