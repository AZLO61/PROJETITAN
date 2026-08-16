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
  appliquerReplElement,
  getBoingBoingReach,
  estSurLePlateau,
  indexerTitans,
  getEcroulementCells,
  resolveEcroulementAmas,
  getFPMCTargets,
  getJeNePartagePasPool,
  getMovementReachable,
  getRecuperationPool,
  isLanterneRouge,
  isSocleMarker,
  scoreBareme,
  resolveBoingBoing,
  resolveFautPasMeChauffer,
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

/* ── DIAGNOSTIC ───────────────────────────────────────────────
   Le garde-fou ci-dessous avale les exceptions par conception : un
   candidat fautif ne doit pas faire tomber le tour de l'IA. Mais avaler
   en silence est dangereux — c'est exactement ce qui a masqué, pendant
   une session entière, le fait que Faut Pas Me Chauffer n'était JAMAIS
   évaluable faute d'un champ manquant. L'IA se contentait de défausser,
   sans que rien ne le signale.

   Ces compteurs rendent le silence audible. Ils ne coûtent qu'une
   incrémentation et permettent au simulateur de dire « 0 candidat
   écarté » — ou de pointer précisément ce qui casse.
──────────────────────────────────────────────────────────── */

export const diagnostics = {
  candidatsEcartes: 0,
  coupsSansCandidat: 0,
  erreurs: {}, // { "message d'erreur": nombre d'occurrences }
};

export function reinitialiserDiagnostics() {
  diagnostics.candidatsEcartes = 0;
  diagnostics.coupsSansCandidat = 0;
  diagnostics.erreurs = {};
}

