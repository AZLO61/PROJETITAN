/* ============================================================
   PROJET TITAN — Diagnostic du moteur et des IA
   ============================================================
   Lance des parties avec TOUS les contrôles activés et rapporte ce qui
   ne va pas. Différent de `simulate`, qui produit des statistiques de
   jeu : ici on cherche les défauts, pas l'équilibrage.

   Ce qui est vérifié après chaque action :
     · deux Titans sur la même case
     · un Titan debout sur un bâtiment
     · une case hors du plateau
     · Adrénaline, Bagarre ou Destruction négatives ou non numériques
     · plus de blocs en jeu qu'il n'en existe dans la boîte
     · une carte dupliquée ou perdue dans la main d'un Titan
     · une pile de blocs libres vide qui traîne

   Et au niveau des IA :
     · candidats écartés faute d'exception (le silence du garde-fou)
     · tours où aucun coup n'était jouable
     · Manches entières sautées faute de 3 cartes en main

   Usage :
     npm run diagnose
     npm run diagnose -- --parties 50 --joueurs 3 --seed 7
============================================================ */

import { lancerCampagne } from "../src/domain/simulation.js";
import { diagnostics, reinitialiserDiagnostics } from "../src/domain/aiPlanner.js";

function lireArguments(argv) {
  const opts = { parties: 25, joueurs: 4, seed: 1 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--parties") opts.parties = Number(argv[++i]);
    else if (argv[i] === "--joueurs") opts.joueurs = Number(argv[++i]);
    else if (argv[i] === "--seed") opts.seed = Number(argv[++i]);
  }
  return opts;
}

const opts = lireArguments(process.argv.slice(2));

console.log("═".repeat(72));
console.log(`  DIAGNOSTIC — ${opts.parties} parties à ${opts.joueurs} Titans (graine ${opts.seed})`);
console.log("═".repeat(72));

reinitialiserDiagnostics();
const debut = Date.now();
const campagne = lancerCampagne({
  parties: opts.parties,
  nbJoueurs: opts.joueurs,
  seed: opts.seed,
  verifier: true,
});
const duree = ((Date.now() - debut) / 1000).toFixed(1);

const anomalies = campagne.anomalies;
const types = Object.keys(anomalies);

// Un invariant violé est une faute de moteur : le jeu produit un état
// impossible. Les autres anomalies sont des situations légales mais
// notables, qu'il faut pouvoir quantifier avant de les juger.
const GRAVES = new Set(["invariant", "hygiene"]);

console.log("\nINVARIANTS DE RÈGLE");
const invariants = anomalies.invariant;
if (!invariants) {
  console.log("  ✅ Aucune violation sur l'ensemble des parties.");
} else {
  console.log(`  ❌ ${invariants.total} violation(s) sur ${invariants.partiesTouchees} partie(s).`);
  for (const [regle, n] of Object.entries(invariants.details).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${regle} : ${n}`);
  }
  console.log("\n  Exemples (la graine permet de rejouer la partie exacte) :");
  for (const ex of invariants.exemples) {
    console.log(`     graine ${ex.seed} — ${ex.regle} — ${ex.detail}`);
    console.log(`       contexte : ${ex.contexte}`);
  }
}

const hygiene = anomalies.hygiene;
console.log("\nHYGIÈNE (rien d'illégal, mais des scories)");
if (!hygiene) {
  console.log("  ✅ Rien à signaler.");
} else {
  for (const [regle, n] of Object.entries(hygiene.details).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${regle} : ${n} occurrence(s) sur ${hygiene.partiesTouchees} partie(s)`);
  }
}

console.log("\nSITUATIONS NOTABLES (légales, mais à quantifier)");
const notables = types.filter((t) => !GRAVES.has(t));
if (notables.length === 0) {
  console.log("  Aucune.");
} else {
  for (const type of notables) {
    const a = anomalies[type];
    console.log(`  ${type} : ${a.total} fois, sur ${a.partiesTouchees} partie(s) / ${opts.parties}`);
    for (const [cle, n] of Object.entries(a.details).sort((x, y) => y[1] - x[1]).slice(0, 6)) {
      console.log(`     ${cle} : ${n}`);
    }
  }
}

console.log("\nRÉFLEXION DES IA");
console.log(`  Candidats écartés sur exception : ${diagnostics.candidatsEcartes}`);
console.log(`  Tours sans aucun coup jouable   : ${diagnostics.coupsSansCandidat}`);
if (Object.keys(diagnostics.erreurs).length === 0) {
  console.log("  ✅ Aucune exception levée pendant la réflexion.");
} else {
  console.log("  ❌ Exceptions rencontrées :");
  for (const [msg, n] of Object.entries(diagnostics.erreurs).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${n}× ${msg}`);
  }
}

// Un score identique d'une partie à l'autre, ou un gagnant toujours à la
// même place, trahirait un simulateur qui ne simule rien.
const scores = campagne.resultats.map((r) => r.classement[0].total);
const gagnants = new Set(campagne.resultats.map((r) => r.gagnantId));
console.log("\nVITALITÉ DE LA SIMULATION");
console.log(`  Scores gagnants distincts : ${new Set(scores).size} sur ${scores.length} parties`);
console.log(`  Titans ayant gagné au moins une fois : ${[...gagnants].sort().join(", ")}`);
if (new Set(scores).size <= 1) {
  console.log("  ❌ Tous les scores sont identiques : la simulation est figée.");
}

// Seules les violations de RÈGLE et les exceptions font échouer : les
// scories d'hygiène sont signalées mais ne bloquent pas.
const grave = Boolean(invariants) || Object.keys(diagnostics.erreurs).length > 0;
console.log("\n" + "─".repeat(72));
console.log(grave ? "  RÉSULTAT : des défauts ont été trouvés (voir ci-dessus)." : "  RÉSULTAT : aucun défaut détecté.");
console.log(`  ${opts.parties} parties diagnostiquées en ${duree} s.`);
console.log("─".repeat(72) + "\n");

process.exit(grave ? 1 : 0);
