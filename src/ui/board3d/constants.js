const COLOR_HEX_3D = {
  bleu: 0x2d8df5,
  rose: 0xec4899,
  orange: 0xfb923c,
  rouge: 0xef4444,
  vert: 0x22c55e,
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

const TITAN_RING_COLOR = {
  1: 0x71dbff,
  2: 0xfb923c,
  3: 0x16e08c,
  4: 0xc084fc,
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