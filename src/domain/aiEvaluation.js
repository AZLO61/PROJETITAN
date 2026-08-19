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
import { random, randomInt } from "./rng.js";

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
//
// `biais` affine cette molette. Un tirage UNIFORME dans la fenêtre traite le
// meilleur coup et le troisième à égalité, ce qui rend le Novice bien plus
// faible que « joueur débutant » : il jette son meilleur coup deux fois sur
// trois. Le biais pondère le tirage en faveur des mieux notés — poids
// proportionnels à `biais^rang`. À 1 on retrouve l'ancien tirage uniforme ;
// plus il monte, plus l'IA revient vers son meilleur coup sans jamais
// devenir déterministe.
//
// `voitPortee` a été ouvert au Novice le 2026-08-17 : sans lui, il ne voyait
// pas la valeur de ce qu'il avait sous la main et abandonnait des blocs à
// portée immédiate. C'est de la lecture de plateau élémentaire, pas du
// calcul d'expert — un débutant humain la fait spontanément.
//
// `rayonPortee` dit jusqu'où porte ce regard. Le Novice se limite à ses deux
// cases, c'est-à-dire à ce qu'il peut atteindre ce tour-ci ; les deux autres
// voient à 3 et anticipent leur déplacement suivant. Poussé à 4, le terme
// devient contre-productif et fait PERDRE des points (mesuré) : l'IA se met
// en route vers des tas qu'elle n'atteindra jamais.
//
// ------------------------------------------------------------
// COMMENT CES RÉGLAGES ONT ÉTÉ CHOISIS
//
// Par mesure, jamais au jugé. Demande de Nikola le 2026-08-18 : « améliore
// la pire des IA de 30 %, et celle du milieu de 20 % ». L'intelligence n'étant
// pas directement mesurable, on prend ce qui l'est — le score moyen sur une
// campagne d'UN Expert contre TROIS IA de la force mesurée, tempérament
// identique pour tous, seule la FORCE variant. Deux séries de graines, la
// seconde servant uniquement à vérifier qu'on n'a pas surajusté la première.
// Protocole rejouable : `node scripts/mesure-forces.mjs 60`.
//
//   NOVICE    24,01 → 32,09   (+33,7 %)   victoires 3-7 % → 9-12 %
//   CONFIRMÉ  31,66 → 36,22   (+14,4 %)   victoires 15,6 % → 23 %
//
// Ce qui a réellement fait bouger le Novice, ce n'est pas la molette de
// bruit — elle vaut quelques points — mais deux angles morts : il ignorait
// l'Adrénaline, et il PROGRAMMAIT AU HASARD (cf. planProgrammation).
//
// Le Confirmé s'arrête à +14 % et c'est un plafond de structure, pas un
// réglage à pousser : il joue déjà systématiquement le meilleur coup qu'il
// voit, au score complet. Le seul écart qui lui reste avec l'Expert est
// l'évaluation différentielle — et la lui donner FAIT BAISSER son score
// (36,22 → 34,36 en mesure), parce que trois Confirmés nuisibles se
// neutralisent entre eux au lieu de marquer. Le porter à +20 % le mettrait
// à égalité avec l'Expert, ce qui supprimerait la marche entre les deux
// niveaux au lieu de la déplacer.
//
// La hiérarchie reste franche : le Novice plafonne aux deux tiers du score
// de l'Expert, le Confirmé à un peu plus de 90 %.
export const FORCE_SETTINGS = Object.freeze({
  [FORCES.NOVICE]: { voitScoreComplet: false, voitAdrenaline: true, voitAdversaires: false, poidsAdversaires: 0, voitPortee: true, rayonPortee: 2, topN: 3, biais: 3 },
  [FORCES.CONFIRME]: { voitScoreComplet: true, voitAdrenaline: true, voitAdversaires: false, poidsAdversaires: 0, voitPortee: true, rayonPortee: 3, topN: 1, biais: 1 },
  [FORCES.EXPERT]: { voitScoreComplet: true, voitAdrenaline: true, voitAdversaires: true, poidsAdversaires: 0.5, voitPortee: true, rayonPortee: 3, topN: 1, biais: 1 },
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

/* ── ATTRAIT DU VERT ──────────────────────────────────────────
   Demande de Nikola du 2026-08-19 : « augmenter l'attrait pour la couleur
   Verte dans l'attribution des recompenses des cerveaux IA ».

   Ce n'etait pas un probleme de poids mais un TROU : `gainMarginal`
   retournait 0 pour le Vert, faute de figurer dans le compteur de couleurs
   du Repaire. Un bloc Vert au sol valait donc litteralement zero, et aucune
   IA n'avait la moindre raison d'aller le chercher — alors que c'est un
   joker qui vaut, au decompte, la meilleure case disponible.

   Le Vert est donc valorise a ce qu'il est : le MEILLEUR gain marginal parmi
   les couleurs du bareme. C'est une borne basse assumee, le Vert pouvant
   aussi aller sur une Piste ADN, ce qui n'est pas chiffrable ici sans
   connaitre le classement.

   Le coefficient ci-dessous ajoute la valeur d'OPTION du joker : le Vert
   garde le choix de sa destination jusqu'au decompte, ce qu'aucune autre
   couleur ne permet, et il compte pour le trophee Arc-en-ciel. Il reste
   volontairement modere : au-dela d'environ 1,6, un temperament devient
   monomaniaque et joue contre son propre score (cf. TEMPERAMENT_WEIGHTS). */
const ATTRAIT_VERT = 1.3;

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
  const gainMarginalCouleur = (couleur) => {
    if (compte[couleur] === undefined) return 0;
    return scoreBareme(couleur, compte[couleur] + 1) - scoreBareme(couleur, compte[couleur]);
  };
  /* Un Vert est un joker : il ira sur la meilleure case disponible au
     decompte. Sa valeur ici est donc le meilleur gain marginal du moment,
     majore de sa valeur d'option (cf. ATTRAIT_VERT). Il valait 0 avant le
     2026-08-19, ce qui rendait l'IA aveugle a une couleur entiere. */
  const gainMarginalVert = () =>
    Math.max(0, ...Object.keys(compte).map(gainMarginalCouleur)) * ATTRAIT_VERT;
  const gainMarginal = (couleur) =>
    couleur === "vert" ? gainMarginalVert() : gainMarginalCouleur(couleur);

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
      return (
        detail.bareme * poids.bareme +
        detail.socles * poids.socles +
        // L'Adrénaline entre dans la vue du Novice le 2026-08-18. Ce sont
        // des jetons posés devant lui, qui valent des points au décompte et qui
        // sont écrits sur la feuille de score : les ignorer ne modélisait
        // pas un débutant mais un joueur qui n'a pas lu les règles. Il les
        // gaspillait donc sans compter, et n'avait aucune raison d'en voler.
        (reglages.voitAdrenaline ? detail.adrenalinePts * poids.adrenaline : 0)
      );
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
    note += valeurAPortee(moi, gameState, reglages.rayonPortee ?? 2) * poids.portee;
  }

  // Évaluation différentielle, réservée à l'Expert. C'est le seul vrai
  // saut qualitatif entre Confirmé et Expert : le Confirmé maximise son
  // score, l'Expert maximise son AVANCE. Un coup qui lui rapporte 3 mais
  // en coûte 6 au leader devient meilleur qu'un coup qui lui en rapporte
  // 5 sans gêner personne. Toute la nuisance émerge de là, sans qu'aucune
  // heuristique « attaque le premier » n'ait été écrite.
  const poidsAdverse = reglages.poidsAdversaires ?? 0;
  if (poidsAdverse > 0) {
    const adversaires = titans.filter((t) => t.id !== titanId);
    if (adversaires.length > 0) {
      const meilleurAdverse = Math.max(...adversaires.map((t) => noteDe(scores.totals[t.id])));
      note -= meilleurAdverse * poidsAdverse;
      // Sortir un adversaire du ring lui coûte son tour. L'Expert, seul à
      // raisonner en différentiel, le valorise au même coefficient que le
      // reste de sa nuisance. Le tempérament Agressif y est plus sensible :
      // c'est exactement le genre de coup qu'il doit chercher.
      const ejectes = adversaires.filter((t) => t.horsPlateau).length;
      if (ejectes > 0) note += ejectes * VALEUR_TOUR_PERDU * poidsAdverse * poids.adn;
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
  if (fenetre.length === 1) return fenetre[0];

  // Tirage pondéré : le meilleur coup de la fenêtre pèse `biais` fois plus
  // que le suivant, et ainsi de suite. À biais = 1 on retrouve exactement
  // l'ancien tirage uniforme, d'où le raccourci ci-dessous — il garantit que
  // les profils non biaisés gardent leur comportement au tirage près.
  const biais = reglages.biais ?? 1;
  if (biais <= 1) return fenetre[randomInt(fenetre.length)];

  const poids = fenetre.map((_, i) => Math.pow(biais, fenetre.length - 1 - i));
  const total = poids.reduce((a, b) => a + b, 0);
  let seuil = random() * total;
  for (let i = 0; i < fenetre.length; i++) {
    seuil -= poids[i];
    if (seuil < 0) return fenetre[i];
  }
  return fenetre[0];
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
