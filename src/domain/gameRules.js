
/* ============================================================
   PROJET TITAN — Génération du plateau BIG CITY (brique 1)
   ============================================================
   Terminologie canonique V35 : Titan, Manche, Adrénaline, Piste ADN
   (Bagarre/Destruction), Socle, Repaire, Barème, Bloc Vert/Téléporteur,
   BIG CITY, Seuil 4.

   Règles implémentées :
   - Grille 9×9, cases bâtiment = lignes A·C·E·G·I × colonnes 1·3·5·7·9 (25 cases)
   - Stock réel : Bleu 19 · Rose 12 · Orange 11 · Rouge 7 (= 49 blocs standards)
   - Modèle "sac" : pioche sans remise dans le stock réel
   - 5 cases Vert/Téléporteur : E5 fixe + 1 par quadrant (NO/NE/SO/SE)
     [ASSOMPTION à valider avec Nikola — la V1 mentionne "permutation
     bijective des 4 autres" sans préciser la méthode exacte]
   - Vert = obligatoirement à la BASE d'un bâtiment ≥3 étages (Vert inclus)
   - Hauteur des bâtiments standards : aléatoire 0-4, tirée cellule par
     cellule, jusqu'à épuisement du sac
   - [ASSOMPTION à valider — les 5 bâtiments Vert sont remplis EN PREMIER
     dans le sac, pour garantir leur contrainte ≥3 avant que le stock
     standard ne s'épuise sur les bâtiments normaux]
   - Socle = hauteur à la construction, valeur FIXE ensuite
============================================================ */

import { pick, randomInt, shuffled } from "./rng.js";

const STOCK_INITIAL = { bleu: 19, rose: 12, orange: 11, rouge: 7 };
const COULEURS = ["bleu", "rose", "orange", "rouge"];
const COLOR_HEX = {
  bleu: "#2D8DF5",
  rose: "#EC4899",
  orange: "#FB923C",
  rouge: "#EF4444",
  vert: "#22C55E",
};

// Palier canonique du livret : à 4 ou plus, l'effet fort de l'action
// s'active (RAGE, Patatras, Écroulement, et désormais la casse par
// ricochet). Nommé ici pour éviter d'éparpiller le littéral 4.
const SEUIL_4 = 4;

const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
const BUILDING_ROWS = ["A", "C", "E", "G", "I"];
const BUILDING_COLS = [1, 3, 5, 7, 9];

// Un Socle libéré (FAQ #9, tranchée) se ramasse "au même titre qu'un Bloc
// de béton" — au lieu d'un champ isolé jamais consulté par les mécaniques
// de ramassage existantes, on le représente comme une entrée spéciale dans
// looseBlocks (même tableau que les blocs colorés), reconnaissable par ce
// marqueur. Tous les points de ramassage existants (Tête en Avant, Boing
// Boing, Je Ne Partage Pas, chaînes de réaction) le manipulent alors
// gratuitement comme n'importe quel élément libre.
function socleMarker(value) {
  return `socle:${value}`;
}
function isSocleMarker(entry) {
  return typeof entry === "string" && entry.startsWith("socle:");
}
function socleValue(entry) {
  return Number(entry.split(":")[1]);
}

function isBuildingCell(row, col) {
  return BUILDING_ROWS.includes(row) && BUILDING_COLS.includes(col);
}

/* ============================================================
   TITAN HORS DU PLATEAU — l'attente au bord du ring
   ============================================================
   Ruling de Nikola du 2026-08-16. Un Titan poussé hors de BIG CITY ne
   réapparaît PAS immédiatement : il attend au bord et ne revient en jeu
   qu'au moment de SON tour. La raison est une raison de game design, pas
   une raison technique — « ça évite l'acharnement » : sans ce délai, un
   Titan éjecté pourrait être repoussé trois fois de suite dans le même
   round sans jamais avoir la main.

   Représentation : `t.horsPlateau = true`, et `t.cell` conserve la case par
   laquelle il RENTRERA. Garder `cell` renseignée plutôt que de la vider
   évite de faire exploser les dizaines d'endroits qui lisent `t.cell[0]`,
   et donne gratuitement la case d'attente à afficher.

   Conséquence à respecter PARTOUT : un Titan hors plateau n'occupe aucune
   case. Il ne compte pas dans l'énergie, ne bloque pas un déplacement, ne
   peut pas être ciblé, et ne déclenche aucune superposition. D'où les deux
   helpers ci-dessous, qui doivent être utilisés par tout code cherchant
   « qui est sur cette case ». */
function estSurLePlateau(titan) {
  return !!titan && !titan.horsPlateau;
}

/** Index case → id, limité aux Titans réellement présents sur le plateau. */
function indexerTitans(titans) {
  const parCase = {};
  (titans || []).forEach((t) => {
    if (estSurLePlateau(t)) parCase[t.cell] = t.id;
  });
  return parCase;
}

/**
 * Fait rentrer en jeu un Titan qui attendait hors de BIG CITY. À appeler au
 * DÉBUT de son tour, jamais avant : c'est tout l'objet de la règle.
 *
 * Rulings de Nikola du 2026-08-16 :
 *
 * · IL RENTRE TOUJOURS. Même si sa case de retour et tout son voisinage
 *   sont pris, on cherche la case libre la plus proche du bord. Rester
 *   dehors un tour de plus « serait trop punitif ».
 *
 * · LA RENTRÉE SE PAIE SUR SON PASSIF de Mouvement gratuit, qu'elle force
 *   à utiliser mais avec une valeur réduite. Entrer coûte 1 déplacement,
 *   et chaque case supplémentaire pour contourner un obstacle en coûte
 *   autant. Un Titan qui rentre dans une zone encombrée peut donc devoir
 *   dépenser une Adrénaline pour retrouver de la marge.
 *
 * Retourne `{ rentre, cellule, cout, log }` — `cout` étant le nombre de
 * déplacements consommés, à retrancher du Mouvement gratuit du tour.
 */
function rentrerEnJeu(titanId, gameState) {
  const { board, titans } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  if (!titan || !titan.horsPlateau) {
    return { rentre: false, cellule: titan?.cell ?? null, cout: 0, log: [] };
  }

  const libre = (cle) => {
    const b = board[cle];
    if (b && b.blocks && b.blocks.length > 0) return false;
    return !titans.some((t) => t.id !== titanId && estSurLePlateau(t) && t.cell === cle);
  };

  const voulue = titan.cell;
  const r0 = rowIndex(voulue[0]);
  const c0 = Number(voulue.slice(1));
  let cible = libre(voulue) ? voulue : null;

  if (!cible) {
    /* Il longe SON REBORD, il ne s'enfonce pas dans le plateau. Précision de
       Nikola du 2026-08-16 : « il rentre plus loin sur le rebord, mais ça ne
       coûte pas d'Adrénaline de faire ça ». Le contournement est donc
       gratuit — seule l'entrée elle-même se paie, toujours 1 déplacement.

       Rentrer par une colonne (1 ou 9) fait remonter ou descendre la
       colonne ; rentrer par une ligne (A ou I) fait longer la ligne. On
       prend la case libre la plus proche de la case de sortie idéale.

       CAS DU COIN, ajouté le 2026-08-18 avec la règle du miroir : une sortie
       en diagonale renvoie le Titan sur un coin (A1, A9, I1, I9), et un coin
       appartient à DEUX rebords. Ne longer que la colonne y était un choix
       arbitraire, qui pouvait l'envoyer loin alors qu'une case libre
       attendait juste à côté sur la ligne. Il longe donc les deux, et prend
       la plus proche des deux — c'est le « il devrait être pas loin » de
       Nikola. */
    const surColonne = c0 === 1 || c0 === 9;
    const surLigne = r0 === 0 || r0 === 8;
    const candidats = [];
    if (surColonne) {
      for (let i = 0; i <= 8; i++) {
        const cle = rowFromIndex(i) + c0;
        if (cle !== voulue && libre(cle)) candidats.push({ cle, ecart: Math.abs(i - r0) });
      }
    }
    if (surLigne || !surColonne) {
      for (let i = 1; i <= 9; i++) {
        const cle = rowFromIndex(r0) + i;
        if (cle !== voulue && libre(cle)) candidats.push({ cle, ecart: Math.abs(i - c0) });
      }
    }
    candidats.sort((a, b) => a.ecart - b.ecart);
    if (candidats.length > 0) cible = candidats[0].cle;
  }

  if (!cible) {
    // Rebord entièrement bouché : on élargit à la case libre la plus proche,
    // pour tenir la promesse « il rentre dans tous les cas ».
    let meilleure = null;
    for (let r = 0; r <= 8; r++) {
      for (let c = 1; c <= 9; c++) {
        const cle = rowFromIndex(r) + c;
        if (!libre(cle)) continue;
        const d = Math.max(Math.abs(r - r0), Math.abs(c - c0));
        if (!meilleure || d < meilleure.d) meilleure = { cle, d };
      }
    }
    cible = meilleure?.cle ?? null;
  }

  if (!cible) {
    // Plateau intégralement saturé : matériellement impossible à 4 Titans
    // sur 81 cases, mais on ne laisse pas la fonction mentir sur son contrat.
    return {
      rentre: false,
      cellule: voulue,
      cout: 0,
      log: [`Titan ${titanId} ne trouve aucune case libre pour rentrer.`],
    };
  }

  titan.horsPlateau = false;
  titan.cell = cible;
  // Toujours 1 : entrer coûte un déplacement, le décalage le long du rebord
  // est gratuit.
  const cout = 1;
  const log = [`🥊 Titan ${titanId} revient sur BIG CITY par ${cible} (1 déplacement de son passif).`];
  if (cible !== voulue) {
    log.push(`${voulue} était occupée — il longe le rebord jusqu'à ${cible}, sans coût supplémentaire.`);
  }
  return { rentre: true, cellule: cible, cout, log };
}

/* Une pile de blocs libres vidée laissait derrière elle un tableau vide au
   lieu d'être supprimée : 3 414 scories relevées sur une campagne de 200
   parties. Sans conséquence tant que TOUS les parcours testent `length > 0`
   — mais il y a une vingtaine de sites de lecture, et le premier qui
   oubliera ce test verra des cases « avec des blocs » qui n'en ont plus.
   Appelée après chaque retrait, cette fonction ferme le sujet à la source
   plutôt que d'ajouter un vingt-et-unième test défensif. */
function retirerPileVide(looseBlocks, key) {
  if (looseBlocks[key] && looseBlocks[key].length === 0) delete looseBlocks[key];
}

/* ============================================================
   DÉCLENCHEURS DE FIN DE PARTIE (brique ajoutée cette session)
   ============================================================
   Livret, section "Fin de Partie" : la partie s'arrête à la fin de la
   Manche en cours (jamais en plein tour) si l'une de ces conditions est
   remplie SUR LE PLATEAU, en plus du nombre max de Manches atteint :
   - 🏙️ Apocalypse Urbaine : il ne reste qu'un nombre X de bâtiments
     encore debout. ⚠️ X n'est pas chiffré dans le livret — le seuil est
     désormais fixé sur l'écran de CONFIGURATION avant le lancement de la
     partie et VERROUILLÉ ensuite (confirmé Nikola, session) : plus de
     champ éditable en cours de jeu, pour éliminer le levier de triche
     qu'offrait un seuil modifiable à tout moment.
   - 📦 Pénurie : une couleur de bloc standard a entièrement disparu DU
     PLATEAU (bâtiments + blocs libres) — les exemplaires restés dans le
     sac (jamais posés) ne comptent pas, ils sont hors-jeu depuis la mise
     en place.
   - 🌀 Vide Spatial : il ne reste plus qu'1 seul Téléporteur ACTIF (son
     bloc Vert, posé à la BASE de la pile, pas encore collecté — un
     bâtiment Téléporteur totalement détruit = Téléporteur consommé).
============================================================ */
function countStandingBuildings(board) {
  return Object.values(board).filter((b) => b.blocks.length > 0).length;
}

function countColorOnBoard(color, board, looseBlocks) {
  let total = 0;
  Object.values(board).forEach((b) => {
    b.blocks.forEach((c) => {
      if (c === color) total++;
    });
  });
  Object.values(looseBlocks).forEach((stack) => {
    stack.forEach((c) => {
      if (c === color) total++;
    });
  });
  return total;
}

function countActiveTeleporters(board) {
  return Object.values(board).filter((b) => b.isTeleporter && b.blocks.length > 0).length;
}

// Durée d'une partie (livret) : 6 Manches à 3 Titans, 4 Manches à 4 Titans.
// Cette limite n'était appliquée nulle part — elle n'était qu'affichée dans
// le bandeau d'état, et la partie continuait indéfiniment.
const MANCHES_PAR_NB_JOUEURS = { 3: 6, 4: 4 };

function manchesMax(nbJoueurs) {
  return MANCHES_PAR_NB_JOUEURS[nbJoueurs] ?? 6;
}

function checkEndGameTriggers(board, looseBlocks, apocalypseThreshold, mancheNumber, nbJoueurs) {
  const reasons = [];
  if (mancheNumber != null && nbJoueurs != null && mancheNumber >= manchesMax(nbJoueurs)) {
    reasons.push(`🏁 Dernière Manche : ${mancheNumber} sur ${manchesMax(nbJoueurs)} à ${nbJoueurs} Titans.`);
  }
  const standing = countStandingBuildings(board);
  if (standing <= apocalypseThreshold) {
    reasons.push(`🏙️ Apocalypse Urbaine : ${standing} bâtiment(s) encore debout (seuil ${apocalypseThreshold}).`);
  }
  COULEURS.forEach((color) => {
    if (countColorOnBoard(color, board, looseBlocks) === 0) {
      reasons.push(`📦 Pénurie : plus aucun bloc ${color} disponible sur le plateau.`);
    }
  });
  const activeTeleporters = countActiveTeleporters(board);
  if (activeTeleporters <= 1) {
    reasons.push(`🌀 Vide Spatial : ${activeTeleporters} Téléporteur(s) encore actif(s).`);
  }
  return reasons;
}

// Le mélange délègue au générateur semé : toute la part de hasard du
// moteur doit passer par `rng.js`, sinon une graine ne suffit plus à
// rejouer une partie à l'identique (cf. en-tête de rng.js).
function shuffle(arr) {
  return shuffled(arr);
}

// Construit le sac de 49 blocs standards, pioche sans remise
function buildBag() {
  const bag = [];
  for (const c of COULEURS) {
    for (let i = 0; i < STOCK_INITIAL[c]; i++) bag.push(c);
  }
  return shuffle(bag);
}

// Découpe les 25 cases bâtiment en 4 quadrants autour du centre E5
function getQuadrant(row, col) {
  const r = BUILDING_ROWS.indexOf(row); // 0..4
  const c = BUILDING_COLS.indexOf(col); // 0..4
  if (r === 2 && c === 2) return "centre";
  const vert = r < 2 ? "N" : "S";
  const horiz = c < 2 ? "O" : "E";
  return vert + horiz; // NO, NE, SO, SE
}

function generateBoard() {
  const allBuildingCells = [];
  for (const r of BUILDING_ROWS)
    for (const c of BUILDING_COLS) allBuildingCells.push({ row: r, col: c });

  // 1. Placement Vert : E5 fixe + 1 par quadrant
  // Bug remonté : 2 Téléporteurs pouvaient tomber sur la même ligne ou la
  // même colonne (les 4 tirages par quadrant étaient indépendants). Le
  // livret impose 1 seul Téléporteur par ligne/colonne. Construction
  // directe (pas de tirage-rejet) : on impose des lignes opposées entre
  // NO/NE, des lignes opposées entre SO/SE, des colonnes opposées entre
  // NO/SO, et des colonnes opposées entre NE/SE — le centre E5 ne peut
  // jamais entrer en conflit puisque les quadrants excluent ligne E et
  // colonne 5 par construction (voir getQuadrant).
  const center = { row: "E", col: 5 };
  const [rowTop1, rowTop2] = shuffle(["A", "C"]);       // NO / NE
  const [rowBot1, rowBot2] = shuffle(["G", "I"]);       // SO / SE
  const [colLeft1, colLeft2] = shuffle([1, 3]);         // NO / SO
  const [colRight1, colRight2] = shuffle([7, 9]);       // NE / SE
  const vertCells = [
    center,
    { row: rowTop1, col: colLeft1 },  // NO
    { row: rowTop2, col: colRight1 }, // NE
    { row: rowBot1, col: colLeft2 },  // SO
    { row: rowBot2, col: colRight2 }, // SE
  ];
  const vertKeys = new Set(vertCells.map((c) => c.row + c.col));

  // 2. Sac partagé, pioche sans remise
  const bag = buildBag();
  const draw = () => (bag.length > 0 ? bag.pop() : null);

  const board = {};

  // 3. Bâtiments Vert en premier (garantit la contrainte ≥3 étages)
  for (const cell of vertCells) {
    const key = cell.row + cell.col;
    const targetHeight = 3 + randomInt(2); // 3 ou 4
    const blocks = ["vert"];
    for (let i = 1; i < targetHeight; i++) {
      const b = draw();
      if (b) blocks.push(b);
      else break; // sac épuisé — bâtiment tronqué, cas limite à surveiller
    }
    board[key] = {
      row: cell.row,
      col: cell.col,
      blocks,
      socle: blocks.length,
      isTeleporter: true,
    };
  }

  // 4. Bâtiments standards : hauteur aléatoire 0-4, ordre de cellules mélangé
  const standardCells = shuffle(
    allBuildingCells.filter((c) => !vertKeys.has(c.row + c.col))
  );
  for (const cell of standardCells) {
    const key = cell.row + cell.col;
    const targetHeight = randomInt(5); // 0 à 4
    const blocks = [];
    for (let i = 0; i < targetHeight; i++) {
      const b = draw();
      if (b) blocks.push(b);
      else break;
    }
    board[key] = {
      row: cell.row,
      col: cell.col,
      blocks,
      socle: blocks.length,
      isTeleporter: false,
    };
  }

  return { board, bagRemaining: bag.length };
}

/* ============================================================
   Placement initial des Titans (brique 2)
   ============================================================
   - 4 coins du plateau, chaque coin a 2 cases adjacentes possibles
   - [ASSOMPTION à valider] 1 Titan par coin max en génération auto
     (le partage volontaire de coin est une décision de joueur, pas
     pertinente pour un tirage aléatoire de mise en place)
   - Coins peuvent rester vides si nbJoueurs < 4
   - Détonateur Manche 1 : aléatoire parmi les joueurs placés
   - Rotation horaire automatique ensuite (nextDetonateur)
============================================================ */

// Couleurs canoniques par coin — assignées par ID après le tirage
// (le coin détermine la position de départ, PAS la couleur du Titan)
const CORNERS = {
  A1: { adjacents: ["A2", "B1"] },
  A9: { adjacents: ["A8", "B9"] },
  I1: { adjacents: ["H1", "I2"] },
  I9: { adjacents: ["H9", "I8"] },
};

// Couleurs FIXES par ID Titan (indépendant du coin tiré) :
// 1=Pingouin/Bleu · 2=Ornithorynque/Orange · 3=Escargot/Vert · 4=Lama/Rose
const TITAN_GRADIENT = {
  1: "linear-gradient(135deg,#2D8DF5,#1a6fd4,#71dbff)",
  2: "linear-gradient(135deg,#FB923C,#e97320,#fbbf24)",
  3: "linear-gradient(135deg,#22C55E,#06d46d,#63f1b1)",
  4: "linear-gradient(135deg,#EC4899,#c9207a,#f472b6)",
};

const ACTION_CARDS = [
  { id: "tout_casser", label: "Tout Casser" },
  { id: "tete_en_avant", label: "Tête en Avant" },
  { id: "graouhhh", label: "Graouhhh" },
  { id: "boing_boing", label: "Boing Boing" },
  { id: "faut_pas_me_chauffer", label: "Faut Pas Me Chauffer" },
  { id: "je_ne_partage_pas", label: "Je Ne Partage Pas" },
];
const CARD_LABEL = Object.fromEntries(ACTION_CARDS.map((c) => [c.id, c.label]));

/* ============================================================
   SÉQUENCE DE MANCHE — 5 PHASES (brique ajoutée cette session)
   ============================================================
   Ruling confirmé Nikola : pour CHAQUE Phase, CHAQUE Titan doit cliquer
   son propre bouton "Valider ma Phase". La Phase suivante ne démarre
   QUE quand tous les Titans de l'ordre de jeu ont validé — pas d'auto-
   avance sur simple condition remplie, pas de bouton global "Phase
   suivante" côté MJ.
   Phase 5 (Repos) validée par tous → déclenche automatiquement
   advanceManche() (restitution, +1 Adrénaline, rotation Détonateur)
   puis repart en Phase 1 (Événement) de la Manche suivante.
============================================================ */
const PHASES = ["evenement", "declenchement", "programmation", "action", "repos"];
// Mode "Événements" désactivable (panneau de configuration, session en
// cours) : retire la Phase 1 ET la Phase 2 de la rotation si eventsEnabled = false —
// il n'y a rien à déclencher sans événement actif.
// Décision Nikola (session) : les 8 effets d'Événements seront codés
// bien plus tard, une fois la version de base stabilisée et testée.
function getActivePhases(eventsEnabled) {
  return eventsEnabled ? PHASES : PHASES.filter((p) => p !== "evenement" && p !== "declenchement");
}
const PHASE_LABELS = {
  evenement: "1 · Événement",
  declenchement: "2 · Déclenchement",
  programmation: "3 · Programmation",
  action: "4 · Action",
  repos: "5 · Repos",
};
// 8 Événements du livret — ⚠️ STUB (confirmé Nikola cette session) : la
// Phase 1 pioche et affiche un nom d'Événement au hasard, MAIS n'applique
// AUCUN effet mécanique pour l'instant. Les 8 effets seront codés un par
// un dans une prochaine session (cf. tracker, section Événements).
const EVENT_NAMES = [
  "Toujours plus",
  "Gourmandise",
  "Vision X",
  "Pick pocket",
  "No choice",
  "Cible",
  "Choix par défaut",
  "Jamais 1 sans 2",
];

// Valeurs de Force imprimées sur les cartes (livret, section 6 Cartes Actions)
const CARD_FORCE = {
  tout_casser: 1,
  tete_en_avant: 2,
  graouhhh: 2,
  boing_boing: 2,
  faut_pas_me_chauffer: 3,
  je_ne_partage_pas: 3,
};

function placeTitans(nbJoueurs) {
  // 8 emplacements possibles = 4 coins × 2 cases adjacentes.
  // Tirage libre : permet le partage d'un coin (2 Titans sur ses 2 cases
  // adjacentes) et les coins vides, sans contrainte artificielle 1/coin.
  //
  // Ruling tranché Nikola (session), point ouvert V36 « priorité au
  // mouvement gratuit quand 2 Titans partagent un coin de départ » : le
  // point est CLOS, il n'y a pas de conflit à arbitrer. Chaque pôle offre
  // 2 positions distinctes, donc 2 Titans qui partagent un coin occupent
  // malgré tout 2 cases différentes et ne se gênent pas au départ. Aucune
  // règle de priorité n'est nécessaire, et le tirage libre ci-dessous
  // reste le bon comportement.
  const slots = [];
  for (const corner of Object.keys(CORNERS)) {
    for (const cell of CORNERS[corner].adjacents) {
      slots.push({ corner, cell, gradient: CORNERS[corner].gradient });
    }
  }
  const picked = shuffle(slots).slice(0, nbJoueurs);
  const players = picked.map((slot, idx) => ({
    id: idx + 1,
    corner: slot.corner,
    cell: slot.cell,
    // Éjecté hors de BIG CITY : il attend son tour pour rentrer, et `cell`
    // désigne alors sa case de retour (cf. rentrerEnJeu).
    horsPlateau: false,
    gradient: TITAN_GRADIENT[idx + 1],
    repaire: [],
    // Scoring final (brique ajoutée cette session) : compteurs réels des
    // 2 Pistes ADN (jusqu'ici seulement mentionnés dans les logs texte,
    // jamais incrémentés) + Socles collectés (valeurs, distinctes du Repaire
    // de blocs colorés).
    bagarre: 0,
    destruction: 0,
    socles: [], // valeurs des Socles collectés, ex. [3, 1, 2]
    // Système cartes-en-main / Zone Repos (brique ajoutée cette session) :
    hand: ACTION_CARDS.map((c) => c.id), // 6 cartes identiques au départ
    // programmed = les 3 cartes programmées cette Manche, PLUS jouées
    // dans l'ordre libre choisi par le joueur en Phase 4 (confirmé
    // Nikola, session) — ce n'est PAS une file FIFO, juste un pool des
    // cartes encore disponibles cette Manche.
    programmed: [],
    playedThisManche: [], // cartes jouées avec effet cette Manche (pool du Vol Phase Repos)
    // Défausse volontaire (round Action, confirmé Nikola session) : le Titan
    // désigne 1 de ses 3 cartes programmées et choisit de NE PAS la jouer
    // ("l'action n'est finalement pas intéressante"). La carte quitte le
    // pool de la Manche SANS effet ET SANS révélation aux adversaires (face
    // cachée) — mais elle compte quand même comme la carte de ce round (fait
    // avancer le tour comme si elle avait été jouée) et fait partie du pool
    // du Vol Phase Repos au même titre qu'une carte jouée avec effet.
    discardedHidden: [],
    repos: [], // [{ cardId, faceUp, returnAtManche }] — indisponibles, reviennent en MAIN À LEUR PROPRIÉTAIRE (confirmé Nikola : le vol/la Fatigue rendent une carte indisponible 1 Manche chez son propriétaire, ils ne la transfèrent PAS au voleur/attaquant)
    adrenaline: 1, // dette #3 résolue : stock réel, 1 distribué au départ (Manche 1) puis +1 à chaque advanceManche
  }));
  const ordreJeu = shuffle(players.map((p) => p.id));
  const detonateurManche1 = pick(ordreJeu);
  return { players, ordreJeu, detonateur: detonateurManche1 };
}