function noterApres(titanId, etat, profile, muter) {
  try {
    muter(etat);
  } catch (e) {
    diagnostics.candidatsEcartes++;
    const cle = String(e?.message || e);
    diagnostics.erreurs[cle] = (diagnostics.erreurs[cle] || 0) + 1;
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
export function planMovement(titanId, gameState, profile = makeProfile(), portee = 2) {
  const titan = gameState.titans.find((t) => t.id === titanId);
  if (!titan || !estSurLePlateau(titan) || portee <= 0) return null;

  // Un Titan hors plateau n'occupe aucune case : il ne doit pas bloquer le
  // déplacement des autres (cf. indexerTitans).
  const titansByCell = indexerTitans(gameState.titans);
  const { reachable } = getMovementReachable(
    titan.cell, portee, gameState.board, titansByCell, gameState.looseBlocks
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
export function appliquerCoup(coup, titanId, etat, mancheNumber, profile = makeProfile()) {
  /* Application RÉELLE d'un coup (simulateur et campagnes), par opposition
     aux simulations de recherche menées dans `planCardPlay`.

     La différence tient au collecteur de replis. Pendant la recherche, on
     évalue des centaines de coups : y imbriquer une optimisation du repli
     ferait exploser le coût pour un gain marginal, et l'IA note donc le
     résultat par défaut. Au moment de jouer pour de vrai, en revanche, le
     repli est un choix à part entière — l'IA le tranche avec la même
     méthode que tout le reste, en simulant chaque case et en lisant le vrai
     barème (cf. choisirRepliIA). Sans ça, une IA en campagne laisserait
     tomber ses débris n'importe où, et le simulateur mesurerait une force
     qui n'est pas celle qu'un joueur affronte. */
  const replis = [];
  const res = simulerCarte(coup, titanId, { ...etat, replis }, mancheNumber);
  for (const repli of replis) {
    if (repli.cases.length <= 1) continue;
    const choix = choisirRepliIA(repli, etat, profile);
    if (choix) appliquerRepli(repli, choix, etat);
  }
  return res;
}

/**
 * Répartition des débris d'un Amas écroulé, pour un joueur sans interface
 * (IA et simulateur). Suit les mêmes contraintes que le joueur humain :
 * cases vierges d'abord, empilement seulement quand il n'en reste plus.
 *
 * Aucune ruse ici : viser un Titan pour le pousser serait souvent le bon
 * coup, mais ce choix se fait après la simulation du saut, donc en dehors
 * de la boucle de notation. Le rendre malin demanderait de simuler chaque
 * répartition possible, pour un gain marginal au regard du coût.
 */
export function choisirRepartitionEcroulement(ecroulement, etat) {
  const choix = [];
  for (let i = 0; i < ecroulement.blocs.length; i++) {
    const { eligibles } = getEcroulementCells(ecroulement.cellKey, etat, choix);
    choix.push(eligibles[0] ?? ecroulement.cellKey);
  }
  return choix;
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
      // Atterrissage sur un Amas : le résolveur rend la main pour que le
      // joueur réparte les débris. L'IA n'a pas d'interface, elle applique
      // la répartition par défaut — cases vierges d'abord, dans l'ordre.
      if (res?.ecroulement) {
        const choix = choisirRepartitionEcroulement(res.ecroulement, etat);
        const suite = resolveEcroulementAmas(titanId, res.ecroulement, choix, etat);
        res = { ...res, log: [...(res.log || []), ...suite.log] };
      }
      break;
    case "je_ne_partage_pas":
      res = resolveJeNePartagePas(titanId, jnpCells, etat);
      break;
    case "faut_pas_me_chauffer": {
      // Cette branche ne produisait QUE des décisions DIL/RAGE : aucune
      // projection de la cible, aucun point de Bagarre. Une carte Force 3
      // sur six était donc évaluée par l'IA — et jouée en campagne — comme
      // si elle n'avait aucun effet physique, alors que le contrôleur, lui,
      // projetait bien la cible de n+1 cases. Quatrième divergence avec le
      // jeu réel, non documentée en en-tête de simulation.js, et raison
      // pour laquelle 200 parties de diagnostic n'ont jamais emprunté ce
      // chemin de code ni vu les bugs qui s'y trouvaient.
      // Le vrai résolveur du domaine est appelé ici, comme pour les cinq
      // autres cartes. L'IA ne mise pas d'Adrénaline en secret, faute de
      // règle de décision : les deux mises restent à 0.
      const cibles = getFPMCTargets(titanId, etat);
      const decisions = [];
      for (const defId of cibles) {
        const r = resolveFautPasMeChauffer(titanId, defId, cibles.length, etat);
        decisions.push(...(r.decisions || []));
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
    // Bug trouvé au scan : toutes les cases portant un Titan étaient exclues
    // des destinations. Or c'est précisément le cas le plus intéressant de
    // la carte — ruling confirmé : l'occupant subit Fatigue et DIL, et
    // l'initiateur prend sa place (resolveBoingBoing le gère sur 45 lignes).
    // L'interface humaine, elle, proposait bien ces cases. L'IA se privait
    // donc d'un pan entier de la carte, et les campagnes sous-estimaient
    // mécaniquement sa force.
    //
    // L'énumération se faisait en distance de Chebyshev brute, alors que le
    // livret compte les éléments contigus pour 1 seule case. Deux effets, et
    // les deux faussaient les campagnes : l'IA ne VOYAIT pas les cases
    // ouvertes derrière un mur (elle sous-évaluait encore la carte), et elle
    // proposait des cases hors de portée que le résolveur refusait ensuite —
    // autant de coups simulés pour rien. Elle énumère désormais depuis
    // `getBoingBoingReach`, la même fonction que le résolveur et que
    // l'interface : les trois ne peuvent plus diverger.
    const out = [];
    for (const mise of mises) {
      const reach = getBoingBoingReach(titan.cell, PORTEE_BOING_BOING + mise, gameState);
      reach.forEach((_d, key) => {
        if (key === titan.cell) return;
        out.push({ cardId, bbDest: key, mise });
      });
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

  if (candidats.length === 0) diagnostics.coupsSansCandidat++;
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

/* ── REPLI D'UN ÉLÉMENT ARRÊTÉ FAUTE DE PUISSANCE ─────────────
   Ruling Nikola du 2026-08-17 : quand un élément projeté n'a pas la
   puissance de franchir ce qu'il percute, le TITAN INITIATEUR choisit où il
   se pose. C'est donc un vrai coup, et l'IA doit le jouer comme tel.

   Aucune heuristique écrite à la main ici — ce serait rompre le principe
   fondateur du module (cf. l'en-tête de aiEvaluation.js). On simule chaque
   case possible et on lit le VRAI barème via `evaluatePosition`. Tout en
   découle sans qu'une seule règle de placement soit écrite :

   · un débris qu'on peut faire tomber dans son propre Périmètre devient
     ramassable au tour suivant, donc `valeurAPortee` monte, donc l'IA le
     rapproche d'elle ;
   · le même débris lâché dans le Périmètre d'un adversaire lui profite à
     LUI, ce que l'Expert voit puisqu'il évalue en différentiel — il évitera
     spontanément de servir le leader ;
   · un Titan adverse qu'on repousse se retrouve noté à travers ce qu'il
     aura sous la main, donc l'IA le pose là où il n'y a rien.

   La FORCE joue naturellement : `chooseAmongBest` fait choisir le meilleur
   coup à l'Expert et tirer parmi les trois premiers au Novice, exactement
   comme pour un déplacement ou une carte. Un Novice se trompera donc parfois
   de case, de façon plausible.

   `repli` est l'entrée produite par projectInDirection :
   { titanId, defaut, cases, cible, initiatorId }. */
export function choisirRepliIA(repli, gameState, profile = makeProfile()) {
  if (!repli || !repli.cases || repli.cases.length === 0) return null;
  if (repli.cases.length === 1) return repli.cases[0];

  const initiateur = repli.initiatorId;
  const candidats = [];
  for (const cellKey of repli.cases) {
    const etat = cloneEtat(gameState);
    const note = noterApres(initiateur, etat, profile, (e) => appliquerRepli(repli, cellKey, e));
    if (note !== null) candidats.push({ cellKey, note });
  }
  const choix = chooseAmongBest(candidats, profile);
  // Aucun candidat évaluable : on garde la case où l'élément s'est arrêté.
  return choix ? choix.cellKey : repli.defaut;
}

/* Applique un repli sur un état de jeu. Sert à l'IA pour simuler, et reste
   la seule description de « ce que déplacer veut dire » — le contrôleur en
   fait autant sur l'état réel quand c'est un humain qui tranche.

   Deux natures d'élément, d'où `titanId` : un Titan nommément, ou — à null —
   le débris qui vient d'être posé sur la case par défaut. */
export function appliquerRepli(repli, cellKey, etat) {
  // La règle elle-même vit dans le domaine, en un seul exemplaire
  // (cf. appliquerReplElement) : l'IA, le simulateur et le contrôleur
  // appliquent donc rigoureusement le même déplacement, poussée d'un Titan
  // occupant comprise. Cette fonction n'est plus qu'un alias historique.
  if (!etat.looseBlocks) etat.looseBlocks = {};
  return appliquerReplElement(repli, cellKey, etat).log;
}
