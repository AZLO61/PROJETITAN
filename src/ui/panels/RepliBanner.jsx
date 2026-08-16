import React from "react";
import { TitanIcon } from "../titans/TitanVisuals.jsx";

/* ============================================================
   REPLI D'UN ÉLÉMENT ARRÊTÉ FAUTE DE PUISSANCE
   ============================================================
   Ruling Nikola du 2026-08-17 : un élément projeté qui percute quelque chose
   sans avoir l'énergie de le déplacer ou de le casser ne finit PAS son
   déplacement. Le TITAN INITIATEUR choisit alors où le poser, parmi la case
   d'où l'élément venait et celles qui touchent à la fois cette case et la
   case visée.

   Traitement visuel aligné sur DIL/RAGE et Vol Phase Repos : c'est une
   décision bloquante de plus, elle doit se reconnaître comme telle. Elle est
   montée juste sous elles dans GameView.

   Le choix se fait EN CLIQUANT UNE CASE DU PLATEAU, pas un bouton d'une
   liste : la décision est géométrique, la lire sur le plateau demande moins
   d'effort que de traduire « B8 » en position. Ce bandeau ne porte donc que
   la consigne et le compteur ; le surlignage vit dans la grille.
============================================================ */
export default function RepliBanner({ vm }) {
  const { currentRepli, repliQueue, titanDisplayName } = vm;
  if (!currentRepli) return null;

  const mainColor = "#fb923c";
  const glow = "rgba(251,146,60,.45)";
  const quoi = currentRepli.titanId != null
    ? `${titanDisplayName ? titanDisplayName(currentRepli.titanId) : `Titan ${currentRepli.titanId}`}`
    : "Le débris";

  return (
    <div style={{
      background: "rgba(251,146,60,.16)",
      border: `2.5px solid ${mainColor}`,
      boxShadow: `0 0 0 3px ${glow}, 0 4px 18px ${glow}`,
      borderRadius: 14, padding: "14px 18px", marginBottom: 14, fontSize: ".9rem",
    }}>
      <div style={{
        fontFamily: "'Bowlby One', sans-serif", marginBottom: 8, fontSize: "1.05rem",
        color: "#ffb877", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      }}>
        <span aria-hidden="true">🧱</span>
        ARRÊT FAUTE DE PUISSANCE
        {repliQueue.length > 1 && (
          <span style={{ fontFamily: "inherit", fontSize: ".8rem", opacity: .75 }}>
            (+{repliQueue.length - 1} en attente)
          </span>
        )}
      </div>

      <p style={{ margin: "0 0 8px", color: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {currentRepli.initiatorId != null && <TitanIcon titanId={currentRepli.initiatorId} size={18} />}
        {quoi} n'a pas pu franchir <strong style={{ color: "#ffb877" }}>{currentRepli.cible}</strong> et
        s'arrête là. À toi de choisir où il se pose.
      </p>

      <div style={{ fontSize: ".78rem", color: "#ffb877", fontWeight: 700 }}>
        👆 Clique une case orange sur le plateau ({currentRepli.cases.length} possibles)
      </div>
      <p style={{ margin: "6px 0 0", fontSize: ".7rem", color: "rgba(255,255,255,.5)" }}>
        Sa case de départ, ou une case qui touche à la fois sa case et celle qu'il visait.
        {currentRepli.defaut && ` Sans choix de ta part, il resterait en ${currentRepli.defaut}.`}
      </p>
      {/* Ruling Nikola du 2026-08-18 : viser un adversaire est un vrai coup,
          pas un accident de trajectoire. Il fallait le dire à l'endroit où le
          choix se fait — sans ça, personne ne pense à cliquer une case
          occupée, et la case de piste ADN reste sur la table. */}
      {currentRepli.titanId != null && (
        <p style={{ margin: "6px 0 0", fontSize: ".72rem", color: "#ffb877" }}>
          💪 Une case occupée par un autre Titan est un choix valide : tu l'en chasses
          d'une case, et ça te rapporte 1 Bagarre.
        </p>
      )}
    </div>
  );
}