function nextDetonateur(ordreJeu, current) {
  const idx = ordreJeu.indexOf(current);
  return ordreJeu[(idx + 1) % ordreJeu.length];
}

/* ============================================================
   Périmètre / Énergie (brique 3)
   ============================================================
   - Périmètre = 8 cases Moore autour du Titan + sa propre case (9 max,
     moins sur les bords/coins du plateau)
   - Énergie (Tout Casser) = nombre de cases OCCUPÉES dans le périmètre,
     plafonné à 8 (cf. carte 01 · Tout Casser)
   - "Occupée" = bâtiment avec ≥1 bloc, OU un autre Titan présent
============================================================ */

function rowIndex(row) {
  return ROWS.indexOf(row);
}
function rowFromIndex(i) {
  return ROWS[i];
}

function getPerimeter(row, col) {
  const cells = [];
  const r0 = rowIndex(row);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = r0 + dr;
      const c = col + dc;
      if (r < 0 || r > 8 || c < 1 || c > 9) continue; // hors plateau
      cells.push({ row: rowFromIndex(r), col: c, isSelf: dr === 0 && dc === 0 });
    }
  }
  return cells; // 9 cellules max, moins en bord/coin
}

// Ruling CONFIRMÉ par Nikola le 2026-08-15, après que le scan l'a soulevé
// comme une possible incohérence : « notre propre Titan compte pour 1 pour
// le seuil dans le périmètre, on inclut sa case ». C'est donc voulu, et
// l'énergie vaut bien 1 au minimum, même sur un plateau vide.
//
// À ne pas confondre avec le `if (cell.isSelf) continue` des quatre
// sous-résolveurs : eux sautent la case centrale parce qu'on ne se casse
// pas soi-même, pas parce qu'elle ne compterait pas. Compter l'occupation
// et appliquer l'effet sont deux passes distinctes — la note est ici pour
// qu'un prochain relecteur ne « corrige » pas une règle voulue.
function computeEnergyToutCasser(perimeterCells, board, titansByCell, adrenalineBonus = 0) {
  let occupied = 0;
  for (const cell of perimeterCells) {
    const key = cell.row + cell.col;
    const bldg = board[key];
    const hasBuilding = bldg && bldg.blocks.length > 0;
    const hasTitan = !!titansByCell[key];
    if (hasBuilding || hasTitan) occupied++;
  }
  return Math.min(occupied + adrenalineBonus, 8); // plafond carte Tout Casser
}

/* ============================================================
   Résolution carte 01 · TOUT CASSER — sous-cas BÂTIMENT (brique 4)
   ============================================================
   Rulings confirmés Nikola :
   - Bâtiment SANS Seuil 4 → aucun effet (pas de casse)
   - Distance de projection (x) = énergie AU MOMENT DE LA PERCUSSION
     (valeur pleine calculée pour la carte, PAS la Force imprimée en
     haut à droite de la carte)
   - Rebond : 1 seul autorisé par carte. Au 2e obstacle → arrêt sur la
     case adjacente entre la case de destination et la case d'origine

   Implémenté :
   - Seuil 4 atteint → casse 1 bloc du haut, projeté, +1 Destruction
   - Dégression d'énergie : -1 par case parcourue pendant la projection
   - Bâtiment vidé de tous ses blocs → Socle libéré au sol (resolveDestructionSocle,
     FAQ #9 tranchée) — récupérable normalement ensuite, aucune attribution auto

   ⚠️ PAS encore implémenté, hors scope de cette brique :
   - Atterrissage du bloc projeté sur une case occupée → géré par les
     chaînes de réaction (§6 du tracker), physique uniquement (voir
     dette #2 pour le comptage Bagarre associé, non câblé)
============================================================ */

function releaseSocle(cellKey, board, looseBlocks) {
  // FAQ #9 (tranchée) : le Socle tombe comme ressource libre, ramassable
  // "au même titre qu'un Bloc de béton" — donc dans looseBlocks, pas dans
  // un champ à part (sinon aucune mécanique existante ne peut le ramasser).
  //
  // Ruling tranché Nikola (session), point ouvert V36 « qui récupère le
  // Socle quand le dernier bloc part par ricochet » : PERSONNE. Le Socle
  // reste au sol de BIG CITY, sans attribution automatique à qui que ce
  // soit — ni au Titan qui a frappé, ni à celui qui a provoqué le ricochet.
  // Il redevient un élément libre que n'importe qui pourra ramasser plus
  // tard par les voies normales (Récupération, Tête en Avant, Boing Boing,
  // Je Ne Partage Pas). C'est déjà le comportement de cette fonction, qui
  // est l'UNIQUE chemin de libération d'un Socle : aucun appelant
  // n'attribue le Socle à un joueur.
  //
  // Ce cas est bel et bien atteignable depuis le ruling « ricochet
  // destructeur » : un ricochet qui percute un bâtiment avec une énergie
  // ≥ Seuil 4 lui casse un bloc, et peut donc le vider entièrement. Voir
  // la branche `isWall` de projectInDirection, qui appelle cette fonction.
  const bldg = board[cellKey];
  if (!bldg) return;
  board[cellKey] = { ...bldg, blocks: [] };
  if (!looseBlocks[cellKey]) looseBlocks[cellKey] = [];
  looseBlocks[cellKey].push(socleMarker(bldg.socle));
}

/* ============================================================
   CHAÎNES DE RÉACTION (brique ajoutée cette session)
   ============================================================
   Rulings confirmés Nikola :
   - Chaque case TRAVERSÉE est désormais vérifiée, pas seulement la case
     finale d'atterrissage. Un Bâtiment avec blocs rencontré en plein vol
     = mur (même traitement qu'un bord de plateau : 1 rebond gratuit,
     puis arrêt sur la case adjacente au 2e obstacle).
   - Un Titan ou un Bloc libre rencontré en cours de route devient le
     point d'arrêt de la trajectoire et déclenche la réaction en chaîne
     à cet endroit (règle "Projection — règle absolue" du livret :
     "il projette les éléments présents du nombre de cases égal à
     l'énergie restante").
   - Profondeur de chaîne ILLIMITÉE : l'élément repoussé peut lui-même
     en pousser un 3e, etc., jusqu'à épuisement de l'énergie transmise.
   - Énergie restante ≤ 1 sur une case déjà occupée par un Titan (Titan+
     Titan interdit, poussée impossible) → l'arrivant se pose sur la case
     ADJACENTE (la case précédente, comme la règle "case impossible"),
     au lieu de forcer la collision.
   - Énergie restante ≤ 1 sur une case occupée par un Bloc libre unique →
     accumulation par défaut (règle Formation d'Amas déjà existante) :
     l'arrivant s'empile, aucune poussée.
   - Amas (2+ blocs déjà en place) rencontré en chaîne : accumulation par
     défaut (Formation). Le Patatras (Seuil 4) reste une mécanique de
     carte à part, non déclenchée automatiquement par cette chaîne
     générique (hypothèse à valider si besoin).
   ✅ FAQ #12 (confirmée Nikola, session) : un Titan poussé en chaîne dans
   un autre Titan ne redéclenche JAMAIS un nouveau DIL/RAGE — la décision
   DIL/RAGE reste propre au 1er impact direct de la carte jouée. En
   revanche, chaque Titan DISTINCT déplacé (direct + tous les ricochets
   confondus) rapporte +1 Bagarre à l'initiateur, une seule fois par
   Titan (jamais 2x le même). Plafond mécanique = (nb Titans en partie
   − 1). ⚠️ Code EN ATTENTE (report demandé par Nikola) : ce comptage
   n'est pas encore câblé — projectInDirection ne remonte pas la liste
   des Titans déplacés en chaîne vers l'appelant. Les resolvers de
   cartes n'incrémentent aujourd'hui titan.bagarre que sur l'impact
   direct. Voir tracker, dette #2, pour le plan d'implémentation.
============================================================ */

/* ============================================================
   OÙ SE POSE UN ÉLÉMENT QUI N'A PAS LA PUISSANCE DE PASSER
   ============================================================
   Ruling Nikola du 2026-08-17, énoncé littéralement : « adjacent à la case
   où il était ET où il devait aller — donc il peut revenir sur la case où il
   était, ou adjacent entre sa destination et celle d'avant ». Le choix
   revient au TITAN INITIATEUR de l'action.

   DEUX CAS.

   · Cas normal — l'élément vient d'une case du plateau (`depuis`). Les cases
     valides sont sa propre case, plus toutes celles qui touchent À LA FOIS
     sa case et la case visée. Géométriquement, c'est la « charnière » entre
     les deux : il ne peut ni dépasser l'obstacle, ni s'échapper au loin.

   · Sortie de faille — l'élément débarque de l'autre bout du plateau et n'a
     pas de case précédente ici (`depuis` vaut null). Il n'a donc nulle part
     où « revenir ». On prend alors les voisines de la case visée, en
     écartant celles qui AVANCENT sur l'un des axes du déplacement : franchir
     l'obstacle par le côté reviendrait à le traverser. C'est ce qui donne
     B9/D9 quand un élément ressort à l'ouest sur C9 bloquée, et B9 seul
     quand il arrive en diagonale sud-ouest.

   Une case n'est proposée que si l'élément peut réellement s'y poser :
   pas de bâtiment debout, et pas de Titan déjà là quand c'est un Titan qu'on
   déplace (un débris, lui, peut reposer sur la case d'un Titan).
============================================================ */
function getCasesRepliDebris(depuis, cible, dr, dc, { board, looseBlocks = {}, titans = [], movingTitanId = null, initiatorId = null } = {}) {
  const cr = rowIndex(cible[0]);
  const cc = Number(cible.slice(1));
  const titansByCell = indexerTitans(titans);

  /* CE QUI INTERDIT UNE CASE — précisions successives de Nikola, 2026-08-17.

     La seule contrainte dure est le BÂTIMENT : « en tout cas elle ne peut pas
     cohabiter avec un bâtiment ». C'est la règle transversale du jeu, un
     élément ne repose jamais sur un bâtiment encore debout.

     Tout le reste est ouvert, et volontairement :
     · un débris déjà au sol — « on peut poser le débris qui rebondit sur un
       débris, ça forme un tas ». C'est même la façon normale de constituer
       un Amas, donc un coup à part entière ;
     · un Titan — c'est au contraire une case que l'attaquant peut vouloir
       viser (cf. la préférence de l'IA dans choisirRepliIA).

     RULING DU 2026-08-18 — LA CASE D'UN AUTRE TITAN EST OUVERTE, ELLE AUSSI.
     Nikola : « il peut aller sur une case d'un autre Titan si elle est dans
     la zone possible, ça permet de le pousser pour gagner une case sur la
     piste ADN Bagarre. » Un Titan replié qui choisit la case d'un adversaire
     ne s'y superpose donc pas : il l'en CHASSE d'une case (cf.
     appliquerReplElement), et c'est précisément l'intérêt du choix.

     Seule la case de l'INITIATEUR reste fermée : le livret lui accorde
     l'immunité sur sa propre carte, il ne peut pas se pousser lui-même.

     Et la case d'origine reste toujours proposée, quoi qu'elle porte : il en
     vient, il y était. C'est le « il peut revenir sur la case où il était »
     du ruling, et ce qui garantit qu'il reste toujours une issue. */
  const sansBatiment = (key) => {
    const b = board && board[key];
    return !(b && b.blocks && b.blocks.length > 0);
  };
  const posable = (key) => {
    if (!sansBatiment(key)) return false;
    if (movingTitanId != null && initiatorId != null && titansByCell[key] === initiatorId) return false;
    return true;
  };

  const voisines = (key) => {
    const r0 = rowIndex(key[0]);
    const c0 = Number(key.slice(1));
    const out = [];
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        if (a === 0 && b === 0) continue;
        const nr = r0 + a, nc = c0 + b;
        if (nr < 0 || nr > 8 || nc < 1 || nc > 9) continue;
        out.push(rowFromIndex(nr) + nc);
      }
    }
    return out;
  };

  let candidates;
  if (depuis) {
    const autour = new Set(voisines(depuis));
    // La charnière : sa propre case, plus celles qui touchent les deux.
    candidates = [depuis, ...voisines(cible).filter((k) => autour.has(k))];
  } else {
    // Sortie de faille : aucune case précédente sur ce bord du plateau.
    // On écarte toute case qui progresse sur un axe du déplacement.
    candidates = voisines(cible).filter((k) => {
      const r = rowIndex(k[0]);
      const c = Number(k.slice(1));
      if (dr !== 0 && Math.sign(r - cr) === Math.sign(dr)) return false;
      if (dc !== 0 && Math.sign(c - cc) === Math.sign(dc)) return false;
      return true;
    });
  }

  /* La case d'origine échappe au filtre des OCCUPANTS : l'élément en vient,
     il peut y rester quoi qu'il s'y trouve.

     Elle n'échappe PAS au bâtiment, et c'est une correction du 2026-08-18,
     trouvée en campagne (graine 7067) : un bloc cassé commence sa
     trajectoire SUR la case du bâtiment qu'on vient d'entamer. Proposée
     telle quelle, cette case permettait de reposer le débris sur un
     bâtiment encore debout — la seule chose que le jeu n'autorise nulle
     part. Un débris n'a aucune place au sol à côté d'une tour. */
  return [...new Set(candidates)].filter(
    (k) => k !== cible && sansBatiment(k) && (k === depuis || posable(k))
  );
}

/* ============================================================
   POSER L'ÉLÉMENT REPLIÉ — description unique de « déplacer »
   ============================================================
   Trois chemins appelaient jusqu'ici la même règle avec trois codes
   différents : l'IA (appliquerRepli, dans aiPlanner), le contrôleur pour un
   joueur humain, et le simulateur. Le jour où la règle a bougé — un Titan
   replié peut désormais en POUSSER un autre — il aurait fallu penser aux
   trois. Elle ne vit donc plus qu'ici, et les trois l'appellent.

   Deux natures d'élément, d'où `repli.titanId` :
   · un TITAN nommément — on le repose sur la case choisie ;
   · un DÉBRIS (titanId à null) — il vient d'être empilé sur la case par
     défaut par le résolveur, on le déplace du sommet de cette pile vers la
     case choisie.

   Ruling Nikola du 2026-08-18 : choisir la case d'un ADVERSAIRE est un coup
   à part entière. L'occupant y est chassé d'une case, dans l'axe
   « case par défaut → case choisie », et l'initiateur marque sa Bagarre.
   C'est ce qui permet de gagner une case de piste ADN avec un repli, au lieu
   de subir un arrêt sans effet.
============================================================ */
function appliquerReplElement(repli, cellKey, gameState) {
  const log = [];
  if (!repli || !cellKey || cellKey === repli.defaut) return { log, applied: false };

  const { board, titans = [], looseBlocks = {}, replis } = gameState;

  // 1. L'occupant éventuel dégage AVANT que l'élément prenne sa place.
  const occupant = titans.find(
    (t) => estSurLePlateau(t) && t.cell === cellKey && t.id !== repli.titanId
  );
  if (occupant && repli.titanId != null) {
    const dr = Math.sign(rowIndex(cellKey[0]) - rowIndex(repli.defaut[0]));
    const dc = Math.sign(Number(cellKey.slice(1)) - Number(repli.defaut.slice(1)));
    const avant = occupant.cell;
    const bagarreSet = new Set();
    const landing = projectInDirection(cellKey[0], Number(cellKey.slice(1)), dr, dc, 1, {
      board, looseBlocks, titans, log, replis, bagarreSet,
      initiatorId: repli.initiatorId ?? null, movingTitanId: occupant.id,
    });
    if (!landing.ejecte) occupant.cell = landing.row + landing.col;
    if (occupant.cell !== avant || landing.ejecte) bagarreSet.add(occupant.id);
    const initiateur = titans.find((t) => t.id === repli.initiatorId);
    if (initiateur && bagarreSet.size > 0) {
      initiateur.bagarre = (initiateur.bagarre || 0) + bagarreSet.size;
      log.push(
        `${cellKey} : Titan ${occupant.id} poussé en ${occupant.cell} par le repli — +${bagarreSet.size} Bagarre (Titan ${initiateur.id} → ${initiateur.bagarre}).`
      );
    }
    // Occupant réellement coincé : la case reste prise, l'élément ne peut
    // pas s'y poser et garde son point de chute par défaut.
    if (occupant.cell === cellKey) {
      log.push(`${cellKey} : Titan ${occupant.id} coincé, impossible de le déloger — l'élément reste en ${repli.defaut}.`);
      return { log, applied: false };
    }
  }

  if (repli.titanId != null) {
    const titan = titans.find((t) => t.id === repli.titanId);
    if (!titan) return { log, applied: false };
    titan.cell = cellKey;
    return { log, applied: true };
  }

  const pile = looseBlocks[repli.defaut] || [];
  const bloc = pile.pop();
  if (bloc === undefined) return { log, applied: false };
  retirerPileVide(looseBlocks, repli.defaut);
  if (!looseBlocks[cellKey]) looseBlocks[cellKey] = [];
  looseBlocks[cellKey].push(bloc);
  return { log, applied: true };
}

