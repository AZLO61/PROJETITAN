import React from "react";
import { smallBtn } from "../styles.js";

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
  } = vm;

  const adrenalineDe = (id) => titanState.players.find((t) => t.id === id)?.adrenaline || 0;

  return (
    <div style={{
      background: "rgba(244,67,54,.1)", border: "1px solid rgba(244,67,54,.4)",
      borderRadius: 12, padding: "10px 12px", marginBottom: 12, fontSize: ".78rem",
    }}>
      <div style={{ fontFamily: "'Bowlby One', sans-serif", color: "#F44336", marginBottom: 6 }}>
        05 · Faut Pas Me Chauffer — T{fpmcAttackerId} (somme {fpmcAttackerBase})
      </div>
      {!fpmcCurrent ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>Choisis la cible :</span>
          {fpmcPendingIds.map((id) => (
            <button key={id} onClick={() => pickFpmcTarget(id)}
              style={{ background: "rgba(244,67,54,.2)", border: "1px solid #F44336", borderRadius: 6, color: "#fff", padding: "4px 10px", fontSize: ".74rem", cursor: "pointer" }}>
              Titan {id}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span>T{fpmcAttackerId} ({fpmcAttackerBase}) vs T{fpmcCurrent.defenderId} ({fpmcCurrent.defenderBase})</span>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: ".74rem" }}>
              Mise T{fpmcAttackerId} :
              <input type="number" min="0" max={adrenalineDe(fpmcAttackerId)}
                value={fpmcCurrent.attackerBid} onChange={(e) => updateFpmcBid("attackerBid", e.target.value)}
                style={{ width: 44, background: "rgba(255,255,255,.08)", color: "#fffaee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "2px 5px" }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: ".74rem" }}>
              Mise T{fpmcCurrent.defenderId} :
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
