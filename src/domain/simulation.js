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

   Il s'en écarte sur quatre points, tous assumés et tous documentés ici :

   1. DIL et RAGE sont résolus en valeur attendue (chaque camp joue son
      intérêt) et non par la file de décisions de l'application. Contre
      un humain imprévisible, la réalité s'en écarte.
   2. Les cartes Événements sont désactivées. Elles n'ont aujourd'hui
      aucun effet mécanique dans le moteur — décision de Nikola de les
      traiter en extension plus tard. Toute statistique produite ici
      décrit donc le jeu SANS Événements.
   3. Le sens du Vol de Phase Repos est tiré au sort au lieu d'être
      choisi par le Détonateur, faute de règle de décision pour l'IA.
   4. Sur Faut Pas Me Chauffer, les deux camps misent 0 Adrénaline : la
      mise cachée n'a pas de règle de décision pour l'IA. Le reste de la
      carte — comparaison des sommes, projection de la cible, Bagarre,
      DIL/RAGE — est bien joué par le vrai résolveur depuis le scan du
      2026-08-15. Auparavant la carte n'avait AUCUN effet physique ici,
      et cet écart-là n'était pas documenté.

   Deux écarts ont disparu au scan du 2026-08-15, ils sont notés pour
   mémoire : le simulateur n'évaluait aucun déclencheur de fin de partie
   (toutes les parties allaient au bout des Manches, donc plus longues que
   les vraies), et l'IA ne visait jamais un Titan avec Boing Boing.

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
  checkEndGameTriggers,
  classementFinal,
  computeFinalScore,
  ensureProgrammableHand,
  generateBoard,
  manchesMax,
  nextDetonateur,
  placeTitans,
  programCards,
  rentrerEnJeu,
  resolveFreeMovement,
  resolveRecuperation,
  rendreCartesEmpruntees,
  resolveVolPhaseRepos,
} from "./gameRules.js";
import {
  FORCES,
  TEMPERAMENTS,
  bestVertAssignments,
  gagnantArcEnCiel,
  makeProfile,
  profileLabel,
  reglagesDe,
} from "./aiEvaluation.js";
import {
  appliquerCoup,
  planCardPlay,
  planMovement,
  planProgrammation,
  planProgrammationSequentielle,
  planRecuperation,
  planTour,
} from "./aiPlanner.js";
import { pick, setSeed } from "./rng.js";
import { verifierHygiene, verifierInvariants } from "./invariants.js";