function projectInDirection(fromRow, fromCol, dr, dc, energy, ctx) {
  // ctx = { board, looseBlocks, titans, log? } — log est optionnel : si
  // fourni (tableau du resolver appelant), les messages de chaîne s'y
  // ajoutent directement ; sinon un tableau jetable est utilisé.
  const { board, looseBlocks, titans } = ctx;
  const log = ctx.log || [];

  /* QUI EST DÉJÀ EN VOL DANS CETTE RÉACTION. Le Titan projeté par CET appel
     en fait partie dès la première ligne, et l'ensemble se transmet à toutes
     les récursions — poussée de Titan, bloc cassé par ricochet, débris
     transmis. Sans cette transmission par les DÉBRIS, une chaîne pouvait
     revenir taper le Titan encore en vol par un chemin détourné (graine
     7086 : le bloc cassé par le ricochet pousse un troisième Titan, qui
     repousse le premier alors qu'il n'a même pas fini sa trajectoire).
     L'appelant écrasait ensuite ce second déplacement, d'où deux Titans sur
     la même case. */
  const enChaine = new Set(ctx.enChaine || []);
  if (ctx.movingTitanId != null) enChaine.add(ctx.movingTitanId);

  const titansByCell = indexerTitans(titans);

  // Bug trouvé par le diagnostic : la carte des occupants est construite
  // AVANT le déplacement, et un Titan projeté y figure encore à sa case de
  // départ. Quand sa trajectoire rebondit et repasse par cette case, il se
  // rencontrait lui-même, se traitait comme un obstacle et se poussait
  // récursivement — d'où des superpositions.
  //
  // L'exclusion est volontairement EXPLICITE (`ctx.movingTitanId`) et non
  // déduite de la case de départ : une case peut porter à la fois un bloc
  // libre et un Titan, et projeter ce bloc ne doit surtout pas faire
  // disparaître le Titan de la carte des obstacles.
  //
  // Cas distinct de l'immunité de l'initiateur plus bas, qui concerne un
  // élément revenant sur le Titan ayant JOUÉ la carte, lequel n'a pas bougé.
  if (ctx.movingTitanId != null) {
    const enMouvement = titans.find((t) => t.id === ctx.movingTitanId);
    if (enMouvement && titansByCell[enMouvement.cell] === ctx.movingTitanId) {
      delete titansByCell[enMouvement.cell];
    }
  }

  // `titansByCell` est un relevé figé au début de l'appel. Les récursions
  // (bloc transmis, Titan poussé, ricochet) peuvent déplacer un Titan
  // PENDANT le parcours, y compris sur la case où l'élément courant compte
  // se poser. Cette fonction interroge l'état RÉEL au moment voulu, ce que
  // le relevé initial ne peut pas faire.
  const caseOccupeeParUnAutreTitan = (cle) =>
    titans.some((t) => estSurLePlateau(t) && t.cell === cle && t.id !== ctx.movingTitanId);

  let r = rowIndex(fromRow);
  let c = fromCol;
  let remaining = energy;
  let curDr = dr;
  let curDc = dc;
  let hasBounced = false;

  // Trace du parcours, de la case de départ à la case d'arrivée. Sert au
  // garde-fou final : si la case d'arrivée s'est retrouvée occupée pendant
  // le vol, on remonte le chemin réellement emprunté pour trouver où
  // s'arrêter. Le reconstituer après coup serait impossible, la trajectoire
  // pouvant rebondir et traverser la faille spatio-temporelle.
  const chemin = [rowFromIndex(r) + c];
  const avancerVers = (nr2, nc2) => {
    r = nr2;
    c = nc2;
    chemin.push(rowFromIndex(r) + c);
  };

  // Case par laquelle l'élément vient de ressortir de la faille, tant qu'il
  // n'a pas repris sa progression. Quand la trajectoire s'arrête juste après
  // un passage de faille, « s'arrêter sur la case adjacente » ne peut pas
  // vouloir dire « repartir à l'autre bout du plateau » : le point de chute
  // se calcule autour de cette case-là. Remis à null dès que l'élément
  // avance normalement.
  let sortieDeFaille = null;

  /* Cases proposées au TITAN INITIATEUR quand l'élément s'arrête faute de
     puissance (ruling du 2026-08-17, cf. getCasesRepliDebris). Renseigné aux
     trois points d'arrêt « je ne passe pas » ; reste null quand l'élément
     s'arrête pour une autre raison (énergie épuisée, case libre atteinte). */
  let choixRepli = null;
  const noterRepli = (depuis, cible) => {
    const cases = getCasesRepliDebris(depuis, cible, curDr, curDc, {
      board, looseBlocks, titans,
      movingTitanId: ctx.movingTitanId ?? null,
      initiatorId: ctx.initiatorId ?? null,
    });
    if (cases.length > 0) choixRepli = { depuis, cible, dr: curDr, dc: curDc, cases };
  };

  while (remaining > 0) {
    let nr = r + curDr;
    let nc = c + curDc;
    const outOfBounds = nr < 0 || nr > 8 || nc < 1 || nc > 9;

    if (outOfBounds) {
      /* ── UN TITAN POUSSÉ HORS DU PLATEAU EST ÉJECTÉ, PAS RENVOYÉ ──
         Ruling de Nikola du 2026-08-16, qui revient volontairement sur le
         traitement précédent : « c'est genre du catch, on le pousse en
         dehors du ring ».

         Pour un TITAN, le bord n'est ni un mur ni une faille :
         · aucun rebond, il ne repart jamais vers l'attaquant ;
         · aucune condition de Seuil 4, la faille et son coût d'énergie ne
           le concernent pas ;
         · il quitte le plateau et réapparaît du côté opposé, où il
           reprendra la partie à son tour.

         Les débris, eux, gardent le comportement habituel : rebond sous le
         Seuil 4, faille au-dessus. C'est la seule différence de traitement
         entre un Titan et un débris sur un bord, et elle est voulue. */
      if (ctx.movingTitanId != null) {
        /* ── PAR OÙ IL REVIENT : LA MÊME TRAVERSÉE QUE LES DÉBRIS ──
           Ruling Nikola du 2026-08-18, en réponse au cas remonté en test
           réel : « j'étais en I2, un Titan était en H1, j'ai fait un Boing
           Boing à valeur 5 : il aurait dû être en G9, il était en I9. »

           Un SEUL axe boucle : celui par lequel le Titan sort réellement du
           plateau. L'autre garde la coordonnée que sa trajectoire lui donne.
           Le Titan de H1 poussé vers le nord-ouest sort par la colonne, la
           colonne passe donc de 0 à 9 et la ligne suit sa route, H puis G.
             · sortie droite : E9 vers l'est ressort en E1 ;
             · sortie en diagonale par un seul bord : H1 vers le nord-ouest
               ressort en G9 ;
             · sortie par un coin, où les deux axes dépassent en même temps :
               les deux bouclent, I9 vers le sud-est ressort en A1.

           La version précédente renvoyait le Titan au bord opposé sur CHAQUE
           axe où il avançait, coordonnée valide comprise : elle transformait
           le G9 attendu en I9. Elle avait été écrite pour obtenir A1 sur une
           sortie diagonale, ce que la sortie par un coin donne maintenant
           d'elle-même, sans casser les sorties par un seul bord.

           C'est aussi la règle de la faille spatio-temporelle appliquée aux
           débris, quelques lignes plus bas : un seul comportement de
           traversée à retenir pour tout le jeu. Ce qui reste propre au Titan,
           c'est de quitter la partie jusqu'à son tour au lieu de finir son
           déplacement. */
        const sortieR = nr < 0 ? 8 : nr > 8 ? 0 : nr;
        const sortieC = nc < 1 ? 9 : nc > 9 ? 1 : nc;

        // Il quitte le plateau et ATTEND son tour pour y revenir : c'est le
        // marqueur `horsPlateau`, posé par l'appelant à partir de ce
        // résultat. La case retournée est celle par laquelle il rentrera.
        const ejecte = titans.find((t) => t.id === ctx.movingTitanId);
        if (ejecte) {
          ejecte.horsPlateau = true;
          ejecte.cell = rowFromIndex(sortieR) + sortieC;
        }
        log.push(`🥊 Titan ${ctx.movingTitanId} poussé hors de BIG CITY — il attend son tour pour rentrer par ${rowFromIndex(sortieR)}${sortieC}.`);
        return {
          row: rowFromIndex(sortieR),
          col: sortieC,
          energyLeft: 0,
          hasBounced,
          ejecte: true,
          log,
        };
      }

      if (remaining >= 4) {
        /* FAILLE SPATIO-TEMPORELLE — l'élément réapparaît du côté opposé.

           Bug remonté par Nikola en test réel le 2026-08-15 : « le bloc de
           G9 a fini sur I9, avec l'idée du warp ce n'est pas possible ».

           La version précédente calculait bien la case de sortie, mais ne
           déplaçait JAMAIS l'élément : `r` et `c` restaient sur la case
           d'avant la faille. Si la case de sortie se révélait être un mur,
           le code faisait alors « arrêt sur la case actuelle » — c'est-à-dire
           à l'autre bout du plateau, d'où l'élément venait de partir. Un
           bloc cassé revenait ainsi se poser sur son propre bâtiment.

           Le livret est explicite : l'élément « réapparaît du côté opposé et
           FINIT SON DÉPLACEMENT · les règles normales s'appliquent au reste
           de sa trajectoire ». Il est donc SUR la case de sortie, et
           poursuit de là. C'est ce que fait ce bloc désormais.

           Arbitrage de Nikola du 2026-08-15 sur la case de sortie occupée :
           l'élément qui ressort TAPE ce qu'il rencontre, exactement comme
           en trajectoire normale. On ne fait donc rien de spécial ici — on
           replace nr/nc sur la case de sortie et on laisse le corps de
           boucle ci-dessous appliquer mur, Seuil 4, poussée ou amas. La
           seule chose que la faille change, c'est la POSITION de l'élément :
           il est désormais de l'autre côté du plateau, et c'est de là qu'il
           s'arrêtera si l'obstacle le bloque. */
        if (nr < 0) nr = 8;
        else if (nr > 8) nr = 0;
        if (nc < 1) nc = 9;
        else if (nc > 9) nc = 1;
        remaining -= 1; // le passage par la faille coûte 1 d'énergie
        // La case de sortie devient le point de chute de référence. Sans
        // ça, un obstacle rencontré juste après renvoyait l'élément sur sa
        // case de départ, à l'autre bout du plateau : c'est le bug du bloc
        // de G9 qui « finissait » sur I9, remonté en test réel.
        sortieDeFaille = rowFromIndex(nr) + nc;
        log.push(`🌀 Faille spatio-temporelle : l'élément ressort en ${sortieDeFaille} (énergie restante ${remaining}).`);
      } else {
        // Ruling Nikola (test à la table, 2026-08-18) : fini les rebonds qui
        // repartent en arrière. Sous le Seuil 4, l'élément qui atteint le
        // bord sans pouvoir franchir la faille s'arrête net, sur la case où
        // il se trouve déjà — il n'existe pas de case "adjacente à la case
        // visée" à proposer ici, puisque cette case est hors plateau.
        log.push(`${rowFromIndex(r)}${c} : bord du plateau atteint, énergie insuffisante pour la faille (${remaining}) → arrêt net, plus de rebond.`);
        break;
      }
    }

    const nextKey = rowFromIndex(nr) + nc;
    const bldg = board[nextKey];
    const isWall = bldg && bldg.blocks && bldg.blocks.length > 0;

    if (isWall) {
      /* Ruling tranché Nikola (session) : un ricochet PEUT casser un bloc,
         à condition que l'énergie au moment de l'impact atteigne le Seuil 4.
         En dessous, le bâtiment se comporte comme avant : un mur qui renvoie
         l'élément (règle "Bâtiment comme mur").

         NORMALISATION du 2026-08-15, demandée par Nikola pour « simplifier
         la compréhension globale » : au Seuil 4, l'élément casse un bloc,
         puis PREND LA PLACE si la case se libère — c'est-à-dire si le
         bâtiment tombe entièrement. Sinon il s'arrête sur la case adjacente,
         comme avant. La règle vaut pour un Titan comme pour un débris, et
         que l'impact vienne d'une trajectoire normale ou d'une sortie de
         faille : un seul comportement à retenir pour tout le jeu.

         C'est exactement ce que faisait déjà Tête en Avant sur une charge
         directe (« bâtiment totalement détruit → devient un couloir, le
         Titan avance jusque-là »). Les réactions en chaîne s'alignent
         dessus au lieu de s'arrêter systématiquement avant le bâtiment. */
      if (remaining >= SEUIL_4) {
        const broken = bldg.blocks.pop();
        // L'élément percutant s'arrête à l'impact (il ne rebondit pas et
        // n'avance pas sur la case) ; c'est le bloc cassé qui repart, dans
        // la direction du choc, avec l'énergie restante après l'impact. Il
        // peut donc lui-même déclencher une nouvelle chaîne.
        // Ce qui repart est un BLOC, pas un Titan : on efface
        // movingTitanId, sans quoi l'identité de l'élément projeté par
        // l'appel parent fuiterait dans la chaîne et ferait disparaître ce
        // Titan de la carte des obstacles pour toute la réaction.
        const pushed = projectInDirection(rowFromIndex(nr), nc, curDr, curDc, remaining - 1, { ...ctx, movingTitanId: null, enChaine });
        const pushedKey = pushed.row + pushed.col;
        if (!looseBlocks[pushedKey]) looseBlocks[pushedKey] = [];
        looseBlocks[pushedKey].push(broken);
        log.push(
          `${nextKey} : ricochet au Seuil 4 (énergie ${remaining}) → bloc ${broken} cassé et projeté vers ${pushedKey}.`
        );
        // Bâtiment vidé par le ricochet : le Socle tombe au sol et n'est
        // attribué à personne (ruling Socle, cf. releaseSocle).
        if (bldg.blocks.length === 0) {
          releaseSocle(nextKey, board, looseBlocks);
          log.push(`${nextKey} : bâtiment détruit par ricochet → Socle (${bldg.socle}) au sol, à personne.`);
        }
        // Point ouvert TRANCHÉ par Nikola le 2026-08-15 : la Destruction
        // par ricochet revient à l'INITIATEUR de la carte, comme pour une
        // frappe directe. C'est bien son action qui a causé la casse.
        // (Le Socle, lui, reste attribué à personne : ce sont deux rulings
        // distincts, cf. releaseSocle.)
        // L'information était disponible depuis le début — ctx.initiatorId
        // est transmis par les dix appels de projectInDirection — elle
        // n'était simplement pas exploitée ici.
        if (ctx.initiatorId != null) {
          const initiateur = titans.find((t) => t.id === ctx.initiatorId);
          if (initiateur) {
            initiateur.destruction = (initiateur.destruction || 0) + 1;
            log.push(`+1 Destruction (Titan ${ctx.initiatorId}) — bloc cassé par ricochet.`);
          }
        }
        // La case se libère → l'élément prend la place (ruling de
        // normalisation ci-dessus). Sinon il reste sur la case adjacente.
        if (bldg.blocks.length === 0 && !caseOccupeeParUnAutreTitan(nextKey)) {
          avancerVers(nr, nc);
          log.push(`${nextKey} : bâtiment tombé, la case se libère → l'élément y prend place.`);
        }
        remaining = 0;
        break;
      }
      /* ── SORTIE DE FAILLE BLOQUÉE : ARRÊT SEC, PAS DE REBOND ──
         Ruling Nikola du 2026-08-17 : « si un élément qui warp touche un
         élément mais n'a pas la puissance de l'impacté, alors arrêt sur case
         adjacente — il ne finit pas son déplacement. »

         Sans ce garde-fou, l'élément fraîchement ressorti de la faille et
         bloqué par un mur sous le Seuil 4 partait en REBOND. Or au moment du
         warp, `r/c` n'a pas encore bougé : il pointe toujours sur la case
         d'AVANT la faille, à l'autre bout du plateau (l'élément n'avance
         réellement qu'en atteignant « Case libre » plus bas). Le rebond le
         faisait donc repartir en arrière depuis là-bas, traversant à nouveau
         tout le plateau — la trajectoire n'avait plus aucun rapport avec le
         point où il venait de ressortir.

         C'est la même famille de défauts que le bloc de G9 qui « finissait »
         en I9, corrigé le 2026-08-15 pour le cas de l'ARRÊT ; le cas du
         REBOND, lui, était resté. On coupe donc net : le déplacement
         s'arrête, et le bloc `sortieDeFaille` en fin de fonction repose
         l'élément contre sa case de sortie, du bon côté du plateau. */
      if (sortieDeFaille) {
        log.push(`${nextKey} : mur rencontré à la sortie de la faille, énergie insuffisante (${remaining}) → arrêt, le déplacement ne se poursuit pas.`);
        // Sorti de faille : aucune case précédente de ce côté du plateau,
        // d'où `null` — les cases proposées se calculent autour de la cible.
        noterRepli(null, nextKey);
        break;
      }
      // Ruling Nikola (test à la table, 2026-08-18) : fini les rebonds qui
      // repartent en arrière contre un mur. Même traitement que le "2e
      // obstacle" ci-dessus : arrêt net dès le premier mur sous le Seuil 4,
      // sur une case choisie par la règle d'adjacence (getCasesRepliDebris).
      noterRepli(rowFromIndex(r) + c, nextKey);
      break; // arrêt sur la case actuelle (r, c)
    }

    const remainingAfterArrival = remaining - 1;
    const occupantTitanId = titansByCell[nextKey];
    const stack = looseBlocks[nextKey];

    if (occupantTitanId) {
      // Livret, carte 01 : « Immunité — tu ne peux pas être projeté par ton
      // propre Tout Casser. Si un élément de ton Tout Casser revient sur ta
      // case, il s'arrête immédiatement dessus. » L'initiateur était traité
      // comme n'importe quel Titan et se faisait pousser par ses propres
      // projections.
      if (ctx.initiatorId != null && occupantTitanId === ctx.initiatorId) {
        // Conflit de règles tranché par Nikola le 2026-08-15.
        // Le livret dit « il s'arrête immédiatement dessus », formulation
        // écrite pour un DÉBRIS — lequel peut parfaitement reposer sur la
        // case d'un Titan. Appliquée telle quelle à un TITAN projeté, elle
        // en mettait deux sur la même case et contredisait l'autre ruling
        // (« deux Titans ne partagent jamais une case »).
        // Arbitrage : l'immunité joue dans les deux cas — l'initiateur
        // n'est jamais poussé — mais un Titan projeté s'arrête sur la case
        // PRÉCÉDENTE au lieu d'entrer sur celle de l'initiateur. Cette
        // case est nécessairement libre : la trajectoire ne progresse que
        // sur des cases sans occupant.
        if (ctx.movingTitanId != null) {
          log.push(`${nextKey} : Titan ${ctx.movingTitanId} projeté sur le Titan ${occupantTitanId} — immunité de l'initiateur, il s'arrête juste avant, en ${rowFromIndex(r)}${c}.`);
        } else {
          log.push(`${nextKey} : élément revenu sur le Titan ${occupantTitanId} — immunité de l'initiateur, il s'arrête là.`);
          avancerVers(nr, nc);
        }
        remaining = 0;
        break;
      }
      /* ── UN TITAN QUI EN RENCONTRE UN AUTRE LE POUSSE ──
         Ruling Nikola du 2026-08-18, énoncé sur Graouhhh : « si un Titan
         poussé rencontre un Titan, il le pousse ».

         Le recul de Graouhhh vaut (nombre de Titans touchés + 1), donc 2
         dans le cas courant. Après le pas d'arrivée il ne reste qu'une
         énergie de 1, et l'ancienne condition — poussée impossible en
         dessous de 2 — arrêtait la chaîne net : le Titan touché se collait
         contre son voisin au lieu de le décaler, et la Bagarre de chaîne ne
         partait jamais.

         Un TITAN en mouvement pousse donc toujours, d'au moins 1 case. Un
         DÉBRIS garde la règle d'origine : sous 2 d'énergie il se pose sur la
         case adjacente, il n'a pas la masse pour bouger un Titan. */
      const elementEstUnTitan = ctx.movingTitanId != null;
      const energieTransmise = elementEstUnTitan
        ? Math.max(1, remainingAfterArrival)
        : remainingAfterArrival;
      if (!elementEstUnTitan && remainingAfterArrival <= 1) {
        log.push(
          `${nextKey} : Titan ${occupantTitanId} déjà présent — poussée impossible (énergie restante ${remainingAfterArrival}) → arrêt en ${rowFromIndex(r)}${c}.`
        );
        noterRepli(rowFromIndex(r) + c, nextKey);
        break; // reste sur la case actuelle (r, c) — case adjacente
      }
      /* ── UN TITAN DÉJÀ EN VOL NE SE FAIT PAS POUSSER UNE SECONDE FOIS ──
         Défaut trouvé en campagne (30 parties, graines 3020 et 3029) le jour
         où la poussée est devenue systématique : deux Titans se retrouvaient
         sur la même case après un Boing Boing.

         Le scénario, réel : Titan 4 est projeté hors de C5 ; sa trajectoire
         rebondit et le ramène en B4, où il pousse Titan 3 ; Titan 3 repart
         vers C5, y trouve Titan 4 — qui n'a PAS encore été reposé, son
         appelant n'écrit sa case qu'au retour — et le pousse à son tour vers
         D6. Titan 4 se retrouvait donc déplacé deux fois, et l'écriture
         finale de l'appelant écrasait la seconde. Le plateau finissait avec
         un Titan fantôme et une superposition.

         La FAQ #12 dit déjà qu'un Titan ne compte qu'UNE fois dans la
         chaîne. On applique la même idée à sa position : tant qu'un Titan
         est en vol dans cette réaction, il est intouchable. Celui qui le
         rencontre le traite comme un obstacle immobile et s'arrête avant.

         `enChaine` sert aussi de garde-fou de profondeur : il ne peut pas y
         avoir plus de maillons que de Titans en partie, une boucle infinie
         est donc structurellement impossible. */
      if (enChaine.has(occupantTitanId)) {
        log.push(
          `${nextKey} : Titan ${occupantTitanId} déjà en mouvement dans cette réaction — il n'est pas poussé deux fois, l'élément s'arrête en ${rowFromIndex(r)}${c}.`
        );
        noterRepli(rowFromIndex(r) + c, nextKey);
        break;
      }
      const chaineSuivante = new Set(enChaine).add(occupantTitanId);
      const occupant = titans.find((t) => t.id === occupantTitanId);
      const caseAvant = occupant.cell;
      // Dans cette récursion, l'élément en mouvement est l'OCCUPANT poussé,
      // plus celui de l'appel parent : c'est donc lui qui doit être exclu
      // de la carte des obstacles s'il rebondit sur sa propre case.
      const pushed = projectInDirection(rowFromIndex(nr), nc, curDr, curDc, energieTransmise, { ...ctx, movingTitanId: occupantTitanId, enChaine: chaineSuivante });
      const caseApres = pushed.row + pushed.col;

      // OCCUPANT COINCÉ. Quand la trajectoire du Titan poussé est bloquée
      // dans les deux sens (mur ou bord devant ET derrière),
      // projectInDirection renvoie sa case d'origine INCHANGÉE : il n'a pas
      // bougé. Le code supposait pourtant toujours la case libérée et y
      // installait l'élément arrivant, ce qui produisait deux Titans sur la
      // même case. Cas observé en simulation : « Titan 2 repoussé vers B2 »
      // alors qu'il était déjà en B2, suivi de « Titan 1 déplacé en B2 ».
      //
      // Nikola avait déjà tranché ce cas de l'occupant coincé pour Boing
      // Boing (voir resolveBoingBoing, qui annule alors l'action) ; la
      // réaction en chaîne n'avait jamais reçu le garde-fou correspondant.
      // Ici l'élément arrivant s'arrête simplement sur la case précédente,
      // comme face à n'importe quel obstacle infranchissable.
      if (caseApres === caseAvant) {
        log.push(
          `${nextKey} : Titan ${occupantTitanId} coincé, il ne peut pas être repoussé → l'élément s'arrête en ${rowFromIndex(r)}${c}.`
        );
        break; // reste sur la case actuelle (r, c)
      }

      occupant.cell = caseApres;
      if (ctx.bagarreSet) ctx.bagarreSet.add(occupantTitanId); // FAQ #12 : Titan distinct DÉPLACÉ en chaîne
      log.push(
        `${nextKey} : réaction en chaîne — Titan ${occupantTitanId} repoussé vers ${occupant.cell} (énergie transmise ${remainingAfterArrival}).`
      );

      // Même précaution que pour le bloc transmis : la chaîne a pu ramener
      // un TROISIÈME Titan sur la case que l'occupant vient de libérer.
      if (caseOccupeeParUnAutreTitan(nextKey)) {
        break; // reste sur la case actuelle (r, c)
      }

      avancerVers(nr, nc);
      remaining = 0; // l'élément arrivant prend la place libérée
      break;
    }

    /* ── UN DÉBRIS QUI EN RENCONTRE UN AUTRE FORME UN TAS ──
       Ruling Nikola du 2026-08-18 : « lorsqu'un débris rencontre un autre
       débris, ça forme un tas de débris, et non pas ça le pousse. »

       C'est le tableau des combinaisons du livret V36.2, qui ne connaît que
       deux résultats pour deux blocs sur une case : Bloc + Bloc → Amas, et
       Bloc + Amas → Amas. La transmission d'énergie que le moteur appliquait
       ici — le débris arrivant chassait celui qui dormait, avec l'énergie
       restante — n'y figure nulle part : elle ne vaut que pour l'élément
       FRAPPÉ par une carte, pas pour ceux qu'une projection croise en
       chemin. Elle produisait des réactions en chaîne que personne ne
       pouvait anticiper à la table, un seul débris cassé pouvant redistribuer
       la moitié d'une rangée.

       Le TITAN en vol, lui, garde la poussée : le livret est explicite
       (« dès qu'un élément arrive sur une case occupée, il projette les
       éléments présents »), et un Titan a la masse pour ça — c'est même par
       là qu'il se fraie un chemin. La différence de traitement est voulue et
       tient en une phrase : le béton s'empile, le Titan bouscule. */
    const elementEstUnDebris = ctx.movingTitanId == null;
    if (stack && stack.length > 0 && (elementEstUnDebris || stack.length >= 2 || remainingAfterArrival <= 1)) {
      // Formation d'Amas : l'élément se pose sur ce qui est déjà là.
      avancerVers(nr, nc);
      remaining = 0;
      break;
    }

    // Seul cas restant : un TITAN en vol, un seul débris sur la case, et
    // assez d'énergie pour le pousser. Tout le reste s'est empilé au-dessus.
    if (stack && stack.length === 1) {
      const pushedColor = stack.pop();
      retirerPileVide(looseBlocks, nextKey);
      // Un bloc est transmis, pas un Titan : même raison qu'au ricochet.
      const pushed = projectInDirection(rowFromIndex(nr), nc, curDr, curDc, remainingAfterArrival, { ...ctx, movingTitanId: null, enChaine });
      const pushedKey = pushed.row + pushed.col;
      if (!looseBlocks[pushedKey]) looseBlocks[pushedKey] = [];
      looseBlocks[pushedKey].push(pushedColor);
      log.push(
        `${nextKey} : réaction en chaîne — bloc ${pushedColor} transmis vers ${pushedKey} (énergie ${remainingAfterArrival}).`
      );

      // La récursion ci-dessus a pu DÉPLACER UN TITAN sur la case que
      // l'élément s'apprête à occuper : le bloc poussé percute un Titan
      // plus loin, celui-ci rebondit et retombe précisément ici. Cas
      // observé en simulation, Manche 1 : le bloc de B2 est poussé vers
      // A1, y percute le Titan 2 qui rebondit et atterrit en B2, et le
      // Titan 4 arrivant prenait quand même B2.
      // La carte des occupants ayant été figée AVANT la récursion, elle ne
      // peut pas voir ce déplacement : il faut donc revérifier la case au
      // moment de s'y poser, et non se fier au relevé initial.
      if (caseOccupeeParUnAutreTitan(nextKey)) {
        break; // reste sur la case actuelle (r, c)
      }

      avancerVers(nr, nc);
      remaining = 0;
      break;
    }

    // (L'amas déjà en place — deux débris ou plus — est traité plus haut avec
    // la Formation d'Amas. Pas de Patatras automatique ici : c'est une
    // mécanique de carte à part, au Seuil 4.)

    // Case libre : on avance normalement.
    avancerVers(nr, nc);
    sortieDeFaille = null; // l'élément a repris sa route de ce côté-ci
    remaining -= 1;
  }

  /* ── ARRÊT JUSTE APRÈS UNE FAILLE ──
     L'élément a franchi la faille puis s'est immobilisé sans avoir pu
     avancer : un mur, un Titan coincé, un amas. `r/c` pointe alors encore
     sur sa case d'AVANT la faille, à l'autre bout du plateau — c'est ce qui
     faisait « finir » le bloc de G9 sur I9.
     Ruling Nikola : il prend la place si la case se libère, sinon il
     s'arrête sur une case adjacente à celle-ci. On le repose donc contre
     la case de sortie, du bon côté du plateau. */
  if (sortieDeFaille && rowFromIndex(r) + c !== sortieDeFaille) {
    const sr = rowIndex(sortieDeFaille[0]);
    const sc = Number(sortieDeFaille.slice(1));
    const libre = (cle) => {
      const b = board[cle];
      if (b && b.blocks && b.blocks.length > 0) return false;
      if (ctx.movingTitanId != null && caseOccupeeParUnAutreTitan(cle)) return false;
      return true;
    };
    let chute = libre(sortieDeFaille) ? sortieDeFaille : null;
    for (let dr2 = -1; dr2 <= 1 && !chute; dr2++) {
      for (let dc2 = -1; dc2 <= 1 && !chute; dc2++) {
        if (dr2 === 0 && dc2 === 0) continue;
        const nr2 = sr + dr2, nc2 = sc + dc2;
        if (nr2 < 0 || nr2 > 8 || nc2 < 1 || nc2 > 9) continue;
        const cle = rowFromIndex(nr2) + nc2;
        if (libre(cle)) chute = cle;
      }
    }
    if (chute) {
      log.push(`${sortieDeFaille} : sortie de faille bloquée → l'élément s'arrête en ${chute}.`);
      r = rowIndex(chute[0]);
      c = Number(chute.slice(1));
    }
  }

  // ── GARANTIE DE SORTIE ──
  // Les garde-fous posés dans les branches ci-dessus vérifient la case
  // SUIVANTE avant de s'y poser. Ils ne peuvent rien contre le cas inverse,
  // observé en simulation : une récursion déclenchée en cours de vol
  // ramène un Titan sur la case où l'élément est DÉJÀ arrêté. Exemple
  // réel — un ricochet au Seuil 4 casse un bloc et le projette plus loin ;
  // ce bloc percute un Titan qui recule et atterrit précisément sur la
  // case où l'élément venait de s'immobiliser.
  //
  // Plutôt que d'ajouter un garde-fou par branche (il en manquera toujours
  // un), on vérifie ici, une bonne fois, que la case d'arrivée est libre.
  // Sinon on remonte le chemin réellement emprunté jusqu'à la première
  // case libre — d'où la trace `chemin`, la trajectoire pouvant rebondir
  // et traverser la faille, donc être impossible à reconstituer après coup.
  //
  // Réservé aux TITANS en mouvement : un débris, lui, a parfaitement le
  // droit de reposer sur la case d'un Titan — c'est même exactement ce que
  // décrit l'immunité de l'initiateur (« il s'arrête immédiatement
  // dessus »). Seule la superposition Titan + Titan est interdite.
  if (ctx.movingTitanId != null && caseOccupeeParUnAutreTitan(rowFromIndex(r) + c)) {
    for (let i = chemin.length - 2; i >= 0; i--) {
      if (!caseOccupeeParUnAutreTitan(chemin[i])) {
        const cle = chemin[i];
        log.push(
          `${rowFromIndex(r)}${c} : case occupée entre-temps par un autre Titan → l'élément recule en ${cle}.`
        );
        r = rowIndex(cle[0]);
        c = Number(cle.slice(1));
        break;
      }
    }
  }

  /* ── UN ÉLÉMENT NE SE POSE JAMAIS SUR UN BÂTIMENT DEBOUT ──
     Règle rappelée par Nikola en test réel le 2026-08-15 : « un débris sur
     un bâtiment c'est impossible, il ne peut jamais y avoir un débris sur
     un bâtiment ».

     La trajectoire, elle, ne peut pas entrer sur un mur : la branche
     `isWall` s'arrête toujours avant. Le seul cas restant est celui où
     l'élément n'a PAS BOUGÉ du tout et reste sur sa case de départ — et
     cette case est justement le bâtiment dont on vient de casser un bloc,
     s'il lui en reste. C'est ainsi qu'un débris finissait posé sur un
     bâtiment encore debout.

     On remonte donc le chemin parcouru, et à défaut on cherche une case
     voisine sans bâtiment. Contrairement au garde-fou Titan ci-dessus, la
     présence d'un Titan n'est pas un obstacle : un débris a parfaitement le
     droit de reposer sur la case d'un Titan. */
  const batimentDebout = (cle) => {
    const b = board[cle];
    return !!(b && b.blocks && b.blocks.length > 0);
  };
  if (batimentDebout(rowFromIndex(r) + c)) {
    let repli = null;
    for (let i = chemin.length - 2; i >= 0; i--) {
      if (!batimentDebout(chemin[i])) { repli = chemin[i]; break; }
    }
    if (!repli) {
      // Aucune case du trajet n'est libre (l'élément n'a jamais bougé) :
      // on le pose sur la première case voisine sans bâtiment.
      const r0 = r, c0 = c;
      for (let dr2 = -1; dr2 <= 1 && !repli; dr2++) {
        for (let dc2 = -1; dc2 <= 1 && !repli; dc2++) {
          if (dr2 === 0 && dc2 === 0) continue;
          const nr2 = r0 + dr2, nc2 = c0 + dc2;
          if (nr2 < 0 || nr2 > 8 || nc2 < 1 || nc2 > 9) continue;
          const cle = rowFromIndex(nr2) + nc2;
          if (!batimentDebout(cle)) repli = cle;
        }
      }
    }
    if (repli) {
      log.push(`${rowFromIndex(r)}${c} : bâtiment encore debout — l'élément ne peut pas s'y poser, il glisse en ${repli}.`);
      r = rowIndex(repli[0]);
      c = Number(repli.slice(1));
    }
  }

  /* `repliOptions` : les cases entre lesquelles le TITAN INITIATEUR peut
     choisir de poser l'élément arrêté faute de puissance. La case retournée
     (`row`/`col`) reste le choix par défaut — celle où l'élément s'est
     naturellement immobilisé — pour que tout appelant qui ignore ce champ
     garde exactement le comportement actuel. L'interface propose le choix
     quand il y a plus d'une case ; les arrêts survenus au fond d'une
     réaction en chaîne gardent le défaut, faute de pouvoir interroger le
     joueur au milieu d'une récursion. */
  const arrivee = rowFromIndex(r) + c;
  const repliOptions =
    choixRepli && choixRepli.cases.length > 1 && choixRepli.cases.includes(arrivee)
      ? { ...choixRepli, defaut: arrivee }
      : null;

  /* COLLECTE POUR L'INTERFACE.
     `ctx.replis` est un tableau partagé, transmis tel quel aux appels
     récursifs par le `{ ...ctx }` des réactions en chaîne : un ricochet ou
     une poussée en cascade y dépose donc son propre choix, au même titre que
     l'élément projeté au premier plan. C'est le même mécanisme que `log` et
     `bagarreSet`, déjà partagés de cette façon.

     `titanId` dit QUOI déplacer quand le joueur aura tranché : un Titan
     nommément, ou — à null — le débris qui vient de se poser sur la case par
     défaut. Les résolveurs empilent ce débris juste après le retour de cette
     fonction, il est donc au sommet de la pile au moment où le choix se
     résout. */
  if (repliOptions && Array.isArray(ctx.replis)) {
    ctx.replis.push({
      titanId: ctx.movingTitanId ?? null,
      defaut: arrivee,
      cases: repliOptions.cases,
      cible: repliOptions.cible,
      initiatorId: ctx.initiatorId ?? null,
    });
  }

  return { row: rowFromIndex(r), col: c, energyLeft: remaining, hasBounced, log, repliOptions };
}



