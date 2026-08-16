/* ============================================================
   PROJET TITAN — Évaluation d'une position par l'IA
   ============================================================
   PRINCIPE FONDATEUR

   L'IA ne dispose d'aucune table de poids écrite à la main. Elle appelle
   `computeFinalScore`, c'est-à-dire le VRAI barème du jeu, et lit ce
   qu'elle marquerait si la partie s'arrêtait à cet instant.

   C'est le choix structurant de ce module, et il vaut d'être justifié.
   Une table de poids du genre « un bloc Bleu vaut 3 » serait fausse par
   construction, parce que la valeur d'un bloc dans Projet Titan n'est pas
   constante : elle est MARGINALE. Sur le barème Bleu [1,3,5,7,10,15,20,
   25,30], passer de 1 à 2 blocs rapporte 2 points, passer de 5 à 6 en
   rapporte 5. Une IA qui ignore ça accumule bêtement ; une IA qui lit le
   barème sait quand une couleur cesse de payer et qu'il faut basculer
   ailleurs. Même raisonnement pour l'Orange, qui ne marque que par paires
   exactes : le bloc impair vaut littéralement zéro, et seule la vraie
   fonction de score le sait.

   Conséquence pratique : quand Nikola modifie un barème, l'IA se met à
   jour toute seule. Aucun réglage à répercuter à la main, aucune dérive
   possible entre les règles et le comportement des Titans robots.

   ------------------------------------------------------------
   LES DEUX AXES

   FORCE — combien l'IA regarde loin. Ce n'est PAS de la triche ni du
   hasard : les trois niveaux appellent la même fonction de score, ils
   n'en lisent pas la même quantité.
     · Novice    : le butin immédiat seulement (barème + Socles).
     · Confirmé  : le score complet, bonus Rose, trophées, Pistes ADN et
                   Adrénaline compris.
     · Expert    : le score complet MOINS celui du meilleur adversaire,
                   plus la valeur de ce qui est à sa portée. C'est ce
                   différentiel qui fait apparaître la nuisance : gêner
                   le leader devient spontanément rentable, sans qu'aucune
                   règle « embête l'adversaire » soit écrite.

   TEMPÉRAMENT — ce que l'IA préfère, à force égale. Un simple jeu de
   coefficients sur les composantes du score. Il incline le style sans
   rendre l'IA plus forte, ce qui est exactement le but : de la variété
   perçue, pas du déséquilibre.

   ------------------------------------------------------------
   LE CAS DU VERT

   Le Vert est le seul élément du jeu dont la valeur n'est pas lisible
   dans l'état de la partie : elle dépend d'un placement secret décidé au
   décompte final, en barème couleur ou en Piste ADN. Une IA qui ignore
   ça sous-estime ses propres Verts et néglige les téléporteurs.

   La solution retenue : l'IA calcule en permanence le placement qu'elle
   CHOISIRAIT si on lui demandait maintenant, et évalue ses Verts à cette
   valeur-là. C'est exactement le raisonnement d'un joueur humain qui
   garde en tête où il compte poser ses Verts.

   Deux qualités de calcul, selon l'usage — voir `bestVertAssignments` :
   glouton pendant la recherche de coup, où il est appelé des centaines
   de fois, exhaustif au moment de la vraie décision, où il n'est appelé
   qu'une fois et doit être juste.
============================================================ */

// Note : le placement des Verts est calculé sur le score complet, y
// compris pour un Novice qui, lui, n'en lira ensuite que le barème et les
// Socles. Ce n'est pas une incohérence : si le glouton envoie un Vert en
// Piste ADN, le Novice n'en tire rien, ce qui modélise assez fidèlement le
// débutant qui gâche son Vert.
import { computeFinalScore, isSocleMarker, scoreBareme, socleValue } from "./gameRules.js";
import { randomInt } from "./rng.js";

/* ── FORCE ────────────────────────────────────────────────── */

export const FORCES = Object.freeze({
  NOVICE: "novice",
  CONFIRME: "confirme",
  EXPERT: "expert",
});

export const FORCE_LABELS = Object.freeze({
  [FORCES.NOVICE]: "Novice",
  [FORCES.CONFIRME]: "Confirmé",
  [FORCES.EXPERT]: "Expert",
});

