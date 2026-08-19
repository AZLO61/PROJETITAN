/* Mesure la force réelle des IA Novice et Confirmé.
 *
 * Sert à répondre aux demandes chiffrées de Nikola (« améliore la pire des
 * IA de 30 %, et celle du milieu de 20 % ») autrement qu'au jugé.
 * L'intelligence n'étant pas directement mesurable, on prend ce qui l'est :
 * le score moyen sur une campagne d'UN Expert contre TROIS IA de la force
 * mesurée, tempérament identique pour tous. Seule la force varie, l'écart
 * mesuré ne peut donc venir que d'elle.
 *
 * Deux séries de graines à chaque fois : la seconde ne sert qu'à VÉRIFIER.
 * Sans elle, on ne saurait pas distinguer un vrai gain d'un surajustement à
 * une série de parties particulière.
 *
 * Usage : node scripts/mesure-forces.mjs [parties]
 *
 * (Remplace `mesure-novice.mjs`, qui ne savait mesurer qu'une force.)
 */
import { lancerCampagne } from "../src/domain/simulation.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../src/domain/aiEvaluation.js";
import { setSeed } from "../src/domain/rng.js";

const PARTIES = Number(process.argv[2] || 40);
const SERIES = [77, 501];

/* Temperament mesure. Il etait fige sur OPPORTUNISTE, ce qui ne permettait
   pas de repondre a une demande portant sur un temperament precis : Nikola a
   demande le 2026-08-19 de renforcer Novice COLLECTIONNEUR et Confirme
   COLLECTIONNEUR. Une force ne se mesure pas dans l'abstrait, elle se mesure
   avec le temperament qu'on veut regler.

   Usage : node scripts/mesure-forces.mjs [parties] [temperament]
   Temperaments : opportuniste (defaut), collectionneur, agressif. */
const TEMPERAMENT = (process.argv[3] || TEMPERAMENTS.OPPORTUNISTE).toLowerCase();
if (!Object.values(TEMPERAMENTS).includes(TEMPERAMENT)) {
  console.error(`temperament inconnu : ${TEMPERAMENT}`);
  console.error(`attendus : ${Object.values(TEMPERAMENTS).join(", ")}`);
  process.exit(1);
}

function mesurer(force, graine) {
  // L'Expert de reference garde le MEME temperament que la force mesuree :
  // sinon l'ecart melangerait force et temperament, et ne mesurerait plus rien.
  const profils = {
    1: makeProfile(FORCES.EXPERT, TEMPERAMENT),
    2: makeProfile(force, TEMPERAMENT),
    3: makeProfile(force, TEMPERAMENT),
    4: makeProfile(force, TEMPERAMENT),
  };
  // Graine du générateur remise à la même valeur avant chaque campagne :
  // deux mesures ne diffèrent que par le réglage testé, jamais par le tirage.
  setSeed(20260817);
  const { stats } = lancerCampagne({ parties: PARTIES, nbJoueurs: 4, seed: graine, profils });
  return { mesure: stats.parForce[force], expert: stats.parForce.expert };
}

console.log(`parties par serie   ${PARTIES}`);
console.log(`temperament         ${TEMPERAMENT}`);
for (const force of [FORCES.NOVICE, FORCES.CONFIRME]) {
  console.log(`\n── ${force.toUpperCase()} face a un Expert ──`);
  let cumul = 0;
  for (const graine of SERIES) {
    const { mesure, expert } = mesurer(force, graine);
    cumul += mesure.scoreMoyen;
    console.log(
      `graine ${String(graine).padEnd(4)} ${force} ${mesure.scoreMoyen.toFixed(2).padStart(6)}` +
      `   expert ${expert.scoreMoyen.toFixed(2).padStart(6)}` +
      `   ratio ${((mesure.scoreMoyen / expert.scoreMoyen) * 100).toFixed(1).padStart(5)} %` +
      `   victoires ${(mesure.tauxVictoire * 100).toFixed(1).padStart(5)} %`
    );
  }
  console.log(`moyenne des series  ${(cumul / SERIES.length).toFixed(2)}`);
}
