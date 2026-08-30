import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Domain from "../domain/index.js";
import { TITAN_COLORS } from "../ui/titans/constants.js";
import SetupScreen from "../ui/SetupScreen.jsx";
/* Partie à distance. Le contrôleur ne parle jamais au réseau directement : il
   passe par ces trois fonctions, qui décident CE QUI est public (le plateau) et
   ce qui ne l'est pas (les mains). Cf. `src/net/session.js`. */
import { plateauPublic, mainPrivee, fusionnerMain } from "../net/session.js";

/* Destructuration du domaine au NIVEAU MODULE, et non plus à l'intérieur du
   hook. Ces fonctions sont des constantes de module : les déclarer dans le
   corps du composant en faisait, aux yeux de `react-hooks/exhaustive-deps`,
   des valeurs susceptibles de changer d'un rendu à l'autre — d'où une
   trentaine d'avertissements sans objet qui noyaient les vrais. Aucun
   identifiant ne change, seul leur emplacement bouge. */
const {
  STOCK_INITIAL, COULEURS, COLOR_HEX, ROWS, BUILDING_ROWS, BUILDING_COLS, socleMarker, isSocleMarker, socleValue, isBuildingCell,
  countStandingBuildings, countColorOnBoard, countActiveTeleporters, checkEndGameTriggers, manchesMax, shuffle, buildBag, getQuadrant, generateBoard,
  CORNERS, TITAN_GRADIENT, ACTION_CARDS, CARD_LABEL, PHASES, getActivePhases, PHASE_LABELS, EVENT_NAMES, CARD_FORCE, placeTitans, getPlacementCells, placerTitanInitial, nextDetonateur,
  rowIndex, rowFromIndex, getPerimeter, computeEnergyToutCasser, releaseSocle, projectInDirection, estSurLePlateau, indexerTitans, rentrerEnJeu,
  resolveToutCasserBatiments, resolveToutCasserBlocs,
  resolveToutCasserTitans, resolveToutCasserAmas, resolveToutCasser, releverPercussion, listerCiblesToutCasser, resolveToutCasserCase, computeEnergieParDistance, PORTEE_TETE_EN_AVANT, resolveTeteEnAvant,
  scanGraouhhhAxis, advanceGraouhhh, isLanterneRouge, getJeNePartagePasPool, getJeNePartagePasCount, resolveJeNePartagePasElement, deplacerSiDerniereCaseLibre, resolveJeNePartagePas, PORTEE_BOING_BOING, getBoingBoingReach, resolveBoingBoing,
  choisirRepliIA, appliquerRepli, appliquerReplElement,
  canRage, canDil, SOCLE_OPTION, getDilOptions, retirerSocleAuSort, makeDecisionRequest, getEcroulementCells, resolveEcroulementAmas,
  getActiveTeleporterCells, getFreeAdjacentCells, getMovementReachable, getMovePath, resolveFreeMovement,
  getRecuperationPool, resolveRecuperation, retirerPileVide, programCards, ensureProgrammableHand, discardCardHidden, getNonPlayedPool, sendCardToOwnRepos, resolveVolPhaseRepos,
  resolveFatigue, refuserFatigue, applyRestitution, getProgrammedSum, getFPMCTargets, resolveFautPasMeChauffer, BAREME, BAREME_ORANGE_PAIRES, STANDARD_COLORS,
  scoreBareme, PODIUM_POINTS, rankWithTies, countRepaireColors, computeFinalScore, classementFinal,
  valeurMarginaleAdrenaline,
  pick,
  setSeed,
  // IA : profils et choix de coup (cf. src/domain/aiEvaluation.js et aiPlanner.js)
  FORCES, FORCE_SETTINGS, TEMPERAMENTS, makeProfile, profileLabel, bestVertAssignment, reglagesDe,
  rendreCartesEmpruntees,
  planMovement, planCardPlay, planRecuperation, planProgrammation, planProgrammationSequentielle,
  planTour, choisirRepartitionEcroulement
} = Domain;

/* ── VALEUR D'UNE OPTION DE DILEMME, POUR L'IA ──
   Quatre fonctions pures, remontées au niveau du module le 2026-08-18.
   Elles étaient déclarées DANS le composant, donc reconstruites à chaque
   rendu : `coutOptionDil` servait de dépendance à `autoResolveIaDecisions`,
   qui perdait sa mémoïsation à chaque frappe. Elles ne lisent que leurs
   arguments et le barème du domaine, elles n'ont rien à faire là-dedans. */
function marginalValue(color, currentRepaire, allPlayers, selfId) {
  const counts = {};
  currentRepaire.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  const before = scoreBareme(color, counts[color] || 0);
  const after = scoreBareme(color, (counts[color] || 0) + 1);
  let delta = after - before;
  if (color === "rose") {
    const selfRose = (counts["rose"] || 0) + 1;
    const maxOthers = Math.max(0, ...allPlayers
      .filter((p) => p.id !== selfId)
      .map((p) => p.repaire.filter((c) => c === "rose").length));
    if (selfRose > maxOthers) delta += 10;
    else if (selfRose === maxOthers) delta += 5;
  }
  if (color === "orange" && ((counts["orange"] || 0) % 2 === 1)) delta = 0;
  return delta;
}

/* VALEUR D'UN SOCLE POUR L'IA — espérance, pas certitude.
   Le Socle du Dilemme est tiré AU SORT : ni l'attaquant ni la cible ne
   savent lequel partira. La seule évaluation honnête est donc la valeur
   MOYENNE des Socles de la cible. Prendre le maximum ferait surestimer
   l'option à l'IA et lui ferait proposer le Socle bien trop souvent ;
   prendre le minimum la lui ferait ignorer. */
function esperanceSocle(defender) {
  const socles = defender.socles || [];
  if (socles.length === 0) return 0;
  return socles.reduce((s, v) => s + v, 0) / socles.length;
}

/* Ce que l'option rapporte à l'ATTAQUANT s'il la désigne.
   Quand la carte envoie le bloc au sol, l'attaquant ne gagne rien
   directement : il ne fait que retirer des points à sa cible. La valeur du
   coup est donc le COÛT pour la cible, pas le gain marginal chez lui. Sans
   cette distinction, l'IA évaluait une RAGE de Tout Casser — désormais « au
   sol » — comme si elle encaissait le bloc. */
function valeurOptionDil(option, defender, attacker, allPlayers, decision) {
  const versRepaire = decision.destination === "repaire";
  if (option === SOCLE_OPTION) return esperanceSocle(defender);
  if (versRepaire) return marginalValue(option, attacker.repaire, allPlayers, attacker.id);
  return marginalValue(option, defender.repaire, allPlayers, defender.id);
}

/* Ce que l'option coûte à la CIBLE si elle l'abandonne. Elle choisit
   toujours la moins chère des deux. */
function coutOptionDil(option, defender, allPlayers) {
  if (option === SOCLE_OPTION) return esperanceSocle(defender);
  return marginalValue(option, defender.repaire, allPlayers, defender.id);
}

/* ── LE DÉFENSEUR DÉCIDE, TOUJOURS, MÊME QUAND C'EST UNE IA ──
   Ruling rappelé par Nikola le 2026-08-28 : « quand un joueur ou une IA fait
   un DIL à une cible, ce n'est pas l'attaquant qui décide de lui prendre une
   Adrénaline, c'est le défenseur qui peut l'utiliser pour ne pas avoir à
   donner un des deux blocs demandés ».

   Le choix existait dans deux des trois configurations — le défenseur humain
   a son bouton « Payer 1 💉 », le défenseur IA face à un attaquant humain a
   son arbitrage. Il manquait EXACTEMENT là où personne ne pouvait le voir :
   la résolution automatique IA contre IA, qui faisait perdre un bloc au
   défenseur sans jamais lui proposer de payer. Deux IA de même force ne
   jouaient donc pas la même règle selon qui les attaquait.

   L'arbitrage est extrait ici pour que les deux chemins lisent le MÊME code,
   plutôt que d'en avoir une copie chacun qui dérive.

   COMMENT IL TRANCHE. Une Adrénaline lâchée coûte sa valeur marginale au
   barème progressif — elle vaut d'autant plus cher que la réserve est
   grosse — et elle atterrit chez l'attaquant, donc elle coûte double pour
   qui suit le score de ses adversaires (`voitAdversaires`). Le défenseur
   paie quand le bloc menacé lui coûte davantage. */
function defenseurPaieAdrenaline(defender, coutDuBloc, voitAdversaires) {
  if ((defender?.adrenaline || 0) < 1) return false;
  const marginale = valeurMarginaleAdrenaline((defender.adrenaline || 0) - 1);
  const coutAdrenaline = voitAdversaires ? marginale * 2 : marginale;
  return coutDuBloc > coutAdrenaline;
}