// `topN` est la molette de bruit : l'IA tire au sort parmi ses N meilleurs
// coups. Le Novice se trompe donc régulièrement, mais jamais absurdement —
// il choisit toujours dans le haut du panier. C'est ce qui distingue une
// IA faible crédible d'une IA qui joue au hasard, laquelle se repère
// immédiatement et casse l'illusion.
export const FORCE_SETTINGS = Object.freeze({
  [FORCES.NOVICE]: { voitScoreComplet: false, voitAdversaires: false, voitPortee: false, topN: 3 },
  [FORCES.CONFIRME]: { voitScoreComplet: true, voitAdversaires: false, voitPortee: true, topN: 2 },
  [FORCES.EXPERT]: { voitScoreComplet: true, voitAdversaires: true, voitPortee: true, topN: 1 },
});

/* ── TEMPÉRAMENT ──────────────────────────────────────────── */

export const TEMPERAMENTS = Object.freeze({
  AGRESSIF: "agressif",
  COLLECTIONNEUR: "collectionneur",
  OPPORTUNISTE: "opportuniste",
});

export const TEMPERAMENT_LABELS = Object.freeze({
  [TEMPERAMENTS.AGRESSIF]: "Agressif",
  [TEMPERAMENTS.COLLECTIONNEUR]: "Collectionneur",
  [TEMPERAMENTS.OPPORTUNISTE]: "Opportuniste",
});

// Coefficients appliqués aux composantes du score. Ils restent modérés
// à dessein : au-delà d'environ 1,6 le Titan devient monomaniaque et
// joue contre son propre score, ce qui se lit comme un bug et non comme
// un caractère.
export const TEMPERAMENT_WEIGHTS = Object.freeze({
  [TEMPERAMENTS.AGRESSIF]: { adn: 1.5, bareme: 0.9, socles: 0.9, adrenaline: 1.1, portee: 0.9 },
  [TEMPERAMENTS.COLLECTIONNEUR]: { adn: 0.7, bareme: 1.3, socles: 1.5, adrenaline: 1.0, portee: 1.0 },
  [TEMPERAMENTS.OPPORTUNISTE]: { adn: 1.0, bareme: 1.0, socles: 1.0, adrenaline: 1.3, portee: 1.5 },
});

const POIDS_NEUTRE = Object.freeze({ adn: 1, bareme: 1, socles: 1, adrenaline: 1, portee: 1 });

/** Un profil complet = une force et un tempérament. */
export function makeProfile(force = FORCES.CONFIRME, temperament = TEMPERAMENTS.OPPORTUNISTE) {
  return { force, temperament };
}

export function profileLabel(profile) {
  if (!profile) return "—";
  return `${FORCE_LABELS[profile.force] ?? profile.force} ${TEMPERAMENT_LABELS[profile.temperament] ?? profile.temperament}`;
}

/* ── PLACEMENT DES BLOCS VERT ─────────────────────────────── */

// Les six destinations possibles d'un bloc Vert. L'ordre compte : à
// valeur égale, c'est le premier de la liste qui est retenu, et le
// placement doit rester déterministe pour que deux simulations à graine
// égale donnent le même résultat.
const DESTINATIONS_VERT = Object.freeze([
  { type: "color", target: "bleu" },
  { type: "color", target: "rose" },
  { type: "color", target: "orange" },
  { type: "color", target: "rouge" },
  { type: "adn", target: "bagarre" },
  { type: "adn", target: "destruction" },
]);

function compterVert(titan) {
  return (titan?.repaire || []).filter((c) => c === "vert").length;
}

// Le livret interdit d'affecter un Vert à une couleur dont le Titan ne
// possède aucun bloc RÉEL. On écarte donc ces destinations d'emblée :
// elles ne rapporteraient rien et pollueraient le placement retourné
// d'une ligne trompeuse (« Vert → Bleu » chez un Titan sans Bleu).
function destinationsPour(titan) {
  const repaire = titan?.repaire || [];
  return DESTINATIONS_VERT.filter(
    (d) => d.type !== "color" || repaire.includes(d.target)
  );
}