/* ============================================================
   PERCUSSION DE TOUT CASSER — relevé unique
   ============================================================
   Bug trouvé au scan du 2026-08-15. `resolveToutCasser` enchaîne quatre
   sous-résolveurs (Bâtiments, Blocs, Titans, Amas) et chacun recalculait
   l'énergie de son côté. Or le premier a déjà cassé des blocs : un
   bâtiment qui n'avait qu'un étage n'occupe plus sa case, et l'énergie
   s'effondre pour les trois suivants. La même carte rendait deux verdicts
   contradictoires — RAGE au sous-cas Titans si on le jouait seul, DIL une
   fois les bâtiments traités avant lui.

   Le livret est clair : l'énergie est celle du MOMENT DE LA PERCUSSION.
   Une carte, une valeur. Ce relevé la fige, avec la liste des cibles
   telles qu'elles se présentaient à cet instant.

   Même raison pour les débris : les blocs cassés par le sous-cas Bâtiments
   atterrissent parfois dans le Périmètre, et le sous-cas Blocs les
   reprojetait aussitôt — un même débris déplacé deux fois par une seule
   carte, puis éventuellement écroulé par le sous-cas Amas alors que la
   pile venait tout juste de se former. Les cases éligibles sont donc
   relevées avant la première casse.
============================================================ */
function releverPercussion(titanId, gameState, adrenalineBonus = 0) {
  // `replis` n'est pas relevé ici : cette fonction ne fait que LISTER les
  // cibles, elle ne projette rien. Ce sont les sous-résolveurs appelés
  // ensuite qui déposent leurs replis dans le collecteur partagé.
  const { board, titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const perimeter = getPerimeter(titan.cell[0], Number(titan.cell.slice(1)));
  const titansByCell = indexerTitans(titans);
  const energie = computeEnergyToutCasser(perimeter, board, titansByCell, adrenalineBonus);
  const blocs = new Set();
  const amas = new Set();
  for (const cell of perimeter) {
    if (cell.isSelf) continue;
    const key = cell.row + cell.col;
    const pile = looseBlocks[key];
    if (pile && pile.length >= 1) blocs.add(key);
    if (pile && pile.length >= 2) amas.add(key);
  }
  return { energie, seuil4: energie >= SEUIL_4, blocs, amas };
}

function resolveToutCasserBatiments(titanId, gameState, adrenalineBonus = 0, percussion = null) {
  const { board, titans, looseBlocks, replis } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titanRow = titan.cell[0];
  const titanCol = Number(titan.cell.slice(1));
  const perimeter = getPerimeter(titanRow, titanCol);
  const releve = percussion || releverPercussion(titanId, gameState, adrenalineBonus);
  const energie = releve.energie;
  const seuil4 = releve.seuil4;

  const log = [];
  if (!seuil4) {
    log.push(`Énergie ${energie} < Seuil 4 — aucun effet sur les bâtiments (confirmé Nikola).`);
    return { energie, seuil4, log };
  }

  for (const cell of perimeter) {
    if (cell.isSelf) continue;
    const key = cell.row + cell.col;
    const bldg = board[key];
    if (!bldg || bldg.blocks.length === 0) continue;

    const broken = bldg.blocks.pop();
    titan.destruction += 1;
    const dr = rowIndex(cell.row) - rowIndex(titanRow);
    const dc = cell.col - titanCol;
    const landing = projectInDirection(cell.row, cell.col, dr, dc, energie, { board, looseBlocks, titans, log, replis, initiatorId: titanId });
    const landingKey = landing.row + landing.col;

    // Le bloc atterrit réellement sur le plateau. Chaînes de réaction
    // gérées par projectInDirection (Bâtiment=mur en plein vol, Titan/Bloc
    // rencontré = point d'arrêt + poussée en chaîne).
    if (!looseBlocks[landingKey]) looseBlocks[landingKey] = [];
    looseBlocks[landingKey].push(broken);

    log.push(
      `${key} : bloc ${broken} cassé (+1 Destruction, Titan ${titanId} → ${titan.destruction}) · projeté et posé en ${landingKey}` +
        (landing.hasBounced ? " (après rebond)" : "")
    );

    if (bldg.blocks.length === 0) {
      releaseSocle(key, board, looseBlocks);
      log.push(`${key} : bâtiment détruit → Socle (${bldg.socle}) libéré au sol (ramassable comme un Bloc de béton, FAQ #9).`);
    }
  }

  return { energie, seuil4, log };
}

function resolveToutCasserBlocs(titanId, gameState, adrenalineBonus = 0, percussion = null) {
  // Sous-cas "Bloc de béton" — matrice : cond. vide = s'applique quel que
  // soit le niveau d'énergie (contrairement au Bâtiment qui exige Seuil 4).
  const { board, titans, looseBlocks, replis } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titanRow = titan.cell[0];
  const titanCol = Number(titan.cell.slice(1));
  const perimeter = getPerimeter(titanRow, titanCol);
  const releve = percussion || releverPercussion(titanId, gameState, adrenalineBonus);
  const energie = releve.energie;

  const log = [];
  for (const cell of perimeter) {
    if (cell.isSelf) continue;
    const key = cell.row + cell.col;
    // Seules les cases qui portaient déjà un débris À LA PERCUSSION sont
    // concernées : un bloc tombé pendant la résolution de cette même carte
    // ne se fait pas reprojeter dans la foulée.
    if (!releve.blocs.has(key)) continue;
    const stack = looseBlocks[key];
    if (!stack || stack.length === 0) continue;

    const projected = stack.pop(); // le bloc du dessus de la pile libre
    retirerPileVide(looseBlocks, key);
    const dr = rowIndex(cell.row) - rowIndex(titanRow);
    const dc = cell.col - titanCol;
    const landing = projectInDirection(cell.row, cell.col, dr, dc, energie, { board, looseBlocks, titans, log, replis, initiatorId: titanId });
    const landingKey = landing.row + landing.col;

    if (!looseBlocks[landingKey]) looseBlocks[landingKey] = [];
    looseBlocks[landingKey].push(projected);

    log.push(
      `${key} : bloc libre ${projected} projeté et posé en ${landingKey}` +
        (landing.hasBounced ? " (après rebond)" : "")
    );
  }
  return { energie, log };
}

function resolveToutCasserTitans(titanId, gameState, adrenalineBonus = 0, percussion = null) {
  // Sous-cas "Titan" — déplacement physique + résolution DIL/RAGE via le
  // moteur générique de décision (§1bis du tracker).
  const { board, titans, looseBlocks, replis } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titanRow = titan.cell[0];
  const titanCol = Number(titan.cell.slice(1));
  const perimeter = getPerimeter(titanRow, titanCol);
  const titansByCell = indexerTitans(titans);
  const releve = percussion || releverPercussion(titanId, gameState, adrenalineBonus);
  const energie = releve.energie;
  const seuil4 = releve.seuil4;

  const log = [];
  const decisions = [];
  const bagarreSet = new Set(); // FAQ #12 : Titans distincts déplacés (direct + chaîne), 1 seul +1 Bagarre chacun
  for (const cell of perimeter) {
    if (cell.isSelf) continue;
    const key = cell.row + cell.col;
    const targetId = titansByCell[key];
    if (!targetId || targetId === titanId) continue;
    const target = titans.find((t) => t.id === targetId);

    const dr = rowIndex(cell.row) - rowIndex(titanRow);
    const dc = cell.col - titanCol;
    // movingTitanId : c'est la cible qu'on projette (cf. projectInDirection).
    const caseAvant = target.cell;
    const landing = projectInDirection(cell.row, cell.col, dr, dc, energie, { board, looseBlocks, titans, log, replis, bagarreSet, initiatorId: titanId, movingTitanId: targetId });
    target.cell = landing.row + landing.col; // mutation directe (re-render forcé côté UI)
    // Ruling Nikola (2026-08-15) : « si je fais une bagarre mais ne la
    // remporte pas, je n'ai pas de point de Bagarre. » Une cible coincée
    // (trajectoire bloquée des deux côtés) reste sur sa case : la Bagarre
    // n'est pas remportée, elle ne rapporte rien. Cohérent avec la FAQ #12,
    // qui parle de Titans distincts DÉPLACÉS.
    if (target.cell !== caseAvant) bagarreSet.add(targetId);

    if (seuil4) {
      if (canRage(targetId, gameState)) {
        decisions.push(makeDecisionRequest("RAGE", titanId, targetId, "Tout Casser", caseAvant));
      } else {
        log.push(`${key} : RAGE sans effet sur Titan ${targetId} (aucune ressource à prendre).`);
      }
    } else if (canDil(targetId, gameState)) {
      decisions.push(makeDecisionRequest("DIL", titanId, targetId, "Tout Casser", caseAvant));
    } else {
      log.push(`${key} : DIL impossible sur Titan ${targetId} (< 2 couleurs différentes en Repaire).`);
    }

    const mode = seuil4 ? "RAGE" : "DIL";
    log.push(
      `${key} : Titan ${targetId} touché (${mode}) → déplacé en ${target.cell}` +
        (landing.hasBounced ? " (après rebond)" : "")
    );
  }
  if (bagarreSet.size > 0) {
    titan.bagarre += bagarreSet.size;
    log.push(`+${bagarreSet.size} Bagarre (Titan ${titanId} → ${titan.bagarre}) — ${bagarreSet.size} Titan(s) distinct(s) déplacé(s) (direct + chaîne, FAQ #12).`);
  }
  return { energie, seuil4, log, decisions };
}

function resolveToutCasserAmas(titanId, gameState, adrenalineBonus = 0, percussion = null) {
  // Sous-cas "Amas de béton" (Patatras) — Seuil 4 requis.
  // Amas = 2+ blocs libres empilés sur une même case (jamais un bâtiment,
  // confirmé Nikola). Éjection du haut vers le bas, direction opposée à
  // la percussion (= même direction radiale que les autres sous-cas),
  // distance = hauteur du bloc dans la pile (pas l'énergie de la carte).
  const { board, titans, looseBlocks, replis } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titanRow = titan.cell[0];
  const titanCol = Number(titan.cell.slice(1));
  const perimeter = getPerimeter(titanRow, titanCol);
  const releve = percussion || releverPercussion(titanId, gameState, adrenalineBonus);
  const energie = releve.energie;
  const seuil4 = releve.seuil4;

  const log = [];
  if (!seuil4) {
    log.push(`Énergie ${energie} < Seuil 4 — aucun Patatras déclenché.`);
    return { energie, seuil4, log };
  }

  for (const cell of perimeter) {
    if (cell.isSelf) continue;
    const key = cell.row + cell.col;
    // Comme pour le sous-cas Blocs : seuls les Amas déjà constitués à la
    // percussion s'écroulent, pas ceux que cette carte vient d'empiler.
    if (!releve.amas.has(key)) continue;
    const stack = looseBlocks[key];
    if (!stack || stack.length < 2) continue; // pas d'Amas (2 blocs minimum)

    const dr = rowIndex(cell.row) - rowIndex(titanRow);
    const dc = cell.col - titanCol;
    const ejected = [...stack]; // bas (index 0) → sommet (dernier index)
    delete looseBlocks[key]; // Amas consommé par l'écroulement

    for (let i = ejected.length - 1; i >= 0; i--) {
      const blockColor = ejected[i];
      const hauteur = i + 1; // position dans la pile = hauteur = distance de projection
      const landing = projectInDirection(cell.row, cell.col, dr, dc, hauteur, { board, looseBlocks, titans, log, replis, initiatorId: titanId });
      const landingKey = landing.row + landing.col;
      if (!looseBlocks[landingKey]) looseBlocks[landingKey] = [];
      looseBlocks[landingKey].push(blockColor);
      log.push(
        `${key} : Patatras — bloc ${blockColor} (hauteur ${hauteur}) éjecté vers ${landingKey}` +
          (landing.hasBounced ? " (après rebond)" : "")
      );
    }
  }
  return { energie, seuil4, log };
}

function resolveToutCasser(titanId, gameState, adrenalineBonus = 0) {
  // Enchaîne les 4 sous-cas de la carte 01 · Tout Casser, tous alimentés par
  // le MÊME relevé de percussion (cf. releverPercussion) : une carte, une
  // énergie, une liste de cibles.
  const percussion = releverPercussion(titanId, gameState, adrenalineBonus);
  const r1 = resolveToutCasserBatiments(titanId, gameState, adrenalineBonus, percussion);
  const r2 = resolveToutCasserBlocs(titanId, gameState, adrenalineBonus, percussion);
  const r3 = resolveToutCasserTitans(titanId, gameState, adrenalineBonus, percussion);
  const r4 = resolveToutCasserAmas(titanId, gameState, adrenalineBonus, percussion);
  return {
    energie: percussion.energie,
    seuil4: percussion.seuil4,
    log: [...r1.log, ...r2.log, ...r3.log, ...r4.log],
    decisions: [...(r3.decisions || [])],
  };
}

/* ============================================================
   Moteur générique Énergie-par-distance (brique 5, réutilisable)
   ============================================================
   Confirmé Nikola : Énergie(distance) = portée annoncée de la carte
   + Adrénaline dépensée − (distance − 1). La dégression ne mord qu'à
   partir de la 2e case (la 1ère case adjacente n'est pas dégressée).
   Tout Casser reste l'exception (AOE périmètre, pas de portée en ligne).
============================================================ */

function computeEnergieParDistance(portee, adrenalineUtilisee, distance) {
  // Bug trouvé au scan du 2026-08-15. Le paramètre était lu ici comme un
  // BOOLÉEN (`adrenalineUtilisee ? 1 : 0`), alors que les appelants le
  // passent comme un NOMBRE depuis que la mise multiple est autorisée :
  // resolveTeteEnAvant calcule sa portée avec `Number(useAdrenaline) || 0`.
  // Deux Adrénalines allongeaient donc bien la charge à 5 cases, mais
  // n'ajoutaient qu'un seul point d'énergie — le Titan arrivait au bout avec
  // 0, cassait un bloc et ne déclenchait jamais le Seuil 4. Il avait payé
  // 6 points de score final pour un coup plus faible qu'à une Adrénaline.
  // Même défaut sur Boing Boing, qui partage cette fonction.
  const base = portee + (Number(adrenalineUtilisee) || 0);
  return base - Math.max(0, distance - 1);
}

const PORTEE_TETE_EN_AVANT = 3;

function resolveTeteEnAvant(titanId, dr, dc, useAdrenaline, gameState) {
  // Rulings confirmés Nikola :
  // 1) Bâtiment touché mais pas totalement détruit → Titan s'arrête sur la
  //    case PRÉCÉDENTE (superposition Titan+Bâtiment interdite). Si le coup
  //    vide totalement le bâtiment → la case devient un couloir (règle mise
  //    en place) → le Titan avance dessus.
  // 2) Amas de béton SANS Seuil 4 → trop massif, bloque le Titan comme un
  //    mur (aucun effet, arrêt case précédente). Seuil 4 → Patatras, balayé,
  //    le Titan avance sur la case libérée.
  // 3) Titan adverse touché → "ça fait les 2" : effet Repaire (DIL/RAGE) ET
  //    arrêt physique (superposition Titan+Titan interdite), résolu via le
  //    moteur générique de décision (§1bis).
  const { board, titans, looseBlocks, replis } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titansByCell = indexerTitans(titans);

  const startRowIdx = rowIndex(titan.cell[0]);
  const startCol = Number(titan.cell.slice(1));
  // Livret : « +1 par Adrenaline depensee ». Le parametre accepte donc un
  // nombre, pas seulement un booleen — un Titan qui dispose de plusieurs
  // Adrenalines peut toutes les investir sur la meme charge. Number(true)
  // vaut 1, l'ancien appel booleen reste donc valide.
  const maxRange = PORTEE_TETE_EN_AVANT + (Number(useAdrenaline) || 0);
  const log = [];
  const decisions = [];
  const bagarreSet = new Set(); // FAQ #12 : Titans distincts déplacés (direct + chaîne)
  let lastFreeCell = titan.cell;
  let stopped = false;

  for (let distance = 1; distance <= maxRange && !stopped; distance++) {
    const rIdx = startRowIdx + dr * distance;
    const cIdx = startCol + dc * distance;
    if (rIdx < 0 || rIdx > 8 || cIdx < 1 || cIdx > 9) {
      log.push("Bord de plateau atteint — arrêt.");
      break;
    }
    const row = rowFromIndex(rIdx);
    const key = row + cIdx;
    const energie = computeEnergieParDistance(PORTEE_TETE_EN_AVANT, useAdrenaline, distance);
    const seuil4 = energie >= 4;

    const bldg = board[key];
    const hasBuilding = bldg && bldg.blocks.length > 0;
    const stack = looseBlocks[key];
    const hasAmas = stack && stack.length >= 2;
    const hasSingleBlock = stack && stack.length === 1;
    const occupantId = titansByCell[key];

    if (hasBuilding) {
      const broken = bldg.blocks.pop();
      titan.repaire.push(broken);
      titan.destruction += 1;
      log.push(`${key} : bâtiment touché (énergie ${energie}) → bloc ${broken} en Repaire (+1 Destruction, Titan ${titanId} → ${titan.destruction}).`);

      if (seuil4 && bldg.blocks.length > 0) {
        const below = bldg.blocks.pop();
        const landing = projectInDirection(row, cIdx, -dr, -dc, energie, { board, looseBlocks, titans, log, replis, initiatorId: titanId });
        const landingKey = landing.row + landing.col;
        if (!looseBlocks[landingKey]) looseBlocks[landingKey] = [];
        looseBlocks[landingKey].push(below);
        log.push(
          `${key} : Seuil 4 → bloc du dessous ${below} projeté (direction opposée) vers ${landingKey}` +
            (landing.hasBounced ? " (après rebond)" : "")
        );
      }

      if (bldg.blocks.length === 0) {
        releaseSocle(key, board, looseBlocks);
        titan.cell = key;
        log.push(`${key} : bâtiment totalement détruit → devient un couloir, Socle (${bldg.socle}) libéré (ramassable comme un Bloc de béton). Titan avance jusque-là.`);
      } else {
        titan.cell = lastFreeCell;
        log.push(`Titan ${titanId} s'arrête en ${lastFreeCell} (bâtiment encore debout).`);
      }
      stopped = true;
      break;
    }

    // ⚠️ ORDRE DES TESTS : le Titan occupant DOIT être testé avant l'Amas et
    // le bloc isolé. Bug trouvé par le diagnostic : l'ancien ordre
    // (Amas/Bloc d'abord) faisait qu'une case portant À LA FOIS un Titan ET
    // un débris était traitée comme un simple ramassage — l'attaquant
    // encaissait le bloc et se posait sur la case sans jamais pousser
    // l'occupant, d'où deux Titans superposés.
    // Exactement le même défaut que celui déjà corrigé dans
    // resolveBoingBoing (voir le commentaire de ce résolveur) : la
    // correction n'y avait pas été portée. Le bâtiment, lui, reste testé en
    // premier — aucun Titan ne peut se tenir sur un bâtiment debout.
    if (occupantId && occupantId !== titanId) {
      const mode = seuil4 ? "RAGE" : "DIL";
      if (seuil4) {
        if (canRage(occupantId, gameState)) {
          decisions.push(makeDecisionRequest("RAGE", titanId, occupantId, "Tête en Avant", key));
        } else {
          log.push(`${key} : RAGE sans effet sur Titan ${occupantId} (aucune ressource à prendre).`);
        }
      } else if (canDil(occupantId, gameState)) {
        decisions.push(makeDecisionRequest("DIL", titanId, occupantId, "Tête en Avant", key));
      } else {
        log.push(`${key} : DIL impossible sur Titan ${occupantId} (< 2 couleurs différentes en Repaire).`);
      }
      log.push(`${key} : Titan ${occupantId} percuté (${mode}, énergie ${energie}).`);
      // Ruling Nikola (2026-08-15) : une bagarre qui n'est pas remportée ne
      // rapporte pas de point. Le crédit était donné ici INCONDITIONNELLEMENT,
      // avant même de savoir si la cible allait bouger — et même en dessous
      // du Seuil 4, où aucune projection n'a lieu du tout.
      if (seuil4) {
        const occupant = titans.find((t) => t.id === occupantId);
        const caseAvant = occupant.cell;
        // movingTitanId : c'est l'occupant qu'on projette (cf. projectInDirection).
        const landing = projectInDirection(row, cIdx, dr, dc, energie, { board, looseBlocks, titans, log, replis, bagarreSet, initiatorId: titanId, movingTitanId: occupantId });
        // Un Titan éjecté a déjà sa case de rentrée posée par le résolveur :
        // on ne la réécrit pas, et sa sortie du ring compte évidemment
        // comme une Bagarre remportée.
        if (!landing.ejecte) occupant.cell = landing.row + landing.col;
        if (occupant.cell !== caseAvant || landing.ejecte) bagarreSet.add(occupantId);
        log.push(`${key} : Titan ${occupantId} projeté vers ${occupant.cell}` + (landing.hasBounced ? " (après rebond)" : ""));
      }

      // Bug remonte : deux Titans se retrouvaient sur la meme case (T1 et T4
      // tous deux en H6). La cible projetee peut rebondir sur un mur et
      // revenir exactement sur la case ou l'attaquant allait s'arreter, ou
      // rester sur place quand sa trajectoire est bloquee. La superposition
      // Titan + Titan etant interdite par le livret, l'attaquant recule
      // jusqu'a la premiere case libre de son propre chemin.
      const occupees = new Set(titans.filter((t) => t.id !== titanId).map((t) => t.cell));
      let arrivee = lastFreeCell;
      if (occupees.has(arrivee)) {
        // Remonte le chemin parcouru, de la plus avancee vers le depart.
        const chemin = [];
        for (let d = distance - 1; d >= 0; d--) {
          const r = startRowIdx + dr * d;
          const c = startCol + dc * d;
          if (r < 0 || r > 8 || c < 1 || c > 9) continue;
          chemin.push(rowFromIndex(r) + c);
        }
        arrivee = chemin.find((cell) => !occupees.has(cell)) ?? titan.cell;
        log.push(`${lastFreeCell} occupée par un Titan — Titan ${titanId} recule en ${arrivee}.`);
      }
      titan.cell = arrivee;
      log.push(`Titan ${titanId} s'arrête en ${arrivee} (collision avec Titan ${occupantId}).`);
      stopped = true;
      break;
    }

    // La case est libre de tout Titan à partir d'ici : Amas et bloc isolé
    // peuvent être traités sans risque de superposition.
    if (hasAmas) {
      if (seuil4) {
        const ejected = [...stack];
        delete looseBlocks[key];
        for (let i = ejected.length - 1; i >= 0; i--) {
          const blockColor = ejected[i];
          const hauteur = i + 1;
          const landing = projectInDirection(row, cIdx, -dr, -dc, hauteur, { board, looseBlocks, titans, log, replis, initiatorId: titanId });
          const landingKey = landing.row + landing.col;
          if (!looseBlocks[landingKey]) looseBlocks[landingKey] = [];
          looseBlocks[landingKey].push(blockColor);
          log.push(
            `${key} : Patatras — bloc ${blockColor} (hauteur ${hauteur}) éjecté vers ${landingKey}` +
              (landing.hasBounced ? " (après rebond)" : "")
          );
        }
        titan.cell = key;
        log.push(`Titan ${titanId} avance jusqu'à ${key} (Amas balayé par le Patatras).`);
      } else {
        titan.cell = lastFreeCell;
        log.push(`${key} : Amas trop massif (énergie ${energie} < Seuil 4) → obstacle infranchissable. Titan ${titanId} s'arrête en ${lastFreeCell}.`);
      }
      stopped = true;
      break;
    }

    if (hasSingleBlock) {
      const picked = stack.pop();
      retirerPileVide(looseBlocks, key);
      titan.cell = key;
      if (isSocleMarker(picked)) {
        const val = socleValue(picked);
        titan.socles.push(val);
        log.push(`${key} : Socle libre (valeur ${val}) récupéré, Titan ${titanId} prend sa place.`);
      } else {
        titan.repaire.push(picked);
        log.push(`${key} : bloc libre ${picked} récupéré en Repaire, Titan ${titanId} prend sa place.`);
      }
      stopped = true;
      break;
    }

    lastFreeCell = key;
  }

  if (!stopped) {
    titan.cell = lastFreeCell;
    log.push(`Titan ${titanId} avance librement jusqu'à ${lastFreeCell} (aucun obstacle rencontré).`);
  }

  if (bagarreSet.size > 0) {
    titan.bagarre += bagarreSet.size;
    log.push(`+${bagarreSet.size} Bagarre (Titan ${titanId} → ${titan.bagarre}) — ${bagarreSet.size} Titan(s) distinct(s) déplacé(s) (direct + chaîne, FAQ #12).`);
  }

  return { log, decisions };
}

function resolveGraouhhh(titanId, dr, dc, mancheNumber, gameState) {
  // Carte 03 · Graouhhh (Force 2). Aucune Adrénaline dépensable.
  // Rulings confirmés Nikola :
  // - Distance de recul = (nombre de Titans touchés sur l'axe) + 1, uniforme
  // - Résolution du plus loin au plus proche (le plus éloigné bouge d'abord)
  // - 1 seul sens, depuis la case suivant le Titan initiateur jusqu'au bord
  const { board, titans, looseBlocks, replis } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titansByCell = indexerTitans(titans);

  const startRowIdx = rowIndex(titan.cell[0]);
  const startCol = Number(titan.cell.slice(1));
  const log = [];
  const touched = []; // ordre proche → loin pendant le scan

  for (let distance = 1; distance <= 9; distance++) {
    const rIdx = startRowIdx + dr * distance;
    const cIdx = startCol + dc * distance;
    if (rIdx < 0 || rIdx > 8 || cIdx < 1 || cIdx > 9) break; // bord de plateau

    const row = rowFromIndex(rIdx);
    const key = row + cIdx;
    const bldg = board[key];

    if (bldg && bldg.blocks.length > 0) {
      log.push(`${key} : bâtiment sur l'axe → mur, les Titans derrière sont protégés. Fin de l'axe.`);
      break;
    }

    const occupantId = titansByCell[key];
    if (occupantId && occupantId !== titanId) {
      touched.push({ id: occupantId, row, col: cIdx });
    }
  }

  if (touched.length === 0) {
    log.push("Aucun Titan touché sur cet axe.");
    return { log, titansTouches: [] };
  }

  const reculDistance = touched.length + 1;
  const decisions = [];
  const bagarreSet = new Set(); // FAQ #12 : Titans distincts déplacés (direct + chaîne)
  const fatiguedProgrammed = []; // Bug remonté : voir resolveFatigue plus bas
  for (let i = touched.length - 1; i >= 0; i--) {
    const t = touched[i];
    const occupant = titans.find((x) => x.id === t.id);
    // movingTitanId : c'est ce Titan-là qu'on projette, il ne doit pas se
    // voir lui-même comme un obstacle si sa trajectoire rebondit.
    const caseAvant = occupant.cell;
    /* ── LE DILEMME S'APPLIQUE AVANT LE RECUL ──
       Ruling Nikola du 2026-08-18 : « avant de déplacer le Titan du DIL, on
       applique le DIL, et ensuite on le déplace — comme ça le Titan
       attaquant peut bien récupérer la ressource avec son passif. »

       La demande est notée AVANT la projection, et elle emporte `caseAvant`,
       la case où la cible a encaissé le coup. C'est là que le bloc perdu
       tombe, donc dans le Périmètre de l'attaquant s'il touchait à côté —
       et non à l'autre bout de l'axe, là où le recul aura envoyé la cible.
       L'ordre du journal suit le même déroulé : d'abord ce que la cible
       perd, ensuite où elle atterrit. */
    const dilOk = canDil(t.id, gameState);
    if (dilOk) decisions.push(makeDecisionRequest("DIL", titanId, t.id, "Graouhhh", caseAvant));
    const landing = projectInDirection(t.row, t.col, dr, dc, reculDistance, { board, looseBlocks, titans, log, replis, bagarreSet, initiatorId: titanId, movingTitanId: t.id });
    if (!landing.ejecte) occupant.cell = landing.row + landing.col;
    // Ruling Nikola (2026-08-15) : pas de déplacement, pas de point de
    // Bagarre. Un Titan touché mais coincé contre un mur ne compte pas.
    if (occupant.cell !== caseAvant || landing.ejecte) bagarreSet.add(t.id);
    const fatigue = resolveFatigue(titanId, t.id, mancheNumber, titans);
    if (fatigue.ok && fatigue.fromProgrammed) fatiguedProgrammed.push(t.id);
    log.push(
      `Titan ${t.id} touché → ${fatigue.ok ? fatigue.log : `Fatigue impossible (${fatigue.reason})`} · ${dilOk ? "DIL en attente" : "DIL impossible (< 2 couleurs différentes en Repaire)"} · recule de ${reculDistance} case(s) → ${occupant.cell}` +
        (landing.hasBounced ? " (après rebond)" : "")
    );
  }

  if (bagarreSet.size > 0) {
    titan.bagarre += bagarreSet.size;
    log.push(`+${bagarreSet.size} Bagarre (Titan ${titanId} → ${titan.bagarre}) — ${bagarreSet.size} Titan(s) distinct(s) déplacé(s) (direct + chaîne, FAQ #12).`);
  }

  if (touched.length >= 2) {
    // FAQ #11 (livret V35, cas OUVERT). Ruling REVU le 2026-08-15 par Nikola :
    // le bonus devient CUMULATIF LINÉAIRE, +1 Adrénaline par Titan touché
    // au-delà du premier. 2 touchés → +1, 3 touchés → +2.
    // Aucun plafond à écrire : l'initiateur ne peut toucher que 3 autres
    // Titans au maximum (partie à 4 joueurs), donc le bonus culmine à +2.
    // Motif du changement : Graouhhh est sous-jouée en test, et aligner
    // 3 Titans avec une carte programmée une manche à l'avance est un coup
    // spectaculaire qui méritait d'être récompensé à hauteur de sa rareté.
    // Remplace le +1 fixe plafonné tranché le 2026-08-11.
    const bonusAdrenaline = touched.length - 1;
    titan.adrenaline = (titan.adrenaline || 0) + bonusAdrenaline;
    log.push(`Bonus : ${touched.length} Titans touchés (≥2) → +${bonusAdrenaline} Adrénaline (cumulatif, +1 par Titan au-delà du premier) — Titan ${titanId} stock ${titan.adrenaline}.`);
  }

  return { log, titansTouches: touched.map((t) => t.id), decisions, fatiguedProgrammed };
}

/* ============================================================
   Résolution carte 06 · JE NE PARTAGE PAS
   ============================================================
   Force 3. Aucune Adrénaline dépensable (déjà dans le livret).
   "Ramasse 2 blocs au choix dans ton Périmètre. Aucune condition sur la
   hauteur ou la couleur." + Lanterne Rouge : si le joueur actif a autant
   ou moins de blocs (Repaire, toutes couleurs) que le Titan le moins doté
   → 3 blocs au lieu de 2.

   ⚠️ HYPOTHÈSES à valider avec Nikola (non tranchées dans le livret) :
   1) Le pool de blocs éligibles = les blocs LIBRES au sol (looseBlocks)
      dans le Périmètre — même source que le passif Récupération — PAS les
      blocs encore empilés dans un Bâtiment (cette carte ne "casse" rien).
   2) Lanterne Rouge se calcule sur le total de blocs en Repaire (toutes
      couleurs confondues) du joueur actif comparé au Titan le moins doté,
      au moment précis où la carte est jouée.
============================================================ */

function isLanterneRouge(titanId, gameState) {
  const { titans } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const totals = titans.map((t) => t.repaire.length);
  const minTotal = Math.min(...totals);
  return titan.repaire.length <= minTotal;
}

function getJeNePartagePasPool(titanId, gameState) {
  // Cases du Périmètre contenant au moins 1 bloc libre, éligibles à la sélection.
  const { titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const perimeter = getPerimeter(titan.cell[0], Number(titan.cell.slice(1)));
  return perimeter
    .map((c) => c.row + c.col)
    .filter((key) => looseBlocks[key] && looseBlocks[key].length > 0);
}

function resolveJeNePartagePas(titanId, selectedCellKeys, gameState) {
  const { titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const log = [];

  const lanterneRouge = isLanterneRouge(titanId, gameState);
  const nbToPick = lanterneRouge ? 3 : 2;

  if (lanterneRouge) {
    log.push(`🏆 Lanterne Rouge active (Repaire ${titan.repaire.length} ≤ minimum) → 3 blocs au lieu de 2.`);
  }

  if (selectedCellKeys.length !== nbToPick) {
    log.push(`⚠️ Sélection invalide : ${selectedCellKeys.length} case(s) choisie(s), ${nbToPick} attendue(s).`);
    return { log, applied: false, decisions: [] };
  }

  const pool = new Set(getJeNePartagePasPool(titanId, gameState));
  for (const key of selectedCellKeys) {
    if (!pool.has(key)) {
      log.push(`⚠️ ${key} hors Périmètre ou sans bloc libre — sélection annulée.`);
      return { log, applied: false, decisions: [] };
    }
  }

  for (const key of selectedCellKeys) {
    const stack = looseBlocks[key];
    const picked = stack.pop();
    if (isSocleMarker(picked)) {
      const val = socleValue(picked);
      titan.socles.push(val);
      log.push(`${key} : Socle (valeur ${val}) ramassé (aucune Adrénaline dépensable sur cette action).`);
    } else {
      titan.repaire.push(picked);
      log.push(`${key} : bloc ${picked} ramassé (aucune Adrénaline dépensable sur cette action).`);
    }
    // Règle transversale (confirmée Nikola, session) : case libérée →
    // déplacement OBLIGATOIRE, même logique que le passif Récupération.
    // Traité case par case (1 par 1), dans l'ordre de sélection du
    // joueur : si plusieurs cases se libèrent d'affilée, le Titan finit
    // sur la DERNIÈRE case libérée traitée (chaque libération déplace le
    // Titan, la suivante écrase la précédente).
    if (stack.length === 0) {
      // Même helper que le passif Récupération : la règle est la même, elle
      // ne doit exister qu'à un seul endroit (cf. deplacerVersCaseLiberee).
      // Cette copie-ci ignorait la présence d'un autre Titan et provoquait
      // des superpositions, alors que la version Récupération avait déjà
      // été corrigée.
      deplacerVersCaseLiberee(titan, key, gameState, log);
      retirerPileVide(looseBlocks, key);
    }
  }

  return { log, applied: true, decisions: [] };
}

/* ============================================================
   Résolution carte 04 · BOING BOING
   ============================================================
   Force 2. "Destination au choix · 3 cases max · tous azimuts · obstacles
   ignorés." (+1 case max par Adrénaline, comme Tête en Avant — supposé,
   non explicite dans le livret).

   Rulings confirmés Nikola (session) :
   - Distance = n'importe quelle direction, pas limitée aux 8 axes droits
     → implémentée en distance de Chebyshev (roi aux échecs), cohérent
     avec "tous azimuts · obstacles ignorés" (on saute, on ne parcourt pas).
   - Titan cible déjà présent sur la case d'arrivée : c'est LUI qui subit
     Fatigue/DIL/Seuil4 ; l'initiateur prend sa place.
   - Bloc de béton sur la case d'arrivée : ramassé en Repaire, le Titan
     prend sa place (si la case est libre après ramassage).

   ✅ Ruling confirmé Nikola (session) :
   - Bâtiment (même partiel) sur la case d'arrivée = "saute-mouton" : le
     survol est autorisé (obstacle ignoré, comme tout le reste du trajet,
     cohérent avec "tous azimuts · obstacles ignorés"), mais on ne peut
     jamais ATTERRIR dessus → destination refusée si Bâtiment avec ≥1
     bloc. Le moteur ne vérifiait déjà que la case de DESTINATION (jamais
     le trajet), donc le comportement était déjà conforme à cette ruling
     avant même qu'elle soit énoncée — seul le message de log ci-dessous
     a été mis à jour pour refléter que ce n'est plus une hypothèse
     ouverte mais une règle confirmée.

   ⚠️ OUVERT (non tranché, à trancher avec Nikola) :
   - Distribution des blocs d'un Amas écroulé "au choix du joueur actif" :
     implémentée en répartition automatique round-robin sur les cases
     adjacentes (pas de vraie UI de choix pour l'instant).
   - "Valeur restante" pour la projection du Titan cible : traitée avec le
     même moteur Énergie-par-distance que Tête en Avant (portée 3), et la
     direction de projection = direction du saut normalisée (signe de
     dr/dc), puisque le saut n'est pas forcément un axe droit.
============================================================ */

const PORTEE_BOING_BOING = 3;

function chebyshevDistance(r1, c1, r2, c2) {
  return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
}

/* ============================================================
   BOING BOING — PORTÉE RÉELLE, RÈGLE DES ÉLÉMENTS CONTIGUS
   ============================================================
   Livret V36.2, encart de la carte 04 : « Destination au choix · 3 cases
   max · tous azimuts · obstacles ignorés. [Contigus] Éléments collés =
   1 seule case. »

   La seconde phrase n'était implémentée NULLE PART : le moteur comme
   l'interface se contentaient d'une distance de Chebyshev brute, donc un
   mur de trois bâtiments accolés coûtait 3 cases de saut au lieu d'1.
   C'est le défaut remonté par Nikola le 2026-08-17 (« le calcul de saut
   est mal fait avec l'histoire des obstacles contigus »).

   PÉRIMÈTRE DE LA RÈGLE (arbitrage Nikola du 2026-08-17) : « tout obstacle
   bloquant » — bâtiment encore debout, débris/amas/socle au sol, ET Titan.
   Un groupe de cases-obstacles adjacentes (voisinage de Moore, comme le
   reste du jeu) compte pour 1 seule case, quelle que soit sa longueur.

   MODÈLE DE COÛT. Parcours 0-1 BFS sur les 8 directions ; entrer sur une
   case coûte :
     · 0 si cette case ET la précédente sont toutes deux des obstacles
       (on est encore dans le même groupe collé) ;
     · 1 sinon.
   La case de départ n'est jamais traitée comme un obstacle, même si le
   Titan sauteur s'y trouve — sans quoi son propre pion collerait au
   premier mur voisin et offrirait un saut gratuit.

   Exemple validé avec Nikola, Titan en A1, portée 3 :
     A1[Titan] A2[bâtiment] A3[débris] A4[Titan] A5[ ] A6[ ]
   A2·A3·A4 forment un seul groupe collé → 1 case. A5 est donc à 2, A6 à 3,
   et A6 devient atteignable alors que Chebyshev l'excluait.

   RETOUR : Map cellule → distance, restreinte aux cases où l'on peut
   ATTERRIR. Un bâtiment encore debout est exclu (saute-mouton autorisé en
   vol, jamais d'arrêt dessus) ; une case portant un Titan reste incluse,
   c'est tout l'objet de la carte (DIL, projection, +1 Bagarre). */
function getBoingBoingReach(startCell, maxRange, { board, looseBlocks = {}, titans = [] }) {
  const titansByCell = indexerTitans(titans);
  const isObstacle = (key) => {
    const b = board[key];
    if (b && b.blocks.length > 0) return true;
    if ((looseBlocks[key] || []).length > 0) return true;
    return Boolean(titansByCell[key]);
  };
  const isStandingBuilding = (key) => {
    const b = board[key];
    return Boolean(b && b.blocks.length > 0);
  };

  const dist = new Map([[startCell, 0]]);
  // 0-1 BFS : les arêtes de coût 0 passent en tête de file, celles de
  // coût 1 en queue. Une simple file FIFO donnerait des distances fausses
  // dès qu'un groupe collé se traverse par plusieurs entrées.
  const deque = [startCell];
  while (deque.length > 0) {
    const cell = deque.shift();
    const d = dist.get(cell);
    if (d >= maxRange) continue;
    const r = rowIndex(cell[0]);
    const c = Number(cell.slice(1));
    // Le départ ne compte jamais comme obstacle (cf. commentaire ci-dessus).
    const fromObstacle = cell !== startCell && isObstacle(cell);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr > 8 || nc < 1 || nc > 9) continue;
        const key = rowFromIndex(nr) + nc;
        const cost = fromObstacle && isObstacle(key) ? 0 : 1;
        const nd = d + cost;
        if (nd > maxRange) continue;
        if (dist.has(key) && dist.get(key) <= nd) continue;
        dist.set(key, nd);
        if (cost === 0) deque.unshift(key); else deque.push(key);
      }
    }
  }

  const reach = new Map();
  dist.forEach((d, key) => {
    if (key === startCell || d === 0) return;
    if (isStandingBuilding(key)) return; // atterrissage interdit sur un bâtiment debout
    reach.set(key, d);
  });
  return reach;
}

