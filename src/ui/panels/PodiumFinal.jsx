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
/* ── UN BÂTIMENT DU PODIUM ──
   Nikola, 2026-09-23 : « un petit podium des bâtiments 3D fissurés […] tu
   prends comme référence un podium pour la hauteur ». Trois faces (façade,
   toit, flanc) dans la couleur du Titan, éclaircies ou assombries par un voile
   plutôt que par trois teintes calculées ; des fenêtres ; deux fissures,
   parce qu'à BIG CITY rien ne reste debout intact.

   VRAIMENT RECTANGLE (Nikola, 2026-09-23 : « les angles ne sont pas tous
   bons »). Le coin arraché rognait un angle du toit : il est retiré, et
   chaque face reçoit le cerne noir des touches du jeu, qui marque les arêtes
   franchement — la façade est un rectangle, le toit et le flanc deux
   parallélogrammes d'une même projection oblique. */
const LARGEUR = 92, PROF_X = 14, PROF_Y = 10;
function Batiment({ hauteur, couleur, rang }) {
  const W = LARGEUR, D = PROF_X, E = PROF_Y, H = hauteur;
  const toit = `0,${E} ${D},0 ${W + D},0 ${W},${E}`;
  const flanc = `${W},${E} ${W + D},0 ${W + D},${H} ${W},${H + E}`;
  const fenetres = [];
  for (let y = E + 10; y + 10 < E + H - 30; y += 17) {
    for (const x of [14, 40, 66]) fenetres.push(<rect key={`${x}-${y}`} x={x} y={y} width="12" height="9" />);
  }
  return (
    /* 1 px de marge autour : le cerne est centré sur l'arête, sa moitié
       extérieure serait coupée par le bord du dessin. */
    <svg width={W + D + 2} height={H + E + 2} viewBox={`-1 -1 ${W + D + 2} ${H + E + 2}`} aria-hidden="true" style={{ display: "block" }}>
      {/* Façade */}
      <rect x="0" y={E} width={W} height={H} fill={couleur} />
      {/* Toit, éclairé */}
      <polygon points={toit} fill={couleur} />
      <polygon points={toit} fill="#fff" opacity=".35" />
      {/* Flanc, dans l'ombre */}
      <polygon points={flanc} fill={couleur} />
      <polygon points={flanc} fill="#000" opacity=".45" />
      <g fill="#000" opacity=".35">{fenetres}</g>
      {/* Fissures */}
      <path
        d={`M${W * 0.34},${E} l6,${H * 0.14} l-7,${H * 0.1} l9,${H * 0.13} l-4,${H * 0.1}`}
        fill="none" stroke="#120d02" strokeWidth="2" strokeLinejoin="miter" opacity=".75"
      />
      <path
        d={`M${W},${E + H * 0.42} l-11,6 l-6,-5 l-10,9`}
        fill="none" stroke="#120d02" strokeWidth="1.6" opacity=".7"
      />
      {/* Les arêtes, par-dessus tout le reste */}
      <g fill="none" stroke="#120d02" strokeWidth="1.5" strokeLinejoin="miter">
        <rect x="0" y={E} width={W} height={H} />
        <polygon points={toit} />
        <polygon points={flanc} />
      </g>
      <text
        x={W / 2} y={E + H - 9} textAnchor="middle"
        style={{ font: `900 ${rang === 1 ? 26 : 20}px var(--font-marquee)`, fill: "#120d02" }}
      >
        {rang}
      </text>
    </svg>
  );
}

/* ── LA COURONNE DU ROI ──
   Nikola, 2026-09-23 : « le titre du panneau de victoire : "…" est le roi de
   BIG CITY, avec une petite couronne quelque part ». Elle coiffe l'icône du
   vainqueur sur le podium, penchée comme posée à la va-vite. */
