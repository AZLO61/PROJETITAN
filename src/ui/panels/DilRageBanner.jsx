import React from "react";
import { COLOR_HEX } from "../../domain/index.js";
import { smallBtn } from "../styles.js";
import BlockIcon from "../BlockIcon.jsx";
import { BLOCK_NAME } from "../blockNames.js";

// Bug #6 (tracker) : DIL/RAGE était rendu tout en bas de l'écran (dans
// DecisionPanels, après plateau 3D + panneau Titans), donc facilement
// manqué alors que c'est une décision BLOQUANTE (le jeu ne peut pas
// avancer tant qu'elle n'est pas résolue). Extrait ici en composant
// autonome, affiché juste sous l'en-tête de phase (cf. GameView.jsx),
// avec un traitement visuel plus imposant : bordure plus épaisse,
// halo lumineux, taille de police augmentée, icône d'alerte.
export default function DilRageBanner({ vm }) {
  const { currentDecision, decisionQueue, titanState, dilAttackerPick, dilValidateAttackerPick, resolveDilDefenderPick, resolveDilCancelWithAdrenaline, resolveRagePick, resolveRagePickAdrenaline } = vm;
  if (!currentDecision) return null;
  const isRage = currentDecision.type === "RAGE";
  const mainColor = isRage ? "#e32347" : "#2D8DF5";
  const glowColor = isRage ? "rgba(227,35,71,.45)" : "rgba(45,141,245,.45)";

  return (
    <div style={{
      background: isRage ? "rgba(227,35,71,.18)" : "rgba(45,141,245,.18)",
      border: `2.5px solid ${mainColor}`,
      boxShadow: `0 0 0 3px ${glowColor}, 0 4px 18px ${glowColor}`,
      borderRadius: 14, padding: "14px 18px", marginBottom: 14, fontSize: ".9rem",
    }}>
      <div style={{
        fontFamily: "'Bowlby One', sans-serif", marginBottom: 10, fontSize: "1.05rem",
        color: isRage ? "#ff8fa3" : "#71dbff", display: "flex", alignItems: "center", gap: 8,
      }}>
        <span aria-hidden="true">⚠️</span>
        {currentDecision.type} — {currentDecision.cardLabel} · T{currentDecision.attackerId} vs T{currentDecision.defenderId}
        {decisionQueue.length > 1 ? ` (+${decisionQueue.length - 1} en attente)` : ""}
      </div>

      {currentDecision.type === "DIL" && currentDecision.stage === "ATTACKER_PICK" && (() => {
        const defender = titanState.players.find((t) => t.id === currentDecision.defenderId);
        const availableColors = [...new Set(defender.repaire)];
        return (
          <div>
            <p style={{ marginBottom: 6 }}>T{currentDecision.attackerId} désigne 2 couleurs de T{currentDecision.defenderId} :</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {availableColors.length === 0 && <span style={{ color: "rgba(255,255,255,.5)" }}>Repaire vide.</span>}
              {availableColors.map((c) => {
                const on = currentDecision.attackerChoices.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => dilAttackerPick(c)}
                    title={`${BLOCK_NAME[c]} — ${defender.repaire.filter((x) => x === c).length} en Repaire`}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      background: on ? `${COLOR_HEX[c]}33` : "rgba(255,255,255,.06)",
                      border: `2px solid ${on ? COLOR_HEX[c] : "rgba(255,255,255,.2)"}`,
                      borderRadius: 10, color: "#fff", padding: "7px 12px", cursor: "pointer",
                      boxShadow: on ? `0 0 12px ${COLOR_HEX[c]}66` : "none",
                    }}
                  >
                    <BlockIcon color={c} size={30} />
                    <span style={{ fontSize: ".7rem", fontWeight: 700 }}>
                      {defender.repaire.filter((x) => x === c).length}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={dilValidateAttackerPick} disabled={currentDecision.attackerChoices.length !== 2}
              style={smallBtn(currentDecision.attackerChoices.length === 2, "#2D8DF5", "#1E3A8A")}>
              Valider ({currentDecision.attackerChoices.length}/2)
            </button>
          </div>
        );
      })()}

      {currentDecision.type === "DIL" && currentDecision.stage === "DEFENDER_PICK" && (() => {
        const defender = titanState.players.find((t) => t.id === currentDecision.defenderId);
        const canPay = (defender.adrenaline || 0) >= 1;
        return (
          <div>
            <p style={{ marginBottom: 6 }}>
              T{currentDecision.defenderId} : laquelle perdre ?
              {currentDecision.autoAttackerPick && (
                <span style={{ color: "rgba(255,255,255,.55)", fontSize: ".78rem" }}>
                  {" "}— l'attaquant n'avait pas le choix, ce sont les 2 seules couleurs de ton Repaire.
                </span>
              )}
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {currentDecision.attackerChoices.map((c) => (
                <button
                  key={c}
                  onClick={() => resolveDilDefenderPick(c)}
                  title={`Perdre 1 ${BLOCK_NAME[c]}`}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    background: `${COLOR_HEX[c]}22`, border: `2px solid ${COLOR_HEX[c]}`,
                    borderRadius: 10, color: "#fff", padding: "8px 14px", cursor: "pointer",
                  }}
                >
                  <BlockIcon color={c} size={34} />
                  <span style={{ fontSize: ".7rem", fontWeight: 700 }}>Perdre</span>
                </button>
              ))}
              <button onClick={resolveDilCancelWithAdrenaline} disabled={!canPay} style={{
                background: canPay ? "rgba(134,255,113,.15)" : "rgba(255,255,255,.08)",
                border: `1.5px solid ${canPay ? "#86ff71" : "rgba(255,255,255,.2)"}`,
                borderRadius: 8, color: canPay ? "#86ff71" : "rgba(255,255,255,.4)",
                padding: "6px 16px", fontSize: ".83rem", cursor: canPay ? "pointer" : "not-allowed",
              }}>
                Payer 1 💉 ({defender.adrenaline || 0}) → Annuler DIL
              </button>
            </div>
          </div>
        );
      })()}

      {currentDecision.type === "RAGE" && (() => {
        const defender = titanState.players.find((t) => t.id === currentDecision.defenderId);
        const showAdrOpt = defender.repaire.length < 2 && (defender.adrenaline || 0) > 0;
        return (
          <div>
            <p style={{ marginBottom: 6 }}>T{currentDecision.attackerId} choisit librement :</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {defender.repaire.map((c, i) => (
                <button
                  key={i}
                  onClick={() => resolveRagePick(c)}
                  title={`Prendre 1 ${BLOCK_NAME[c]}`}
                  style={{
                    background: `${COLOR_HEX[c]}22`, border: `2px solid ${COLOR_HEX[c]}`,
                    borderRadius: 10, padding: "7px 10px", cursor: "pointer",
                    display: "flex", alignItems: "center",
                  }}
                >
                  <BlockIcon color={c} size={30} />
                </button>
              ))}
              {showAdrOpt && (
                <button onClick={resolveRagePickAdrenaline} style={{
                  background: "rgba(134,255,113,.2)", border: "1.5px solid #86ff71",
                  borderRadius: 8, color: "#86ff71", padding: "6px 16px", fontSize: ".85rem", fontWeight: 700, cursor: "pointer",
                }}>💉 ({defender.adrenaline}) FAQ#5</button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
