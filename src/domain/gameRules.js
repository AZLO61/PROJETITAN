
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

const STOCK_INITIAL = { bleu: 19, rose: 12, orange: 11, rouge: 7 };
const COULEURS = ["bleu", "rose", "orange", "rouge"];
const COLOR_HEX = {
  bleu: "#2D8DF5",
  rose: "#EC4899",
  orange: "#FB923C",
  rouge: "#EF4444",
  vert: "#22C55E",
};

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

function checkEndGameTriggers(board, looseBlocks, apocalypseThreshold) {
  const reasons = [];
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
    const targetHeight = 3 + Math.floor(Math.random() * 2); // 3 ou 4
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
    const targetHeight = Math.floor(Math.random() * 5); // 0 à 4
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
  const detonateurManche1 = ordreJeu[Math.floor(Math.random() * ordreJeu.length)];
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

function projectInDirection(fromRow, fromCol, dr, dc, energy, ctx) {
  // ctx = { board, looseBlocks, titans, log? } — log est optionnel : si
  // fourni (tableau du resolver appelant), les messages de chaîne s'y
  // ajoutent directement ; sinon un tableau jetable est utilisé.
  const { board, looseBlocks, titans } = ctx;
  const log = ctx.log || [];

  const titansByCell = {};
  titans.forEach((t) => (titansByCell[t.cell] = t.id));

  let r = rowIndex(fromRow);
  let c = fromCol;
  let remaining = energy;
  let curDr = dr;
  let curDc = dc;
  let hasBounced = false;

  while (remaining > 0) {
    let nr = r + curDr;
    let nc = c + curDc;
    const outOfBounds = nr < 0 || nr > 8 || nc < 1 || nc > 9;

    if (outOfBounds) {
      if (remaining >= 4) {
        // Faille spatio-temporelle : ressort du bord opposé, poursuit sa trajectoire
        if (nr < 0) nr = 8;
        else if (nr > 8) nr = 0;
        if (nc < 1) nc = 9;
        else if (nc > 9) nc = 1;
        r = nr;
        c = nc;
        remaining -= 1;
        continue;
      }
      if (!hasBounced) {
        hasBounced = true;
        curDr = -curDr;
        curDc = -curDc;
        continue; // rebond gratuit, ne consomme pas d'énergie
      }
      break; // 2e obstacle → arrêt sur la case adjacente courante
    }

    const nextKey = rowFromIndex(nr) + nc;
    const bldg = board[nextKey];
    const isWall = bldg && bldg.blocks && bldg.blocks.length > 0;

    if (isWall) {
      // Bâtiment = mur en plein vol (règle "Bâtiment comme mur"), même
      // traitement qu'un bord de plateau.
      if (!hasBounced) {
        hasBounced = true;
        curDr = -curDr;
        curDc = -curDc;
        continue;
      }
      break; // arrêt sur la case actuelle (r, c)
    }

    const remainingAfterArrival = remaining - 1;
    const occupantTitanId = titansByCell[nextKey];
    const stack = looseBlocks[nextKey];

    if (occupantTitanId) {
      if (remainingAfterArrival <= 1) {
        log.push(
          `${nextKey} : Titan ${occupantTitanId} déjà présent — poussée impossible (énergie restante ${remainingAfterArrival}) → arrêt en ${rowFromIndex(r)}${c}.`
        );
        break; // reste sur la case actuelle (r, c) — case adjacente
      }
      const occupant = titans.find((t) => t.id === occupantTitanId);
      const pushed = projectInDirection(rowFromIndex(nr), nc, curDr, curDc, remainingAfterArrival, ctx);
      occupant.cell = pushed.row + pushed.col;
      if (ctx.bagarreSet) ctx.bagarreSet.add(occupantTitanId); // FAQ #12 : Titan distinct déplacé en chaîne
      log.push(
        `${nextKey} : réaction en chaîne — Titan ${occupantTitanId} repoussé vers ${occupant.cell} (énergie transmise ${remainingAfterArrival}).`
      );
      r = nr;
      c = nc;
      remaining = 0; // l'élément arrivant prend la place libérée
      break;
    }

    if (stack && stack.length === 1) {
      if (remainingAfterArrival <= 1) {
        // Accumulation par défaut (Formation d'Amas) : pas de poussée.
        r = nr;
        c = nc;
        remaining = 0;
        break;
      }
      const pushedColor = stack.pop();
      const pushed = projectInDirection(rowFromIndex(nr), nc, curDr, curDc, remainingAfterArrival, ctx);
      const pushedKey = pushed.row + pushed.col;
      if (!looseBlocks[pushedKey]) looseBlocks[pushedKey] = [];
      looseBlocks[pushedKey].push(pushedColor);
      log.push(
        `${nextKey} : réaction en chaîne — bloc ${pushedColor} transmis vers ${pushedKey} (énergie ${remainingAfterArrival}).`
      );
      r = nr;
      c = nc;
      remaining = 0;
      break;
    }

    if (stack && stack.length >= 2) {
      // Amas déjà en place : accumulation par défaut (Formation), pas de
      // Patatras automatique ici (mécanique de carte à part, Seuil 4).
      r = nr;
      c = nc;
      remaining = 0;
      break;
    }

    // Case libre : on avance normalement.
    r = nr;
    c = nc;
    remaining -= 1;
  }
  return { row: rowFromIndex(r), col: c, energyLeft: remaining, hasBounced, log };
}



function resolveToutCasserBatiments(titanId, gameState, adrenalineBonus = 0) {
  const { board, titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titanRow = titan.cell[0];
  const titanCol = Number(titan.cell.slice(1));
  const perimeter = getPerimeter(titanRow, titanCol);
  const titansByCell = {};
  titans.forEach((t) => (titansByCell[t.cell] = t.id));
  const energie = computeEnergyToutCasser(perimeter, board, titansByCell, adrenalineBonus);
  const seuil4 = energie >= 4;

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
    const landing = projectInDirection(cell.row, cell.col, dr, dc, energie, { board, looseBlocks, titans, log });
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

function resolveToutCasserBlocs(titanId, gameState, adrenalineBonus = 0) {
  // Sous-cas "Bloc de béton" — matrice : cond. vide = s'applique quel que
  // soit le niveau d'énergie (contrairement au Bâtiment qui exige Seuil 4).
  const { board, titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titanRow = titan.cell[0];
  const titanCol = Number(titan.cell.slice(1));
  const perimeter = getPerimeter(titanRow, titanCol);
  const titansByCell = {};
  titans.forEach((t) => (titansByCell[t.cell] = t.id));
  const energie = computeEnergyToutCasser(perimeter, board, titansByCell, adrenalineBonus);

  const log = [];
  for (const cell of perimeter) {
    if (cell.isSelf) continue;
    const key = cell.row + cell.col;
    const stack = looseBlocks[key];
    if (!stack || stack.length === 0) continue;

    const projected = stack.pop(); // le bloc du dessus de la pile libre
    const dr = rowIndex(cell.row) - rowIndex(titanRow);
    const dc = cell.col - titanCol;
    const landing = projectInDirection(cell.row, cell.col, dr, dc, energie, { board, looseBlocks, titans, log });
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

function resolveToutCasserTitans(titanId, gameState, adrenalineBonus = 0) {
  // Sous-cas "Titan" — déplacement physique + résolution DIL/RAGE via le
  // moteur générique de décision (§1bis du tracker).
  const { board, titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titanRow = titan.cell[0];
  const titanCol = Number(titan.cell.slice(1));
  const perimeter = getPerimeter(titanRow, titanCol);
  const titansByCell = {};
  titans.forEach((t) => (titansByCell[t.cell] = t.id));
  const energie = computeEnergyToutCasser(perimeter, board, titansByCell, adrenalineBonus);
  const seuil4 = energie >= 4;

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
    const landing = projectInDirection(cell.row, cell.col, dr, dc, energie, { board, looseBlocks, titans, log, bagarreSet });
    target.cell = landing.row + landing.col; // mutation directe (re-render forcé côté UI)
    bagarreSet.add(targetId);

    if (seuil4) {
      if (canRage(targetId, gameState)) {
        decisions.push(makeDecisionRequest("RAGE", titanId, targetId, "Tout Casser"));
      } else {
        log.push(`${key} : RAGE impossible sur Titan ${targetId} (< 2 ressources en Repaire).`);
      }
    } else if (canDil(targetId, gameState)) {
      decisions.push(makeDecisionRequest("DIL", titanId, targetId, "Tout Casser"));
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

function resolveToutCasserAmas(titanId, gameState, adrenalineBonus = 0) {
  // Sous-cas "Amas de béton" (Patatras) — Seuil 4 requis.
  // Amas = 2+ blocs libres empilés sur une même case (jamais un bâtiment,
  // confirmé Nikola). Éjection du haut vers le bas, direction opposée à
  // la percussion (= même direction radiale que les autres sous-cas),
  // distance = hauteur du bloc dans la pile (pas l'énergie de la carte).
  const { board, titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titanRow = titan.cell[0];
  const titanCol = Number(titan.cell.slice(1));
  const perimeter = getPerimeter(titanRow, titanCol);
  const titansByCell = {};
  titans.forEach((t) => (titansByCell[t.cell] = t.id));
  const energie = computeEnergyToutCasser(perimeter, board, titansByCell, adrenalineBonus);
  const seuil4 = energie >= 4;

  const log = [];
  if (!seuil4) {
    log.push(`Énergie ${energie} < Seuil 4 — aucun Patatras déclenché.`);
    return { energie, seuil4, log };
  }

  for (const cell of perimeter) {
    if (cell.isSelf) continue;
    const key = cell.row + cell.col;
    const stack = looseBlocks[key];
    if (!stack || stack.length < 2) continue; // pas d'Amas (2 blocs minimum)

    const dr = rowIndex(cell.row) - rowIndex(titanRow);
    const dc = cell.col - titanCol;
    const ejected = [...stack]; // bas (index 0) → sommet (dernier index)
    looseBlocks[key] = []; // Amas consommé par l'écroulement

    for (let i = ejected.length - 1; i >= 0; i--) {
      const blockColor = ejected[i];
      const hauteur = i + 1; // position dans la pile = hauteur = distance de projection
      const landing = projectInDirection(cell.row, cell.col, dr, dc, hauteur, { board, looseBlocks, titans, log });
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
  // Enchaîne les 4 sous-cas de la carte 01 · Tout Casser.
  const r1 = resolveToutCasserBatiments(titanId, gameState, adrenalineBonus);
  const r2 = resolveToutCasserBlocs(titanId, gameState, adrenalineBonus);
  const r3 = resolveToutCasserTitans(titanId, gameState, adrenalineBonus);
  const r4 = resolveToutCasserAmas(titanId, gameState, adrenalineBonus);
  return {
    energie: r1.energie,
    seuil4: r1.seuil4,
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
  const base = portee + (adrenalineUtilisee ? 1 : 0);
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
  const { board, titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titansByCell = {};
  titans.forEach((t) => (titansByCell[t.cell] = t.id));

  const startRowIdx = rowIndex(titan.cell[0]);
  const startCol = Number(titan.cell.slice(1));
  const maxRange = PORTEE_TETE_EN_AVANT + (useAdrenaline ? 1 : 0);
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
        const landing = projectInDirection(row, cIdx, -dr, -dc, energie, { board, looseBlocks, titans, log });
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

    if (hasAmas) {
      if (seuil4) {
        const ejected = [...stack];
        looseBlocks[key] = [];
        for (let i = ejected.length - 1; i >= 0; i--) {
          const blockColor = ejected[i];
          const hauteur = i + 1;
          const landing = projectInDirection(row, cIdx, -dr, -dc, hauteur, { board, looseBlocks, titans, log });
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

    if (occupantId && occupantId !== titanId) {
      const mode = seuil4 ? "RAGE" : "DIL";
      if (seuil4) {
        if (canRage(occupantId, gameState)) {
          decisions.push(makeDecisionRequest("RAGE", titanId, occupantId, "Tête en Avant"));
        } else {
          log.push(`${key} : RAGE impossible sur Titan ${occupantId} (< 2 ressources en Repaire).`);
        }
      } else if (canDil(occupantId, gameState)) {
        decisions.push(makeDecisionRequest("DIL", titanId, occupantId, "Tête en Avant"));
      } else {
        log.push(`${key} : DIL impossible sur Titan ${occupantId} (< 2 couleurs différentes en Repaire).`);
      }
      bagarreSet.add(occupantId);
      log.push(`${key} : Titan ${occupantId} percuté (${mode}, énergie ${energie}).`);
      if (seuil4) {
        const landing = projectInDirection(row, cIdx, dr, dc, energie, { board, looseBlocks, titans, log, bagarreSet });
        const occupant = titans.find((t) => t.id === occupantId);
        occupant.cell = landing.row + landing.col;
        log.push(`${key} : Titan ${occupantId} projeté vers ${occupant.cell}` + (landing.hasBounced ? " (après rebond)" : ""));
      }
      titan.cell = lastFreeCell;
      log.push(`Titan ${titanId} s'arrête en ${lastFreeCell} (collision avec Titan ${occupantId}).`);
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
  const { board, titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const titansByCell = {};
  titans.forEach((t) => (titansByCell[t.cell] = t.id));

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
  for (let i = touched.length - 1; i >= 0; i--) {
    const t = touched[i];
    const occupant = titans.find((x) => x.id === t.id);
    const landing = projectInDirection(t.row, t.col, dr, dc, reculDistance, { board, looseBlocks, titans, log, bagarreSet });
    occupant.cell = landing.row + landing.col;
    bagarreSet.add(t.id);
    const dilOk = canDil(t.id, gameState);
    if (dilOk) decisions.push(makeDecisionRequest("DIL", titanId, t.id, "Graouhhh"));
    const fatigue = resolveFatigue(titanId, t.id, mancheNumber, titans);
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
    // FAQ #11 (livret V35, cas OUVERT) tranchée le 2026-08-11 : le bonus
    // est plafonné à +1 Adrénaline, quel que soit le nombre de Titans
    // touchés au-delà de 2 (3 ou 4 Titans touchés ne donnent toujours
    // que +1, pas +2/+3). Ne pas multiplier par touched.length.
    titan.adrenaline = (titan.adrenaline || 0) + 1;
    log.push(`Bonus : ${touched.length} Titans touchés (≥2) → +1 Adrénaline fixe et plafonné (FAQ #11 tranchée) — Titan ${titanId} stock ${titan.adrenaline}.`);
  }

  return { log, titansTouches: touched.map((t) => t.id), decisions };
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
    if (stack.length === 0 && key !== titan.cell) {
      const destBldg = gameState.board && gameState.board[key];
      const isStandingBuilding = destBldg && destBldg.blocks && destBldg.blocks.length > 0;
      if (!isStandingBuilding) {
        titan.cell = key;
        log.push(`${key} : case libérée → Titan ${titanId} s'y déplace obligatoirement.`);
      }
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

function resolveBoingBoing(titanId, destKey, useAdrenaline, mancheNumber, gameState) {
  const { board, titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const originRowIdx = rowIndex(titan.cell[0]);
  const originCol = Number(titan.cell.slice(1));
  const destRow = destKey[0];
  const destRowIdx = rowIndex(destRow);
  const destCol = Number(destKey.slice(1));
  const log = [];

  const maxRange = PORTEE_BOING_BOING + (useAdrenaline ? 1 : 0);
  const distance = chebyshevDistance(originRowIdx, originCol, destRowIdx, destCol);
  if (distance === 0 || distance > maxRange) {
    log.push(`⚠️ Destination invalide (distance ${distance}, max ${maxRange}).`);
    return { log, applied: false, decisions: [] };
  }

  const bldg = board[destKey];
  if (bldg && bldg.blocks.length > 0) {
    // Ruling confirmé Nikola (session) : un Bâtiment sert de "saute-mouton"
    // pour Boing Boing (obstacle ignoré en vol, cohérent avec "tous azimuts
    // · obstacles ignorés") — mais on ne peut jamais S'ARRÊTER dessus.
    log.push(`${destKey} : Bâtiment — saute-mouton autorisé en vol, mais atterrissage interdit dessus (confirmé Nikola). Destination refusée.`);
    return { log, applied: false, decisions: [] };
  }

  const titansByCell = {};
  titans.forEach((t) => (titansByCell[t.cell] = t.id));
  const energie = computeEnergieParDistance(PORTEE_BOING_BOING, useAdrenaline, distance);
  const seuil4 = energie >= 4;

  const stack = looseBlocks[destKey];
  const occupantId = titansByCell[destKey];
  const decisions = [];

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
    const landing = projectInDirection(destRow, destCol, dirR, dirC, energie, { board, looseBlocks, titans, log, bagarreSet });
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
      const freeAdj = getFreeAdjacentCells(destKey, board, titansByCell, looseBlocks);
      if (freeAdj.length > 0) {
        landingKey = freeAdj[0]; // TODO : choix explicite de l'attaquant (UI) — auto-pick en attendant
        log.push(`${destKey} : Titan ${occupantId} coincé (rebond avant/arrière bloqués) → éjecté sur case libre adjacente ${landingKey} (auto-sélection, choix attaquant à câbler en UI).`);
      } else {
        log.push(`${destKey} : Titan ${occupantId} totalement coincé (aucune case libre adjacente) — destination refusée.`);
        return { log, applied: false, decisions: [] };
      }
    }
    target.cell = landingKey;
    // Boing Boing ne badge PAS de RAGE au Seuil 4 (contrairement à Tout
    // Casser/Tête en Avant) — seul "Tombe sur la case" change
    // mécaniquement. Le sous-cas Titan est donc toujours un DIL.
    const dilOk = canDil(occupantId, gameState);
    if (dilOk) decisions.push(makeDecisionRequest("DIL", titanId, occupantId, "Boing Boing"));
    const fatigue = resolveFatigue(titanId, occupantId, mancheNumber, titans);
    titan.bagarre += bagarreSet.size;
    log.push(
      `${destKey} : Titan ${occupantId} percuté (énergie ${energie}${seuil4 ? ", Seuil 4" : ""}) → ${fatigue.ok ? fatigue.log : `Fatigue impossible (${fatigue.reason})`} · ${dilOk ? "DIL en attente" : "DIL impossible (< 2 couleurs différentes en Repaire)"} · +${bagarreSet.size} Bagarre (Titan ${titanId} → ${titan.bagarre}, FAQ #12) · projeté vers ${target.cell}` +
        (landing.hasBounced ? " (après rebond)" : "")
    );
    titan.cell = destKey;
    log.push(`Titan ${titanId} prend la place de Titan ${occupantId} en ${destKey}.`);
    if (stack && stack.length > 0) {
      log.push(`${destKey} : ${stack.length} débris au sol laissé(s) en place — utilisable ensuite via "Ramasser" (passif Récupération).`);
    }
  } else if (stack && stack.length >= 2) {
    // Amas de béton → écroulement immédiat (règle déjà dans le livret,
    // section "Cas spécial — Boing Boing sur Amas de béton").
    const dRow = rowIndex(destRow);
    const adjCells = [];
    for (let ddr = -1; ddr <= 1; ddr++) {
      for (let ddc = -1; ddc <= 1; ddc++) {
        if (ddr === 0 && ddc === 0) continue;
        const nr = dRow + ddr;
        const nc = destCol + ddc;
        if (nr < 0 || nr > 8 || nc < 1 || nc > 9) continue;
        adjCells.push(rowFromIndex(nr) + nc);
      }
    }
    const ejected = [...stack]; // bas → sommet
    looseBlocks[destKey] = [];
    let idx = 0;
    for (let i = ejected.length - 1; i >= 0; i--, idx++) {
      const color = ejected[i];
      const target = adjCells.length > 0 ? adjCells[idx % adjCells.length] : destKey;
      if (!looseBlocks[target]) looseBlocks[target] = [];
      looseBlocks[target].push(color);
      log.push(`${destKey} : écroulement — bloc ${color} distribué vers ${target}.`);
    }
    titan.cell = destKey;
    log.push(`Titan ${titanId} atterrit en ${destKey} (Amas balayé).`);
  } else if (stack && stack.length === 1) {
    const picked = stack.pop();
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
  // FAQ #5 (tranchée) : si Repaire < 2, l'Adrénaline de la cible s'ajoute
  // au compte et devient elle-même une ressource ciblable par RAGE.
  return t.repaire.length + (t.adrenaline || 0) >= 2;
}

// Bug #9 (tracker) : DIL exige que l'attaquant désigne 2 couleurs
// DIFFÉRENTES du Repaire du défenseur (cf. ATTACKER_PICK en UI). Si le
// défenseur n'a pas au moins 2 couleurs distinctes en Repaire, l'action
// est structurellement impossible à résoudre — jusqu'ici la décision
// DIL était quand même enfilée dans decisionQueue, ce qui bloquait la
// partie sur une décision qu'on ne peut jamais valider (le bouton
// "Valider" reste désactivé indéfiniment, aucune sortie possible).
// Même garde-fou que canRage() ci-dessus, appliqué au cas DIL.
function canDil(defenderId, gameState) {
  const t = gameState.titans.find((x) => x.id === defenderId);
  return new Set(t.repaire).size >= 2;
}

function makeDecisionRequest(type, attackerId, defenderId, cardLabel) {
  return { type, attackerId, defenderId, cardLabel };
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

function resolveRecuperation(titanId, cellKey, gameState) {
  const { titans, looseBlocks } = gameState;
  const titan = titans.find((t) => t.id === titanId);
  const stack = looseBlocks[cellKey];
  const log = [];
  if (!stack || stack.length === 0) {
    log.push(`⚠️ ${cellKey} : aucun bloc libre — Récupération annulée.`);
    return { log, applied: false };
  }
  const picked = stack.pop();
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
  if (stack.length === 0 && cellKey !== titan.cell) {
    const destBldg = gameState.board && gameState.board[cellKey];
    const isStandingBuilding = destBldg && destBldg.blocks && destBldg.blocks.length > 0;
    if (!isStandingBuilding) {
      titan.cell = cellKey;
      log.push(`${cellKey} : case libérée → Titan ${titanId} s'y déplace obligatoirement.`);
    }
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
  // "Carte non jouée" = encore en main OU encore dans le pool programmé
  // (pas encore résolue), à l'exclusion de ce qui est déjà dans
  // playedThisManche.
  return [...titan.hand, ...titan.programmed];
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
    const cardId = pool[Math.floor(Math.random() * pool.length)];
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
  const cardId = pool[Math.floor(Math.random() * pool.length)];
  sendCardToOwnRepos(target, cardId, mancheNumber, false);
  return {
    ok: true,
    log: `Fatigue (Titan ${attackerId} → Titan ${targetId}) : carte ${CARD_LABEL[cardId]} piochée au hasard, face cachée, indisponible en Zone Repos (Titan ${targetId}) jusqu'à la Manche ${mancheNumber + 1}.`,
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
  const titansByCell = {};
  titans.forEach((t) => (titansByCell[t.cell] = t.id));
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
const PODIUM_POINTS = [7, 3, 1, 0];
function rankWithTies(entries) {
  // entries: [{ id, value }]
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const result = {};
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j++;
    const pts = PODIUM_POINTS[Math.min(j, PODIUM_POINTS.length - 1)];
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
        if (a.target === "orange") {
          adjCounts[t.id].orange = Math.min(adjCounts[t.id].orange + 1, BAREME_ORANGE_PAIRES.length * 2);
        } else {
          const scale = BAREME[a.target];
          if (scale) adjCounts[t.id][a.target] = Math.min(adjCounts[t.id][a.target] + 1, scale.length);
        }
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
  const roseBonusEach = roseWinners.length > 0 ? 10 / roseWinners.length : 0;

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
  const collectionneurBonusEach = collectionneurWinners.length > 0 ? 5 / collectionneurWinners.length : 0;

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
  isSocleMarker,
  socleValue,
  isBuildingCell,
  countStandingBuildings,
  countColorOnBoard,
  countActiveTeleporters,
  checkEndGameTriggers,
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
  resolveBoingBoing,
  canRage,
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
  BAREME,
  BAREME_ORANGE_PAIRES,
  STANDARD_COLORS,
  scoreBareme,
  PODIUM_POINTS,
  rankWithTies,
  countRepaireColors,
  computeFinalScore
};
