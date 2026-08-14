import React from "react";
import { COLOR_HEX } from "../domain/gameRules.js";

/* ============================================================
   ICÔNE DE BLOC — langage visuel unique
   ============================================================
   Un bloc était représenté de quatre façons selon l'endroit : pastille
   carrée dans le bandeau des Titans, jauge dans le stock, chiffre nu dans
   les stats, aplat de couleur sur la grille. Quatre langages pour un même
   objet, que le joueur devait réapprendre à chaque panneau.

   Ce composant est le seul : le bloc isométrique du jeu, le même volume que
   dans la vue 3D.

   Les fichiers vivent dans public/assets/rules/bloc_<couleur>.png. Tant
   qu'ils ne sont pas déposés, `onError` bascule sur une pastille de la
   couleur du bloc.

   Les corrections colorimétriques sont faites en CSS plutôt qu'en retouchant
   les PNG : les fichiers d'origine de Nikola restent intacts, et un
   ajustement se change en une ligne.
============================================================ */

// +20% de luminosité sur tous les blocs : les originaux du livret sont
// sombres sur le fond profond de BIG CITY.
const ECLAIRCISSEMENT = "brightness(1.2)";

// Le bloc « orange » du moteur (Loisir) est dessiné en jaune dans le livret,
// alors que la grille 2D et la vue 3D le rendent en orange (#FB923C). La
// rotation de teinte le raccorde aux deux autres vues, sans toucher au PNG.
const CORRECTION_TEINTE = {
  orange: "hue-rotate(-22deg) saturate(1.15)",
};

export default function BlockIcon({ color, size = 22, title, style }) {
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return (
      <span
        title={title}
        style={{
          width: size - 6, height: size - 6, borderRadius: 3,
          background: COLOR_HEX[color] || "rgba(255,255,255,.3)",
          flexShrink: 0, display: "inline-block", ...style,
        }}
      />
    );
  }

  const filtre = [ECLAIRCISSEMENT, CORRECTION_TEINTE[color]].filter(Boolean).join(" ");

  return (
    <img
      src={`${import.meta.env.BASE_URL}assets/rules/bloc_${color}.png`}
      alt=""
      aria-hidden={title ? undefined : true}
      title={title}
      onError={() => setFailed(true)}
      style={{
        width: size, height: size, objectFit: "contain",
        flexShrink: 0, display: "block", filter: filtre, ...style,
      }}
    />
  );
}