function resolveBoingBoing(titanId, destKey, useAdrenaline, mancheNumber, gameState) {
  const { board, titans, looseBlocks, replis } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const originRowIdx = rowIndex(titan.cell[0]);
  const originCol = Number(titan.cell.slice(1));
  const destRow = destKey[0];
  const destRowIdx = rowIndex(destRow);
  const destCol = Number(destKey.slice(1));
  const log = [];

  // Meme regle que Tete en Avant : +1 case par Adrenaline depensee.
  const maxRange = PORTEE_BOING_BOING + (Number(useAdrenaline) || 0);

  const bldg = board[destKey];
  if (bldg && bldg.blocks.length > 0) {
    // Ruling confirmé Nikola (session) : un Bâtiment sert de "saute-mouton"
    // pour Boing Boing (obstacle ignoré en vol, cohérent avec "tous azimuts
    // · obstacles ignorés") — mais on ne peut jamais S'ARRÊTER dessus.
    log.push(`${destKey} : Bâtiment — saute-mouton autorisé en vol, mais atterrissage interdit dessus (confirmé Nikola). Destination refusée.`);
    return { log, applied: false, decisions: [] };
  }

  // Distance selon la règle « Éléments collés = 1 seule case » du livret,
  // et non plus une distance de Chebyshev brute (cf. getBoingBoingReach).
  const reach = getBoingBoingReach(titan.cell, maxRange, gameState);
  const distance = reach.get(destKey);
  if (distance === undefined) {
    log.push(`⚠️ Destination invalide (${destKey} hors de portée, max ${maxRange} en comptant les éléments contigus pour 1 case).`);
    return { log, applied: false, decisions: [] };
  }

  const titansByCell = indexerTitans(titans);
  const energie = computeEnergieParDistance(PORTEE_BOING_BOING, useAdrenaline, distance);
  const seuil4 = energie >= 4;

  const stack = looseBlocks[destKey];
  const occupantId = titansByCell[destKey];
  const decisions = [];
  let fatiguedProgrammed = []; // Bug remonté : voir resolveFatigue plus bas

  // Bug remonté (session) : l'ordre de test (Amas/Bloc AVANT Titan)
  // faisait qu'atterrir sur une case contenant À LA FOIS un Titan ET un
  // débris ramassait le débris automatiquement sans jamais pousser le
  // Titan occupant — on se retrouvait avec 2 Titans sur la même case
  // (interdit, cf. matrice de superposition du livret). Le Titan occupant
  // est désormais TOUJOURS prioritaire : il est poussé normalement, et le
  // débris éventuellement présent sur la case reste au sol, disponible
  // pour un "Ramasser" (passif Récupération) ultérieur — pas d'auto-pickup
  // dans ce cas précis.
  if (occupantId && occupantId !== titanId) {
    const target = titans.find((t) => t.id === occupantId);
    const dirR = Math.sign(destRowIdx - originRowIdx);
    const dirC = Math.sign(destCol - originCol);
    const bagarreSet = new Set([occupantId]); // FAQ #12 : Titans distincts déplacés (direct + chaîne)
    // movingTitanId : c'est l'occupant qu'on projette (cf. projectInDirection).
    const landing = projectInDirection(destRow, destCol, dirR, dirC, energie, { board, looseBlocks, titans, log, replis, bagarreSet, initiatorId: titanId, movingTitanId: occupantId });
    let landingKey = landing.row + landing.col;
    // Ruling confirmée Nikola (session) : si l'occupant est coincé (rebond
    // avant ET arrière tous deux bloqués par un mur/bord — projectInDirection
    // retourne alors sa case d'origine INCHANGÉE), il n'est ni collé au
    // Titan sauteur ni la destination refusée : il est éjecté sur une case
    // libre ADJACENTE à sa position, au choix de l'attaquant. Choix pas
    // encore relié à une UI dédiée (cas rare : occupant bloqué simultanément
    // dans les deux sens) — auto-sélection de la première case libre
    // trouvée en attendant, avec log explicite pour rester transparent sur
    // cette simplification.
    if (landingKey === destKey) {
      /* `titansByCell` a été relevé AVANT la projection : la réaction en
         chaîne a pu déplacer un Titan entre-temps, et proposer sa case comme
         « libre » y remettait un second Titan (graine 7086 en campagne).
         On réinterroge l'état réel, comme le fait projectInDirection depuis
         la correction du même défaut. */
      const freeAdj = getFreeAdjacentCells(destKey, board, indexerTitans(titans), looseBlocks);
      if (freeAdj.length > 0) {
        landingKey = freeAdj[0]; // TODO : choix explicite de l'attaquant (UI) — auto-pick en attendant
        log.push(`${destKey} : Titan ${occupantId} coincé (rebond avant/arrière bloqués) → éjecté sur case libre adjacente ${landingKey} (auto-sélection, choix attaquant à câbler en UI).`);
      } else {
        log.push(`${destKey} : Titan ${occupantId} totalement coincé (aucune case libre adjacente) — destination refusée.`);
        return { log, applied: false, decisions: [] };
      }
    }
    target.cell = landingKey;
    /* SEUIL 4 SUR BOING BOING = RAGE — ruling Nikola du 2026-08-17.
       Jusqu'ici le sous-cas Titan était TOUJOURS un DIL : le livret V36.2
       donne bien une ligne Seuil 4 à cette carte, mais son effet y était
       « Tombe sur la case », que le résolveur appliquait de toute façon
       en permanence. Le palier ne changeait donc rigoureusement rien.

       Il badge désormais une RAGE, et le bloc part directement dans le
       Repaire de l'attaquant (cf. DESTINATION_BLOC_PERDU).

       CE QUI ÉQUILIBRE CE RENFORCEMENT, et c'est l'argument de Nikola :
       l'énergie vaut `3 + Adrénaline − (distance − 1)`. Sans Adrénaline,
       le maximum atteignable est 3, sur une case adjacente — le Seuil 4
       est donc STRICTEMENT INACCESSIBLE gratuitement. Il faut au minimum
       1 Adrénaline, et le coût monte avec la portée : sauter sur un Titan
       à 2 cases en RAGE en demande 2, à 3 cases en demande 3. La carte ne
       devient forte que si on la paie. */
    const rageOk = seuil4 && canRage(occupantId, gameState);
    const dilOk = !seuil4 && canDil(occupantId, gameState);
    if (rageOk) decisions.push(makeDecisionRequest("RAGE", titanId, occupantId, "Boing Boing", destKey));
    else if (dilOk) decisions.push(makeDecisionRequest("DIL", titanId, occupantId, "Boing Boing", destKey));
    const fatigue = resolveFatigue(titanId, occupantId, mancheNumber, titans);
    fatiguedProgrammed = fatigue.ok && fatigue.fromProgrammed ? [occupantId] : [];
    titan.bagarre += bagarreSet.size;
    const verdict = seuil4
      ? (rageOk ? "RAGE en attente" : "RAGE sans effet (aucune ressource à prendre)")
      : (dilOk ? "DIL en attente" : "DIL impossible (< 2 couleurs différentes en Repaire)");
    log.push(
      `${destKey} : Titan ${occupantId} percuté (énergie ${energie}${seuil4 ? ", Seuil 4" : ""}) → ${fatigue.ok ? fatigue.log : `Fatigue impossible (${fatigue.reason})`} · ${verdict} · +${bagarreSet.size} Bagarre (Titan ${titanId} → ${titan.bagarre}, FAQ #12) · projeté vers ${target.cell}` +
        (landing.hasBounced ? " (après rebond)" : "")
    );
    titan.cell = destKey;
    log.push(`Titan ${titanId} prend la place de Titan ${occupantId} en ${destKey}.`);
    if (stack && stack.length > 0) {
      log.push(`${destKey} : ${stack.length} débris au sol laissé(s) en place — utilisable ensuite via "Ramasser" (passif Récupération).`);
    }
  } else if (stack && stack.length >= 2) {
    /* AMAS DE BÉTON → ÉCROULEMENT, AU CHOIX DU JOUEUR
       Ruling de Nikola du 2026-08-16. L'ancienne répartition automatique en
       round-robin est remplacée par un choix explicite, débris par débris.

       · Le joueur désigne UNE case par débris, parmi les 8 autour du tas.
       · Jamais sur un bâtiment debout : il n'y a pas de place au sol.
       · Une case portant un Titan adverse EST autorisée.
       · On n'empile que lorsqu'il ne reste plus aucune case sans débris.
       · Résolution SÉQUENTIELLE : chaque débris fait son effet avant qu'on
         passe au suivant. C'est ce qui rend impossible de cumuler deux
         débris sur le même Titan — il aura déjà bougé.
       · Un débris posé sur un Titan le pousse de la valeur du SAUT RESTANT
         (portée max moins distance sautée) et rapporte la Bagarre.

       Le résolveur ne distribue donc plus rien lui-même : il renvoie
       l'écroulement à traiter, que l'appelant résout via
       `resolveEcroulementAmas` une fois le joueur consulté. */
    titan.cell = destKey;
    const restant = Math.max(0, maxRange - distance);
    log.push(`Titan ${titanId} atterrit en ${destKey} — l'Amas s'écroule, ${stack.length} débris à répartir (énergie transmise ${restant}).`);
    return {
      log,
      applied: true,
      decisions,
      fatiguedProgrammed,
      ecroulement: {
        cellKey: destKey,
        blocs: [...stack].reverse(), // du sommet vers le bas
        energie: restant,
      },
    };
  } else if (stack && stack.length === 1) {
    const picked = stack.pop();
    retirerPileVide(looseBlocks, destKey);
    titan.cell = destKey;
    if (isSocleMarker(picked)) {
      const val = socleValue(picked);
      titan.socles.push(val);
      log.push(`${destKey} : Socle libre (valeur ${val}) ramassé, Titan ${titanId} prend sa place.`);
    } else {
      titan.repaire.push(picked);
      log.push(`${destKey} : bloc libre ${picked} ramassé en Repaire, Titan ${titanId} prend sa place.`);
    }
  } else {
    titan.cell = destKey;
    log.push(`Titan ${titanId} saute jusqu'à ${destKey} (case libre).`);
  }

  return { log, applied: true, decisions, fatiguedProgrammed };
}

