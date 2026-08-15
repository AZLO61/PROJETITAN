/* ============================================================
   PROJET TITAN — Choix du coup par l'IA
   ============================================================
   Ce module remplace les heuristiques à priorité fixe qui pilotaient les
   Titans robots. L'ancienne version triait les cartes dans un ordre codé
   en dur (Tout Casser d'abord, puis Tête en Avant, etc.), visait la case
   contenant le plus de blocs juste devant elle, et ne dépensait jamais
   d'Adrénaline. Elle ne jouait pas à Projet Titan, elle exécutait une
   routine de ramassage.

   La méthode est maintenant uniforme et tient en trois temps :
     1. ÉNUMÉRER tous les coups légaux (chaque carte, chaque direction,
        chaque destination, chaque mise d'Adrénaline) ;
     2. SIMULER chacun sur une copie de la partie, en appelant les VRAIS
        résolveurs du moteur — l'IA ne dispose d'aucun modèle approximatif
        des règles, elle joue le coup pour de faux et regarde le résultat ;
     3. NOTER l'état obtenu avec `evaluatePosition`, puis laisser
        `chooseAmongBest` appliquer la molette de bruit du profil.

   Conséquence directe : quand une règle change dans le moteur, l'IA en
   tient compte immédiatement, sans qu'une seule ligne d'heuristique soit
   à mettre à jour. C'est le même principe que pour le barème.

   ------------------------------------------------------------
   POINT D'ATTENTION — LA DÉPENSE D'ADRÉNALINE

   Les résolveurs du domaine LISENT la mise d'Adrénaline (pour allonger la
   portée) mais ne la DÉDUISENT pas : la déduction est faite côté
   application, dans le contrôleur. La simulation doit donc la retrancher
   elle-même, sans quoi l'IA croirait l'Adrénaline gratuite et la
   dépenserait sans compter, alors qu'elle vaut 3 points au décompte final.
   C'est fait dans `simulerCarte`. On respecte ici le découpage existant
   entre domaine et application plutôt que de le déplacer.

   ------------------------------------------------------------
   LIMITES ASSUMÉES

   · Horizon d'un seul coup. L'IA ne déroule pas la suite de la Manche.
     Aller plus loin supposerait de deviner la programmation adverse, qui
     est secrète : le gain serait faible et le coût élevé.
   · Les décisions DIL et RAGE déclenchées par un coup ne sont pas
     simulées, elles se résolvent dans une file séparée après coup. L'IA
     sous-estime donc légèrement les cartes qui en génèrent.
   · Les cartes Événements sont hors sujet ici : elles n'ont aujourd'hui
     aucun effet mécanique dans le moteur, décision de Nikola de les
     traiter en extension plus tard.
============================================================ */

import {
  PORTEE_BOING_BOING,
  chebyshevDistance,
  getJeNePartagePasPool,
  getMovementReachable,
  getRecuperationPool,
  isLanterneRouge,
  isSocleMarker,
  resolveBoingBoing,
  resolveFreeMovement,
  resolveGraouhhh,
  resolveJeNePartagePas,
  resolveRecuperation,
  resolveTeteEnAvant,
  resolveToutCasser,
  rowFromIndex,
  rowIndex,
} from "./gameRules.js";
import { FORCES, chooseAmongBest, evaluatePosition, makeProfile } from "./aiEvaluation.js";
import { shuffled } from "./rng.js";

