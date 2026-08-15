/* ============================================================
   PROJET TITAN — Lancement d'une campagne de simulation
   ============================================================
   Usage :
     npm run simulate                          100 parties à 4 Titans
     npm run simulate -- --parties 2000        campagne longue
     npm run simulate -- --joueurs 3           partie à 3 Titans
     npm run simulate -- --seed 42             campagne reproductible
     npm run simulate -- --profil expert:agressif
                                               tous les Titans identiques
     npm run simulate -- --json rapport.json   sortie machine
     npm run simulate -- --silencieux --json r.json
                                               JSON seul, sans tableau

   Deux sorties, comme demandé par Nikola :
     · un rapport lisible dans le terminal, pour lui ;
     · un fichier JSON complet (--json), pour être relu et analysé par
       une IA, ou rechargé plus tard pour comparer deux campagnes.
============================================================ */

import { writeFile } from "node:fs/promises";
import { lancerCampagne } from "../src/domain/simulation.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../src/domain/aiEvaluation.js";
import { CARD_LABEL } from "../src/domain/gameRules.js";

function lireArguments(argv) {
  const opts = { parties: 100, joueurs: 4, seed: 1, profil: null, json: null, silencieux: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--parties") opts.parties = Number(argv[++i]);
    else if (a === "--joueurs") opts.joueurs = Number(argv[++i]);
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--profil") opts.profil = argv[++i];
    else if (a === "--json") opts.json = argv[++i];
    else if (a === "--silencieux") opts.silencieux = true;
  }
  return opts;
}

// "expert:agressif" → profil imposé à tous les Titans. Sert à isoler une
// variable : si tout le monde joue pareil, l'écart restant ne vient plus
// que de la position de départ et du hasard du plateau.
function construireProfils(spec, nbJoueurs) {
  if (!spec) return null;
  const [force, temperament] = spec.split(":");
  const forcesOk = Object.values(FORCES);
  const tempsOk = Object.values(TEMPERAMENTS);
  if (!forcesOk.includes(force) || !tempsOk.includes(temperament)) {
    console.error(`Profil invalide : "${spec}"`);
    console.error(`Forces possibles      : ${forcesOk.join(", ")}`);
    console.error(`Tempéraments possibles: ${tempsOk.join(", ")}`);
    process.exit(1);
  }
  const out = {};
  for (let id = 1; id <= nbJoueurs; id++) out[id] = makeProfile(force, temperament);
  return out;
}

const pct = (v) => `${(v * 100).toFixed(1)} %`;

function tableau(titre, lignes, colonnes) {
  console.log(`\n${titre}`);
  const entetes = ["", ...colonnes.map((c) => c.titre)];
  const corps = lignes.map(([cle, valeur]) => [cle, ...colonnes.map((c) => c.valeur(valeur))]);
  const largeurs = entetes.map((_, i) =>
    Math.max(entetes[i].length, ...corps.map((l) => String(l[i]).length))
  );
  const ligne = (cells) =>
    "  " + cells.map((c, i) => (i === 0 ? String(c).padEnd(largeurs[i]) : String(c).padStart(largeurs[i]))).join("  ");
  console.log(ligne(entetes));
  console.log("  " + largeurs.map((l) => "─".repeat(l)).join("  "));
  corps.forEach((l) => console.log(ligne(l)));
}

const COLONNES_STANDARD = [
  { titre: "Parties", valeur: (v) => v.parties },
  { titre: "Victoires", valeur: (v) => v.victoires },
  { titre: "Taux", valeur: (v) => pct(v.tauxVictoire) },
  { titre: "Score moy.", valeur: (v) => v.scoreMoyen },
  { titre: "Écart-type", valeur: (v) => v.scoreEcartType },
  { titre: "Min", valeur: (v) => v.scoreMin },
  { titre: "Max", valeur: (v) => v.scoreMax },
];

