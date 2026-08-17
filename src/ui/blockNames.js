// Noms de destination des blocs, tels qu'ils apparaissent dans le barème du
// livret V36 : « Bleu — Habitation », « Rose — Boutique », etc.
//
// L'interface n'affichait que le nom technique de la couleur en minuscules
// (« bleu », « rose »), qui ne dit rien à un joueur et ne correspond à aucun
// terme du livret. Le nom de destination est celui que les joueurs lisent sur
// la feuille de score.
export const BLOCK_NAME = {
  bleu: "Habitation",
  rose: "Boutique",
  orange: "Loisir",
  rouge: "Supermarché",
  vert: "Téléporteur",
};

// Ordre d'affichage : celui du barème, du stock le plus grand au plus petit,
// le Vert à part puisqu'il ne suit pas un barème de couleur.
export const BLOCK_ORDER = ["bleu", "rose", "orange", "rouge"];

/* ── UN SEUL BARÈME, CELUI DU MOTEUR ──
   Ce fichier recopiait les trois échelles du livret et les paires d'Orange,
   avec sa propre fonction de calcul. Le barème vivait donc à DEUX endroits
   dans le code, et rien ne garantissait qu'ils disent la même chose : une
   correction de scoring dans `gameRules.js` laissait les infobulles annoncer
   l'ancienne valeur, en silence. C'est exactement le piège des « quatre
   endroits » relevé sur les règles de jeu.

   L'affichage lit maintenant la même fonction que le décompte final. */
import { scoreBareme, BAREME } from "../domain/gameRules.js";

export { BAREME as BAREME_PALIERS };

/** Points rapportés par `n` blocs de cette couleur. `null` pour le Vert. */
export function scoreBloc(color, n) {
  // Le Vert n'a pas de barème propre : sa valeur dépend du placement secret
  // de fin de partie. `scoreBareme` renvoie 0 pour une couleur inconnue, on
  // distingue donc explicitement ce cas.
  if (color === "vert") return null;
  return scoreBareme(color, n);
}

/** Infobulle : ce que vaut la position actuelle, et ce que rapporte la suite. */
export function baremeHint(color, n) {
  const nom = BLOCK_NAME[color];

  if (color === "vert") {
    return `${n} ${nom} — chaque bloc vaut +1 case sur un barème ou une Piste ADN, au choix`;
  }

  const actuel = scoreBloc(color, n);
  const suivant = scoreBloc(color, color === "orange" ? n + 2 : n + 1);
  const gain = suivant != null && suivant > actuel ? suivant - actuel : null;
  const base = `${n} ${nom} = ${actuel} pt${actuel > 1 ? "s" : ""}`;

  if (color === "orange") {
    return gain ? `${base} · +${gain} avec la paire suivante` : base;
  }
  return gain ? `${base} · +${gain} au prochain bloc` : `${base} · barème au maximum`;
}
