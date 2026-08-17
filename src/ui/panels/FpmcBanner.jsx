import React from "react";
import { smallBtn } from "../styles.js";
import { TitanIcon } from "../titans/TitanVisuals.jsx";

// Retour de Nikola : "T1"/"T3" en toutes lettres dans les panneaux, alors
// que l'icône du Titan (déjà utilisée au Classement) dit la même chose plus
// vite à lire sur une tablette partagée à la table.
function TitanTag({ id, titanDisplayName }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <TitanIcon titanId={id} size={18} variant="plain" />
      {titanDisplayName ? titanDisplayName(id) : `Titan ${id}`}
    </span>
  );
}

/* ── 05 · FAUT PAS ME CHAUFFER ──
   Comparaison de mises entre l'attaquant et chaque cible, une à la fois.

   Ce bandeau vivait dans `TitanPanel.jsx`, un fichier qui ne contenait plus
   que lui et déstructurait 192 valeurs pour en utiliser 8. C'est une
   DÉCISION bloquante, au même titre que le Dilemme, le repli ou le vol de
   Phase Repos : il rejoint donc les autres bandeaux, en haut de l'écran, et
   ne s'affiche que lorsque c'est son tour (`decisionBloquante === "fpmc"`,
   arbitré par le contrôleur). */
export default function FpmcBanner({ vm }) {
  const {
    titanState,
    fpmcPendingIds,
    fpmcAttackerId,
    fpmcAttackerBase,
    fpmcCurrent,
    pickFpmcTarget,
    updateFpmcBid,
    revealFPMC,
    titanDisplayName,
  } = vm;

  const adrenalineDe = (id) => titanState.players.find((t) => t.id === id)?.adrenaline || 0;

  return (
    <div style={{
      background: "rgba(244,67,54,.1)", border: "1px solid rgba(244,67,54,.4)",
      borderRadius: 12, padding: "10px 12px", marginBottom: 12, fontSize: ".78rem",
    }}>
      <div style={{ fontFamily: "'Bowlby One', sans-serif", color: "#F44336", marginBottom: 6, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        05 · Faut Pas Me Chauffer — <TitanTag id={fpmcAttackerId} titanDisplayName={titanDisplayName} /> (somme {fpmcAttackerBase})
      </div>
      {!fpmcCurrent ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>Choisis la cible :</span>
          {fpmcPendingIds.map((id) => (
            <button key={id} onClick={() => pickFpmcTarget(id)}
              style={{ background: "rgba(244,67,54,.2)", border: "1px solid #F44336", borderRadius: 6, color: "#fff", padding: "4px 10px", fontSize: ".74rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <TitanTag id={id} titanDisplayName={titanDisplayName} />
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <TitanTag id={fpmcAttackerId} titanDisplayName={titanDisplayName} /> ({fpmcAttackerBase}) vs{" "}
            <TitanTag id={fpmcCurrent.defenderId} titanDisplayName={titanDisplayName} /> ({fpmcCurrent.defenderBase})
          </span>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: ".74rem" }}>
              Mise <TitanTag id={fpmcAttackerId} titanDisplayName={titanDisplayName} /> :
              <input type="number" min="0" max={adrenalineDe(fpmcAttackerId)}
                value={fpmcCurrent.attackerBid} onChange={(e) => updateFpmcBid("attackerBid", e.target.value)}
                style={{ width: 44, background: "rgba(255,255,255,.08)", color: "#fffaee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "2px 5px" }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: ".74rem" }}>
              Mise <TitanTag id={fpmcCurrent.defenderId} titanDisplayName={titanDisplayName} /> :
              <input type="number" min="0" max={adrenalineDe(fpmcCurrent.defenderId)}
                value={fpmcCurrent.defenderBid} onChange={(e) => updateFpmcBid("defenderBid", e.target.value)}
                style={{ width: 44, background: "rgba(255,255,255,.08)", color: "#fffaee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "2px 5px" }} />
            </label>
            <button onClick={revealFPMC} style={smallBtn(true, "#16E08C", "#00C97A")}>3-2-1 GO !</button>
          </div>
        </div>
      )}
    </div>
  );
}