/**
 * Cases où un débris d'écroulement peut être posé, autour de `cellKey`.
 *
 * Règles de Nikola (2026-08-16) : jamais sur un bâtiment debout, une case
 * avec un Titan adverse est autorisée, et on n'empile sur une case déjà
 * servie que s'il n'en reste aucune de vierge.
 *
 * Retourne `{ libres, occupees, eligibles }` — `eligibles` étant ce que
 * l'interface doit proposer à l'instant T.
 */
function getEcroulementCells(cellKey, gameState, dejaServies = []) {
  const { board, looseBlocks } = gameState;
  const r0 = rowIndex(cellKey[0]);
  const c0 = Number(cellKey.slice(1));
  const libres = [];
  const occupees = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r0 + dr, nc = c0 + dc;
      if (nr < 0 || nr > 8 || nc < 1 || nc > 9) continue;
      const cle = rowFromIndex(nr) + nc;
      const bat = board[cle];
      if (bat && bat.blocks && bat.blocks.length > 0) continue; // jamais sur un bâtiment
      const aDesDebris = (looseBlocks[cle] && looseBlocks[cle].length > 0) || dejaServies.includes(cle);
      if (aDesDebris) occupees.push(cle);
      else libres.push(cle);
    }
  }
  return { libres, occupees, eligibles: libres.length > 0 ? libres : occupees };
}

/**
 * Applique l'écroulement d'un Amas, débris par débris, dans l'ordre choisi.
 *
 * `choix` est un tableau de clés de case, une par débris de
 * `ecroulement.blocs`. Chaque débris est posé, puis son effet est résolu
 * AVANT de passer au suivant : un Titan touché est poussé de l'énergie
 * restante du saut et rapporte la Bagarre. C'est cette résolution
 * séquentielle qui interdit d'empiler deux débris sur le même Titan — il a
 * déjà bougé quand le second arrive.
 */
function resolveEcroulementAmas(titanId, ecroulement, choix, gameState) {
  const { board, titans, looseBlocks, replis } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const log = [];
  const decisions = [];
  if (!titan || !ecroulement) return { log, applied: false, decisions };

  const { cellKey, blocs, energie } = ecroulement;
  if (!Array.isArray(choix) || choix.length !== blocs.length) {
    log.push(`⚠️ Écroulement : ${choix?.length ?? 0} case(s) désignée(s) pour ${blocs.length} débris.`);
    return { log, applied: false, decisions };
  }

  delete looseBlocks[cellKey]; // l'Amas quitte sa case
  const bagarreSet = new Set();
  const servies = [];

  for (let i = 0; i < blocs.length; i++) {
    const bloc = blocs[i];
    const cible = choix[i];
    const { eligibles } = getEcroulementCells(cellKey, gameState, servies);
    if (!eligibles.includes(cible)) {
      log.push(`⚠️ ${cible} n'est pas une case valide pour ce débris — il reste en ${cellKey}.`);
      if (!looseBlocks[cellKey]) looseBlocks[cellKey] = [];
      looseBlocks[cellKey].push(bloc);
      continue;
    }

    if (!looseBlocks[cible]) looseBlocks[cible] = [];
    looseBlocks[cible].push(bloc);
    servies.push(cible);
    log.push(`${cellKey} : écroulement — bloc ${bloc} posé en ${cible}.`);

    // Un Titan sur la case reçoit le choc : il part dans l'axe tas → case,
    // de la valeur du saut restant.
    const occupant = titans.find((t) => estSurLePlateau(t) && t.cell === cible && t.id !== titanId);
    if (occupant && energie > 0) {
      const dr = Math.sign(rowIndex(cible[0]) - rowIndex(cellKey[0]));
      const dc = Math.sign(Number(cible.slice(1)) - Number(cellKey.slice(1)));
      const avant = occupant.cell;
      const landing = projectInDirection(cible[0], Number(cible.slice(1)), dr, dc, energie, {
        board, looseBlocks, titans, log, bagarreSet, replis,
        initiatorId: titanId, movingTitanId: occupant.id,
      });
      if (!landing.ejecte) occupant.cell = landing.row + landing.col;
      if (occupant.cell !== avant || landing.ejecte) bagarreSet.add(occupant.id);
      log.push(`${cible} : Titan ${occupant.id} percuté par le débris (énergie ${energie}) → ${occupant.horsPlateau ? "sorti du ring" : occupant.cell}.`);
    }
  }

  if (bagarreSet.size > 0) {
    titan.bagarre = (titan.bagarre || 0) + bagarreSet.size;
    log.push(`+${bagarreSet.size} Bagarre (Titan ${titanId} → ${titan.bagarre}) — Titan(s) touché(s) par l'écroulement.`);
  }
  return { log, applied: true, decisions };
}

/* ============================================================
   MOTEUR GÉNÉRIQUE DE DÉCISION — DIL / RAGE (dette technique #1)
   ============================================================
   Remplace le pattern "juste loggé, non résolu" répété sur Tout Casser,
   Tête en Avant, Graouhhh, Boing Boing par une vraie mécanique en 2 temps :

   DIL  : 1) l'attaquant désigne 2 couleurs DIFFÉRENTES du Repaire du
             défenseur · 2) le défenseur choisit laquelle il perd (ou
             paie 1 Adrénaline pour annuler)
   RAGE : l'attaquant choisit librement 1 ressource du Repaire du
          défenseur, sans étape de défense. Impossible si le défenseur a
          <2 ressources (FAQ #5 du livret) — vérifié ici sur repaire.length
          + adrenaline (FAQ #5).

   Ce moteur résout le "QUI perd QUOI" pour les 4 cartes concernées, mais
   PAS la Fatigue (vol de carte, cf. §1ter du tracker) ni Faut Pas Me
   Chauffer (comparaison de sommes + mise cachée = mécanique différente).

   ⚠️ Chaînes de réaction (FAQ #12, confirmée) : un Titan poussé en chaîne
   ne redéclenche JAMAIS DIL/RAGE via ce moteur — seul le 1er impact
   direct de la carte jouée passe par decisionQueue. Le comptage Bagarre
   associé aux Titans touchés en chaîne n'est pas encore câblé (voir
   tracker, dette #2).
============================================================ */

function canRage(defenderId, gameState) {
  const t = gameState.titans.find((x) => x.id === defenderId);
  // Ruling tranché Nikola (session) : RAGE est possible dès 1 seule
  // ressource — l'attaquant ne prend qu'une ressource, il n'a donc besoin
  // que d'une seule cible. Il n'existe aucun cas de "repli RAGE" : seul
  // DIL peut être structurellement impossible (voir canDil), parce que lui
  // exige 2 couleurs DIFFÉRENTES. Le seuil précédent (>= 2) était un
  // alignement erroné sur la contrainte de DIL.
  // FAQ #5 (conservée) : l'Adrénaline de la cible compte dans le total et
  // devient elle-même une ressource ciblable par RAGE.
  return t.repaire.length + (t.adrenaline || 0) >= 1;
}

// Bug #9 (tracker) : DIL exige que l'attaquant désigne 2 couleurs
// DIFFÉRENTES du Repaire du défenseur (cf. ATTACKER_PICK en UI). Si le
// défenseur n'a pas au moins 2 couleurs distinctes en Repaire, l'action
// est structurellement impossible à résoudre — jusqu'ici la décision
// DIL était quand même enfilée dans decisionQueue, ce qui bloquait la
// partie sur une décision qu'on ne peut jamais valider (le bouton
// "Valider" reste désactivé indéfiniment, aucune sortie possible).
// Même garde-fou que canRage() ci-dessus, appliqué au cas DIL.
// Ruling tranché Nikola (14/08/2026), point ouvert V36 « effet de repli
// quand DIL est impossible » : il n'y en a pas. Quand la cible n'a pas
// 2 couleurs différentes en Repaire, l'action est simplement notée au
// journal et ne produit aucun effet. Le point est clos.
/* ============================================================
   OPTIONS D'UN DILEMME — couleurs ET socle
   ============================================================
   Livret V36.2 : « L'attaquant désigne 2 couleurs différentes du Repaire du
   défenseur — OU 1 socle tiré au sort si applicable. »

   La seconde moitié de cette phrase n'était pas implémentée : seules les
   couleurs du Repaire étaient proposées, et les Socles échappaient
   totalement au Dilemme. Implémentée le 2026-08-17 à la demande de Nikola.

   CE QUE « TIRÉ AU SORT » VEUT DIRE, et c'est la clé de l'équilibre : le
   Socle est une option ANONYME. L'attaquant peut mettre « un Socle » sur la
   table, mais il ne choisit pas LEQUEL — un Socle vaut de 1 à 4 points selon
   la hauteur qu'avait le bâtiment. Sans cet anonymat, le Dilemme deviendrait
   un sniper à 4 points ; avec lui, l'attaquant prend le risque d'arracher un
   Socle de 1 pendant qu'un Socle de 4 dort à côté. Symétriquement, la cible
   qui accepte de lâcher un Socle ne sait pas non plus lequel elle y laisse.

   Le tirage passe par le `pick` semé du domaine, comme la Fatigue : une
   partie rejouée avec la même graine reste identique au point près.

   CONSÉQUENCE SUR `canDil` : le seuil n'est plus « 2 couleurs différentes »
   mais « 2 OPTIONS distinctes ». Une cible avec 1 seule couleur et 1 Socle
   peut désormais subir un Dilemme, alors qu'elle y était immunisée. C'est
   voulu : c'est exactement la cible que la règle du livret visait avec son
   « si applicable ».

   L'option Socle est représentée par la clé sentinelle SOCLE_OPTION. Aucune
   couleur ne porte ce nom, la confusion est impossible.
============================================================ */

const SOCLE_OPTION = "socle";

function getDilOptions(defenderId, gameState) {
  const t = gameState.titans.find((x) => x.id === defenderId);
  if (!t) return [];
  const couleurs = [...new Set(t.repaire)];

  /* LE VERT ÉCHAPPE AU DILEMME — ruling Nikola du 2026-08-17 : « on ne peut
     pas faire de DIL sur du Vert, sauf si c'est la seule couleur ».

     Le Vert n'est pas une couleur comme les autres : sa valeur n'existe pas
     avant le décompte final, où son propriétaire la fixe en secret. Le
     désigner reviendrait à faire perdre une carte dont personne à la table
     ne connaît le prix — ni l'attaquant qui la vise, ni la cible qui la
     lâche. L'exception « seule couleur » évite qu'un Titan devienne
     intouchable en ne collectant que du Vert. */
  const sansVert = couleurs.filter((c) => c !== "vert");
  const options = sansVert.length > 0 ? sansVert : couleurs;

  if ((t.socles || []).length > 0) options.push(SOCLE_OPTION);
  return options;
}

function canDil(defenderId, gameState) {
  // Anciennement `new Set(t.repaire).size >= 2` : les Socles n'entraient pas
  // dans le compte, donc une cible « 1 couleur + des Socles » était immunisée.
  return getDilOptions(defenderId, gameState).length >= 2;
}

/* Retire un Socle AU HASARD du Repaire de la cible et le renvoie sous forme
   de marqueur (`socleMarker`), directement posable au sol ou transférable.
   Renvoie null si la cible n'a aucun Socle. */
function retirerSocleAuSort(defender) {
  const socles = defender.socles || [];
  if (socles.length === 0) return null;
  const idx = randomInt(socles.length);
  const [valeur] = socles.splice(idx, 1);
  return { valeur, marker: socleMarker(valeur) };
}

/* `cellAtImpact` — ruling Nikola du 2026-08-17.
   « Quand un Titan doit perdre un bloc sans qu'il soit pris par le Titan
   initiateur, il le perd sur la case où il est, et ensuite il est déplacé
   si besoin par rapport à l'action. »

   Le bloc perdu en DIL tombe donc au sol sur la case que la victime
   occupait À L'INSTANT DE L'IMPACT, pas sur celle où elle atterrit après
   projection. Or les résolveurs projettent la cible immédiatement et
   n'enfilent que la DEMANDE de décision : au moment où le joueur clique
   enfin la couleur perdue, `defender.cell` a déjà bougé, et l'information
   d'origine est perdue. Elle est donc figée ici, à la création de la
   demande, et c'est elle que l'appelant utilise pour poser le bloc au sol.

   Deux bugs corrigés du même coup côté contrôleur : le bloc perdu en DIL
   ne tombait nulle part (il disparaissait du jeu), et le bloc pris en
   RAGE n'arrivait jamais dans le Repaire de l'attaquant. */
/* OÙ VA LE BLOC PERDU — table par CARTE et par TYPE d'effet.
   Arbitrage de Nikola du 2026-08-17, carte par carte. Il n'y a délibérément
   PAS de règle générale : la destination dépend de la carte jouée, et deux
   cartes peuvent traiter la même RAGE différemment.

   · "sol"     → le bloc tombe sur la case d'impact et redevient ramassable
                 par n'importe qui, y compris la victime.
   · "repaire" → le bloc passe directement dans le Repaire de l'attaquant.

   La logique du tableau, telle que Nikola l'a tranchée : plus l'attaquant
   est LOIN de sa cible, plus il doit se contenter de faire tomber le bloc au
   sol. Tout Casser frappe tout le Périmètre sans bouger et éparpille donc
   tout autour de lui — il ne pourra en ramasser qu'un. Tête en Avant charge
   physiquement la cible et arrache le bloc au Seuil 4. Faut Pas Me Chauffer
   est un bras de fer gagné de haute lutte : tout revient à l'attaquant.

   NOTE sur l'Adrénaline : une RAGE peut prendre une Adrénaline plutôt qu'un
   bloc (FAQ #5). Une Adrénaline ne se pose pas au sol — il n'existe pas de
   pile d'Adrénaline sur le plateau. Elle va donc TOUJOURS à l'attaquant,
   quelle que soit la ligne du tableau. */
const DESTINATION_BLOC_PERDU = {
  "Tout Casser":          { DIL: "sol",     RAGE: "sol" },
  "Tête en Avant":        { DIL: "sol",     RAGE: "repaire" },
  // Graouhhh n'a aucune ligne Seuil 4 au livret, et aucune Adrénaline n'y
  // est dépensable : elle ne peut structurellement pas produire de RAGE.
  "Graouhhh":             { DIL: "sol" },
  // Boing Boing gagne sa RAGE au Seuil 4 le 2026-08-17. Inatteignable sans
  // Adrénaline (énergie max 3), d'où le bloc qui revient à l'attaquant.
  "Boing Boing":          { DIL: "sol",     RAGE: "repaire" },
  "Faut Pas Me Chauffer": { DIL: "repaire", RAGE: "repaire" },
};

function destinationBlocPerdu(cardLabel, type) {
  // "sol" par défaut : c'est le cas majoritaire, et surtout le plus sûr —
  // un bloc mal routé vers le sol reste dans la partie et se rattrape, un
  // bloc mal routé vers un Repaire est un point volé à tort.
  return (DESTINATION_BLOC_PERDU[cardLabel] || {})[type] || "sol";
}

function makeDecisionRequest(type, attackerId, defenderId, cardLabel, cellAtImpact = null) {
  return {
    type, attackerId, defenderId, cardLabel, cellAtImpact,
    destination: destinationBlocPerdu(cardLabel, type),
  };
}

/* ============================================================
   PASSIFS TRANSVERSAUX — Mouvement gratuit & Récupération
   ============================================================
   Rulings confirmés Nikola (session) :
   - Les 2 passifs sont OPTIONNELS à chaque activation (aucune
     obligation de les utiliser, quelle que soit la situation).
   - Mouvement gratuit : AVANT l'action. 2 cases max (+1/Adrénaline
     dépensée), ne traverse PAS un Titan ou un Bâtiment (obstacle
     bloquant, pas de saut par-dessus) — implémenté en BFS sur les
     8 directions (Moore), pas en ligne droite. Exception : un
     Téléporteur ACTIF est traversable (BFS à 2 états, cf. plus bas).
   - Récupération : APRÈS l'action. 1 Bloc/Socle au choix dans le
     Périmètre. CUMULABLE avec une carte qui ramasse déjà dans le
     même tour (Tête en Avant, Boing Boing, Je Ne Partage Pas) —
     confirmé Nikola, asymétrie assumée entre familles de cartes.
   - Règle transversale (confirmée Nikola) : si une case se libère
     suite à une action PASSIVE ou ACTIVE, le Titan s'y déplace
     OBLIGATOIREMENT — aucun choix, cohérent avec le comportement
     déjà codé sur Tête en Avant / Boing Boing / Tout Casser.
============================================================ */

// ============================================================
// Mouvement gratuit — BFS à 2 états (intégration Téléporteurs)
// ============================================================
// État = (cellule, teleportUsed). Un bâtiment normal avec blocs reste un
// mur infranchissable ; un Téléporteur ACTIF (isTeleporter && blocks>0,
// pas encore collecté) est l'exception : Entrer coûte 1 déplacement,
// Sortir est gratuit — mais UNIQUEMENT adjacent au téléporteur de sortie,
// jamais dessus (confirmé Nikola, session : l'invariant "un Titan ne peut
// jamais être sur un bâtiment" s'applique aussi à la sortie du
// téléporteur). Le joueur choisit librement la case de sortie parmi les
// cases libres autour du téléporteur, et peut continuer à se déplacer
// classiquement ensuite avec le déplacement restant (max 2, ou 3 avec
// 1 Adrénaline). teleportUsed passe à true dès la 1ère téléportation →
// impossible d'en enchaîner une 2e sur le même Mouvement gratuit
// (confirmé livret).
function getActiveTeleporterCells(board) {
  return Object.entries(board)
    .filter(([, b]) => b.isTeleporter && b.blocks.length > 0)
    .map(([key]) => key);
}