const ROUNDS_PAR_MANCHE = 3;
// Portée du passif Mouvement gratuit, hors Adrénaline dépensée.
const PORTEE_MOUVEMENT = 2;

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
export function jouerPartie({ nbJoueurs = 4, profils = null, seed = 0, verifier = false, apocalypseThreshold = 5, modeVolRepos = "main" } = {}) {
  setSeed(seed);
  // Journal des anomalies : violations d'invariants, Manches sautées,
  // tours sans coup jouable. Toujours rempli, même hors mode `verifier`,
  // parce qu'un simulateur qui produit des chiffres faux en silence est
  // pire qu'un simulateur qui plante.
  const anomalies = [];

  const etatPlateau = generateBoard();
  const titanState = placeTitans(nbJoueurs);
  const etat = {
    board: etatPlateau.board,
    looseBlocks: {},
    titans: titanState.players,
    // Contexte de fin de partie, lu par `valeurFinDePartie` : sans lui, le
    // simulateur mesurerait des IA aveugles à une lecture que le jeu réel
    // leur donne, et la campagne ne dirait plus rien de la vraie force.
    // `manche` est réécrit à chaque Manche, plus bas.
    finDePartie: { apocalypseThreshold, mancheNumber: 1, nbJoueurs },
  };

  // ── ATTRIBUTION DES VIOLATIONS À L'ÉTAPE FAUTIVE ──
  // Première version du diagnostic : on vérifiait les invariants en fin de
  // tour et on signalait tout ce qui n'allait pas. Problème, un état fautif
  // le RESTE jusqu'à correction : la même superposition était recomptée à
  // chaque contrôle suivant, et rien ne disait quelle action l'avait
  // introduite. On chassait donc à l'aveugle.
  // Ici on ne retient que les violations NOUVELLES par rapport au contrôle
  // précédent, et on les étiquette avec l'étape exacte qui les a produites.
  const dejaVues = new Set();
  const signature = (v) => `${v.regle}|${v.detail}`;

  function controler(etape, manche, round, titanId) {
    if (!verifier) return;
    const ou = `manche ${manche}${round != null ? `, round ${round + 1}` : ""}${titanId != null ? `, Titan ${titanId}` : ""}`;
    for (const v of verifierInvariants(etat, ou)) {
      const cle = signature(v);
      if (dejaVues.has(cle)) continue;
      dejaVues.add(cle);
      anomalies.push({ type: "invariant", etape, ...v });
    }
    for (const h of verifierHygiene(etat)) {
      const cle = signature(h);
      if (dejaVues.has(cle)) continue;
      dejaVues.add(cle);
      anomalies.push({ type: "hygiene", etape, contexte: ou, ...h });
    }
  }

  const profilsUtilises = profils ?? profilsAleatoires(nbJoueurs);
  const detonateurInitial = titanState.detonateur;
  const positionsDepart = Object.fromEntries(titanState.players.map((t) => [t.id, t.cell]));

  // Compteurs d'usage : c'est eux qui disent si une carte est délaissée.
  const cartesJouees = {};
  let ordreJeu = [...titanState.ordreJeu];
  let detonateur = titanState.detonateur;

  const total = manchesMax(nbJoueurs);
  // Les trois déclencheurs « plateau » du livret (Apocalypse Urbaine,
  // Pénurie, Vide Spatial) n'étaient évalués NULLE PART dans le simulateur —
  // la fonction n'était même pas importée. Toutes les parties allaient donc
  // jusqu'à la limite de Manches, systématiquement plus longues que les
  // vraies, et l'ensemble des statistiques d'équilibrage décrivait un jeu
  // qui n'existe pas. Le contrôleur applique désormais exactement le même
  // contrôle, au même moment (fin de Manche, jamais en plein tour).
  let manchesJouees = 0;
  let raisonsFin = [];
  for (let manche = 1; manche <= total; manche++) {
    manchesJouees = manche;
    // L'ordre de la Manche suit l'ordre de jeu, mais DÉMARRE au Détonateur
    // en cours. Le simulateur reproduisait auparavant le bug du
    // contrôleur, qui repartait toujours du premier de l'ordre figé : la
    // rotation du Détonateur n'avait aucun effet et le même Titan ouvrait
    // toutes les Manches. Corrigé des deux côtés le 2026-08-15.
    const depart = Math.max(0, ordreJeu.indexOf(detonateur));
    const ordreManche = [...ordreJeu.slice(depart), ...ordreJeu.slice(0, depart)];

    // ── PHASE PROGRAMMATION ──
    /* Le filet anti-blocage doit passer AVANT la planification, exactement
       comme dans le contrôleur (effet sur `phase === "programmation"`).
       Il manquait ici : sur 600 parties de diagnostic, 49 signalaient une
       « manche sautée, main insuffisante » que le vrai jeu ne produit plus
       depuis que `ensureProgrammableHand` rappelle des cartes de la Zone
       Repos. Le simulateur mesurait donc l'équilibrage d'un jeu plus dur
       que celui qu'on joue — et c'est sur ces chiffres qu'on arbitre. */
    for (const t of etat.titans) ensureProgrammableHand(t);

    for (const id of ordreManche) {
      const cartes = reglagesDe(profilsUtilises[id]).programmationSequentielle
        ? planProgrammationSequentielle(id, etat, profilsUtilises[id], manche)
        : planProgrammation(id, etat, profilsUtilises[id], manche);
      if (cartes.length === ROUNDS_PAR_MANCHE) {
        const res = programCards(id, cartes, etat.titans);
        if (!res.ok) anomalies.push({ type: "programmation-refusee", manche, titanId: id, raison: res.reason });
      } else {
        // Le Titan n'a plus 3 cartes en main : Vol de Phase Repos et
        // Fatigue les envoient en Zone Repos pour deux Manches. Il ne
        // joue alors RIEN de toute la Manche. C'est le comportement du
        // contrôleur aussi (`t.hand.length >= 3`), mais c'est une
        // situation lourde de conséquences qu'il faut pouvoir compter.
        anomalies.push({ type: "manche-sautee-main-insuffisante", manche, titanId: id, cartesEnMain: cartes.length });
      }
    }

    // ── PHASE ACTION : 3 rounds, 1 carte par Titan et par round ──
    for (let round = 0; round < ROUNDS_PAR_MANCHE; round++) {
      for (const id of ordreManche) {
        const titan = etat.titans.find((t) => t.id === id);
        if (!titan || titan.programmed.length === 0) continue;
        const profil = profilsUtilises[id];

        // Un Titan éjecté hors de BIG CITY rentre au DÉBUT de son tour, pas
        // avant (ruling Nikola : « ça évite l'acharnement »). La rentrée se
        // paie sur son Mouvement gratuit du tour.
        let porteeMouvement = PORTEE_MOUVEMENT;
        if (titan.horsPlateau) {
          // `choisirAuto` : le simulateur n'a personne pour trancher entre
          // les deux cases d'un coin bloqué (ruling du 2026-08-24). Sans lui,
          // `rentre` revenait à false et le Titan perdait TOUT son tour.
          const retour = rentrerEnJeu(id, etat, { choisirAuto: true });
          if (!retour.rentre) {
            anomalies.push({ type: "rentree-impossible", manche, round, titanId: id, cellule: retour.cellule });
            continue;
          }
          porteeMouvement = Math.max(0, PORTEE_MOUVEMENT - retour.cout);
          controler("rentree", manche, round, id);
        }

        /* QUI N'A PAS ENCORE JOUÉ CE ROUND. C'est ce qui permet à
           l'évaluation de chiffrer ce qu'un coup OFFRE : ce que je laisse
           traîner devant un Titan qui joue après moi, il le ramasse ; ce
           que je laisse devant un Titan qui a déjà joué, je peux encore
           aller le chercher (cf. `valeurOfferte`). */
        etat.aJouerEncore = new Set(ordreManche.slice(ordreManche.indexOf(id) + 1));
        etat.finDePartie = { apocalypseThreshold, mancheNumber: manche, nbJoueurs };

        /* LE TOUR SE DÉCIDE D'UN BLOC quand la force le permet : la case où
           se placer dépend de la carte qu'on va jouer depuis là (cf.
           `planTour`). Les niveaux du bas gardent la séquence historique,
           décider en aveugle de sa propre carte étant précisément une
           erreur de débutant. */
        const tour = planTour(id, etat, profil, manche, porteeMouvement);

        // 1. Mouvement gratuit (2 cases, réduit d'autant s'il vient de
        //    rentrer sur le plateau), passif de chaque tour.
        const mouvement = tour
          ? (tour.destKey ? { destKey: tour.destKey } : null)
          : (porteeMouvement > 0 ? planMovement(id, etat, profil, porteeMouvement) : null);
        if (mouvement) resolveFreeMovement(id, mouvement.destKey, etat);
        controler("mouvement", manche, round, id);

        // 2. Carte Action.
        const coup = tour ? tour.coup : planCardPlay(id, etat, profil, manche);
        const cardId = coup?.cardId ?? titan.programmed[0];
        if (coup) {
          appliquerCoup(coup, id, etat, manche, profil);
          controler(`carte:${cardId}`, manche, round, id);
          cartesJouees[cardId] = (cartesJouees[cardId] || 0) + 1;
        } else {
          // Aucun coup n'a pu être noté : la carte part en défausse sans
          // effet. Comptabilisé à part, sans quoi les parts d'usage des
          // cartes compteraient des coups qui n'ont jamais eu lieu.
          anomalies.push({ type: "carte-defaussee-sans-coup", manche, round, titanId: id, cardId });
        }

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
        controler("recuperation", manche, round, id);
      }
    }

    // ── PHASE REPOS ──
    // Le sens du vol revient au Détonateur dans le livret ; faute de
    // règle de décision pour l'IA, il est tiré au sort (cf. en-tête).
    // ON REND AVANT DE PIQUER (Nikola, 2026-08-28). Une carte empruntee a
    // la Manche precedente retourne a son proprietaire d'abord ; le pool de
    // vol d'un Titan qui en a joue une ne compte donc plus que ses deux
    // cartes a lui. Voler d'abord permettrait de piquer la carte d'un tiers.
    rendreCartesEmpruntees(etat.titans);
    resolveVolPhaseRepos(manche, pick(["gauche", "droite"]), ordreManche, etat.titans, modeVolRepos);
    controler("vol-phase-repos", manche);

    // ── FIN DE MANCHE ──
    raisonsFin = checkEndGameTriggers(etat.board, etat.looseBlocks, apocalypseThreshold, manche, nbJoueurs);
    if (raisonsFin.length > 0) break;

    for (const t of etat.titans) {
      // Les cartes non volées reviennent en main immédiatement.
      t.hand.push(...t.playedThisManche, ...(t.discardedHidden || []));
      t.playedThisManche = [];
      t.discardedHidden = [];
      applyRestitution(t, manche + 1);
      t.adrenaline = (t.adrenaline || 0) + 1;
    }
    detonateur = nextDetonateur(ordreJeu, detonateur);
    controler("fin-de-manche", manche);
  }

  // ── DÉCOMPTE ──
  // Placement des Verts en mode EXACT : c'est la vraie décision de fin de
  // partie, elle n'est calculée qu'une fois, elle doit être juste.
  const verts = bestVertAssignments(etat.titans, { exact: true });
  /* Le trophée Arc-en-ciel valait `null` ici, donc les 5 points n'étaient
     JAMAIS attribués en campagne : le simulateur notait une partie que le
     jeu réel ne note pas, et toute mesure d'équilibrage était faussée
     d'autant. `gagnantArcEnCiel` le déduit du plateau final — approximation
     sur l'ORDRE d'arrivée quand deux Titans ont les cinq couleurs, jamais
     sur le fait qu'il soit pris ou non. */
  const scores = computeFinalScore(etat.titans, verts, gagnantArcEnCiel(etat.titans));

  // Le tri par score seul laissait les égalités se départager par ordre
  // d'identifiant. classementFinal applique le vrai départage du livret
  // (Adrénaline, puis plus haut Socle, puis Force des cartes non jouées).
  const classement = classementFinal(etat.titans, scores.totals);

  return {
    seed,
    nbJoueurs,
    // Combien de Manches la partie a réellement duré, et ce qui l'a
    // arrêtée. C'est un indicateur d'auteur à part entière : si la moitié
    // des parties s'arrêtent en Manche 2 sur Apocalypse Urbaine, le seuil
    // est mal réglé, et aucune statistique de scoring ne le dirait.
    manchesJouees,
    raisonsFin,
    profils: profilsUtilises,
    detonateurInitial,
    positionsDepart,
    ordreJeu,
    cartesJouees,
    scores: scores.totals,
    detailVerts: verts,
    classement,
    anomalies,
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
export function lancerCampagne({ parties = 100, nbJoueurs = 4, seed = 1, profils = null, verifier = false, apocalypseThreshold = 5, modeVolRepos = "main" } = {}) {
  const resultats = [];
  for (let i = 0; i < parties; i++) {
    resultats.push(jouerPartie({ nbJoueurs, profils, seed: seed + i, verifier, apocalypseThreshold, modeVolRepos }));
  }
  return { parties, nbJoueurs, seed, resultats, stats: agreger(resultats), anomalies: agregerAnomalies(resultats) };
}

/** Regroupe les anomalies de toute une campagne, par type puis par cause. */
export function agregerAnomalies(resultats) {
  const parType = {};
  for (const r of resultats) {
    for (const a of r.anomalies || []) {
      if (!parType[a.type]) parType[a.type] = { total: 0, partiesTouchees: new Set(), exemples: [], details: {} };
      const e = parType[a.type];
      e.total++;
      e.partiesTouchees.add(r.seed);
      // Regrouper par ÉTAPE et non seulement par règle : savoir qu'il y a
      // des superpositions ne sert à rien, savoir que c'est Tout Casser qui
      // les produit permet d'aller lire le bon résolveur.
      const cle = a.etape ? `${a.etape} → ${a.regle}` : (a.regle || a.cardId || a.raison || "—");
      e.details[cle] = (e.details[cle] || 0) + 1;
      if (e.exemples.length < 3) e.exemples.push({ seed: r.seed, ...a });
    }
  }
  const out = {};
  for (const [type, e] of Object.entries(parType)) {
    out[type] = {
      total: e.total,
      partiesTouchees: e.partiesTouchees.size,
      details: e.details,
      exemples: e.exemples,
    };
  }
  return out;
}

function moyenne(valeurs) {
  if (valeurs.length === 0) return 0;
  return valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
}

/* `Math.min(...tableau)` étale un argument par élément : au-delà de quelques
   dizaines de milliers de parties, la pile d'appel de V8 déborde et la
   campagne meurt sur un `RangeError` APRÈS avoir tourné des heures — le pire
   moment possible pour planter. Un `reduce` n'a pas cette limite.

   Le tableau vide rend `NaN` là où `Math.min()` sans argument rendait
   `Infinity` : aucun des deux n'a de sens, mais `NaN` se repère dans un
   rapport alors qu'`Infinity` s'y lit comme une vraie mesure. */
const borneMin = (valeurs) => (valeurs.length === 0 ? NaN : valeurs.reduce((a, b) => (b < a ? b : a)));
const borneMax = (valeurs) => (valeurs.length === 0 ? NaN : valeurs.reduce((a, b) => (b > a ? b : a)));

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
        scoreMin: borneMin(e.scores),
        scoreMax: borneMax(e.scores),
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

  // Durée réelle des parties et cause d'arrêt. Depuis que les déclencheurs
  // de fin sont appliqués, une partie ne va plus forcément au bout de ses
  // Manches — savoir laquelle des trois conditions coupe le plus souvent,
  // et à quelle Manche, est une information d'équilibrage directe.
  const durees = resultats.map((r) => r.manchesJouees ?? 0);
  const causesFin = {};
  for (const r of resultats) {
    for (const raison of r.raisonsFin || []) {
      // On ne garde que la nature du déclencheur, pas ses chiffres.
      const cle = raison.split(":")[0].trim();
      causesFin[cle] = (causesFin[cle] || 0) + 1;
    }
  }

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
    duree: {
      manchesMoyennes: Number(moyenne(durees).toFixed(2)),
      mancheMin: borneMin(durees),
      mancheMax: borneMax(durees),
      causesFin,
    },
    tension: {
      ecartMoyenPremierDernier: Number(moyenne(ecarts).toFixed(2)),
      ecartMin: borneMin(ecarts),
      ecartMax: borneMax(ecarts),
      scoreGagnantMoyen: Number(moyenne(scoresGagnants).toFixed(2)),
      scoreGagnantMin: borneMin(scoresGagnants),
      scoreGagnantMax: borneMax(scoresGagnants),
    },
  };
}
