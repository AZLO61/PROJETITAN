/* ÉCART DE SCORE — la partie est-elle serrée ?
 * ============================================
 * Nikola, 2026-08-28, après une partie jouée contre trois IA Expertes :
 * « j'ai terminé à 92 points, le deuxième à 46, le troisième à 24 et le
 * dernier à 20. Ce n'est pas normal. J'aimerais que l'écart entre le 1er et
 * le 2e soit plutôt de l'ordre de 10 points en fin de partie. »
 *
 * `mesure-forces.mjs` compare deux forces, `duel-reglages.mjs` compare deux
 * réglages. Ni l'un ni l'autre ne mesure ce qui est demandé ici : la
 * DISPERSION des scores d'une table, c'est-à-dire à quel point la partie
 * reste disputée jusqu'au bout.
 *
 * Protocole : quatre Titans de force et tempérament IDENTIQUES. Tout écart
 * qui subsiste vient alors du jeu et du tirage, jamais d'une différence de
 * niveau — c'est la borne basse de dispersion que le jeu peut produire. Si
 * quatre IA identiques finissent déjà à 30 points d'écart, aucun réglage
 * d'IA ne fera une partie serrée : le problème est dans le barème.
 *
 * Usage :
 *   node scripts/mesure-ecarts.mjs [parties] [force] [temperament]
 *   npm run ecarts -- 40 expert opportuniste
 */
import { lancerCampagne } from "../src/domain/simulation.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../src/domain/aiEvaluation.js";
import { setSeed } from "../src/domain/rng.js";

const PARTIES = Number(process.argv[2] || 40);
const FORCE = (process.argv[3] || FORCES.EXPERT).toLowerCase();
const TEMPERAMENT = (process.argv[4] || TEMPERAMENTS.OPPORTUNISTE).toLowerCase();

if (!Object.values(FORCES).includes(FORCE)) { console.error(`force inconnue : ${FORCE}`); process.exit(1); }
if (!Object.values(TEMPERAMENTS).includes(TEMPERAMENT)) { console.error(`temperament inconnu : ${TEMPERAMENT}`); process.exit(1); }

const GRAINES = process.env.GRAINES
  ? process.env.GRAINES.split(",").map(Number)
  : [77, 501, 1301, 2711];

const profils = {};
for (const id of [1, 2, 3, 4]) profils[id] = makeProfile(FORCE, TEMPERAMENT);

const ecarts12 = [];
const ecarts14 = [];
const premiers = [];
const derniers = [];
const manches = [];

for (const graine of GRAINES) {
  setSeed(20260817);
  const { resultats } = lancerCampagne({ parties: PARTIES, nbJoueurs: 4, seed: graine, profils });
  for (const r of resultats) {
    const totaux = [1, 2, 3, 4].map((id) => r.scores?.[id]?.total ?? 0).sort((a, b) => b - a);
    ecarts12.push(totaux[0] - totaux[1]);
    ecarts14.push(totaux[0] - totaux[3]);
    premiers.push(totaux[0]);
    derniers.push(totaux[3]);
    manches.push(r.manchesJouees);
  }
}

const moy = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const mediane = (xs) => {
  const t = [...xs].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};
const pct = (xs, p) => {
  const t = [...xs].sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.floor((p / 100) * t.length))];
};

console.log(`parties            ${ecarts12.length}   (${GRAINES.length} graines x ${PARTIES})`);
console.log(`table              4 x ${FORCE} ${TEMPERAMENT}`);
console.log(`manches jouees     ${moy(manches).toFixed(2)} en moyenne`);
console.log("");
console.log(`score du 1er       ${moy(premiers).toFixed(1)} en moyenne`);
console.log(`score du 4e        ${moy(derniers).toFixed(1)} en moyenne`);
console.log("");
console.log(`ECART 1er-2e       ${moy(ecarts12).toFixed(2)} en moyenne   mediane ${mediane(ecarts12)}   p90 ${pct(ecarts12, 90)}`);
console.log(`ecart 1er-4e       ${moy(ecarts14).toFixed(2)} en moyenne   mediane ${mediane(ecarts14)}   p90 ${pct(ecarts14, 90)}`);
console.log("");
console.log(`part des parties ou 1er-2e <= 10 pts : ${((ecarts12.filter((e) => e <= 10).length / ecarts12.length) * 100).toFixed(1)} %`);
