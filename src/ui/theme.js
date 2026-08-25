/* ============================================================
   PROJET TITAN — JETONS ET PRIMITIVES DE LA BORNE
   ============================================================
   Les mêmes jetons que `src/index.css`, exposés au JavaScript parce que
   toute l'interface est en styles en ligne. Un composant ne compose plus
   `rgba(255,255,255,.06)` à la main : il demande une plaque, une jauge, une
   touche. C'est ce qui permet de changer le monde à un seul endroit — et ce
   qui empêche vingt panneaux d'inventer vingt gris légèrement différents.

   LANGUE D'ÉLÉVATION : le cerne. Un sprite d'arcade est cerné de noir, et
   c'est le trait qui dit ce qui est posé sur quoi. On ne cumule jamais un
   cerne et une ombre portée sur le même objet ; l'ombre est réservée au seul
   élément qui flotte réellement, la plaque du Titan actif.
============================================================ */

export const T = {
  void: "var(--ink-void)",
  screen: "var(--ink-screen)",
  plate: "var(--ink-plate)",
  plateHi: "var(--ink-plate-hi)",
  bezel: "var(--ink-bezel)",

  edge: "var(--edge)",
  edgeW: "var(--edge-w)",
  rule: "var(--rule)",
  ruleStrong: "var(--rule-strong)",

  text: "var(--text)",
  dim: "var(--text-dim)",
  faint: "var(--text-faint)",

  you: "var(--sig-you)",
  go: "var(--sig-go)",
  warn: "var(--sig-warn)",
  stop: "var(--sig-stop)",
  move: "var(--sig-move)",
  tele: "var(--sig-tele)",

  marquee: "var(--font-marquee)",
  readout: "var(--font-readout)",
  ui: "var(--font-ui)",

  micro: "var(--fs-micro)",
  small: "var(--fs-small)",
  body: "var(--fs-body)",
  lead: "var(--fs-lead)",
  h3: "var(--fs-h3)",
  h2: "var(--fs-h2)",
  h1: "var(--fs-h1)",

  s1: "var(--sp-1)",
  s2: "var(--sp-2)",
  s3: "var(--sp-3)",
  s4: "var(--sp-4)",
  s5: "var(--sp-5)",
  s6: "var(--sp-6)",

  rPlate: "var(--r-plate)",
  rChip: "var(--r-chip)",

  easeOut: "var(--ease-out)",
  easeSnap: "var(--ease-snap)",
};

/* ── PLAQUE ────────────────────────────────────────────────
   L'unité de surface du HUD. `accent` colore le cerne et rien d'autre : une
   plaque n'est jamais teintée dans la masse, sinon quatre plaques côte à
   côte donnent quatre fonds différents et plus rien ne se lit.

   `raised` est le seul cas d'ombre portée du système, et il n'y en a qu'un
   à l'écran à la fois : le Titan dont c'est le tour. */
export function plate({ accent = null, raised = false, inset = false, pad = "var(--sp-3)" } = {}) {
  return {
    background: inset ? "rgba(0,0,0,.34)" : T.plate,
    border: `${T.edgeW} solid ${accent || T.edge}`,
    borderRadius: T.rPlate,
    padding: pad,
    boxShadow: raised ? `0 6px 0 -1px ${T.edge}, 0 10px 22px rgba(0,0,0,.55)` : "none",
    transform: raised ? "translateY(-2px)" : "none",
    transition: `transform 220ms ${T.easeOut}, box-shadow 220ms ${T.easeOut}, border-color 160ms linear`,
  };
}

/* ── TOUCHE ────────────────────────────────────────────────
   Une touche de borne : aplat franc, cerne noir, et un vrai enfoncement au
   clic. Pas de dégradé — le monde choisi n'en a pas.

   `tone` dit ce que fait la touche, pas de quelle couleur elle est :
   "you" = l'action primaire du tour, "go" = confirmer, "stop" = trancher une
   décision qui bloque, "ghost" = secondaire, "flat" = annuler. */
const TONES = {
  you: { face: T.you, ink: "#1a1400" },
  go: { face: T.go, ink: "#00311e" },
  warn: { face: T.warn, ink: "#2a1200" },
  stop: { face: T.stop, ink: "#2b0603" },
  move: { face: T.move, ink: "#062430" },
  ghost: { face: "transparent", ink: T.text },
  flat: { face: "rgba(255,250,238,.10)", ink: T.text },
};

