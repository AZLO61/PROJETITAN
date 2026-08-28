/* DUEL DE RÉGLAGES — deux variantes d'IA dans LA MÊME partie.
 * ==========================================================
 * `mesure-forces.mjs` compare une force à une autre, chacune mesurée dans
 * SA campagne. C'est ce qu'il faut pour vérifier une hiérarchie, et c'est
 * insuffisant pour répondre à « est-ce que ce réglage-ci est meilleur que
 * celui-là » : deux campagnes ne partagent ni le plateau, ni les cartes, ni
 * les Événements, et l'écart entre deux graines atteint 25 points de ratio
 * sur un réglage INCHANGÉ (cf. l'en-tête de mesure-forces.mjs).
 *
 * Ici, les quatre Titans ont la même FORCE et le même TEMPÉRAMENT ; seuls
 * deux d'entre eux portent la variante testée. Ils jouent donc la même
 * partie, contre les mêmes adversaires, sur le même tirage. Ce qui reste de
 * l'écart vient du réglage, et de rien d'autre.
 *
 * SIÈGES CROISÉS. Le siège du Titan 1 rapporte ~3 % à réglages identiques.
 * Chaque graine est donc jouée DEUX FOIS, la variante occupant d'abord les
 * sièges 1 et 3, puis les sièges 2 et 4. L'avantage de position s'annule
 * dans la moyenne.
 *
 * Usage :
 *   node scripts/duel-reglages.mjs <parties> <force> <temperament> <cle=valeur[,cle=valeur]>
 * Exemple — donner au Confirmé le chiffrage au score complet :
 *   node scripts/duel-reglages.mjs 30 confirme opportuniste voitPorteeAuScore=true
 */
import { lancerCampagne } from "../src/domain/simulation.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../src/domain/aiEvaluation.js";
import { setSeed } from "../src/domain/rng.js";

const PARTIES = Number(process.argv[2] || 30);
const FORCE = (process.argv[3] || FORCES.MOYEN).toLowerCase();
const TEMPERAMENT = (process.argv[4] || TEMPERAMENTS.OPPORTUNISTE).toLowerCase();
const VARIANTE = Object.fromEntries(
  (process.argv[5] || "").split(",").filter(Boolean).map((paire) => {
    const [cle, valeur] = paire.split("=");
    return [cle, valeur === "true" ? true : valeur === "false" ? false : Number(valeur)];
  })
);

if (!Object.values(FORCES).includes(FORCE)) { console.error(`force inconnue : ${FORCE}`); process.exit(1); }
if (!Object.values(TEMPERAMENTS).includes(TEMPERAMENT)) { console.error(`temperament inconnu : ${TEMPERAMENT}`); process.exit(1); }
if (Object.keys(VARIANTE).length === 0) { console.error("aucun reglage a tester"); process.exit(1); }

const GRAINES = process.env.GRAINES
  ? process.env.GRAINES.split(",").map(Number)
  : [77, 501, 1301, 2711, 4201, 5507, 6803, 7919];

const temoin = () => makeProfile(FORCE, TEMPERAMENT);
const variante = () => makeProfile(FORCE, TEMPERAMENT, VARIANTE);

function serie(graine, siegesVariante) {
  const profils = {};
  for (const id of [1, 2, 3, 4]) profils[id] = siegesVariante.includes(id) ? variante() : temoin();
  setSeed(20260817);
  const { resultats } = lancerCampagne({ parties: PARTIES, nbJoueurs: 4, seed: graine, profils });
  let scoreVariante = 0, scoreTemoin = 0, victoiresVariante = 0, parties = 0;
  for (const r of resultats) {
    parties++;
    for (const id of [1, 2, 3, 4]) {
      const total = r.scores?.[id]?.total ?? 0;
      if (siegesVariante.includes(id)) scoreVariante += total; else scoreTemoin += total;
    }
    if (siegesVariante.includes(r.gagnantId)) victoiresVariante++;
  }
  return {
    variante: scoreVariante / (parties * 2),
    temoin: scoreTemoin / (parties * 2),
    tauxVictoire: victoiresVariante / parties,
  };
}

console.log(`parties par serie   ${PARTIES}   force ${FORCE}   temperament ${TEMPERAMENT}`);
console.log(`variante testee     ${JSON.stringify(VARIANTE)}`);
console.log(`\ngraine  variante  temoin   ecart   victoires variante`);
let cumulV = 0, cumulT = 0, cumulVict = 0, n = 0;
for (const graine of GRAINES) {
  for (const sieges of [[1, 3], [2, 4]]) {
    const r = serie(graine, sieges);
    cumulV += r.variante; cumulT += r.temoin; cumulVict += r.tauxVictoire; n++;
    console.log(
      `${String(graine).padEnd(6)}  ${r.variante.toFixed(2).padStart(7)}  ${r.temoin.toFixed(2).padStart(6)}` +
      `  ${(r.variante - r.temoin >= 0 ? "+" : "") + (r.variante - r.temoin).toFixed(2).padStart(6)}` +
      `   ${(r.tauxVictoire * 100).toFixed(1).padStart(5)} %   sieges ${sieges.join("+")}`
    );
  }
}
const ecart = cumulV / n - cumulT / n;
console.log(`\nmoyenne  variante ${(cumulV / n).toFixed(2)}   temoin ${(cumulT / n).toFixed(2)}`);
console.log(`ecart    ${(ecart >= 0 ? "+" : "") + ecart.toFixed(2)} point(s) par partie`);
console.log(`victoires de la variante ${((cumulVict / n) * 100).toFixed(1)} % (50 % = a egalite)`);
