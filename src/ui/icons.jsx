/* ============================================================
   PROJET TITAN — LE JEU D'ICÔNES
   ============================================================
   L'interface parlait en émojis : 🦶 pour le déplacement, 🃏 pour la carte,
   🤲 pour le ramassage, 💉 pour l'Adrénaline… Un émoji n'est pas une icône.
   Il est dessiné par le système, pas par nous : il change de forme, de
   couleur et de style d'un appareil à l'autre, il ne prend jamais la couleur
   qui l'entoure, il ne s'aligne sur aucune grille, et sur une tablette
   Android le 🦶 du déplacement et le 🤲 du ramassage se ressemblent au point
   de ne plus rien distinguer à bout de bras.

   Ici : une grille de 24, un trait de 2, des bouts carrés — l'arête dure du
   monde de la borne. Chaque icône hérite de `currentColor`, donc elle porte
   la couleur du signal qu'elle accompagne et jamais une autre.

   De la géométrie, pas de l'illustration : chaque forme est spécifiable au
   point près, aucune n'imite un dessin.
============================================================ */
import React from "react";

const P = {
  /* ── Le tour ─────────────────────────────────────────── */
  // Déplacement : un pas d'une case à l'autre, sur la grille.
  move: (
    <>
      <path d="M3 20h6v-6" />
      <path d="M21 4h-6v6" />
      <path d="M9 14 21 4" />
    </>
  ),
  // Carte d'action : la carte programmée, coin corné.
  card: (
    <>
      <path d="M5 3h9l5 5v13H5z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  // Ramassage : la pince du Titan qui referme sur un bloc au sol.
  grab: (
    <>
      <path d="M4 4v6l4 3M20 4v6l-4 3" />
      <rect x="9" y="14" width="6" height="6" />
    </>
  ),

  /* ── Ressources et pistes ──────────────────────────────
     L'Adrénaline n'est plus ici : elle utilise la seringue fournie avec le
     jeu (`public/assets/rules/adrenaline.png`), via `<AdrenalineIcon>` plus
     bas. C'est un dessin du livret, il vaut mieux que ma paraphrase. */

  /* Bagarre : le gant de boxe (demande de Nikola). Trois tentatives ont
     précédé — un poing à quatre tracés imbriqués qui se refermait en pâté à
     13 px, deux chevrons qui se lisaient comme une paire de ciseaux, puis un
     poing en blocs qu'on prenait pour une prise électrique. Le gant a une
     silhouette que personne ne confond : mitaine ronde, pouce sur le côté,
     poignet net en dessous. */
  brawl: (
    <>
      <path d="M7 4h7a5 5 0 0 1 5 5v3a4 4 0 0 1-4 4H7z" />
      <path d="M7 8H5a2.5 2.5 0 0 0 0 5h2" />
      <path d="M7 16h11v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z" />
    </>
  ),
  /* Destruction : l'explosion (demande de Nikola). L'escalier descendant se
     lisait comme un graphique en marches, le bloc fendu comme un colis. Une
     étoile à pointes irrégulières ne se lit que d'une seule façon.

     Elle est proche du pictogramme de Tout Casser, et c'est cohérent : cette
     carte est le principal pourvoyeur de Destruction. Tout Casser rayonne
     depuis un centre vide (l'onde qui part du Titan), l'explosion est une
     masse pleine (ce qui reste du bâtiment). */
  wreck: (
    <>
      <path d="M12 2l2.4 5.2L20 4.6l-1.6 5.3 5.1 1.9-5.1 2 1.6 5.2-5.6-2.6L12 22l-2.4-5.6L4 19l1.6-5.2-5.1-2 5.1-1.9L4 4.6l5.6 2.6z" />
    </>
  ),
  // Bloc de béton.
  block: (
    <>
      <rect x="4" y="8" width="16" height="12" />
      <path d="M4 8 8 4h16l-4 4M20 8v12l4-4V4" />
    </>
  ),
  // Socle : la dalle, avec sa valeur gravée dessus.
  socle: (
    <>
      <path d="M3 9 12 5l9 4-9 4z" />
      <path d="M3 9v5l9 4 9-4V9" />
    </>
  ),

  /* ── États du jeu ────────────────────────────────────── */
  // Détonateur : le manche à plongeur, celui qui ouvre le round.
  detonator: (
    <>
      <path d="M12 3v6" />
      <path d="M7 9h10" />
      <rect x="5" y="12" width="14" height="8" />
      <path d="M12 3 9 6M12 3l3 3" />
    </>
  ),
  // Téléporteur.
  teleport: (
    <>
      <path d="M12 4a8 8 0 1 1-7 4" />
      <path d="M12 8a4 4 0 1 0 4 4" />
    </>
  ),
  // Hors de BIG CITY : la sortie de ring.
  ringout: (
    <>
      <path d="M3 6v12M21 6v12" />
      <path d="M3 9h18M3 15h18" />
      <path d="m10 12 4-4M10 8l4 4" />
    </>
  ),
  // IA.
  bot: (
    <>
      <rect x="5" y="8" width="14" height="11" />
      <path d="M12 4v4M9 13h.01M15 13h.01M9 16h6" />
      <path d="M2 12h3M19 12h3" />
    </>
  ),
  // Lanterne Rouge : le fanal de queue de convoi.
  lantern: (
    <>
      <path d="M8 3h8M9 3v3M15 3v3" />
      <path d="M6 6h12l-1 15H7z" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),

  /* ── Contrôles ───────────────────────────────────────── */
  next: <path d="M6 4l14 8-14 8z" />,
  check: <path d="M4 12l6 6L20 5" />,
  close: <path d="M5 5l14 14M19 5L5 19" />,
  alert: (
    <>
      <path d="M12 3 22 20H2z" />
      <path d="M12 10v5M12 18h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  undo: (
    <>
      <path d="M4 8h10a5 5 0 0 1 0 10H8" />
      <path d="M4 8l4-4M4 8l4 4" />
    </>
  ),
  pointer: (
    <>
      <path d="M6 3l12 9-5.5 1.2L15 20l-3 1.2-2.6-6.6L6 18z" />
    </>
  ),
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6z" />,
  eye: (
    <>
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),

  /* ── Les six cartes ──────────────────────────────────
     Chacune dit son geste, pas son thème : ce qui part, dans quel sens. */
  // 01 Tout Casser — l'onde qui part du Titan vers tout son Périmètre.
  smash: (
    <>
      <path d="M12 9v6M9 12h6" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="m5.6 5.6 2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ),
  // 02 Tête en Avant — la charge, en ligne droite.
  charge: (
    <>
      <path d="M3 12h14" />
      <path d="m13 7 5 5-5 5" />
      <path d="M20 5v14" />
    </>
  ),
  // 03 Graouhhh — le cri, qui pousse tout l'axe.
  roar: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M17 9c1.5 1.7 1.5 4.3 0 6" />
      <path d="M20 6c3 3.4 3 8.6 0 12" />
    </>
  ),
  /* 04 Boing Boing — le saut : un départ, une trajectoire, une arrivée.
     L'arc seul se lisait comme un arc-en-ciel ; ce sont les deux marques au
     sol qui en font un saut. */
  hop: (
    <>
      <path d="M4 20c0-8 5-13 8-13s8 5 8 13" />
      <path d="M2 20h5M17 20h5" />
      <path d="M9 9l3-3 3 3" />
    </>
  ),
  /* 05 Faut Pas Me Chauffer — le duel : deux blocs qui se font face et se
     mesurent. La version précédente empilait quatre équerres et se lisait
     comme un cadre cassé. */
  duel: (
    <>
      <rect x="2" y="7" width="7" height="10" />
      <rect x="15" y="7" width="7" height="10" />
      <path d="M11 9v6M13 9v6" />
    </>
  ),
  /* 06 Je Ne Partage Pas — le coffre fermé du Repaire. La version précédente
     dessinait une maison et se lisait « accueil ». */
  hoard: (
    <>
      <rect x="3" y="8" width="18" height="12" />
      <path d="M3 8l3-4h12l3 4" />
      <path d="M10 13h4v3h-4z" />
    </>
  ),
};

export const ICON_NAMES = Object.keys(P);

/** Icône par nom. Hérite de `currentColor`, donc du signal qui l'entoure.
 *
 *  L'épaisseur du trait suit la taille : un trait de 2 sur une grille de 24
 *  rendue à 12 px devient un pâté où les formes se referment sur
 *  elles-mêmes. En dessous de 16 px on épaissit relativement, pour que
 *  l'icône garde le même POIDS visuel à l'écran quelle que soit sa taille —
 *  c'est ce qui distingue un jeu d'icônes d'un lot de dessins mis à
 *  l'échelle. */
export default function Icon({ name, size = 18, strokeWidth, style, title }) {
  const d = P[name];
  if (!d) return null;
  const trait = strokeWidth ?? (size <= 13 ? 2.6 : size <= 16 ? 2.25 : 2);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={trait}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      focusable="false"
      style={{ flexShrink: 0, display: "block", ...style }}
    >
      {title ? <title>{title}</title> : null}
      {d}
    </svg>
  );
}

/** La seringue d'Adrénaline livrée avec le jeu.
 *
 *  Ce n'est pas une icône du jeu de traits : c'est un dessin du livret, et
 *  il est repris tel quel plutôt que paraphrasé (demande de Nikola). Il ne
 *  prend donc pas `currentColor` — il porte ses propres couleurs, comme les
 *  icônes de blocs et le Socle, qui viennent de la même série. */
export function AdrenalineIcon({ size = 16, style }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}assets/rules/adrenaline.png`}
      alt=""
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
        filter: "brightness(1.15)",
        ...style,
      }}
    />
  );
}

/** L'icône de la carte, par identifiant de carte. */
export const CARD_ICON = {
  tout_casser: "smash",
  tete_en_avant: "charge",
  graouhhh: "roar",
  boing_boing: "hop",
  faut_pas_me_chauffer: "duel",
  je_ne_partage_pas: "hoard",
};