function afficherRapport(campagne) {
  const { stats, parties, nbJoueurs, seed } = campagne;
  console.log("═".repeat(72));
  console.log(`  PROJET TITAN — ${parties} parties à ${nbJoueurs} Titans (graine ${seed})`);
  console.log("═".repeat(72));

  const attendu = 1 / nbJoueurs;
  console.log(`\n  Taux de victoire attendu si tout est équilibré : ${pct(attendu)}`);

  tableau("POSITION DE DÉPART — un Titan est-il avantagé par sa place ?",
    Object.entries(stats.parTitan), COLONNES_STANDARD);

  tableau("FORCE DE L'IA — l'échelle Novice / Confirmé / Expert tient-elle ?",
    Object.entries(stats.parForce).sort((a, b) => b[1].tauxVictoire - a[1].tauxVictoire),
    COLONNES_STANDARD);

  tableau("TEMPÉRAMENT — un style domine-t-il ? (il ne devrait pas)",
    Object.entries(stats.parTemperament).sort((a, b) => b[1].tauxVictoire - a[1].tauxVictoire),
    COLONNES_STANDARD);

  tableau("PROFILS COMPLETS",
    Object.entries(stats.parProfil).sort((a, b) => b[1].tauxVictoire - a[1].tauxVictoire),
    COLONNES_STANDARD);

  tableau("USAGE DES CARTES — une carte est-elle délaissée ?",
    Object.entries(stats.usageCartes).sort((a, b) => b[1].jouees - a[1].jouees),
    [
      { titre: "Jouées", valeur: (v) => v.jouees },
      { titre: "Part", valeur: (v) => pct(v.part) },
    ]);

  const det = stats.victoiresDetonateur;
  console.log("\nDÉTONATEUR DE LA MANCHE 1");
  console.log(`  Victoires : ${det.victoires} / ${parties} — ${pct(det.taux)}`);
  console.log(`  Attendu si aucun avantage : ${pct(det.attenduSiEquilibre)}`);
  const biais = det.taux - det.attenduSiEquilibre;
  console.log(`  Écart : ${biais >= 0 ? "+" : ""}${(biais * 100).toFixed(1)} points`);

  const t = stats.tension;
  console.log("\nTENSION DES PARTIES");
  console.log(`  Écart premier / dernier : ${t.ecartMoyenPremierDernier} en moyenne (de ${t.ecartMin} à ${t.ecartMax})`);
  console.log(`  Score du gagnant        : ${t.scoreGagnantMoyen} en moyenne (de ${t.scoreGagnantMin} à ${t.scoreGagnantMax})`);

  console.log("\n" + "─".repeat(72));
  console.log("  Rappel : ces chiffres décrivent le jeu SANS cartes Événements,");
  console.log("  et avec DIL/RAGE résolus en valeur attendue. Voir l'en-tête de");
  console.log("  src/domain/simulation.js pour les trois écarts au jeu réel.");
  console.log("─".repeat(72));
}

const opts = lireArguments(process.argv.slice(2));
const profils = construireProfils(opts.profil, opts.joueurs);

const debut = Date.now();
const campagne = lancerCampagne({
  parties: opts.parties,
  nbJoueurs: opts.joueurs,
  seed: opts.seed,
  profils,
});
const duree = ((Date.now() - debut) / 1000).toFixed(1);

if (!opts.silencieux) {
  afficherRapport(campagne);
  console.log(`\n  ${opts.parties} parties simulées en ${duree} s.\n`);
}

if (opts.json) {
  // Sortie machine : les statistiques agrégées ET le détail partie par
  // partie, chacune avec sa graine — n'importe laquelle peut donc être
  // rejouée à l'identique pour comprendre un résultat surprenant.
  const rapport = {
    genereLe: new Date().toISOString(),
    parametres: { parties: opts.parties, joueurs: opts.joueurs, seed: opts.seed, profil: opts.profil },
    dureeSecondes: Number(duree),
    avertissements: [
      "Cartes Événements désactivées : elles n'ont aucun effet mécanique dans le moteur.",
      "DIL et RAGE résolus en valeur attendue, pas par la file de décisions de l'application.",
      "Sens du Vol de Phase Repos tiré au sort au lieu d'être choisi par le Détonateur.",
    ],
    libellesCartes: CARD_LABEL,
    stats: campagne.stats,
    parties: campagne.resultats.map((r) => ({
      seed: r.seed,
      gagnantId: r.gagnantId,
      detonateurInitial: r.detonateurInitial,
      ordreJeu: r.ordreJeu,
      positionsDepart: r.positionsDepart,
      profils: r.profils,
      classement: r.classement,
      ecartPremierDernier: r.ecartPremierDernier,
      cartesJouees: r.cartesJouees,
    })),
  };
  await writeFile(opts.json, JSON.stringify(rapport, null, 2), "utf8");
  if (!opts.silencieux) console.log(`  Rapport JSON écrit dans ${opts.json}\n`);
}