// Cases libres autour d'une cellule donnée (Moore ×8), filtrées comme
// n'importe quelle case de destination normale (pas de bâtiment debout, pas
// de Titan, pas d'élément non-débris au sol). Fonction générique réutilisée
// pour deux besoins distincts (session) :
// 1) Sortie de téléporteur : Confirmé Nikola — on ne se pose JAMAIS sur la
//    case du téléporteur lui-même, le Titan ressort ADJACENT, sur la case
//    de son choix parmi celles-ci (invariant "jamais sur un bâtiment").
// 2) Boing Boing sur Titan occupant coincé (rebond avant/arrière tous deux
//    bloqués) : Confirmé Nikola — l'occupant est éjecté sur une case libre
//    adjacente à sa position, au choix de l'attaquant, plutôt que de
//    refuser la destination.
function getFreeAdjacentCells(centerKey, board, titansByCell, looseBlocks) {
  const r0 = rowIndex(centerKey[0]);
  const c0 = Number(centerKey.slice(1));
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r0 + dr, nc = c0 + dc;
      if (nr < 0 || nr > 8 || nc < 1 || nc > 9) continue;
      const key = rowFromIndex(nr) + nc;
      const bldg = board[key];
      const blockedByTitan = !!titansByCell[key];
      const blockedByBuilding = bldg && bldg.blocks.length > 0;
      const looseStack = looseBlocks ? (looseBlocks[key] || []) : [];
      const hasNonDebris = looseStack.some((e) => e === "vert"); // fix session : un Socle libre cohabite avec un Titan (FAQ #9, "ramassable comme un Bloc de béton"), seul un bloc Vert (Téléporteur non collecté) reste bloquant
      if (blockedByTitan || blockedByBuilding || hasNonDebris) continue;
      cells.push(key);
    }
  }
  return cells;
}

function getMovementReachable(startCell, maxRange, board, titansByCell, looseBlocks = {}) {
  const teleporters = getActiveTeleporterCells(board);
  const teleporterSet = new Set(teleporters);
  const canWarp = teleporters.length >= 2; // il faut une autre sortie possible

  const dist = new Map([[`${startCell}|0`, 0]]);
  let frontier = [{ cell: startCell, teleportUsed: false, dist: 0 }];

  while (frontier.length > 0) {
    const next = [];
    for (const { cell, teleportUsed, dist: d } of frontier) {
      if (d >= maxRange) continue;
      const r = rowIndex(cell[0]);
      const c = Number(cell.slice(1));
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr > 8 || nc < 1 || nc > 9) continue;
          const key = rowFromIndex(nr) + nc;
          const bldg = board[key];
          const isTeleporterCell = teleporterSet.has(key);
          const blockedByTitan = !!titansByCell[key];
          // Bâtiment encore debout = bloqué
          const blockedByBuilding = bldg && bldg.blocks.length > 0 && !isTeleporterCell;
          // Case vide de bâtiment mais contenant un élément non-débris (socle ou bloc vert/téléporteur) = bloqué
          const looseStack = looseBlocks ? (looseBlocks[key] || []) : [];
          const hasNonDebris = looseStack.some((e) => e === "vert"); // fix session : un Socle libre cohabite avec un Titan (FAQ #9, "ramassable comme un Bloc de béton"), seul un bloc Vert (Téléporteur non collecté) reste bloquant
          if (blockedByTitan || blockedByBuilding || hasNonDebris) continue;

          const nd = d + 1;

          if (isTeleporterCell) {
            if (teleportUsed || !canWarp) continue; // 2e téléportation interdite / pas de sortie possible
            teleporters.forEach((exitKey) => {
              if (exitKey === key) return; // ne peut pas ressortir sur lui-même
              // Ressort ADJACENT au téléporteur de sortie (jamais dessus,
              // confirmé Nikola) — case choisie librement par le joueur
              // parmi les cases libres autour du téléporteur de sortie.
              const exitCells = getFreeAdjacentCells(exitKey, board, titansByCell, looseBlocks);
              exitCells.forEach((adjKey) => {
                const stateKey = `${adjKey}|1`;
                if (!dist.has(stateKey) || dist.get(stateKey) > nd) {
                  dist.set(stateKey, nd);
                  next.push({ cell: adjKey, teleportUsed: true, dist: nd });
                }
              });
            });
            continue; // pas d'arrêt sur la case du téléporteur lui-même (sortie immédiate)
          }

          const stateKey = `${key}|${teleportUsed ? 1 : 0}`;
          if (dist.has(stateKey) && dist.get(stateKey) <= nd) continue;
          dist.set(stateKey, nd);
          next.push({ cell: key, teleportUsed, dist: nd });
        }
      }
    }
    frontier = next;
  }

  const classic = new Set();
  const teleport = new Set();
  for (const stateKey of dist.keys()) {
    const [cell, tFlag] = stateKey.split("|");
    if (cell === startCell) continue;
    if (tFlag === "1") teleport.add(cell);
    else classic.add(cell);
  }
  // Une case peut apparaître dans les deux (chemin classique ET téléporteur possible)
  // On la classe en "classic" si accessible sans téléporteur
  const reachable = new Set([...classic, ...teleport]);
  return { reachable, classic, teleport };
}

// Retourne le chemin case par case de startCell à destKey (pour animation)
// Utilise BFS parent-tracking. Retourne [] si pas de chemin.
function getMovePath(startCell, destKey, maxRange, board, titansByCell, looseBlocks = {}) {
  const teleporters = getActiveTeleporterCells(board);
  const teleporterSet = new Set(teleporters);
  const canWarp = teleporters.length >= 2;
  const parent = new Map();
  parent.set(`${startCell}|0`, null);
  const dist = new Map([[`${startCell}|0`, 0]]);
  let frontier = [{ cell: startCell, teleportUsed: false, dist: 0 }];
  while (frontier.length > 0) {
    const next = [];
    for (const { cell, teleportUsed, dist: d } of frontier) {
      if (d >= maxRange) continue;
      const r = rowIndex(cell[0]);
      const c = Number(cell.slice(1));
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr > 8 || nc < 1 || nc > 9) continue;
          const key = rowFromIndex(nr) + nc;
          const bldg = board[key];
          const isTeleporterCell = teleporterSet.has(key);
          const blockedByTitan = !!titansByCell[key];
          const blockedByBuilding = bldg && bldg.blocks.length > 0 && !isTeleporterCell;
          const looseStack = looseBlocks ? (looseBlocks[key] || []) : [];
          const hasNonDebris = looseStack.some((e) => e === "vert"); // fix session : un Socle libre cohabite avec un Titan (FAQ #9, "ramassable comme un Bloc de béton"), seul un bloc Vert (Téléporteur non collecté) reste bloquant
          if (blockedByTitan || blockedByBuilding || hasNonDebris) continue;
          const nd = d + 1;
          if (isTeleporterCell) {
            if (teleportUsed || !canWarp) continue;
            teleporters.forEach((exitKey) => {
              if (exitKey === key) return;
              const exitCells = getFreeAdjacentCells(exitKey, board, titansByCell, looseBlocks);
              exitCells.forEach((adjKey) => {
                const sk = `${adjKey}|1`;
                if (!dist.has(sk) || dist.get(sk) > nd) {
                  dist.set(sk, nd);
                  parent.set(sk, `${cell}|${teleportUsed ? 1 : 0}`);
                  next.push({ cell: adjKey, teleportUsed: true, dist: nd });
                }
              });
            });
            continue;
          }
          const stateKey = `${key}|${teleportUsed ? 1 : 0}`;
          if (dist.has(stateKey) && dist.get(stateKey) <= nd) continue;
          dist.set(stateKey, nd);
          parent.set(stateKey, `${cell}|${teleportUsed ? 1 : 0}`);
          next.push({ cell: key, teleportUsed, dist: nd });
        }
      }
    }
    frontier = next;
  }
  // Retrouver le chemin vers destKey
  const sk0 = `${destKey}|0`, sk1 = `${destKey}|1`;
  let cur = dist.has(sk0) ? sk0 : dist.has(sk1) ? sk1 : null;
  if (!cur) return [destKey]; // fallback: direct
  const path = [];
  while (cur !== null) {
    path.unshift(cur.split("|")[0]);
    cur = parent.get(cur) ?? null;
  }
  return path; // [startCell, ...intermediaires, destKey]
}

function resolveFreeMovement(titanId, destKey, gameState) {
  const { board, looseBlocks } = gameState;
  const bldg = board && board[destKey];
  // Aucune exception téléporteur ici (fix session) : la case de sortie
  // téléporteur choisie par getMovementReachable/getMovePath est déjà
  // ADJACENTE au téléporteur, jamais la case du téléporteur elle-même —
  // donc destKey ne devrait plus jamais être un bâtiment, téléporteur ou
  // non. Tout bâtiment debout ici bloque, sans exception : un Titan ne
  // peut jamais se retrouver debout sur un bâtiment (confirmé Nikola).
  if (bldg && bldg.blocks && bldg.blocks.length > 0) {
    return { log: [`⚠️ Titan ${titanId} : Mouvement vers ${destKey} bloqué — bâtiment présent.`] };
  }
  const looseStack = looseBlocks ? (looseBlocks[destKey] || []) : [];
  const hasNonDebris = looseStack.some((e) => e === "vert"); // fix session : un Socle libre cohabite avec un Titan (FAQ #9, "ramassable comme un Bloc de béton"), seul un bloc Vert (Téléporteur non collecté) reste bloquant
  if (hasNonDebris) {
    return { log: [`⚠️ Titan ${titanId} : Mouvement vers ${destKey} bloqué — élément non-débris présent.`] };
  }
  const titan = gameState.titans.find((t) => t.id === titanId);
  titan.cell = destKey;
  return { log: [`Titan ${titanId} : Mouvement gratuit → ${destKey}.`] };
}

