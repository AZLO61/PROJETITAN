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
   · Les décisions DIL et RAGE sont désormais simulées en valeur attendue
     (cf. `appliquerDecisions`), mais leur résolution réelle passe par une
     file où un joueur humain peut choisir autrement. L'IA raisonne donc
     sur la résolution la plus probable, pas sur une certitude.
   · Les cartes Événements sont hors sujet ici : elles n'ont aujourd'hui
     aucun effet mécanique dans le moteur, décision de Nikola de les
     traiter en extension plus tard.
============================================================ */

import {
  PORTEE_BOING_BOING,
  chebyshevDistance,
  getFPMCTargets,
  getJeNePartagePasPool,
  getMovementReachable,
  getProgrammedSum,
  getRecuperationPool,
  isLanterneRouge,
  isSocleMarker,
  makeDecisionRequest,
  scoreBareme,
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

/* ── VALEUR ATTENDUE DES DÉCISIONS DIL ET RAGE ────────────── */

// Sans ce bloc, l'IA était structurellement incapable de saboter : les
// cartes qui dépouillent un adversaire (DIL, RAGE) ne produisent pas
// d'effet immédiat, elles empilent des décisions résolues plus tard. La
// simulation les voyait donc comme des coups sans conséquence, et une
// IA Experte n'avait jamais de raison de préférer « faire perdre 6 points
// au leader » à « en gagner 2 ». C'est pourtant tout l'intérêt de ces
// cartes.

const COULEURS_SCORABLES = ["bleu", "rose", "orange", "rouge"];

function compteCouleur(repaire, couleur) {
  return (repaire || []).filter((c) => c === couleur).length;
}

// Ce que gagnerait un Titan en AJOUTANT un bloc de cette couleur.
function gainSiAjoute(repaire, couleur) {
  const n = compteCouleur(repaire, couleur);
  return scoreBareme(couleur, n + 1) - scoreBareme(couleur, n);
}

// Ce que perdrait un Titan en RETIRANT un bloc de cette couleur. Ce n'est
// pas l'inverse du gain : sur l'Orange, perdre le bloc qui complétait une
// paire coûte cher, perdre le bloc impair ne coûte rien.
function perteSiRetire(repaire, couleur) {
  const n = compteCouleur(repaire, couleur);
  if (n === 0) return 0;
  return scoreBareme(couleur, n) - scoreBareme(couleur, n - 1);
}

// Valeur d'une Adrénaline au décompte final (3 points par le livret).
// Sert d'étalon quand un défenseur arbitre entre payer et encaisser.
const VALEUR_ADRENALINE = 3;

/**
 * Applique la résolution la plus probable des décisions générées par un
 * coup. On ne devine pas : chaque camp est supposé jouer son intérêt, ce
 * qui est l'hypothèse la moins arbitraire disponible.
 */
export function appliquerDecisions(decisions, etat) {
  for (const d of decisions || []) {
    const attaquant = etat.titans.find((t) => t.id === d.attackerId);
    const defenseur = etat.titans.find((t) => t.id === d.defenderId);
    if (!attaquant || !defenseur) continue;

    if (d.type === "RAGE") {
      // Livret : l'attaquant choisit librement, et prend UNE ressource.
      // Il vise donc celle qui lui rapporte le plus à lui — ce qui n'est
      // pas forcément celle qui coûte le plus au défenseur, mais c'est
      // bien la règle.
      if (defenseur.repaire.length >= 1) {
        let meilleurIdx = 0;
        let meilleurGain = -Infinity;
        defenseur.repaire.forEach((couleur, idx) => {
          const gain = gainSiAjoute(attaquant.repaire, couleur);
          if (gain > meilleurGain) {
            meilleurGain = gain;
            meilleurIdx = idx;
          }
        });
        const [pris] = defenseur.repaire.splice(meilleurIdx, 1);
        attaquant.repaire.push(pris);
      } else if ((defenseur.adrenaline || 0) >= 1) {
        // FAQ #5 : l'Adrénaline de la cible est elle-même ciblable.
        defenseur.adrenaline -= 1;
        attaquant.adrenaline = (attaquant.adrenaline || 0) + 1;
      }
      continue;
    }

    if (d.type === "DIL") {
      // Livret : l'attaquant désigne 2 couleurs DIFFÉRENTES, la cible
      // choisit laquelle elle perd, ou paie 1 Adrénaline pour annuler.
      // L'attaquant a donc intérêt à proposer la paire dont le MOINS
      // coûteux des deux termes est le plus cher possible : c'est un
      // maximin, la cible prendra toujours l'option la plus douce.
      const presentes = COULEURS_SCORABLES.filter((c) => compteCouleur(defenseur.repaire, c) > 0);
      if (presentes.length < 2) continue; // DIL structurellement impossible

      let couleurPerdue = null;
      let meilleurMinimum = -Infinity;
      for (let i = 0; i < presentes.length; i++) {
        for (let j = i + 1; j < presentes.length; j++) {
          const a = perteSiRetire(defenseur.repaire, presentes[i]);
          const b = perteSiRetire(defenseur.repaire, presentes[j]);
          const choixDeLaCible = a <= b ? presentes[i] : presentes[j];
          const coutSubi = Math.min(a, b);
          if (coutSubi > meilleurMinimum) {
            meilleurMinimum = coutSubi;
            couleurPerdue = choixDeLaCible;
          }
        }
      }
      if (!couleurPerdue) continue;

      // La cible paie plutôt que d'encaisser si la perte dépasse la
      // valeur d'une Adrénaline.
      if (meilleurMinimum > VALEUR_ADRENALINE && (defenseur.adrenaline || 0) >= 1) {
        defenseur.adrenaline -= 1;
        continue;
      }
      const idx = defenseur.repaire.indexOf(couleurPerdue);
      if (idx !== -1) defenseur.repaire.splice(idx, 1);
    }
  }
}

/**
 * Applique un coup sur un état, résolveur réel à l'appui, et retranche la
 * mise d'Adrénaline (cf. « point d'attention » en en-tête).
 *
 * Exporté parce que le simulateur de parties s'en sert pour JOUER, quand
 * l'IA s'en sert pour RÉFLÉCIR. C'est délibéré : la partie simulée et le
 * raisonnement de l'IA passent ainsi par exactement le même code, il ne
 * peut pas y avoir de divergence entre ce que l'IA croit et ce qui arrive.
 */
export function appliquerCoup(coup, titanId, etat, mancheNumber) {
  return simulerCarte(coup, titanId, etat, mancheNumber);
}

function simulerCarte(coup, titanId, etat, mancheNumber) {
  const { cardId, dir, bbDest, jnpCells, mise = 0 } = coup;
  const moi = etat.titans.find((t) => t.id === titanId);
  let res = null;

  switch (cardId) {
    case "tout_casser":
      res = resolveToutCasser(titanId, etat, mise);
      break;
    case "tete_en_avant":
      res = resolveTeteEnAvant(titanId, dir.dr, dir.dc, mise, etat);
      break;
    case "graouhhh":
      res = resolveGraouhhh(titanId, dir.dr, dir.dc, mancheNumber, etat);
      break;
    case "boing_boing":
      res = resolveBoingBoing(titanId, bbDest, mise, mancheNumber, etat);
      break;
    case "je_ne_partage_pas":
      res = resolveJeNePartagePas(titanId, jnpCells, etat);
      break;
    case "faut_pas_me_chauffer": {
      // Aucun effet direct : la carte compare les forces programmées et
      // engendre RAGE (attaquant devant), DIL (égalité) ou rien. On
      // reproduit ici la même comparaison que le contrôleur, sans quoi la
      // carte de sabotage par excellence serait notée comme un coup nul.
      const decisions = [];
      for (const defId of getFPMCTargets(titanId, etat)) {
        const atk = etat.titans.find((t) => t.id === titanId);
        const def = etat.titans.find((t) => t.id === defId);
        if (!atk || !def) continue;
        const somme = getProgrammedSum(atk);
        const sommeDef = getProgrammedSum(def);
        if (somme > sommeDef) decisions.push(makeDecisionRequest("RAGE", titanId, defId, "Faut Pas Me Chauffer"));
        else if (somme === sommeDef) decisions.push(makeDecisionRequest("DIL", titanId, defId, "Faut Pas Me Chauffer"));
      }
      res = { decisions };
      break;
    }
    default:
      break;
  }

  appliquerDecisions(res?.decisions, etat);
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
