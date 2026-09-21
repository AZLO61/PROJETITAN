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
 * LE VERDICT EST CALCULÉ, PLUS LU À L'ŒIL (2026-09-21). On a longtemps
 * tranché « bruit » ou « signal » en regardant la colonne des écarts : le
 * 2026-09-07, un contrôle d'identité y déviait de ±6 points sur une série
 * isolée, et +0,91 point sur 40 parties avait été déclaré « dans le bruit »
 * sans que rien ne le chiffre. L'unité statistique est la PAIRE de parties
 * jouées sur une même graine, sièges croisés : les deux parties partagent le
 * plateau, les compter comme indépendantes fausserait l'incertitude. Le
 * script donne l'intervalle de confiance à 95 % de l'écart et dit s'il exclut
 * zéro.
 *
 * EN PARALLÈLE. Une partie d'Experts prend ~7 s : les 480 parties d'un duel
 * par défaut tenaient une heure sur un seul cœur. Elles sont réparties sur
 * les cœurs de la machine (cf. `parallele.mjs`), et chaque partie reste
 * entièrement déterminée par sa graine — le résultat ne dépend pas du nombre
 * de fils. `FILS=4` en réserve quand la machine sert à autre chose : une
 * campagne lancée pendant `npm test` fait sauter les tests longs en délai
 * dépassé.
 *
 * LE SIMULATEUR JOUE LES DÉCISIONS DE LA TABLE depuis le 2026-09-21 : un duel
 * antérieur à cette date mesurait un jeu où les Dilemmes et les RAGE étaient
 * résolus par le modèle de l'IA (cf. l'en-tête de simulation.js). Ses
 * chiffres ne se comparent pas aux duels d'après.
 *
 * Usage :
 *   node scripts/duel-reglages.mjs <parties> <force> <temperament> <cle=valeur[,cle=valeur]>
 * Exemple — donner au Moyen le chiffrage au score complet :
 *   node scripts/duel-reglages.mjs 30 moyen opportuniste voitPorteeAuScore=true
 */
import { FORCES, TEMPERAMENTS, makeProfile } from "../src/domain/aiEvaluation.js";
import { jouerParties } from "./parallele.mjs";

const SIEGES = [[1, 3], [2, 4]];

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

// Une partie par tâche : chaque graine est jouée deux fois, sièges croisés.
const plan = [];
for (const graine of GRAINES) {
  for (let i = 0; i < PARTIES; i++) {
    for (const sieges of SIEGES) plan.push({ seed: graine + i, sieges });
  }
}

console.log(`parties par serie   ${PARTIES}   force ${FORCE}   temperament ${TEMPERAMENT}`);
console.log(`variante testee     ${JSON.stringify(VARIANTE)}`);

const parties = await jouerParties(plan.map(({ seed, sieges }) => {
  const profils = {};
  for (const id of [1, 2, 3, 4]) {
    profils[id] = sieges.includes(id) ? makeProfile(FORCE, TEMPERAMENT, VARIANTE) : makeProfile(FORCE, TEMPERAMENT);
  }
  return { nbJoueurs: 4, profils, seed };
}));
const resultats = parties.map((r, k) => {
  const { seed, sieges } = plan[k];
  let v = 0, t = 0;
  for (const id of [1, 2, 3, 4]) {
    const total = r.scores?.[id]?.total ?? 0;
    if (sieges.includes(id)) v += total; else t += total;
  }
  return { seed, sieges, variante: v / 2, temoin: t / 2, gagne: sieges.includes(r.gagnantId) };
});

// ── TABLEAU PAR SÉRIE, comme avant la mise en parallèle ──
console.log(`\ngraine  variante  temoin   ecart   victoires variante`);
const signe = (x, d = 2) => (x >= 0 ? "+" : "") + x.toFixed(d);
for (const graine of GRAINES) {
  for (const sieges of SIEGES) {
    const serie = resultats.filter((r) => r.seed >= graine && r.seed < graine + PARTIES && r.sieges[0] === sieges[0]);
    const moy = (cle) => serie.reduce((s, r) => s + Number(r[cle]), 0) / serie.length;
    console.log(
      `${String(graine).padEnd(6)}  ${moy("variante").toFixed(2).padStart(7)}  ${moy("temoin").toFixed(2).padStart(6)}` +
      `  ${signe(moy("variante") - moy("temoin")).padStart(6)}   ${(moy("gagne") * 100).toFixed(1).padStart(5)} %   sieges ${sieges.join("+")}`
    );
  }
}

// ── VERDICT, sur les paires sièges croisés ──
const parGraine = new Map();
for (const r of resultats) {
  if (!parGraine.has(r.seed)) parGraine.set(r.seed, []);
  parGraine.get(r.seed).push(r);
}
const ecarts = [], victoires = [];
for (const paire of parGraine.values()) {
  ecarts.push(paire.reduce((s, r) => s + r.variante - r.temoin, 0) / paire.length);
  victoires.push(paire.reduce((s, r) => s + (r.gagne ? 1 : 0), 0) / paire.length);
}
const intervalle = (xs) => {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1);
  const marge = 1.96 * Math.sqrt(variance / xs.length);
  return { m, bas: m - marge, haut: m + marge };
};
const e = intervalle(ecarts), v = intervalle(victoires);
const pct = (x) => (Math.min(1, Math.max(0, x)) * 100).toFixed(1);
console.log(`\npaires   ${ecarts.length} (une graine jouee sieges 1+3 puis 2+4)`);
console.log(`ecart    ${signe(e.m)} point(s) par partie   IC 95 % [${signe(e.bas)} ; ${signe(e.haut)}]`);
console.log(`victoires de la variante ${pct(v.m)} %   IC 95 % [${pct(v.bas)} ; ${pct(v.haut)}]   (50 % = a egalite)`);
console.log(
  e.bas > 0 ? "verdict  la variante est MEILLEURE : l'intervalle ne contient pas 0"
    : e.haut < 0 ? "verdict  la variante est MOINS BONNE : l'intervalle ne contient pas 0"
      : `verdict  indiscernable du temoin : l'effet reel, s'il existe, est entre ${signe(e.bas)} et ${signe(e.haut)} point(s)`
);
