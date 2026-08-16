import React from "react";
import { COLOR_HEX, SOCLE_OPTION, getDilOptions } from "../../domain/index.js";
import { smallBtn } from "../styles.js";
import BlockIcon from "../BlockIcon.jsx";
import { BLOCK_NAME } from "../blockNames.js";

/* Vignette d'une option de Dilemme. Une option est soit une COULEUR du
   Repaire, soit « un Socle tiré au sort » (livret V36.2). Le Socle est
   volontairement ANONYME : on affiche combien la cible en possède, jamais
   leurs valeurs. Ni l'attaquant qui le propose ni la cible qui l'abandonne ne
   savent lequel partira — c'est ce qui empêche le Dilemme de devenir un
   sniper à 4 points. */
function OptionIcon({ option, size = 30 }) {
  if (option !== SOCLE_OPTION) return <BlockIcon color={option} size={size} />;
  return (
    <img
      src={`${import.meta.env.BASE_URL}assets/rules/socle.png`}
      alt="" aria-hidden="true"
      style={{ width: size, height: size, objectFit: "contain", filter: "brightness(1.25)", display: "block" }}
    />
  );
}

const optionAccent = (option) => (option === SOCLE_OPTION ? "#d8d8d8" : COLOR_HEX[option]);
const optionNom = (option) => (option === SOCLE_OPTION ? "Socle" : BLOCK_NAME[option]);
const compteOption = (defender, option) =>
  option === SOCLE_OPTION
    ? (defender.socles || []).length
    : defender.repaire.filter((x) => x === option).length;

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
      </div>
      {/* TITAN PAR TITAN. Une seule carte peut ouvrir plusieurs décisions —
          un Graouhhh qui aligne trois Titans en ouvre trois. Elles se
          règlent une par une, et le compteur dit où l'on en est plutôt que
          combien il en reste : « 1 sur 3 » se lit tout de suite, « +2 en
          attente » demandait de faire le calcul (demande Nikola du
          2026-08-18, « fais Titan par Titan pour Graouhhh »). */}
      {decisionQueue.length > 1 && (
        <div style={{
          fontSize: ".72rem", color: "rgba(255,255,255,.65)", marginBottom: 8,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span aria-hidden="true">🎯</span>
          Cible 1 sur {decisionQueue.length} — les suivantes s'afficheront une fois celle-ci tranchée.
        </div>
      )}

      {currentDecision.type === "DIL" && currentDecision.stage === "ATTACKER_PICK" && (() => {
        const defender = titanState.players.find((t) => t.id === currentDecision.defenderId);
        // Couleurs du Repaire + « un Socle tiré au sort » si la cible en a.
        const options = getDilOptions(currentDecision.defenderId, { titans: titanState.players });
        return (
          <div>
            <p style={{ marginBottom: 6 }}>T{currentDecision.attackerId} désigne 2 options chez T{currentDecision.defenderId} :</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {options.length === 0 && <span style={{ color: "rgba(255,255,255,.5)" }}>Repaire vide.</span>}
              {options.map((c) => {
                const on = currentDecision.attackerChoices.includes(c);
                const accent = optionAccent(c);
                return (
                  <button
                    key={c}
                    onClick={() => dilAttackerPick(c)}
                    title={c === SOCLE_OPTION
                      ? `Un Socle TIRÉ AU SORT parmi les ${compteOption(defender, c)} de T${currentDecision.defenderId} — tu ne choisis pas lequel, et tu ne connais pas sa valeur avant le tirage`
                      : `${BLOCK_NAME[c]} — ${compteOption(defender, c)} en Repaire`}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      background: on ? `${accent}33` : "rgba(255,255,255,.06)",
                      border: `2px ${c === SOCLE_OPTION ? "dashed" : "solid"} ${on ? accent : "rgba(255,255,255,.2)"}`,
                      borderRadius: 10, color: "#fff", padding: "7px 12px", cursor: "pointer",
                      boxShadow: on ? `0 0 12px ${accent}66` : "none",
                    }}
                  >
                    <OptionIcon option={c} />
                    <span style={{ fontSize: ".7rem", fontWeight: 700 }}>
                      {c === SOCLE_OPTION ? `? ×${compteOption(defender, c)}` : compteOption(defender, c)}
                    </span>
                  </button>
                );
              })}
            </div>
            {options.includes(SOCLE_OPTION) && (
              <p style={{ margin: "0 0 8px", fontSize: ".72rem", color: "rgba(255,255,255,.55)" }}>
                🗿 L'option Socle est tirée au sort : tu ne choisis pas lequel, et personne n'en connaît la valeur avant le tirage.
              </p>
            )}
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
                  {" "}— l'attaquant n'avait pas le choix, ce sont les 2 seules options de ton Repaire.
                </span>
              )}
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {currentDecision.attackerChoices.map((c) => (
                <button
                  key={c}
                  onClick={() => resolveDilDefenderPick(c)}
                  title={c === SOCLE_OPTION
                    ? `Perdre 1 Socle TIRÉ AU SORT parmi tes ${compteOption(defender, c)} — tu ne choisis pas lequel`
                    : `Perdre 1 ${BLOCK_NAME[c]}`}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    background: `${optionAccent(c)}22`,
                    border: `2px ${c === SOCLE_OPTION ? "dashed" : "solid"} ${optionAccent(c)}`,
                    borderRadius: 10, color: "#fff", padding: "8px 14px", cursor: "pointer",
                  }}
                >
                  <OptionIcon option={c} size={34} />
                  <span style={{ fontSize: ".7rem", fontWeight: 700 }}>
                    {c === SOCLE_OPTION ? `Socle au hasard (${compteOption(defender, c)})` : "Perdre"}
                  </span>
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
              {/* Le libellé était « 💉 (2) FAQ#5 » : une référence interne au
                  numéro de FAQ, illisible en pleine partie (remonté par
                  Nikola le 2026-08-17, « ça ne veut rien dire »). Il dit
                  maintenant ce que le bouton FAIT. */}
              {showAdrOpt && (
                <button
                  onClick={resolveRagePickAdrenaline}
                  title="La cible n'a pas assez de blocs : son Adrénaline est une ressource comme une autre, tu peux la lui prendre."
                  style={{
                    background: "rgba(134,255,113,.2)", border: "1.5px solid #86ff71",
                    borderRadius: 8, color: "#86ff71", padding: "6px 16px", fontSize: ".85rem", fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  💉 Prendre 1 Adrénaline
                  <span style={{ opacity: .7, fontWeight: 400 }}>({defender.adrenaline} dispo)</span>
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
