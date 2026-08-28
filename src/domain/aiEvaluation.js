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
import {
  COULEURS,
  computeFinalScore,
  countActiveTeleporters,
  countColorOnBoard,
  countStandingBuildings,
  isSocleMarker,
  scoreBareme,
  socleValue,
} from "./gameRules.js";
import { random, randomInt } from "./rng.js";

/* ── FORCE ────────────────────────────────────────────────── */

/* ── QUATRE NIVEAUX DE DIFFICULTÉ ─────────────────────────────
   Demande de Nikola, 2026-08-28 : « j'aimerais avoir 4 niveaux de
   difficulté clairement distincts : Facile, Moyen, Difficile, Expert. »

   Il y en avait trois, et ils portaient des noms de JOUEUR — Novice,
   Confirmé, Expert — hérités de l'easter-egg qui dévoile le profil d'une
   IA. Sur l'écran d'accueil, « Novice » décrit l'adversaire ; ce qu'on y
   choisit est la difficulté de la partie. Les deux lectures se
   contredisaient : régler « Novice » voulait dire « je veux une partie
   facile », c'est-à-dire l'inverse de ce que le mot désigne.

   L'échelle porte donc les mots de la difficulté, et c'est la même échelle
   partout — écran d'accueil, profil dévoilé, campagnes de mesure.

   COMMENT ILS SONT CONSTRUITS, et l'ordre compte. Nikola : « il faut
   simplement moduler vers le bas l'IA la plus forte, car c'est elle qui
   doit servir de référence. Les autres niveaux doivent ensuite être
   construits à partir de cette IA de référence, en réduisant
   progressivement la qualité de ses décisions. »

   Expert est donc écrit le premier, et complet. Chaque barreau du dessous
   lui RETIRE un regard nommé, jamais n'ajoute une bêtise : une IA faible
   est une IA qui voit moins, pas une IA qui joue au hasard. C'est ce qui
   la rend crédible à la table — elle fait des erreurs de débutant
   plausibles, pas des coups absurdes. */
export const FORCES = Object.freeze({
  FACILE: "facile",
  MOYEN: "moyen",
  DIFFICILE: "difficile",
  EXPERT: "expert",
});

