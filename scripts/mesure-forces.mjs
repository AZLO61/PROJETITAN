/* Mesure la force réelle de chaque niveau de difficulté.
 *
 * L'intelligence n'étant pas directement mesurable, on prend ce qui l'est :
 * le score moyen sur une campagne d'UN Titan de référence contre TROIS IA du
 * niveau mesuré, tempérament identique pour tous. Seul le niveau varie,
 * l'écart mesuré ne peut donc venir que de lui.
 *
 * LIRE LE TAUX DE VICTOIRE AVANT LE RATIO. Les trois sièges mesurés se
 * disputent le même butin : leurs scores moyens sont mécaniquement comprimés,
 * et le ratio en dit peu. Le taux de victoire, lui, se lit contre 25 % —
 * au-dessus, le niveau mesuré domine la référence ; en dessous, il subit.
 *
 * Plusieurs séries de graines à chaque fois, et pas deux : voir SERIES.
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

/* HUIT GRAINES, PAS DEUX (2026-08-27).
 *
 * Il y en avait deux, et c'est trop peu : sur un reglage INCHANGE, deux
 * graines donnent des ratios allant de 85,8 % a 110,3 %. Un ecart de reglage
 * de quelques points disparait donc entierement dans le bruit du tirage, et
 * une mesure sur deux series peut affirmer n'importe quoi. C'est
 * vraisemblablement ce qui a fait « corriger » deux fois de suite une
 * hierarchie d'IA qui n'etait pas corrigee (cf. FORCE_SETTINGS dans
 * aiEvaluation.js).
 *
 * A RETENIR AVANT DE LIRE UN RATIO : les quatre sieges ne se valent pas. A
 * reglages STRICTEMENT identiques pour les quatre Titans, celui du Titan 1 —
 * qui porte toujours la force de reference ici — rapporte deja ~3 %. Un ratio
 * de 97 % ne dit donc pas « l'Expert gagne », il dit « a egalite ». */
const SERIES = process.env.GRAINES
  ? process.env.GRAINES.split(",").map(Number)
  : [77, 501, 1301, 2711, 4201, 5507, 6803, 7919];

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

/* Force de REFERENCE, celle qui occupe le siege 1. Par defaut l'Expert, mais
   comparer chaque niveau a l'Expert ne dit pas si les niveaux sont distincts
   ENTRE EUX : quand la reference s'ameliore, tous les ratios baissent
   ensemble et le premier barreau finit colle au deuxieme. Le vrai test d'une
   echelle est la marche d'un barreau au suivant.

   Usage : REFERENCE=moyen node scripts/mesure-forces.mjs 40 opportuniste */
const REFERENCE = (process.env.REFERENCE || FORCES.EXPERT).toLowerCase();
if (!Object.values(FORCES).includes(REFERENCE)) {
  console.error(`force de reference inconnue : ${REFERENCE}`);
  process.exit(1);
}

function mesurer(force, graine) {
  // La reference garde le MEME temperament que la force mesuree : sinon
  // l'ecart melangerait force et temperament, et ne mesurerait plus rien.
  const profils = {
    1: makeProfile(REFERENCE, TEMPERAMENT),
    2: makeProfile(force, TEMPERAMENT),
    3: makeProfile(force, TEMPERAMENT),
    4: makeProfile(force, TEMPERAMENT),
  };
  // Graine du générateur remise à la même valeur avant chaque campagne :
  // deux mesures ne diffèrent que par le réglage testé, jamais par le tirage.
  setSeed(20260817);
  const { stats } = lancerCampagne({ parties: PARTIES, nbJoueurs: 4, seed: graine, profils });
  return { mesure: stats.parForce[force], reference: stats.parForce[REFERENCE] };
}

console.log(`parties par serie   ${PARTIES}`);
console.log(`temperament         ${TEMPERAMENT}`);
// Les trois barreaux du dessous, face a la reference. L'echelle tient si et
// seulement si chacun reste sous 100 %, et si les ratios montent avec le
// niveau (cf. FORCE_SETTINGS, ecrit du haut vers le bas).
for (const force of Object.values(FORCES).filter((f) => f !== REFERENCE)) {
  console.log("");
  console.log(`── ${force.toUpperCase()} face a un ${REFERENCE.toUpperCase()} ──`);
  let cumul = 0;
  for (const graine of SERIES) {
    const { mesure, reference } = mesurer(force, graine);
    cumul += mesure.scoreMoyen;
    console.log(
      `graine ${String(graine).padEnd(4)} ${force} ${mesure.scoreMoyen.toFixed(2).padStart(6)}` +
      `   ${REFERENCE} ${reference.scoreMoyen.toFixed(2).padStart(6)}` +
      `   ratio ${((mesure.scoreMoyen / reference.scoreMoyen) * 100).toFixed(1).padStart(5)} %` +
      `   victoires ${(mesure.tauxVictoire * 100).toFixed(1).padStart(5)} %`
    );
  }
  console.log(`moyenne des series  ${(cumul / SERIES.length).toFixed(2)}`);
}
