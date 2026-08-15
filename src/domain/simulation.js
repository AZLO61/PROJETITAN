/* ============================================================
   PROJET TITAN — Simulateur de parties
   ============================================================
   À QUOI ÇA SERT

   Tester un jeu de société avec des amis donne dix parties par mois, et
   chacune mélange le hasard, la fatigue et la mauvaise foi. Ce module
   joue des milliers de parties complètes en quelques secondes, avec des
   adversaires dont on connaît exactement le niveau, et répond à des
   questions qu'aucune session de test ne peut trancher :

     · la position de départ avantage-t-elle quelqu'un ?
     · le Détonateur de la Manche 1 gagne-t-il plus souvent ?
     · une couleur domine-t-elle le scoring ?
     · une carte est-elle systématiquement délaissée ?
     · l'écart entre le premier et le dernier est-il correct, ou la
       partie est-elle pliée dès la Manche 2 ?

   ------------------------------------------------------------
   FIDÉLITÉ AU JEU RÉEL — À LIRE AVANT D'EXPLOITER DES CHIFFRES

   Le simulateur appelle les VRAIS résolveurs du moteur et le VRAI barème.
   Il ne réimplémente pas les règles. Il partage même sa fonction de coup
   avec l'IA (`appliquerCoup`), pour qu'il ne puisse exister aucune
   divergence entre ce que l'IA croit jouer et ce qui se produit.

   Il s'en écarte sur trois points, tous assumés et tous documentés ici :

   1. DIL et RAGE sont résolus en valeur attendue (chaque camp joue son
      intérêt) et non par la file de décisions de l'application. Contre
      un humain imprévisible, la réalité s'en écarte.
   2. Les cartes Événements sont désactivées. Elles n'ont aujourd'hui
      aucun effet mécanique dans le moteur — décision de Nikola de les
      traiter en extension plus tard. Toute statistique produite ici
      décrit donc le jeu SANS Événements.
   3. Le sens du Vol de Phase Repos est tiré au sort au lieu d'être
      choisi par le Détonateur, faute de règle de décision pour l'IA.

   ------------------------------------------------------------
   REPRODUCTIBILITÉ

   Chaque partie reçoit une graine. Deux campagnes lancées sur la même
   graine de départ produisent exactement les mêmes parties, ce qui
   permet de ne changer QU'UN paramètre entre deux campagnes et
   d'attribuer la différence à ce paramètre. Sans ça, comparer deux
   réglages d'IA n'a aucun sens.
============================================================ */

import {
  applyRestitution,
  computeFinalScore,
  generateBoard,
  manchesMax,
  nextDetonateur,
  placeTitans,
  programCards,
  resolveFreeMovement,
  resolveRecuperation,
  resolveVolPhaseRepos,
} from "./gameRules.js";
import {
  FORCES,
  TEMPERAMENTS,
  bestVertAssignments,
  makeProfile,
  profileLabel,
} from "./aiEvaluation.js";
import {
  appliquerCoup,
  planCardPlay,
  planMovement,
  planProgrammation,
  planRecuperation,
} from "./aiPlanner.js";
import { pick, setSeed } from "./rng.js";

const ROUNDS_PAR_MANCHE = 3;

/** Profils tirés au sort pour une partie, un par Titan. */
export function profilsAleatoires(nbJoueurs) {
  const forces = Object.values(FORCES);
  const temperaments = Object.values(TEMPERAMENTS);
  const out = {};
  for (let id = 1; id <= nbJoueurs; id++) {
    out[id] = makeProfile(pick(forces), pick(temperaments));
  }
  return out;
}

/**
 * Joue une partie complète et retourne son compte rendu.
 *
 * @param {object} options
 * @param {number} options.nbJoueurs   3 ou 4
 * @param {object} options.profils     { [titanId]: { force, temperament } }
 * @param {number} options.seed        graine, pour rejouer la partie
 */