function getRecuperationPool(titanId, gameState) {
  const { titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const perimeter = getPerimeter(titan.cell[0], Number(titan.cell.slice(1)));
  return perimeter
    .map((c) => c.row + c.col)
    .filter((key) => looseBlocks[key] && looseBlocks[key].length > 0);
}

/* Règle transversale (confirmée Nikola) : quand un Titan vide la dernière
   pile de blocs d'une case, il s'y déplace OBLIGATOIREMENT.

   Deux exceptions, et c'est tout l'objet de cette fonction :
   · un bâtiment encore debout occupe la case ;
   · un AUTRE Titan occupe la case — deux Titans ne partagent jamais une
     case (ruling Nikola). Cette seconde exception manquait, et la règle
     était recopiée à l'identique dans deux résolveurs (Récupération et
     Je Ne Partage Pas) : corriger l'une laissait l'autre cassée. D'où
     cette fonction unique, appelée par les deux.

   Retourne true si le déplacement a eu lieu. */
function deplacerVersCaseLiberee(titan, cellKey, gameState, log) {
  const { board, titans } = gameState;
  if (cellKey === titan.cell) return false;

  const bat = board && board[cellKey];
  if (bat && bat.blocks && bat.blocks.length > 0) return false;

  const occupant = titans.find((t) => t.id !== titan.id && estSurLePlateau(t) && t.cell === cellKey);
  if (occupant) {
    log.push(`${cellKey} : case libérée mais occupée par le Titan ${occupant.id} → Titan ${titan.id} reste en ${titan.cell}.`);
    return false;
  }

  titan.cell = cellKey;
  log.push(`${cellKey} : case libérée → Titan ${titan.id} s'y déplace obligatoirement.`);
  return true;
}

function resolveRecuperation(titanId, cellKey, gameState, pickedValue) {
  const { titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const stack = looseBlocks[cellKey];
  const log = [];
  if (!stack || stack.length === 0) {
    log.push(`⚠️ ${cellKey} : aucun bloc libre — Récupération annulée.`);
    return { log, applied: false };
  }
  // Bug remonté : quand plusieurs débris DIFFÉRENTS (couleurs/socle) sont
  // empilés sur la même case, resolveRecuperation prenait toujours celui du
  // dessus (stack.pop()) sans jamais laisser le joueur choisir — contraire
  // au livret ("si plusieurs Blocs de béton sont accessibles, tu choisis
  // librement lequel récupérer"). pickedValue (optionnel) permet à l'appelant
  // de désigner explicitement LEQUEL prendre dans la pile ; sans précision,
  // on retombe sur l'ancien comportement (le dernier empilé) pour ne rien
  // casser des appels existants (ex. IA, qui n'a pas encore de logique de
  // choix dédiée).
  let idx = stack.length - 1;
  if (pickedValue !== undefined) {
    const found = stack.lastIndexOf(pickedValue);
    if (found !== -1) idx = found;
  }
  const picked = stack.splice(idx, 1)[0];
  if (isSocleMarker(picked)) {
    const val = socleValue(picked);
    titan.socles.push(val);
    log.push(`${cellKey} : Socle (${val}) récupéré (passif Récupération).`);
  } else {
    titan.repaire.push(picked);
    log.push(`${cellKey} : bloc ${picked} récupéré (passif Récupération).`);
  }
  // Règle transversale (confirmée Nikola) : case libérée → déplacement OBLIGATOIRE.
  // Exception : si la case est un bâtiment encore debout, le Titan ne peut pas s'y poser.
  // Aucune exception téléporteur ici (fix session, cohérence avec resolveFreeMovement) :
  // l'ancien code ignorait le blocage si destBldg.isTeleporter était vrai, ce qui
  // pouvait forcer un Titan à se poser sur un téléporteur encore actif — même
  // invariant "jamais sur un bâtiment" que pour le Mouvement gratuit.
  if (stack.length === 0) {
    deplacerVersCaseLiberee(titan, cellKey, gameState, log);
    retirerPileVide(looseBlocks, cellKey);
  }
  return { log, applied: true };
}

/* ============================================================
   SYSTÈME CARTES-EN-MAIN / ZONE REPOS (dette technique #4)
   ============================================================
   Rulings confirmés Nikola (session) :
   - Vol de carte normal (Phase 5) ET Fatigue (Graouhhh/Boing Boing)
     suivent la MÊME logique : la carte ciblée est rendue indisponible
     1 Manche dans la Zone Repos DE SON PROPRE PROPRIÉTAIRE (pas de
     transfert vers le voleur/attaquant) puis restituée dans SA main à
     la Manche suivante.
   - Différence entre les deux : le vol normal cible 1 des 3 cartes
     DÉJÀ JOUÉES ce tour (face visible, pool = playedThisManche) ; la
     Fatigue cible 1 carte NON jouée tirée au hasard (pool = main +
     cartes encore programmées mais pas encore jouées).
   - Programmation (Phase 3) : le joueur choisit 3 cartes parmi celles
     actuellement dans sa main (peut être <6 si des cartes sont en Zone
     Repos ailleurs — confirmé).
   - ✅ Ordre de jeu LIBRE (confirmé Nikola, session) : les 3 cartes
     programmées ne forment PAS une file FIFO — le joueur peut jouer
     n'importe laquelle des 3 à son tour actif, dans l'ordre de son
     choix. `programmed` reste juste le POOL des cartes encore
     disponibles cette Manche.
============================================================ */

function programCards(titanId, cardIds, gameStateTitans) {
  const titan = gameStateTitans.find((t) => t.id === titanId);
  // Garde-fou (dette résolue) : impossible de re-programmer tant que la
  // Manche en cours n'est pas terminée pour ce Titan — programmed doit
  // être vide (rien en attente) ET playedThisManche doit être vide
  // (repart à zéro seulement à advanceManche). Sans ce garde, un Titan
  // pouvait re-programmer juste après avoir joué ses 3 cartes, avant la
  // fin de Manche.
  if (titan.programmed.length > 0) {
    return { ok: false, reason: "Des cartes programmées sont encore en attente de résolution cette Manche." };
  }
  if (titan.playedThisManche.length > 0 || (titan.discardedHidden || []).length > 0) {
    return { ok: false, reason: "Ce Titan a déjà joué cette Manche — attends la Manche suivante pour reprogrammer." };
  }
  if (cardIds.length !== 3) return { ok: false, reason: "Il faut exactement 3 cartes." };
  for (const id of cardIds) {
    if (!titan.hand.includes(id)) return { ok: false, reason: `${CARD_LABEL[id]} n'est pas en main.` };
  }
  titan.hand = titan.hand.filter((id) => !cardIds.includes(id));
  titan.programmed = [...cardIds]; // pool, pas une file — ordre de jeu libre (confirmé Nikola)
  return { ok: true };
}

/* ============================================================
   DÉFAUSSE VOLONTAIRE FACE CACHÉE (brique ajoutée cette session)
   ============================================================
   Ruling confirmé Nikola : pendant son round en Phase Action, le Titan
   désigne 1 de ses 3 cartes programmées et peut choisir de NE PAS la
   jouer si "l'action n'est finalement pas intéressante". La carte :
   - quitte `programmed` SANS déclencher le moindre effet de jeu,
   - ne révèle RIEN aux adversaires (contrairement à une carte jouée
     avec effet, qui se résout publiquement),
   - compte quand même comme LA carte de ce round pour ce Titan (fait
     avancer le tour exactement comme markCardPlayed),
   - reste éligible au Vol Phase Repos au même titre qu'une carte
     jouée (voir resolveVolPhaseRepos) — stockée dans discardedHidden,
     jamais dans playedThisManche (qui resterait un tell involontaire).
============================================================ */
function discardCardHidden(titanId, cardId, gameStateTitans) {
  const titan = gameStateTitans.find((t) => t.id === titanId);
  const idx = titan.programmed.indexOf(cardId);
  if (idx === -1) return { ok: false, reason: `${CARD_LABEL[cardId]} n'est pas programmée.` };
  titan.programmed.splice(idx, 1);
  if (!titan.discardedHidden) titan.discardedHidden = [];
  titan.discardedHidden.push(cardId);
  return { ok: true, log: `Titan ${titanId} défausse une carte face cachée — action jugée non intéressante, aucun effet, rien révélé aux adversaires.` };
}

function getNonPlayedPool(titan) {
  /* « CARTE NON JOUÉE » = UNE CARTE DE LA MAIN. RIEN D'AUTRE.

     Ruling re-précisé par Nikola le 2026-08-15 après un test à la table,
     pour la troisième fois : la Fatigue lui avait pris la carte qu'il
     s'apprêtait à jouer dans la Manche en cours.

     Cette fonction renvoyait `hand + programmed`. C'était une lecture
     erronée de « non jouée » : les 3 cartes programmées SONT les cartes de
     la Manche en cours, elles sont engagées, seule leur résolution est en
     attente. Les prendre revenait à amputer la Manche du joueur au milieu
     de son déroulé.

     La formulation d'origine le disait pourtant : la carte fatiguée n'est
     « plus jouable pour la Manche À VENIR ». Une carte qu'on retire de la
     Manche à venir ne peut être qu'une carte encore en main.

     Conséquence directe : `fromProgrammed` est désormais toujours faux, et
     toute la machinerie de compensation du compteur de rounds
     (`compensateFatiguedRounds` côté contrôleur) n'a plus lieu d'être —
     elle n'existait que pour rattraper les dégâts de cette erreur. */
  return [...titan.hand];
}

function sendCardToOwnRepos(titan, cardId, mancheNumber, faceUp) {
  // Retire la carte de sa position actuelle (main ou pool programmé) et
  // la place dans la Zone Repos DE SON PROPRIÉTAIRE, indisponible pour la
  // Manche en cours + la suivante en entier (retour en main seulement au
  // tout début de la Manche mancheNumber+2).
  // Bug remonté (session) : avec mancheNumber+1 ici, applyRestitution()
  // — appelée avec mancheNumber+1 dès la toute première transition de
  // Manche suivant le vol — renvoyait la carte immédiatement, sans
  // qu'elle ne reste jamais indisponible "pendant la Manche suivante"
  // comme prévu. +2 corrige ce décalage d'une Manche.
  const handIdx = titan.hand.indexOf(cardId);
  if (handIdx !== -1) {
    titan.hand.splice(handIdx, 1);
  } else {
    const progIdx = titan.programmed.indexOf(cardId);
    if (progIdx !== -1) titan.programmed.splice(progIdx, 1);
  }
  titan.repos.push({ cardId, faceUp, returnAtManche: mancheNumber + 2 });
}

/* ============================================================
   VOL EN PHASE REPOS — refonte complète (session)
   ============================================================
   Ruling confirmé Nikola : la Phase Repos ne démarre qu'une fois que
   TOUS les Titans ont joué leurs 3 cartes de la Manche (jouées avec
   effet OU défaussées cachées, jamais les deux à la fois pour un même
   slot) — donc au moment de la résolution, `programmed` est toujours
   vide pour tout le monde et le pool de chaque Titan est figé à
   exactement 3 cartes : playedThisManche + discardedHidden.

   Ancienne règle (choix conscient d'1 carte parmi les 3 jouées,
   visibles) → ABANDONNÉE. Nouvelle règle (confirmée Nikola, session
   2026-08-11 — alignée sur le livret V35) :
   - Le Détonateur choisit UNE FOIS un sens de rotation (gauche ou
     droite) pour toute la chaîne — pas de choix individuel par Titan.
   - Dans ce sens, chaque Titan vole 1 carte à son voisin immédiat,
     TIRÉE FACE CACHÉE / AU HASARD parmi les 3 cartes de la Manche du
     voisin (mélange des 3, jouées + défaussées cachées confondues) —
     le voleur ne choisit pas, il pioche à l'aveugle.
   - La carte tirée est ensuite posée FACE VISIBLE dans la Zone Repos
     de la victime (visible de tous en permanence, pas seulement au
     moment du tir), indisponible jusqu'à la Manche suivante.
   - Objectif déclaré (Nikola) : casser la répétitivité des mêmes
     actions d'une Manche à l'autre, sans laisser de lecture tactique
     sur QUI vole QUOI (le hasard remplace le choix stratégique ici) —
     mais une fois volée, l'identité de la carte reste consultable par
     tous, contrairement à la Fatigue (voir resolveFatigue) qui reste
     face cachée et réservée à sa victime.
   - Chaque Titan est victime EXACTEMENT une fois (rotation circulaire
     sur ordreJeu ou son inverse) — aucun chevauchement de pool entre
     deux vols de la même chaîne, résolution séquentielle sûre.
   - La carte volée n'est PLUS jamais dans playedThisManche à ce stade
     (Zone Repos n'entre jamais dans le pool d'un futur vol : "pas
     possible de voler une carte en zone repos, c'est forcément une
     des cartes de la Manche actuelle" — confirmé Nikola).
============================================================ */
function resolveVolPhaseRepos(mancheNumber, direction, ordreJeu, gameStateTitans) {
  const order = direction === "gauche" ? [...ordreJeu].reverse() : [...ordreJeu];
  const log = [];
  for (let i = 0; i < order.length; i++) {
    const thiefId = order[i];
    const victimId = order[(i + 1) % order.length];
    const victim = gameStateTitans.find((t) => t.id === victimId);
    const pool = [...victim.playedThisManche, ...(victim.discardedHidden || [])];
    if (pool.length === 0) {
      log.push(`Vol Phase Repos : Titan ${thiefId} → Titan ${victimId} — pool vide, rien à voler.`);
      continue;
    }
    const cardId = pick(pool);
    const idxPlayed = victim.playedThisManche.indexOf(cardId);
    if (idxPlayed !== -1) {
      victim.playedThisManche.splice(idxPlayed, 1);
    } else {
      const idxDiscard = (victim.discardedHidden || []).indexOf(cardId);
      if (idxDiscard !== -1) victim.discardedHidden.splice(idxDiscard, 1);
    }
    // +2 (et non +1) : la carte doit rester indisponible pendant TOUTE la
    // Manche suivante, pas juste jusqu'au tout début de celle-ci (même
    // correctif de timing que sendCardToOwnRepos, voir plus haut).
    victim.repos.push({ cardId, faceUp: true, returnAtManche: mancheNumber + 2 });
    log.push(`Vol Phase Repos : Titan ${thiefId} pioche à l'aveugle chez Titan ${victimId} → ${CARD_LABEL[cardId]}, posée face visible en Zone Repos (Titan ${victimId}) jusqu'à la Manche ${mancheNumber + 2}.`);
  }
  return { log };
}

function resolveFatigue(attackerId, targetId, mancheNumber, gameStateTitans) {
  const target = gameStateTitans.find((t) => t.id === targetId);
  const pool = getNonPlayedPool(target);
  if (pool.length === 0) return { ok: false, reason: `Titan ${targetId} n'a aucune carte non jouée disponible.` };
  const cardId = pick(pool);
  // La Manche EN COURS de la cible n'est jamais touchée : le pool ne
  // contient que sa main (cf. getNonPlayedPool). `fromProgrammed` reste
  // exposé pour ne pas casser les appelants, mais il vaut désormais
  // toujours faux — la Fatigue ne peut plus amputer une Manche en cours.
  const fromProgrammed = false;
  sendCardToOwnRepos(target, cardId, mancheNumber, false);
  return {
    ok: true,
    fromProgrammed,
    targetId,
    log: `Fatigue (Titan ${attackerId} → Titan ${targetId}) : carte ${CARD_LABEL[cardId]} piochée au hasard, face cachée, indisponible en Zone Repos (Titan ${targetId}) jusqu'à la Manche ${mancheNumber + 2}.`,
  };
}

function applyRestitution(titan, mancheNumber) {
  const staying = [];
  const returning = [];
  for (const entry of titan.repos) {
    if (entry.returnAtManche <= mancheNumber) returning.push(entry);
    else staying.push(entry);
  }
  for (const entry of returning) titan.hand.push(entry.cardId);
  titan.repos = staying;
  return returning.map((e) => e.cardId);
}

/* ============================================================
   Résolution carte 05 · FAUT PAS ME CHAUFFER
   ============================================================
   Force 3. Cible les Titans dans le Périmètre. Compare la somme des
   Forces des 3 cartes programmées de l'attaquant à celle de chaque
   Titan ciblé, avec mise cachée d'Adrénaline des DEUX côtés.

   Rulings confirmés Nikola (session) :
   - Plusieurs Titans dans le Périmètre → résolu SÉPARÉMENT, un par un,
     dans l'ORDRE CHOISI LIBREMENT PAR L'ATTAQUANT (pas de rotation
     automatique façon Jeton Détonateur — l'initiateur décide lui-même
     contre qui il se compare en premier).
   - Mise cachée : les DEUX joueurs misent en même temps ("3-2-1-go"),
     révélation simultanée — pas de séquence attaquant-puis-défenseur.
   - Comparaison en 2 temps : 1) somme des Forces des 3 cartes
     programmées de la Manche (fixe, peu importe l'ordre de résolution) ·
     2) Adrénaline misée en secret par chaque camp s'ajoute par-dessus.
   - n (projection "perdants projetés n+1 cases") = nombre de Titans
     présents dans le Périmètre au moment où la carte est jouée — fixe
     pour toute l'activation, même logique que le recul de Graouhhh.
============================================================ */

function getProgrammedSum(titan) {
  // Somme des Forces des 3 cartes programmées pour la Manche entière.
  // On combine programmed (pas encore jouées) + playedThisManche (déjà
  // jouées) + discardedHidden (défaussées face cachée, session) car
  // les 3 slots de la Manche gardent leur Force pour FPMC quel que
  // soit leur sort (joué, défaussé, en attente) — seule la Zone Repos
  // (Manche précédente) est exclue de cette somme.
  const ids = [...titan.programmed, ...titan.playedThisManche, ...(titan.discardedHidden || [])];
  return ids.reduce((sum, id) => sum + (CARD_FORCE[id] || 0), 0);
}

function getFPMCTargets(titanId, gameState) {
  // Titans présents dans le Périmètre de l'attaquant. Pas d'ordre imposé
  // ici : l'attaquant choisit lui-même contre qui se comparer en premier
  // via l'UI (confirmé Nikola).
  const { titans } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const perimeter = getPerimeter(titan.cell[0], Number(titan.cell.slice(1)));
  const titansByCell = indexerTitans(titans);
  const presentIds = [];
  perimeter.forEach((cell) => {
    if (cell.isSelf) return;
    const key = cell.row + cell.col;
    const occ = titansByCell[key];
    if (occ && occ !== titanId && !presentIds.includes(occ)) presentIds.push(occ);
  });
  return presentIds;
}

/* ============================================================
   RÉSOLUTION DE FAUT PAS ME CHAUFFER — rapatriée dans le domaine
   ============================================================
   POURQUOI CETTE FONCTION EXISTE MAINTENANT

   FPMC était la seule des six cartes résolue DANS LE CONTRÔLEUR, à la main,
   au lieu de vivre ici avec les cinq autres. Elle a payé cette exception
   trois fois, en ratant trois correctifs successifs appliqués partout
   ailleurs :

   · L'IMMUNITÉ DE L'INITIATEUR (arbitrage du 2026-08-15). L'appel à
     projectInDirection ne transmettait pas `initiatorId`. Une cible qui
     rebondissait sur le bord repartait en sens inverse, percutait
     l'attaquant et le POUSSAIT — avec sa propre carte. Reproduit : T1 en
     B5, T2 en A5, projection de 3 → T1 expulsé en D5.

   · L'AUTO-COLLISION (correctif 247a1b2). Sans `movingTitanId`, le Titan
     projeté figure encore à sa case de départ dans la carte des obstacles :
     s'il y repasse après rebond, il se pousse lui-même. C'est la cause
     exacte des superpositions traitées ailleurs.

   · LA BAGARRE NON REMPORTÉE (ruling c9a233f). Le point était crédité
     avant même de savoir si la cible allait bouger. Une cible coincée
     entre deux murs rapportait quand même son point.

   S'y ajoute le garde-fou canDil/canRage, que les cinq autres cartes
   appliquent : une décision DIL enfilée sur une cible qui n'a pas 2
   couleurs différentes en Repaire ne peut JAMAIS être validée, et bloque
   la partie sur une fenêtre sans issue (bug #9 du tracker).

   Le simulateur, lui, modélisait FPMC comme une carte sans aucun effet
   physique — ni projection, ni Bagarre. Une carte Force 3 sur six était
   donc évaluée par l'IA comme un coup nul, et c'est aussi pourquoi les
   200 parties de diagnostic n'ont jamais vu les défauts ci-dessus : ce
   chemin de code n'était jamais emprunté.

   Contrôleur et simulateur appellent désormais cette unique fonction.

   CONVENTION (identique aux autres résolveurs) : les mises d'Adrénaline
   sont LUES ici, jamais débitées — la déduction reste à l'appelant.
============================================================ */
function resolveFautPasMeChauffer(attackerId, defenderId, nTargets, gameState, { attackerBid = 0, defenderBid = 0 } = {}) {
  const { board, titans, looseBlocks, replis } = gameState;
  const attacker = titans.find((t) => t.id === attackerId);
  const defender = titans.find((t) => t.id === defenderId);
  const log = [];
  const decisions = [];
  if (!attacker || !defender) return { log, decisions, applied: false };

  const attackerTotal = getProgrammedSum(attacker) + attackerBid;
  const defenderTotal = getProgrammedSum(defender) + defenderBid;
  log.push(`Révélation — Titan ${attackerId} : ${attackerTotal} vs Titan ${defenderId} : ${defenderTotal}.`);

  if (attackerTotal < defenderTotal) {
    log.push(`Défaite de Titan ${attackerId} — aucun effet.`);
    return { log, decisions, applied: true, mode: null };
  }

  // Attaquant devant → RAGE · égalité → DIL (livret).
  const mode = attackerTotal > defenderTotal ? "RAGE" : "DIL";

  // n (« les perdants sont projetés de n+1 cases ») = nombre de Titans
  // présents dans le Périmètre au moment où la carte est jouée, fixe pour
  // toute l'activation — même logique que le recul de Graouhhh.
  const dr = Math.sign(rowIndex(defender.cell[0]) - rowIndex(attacker.cell[0]));
  const dc = Math.sign(Number(defender.cell.slice(1)) - Number(attacker.cell.slice(1)));
  const bagarreSet = new Set(); // FAQ #12 : Titans distincts DÉPLACÉS (direct + chaîne)
  const caseAvant = defender.cell;
  const landing = projectInDirection(defender.cell[0], Number(defender.cell.slice(1)), dr, dc, nTargets + 1, {
    board, looseBlocks, titans, log, bagarreSet, replis,
    initiatorId: attackerId,   // immunité de l'initiateur
    movingTitanId: defenderId, // la cible ne doit pas se voir elle-même comme obstacle
  });
  defender.cell = landing.row + landing.col;
  // Ruling Nikola : une bagarre qui n'est pas remportée ne rapporte rien.
  if (defender.cell !== caseAvant) bagarreSet.add(defenderId);

  if (mode === "RAGE") {
    if (canRage(defenderId, gameState)) {
      decisions.push(makeDecisionRequest("RAGE", attackerId, defenderId, "Faut Pas Me Chauffer", caseAvant));
    } else {
      log.push(`RAGE sans effet sur Titan ${defenderId} (aucune ressource à prendre).`);
    }
  } else if (canDil(defenderId, gameState)) {
    decisions.push(makeDecisionRequest("DIL", attackerId, defenderId, "Faut Pas Me Chauffer", caseAvant));
  } else {
    log.push(`DIL impossible sur Titan ${defenderId} (< 2 couleurs différentes en Repaire).`);
  }

  log.push(
    `${mode} — Titan ${defenderId} projeté de ${nTargets + 1} case(s) → ${defender.cell}` +
      (landing.hasBounced ? " (après rebond)" : "")
  );

  if (bagarreSet.size > 0) {
    attacker.bagarre = (attacker.bagarre || 0) + bagarreSet.size;
    log.push(`+${bagarreSet.size} Bagarre (Titan ${attackerId} → ${attacker.bagarre}) — ${bagarreSet.size} Titan(s) distinct(s) déplacé(s) (direct + chaîne, FAQ #12).`);
  }

  return { log, decisions, applied: true, mode };
}

/* ============================================================
   SCORING FINAL (brique ajoutée cette session)
   ============================================================
   SCORE = Barème (Bleu/Rose/Orange/Rouge) + Bonus Rose (+10, plus grand,
   égalité divisée) + Socles (somme des valeurs) + Trophée Collectionneur
   (+5) + Trophée Arc-en-ciel (+5) + Classement Pistes ADN (Bagarre et
   Destruction, indépendants) + 3 pts par Adrénaline restante.

   Vert : placement secret bloc par bloc, en Barème couleur (si le joueur
   possède déjà ≥1 bloc RÉEL de cette couleur — hors bonus Vert — et sans
   dépasser le max du barème) OU en Piste ADN (Bagarre ou Destruction,
   sans plafond).
============================================================ */

const BAREME = {
  bleu: [1, 3, 5, 7, 10, 15, 20, 25, 30],
  rose: [2, 4, 6, 8, 11, 14, 17, 20],
  rouge: [3, 7, 11, 16, 22],
};
// Orange : scoring par PAIRES exactes (impair = perte du bloc surnuméraire).
const BAREME_ORANGE_PAIRES = [5, 11, 18, 26]; // 1, 2, 3, 4 paires

const STANDARD_COLORS = ["bleu", "rose", "orange", "rouge", "vert"];

function scoreBareme(color, count) {
  if (count <= 0) return 0;
  if (color === "orange") {
    const pairs = Math.floor(count / 2);
    if (pairs === 0) return 0;
    return BAREME_ORANGE_PAIRES[Math.min(pairs, BAREME_ORANGE_PAIRES.length) - 1];
  }
  const scale = BAREME[color];
  if (!scale) return 0;
  return scale[Math.min(count, scale.length) - 1];
}

// Classement avec égalité : le(s) titan(s) à égalité partagent tous les
// points du rang le plus BAS de leur groupe (ex. deux 1ers ex aequo →
// chacun reçoit les points du 2e rang, pas du 1er). Confirmé Nikola.
//
// Ruling ajouté le 2026-08-15 : « une Piste ADN à 0 compte bien pour 0 ».
// Le classement ne regardait que les rangs, jamais les valeurs. À 3 Titans,
// une partie où personne n'avait fait la moindre Bagarre laissait les trois
// ex aequo au dernier rang possible — c'est-à-dire le 3e, qui vaut 1 point —
// et chacun repartait avec 1 point pour n'avoir strictement rien accompli.
// À 4 Titans le cas se noyait, le 4e rang valant déjà 0 : le défaut ne se
// voyait qu'à 3. Une piste où l'on n'a rien fait ne vaut désormais rien,
// quel que soit le nombre de joueurs. Le classement des autres n'est pas
// modifié : les Titans à 0 gardent leur place dans l'ordre, ils n'en tirent
// simplement aucun point.
const PODIUM_POINTS = [7, 3, 1, 0];
function rankWithTies(entries) {
  // entries: [{ id, value }]
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const result = {};
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j++;
    const pts = sorted[i].value > 0 ? PODIUM_POINTS[Math.min(j, PODIUM_POINTS.length - 1)] : 0;
    for (let k = i; k <= j; k++) result[sorted[k].id] = pts;
    i = j + 1;
  }
  return result;
}

function countRepaireColors(titan) {
  const counts = { bleu: 0, rose: 0, orange: 0, rouge: 0, vert: 0 };
  titan.repaire.forEach((c) => {
    if (counts[c] !== undefined) counts[c]++;
  });
  return counts;
}

// Calcule le score final complet de tous les Titans.
// vertAssignments : { [titanId]: [{ type: "color"|"adn", target }] } — un
// élément par bloc Vert du Repaire de ce Titan (placement secret).
// rainbowWinnerId : Titan déjà crédité du Trophée Arc-en-ciel en cours de
// partie (suivi live, cf. useEffect dans le composant), ou null.
function computeFinalScore(players, vertAssignments, rainbowWinnerId) {
  const baseCounts = {};
  players.forEach((t) => (baseCounts[t.id] = countRepaireColors(t)));

  // Applique les assignations Vert par-dessus les comptes de base.
  const adjCounts = {};
  const adjADN = {};
  players.forEach((t) => {
    adjCounts[t.id] = { ...baseCounts[t.id] };
    adjADN[t.id] = { bagarre: t.bagarre || 0, destruction: t.destruction || 0 };
  });
  players.forEach((t) => {
    const assigns = vertAssignments[t.id] || [];
    assigns.forEach((a) => {
      if (a.type === "color") {
        const ownsBase = baseCounts[t.id][a.target] >= 1; // condition : ≥1 bloc RÉEL de cette couleur
        if (!ownsBase) return; // Vert ignoré si condition non remplie
        /* AUCUN PLAFOND ICI — corrigé le 2026-08-18.
           Le compte était borné à la longueur du barème (9 Bleu, 8 Rose,
           5 Rouge, 4 paires d'Orange). Sur un Repaire déjà au maximum, le
           `Math.min` ne bornait pas l'ajout : il FAISAIT BAISSER le compte.
           Dix Bleu plus un Vert donnaient 9, soit un bloc de moins qu'avant
           d'ajouter quoi que ce soit. Le score final n'en souffrait pas —
           `scoreBareme` plafonne déjà de son côté — mais le tableau de
           décompte affichait un compte faux, et le bonus Rose, qui se joue
           au NOMBRE, se calculait sur ce compte rogné : un Titan à 9 Rose
           pouvait perdre les 10 points au profit d'un adversaire à 8.
           Le plafonnement est l'affaire du barème, pas du comptage. */
        adjCounts[t.id][a.target] += 1;
      } else if (a.type === "adn") {
        adjADN[t.id][a.target] = (adjADN[t.id][a.target] || 0) + 1;
      }
    });
  });

  const baremeScores = {};
  players.forEach((t) => {
    const c = adjCounts[t.id];
    baremeScores[t.id] = {
      bleu: scoreBareme("bleu", c.bleu),
      rose: scoreBareme("rose", c.rose),
      orange: scoreBareme("orange", c.orange),
      rouge: scoreBareme("rouge", c.rouge),
    };
  });

  // Bonus Rose +10 au plus grand nombre (compte ajusté Vert inclus),
  // égalité = divisé.
  const roseCounts = players.map((t) => ({ id: t.id, value: adjCounts[t.id].rose }));
  const maxRose = Math.max(0, ...roseCounts.map((r) => r.value));
  const roseWinners = maxRose > 0 ? roseCounts.filter((r) => r.value === maxRose).map((r) => r.id) : [];
  // Ruling Nikola : en cas d'égalité, le bonus est divisé puis arrondi à
  // l'inférieur. Sans arrondi, un partage à 3 donnait 3,333 points et le
  // score final affichait des virgules.
  const roseBonusEach = roseWinners.length > 0 ? Math.floor(10 / roseWinners.length) : 0;

  // Socles : somme des valeurs collectées.
  const socleTotal = {};
  players.forEach((t) => (socleTotal[t.id] = (t.socles || []).reduce((s, v) => s + v, 0)));

  // Trophée Collectionneur : + de Socles en NOMBRE (pas valeur) ; égalité
  // de nombre → valeur la plus haute ; égalité parfaite → divisé.
  const socleCounts = players.map((t) => ({ id: t.id, count: (t.socles || []).length, value: socleTotal[t.id] }));
  const maxCount = Math.max(0, ...socleCounts.map((s) => s.count));
  let collectionneurWinners = [];
  if (maxCount > 0) {
    const tiedByCount = socleCounts.filter((s) => s.count === maxCount);
    const maxVal = Math.max(...tiedByCount.map((s) => s.value));
    collectionneurWinners = tiedByCount.filter((s) => s.value === maxVal).map((s) => s.id);
  }
  // Même règle d'arrondi que le bonus Rose.
  const collectionneurBonusEach = collectionneurWinners.length > 0 ? Math.floor(5 / collectionneurWinners.length) : 0;

  // Pistes ADN — classements indépendants (comptes ajustés Vert inclus).
  const bagarreRank = rankWithTies(players.map((t) => ({ id: t.id, value: adjADN[t.id].bagarre })));
  const destructionRank = rankWithTies(players.map((t) => ({ id: t.id, value: adjADN[t.id].destruction })));

  const totals = {};
  players.forEach((t) => {
    const b = baremeScores[t.id];
    const roseBonus = roseWinners.includes(t.id) ? roseBonusEach : 0;
    const collBonus = collectionneurWinners.includes(t.id) ? collectionneurBonusEach : 0;
    const rainbowBonus = rainbowWinnerId === t.id ? 5 : 0;
    const bagarrePts = bagarreRank[t.id] || 0;
    const destructionPts = destructionRank[t.id] || 0;
    const adrenalinePts = 3 * (t.adrenaline || 0);
    const bareme = b.bleu + b.rose + b.orange + b.rouge;
    totals[t.id] = {
      bareme,
      baremeDetail: b,
      roseBonus,
      socles: socleTotal[t.id],
      collectionneurBonus: collBonus,
      rainbowBonus,
      bagarrePts,
      destructionPts,
      adrenalinePts,
      total: bareme + roseBonus + socleTotal[t.id] + collBonus + rainbowBonus + bagarrePts + destructionPts + adrenalinePts,
    };
  });

  return {
    adjCounts,
    adjADN,
    baremeScores,
    roseWinners,
    roseBonusEach,
    socleTotal,
    collectionneurWinners,
    collectionneurBonusEach,
    bagarreRank,
    destructionRank,
    totals,
  };
}

/* ============================================================
   CLASSEMENT FINAL ET DÉPARTAGE DES ÉGALITÉS
   ============================================================
   Ruling de Nikola du 2026-08-15, en réponse au cas remonté par la
   simulation : sur 150 parties à 3 Titans, une s'est terminée sur une
   égalité parfaite au sommet. Le moteur départageait alors par ordre
   d'identifiant, ce qui n'est une règle de rien du tout.

   L'ordre de départage, du plus fort au plus faible :
     1. le score total ;
     2. le plus de jetons Adrénaline restants ;
     3. le Socle de la plus haute VALEUR détenu — pas le total des socles,
        qui est déjà compté dans le score, mais la plus belle pièce ;
     4. la Force totale des cartes non jouées (main + programmées non
        résolues), la même notion de « carte non jouée » que la Fatigue.

   Si les quatre critères se valent, l'égalité est réelle et le jeu ne la
   départage pas : `exAequo` le signale à l'affichage plutôt que de
   désigner un vainqueur au hasard.
============================================================ */
function forceCartesNonJouees(titan) {
  return getNonPlayedPool(titan).reduce((somme, id) => somme + (CARD_FORCE[id] || 0), 0);
}

function classementFinal(players, totals) {
  const lignes = players.map((t) => ({
    id: t.id,
    total: totals[t.id]?.total ?? 0,
    adrenaline: t.adrenaline || 0,
    meilleurSocle: Math.max(0, ...(t.socles || [])),
    forceNonJouee: forceCartesNonJouees(t),
  }));

  lignes.sort(
    (a, b) =>
      b.total - a.total ||
      b.adrenaline - a.adrenaline ||
      b.meilleurSocle - a.meilleurSocle ||
      b.forceNonJouee - a.forceNonJouee
  );

  // Un Titan est ex aequo s'il reste indépartageable d'un voisin de
  // classement sur les quatre critères.
  const memeRang = (a, b) =>
    a.total === b.total &&
    a.adrenaline === b.adrenaline &&
    a.meilleurSocle === b.meilleurSocle &&
    a.forceNonJouee === b.forceNonJouee;

  return lignes.map((ligne, i) => ({
    ...ligne,
    rang: i + 1,
    exAequo:
      (i > 0 && memeRang(ligne, lignes[i - 1])) ||
      (i < lignes.length - 1 && memeRang(ligne, lignes[i + 1])),
  }));
}

// Badge image réutilisable pour tous les emplacements hors plateau 2D
// (config, bandeau ressources, bannière Titan actif, panneau sélectionné) —
// remplace les anciens badges "T1/T2/T3/T4" texte sur fond dégradé par le
// sprite du Titan (fix session, demande Nikola). `size` = côté du badge en
// px ; le sprite garde son ratio d'aspect propre à l'intérieur.

export {
  STOCK_INITIAL,
  COULEURS,
  COLOR_HEX,
  ROWS,
  BUILDING_ROWS,
  BUILDING_COLS,
  socleMarker,
  getCasesRepliDebris,
  appliquerReplElement,
  isSocleMarker,
  socleValue,
  estSurLePlateau,
  indexerTitans,
  rentrerEnJeu,
  isBuildingCell,
  countStandingBuildings,
  countColorOnBoard,
  countActiveTeleporters,
  checkEndGameTriggers,
  manchesMax,
  shuffle,
  buildBag,
  getQuadrant,
  generateBoard,
  CORNERS,
  TITAN_GRADIENT,
  ACTION_CARDS,
  CARD_LABEL,
  PHASES,
  getActivePhases,
  PHASE_LABELS,
  EVENT_NAMES,
  CARD_FORCE,
  placeTitans,
  nextDetonateur,
  rowIndex,
  rowFromIndex,
  getPerimeter,
  computeEnergyToutCasser,
  releaseSocle,
  projectInDirection,
  resolveToutCasserBatiments,
  resolveToutCasserBlocs,
  resolveToutCasserTitans,
  resolveToutCasserAmas,
  resolveToutCasser,
  computeEnergieParDistance,
  PORTEE_TETE_EN_AVANT,
  resolveTeteEnAvant,
  resolveGraouhhh,
  isLanterneRouge,
  getJeNePartagePasPool,
  resolveJeNePartagePas,
  PORTEE_BOING_BOING,
  chebyshevDistance,
  getBoingBoingReach,
  resolveBoingBoing,
  getEcroulementCells,
  resolveEcroulementAmas,
  canRage,
  canDil,
  SOCLE_OPTION,
  getDilOptions,
  retirerSocleAuSort,
  DESTINATION_BLOC_PERDU,
  destinationBlocPerdu,
  makeDecisionRequest,
  getActiveTeleporterCells,
  getFreeAdjacentCells,
  getMovementReachable,
  getMovePath,
  resolveFreeMovement,
  getRecuperationPool,
  resolveRecuperation,
  programCards,
  discardCardHidden,
  getNonPlayedPool,
  sendCardToOwnRepos,
  resolveVolPhaseRepos,
  resolveFatigue,
  applyRestitution,
  getProgrammedSum,
  getFPMCTargets,
  resolveFautPasMeChauffer,
  retirerPileVide,
  releverPercussion,
  BAREME,
  BAREME_ORANGE_PAIRES,
  STANDARD_COLORS,
  scoreBareme,
  PODIUM_POINTS,
  rankWithTies,
  countRepaireColors,
  computeFinalScore,
  forceCartesNonJouees,
  classementFinal
};