function Couronne() {
  return (
    <svg width="26" height="19" viewBox="0 0 26 19" aria-hidden="true"
      style={{ display: "block", transform: "rotate(-12deg)", marginBottom: -5, position: "relative", zIndex: 1 }}>
      <path d="M2 17V6l6 5 5-9 5 9 6-5v11z" fill="#FFD93D" stroke="#120d02" strokeWidth="1.5" strokeLinejoin="miter" />
      <circle cx="13" cy="2.5" r="1.8" fill="#f44336" stroke="#120d02" strokeWidth="1" />
      <path d="M2 14h22" stroke="#120d02" strokeWidth="1.2" />
    </svg>
  );
}

/* Hauteurs d'un podium olympique : le 1er domine, le 2e à peu près aux deux
   tiers, le 3e à la moitié. Dans l'ordre d'affichage 2 · 1 · 3. */
const HAUTEUR_PAR_PLACE = { 1: 112, 2: 80, 3: 58 };

export default function PodiumFinal({ classement, titanDisplayName, titanModes, onClose }) {
  React.useEffect(() => {
    const auClavier = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [onClose]);

  if (!classement || classement.length === 0) return null;

  const MEDAILLES = { 1: "🥇", 2: "🥈", 3: "🥉" };
  const podium = [classement[1], classement[0], classement[2]].filter(Boolean);
  const suite = classement.slice(3);
  /* L'égalité parfaite se lit sur `exAequo`, pas sur le rang : `classementFinal`
     numérote 1, 2, 3… sans jamais répéter un rang, et « plusieurs rangs 1 »
     n'arrivait donc jamais. Le cas est extrême — quatre critères de départage
     à égalité —, mais c'est justement celui où couronner un roi serait faux. */
  const vainqueur = classement[0];
  const exAequo = Boolean(vainqueur.exAequo);

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
          boxShadow: "0 22px 60px rgba(0,0,0,.75)",
          padding: "22px 24px 20px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: "2.2rem", lineHeight: 1, marginBottom: 6 }} aria-hidden="true">🏆</div>
          <h2 style={{ ...marquee("clamp(1.1rem, 3vw, 1.5rem)", T.you), marginBottom: 4 }}>
            {exAequo
              ? "Égalité parfaite"
              : `${titanDisplayName(vainqueur.id)} est le roi de BIG CITY`}
          </h2>
          <p style={{ ...prose(T.dim, T.small), margin: 0 }}>
            {exAequo
              ? "Les quatre critères de départage n'ont rien pu séparer."
              : `${vainqueur.total} points au décompte final.`}
          </p>
        </div>

        {/* ── LE PODIUM ── */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 6, marginBottom: suite.length ? 12 : 16 }}>
          {podium.map((ligne) => {
            const place = classement.indexOf(ligne) + 1;
            const accent = TITAN_COLORS[ligne.id]?.accent ?? T.you;
            return (
              <div key={ligne.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
                {place === 1 && !exAequo && <Couronne />}
                <TitanIcon titanId={ligne.id} size={place === 1 ? 38 : 30} />
                <span style={{
                  ...marquee(place === 1 ? ".95rem" : ".8rem", place === 1 ? accent : T.text),
                  maxWidth: LARGEUR + PROF_X, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  marginTop: 3, marginBottom: 3,
                }}>
                  {titanDisplayName(ligne.id)}
                </span>
                <span style={{ ...readout(place === 1 ? "1.2rem" : "1rem", place === 1 ? accent : T.text), marginBottom: 4 }}>
                  {ligne.total}
                  <span style={{ ...label(T.faint, T.micro), marginLeft: 4 }}>
                    {titanModes?.[ligne.id] === "ia" ? "IA" : ""}
                  </span>
                </span>
                <Batiment hauteur={HAUTEUR_PAR_PLACE[place]} couleur={accent} rang={place} />
              </div>
            );
          })}
        </div>

        {/* Au-delà du podium : une ligne par Titan, comme avant. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
          {suite.map((ligne) => {
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
