import React from "react";
import { COLOR_HEX } from "../../domain/index.js";
import { smallBtn } from "../styles.js";

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
              {availableColors.map((c) => (
                <button key={c} onClick={() => dilAttackerPick(c)} style={{
                  background: currentDecision.attackerChoices.includes(c) ? COLOR_HEX[c] : "rgba(255,255,255,.08)",
                  border: `2px solid ${COLOR_HEX[c]}`, borderRadius: 8, color: "#fff",
                  padding: "5px 14px", fontSize: ".85rem", cursor: "pointer", fontWeight: 700,
                }}>{c}</button>
              ))}
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
            <p style={{ marginBottom: 6 }}>T{currentDecision.defenderId} : laquelle perdre ?</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {currentDecision.attackerChoices.map((c) => (
                <button key={c} onClick={() => resolveDilDefenderPick(c)} style={{
                  background: COLOR_HEX[c], border: "none", borderRadius: 8, color: "#fff",
                  padding: "6px 16px", fontSize: ".85rem", fontWeight: 700, cursor: "pointer",
                }}>Perdre {c}</button>
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
                <button key={i} onClick={() => resolveRagePick(c)} style={{
                  background: COLOR_HEX[c], border: "none", borderRadius: 8, color: "#fff",
                  padding: "6px 16px", fontSize: ".85rem", fontWeight: 700, cursor: "pointer",
                }}>{c}</button>
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