export const FORCE_LABELS = Object.freeze({
  [FORCES.FACILE]: "Facile",
  [FORCES.MOYEN]: "Moyen",
  [FORCES.DIFFICILE]: "Difficile",
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
// identique pour tous, seule la FORCE variant. Plusieurs séries de graines :
// il y en avait DEUX jusqu'au 2026-08-27, ce qui s'est révélé insuffisant au
// point de laisser passer deux fausses corrections d'affilée (voir le pavé
// sur FORCE_SETTINGS, et l'en-tête de `scripts/mesure-forces.mjs`).
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
/* ---- LISSAGE DES NIVEAUX (2026-08-19) ---------------------------
   Demande de Nikola : « lisse les niveaux des IA pour avoir un peu d'ecart
   entre les niveaux mais il faut un moins grand gap entre eux ». Deux
   problemes mesures avant ce reglage, temperament Collectionneur, 2 series de
   60 parties :

   · le Novice plafonnait a 63 % du score de l'Expert, un gouffre ;
   · le Confirme BATTAIT l'Expert (104 a 106 %), la hierarchie etait inversee.

   Ce qui a ete change, et pourquoi :

   NOVICE. Il garde son vrai handicap, `voitScoreComplet: false` — il ne voit
   que son butin, pas les bonus ni les classements, ce qui EST l'erreur du
   debutant et doit rester sa signature. On lui retire en revanche du bruit
   inutile : la fenetre de tirage passe de 3 a 2 coups et le biais de 3 a 4,
   donc il tire beaucoup plus souvent son meilleur coup tout en gardant des
   erreurs plausibles. Sa vision de portee passe de 2 a 3 cases, comme les
   autres : un debutant voit le plateau, il le lit juste moins bien.

   EXPERT. Sa nuisance a ete MODULEE PAR SON TEMPERAMENT : gener un adversaire
   est une action de la famille ADN/agression, et un Expert Collectionneur y
   consacrait autant d'energie qu'un Agressif alors que son bareme ne le paie
   pas.

   >> CE CORRECTIF N'A PAS TENU. L'inversion etait de retour a la mesure du
   2026-08-27, sur deux temperaments sur trois. Ponderer la nuisance ne
   suffisait pas parce que le probleme n'etait pas son dosage : c'est le terme
   lui-meme qui coute des points. Il a ete retire ce jour-la, voir le pave sur
   FORCE_SETTINGS juste en dessous. Ce paragraphe reste pour la trace : deux
   passes de reglage ont ete depensees a doser une chose qu'il fallait
   mesurer a zero. */
/* ---- CE QUE L'EVALUATION NE VOYAIT PAS (2026-08-27) --------------
   Demande de Nikola : « ameliore l'analyse des IA, je pense qu'elle rate
   encore des axes d'amelioration sur certaines situations ».

   Mesure d'entree, 60 parties x 2 series, protocole habituel — un Expert
   contre trois IA de la force mesuree :

     temperament       Novice/Expert   Confirme/Expert
     opportuniste        77-80 %         106-110 %
     collectionneur      83-88 %          92- 96 %
     agressif            92-96 %          99-103 %

   Deux anomalies, pas une : la HIERARCHIE EST INVERSEE en opportuniste et en
   agressif (le Confirme bat l'Expert), et le Novice agressif est a 4 % de
   l'Expert, c'est-a-dire qu'il n'y a plus de niveaux du tout sur ce
   temperament.

   Trois angles morts en cause, tous du meme genre : l'evaluation savait
   compter ce qui etait DEJA acquis, et jugeait ce qui reste a prendre avec
   une regle de pouce qui ignorait la moitie du bareme.

   1. `voitPorteeAuScore` — la valeur d'un bloc a portee etait calculee au
      seul `scoreBareme` de sa couleur. Le bonus Rose (+10 au plus grand
      nombre), le trophee Collectionneur (+5), les classements de piste et le
      trophee Arc-en-ciel n'y entraient pas : un Rose qui faisait basculer
      dix points valait, pour l'IA en route vers lui, exactement ce que
      valait le Rose suivant.

   2. `voitConcurrence` — un tas comptait pareil qu'un adversaire soit colle
      dessus ou a l'autre bout du plateau. L'IA se mettait en route vers un
      butin deja perdu.

   3. Le trophee Arc-en-ciel etait passe a `null` a l'evaluation, donc valait
      zero pour tout le monde. Ce n'est pas une sous-estimation neutre :
      c'est 5 points DISPONIBLES pour qui lui manque une couleur, et zero
      pour qui les a deja toutes. Personne n'allait donc jamais chercher la
      couleur qui lui manquait. Corrige pour toutes les forces — voir
      `gagnantArcEnCiel` — parce que meme un debutant voit qu'il lui manque
      une couleur sur cinq.

   Les deux premiers restent fermes au Novice : lire le bareme imprime sans
   voir les bonus de fin EST son handicap de signature, et le lui retirer en
   ferait un Confirme. */
/* CE QUE CHAQUE NIVEAU A DE PLUS QUE LE PRECEDENT (revu le 2026-08-27)

   NOVICE. `voitScoreComplet: false` : il ne lit que son butin, pas les bonus
   de fin ni les classements. C'est SA signature, et la lui retirer en ferait
   un Confirme. Il garde aussi la molette de bruit (topN 2, biais 4).

   CONFIRME. Le score complet. Il chiffre en revanche ce qui traine autour de
   lui au BAREME de la couleur, comme un joueur qui lit sa feuille de score.

   EXPERT. Trois choses de plus :
   · `voitPorteeAuScore` — il chiffre un bloc au sol par ce qu'il ferait a son
     TOTAL : bonus Rose, trophees Collectionneur et Arc-en-ciel, classements
     de piste compris. C'est la difference entre « ce Rose vaut 2 de bareme »
     et « ce Rose me donne les 10 points du bonus » ;
   · `voitConcurrence` — il regarde qui est le plus pres d'un tas avant de s'y
     mettre en route ;
   · `voitAdversaires` — il valorise le fait de sortir quelqu'un de BIG CITY,
     qui coute a l'autre son tour sans rien lui prendre de visible.

   CE QUI A ETE RETIRE, ET POURQUOI. L'Expert avait pour seule marque
   l'evaluation DIFFERENTIELLE : `note -= meilleurAdverse * poids`. Ce terme
   lui faisait perdre des points, de facon monotone. Balayage sur six poids,
   30 parties x 2 series, un Expert contre trois Confirmes, ratio
   Confirme/Expert (plus bas = meilleur Expert) :

     poids   0      0,2     0,5     0,8     1,0     1,6
     ratio  97 %   102 %   101 %   102 %   104 %   120 %

   La cause n'est pas le reglage, c'est l'arithmetique du jeu a quatre :
   couter trois points au meneur les fait gagner autant aux DEUX AUTRES qu'a
   soi, et le tour depense n'a rien rapporte. C'est le piege du faiseur de
   rois. Une variante ne l'ouvrant qu'en fin de partie — quand il ne reste
   plus de tours pour marquer — a ete ecrite et mesuree : elle ne renverse pas
   la tendance non plus.

   Le terme est donc parti. Ce qu'il valorisait au passage, sortir un
   adversaire du ring, est conserve a part, cf. `evaluatePosition`.

   OU PLACER LES DEUX NOUVEAUX REGARDS : MESURE, PAS INTUITION. La
   `voitConcurrence` semblait etre de la lecture de plateau elementaire, donc
   a donner aussi au Confirme. Mesure sur 30 parties x 8 graines, ratio
   Confirme/Expert :

     concurrence reservee a l'Expert   98,9 %
     concurrence ouverte au Confirme  100,9 %

   Elle vaut donc des points, et c'est precisement pour ca qu'elle appartient
   au niveau du dessus. Etat de depart pour comparaison : 103 a 106 %,
   c'est-a-dire un Expert qui PERDAIT contre trois Confirmes.

   PRUDENCE SUR CES CHIFFRES. L'ecart entre deux graines atteint 25 points de
   ratio (85,8 % a 110,3 % sur un meme reglage). Seules des moyennes sur
   plusieurs centaines de parties veulent dire quelque chose, et un ecart de
   moins de 2 points entre deux reglages ne se distingue pas du bruit. Deux
   series de graines, le protocole historique, n'y suffisent pas : mesure a
   REGLAGES STRICTEMENT IDENTIQUES, le siege du Titan 1 rapporte deja ~3 %.
   Une lecture a « 97 % » disait en realite « a egalite ». */
/* ── L'ÉCHELLE, ÉCRITE DU HAUT VERS LE BAS ────────────────────
   EXPERT est la référence : tout est allumé. Les trois autres niveaux
   partent de lui et lui retirent un regard à la fois. Aucun ne reçoit de
   comportement propre — il n'existe pas de « mauvaise règle » écrite pour
   les faibles, seulement des choses qu'ils ne voient pas.

   CE QUE CHAQUE BARREAU PERD, dans l'ordre où ça compte le plus :

   · DIFFICILE perd les DEUX REGARDS SUR LES AUTRES — ce qu'un coup offre
     à qui n'a pas encore joué (`poidsCadeau`), et l'arbitrage d'un vol au
     score complet plutôt qu'au barème (`decisionsAuScoreComplet`). Sa
     recherche conjointe se resserre à deux cases. C'est un très bon joueur
     qui joue SON jeu : il place bien, il compte juste, mais il ne regarde
     pas la table.

   · MOYEN perd la PROGRAMMATION EN SÉQUENCE : il prépare sa Manche en
     notant ses six cartes sur le plateau du moment, donc ses trois cartes
     visent souvent la même chose. Il perd aussi la nuisance et la lecture
     de la concurrence.

   LA LARGEUR DE RECHERCHE EST LA COLONNE VERTÉBRALE DE L'ÉCHELLE, et c'est
   une mesure qui l'a décidé : passer de 4 à 10 cases développées vaut
   +2,50 points par partie (61,7 % de victoires en duel même-partie), passer
   de 10 à 25 n'en vaut plus que +0,34 (51,7 %, donc rien). C'est le seul
   réglage continu du module dont l'effet soit à la fois grand et monotone,
   donc le seul qui puisse espacer proprement quatre barreaux : 0, 2, 4, 10.
   Facile ne cherche pas du tout — il choisit sa case sans savoir quelle
   carte il jouera de là, l'erreur d'ordre la plus courante à la table.

   · FACILE perd la VUE DU SCORE COMPLET : il ne lit que son butin et le
     barème imprimé, les bonus de fin ne lui apparaissent qu'à un quart de
     leur valeur (`visionBonus`). C'est la signature du débutant — il
     ramasse sans compter ses paires ni regarder la piste ADN. Il garde une
     molette de bruit (`topN`, `biais`) qui lui fait lâcher son meilleur
     coup de temps en temps, toujours au profit d'un coup du haut du
     panier : une IA faible crédible se trompe, elle ne délire pas. */
export const FORCE_SETTINGS = Object.freeze({
  [FORCES.EXPERT]: {
    voitScoreComplet: true, voitAdrenaline: true,
    voitAdversaires: true, poidsAdversaires: 0.5, poidsPoursuite: 0.25,
    voitPortee: true, rayonPortee: 3, voitPorteeAuScore: true, voitConcurrence: true,
    poidsCadeau: 0.15, decisionsAuScoreComplet: true,
    /* Sait qu'il peut ARRÊTER la partie, et à quel prix (cf.
       `valeurFinDePartie`). C'est une lecture de fin de partie : elle
       appartient au haut de l'échelle, comme la lecture des adversaires dont
       elle dépend. L'Expert la porte pleine. */
    poidsFinDePartie: 1,
    miseAdrenalineMax: 3, largeurJointe: 10, programmationSequentielle: true,
    topN: 1, biais: 1,
  },
  [FORCES.DIFFICILE]: {
    voitScoreComplet: true, voitAdrenaline: true,
    voitAdversaires: true, poidsAdversaires: 0.5, poidsPoursuite: 0.15,
    voitPortee: true, rayonPortee: 3, voitPorteeAuScore: true, voitConcurrence: true,
    poidsCadeau: 0, decisionsAuScoreComplet: false,
    /* Le Difficile la voit à MOITIÉ : il sent que la partie touche à sa fin
       et en tient compte, sans en faire le pivot de son tour. C'est ce qui
       laisse à l'Expert un barreau au-dessus sur exactement cette lecture,
       plutôt que de leur donner à tous les deux le même réflexe. */
    poidsFinDePartie: 0.5,
    miseAdrenalineMax: 2, largeurJointe: 4, programmationSequentielle: true,
    topN: 1, biais: 1,
  },
  [FORCES.MOYEN]: {
    voitScoreComplet: true, voitAdrenaline: true,
    voitAdversaires: false, poidsAdversaires: 0,
    voitPortee: true, rayonPortee: 3, voitPorteeAuScore: false, voitConcurrence: false,
    poidsCadeau: 0, decisionsAuScoreComplet: false,
    miseAdrenalineMax: 2, largeurJointe: 2, programmationSequentielle: false,
    topN: 1, biais: 1,
  },
  [FORCES.FACILE]: {
    voitScoreComplet: false, visionBonus: 0.25, voitAdrenaline: true,
    voitAdversaires: false, poidsAdversaires: 0,
    voitPortee: true, rayonPortee: 3, voitPorteeAuScore: false, voitConcurrence: false,
    poidsCadeau: 0, decisionsAuScoreComplet: false,
    miseAdrenalineMax: 1, largeurJointe: 0, programmationSequentielle: false,
    topN: 2, biais: 4,
  },
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
export function makeProfile(force = FORCES.MOYEN, temperament = TEMPERAMENTS.OPPORTUNISTE, reglages = null) {
  return reglages ? { force, temperament, reglages } : { force, temperament };
}

/* Les reglages d'un profil, avec une porte d'entree pour la MESURE.
   ===================================================================
   `FORCE_SETTINGS` est gele, et c'est voulu : une force est une chose
   stable, pas un jeu de curseurs qu'on bouge en cours de partie. Mais
   comparer deux reglages exigeait jusqu'ici d'EDITER cette table, de lancer
   une campagne, de la re-editer, de relancer — et de comparer deux mesures
   prises a des moments differents, sur des parties differentes.

   C'est ce protocole-la qui a laisse passer deux fausses corrections de la
   hierarchie des IA (voir le pave sur FORCE_SETTINGS). Un profil peut donc
   porter un `reglages` qui SURCHARGE ceux de sa force. Rien dans le jeu ne
   s'en sert : c'est `scripts/duel-reglages.mjs` qui l'utilise, pour faire
   jouer deux reglages DANS LA MEME PARTIE, sur les memes cartes et le meme
   plateau. La comparaison ne depend alors plus du tirage. */
export function reglagesDe(profile) {
  const base = FORCE_SETTINGS[profile?.force] ?? FORCE_SETTINGS[FORCES.MOYEN];
  return profile?.reglages ? { ...base, ...profile.reglages } : base;
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

/* ── LE TROPHÉE ARC-EN-CIEL, DÉDUIT DU PLATEAU ────────────────
   Il est suivi en cours de partie côté application : le premier Titan à
   posséder les cinq couleurs le prend, et le garde même s'il perd un bloc
   ensuite. L'état de plateau seul ne dit donc pas QUI l'a pris, seulement
   qui le posséderait.

   `evaluatePosition` passait `null` à `computeFinalScore` pour cette
   raison, en jugeant que ne le donner à personne était une sous-estimation
   identique pour tout le monde, donc sans effet sur le classement des
   coups. C'est faux, et c'est le genre d'erreur qui ne se voit pas : ces
   5 points sont DISPONIBLES pour le Titan à qui il manque une couleur, et
   déjà hors d'atteinte pour celui dont un adversaire a fait le plein. La
   différence entre les deux est exactement l'incitation à aller chercher sa
   couleur manquante — et elle valait zéro.

   L'approximation retenue : le premier Titan de la liste qui possède les
   cinq couleurs. Elle se trompe sur l'ORDRE d'arrivée quand deux Titans les
   ont toutes, ce qui est rare et sans conséquence — le trophée est alors
   pris dans les deux lectures. Elle ne se trompe jamais sur ce qui compte :
   il reste à prendre, ou il ne reste pas. */
const COULEURS_ARC = Object.freeze(["bleu", "rose", "orange", "rouge", "vert"]);

export function gagnantArcEnCiel(titans) {
  for (const t of titans || []) {
    const repaire = t?.repaire || [];
    if (COULEURS_ARC.every((c) => repaire.includes(c))) return t.id;
  }
  return null;
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

/* Ce qu'un tour perdu par un ADVERSAIRE me rapporte à moi. Pas la totalité :
   à quatre joueurs, les deux autres en profitent autant. */
const PART_DU_TOUR_ADVERSE = 0.5;


export function valeurAPortee(titan, gameState, rayon = 2, options = {}) {
  const { board = {}, looseBlocks = {}, titans = [] } = gameState;
  const { auScoreComplet = false, voitConcurrence = false } = options;
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

  /* ── DEUX FAÇONS DE CHIFFRER UN BLOC AU SOL ────────────────
     AU BARÈME SEUL (Novice) : ce que la colonne de la couleur rapporterait
     d'un cran de plus. C'est ce que lit un débutant sur la feuille de
     score, et c'est tout ce qu'il lit.

     AU SCORE COMPLET (Confirmé, Expert) : de combien MON TOTAL bougerait si
     ce bloc était déjà dans mon Repaire — barème compris, mais aussi bonus
     Rose, trophée Collectionneur, trophée Arc-en-ciel et classements de
     piste. C'est une différence de nature, pas de précision : le barème
     seul ne peut pas voir qu'un Rose fait basculer dix points parce qu'il
     me met en tête, ni qu'une couleur qui ne me rapporte rien complète mes
     cinq et en vaut cinq. L'IA passait donc à côté de ces situations, sans
     que rien ne le signale — c'est l'angle mort que Nikola a senti à la
     table le 2026-08-27.

     Le calcul est réutilisé tel quel pour les Socles, dont la valeur ne se
     limite pas non plus à leur face : le trophée Collectionneur se joue au
     NOMBRE de Socles, et le bloc qui fait basculer ce classement en vaut
     cinq de plus.

     Le coût est celui d'un `computeFinalScore` par couleur et par valeur de
     Socle rencontrée, mémoïsé pour la durée de l'appel : une poignée de
     calculs par coup candidat, sur une fonction qui en fait déjà bien plus
     pour placer les Verts. */
  const marginal = new Map();
  /* `bestVertAssignments` et pas `{}` — et c'est ce qui manquait au Vert.
     Un Vert n'a pas de barème à lui : il vaut ce que vaut la case où on le
     POSE au décompte. Passer `{}` revenait à ne le poser nulle part, donc à
     le chiffrer à zéro : l'IA voyait un joker gratuit comme un bloc sans
     valeur, et `evaluatePosition` — qui, lui, passait bien
     `bestVertAssignments` — n'était pas d'accord avec elle. Deux calculs de
     score du même module qui ne comptaient pas la même chose.

     Mesuré avant correction : 2,45 Verts ramassés par partie sur les 5 du
     plateau, et 73 Titans sur 160 finissant sans aucun. Nikola, 2026-08-28 :
     « personne n'a voulu prendre un bloc vert alors que c'est fort, ça va
     n'importe où sur une catégorie avec une couleur ». */
  const scoreAvec = (mutation) => {
    const liste = titans.map((t) => (t.id === titan.id ? mutation(t) : t));
    return computeFinalScore(liste, bestVertAssignments(liste), gagnantArcEnCiel(liste))
      .totals[titan.id]?.total ?? 0;
  };
  const baseComplet = auScoreComplet && titans.length > 0 ? scoreAvec((t) => t) : 0;
  const memo = (cle, calcul) => {
    if (!marginal.has(cle)) marginal.set(cle, calcul());
    return marginal.get(cle);
  };

  const gainMarginalCouleur = (couleur) => {
    if (auScoreComplet && titans.length > 0) {
      return memo(`c:${couleur}`, () =>
        Math.max(0, scoreAvec((t) => ({ ...t, repaire: [...(t.repaire || []), couleur] })) - baseComplet)
      );
    }
    if (compte[couleur] === undefined) return 0;
    return scoreBareme(couleur, compte[couleur] + 1) - scoreBareme(couleur, compte[couleur]);
  };
  /* Un Vert est un joker : il ira sur la meilleure case disponible au
     decompte. Sa valeur ici est donc le meilleur gain marginal du moment,
     majore de sa valeur d'option (cf. ATTRAIT_VERT). Il valait 0 avant le
     2026-08-19, ce qui rendait l'IA aveugle a une couleur entiere.

     S'y ajoute ce qu'un Vert rapporte EN TANT QUE COULEUR : il est l'une
     des cinq de l'Arc-en-ciel, et pour un Titan à qui il ne manque que lui,
     c'est un trophée entier. `gainMarginalCouleur("vert")` ne mesure que
     ça — un Vert posé au Repaire ne marque sur aucun barème — donc les deux
     termes ne comptent jamais deux fois la même chose. */
  const gainMarginalVert = () => {
    const joker = Math.max(0, ...Object.keys(compte).map(gainMarginalCouleur)) * ATTRAIT_VERT;
    return joker + (auScoreComplet && titans.length > 0 ? gainMarginalCouleur("vert") : 0);
  };
  const gainMarginal = (couleur) =>
    couleur === "vert" ? gainMarginalVert() : gainMarginalCouleur(couleur);

  /* La valeur d'un Socle : sa face, plus ce que son NOMBRE fait basculer au
     trophée Collectionneur. Au barème seul, on s'en tient à sa face. */
  const gainMarginalSocle = (bloc) => {
    const valeur = socleValue(bloc);
    if (!auScoreComplet || titans.length === 0) return valeur;
    return memo(`s:${valeur}`, () =>
      Math.max(0, scoreAvec((t) => ({ ...t, socles: [...(t.socles || []), valeur] })) - baseComplet)
    );
  };

  const coordonnees = (key) => {
    const r = "ABCDEFGHI".indexOf(key[0]);
    const c = Number(key.slice(1));
    return r < 0 || Number.isNaN(c) ? null : [r, c];
  };
  const distanceA = (key) => {
    const xy = coordonnees(key);
    return xy ? Math.max(Math.abs(xy[0] - r0), Math.abs(xy[1] - c0)) : Infinity;
  };

  /* ── UN TAS QU'UN ADVERSAIRE TIENT DÉJÀ N'EST PAS UN TAS ───
     La décote de distance disait « un tas à deux cases vaut moins qu'un tas
     sous les pieds, puisqu'un adversaire peut le prendre avant ». Elle le
     disait de la même façon que l'adversaire soit collé au tas ou à l'autre
     bout de BIG CITY : la concurrence était supposée, jamais regardée.

     Elle est maintenant lue sur le plateau. Le rapport de force sur un tas
     tient en une comparaison de distances, et rien ne justifie d'en faire
     plus : qui est le plus près le ramasse. Un Titan hors de BIG CITY ne
     compte pas comme concurrent, il perd déjà son tour à rentrer.

     Les coefficients disent une chance de l'emporter, pas une certitude :
     même en tête d'une case, il reste une carte, une poussée ou un Graouhhh
     pour changer l'ordre d'arrivée. */
  const adversaires = voitConcurrence
    ? titans.filter((t) => t.id !== titan.id && !t.horsPlateau && t.cell)
    : [];
  const avantageSur = (key) => {
    if (adversaires.length === 0) return 1;
    const xy = coordonnees(key);
    if (!xy) return 1;
    const mienne = Math.max(Math.abs(xy[0] - r0), Math.abs(xy[1] - c0));
    const meilleureAdverse = Math.min(
      ...adversaires.map((t) => {
        const a = coordonnees(t.cell);
        return a ? Math.max(Math.abs(xy[0] - a[0]), Math.abs(xy[1] - a[1])) : Infinity;
      })
    );
    if (mienne < meilleureAdverse) return 1;
    if (mienne === meilleureAdverse) return 0.6;
    return 0.3;
  };

  let valeur = 0;
  for (const [key, blocs] of Object.entries(looseBlocks)) {
    const distance = distanceA(key);
    if (distance > rayon) continue;
    // Décroissance avec la distance : un tas à 2 cases vaut moins qu'un
    // tas sous les pieds. La distance dit le DÉLAI, `avantageSur` dit la
    // concurrence — deux choses différentes qu'un seul coefficient
    // confondait.
    const proximite = (1 / (1 + distance)) * avantageSur(key);
    for (const bloc of blocs || []) {
      const points = isSocleMarker(bloc) ? gainMarginalSocle(bloc) : gainMarginal(bloc);
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
    const proximite = (1 / (1 + distance)) * avantageSur(key);
    for (const bloc of bat.blocks) {
      valeur += gainMarginal(bloc) * 0.5 * proximite;
    }
  }

  /* `decotePortee` permet de mesurer ce que pese la partie HEURISTIQUE de
     la note. C'est la seule partie qui n'est pas un vrai score : le reste
     compte des points acquis, celle-ci parie sur des points a venir.

     Elle biaise la comparaison entre cartes, et pas qu'un peu. Une carte
     qui DEPLACE le Titan — Boing Boing, Tete en Avant — fait varier
     enormement cette estimation d'un candidat a l'autre, et en propose des
     dizaines (une par case d'arrivee, par mise) ; Tout Casser ne bouge
     presque pas et n'en propose que trois ou quatre. Prendre le MAXIMUM
     d'une estimation bruitee favorise donc mecaniquement la carte qui a le
     plus de candidats, independamment de sa vraie valeur. Mesure a l'appui :
     Tete en Avant 31,6 % des cartes jouees, Boing Boing 27,0 %, Tout Casser
     15,8 % — alors que c'est la carte qui met le plus de blocs au Repaire. */
  return valeur * (options.decotePortee ?? DECOTE_PORTEE);
}

/* ── CE QU'UN COUP OFFRE AUX AUTRES ───────────────────────────
   Demande de Nikola, 2026-08-28 : « les choix de déplacement et d'action en
   fonction de l'évolution du plateau — si je joue cette carte alors que ce
   Titan n'a pas joué, j'offre quoi possiblement ».

   C'est l'angle mort le plus coûteux de l'évaluation, et il est structurel :
   `valeurAPortee` ne regarde que MON Périmètre. Un Tout Casser qui pulvérise
   un bâtiment éparpille quatre blocs autour de lui — si trois tombent dans
   le Périmètre du voisin qui joue juste après, je viens de lui servir son
   tour, et rien dans la note ne le disait. La carte se notait sur ce qu'elle
   me rapportait, jamais sur ce qu'elle distribuait.

   QUI COMPTE, ET POURQUOI SEULEMENT EUX. Seuls les Titans qui n'ont PAS
   encore joué ce round peuvent ramasser avant moi. Ce que je pose devant un
   Titan qui a déjà joué, je peux encore aller le prendre : ce n'est pas un
   cadeau, c'est un dépôt. La distinction est exactement celle que Nikola
   énonce, et elle est ce qui rend le terme jouable plutôt que paralysant —
   sans elle, l'IA refuserait de casser quoi que ce soit près de qui que ce
   soit.

   COMBIEN ÇA COÛTE, ET CE QUE LA MESURE PEUT EN DIRE. Le poids a d'abord été
   posé à 0,5, par le même raisonnement que la nuisance : à quatre joueurs, un
   point donné ne coûte pas un point. Mesuré en duel même-partie, 320 parties,
   c'était trop cher — l'éteindre rapportait +2,07 points par partie (56,9 %
   de victoires), et le baisser à 0,15 en rapportait +1,07 (53,8 %).

   Il reste à 0,15, et la raison tient à une LIMITE DU PROTOCOLE qu'il faut
   énoncer plutôt que masquer. En duel, les deux camps portent le même
   réglage : ils sont donc également prudents, la valeur défensive du terme
   s'annule des deux côtés, et il ne reste que son coût — casser moins, alors
   que la destruction est le moteur du score. Ce que le duel ne peut pas
   mesurer est justement la situation de Nikola : un adversaire humain qui
   ramasse tout ce qu'on laisse tomber devant lui.

   0,15 est donc le meilleur compromis mesurable : le regard existe, et il ne
   coûte plus qu'environ un point en autarcie. Le monter demanderait une
   mesure contre un joueur humain, que ce dépôt ne sait pas faire.

   ON RÉUTILISE `valeurAPortee`, avec le rayon de CELUI QUI RAMASSERAIT, pas
   le mien : une IA n'a pas à supposer que son adversaire voit moins bien
   qu'elle. */
export function valeurOfferte(titanId, gameState, options = {}) {
  const { titans = [], aJouerEncore = null } = gameState;
  if (!aJouerEncore || aJouerEncore.size === 0) return 0;
  const { rayon = 3, auScoreComplet = false } = options;

  let total = 0;
  for (const autre of titans) {
    if (autre.id === titanId) continue;
    if (!aJouerEncore.has(autre.id)) continue;
    if (autre.horsPlateau) continue; // il rentre d'abord, il ne ramasse pas
    total += valeurAPortee(autre, gameState, rayon, { auScoreComplet, voitConcurrence: false });
  }
  return total;
}

/* ── ÉVALUATION ───────────────────────────────────────────── */

/* ============================================================
   SAVOIR QU'ON PEUT ARRÊTER LA PARTIE
   ============================================================
   Demande de Nikola, 2026-08-28 : « il faut qu'une IA ait bien conscience des
   moyens de mettre fin à la partie, hors fin de Manche 4 — si elle a par
   exemple 20 points d'avance et qu'il reste 2 bâtiments à casser pour
   atteindre le seuil de fin, peut-être que c'est intéressant pour elle de le
   faire exprès. »

   L'évaluation ne voyait littéralement pas la fin de partie. Elle note un
   ÉTAT, comme si la partie durait toujours : casser l'avant-dernier bâtiment
   valait pour elle exactement ce que valait le bloc récupéré, ni plus ni
   moins. Un meneur laissait donc filer des Manches pendant lesquelles ses
   adversaires le rattrapaient, et un retardataire déclenchait joyeusement la
   fin qui le condamnait.

   TROIS DÉCLENCHEURS DE PLATEAU (cf. `checkEndGameTriggers`) : l'Apocalypse
   Urbaine (assez de bâtiments détruits), la Pénurie (une couleur épuisée du
   plateau) et le Vide Spatial (un seul Téléporteur actif). Tous trois se
   mesurent en « combien de gestes il reste avant » — et tous trois se
   rapprochent quand on casse, ce que l'IA fait de toute façon. C'est ce qui
   rend ce terme peu coûteux : il ne demande pas de jouer autrement, il
   départage deux coups qui se valaient jusque-là.

   LE SIGNE PORTE TOUT. La valeur est mon AVANCE sur le meilleur adversaire,
   pondérée par la proximité de la fin :
   · je mène → rapprocher la fin vaut positif, et d'autant plus que je mène ;
   · je suis derrière → la même chose vaut négatif : il me faut des Manches.
   Aucune règle en dur du type « casse si tu mènes » : le nombre s'inverse
   tout seul, et il s'annule quand la partie est serrée — un écart de 2 points
   ne justifie pas de sacrifier un coup.

   PORTÉE VOLONTAIREMENT COURTE. Au-delà de trois gestes, la fin n'est pas une
   décision mais une supposition : le terme reste nul, et l'IA joue son jeu.
   Sans cette borne elle biaiserait toute la partie sur une fin lointaine que
   les adversaires peuvent de toute façon repousser.
============================================================ */
const PORTEE_FIN_DE_PARTIE = 3;

function gestesAvantLaFin(gameState) {
  const { board = {}, looseBlocks = {}, finDePartie } = gameState;
  const seuil = finDePartie?.apocalypseThreshold ?? 5;

  // Apocalypse Urbaine : bâtiments encore debout au-dessus du seuil.
  const apocalypse = Math.max(0, countStandingBuildings(board) - seuil);
  // Vide Spatial : Téléporteurs actifs au-dessus du dernier.
  const vide = Math.max(0, countActiveTeleporters(board) - 1);
  // Pénurie : la couleur la plus proche de disparaître du plateau.
  let penurie = Infinity;
  COULEURS.forEach((c) => {
    penurie = Math.min(penurie, countColorOnBoard(c, board, looseBlocks));
  });

  return Math.min(apocalypse, vide, penurie);
}

function valeurFinDePartie(titanId, gameState, scores) {
  const restant = gestesAvantLaFin(gameState);
  if (restant > PORTEE_FIN_DE_PARTIE) return 0;

  const { titans = [] } = gameState;
  const mien = scores.totals[titanId]?.total ?? 0;
  let meilleurAutre = -Infinity;
  titans.forEach((t) => {
    if (t.id === titanId) return;
    meilleurAutre = Math.max(meilleurAutre, scores.totals[t.id]?.total ?? 0);
  });
  if (meilleurAutre === -Infinity) return 0; // solo : rien à devancer
  const avance = mien - meilleurAutre;

  // 1 quand un seul geste suffit, décroissant jusqu'à la portée.
  const proximite = (PORTEE_FIN_DE_PARTIE + 1 - restant) / (PORTEE_FIN_DE_PARTIE + 1);
  return avance * proximite;
}

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

  const reglages = reglagesDe(profile);
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
  const scores = computeFinalScore(titans, bestVertAssignments(titans), gagnantArcEnCiel(titans));
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
      /* VISION PARTIELLE DES BONUS DE FIN (lissage du 2026-08-19).

         Le Novice ne voyait RIEN de ce qui se compte a la fin : bonus Rose,
         trophee Collectionneur, Arc-en-ciel, pistes ADN. C'est ce qui creusait
         l'essentiel de son retard, mesure a 63 % du score de l'Expert.

         Il ne s'agit pas de lui donner la vue complete, ce qui en ferait un
         Confirme : il en percoit desormais une PART (`visionBonus`). C'est
         aussi plus juste comme modele de debutant, qui n'ignore pas qu'il
         existe des bonus mais les sous-estime et joue surtout son butin. */
      const part = reglages.visionBonus ?? 0;
      return (
        detail.bareme * poids.bareme +
        detail.socles * poids.socles +
        part * (
          detail.roseBonus * poids.bareme +
          detail.collectionneurBonus * poids.socles +
          detail.rainbowBonus +
          (detail.bagarrePts + detail.destructionPts) * poids.adn
        ) +
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
    note += valeurAPortee(moi, gameState, reglages.rayonPortee ?? 2, {
      auScoreComplet: reglages.voitPorteeAuScore ?? false,
      voitConcurrence: reglages.voitConcurrence ?? false,
      decotePortee: reglages.decotePortee,
    }) * poids.portee;
  }

  /* Ce que ce coup met à portée de ceux qui n'ont pas encore joué. Voir le
     pavé sur `valeurOfferte` : c'est la question que Nikola pose mot pour
     mot, et à laquelle l'évaluation ne savait pas répondre. */
  const poidsCadeau = reglages.poidsCadeau ?? 0;
  if (poidsCadeau > 0) {
    /* Au BARÈME, jamais au score complet. D'abord parce que c'est ce qu'un
       joueur estime réellement de la main de son voisin — « il y a deux
       Rouges devant lui » — et pas ce que ça fera à son total final.
       Ensuite parce que le score complet coûte un `computeFinalScore` par
       couleur et par adversaire : trois adversaires feraient passer le coût
       d'un coup candidat de six calculs de score à vingt-quatre, sur une
       fonction déjà appelée des centaines de fois par tour. */
    note -= valeurOfferte(titanId, gameState, {
      rayon: reglages.rayonPortee ?? 2,
      auScoreComplet: false,
    }) * poidsCadeau;
  }

  /* ── SORTIR UN ADVERSAIRE DU RING ──
     Le seul regard que l'Expert porte encore sur les autres. Depuis le ruling
     du 2026-08-16, un Titan poussé hors de BIG CITY attend son tour pour
     rentrer et sa rentrée lui mange son Mouvement gratuit : l'éjecter lui
     coûte, concrètement, un tour de jeu.

     `computeFinalScore` ne peut pas le voir — sortir quelqu'un ne déplace
     aucun score, ni le sien ni le mien — et sans ce terme l'IA n'a
     littéralement aucune raison de le faire, alors que c'est une des actions
     les plus fortes du jeu.

     Il survit au retrait de l'évaluation différentielle (voir FORCE_SETTINGS)
     et pour une raison de fond : gêner le meneur coûte un tour qu'on aurait
     passé à marquer, alors qu'une éjection est presque toujours le SOUS-
     PRODUIT d'un coup qu'on jouait de toute façon. Le mauvais échange qui
     condamnait la nuisance n'existe pas ici.

     Demi-coefficient assumé, celui qu'il avait déjà : à quatre joueurs, le
     tour perdu par l'autre ne me revient pas en entier. Modulé par le
     tempérament, c'est une action de la famille agression. */
  if (reglages.voitAdversaires) {
    const ejectes = titans.filter((t) => t.id !== titanId && t.horsPlateau).length;
    if (ejectes > 0) note += ejectes * VALEUR_TOUR_PERDU * PART_DU_TOUR_ADVERSE * poids.adn;
  }

  /* Rapprocher ou repousser la fin de partie, selon qu'on mène ou qu'on suit
     (cf. `valeurFinDePartie`). Réservé aux forces qui lisent déjà le score de
     leurs adversaires : ce terme n'a aucun sens sans cette lecture, puisque
     c'est l'ÉCART qui en porte le signe. */
  const poidsFin = reglages.poidsFinDePartie ?? 0;
  if (poidsFin > 0 && reglages.voitAdversaires) {
    note += valeurFinDePartie(titanId, gameState, scores) * poidsFin;
  }

  /* ── LA NUISANCE, REMISE — ET LA MESURE QUI L'AVAIT CONDAMNEE ──
     L'evaluation differentielle — `note -= meilleurAdverse * poids` — avait
     ete retiree le matin meme du 2026-08-27, sur un balayage qui la disait
     monotone-perdante (97 % a 120 % de ratio Confirme/Expert selon le poids).

     Ce balayage comparait deux CAMPAGNES SEPAREES, chacune avec son propre
     tirage. C'est le protocole dont l'en-tete de `mesure-forces.mjs` dit
     lui-meme qu'il ne distingue pas un ecart de moins de 2 points du bruit,
     et dont l'ecart entre graines atteint 25 points de ratio a reglage
     INCHANGE.

     Remesure le soir meme avec `scripts/duel-reglages.mjs`, qui fait jouer
     les deux reglages DANS LA MEME PARTIE, sieges croises pour annuler les
     ~3 % du siege du Titan 1 — 240 parties par temperament, Expert :

         opportuniste   +0,25 point par partie   52,5 % de victoires
         agressif       +0,60 point par partie   53,8 % de victoires

     (50 % = a egalite.) L'Agressif est le temperament qui module la nuisance
     le plus fort : s'il devait couter quelque part, ce serait la.

     Le terme ne coute donc rien. La conclusion du matin etait un artefact du
     protocole, pas un fait de jeu, et c'est la troisieme fois que ce
     protocole fait trancher a l'envers une question sur les IA.

     IL EST DONC REBRANCHE SUR L'EXPERT, au poids qu'il avait (0,5), module
     par le temperament — un Agressif (adn 1,5) gene plus, un Collectionneur
     (adn 0,7) nettement moins. C'est ce qui repond a la seule chose que
     Nikola ait dite en la matiere : « je trouve les IA moins fortes
     qu'avant ». Une IA qui ne regarde que son propre score ne fait rien
     contre celui qui mene — au siege d'en face, ca se lit exactement comme
     de la faiblesse, meme quand son total ne bouge pas.

     Le Novice et le Confirme restent a 0 : gener n'est pas une lecture de
     debutant, et c'est la marque de l'Expert depuis toujours.

     Et il y a une seconde raison de ne pas l'avoir efface. Le retrait
     optimisait le SCORE de l'IA ; Nikola, lui, dit « je trouve les IA moins
     fortes qu'avant » depuis le siege d'en face. Une IA qui joue en faiseur
     de rois marque moins ET rend la partie plus dure a celui qui mene : les
     deux objectifs ne sont pas le meme, et c'est un arbitrage de jeu, pas de
     code. L'interrupteur est ce qui permettra de le trancher sur mesure. */
  const poidsAdverse = (reglages.poidsAdversaires ?? 0) * poids.adn;
  if (poidsAdverse > 0) {
    const adversaires = titans.filter((t) => t.id !== titanId);
    if (adversaires.length > 0) {
      const meilleurAdverse = Math.max(...adversaires.map((t) => noteDe(scores.totals[t.id])));
      note -= meilleurAdverse * poidsAdverse;
    }
  }

  /* ── TOUS CEUX QUI SONT DEVANT, PAS SEULEMENT LE PREMIER ──
     Nikola, 2026-08-28 : « l'IA doit avoir conscience qu'attaquer le premier
     peut rebattre les cartes, dans le sens où ça diminue le score du premier et
     ça va sûrement augmenter le sien. Ce n'est pas forcément valable que pour le
     premier, mais c'est l'idée. »

     La première moitié de sa phrase était déjà câblée, et mesurée : le terme
     différentiel juste au-dessus retranche le score du MEILLEUR adversaire, donc
     un coup qui lui coûte des points vaut déjà davantage. C'est la seconde
     moitié qui manquait — « pas forcément que pour le premier ».

     Une IA quatrième n'a rien à gagner à taper la troisième tant que seul le
     maximum compte : le dépasser ne fait pas bouger `meilleurAdverse` d'un
     point. Or c'est bien un gain — une place, c'est une place, et les points de
     podium des Pistes ADN se jouent exactement là.

     On ajoute donc l'ÉCART à ceux qui sont devant, LE MEILLEUR EXCLU puisqu'il
     est déjà compté : aucun double comptage, et le terme est nul dès qu'on mène
     ou qu'on n'est second que du premier. Pondéré séparément pour rester
     mesurable et réversible sans toucher à un terme déjà validé (cf.
     `scripts/duel-reglages.mjs`, clé `poidsPoursuite`).

     ⚠️ NON MESURÉ À CE JOUR. Le poids ci-dessous est un point de départ, pas un
     réglage validé : il est délibérément plus faible que le terme du meneur,
     parce que rattraper un troisième vaut moins que gêner un premier. */
  const poidsPoursuite = (reglages.poidsPoursuite ?? 0) * poids.adn;
  if (poidsPoursuite > 0) {
    const mesPoints = noteDe(mien);
    const devantMoi = titans
      .filter((t) => t.id !== titanId)
      .map((t) => noteDe(scores.totals[t.id]))
      .filter((v) => v > mesPoints)
      .sort((a, b) => b - a)
      .slice(1); // le meilleur est déjà pris en compte juste au-dessus
    for (const valeur of devantMoi) note -= (valeur - mesPoints) * poidsPoursuite;
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
  const reglages = reglagesDe(profile);
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