export function useBoardGeneratorController() {
  const [nbJoueurs, setNbJoueurs] = useState(4);
  const [setupDone, setSetupDone] = useState(false);
  /* File du PLACEMENT D'OUVERTURE (Nikola, 2026-08-28) : les Titans restant à
     poser, dans l'inverse de l'initiative, Détonateur en dernier. Vide en
     dehors de cette séquence. Les IA s'y résolvent seules, un humain attend
     son clic — et voit donc, à SON tour, exactement qui est déjà posé. */
  const [placementRestant, setPlacementRestant] = useState([]);
  const placementRestantRef = useRef([]);
  const [eventsEnabled, setEventsEnabled] = useState(false);
  const [state, setState] = useState(() => generateBoard());
  const [titanState, setTitanState] = useState(() => placeTitans(4));
  // `actionLog` et `looseBlocks` sont déclarés ICI, en tête, et non plus au
  // milieu du fichier : `advanceManche` doit lire `looseBlocks` pour évaluer
  // les déclencheurs de fin de partie, et un tableau de dépendances est
  // évalué au moment du rendu — une déclaration plus bas provoquerait une
  // ReferenceError de zone morte temporelle.
  const [actionLog, setActionLog] = useState([]);
  const [looseBlocks, setLooseBlocks] = useState({});
  /* Files de DÉCISIONS EN ATTENTE, déclarées ici en tête pour la même
     raison que `actionLog` et `looseBlocks` juste au-dessus : les effets de
     Phase, plus haut dans le corps du hook, doivent les lire dans leur
     tableau de dépendances — et un tableau de dépendances est évalué AU
     RENDU. Une déclaration plus bas provoquerait une ReferenceError de zone
     morte temporelle. Leur documentation détaillée est restée à leur ancien
     emplacement, avec le reste de la mécanique de repli. */
  const [decisionQueue, setDecisionQueue] = useState([]);
  const [repliQueue, setRepliQueue] = useState([]);
  const [ecroulement, setEcroulement] = useState(null);
  /* File de Tout Casser : les éléments qu'il reste à projeter, dans l'ordre que
     le joueur décide (cf. `jouerToutCasser`). Déclarée ICI, avec les autres
     résolutions en plusieurs temps, et non près de la carte qui la remplit :
     `captureSnapshot` la cite dans ses dépendances, et un tableau de
     dépendances est évalué AU RENDU — une déclaration plus bas donnerait une
     ReferenceError de zone morte temporelle. */
  const [toutCasserFile, setToutCasserFile] = useState(null);
  const currentDecision = decisionQueue[0] || null;
  const currentRepli = repliQueue[0] || null;
  const [seedCount, setSeedCount] = useState(1);
  /* GRAINE DE LA PARTIE (Nikola, 2026-08-24 : « rejouer une partie depuis sa
     graine »). Le module RNG etait deja seme et deterministe, mais l'APPLICATION
     ne l'appelait jamais : seul le simulateur le faisait. Une partie jouee a la
     table n'etait donc pas rejouable, et sa graine n'etait meme pas enregistree.
     regenerate() la fixe desormais explicitement et la retient. */
  const [gameSeed, setGameSeed] = useState(null);
  const [seedInput, setSeedInput] = useState("");
  const [mancheNumber, setMancheNumber] = useState(1);
  const [activePlayerId, setActivePlayerId] = useState(() => titanState.detonateur);

  // { 1: "humain"|"ia", 2: "humain"|"ia", ... }
  const [titanModes, setTitanModes] = useState({ 1: "humain", 2: "humain", 3: "humain", 4: "humain" });
  // { 2: { force, temperament }, ... } — profil de chaque Titan piloté par
  // l'IA. Tiré au sort à chaque nouvelle partie et JAMAIS affiché tant que
  // le joueur ne le demande pas (cf. profilsReveles) : deux parties de
  // suite avec les mêmes adversaires ne doivent pas se ressembler, et
  // savoir qui est l'Expert d'avance retirerait tout l'intérêt.
  // `profilsImposes` permet de figer les profils pour les campagnes de
  // simulation, où un tirage aléatoire rendrait les résultats
  // ininterprétables (on ne saurait plus si un Titan perd à cause de sa
  // position ou parce qu'il a tiré Novice trois fois de suite).
  const [titanProfiles, setTitanProfiles] = useState({});
  const [profilsImposes, setProfilsImposes] = useState(null);
  /* DIFFICULTÉ DE LA PARTIE — Nikola, 2026-08-28 : « j'aimerais avoir
     4 niveaux de difficulté clairement distincts ».

     La force de chaque IA était TIRÉE AU SORT, uniformément. C'était voulu
     — deux parties de suite ne devaient pas se ressembler — mais personne
     n'avait posé le calcul : à trois IA en face, 25,9 % des parties
     comptaient deux débutants ou plus, et 29,6 % n'avaient aucun Expert.
     Une soirée sur quatre tombait sur une table molle sans qu'aucun réglage
     n'ait bougé, et c'est ce que Nikola a lu comme « les IA sont moins
     fortes qu'avant ».

     Le niveau choisi s'applique donc à TOUTES les IA, et il est le seul à
     décider de leur force. La variété change de porte : les TEMPÉRAMENTS
     restent tirés au sort (voir `tirerProfils`), et ce sont eux qui font
     que deux parties ne se ressemblent pas — sans jamais faire varier la
     difficulté annoncée. */
  const [difficulte, setDifficulte] = useState(FORCES.MOYEN);
  /* Ce que fait le vol de Phase Repos, choisi avant le lancement (Nikola,
     2026-08-28). "main" = la carte est empruntée par le voleur pour une
     Manche puis rendue ; "repos" = elle part au frigo chez sa victime,
     la règle d'origine. Le défaut vit ici, et nulle part ailleurs. */
  const [modeVolRepos, setModeVolRepos] = useState("main");
  // Titans dont le profil a été dévoilé (easter-egg des 10 clics, ou
  // révélation générale de fin de partie).
  const [profilsReveles, setProfilsReveles] = useState({});

  // Dévoile le profil d'un Titan. Appelé par l'easter-egg des 10 clics sur
  // l'encart d'un Titan, et par la révélation générale de fin de partie.
  const revelerProfil = useCallback((id) => {
    setProfilsReveles((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, []);

  const tirerProfils = useCallback((modes, nb) => {
    if (profilsImposes) return { ...profilsImposes };
    // La FORCE vient du niveau choisi, la même pour toutes les IA : c'est
    // ce que « quatre niveaux de difficulté » veut dire. Seul le
    // TEMPÉRAMENT est tiré au sort — il change la façon de jouer, jamais la
    // force, et c'est lui qui fait que deux parties ne se ressemblent pas.
    const temperaments = Object.values(TEMPERAMENTS);
    const out = {};
    for (let id = 1; id <= nb; id++) {
      if (modes[id] !== "ia") continue;
      out[id] = makeProfile(difficulte, pick(temperaments));
    }
    return out;
  }, [profilsImposes, difficulte]);

  // { 1: "Max", 2: "Étagère", ... } — nom personnalisé choisi en config
  // (session, demande Nikola : "j'ai le droit de choisir mon nom"). Vide
  // par défaut → fallback affiché "Titan {id}" partout (cf. titanDisplayName).
  const [titanNames, setTitanNames] = useState({ 1: "", 2: "", 3: "", 4: "" });
  // Nom complet affiché ("Max" si renseigné, sinon fallback "Titan {id}").
  const titanDisplayName = useCallback(
    (id) => (titanNames[id] && titanNames[id].trim()) || `Titan ${id}`,
    [titanNames]
  );
  // Version compacte pour les contextes à espace réduit (colonnes de
  // tableau, badges) — mêmes règles, fallback "T{id}".
  const titanShort = useCallback(
    (id) => (titanNames[id] && titanNames[id].trim()) || `T${id}`,
    [titanNames]
  );
  const [aiPlaying, setAiPlaying] = useState(false); // true pendant qu'une IA joue
  const [aiStepLabel, setAiStepLabel] = useState(""); // étape visible dans l'UI
  const aiPlayingRef = useRef(false);
  const setAiPlayingSync = (val) => { aiPlayingRef.current = val; setAiPlaying(val); if (!val) setAiStepLabel(""); };

  const [phase, setPhase] = useState("evenement");
  const [phaseValidated, setPhaseValidated] = useState({});
  const [currentEvent, setCurrentEvent] = useState(null);
  const [rainbowWinnerId, setRainbowWinnerId] = useState(null);
  const [showScoring, setShowScoring] = useState(false);
  /* Journal en superposition (Nikola, 2026-08-28). Ce n'est PAS un état de
     partie : il ne part pas dans l'instantané d'annulation, et « Annuler » ne
     doit pas refermer un panneau de lecture qu'on avait ouvert. Le décompte,
     lui, y figure déjà — c'est un héritage, pas un modèle à suivre. */
  const [showJournal, setShowJournal] = useState(false);
  /* Podium de fin. Il s'ouvre TOUT SEUL la première fois que le classement
     devient connu, et une seule fois : le refermer doit tenir. */
  const [showPodium, setShowPodium] = useState(false);
  const podiumDejaOuvert = useRef(false);
  // Fin de partie atteinte. Distinct de `showScoring`, qui n'est qu'un
  // panneau consultable : `gameOver` arrête réellement la partie et empêche
  // la boucle de phases de repartir en Programmation. Sans lui, la fin de
  // partie détectée dans advanceManche relançait quand même une Manche
  // fantôme — le jeu revenait en Programmation sur la dernière Manche, sans
  // cartes à programmer, et restait figé là (bug remonté par Nikola le
  // 2026-08-17 : « je suis repassé en programmation mais en manche 4, donc
  // il n'y a rien qui se passe »).
  const [gameOver, setGameOver] = useState(false);
  const [show3D, setShow3D] = useState(false);
  // Page Règles : simple drapeau d'affichage. Le contrôleur n'est jamais
  // démonté quand elle s'ouvre, donc la partie en cours (plateau, Titans,
  // Manche, cartes, pile d'undo) est intégralement conservée.
  const [showRules, setShowRules] = useState(false);
  /* ══════════════════════════════════════════════════════════
     PARTIE À DISTANCE (Nikola, 2026-08-29)
     ══════════════════════════════════════════════════════════
     « J'aimerais pouvoir jouer avec des joueurs à distance en donnant un ID de
     session et son mot de passe. »

     UN SEUL ARBITRE. L'hôte fait tourner le moteur exactement comme en local —
     rien de ce qui suit ne s'applique à lui, sinon diffuser ce qu'il vient de
     calculer. Les invités ne calculent RIEN : ils reçoivent le plateau et
     renvoient des intentions.

     C'est le seul modèle honnête avec ce codebase. Faire tourner les règles en
     double chez quatre joueurs, en espérant qu'elles restent d'accord manche
     après manche, c'est signer pour une classe de bugs qu'on ne referme jamais
     — et ce jeu en a déjà refermé assez.

     TROIS CHOSES SEULEMENT changent dans ce contrôleur :
       1. chez un invité, tout ce qui MUTE l'état de partie se tait (les gardes
          `distantInvite` semées dans les effets plus bas) ;
       2. chez l'hôte, un effet diffuse l'instantané après chaque changement ;
       3. les actions d'un invité partent en intentions au lieu de s'exécuter.

     Le reste du fichier ne sait pas que le réseau existe. */
  const [session, setSession] = useState(null);
  const [distantJoueurs, setDistantJoueurs] = useState([]);
  const [distantSieges, setDistantSieges] = useState({});   // { titanId: refInvite }
  const [distantAvis, setDistantAvis] = useState(null);     // message d'état de la liaison
  const [distantFin, setDistantFin] = useState(null);       // partie terminée côté réseau
  const [distantChat, setDistantChat] = useState([]);
  /* La main d'un invité arrive par un canal séparé de l'instantané : le plateau
     diffusé à toute la table a les mains masquées, sans quoi la programmation
     secrète tomberait à la première console ouverte. */
  const [mainPriveeRecue, setMainPriveeRecue] = useState(null);
  const [etatDistantRecu, setEtatDistantRecu] = useState(null);
  const sessionRef = useRef(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const distantInvite = session?.siege === "invite";
  const distantHote = session?.siege === "hote";

  /* ── POURQUOI UNE REF ET PAS LA VALEUR ────────────────────
     Une douzaine d'effets doivent se taire chez un invité. Passer par leur
     tableau de dépendances obligerait à ajouter `distantInvite` à douze
     endroits, dont trois qui portent déjà un `eslint-disable` pour de bonnes
     raisons documentées — et un oubli laisserait un effet tourner avec la
     valeur du rendu PRÉCÉDENT, c'est-à-dire `false` juste après avoir rejoint
     une partie : le moteur de l'invité se remettrait à muter le plateau
     pendant la seule fenêtre où c'est le plus dangereux.

     Une ref est toujours à jour au moment où l'effet s'exécute, quels que
     soient les déclencheurs. C'est déjà l'idiome de ce fichier pour tout ce que
     l'IA doit lire sans le faire re-déclencher (cf. `aiTitanModesRef` et ses
     voisines). */
  const distantInviteRef = useRef(false);
  useEffect(() => { distantInviteRef.current = distantInvite; }, [distantInvite]);
  /* Le Titan que tient CE navigateur quand il est invité. `null` tant que
     l'hôte ne lui a pas donné de siège : il regarde alors la partie sans
     pouvoir agir, ce qui est exactement ce qu'on veut d'un spectateur. */
  const monTitanDistant = distantInvite
    ? Number(Object.keys(distantSieges).find((id) => distantSieges[id] === session.ref)) || null
    : null;

  const [vertAssignments, setVertAssignments] = useState({});
  /* QUI A VALIDÉ SES VERTS — Nikola, 2026-08-28 : « quand j'ai fait le choix
     des Verts au scoring, je dois valider, et après ça ne peut plus se
     changer ».

     Sans ce verrou, les menus restaient modifiables tant que le panneau
     était ouvert : on pouvait voir le pré-score des autres se mettre à jour
     et revenir sur son propre placement. Le placement des Verts est le
     dernier geste secret de la partie, il doit s'engager comme tel. */
  const [vertsValides, setVertsValides] = useState({});
  const validerVerts = useCallback((titanId) => {
    setVertsValides((prev) => (prev[titanId] ? prev : { ...prev, [titanId]: true }));
  }, []);
  const [apocalypseThreshold, setApocalypseThreshold] = useState(5);

  const regenerate = useCallback((graineVoulue) => {
    /* La graine est posee AVANT toute generation : le plateau, la position des
       Titans, l'ordre de jeu, le Detonateur et les profils d'IA en dependent
       tous. Passer `undefined` tire une graine imprevisible, comme une partie
       normale ; passer un nombre rejoue exactement la meme partie. */
    const graine = setSeed(
      graineVoulue === undefined || graineVoulue === null || graineVoulue === ""
        ? undefined
        : Number(graineVoulue) >>> 0
    );
    setGameSeed(graine);
    const newState = generateBoard();
    /* `titanModes` décide si le placement est interactif. Un plateau tout IA
       (campagne, simulateur, aperçu d'accueil) est placé d'un bloc comme
       avant, donc les graines des campagnes restent valables. */
    const newTitans = placeTitans(nbJoueurs, titanModes);
    setPlacementRestant(newTitans.ordrePlacement || []);
    setState(newState);
    setTitanState(newTitans);
    setSeedCount((n) => n + 1);
    // Nouvelle partie : le podium redevient ouvrable.
    podiumDejaOuvert.current = false;
    setShowPodium(false);
    setMancheNumber(1);
    setActivePlayerId(newTitans.detonateur);
    setPhase(getActivePhases(eventsEnabled)[0]);
    setPhaseValidated({});
    setCurrentEvent(null);
    setRainbowWinnerId(null);
    setShowScoring(false);
    setGameOver(false);
    setActionLog([]);
    setLooseBlocks({});
    setSelectedTitanId(null);
    setDecisionQueue([]);
    setRepliQueue([]);
    setProgSelection([]);
    setVolDirection(null);
    cardsPlayedCountRef.current = {};
    setWaitingNextTitan(false);
    setFpmcAttackerId(null);
    setFpmcPendingIds([]);
    setFpmcCurrent(null);
    setMoveMode(false);
    setRecupMode(false);
    setPassifUsed({});
    setBbMode(false);
    setBbPath([]); setBbSurvol([]);
    setJnpMode(false);
    setJnpSelected([]);
    setGraouMode(false);
    setVertAssignments({});
    setVertsValides({});
    setAiPlayingSync(false);
    setTitanProfiles(tirerProfils(titanModes, nbJoueurs));
    setProfilsReveles({});
  }, [nbJoueurs, eventsEnabled, titanModes, tirerProfils]);

  const advanceManche = useCallback(() => {
    // ── FIN DE PARTIE ──
    // Deux défauts corrigés ici d'un coup.
    //
    // 1) `manchesMax` était appelée sans jamais avoir été importée : variable
    //    libre, donc ReferenceError à la fin de CHAQUE Manche, et le jeu
    //    inutilisable au-delà de la Manche 1. Elle est désormais
    //    destructurée avec le reste du domaine, en tête de module.
    //
    // 2) Les trois déclencheurs « plateau » du livret (Apocalypse Urbaine,
    //    Pénurie, Vide Spatial) étaient calculés par checkEndGameTriggers,
    //    affichés dans le bandeau d'en-tête... et rien de plus. Aucun ne
    //    terminait la partie. Ils passent maintenant par le même contrôle
    //    que la limite de Manches — checkEndGameTriggers renvoyant DÉJÀ la
    //    raison « dernière Manche », il n'y a plus qu'une seule condition
    //    d'arrêt, et donc plus de risque de divergence entre les deux.
    //
    // Le moment est le bon : le livret précise que la partie s'arrête à la
    // FIN de la Manche en cours, jamais en plein tour.
    const raisonsFin = checkEndGameTriggers(state.board, looseBlocks, apocalypseThreshold, mancheNumber, nbJoueurs);
    if (raisonsFin.length > 0) {
      setActionLog((prev) => [...prev, `🏁 Fin de partie après ${mancheNumber} Manche(s) :`, ...raisonsFin]);
      setShowScoring(true);
      setGameOver(true);
      setActivePlayerId(null);
      // `false` = la partie ne continue pas. L'appelant s'en sert pour NE PAS
      // enchaîner sur la phase suivante : il remettait jusqu'ici la phase à
      // "Programmation" dans tous les cas, y compris celui-ci.
      return false;
    }
    // Repere de Manche dans le journal : sans separateur, retrouver ce qui
    // s'est passe au tour precedent obligeait a tout relire.
    setActionLog((prev) => [...prev, `— — — Manche ${mancheNumber + 1} — — —`]);
    setMancheNumber((n) => n + 1);
    setTitanState((prev) => {
      const players = prev.players.map((t) => {
        const clone = { ...t, hand: [...t.hand], programmed: [...t.programmed], repos: [...t.repos], playedThisManche: [], discardedHidden: [] };
        // Bug remonté (session) : playedThisManche/discardedHidden étaient
        // vidés SANS que les cartes qui n'ont pas été volées en Phase
        // Repos ne reviennent en main — elles disparaissaient purement et
        // simplement (perte de 2 cartes par Manche au lieu de 0, en plus
        // du décalage de timing sur la carte volée). Ces cartes doivent
        // revenir en main immédiatement, à la fin de la Manche.
        clone.hand.push(...t.playedThisManche, ...(t.discardedHidden || []));
        const returned = applyRestitution(clone, mancheNumber + 1);
        if (returned.length > 0) {
          /* log absorbed by action log elsewhere */
        }
        clone.adrenaline = (clone.adrenaline || 0) + 1;
        return clone;
      });
      const nextDet = nextDetonateur(prev.ordreJeu, prev.detonateur);
      return { ...prev, players, detonateur: nextDet };
    });
    // Le joueur actif suit désormais le Détonateur, seule source de vérité
    // sur qui ouvre la Manche (cf. correction du 2026-08-15). L'ancien
    // calcul faisait avancer d'un cran dans l'ordre de jeu à partir du
    // joueur courant, ce qui donnait un résultat sans rapport avec le
    // Détonateur — et de toute façon écrasé à l'ouverture de la Phase
    // Action.
    setActivePlayerId(nextDetonateur(titanState.ordreJeu, titanState.detonateur));
    setPassifUsed({});
    setMoveMode(false);
    setRecupMode(false);
    setMoveAdrenaline(0); setTeaAdrenaline(0); setTcAdrenaline(0); setBbAdrenaline(0);
    setVolDirection(null); // Phase Repos suivante : le nouveau Détonateur devra rechoisir un sens
    return true; // la partie continue
    // Dépendance sur `state` et non `state.board` : les résolveurs mutent le
    // plateau en place puis forcent le rendu par `setState((p) => ({ ...p }))`,
    // donc la référence de `.board` ne change jamais (même raison que pour le
    // useMemo de `endGameReasons` plus bas).
  }, [mancheNumber, nbJoueurs, titanState.ordreJeu, titanState.detonateur, state, looseBlocks, apocalypseThreshold]);

  /* ── RIEN NE COMMENCE TANT QUE LES QUATRE NE SONT PAS POSÉS ──
     Bug remonté par Nikola le 2026-08-29 : « je ne peux pas choisir mes cartes
     avant mon placement initial, car là ça a créé un bug : je ne vois aucun
     Titan et pourtant ils jouent ».

     La mise en place et la Programmation vivaient côte à côte sans se voir. La
     mise en place est une décision BLOQUANTE, mais rien ne l'imposait au
     moteur : les trois IA programmaient et validaient leur phase toutes
     seules, l'humain pouvait programmer par-dessus le bandeau de placement, et
     la Phase Action s'ouvrait dès que les quatre validations étaient là — sur
     un plateau où des Titans portaient encore `aPlacer`. Ils n'étaient donc
     dessinés nulle part (pas de `cell`) et jouaient quand même : exactement ce
     que décrit le retour.

     Le verrou vit ICI, dans le moteur de phases, et pas seulement dans
     l'interface : masquer les cartes aurait caché le symptôme en laissant
     l'enchaînement de phases capable de démarrer sans plateau. Quatre points
     s'y adossent — cette garde, son message, l'effet d'enchaînement et
     l'auto-validation IA — et tous lisent la même file `placementRestant`. */
  const placementEnCours = placementRestant.length > 0;

  const canValidatePhase = useCallback(
    (titanId) => {
      const t = titanState.players.find((p) => p.id === titanId);
      if (!t) return false;
      if (placementEnCours) return false;
      if (phase === "programmation") return t.programmed.length === 3;
      if (phase === "action") return t.programmed.length === 0;
      return true;
    },
    [phase, titanState.players, placementEnCours]
  );

  const getPhaseBlockReason = useCallback(
    (titanId) => {
      const t = titanState.players.find((p) => p.id === titanId);
      if (!t) return "";
      if (placementEnCours) return "Tous les Titans doivent d'abord prendre position sur le plateau.";
      if (phase === "programmation" && t.programmed.length !== 3) return "Programme d'abord tes 3 cartes.";
      if (phase === "action" && t.programmed.length !== 0) return "Il te reste des cartes programmées à jouer.";
      return "";
    },
    [phase, titanState.players, placementEnCours]
  );

  const validatePhase = useCallback(
    (titanId) => {
      if (!canValidatePhase(titanId)) return;
      setPhaseValidated((prev) => ({ ...prev, [titanId]: true }));
    },
    [canValidatePhase]
  );

  useEffect(() => {
    if (distantInviteRef.current) return; // à distance, seul l'hôte pioche
    if (!eventsEnabled || phase !== "evenement" || currentEvent !== null) return;
    const name = pick(EVENT_NAMES);
    setCurrentEvent(name);
  }, [phase, currentEvent, mancheNumber, eventsEnabled]);

  useEffect(() => {
    /* ── À DISTANCE, LE MOTEUR N'A QU'UN SEUL EXEMPLAIRE ──
       C'est la garde la plus importante des douze : sans elle, l'invité
       enchaînerait les phases de son côté et l'hôte du sien, chacun sur son
       rythme. Deux arbitres pour une partie, et un plateau qui se met à
       diverger sans que personne ne voie où. */
    if (distantInviteRef.current) return;
    if (gameOver) return; // la partie est finie : plus aucune phase ne s'enchaîne
    /* Une décision née de la Phase en cours se règle DANS cette Phase.
       Sans ce garde-fou, la Phase Action pouvait se clore sur un Dilemme
       encore ouvert : le bandeau DIL et celui du Vol de Phase Repos se
       retrouvaient à l'écran en même temps, et le bloc perdu tombait sur un
       plateau que la Manche suivante avait déjà commencé à changer. */
    if (currentDecision || currentRepli || ecroulement) return;
    // La mise en place d'ouverture est la première des décisions bloquantes :
    // aucune phase ne s'enchaîne tant qu'un Titan attend sa case (cf. le
    // commentaire de `placementEnCours`).
    if (placementEnCours) return;
    const ids = titanState.ordreJeu;
    const allValidated = ids.every((id) => phaseValidated[id]);
    if (!allValidated) return;

    /* ── ON NE FERME PAS LA PHASE ACTION SUR UNE CARTE NON JOUÉE ──
       Retour Nikola (2026-08-18) : « il me restait une carte à jouer, mais
       la phase est passée au round suivant… je devais choisir trois
       nouvelles cartes alors qu'il m'en restait une, plus visible ni
       jouable. » État contradictoire, et partie faussée.

       `advanceActionRound` valide la phase pour TOUT LE MONDE dès que son
       compteur de rounds atteint 3, sans jamais regarder si les cartes ont
       réellement été jouées. Tant que compteur et réalité coïncident, tout
       va bien ; le moindre écart (un `advanceActionRound` de trop, cf. le
       correctif de `markCardPlayed`) enterrait une carte encore programmée
       et ouvrait la Programmation par-dessus.

       Plutôt que de faire confiance au compteur, on tranche ici sur le seul
       fait qui ne ment pas : reste-t-il des cartes programmées ? Si oui, la
       phase ne se ferme pas. On recale le compteur sur la vérité (3 cartes
       programmées par Titan en début de Phase Action) et on rend la main au
       Titan en retard. Le journal le dit, pour qu'un écart se voie au lieu
       de se rattraper en silence. */
    if (phase === "action") {
      const enRetard = ids.filter((id) => {
        const t = titanState.players.find((p) => p.id === id);
        return (t?.programmed.length || 0) > 0;
      });
      if (enRetard.length > 0) {
        const recale = { ...cardsPlayedCountRef.current };
        ids.forEach((id) => {
          const t = titanState.players.find((p) => p.id === id);
          if (t) recale[id] = 3 - t.programmed.length;
        });
        cardsPlayedCountRef.current = recale;
        setPhaseValidated({});
        setWaitingNextTitan(false);
        setActivePlayerId(enRetard[0]);
        setActionLog((prev) => [...prev,
          `⚠️ Phase Action : ${enRetard.map((id) => `T${id}`).join(", ")} a encore une carte programmée — ` +
          `la Programmation ne démarre pas, la main revient à T${enRetard[0]}.`]);
        return;
      }
    }

    if (phase === "repos") {
      // advanceManche renvoie false quand elle a détecté la fin de partie.
      // La phase ne doit alors PAS repartir en Programmation : c'est ce qui
      // laissait le jeu figé sur la dernière Manche, écran de score enterré
      // en bas de page.
      if (advanceManche() === false) return;
      setPhase(getActivePhases(eventsEnabled)[0]);
      setCurrentEvent(null);
    } else {
      const activePhases = getActivePhases(eventsEnabled);
      const idx = activePhases.indexOf(phase);
      const nextPhase = activePhases[idx + 1];
      if (nextPhase === "action") {
        cardsPlayedCountRef.current = {};   // reset compteur de rounds
        setWaitingNextTitan(false);
        // Bug trouvé par le diagnostic, confirmé par Nikola le 2026-08-15 :
        // cette ligne lisait `ordreJeu[0]`, pas le Détonateur. Or le
        // Détonateur pivote bien à chaque Manche (cf. nextDetonateur dans
        // advanceManche) — mais sa rotation ne produisait STRICTEMENT
        // AUCUN effet : le même Titan ouvrait toutes les Manches de toutes
        // les parties. La rotation existait dans les données et nulle part
        // dans le jeu.
        setActivePlayerId(titanState.detonateur ?? titanState.ordreJeu[0]);
      }
      setPhase(nextPhase);
    }
    setPhaseValidated({});
  }, [phaseValidated, titanState.ordreJeu, titanState.detonateur, titanState.players, phase, advanceManche,
      eventsEnabled, gameOver, currentDecision, currentRepli, ecroulement, placementEnCours]);

  /* ── MAIN TROP CIBLÉE : SECOURS À L'ENTRÉE EN PROGRAMMATION ──
     Retour de Nikola (test à la table, 2026-08-18) : « j'ai été extrêmement
     ciblé, j'ai que 2 cartes, c'est pas possible de jouer. » `programCards`
     exige exactement 3 cartes en main ; une main trop réduite par des
     Fatigues répétées bloquait durablement la Programmation de ce Titan.
     Effet séparé de la transition de phase ci-dessus (peu importe le
     chemin qui mène à "programmation" — mi-Manche ou nouvelle Manche —
     il suffit que la phase le devienne) pour rester simple et robuste. */
  useEffect(() => {
    if (distantInviteRef.current) return; // les mains sont distribuées par l'hôte
    if (phase !== "programmation") return;
    const logs = [];
    titanState.players.forEach((t) => {
      const res = ensureProgrammableHand(t);
      logs.push(...res.log);
    });
    if (logs.length > 0) {
      setActionLog((prev) => [...prev, ...logs]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Rainbow tracking
  // Bug remonté : "5 couleurs" attendu, mais le vert était explicitement
  // exclu du calcul (filtré + liste de 4 couleurs en dur, désynchronisée
  // de STANDARD_COLORS utilisée partout ailleurs pour le scoring). Le
  // livret liste bien 5 couleurs de blocs (Bleu/Rose/Orange/Rouge/Vert) —
  // recollecté sur STANDARD_COLORS pour ne plus jamais diverger.
  useEffect(() => {
    if (distantInviteRef.current) return; // le Trophée est décerné par l'hôte
    if (rainbowWinnerId !== null) return;
    for (const t of titanState.players) {
      const colors = new Set(t.repaire);
      if (STANDARD_COLORS.every((c) => colors.has(c))) {
        setRainbowWinnerId(t.id);
        setActionLog((prev) => [...prev, `🌈 Arc-en-ciel ! Titan ${t.id} est le premier à posséder les 5 couleurs → +5 pts fin de partie.`]);
        break;
      }
    }
  }, [titanState.players, rainbowWinnerId]);

  // { titanId, cout } — déplacements consommés par une rentrée sur le
  // plateau, à retrancher du Mouvement gratuit de ce tour-là uniquement.
  const [coutRentree, setCoutRentree] = useState(null);
  // { titanId, options: [cle, cle], coinBloque } — coin de rentrée bloqué,
  // deux cases également proches : en attente du choix du joueur.
  const [cornerChoice, setCornerChoice] = useState(null);
  const [selectedTitanId, setSelectedTitanId] = useState(null);

  // Bug remonté (persistant) : "impossible de se déplacer après avoir joué
  // une carte". Le passif Mouvement était bien réinitialisé à chaque round
  // (voir advanceActionRound), mais le panneau affiché (selectedTitanId)
  // ne suivait jamais automatiquement activePlayerId — si le joueur avait
  // cliqué sur un autre Titan entre-temps (pour regarder son état), le
  // panneau Passifs qu'il voyait n'était plus le sien du tout : le bouton
  // "Se déplacer" semblait absent alors qu'il était juste affiché ailleurs.
  // Focus auto sur le Titan actif à chaque changement de tour (phase
  // Action uniquement, jamais pour un Titan IA qui n'a pas de panneau
  // Passifs humain).
  useEffect(() => {
    /* ── UN INVITÉ RESTE SUR SON PROPRE TITAN ─────────────
       En local, l'appareil circule autour de la table : suivre le Titan actif
       est exactement ce qu'on veut, c'est la manette qui change de mains. À
       distance, chacun garde la sienne — recentrer sur le Titan actif ferait
       basculer l'écran d'un invité vers un Titan qu'il ne joue pas, au moment
       précis où il regarde le sien. */
    if (distantInvite) {
      if (monTitanDistant != null) setSelectedTitanId(monTitanDistant);
      return;
    }
    if (phase === "action" && activePlayerId != null && titanModes[activePlayerId] !== "ia") {
      setSelectedTitanId(activePlayerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayerId, phase, distantInvite, monTitanDistant]);

  /* ── QUI PROGRAMME MAINTENANT ──
     Bug trouvé en inspectant l'écran d'ouverture d'une partie neuve : en
     Phase Programmation, `activePlayerId` est nul (elle n'a pas de tour), et
     l'effet ci-dessus ne s'applique qu'à la Phase Action. Résultat,
     `selectedTitanId` restait `null` au tout premier écran de la partie —
     et comme TOUT le panneau de jeu est monté derrière `selectedTitan`, le
     joueur arrivait sur un plateau sans la moindre commande, sans que rien
     lui dise qu'il devait d'abord cliquer sur SA propre plaque de Titan.
     C'est le premier écran de chaque partie, et c'est exactement la friction
     « savoir ce que je peux faire ».

     La règle appliquée est celle qui existait déjà en filigrane : « chacun
     programme à son tour, le Titan sélectionné est celui qui programme ». On
     désigne donc le premier humain qui n'a pas encore validé. Une sélection
     manuelle n'est jamais écrasée tant qu'elle reste valable : on ne bouge
     que si personne n'est sélectionné, ou si le sélectionné a fini. */
  useEffect(() => {
    // Un invité programme le sien, jamais « le prochain qui n'a pas validé » :
    // cette rotation-là décrit un appareil qui circule, pas quatre écrans.
    if (distantInvite) return;
    if (phase !== "programmation") return;
    const enCours = selectedTitanId != null
      && titanModes[selectedTitanId] !== "ia"
      && !phaseValidated[selectedTitanId];
    if (enCours) return;
    const suivant = titanState.ordreJeu.find(
      (id) => titanModes[id] !== "ia" && !phaseValidated[id]
    );
    if (suivant != null && suivant !== selectedTitanId) setSelectedTitanId(suivant);
  }, [phase, phaseValidated, titanModes, titanState.ordreJeu, selectedTitanId, distantInvite]);
  const selectedTitan = titanState.players.find((t) => t.id === selectedTitanId) || null;
  /* `movingTitanOverride` a été retiré le 2026-08-29. Il servait à dessiner le
     jeton sur une case intermédiaire pendant que le Titan « marchait » d'une
     case par seconde ; cette marche a disparu au profit de la traînée colorée,
     qui dit la même chose mieux et sans immobiliser le tour. Plus personne
     n'écrivait dans cet état : il ne restait que sa plomberie. */
  const effectivePlayers = titanState.players;
  // Un Titan éjecté n'est PAS sur le plateau : il ne doit apparaître ni sur
  // la grille 2D, ni en 3D, ni dans aucun calcul d'occupation. Sa `cell`
  // n'indique plus où il est mais par où il rentrera à son tour.
  const titansByCell = indexerTitans(effectivePlayers);
  /* Les pistes d'attente au bord du plateau ne montrent que les ÉJECTÉS —
     ceux qui rentreront par cette case. Depuis que `estSurLePlateau` couvre
     aussi le placement d'ouverture (2026-08-28), lire sa négation y affichait
     « Titan 1 attend hors de BIG CITY » avant même le début de la partie : un
     Titan qui n'a pas encore posé n'est pas un Titan qu'on a sorti du ring.
     On nomme donc explicitement la condition qu'on veut. */
  const titansEnAttente = titanState.players.filter((t) => t.horsPlateau);
  const titanCorners = {};
  effectivePlayers.forEach((t) => {
    // Le lookup `CORNERS[t.corner]` qui vivait ici n'était jamais lu :
    // seul l'id du Titan est stocké. Retiré, aucun changement de contenu.
    if (estSurLePlateau(t)) titanCorners[t.cell] = { titanId: t.id };
  });

  // (`actionLog` et `looseBlocks` sont déclarés en tête de hook, cf. commentaire là-bas.)
  const [teaMode, setTeaMode] = useState(false);
  const [teaAdrenaline, setTeaAdrenaline] = useState(0);
  const [tcAdrenaline, setTcAdrenaline] = useState(0); // Tout Casser : +1 energie par Adrenaline
  // direction/useAdrenaline conservés pour Graouhhh (inchangé)
  const [direction, setDirection] = useState({ dr: -1, dc: 0, label: "N" });
  const [useAdrenaline, setUseAdrenaline] = useState(false);
  // Graouhhh : la rose des vents s'affichait des que la carte etait
  // programmee, occupant l'ecran tout le round meme si le Titan comptait
  // jouer autre chose. Elle passe sur le meme modele que Boing Boing /
  // Tete en Avant : un mode ouvert par un clic sur la carte, referme par
  // Annuler ou par la resolution.
  const [graouMode, setGraouMode] = useState(false);
  const [jnpMode, setJnpMode] = useState(false);
  const [jnpSelected, setJnpSelected] = useState([]);
  // Nombre de blocs à ramasser (2, ou 3 en Lanterne Rouge), figé à l'engagement
  // de la carte — cf. le commentaire de jnpNbToPick plus bas.
  const [jnpNbToPickFrozen, setJnpNbToPickFrozen] = useState(2);
  const [bbMode, setBbMode] = useState(false);
  const [bbAdrenaline, setBbAdrenaline] = useState(0);
  // Chemin cliqué case par case (demande Nikola, 2026-08-18 : « je dois
  // indiquer par plusieurs clics mon chemin »). `bbDest` — la case où la
  // carte atterrit — n'est plus qu'un dérivé : la dernière case du chemin.
  // Une seule source de vérité, jamais désynchronisée.
  const [bbPath, setBbPath] = useState([]);
  // Cases FRANCHIES a chaque saut, une entree par atterrissage. Elles ne
  // coutent rien, elles ne servent qu'a dessiner la trajectoire.
  const [bbSurvol, setBbSurvol] = useState([]);
  const bbDest = bbPath.length > 0 ? bbPath[bbPath.length - 1] : null;
  // Écroulement d'Amas en attente de répartition par le joueur :
  // { cellKey, blocs, energie, choix } — un choix de case par débris, posé
  // dans l'ordre. Nul quand aucune répartition n'est en cours.

  /* ── FILE DES REPLIS À TRANCHER ──
     Ruling Nikola du 2026-08-17 : quand un élément projeté s'arrête faute de
     puissance, c'est le TITAN INITIATEUR qui choisit où le poser, parmi sa
     case d'origine et celles qui touchent à la fois cette case et la case
     visée (cf. getCasesRepliDebris).

     Pourquoi une FILE et non un choix unique : une seule activation peut en
     produire plusieurs. Tout Casser frappe tout le Périmètre, et chaque
     réaction en chaîne peut à son tour immobiliser un débris. Les résolveurs
     déposent donc leurs replis dans un tableau partagé (`gameState.replis`),
     et le joueur les tranche un par un, dans l'ordre où ils sont survenus. */
  const [progSelection, setProgSelection] = useState([]);
  /* Dernier échec de programmation, affiché DANS le panneau.
     Bug remonté par Nikola le 2026-08-17 : « en début de M4 je sélectionne
     mes 3 cartes et ça me redemande de sélectionner mes 3 cartes ». Quand
     `programCards` refuse, la sélection est vidée et le panneau se
     represente à l'identique : le joueur boucle sans jamais savoir pourquoi,
     la raison ne partant que dans le journal d'actions, tout en bas.
     Le refus a toujours une raison précise — cartes déjà programmées, Titan
     ayant déjà joué cette Manche, carte absente de la main. La montrer à
     l'endroit où le joueur est bloqué est la seule façon de trancher entre
     ces causes au prochain test à la table. */
  const [progErreur, setProgErreur] = useState(null);
  const [progCountdown, setProgCountdown] = useState(null);   // null | 1-3
  const [progCountdownTimer, setProgCountdownTimer] = useState(null); // setInterval id
  // Vol Phase Repos (refonte session) : sens de rotation choisi UNE FOIS
  // par le Détonateur pour toute la chaîne, puis résolution automatique
  // par resolveVolPhaseRepos — remplace l'ancien choix manuel carte/cible.
  /* Cinq secondes pour lire le récapitulatif du vol avant que la Manche
     suivante ne démarre. Dix à la première demande, ramené à cinq à l'essai
     (Nikola, 2026-08-28) : le récapitulatif tient en quatre lignes, dix
     secondes à le regarder devenaient une attente. */
  const DUREE_LECTURE_VOL_MS = 5000;
  const [volDirection, setVolDirection] = useState(null);
  // Qui a pris quoi à qui à la dernière Phase Repos, pour l'afficher au lieu
  // de le laisser au fond du journal (cf. `resolveVolPhaseRepos`).
  const [volResume, setVolResume] = useState([]);
  const [fpmcPendingIds, setFpmcPendingIds] = useState([]);
  const [fpmcNTargets, setFpmcNTargets] = useState(0);
  const [fpmcAttackerId, setFpmcAttackerId] = useState(null);
  const [fpmcAttackerBase, setFpmcAttackerBase] = useState(0);
  const [fpmcCurrent, setFpmcCurrent] = useState(null);
  const [moveMode, setMoveMode] = useState(false);
  const [moveAdrenaline, setMoveAdrenaline] = useState(0);
  const [recupMode, setRecupMode] = useState(false);
  const [passifUsed, setPassifUsed] = useState({});
  // Animation timing: case/case = 1s, action complète = 5s
  /* TRACE DE VOL (Nikola, 2026-08-24 : « animation de la trajectoire »).
     Les cases traversees par le dernier element projete, rejouees a l'ecran
     apres coup. La resolution, elle, reste synchrone et inchangee : on ne
     defere rien, on ne fait que MONTRER ou les choses sont passees — c'est
     ce qui rend cette animation sans risque pour le moteur.

     Un rebond ou une traversee de faille se voient donc enfin : ils etaient
     jusqu'ici deduits du seul point d'arrivee. */
  /* ── CHAQUE CASE DE LA TRACE DIT CE QUI L'A TRAVERSÉE ──
     Nikola, 2026-08-28 : « adapte l'illumination des cases en fonction de
     l'élément : débris = jaune comme là, Titan = de la couleur de la cible ou du
     Titan qui fait son déplacement passif — reprends les mêmes codes d'apparence
     et de fonctionnalité que pour un débris, mais adapte la couleur ».

     La trace était une simple liste de cases plus UNE couleur pour l'ensemble.
     Ça tenait tant qu'une carte ne déplaçait qu'une sorte de chose — mais un
     Tout Casser projette des débris ET bouscule des Titans dans le même souffle,
     et tout se peignait alors de la même teinte. Chaque case porte donc
     désormais ce qui l'a traversée :

       { key, titanId }   titanId = null → débris (jaune)
                          titanId = n    → ce Titan-là (sa couleur)
       { key, teleporteur: true, titanId } → la faille empruntée, peinte de la
                          couleur du Titan qui l'a prise (violet en repli)

     `projectInDirection` remplissait déjà `titanId` dans chaque trajectoire :
     l'information existait, elle était jetée à l'affichage. */
  const [traceVol, setTraceVol] = useState([]);

  const traceTimersRef = useRef([]);
  const [animating, setAnimating] = useState(false);

  /* Rejoue les trajectoires collectees. Toutes en PARALLELE (pas l'une apres
     l'autre) : un Tout Casser projette jusqu'a huit elements a la fois, et
     c'est bien ce qui se passe au meme instant dans la fiction du jeu. La
     duree totale reste donc courte quel que soit le nombre d'elements.

     Les minuteurs vivent dans une ref pour pouvoir etre annules : sans quoi
     une trace en cours se superposerait a la carte suivante, ou survivrait a
     un « Annuler ». */
  const arreterTrace = useCallback(() => {
    traceTimersRef.current.forEach(clearTimeout);
    traceTimersRef.current = [];
    setTraceVol([]);
  }, []);

  const animerTrajectoires = useCallback((trajectoires) => {
    arreterTrace();
    if (!trajectoires || trajectoires.length === 0) return;
    // La case de depart n'est pas une case traversee : on l'ecarte. Chaque
    // case garde l'identifiant de ce qui l'a franchie, pour sa couleur.
    const vols = trajectoires
      .map((t) => (t.cases || []).slice(1).map((key) => ({ key, titanId: t.titanId ?? null })))
      .filter((cases) => cases.length > 0);
    if (vols.length === 0) return;

    const PAS_MS = 110;
    const TENUE_MS = 1500; // temps de lecture une fois la trace complete (650 ms passaient inapercus)
    const longueurMax = Math.max(...vols.map((v) => v.length));

    for (let i = 0; i < longueurMax; i++) {
      const casesDuPas = vols.map((v) => v[Math.min(i, v.length - 1)]);
      traceTimersRef.current.push(setTimeout(() => {
        // Cumul : la trace s'allonge derriere l'element au lieu de sauter de
        // case en case, ce qui rend le rebond lisible.
        setTraceVol((prev) => [
          ...prev,
          ...casesDuPas.filter((c) => !prev.some((e) => e.key === c.key)),
        ]);
      }, i * PAS_MS));
    }
    traceTimersRef.current.push(setTimeout(arreterTrace, longueurMax * PAS_MS + TENUE_MS));
  }, [arreterTrace]);

  const [animLabel, setAnimLabel] = useState("");

  // ── TOUR PAR TOUR (Phase Action) ──
  // cardsPlayedCountRef : { titanId: n } cartes jouées ce round par chaque Titan.
  // Simple ref (PAS un useState) : jamais lue pour l'affichage, uniquement une
  // comptabilité interne à advanceActionRound. Corrige un bug de blocage IA
  // récurrent (session) : c'était auparavant un useState dont l'updater
  // fonctionnel portait un effet de bord (aiNextPlayerRef.current = next).
  // React n'exécute cet updater qu'au flush du state, à un instant non
  // déterministe par rapport au code appelant — qui relisait la ref juste
  // après via un Promise.resolve().then(). Selon le timing exact du flush,
  // la ref pouvait rester stale (null ou ancienne valeur) et le Titan
  // suivant n'était jamais activé, quelle que soit l'action jouée (carte
  // avec effet ou défausse cachée). En ref pure lue/écrite de façon
  // strictement synchrone, cette fenêtre de course n'existe plus.
  const cardsPlayedCountRef = useRef({});
  const [pendingCardConfirm, setPendingCardConfirm] = useState(null); // { titanId, cardId }
  const [waitingNextTitan, setWaitingNextTitan] = useState(false); // après résolution, attend "Titan suivant"

  // ── UNDO STACK ──
  // Chaque entrée = snapshot complet de l'état de jeu avant une action ou un
  // changement de joueur actif. On peut revenir en arrière tant qu'on est sur
  // le même joueur actif (annulation de coup) ou jusqu'au début de son tour
  // (annulation du tour complet). Dès que activePlayerId change pour un autre
  // joueur, l'historique est vidé (le tour est définitivement joué).
  const [undoStack, setUndoStack] = useState([]);
  // Incrémenté à chaque rollback. Les panneaux s'en servent pour remettre à
  // plat leur état local, que la restauration de l'état de jeu ne touche pas.
  const [undoTick, setUndoTick] = useState(0);

  /* ── CE QU'UN INSTANTANÉ DOIT CONTENIR ──
     Demande de Nikola du 2026-08-18 : « Annuler annule bien les actions
     jouées, donc placement, perte de débris, etc. — tout ce qu'une action
     fait doit être annulable si on clique sur le bouton. »

     L'instantané ne couvrait que le plateau, les Titans et les débris. Tout
     ce qu'une action laisse EN ATTENTE en était absent, et pire, le retour
     en arrière VIDAIT ces files au lieu de les restaurer : un Dilemme non
     encore tranché, un repli en attente, une répartition d'Amas en cours ou
     une comparaison Faut Pas Me Chauffer disparaissaient purement et
     simplement — l'action était à moitié défaite, et le joueur se retrouvait
     avec une carte jouée dont l'effet ne viendrait jamais.

     La règle est donc simple et sans exception : tout état de JEU entre dans
     l'instantané, y compris les décisions en suspens. Seuls restent dehors
     les états d'INTERFACE (mode carte ouvert, compteur d'Adrénaline engagé,
     animation), remis à plat par `undoTick`. */
  /* ⚠️ LE CLONE SE FAIT MAINTENANT, PAS DANS L'UPDATER ──
     Bug remonté par Nikola le 2026-08-18 : « les blocs qui ont pris le warp
     ne sont pas revenus à leur case initiale, ça fausse la partie. »

     L'instantané entier était construit À L'INTÉRIEUR de `setUndoStack(prev
     => ...)`. Or React n'exécute un updater fonctionnel qu'au traitement de
     sa file, donc APRÈS le retour de la fonction appelante — et le domaine,
     lui, mute l'état EN PLACE (`bldg.blocks.pop()`, `looseBlocks[k].push()`,
     `titan.destruction += 1`). Séquence réelle d'un Tout Casser :

       1. captureSnapshot()      → programme un updater, ne clone rien
       2. resolveToutCasser(...) → casse le plateau en place
       3. setState(prev => ...)  → déclenche le rendu
       4. React exécute (1)      → structuredClone d'un plateau DÉJÀ CASSÉ

     L'instantané enregistrait donc l'état d'APRÈS l'action. « Annuler »
     dépilait bien, restaurait bien, mais restaurait l'état détruit : le
     bouton semblait ne rien faire. Seules les actions qui clonent avant de
     modifier (défausse, programmation) échappaient au piège, ce qui
     explique que `annuler.test.jsx` restait vert.

     Le clone est désormais évalué de façon SYNCHRONE, à l'appel, avant que
     le moindre résolveur n'ait pu toucher à l'état. Ne jamais redéplacer
     ce calcul dans l'updater. */
  /* ── L'INSTANTANÉ, SÉPARÉ DE SON EMPILEMENT ───────────────
     Extrait de `captureSnapshot` le 2026-08-29. La partie à distance a besoin
     de DÉCRIRE l'état courant à chaque coup, sans pour autant ajouter un cran
     à la pile d'annulation : l'hôte diffuse cent fois plus souvent qu'il ne
     capture, et empiler à chaque diffusion aurait fait d'« Annuler » un bouton
     qui ne recule plus d'une action mais d'un battement de réseau.

     Le CONTENU ne change pas d'une ligne : ce que l'annulation doit restaurer
     et ce qu'un invité doit recevoir sont exactement la même chose. */
  const instantaneCourant = useCallback(() => {
    const snapshot = {
      state: structuredClone(state),
      titanState: structuredClone(titanState),
      looseBlocks: structuredClone(looseBlocks),
      activePlayerId,
      phase,
      passifUsed: structuredClone(passifUsed),
      actionLog: [...actionLog],
      // Décisions et placements en attente : ils font partie de l'action.
      decisionQueue: structuredClone(decisionQueue),
      repliQueue: structuredClone(repliQueue),
      ecroulement: ecroulement ? structuredClone(ecroulement) : null,
      /* ⚠️ LA FILE DE TOUT CASSER FAIT PARTIE DE L'ÉTAT À RESTAURER.
         Bug remonté par Nikola le 2026-08-29 : « le panneau "clique l'élément
         que tu projettes maintenant" — si j'annule, ça fait planter le
         déplacement, les annulations aussi, je ne peux plus vraiment revenir en
         arrière ».

         L'instantané restaurait le plateau et les Titans, mais PAS la file :
         « Annuler » rendait donc un plateau d'avant la projection avec une file
         d'après, qui désignait des cibles n'existant plus — un bâtiment qu'on
         venait de reconstituer, un Titan revenu sur sa case. Le clic suivant
         résolvait alors une case incohérente, et l'état partait de travers sans
         retour possible.

         La règle vaut pour toute résolution en plusieurs temps : ce qui
         SÉQUENCE l'action appartient à l'instantané au même titre que ce qu'elle
         a déjà modifié. `ecroulement` juste au-dessus le savait déjà. */
      toutCasserFile: toutCasserFile ? structuredClone(toutCasserFile) : null,
      fpmc: {
        attackerId: fpmcAttackerId,
        pendingIds: [...fpmcPendingIds],
        nTargets: fpmcNTargets,
        attackerBase: fpmcAttackerBase,
        current: fpmcCurrent ? { ...fpmcCurrent } : null,
      },
      // Avancement de la partie et acquis de fin de partie.
      mancheNumber,
      phaseValidated: { ...phaseValidated },
      volDirection,
      volResume: [...volResume],
      currentEvent,
      rainbowWinnerId,
      vertAssignments: structuredClone(vertAssignments),
      vertsValides: structuredClone(vertsValides),
      gameOver,
      showScoring,
      coutRentree: coutRentree ? { ...coutRentree } : null,
      // Bug #8 (tracker) : "Annuler une carte doit la rendre réellement
      // disponible, pas juste un rollback visuel". Ces deux valeurs
      // vivaient hors du snapshot : `waitingNextTitan` restait à `true`
      // après undo (canPlayCard/getPlayBlockReason le bloquent — la carte
      // réapparaît dans `programmed` mais reste injouable, "Confirme
      // Titan suivant" s'affiche quand même), et `cardsPlayedCountRef`
      // (compteur de rounds, hors state React) n'était jamais restauré,
      // désynchronisant l'avancement de round au coup suivant.
      waitingNextTitan,
      cardsPlayedCount: { ...cardsPlayedCountRef.current },
      /* Ajouté pour la partie à distance, et sans effet sur l'annulation (qui
         ne restaure jamais ce champ : on n'annule pas le lancement d'une
         partie). C'est l'instantané de l'hôte qui dit aux invités que la table
         est ouverte — eux n'ont aucun autre moyen de le savoir, et sans ça ils
         entraient sur un plateau généré chez eux, aussitôt remplacé. */
      partieLancee: setupDone,
      /* ── LA FILE DE MISE EN PLACE ET LES RÉGLAGES DE TABLE ──
         Ajoutés le 2026-08-29 pour la partie à distance, et absents jusque-là
         pour une raison parfaitement valable : « Annuler » n'en a jamais eu
         besoin. On n'annule pas pendant la mise en place, et les réglages de
         table ne changent pas en cours de partie — les restaurer revenait donc
         à réécrire ce qui était déjà là.

         Un invité, lui, n'a RIEN de tout ça : il n'est pas passé par l'écran
         d'accueil, il n'a jamais tiré de plateau. Sans la file, son bandeau de
         mise en place restait muet et aucune case ne s'allumait ; sans les
         réglages, il affichait quatre Titans humains sans nom sur une partie
         qui en compte trois, dont deux IA.

         Pour l'annulation, ces champs sont inertes : on y remet exactement ce
         qui s'y trouvait déjà. */
      placementRestant: [...placementRestant],
      table: {
        nbJoueurs,
        titanModes: { ...titanModes },
        titanNames: { ...titanNames },
        titanProfiles: { ...titanProfiles },
        eventsEnabled,
        modeVolRepos,
        apocalypseThreshold,
        gameSeed,
      },
    };
    return snapshot;
  }, [
    setupDone, placementRestant, nbJoueurs, titanModes, titanNames, titanProfiles,
    eventsEnabled, modeVolRepos, gameSeed, apocalypseThreshold,
    state, titanState, looseBlocks, activePlayerId, phase, passifUsed, actionLog, waitingNextTitan, volResume,
    decisionQueue, repliQueue, ecroulement, fpmcAttackerId, fpmcPendingIds, fpmcNTargets,
    fpmcAttackerBase, fpmcCurrent, mancheNumber, phaseValidated, volDirection, currentEvent,
    rainbowWinnerId, vertAssignments, vertsValides, gameOver, showScoring, coutRentree, toutCasserFile,
  ]);

  const captureSnapshot = useCallback(() => {
    /* ⚠️ L'instantané se calcule ICI, hors de l'updater — c'est la règle que
       le long commentaire ci-dessus a établie après un bug tenace. Écrire
       `setUndoStack((prev) => [...prev, instantaneCourant()])` remettrait le
       clone dans l'updater, donc à un instant indéterminé, potentiellement
       APRÈS qu'un résolveur ait muté le plateau en place : on capturerait
       alors l'état d'après en croyant garder celui d'avant. */
    const snapshot = instantaneCourant();
    setUndoStack((prev) => [...prev, snapshot]);
  }, [instantaneCourant]);

  // Vide l'historique quand le joueur actif change (tour terminé = irréversible)
  const prevActivePlayerRef = useRef(activePlayerId);
  useEffect(() => {
    if (prevActivePlayerRef.current !== activePlayerId) {
      setUndoStack([]);
      prevActivePlayerRef.current = activePlayerId;
    }
  }, [activePlayerId]);

  /* ── REPOSER LA PARTIE SUR UN INSTANTANÉ ──────────────────
     Extrait de `handleUndo` le 2026-08-29, sans changer une ligne de son
     contenu : « Annuler » n'est plus le seul à devoir remettre la partie dans
     un état déjà connu. Une partie à distance fait exactement le même geste à
     chaque coup — l'invité reçoit le plateau de l'hôte et se cale dessus.

     Les deux usages ont besoin de la MÊME exhaustivité, et c'est ce qui rend
     l'extraction évidente plutôt qu'astucieuse : tout ce que l'annulation
     avait dû apprendre à restaurer au fil des bugs (la file de Tout Casser, le
     compteur de rounds, les modes de carte laissés ouverts) est exactement ce
     qu'un invité doit recevoir. Écrire une seconde fonction « pour le réseau »
     aurait garanti qu'elle prenne du retard sur celle-ci. */
  const restaurerInstantane = useCallback((snap) => {
    if (!snap) return;
    setState(structuredClone(snap.state));
    setTitanState(structuredClone(snap.titanState));
    setLooseBlocks(structuredClone(snap.looseBlocks));
    setActivePlayerId(snap.activePlayerId);
    setPhase(snap.phase);
    setPassifUsed(structuredClone(snap.passifUsed));
    setActionLog([...snap.actionLog]);
    arreterTrace(); // la trace decrirait un vol que l'annulation vient d'effacer
    setMoveMode(false); setRecupMode(false); setBbMode(false); setBbPath([]); setBbSurvol([]);
    setJnpMode(false); setJnpSelected([]); setGraouMode(false);
    /* Les files en attente sont RESTAURÉES, plus vidées. Les vider défaisait
       le plateau sans défaire les décisions qu'il avait déclenchées : on
       revenait avant la carte, mais le Dilemme qu'elle avait ouvert restait
       dû — ou disparaissait, selon la file. Ni l'un ni l'autre n'est une
       annulation. */
    setDecisionQueue(structuredClone(snap.decisionQueue || []));
    setRepliQueue(structuredClone(snap.repliQueue || []));
    setEcroulement(snap.ecroulement ? structuredClone(snap.ecroulement) : null);
    setToutCasserFile(snap.toutCasserFile ? structuredClone(snap.toutCasserFile) : null);
    setFpmcAttackerId(snap.fpmc?.attackerId ?? null);
    setFpmcPendingIds([...(snap.fpmc?.pendingIds || [])]);
    setFpmcNTargets(snap.fpmc?.nTargets ?? 0);
    setFpmcAttackerBase(snap.fpmc?.attackerBase ?? 0);
    setFpmcCurrent(snap.fpmc?.current ? { ...snap.fpmc.current } : null);
    setMancheNumber(snap.mancheNumber);
    setPhaseValidated({ ...(snap.phaseValidated || {}) });
    setVolDirection(snap.volDirection ?? null);
    setVolResume(snap.volResume ? [...snap.volResume] : []);
    setCurrentEvent(snap.currentEvent ?? null);
    setRainbowWinnerId(snap.rainbowWinnerId ?? null);
    setVertAssignments(structuredClone(snap.vertAssignments || {}));
    setVertsValides(structuredClone(snap.vertsValides || {}));
    setGameOver(Boolean(snap.gameOver));
    setShowScoring(Boolean(snap.showScoring));
    setCoutRentree(snap.coutRentree ? { ...snap.coutRentree } : null);
    setAiPlayingSync(false);
    setWaitingNextTitan(snap.waitingNextTitan ?? false);
    cardsPlayedCountRef.current = { ...(snap.cardsPlayedCount || {}) };
    /* Le rollback restaurait le PLATEAU sans remettre l'interface à plat.
       Restaient debout : le mode Tête en Avant, une répartition d'Amas en
       cours, une comparaison Faut Pas Me Chauffer, la carte marquée comme
       cliquée, et les compteurs d'Adrénaline engagés. Résultat remonté par
       Nikola le 2026-08-17 : après avoir ouvert Boing Boing puis annulé, le
       plateau restait capté par un mode carte invisible et les clics de
       déplacement ne produisaient plus rien.

       `undoTick` sert aux panneaux à réinitialiser LEUR état local (l'étape
       du tour en cours, notamment) : ils ne peuvent pas le déduire du seul
       état de jeu restauré. */
    setTeaMode(false);
    setPendingCardConfirm(null);
    setMoveAdrenaline(0); setTeaAdrenaline(0); setTcAdrenaline(0); setBbAdrenaline(0);
    setAnimating(false); setAnimLabel("");
    /* Cf. le commentaire de `instantaneCourant` : inerte pour l'annulation (on
       y remet ce qui s'y trouvait), indispensable pour un invité, qui n'a
       jamais vu l'écran d'accueil et ne connaît la table que par là. */
    if (snap.placementRestant) setPlacementRestant([...snap.placementRestant]);
    if (snap.table) {
      setNbJoueurs(snap.table.nbJoueurs);
      setTitanModes({ ...snap.table.titanModes });
      setTitanNames({ ...snap.table.titanNames });
      setTitanProfiles({ ...snap.table.titanProfiles });
      setEventsEnabled(Boolean(snap.table.eventsEnabled));
      setModeVolRepos(snap.table.modeVolRepos);
      setApocalypseThreshold(snap.table.apocalypseThreshold);
      setGameSeed(snap.table.gameSeed);
    }
    setUndoTick((n) => n + 1);
  }, [arreterTrace]);

  const handleUndo = useCallback(() => {
    // Bug remonté (persistant) : le pattern précédent déclenchait un
    // setTimeout DEPUIS L'INTÉRIEUR du setter fonctionnel de setUndoStack —
    // un effet de bord dans un updater React, jamais garanti fiable (peut
    // s'exécuter plusieurs fois, ou sur un état pas encore commité, selon
    // le timing exact du rendu). Réécrit en séquence synchrone classique :
    // on lit le dernier snapshot directement (pas besoin de fonctionnel
    // puisqu'on ne dépend que de la valeur actuelle d'undoStack), on
    // restaure tout d'un coup, puis on dépile.
    if (undoStack.length === 0) return;
    restaurerInstantane(undoStack[undoStack.length - 1]);
    setUndoStack((prev) => prev.slice(0, -1));
  }, [undoStack, restaurerInstantane]);

  /* ══════════════════════════════════════════════════════════
     CE QU'UN INVITÉ A LE DROIT DE DEMANDER
     ══════════════════════════════════════════════════════════
     La liste est BLANCHE, jamais noire : une action absente d'ici ne franchit
     pas le réseau, et le jour où le jeu en gagne une nouvelle, elle est
     inaccessible à distance jusqu'à ce que quelqu'un l'ajoute sciemment. Une
     liste noire aurait la propriété inverse — toute action nouvelle serait
     exposée par défaut, y compris celles qui n'ont aucun sens à distance
     (`regenerate`, `setTitanState`, `setPhase`…).

     Chaque entrée dit POUR QUI l'action se joue, et c'est cette colonne qui
     porte la sécurité côté hôte :

       "soi"        le Titan du siège de l'invité, à tout moment (programmer
                    ses cartes, valider sa phase — chacun le fait chez lui) ;
       "actif"      le Titan du siège doit être celui à qui c'est le tour ;
       "placement"  il doit être celui que la file de mise en place attend ;
       "decision"   il doit être celui que la décision bloquante interroge.

     Un invité peut mentir sur tout ce qu'il envoie SAUF sur son siège : le
     relais y appose son expéditeur, et c'est l'hôte qui lit la table des
     sièges. Toute la confiance tient sur ce seul point. */
  const ACTIONS_DISTANTES = useMemo(() => ({
    // Mise en place d'ouverture
    placerTitanJoueur: "placement",
    chooseCornerEntry: "actif",

    // Programmation — chacun la fait chez lui, en même temps que les autres
    toggleProgCard: "soi",
    confirmProgrammation: "soi",
    validatePhase: "soi",

    // Phase Action : les six cartes et les deux passifs
    jouerTeteEnAvant: "actif",
    jouerGraouhhh: "actif",
    jouerBoingBoing: "actif",
    jouerJeNePartagePas: "actif",
    jouerFautPasMeChauffer: "actif",
    jouerToutCasser: "actif",
    jouerMouvementGratuit: "actif",
    jouerRecuperation: "actif",
    discardCurrentCard: "actif",
    passerAuTitanSuivant: "actif",
    toutCasserResoudre: "actif",
    pickFpmcTarget: "actif",
    updateFpmcBid: "actif",
    revealFPMC: "actif",

    // Décisions bloquantes : c'est le Titan interrogé qui répond
    dilAttackerPick: "decision",
    dilValidateAttackerPick: "decision",
    resolveDilDefenderPick: "decision",
    resolveDilCancelWithAdrenaline: "decision",
    resolveRagePick: "decision",
    resolveRagePickAdrenaline: "decision",
    choisirRepli: "decision",
    ecroulementPoserDebris: "decision",
    ecroulementAbandonner: "decision",
    refuserFatigueEnCours: "decision",
    accepterFatigueEnCours: "decision",
    chooseVolDirection: "decision",

    // Décompte final : le placement secret des Verts
    updateVertAssignment: "soi",
    validerVerts: "soi",
  }), []);

  /* Réglages d'interface que l'hôte doit adopter AVANT d'exécuter l'action
     d'un invité. Ils ne sont pas dans l'instantané — ce sont des brouillons,
     pas de l'état de partie : le chemin qu'on est en train de tracer, le
     nombre d'Adrénalines qu'on s'apprête à miser. Ils vivent donc chez celui
     qui les compose, et ne traversent le réseau qu'au moment de valider. */
  const CONTEXTE_DISTANT = useMemo(() => ({
    bbPath: setBbPath,
    bbAdrenaline: setBbAdrenaline,
    moveAdrenaline: setMoveAdrenaline,
    teaAdrenaline: setTeaAdrenaline,
    tcAdrenaline: setTcAdrenaline,
    jnpSelected: setJnpSelected,
    progSelection: setProgSelection,
    direction: setDirection,
    useAdrenaline: setUseAdrenaline,
  }), []);

  /* ══════════════════════════════════════════════════════════
     L'HÔTE PRÊTE SA MAIN À UN INVITÉ, LE TEMPS D'UNE ACTION
     ══════════════════════════════════════════════════════════
     Presque toutes les actions du contrôleur se jouent POUR le Titan
     sélectionné : `jouerBoingBoing` lit `selectedTitanId`, `bbDest` et
     `bbAdrenaline` dans l'état local, et n'accepte aucun paramètre. C'est la
     bonne forme pour un appareil qui circule autour d'une table — et
     exactement la mauvaise pour quatre écrans.

     Deux issues étaient possibles. Réécrire les huit actions de validation
     pour qu'elles prennent tout en argument : correct, mais huit refactorings
     de soixante lignes chacun, sur les fonctions les plus chargées du fichier,
     pour un gain nul en local. Ou faire adopter à l'hôte, le temps d'une
     action, la position de l'invité — et laisser les fonctions inchangées.

     C'est la seconde. Une intention traverse TROIS RENDUS, un état par cran :

       recu     l'intention est en file, rien n'a bougé ;
       siege    l'hôte a basculé `selectedTitanId` sur le Titan de l'invité ;
       contexte l'hôte a adopté ses brouillons (chemin tracé, mise d'Adrénaline) ;
       → puis l'action s'exécute, et la sélection de l'hôte est rendue.

     Pourquoi trois rendus et pas un seul : les setters de React ne prennent
     effet qu'au rendu suivant. Tout faire d'affilée appellerait l'action avec
     l'ANCIENNE sélection et l'ANCIEN contexte — précisément la classe de bug
     que ce fichier documente à cinq endroits. On ne lutte donc pas contre le
     cycle de rendu, on s'en sert comme d'une horloge.

     Les intentions se traitent UNE À LA FOIS, dans l'ordre d'arrivée : deux
     joueurs qui cliquent en même temps ne peuvent pas s'entrelacer au milieu
     d'une adoption de siège. */
  const [fileIntentions, setFileIntentions] = useState([]);
  const [etapeIntention, setEtapeIntention] = useState("recu");
  const selectionHoteRef = useRef(null);

  /* Les callbacks changent d'identité à chaque rendu ; une ref lue au moment
     de l'exécution donne toujours la version courante, sans faire dépendre
     l'effet de deux cents fonctions. */
  const actionsRef = useRef({});

  const titanAutorise = useCallback((portee, titanDuSiege) => {
    if (titanDuSiege == null) return false;
    if (portee === "soi") return true;
    if (portee === "actif") return titanDuSiege === activePlayerId;
    if (portee === "placement") {
      /* Même règle que `prochainAPlacer`, recopiée en une ligne plutôt
         qu'appelée : cette fonction est déclarée plus bas dans le fichier, et
         la nommer en dépendance ici la lirait avant son initialisation. La
         règle, elle, tient en un mot — c'est le drapeau `aPlacer` qui dit ce
         qui reste à faire, jamais la file. */
      const joueurs = aiTitanStateRef.current?.players || [];
      const attendu = (placementRestantRef.current || [])
        .find((id) => joueurs.find((t) => t.id === id)?.aPlacer) ?? null;
      return attendu === titanDuSiege;
    }
    if (portee === "decision") {
      /* Une décision bloquante interroge quelqu'un de précis. Faute de pouvoir
         nommer ce quelqu'un pour les sept sortes de décisions, on retombe sur
         la garde que chaque résolveur porte déjà : il refuse une réponse qui
         ne le concerne pas. Le réseau n'affaiblit donc rien — il ne fait que
         ne pas resserrer. */
      return true;
    }
    return false;
  }, [activePlayerId]);

  useEffect(() => {
    if (!distantHote || fileIntentions.length === 0) return;
    const intention = fileIntentions[0];
    const rejeter = (raison) => {
      setFileIntentions((f) => f.slice(1));
      setEtapeIntention("recu");
      setActionLog((prev) => [...prev, `🚫 ${intention.pseudo} : ${raison}`]);
    };

    /* `hasOwnProperty` et non une simple indexation : `intention.fn` vient du
       réseau, et `ACTIONS_DISTANTES["__proto__"]` ou `["constructor"]` rendrait
       une valeur héritée, donc « vraie », pour une action qui n'est pas dans la
       liste blanche. Même raison qu'à l'étape « contexte » plus bas. */
    const portee = Object.prototype.hasOwnProperty.call(ACTIONS_DISTANTES, intention.fn)
      ? ACTIONS_DISTANTES[intention.fn]
      : null;
    if (typeof portee !== "string") { rejeter(`action « ${intention.fn} » non autorisée à distance.`); return; }
    const titanDuSiege = intention.titanId;
    if (!titanAutorise(portee, titanDuSiege)) {
      rejeter("ce n'est pas à toi de jouer.");
      return;
    }

    if (etapeIntention === "recu") {
      selectionHoteRef.current = selectedTitanId;
      setSelectedTitanId(titanDuSiege);
      setEtapeIntention("siege");
      return;
    }
    if (etapeIntention === "siege") {
      /* ⚠️ `CONTEXTE_DISTANT[cle]` SANS GARDE FAISAIT PLANTER TOUTE LA PARTIE.
         Trouvé à la revue de sécurité du 2026-08-30, et vérifié : `JSON.parse`
         d'un `{"__proto__": 1}` crée une propriété PROPRE et énumérable
         littéralement nommée `__proto__`. `Object.entries` la restitue, et
         l'indexation rendait alors `Object.prototype` — un objet, donc « vrai »
         — qu'on appelait ensuite comme une fonction.

         L'exception partait d'un `useEffect`, hors de tout filet : React démonte
         l'arbre entier, et la partie s'arrête pour toute la table. Il suffisait
         d'un invité assis et d'une seule requête.

         Deux verrous plutôt qu'un : la clé doit être une propriété PROPRE de la
         table (jamais héritée du prototype), et sa valeur doit être une vraie
         fonction. Et tout le bloc passe dans un filet, comme l'exécution de
         l'action juste en dessous — une intention malformée fait perdre son tour
         à son auteur, jamais la partie aux autres. */
      try {
        Object.entries(intention.contexte || {}).forEach(([cle, valeur]) => {
          if (!Object.prototype.hasOwnProperty.call(CONTEXTE_DISTANT, cle)) return;
          const poser = CONTEXTE_DISTANT[cle];
          if (typeof poser === "function") poser(valeur);
        });
      } catch (e) {
        console.error("[distant] contexte refusé", e);
        rejeter("réglages non reconnus.");
        return;
      }
      setEtapeIntention("contexte");
      return;
    }
    // etapeIntention === "contexte" : tout est en place, on joue.
    const action = Object.prototype.hasOwnProperty.call(actionsRef.current, intention.fn)
      ? actionsRef.current[intention.fn]
      : null;
    if (typeof action === "function") {
      try {
        action(...(intention.args || []));
      } catch (e) {
        /* Une action qui échoue ne doit pas figer la file pour tout le monde :
           on journalise et on passe à la suivante. L'invité verra dans le
           prochain instantané que rien n'a bougé. */
        console.error("[distant] action refusée", intention.fn, e);
        setActionLog((prev) => [...prev, `⚠️ L'action de ${intention.pseudo} n'a pas abouti.`]);
      }
    }
    setFileIntentions((f) => f.slice(1));
    setEtapeIntention("recu");
    // La main revient à l'hôte : son propre panneau ne doit pas rester
    // accroché au Titan de quelqu'un d'autre.
    if (selectionHoteRef.current != null) setSelectedTitanId(selectionHoteRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distantHote, fileIntentions, etapeIntention, selectedTitanId, titanAutorise]);

  /* ══════════════════════════════════════════════════════════
     BRANCHER ET DÉBRANCHER LA SESSION
     ══════════════════════════════════════════════════════════ */
  const brancherSession = useCallback((nouvelle) => {
    setSession(nouvelle);
    setDistantJoueurs(nouvelle.joueurs || []);
    setDistantSieges(nouvelle.sieges || {});
    setDistantFin(null);
    setDistantAvis(null);

    nouvelle.sur("presence", ({ joueurs, sieges }) => {
      setDistantJoueurs(joueurs || []);
      setDistantSieges(sieges || {});
    });
    nouvelle.sur("etat", (instantane) => setEtatDistantRecu(instantane));
    nouvelle.sur("prive", (charge) => setMainPriveeRecue(charge));
    /* Les intentions n'arrivent que chez l'hôte — le relais les y adresse et
       nulle part ailleurs. On les met en file plutôt que de les jouer ici : le
       traitement demande trois rendus (cf. la machine ci-dessus), et un
       abonnement réseau n'est pas un endroit d'où piloter React. */
    nouvelle.sur("intention", (m) => setFileIntentions((f) => [...f, m]));
    nouvelle.sur("chat", (m) => setDistantChat((prev) => [...prev.slice(-40), m]));
    nouvelle.sur("erreur", ({ message }) => setDistantAvis(message));
    nouvelle.sur("fin", ({ raison }) => { setDistantFin(raison); setDistantAvis(raison); });

    // Un invité qui arrive en cours de partie reçoit l'état courant d'emblée,
    // sans attendre le prochain coup de l'hôte.
    if (nouvelle.etatInitial) setEtatDistantRecu(nouvelle.etatInitial);
    return nouvelle;
  }, []);

  const quitterSessionDistante = useCallback(async () => {
    const s = sessionRef.current;
    setSession(null);
    setDistantJoueurs([]); setDistantSieges({});
    setEtatDistantRecu(null); setMainPriveeRecue(null);
    setFileIntentions([]); setEtapeIntention("recu");
    if (s) await s.quitter();
  }, []);

  /* Fermer l'onglet doit libérer la place tout de suite. Sans ça, un joueur qui
     recharge sa page revient comme un SECOND participant, et son siège reste
     occupé par le fantôme du premier pendant quatre-vingt-dix secondes. */
  useEffect(() => {
    if (!session) return undefined;
    const partir = () => { sessionRef.current?.quitter(); };
    window.addEventListener("pagehide", partir);
    return () => window.removeEventListener("pagehide", partir);
  }, [session]);

  /* ── CÔTÉ INVITÉ : SE CALER SUR LE PLATEAU DE L'HÔTE ──
     Le plateau public arrive mains masquées, la main privée arrive à part. On
     attend d'avoir les deux avant de reposer la partie : appliquer le plateau
     seul ferait clignoter la main du joueur à chaque coup adverse. */
  useEffect(() => {
    if (!distantInvite || !etatDistantRecu) return;
    restaurerInstantane(fusionnerMain(etatDistantRecu, mainPriveeRecue));
    /* C'est l'hôte qui ouvre la table, pas le clic de l'invité sur
       « Rejoindre ». Entrer tout de suite montrait un plateau généré
       localement — quatre Titans posés, une ville complète — remplacé une
       seconde plus tard par celui de l'hôte. Un joueur qui voit ça croit
       légitimement que la partie a commencé sans lui. */
    if (etatDistantRecu.partieLancee) setSetupDone(true);
  }, [distantInvite, etatDistantRecu, mainPriveeRecue, restaurerInstantane]);

  /* ── CÔTÉ HÔTE : DIFFUSER APRÈS CHAQUE COUP ──
     Le déclencheur est l'état de partie lui-même, pas les actions : une
     diffusion par action aurait obligé à se souvenir d'en ajouter une à chaque
     fois qu'on écrit une nouvelle action — et on l'aurait oublié.

     L'attente de 120 ms n'est pas du confort : une action fait bouger huit
     morceaux d'état en autant de rendus, et diffuser huit fois soixante
     kilo-octets pour un seul coup sature la liaison sans rien apprendre à
     personne. On attend que ça se stabilise, puis on envoie une fois. */
  const dernierEnvoiRef = useRef("");
  useEffect(() => {
    if (!distantHote || !session) return undefined;
    const minuteur = setTimeout(() => {
      const complet = instantaneCourant();
      const public_ = plateauPublic(complet);
      const signature = JSON.stringify(public_);
      if (signature === dernierEnvoiRef.current) return;
      dernierEnvoiRef.current = signature;
      session.diffuserEtat(public_).catch(() => setDistantAvis("Diffusion impossible, reprise…"));
      /* Et à chacun sa main, par le canal privé. C'est ce qui garde la
         programmation secrète : le plateau part en clair, les cartes non. */
      Object.entries(distantSieges).forEach(([titanId, ref]) => {
        const main = mainPrivee(complet, titanId);
        if (main) session.envoyerPrive(ref, main).catch(() => {});
      });
    }, 120);
    return () => clearTimeout(minuteur);
  }, [distantHote, session, distantSieges, instantaneCourant]);

  useEffect(() => {
    if (distantInviteRef.current) return; // `passifUsed` arrive dans l'instantané
    if (activePlayerId == null) return;
    setPassifUsed((prev) => ({
      ...prev,
      [activePlayerId]: { ...(prev[activePlayerId] || {}), move: false },
    }));
    /* Les quatre compteurs d'Adrénaline sont des réglages d'INTERFACE, pas
       de l'état de jeu : ils vivaient d'un tour à l'autre sans jamais être
       remis à zéro, et se retrouvaient appliqués au Titan suivant, qui n'a
       pas le même stock. D'où le décalage remonté par Nikola le 2026-08-17
       — un rayon de déplacement ou de saut visiblement trop large, et un
       sélecteur qui affichait « 2/0 ». Chaque Titan reprend donc son tour à
       zéro Adrénaline engagée, et l'engage explicitement s'il le veut. */
    setMoveAdrenaline(0);
    setTeaAdrenaline(0);
    setTcAdrenaline(0);
    setBbAdrenaline(0);
  }, [activePlayerId]);

  // ── RETOUR EN JEU D'UN TITAN ÉJECTÉ ──
  // Ruling Nikola du 2026-08-16 : un Titan poussé hors de BIG CITY attend
  // SON tour pour revenir, jamais avant — « ça évite l'acharnement ». C'est
  // donc ici, à l'ouverture de son tour en Phase Action, qu'il rentre.
  // Un seul effet, qui POSE ou EFFACE le coût de rentrée. Deux effets
  // séparés sur la même dépendance se seraient annulés : React les exécute
  // dans l'ordre de déclaration, et celui qui remet à zéro aurait effacé la
  // valeur que l'autre venait d'écrire.
  /* LA RENTRÉE N'EST PLUS SEULEMENT UN EFFET — Nikola, 2026-08-28, deuxième
     remontée du même symptôme : « j'aurais dû revenir sur le plateau
     visuellement mais je ne le suis pas […] j'ai encore dû faire défausser ».

     Elle vivait UNIQUEMENT dans un useEffect déclenché par le changement de
     Titan actif. Un effet ne se rejoue que si ses dépendances changent :
     toute séquence où le tour s'ouvre sans qu'elles bougent laisse le Titan
     dehors, et le reste du tour se déroule par-dessus cet état impossible.
     Une passe précédente a cherché la cause dans la fraîcheur des refs et a
     écrit un test qui passe : ce n'était pas ça, et le bug est revenu.

     La logique est donc extraite ici, appelable à la demande. L'effet reste —
     c'est le chemin normal — mais il n'est plus le SEUL : le Mouvement
     gratuit la rappelle avant d'agir. Deux déclencheurs indépendants pour une
     opération idempotente (elle sort tout de suite si le Titan est déjà
     rentré), et le domaine refuse de son côté de déplacer un Titan hors
     plateau (cf. resolveFreeMovement). */
  const assurerRentree = useCallback((titanId) => {
    if (titanId == null) return { rentre: false };
    const joueur = aiTitanStateRef.current.players.find((t) => t.id === titanId);
    if (!joueur?.horsPlateau) return { rentre: false, dejaEnJeu: true };

    /* Coin bloqué, deux cases également proches : demandé par Nikola le
       2026-08-24, c'est au joueur de choisir laquelle, pas au tri interne.
       Une IA n'a personne pour cliquer — choisirAuto laisse le domaine
       trancher, plutôt que de redupliquer ici la règle du départage. */
    const estIA = aiTitanModesRef.current[titanId] === "ia";
    const etatRentree = {
      board: aiStateRef.current.board,
      titans: aiTitanStateRef.current.players,
      looseBlocks: aiLooseBlocksRef.current,
    };
    const retour = rentrerEnJeu(titanId, etatRentree, { choisirAuto: estIA });
    if (retour.needsChoice) {
      setCornerChoice({ titanId, options: retour.options, coinBloque: retour.cellule });
      return retour;
    }
    setCornerChoice(null);
    setActionLog((prev) => [...prev, ...retour.log]);
    // La rentrée se paie sur le Mouvement gratuit du tour : il lui reste
    // d'autant moins de cases à parcourir, et il devra peut-être dépenser
    // une Adrénaline pour retrouver de la marge.
    setCoutRentree(retour.rentre ? { titanId, cout: retour.cout } : null);
    if (retour.rentre) setTitanState((p) => ({ ...p, players: [...p.players] }));
    return retour;
  }, []);

  useEffect(() => {
    if (distantInviteRef.current) return; // la rentrée est arbitrée par l'hôte
    if (phase !== "action" || activePlayerId == null) { setCoutRentree(null); setCornerChoice(null); return; }
    const joueur = aiTitanStateRef.current.players.find((t) => t.id === activePlayerId);
    if (!joueur?.horsPlateau) { setCoutRentree(null); setCornerChoice(null); return; }
    assurerRentree(activePlayerId);
  }, [activePlayerId, phase, titanModes, assurerRentree]);


  /* ── LA SÉQUENCE DE PLACEMENT ──
     Elle se déroule tant que la file n'est pas vide. Une IA prend son
     emplacement dès que son tour arrive ; un humain arrête la file, et c'est
     son clic sur le plateau qui la relance.

     C'est cette alternance qui donne son sens à l'ordre : chacun ne voit que
     les Titans DÉJÀ posés, jamais ceux qui posent après lui. Placer tout le
     monde d'un coup, même dans le bon ordre, retirait l'information que
     l'ordre était censé distribuer. */
  const placementCells = useMemo(
    () => (placementRestant.length > 0 ? getPlacementCells(titanState.players) : []),
    [placementRestant, titanState.players]
  );

  /* QUI DOIT POSER MAINTENANT — lu sur les TITANS, jamais sur la file.
     La file dit l'ordre ; c'est le drapeau `aPlacer` qui dit ce qui reste à
     faire, et lui seul est muté de façon synchrone par le domaine.

     Lire `placementRestant[0]` dans une fermeture rendait la pose sensible au
     rythme des clics : deux clics assez rapprochés pour tomber dans le même
     lot React voyaient la même file, désignaient le même Titan, et le second
     partait en échec — mais la file, elle, avait été décalée deux fois. La
     séquence se terminait alors avec des Titans jamais posés, invisibles sur
     un plateau où la partie démarrait quand même.

     En repartant des Titans, un second clic dans le même lot trouve
     naturellement le SUIVANT à poser : cliquer vite pose vite, au lieu de
     casser la mise en place. */
  const prochainAPlacer = useCallback((restant, joueurs) => (
    (restant || []).find((id) => (joueurs || []).find((t) => t.id === id)?.aPlacer) ?? null
  ), []);

  const placerTitanJoueur = useCallback((cellKey) => {
    const titanId = prochainAPlacer(placementRestantRef.current, aiTitanStateRef.current.players);
    if (titanId == null) return;
    const res = placerTitanInitial(titanId, cellKey, aiTitanStateRef.current.players);
    if (!res.pose) return;
    setActionLog((prev) => [...prev, ...res.log]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    // La file ne retient que ceux qui n'ont pas encore posé : elle ne peut
    // donc plus se décaler d'un cran de plus que le nombre de poses réelles.
    setPlacementRestant((prev) => prev.filter((id) => id !== titanId));
  }, [prochainAPlacer]);

  /* SORTIE DE SECOURS DE LA SÉQUENCE : pose d'un coup tous ceux qui restent,
     chacun sur son emplacement par défaut. Une partie ne doit jamais pouvoir
     rester coincée sur une mise en place — et c'est aussi ce qui permet à un
     harnais de test de sauter une étape qui n'est pas son sujet, sans avoir à
     simuler quatre clics. */
  useEffect(() => { placementRestantRef.current = placementRestant; }, [placementRestant]);

  const terminerPlacement = useCallback(() => {
    setPlacementRestant((restant) => {
      if (restant.length === 0) return restant;
      const joueurs = aiTitanStateRef.current.players;
      const logs = [];
      restant.forEach((id) => { logs.push(...placerTitanInitial(id, null, joueurs).log); });
      setActionLog((prev) => [...prev, ...logs]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      return [];
    });
  }, []);

  useEffect(() => {
    if (distantInviteRef.current) return; // la file de mise en place est tenue par l'hôte
    /* ⚠️ `titanState.players`, PAS la ref. La ref est synchronisée par un effet,
       donc au premier rendu qui suit une nouvelle partie elle pointe encore
       sur les Titans de la PRÉCÉDENTE — qui sont tous posés. Lue ici, elle
       faisait conclure « plus personne à poser » et soldait la mise en place
       avant qu'elle ait commencé. */
    const titanId = prochainAPlacer(placementRestant, titanState.players);
    if (titanId == null) {
      // Plus personne à poser : la file peut contenir des ids déjà servis si
      // deux clics sont tombés dans le même lot. On la solde.
      if (placementRestant.length > 0) setPlacementRestant([]);
      return;
    }
    // Un humain décide lui-même : la file s'arrête là, et attend son clic.
    if (aiTitanModesRef.current[titanId] !== "ia") return;

    /* TOUTES LES IA CONSÉCUTIVES EN UNE PASSE, jamais une par rendu.
       Une IA par commit obligeait à quatre allers-retours dans une partie tout
       IA — quatre bandeaux qui s'affichent et disparaissent pour rien, et une
       cascade d'états qui ne se résout qu'après autant de flushs. On avance
       donc tant que la tête de file est une IA, et on s'arrête net sur le
       premier humain : c'est LUI qui doit voir le plateau tel qu'il est, et
       lui seul.

       Les Titans sont mutés en place, donc `prochainAPlacer` voit le
       précédent déjà posé à chaque tour de boucle : chacun choisit bien
       parmi les cases restantes, exactement comme s'ils avaient joué l'un
       après l'autre. */
    const joueurs = titanState.players;
    const logs = [];
    const poses = [];
    let restant = placementRestant;
    for (;;) {
      const suivant = prochainAPlacer(restant, joueurs);
      if (suivant == null || aiTitanModesRef.current[suivant] !== "ia") break;
      /* Sans case demandée, le domaine retombe sur l'emplacement que le tirage
         avait réservé à cette IA — donc une partie tout IA se place exactement
         comme avant, à la graine près. */
      logs.push(...placerTitanInitial(suivant, null, joueurs).log);
      poses.push(suivant);
      restant = restant.filter((id) => id !== suivant);
    }
    if (poses.length === 0) return;
    setActionLog((prev) => [...prev, ...logs]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setPlacementRestant((prev) => prev.filter((id) => !poses.includes(id)));
  }, [placementRestant, titanState.players, prochainAPlacer]);

  // Choix du joueur entre les deux cases d'un coin bloqué (cf. l'effet
  // ci-dessus) : résolu par un clic sur l'une des deux options proposées.
  const chooseCornerEntry = useCallback((cellKey) => {
    if (!cornerChoice || !cornerChoice.options.includes(cellKey)) return;
    captureSnapshot();
    const titan = titanState.players.find((t) => t.id === cornerChoice.titanId);
    if (!titan) return;
    titan.horsPlateau = false;
    titan.cell = cellKey;
    setActionLog((prev) => [...prev, `🥊 Titan ${cornerChoice.titanId} rentre sur BIG CITY par ${cellKey} (coin ${cornerChoice.coinBloque} bloqué — choisi).`]);
    setCoutRentree({ titanId: cornerChoice.titanId, cout: 1 });
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setCornerChoice(null);
  }, [cornerChoice, titanState.players, captureSnapshot]);

  // ── DÉCISIONS IA ──
  // Les heuristiques à priorité fixe qui vivaient ici ont été retirées.
  // Elles jouaient toujours la carte la plus haute d'un ordre codé en dur,
  // visaient la direction dont la SEULE case suivante contenait le plus de
  // blocs (sans jamais compter les Titans, ce qui était absurde pour
  // Graouhhh), ne dépensaient jamais d'Adrénaline et ignoraient
  // totalement le barème de scoring.
  //
  // Tout cela vit maintenant dans le domaine (`aiPlanner`), qui énumère
  // les coups légaux, les simule avec les vrais résolveurs et les note au
  // score réel. On ne garde ici que le branchement.
  const profilDe = useCallback(
    (id) => titanProfiles[id] ?? makeProfile(),
    [titanProfiles]
  );

  // Re-trigger IA quand activePlayerId change vers un joueur IA
  useEffect(() => {
    if (!setupDone) return;
    if (phase !== "action") return;
    if (activePlayerId == null) return;
    if (titanModes[activePlayerId] !== "ia") return;
    if (distantInviteRef.current) return; // les IA jouent chez l'hôte, une seule fois
    // Petit délai pour laisser setAiPlayingSync(false) se propager avant de vérifier
    const t = setTimeout(() => {
      if (!aiPlayingRef.current) {
        setAiTrigger((n) => n + 1);
      }
    }, 80);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayerId]);

  // ── AUTO-PLAY IA ──
  // Compteur pour forcer le re-trigger de l'effect IA entre chaque carte
  const aiTriggerRef = useRef(0);
  const [aiTrigger, setAiTrigger] = useState(0);

  // Ref pour transmettre le prochain joueur depuis setTitanState (batch) vers setActivePlayerId
  const aiNextPlayerRef = useRef(null);

  // Refs "live" pour que les timers IA lisent toujours l'état courant
  const aiStateRef = useRef(state);
  const aiTitanStateRef = useRef(titanState);
  const aiLooseBlocksRef = useRef(looseBlocks);
  const aiPassifUsedRef = useRef(passifUsed);
  const aiActivePlayerIdRef = useRef(activePlayerId);
  const aiTitanModesRef = useRef(titanModes);
  // Profils des IA, lus au moment de trancher un repli (cf. enqueueReplis).
  const aiTitanProfilesRef = useRef(titanProfiles);
  useEffect(() => { aiStateRef.current = state; }, [state]);
  useEffect(() => { aiTitanStateRef.current = titanState; }, [titanState]);
  useEffect(() => { aiLooseBlocksRef.current = looseBlocks; }, [looseBlocks]);
  useEffect(() => { aiPassifUsedRef.current = passifUsed; }, [passifUsed]);
  useEffect(() => { aiActivePlayerIdRef.current = activePlayerId; }, [activePlayerId]);
  useEffect(() => { aiTitanModesRef.current = titanModes; }, [titanModes]);
  useEffect(() => { aiTitanProfilesRef.current = titanProfiles; }, [titanProfiles]);
  // Les minuteries de l'IA lisent le coût de rentrée bien après le rendu :
  // il leur faut une ref à jour, pas la valeur figée par la fermeture.
  const coutRentreeRef = useRef(coutRentree);
  useEffect(() => { coutRentreeRef.current = coutRentree; }, [coutRentree]);

  /* Le coup choisi par la recherche conjointe a l'etape 1 (deplacement), a
     rejouer tel quel a l'etape 2 (carte). Les deux etapes sont separees par
     une minuterie d'affichage : sans cette ref, l'etape 2 rechercherait
     depuis un etat different et pourrait annuler le placement que l'etape 1
     venait de choisir POUR ce coup-la. */
  const coupJointRef = useRef(null);

  /* Les Titans qui jouent encore APRÈS celui-ci dans le round. C'est ce que
     l'évaluation consulte pour chiffrer ce qu'un coup offre (cf.
     `valeurOfferte`) : ce qu'on laisse devant eux, ils le ramassent.
     L'ordre d'initiative pivote sur le Détonateur, comme la rangée des
     plaques — la règle du pivot ne vit qu'à un endroit, `ordreJeu`. */
  const titansApresMoi = useCallback((titanId) => {
    const ordre = aiTitanStateRef.current?.ordreJeu ?? [];
    const depart = ordre.indexOf(aiTitanStateRef.current?.detonateur);
    const pivote = depart <= 0 ? ordre : [...ordre.slice(depart), ...ordre.slice(0, depart)];
    const i = pivote.indexOf(titanId);
    return new Set(i < 0 ? [] : pivote.slice(i + 1));
  }, []);

  useEffect(() => {
    if (!setupDone) return;
    if (phase !== "action") return;
    if (activePlayerId == null) return;
    if (titanModes[activePlayerId] !== "ia") return;
    if (aiPlayingRef.current) return;
    if (distantInviteRef.current) return; // les IA jouent chez l'hôte, une seule fois
    /* Une décision née d'un tour IA se règle AVANT le tour suivant.
       Bug remonté par Nikola (test à la table, 2026-08-18) : « dès que
       j'ai fait le dil c'est passé au joueur suivant automatiquement, je
       n'ai pas pu ramasser le bloc tombé au sol. » `finishAiTurn` faisait
       avancer `activePlayerId` dès que la carte de l'IA était jouée, sans
       jamais attendre qu'un DIL/RAGE qu'elle venait de déclencher soit
       tranché — si le Titan suivant était lui aussi une IA, cet effet
       démarrait alors SON tour (mouvement, carte, récupération) pendant
       que le joueur humain avait encore un DIL en attente. Même garde-fou
       que la Phase suivante (cf. l'effet d'avancement de Phase). */
    if (currentDecision || currentRepli || ecroulement) return;

    const titan = aiTitanStateRef.current.players.find((t) => t.id === activePlayerId);
    if (!titan) return;
    if (titan.programmed.length === 0) return;

    // Capturer l'identité du joueur UNE SEULE FOIS ici — ne jamais relire les refs pour ça
    const playerId = activePlayerId;

    setAiPlayingSync(true);
    setAiStepLabel("🦶 Déplacement…");

    // Fin de tour IA : joue la carte, puis avance RÉELLEMENT au Titan suivant.
    // Deux bugs corrigés ici (session) :
    // 1) L'ancienne condition `aiNextPlayerRef.current === playerId` comparait le
    //    prochain joueur à celui qui vient de jouer — toujours faux dès qu'il y a
    //    plusieurs Titans, donc setActivePlayerId n'était jamais rappelé.
    // 2) Une fois cette condition corrigée, un second bug plus profond subsistait :
    //    aiNextPlayerRef était écrite depuis l'intérieur d'un updater useState
    //    asynchrone (cf. cardsPlayedCountRef ci-dessus) — relue via un
    //    Promise.resolve().then() dont le timing n'était pas garanti par rapport
    //    au flush React, la ref pouvait rester stale et le blocage persistait,
    //    que la carte ait été jouée avec effet ou défaussée face cachée.
    // advanceActionRound étant désormais 100% synchrone, aiNextPlayerRef.current
    // est fiable dès le retour de markCardPlayed — plus besoin de microtask.
    const finishAiTurn = (cardId) => {
      markCardPlayed(playerId, cardId);
      setTitanState((p) => ({ ...p, players: [...p.players] }));
      setAiPlayingSync(false); // réinitialise aussi aiStepLabel via setAiPlayingSync
      setWaitingNextTitan(false);
      if (aiNextPlayerRef.current != null) {
        setActivePlayerId(aiNextPlayerRef.current);
      }
      // Sinon (null) : fin de Phase Action déjà gérée par advanceActionRound.
    };

    /* ── LE TOUR D'UNE IA PREND LE TEMPS QU'ON LE VOIE ──
       2 000 ms suffisaient tant que rien ne s'animait. Depuis que les IA
       tracent leurs chemins comme le joueur (Nikola, 2026-08-29 : « quitte à
       ralentir un peu la vitesse de leur tour »), il faut au moins la durée
       d'une traînée — 110 ms par case plus 1,5 s de tenue — avant que l'étape
       suivante n'efface la précédente. À quatre Titans dont trois IA, chaque
       tranche de 600 ms coûte presque deux secondes par round : on ajoute le
       minimum qui rende la trace lisible, pas plus. */
    const DELAI_IA_MS = 2600;
    const timers = [];

    // ── ÉTAPE 1 : MOUVEMENT PASSIF ──
    const t1 = setTimeout(() => {
      const curState = aiStateRef.current;
      const curTitanState = aiTitanStateRef.current;
      const curLooseBlocks = aiLooseBlocksRef.current;
      const curPassifUsed = aiPassifUsedRef.current;
      const curTitan = curTitanState.players.find((t) => t.id === playerId);
      if (!curTitan) { setAiPlayingSync(false); return; }

      if (!curPassifUsed[playerId]?.move) {
        // L'ancienne note « blocsLibres × 2 + hauteurBâtiment » ignorait la
        // couleur des blocs, donc le barème : un Titan au Bleu saturé
        // courait vers un tas de Bleu à 0 point. planMovement note la case
        // au score réel.
        const jeu = {
          titans: curTitanState.players, board: curState.board, looseBlocks: curLooseBlocks,
          // Qui joue encore après lui ce round : ce que son coup laisse
          // traîner devant eux, ils le ramassent (cf. `valeurOfferte`).
          aJouerEncore: titansApresMoi(playerId),
          // Ce qu'il faut pour juger si un coup RAPPROCHE la fin de partie
          // (cf. `valeurFinDePartie`). Le seuil d'Apocalypse est verrouillé au
          // lancement, la Manche et le nombre de joueurs bougent : les trois
          // sont relus à chaque tour plutôt que figés.
          finDePartie: { apocalypseThreshold, mancheNumber, nbJoueurs },
        };
        // Portée réduite si le Titan vient de rentrer sur le plateau : sa
        // rentrée a consommé une partie de son Mouvement gratuit.
        const deja = coutRentreeRef.current && coutRentreeRef.current.titanId === playerId
          ? coutRentreeRef.current.cout
          : 0;
        const portee = Math.max(0, 2 - deja);
        /* LE TOUR SE DÉCIDE D'UN BLOC quand la force le permet : où se
           placer dépend de la carte qu'on jouera de là (cf. `planTour`).
           Le coup retenu est mis de côté pour l'étape 2, qui le rechercherait
           sinon depuis un état différent — et pourrait en choisir un autre,
           annulant le bénéfice du placement. */
        const tour = planTour(playerId, jeu, profilDe(playerId), mancheNumber, portee);
        coupJointRef.current = tour ? { titanId: playerId, coup: tour.coup } : null;
        const choix = tour
          ? (tour.destKey ? { destKey: tour.destKey } : null)
          : planMovement(playerId, jeu, profilDe(playerId), portee);
        if (choix) {
          /* ── ON DOIT VOIR PAR OÙ PASSE UNE IA ──
             Nikola, 2026-08-29 : « quand les IA jouent, on doit aussi voir les
             chemins comme quand c'est moi qui joue, pareil pour les projections
             de leur part — là je les vois bouger sans chemin clair ».

             Le chemin est tracé depuis toujours pour le joueur humain, et
             jamais pour les IA : leurs états de résolution ne portaient même
             pas de collecteur `trajectoires`, donc `projectInDirection` n'avait
             nulle part où déposer ses trajets. Un Titan changeait de case entre
             deux clignements, et rien ne disait par où il était passé ni ce
             qu'il avait bousculé au passage — sur trois adversaires, c'est la
             moitié de la partie qu'on ne voit pas.

             Le mouvement passif n'appelle aucune projection : son chemin se
             calcule comme celui du joueur, avec `getMovePath`. */
          const cheminIA = getMovePath(
            curTitan.cell, choix.destKey, portee, curState.board,
            indexerTitans(curTitanState.players), curLooseBlocks
          );
          resolveFreeMovement(playerId, choix.destKey, jeu);
          setTitanState((p) => ({ ...p, players: [...p.players] }));
          animerTrajectoires([{ cases: cheminIA, arrivee: choix.destKey, titanId: playerId }]);
        }
        if (choix || tour) {
          setPassifUsed((prev) => ({ ...prev, [playerId]: { ...(prev[playerId] || {}), move: true } }));
        }
      }

      // ── ÉTAPE 2 : CARTE ──
      const t2 = setTimeout(() => {
        setAiStepLabel("🃏 Joue une carte…");
        const curState2 = aiStateRef.current;
        const curTitanState2 = aiTitanStateRef.current;
        const curLooseBlocks2 = aiLooseBlocksRef.current;
        const curTitan2 = curTitanState2.players.find((t) => t.id === playerId);
        if (!curTitan2 || curTitan2.programmed.length === 0) { setAiPlayingSync(false); return; }

        const jeu2 = {
          board: curState2.board, titans: curTitanState2.players, looseBlocks: curLooseBlocks2,
          // Collecteur de trajets : sans lui, `projectInDirection` n'a nulle
          // part où déposer ce qu'il déplace, et les cartes des IA se
          // résolvaient sans qu'aucun chemin ne s'allume (Nikola, 2026-08-29).
          trajectoires: [],
          aJouerEncore: titansApresMoi(playerId),
          // Ce qu'il faut pour juger si un coup RAPPROCHE la fin de partie
          // (cf. `valeurFinDePartie`). Le seuil d'Apocalypse est verrouillé au
          // lancement, la Manche et le nombre de joueurs bougent : les trois
          // sont relus à chaque tour plutôt que figés.
          finDePartie: { apocalypseThreshold, mancheNumber, nbJoueurs },
        };
        // Le coup a déjà été choisi avec le déplacement (cf. étape 1) : le
        // rechercher ici depuis un autre état lui ferait perdre le placement.
        const joint = coupJointRef.current;
        coupJointRef.current = null;
        const move = (joint && joint.titanId === playerId)
          ? joint.coup
          : planCardPlay(playerId, jeu2, profilDe(playerId), mancheNumber);
        // Si aucun coup n'a pu être noté, on défausse la première carte.
        const cardId = move?.cardId ?? curTitan2.programmed[0];
        const { dir, mise = 0, bbDest: dest, jnpCells } = move || {};
        // L'Adrénaline est retranchée ici : les résolveurs du domaine la
        // lisent pour allonger la portée mais ne la débitent pas, c'est
        // l'application qui s'en charge (même contrat que pour un humain,
        // cf. les appels jouerToutCasser et consorts).
        if (mise > 0) curTitan2.adrenaline = Math.max(0, (curTitan2.adrenaline || 0) - mise);

        let newLog = [];
        let newDecisions = [];

        if (cardId === "tout_casser") {
          const res = resolveToutCasser(playerId, jeu2, mise);
          newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
          setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
        } else if (cardId === "tete_en_avant") {
          const d = dir || { dr: -1, dc: 0 };
          const res = resolveTeteEnAvant(playerId, d.dr, d.dc, mise, jeu2);
          newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
          setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
        } else if (cardId === "graouhhh") {
          /* MÊME CHEMIN QUE LE JOUEUR HUMAIN, Titan par Titan.
             L'IA passait par le wrapper monolithique `resolveGraouhhh`, qui
             déplace TOUS les Titans de l'axe d'un coup puis rend les
             décisions en bloc. Un joueur humain visé par cette carte voyait
             donc ses Titans bouger AVANT qu'on lui demande de trancher son
             Dilemme — l'inverse de l'ordre que Nikola a fixé le 18 août
             (« DIL/RAGE puis déplacement, et Titan suivant si il y en a un
             autre »). L'état final était le bon (l'ordre de traitement est
             identique des deux côtés, du plus loin au plus proche), mais la
             table lisait la scène à l'envers.

             `advanceGraouhhhLoop` enchaîne toute seule tant que les
             défenseurs sont des IA, et ne rend la main que sur un vrai
             défenseur humain — le cas où l'ordre compte. Elle enfile
             elle-même ses décisions, d'où `newDecisions` laissé vide ici. */
          const d = dir || { dr: -1, dc: 0 };
          const scan = scanGraouhhhAxis(playerId, jeu2, d.dr, d.dc);
          newLog = [...scan.log];
          newDecisions = [];
          if (scan.touched.length === 0) {
            newLog.push("Aucun Titan touché sur cet axe.");
          } else {
            advanceGraouhhhLoop({
              titanId: playerId, dr: d.dr, dc: d.dc,
              reculDistance: scan.reculDistance, mancheNumber,
              remaining: scan.touched.slice().reverse().map((t) => t.id),
              bagarreIds: [], touchedCount: scan.touched.length,
            });
          }
          setLooseBlocks((p) => ({ ...p }));
        } else if (cardId === "boing_boing") {
          if (dest) {
            const res = resolveBoingBoing(playerId, dest, mise, mancheNumber, jeu2);
            newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
            // L'IA n'a pas d'interface de répartition : elle applique la
            // répartition par défaut, cases vierges d'abord.
            if (res.ecroulement) {
              const choix = choisirRepartitionEcroulement(res.ecroulement, jeu2, playerId);
              const suite = resolveEcroulementAmas(playerId, res.ecroulement, choix, jeu2);
              newLog = [...newLog, ...suite.log];
            }
            setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
          } else {
            newLog = [`IA T${playerId} : Boing Boing sans destination, défausse.`];
          }
        } else if (cardId === "je_ne_partage_pas") {
          const cells = jnpCells || [];
          const res = resolveJeNePartagePas(playerId, cells, jeu2);
          newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
          setLooseBlocks((p) => ({ ...p }));
        } else if (cardId === "faut_pas_me_chauffer") {
          // Même résolveur de domaine que pour un joueur humain (cf.
          // revealFPMC). L'IA ne mise pas d'Adrénaline en secret — faute de
          // règle de décision pour ça — mais elle subit et applique
          // désormais TOUT le reste de la carte : projection de la cible,
          // Bagarre, DIL/RAGE. Auparavant elle n'en produisait que les
          // décisions, sans le moindre effet physique.
          const targets = getFPMCTargets(playerId, { titans: curTitanState2.players });
          if (targets.length === 0) {
            newLog = [`FPMC (IA T${playerId}) : aucune cible.`];
          } else {
            newLog = [`FPMC (IA T${playerId}) vs ${targets.length} cible(s)`];
            targets.forEach((defId) => {
              const res = resolveFautPasMeChauffer(playerId, defId, targets.length, jeu2);
              newLog.push(...res.log);
              newDecisions.push(...(res.decisions || []));
            });
            setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
          }
        } else {
          newLog = [`IA T${playerId} : carte inconnue (${cardId}), défausse.`];
        }

        setActionLog((prev) => [...prev, ...newLog]);
        /* Le chemin de ce que la carte a déplacé s'allume, exactement comme
           quand c'est le joueur qui joue (Nikola, 2026-08-29). Chaque case y
           porte déjà son élément, donc les débris restent jaunes et les Titans
           prennent leur couleur, sans rien de spécifique à faire ici. */
        animerTrajectoires(jeu2.trajectoires || []);

        // ── ÉTAPE 3 : RÉCUPÉRATION PASSIVE ──
        const t3 = setTimeout(() => {
          setAiStepLabel("📦 Récupération…");
          const curTitanState3 = aiTitanStateRef.current;
          const curLooseBlocks3 = aiLooseBlocksRef.current;
          const curPassifUsed3 = aiPassifUsedRef.current;
          const curTitanModes3 = aiTitanModesRef.current;

          if (!curPassifUsed3[playerId]?.recup) {
            // L'ancienne version prenait la première case contenant un
            // Socle, sinon la première du pool, et laissait le moteur
            // ramasser « le dernier empilé » faute de logique de choix.
            // planRecuperation désigne la case ET le bloc précis, au gain
            // marginal réel : un 9e Bleu à 0 point ne vaut pas un 1er
            // Rouge à 3.
            const jeu3 = { titans: curTitanState3.players, looseBlocks: curLooseBlocks3, board: aiStateRef.current.board };
            const choix = planRecuperation(playerId, jeu3, profilDe(playerId));
            if (choix) {
              resolveRecuperation(playerId, choix.cellKey, jeu3, choix.pickedValue);
              setLooseBlocks((p) => ({ ...p }));
              setTitanState((p) => ({ ...p, players: [...p.players] }));
              setPassifUsed((prev) => ({ ...prev, [playerId]: { ...(prev[playerId] || {}), recup: true } }));
            }
          }

          const needsHuman = newDecisions.some((d) => {
            const atk = curTitanModes3[d.attackerId];
            const def = curTitanModes3[d.defenderId];
            return atk === "humain" || def === "humain";
          });

          enqueueDecisions(newDecisions);
          // Dans les deux cas, le tour avance immédiatement (comme pour un joueur
          // humain : enqueueDecisions puis markCardPlayed sont déjà synchrones côté
          // humain, cf. jouerToutCasser et consorts). La queue DIL/RAGE est globale
          // et se résout indépendamment du joueur actif — inutile d'attendre ici.
          finishAiTurn(cardId);
        }, 2000);
        timers.push(t3);
      }, 2000);
      timers.push(t2);
    }, 2000);
    timers.push(t1);
    // Pas de cleanup : les timers doivent s'exécuter jusqu'au bout même si le composant re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupDone, phase, activePlayerId, titanModes, aiTrigger, currentDecision, currentRepli, ecroulement]);

  // ── AUTO-VALIDER PHASES IA ──
  // FIX (bug hunt) : cet effect lisait `titanState.players` depuis le closure
  // du composant sans l'avoir dans le tableau de dépendances (warning ESLint
  // désactivé ci-dessous) — la ref `t` trouvée pouvait donc être un objet
  // PÉRIMÉ, différent de celui présent dans `prev.players` au moment où
  // `setTitanState` s'exécutait réellement. `programCards` mute son objet en
  // entrée : muter l'objet périmé n'avait donc AUCUN effet sur l'état React
  // réel. Le Titan IA était marqué `phaseValidated = true` sans avoir de
  // cartes dans `programmed`, ce qui bloquait ensuite silencieusement l'IA en
  // Phase Action (`if (titan.programmed.length === 0) return;`) et gelait le
  // passage de tour ("en attente des autres Titans" indéfiniment).
  // Fix : on lit l'état courant via `aiTitanStateRef.current` (toujours à
  // jour, cf. le useEffect qui le synchronise plus haut) et on clone le
  // Titan visé DANS l'updater `setTitanState(prev => ...)` — donc toujours à
  // partir de `prev`, garanti à jour par React — avant de le muter.
  useEffect(() => {
    if (!setupDone) return;
    if (phase === "action") return; // géré par l'auto-play + markCardPlayed
    if (aiPlayingRef.current) return;
    if (distantInviteRef.current) return; // seul l'hôte valide pour les IA
    // Une IA ne programme pas avant d'avoir un pied sur le plateau : c'est
    // cette auto-validation qui poussait la Phase Action à s'ouvrir sur des
    // Titans jamais posés (cf. `placementEnCours`).
    if (placementEnCours) return;
    const curTitanState = aiTitanStateRef.current;
    curTitanState.ordreJeu.forEach((id) => {
      if (titanModes[id] === "ia" && !phaseValidated[id]) {
        if (phase === "programmation") {
          const t = curTitanState.players.find((p) => p.id === id);
          if (t && t.programmed.length < 3 && t.hand.length >= 3) {
            /* Troisième molette du profil. Les niveaux du bas notent leurs
               six cartes dans l'état présent et gardent les trois
               meilleures — donc trois cartes qui visent souvent la même
               chose, dont deux seront mortes une fois la première jouée.
               La référence programme en SÉQUENCE : elle choisit la
               deuxième en sachant ce que la première aura fait du plateau
               (cf. `planProgrammationSequentielle`). */
            const jeuProg = {
              titans: curTitanState.players,
              board: aiStateRef.current.board,
              looseBlocks: aiLooseBlocksRef.current,
            };
            const profilProg = profilDe(id);
            const chosen = reglagesDe(profilProg).programmationSequentielle
              ? planProgrammationSequentielle(id, jeuProg, profilProg, mancheNumber)
              : planProgrammation(id, jeuProg, profilProg, mancheNumber);
            setTitanState((prev) => ({
              ...prev,
              players: prev.players.map((p) => {
                if (p.id !== id) return p;
                const clone = { ...p, hand: [...p.hand], programmed: [...p.programmed] };
                const res = programCards(id, chosen, [clone]);
                return res.ok ? clone : p; // si programCards refuse, on garde l'état inchangé
              }),
            }));
          }
        }
        setPhaseValidated((prev) => ({ ...prev, [id]: true }));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupDone, phase, titanModes, phaseValidated, placementEnCours]);

  const canUseMovePassif = useCallback(
    (titanId) => phase === "action" && titanId === activePlayerId && !(passifUsed[titanId]?.move),
    [phase, activePlayerId, passifUsed]
  );
  const canUseRecupPassif = useCallback(
    (titanId) => {
      if (phase !== "action") return false;
      if (passifUsed[titanId]?.recup) return false;
      const titan = titanState.players.find((t) => t.id === titanId);
      if (!titan) return false;
      // Récupération uniquement après avoir joué OU défaussé (face cachée)
      // au moins une carte ce round — la défausse volontaire compte au
      // même titre qu'une carte réellement jouée (confirmé Nikola).
      return titan.playedThisManche.length > 0 || (titan.discardedHidden || []).length > 0;
    },
    [phase, passifUsed, titanState.players]
  );

  // ── AUTO-RÉSOLUTION DIL/RAGE avec IA (attaquant et/ou défenseur) ──
  // Bug remonté : seul le cas "attaquant ET défenseur IA" était auto-résolu.
  // Dès qu'UN SEUL des deux était humain, toute la décision (y compris la
  // part qui revient normalement à l'IA seule) passait par la queue UI
  // humaine — ex. un défenseur IA en DIL ne décidait jamais lui-même quelle
  // couleur perdre, c'était géré comme si un humain devait cliquer à sa
  // place. Règle du livret : en DIL, la CIBLE (défenseur) choisit laquelle
  // des 2 perdre ; en RAGE, l'ATTAQUANT choisit librement. Donc :
  // - RAGE : seul le mode de l'ATTAQUANT compte. IA → auto, quel que soit
  //   le défenseur. Humain → flux UI normal (resolveRagePick).
  // - DIL : les deux étapes (choix des 2 options, puis choix de la perte)
  //   sont indépendantes et chacune suit le mode de SON décideur.

  /* ── OÙ VA LE BLOC PERDU ── (arbitrage Nikola du 2026-08-17, carte par carte)
     Le bloc quittait le Repaire de la victime et n'arrivait NULLE PART : ni
     au sol, ni chez l'attaquant. Il disparaissait de la partie, sur le
     chemin humain comme sur le chemin IA du DIL — et le journal annonçait
     quand même « T1 prend rouge à T2 ».

     La destination n'est pas une règle générale : elle dépend de la carte
     jouée ET du type d'effet, et c'est le domaine qui tranche (cf.
     DESTINATION_BLOC_PERDU). Le contrôleur ne fait qu'appliquer le
     `destination` figé à la création de la demande, en même temps que la
     case d'impact. Coder ici un « DIL au sol, RAGE au Repaire » aurait été
     faux sur trois cartes sur cinq.

     `looseBlocks` est muté en place puis notifié par setLooseBlocks, exactement
     comme le font les résolveurs du domaine. */
  const retirerBlocDuRepaire = (defender, color) => {
    const idx = defender.repaire.indexOf(color);
    if (idx === -1) return null;
    return defender.repaire.splice(idx, 1)[0];
  };

  const poserBlocAuSol = useCallback((cellKey, bloc) => {
    if (!cellKey || !bloc) return false;
    const lb = aiLooseBlocksRef.current;
    if (!lb[cellKey]) lb[cellKey] = [];
    lb[cellKey].push(bloc);
    setLooseBlocks((prev) => ({ ...prev }));
    return true;
  }, []);

  /* Route le bloc perdu vers sa destination, et renvoie de quoi journaliser.
     Un seul endroit pour les quatre chemins d'appel (DIL humain, DIL IA,
     DIL IA↔IA, RAGE humaine) : c'est exactement le motif qui avait laissé la
     RAGE correcte côté IA et cassée côté humain. */
  const acheminerBlocPerdu = useCallback((decision, defender, attacker, color) => {
    const chute = decision.cellAtImpact || defender.cell;

    /* OPTION SOCLE (livret : « ou 1 socle tiré au sort si applicable »).
       Le Socle suit exactement la même route que les blocs — sol ou Repaire
       selon la carte — mais il vit dans `socles`, pas dans `repaire`, et sa
       VALEUR compte pour le score. Au sol, il se pose sous forme de marqueur
       et redevient ramassable comme n'importe quel débris, en conservant sa
       valeur. Chez l'attaquant, il rejoint sa pile de Socles. */
    if (color === SOCLE_OPTION) {
      const tire = retirerSocleAuSort(defender);
      if (!tire) return "";
      if (decision.destination === "repaire" && attacker) {
        attacker.socles.push(tire.valeur);
        return ` → Socle de ${tire.valeur} tiré au sort, passe chez Titan ${attacker.id}.`;
      }
      return poserBlocAuSol(chute, tire.marker)
        ? ` → Socle de ${tire.valeur} tiré au sort, tombe au sol en ${chute}, ramassable.`
        : ` → Socle de ${tire.valeur} tiré au sort.`;
    }

    const bloc = retirerBlocDuRepaire(defender, color);
    if (!bloc) return "";
    if (decision.destination === "repaire" && attacker) {
      attacker.repaire.push(bloc);
      return ` → passe dans le Repaire de Titan ${attacker.id}.`;
    }
    return poserBlocAuSol(chute, bloc) ? ` → tombe au sol en ${chute}, ramassable.` : ".";
  }, [poserBlocAuSol]);

  const autoResolveIaDecisions = useCallback((rawDecisions, curTitanModes, curPlayers) => {
    const needHuman = [];
    for (const d of rawDecisions) {
      const atkIsIa = curTitanModes[d.attackerId] === "ia";
      const defIsIa = curTitanModes[d.defenderId] === "ia";
      const defender = curPlayers.find((t) => t.id === d.defenderId);
      const attacker = curPlayers.find((t) => t.id === d.attackerId);
      if (!defender || !attacker) continue;

      if (d.type === "RAGE") {
        // RAGE : décision 100% côté attaquant (livret) — indépendant du
        // mode du défenseur.
        if (!atkIsIa) { needHuman.push(d); continue; }
        // Bug trouvé en branchant les IA : le seuil était `>= 2`, reliquat
        // de l'ancien alignement erroné sur la contrainte de DIL. Le
        // ruling de Nikola est explicite (cf. canRage) : RAGE est possible
        // dès 1 seule ressource, l'attaquant n'en prend qu'une. Avec
        // l'ancien seuil, une cible possédant exactement 1 bloc et aucune
        // Adrénaline ne perdait RIEN face à un attaquant IA : le RAGE
        // était purement et simplement annulé.
        if (defender.repaire.length >= 1) {
          let bestIdx = 0, bestScore = -Infinity;
          defender.repaire.forEach((color, idx) => {
            const val = marginalValue(color, attacker.repaire, curPlayers, d.attackerId);
            if (val > bestScore) { bestScore = val; bestIdx = idx; }
          });
          // Ce chemin poussait systématiquement le bloc dans le Repaire de
          // l'attaquant. C'est juste pour Tête en Avant et Faut Pas Me
          // Chauffer, faux pour la RAGE de Tout Casser, que Nikola a tranchée
          // « au sol » le 2026-08-17.
          const couleur = defender.repaire[bestIdx];
          const suffixe = acheminerBlocPerdu(d, defender, attacker, couleur);
          setActionLog((prev) => [...prev, `RAGE IA (T${d.attackerId} attaquant, ${d.cardLabel}) : arrache ${couleur} (+${bestScore}pts) à T${d.defenderId}${suffixe}`]);
        } else if (defender.adrenaline >= 1) {
          // FAQ #5. Une Adrénaline ne se pose pas au sol : elle va toujours
          // à l'attaquant, quelle que soit la ligne du tableau des
          // destinations. Elle n'était créditée nulle part.
          defender.adrenaline -= 1;
          attacker.adrenaline = (attacker.adrenaline || 0) + 1;
          setActionLog((prev) => [...prev, `RAGE IA (T${d.attackerId} attaquant, FAQ#5) : prend 1 Adrénaline à T${d.defenderId}.`]);
        }
        continue;
      }

      // DIL
      /* Les options sont désormais les couleurs DU REPAIRE PLUS, le cas
         échéant, « un Socle tiré au sort » (livret). L'IA raisonnait sur
         `defender.repaire` seul : elle n'aurait jamais proposé le Socle, et
         aurait planté sur une cible « 1 couleur + 1 Socle » que canDil
         accepte maintenant. */
      const optionsDil = getDilOptions(d.defenderId, { titans: curPlayers });

      if (atkIsIa && defIsIa) {
        // Les deux étapes auto, comme avant.
        if (optionsDil.length < 1) continue;
        const ranked = optionsDil
          .map((color) => ({ color, atkVal: valeurOptionDil(color, defender, attacker, curPlayers, d) }))
          .sort((a, b) => b.atkVal - a.atkVal);
        const offered = ranked.slice(0, Math.min(2, ranked.length));
        if (offered.length === 0) continue;
        // Le bloc perdu suit la même route que côté humain : sol ou Repaire
        // selon la carte jouée (cf. acheminerBlocPerdu). Il n'allait
        // jusqu'ici nulle part et disparaissait de la partie.
        /* Le défenseur choisit d'abord la moins chère des options offertes,
           puis — et c'est l'étape qui manquait ici — décide s'il préfère
           payer 1 Adrénaline plutôt que de la lâcher. Même arbitrage que
           face à un attaquant humain (cf. `defenseurPaieAdrenaline`). */
        const defValued = offered.map((o) => ({ ...o, defVal: coutOptionDil(o.color, defender, curPlayers) }));
        const defChoice = defValued.reduce((best, curr) => (curr.defVal < best.defVal ? curr : best));
        const voitAdversaires = FORCE_SETTINGS[aiTitanProfilesRef.current[d.defenderId]?.force]?.voitAdversaires;
        if (defenseurPaieAdrenaline(defender, defChoice.defVal, voitAdversaires)) {
          defender.adrenaline -= 1;
          if (attacker) attacker.adrenaline = (attacker.adrenaline || 0) + 1;
          setActionLog((prev) => [...prev, `DIL IA↔IA (${d.cardLabel}) : T${d.defenderId} préfère donner 1 Adrénaline à T${d.attackerId} plutôt que de perdre ${defChoice.color} (${defChoice.defVal} pts en jeu).`]);
          continue;
        }
        const suffixe = acheminerBlocPerdu(d, defender, attacker, defChoice.color);
        const seulChoix = offered.length === 1 ? " (seul choix)" : ` (valeur marginale ${defChoice.defVal})`;
        setActionLog((prev) => [...prev, `DIL IA↔IA (${d.cardLabel}) : T${d.defenderId} perd ${defChoice.color}${seulChoix}${suffixe}`]);
        continue;
      }

      if (atkIsIa && !defIsIa) {
        // Attaquant IA choisit seul ses 2 options (la valeur la plus haute
        // pour lui), puis la décision est poussée à la queue humaine DÉJÀ au
        // stade DEFENDER_PICK — le défenseur humain choisit laquelle des 2 il
        // perd (via resolveDilDefenderPick, inchangé).
        if (optionsDil.length < 1) continue;
        const ranked = optionsDil
          .map((color) => ({ color, atkVal: valeurOptionDil(color, defender, attacker, curPlayers, d) }))
          .sort((a, b) => b.atkVal - a.atkVal);
        const offered = [...new Set(ranked.slice(0, Math.min(2, ranked.length)).map((o) => o.color))];
        needHuman.push({ ...d, presetAttackerChoices: offered });
        continue;
      }

      // !atkIsIa && defIsIa : attaquant humain choisit normalement les 2
      // options (ATTACKER_PICK, UI classique) ; on marque juste la décision
      // pour que dilValidateAttackerPick sache que le défenseur (IA) doit
      // être auto-résolu ensuite, sans jamais attendre de clic humain pour
      // le stade DEFENDER_PICK.
      needHuman.push({ ...d, defenderIsAi: defIsIa });
    }
    return needHuman;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enqueueDecisions = useCallback((rawDecisions) => {
    if (!rawDecisions || rawDecisions.length === 0) return [];
    // Utilise les refs live pour les modes et players (évite stale closure)
    const curModes = aiTitanModesRef.current;
    const curPlayers = aiTitanStateRef.current.players;
    const humanDecisions = autoResolveIaDecisions(rawDecisions, curModes, curPlayers);
    if (humanDecisions.length === 0) {
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      return humanDecisions;
    }
    /* ── UNE DÉCISION IMPOSSIBLE NE DOIT JAMAIS ARRIVER À L'ÉCRAN ──
       `canDil` / `canRage` sont évalués par le résolveur AU MOMENT DE
       L'IMPACT. Mais la suite de la carte continue de s'appliquer après :
       la cible est projetée, elle sème des blocs en chemin (replis), un
       Amas s'écroule sur elle. Son Repaire peut donc être retombé sous le
       seuil quand la décision s'affiche enfin.

       Le panneau devenait alors sans issue : DIL exige 2 options désignées
       pour activer « Valider » — avec une seule option affichée, ce bouton
       ne s'active JAMAIS, et rien d'autre ne permet de sortir. Même chose
       pour une RAGE dont la cible n'a plus la moindre ressource : aucun
       bouton, aucune sortie, partie perdue.

       Le ruling est déjà tranché (Nikola, 14/08) : quand la cible n'a pas
       de quoi subir la décision, l'action est notée au journal et ne
       produit simplement aucun effet. On l'applique ici aussi, et pas
       seulement à la création. */
    const jeuCourant = { titans: curPlayers };
    const impossibles = [];
    const jouables = humanDecisions.filter((d) => {
      const ok = d.type === "RAGE" ? canRage(d.defenderId, jeuCourant) : canDil(d.defenderId, jeuCourant);
      if (!ok) impossibles.push(d);
      return ok;
    });
    if (impossibles.length > 0) {
      setActionLog((prev) => [...prev, ...impossibles.map((d) =>
        `${d.type} (${d.cardLabel}) sans effet sur Titan ${d.defenderId} : il ne lui reste plus de quoi la subir ` +
        `au moment de la résoudre (la carte a continué de s'appliquer après l'impact).`)]);
    }
    if (jouables.length === 0) {
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      return jouables;
    }

    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setDecisionQueue((prev) => [
      ...prev,
      ...jouables.map((d) => {
        // Bug remonté (DIL vs IA) : si l'attaquant IA a déjà pré-calculé
        // ses 2 options (presetAttackerChoices), on saute directement au
        // stade DEFENDER_PICK pour le défenseur humain — jamais de stade
        // ATTACKER_PICK fantôme sans attaquant humain pour le résoudre.
        let preset = d.presetAttackerChoices || null;

        // DIL à combinaison unique : quand le défenseur n'a QUE 2 couleurs
        // distinctes en Repaire, l'attaquant n'a aucun choix à faire — les
        // 2 couleurs qu'il doit désigner sont forcément celles-là. On saute
        // son étape plutôt que de lui faire cliquer une seule option
        // possible.
        if (!preset && d.type === "DIL") {
          // Options = couleurs du Repaire + « un Socle tiré au sort » le cas
          // échéant. Lire `repaire` seul ratait la combinaison unique
          // « 1 couleur + 1 Socle », et faisait cliquer l'attaquant sur une
          // liste d'un seul élément qu'il ne pouvait pas valider.
          const options = getDilOptions(d.defenderId, { titans: aiTitanStateRef.current.players });
          if (options.length === 2) preset = options;
        }

        /* ⚠️ QUI TRANCHE LE STADE DÉFENSEUR, C'EST LE DÉFENSEUR.
           Bug remonté par Nikola le 2026-08-28 : « quand DIL · Graouhhh, Niko
           sur Pénélope, je n'ai pas le droit de choisir Adrénaline — c'est la
           victime qui doit faire ce choix, si pour elle les 2 autres blocs sont
           trop importants ».

           Le raccourci « combinaison unique » juste au-dessus est juste : quand
           la cible n'a que 2 options, l'attaquant n'a rien à désigner, on lui
           épargne un clic sans choix. Mais il enchaînait sur DEFENDER_PICK SANS
           REGARDER QUI EST LE DÉFENSEUR. Face à une IA, l'attaquant humain se
           retrouvait donc devant le panneau de sa VICTIME — il choisissait le
           bloc qu'elle perd, et pouvait même dépenser SON Adrénaline à sa
           place. L'arbitrage que la victime est censée faire (« ces deux blocs
           me coûtent plus cher qu'un jeton ») passait à l'attaquant, qui a
           exactement l'intérêt inverse.

           Le stade défenseur n'est donc atteint que si un HUMAIN doit y
           répondre. Quand la cible est une IA, on reste au stade attaquant avec
           les deux options déjà cochées : il valide, et c'est l'IA qui décide
           ensuite ce qu'elle lâche ou si elle paie (cf.
           `dilValidateAttackerPick` et `defenseurPaieAdrenaline`). */
        const defenseurHumain = !d.defenderIsAi;
        return {
          ...d,
          id: Math.random().toString(36).slice(2, 9),
          stage: preset && defenseurHumain ? "DEFENDER_PICK" : "ATTACKER_PICK",
          attackerChoices: preset || [],
          autoAttackerPick: Boolean(preset) && !d.presetAttackerChoices,
        };
      }),
    ]);
    return jouables;
  }, [autoResolveIaDecisions]);

  /* ── FILE DES REPLIS ──
     Le pendant de `enqueueDecisions` pour les éléments arrêtés faute de
     puissance : chaque résolveur de carte appelle les deux à la suite.
     Déclaré ICI et pas plus bas, à côté du reste de la mécanique de repli :
     les `useCallback` qui l'appellent le citent dans leur tableau de
     dépendances, lequel est évalué AU RENDU — une déclaration plus bas
     donnait une ReferenceError de zone morte temporelle. */
  const enqueueReplis = useCallback((liste) => {
    if (!liste || liste.length === 0) return;
    const modes = aiTitanModesRef.current;
    const profils = aiTitanProfilesRef.current;
    const aTrancher = [];

    /* ── UN MÊME ÉLÉMENT NE SE PLACE QU'UNE FOIS ──
       Bug remonté par Nikola sur la Manche 3 de la graine 3144532881 :
       « j'étais en F3, j'ai fait Graouhhh, j'aurais dû déplacer 1 Titan puis
       1 autre — j'ai dû déplacer 2 fois le même. »

       Le journal de ce rapport le montre noir sur blanc, deux lignes de
       suite :
         « Titan 4 arrêté faute de puissance → posé en I4 au lieu de H3 »
         « Titan 4 arrêté faute de puissance → posé en H2 au lieu de H3 »
       Même Titan, même case de repli par défaut : ce sont DEUX demandes pour
       UN SEUL arrêt. Elles naissent quand un Titan est touché directement
       PUIS repercuté par la chaîne au même endroit — `projectInDirection`
       dépose alors un repli à chacun des deux passages, sans savoir que
       l'autre existe.

       Le joueur se retrouvait à placer deux fois le même Titan, et le second
       choix écrasait le premier : le premier n'avait donc servi à rien.

       On dédoublonne sur (Titan, case par défaut) : deux demandes qui
       désignent le même élément arrêté au même endroit sont le même
       événement physique, et une seule décision doit être posée au joueur.
       Deux poussées RÉELLEMENT distinctes ont des cases d'arrêt
       différentes — elles passent toutes les deux, comme avant. */
    const dejaVu = new Set();

    for (const r of liste) {
      if (r.cases.length <= 1) continue;
      /* DEUX CLÉS, ET LA SECONDE VIENT DU 2026-08-28. La première dit « même
         élément, même case d'arrêt ». Elle laissait passer le cas que Nikola a
         décrit — « quand on m'a demandé la 2e case, c'étaient les mêmes que la
         première » : deux arrêts à des cases DIFFÉRENTES dont les voisines
         libres coïncident.

         Du point de vue du joueur, deux demandes qui offrent exactement les
         mêmes destinations pour le même élément sont indiscernables, et
         répondre à la seconde ne peut qu'écraser la première. On dédoublonne
         donc aussi sur l'ensemble des cases offertes. */
      const signature = `${r.titanId ?? "debris"}@${r.defaut}`;
      const signatureCases = `${r.titanId ?? "debris"}#${[...r.cases].sort().join(",")}`;
      if (dejaVu.has(signature) || dejaVu.has(signatureCases)) continue;
      dejaVu.add(signature);
      dejaVu.add(signatureCases);
      if (modes[r.initiatorId] !== "ia") { aTrancher.push(r); continue; }

      const etat = {
        board: aiStateRef.current.board,
        looseBlocks: aiLooseBlocksRef.current,
        titans: aiTitanStateRef.current.players,
      };
      const choix = choisirRepliIA(r, etat, profils[r.initiatorId]);
      if (choix && choix !== r.defaut) {
        // `appliquerRepli` remonte désormais son propre journal : depuis le
        // ruling du 2026-08-18, poser l'élément peut chasser un Titan et
        // rapporter une Bagarre. Sans ça, l'IA marquait un point que rien
        // n'expliquait dans le journal d'actions.
        const journal = appliquerRepli(r, choix, etat) || [];
        setActionLog((prev) => [
          ...prev,
          `🤖 Titan ${r.initiatorId} (IA) pose l'élément arrêté en ${choix} plutôt qu'en ${r.defaut}.`,
          ...journal,
        ]);
      }
    }

    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    if (aTrancher.length > 0) setRepliQueue((prev) => [...prev, ...aTrancher]);
    // Rendu à l'appelant : Graouhhh doit savoir s'il peut enchaîner sur le
    // Titan suivant ou s'il doit attendre un clic (cf. `advanceGraouhhhLoop`).
    return aTrancher;
  }, []);

  /* ── GRAOUHHH : DIL PUIS DÉPLACEMENT, TITAN PAR TITAN ──
     Ruling Nikola (test à la table, 2026-08-18) : « on fait dans l'ordre
     DIL/RAGE puis déplacement, et Titan suivant si il y en a un autre —
     impossible de passer au Titan suivant tant que ce n'est pas résolu. »

     `advanceGraouhhh` (domaine) traite les Titans touchés un par un, du
     plus loin au plus proche : pour chacun, soit il n'y a pas de DIL
     possible et il est déplacé tout de suite, soit une décision DIL est
     rendue et il faut attendre qu'elle soit tranchée avant de continuer.

     Boucle ici plutôt que dans le domaine : un défenseur IA se résout
     instantanément (cf. autoResolveIaDecisions dans enqueueDecisions), donc
     plusieurs Titans peuvent s'enchaîner d'un coup sans jamais passer par la
     file — seul un vrai défenseur humain interrompt la boucle. */
  /* Lit les MIROIRS (`aiStateRef` & co.) et non la closure, pour deux
     raisons. D'abord la robustesse : la boucle IA appelle cette fonction
     depuis un timer de 2 s, avec une closure capturée bien avant. Ensuite
     la stabilité : sans `state`/`titanState`/`looseBlocks` en dépendances,
     ce callback ne change plus d'identité à chaque rendu, et l'effet IA
     peut le capturer une fois pour toutes sans risque de version périmée.
     Pour le joueur humain, rien ne change : `jouerGraouhhh` appelle la
     boucle dans le même tick, quand les miroirs sont exacts. */
  /* ── REFUS DE FATIGUE ──────────────────────────────────────
     Ruling du 2026-08-28 : « l'Adrénaline permet de refuser une Fatigue ».

     La Fatigue est déjà appliquée quand cette file se remplit — c'est
     volontaire, cf. `resolveFatigue` : la carte étant tirée au sort, refuser
     sans savoir laquelle est partie ne serait pas un choix. La cible voit donc
     ce qu'elle vient de perdre, puis décide.

     Une IA tranche seule, au barème : elle paie si la carte vaut plus cher que
     la valeur marginale de sa réserve. Un humain reçoit le bandeau.
     Contrairement au Dilemme, aucun tour ne se joue là-dessus — une Fatigue
     non refusée est simplement une Fatigue, donc le refus n'a pas besoin d'un
     stade « attaquant ». */
  const [fatigueEnAttente, setFatigueEnAttente] = useState(null);

  const enqueueFatigues = useCallback((liste) => {
    if (!liste || liste.length === 0) return;
    const joueurs = aiTitanStateRef.current.players;
    const modes = aiTitanModesRef.current;
    const aTrancher = [];

    for (const f of liste) {
      if (modes[f.targetId] !== "ia") { aTrancher.push(f); continue; }
      /* L'IA paie quand la carte lui coûte plus que le jeton. La Force d'une
         carte est le seul étalon dont on dispose côté cartes — le décompte
         final ne les compte pas — et elle dit assez bien ce qu'on perd : une
         Faut Pas Me Chauffer à 3 pèse plus qu'un Tout Casser à 1. */
      const cible = joueurs.find((t) => t.id === f.targetId);
      const marginale = valeurMarginaleAdrenaline(Math.max(0, (cible?.adrenaline || 0) - 1));
      const valeurCarte = CARD_FORCE[f.cardId] || 0;
      if (valeurCarte > marginale) {
        const res = refuserFatigue(f.attackerId, f.targetId, f.cardId, joueurs);
        if (res.ok) setActionLog((prev) => [...prev, `${res.log} (décision automatique)`]);
      }
    }

    if (aTrancher.length > 0) setFatigueEnAttente(aTrancher[0]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, []);

  const refuserFatigueEnCours = useCallback(() => {
    const f = fatigueEnAttente;
    if (!f) return;
    captureSnapshot();
    const res = refuserFatigue(f.attackerId, f.targetId, f.cardId, aiTitanStateRef.current.players);
    setActionLog((prev) => [...prev, res.ok ? res.log : `⚠️ ${res.reason}`]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setFatigueEnAttente(null);
  }, [fatigueEnAttente, captureSnapshot]);

  const accepterFatigueEnCours = useCallback(() => setFatigueEnAttente(null), []);

  const advanceGraouhhhLoop = useCallback((continuation) => {
    /* `trajectoires` MANQUAIT ICI — Nikola, 2026-08-28 : « quand il y a un
       Graouhhh, une charge, en gros une interaction qui fait bouger un Titan,
       fais comme pour les débris de Tout Casser, avec les petites cases jaunes
       qui montrent le chemin ».

       Le mécanisme existait déjà et marchait pour les quatre autres cartes :
       `projectInDirection` dépose chaque trajet dans ce tableau, et l'appelant
       le passe à `animerTrajectoires`. Graouhhh construisait son état SANS le
       champ — les trajets étaient donc jetés en silence, et la carte qui
       déplace le plus de Titans à la fois était la seule à ne rien montrer. */
    const gameState = {
      board: aiStateRef.current.board,
      titans: aiTitanStateRef.current.players,
      looseBlocks: aiLooseBlocksRef.current,
      replis: [],
      trajectoires: [],
    };
    let cont = continuation;
    for (;;) {
      const result = advanceGraouhhh(gameState, cont);
      if (result.log.length > 0) setActionLog((prev) => [...prev, ...result.log]);
      if (result.fatigues?.length) enqueueFatigues(result.fatigues);
      if (result.done) break;

      /* PAUSE SUR REPLI (2026-08-28). Le résolveur s'arrête dès qu'un Titan
         doit être replié : tant que l'initiateur n'a pas dit où le poser, la
         case qu'il occupe encore fausse le calcul du Titan suivant. On vide
         donc les replis MAINTENANT, en leur attachant la continuation, et on
         rend la main si un humain doit trancher — `choisirRepli` relancera la
         boucle. Une IA tranche dans `enqueueReplis` sans rien rendre : la
         boucle reprend alors immédiatement, sur un plateau à jour. */
      if (result.repliEnAttente) {
        const enAttente = gameState.replis.splice(0, gameState.replis.length);
        const aTrancher = enqueueReplis(enAttente.map((r) => ({ ...r, graouhhh: result.continuation })));
        if (aTrancher && aTrancher.length > 0) return;
        cont = result.continuation;
        continue;
      }

      const humanDecisions = enqueueDecisions([{ ...result.decision, graouhhh: result.continuation }]);
      if (humanDecisions && humanDecisions.length > 0) break;
      cont = result.continuation;
    }
    enqueueReplis(gameState.replis);
    animerTrajectoires(gameState.trajectoires);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [enqueueDecisions, enqueueReplis, animerTrajectoires, enqueueFatigues]);




  const dilAttackerPick = useCallback((color) => {
    setDecisionQueue((prev) => {
      const [cur, ...rest] = prev;
      if (!cur) return prev;
      const already = cur.attackerChoices.includes(color);
      let choices;
      if (already) choices = cur.attackerChoices.filter((c) => c !== color);
      else if (cur.attackerChoices.length < 2) choices = [...cur.attackerChoices, color];
      else choices = cur.attackerChoices;
      return [{ ...cur, attackerChoices: choices }, ...rest];
    });
  }, []);

  const dilValidateAttackerPick = useCallback(() => {
    // La mutation du Repaire se faisait AUTREFOIS à l'intérieur de l'updater
    // passé à setDecisionQueue. C'est exactement le motif éliminé partout
    // ailleurs dans ce fichier : React ne garantit pas qu'un updater n'est
    // appelé qu'une fois, et le défenseur pouvait perdre deux blocs au lieu
    // d'un (aujourd'hui invisible faute de StrictMode, donc une bombe à
    // retardement pour le jour où quelqu'un l'active pour déboguer).
    // Réécrit en séquence synchrone : on lit, on décide, on mute, on dépile.
    const cur = decisionQueue[0];
    if (!cur || cur.attackerChoices.length !== 2) return;

    if (!cur.defenderIsAi) {
      setDecisionQueue((prev) => (prev[0] === cur ? [{ ...cur, stage: "DEFENDER_PICK" }, ...prev.slice(1)] : prev));
      return;
    }

    // À partir d'ici la décision se résout pour de bon : le Repaire de la
    // cible va bouger. On fige l'état avant, pour que « Annuler » défasse la
    // perte du bloc et repose la décision telle qu'elle était.
    captureSnapshot();
    // Défenseur IA : il n'a jamais son mot à dire par l'interface, la
    // décision resterait en attente d'un clic qui ne viendrait pas. Même
    // heuristique que l'auto-résolution IA↔IA — il perd la couleur dont la
    // valeur marginale lui coûte le moins.
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    if (defender) {
      const defValued = cur.attackerChoices.map((color) => ({
        color,
        // `coutOptionDil` sait traiter l'option Socle, dont le coût est
        // l'espérance de valeur (le tirage étant au sort).
        defVal: coutOptionDil(color, defender, titanState.players),
      }));
      const defChoice = defValued.reduce((best, curr) => (curr.defVal < best.defVal ? curr : best));
      const attacker = titanState.players.find((t) => t.id === cur.attackerId);

      /* PAYER OU ENCAISSER — demande de Nikola du 2026-08-17 : « c'est l'IA
         qui décide si elle dépense une Adrénaline si je lui fais un DIL ».
         Elle n'avait pas le choix : elle perdait toujours un bloc, alors que
         le livret laisse au défenseur la possibilité d'annuler en donnant
         1 Adrénaline à l'attaquant.

         L'arbitrage se fait au vrai barème, sans table de poids, et il vit
         désormais dans `defenseurPaieAdrenaline` — partagé avec la
         résolution IA contre IA, qui ne l'avait pas. Il chiffrait « 3 points,
         6 en différentiel » en dur, deux nombres qui ne correspondaient déjà
         plus au forfait de 2 et qui n'ont plus de sens du tout depuis que le
         barème est progressif : c'est la valeur MARGINALE de la réserve du
         défenseur qui décide. Elle paie quand le bloc menacé lui coûte
         davantage — typiquement un Socle de valeur, ou une couleur qui casse
         une paire d'Orange. */
      const voitAdversaires = FORCE_SETTINGS[aiTitanProfilesRef.current[cur.defenderId]?.force]?.voitAdversaires;
      if (defenseurPaieAdrenaline(defender, defChoice.defVal, voitAdversaires)) {
        defender.adrenaline -= 1;
        if (attacker) attacker.adrenaline = (attacker.adrenaline || 0) + 1;
        setActionLog((prevLog) => [...prevLog, `DIL (${cur.cardLabel}) : Titan ${cur.defenderId} (IA) préfère donner 1 Adrénaline à Titan ${cur.attackerId} plutôt que de perdre ${defChoice.color} (${defChoice.defVal} pts en jeu).`]);
        setTitanState((p) => ({ ...p, players: [...p.players] }));
        setDecisionQueue((prev) => prev.slice(1));
        // Graouhhh : ce Titan est tranché, on enchaîne sur le suivant de
        // l'axe (cf. advanceGraouhhhLoop) plutôt que d'attendre un clic qui
        // ne viendra jamais côté défenseur IA.
        if (cur.graouhhh) advanceGraouhhhLoop(cur.graouhhh);
        return;
      }

      const suffixe = acheminerBlocPerdu(cur, defender, attacker, defChoice.color);
      const quoi = defChoice.color === SOCLE_OPTION ? "1 Socle" : `1 bloc ${defChoice.color}`;
      setActionLog((prevLog) => [...prevLog, `DIL (${cur.cardLabel}) : Titan ${cur.defenderId} (IA) perd ${quoi} (décision automatique)${suffixe}`]);
      setTitanState((p) => ({ ...p, players: [...p.players] }));
    }
    setDecisionQueue((prev) => prev.slice(1));
    if (cur.graouhhh) advanceGraouhhhLoop(cur.graouhhh);
  }, [decisionQueue, titanState.players, acheminerBlocPerdu, captureSnapshot, advanceGraouhhhLoop]);

  const resolveDilDefenderPick = useCallback(
    (color) => {
      const cur = decisionQueue[0];
      if (!cur) return;
      captureSnapshot();
      const defender = titanState.players.find((t) => t.id === cur.defenderId);
      const attacker = titanState.players.find((t) => t.id === cur.attackerId);
      const suffixe = acheminerBlocPerdu(cur, defender, attacker, color);
      const quoi = color === SOCLE_OPTION ? "1 Socle" : `1 bloc ${color}`;
      setActionLog((prevLog) => [...prevLog, `DIL (${cur.cardLabel}) : Titan ${cur.defenderId} perd ${quoi}${suffixe}`]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      setDecisionQueue((prev) => prev.slice(1));
      if (cur.graouhhh) advanceGraouhhhLoop(cur.graouhhh);
    },
    [decisionQueue, titanState.players, acheminerBlocPerdu, captureSnapshot, advanceGraouhhhLoop]
  );

  const resolveDilCancelWithAdrenaline = useCallback(() => {
    const cur = decisionQueue[0];
    if (!cur) return;
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    const attaquant = titanState.players.find((t) => t.id === cur.attackerId);
    if ((defender.adrenaline || 0) < 1) { return; }
    captureSnapshot();
    defender.adrenaline -= 1;
    // Livret : « le défenseur peut DONNER 1 adrénaline À L'ATTAQUANT pour
    // annuler le DIL ». Elle était retirée au défenseur sans jamais arriver
    // chez l'attaquant — elle disparaissait du jeu, comme les blocs de DIL
    // et de RAGE corrigés plus haut.
    if (attaquant) attaquant.adrenaline = (attaquant.adrenaline || 0) + 1;
    setActionLog((prevLog) => [...prevLog, `DIL annulé par Titan ${cur.defenderId} : 1 Adrénaline donnée à Titan ${cur.attackerId}.`]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    if (cur.graouhhh) advanceGraouhhhLoop(cur.graouhhh);
    setDecisionQueue((prev) => prev.slice(1));
  }, [decisionQueue, titanState.players, captureSnapshot, advanceGraouhhhLoop]);

  const resolveRagePick = useCallback(
    (color) => {
      const cur = decisionQueue[0];
      if (!cur) return;
      captureSnapshot();
      const defender = titanState.players.find((t) => t.id === cur.defenderId);
      const attacker = titanState.players.find((t) => t.id === cur.attackerId);
      const suffixe = acheminerBlocPerdu(cur, defender, attacker, color);
      setActionLog((prevLog) => [...prevLog, `RAGE (${cur.cardLabel}) : Titan ${cur.attackerId} arrache ${color} à Titan ${cur.defenderId}${suffixe}`]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      setDecisionQueue((prev) => prev.slice(1));
    },
    [decisionQueue, titanState.players, acheminerBlocPerdu, captureSnapshot]
  );

  const resolveRagePickAdrenaline = useCallback(() => {
    const cur = decisionQueue[0];
    if (!cur) return;
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    const attacker = titanState.players.find((t) => t.id === cur.attackerId);
    if ((defender.adrenaline || 0) < 1) return;
    captureSnapshot();
    defender.adrenaline -= 1;
    // FAQ #5 : l'Adrénaline est une ressource comme une autre. RAGE la
    // PREND, elle ne s'évapore pas — l'attaquant la gagne.
    if (attacker) attacker.adrenaline = (attacker.adrenaline || 0) + 1;
    setActionLog((prevLog) => [...prevLog, `RAGE (FAQ#5) : Titan ${cur.attackerId} prend 1 Adrénaline à Titan ${cur.defenderId}.`]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setDecisionQueue((prev) => prev.slice(1));
  }, [decisionQueue, titanState.players, captureSnapshot]);

  /* ── ON SÉLECTIONNE UN EXEMPLAIRE, PAS UN TITRE ──
     Bug remonté par Nikola le 2026-08-28 : « ce n'est pas parce que je clique
     sur Graouhhh que si j'ai une autre carte Graouhhh ça la prend aussi ».

     Depuis que le vol de Phase Repos transfère la carte au voleur, une main
     peut contenir deux fois le même titre. La sélection était une liste
     d'identifiants de CARTE : cliquer l'un des deux Graouhhh marquait donc
     les deux à l'écran (`progSelection.includes(cardId)` ne sait pas
     distinguer deux exemplaires), et n'en programmait qu'un. Programmer les
     deux exemplaires était impossible.

     Elle est désormais une liste de `{ idx, cardId }` — la POSITION en main
     identifie l'exemplaire, le `cardId` reste ce qu'on envoie au moteur.
     `programCards` compte déjà les exemplaires de son côté, donc un index
     périmé ne peut rien casser : il ne sert qu'à l'affichage. */
  const toggleProgCard = useCallback((idx, cardId) => {
    setProgSelection((prev) => {
      if (prev.some((s) => s.idx === idx)) {
        // Bug remonté : désélectionner UNE carte (y compris pendant le
        // countdown de 5s une fois les 3 choisies) effaçait TOUTE la
        // sélection au lieu de retirer seulement celle cliquée. On stoppe
        // le countdown éventuellement en cours (setProgCountdownTimer en
        // forme fonctionnelle pour éviter de lire une valeur périmée par
        // la fermeture de useCallback) et on ne retire que cette carte —
        // les autres restent sélectionnées, en attente d'une 3e carte.
        setProgCountdownTimer((timerId) => {
          if (timerId) {
            clearInterval(timerId);
            setProgCountdown(null);
          }
          return null;
        });
        return prev.filter((s) => s.idx !== idx); // désélection = annulation de cet exemplaire seul
      }
      if (prev.length >= 3) return prev;
      const next = [...prev, { idx, cardId }];
      if (next.length === 3) {
        // Démarre le compte à rebours avant validation. Le compteur interne
        // doit partir de la meme valeur que l'affichage initial : a 5 ici et
        // 3 a l'affichage, le premier tick remontait de 3 a 4.
        let countdown = 3;
        const timerId = setInterval(() => {
          countdown -= 1;
          setProgCountdown(countdown);
          if (countdown <= 0) {
            clearInterval(timerId);
            setProgCountdownTimer(null);
            setProgCountdown(null);
            setProgSelection((cur) => {
              if (cur.length === 3 && selectedTitanId) {
                // FIX (bug hunt) : lecture via la ref toujours à jour (jamais
                // `titanState.players` par closure, cf. le même bug côté IA
                // plus haut) — évite de muter un objet Titan périmé si
                // l'état a changé pendant le compte à rebours.
                const curPlayers = aiTitanStateRef.current.players;
                const ids = cur.map((s) => s.cardId);
                const res = programCards(selectedTitanId, ids, curPlayers);
                if (res.ok) {
                  setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
                  setPhaseValidated((prev) => ({ ...prev, [selectedTitanId]: true }));
                  setActionLog((p) => [...p, `✅ T${selectedTitanId} programme : ${ids.map((c) => CARD_LABEL[c]).join(", ")}`]);
                  setProgErreur(null);
                } else {
                  // Échec (ex. état déjà modifié entre-temps) : on informe le
                  // joueur au lieu de valider silencieusement une phase non
                  // réellement programmée — ce silence était la cause du gel
                  // de tour ("en attente des autres Titans").
                  setActionLog((p) => [...p, `⚠️ Programmation T${selectedTitanId} échouée : ${res.reason}`]);
                  setProgErreur(res.reason);
                }
              }
              return [];
            });
          }
        }, 1000);
        setProgCountdown(3);
        setProgCountdownTimer(timerId);
      }
      return next;
    });
  }, [selectedTitanId]);

  const confirmProgrammation = useCallback(() => {
    if (!selectedTitanId) return;
    const ids = progSelection.map((s) => s.cardId);
    const res = programCards(selectedTitanId, ids, titanState.players);
    if (!res.ok) {
      setActionLog((prev) => [...prev, `⚠️ ${res.reason}`]);
      return;
    }
    setActionLog((prev) => [...prev, `✅ T${selectedTitanId} programme : ${ids.map((c) => CARD_LABEL[c]).join(", ")}`]);
    setProgSelection([]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, progSelection, titanState.players]);

  const chooseVolDirection = useCallback(
    (direction) => {
      if (volDirection) return; // déjà résolu cette Manche
      captureSnapshot();
      setVolDirection(direction);
      /* ON REND AVANT DE PIQUER (Nikola, 2026-08-28). Une carte empruntée à
         la Manche précédente retourne à son propriétaire d'abord ; le pool
         de vol d'un Titan qui en a joué une ne compte donc plus que ses deux
         cartes à lui. Voler d'abord permettrait de piquer la carte d'un
         tiers, qui n'appartient pas à la victime. */
      const logRendus = rendreCartesEmpruntees(titanState.players);
      const result = resolveVolPhaseRepos(mancheNumber, direction, titanState.ordreJeu, titanState.players, modeVolRepos);
      setActionLog((prev) => [...prev, `Vol Phase Repos — sens ${direction === "gauche" ? "⬅️ antihoraire" : "➡️ horaire"} choisi par le Détonateur (Titan ${titanState.detonateur}).`, ...logRendus, ...result.log]);
      setVolResume(result.resume || []);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));

      /* ── ON LAISSE LE TEMPS DE LIRE QUI A VOLÉ QUOI À QUI ──
         Nikola, 2026-08-28 : « pour la phase automatique, quand on se prend une
         carte en repos, fais ça plus lentement, 10 secondes, qu'on voie qui vole
         quoi à qui, car on doit le savoir ».

         Le vol se résolvait et la Manche suivante s'enchaînait dans le même
         souffle : le récapitulatif s'affichait puis disparaîssait avant qu'on
         ait lu la première ligne. C'est pourtant le seul événement de la Manche
         qui touche directement la main de chacun, et il n'y a rien à y décider
         — donc rien qui justifie de le presser.

         La validation de phase est donc différée. Le délai est rangé avec les
         minuteurs de trace pour être annulé comme eux si la partie est relancée
         ou l'action annulée entre-temps. */
      traceTimersRef.current.push(setTimeout(() => {
        setPhaseValidated((prev) => {
          const updated = { ...prev };
          titanState.ordreJeu.forEach((id) => { updated[id] = true; });
          return updated;
        });
      }, DUREE_LECTURE_VOL_MS));
    },
    [volDirection, mancheNumber, titanState.ordreJeu, titanState.players, titanState.detonateur, captureSnapshot, modeVolRepos]
  );

  /* PHASE REPOS : LE SENS APPARTIENT AU DÉTONATEUR, PAS AU PORTEUR DE LA
     TABLETTE. Bug remonté par Nikola le 2026-08-17 : « si c'est une IA qui a
     le jeton Détonateur, ce n'est pas à moi de choisir le sens. » La bannière
     posait les deux boutons à l'écran quel que soit le propriétaire du jeton,
     et c'était donc systématiquement l'humain qui tranchait un choix qui ne
     lui revenait pas — un choix qui décide de qui vole qui pour toute la
     Manche.

     Une IA Détonateur tranche donc elle-même, ici, dès l'ouverture de la
     Phase. Le tirage est neutre (aucune des deux directions n'est
     structurellement meilleure : la chaîne est circulaire, chacun vole et se
     fait voler exactement une fois dans les deux sens), et il passe par le
     `pick` du domaine, donc par le même RNG que le reste de la partie. */
  useEffect(() => {
    if (distantInviteRef.current) return; // le sens du Vol est choisi chez l'hôte
    if (phase !== "repos" || volDirection || gameOver) return;
    // Même règle que ci-dessus : le Vol ne démarre pas par-dessus une
    // décision non tranchée, fût-ce une IA qui le déclenche.
    if (currentDecision || currentRepli || ecroulement) return;
    const detId = titanState.detonateur;
    if (titanModes[detId] !== "ia") return;
    const sens = pick(["gauche", "droite"]);
    setActionLog((prev) => [...prev, `🤖 Titan ${detId} (IA, Détonateur) choisit le sens de la chaîne.`]);
    chooseVolDirection(sens);
  }, [phase, volDirection, gameOver, titanState.detonateur, titanModes, chooseVolDirection,
      currentDecision, currentRepli, ecroulement]);

  const canPlayCard = useCallback(
    (cardId) => {
      if (phase !== "action" || !selectedTitan || selectedTitan.id !== activePlayerId) return false;
      if (!selectedTitan.programmed.includes(cardId)) return false;
      // Garde-fou (fix session) : hors effet d'Événement (non encore codé,
      // cf. stub EVENT_NAMES), un Titan ne peut jamais jouer 2 cartes
      // d'affilée dans le même round. advanceActionRound calcule déjà le
      // Titan suivant et passe waitingNextTitan à true dès qu'une carte est
      // jouée — mais rien n'empêchait jusqu'ici de cliquer une 2e carte du
      // même Titan tant que la confirmation "Titan suivant" n'était pas
      // cliquée (activePlayerId ne change qu'à ce moment-là). TODO : quand
      // "Toujours plus"/"Gourmandise" seront codés, ajouter l'exception ici.
      if (waitingNextTitan) return false;
      /* Point 1.6 du 2026-08-19 : « un Titan sorti du plateau peut continuer
         a jouer ses cartes hors-champ ». Il n'a plus ni Perimetre, ni axe, ni
         case d'ou charger : toutes ses cartes s'appliquaient dans le vide, et
         certaines le laissaient dans un etat dont il ne revenait pas.

         Il rentre normalement a l'ouverture de SON tour (ruling du
         2026-08-16), mais il peut aussi etre ejecte PENDANT son propre tour,
         par une reaction en chaine ou un repli offensif : c'est la que le
         trou s'ouvrait. La defausse, elle, reste possible — voir
         `canDiscardCard` juste apres, sans quoi la partie se bloquerait. */
      if (selectedTitan.horsPlateau) return false;
      /* UNE DÉCISION NON TRANCHÉE GÈLE AUSSI LES CARTES.
         Le clic sur le PLATEAU était déjà bloqué pendant un DIL/RAGE, un
         repli ou une répartition d'Amas (cf. `decisionEnAttente` dans
         BoardPanel) — mais rien n'empêchait de jouer une CARTE par-dessus.
         La carte se résolvait alors sur un plateau que la décision en cours
         allait encore modifier : le bloc perdu en DIL tombe sur la case
         d'impact d'AVANT, l'Amas se répartit après coup. Deux actions se
         marchaient dessus, et l'ordre du résultat dépendait de la vitesse
         de clic. Même garde-fou, mêmes sources que le plateau. */
      if (currentDecision || currentRepli || ecroulement) return false;
      if (fpmcAttackerId && (fpmcPendingIds.length > 0 || fpmcCurrent)) return false;
      return true;
    },
    [phase, selectedTitan, activePlayerId, waitingNextTitan,
     currentDecision, currentRepli, ecroulement, fpmcAttackerId, fpmcPendingIds, fpmcCurrent]
  );

  /* Defausser reste TOUJOURS possible quand jouer ne l'est pas pour cause de
     hors-plateau. Sans cette porte, un Titan ejecte pendant son tour ne
     pourrait ni jouer ni defausser : le round n'avancerait plus et la partie
     serait definitivement bloquee — exactement le genre de panneau sans issue
     rencontre trois fois le 18 aout. Toutes les autres conditions de
     `canPlayCard` restent valables. */
  const canDiscardCard = useCallback(
    (cardId) => {
      if (phase !== "action" || !selectedTitan || selectedTitan.id !== activePlayerId) return false;
      if (!selectedTitan.programmed.includes(cardId)) return false;
      if (waitingNextTitan) return false;
      if (cornerChoice) return false;
      if (currentDecision || currentRepli || ecroulement) return false;
      if (fpmcAttackerId && (fpmcPendingIds.length > 0 || fpmcCurrent)) return false;
      return true;
    },
    [phase, selectedTitan, activePlayerId, waitingNextTitan, cornerChoice,
     currentDecision, currentRepli, ecroulement, fpmcAttackerId, fpmcPendingIds, fpmcCurrent]
  );

  const getPlayBlockReason = useCallback(
    (cardId) => {
      if (!selectedTitan) return "";
      if (phase !== "action") return `Phase : ${PHASE_LABELS[phase]}`;
      if (selectedTitan.id !== activePlayerId) return `Pas le tour de T${selectedTitan.id}`;
      if (!selectedTitan.programmed.includes(cardId)) return `${CARD_LABEL[cardId]} non programmée.`;
      if (waitingNextTitan) return `Confirme "Titan suivant" avant de continuer.`;
      if (cornerChoice) return `Choisis d'abord par où T${selectedTitan.id} rentre sur BIG CITY.`;
      if (selectedTitan.horsPlateau) return `T${selectedTitan.id} est hors de BIG CITY : il ne peut que défausser. Il rentrera à l'ouverture de son prochain tour.`;
      // Dire CE QU'ON ATTEND, pas seulement que c'est bloqué : sans ça la
      // carte devient grise sans raison visible au milieu d'une partie.
      if (currentDecision) return `Tranche d'abord le ${currentDecision.type} en attente.`;
      if (currentRepli) return `Termine d'abord le repli en attente.`;
      if (ecroulement) return `Termine d'abord la répartition de l'Amas.`;
      if (fpmcAttackerId && (fpmcPendingIds.length > 0 || fpmcCurrent)) return `Termine d'abord Faut Pas Me Chauffer.`;
      return "";
    },
    [phase, selectedTitan, activePlayerId, waitingNextTitan, cornerChoice,
     currentDecision, currentRepli, ecroulement, fpmcAttackerId, fpmcPendingIds, fpmcCurrent]
  );

  // Logique d'avancement de round (Phase Action) — commune à "jouer une
  // carte avec effet" (markCardPlayed) et "défausser sans jouer"
  // (discardCurrentCard, session) : dans les deux cas, 1 carte a été
  // désignée pour ce round et le tour doit passer au Titan suivant selon
  // les mêmes règles (1 carte/Titan/round, 3 rounds/Manche).
  /* Fermeture de la Phase Action, en un seul exemplaire.
     Elle était écrite en ligne dans `advanceActionRound`, au moment même où
     la 3e carte du dernier Titan était jouée — donc AVANT que ce Titan ait
     eu son tour complet. Elle est extraite ici pour pouvoir être déclenchée
     au VRAI bout du tour : tout de suite pour une IA, à « Titan suivant »
     pour un humain (cf. `passerAuTitanSuivant`). */
  const cloturerPhaseAction = useCallback(() => {
    const { ordreJeu } = aiTitanStateRef.current;
    aiNextPlayerRef.current = null; // évite une relecture stale par finishAiTurn
    setWaitingNextTitan(false);
    setActivePlayerId(null);
    setPhaseValidated((prev) => {
      const updated = { ...prev };
      ordreJeu.forEach((id) => { updated[id] = true; });
      return updated;
    });
  }, []);

  const advanceActionRound = useCallback((titanId) => {
    const { ordreJeu } = aiTitanStateRef.current;
    const prevCount = cardsPlayedCountRef.current;
    const newCount = { ...prevCount, [titanId]: (prevCount[titanId] || 0) + 1 };
    cardsPlayedCountRef.current = newCount;
    const roundsDone = newCount[titanId]; // tous les Titans jouent en sync, ce compteur = round actuel

    // Cherche le prochain Titan dans l'ordre circulaire qui n'a pas encore joué ce round
    const curIdx = ordreJeu.indexOf(titanId);
    let next = null;
    for (let i = 1; i <= ordreJeu.length; i++) {
      const candidate = ordreJeu[(curIdx + i) % ordreJeu.length];
      if ((newCount[candidate] || 0) < roundsDone) { next = candidate; break; }
    }

    if (next === null) {
      // Tous ont joué ce round
      if (roundsDone < 3) {
        // Même correction qu'à l'ouverture de la Phase Action : chaque
        // nouveau round repart du Détonateur en cours, et non du premier
        // de l'ordre de jeu figé.
        next = aiTitanStateRef.current.detonateur ?? ordreJeu[0];
      } else {
        /* 3 rounds terminés → fin de Phase Action.

           BUG REMONTÉ PLUSIEURS FOIS PAR NIKOLA : « j'ai sauté sur un débris,
           je l'ai ramassé automatiquement, mais je n'ai pas pu ramasser celui
           d'à côté — c'est passé directement au Titan suivant. »

           La phase se fermait ICI, dans la seconde où la dernière carte du 3e
           round était jouée : `activePlayerId` tombait à null et la
           Programmation de la Manche suivante s'ouvrait par-dessus. Le Titan
           qui venait de jouer perdait donc son passif Récupération — le seul
           des quatre à le perdre, et un Titan différent à chaque Manche
           puisque le round démarre sur le Détonateur, qui pivote. D'où un bug
           qui semblait aléatoire alors qu'il tombait à tous les coups.

           Une IA n'a pas de tour à finir à l'écran : elle se ferme tout de
           suite. Un humain garde la main jusqu'à « Titan suivant », qui
           appellera `cloturerPhaseAction` à sa place. */
        aiNextPlayerRef.current = null;
        if (aiTitanModesRef.current[titanId] === "ia") {
          cloturerPhaseAction();
          return;
        }
        // Humain : on retombe dans le flux normal ci-dessous, `next` restant
        // null — le tour s'affiche, Ramassage compris, et se termine au clic.
      }
    }

    aiNextPlayerRef.current = next;
    setWaitingNextTitan(true);
    // Bug remonté : le passif "Mouvement gratuit" n'était réinitialisé
    // nulle part après un round — une fois utilisé, il restait bloqué
    // pour le reste de la Manche entière au lieu d'être de nouveau
    // disponible à CHAQUE tour (livret : "ces deux règles s'appliquent à
    // chaque tour"). Le passif "Récupération" était déjà correctement
    // remis à false ici ; on aligne "move" sur le même cycle.
    setPassifUsed((prev) => ({ ...prev, [titanId]: { ...(prev[titanId] || {}), recup: false, move: false } }));
  }, [cloturerPhaseAction]);

  /* Fin du tour d'un Titan humain, en un seul exemplaire lui aussi. Le bouton
     « Titan suivant » existe à deux endroits du panneau (fin de tour, et à
     côté du Ramassage) et faisait à chaque fois son `setActivePlayerId` en
     ligne — sans jamais savoir refermer la Phase Action quand il n'y a plus
     de Titan suivant. */
  const passerAuTitanSuivant = useCallback(() => {
    if (aiNextPlayerRef.current == null) { cloturerPhaseAction(); return; }
    setWaitingNextTitan(false);
    setActivePlayerId(aiNextPlayerRef.current);
  }, [cloturerPhaseAction]);

  const markCardPlayed = useCallback(
    (titanId, cardId) => {
      /* Retour de Nikola (test à la table, 2026-08-18) : « il me restait
         une carte à jouer, mais la phase a quand même avancé au round
         suivant. » `advanceActionRound` incrémentait le compteur de rounds
         SANS JAMAIS vérifier que la carte était réellement encore
         programmée — un second appel accidentel avec le même `cardId`
         (déjà retiré de `programmed` par le premier) avançait donc quand
         même le compteur, désynchronisant « combien de cartes ce Titan a
         réellement jouées » de « combien de fois cette fonction a été
         appelée pour lui ». Le round ne doit avancer QUE si cet appel a
         réellement déplacé une carte. */
      /* On lit le MIROIR (`aiTitanStateRef`, tenu à jour après chaque rendu)
         et non la closure : la boucle IA enchaîne ses étapes sur des timers
         de 2 s et rappelle donc un `markCardPlayed` capturé six secondes
         plus tôt. Sur la closure, un `programmed` périmé aurait pu faire
         sauter l'avancement du round et bloquer le tour de l'IA. */
      const source = aiTitanStateRef.current?.players || titanState.players;
      const titanAvant = source.find((t) => t.id === titanId);
      const carteReellementProgrammee = Boolean(titanAvant?.programmed.includes(cardId));

      // 1. Déplacer la carte programmed → playedThisManche
      setTitanState((prev) => {
        const updatedPlayers = prev.players.map((t) => {
          if (t.id !== titanId) return t;
          const clone = { ...t, programmed: [...t.programmed], playedThisManche: [...t.playedThisManche] };
          const idx = clone.programmed.indexOf(cardId);
          if (idx !== -1) { clone.programmed.splice(idx, 1); clone.playedThisManche.push(cardId); }
          return clone;
        });
        return { ...prev, players: updatedPlayers };
      });

      /* 2. Avancer le tour dans le round (1 carte par Titan, 3 rounds),
         seulement si une carte a réellement été consommée cette fois-ci.

         ⚠️ CET APPEL DOIT RESTER SYNCHRONE. `advanceActionRound` écrit
         `aiNextPlayerRef.current`, et `finishAiTurn` la lit DÈS LE RETOUR de
         `markCardPlayed` pour donner la main au Titan suivant. L'avoir différé
         dans un effet, le 2026-08-19, faisait lire une ref encore vide : l'IA
         ne passait jamais au Titan suivant et la partie figeait sur la toute
         première action. Le report de l'avancement se fait donc à l'intérieur
         d'`advanceActionRound`, qui sait attendre sans casser cette chaîne. */
      if (carteReellementProgrammee) advanceActionRound(titanId);
    },
    [advanceActionRound, titanState.players]
  );

  // Défausse volontaire face cachée (session) : le Titan désigne 1 de ses
  // 3 cartes programmées et choisit de ne pas la jouer. Aucun effet, rien
  // révélé aux adversaires, mais le round avance exactement comme si la
  // carte avait été jouée — voir discardCardHidden pour le détail des
  // rulings (pool distinct de playedThisManche, éligible au Vol Repos).
  const discardCurrentCard = useCallback(
    (titanId, cardId) => {
      // Une défausse consomme la carte du round et fait tourner le tour :
      // c'est une action de jeu comme une autre, donc annulable.
      captureSnapshot();
      // Même garde-fou que markCardPlayed : le round n'avance que si la
      // carte visée est RÉELLEMENT encore programmée à cet instant. `logMsg`
      // était renseigné DANS le updater de setTitanState, donc encore vide
      // juste après l'appel (le updater ne s'exécute pas synchronement) —
      // le vérifier ici, avant tout `setState`, sur l'état déjà connu.
      const source = aiTitanStateRef.current?.players || titanState.players;
      const titanAvant = source.find((t) => t.id === titanId);
      const carteReellementProgrammee = Boolean(titanAvant?.programmed.includes(cardId));
      let logMsg = "";
      setTitanState((prev) => {
        const updatedPlayers = prev.players.map((t) => {
          if (t.id !== titanId) return t;
          const clone = { ...t, programmed: [...t.programmed], discardedHidden: [...(t.discardedHidden || [])] };
          const res = discardCardHidden(titanId, cardId, [clone]);
          if (res.ok) logMsg = res.log;
          return clone;
        });
        return { ...prev, players: updatedPlayers };
      });
      if (carteReellementProgrammee) {
        setActionLog((prevLog) => [...prevLog, logMsg || `Titan ${titanId} défausse une carte face cachée.`]);
        advanceActionRound(titanId);
      }
    },
    [advanceActionRound, captureSnapshot, titanState.players]
  );

  // ── TEA : calcul des cibles disponibles ──────────────────────────────────
  // Pour chaque direction (8), on avance case par case jusqu'au premier
  // obstacle valide dans la portée (3 + éventuellement +1 Adrénaline).
  // Obstacle valide = bâtiment avec blocs, bloc libre, socle libre au sol
  // (bâtiment vide sans bloc libre = couloir, on traverse), Titan adverse.
  // Bornée au stock réel, comme Boing Boing et le Mouvement gratuit : sans
  // cela le plateau surligne des cibles de charge que la résolution refuse.
  const teaMaxRange = PORTEE_TETE_EN_AVANT + Math.min(teaAdrenaline, selectedTitan?.adrenaline || 0);
  const teaTargets = useMemo(() => (selectedTitan && teaMode
    ? (() => {
        const targets = new Map(); // key → { dr, dc }
        const oR = rowIndex(selectedTitan.cell[0]);
        const oC = Number(selectedTitan.cell.slice(1));
        /* `indexerTitans` et pas une boucle à la main : elle EXCLUT les
           Titans hors de BIG CITY, dont la `cell` ne dit plus où ils sont
           mais par où ils rentreront. La boucle qui vivait ici les comptait
           comme des obstacles, si bien que l'écran refusait une charge que
           `resolveTeteEnAvant` — qui passe, lui, par `indexerTitans` —
           aurait acceptée. Un Titan fantôme bloquait une case vide. */
        const titansByCell2 = indexerTitans(titanState.players);
        const DIRS = [
          { dr: -1, dc: 0 }, { dr: -1, dc: 1 }, { dr: 0, dc: 1 }, { dr: 1, dc: 1 },
          { dr: 1, dc: 0 }, { dr: 1, dc: -1 }, { dr: 0, dc: -1 }, { dr: -1, dc: -1 },
        ];
        for (const { dr, dc } of DIRS) {
          // Bug trouvé au scan : seule une direction PORTANT UN OBSTACLE
          // devenait cliquable. Le domaine, lui, gère parfaitement la charge
          // à vide (resolveTeteEnAvant : « avance librement, aucun obstacle
          // rencontré ») et l'IA pouvait jouer ce coup — le joueur humain
          // non. Sur un plateau bien détruit, la carte devenait injouable
          // dans plusieurs directions sans que rien ne l'explique à l'écran.
          // On mémorise donc la dernière case libre atteinte, et on la
          // propose en cible si aucun obstacle ne s'est présenté.
          let derniereCaseLibre = null;
          let obstacleTrouve = false;
          for (let step = 1; step <= teaMaxRange; step++) {
            const nr = oR + dr * step;
            const nc = oC + dc * step;
            if (nr < 0 || nr > 8 || nc < 1 || nc > 9) break;
            const key = rowFromIndex(nr) + nc;
            const cellData = state.board[key];
            const stack = looseBlocks[key] || [];
            const hasBuilding = cellData && cellData.blocks.length > 0;
            const hasLooseBlock = stack.length > 0; // bloc libre OU socle libre
            const occupantId = titansByCell2[key];
            const isAdverseOccupant = occupantId && occupantId !== selectedTitan.id;
            if (hasBuilding || hasLooseBlock || isAdverseOccupant) {
              targets.set(key, { dr, dc });
              obstacleTrouve = true;
              break;
            }
            // case vide (bâtiment vide, route libre) → on continue
            derniereCaseLibre = key;
          }
          if (!obstacleTrouve && derniereCaseLibre) targets.set(derniereCaseLibre, { dr, dc });
        }
        return targets;
      })()
    : new Map()),
    // Mémoïsé pour la même raison que `bbReachable`, `recupPool` et
    // `jnpPool` : cette Map servait de dépendance à `jouerTeteEnAvant` tout
    // en étant reconstruite à chaque rendu, ce qui annulait la mémoïsation.
    [selectedTitan, teaMode, teaMaxRange, state.board, looseBlocks, titanState.players]
  );

  // Un seul mode de carte ouvert a la fois. Chacun affichait son bandeau
  // d'instructions, et rien n'empechait Tete en Avant, Boing Boing, Je Ne
  // Partage Pas et Graouhhh d'etre tous ouverts en meme temps : le joueur
  // se retrouvait avec quatre consignes contradictoires empilees.
  const closeAllCardModes = useCallback(() => {
    setTeaMode(false);
    setGraouMode(false);
    setBbMode(false); setBbPath([]); setBbSurvol([]);
    setJnpMode(false); setJnpSelected([]);
  }, []);

  const toggleGraouMode = useCallback(() => {
    setGraouMode((m) => { const next = !m; if (next) { setTeaMode(false); setBbMode(false); setBbPath([]); setBbSurvol([]); setJnpMode(false); setJnpSelected([]); } return next; });
  }, []);

  const toggleTeaMode = useCallback(() => {
    setTeaMode((m) => { const next = !m; if (next) { setGraouMode(false); setBbMode(false); setBbPath([]); setBbSurvol([]); setJnpMode(false); setJnpSelected([]); } return next; });
  }, []);

  const jouerTeteEnAvant = useCallback((targetKey) => {
    if (!selectedTitanId || !canPlayCard("tete_en_avant")) return;
    const dir = teaTargets.get(targetKey);
    if (!dir) return;
    captureSnapshot();
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    const actuallyUseAdrenaline = Math.min(teaAdrenaline, attacker.adrenaline || 0);
    const replis = [];
    const trajectoires = [];
    const result = resolveTeteEnAvant(selectedTitanId, dir.dr, dir.dc, actuallyUseAdrenaline, {
      board: state.board, titans: titanState.players, looseBlocks, replis, trajectoires,
    });
    if (actuallyUseAdrenaline) attacker.adrenaline -= actuallyUseAdrenaline;
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    enqueueReplis(replis);
    animerTrajectoires(trajectoires);
    markCardPlayed(selectedTitanId, "tete_en_avant");
    setTeaMode(false);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, teaTargets, teaAdrenaline, state.board, titanState.players, looseBlocks, enqueueDecisions, enqueueReplis, animerTrajectoires, canPlayCard, markCardPlayed, captureSnapshot]);

  // `compensateFatiguedRounds` vivait ici. Il rattrapait le compteur de
  // rounds quand la Fatigue volait une carte ENCORE PROGRAMMÉE, laissant sa
  // victime avec moins de 3 cartes à jouer dans la Manche en cours.
  //
  // Ce rattrapage n'a plus lieu d'être : ruling re-précisé par Nikola le
  // 2026-08-15, la Fatigue ne pioche QUE dans la main, jamais dans les
  // cartes de la Manche en cours (cf. getNonPlayedPool). La cause étant
  // supprimée, le pansement l'est aussi.

  const jouerGraouhhh = useCallback(() => {
    if (!selectedTitanId || !canPlayCard("graouhhh")) return;
    captureSnapshot();
    // Titan par Titan (cf. advanceGraouhhhLoop) : seul le scan de l'axe se
    // fait d'un bloc, aucun Titan n'est déplacé avant que sa propre décision
    // DIL soit tranchée.
    const scan = scanGraouhhhAxis(selectedTitanId, { board: state.board, titans: titanState.players }, direction.dr, direction.dc);
    setActionLog((prev) => [...prev, ...scan.log]);
    if (scan.touched.length === 0) {
      setActionLog((prev) => [...prev, "Aucun Titan touché sur cet axe."]);
    } else {
      advanceGraouhhhLoop({
        titanId: selectedTitanId, dr: direction.dr, dc: direction.dc,
        reculDistance: scan.reculDistance, mancheNumber,
        remaining: scan.touched.slice().reverse().map((t) => t.id),
        bagarreIds: [], touchedCount: scan.touched.length,
      });
    }
    markCardPlayed(selectedTitanId, "graouhhh");
    setGraouMode(false);
  }, [selectedTitanId, direction, state.board, titanState.players, advanceGraouhhhLoop, mancheNumber, canPlayCard, markCardPlayed, captureSnapshot]);

  /* PORTÉE AFFICHÉE = PORTÉE RÉELLE.
     Deux écarts corrigés ici, tous deux remontés par Nikola le 2026-08-17.

     1) L'interface dessinait un simple carré de Chebyshev autour du Titan,
        alors que le livret compte les éléments contigus pour 1 seule case.
        Le plateau proposait donc des cases hors de portée et en cachait
        d'autres, réellement atteignables derrière un mur. Le calcul passe
        sur `getBoingBoingReach`, la MÊME fonction que le résolveur : ce que
        le joueur voit ne peut plus diverger de ce que le moteur accepte.

     2) La portée ajoutait `bbAdrenaline` sans jamais la borner au stock
        réel du Titan. Un compteur laissé à 2 par un tour précédent gonflait
        le rayon affiché d'un Titan qui n'avait plus une seule Adrénaline —
        « j'ai beaucoup trop de cases en choix ». La résolution, elle,
        bornait déjà (`Math.min`) : l'affichage promettait un saut que le
        moteur refusait. Même borne des deux côtés désormais. */
  const bbAdrenalineDispo = Math.min(bbAdrenaline, selectedTitan?.adrenaline || 0);
  const bbMaxRange = PORTEE_BOING_BOING + bbAdrenalineDispo;
  /* Mémoïsés, comme `recupPool` et `jnpPool` plus bas. Ces collections
     étaient reconstruites à CHAQUE rendu — un `new Set` neuf à chaque fois,
     donc une identité neuve — et servent de dépendance à des `useCallback` :
     toute la mémoïsation en aval tombait, à chaque frappe, à chaque survol.
     Le calcul lui-même n'est pas gratuit : `getBoingBoingReach` parcourt le
     plateau. */
  const bbReach = useMemo(
    () => (selectedTitan
      ? getBoingBoingReach(selectedTitan.cell, bbMaxRange, {
          board: state.board, looseBlocks, titans: titanState.players,
        })
      : new Map()),
    [selectedTitan, bbMaxRange, state.board, looseBlocks, titanState.players]
  );
  const bbReachable = useMemo(() => new Set(bbReach.keys()), [bbReach]);

  const toggleBbMode = useCallback(() => {
    setBbMode((m) => { const next = !m; if (next) { setTeaMode(false); setGraouMode(false); setJnpMode(false); setJnpSelected([]); } return next; });
    setBbPath([]); setBbSurvol([]);
  }, []);

  /* ── CHEMIN DE BOING BOING, CASE PAR CASE ──
     Demande de Nikola (test à la table, 2026-08-18) : « je dois indiquer
     par plusieurs clics sur les différentes cases mon chemin, pour que ce
     soit clair pour tout le monde. » Le clic unique sur la destination
     laissait le moteur choisir SA trajectoire (la plus courte) sans jamais
     la montrer ; le joueur trace maintenant la sienne, case adjacente par
     case adjacente, avec la même règle de coût que le calcul automatique
     (`boingBoingStepCost`) — le moteur de résolution, lui, ne regarde
     toujours que la dernière case (`bbDest`), inchangé. */
  /* BUDGET DU SAUT (refonte du 2026-08-19).

     Chaque case OU L'ON SE POSE coute 1, quoi qu'elle porte. Les obstacles
     survoles en chemin sont gratuits : ils n'entrent pas dans `bbPath`, ils
     vivent dans `bbSurvol` et ne servent qu'a dessiner la trajectoire.

     Avant, un obstacle coutait 0 ET pouvait recevoir l'atterrissage : en
     cliquant de debris en debris on traversait le plateau sans entamer son
     budget. Nikola : « j'ai un bug qui m'a permis de sauter une 4e fois sur
     un debris ou socle ». */
  const bbBudgetUsed = bbPath.length;

  /* Ce qui est cliquable depuis la pointe du trajet, et par quel chemin.

     Dans chaque direction on remonte l'axe et on propose TOUTE case ou l'on
     peut se poser, en franchissant gratuitement ce qui est sur le passage :
     la case du debris juste devant, et aussi celle qui le suit. C'est la
     demande de Nikola du 2026-08-19 : « je peux sauter par-dessus un debris ou
     un socle comme un batiment, ou bien sauter dessus volontairement ». Le
     choix lui revient, le moteur ne tranche pas a sa place.

     Un batiment encore debout reste la seule case ou l'on ne se pose jamais :
     il est franchi, jamais vise.

     `bbNextRoutes` retient pour chaque proposition les cases SURVOLEES, afin
     que la trajectoire se voie a l'ecran sans compter dans le budget. */
  const bbNextRoutes = useMemo(() => {
    const routes = new Map();
    if (!selectedTitan || !bbMode) return routes;
    if (bbBudgetUsed >= bbMaxRange) return routes; // budget epuise
    const tipKey = bbPath.length > 0 ? bbPath[bbPath.length - 1] : selectedTitan.cell;
    const tr = rowIndex(tipKey[0]);
    const tc = Number(tipKey.slice(1));

    const estBatimentDebout = (key) => Boolean(state.board[key]?.blocks?.length > 0);
    const estObstacle = (key) =>
      estBatimentDebout(key)
      || (looseBlocks[key] || []).length > 0
      || titanState.players.some((t) => !t.horsPlateau && t.cell === key);

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        let nr = tr + dr;
        let nc = tc + dc;
        const survoles = [];
        while (nr >= 0 && nr <= 8 && nc >= 1 && nc <= 9) {
          const key = rowFromIndex(nr) + nc;
          if (!estBatimentDebout(key) && !routes.has(key)) {
            routes.set(key, survoles.slice());
          }
          // On ne poursuit au-dela que tant qu'on longe des obstacles.
          if (!estObstacle(key)) break;
          survoles.push(key);
          nr += dr;
          nc += dc;
        }
      }
    }
    return routes;
  }, [selectedTitan, bbMode, bbPath, bbBudgetUsed, bbMaxRange, state.board, looseBlocks, titanState.players]);

  const bbNextClickable = useMemo(() => new Set(bbNextRoutes.keys()), [bbNextRoutes]);

  const bbPathClick = useCallback((key) => {
    if (!selectedTitan) return;
    // Recliquer une case deja posee y revient : tout ce qui suit est annule.
    const idx = bbPath.indexOf(key);
    if (idx !== -1) {
      setBbPath(bbPath.slice(0, idx + 1));
      setBbSurvol((prev) => prev.slice(0, idx + 1));
      return;
    }
    const survoles = bbNextRoutes.get(key);
    if (!survoles) return; // hors de portee, batiment, ou budget epuise
    setBbPath((prev) => [...prev, key]);
    setBbSurvol((prev) => [...prev, survoles]);
  }, [selectedTitan, bbPath, bbNextRoutes]);

  const bbUndoLastCell = useCallback(() => {
    setBbPath((prev) => prev.slice(0, -1));
    setBbSurvol((prev) => prev.slice(0, -1));
  }, []);

  // Un bâtiment encore debout se traverse en vol (saute-mouton) mais ne se
  // reçoit jamais comme atterrissage — la pointe du chemin doit continuer.
  const bbDestIsBuilding = Boolean(bbDest && state.board[bbDest]?.blocks?.length > 0);

  const jouerBoingBoing = useCallback(() => {
    if (!selectedTitanId || !bbDest || bbDestIsBuilding || !canPlayCard("boing_boing")) return;
    captureSnapshot();
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    const actuallyUseAdrenaline = Math.min(bbAdrenaline, attacker.adrenaline || 0);
    const replis = [];
    const trajectoires = [];
    const result = resolveBoingBoing(selectedTitanId, bbDest, actuallyUseAdrenaline, mancheNumber, {
      board: state.board, titans: titanState.players, looseBlocks, replis, trajectoires,
    });
    if (result.applied && actuallyUseAdrenaline) attacker.adrenaline -= actuallyUseAdrenaline;
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    enqueueReplis(replis);
    animerTrajectoires(trajectoires);
    /* Atterrissage sur un Amas : la carte est jouée, mais la répartition des
       débris revient au joueur, case par case (ruling Nikola du 2026-08-16).

       ⚠️ Sauf s'il n'y a nulle part où les poser. `getEcroulementCells`
       écarte toute case portant un bâtiment DEBOUT : un Amas cerné de huit
       bâtiments intacts (les débris ayant été projetés de loin) ne renvoie
       aucune case éligible — vérifié par script, et un coin de plateau suffit
       à n'avoir que trois voisines. Le panneau s'ouvrait quand même : aucune
       case cliquable, « Valider » masqué tant que tous les débris ne sont pas
       placés, « Annuler le dernier » masqué tant qu'aucun ne l'est. Aucune
       sortie, partie définitivement bloquée.

       Même principe que pour un DIL/RAGE impossible (ruling Nikola du
       14/08) : ce qui ne peut pas se résoudre est noté au journal et ne
       produit aucun effet. Les débris restent sur l'Amas. */
    if (result.ecroulement) {
      const cellesDispo = getEcroulementCells(
        result.ecroulement.cellKey,
        { board: state.board, looseBlocks },
        []
      ).eligibles;
      if (cellesDispo.length === 0) {
        setActionLog((prev) => [...prev,
          `Amas de ${result.ecroulement.cellKey} : aucune case voisine ne peut recevoir de débris ` +
          `(bâtiments encore debout tout autour) — l'Amas ne se répartit pas, les débris restent en place.`]);
      } else {
        setEcroulement({ ...result.ecroulement, choix: [] });
      }
    }
    if (result.fatigues?.length) enqueueFatigues(result.fatigues);
    if (result.applied) { markCardPlayed(selectedTitanId, "boing_boing"); setBbMode(false); setBbPath([]); setBbSurvol([]); }
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, bbDest, bbDestIsBuilding, bbAdrenaline, state.board, titanState.players, looseBlocks, enqueueDecisions, enqueueReplis, enqueueFatigues, animerTrajectoires, mancheNumber, canPlayCard, markCardPlayed, captureSnapshot]);

  // Le Mouvement gratuit vaut 2 cases, +1 par Adrénaline dépensée, MOINS ce
  // qu'a coûté une éventuelle rentrée sur le plateau ce tour-ci. C'est ce
  // qui peut forcer un Titan éjecté à dépenser une Adrénaline pour retrouver
  // de la marge (ruling Nikola du 2026-08-16).
  const coutRentreeCeTour = coutRentree && coutRentree.titanId === selectedTitanId ? coutRentree.cout : 0;
  // Même correction que sur Boing Boing : `moveAdrenaline` est un compteur
  // d'interface, il n'était borné au stock réel du Titan qu'au moment de la
  // résolution. Un compteur resté à 2 d'un tour précédent faisait surligner
  // un rayon de 4 cases à un Titan sans une seule Adrénaline — le plateau
  // proposait des cases que `jouerMouvementGratuit` refusait ensuite.
  const moveAdrenalineDispo = Math.min(moveAdrenaline, selectedTitan?.adrenaline || 0);
  const moveMaxRange = Math.max(0, 2 + moveAdrenalineDispo - coutRentreeCeTour);

  // ── RÉPARTITION DES DÉBRIS D'UN AMAS ÉCROULÉ ──
  // Cases proposées pour le PROCHAIN débris. Elles changent à chaque pose :
  // on ne peut empiler que lorsqu'il ne reste plus de case vierge.
  const ecroulementCells = ecroulement
    ? getEcroulementCells(ecroulement.cellKey, { board: state.board, looseBlocks }, ecroulement.choix).eligibles
    : [];
  /* Un repli n'est proposé que s'il y a réellement un choix à faire.
     Ceux d'une IA sont joués ICI, tout de suite, par `choisirRepliIA` :
     c'est un vrai coup, pas une formalité — poser un débris dans son propre
     Périmètre le rend ramassable au tour suivant, le poser dans celui d'un
     adversaire le lui offre. L'IA simule donc chaque case et lit le vrai
     barème, comme pour un déplacement ou une carte, et sa FORCE joue de la
     même façon : l'Expert prend la meilleure case, le Novice tire parmi ses
     trois premières. */


  /* Applique le choix du joueur puis dépile.

     Le DÉPLACEMENT lui-même n'est plus écrit ici : c'est une règle de jeu,
     elle vit dans le domaine (`appliquerReplElement`), et l'IA comme le
     simulateur passent par la même. La copie qui vivait à cet endroit ne
     savait pas pousser le Titan occupant — depuis le ruling du 2026-08-18,
     viser la case d'un adversaire est justement le coup qui rapporte une
     case de piste ADN Bagarre. Le contrôleur ne fait donc plus que ce qui
     lui revient : figer l'état pour l'annulation, appeler la règle,
     journaliser, et redessiner. */
  const choisirRepli = useCallback((cellKey) => {
    const cur = repliQueue[0];
    if (!cur || !cur.cases.includes(cellKey)) return;
    captureSnapshot();
    if (cellKey !== cur.defaut) {
      const res = appliquerReplElement(cur, cellKey, {
        board: aiStateRef.current.board,
        titans: aiTitanStateRef.current.players,
        looseBlocks: aiLooseBlocksRef.current,
      });
      const quoi = cur.titanId != null ? `Titan ${cur.titanId}` : "Élément";
      setActionLog((prev) => [
        ...prev,
        ...(res.applied
          ? [`${quoi} arrêté faute de puissance → posé en ${cellKey} au lieu de ${cur.defaut} (choix de l'initiateur).`]
          : []),
        ...res.log,
      ]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      setLooseBlocks((prev) => ({ ...prev }));
      setState((prev) => ({ ...prev }));
    }
    setRepliQueue((prev) => prev.slice(1));
    /* Ce repli interrompait une résolution de Graouhhh : on la relance là où
       elle s'est arrêtée, sur un plateau où la case vient d'être libérée. */
    if (cur.graouhhh) advanceGraouhhhLoop(cur.graouhhh);
  }, [repliQueue, captureSnapshot, advanceGraouhhhLoop]);

  /* ── UN DÉBRIS PLACÉ EST UN DÉBRIS TOMBÉ ───────────────────
     Nikola, 2026-08-28 : « quand il y a plusieurs débris ou Titans qui doivent
     être bougés en même temps sur des cases différentes, il faut qu'on
     sélectionne l'ordre et que le jeu adapte son plateau à chaque déplacement ;
     ça permet de faire des tas de débris différemment que si c'est totalement
     automatique en 1 seconde. Là on clique juste pour l'ordre et ça s'applique
     cas par cas. »

     Le résolveur appliquait DÉJÀ les débris un par un, chacun faisant son effet
     avant le suivant — mais le joueur, lui, désignait les N cases d'affilée
     avant de valider, sur un plateau figé. Il ne pouvait donc pas voir qu'un
     débris venait d'occuper une case, ni décider d'empiler sur ce qu'il venait
     de poser. Le séquencement était dans le moteur et pas dans la main.

     Chaque clic RÉSOUT maintenant son débris : le plateau bouge, les cases
     éligibles se recalculent, et le débris suivant se choisit sur l'état réel.
     C'est aussi ce qui donne le choix de l'ordre — celui des clics.

     « Annuler la dernière case » disparaît : on ne défait plus un choix qui a
     déjà produit ses effets (un débris posé sur un Titan l'a déplacé, et peut
     avoir fait basculer une tour). L'annulation générale du tour, elle, reste :
     l'instantané est pris au premier débris. */
  /* Sortie de secours : si un Amas cerné de bâtiments debout n'offre aucune
     case où poser un débris, ce bouton reste la seule chose à l'écran qui
     permette de continuer la partie. Il ne s'affiche jamais tant qu'il existe
     une case éligible. */
  const ecroulementAbandonner = useCallback(() => {
    setActionLog((prev) => [...prev,
      `Amas de ${ecroulement?.cellKey} : aucune case voisine ne peut recevoir de débris — répartition abandonnée, ils restent en place.`]);
    setEcroulement(null);
  }, [ecroulement]);

  const ecroulementPoserDebris = useCallback((cellKey) => {
    const cur = ecroulement;
    if (!cur || cur.choix.length >= cur.blocs.length) return;
    const rang = cur.choix.length;
    if (rang === 0) captureSnapshot();

    const replis = [];
    const trajectoires = [];
    const result = resolveEcroulementAmas(
      activePlayerId,
      { cellKey: cur.cellKey, blocs: [cur.blocs[rang]], energie: cur.energie },
      [cellKey],
      { board: state.board, titans: titanState.players, looseBlocks, replis, trajectoires },
      // L'Amas ne quitte sa case qu'au premier débris.
      { retirerAmas: rang === 0 }
    );
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueReplis(replis);
    animerTrajectoires(trajectoires);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));

    const choix = [...cur.choix, cellKey];
    // Dernier débris posé : la répartition est close, le tour reprend.
    setEcroulement(choix.length >= cur.blocs.length ? null : { ...cur, choix });
  }, [ecroulement, activePlayerId, state.board, titanState.players, looseBlocks, enqueueReplis, animerTrajectoires, captureSnapshot]);
  const { reachable: moveReachable, classic: moveClassic, teleport: moveTeleport } = selectedTitan
    ? getMovementReachable(selectedTitan.cell, moveMaxRange, state.board, titansByCell, looseBlocks)
    : { reachable: new Set(), classic: new Set(), teleport: new Set() };

  const toggleMoveMode = useCallback(() => {
    if (!moveMode && !canUseMovePassif(selectedTitanId)) return;
    // Bug remonté par Nikola : une carte restée sélectionnée (teaMode/bbMode/
    // jnpMode) avant de rouvrir le Mouvement gratuit ("← Me déplacer
    // finalement") empêchait tout clic sur le plateau — clicCase teste ces
    // modes AVANT moveMode et retourne sans jamais l'atteindre. Les quatre
    // autres toggles (Graouhhh/Tête en Avant/Boing Boing/Je Ne Partage Pas)
    // se désactivent déjà mutuellement ; moveMode était le seul absent de
    // cette symétrie.
    setMoveMode((m) => {
      const next = !m;
      if (next) closeAllCardModes();
      return next;
    });
  }, [moveMode, canUseMovePassif, selectedTitanId, closeAllCardModes]);

  const jouerMouvementGratuit = useCallback(
    (destKey) => {
      if (!selectedTitanId || !moveReachable.has(destKey) || !canUseMovePassif(selectedTitanId)) return;

      /* SECOND DECLENCHEUR DE LA RENTREE (cf. assurerRentree). Si le Titan est
         encore hors de BIG CITY au moment ou il tente son premier geste, c'est
         que l'effet d'ouverture de tour ne s'est pas joue. On le fait rentrer
         ici, et on S'ARRETE : la rentree a coute un deplacement, la portee
         restante et les cases atteignables viennent de changer, et destKey a
         ete calculee depuis sa case de RENTREE, pas depuis sa case reelle. Le
         joueur reclique, sur un plateau qui dit enfin la verite. */
      const rentree = assurerRentree(selectedTitanId);
      if (rentree.rentre || rentree.needsChoice) return;

      captureSnapshot();
      const attackerSnap = titanState.players.find((t) => t.id === selectedTitanId);
      if (!attackerSnap) return;
      const actuallyUseAdrenaline = Math.min(moveAdrenaline, attackerSnap.adrenaline || 0);
      const depart = attackerSnap.cell;
      const path = getMovePath(depart, destKey, moveMaxRange, state.board, titansByCell, looseBlocks);
      setMoveMode(false);

      /* ── PLUS DE MARCHE CASE PAR CASE ───────────────────────
         Nikola, 2026-08-29 : « plus besoin de prendre le temps de bien montrer
         l'icône du Titan sur quelle case il va en 2D, l'animation du chemin
         coloré aide à ça » — et, dans le même souffle, « j'ai l'impression que
         l'animation de chemin est moins fluide » depuis qu'elle coexiste avec
         le jeton qui avance.

         Les deux remarques n'en font qu'une : on montrait la même chose deux
         fois, à deux rythmes différents. Le jeton avançait d'une case par
         seconde pendant que la traînée s'égrainait à 110 ms — l'œil suivait
         l'un OU l'autre, jamais les deux, et le décalage se lisait comme une
         saccade. Un déplacement de trois cases immobilisait le tour trois
         secondes pour une information que la traînée donne mieux.

         Le Titan arrive donc d'un coup, exactement comme un débris projeté, et
         c'est le chemin qui raconte le trajet. Une seule mise en scène, un seul
         rythme.

         CE QUE ÇA RÈGLE AUSSI : la résolution était différée de plusieurs
         secondes derrière une cascade de `setTimeout`, et pendant ce temps
         « Annuler » agissait sur un état que l'animation allait écraser. Elle
         est maintenant synchrone — l'instantané pris juste au-dessus décrit
         exactement l'état d'avant, et l'annulation redevient fiable. */
      const livePlayers = aiTitanStateRef.current.players;
      const result = resolveFreeMovement(selectedTitanId, destKey, { titans: livePlayers, board: state.board, looseBlocks });
      if (actuallyUseAdrenaline) {
        const a = livePlayers.find((t) => t.id === selectedTitanId);
        if (a) a.adrenaline -= actuallyUseAdrenaline;
      }
      setActionLog((prev) => [...prev, ...result.log]);
      setPassifUsed((prev) => ({ ...prev, [selectedTitanId]: { ...(prev[selectedTitanId] || {}), move: true } }));
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));

      /* Le chemin s'égraine derrière lui, comme la traînée d'un débris. */
      animerTrajectoires([{ cases: path, arrivee: destKey, titanId: selectedTitanId }]);

      /* ── LES DEUX BOUCHES DE LA FAILLE, PAS TOUTES ──────────
         Nikola, 2026-08-29 : « quand j'ai dit "mets en surbrillance les
         téléporteurs", je parle de ceux que tu prends — entrée, sortie ».

         La version précédente allumait TOUS les téléporteurs actifs dès qu'un
         saut était détecté : sur un plateau qui en compte quatre, ça montrait
         deux failles que le Titan n'a jamais approchées, et noyait justement
         l'information cherchée. On identifie donc la paire réellement
         empruntée : le saut se repère à deux cases consécutives du chemin qui
         ne se touchent pas, et les deux bouches sont les téléporteurs actifs
         les plus proches de chacune de ces deux cases. */
      const failles = getActiveTeleporterCells(state.board);
      const distance = (a, b) => Math.max(
        Math.abs(rowIndex(a[0]) - rowIndex(b[0])),
        Math.abs(Number(a.slice(1)) - Number(b.slice(1)))
      );
      const bouches = [];
      for (let i = 1; i < path.length; i++) {
        if (distance(path[i - 1], path[i]) <= 1) continue; // pas un saut
        for (const bord of [path[i - 1], path[i]]) {
          const proche = failles.reduce(
            (best, f) => (best === null || distance(f, bord) < distance(best, bord) ? f : best),
            null
          );
          if (proche && !bouches.includes(proche)) bouches.push(proche);
        }
      }
      if (bouches.length > 0) {
        /* `titanId` accompagne la bouche : la faille se peint de la couleur du
           Titan qui vient de l'emprunter, pas du violet générique (Nikola,
           2026-08-29). Le drapeau `teleporteur` reste, il sert de repli quand
           aucun Titan n'est associé au saut. */
        setTraceVol((prev) => [
          ...prev,
          ...bouches.map((key) => ({ key, teleporteur: true, titanId: selectedTitanId })),
        ]);
      }
    },
    [selectedTitanId, moveReachable, moveAdrenaline, moveMaxRange, titanState.players, titansByCell, canUseMovePassif, captureSnapshot, state.board, looseBlocks, assurerRentree, animerTrajectoires]
  );

  const recupPool = useMemo(
    () => (selectedTitanId
      ? new Set(getRecuperationPool(selectedTitanId, { titans: titanState.players, looseBlocks }))
      : new Set()),
    [selectedTitanId, titanState.players, looseBlocks]
  );
  const toggleRecupMode = useCallback(() => {
    if (!recupMode && (!canUseRecupPassif(selectedTitanId) || recupPool.size === 0)) return;
    setRecupMode((m) => !m);
  }, [recupMode, canUseRecupPassif, selectedTitanId, recupPool]);
  const jouerRecuperation = useCallback(
    (cellKey, pickedValue) => {
      if (!selectedTitanId || !recupPool.has(cellKey) || !canUseRecupPassif(selectedTitanId)) return;
      captureSnapshot();
      const result = resolveRecuperation(selectedTitanId, cellKey, { titans: titanState.players, looseBlocks, board: state.board }, pickedValue);
      setActionLog((prev) => [...prev, ...result.log]);
      if (result.applied) { setRecupMode(false); setPassifUsed((prev) => ({ ...prev, [selectedTitanId]: { ...(prev[selectedTitanId] || {}), recup: true } })); }
      setLooseBlocks((prev) => ({ ...prev }));
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    },
    [selectedTitanId, recupPool, titanState.players, looseBlocks, state.board, canUseRecupPassif, captureSnapshot]
  );

  // Le compte vient du moteur : l'interface le recopiait, ce qui faisait deux
  // endroits a corriger le jour ou la Lanterne Rouge changerait.
  //
  // Bug remonte par Nikola le 2026-08-24 : « j'etais Lanterne Rouge, bien
  // indique, mais je n'ai pas pu prendre mon 3e bloc ». Le compte etait
  // recalcule EN DIRECT a chaque rendu, sur le Repaire courant — or chaque
  // bloc ramasse fait justement grossir ce Repaire. Des le 2e bloc pris, son
  // proprietaire pouvait ne plus etre le moins dote, la Lanterne Rouge
  // s'eteignait d'elle-meme et le compte retombait a 2 en plein ramassage.
  // Comme le recul de Graouhhh ou les cibles de FPMC, ce nombre doit etre
  // FIGE au moment ou la carte s'engage, pas recalcule a chaque bloc pris.
  const jnpNbToPickLive = selectedTitanId
    ? getJeNePartagePasCount(selectedTitanId, { titans: titanState.players })
    : 2;
  const jnpNbToPick = jnpMode ? jnpNbToPickFrozen : jnpNbToPickLive;
  const jnpPool = useMemo(
    () => (selectedTitanId
      ? new Set(getJeNePartagePasPool(selectedTitanId, { titans: titanState.players, looseBlocks }))
      : new Set()),
    [selectedTitanId, titanState.players, looseBlocks]
  );
  const toggleJnpMode = useCallback(() => {
    setJnpMode((m) => {
      const next = !m;
      if (next) {
        setTeaMode(false); setGraouMode(false); setBbMode(false); setBbPath([]); setBbSurvol([]);
        setJnpNbToPickFrozen(jnpNbToPickLive);
      }
      return next;
    });
    setJnpSelected([]);
  }, [jnpNbToPickLive]);
  /* Ruling Nikola du 2026-08-19 (WIP) : le ramassage se resout ELEMENT PAR
     ELEMENT. Le clic ne coche donc plus une case en attendant une validation
     globale, il ramasse pour de bon, et le Titan se deplace aussitot si la
     case se vide. Le Perimetre du prelevement suivant est alors recalcule
     depuis sa NOUVELLE case, ce que `jnpPool` fait tout seul puisqu'il depend
     de la position du Titan.

     Deux consequences voulues :
     · deux debris empiles sur une MEME case se ramassent, ce que l'ancienne
       version interdisait (le second clic desélectionnait la case) ;
     · des debris du Perimetre de depart peuvent devenir hors de portee apres
       le premier ramassage. C'est la partie que Nikola garde en WIP. */
  const jnpPickCell = useCallback((key) => {
    if (!selectedTitanId || !canPlayCard("je_ne_partage_pas")) return;
    if (!jnpPool.has(key)) return;
    if (jnpSelected.length >= jnpNbToPick) return;

    // L'instantane est pris avant le PREMIER element seulement : Annuler doit
    // ramener avant la carte entiere, pas au milieu d'un ramassage.
    if (jnpSelected.length === 0) captureSnapshot();

    const result = resolveJeNePartagePasElement(
      selectedTitanId, key,
      { titans: titanState.players, looseBlocks, board: state.board }
    );
    setActionLog((prev) => [...prev, ...result.log]);
    if (!result.applied) {
      setLooseBlocks((prev) => ({ ...prev }));
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      return;
    }

    const dejaPris = [...jnpSelected, key];
    setJnpSelected(dejaPris);
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));

    /* Le compte atteint, la carte est jouee. Pas de bouton a cliquer : tout
       est deja resolu.

       C'est aussi le moment du SEUL deplacement (Nikola, 2026-08-19) : « on
       finit sur la derniere case selectionnee si elle devient libre ». Chaque
       clic intermediaire ne fait donc plus bouger le Titan, ce qui lui
       permet de piocher sur des cases eloignees les unes des autres sans que
       son Perimetre ne se derobe en cours de route. */
    if (dejaPris.length >= jnpNbToPick) {
      deplacerSiDerniereCaseLibre(
        selectedTitanId, key,
        { titans: titanState.players, looseBlocks, board: state.board }
      );
      setLooseBlocks((prev) => ({ ...prev }));
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      markCardPlayed(selectedTitanId, "je_ne_partage_pas");
      setJnpMode(false);
      setJnpSelected([]);
    }
  }, [selectedTitanId, jnpPool, jnpSelected, jnpNbToPick, titanState.players, looseBlocks, state.board, canPlayCard, markCardPlayed, captureSnapshot]);

  // Conserve sous son ancien nom : les panneaux l'appellent pour le clic case.
  const jnpToggleCell = jnpPickCell;

  /* Sortie de secours du ramassage sequentiel. Un Titan peut se retrouver
     sans aucun debris a portee apres s'etre deplace : la carte est alors
     ramassee a moitie et il n'y a plus rien a cliquer. Sans ce bouton, le
     panneau resterait ouvert sans issue — exactement le blocage de partie
     rencontre trois fois le 18 aout. Il cloture la carte avec ce qui a ete
     obtenu. */
  const jouerJeNePartagePas = useCallback(() => {
    if (!selectedTitanId || !canPlayCard("je_ne_partage_pas")) return;
    if (jnpSelected.length === 0) return;
    // Cloture anticipee : le Titan se pose quand meme sur sa derniere case
    // choisie, si elle est libre. Meme regle que pour un ramassage complet.
    const derniere = jnpSelected[jnpSelected.length - 1];
    const journal = [];
    deplacerSiDerniereCaseLibre(
      selectedTitanId, derniere,
      { titans: titanState.players, looseBlocks, board: state.board },
      journal
    );
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setActionLog((prev) => [...prev, ...journal,
      `Je Ne Partage Pas : ramassage cloture a ${jnpSelected.length}/${jnpNbToPick} element(s).`]);
    markCardPlayed(selectedTitanId, "je_ne_partage_pas");
    setJnpMode(false);
    setJnpSelected([]);
  }, [selectedTitanId, jnpSelected, jnpNbToPick, canPlayCard, markCardPlayed,
      titanState.players, looseBlocks, state.board]);

  const jouerFautPasMeChauffer = useCallback(() => {
    if (!selectedTitanId || !canPlayCard("faut_pas_me_chauffer")) return;
    captureSnapshot();
    const targets = getFPMCTargets(selectedTitanId, { titans: titanState.players });
    if (targets.length === 0) {
      setActionLog((prev) => [...prev, `FPMC : aucun Titan dans le Périmètre — sans effet.`]);
      markCardPlayed(selectedTitanId, "faut_pas_me_chauffer");
      return;
    }
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    const base = getProgrammedSum(attacker);
    setFpmcAttackerId(selectedTitanId);
    setFpmcAttackerBase(base);
    setFpmcNTargets(targets.length);
    setFpmcPendingIds(targets);
    setFpmcCurrent(null);
    setActionLog((prev) => [...prev, `FPMC : T${selectedTitanId} (somme ${base}) vs ${targets.length} cible(s) — choisis l'ordre.`]);
    markCardPlayed(selectedTitanId, "faut_pas_me_chauffer");
  }, [selectedTitanId, titanState.players, canPlayCard, markCardPlayed, captureSnapshot]);

  const pickFpmcTarget = useCallback((defenderId) => {
    const defender = titanState.players.find((t) => t.id === defenderId);
    setFpmcCurrent({ defenderId, defenderBase: getProgrammedSum(defender), attackerBid: 0, defenderBid: 0 });
    setFpmcPendingIds((prev) => prev.filter((id) => id !== defenderId));
  }, [titanState.players]);

  const updateFpmcBid = useCallback((side, value) => {
    const cur = fpmcCurrent;
    if (!cur) return;
    const capId = side === "attackerBid" ? fpmcAttackerId : cur.defenderId;
    const capTitan = titanState.players.find((t) => t.id === capId);
    const cap = capTitan ? capTitan.adrenaline || 0 : 0;
    const clamped = Math.min(cap, Math.max(0, Number(value) || 0));
    setFpmcCurrent((prev) => (prev ? { ...prev, [side]: clamped } : prev));
  }, [fpmcCurrent, fpmcAttackerId, titanState.players]);

  const revealFPMC = useCallback(() => {
    const cur = fpmcCurrent;
    if (!cur || !fpmcAttackerId) return;
    const attacker = titanState.players.find((t) => t.id === fpmcAttackerId);
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    if (!attacker || !defender) return;
    captureSnapshot();

    // La résolution vit désormais dans le domaine, avec les cinq autres
    // cartes (cf. resolveFautPasMeChauffer). La version manuscrite qui
    // occupait cette place avait raté trois correctifs successifs :
    // immunité de l'initiateur, auto-collision du Titan projeté, et
    // « bagarre non remportée = aucun point ». Le contrôleur ne fait plus
    // que ce qui lui revient : débiter les mises et rafraîchir l'affichage.
    const replis = [];
    const trajectoires = [];
    const result = resolveFautPasMeChauffer(fpmcAttackerId, cur.defenderId, fpmcNTargets, {
      board: state.board, titans: titanState.players, looseBlocks, replis, trajectoires,
    }, { attackerBid: cur.attackerBid, defenderBid: cur.defenderBid });

    attacker.adrenaline = Math.max(0, (attacker.adrenaline || 0) - cur.attackerBid);
    defender.adrenaline = Math.max(0, (defender.adrenaline || 0) - cur.defenderBid);
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    enqueueReplis(replis);
    animerTrajectoires(trajectoires);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setFpmcCurrent(null);
  }, [fpmcCurrent, fpmcAttackerId, fpmcNTargets, titanState.players, state.board, looseBlocks, enqueueDecisions, enqueueReplis, animerTrajectoires, captureSnapshot]);

  /* ── TOUT CASSER : LE JOUEUR CHOISIT L'ORDRE ────────────────
     Nikola, 2026-08-28 : « en cas de TOUT CASSER, on projette les éléments 1 par
     1 dans l'ordre, mon choix. »

     La carte ne se résout plus d'un bloc. On relève ce que la percussion va
     toucher, on ouvre une file, et chaque clic sur une case en résout UNE — le
     plateau bouge, et l'élément suivant se choisit sur l'état qui en résulte.
     C'est ce qui rend l'ordre porteur de sens : un bloc projeté sur une case
     qu'un Titan vient de quitter ne s'empile pas au même endroit.

     Le `bagarreSet` traverse toute la file : la FAQ #12 veut qu'un Titan
     distinct ne rapporte qu'UNE Bagarre pour la carte entière, quel que soit
     l'ordre dans lequel on le touche. Il est donc crédité à la fin, une fois la
     file vide — comme le faisait `resolveToutCasser` en un seul appel. */

  const jouerToutCasser = useCallback(() => {
    if (!selectedTitanId || !canPlayCard("tout_casser")) return;
    captureSnapshot();
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    // Bug trouvé au scan : le débit était figé à 1 (`attacker.adrenaline -= 1`)
    // alors que le bonus d'énergie, lui, passait entier au résolveur. Miser
    // deux Adrénalines sur Tout Casser rendait donc la seconde gratuite.
    const bonus = Math.min(Number(tcAdrenaline) || 0, attacker.adrenaline || 0);
    if (bonus > 0) attacker.adrenaline -= bonus;

    const jeu = { board: state.board, titans: titanState.players, looseBlocks, replis: [], trajectoires: [] };
    const percussion = releverPercussion(selectedTitanId, jeu, bonus);
    const cibles = listerCiblesToutCasser(selectedTitanId, jeu, percussion);

    setActionLog((prev) => [...prev,
      `💥 Tout Casser (Titan ${selectedTitanId}) — énergie ${percussion.energie}${percussion.seuil4 ? " (Seuil 4)" : ""}, ${cibles.length} élément(s) à projeter dans l'ordre de ton choix.`,
    ]);
    markCardPlayed(selectedTitanId, "tout_casser");
    setTcAdrenaline(0); // état numérique : `false` y était écrit par erreur

    if (cibles.length === 0) {
      setActionLog((prev) => [...prev, "Aucun élément dans le Périmètre — la carte n'a rien à projeter."]);
      return;
    }
    setToutCasserFile({ titanId: selectedTitanId, percussion, cibles, bagarreIds: [] });
  }, [selectedTitanId, tcAdrenaline, state.board, titanState.players, looseBlocks, canPlayCard, markCardPlayed, captureSnapshot]);

  /* Résout la case cliquée, puis retire l'élément de la file. Quand elle se
     vide, la Bagarre est créditée une fois pour toute la carte. */
  const toutCasserResoudre = useCallback((cellKey) => {
    const file = toutCasserFile;
    if (!file) return;
    const cible = file.cibles.find((c) => c.key === cellKey);
    if (!cible) return;

    const replis = [];
    const trajectoires = [];
    const bagarreSet = new Set(file.bagarreIds);
    const jeu = { board: state.board, titans: titanState.players, looseBlocks, replis, trajectoires };
    const res = resolveToutCasserCase(file.titanId, cible, jeu, file.percussion, bagarreSet);

    setActionLog((prev) => [...prev, ...(res.log || [])]);
    enqueueDecisions(res.decisions || []);
    enqueueReplis(replis);
    animerTrajectoires(trajectoires);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));

    const reste = file.cibles.filter((c) => c.key !== cellKey);
    if (reste.length > 0) {
      setToutCasserFile({ ...file, cibles: reste, bagarreIds: [...bagarreSet] });
      return;
    }
    /* Fin de carte : la Bagarre se compte ici, une seule fois par Titan touché
       (FAQ #12), exactement comme le faisait la résolution monolithique. */
    const attaquant = aiTitanStateRef.current.players.find((t) => t.id === file.titanId);
    if (attaquant && bagarreSet.size > 0) {
      attaquant.bagarre += bagarreSet.size;
      setActionLog((prev) => [...prev,
        `+${bagarreSet.size} Bagarre (Titan ${file.titanId} → ${attaquant.bagarre}) — ${bagarreSet.size} Titan(s) distinct(s) touché(s) sur toute la carte (FAQ #12).`,
      ]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    }
    setToutCasserFile(null);
  }, [toutCasserFile, state.board, titanState.players, looseBlocks, enqueueDecisions, enqueueReplis, animerTrajectoires]);

  const getVertCount = useCallback((titan) => titan.repaire.filter((c) => c === "vert").length, []);

  /* ══════════════════════════════════════════════════════════
     LE JOURNAL, TYPÉ — dérivé, pas stocké (Nikola, 2026-08-28)
     ══════════════════════════════════════════════════════════
     Il était une liste de chaînes, et c'est la seule mémoire de la partie.
     Deux défauts en découlaient, tous deux signalés :

     · LE RATTACHEMENT À UN TITAN se faisait par une expression régulière au
       moment de l'affichage, qui gardait le PREMIER identifiant rencontré.
       « Titan 1 prend 1 Adrénaline à Titan 2 » était donc classé chez le
       Titan 1 seul : filtrer sur le Titan 2 ne montrait pas la ligne qui lui
       coûte une Adrénaline.
     · LES NOMS. Le moteur écrit « Titan 3 », parce qu'il ne connaît pas les
       noms choisis à l'accueil — et c'est très bien ainsi, un moteur de règles
       n'a pas à connaître l'habillage. Mais le journal affichait ce texte tel
       quel, alors que tout le reste de l'écran dit « Pénélope ».

     DÉRIVÉ, ET PAS STOCKÉ. La version évidente — enrichir chaque ligne à
     l'écriture — oblige à passer par un `setActionLog` maison, qui n'est plus
     le setter stable de `useState` : les cinquante-trois sites d'écriture s'en
     moquent, mais les trente-huit hooks qui le citent en dépendance, non. Le
     type est donc CALCULÉ à partir du texte, une fois par changement de
     journal. Le coût est nul à l'échelle d'une partie, et rien en amont ne
     bouge : ni le domaine, ni les appelants, ni l'annulation.

     Ce qu'on en tire :
     · `acteurs` retient TOUS les Titans cités, pas le premier ;
     · `manche` est reconstituée en parcourant les séparateurs, donc le
       découpage du journal cesse d'être une affaire d'affichage ;
     · `texte` reste canonique — « Titan 3 », jamais « Pénélope » : le nom est
       substitué à l'AFFICHAGE, ce qui le rend rétroactif (renommer en cours de
       partie renomme tout le passé) et garde le journal enregistré lisible par
       quelqu'un qui n'a pas les mêmes noms.
     ══════════════════════════════════════════════════════════ */
  const journal = useMemo(() => {
    const ID_TITAN = /\bT(?:itan)?\.?\s?([1-4])\b/g;
    const SEPARATEUR = /^— — — Manche (\d+) — — —$/;
    let manche = 1;
    return actionLog.map((ligne, i) => {
      const texte = typeof ligne === "string" ? ligne : String(ligne);
      const sep = texte.match(SEPARATEUR);
      if (sep) manche = Number(sep[1]);
      const acteurs = [];
      for (const m of texte.matchAll(ID_TITAN)) {
        const id = Number(m[1]);
        if (!acteurs.includes(id)) acteurs.push(id);
      }
      return { i, texte, manche, acteurs, separateur: Boolean(sep) };
    });
  }, [actionLog]);

  /* Le texte prêt à lire : les identifiants du moteur laissent la place aux
     noms choisis. Fait ICI et pas dans le composant, pour que le rapport
     « Signaler » et le journal affichent exactement la même chose. */
  const nommerLigne = useCallback(
    (texte) => texte.replace(/\bT(?:itan)?\.?\s?([1-4])\b/g, (brut, id) => titanDisplayName(Number(id))),
    [titanDisplayName]
  );

  /* ── LES IA PLACENT LEURS PROPRES BLOCS VERTS ──
     Demande de Nikola du 2026-08-18 : « c'est les IA qui doivent placer
     leurs propres blocs verts. »

     L'écran de décompte posait un menu déroulant par Vert et PAR TITAN, y
     compris pour les Titans pilotés par l'IA : c'était donc l'humain qui
     affectait, à la fin, les Verts de ses trois adversaires — un choix qui
     vaut plusieurs points et qui ne lui appartient pas. Pire, tant qu'il ne
     les remplissait pas lui-même, le décompte restait annoncé comme « non
     définitif » et les profils d'IA ne se dévoilaient jamais.

     Chaque IA tranche donc elle-même, en mode EXACT : le glouton a un angle
     mort connu sur l'Orange, qui ne marque que par paires (cf.
     bestVertAssignment). Placer un Vert est le tout dernier geste de la
     partie, il n'est joué qu'une fois — autant le jouer juste.

     Le placement se fait à l'ouverture du décompte, une seule fois par
     Titan : la condition sur `vertAssignments` empêche l'effet de le
     recalculer et d'écraser un état restauré par « Annuler ».

     ⚠️ La condition est `gameOver`, PAS `showScoring`. `showScoring` n'est
     qu'un panneau consultable à tout moment par le bouton « 🏆 Scoring » :
     l'ouvrir en Manche 2 faisait placer aux IA des Verts calculés sur un
     plateau intermédiaire, et comme le placement n'est fait qu'une fois, il
     n'était plus jamais recalculé — les IA finissaient la partie avec des
     Verts posés d'après un état qui n'existait plus. */
  useEffect(() => {
    if (distantInviteRef.current) return; // les Verts des IA sont placés chez l'hôte
    if (!gameOver) return;
    const aFaire = titanState.players.filter(
      (t) => titanModes[t.id] === "ia"
        && getVertCount(t) > 0
        && (vertAssignments[t.id] || []).filter(Boolean).length < getVertCount(t)
    );
    if (aFaire.length === 0) return;
    const ajouts = {};
    const journal = [];
    for (const t of aFaire) {
      /* L'IA DÉCIDE SUR LES PRÉ-SCORES, PAS SUR LES VERTS DES AUTRES.
         Nikola, 2026-08-27 : « au moment du placement des Verts j'ai besoin
         de savoir les pré-scores des autres sans leur Vert, pour mieux me
         projeter — pareil pour les IA. »

         Elle recevait jusqu'ici `autres: dejaPosees`, c'est-à-dire les Verts
         DÉJÀ POSÉS par les humains et par les IA passées avant elle. Le
         placement est secret, révélé simultanément : cette information
         n'existe pour personne à cet instant. L'IA jouait donc paravent
         baissé, contre des humains qui, eux, décidaient à l'aveugle — et la
         dernière IA à trancher était la mieux renseignée des quatre, ce qui
         faisait dépendre sa force de son numéro de Titan.

         `autres: {}` la remet sur l'information publique : les Repaires et
         les pistes tels qu'ils sont, Verts de personne inclus. Exactement ce
         que le tableau de pré-scores montre au joueur en face. */
      const choix = bestVertAssignment(t.id, titanState.players, { exact: true, autres: {} });
      ajouts[t.id] = choix;
      // Le journal dit QUE l'IA a placé, jamais OÙ. Il est consultable à
      // tout moment : y écrire le détail rouvrait par la porte de derrière
      // le secret que l'écran de placement vient de fermer. Le détail
      // s'affiche dans ce même écran, une fois tout le monde placé.
      journal.push(`🤖 ${titanDisplayName(t.id)} (IA) place ses ${choix.length} Bloc(s) Vert, en secret.`);
    }
    setVertAssignments((prev) => ({ ...prev, ...ajouts }));
    // Une IA n'a personne pour cliquer « Valider » : poser, pour elle,
    // c'est s'engager. Sans ça, son placement resterait éternellement « en
    // cours » à l'écran.
    setVertsValides((prev) => {
      const suite = { ...prev };
      for (const id of Object.keys(ajouts)) suite[id] = true;
      return suite;
    });
    setActionLog((prev) => [...prev, ...journal]);
  }, [gameOver, titanState.players, titanModes, vertAssignments, getVertCount, titanDisplayName]);
  const updateVertAssignment = useCallback((titanId, index, value) => {
    setVertAssignments((prev) => {
      const current = prev[titanId] ? [...prev[titanId]] : [];
      current[index] = value ? (() => { const [type, target] = value.split(":"); return { type, target }; })() : null;
      return { ...prev, [titanId]: current };
    });
  }, []);

  const finalScoreResult = showScoring
    ? computeFinalScore(
        titanState.players,
        Object.fromEntries(Object.entries(vertAssignments).map(([id, arr]) => [id, (arr || []).filter(Boolean)])),
        rainbowWinnerId
      )
    : null;

  /* LE PRÉ-SCORE : le décompte tel qu'il serait si personne ne posait de
     Vert (Nikola, 2026-08-27 : « j'ai besoin de savoir les pré-scores des
     autres sans leur Vert pour mieux me projeter »).

     Le tableau des Repaires disait déjà combien de blocs chacun détient,
     couleur par couleur. Il ne disait pas ce que ça FAIT : additionner
     quatre barèmes, le bonus Rose, les Socles, deux classements de piste et
     l'Adrénaline, pour quatre Titans, de tête, au moment précis où l'on
     décide — c'est le calcul que personne ne fait à la table, et sans lui un
     Vert se place à l'estime.

     Verts de TOUT LE MONDE exclus, y compris les siens : c'est la seule
     photo que chacun peut légitimement avoir sous les yeux pendant un
     placement secret, et c'est aussi celle sur laquelle les IA tranchent
     désormais. Le même point de départ pour les quatre. */
  const preScoreSansVerts = showScoring
    ? computeFinalScore(titanState.players, {}, rainbowWinnerId)
    : null;

  // Le tableau de scoring affichait une colonne par Titan et un total, sans
  // jamais désigner de vainqueur : au joueur de comparer les chiffres à
  // l'œil. Le classement est calculé ici, départage compris (Adrénaline,
  // plus haut Socle, Force des cartes non jouées — ruling du 2026-08-15).
  const classementFinalPartie = finalScoreResult
    ? classementFinal(titanState.players, finalScoreResult.totals)
    : null;

  /* LE PODIUM S'OUVRE QUAND LE CLASSEMENT DEVIENT VRAI, pas à `gameOver`.
     Entre les deux il y a le placement des Blocs Verts : tant qu'un seul reste
     à poser, les totaux affichés sont provisoires et le vainqueur peut encore
     changer de nom. Annoncer un gagnant à ce moment-là serait le démentir une
     minute plus tard.

     `podiumDejaOuvert` fait que l'ouverture automatique n'a lieu qu'UNE fois :
     le classement est recalculé à chaque rendu, et sans ce garde le panneau se
     rouvrirait tout seul à chaque clic après qu'on l'a fermé. */
  /* ⚠️ LE CLASSEMENT N'EST VRAI QU'APRÈS LA VALIDATION DES VERTS, pas après
     leur simple placement. Nikola, 2026-08-28 : « attention, le panneau gagnant
     apparaît après la validation de placement de Vert, sinon ça fausse le
     classement ».

     Un Vert posé mais non validé peut encore être repris : le décompte le
     compte déjà, le joueur peut encore le déplacer, et le vainqueur affiché
     n'est donc pas celui qui gagnera. La condition n'est pas « tous les Verts
     sont placés » mais « plus personne ne peut changer d'avis » : chaque Titan
     porteur de Verts doit avoir ENGAGÉ son placement.

     Un Titan sans aucun Vert n'a rien à valider et ne bloque personne. */
  const versDeposesEtEngages = titanState.players.every(
    (t) => getVertCount(t) === 0 || vertsValides[t.id]
  );

  useEffect(() => {
    if (!gameOver || podiumDejaOuvert.current) return;
    if (!versDeposesEtEngages) return;
    if (!classementFinalPartie || classementFinalPartie.length === 0) return;
    podiumDejaOuvert.current = true;
    setShowPodium(true);
  }, [gameOver, versDeposesEtEngages, classementFinalPartie]);

  // ⚠️ Dépendances posées sur `state` / `looseBlocks` / `titanState` (objets
  // de haut niveau) et NON sur `state.board` : les résolutions de cartes
  // mutent `state.board` en place puis forcent le rendu par
  // `setState((p) => ({ ...p }))`. La référence de `.board` ne change donc
  // jamais, alors que celle de `state` change à chaque action. Mémoïser sur
  // `.board` figerait le plateau après la première destruction.
  const endGameReasons = useMemo(
    () => checkEndGameTriggers(state.board, looseBlocks, apocalypseThreshold, mancheNumber, nbJoueurs),
    [state, looseBlocks, apocalypseThreshold, mancheNumber, nbJoueurs]
  );

  const boardSignature3D = useMemo(
    () => JSON.stringify({
      b: Object.entries(state.board).map(([k, v]) => [k, v.blocks.join(""), v.socle]),
      l: Object.entries(looseBlocks).map(([k, v]) => [k, (v || []).join(",")]),
      // `horsPlateau` fait partie de la signature : un Titan qui rentre par
      // la case exacte d'où il est sorti ne change pas de `cell`, et la 3D
      // ne se serait jamais reconstruite pour le refaire apparaître.
      t: titanState.players.map((p) => [p.id, p.cell, p.horsPlateau ? 1 : 0]),
    }),
    [state, looseBlocks, titanState]
  );

  /* ── UNE SEULE DÉCISION À L'ÉCRAN À LA FOIS ──
     Demande de Nikola du 2026-08-18 : « n'affiche pas plusieurs panneaux,
     fais panneau par panneau — là j'ai un DIL et une Phase Repos, ce n'est
     pas possible, on fait DIL puis Phase Repos. »

     Les quatre décisions bloquantes du jeu étaient montées côte à côte, et
     chacune s'affichait dès qu'elle avait quelque chose à dire. Un Graouhhh
     qui touche trois Titans, suivi d'un repli et d'une fin de Manche,
     empilait donc trois bandeaux d'alerte au même moment, tous en rouge,
     tous « bloquants » : impossible de savoir lequel répondre en premier.

     L'ordre ci-dessous est celui de la résolution réelle, du plus imbriqué
     au plus large : ce qu'une carte a déclenché se termine avant la carte,
     et la carte se termine avant la Manche. C'est aussi ce qui garantit le
     « Titan par Titan » sur Graouhhh — la file DIL se vide un Titan à la
     fois, et rien d'autre ne s'affiche pendant ce temps. */
  const decisionBloquante = placementRestant.length > 0
    ? "placement"
    /* La file de Tout Casser bloque le tour tant qu'elle n'est pas vide : c'est
       une action en cours de résolution, pas un choix qu'on peut remettre à
       plus tard. Elle passe APRÈS le placement (qui ouvre la partie) et AVANT
       tout le reste, puisque c'est elle qui produira les Dilemmes et les replis
       que les autres bandeaux traiteront ensuite. */
    : toutCasserFile
    ? "toutcasser"
    /* Le refus de Fatigue passe AVANT le Dilemme de la même carte : la carte
       part d'abord, le bloc ensuite, et c'est l'ordre dans lequel la cible les
       subit. */
    : fatigueEnAttente
    ? "fatigue"
    : cornerChoice
    ? "coin"
    : currentDecision
    ? "dil"
    : currentRepli
    ? "repli"
    : ecroulement
    ? "ecroulement"
    : // Faut Pas Me Chauffer entre ici le 2026-08-18 : la comparaison de
      // mises est une décision bloquante comme les autres, mais elle vivait
      // hors de cette liste. Le tour pouvait donc être rendu « terminé »
      // pendant qu'une cible attendait encore d'être désignée.
      fpmcAttackerId && (fpmcPendingIds.length > 0 || fpmcCurrent)
    ? "fpmc"
    : phase === "repos" && !gameOver
    ? "vol"
    : null;

  /* ⚠️ PAS DE PÉRIMÈTRE POUR UN TITAN QUI N'EST PAS SUR LE PLATEAU.
     Bug remonté par Nikola le 2026-08-28 : « un coin s'affiche déjà en
     surbrillance de ma couleur au tout début du jeu, alors que je n'ai pas
     encore placé mon Titan ».

     Sa `cell` porte pourtant déjà une valeur pendant la mise en place —
     l'emplacement que le tirage lui a réservé par défaut — et le périmètre se
     dessinait autour. Non seulement il n'a aucun sens (le Titan n'est nulle
     part), mais il RÉVÈLE où il compte aller à ceux qui posent avant lui, ce
     que tout le reste de la mise en place s'applique à cacher.

     Même garde qu'ailleurs : `estSurLePlateau` couvre `aPlacer` ET
     `horsPlateau` — un Titan éjecté n'a pas plus de périmètre qu'un Titan non
     posé, et la vue 3D le savait déjà de son côté. */
  const perimeterCells = selectedTitan && estSurLePlateau(selectedTitan)
    ? getPerimeter(selectedTitan.cell[0], Number(selectedTitan.cell.slice(1)))
    : [];
  const perimeterKeys = new Set(perimeterCells.map((c) => c.row + c.col));
  /* Retour de Nikola : le badge Énergie/Seuil 4 restait câblé sur Tout
     Casser même pendant que Tête en Avant ou Boing Boing étaient ouverts —
     il ne bougeait donc jamais avec LEURS boutons +/-. Il suit désormais la
     carte réellement en cours de configuration. Pour Tête en Avant/Boing
     Boing, c'est l'énergie de DÉPART de la charge (avant dégression avec la
     distance parcourue, cf. computeEnergieParDistance) — teaMaxRange et
     bbMaxRange la calculent déjà avec la même formule (portée + Adrénaline
     engagée), pas besoin d'un second calcul. */
  const energie = selectedTitan
    ? teaMode
      ? teaMaxRange
      : bbMode
      ? bbMaxRange
      : computeEnergyToutCasser(
          perimeterCells,
          state.board,
          titansByCell,
          // Sans ce bonus, l'aperçu "Énergie"/"Seuil 4" du panneau ne bougeait
          // pas au clic sur "+" alors que la résolution réelle (jouerToutCasser)
          // en tenait déjà compte : le joueur ne voyait jamais l'effet de son
          // Adrénaline avant de valider la carte.
          Math.min(Number(tcAdrenaline) || 0, selectedTitan.adrenaline || 0),
          // Bug remonté par Nikola : l'aperçu ignorait ce 5e argument et
          // retombait sur le défaut `{}`, donc ne comptait ni les débris ni
          // les Socles au sol — le badge Énergie/Seuil affichait 3 quand la
          // résolution réelle (qui, elle, passe `gameState.looseBlocks`)
          // appliquait déjà l'effet du Seuil 4 sur une énergie de 4 ou plus.
          looseBlocks
        )
    : 0;

  // Même raison que ci-dessus pour la dépendance sur `state` et non `state.board`.
  const { stats, occupiedCount } = useMemo(() => {
    const counts = { bleu: 0, rose: 0, orange: 0, rouge: 0, vert: 0 };
    let occupied = 0;
    Object.values(state.board).forEach((b) => {
      b.blocks.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
      if (b.blocks.length > 0) occupied++;
    });
    return { stats: counts, occupiedCount: occupied };
  }, [state]);

  // -- CONSIGNE DU MOMENT --
  // Un joueur qui decouvre le jeu ne sait pas ce que la Phase en cours
  // attend de lui. `what` explique la Phase, `you` dit l'action concrete a
  // faire tout de suite. Purement descriptif : aucune regle n'est decidee
  // ici, on ne fait que formuler ce que le moteur applique deja.
  // Place avec les autres valeurs derivees, donc AVANT le retour anticipe de
  // l'ecran de configuration : l'ordre des hooks doit rester constant.
  const phaseGuidance = useMemo(() => {
    if (currentDecision) {
      const mode = currentDecision.type === "RAGE" ? "RAGE" : "DIL";
      return {
        what: `Decision ${mode} en cours - le reste du jeu est en pause tant qu'elle n'est pas resolue.`,
        you: mode === "RAGE"
          ? "L'attaquant prend 1 ressource dans le Repaire de sa cible."
          : "L'attaquant designe 2 couleurs differentes, la cible choisit laquelle elle perd (ou paie 1 Adrenaline pour annuler).",
      };
    }
    const me = selectedTitan;
    const validated = me ? phaseValidated[me.id] : false;
    if (phase === "evenement") {
      return {
        what: "Phase 1 - Evenement : un Evenement est tire pour toute la Manche.",
        you: validated ? "Tu as valide, on attend les autres Titans." : "Prends-en connaissance, puis valide ta Phase.",
      };
    }
    if (phase === "declenchement") {
      return {
        what: "Phase 2 - Declenchement : l'Evenement de la Manche prend effet.",
        you: validated ? "Tu as valide, on attend les autres Titans." : "Valide ta Phase pour continuer.",
      };
    }
    if (phase === "programmation") {
      const n = me ? me.programmed.length : 0;
      return {
        what: "Phase 3 - Programmation : chacun choisit en secret 3 cartes parmi les 6 de sa main.",
        you: n === 3
          ? "Tes 3 cartes sont programmees, on attend les autres Titans."
          : "Clique 3 cartes ci-dessous. Tu les joueras une par une en Phase Action, dans l'ordre que tu veux.",
      };
    }
    if (phase === "action") {
      // Silence volontaire. En Phase Action, le bandeau du Titan actif, juste
      // au-dessus, annonce deja qui joue, combien de cartes il lui reste et
      // quoi faire. Trois panneaux voisins disaient la meme chose ; celui-ci
      // se tait au profit du plus contextuel.
      return { what: "", you: "" };
    }
    if (phase === "repos") {
      return {
        what: "Phase 5 - Repos : un vol de carte en chaine, puis la Manche suivante demarre.",
        you: volDirection
          ? "Sens choisi, la chaine de vol se resout automatiquement."
          : "Le Detonateur choisit le sens de rotation du vol pour toute la chaine.",
      };
    }
    return { what: "", you: "" };
  }, [phase, currentDecision, selectedTitan, phaseValidated, volDirection]);

  // ── ÉCRAN CONFIG ──
  /* ── SIGNALER CE QUI VIENT DE SE PASSER (Nikola, 2026-08-24) ──
     « Aujourd'hui tu me decris de memoire » : un retour de table arrivait sous
     la forme « j'etais en F6 », et retrouver le cas exact demandait parfois une
     enumeration brute de tout le plateau. Ce bouton fige l'etat complet dans un
     fichier : avec la graine ET la position reelle de chaque element, le cas se
     rejoue directement au lieu d'etre reconstitue.

     Tout est LOCAL : le fichier est fabrique dans le navigateur et enregistre
     par le navigateur. Rien ne part sur un serveur, il n'y en a pas. */
  const construireRapport = useCallback(() => ({
    version: 1,
    genereLe: new Date().toISOString(),
    graine: gameSeed,
    partie: {
      nbJoueurs, mancheNumber, phase, activePlayerId, selectedTitanId,
      seuilApocalypse: apocalypseThreshold, evenementsActifs: eventsEnabled,
      evenementEnCours: currentEvent, gameOver,
    },
    titans: titanState.players.map((t) => ({
      id: t.id, cell: t.cell, horsPlateau: !!t.horsPlateau,
      mode: titanModes[t.id], profil: titanProfiles[t.id] ?? null,
      repaire: [...t.repaire], socles: [...t.socles],
      adrenaline: t.adrenaline, bagarre: t.bagarre, destruction: t.destruction,
      main: [...t.hand], programmees: [...t.programmed],
      joueesCetteManche: [...t.playedThisManche],
      defausseesCachees: [...(t.discardedHidden || [])], repos: [...t.repos],
    })),
    ordreJeu: [...titanState.ordreJeu],
    detonateur: titanState.detonateur,
    plateau: Object.fromEntries(
      Object.entries(state.board)
        .filter(([, b]) => b.blocks.length > 0)
        .map(([k, b]) => [k, { blocs: [...b.blocks], socle: b.socle, teleporteur: !!b.isTeleporter }])
    ),
    debrisAuSol: structuredClone(looseBlocks),
    enAttente: {
      decision: currentDecision ? { type: currentDecision.type, carte: currentDecision.cardLabel, attaquant: currentDecision.attackerId, defenseur: currentDecision.defenderId } : null,
      repli: currentRepli ? { cible: currentRepli.cible, cases: [...currentRepli.cases], defaut: currentRepli.defaut } : null,
      ecroulement: ecroulement ? { case: ecroulement.cellKey } : null,
      choixCoin: cornerChoice,
      decisionBloquante,
      placement: placementRestant.length > 0 ? [...placementRestant] : null,
    },
    // Les 30 dernieres lignes suffisent : au-dela on ne lit plus le tour en
    // cours mais l'historique de la Manche, qui n'aide pas a reproduire.
    /* Le rapport porte le texte NOMME : c'est ce que Nikola a sous les yeux
       quand il decide de signaler, et un rapport qui dit " Titan 3 " la ou son
       ecran dit " Penelope " oblige a retraduire de tete. Les acteurs partent
       en clair a cote, pour que le fichier reste exploitable sans re-parser la
       phrase. */
    journal: journal.slice(-30).map((e) => ({
      manche: e.manche,
      acteurs: e.acteurs,
      texte: nommerLigne(e.texte),
    })),
  }), [
    gameSeed, nbJoueurs, mancheNumber, phase, activePlayerId, selectedTitanId,
    apocalypseThreshold, eventsEnabled, currentEvent, gameOver, titanState,
    titanModes, titanProfiles, state, looseBlocks, currentDecision, currentRepli,
    ecroulement, cornerChoice, decisionBloquante, placementRestant, journal, nommerLigne,
  ]);

  const telechargerRapport = useCallback(() => {
    const rapport = construireRapport();
    const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const nom = `titan-rapport-M${mancheNumber}-graine${rapport.graine}-${horodatage}.json`;
    const blob = new Blob([JSON.stringify(rapport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Liberer l'URL au tour suivant : la revoquer immediatement annule le
    // telechargement sur certains navigateurs.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setActionLog((prev) => [...prev, `📋 Rapport enregistre (${nom}). Graine ${rapport.graine}.`]);
  }, [construireRapport, mancheNumber]);

  if (!setupDone) {
    /* L'écran d'accueil vivait ici, en 190 lignes de JSX au milieu de la
       logique de jeu. Il est sorti dans son propre composant : le contrôleur
       n'a pas à savoir à quoi ressemble un formulaire. */
    return (
      <SetupScreen
        nbJoueurs={nbJoueurs}
        setNbJoueurs={setNbJoueurs}
        manchesMax={manchesMax}
        titanNames={titanNames}
        setTitanNames={setTitanNames}
        titanModes={titanModes}
        setTitanModes={setTitanModes}
        eventsEnabled={eventsEnabled}
        setEventsEnabled={setEventsEnabled}
        difficulte={difficulte}
        setDifficulte={setDifficulte}
        modeVolRepos={modeVolRepos}
        setModeVolRepos={setModeVolRepos}
        apocalypseThreshold={apocalypseThreshold}
        setApocalypseThreshold={setApocalypseThreshold}
        seedInput={seedInput}
        setSeedInput={setSeedInput}
        onLancer={() => {
          regenerate(seedInput === "" ? undefined : seedInput);
          setSetupDone(true);
        }}
        /* ── PARTIE À DISTANCE ──
           L'écran d'accueil est le seul endroit où l'on peut encore choisir de
           jouer à plusieurs : une fois la partie lancée, la table est faite. */
        session={session}
        distantJoueurs={distantJoueurs}
        distantSieges={distantSieges}
        distantAvis={distantAvis}
        onBrancherSession={brancherSession}
        onQuitterSession={quitterSessionDistante}
        onPublierSieges={(sieges) => {
          setDistantSieges(sieges);
          sessionRef.current?.publierSieges(sieges);
        }}
      />
    );
  }

  // ── ÉCRAN DE JEU ──
  const tcSel = selectedTitan ? TITAN_COLORS[selectedTitan.id] : null;


  const vm = {
    /* ── PARTIE À DISTANCE ──
       Tout ce que l'interface a besoin de savoir du réseau tient ici. Le reste
       du jeu l'ignore complètement : un panneau qui affiche le plateau ne sait
       pas s'il regarde une partie locale ou distante, et c'est voulu. */
    session,
    distantInvite,
    distantHote,
    monTitanDistant,
    distantJoueurs,
    distantSieges,
    distantAvis,
    distantFin,
    distantChat,
    brancherSession,
    quitterSessionDistante,
    publierSieges: (sieges) => {
      setDistantSieges(sieges);
      return sessionRef.current?.publierSieges(sieges);
    },
    envoyerChatDistant: (texte) => sessionRef.current?.envoyerChat(texte),

    nbJoueurs,
    setNbJoueurs,
    // Le nombre de Manches de la partie vient du domaine (manchesMax), qui
    // en est propriétaire. Il était recopié en dur à deux endroits de
    // l'interface — un `nbJoueurs === 4 ? 4 : 6` qui aurait silencieusement
    // divergé le jour où la durée d'une partie change.
    manchesMaxPartie: manchesMax(nbJoueurs),
    setupDone,
    setSetupDone,
    eventsEnabled,
    setEventsEnabled,
    state,
    setState,
    titanState,
    setTitanState,
    seedCount,
    setSeedCount,
    gameSeed,
    seedInput,
    setSeedInput,
    telechargerRapport,
    showJournal,
    setShowJournal,
    showPodium,
    setShowPodium,
    versDeposesEtEngages,
    mancheNumber,
    setMancheNumber,
    activePlayerId,
    setActivePlayerId,
    titanModes,
    setTitanModes,
    titanProfiles,
    setTitanProfiles,
    profilsImposes,
    setProfilsImposes,
    profilsReveles,
    revelerProfil,
    profileLabel,
    titanNames,
    setTitanNames,
    titanDisplayName,
    titanShort,
    aiPlaying,
    setAiPlaying,
    aiStepLabel,
    setAiStepLabel,
    aiPlayingRef,
    setAiPlayingSync,
    phase,
    setPhase,
    phaseValidated,
    setPhaseValidated,
    currentEvent,
    setCurrentEvent,
    rainbowWinnerId,
    setRainbowWinnerId,
    showScoring,
    setShowScoring,
    gameOver,
    show3D,
    setShow3D,
    showRules,
    setShowRules,
    vertAssignments,
    setVertAssignments,
    vertsValides,
    validerVerts,
    preScoreSansVerts,
    apocalypseThreshold,
    setApocalypseThreshold,
    regenerate,
    advanceManche,
    canValidatePhase,
    getPhaseBlockReason,
    validatePhase,
    selectedTitanId,
    setSelectedTitanId,
    selectedTitan,
    titansByCell,
    effectivePlayers,
    titansEnAttente,
    titanCorners,
    actionLog,
    journal,
    nommerLigne,
    setActionLog,
    looseBlocks,
    setLooseBlocks,
    teaMode,
    setTeaMode,
    teaAdrenaline,
    setTeaAdrenaline,
    tcAdrenaline,
    setTcAdrenaline,
    direction,
    setDirection,
    useAdrenaline,
    setUseAdrenaline,
    jnpMode,
    setJnpMode,
    jnpSelected,
    setJnpSelected,
    bbMode,
    setBbMode,
    bbAdrenaline,
    setBbAdrenaline,
    bbDest,
    bbPath,
    setBbPath,
    setBbSurvol,
    setGraouMode,
    bbBudgetUsed,
    bbNextClickable,
    bbNextRoutes,
    bbSurvol,
    bbPathClick,
    bbUndoLastCell,
    bbDestIsBuilding,
    ecroulement,
    setEcroulement,
    ecroulementCells,
    repliQueue,
    // Exposé pour le test de non-régression du dédoublonnage : c'est le seul
    // moyen de vérifier la file sans rejouer une chaîne de réaction entière.
    enqueueReplis,
    currentRepli,
    choisirRepli,
    ecroulementPoserDebris,
    ecroulementAbandonner,
    decisionQueue,
    setDecisionQueue,
    progSelection,
    setProgSelection,
    progErreur,
    setProgErreur,
    progCountdown,
    setProgCountdown,
    progCountdownTimer,
    setProgCountdownTimer,
    volDirection,
    volResume,
    modeVolRepos,
    setVolDirection,
    fpmcPendingIds,
    setFpmcPendingIds,
    fpmcNTargets,
    setFpmcNTargets,
    fpmcAttackerId,
    setFpmcAttackerId,
    fpmcAttackerBase,
    setFpmcAttackerBase,
    fpmcCurrent,
    setFpmcCurrent,
    moveMode,
    setMoveMode,
    moveAdrenaline,
    setMoveAdrenaline,
    recupMode,
    setRecupMode,
    passifUsed,
    setPassifUsed,
    animating,
    setAnimating,
    animLabel,
    traceVol,
    setAnimLabel,
    cardsPlayedCountRef,
    pendingCardConfirm,
    setPendingCardConfirm,
    waitingNextTitan,
    setWaitingNextTitan,
    passerAuTitanSuivant,
    undoStack,
    undoTick,
    setUndoStack,
    captureSnapshot,
    prevActivePlayerRef,
    handleUndo,
    aiTriggerRef,
    aiTrigger,
    setAiTrigger,
    aiNextPlayerRef,
    aiStateRef,
    aiTitanStateRef,
    aiLooseBlocksRef,
    aiPassifUsedRef,
    aiActivePlayerIdRef,
    aiTitanModesRef,
    canUseMovePassif,
    canUseRecupPassif,
    autoResolveIaDecisions,
    enqueueDecisions,
    currentDecision,
    dilAttackerPick,
    dilValidateAttackerPick,
    resolveDilDefenderPick,
    resolveDilCancelWithAdrenaline,
    resolveRagePick,
    resolveRagePickAdrenaline,
    toggleProgCard,
    confirmProgrammation,
    chooseVolDirection,
    canPlayCard,
    canDiscardCard,
    getPlayBlockReason,
    advanceActionRound,
    markCardPlayed,
    discardCurrentCard,
    teaMaxRange,
    teaTargets,
    toggleTeaMode,
    graouMode,
    toggleGraouMode,
    jouerTeteEnAvant,
    jouerGraouhhh,
    bbMaxRange,
    bbReachable,
    bbReach,
    toggleBbMode,
    jouerBoingBoing,
    moveMaxRange,
    coutRentreeCeTour,
    cornerChoice,
    chooseCornerEntry,
    moveReachable,
    moveClassic,
    moveTeleport,
    toggleMoveMode,
    jouerMouvementGratuit,
    recupPool,
    toggleRecupMode,
    jouerRecuperation,
    jnpNbToPick,
    jnpPool,
    toggleJnpMode,
    jnpToggleCell,
    jnpPickCell,
    jouerJeNePartagePas,
    jouerFautPasMeChauffer,
    pickFpmcTarget,
    updateFpmcBid,
    revealFPMC,
    jouerToutCasser,
    toutCasserFile,
    toutCasserResoudre,
    getVertCount,
    updateVertAssignment,
    finalScoreResult,
    classementFinalPartie,
    endGameReasons,
    boardSignature3D,
    perimeterCells,
    perimeterKeys,
    energie,
    stats,
    occupiedCount,
    phaseGuidance,
    decisionBloquante,
    fatigueEnAttente,
    refuserFatigueEnCours,
    accepterFatigueEnCours,
    placementRestant,
    placementCells,
    placerTitanJoueur,
    terminerPlacement,
    tcSel
  };

  /* ── LES VRAIES FONCTIONS RESTENT SOUS LA MAIN DE L'HÔTE ──
     Le motif « ref sur la dernière version » : l'exécuteur d'intentions lit ici
     la fonction du rendu courant, sans que l'effet ait à dépendre des deux
     cents callbacks du contrôleur — un tableau de dépendances de cette taille
     ne serait ni lisible ni juste. */
  actionsRef.current = vm;

  /* ── CHEZ UN INVITÉ, UNE ACTION SE DEMANDE, ELLE NE S'EXÉCUTE PAS ──
     C'est le dernier maillon, et le seul endroit du jeu où l'interface diverge
     entre local et distant. Les panneaux appellent `vm.jouerBoingBoing()`
     exactement comme avant ; ici, cet appel devient un message.

     Le CONTEXTE part avec : les brouillons composés localement (le chemin en
     cours de tracé, la mise d'Adrénaline) n'existent que dans ce navigateur,
     et l'hôte doit les adopter avant de jouer. Sans eux, il exécuterait
     l'action avec SES propres réglages — c'est-à-dire, presque toujours, avec
     zéro Adrénaline et aucun chemin.

     Ce qui n'est PAS dans la liste blanche garde son comportement local : les
     bascules de mode, la sélection, l'affichage 3D, la page Règles. Ce sont des
     gestes qui ne touchent pas la partie, et les faire voyager n'aurait servi
     qu'à faire clignoter l'écran des autres. */
  if (distantInvite) {
    const contexteCourant = () => ({
      bbPath, bbAdrenaline, moveAdrenaline, teaAdrenaline, tcAdrenaline,
      jnpSelected, progSelection, direction, useAdrenaline,
    });
    Object.keys(ACTIONS_DISTANTES).forEach((nom) => {
      if (typeof vm[nom] !== "function") return;
      vm[nom] = (...args) => sessionRef.current?.envoyerIntention(nom, args, contexteCourant());
    });
    /* Un invité ne remonte pas le temps chez les autres : « Annuler » est un
       geste local sur une pile locale, qui n'a aucun sens partagé. On le retire
       plutôt que de laisser un bouton qui ne fait rien. */
    vm.handleUndo = () => {};
    vm.undoStack = [];
  }

  return vm;
}
