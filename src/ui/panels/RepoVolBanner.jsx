import React from "react";
import { smallBtn } from "../styles.js";
import { TitanIcon } from "../titans/TitanVisuals.jsx";

// Refonte UI (demande explicite) : appliquer le pattern DIL/RAGE — décision
// bloquante affichée juste sous l'en-tête, explication en une phrase, et
// UNIQUEMENT les choix valides — à d'autres points du jeu. Ce banner était
// auparavant noyé dans RoundPanels, avec un traitement visuel plus léger
// que DilRageBanner (pas de glow, bordure fine). Extrait ici en composant
// autonome, monté au même endroit (juste sous DilRageBanner dans
// GameView.jsx), avec exactement le même traitement visuel (bordure
// épaisse, halo lumineux, gros titre) pour que les deux décisions
// bloquantes du jeu (DIL/RAGE et Vol Phase Repos) soient immédiatement
// reconnaissables comme telles, où qu'on soit dans l'écran.
export default function RepoVolBanner({ vm }) {
  const { phase, mancheNumber, titanState, titanModes, volDirection, chooseVolDirection, titanDisplayName } = vm;
  if (phase !== "repos") return null;

  const mainColor = "#e32347";
  const glowColor = "rgba(227,35,71,.45)";
  const detonateurId = titanState.detonateur;
  /* Le sens de la chaîne appartient au DÉTONATEUR. Les deux boutons étaient
     posés à l'écran quel que soit le propriétaire du jeton : c'était donc
     toujours l'humain qui tranchait, même quand le Détonateur était une IA
     (bug remonté par Nikola le 2026-08-17). Une IA Détonateur décide
     désormais elle-même — voir l'effet dédié dans le contrôleur — et ce
     bandeau se contente de l'annoncer. */
  const detonateurEstIa = titanModes && titanModes[detonateurId] === "ia";

  return (
    <div style={{
      background: "rgba(227,35,71,.18)",
      border: `2.5px solid ${mainColor}`,
      boxShadow: `0 0 0 3px ${glowColor}, 0 4px 18px ${glowColor}`,
      borderRadius: 14, padding: "14px 18px", marginBottom: 14, fontSize: ".9rem",
    }}>
      <div style={{
        fontFamily: "'Bowlby One', sans-serif", marginBottom: 10, fontSize: "1.05rem",
        color: "#ff8fa3", display: "flex", alignItems: "center", gap: 8,
      }}>
        <span aria-hidden="true">🎴</span>
        VOL EN CHAÎNE — Phase Repos M{mancheNumber}
      </div>

      {!volDirection ? (
        <div>
          <p style={{ marginBottom: 8, color: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <TitanIcon titanId={detonateurId} size={18} /> {titanDisplayName ? titanDisplayName(detonateurId) : `Titan ${detonateurId}`} (Détonateur) choisit le sens de la chaîne :
          </p>
          {detonateurEstIa ? (
            <div style={{ color: "#a855f7", fontWeight: 700, fontSize: ".8rem" }}>
              🤖 Ce n'est pas ton choix — le Détonateur est une IA, elle tranche elle-même…
            </div>
          ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => chooseVolDirection("gauche")} style={smallBtn(true, "#e32347", "#C2185B")}>
              ⬅️ Gauche
            </button>
            <button onClick={() => chooseVolDirection("droite")} style={smallBtn(true, "#e32347", "#C2185B")}>
              ➡️ Droite
            </button>
          </div>
          )}
          <p style={{ marginTop: 8, fontSize: ".72rem", color: "rgba(255,255,255,.5)" }}>
            Dans ce sens, chaque Titan vole ensuite, à l'aveugle, 1 carte à son voisin — posée face visible en Zone Repos (consultable en permanence dans le bandeau de chaque Titan, jusqu'à la Manche {mancheNumber + 2}).
          </p>
        </div>
      ) : (
        <div style={{ color: "#16E08C", fontSize: ".8rem" }}>
          ✅ Vol résolu (sens {volDirection === "gauche" ? "⬅️ antihoraire" : "➡️ horaire"}) — voir le journal d'actions ci-dessous.
        </div>
      )}
    </div>
  );
}
