/* Mesure l'écart de force entre Novice et Expert.
 *
 * Sert à répondre à une demande chiffrée de Nikola (« améliore de 30 %
 * l'intelligence de l'IA Novice ») autrement qu'au jugé : on définit
 * l'intelligence par ce qui se mesure, à savoir le score moyen, et on lit
 * de combien le Novice comble son retard sur l'Expert.
 *
 * Usage : node scripts/mesure-novice.mjs [parties]
 */
import { lancerCampagne } from "../src/domain/simulation.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../src/domain/aiEvaluation.js";
import { setSeed } from "../src/domain/rng.js";

const PARTIES = Number(process.argv[2] || 40);
const GRAINE = Number(process.argv[3] || 77);

// Un Expert face à trois Novices, tempérament identique pour tous : seule la
// FORCE varie, l'écart mesuré ne peut donc venir que d'elle.
const profils = {
  1: makeProfile(FORCES.EXPERT, TEMPERAMENTS.OPPORTUNISTE),
  2: makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE),
  3: makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE),
  4: makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE),
};

setSeed(20260817);
const { stats } = lancerCampagne({ parties: PARTIES, nbJoueurs: 4, seed: GRAINE, profils });

const expert = stats.parForce.expert;
const novice = stats.parForce.novice;
const ecart = expert.scoreMoyen - novice.scoreMoyen;

console.log(`parties            ${PARTIES}`);
console.log(`Expert  moyen      ${expert.scoreMoyen.toFixed(2)}`);
console.log(`Novice  moyen      ${novice.scoreMoyen.toFixed(2)}`);
console.log(`ecart              ${ecart.toFixed(2)}`);
console.log(`Novice / Expert    ${((novice.scoreMoyen / expert.scoreMoyen) * 100).toFixed(1)} %`);
console.log(`victoires Expert   ${(expert.tauxVictoire * 100).toFixed(1)} %`);
console.log(`victoires Novice   ${(novice.tauxVictoire * 100).toFixed(1)} %`);
