// Couleurs des blocs en 3D, eclaircies de 30% par rapport aux teintes 2D :
// sous l'eclairage de la scene, les faces laterales assombries rendaient les
// blocs nettement plus sombres que leurs equivalents sur la grille.
//   bleu   #2D8DF5 -> #3AB7FF     rose   #EC4899 -> #FF5EC7
//   orange #FB923C -> #FFA042     rouge  #EF4444 -> #FF5959
// L'orange garde sa saturation : eclairci vers le jaune pale, il devenait
// fade et ne correspondait plus a l'icone du stock.
//   vert   #22C55E -> #2CFF7A
const COLOR_HEX_3D = {
  bleu: 0x3ab7ff,
  rose: 0xff5ec7,
  orange: 0xffa042,
  rouge: 0xff5959,
  vert: 0x2cff7a,
};

const CELL = 1;
const GAP = 0.096;
const LEVEL_H = 0.34;
const LEVEL_GAP = 0.02;
const SOCLE_H = (LEVEL_H - LEVEL_GAP) * 0.5;

const SPRITE_ASPECT = {
  pingouin: 0.7406,
  lama: 0.8094,
  ornithorynque: 1.1656,
  escargot: 0.7281,
};

const TITAN_SPRITE_KEY = {
  1: "pingouin",
  2: "ornithorynque",
  3: "escargot",
  4: "lama",
};

/* Couleur du PERIMETRE d'un Titan en vue 3D.

   Bug remonte par Nikola le 2026-08-24 : « en 3D les cases de perimetre et
   celles de deplacement sont exactement les memes visuellement ». Ce n'etait
   pas une impression : ces valeurs etaient EXACTEMENT celles des cases
   d'action (cf. `cellulesActives` dans RoundPanels) — 0x71dbff est la couleur
   du deplacement, 0xfb923c celle de Tete en Avant / repli / ecroulement,
   0x16e08c celle de Boing Boing / Je Ne Partage Pas. Un Titan 1 selectionne
   peignait donc son perimetre dans la couleur meme du deplacement.

   Consigne de Nikola : « fais une petite variante, mais que ca reste pas trop
   loin niveau couleur. » Chaque teinte est donc CONSERVEE, seulement assombrie
   et desaturee : on reconnait toujours la couleur du Titan, mais le perimetre
   passe visuellement derriere les cases d'action, qui gardent leur teinte
   vive. C'est aussi le bon sens de lecture — le perimetre est un decor
   permanent, les cases d'action sont ce sur quoi on clique.

   3D uniquement : la grille 2D n'utilise pas cette table, elle n'est pas
   touchee. */
const TITAN_RING_COLOR = {
  1: 0x3f8ba8, // cyan assombri (case de deplacement : 0x71dbff)
  2: 0xa35f22, // orange assombri (Tete en Avant / repli : 0xfb923c)
  3: 0x0d8552, // vert assombri (Boing Boing / JNP : 0x16e08c)
  4: 0x7350a3, // violet assombri (teleporteur : 0xb88cff)
};

const SPRITE_DATA = {
  pingouin: `${import.meta.env.BASE_URL}assets/titans/pingouin.png`,
  lama: `${import.meta.env.BASE_URL}assets/titans/lama.png`,
  ornithorynque: `${import.meta.env.BASE_URL}assets/titans/ornithorynque.png`,
  escargot: `${import.meta.env.BASE_URL}assets/titans/escargot.png`,
};

const BOARD3D_BTN_STYLE = {
  background: "rgba(255,255,255,.1)",
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 6,
  color: "#fff",
  padding: "5px 10px",
  fontSize: ".78rem",
  cursor: "pointer",
};

function cellWorld(r, c) {
  return {
    x: (c - 1 - 4) * CELL,
    z: (r - 4) * CELL,
  };
}

export {
  COLOR_HEX_3D,
  CELL,
  GAP,
  LEVEL_H,
  LEVEL_GAP,
  SOCLE_H,
  SPRITE_ASPECT,
  TITAN_SPRITE_KEY,
  TITAN_RING_COLOR,
  SPRITE_DATA,
  BOARD3D_BTN_STYLE,
  cellWorld,
};