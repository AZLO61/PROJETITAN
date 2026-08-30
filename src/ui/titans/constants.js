import { TITAN_GRADIENT } from "../../domain/gameRules.js";
export const TITAN_COLORS = {
  1: { gradient: TITAN_GRADIENT[1], accent: "#71dbff", name: "T1" },
  2: { gradient: TITAN_GRADIENT[2], accent: "#FB923C", name: "T2" },
  3: { gradient: TITAN_GRADIENT[3], accent: "#16E08C", name: "T3" },
  4: { gradient: TITAN_GRADIENT[4], accent: "#f472b6", name: "T4" },
};

/* ── LA COULEUR DU DÉPLACEMENT EST CELLE DU TITAN ─────────
   Nikola, 2026-08-30 : « je suis le Titan rose, mes cases de déplacement
   passif sont bleues — vérifie ça, ça doit être pareil pour les autres Titans,
   et le panneau "Déplacer" doit aussi avoir la couleur du Titan qu'on joue ».

   Le cyan du mouvement est, au caractère près, l'accent du Titan 1. Tant qu'on
   jouait le Titan 1, personne ne pouvait voir que la couleur était FIGÉE
   plutôt que dérivée : les cases proposées, le panneau et le jeton
   s'accordaient par coïncidence. Pour les trois autres, le plateau annonçait
   un déplacement dans la couleur d'un adversaire.

   Une seule fonction pour les deux vues et le panneau, sinon elles finiront
   par diverger. Le repli cyan ne sert qu'aux cas sans Titan sélectionné. */
export const ACCENT_DEPLACEMENT_DEFAUT = "#71dbff";
export function accentDeplacement(titanId) {
  return TITAN_COLORS[titanId]?.accent || ACCENT_DEPLACEMENT_DEFAUT;
}

/* La même couleur en entier 3D (0xRRGGBB), pour le plateau en relief : il ne
   sait pas lire une chaîne CSS, et refaire la conversion à la main dans chaque
   appelant est précisément ce qui fait diverger deux vues. */
export function accentDeplacement3D(titanId) {
  return Number(`0x${accentDeplacement(titanId).slice(1)}`);
}

export { TITAN_SPRITE_KEY, SPRITE_DATA } from "../board3d/constants.js";