export function jouerPartie({ nbJoueurs = 4, profils = null, seed = 0 } = {}) {
  setSeed(seed);

  const etatPlateau = generateBoard();
  const titanState = placeTitans(nbJoueurs);
  const etat = {
    board: etatPlateau.board,
    looseBlocks: {},
    titans: titanState.players,
  };

  const profilsUtilises = profils ?? profilsAleatoires(nbJoueurs);
  const detonateurInitial = titanState.detonateur;
  const positionsDepart = Object.fromEntries(titanState.players.map((t) => [t.id, t.cell]));

  // Compteurs d'usage : c'est eux qui disent si une carte est délaissée.
  const cartesJouees = {};
  let ordreJeu = [...titanState.ordreJeu];
  let detonateur = titanState.detonateur;

  const total = manchesMax(nbJoueurs);
  for (let manche = 1; manche <= total; manche++) {
    // ── PHASE PROGRAMMATION ──
    for (const id of ordreJeu) {
      const cartes = planProgrammation(id, etat, profilsUtilises[id], manche);
      if (cartes.length === ROUNDS_PAR_MANCHE) programCards(id, cartes, etat.titans);
    }

    // ── PHASE ACTION : 3 rounds, 1 carte par Titan et par round ──
    for (let round = 0; round < ROUNDS_PAR_MANCHE; round++) {
      for (const id of ordreJeu) {
        const titan = etat.titans.find((t) => t.id === id);
        if (!titan || titan.programmed.length === 0) continue;
        const profil = profilsUtilises[id];

        // 1. Mouvement gratuit (2 cases), passif de chaque tour.
        const mouvement = planMovement(id, etat, profil);
        if (mouvement) resolveFreeMovement(id, mouvement.destKey, etat);

        // 2. Carte Action.
        const coup = planCardPlay(id, etat, profil, manche);
        const cardId = coup?.cardId ?? titan.programmed[0];
        if (coup) appliquerCoup(coup, id, etat, manche);
        cartesJouees[cardId] = (cartesJouees[cardId] || 0) + 1;

        // La carte quitte la programmation pour le pool de la Manche,
        // qui alimente le Vol de Phase Repos.
        const idx = titan.programmed.indexOf(cardId);
        if (idx !== -1) {
          titan.programmed.splice(idx, 1);
          titan.playedThisManche.push(cardId);
        }

        // 3. Récupération, passif de chaque tour.
        const recup = planRecuperation(id, etat, profil);
        if (recup) resolveRecuperation(id, recup.cellKey, etat, recup.pickedValue);
      }
    }

    // ── PHASE REPOS ──
    // Le sens du vol revient au Détonateur dans le livret ; faute de
    // règle de décision pour l'IA, il est tiré au sort (cf. en-tête).
    resolveVolPhaseRepos(manche, pick(["gauche", "droite"]), ordreJeu, etat.titans);

    // ── FIN DE MANCHE ──
    if (manche < total) {
      for (const t of etat.titans) {
        // Les cartes non volées reviennent en main immédiatement.
        t.hand.push(...t.playedThisManche, ...(t.discardedHidden || []));
        t.playedThisManche = [];
        t.discardedHidden = [];
        applyRestitution(t, manche + 1);
        t.adrenaline = (t.adrenaline || 0) + 1;
      }
      detonateur = nextDetonateur(ordreJeu, detonateur);
    }
  }

  // ── DÉCOMPTE ──
  // Placement des Verts en mode EXACT : c'est la vraie décision de fin de
  // partie, elle n'est calculée qu'une fois, elle doit être juste.
  const verts = bestVertAssignments(etat.titans, { exact: true });
  const scores = computeFinalScore(etat.titans, verts, null);

  const classement = [...etat.titans]
    .map((t) => ({ id: t.id, total: scores.totals[t.id].total }))
    .sort((a, b) => b.total - a.total);

  return {
    seed,
    nbJoueurs,
    profils: profilsUtilises,
    detonateurInitial,
    positionsDepart,
    ordreJeu,
    cartesJouees,
    scores: scores.totals,
    detailVerts: verts,
    classement,
    gagnantId: classement[0].id,
    // Un écart faible signale une partie serrée, un écart énorme une
    // partie pliée d'avance : c'est l'indicateur de tension le plus
    // direct dont dispose un auteur.
    ecartPremierDernier: classement[0].total - classement[classement.length - 1].total,
  };
}

