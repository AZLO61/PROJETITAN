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
  valeurMarginaleAdrenaline,
  computeFinalScore,
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
} from "./gameRules.js";
import { chooseAmongBest, evaluatePosition, gagnantArcEnCiel, makeProfile, reglagesDe } from "./aiEvaluation.js";

const DIRS = Object.freeze([
  { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
  { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 },
]);

/* Plafond des mises d'Adrénaline explorées. Le livret n'en fixe aucun ;
   chaque point de plus multiplie le nombre de coups à simuler.

   Il valait 2 pour tout le monde, en argumentant qu'au-delà « le gain de
   portée ne compense presque jamais les points que vaut une Adrénaline
   conservée ». C'était une décision prise À LA PLACE de l'évaluation, et
   c'est exactement ce que le module s'interdit partout ailleurs :
   `computeFinalScore` compte déjà l'Adrénaline conservée, donc une mise qui
   ne vaut pas le coup se note toute seule moins bien. Le plafond n'a de
   raison d'être que le TEMPS DE CALCUL.

   Il vit donc dans les réglages de force (`miseAdrenalineMax`), la référence
   explorant plus loin que les niveaux du dessous. Nikola, 2026-08-28 : « il
   faut qu'elle gère beaucoup mieux l'utilisation de l'Adrénaline afin
   d'éviter certains vols de points ou certaines situations où elle dépense
   mal ou pas ses ressources ». */
const MISE_ADRENALINE_DEFAUT = 2;

/* Le clone est la boucle chaude de tout le module : chaque coup candidat en
   demande un, et un tour d'Expert en évalue plusieurs centaines.
   `structuredClone` sait tout copier, y compris ce qui n'existe pas ici —
   Map, Date, références cycliques — et le paie. Une copie écrite à la main
   pour CETTE forme-là est nettement plus rapide, et c'est ce qui rend
   abordable la recherche conjointe déplacement + carte.

   Elle doit rester exhaustive sur les tableaux : en oublier un ferait
   partager une référence entre l'état simulé et l'état réel, c'est-à-dire
   une IA qui modifie la partie en réfléchissant. Tout tableau ajouté à un
   Titan doit être copié ici. */
function cloneEtat(gameState) {
  const board = {};
  const src = gameState.board ?? {};
  for (const k in src) {
    const c = src[k];
    board[k] = { ...c, blocks: c.blocks ? c.blocks.slice() : [] };
  }

  const looseBlocks = {};
  const loose = gameState.looseBlocks ?? {};
  for (const k in loose) looseBlocks[k] = (loose[k] || []).slice();

  const titans = (gameState.titans ?? []).map((t) => ({
    ...t,
    repaire: (t.repaire || []).slice(),
    socles: (t.socles || []).slice(),
    hand: (t.hand || []).slice(),
    programmed: (t.programmed || []).slice(),
    playedThisManche: (t.playedThisManche || []).slice(),
    discardedHidden: (t.discardedHidden || []).slice(),
    repos: (t.repos || []).map((e) => ({ ...e })),
  }));

  // `aJouerEncore` traverse la simulation : c'est lui qui dit à l'évaluation
  // qui peut encore ramasser ce que ce coup laisse traîner.
  // `finDePartie` aussi : sans lui, l'évaluation ne saurait pas à quelle
  // distance du seuil d'Apocalypse se trouve le plateau qu'on lui montre, et
  // ne pourrait pas juger si ce coup rapproche la fin (cf.
  // `valeurFinDePartie`).
  return {
    board, looseBlocks, titans,
    aJouerEncore: gameState.aJouerEncore,
    finDePartie: gameState.finDePartie,
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

function misesPossibles(titan, profile) {
  const plafond = reglagesDe(profile).miseAdrenalineMax ?? MISE_ADRENALINE_DEFAUT;
  const dispo = Math.min(titan?.adrenaline || 0, plafond);
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

/* ── LE TOUR ENTIER, D'UN SEUL BLOC ───────────────────────────
   C'est le défaut le plus coûteux de l'ancienne IA, et il était invisible
   parce qu'il n'était pas dans une formule : il était dans l'ORDRE.

   Un tour vaut Mouvement gratuit, puis carte, puis Récupération. Le
   planificateur les décidait l'un après l'autre, chacun en aveugle du
   suivant : `planMovement` choisissait la case qui note le mieux SANS SA
   CARTE, puis `planCardPlay` faisait de son mieux depuis là. Or les deux
   décisions n'en font qu'une. Tout Casser tire son énergie du nombre de
   cases occupées du Périmètre : se placer au contact de trois bâtiments
   double sa puissance, et aucun déplacement ne pouvait le savoir. Tête en
   Avant veut un axe aligné, Boing Boing veut de la place. L'IA se plaçait
   pour ramasser, puis jouait sa carte depuis une case qui ne lui servait
   à rien.

   C'est ce qu'un joueur humain fait sans y penser — il regarde sa carte
   AVANT de bouger — et c'est l'essentiel de l'écart que Nikola constate à
   la table.

   COMBIEN ÇA COÛTE. Le produit complet (toutes les cases par tous les
   coups) est hors de prix : une vingtaine de cases par une centaine de
   coups, des centaines de fois par partie. On garde donc les
   `largeurJointe` meilleures cases au tri statique — celles qui valent
   déjà quelque chose en elles-mêmes — et on ne développe la carte que sur
   celles-là. Rester sur place fait toujours partie des candidates : c'est
   souvent le bon coup quand la carte veut la position actuelle.

   Le tri statique et le développement utilisent la MÊME évaluation, donc
   une case écartée l'est parce qu'elle vaut moins, pas parce qu'un critère
   différent l'a jugée. */
export function planTour(titanId, gameState, profile = makeProfile(), mancheNumber = 1, porteeMouvement = 2) {
  const reglages = reglagesDe(profile);
  const largeur = reglages.largeurJointe ?? 0;
  if (largeur <= 0) return null; // niveaux du bas : le tour reste séquentiel

  const titan = gameState.titans.find((t) => t.id === titanId);
  if (!titan || !estSurLePlateau(titan)) return null;

  // `null` = rester sur place, toujours dans la liste.
  const destinations = [null];
  if (porteeMouvement > 0) {
    const { reachable } = getMovementReachable(
      titan.cell, porteeMouvement, gameState.board,
      indexerTitans(gameState.titans), gameState.looseBlocks
    );
    reachable.forEach((k) => destinations.push(k));
  }

  // Tri statique : ce que vaut la case en elle-même, carte non jouée.
  const triees = [];
  for (const destKey of destinations) {
    const etat = cloneEtat(gameState);
    const note = noterApres(titanId, etat, profile, (e) => {
      if (destKey) resolveFreeMovement(titanId, destKey, e);
    });
    if (note !== null) triees.push({ destKey, note });
  }
  if (triees.length === 0) return null;
  triees.sort((a, b) => b.note - a.note);

  const candidats = [];
  for (const { destKey, note: noteSeule } of triees.slice(0, largeur)) {
    const base = cloneEtat(gameState);
    if (destKey) resolveFreeMovement(titanId, destKey, base);
    const coup = planCardPlay(titanId, base, profile, mancheNumber);
    // Pas de carte jouable depuis là : la case vaut ce qu'elle vaut seule.
    candidats.push({ destKey, coup, note: coup ? coup.note : noteSeule });
  }

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

/* Ce que vaut une Adrenaline pour CE Titan-la, maintenant. Sert d'etalon
   quand un defenseur arbitre entre payer une Adrenaline et encaisser la
   perte, et quand un attaquant estime ce qu'il gagne a en prendre une.

   C'etait une constante — le forfait du moteur, importe et jamais recopie.
   Depuis que le bareme est PROGRESSIF (2026-08-28), un forfait ne veut plus
   rien dire : la premiere Adrenaline vaut 1 point, la cinquieme en vaut 3.
   Une IA qui arbitre sur la moyenne paie trop cher quand elle est pauvre et
   pas assez cher quand elle est riche — exactement a l'envers de ce que le
   bareme recompense. La valeur est donc lue au stock reel, a chaque fois.

   `valeurMarginaleAdrenaline(stock)` = ce que rapporte LA PROCHAINE, donc
   aussi ce que coute d'en lacher une quand on en detient `stock + 1`. */
const valeurAdrenalinePour = (titan) => valeurMarginaleAdrenaline(Math.max(0, (titan?.adrenaline || 0) - 1));
const gainAdrenalinePour = (titan) => valeurMarginaleAdrenaline(titan?.adrenaline || 0);

/* ── CE QU'UN BLOC VAUT VRAIMENT, DES DEUX CÔTÉS ──────────────
   Demande de Nikola, 2026-08-28 : « si elle donne ce bloc, combien de
   points elle perd, combien elle en donne à l'adversaire, si l'action est
   effectuée en RAGE ou en DIL ».

   `gainSiAjoute` et `perteSiRetire` ne lisent que le BARÈME de la couleur.
   C'est faux dès qu'un bonus de fin entre en jeu, et ces bonus sont
   précisément ce qui décide une partie : le Rose qui fait basculer les
   +10 du plus grand nombre, la couleur qui complète l'Arc-en-ciel à
   5 points, le Socle qui prend le trophée Collectionneur. Un bloc peut
   valoir 0 au barème et 10 au décompte, et l'IA arbitrait un vol à 0.

   `faiseurDeDelta` chiffre un transfert par ce qu'il fait aux TOTAUX des
   deux Titans, bonus compris. Il est mémoïsé par couleur et par camp : au
   plus dix calculs de score par décision, sur une décision qui n'existe
   que sur les cartes offensives. */
function faiseurDeDelta(etat) {
  const memo = new Map();
  const base = computeFinalScore(etat.titans, {}, gagnantArcEnCiel(etat.titans)).totals;

  return (titanId, mutation, cle) => {
    const cleComplete = `${titanId}|${cle}`;
    if (memo.has(cleComplete)) return memo.get(cleComplete);
    const liste = etat.titans.map((t) => (t.id === titanId ? mutation(t) : t));
    const apres = computeFinalScore(liste, {}, gagnantArcEnCiel(liste)).totals;
    const delta = (apres[titanId]?.total ?? 0) - (base[titanId]?.total ?? 0);
    memo.set(cleComplete, delta);
    return delta;
  };
}

/* Ce qu'un point coûté à un adversaire me rapporte à moi. Pas un point : à
   quatre joueurs, le lui retirer profite autant aux deux autres qu'à moi.
   Même demi-coefficient que la nuisance de l'évaluation. */
const PART_PERTE_ADVERSE = 0.5;

/**
 * Applique la résolution la plus probable des décisions générées par un
 * coup. On ne devine pas : chaque camp est supposé jouer son intérêt, ce
 * qui est l'hypothèse la moins arbitraire disponible.
 */
export function appliquerDecisions(decisions, etat, profile = makeProfile()) {
  const auScoreComplet = reglagesDe(profile).decisionsAuScoreComplet ?? false;

  for (const d of decisions || []) {
    const attaquant = etat.titans.find((t) => t.id === d.attackerId);
    const defenseur = etat.titans.find((t) => t.id === d.defenderId);
    if (!attaquant || !defenseur) continue;

    const delta = auScoreComplet ? faiseurDeDelta(etat) : null;
    // Ce que me rapporte un bloc de cette couleur, et ce qu'il coûte à
    // celui qui le perd. Au barème pour les niveaux du bas, au total réel
    // pour la référence.
    const monGain = (couleur) => (delta
      ? delta(attaquant.id, (t) => ({ ...t, repaire: [...t.repaire, couleur] }), `+${couleur}`)
      : gainSiAjoute(attaquant.repaire, couleur));
    const saPerte = (couleur) => {
      if (!delta) return perteSiRetire(defenseur.repaire, couleur);
      if (defenseur.repaire.indexOf(couleur) === -1) return 0;
      return -delta(defenseur.id, (t) => {
        const r = [...t.repaire];
        r.splice(r.indexOf(couleur), 1);
        return { ...t, repaire: r };
      }, `-${couleur}`);
    };

    if (d.type === "RAGE") {
      /* Livret : l'attaquant choisit librement UNE ressource. Il visait
         celle qui lui rapportait le plus à LUI, en ignorant ce qu'elle
         coûtait à l'autre — deux Bleus équivalents pour moi ne le sont pas
         si l'un fait tomber son bonus Rose. Il arbitre désormais sur les
         deux moitiés, la perte adverse comptée à demi (cf.
         PART_PERTE_ADVERSE).

         L'ADRÉNALINE EST UNE OPTION À PART ENTIÈRE, plus un pis-aller. La
         FAQ #5 la rend ciblable, et le code ne s'en servait que si le
         Repaire était vide : voler la dernière Adrénaline de quelqu'un qui
         s'apprête à annuler un Dilemme vaut souvent mieux qu'un bloc de
         plus. C'est un des « vols de points » que Nikola signale. */
      const options = [];
      defenseur.repaire.forEach((couleur, idx) => {
        options.push({ idx, valeur: monGain(couleur) + saPerte(couleur) * PART_PERTE_ADVERSE });
      });
      if ((defenseur.adrenaline || 0) >= 1) {
        /* Ce que l'attaquant GAGNE en l'ajoutant a sa propre reserve, plus ce
           que le defenseur PERD en la lachant : sur un bareme progressif ces
           deux nombres different, alors qu'un forfait les confondait. */
        options.push({
          idx: -1,
          valeur: gainAdrenalinePour(attaquant) + valeurAdrenalinePour(defenseur) * PART_PERTE_ADVERSE,
        });
      }
      if (options.length === 0) continue;
      const meilleur = options.reduce((a, b) => (b.valeur > a.valeur ? b : a));
      if (meilleur.idx === -1) {
        defenseur.adrenaline -= 1;
        attaquant.adrenaline = (attaquant.adrenaline || 0) + 1;
      } else {
        const [pris] = defenseur.repaire.splice(meilleur.idx, 1);
        attaquant.repaire.push(pris);
      }
      continue;
    }

    if (d.type === "DIL") {
      // Livret : l'attaquant désigne 2 couleurs DIFFÉRENTES, la cible
      // choisit laquelle elle perd, ou paie 1 Adrénaline pour annuler.
      // La cible, elle, ne pense qu'à SON moindre mal (elle prend toujours
      // l'option la plus douce pour elle) — mais l'attaquant, en choisissant
      // la PAIRE à désigner, doit maximiser ce qu'il en retire lui-même, pas
      // seulement ce qu'il fait perdre. Sur les cartes dont le bloc perdu va
      // au Repaire de l'attaquant (cf. DESTINATION_BLOC_PERDU), un DIL qui
      // coûte moins cher à la cible mais lui rapporte davantage peut valoir
      // mieux qu'un DIL qui coûte plus cher à la cible sans rien lui donner.
      /* ÉCART ASSUMÉ AVEC LE MOTEUR, à documenter plutôt qu'à corriger ici :
         ce modèle ne compte que les COULEURS. Le vrai `getDilOptions` compte
         aussi le Socle (2026-08-17) et l'Adrénaline (2026-09-03), donc une
         cible « 1 couleur + 1 jeton » y subit un Dilemme que l'IA, elle, ne
         voit pas venir. L'IA sous-estime ces coups ; elle n'en joue jamais
         d'illégal, et c'est le sens de la marge. */
      const presentes = COULEURS_SCORABLES.filter((c) => compteCouleur(defenseur.repaire, c) > 0);
      if (presentes.length < 2) continue; // DIL structurellement impossible

      const gagneAttaquant = d.destination === "repaire";

      let couleurPerdue = null;
      let meilleurGainNet = -Infinity;
      for (let i = 0; i < presentes.length; i++) {
        for (let j = i + 1; j < presentes.length; j++) {
          const a = saPerte(presentes[i]);
          const b = saPerte(presentes[j]);
          // La cible arbitre seule, sur SA perte : elle ignore ce que
          // l'attaquant en tirera.
          const choixDeLaCible = a <= b ? presentes[i] : presentes[j];
          const coutSubi = Math.min(a, b);
          const gainNet = coutSubi * PART_PERTE_ADVERSE
            + (gagneAttaquant ? monGain(choixDeLaCible) : 0);
          if (gainNet > meilleurGainNet) {
            meilleurGainNet = gainNet;
            couleurPerdue = choixDeLaCible;
          }
        }
      }
      if (!couleurPerdue) continue;
      const meilleurMinimum = saPerte(couleurPerdue);

      /* La cible paie plutôt que d'encaisser si la perte dépasse la valeur
         d'une Adrénaline. Comparaison désormais au VRAI coût : perdre un
         Rose qui fait basculer dix points ne se compare pas à une
         Adrénaline de la même façon que perdre un Bleu impair, et la
         version au barème ne savait pas les distinguer. */
      if (meilleurMinimum > valeurAdrenalinePour(defenseur) && (defenseur.adrenaline || 0) >= 1) {
        defenseur.adrenaline -= 1;
        continue;
      }
      const idx = defenseur.repaire.indexOf(couleurPerdue);
      if (idx !== -1) defenseur.repaire.splice(idx, 1);
      // Cf. DESTINATION_BLOC_PERDU (gameRules.js) : sur Faut Pas Me Chauffer,
      // le bloc perdu en DIL rejoint le Repaire de l'attaquant, pas le sol.
      // Sans ce transfert, le modèle simplifié de l'IA perdait purement et
      // simplement le bloc, faussant ensuite sa lecture de son propre Repaire.
      if (gagneAttaquant) attaquant.repaire.push(couleurPerdue);
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
  const res = simulerCarte(coup, titanId, { ...etat, replis }, mancheNumber, profile);
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
 * ── L'IA VISE LES TITANS (2026-08-18) ──
 * Elle prenait la première case venue (`eligibles[0]`), un ordre de
 * balayage sans aucun rapport avec le jeu. Or un débris qui tombe sur un
 * Titan le projette ET rapporte +1 Bagarre à l'initiateur (cf.
 * `resolveEcroulementAmas` : `bagarreSet.add(occupant.id)`). L'IA laissait
 * donc filer des points gratuits à chaque Amas, et un joueur humain ne
 * risquait jamais rien à camper à côté d'un tas prêt à s'écrouler.
 *
 * Pas besoin de simuler quoi que ce soit pour corriger ça : la Bagarre est
 * acquise dès que la cible bouge réellement, il suffit de préférer une case
 * occupée par un adversaire. On ne vise chaque Titan qu'UNE fois — le
 * premier débris le pousse hors de la case, le suivant tomberait dans le
 * vide (la résolution est séquentielle, cf. `resolveEcroulementAmas`).
 */
export function choisirRepartitionEcroulement(ecroulement, etat, initiatorId = null) {
  const choix = [];
  const dejaVises = new Set();
  // L'initiateur se tient sur l'Amas lui-même, jamais sur une case voisine.
  // Le paramètre reste optionnel : sans lui on se contente de ne pas viser
  // le Titan posé sur `cellKey`, ce qui couvre déjà le cas réel.
  const adverseSur = (cle) => (etat.titans || []).find(
    (t) => t.cell === cle && !t.horsPlateau && t.id !== initiatorId && cle !== ecroulement.cellKey
  );

  for (let i = 0; i < ecroulement.blocs.length; i++) {
    const { eligibles } = getEcroulementCells(ecroulement.cellKey, etat, choix);
    const surTitan = eligibles.find((cle) => !dejaVises.has(cle) && adverseSur(cle));
    if (surTitan) {
      dejaVises.add(surTitan);
      choix.push(surTitan);
    } else {
      choix.push(eligibles[0] ?? ecroulement.cellKey);
    }
  }
  return choix;
}

function simulerCarte(coup, titanId, etat, mancheNumber, profile = makeProfile()) {
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
        const choix = choisirRepartitionEcroulement(res.ecroulement, etat, titanId);
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
      /* MISE D'ADRENALINE DE L'IA (Nikola, 2026-08-19).

         « J'ai surtout l'impression que les IA evitent d'utiliser cette carte,
         en tout cas sur moi. » Elles la jouaient, mais avec DEUX MISES A ZERO :
         faute de regle de decision, elles arrivaient au duel les mains vides et
         le perdaient des que l'adversaire avait une carte de plus. Une carte
         Force 3 sur six etait donc systematiquement mal notee, et l'IA
         l'ecartait au profit d'autre chose.

         La regle retenue est celle d'un joueur prudent, pas d'un devin : elle
         ne connait pas les cartes programmees de sa cible (elles sont
         secretes), donc elle mise le minimum qui fait basculer un duel serre.
         Elle engage 1 Adrenaline quand son avance de base est nulle ou
         negative, et 2 quand elle est nettement derriere et qu'elle en a les
         moyens. Au-dela, ce serait bruler sa reserve sur une information
         qu'elle n'a pas — l'Adrenaline vaut aussi des points au decompte. */
      const cibles = getFPMCTargets(titanId, etat);
      const decisions = [];
      const attaquant = etat.titans.find((t) => t.id === titanId);
      let stock = attaquant ? (attaquant.adrenaline || 0) : 0;
      /* La mise vient du coup candidat, elle n'est plus décidée ici. Elle
         est engagée sur CHAQUE cible tant que le stock suit : la carte est
         résolue duel par duel, et une mise ne se partage pas. */
      const miseVoulue = coup.miseFpmc ?? 0;
      for (const defId of cibles) {
        const miseIA = Math.min(miseVoulue, stock);
        stock -= miseIA;
        const r = resolveFautPasMeChauffer(titanId, defId, cibles.length, etat, { attackerBid: miseIA });
        decisions.push(...(r.decisions || []));
      }
      if (attaquant) attaquant.adrenaline = Math.max(0, stock);
      res = { decisions };
      break;
    }
    default:
      break;
  }

  appliquerDecisions(res?.decisions, etat, profile);
  // Sur Faut Pas Me Chauffer, le duel a déjà débité la mise cible par cible :
  // la retrancher ici la compterait deux fois.
  if (mise > 0 && moi && cardId !== "faut_pas_me_chauffer") {
    moi.adrenaline = Math.max(0, (moi.adrenaline || 0) - mise);
  }
}

/** Tous les coups légaux offerts par une carte, paramètres compris. */
export function candidatsPourCarte(cardId, titanId, gameState, profile = makeProfile()) {
  const titan = gameState.titans.find((t) => t.id === titanId);
  if (!titan) return [];
  const mises = misesPossibles(titan, profile);

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

  /* Faut Pas Me Chauffer : les cibles sont imposées par le Périmètre, mais
     la MISE CACHÉE est un vrai choix, et c'était le dernier de la carte à
     être décidé par une règle écrite à la main (« engage 1 si mon avance est
     nulle, 2 si je suis nettement derrière »). Elle devient un paramètre du
     coup : la recherche essaie chaque mise et garde celle qui note le mieux,
     exactement comme pour une portée de Tête en Avant.

     C'est ce que Nikola demande sur l'Adrénaline — « qu'elle gère beaucoup
     mieux son utilisation » — et c'est aussi la seule façon d'y intégrer ce
     que la règle manuelle ne pouvait pas voir : qu'une Adrénaline misée est
     une Adrénaline qui ne sera pas comptée au décompte, et que le duel n'est
     pas toujours le meilleur emploi de la dernière. */
  return mises.map((mise) => ({ cardId, mise, miseFpmc: mise }));
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
    for (const coup of candidatsPourCarte(cardId, titanId, gameState, profile)) {
      const etat = cloneEtat(gameState);
      const note = noterApres(titanId, etat, profile, (e) => simulerCarte(coup, titanId, e, mancheNumber, profile));
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
 * LE NOVICE NOTE SES CARTES LUI AUSSI, depuis le 2026-08-18. Il tirait
 * jusque-là ses 3 cartes AU HASARD dans sa main de 6, ce qui n'était pas
 * « un débutant » mais « personne » : trois cartes sur six décidées à la
 * pièce, c'est toute la Manche subie, quelle que soit la qualité du jeu
 * ensuite. C'était de loin ce qui le plombait le plus.
 *
 * La force continue de jouer, mais là où elle joue partout ailleurs : dans
 * la molette de bruit de `chooseAmongBest`. Le Novice pioche parmi ses
 * trois meilleures cartes, l'Expert prend les trois meilleures. Un débutant
 * prépare sa Manche, mal.
 */
export function planProgrammation(titanId, gameState, profile = makeProfile(), mancheNumber = 1, nbCartes = 3) {
  const titan = gameState.titans.find((t) => t.id === titanId);
  if (!titan || !titan.hand || titan.hand.length === 0) return [];

  const main = [...titan.hand];
  if (main.length <= nbCartes) return main;

  const notees = main.map((cardId) => {
    let meilleure = -Infinity;
    for (const coup of candidatsPourCarte(cardId, titanId, gameState, profile)) {
      const etat = cloneEtat(gameState);
      const note = noterApres(titanId, etat, profile, (e) => simulerCarte(coup, titanId, e, mancheNumber, profile));
      if (note !== null && note > meilleure) meilleure = note;
    }
    return { cardId, note: meilleure };
  });

  // Une carte à la fois, chacune retirée de la pioche : à topN = 1 on
  // retrouve exactement « les trois meilleures dans l'ordre ».
  const restantes = [...notees];
  const choisies = [];
  while (choisies.length < nbCartes && restantes.length > 0) {
    const pick = chooseAmongBest(restantes, profile);
    choisies.push(pick.cardId);
    restantes.splice(restantes.indexOf(pick), 1);
  }
  return choisies;
}

/* ── PROGRAMMER LA MANCHE, PAS TROIS FOIS LE MÊME TOUR ────────
   `planProgrammation` note les six cartes de la main dans l'état ACTUEL,
   puis garde les trois meilleures. Chacune est donc évaluée comme si elle
   était jouée la première, sur le plateau tel qu'il est.

   Le défaut se voit dès qu'on l'écrit : les trois cartes retenues visent
   toutes le même bâtiment, le même voisin, la même case. Une fois la
   première jouée, ce qui faisait la valeur des deux autres a disparu, et
   la Manche entière se joue avec deux cartes mortes. C'est une Manche sur
   quatre, décidée avant le premier coup.

   Un joueur humain ne fait pas ça : il choisit sa deuxième carte en
   sachant ce que la première aura fait. On simule donc la même chose —
   choisir la meilleure, JOUER son meilleur coup sur un clone, choisir la
   deuxième depuis cet état, et ainsi de suite. Trois passes au lieu d'une,
   pour une décision qui engage toute la Manche.

   L'approximation restante est assumée et nommée : les autres Titans ne
   jouent pas entre-temps dans cette projection. On ne sait pas ce qu'ils
   feront — leurs cartes sont secrètes — et supposer qu'ils ne font rien
   reste plus juste que de supposer que le plateau ne bouge pas du tout. */
export function planProgrammationSequentielle(titanId, gameState, profile = makeProfile(), mancheNumber = 1, nbCartes = 3) {
  const titan = gameState.titans.find((t) => t.id === titanId);
  if (!titan || !titan.hand || titan.hand.length === 0) return [];
  if (titan.hand.length <= nbCartes) return [...titan.hand];

  const restantes = [...titan.hand];
  const choisies = [];
  let etatCourant = cloneEtat(gameState);

  while (choisies.length < nbCartes && restantes.length > 0) {
    const notees = [];
    for (const cardId of restantes) {
      let meilleure = -Infinity;
      let meilleurCoup = null;
      for (const coup of candidatsPourCarte(cardId, titanId, etatCourant, profile)) {
        const etat = cloneEtat(etatCourant);
        const note = noterApres(titanId, etat, profile, (e) => simulerCarte(coup, titanId, e, mancheNumber, profile));
        if (note !== null && note > meilleure) {
          meilleure = note;
          meilleurCoup = coup;
        }
      }
      notees.push({ cardId, coup: meilleurCoup, note: meilleure });
    }

    const pick = chooseAmongBest(notees, profile);
    if (!pick) break;
    choisies.push(pick.cardId);
    restantes.splice(restantes.indexOf(pick.cardId), 1);

    // Le plateau tel qu'il sera quand viendra le tour de la carte suivante.
    if (pick.coup) {
      const suite = cloneEtat(etatCourant);
      try {
        simulerCarte(pick.coup, titanId, suite, mancheNumber, profile);
        etatCourant = suite;
      } catch {
        // Un coup qui ne se rejoue pas ne doit pas faire tomber la
        // programmation : on garde l'état précédent et on continue.
      }
    }
  }
  return choisies;
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