export function key(tone = "ghost", { enabled = true, size = "m", full = false } = {}) {
  const t = TONES[tone] || TONES.ghost;
  const pads = { s: "6px 10px", m: "9px 14px", l: "13px 22px" };
  const sizes = { s: T.micro, m: T.small, l: T.lead };
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: full ? "100%" : "auto",
    background: enabled ? t.face : "rgba(255,250,238,.05)",
    color: enabled ? t.ink : T.faint,
    border: `${T.edgeW} solid ${tone === "ghost" ? T.rule : T.edge}`,
    borderRadius: T.rChip,
    padding: pads[size],
    fontFamily: T.ui,
    fontSize: sizes[size],
    fontWeight: 700,
    letterSpacing: ".02em",
    textTransform: "uppercase",
    cursor: enabled ? "pointer" : "not-allowed",
    /* L'ombre dure sous la touche n'est pas un effet néobrutaliste posé au
       hasard : c'est l'épaisseur du capuchon de bouton, et c'est elle qui
       disparaît quand on appuie (cf. `keyPressed`). */
    boxShadow: enabled && tone !== "ghost" ? `0 3px 0 ${T.edge}` : "none",
    transform: "translateY(0)",
    transition: `transform 90ms ${T.easeOut}, box-shadow 90ms ${T.easeOut}, background 140ms linear`,
    opacity: enabled ? 1 : 0.55,
  };
}

/* À poser sur onMouseDown/onMouseUp quand un bouton mérite l'enfoncement. */
export const keyPressed = { transform: "translateY(3px)", boxShadow: "none" };

/* ── TYPOGRAPHIE ───────────────────────────────────────────── */

/** Le fronton : nom du jeu, titres de panneau, noms de carte. */
export function marquee(size = T.h3, color = T.text) {
  return {
    fontFamily: T.marquee,
    fontSize: size,
    color,
    lineHeight: 1.05,
    letterSpacing: "-.01em",
    /* Le cerne du lettrage d'arcade. `paint-order` évite que le trait ronge
       l'intérieur des lettres. */
    WebkitTextStroke: `1px ${T.edge}`,
    paintOrder: "stroke fill",
    textTransform: "uppercase",
    margin: 0,
  };
}

/** L'afficheur : chiffres et compteurs. Bitmap, donc à petite dose. */
export function readout(size = T.small, color = T.you) {
  return {
    fontFamily: T.readout,
    fontSize: size,
    color,
    lineHeight: 1,
    letterSpacing: "0",
  };
}

/** Le bandeau sérigraphié de la borne : libellés courts, en capitales. */
export function label(color = T.dim, size = T.micro) {
  return {
    fontFamily: T.ui,
    fontSize: size,
    fontWeight: 700,
    letterSpacing: ".12em",
    textTransform: "uppercase",
    color,
    lineHeight: 1.2,
  };
}

/** Une phrase de règle, à lire vraiment. */
export function prose(color = T.dim, size = T.small) {
  return {
    fontFamily: T.ui,
    fontSize: size,
    fontWeight: 400,
    color,
    lineHeight: 1.5,
    maxWidth: "68ch",
  };
}

/* ── JAUGE À SEGMENTS ──────────────────────────────────────
   Les pistes de score ne sont pas des barres lisses : ce sont des segments
   durs, comme une jauge d'énergie de borne. On COMPTE les segments d'un coup
   d'œil, on n'estime pas une longueur — c'est précisément ce que « suivre
   les scores » demandait. */
export function meterSegments(value, max, color) {
  const cells = [];
  for (let i = 0; i < max; i++) {
    cells.push({
      key: i,
      on: i < value,
      style: {
        flex: 1,
        minWidth: 3,
        height: 10,
        background: i < value ? color : "rgba(255,250,238,.10)",
        border: `1px solid ${T.edge}`,
        borderRadius: 1,
      },
    });
  }
  return cells;
}

/* ── LIGNE DE SERVICE ──────────────────────────────────────
   Le filet fin qui sépare deux blocs d'information sans créer une boîte de
   plus. Aucune plaque n'existe uniquement pour porter une bordure. */
export const hairline = {
  height: 1,
  background: T.rule,
  border: "none",
  margin: `${T.s3} 0`,
};