/**
 * Enchaîne N parties et agrège les résultats.
 *
 * @param {object} options
 * @param {number} options.parties    nombre de parties
 * @param {number} options.nbJoueurs  3 ou 4
 * @param {number} options.seed       graine de départ de la campagne
 * @param {object|null} options.profils profils imposés, ou null pour tirer
 *                                      au sort à chaque partie
 */
export function lancerCampagne({ parties = 100, nbJoueurs = 4, seed = 1, profils = null } = {}) {
  const resultats = [];
  for (let i = 0; i < parties; i++) {
    resultats.push(jouerPartie({ nbJoueurs, profils, seed: seed + i }));
  }
  return { parties, nbJoueurs, seed, resultats, stats: agreger(resultats) };
}

function moyenne(valeurs) {
  if (valeurs.length === 0) return 0;
  return valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
}

function ecartType(valeurs) {
  if (valeurs.length < 2) return 0;
  const m = moyenne(valeurs);
  return Math.sqrt(moyenne(valeurs.map((v) => (v - m) ** 2)));
}

/** Agrège une liste de parties en statistiques exploitables. */
export function agreger(resultats) {
  const n = resultats.length;
  if (n === 0) return null;

  const parTitan = {};
  const parForce = {};
  const parTemperament = {};
  const parProfil = {};
  const cartes = {};
  let victoiresDetonateur = 0;

  const compter = (bac, cle) => {
    if (!bac[cle]) bac[cle] = { parties: 0, victoires: 0, scores: [] };
    return bac[cle];
  };

  for (const r of resultats) {
    if (r.gagnantId === r.detonateurInitial) victoiresDetonateur++;
    for (const [cardId, nb] of Object.entries(r.cartesJouees)) {
      cartes[cardId] = (cartes[cardId] || 0) + nb;
    }
    for (const t of r.classement) {
      const profil = r.profils[t.id];
      const gagne = t.id === r.gagnantId ? 1 : 0;

      for (const [bac, cle] of [
        [parTitan, `Titan ${t.id}`],
        [parForce, profil.force],
        [parTemperament, profil.temperament],
        [parProfil, profileLabel(profil)],
      ]) {
        const e = compter(bac, cle);
        e.parties++;
        e.victoires += gagne;
        e.scores.push(t.total);
      }
    }
  }

  const finaliser = (bac) => {
    const out = {};
    for (const [cle, e] of Object.entries(bac)) {
      out[cle] = {
        parties: e.parties,
        victoires: e.victoires,
        tauxVictoire: e.parties > 0 ? e.victoires / e.parties : 0,
        scoreMoyen: Number(moyenne(e.scores).toFixed(2)),
        scoreEcartType: Number(ecartType(e.scores).toFixed(2)),
        scoreMin: Math.min(...e.scores),
        scoreMax: Math.max(...e.scores),
      };
    }
    return out;
  };

  const totalCartes = Object.values(cartes).reduce((s, v) => s + v, 0);
  const usageCartes = {};
  for (const [cardId, nb] of Object.entries(cartes)) {
    usageCartes[cardId] = { jouees: nb, part: totalCartes > 0 ? nb / totalCartes : 0 };
  }

  const ecarts = resultats.map((r) => r.ecartPremierDernier);
  const scoresGagnants = resultats.map((r) => r.classement[0].total);

  return {
    parties: n,
    parTitan: finaliser(parTitan),
    parForce: finaliser(parForce),
    parTemperament: finaliser(parTemperament),
    parProfil: finaliser(parProfil),
    usageCartes,
    // Le Détonateur de la Manche 1 est-il avantagé ? Comparer ce taux au
    // hasard pur (1/nbJoueurs) répond à la question.
    victoiresDetonateur: {
      victoires: victoiresDetonateur,
      taux: victoiresDetonateur / n,
      attenduSiEquilibre: 1 / resultats[0].nbJoueurs,
    },
    tension: {
      ecartMoyenPremierDernier: Number(moyenne(ecarts).toFixed(2)),
      ecartMin: Math.min(...ecarts),
      ecartMax: Math.max(...ecarts),
      scoreGagnantMoyen: Number(moyenne(scoresGagnants).toFixed(2)),
      scoreGagnantMin: Math.min(...scoresGagnants),
      scoreGagnantMax: Math.max(...scoresGagnants),
    },
  };
}