// Toutes les répartitions de `nb` blocs sur les destinations ouvertes.
// Utilisé par le mode exact. On énumère les COMBINAISONS et non les
// arrangements : deux blocs Vert sont interchangeables, les permuter ne
// change rien au score. Le coût tombe de 6^4 = 1296 à 126 pour 4 blocs.
function combinaisonsVert(destinations, nb, depuis = 0) {
  if (nb === 0) return [[]];
  const out = [];
  for (let i = depuis; i < destinations.length; i++) {
    for (const reste of combinaisonsVert(destinations, nb - 1, i)) {
      out.push([destinations[i], ...reste]);
    }
  }
  return out;
}

function totalPour(titanId, titans, assignations) {
  return computeFinalScore(titans, assignations, null).totals[titanId]?.total ?? 0;
}

/**
 * Meilleur placement des Verts d'UN Titan, les autres Titans gardant le
 * placement qui leur est déjà attribué.
 *
 * Mode glouton (défaut) : place les blocs un par un, en gardant à chaque
 * fois la destination qui rapporte le plus. ~6 évaluations par bloc.
 * Il a un angle mort connu, l'Orange : un seul bloc Orange ne marque
 * rien, il faut la paire. Le glouton, qui juge bloc par bloc, ne voit
 * jamais le gain de la paire et écarte l'Orange. Erreur d'estimation
 * acceptable pendant la recherche de coup, pas au moment de décider.
 *
 * Mode exact : énumère toutes les répartitions. C'est celui à utiliser
 * pour le placement réel en fin de partie.
 */
export function bestVertAssignment(titanId, titans, { exact = false, autres = {} } = {}) {
  const moi = titans.find((t) => t.id === titanId);
  const nb = compterVert(moi);
  if (nb === 0) return [];
  const destinations = destinationsPour(moi);

  if (exact) {
    let meilleur = [];
    let meilleurScore = -Infinity;
    for (const combi of combinaisonsVert(destinations, nb)) {
      const score = totalPour(titanId, titans, { ...autres, [titanId]: combi });
      if (score > meilleurScore) {
        meilleurScore = score;
        meilleur = combi;
      }
    }
    return meilleur;
  }

  const choisis = [];
  for (let i = 0; i < nb; i++) {
    let meilleure = destinations[0];
    let meilleurScore = -Infinity;
    for (const dest of destinations) {
      const score = totalPour(titanId, titans, { ...autres, [titanId]: [...choisis, dest] });
      if (score > meilleurScore) {
        meilleurScore = score;
        meilleure = dest;
      }
    }
    choisis.push(meilleure);
  }
  return choisis;
}

/**
 * Placement supposé de TOUS les Titans, à passer à `computeFinalScore`.
 *
 * Approximation assumée : chaque Titan est optimisé à son tour, les
 * précédents étant figés. Les placements ne sont pas strictement
 * indépendants (le bonus Rose et les classements ADN se disputent), mais
 * l'écart est marginal et le coût d'un vrai calcul conjoint serait sans
 * commune mesure avec le gain.
 */
export function bestVertAssignments(titans, { exact = false } = {}) {
  const out = {};
  for (const t of titans) {
    out[t.id] = bestVertAssignment(t.id, titans, { exact, autres: out });
  }
  return out;
}

/* ── VALEUR DE CE QUI EST À PORTÉE ────────────────────────── */

// `computeFinalScore` ne voit que ce qui est DÉJÀ dans le Repaire. Elle
// est donc aveugle à « je suis planté à côté d'un tas de six blocs ».
// Sans ce terme, une IA reste immobile dès qu'aucun coup ne marque
// immédiatement. On mesure donc ce qu'il y a autour, fortement décoté :
// un bloc au sol n'est pas un bloc marqué, il faut encore le ramasser et
// survivre jusqu'au décompte.
const DECOTE_PORTEE = 0.35;

/* ── VALEUR D'UN TITAN SORTI DU RING ──────────────────────────
   Depuis le ruling du 2026-08-16, un Titan poussé hors de BIG CITY attend
   son tour pour rentrer, et sa rentrée lui mange son Mouvement gratuit.
   Éjecter un adversaire lui coûte donc, concrètement, un tour de jeu.

   `computeFinalScore` ne peut pas voir ça : sortir quelqu'un ne change
   aucun score, ni le sien ni le mien. Sans le terme ci-dessous, l'IA n'a
   littéralement aucune raison de le faire, alors que c'est devenu une des
   actions les plus fortes du jeu. C'est le même raisonnement que pour
   `valeurAPortee` : quand le barème est aveugle à une réalité de la
   partie, on l'écrit explicitement plutôt que de laisser l'IA jouer à
   côté du jeu.

   Chiffrage : sur les campagnes de référence, un gagnant marque ~45 points
   en 12 tours, soit ~3,75 points par tour. On retient 4, arrondi au plus
   proche — perdre son tour, c'est perdre à peu près ça. */
