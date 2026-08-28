/* D'OÙ VIENNENT LES POINTS ?
 * =========================
 * Nikola a fini une partie à 92 points contre trois IA Expertes à 46, 24 et
 * 20. Une campagne de quatre IA identiques, elle, plafonne le premier à ~43.
 * L'écart ne se comble pas en réglant des poids au hasard : il faut savoir
 * QUELLE LIGNE du décompte l'IA laisse sur la table.
 *
 * Ce script décompose le score moyen, ligne par ligne, et sépare le premier
 * du dernier. Une ligne où le 1er et le 4e sont à égalité est une ligne que
 * personne ne joue ; une ligne où l'écart est énorme est celle qui décide la
 * partie — et donc celle qu'il faut apprendre à l'IA.
 *
 * Usage :
 *   node scripts/composition-score.mjs [parties] [force] [temperament]
 *   npm run composition -- 30 expert opportuniste
 */
import { lancerCampagne } from "../src/domain/simulation.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../src/domain/aiEvaluation.js";
import { setSeed } from "../src/domain/rng.js";

const PARTIES = Number(process.argv[2] || 30);
const FORCE = (process.argv[3] || FORCES.EXPERT).toLowerCase();
const TEMPERAMENT = (process.argv[4] || TEMPERAMENTS.OPPORTUNISTE).toLowerCase();

const GRAINES = process.env.GRAINES
  ? process.env.GRAINES.split(",").map(Number)
  : [77, 501];

const LIGNES = [
  "bareme", "roseBonus", "socles", "collectionneurBonus",
  "rainbowBonus", "bagarrePts", "destructionPts", "adrenalinePts",
];

const profils = {};
for (const id of [1, 2, 3, 4]) profils[id] = makeProfile(FORCE, TEMPERAMENT);

const cumulTous = Object.fromEntries(LIGNES.map((l) => [l, 0]));
const cumulPremier = Object.fromEntries(LIGNES.map((l) => [l, 0]));
const cumulDernier = Object.fromEntries(LIGNES.map((l) => [l, 0]));
let nbTitans = 0;
let nbParties = 0;

for (const graine of GRAINES) {
  setSeed(20260817);
  const { resultats } = lancerCampagne({ parties: PARTIES, nbJoueurs: 4, seed: graine, profils });
  for (const r of resultats) {
    nbParties++;
    const parId = [1, 2, 3, 4]
      .map((id) => ({ id, d: r.scores?.[id] }))
      .filter((x) => x.d)
      .sort((a, b) => b.d.total - a.d.total);
    for (const { d } of parId) {
      nbTitans++;
      for (const l of LIGNES) cumulTous[l] += d[l] ?? 0;
    }
    for (const l of LIGNES) {
      cumulPremier[l] += parId[0]?.d?.[l] ?? 0;
      cumulDernier[l] += parId[parId.length - 1]?.d?.[l] ?? 0;
    }
  }
}

const moyTous = (l) => cumulTous[l] / nbTitans;
const moyPremier = (l) => cumulPremier[l] / nbParties;
const moyDernier = (l) => cumulDernier[l] / nbParties;

console.log(`${nbParties} parties, table de 4 x ${FORCE} ${TEMPERAMENT}\n`);
console.log("ligne                 moyenne     1er      4e    ecart");
console.log("──────────────────────────────────────────────────────");
for (const l of LIGNES) {
  console.log(
    `${l.padEnd(20)} ${moyTous(l).toFixed(2).padStart(7)} ${moyPremier(l).toFixed(2).padStart(7)} ` +
    `${moyDernier(l).toFixed(2).padStart(7)} ${(moyPremier(l) - moyDernier(l)).toFixed(2).padStart(8)}`
  );
}
const total = (f) => LIGNES.reduce((s, l) => s + f(l), 0);
console.log("──────────────────────────────────────────────────────");
console.log(
  `${"TOTAL".padEnd(20)} ${total(moyTous).toFixed(2).padStart(7)} ${total(moyPremier).toFixed(2).padStart(7)} ` +
  `${total(moyDernier).toFixed(2).padStart(7)} ${(total(moyPremier) - total(moyDernier)).toFixed(2).padStart(8)}`
);
