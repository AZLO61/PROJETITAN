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
    session,
    titanMasque,
    titanModes,
    fpmcRevelateur,
  } = vm;

  const adrenalineDe = (id) => titanState.players.find((t) => t.id === id)?.adrenaline || 0;

  /* ── À DISTANCE, CHACUN SA MISE, ET LE DÉFENSEUR RÉVÈLE ──
     Nikola, 2026-09-16 : « c'est le défenseur qui fait que ça se révèle ».
     Autour d'une seule tablette, rien ne change : tout le monde voit tout et
     n'importe qui lance le « 3-2-1 GO ». À distance, un appareil ne règle que
     la mise des Titans qu'il tient — celle d'en face reste « ? » jusqu'à la
     révélation — et le bouton n'existe que chez celui qui révèle. */
  const aDistance = Boolean(session);
  // La mise d'une IA est la sienne, même autour d'une seule tablette : elle
  // reste « ? » jusqu'à la révélation (audit du 2026-09-23).
  const tenu = (id) => titanModes[id] !== "ia" && (!aDistance || !titanMasque(id));
  const peutReveler = !aDistance || !titanMasque(fpmcRevelateur);

  return (
    <div style={{
      background: "rgba(244,67,54,.1)", border: "1px solid rgba(244,67,54,.4)",
      borderRadius: 12, padding: "10px 12px", marginBottom: 12, fontSize: "var(--fs-micro)",
    }}>
      <div style={{ fontFamily: "'Bowlby One', sans-serif", color: "#F44336", marginBottom: 6, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        05 · Faut Pas Me Chauffer — <TitanTag id={fpmcAttackerId} titanDisplayName={titanDisplayName} /> (somme {fpmcAttackerBase})
      </div>
      {!fpmcCurrent ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>Choisis la cible :</span>
          {fpmcPendingIds.map((id) => (
            <button key={id} onClick={() => pickFpmcTarget(id)}
              style={{ background: "rgba(244,67,54,.2)", border: "1px solid #F44336", borderRadius: 6, color: "#fff", padding: "4px 10px", fontSize: "var(--fs-micro)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
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
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--fs-micro)" }}>
              Mise <TitanTag id={fpmcAttackerId} titanDisplayName={titanDisplayName} /> :
              {tenu(fpmcAttackerId) ? (
                <input type="number" min="0" max={adrenalineDe(fpmcAttackerId)}
                  value={fpmcCurrent.attackerBid ?? 0} onChange={(e) => updateFpmcBid("attackerBid", e.target.value)}
                  style={{ width: 44, background: "rgba(255,255,255,.08)", color: "#fffaee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "2px 5px" }} />
              ) : <span>?</span>}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--fs-micro)" }}>
              Mise <TitanTag id={fpmcCurrent.defenderId} titanDisplayName={titanDisplayName} /> :
              {tenu(fpmcCurrent.defenderId) ? (
                <input type="number" min="0" max={adrenalineDe(fpmcCurrent.defenderId)}
                  value={fpmcCurrent.defenderBid ?? 0} onChange={(e) => updateFpmcBid("defenderBid", e.target.value)}
                  style={{ width: 44, background: "rgba(255,255,255,.08)", color: "#fffaee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "2px 5px" }} />
              ) : <span>?</span>}
            </label>
            {peutReveler ? (
              <button onClick={revealFPMC} style={smallBtn(true, "#16E08C", "#00C97A")}>3-2-1 GO !</button>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <TitanTag id={fpmcRevelateur} titanDisplayName={titanDisplayName} /> lance le 3-2-1 GO
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
