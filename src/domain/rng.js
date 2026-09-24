/* ============================================================
   PROJET TITAN — Générateur aléatoire semé
   ============================================================
   Pourquoi ce module existe.

   Le moteur tirait au sort via `Math.random`, non semé : génération du
   plateau, ordre de jeu, détonateur, Fatigue, Vol de Phase Repos, tirage
   d'Événement. Conséquence, deux parties lancées dans les mêmes
   conditions ne donnaient jamais le même résultat, et il était impossible
   de reproduire une partie ou de comparer proprement deux réglages d'IA.

   C'est bloquant pour deux usages qui arrivent :
   - la simulation de masse, qui doit pouvoir rejouer exactement la même
     partie en ne changeant qu'un paramètre d'IA à la fois ;
   - le signalement de bug, où une graine suffit à rejouer la situation.

   Le générateur est un mulberry32 : 32 bits d'état, distribution correcte
   pour un usage ludique, quelques lignes, aucune dépendance. Ce n'est PAS
   un générateur cryptographique et il n'a pas à l'être.

   Le module expose un générateur courant unique (singleton). Les
   fonctions du domaine n'ayant pas de contexte où faire transiter un
   générateur, c'est le compromis qui évite de réécrire toutes leurs
   signatures. `setSeed` remet l'état à zéro de façon déterministe.
============================================================ */

// Graine par défaut : une valeur imprévisible, pour qu'une partie normale
// reste variée sans que personne ait à s'occuper de la graine.
function randomSeed() {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let currentSeed = randomSeed();
let next = mulberry32(currentSeed);

/** Fixe la graine et réinitialise l'état. Passer `undefined` retire le
 *  déterminisme en tirant une nouvelle graine imprévisible. */
export function setSeed(seed) {
  currentSeed = seed === undefined ? randomSeed() : seed >>> 0;
  next = mulberry32(currentSeed);
  return currentSeed;
}

/** Exécute `fn` sur un générateur semé à part, puis rend le courant intact.
 *  C'est ce qui rend la réflexion d'une IA identique qu'elle tourne dans un
 *  Web Worker (qui a son propre générateur) ou sur le fil principal : dans les
 *  deux cas, elle tire d'un flux semé par la même graine, sans consommer celui
 *  de la partie (cf. `src/application/penseeIA.js`). */
export function avecGraine(graine, fn) {
  const suivant = next;
  const graineCourante = currentSeed;
  currentSeed = graine >>> 0;
  next = mulberry32(currentSeed);
  try {
    return fn();
  } finally {
    next = suivant;
    currentSeed = graineCourante;
  }
}

/** La graine en cours, à journaliser pour pouvoir rejouer une partie. */
export function getSeed() {
  return currentSeed;
}

/** Flottant dans [0, 1). Remplace `Math.random()`. */
export function random() {
  return next();
}

/** Entier dans [0, maxExclusive). Remplace `Math.floor(Math.random() * n)`. */
export function randomInt(maxExclusive) {
  return Math.floor(next() * maxExclusive);
}

/* ── TIRAGES AVEUGLES, EN PARTIE À DISTANCE ──
   Audit du 2026-09-24. La graine n'est plus diffusée, mais 32 bits se
   retrouvent en quelques heures à partir du plateau initial, qui est public :
   un invité motivé prédirait alors le Socle tiré au sort, la carte prise par
   la Fatigue et la carte volée. En partie à distance, l'hôte tire ces trois-là
   au générateur cryptographique ; en local et en simulation, rien ne change
   et une graine rejoue toujours la partie. */
let aveuglesSecrets = false;
export function tiragesAveuglesSecrets(actif) {
  aveuglesSecrets = Boolean(actif);
}
export function randomIntAveugle(maxExclusive) {
  if (!aveuglesSecrets || !globalThis.crypto?.getRandomValues) return randomInt(maxExclusive);
  const u = new Uint32Array(1);
  globalThis.crypto.getRandomValues(u);
  return u[0] % maxExclusive; // ponytail: biais de modulo négligeable pour 6 éléments au plus
}
export function pickAveugle(arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[randomIntAveugle(arr.length)];
}

/** Un élément au hasard, ou `undefined` si le tableau est vide. */
export function pick(arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[randomInt(arr.length)];
}

/** Copie mélangée (Fisher-Yates). Ne modifie pas le tableau d'origine.
 *  À préférer à `sort(() => random() - 0.5)`, qui est biaisé : le
 *  comparateur n'est pas cohérent, et la distribution obtenue n'est pas
 *  uniforme selon l'algorithme de tri du moteur JS. */
export function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