const VALEUR_TOUR_PERDU = 4;

export function valeurAPortee(titan, gameState, rayon = 2) {
  const { board = {}, looseBlocks = {} } = gameState;
  if (!titan?.cell) return 0;
  const r0 = "ABCDEFGHI".indexOf(titan.cell[0]);
  const c0 = Number(titan.cell.slice(1));
  if (r0 < 0 || Number.isNaN(c0)) return 0;

  // Un bloc alentour ne vaut pas « un bloc », il vaut ce qu'il ferait
  // GAGNER à ce Titan-là. Compter les quantités serait retomber dans le
  // travers des anciennes heuristiques : un Titan au barème Bleu saturé
  // courait vers un tas de trois Bleu à 0 point en laissant le Rouge qui
  // lui manquait. On mesure donc le gain marginal réel, couleur par
  // couleur.
  const compte = { bleu: 0, rose: 0, orange: 0, rouge: 0 };
  (titan.repaire || []).forEach((c) => {
    if (compte[c] !== undefined) compte[c]++;
  });
  const gainMarginal = (couleur) => {
    if (compte[couleur] === undefined) return 0; // le Vert, traité ailleurs
    return scoreBareme(couleur, compte[couleur] + 1) - scoreBareme(couleur, compte[couleur]);
  };

  const distanceA = (key) => {
    const r = "ABCDEFGHI".indexOf(key[0]);
    const c = Number(key.slice(1));
    if (r < 0 || Number.isNaN(c)) return Infinity;
    return Math.max(Math.abs(r - r0), Math.abs(c - c0));
  };

  let valeur = 0;
  for (const [key, blocs] of Object.entries(looseBlocks)) {
    const distance = distanceA(key);
    if (distance > rayon) continue;
    // Décroissance avec la distance : un tas à 2 cases vaut moins qu'un
    // tas sous les pieds, puisqu'un adversaire peut le prendre avant.
    const proximite = 1 / (1 + distance);
    for (const bloc of blocs || []) {
      const points = isSocleMarker(bloc) ? socleValue(bloc) : gainMarginal(bloc);
      valeur += points * proximite;
    }
  }

  // Les bâtiments debout à portée comptent aussi : ce sont les blocs de
  // demain, ceux qu'une action de destruction fera tomber. Décote
  // supplémentaire de moitié, il faut encore les abattre.
  for (const [key, bat] of Object.entries(board)) {
    if (!bat?.blocks?.length) continue;
    const distance = distanceA(key);
    if (distance > rayon) continue;
    const proximite = 1 / (1 + distance);
    for (const bloc of bat.blocks) {
      valeur += gainMarginal(bloc) * 0.5 * proximite;
    }
  }

  return valeur * DECOTE_PORTEE;
}

/* ── ÉVALUATION ───────────────────────────────────────────── */

/**
 * Note une position du point de vue d'un Titan. Plus c'est haut, mieux
 * c'est. L'unité est le point de victoire, ce qui rend les notes
 * directement lisibles au débogage : un écart de 7 entre deux coups, ce
 * sont bien 7 points d'écart attendus.
 *
 * @param {number} titanId
 * @param {{ board: object, looseBlocks: object, titans: Array }} gameState
 * @param {{ force: string, temperament: string }} profile
 */
