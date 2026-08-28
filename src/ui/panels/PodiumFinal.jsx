import React from "react";
import { T, marquee, readout, label, prose } from "../theme.js";
import { TitanIcon } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";

/* ── LE PODIUM ─────────────────────────────────────────────
   Nikola, 2026-08-28 : « quand on connaît vraiment le classement final, [il
   faut] un panneau plus sympa, qui est enlevable pour revenir sur l'interface
   actuelle et consulter des choses ».

   Les deux moitiés de la phrase comptent autant l'une que l'autre.

   « PLUS SYMPA » : la fin de partie s'annonçait par une ligne de médaille dans
   un tableau de décompte à onze lignes. Après 1 h 30, le moment où l'on
   apprend qui a gagné mérite mieux qu'une cellule de tableau — c'est le seul
   instant de la partie qui n'a aucune décision à porter, donc le seul où
   l'écran peut se permettre d'être grand.

   « ENLEVABLE » : et c'est la contrainte qui interdit d'en faire un écran de
   fin classique. Le ruling du 2026-08-19 (point 4.4) impose que le plateau et
   le décompte restent consultables APRÈS la fin — on rejoue la partie de tête,
   on vérifie qui avait quoi. Le podium se ferme donc, et se rouvre : il ne
   remplace jamais l'interface, il se pose dessus.

   ⚠️ « QUAND ON CONNAÎT VRAIMENT le classement » : pas à `gameOver`. Tant
   qu'un Bloc Vert n'est pas placé, les totaux affichés sont faux et le
   classement peut encore basculer. C'est `classement` qui décide, et il
   n'arrive qu'une fois les Verts révélés. */
export default function PodiumFinal({ classement, titanDisplayName, titanModes, onClose }) {
  React.useEffect(() => {
    const auClavier = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [onClose]);

  if (!classement || classement.length === 0) return null;

  const MEDAILLES = { 1: "🥇", 2: "🥈", 3: "🥉" };
  const vainqueurs = classement.filter((l) => l.rang === 1);
  const exAequo = vainqueurs.length > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Classement final"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9600,
        background: "rgba(12,8,32,.93)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "4vh 16px", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 620,
          background: T.screen,
          border: `2.5px solid ${T.you}`,
          borderRadius: T.rPlate,
          boxShadow: `0 0 0 4px rgba(255,217,61,.22), 0 22px 60px rgba(0,0,0,.75)`,
          padding: "22px 24px 20px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: "2.2rem", lineHeight: 1, marginBottom: 6 }} aria-hidden="true">🏆</div>
          <h2 style={{ ...marquee("clamp(1.1rem, 3vw, 1.5rem)", T.you), marginBottom: 4 }}>
            {exAequo
              ? "Égalité parfaite"
              : `${titanDisplayName(vainqueurs[0].id)} remporte BIG CITY`}
          </h2>
          <p style={{ ...prose(T.dim, T.small), margin: 0 }}>
            {exAequo
              ? "Les quatre critères de départage n'ont rien pu séparer."
              : `${vainqueurs[0].total} points au décompte final.`}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
          {classement.map((ligne) => {
            const premier = ligne.rang === 1;
            const accent = TITAN_COLORS[ligne.id]?.accent ?? T.you;
            return (
              <div
                key={ligne.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: premier ? `color-mix(in srgb, ${accent} 16%, rgba(0,0,0,.3))` : "rgba(0,0,0,.26)",
                  border: `${premier ? "2px" : "1.5px"} solid ${premier ? accent : T.rule}`,
                  borderRadius: T.rPlate,
                  padding: premier ? "12px 14px" : "9px 14px",
                }}
              >
                <span style={{ fontSize: premier ? "1.5rem" : "1.1rem", width: 30, textAlign: "center" }} aria-hidden="true">
                  {MEDAILLES[ligne.rang] ?? ligne.rang}
                </span>
                <TitanIcon titanId={ligne.id} size={premier ? 34 : 26} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...marquee(premier ? "1rem" : ".86rem", premier ? accent : T.text), display: "block" }}>
                    {titanDisplayName(ligne.id)}
                  </span>
                  <span style={label(T.faint, T.micro)}>
                    {titanModes?.[ligne.id] === "ia" ? "IA" : "Joueur"}
                  </span>
                </span>
                <span style={readout(premier ? "1.35rem" : "1.05rem", premier ? accent : T.text)}>
                  {ligne.total}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={onClose}
            style={{
              background: T.you, border: `${T.edgeW} solid ${T.edge}`, borderRadius: T.rChip,
              color: "#120d02", padding: "10px 18px", fontWeight: 700, cursor: "pointer",
              boxShadow: `0 3px 0 ${T.edge}`,
            }}
          >
            Revenir au plateau
          </button>
        </div>
        <p style={{ ...prose(T.faint, T.micro), textAlign: "center", margin: "9px 0 0" }}>
          Le plateau, le décompte et le journal restent consultables — rien n'est effacé.
        </p>
      </div>
    </div>
  );
}