const DIRS = Object.freeze([
  { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
  { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 },
]);

// Plafond des mises d'Adrénaline explorées. Le livret n'en fixe aucun,
// mais chaque point supplémentaire multiplie le nombre de coups à
// simuler, et au-delà de 2 le gain de portée ne compense presque jamais
// les 3 points de score que vaut une Adrénaline conservée.
const MISE_ADRENALINE_MAX = 2;

function cloneEtat(gameState) {
  return {
    board: structuredClone(gameState.board ?? {}),
    looseBlocks: structuredClone(gameState.looseBlocks ?? {}),
    titans: structuredClone(gameState.titans ?? []),
  };
}

// Un coup peut échouer sur un état de bord inattendu. Plutôt que de faire
// tomber le tour de l'IA, on écarte simplement le candidat fautif : il en
// reste toujours d'autres, et le pire cas est un coup légèrement moins bon.
function noterApres(titanId, etat, profile, muter) {
  try {
    muter(etat);
  } catch {
    return null;
  }
  return evaluatePosition(titanId, etat, profile);
}

function misesPossibles(titan) {
  const dispo = Math.min(titan?.adrenaline || 0, MISE_ADRENALINE_MAX);
  return Array.from({ length: dispo + 1 }, (_, i) => i);
}

// Combinaisons de `taille` éléments, sans répétition et sans ordre : les
// cases de Je Ne Partage Pas sont sélectionnées en bloc, les permuter ne
// change rien.
function combinaisons(liste, taille) {
  if (taille <= 0) return [[]];
  if (liste.length < taille) return [liste.slice()];
  const out = [];
  const marche = (depuis, courant) => {
    if (courant.length === taille) {
      out.push(courant.slice());
      return;
    }
    for (let i = depuis; i < liste.length; i++) {
      courant.push(liste[i]);
      marche(i + 1, courant);
      courant.pop();
    }
  };
  marche(0, []);
  return out;
}

/* ── MOUVEMENT GRATUIT ────────────────────────────────────── */

/**
 * Choisit la case d'arrivée du mouvement gratuit (2 cases).
 * Retourne `{ destKey, note }` ou `null` si le Titan est bloqué.
 *
 * L'ancienne version notait une case `blocsLibres * 2 + hauteurBâtiment`,
 * ce qui ignorait la couleur des blocs et donc le barème. Un Titan avec
 * huit Bleu allait chercher un neuvième Bleu à 0 point plutôt qu'un
 * Rouge à 3.
 */
export function planMovement(titanId, gameState, profile = makeProfile()) {
  const titan = gameState.titans.find((t) => t.id === titanId);
  if (!titan) return null;

  const titansByCell = Object.fromEntries(gameState.titans.map((t) => [t.cell, t.id]));
  const { reachable } = getMovementReachable(
    titan.cell, 2, gameState.board, titansByCell, gameState.looseBlocks
  );
  if (!reachable || reachable.size === 0) return null;

  const candidats = [];
  reachable.forEach((destKey) => {
    const etat = cloneEtat(gameState);
    const note = noterApres(titanId, etat, profile, (e) => resolveFreeMovement(titanId, destKey, e));
    if (note !== null) candidats.push({ destKey, note });
  });

  return chooseAmongBest(candidats, profile);
}

/* ── CARTE ACTION ─────────────────────────────────────────── */

// Applique un coup sur un état, résolveur réel à l'appui, et retranche la
// mise d'Adrénaline (cf. « point d'attention » en en-tête).
function simulerCarte(coup, titanId, etat, mancheNumber) {
  const { cardId, dir, bbDest, jnpCells, mise = 0 } = coup;
  const moi = etat.titans.find((t) => t.id === titanId);

  switch (cardId) {
    case "tout_casser":
      resolveToutCasser(titanId, etat, mise);
      break;
    case "tete_en_avant":
      resolveTeteEnAvant(titanId, dir.dr, dir.dc, mise, etat);
      break;
    case "graouhhh":
      resolveGraouhhh(titanId, dir.dr, dir.dc, mancheNumber, etat);
      break;
    case "boing_boing":
      resolveBoingBoing(titanId, bbDest, mise, mancheNumber, etat);
      break;
    case "je_ne_partage_pas":
      resolveJeNePartagePas(titanId, jnpCells, etat);
      break;
    case "faut_pas_me_chauffer":
      // Aucun effet direct : la carte produit des comparaisons de force
      // qui partent en file de décisions DIL/RAGE, hors simulation.
      break;
    default:
      break;
  }

  if (mise > 0 && moi) moi.adrenaline = Math.max(0, (moi.adrenaline || 0) - mise);
}

/** Tous les coups légaux offerts par une carte, paramètres compris. */
export function candidatsPourCarte(cardId, titanId, gameState) {
  const titan = gameState.titans.find((t) => t.id === titanId);
  if (!titan) return [];
  const mises = misesPossibles(titan);

  if (cardId === "tout_casser") {
    return mises.map((mise) => ({ cardId, mise }));
  }

  if (cardId === "tete_en_avant") {
    return DIRS.flatMap((dir) => mises.map((mise) => ({ cardId, dir, mise })));
  }

  if (cardId === "graouhhh") {
    // Aucune Adrénaline dépensable sur cette action (livret V36).
    return DIRS.map((dir) => ({ cardId, dir, mise: 0 }));
  }

  if (cardId === "boing_boing") {
    const r0 = rowIndex(titan.cell[0]);
    const c0 = Number(titan.cell.slice(1));
    const occupees = new Set(gameState.titans.map((t) => t.cell));
    const out = [];
    for (const mise of mises) {
      const portee = PORTEE_BOING_BOING + mise;
      for (let r = 0; r <= 8; r++) {
        for (let c = 1; c <= 9; c++) {
          const d = chebyshevDistance(r0, c0, r, c);
          if (d < 1 || d > portee) continue;
          const key = rowFromIndex(r) + c;
          if (occupees.has(key)) continue;
          out.push({ cardId, bbDest: key, mise });
        }
      }
    }
    return out;
  }

  if (cardId === "je_ne_partage_pas") {
    const pool = getJeNePartagePasPool(titanId, gameState);
    if (pool.length === 0) return [{ cardId, jnpCells: [], mise: 0 }];
    const nb = isLanterneRouge(titanId, gameState) ? 3 : 2;
    return combinaisons(pool, Math.min(nb, pool.length)).map((jnpCells) => ({ cardId, jnpCells, mise: 0 }));
  }

  // Faut Pas Me Chauffer : les cibles sont imposées par le Périmètre, la
  // mise cachée se joue dans la file de décisions, pas ici.
  return [{ cardId, mise: 0 }];
}

/**
 * Choisit quelle carte programmée jouer, et avec quels paramètres.
 * Retourne le coup retenu, ou `null` si le Titan n'a rien à jouer.
 */
export function planCardPlay(titanId, gameState, profile = makeProfile(), mancheNumber = 1) {
  const titan = gameState.titans.find((t) => t.id === titanId);
  if (!titan || !titan.programmed || titan.programmed.length === 0) return null;

  const candidats = [];
  for (const cardId of new Set(titan.programmed)) {
    for (const coup of candidatsPourCarte(cardId, titanId, gameState)) {
      const etat = cloneEtat(gameState);
      const note = noterApres(titanId, etat, profile, (e) => simulerCarte(coup, titanId, e, mancheNumber));
      if (note !== null) candidats.push({ ...coup, note });
    }
  }

  return chooseAmongBest(candidats, profile);
}

/* ── RÉCUPÉRATION ─────────────────────────────────────────── */

/**
 * Choisit la case de Récupération ET le bloc précis à y prendre.
 *
 * L'ancienne IA prenait la première case du pool en priorisant les
 * Socles, et laissait le moteur retomber sur « le dernier empilé » pour
 * le choix du bloc, faute de logique dédiée. Elle pouvait donc ramasser
 * un Orange impair sans valeur en laissant sur place le Rouge qui lui
 * manquait.
 */
export function planRecuperation(titanId, gameState, profile = makeProfile()) {
  const pool = getRecuperationPool(titanId, gameState);
  if (!pool || pool.length === 0) return null;

  const candidats = [];
  for (const cellKey of pool) {
    // Un même empilement contient souvent plusieurs fois la même couleur :
    // inutile de simuler deux fois un choix identique.
    const valeurs = [...new Set(gameState.looseBlocks[cellKey] || [])];
    for (const pickedValue of valeurs) {
      const etat = cloneEtat(gameState);
      const note = noterApres(titanId, etat, profile, (e) =>
        resolveRecuperation(titanId, cellKey, e, pickedValue)
      );
      if (note !== null) candidats.push({ cellKey, pickedValue, estSocle: isSocleMarker(pickedValue), note });
    }
  }

  return chooseAmongBest(candidats, profile);
}

/* ── PROGRAMMATION ────────────────────────────────────────── */

/**
 * Choisit les 3 cartes à programmer pour la Manche.
 *
 * C'est la troisième molette du profil. La programmation se décide avant
 * de savoir ce que feront les autres, donc aucune simulation fine n'a de
 * sens ici : on note chaque carte par le meilleur coup qu'elle
 * permettrait DANS L'ÉTAT ACTUEL, ce qui est une approximation honnête de
 * « cette carte me servirait-elle ? ».
 *
 * Le Novice ne fait pas ce calcul du tout et programme au hasard : c'est
 * exactement l'erreur du débutant, qui subit sa programmation au lieu de
 * la préparer.
 */
export function planProgrammation(titanId, gameState, profile = makeProfile(), mancheNumber = 1, nbCartes = 3) {
  const titan = gameState.titans.find((t) => t.id === titanId);
  if (!titan || !titan.hand || titan.hand.length === 0) return [];

  const main = [...titan.hand];
  if (main.length <= nbCartes) return main;

  if (profile?.force === FORCES.NOVICE) {
    return shuffled(main).slice(0, nbCartes);
  }

  const notees = main.map((cardId) => {
    let meilleure = -Infinity;
    for (const coup of candidatsPourCarte(cardId, titanId, gameState)) {
      const etat = cloneEtat(gameState);
      const note = noterApres(titanId, etat, profile, (e) => simulerCarte(coup, titanId, e, mancheNumber));
      if (note !== null && note > meilleure) meilleure = note;
    }
    return { cardId, note: meilleure };
  });

  return notees
    .sort((a, b) => b.note - a.note)
    .slice(0, nbCartes)
    .map((c) => c.cardId);
}
