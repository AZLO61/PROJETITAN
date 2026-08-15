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
   LIMITE CONNUE, À TRAITER PLUS TARD

   Les blocs Vert sont évalués à zéro. Leur valeur dépend d'un placement
   secret décidé en toute fin de partie (barème couleur ou Piste ADN), et
   l'IA ne le simule pas encore. Elle sous-estime donc légèrement ses
   propres Verts. À reprendre quand le placement secret de l'IA sera
   implémenté — d'ici là, mieux vaut une sous-estimation franche qu'une
   estimation inventée.
============================================================ */

import { computeFinalScore, isSocleMarker, socleValue } from "./gameRules.js";
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

/* ── VALEUR DE CE QUI EST À PORTÉE ────────────────────────── */

// `computeFinalScore` ne voit que ce qui est DÉJÀ dans le Repaire. Elle
// est donc aveugle à « je suis planté à côté d'un tas de six blocs ».
// Sans ce terme, une IA reste immobile dès qu'aucun coup ne marque
// immédiatement. On mesure donc ce qu'il y a autour, fortement décoté :
// un bloc au sol n'est pas un bloc marqué, il faut encore le ramasser et
// survivre jusqu'au décompte.
const DECOTE_PORTEE = 0.35;

export function valeurAPortee(titan, gameState, rayon = 2) {
  const { board = {}, looseBlocks = {} } = gameState;
  if (!titan?.cell) return 0;
  const r0 = "ABCDEFGHI".indexOf(titan.cell[0]);
  const c0 = Number(titan.cell.slice(1));
  if (r0 < 0 || Number.isNaN(c0)) return 0;

  let valeur = 0;
  for (const [key, blocs] of Object.entries(looseBlocks)) {
    const r = "ABCDEFGHI".indexOf(key[0]);
    const c = Number(key.slice(1));
    if (r < 0 || Number.isNaN(c)) continue;
    const distance = Math.max(Math.abs(r - r0), Math.abs(c - c0));
    if (distance > rayon) continue;
    // Décroissance avec la distance : un tas à 2 cases vaut moins qu'un
    // tas sous les pieds, puisqu'un adversaire peut le prendre avant.
    const proximite = 1 / (1 + distance);
    for (const bloc of blocs || []) {
      valeur += isSocleMarker(bloc) ? socleValue(bloc) * proximite : proximite;
    }
  }

  // Les bâtiments debout à portée comptent aussi : ce sont les blocs de
  // demain, ceux qu'une action de destruction fera tomber.
  for (const [key, bat] of Object.entries(board)) {
    if (!bat?.blocks?.length) continue;
    const r = "ABCDEFGHI".indexOf(key[0]);
    const c = Number(key.slice(1));
    if (r < 0 || Number.isNaN(c)) continue;
    const distance = Math.max(Math.abs(r - r0), Math.abs(c - c0));
    if (distance > rayon) continue;
    valeur += (bat.blocks.length * 0.5) / (1 + distance);
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

  // Le Vert est passé à vide : l'IA ne simule pas encore le placement
  // secret (cf. « limite connue » en en-tête). Le trophée Arc-en-ciel est
  // passé à null pour la même raison — il est suivi en cours de partie
  // côté application, pas reconstituable depuis le seul état de plateau.
  const scores = computeFinalScore(titans, {}, null);
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