export function evaluatePosition(titanId, gameState, profile = makeProfile()) {
  const { titans = [] } = gameState;
  const moi = titans.find((t) => t.id === titanId);
  if (!moi) return 0;

  const reglages = FORCE_SETTINGS[profile?.force] ?? FORCE_SETTINGS[FORCES.CONFIRME];
  const poids = TEMPERAMENT_WEIGHTS[profile?.temperament] ?? POIDS_NEUTRE;

  // Les Verts sont valorisés au placement que chacun choisirait s'il
  // devait décider maintenant (cf. « le cas du Vert » en en-tête). Mode
  // glouton : cette fonction est appelée une fois par coup candidat, le
  // mode exact y serait hors de prix.
  // Le trophée Arc-en-ciel reste à null : il est suivi en cours de partie
  // côté application et n'est pas reconstituable depuis le seul état de
  // plateau. L'IA l'ignore donc, c'est une sous-estimation de 5 points
  // identique pour tout le monde, donc sans effet sur le classement des
  // coups.
  const scores = computeFinalScore(titans, bestVertAssignments(titans), null);
  const mien = scores.totals[titanId];
  if (!mien) return 0;

  const noteDe = (detail) => {
    if (!detail) return 0;
    // Le Novice ne voit que le butin : ce qu'il tient en main et ce qu'il
    // a ramassé. Les bonus de fin de partie, les classements et
    // l'Adrénaline capitalisée lui échappent complètement — c'est
    // exactement l'erreur du joueur débutant, qui ramasse sans regarder
    // la piste ADN ni compter ses paires.
    if (!reglages.voitScoreComplet) {
      return detail.bareme * poids.bareme + detail.socles * poids.socles;
    }
    return (
      detail.bareme * poids.bareme +
      detail.roseBonus * poids.bareme +
      detail.socles * poids.socles +
      detail.collectionneurBonus * poids.socles +
      detail.rainbowBonus +
      (detail.bagarrePts + detail.destructionPts) * poids.adn +
      detail.adrenalinePts * poids.adrenaline
    );
  };

  let note = noteDe(mien);

  // Être soi-même hors du ring coûte un tour : tout profil doit chercher à
  // l'éviter, même le Novice, qui comprend très bien qu'il ne joue pas.
  if (moi.horsPlateau) note -= VALEUR_TOUR_PERDU;

  if (reglages.voitPortee) {
    note += valeurAPortee(moi, gameState) * poids.portee;
  }

  // Évaluation différentielle, réservée à l'Expert. C'est le seul vrai
  // saut qualitatif entre Confirmé et Expert : le Confirmé maximise son
  // score, l'Expert maximise son AVANCE. Un coup qui lui rapporte 3 mais
  // en coûte 6 au leader devient meilleur qu'un coup qui lui en rapporte
  // 5 sans gêner personne. Toute la nuisance émerge de là, sans qu'aucune
  // heuristique « attaque le premier » n'ait été écrite.
  if (reglages.voitAdversaires) {
    const adversaires = titans.filter((t) => t.id !== titanId);
    if (adversaires.length > 0) {
      const meilleurAdverse = Math.max(...adversaires.map((t) => noteDe(scores.totals[t.id])));
      note -= meilleurAdverse * 0.5;
      // Sortir un adversaire du ring lui coûte son tour. L'Expert, seul à
      // raisonner en différentiel, le valorise au même coefficient que le
      // reste de sa nuisance. Le tempérament Agressif y est plus sensible :
      // c'est exactement le genre de coup qu'il doit chercher.
      const ejectes = adversaires.filter((t) => t.horsPlateau).length;
      if (ejectes > 0) note += ejectes * VALEUR_TOUR_PERDU * 0.5 * poids.adn;
    }
  }

  return note;
}

/* ── CHOIX DU COUP ────────────────────────────────────────── */

/**
 * Choisit parmi des candidats déjà notés, en appliquant la molette de
 * bruit du profil. Les candidats sont des `{ note, ...donnéesDuCoup }`.
 *
 * L'Expert prend toujours le meilleur (topN = 1). Le Novice tire parmi
 * ses trois meilleurs, ce qui produit des erreurs plausibles plutôt que
 * des coups absurdes.
 */
export function chooseAmongBest(candidats, profile = makeProfile()) {
  if (!candidats || candidats.length === 0) return null;
  const reglages = FORCE_SETTINGS[profile?.force] ?? FORCE_SETTINGS[FORCES.CONFIRME];
  const tries = [...candidats].sort((a, b) => b.note - a.note);
  const fenetre = tries.slice(0, Math.max(1, Math.min(reglages.topN, tries.length)));
  return fenetre[randomInt(fenetre.length)];
}

/** Tous les profils possibles, pour le tirage à la mise en place et pour
 *  les campagnes de simulation qui balaient les combinaisons. */
export function allProfiles() {
  const out = [];
  for (const force of Object.values(FORCES)) {
    for (const temperament of Object.values(TEMPERAMENTS)) {
      out.push(makeProfile(force, temperament));
    }
  }
  return out;
}
