import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Domain from "../domain/index.js";
import { TITAN_COLORS } from "../ui/titans/constants.js";
import { TitanIcon } from "../ui/titans/TitanVisuals.jsx";

/* Destructuration du domaine au NIVEAU MODULE, et non plus à l'intérieur du
   hook. Ces fonctions sont des constantes de module : les déclarer dans le
   corps du composant en faisait, aux yeux de `react-hooks/exhaustive-deps`,
   des valeurs susceptibles de changer d'un rendu à l'autre — d'où une
   trentaine d'avertissements sans objet qui noyaient les vrais. Aucun
   identifiant ne change, seul leur emplacement bouge. */
const {
  STOCK_INITIAL, COULEURS, COLOR_HEX, ROWS, BUILDING_ROWS, BUILDING_COLS, socleMarker, isSocleMarker, socleValue, isBuildingCell,
  countStandingBuildings, countColorOnBoard, countActiveTeleporters, checkEndGameTriggers, manchesMax, shuffle, buildBag, getQuadrant, generateBoard,
  CORNERS, TITAN_GRADIENT, ACTION_CARDS, CARD_LABEL, PHASES, getActivePhases, PHASE_LABELS, EVENT_NAMES, CARD_FORCE, placeTitans, nextDetonateur,
  rowIndex, rowFromIndex, getPerimeter, computeEnergyToutCasser, releaseSocle, projectInDirection, estSurLePlateau, indexerTitans, rentrerEnJeu,
  resolveToutCasserBatiments, resolveToutCasserBlocs,
  resolveToutCasserTitans, resolveToutCasserAmas, resolveToutCasser, computeEnergieParDistance, PORTEE_TETE_EN_AVANT, resolveTeteEnAvant,
  resolveGraouhhh, scanGraouhhhAxis, advanceGraouhhh, isLanterneRouge, getJeNePartagePasPool, resolveJeNePartagePas, PORTEE_BOING_BOING, getBoingBoingReach, resolveBoingBoing,
  choisirRepliIA, appliquerRepli, appliquerReplElement,
  canRage, canDil, SOCLE_OPTION, getDilOptions, retirerSocleAuSort, makeDecisionRequest, getEcroulementCells, resolveEcroulementAmas,
  getActiveTeleporterCells, getFreeAdjacentCells, getMovementReachable, getMovePath, resolveFreeMovement,
  getRecuperationPool, resolveRecuperation, retirerPileVide, programCards, discardCardHidden, getNonPlayedPool, sendCardToOwnRepos, resolveVolPhaseRepos,
  resolveFatigue, applyRestitution, getProgrammedSum, getFPMCTargets, resolveFautPasMeChauffer, BAREME, BAREME_ORANGE_PAIRES, STANDARD_COLORS,
  scoreBareme, PODIUM_POINTS, rankWithTies, countRepaireColors, computeFinalScore, classementFinal,
  pick,
  // IA : profils et choix de coup (cf. src/domain/aiEvaluation.js et aiPlanner.js)
  FORCES, FORCE_SETTINGS, TEMPERAMENTS, makeProfile, profileLabel, bestVertAssignment,
  planMovement, planCardPlay, planRecuperation, planProgrammation, choisirRepartitionEcroulement
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

export function useBoardGeneratorController() {
  const [nbJoueurs, setNbJoueurs] = useState(4);
  const [setupDone, setSetupDone] = useState(false);
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
  const currentDecision = decisionQueue[0] || null;
  const currentRepli = repliQueue[0] || null;
  const [seedCount, setSeedCount] = useState(1);
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
    const forces = Object.values(FORCES);
    const temperaments = Object.values(TEMPERAMENTS);
    const out = {};
    for (let id = 1; id <= nb; id++) {
      if (modes[id] !== "ia") continue;
      out[id] = makeProfile(pick(forces), pick(temperaments));
    }
    return out;
  }, [profilsImposes]);

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
  const [vertAssignments, setVertAssignments] = useState({});
  const [apocalypseThreshold, setApocalypseThreshold] = useState(5);

  const regenerate = useCallback(() => {
    const newState = generateBoard();
    const newTitans = placeTitans(nbJoueurs);
    setState(newState);
    setTitanState(newTitans);
    setSeedCount((n) => n + 1);
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
    setBbDest(null);
    setJnpMode(false);
    setJnpSelected([]);
    setGraouMode(false);
    setVertAssignments({});
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

  const canValidatePhase = useCallback(
    (titanId) => {
      const t = titanState.players.find((p) => p.id === titanId);
      if (!t) return false;
      if (phase === "programmation") return t.programmed.length === 3;
      if (phase === "action") return t.programmed.length === 0;
      return true;
    },
    [phase, titanState.players]
  );

  const getPhaseBlockReason = useCallback(
    (titanId) => {
      const t = titanState.players.find((p) => p.id === titanId);
      if (!t) return "";
      if (phase === "programmation" && t.programmed.length !== 3) return "Programme d'abord tes 3 cartes.";
      if (phase === "action" && t.programmed.length !== 0) return "Il te reste des cartes programmées à jouer.";
      return "";
    },
    [phase, titanState.players]
  );

  const validatePhase = useCallback(
    (titanId) => {
      if (!canValidatePhase(titanId)) return;
      setPhaseValidated((prev) => ({ ...prev, [titanId]: true }));
    },
    [canValidatePhase]
  );

  useEffect(() => {
    if (!eventsEnabled || phase !== "evenement" || currentEvent !== null) return;
    const name = pick(EVENT_NAMES);
    setCurrentEvent(name);
  }, [phase, currentEvent, mancheNumber, eventsEnabled]);

  useEffect(() => {
    if (gameOver) return; // la partie est finie : plus aucune phase ne s'enchaîne
    /* Une décision née de la Phase en cours se règle DANS cette Phase.
       Sans ce garde-fou, la Phase Action pouvait se clore sur un Dilemme
       encore ouvert : le bandeau DIL et celui du Vol de Phase Repos se
       retrouvaient à l'écran en même temps, et le bloc perdu tombait sur un
       plateau que la Manche suivante avait déjà commencé à changer. */
    if (currentDecision || currentRepli || ecroulement) return;
    const ids = titanState.ordreJeu;
    const allValidated = ids.every((id) => phaseValidated[id]);
    if (!allValidated) return;
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
  }, [phaseValidated, titanState.ordreJeu, titanState.detonateur, phase, advanceManche, eventsEnabled, gameOver,
      currentDecision, currentRepli, ecroulement]);

  // Rainbow tracking
  // Bug remonté : "5 couleurs" attendu, mais le vert était explicitement
  // exclu du calcul (filtré + liste de 4 couleurs en dur, désynchronisée
  // de STANDARD_COLORS utilisée partout ailleurs pour le scoring). Le
  // livret liste bien 5 couleurs de blocs (Bleu/Rose/Orange/Rouge/Vert) —
  // recollecté sur STANDARD_COLORS pour ne plus jamais diverger.
  useEffect(() => {
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
  const [movingTitanOverride, setMovingTitanOverride] = useState(null); // { titanId, cell } hoisted before first use
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
    if (phase === "action" && activePlayerId != null && titanModes[activePlayerId] !== "ia") {
      setSelectedTitanId(activePlayerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayerId, phase]);
  const selectedTitan = titanState.players.find((t) => t.id === selectedTitanId) || null;
  // Pendant animation de déplacement, on substitue la position visuelle du Titan animé
  const effectivePlayers = movingTitanOverride
    ? titanState.players.map((t) =>
        t.id === movingTitanOverride.titanId ? { ...t, cell: movingTitanOverride.cell } : t
      )
    : titanState.players;
  // Un Titan éjecté n'est PAS sur le plateau : il ne doit apparaître ni sur
  // la grille 2D, ni en 3D, ni dans aucun calcul d'occupation. Sa `cell`
  // n'indique plus où il est mais par où il rentrera à son tour.
  const titansByCell = indexerTitans(effectivePlayers);
  const titansEnAttente = titanState.players.filter((t) => !estSurLePlateau(t));
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
  const [bbMode, setBbMode] = useState(false);
  const [bbAdrenaline, setBbAdrenaline] = useState(0);
  const [bbDest, setBbDest] = useState(null);
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
  const [volDirection, setVolDirection] = useState(null);
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
  const [animating, setAnimating] = useState(false);
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
  const captureSnapshot = useCallback(() => {
    setUndoStack((prev) => [...prev, {
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
      currentEvent,
      rainbowWinnerId,
      vertAssignments: structuredClone(vertAssignments),
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
    }]);
  }, [
    state, titanState, looseBlocks, activePlayerId, phase, passifUsed, actionLog, waitingNextTitan,
    decisionQueue, repliQueue, ecroulement, fpmcAttackerId, fpmcPendingIds, fpmcNTargets,
    fpmcAttackerBase, fpmcCurrent, mancheNumber, phaseValidated, volDirection, currentEvent,
    rainbowWinnerId, vertAssignments, gameOver, showScoring, coutRentree,
  ]);

  // Vide l'historique quand le joueur actif change (tour terminé = irréversible)
  const prevActivePlayerRef = useRef(activePlayerId);
  useEffect(() => {
    if (prevActivePlayerRef.current !== activePlayerId) {
      setUndoStack([]);
      prevActivePlayerRef.current = activePlayerId;
    }
  }, [activePlayerId]);

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
    const snap = undoStack[undoStack.length - 1];
    setState(structuredClone(snap.state));
    setTitanState(structuredClone(snap.titanState));
    setLooseBlocks(structuredClone(snap.looseBlocks));
    setActivePlayerId(snap.activePlayerId);
    setPhase(snap.phase);
    setPassifUsed(structuredClone(snap.passifUsed));
    setActionLog([...snap.actionLog]);
    setMoveMode(false); setRecupMode(false); setBbMode(false); setBbDest(null);
    setJnpMode(false); setJnpSelected([]); setGraouMode(false);
    /* Les files en attente sont RESTAURÉES, plus vidées. Les vider défaisait
       le plateau sans défaire les décisions qu'il avait déclenchées : on
       revenait avant la carte, mais le Dilemme qu'elle avait ouvert restait
       dû — ou disparaissait, selon la file. Ni l'un ni l'autre n'est une
       annulation. */
    setDecisionQueue(structuredClone(snap.decisionQueue || []));
    setRepliQueue(structuredClone(snap.repliQueue || []));
    setEcroulement(snap.ecroulement ? structuredClone(snap.ecroulement) : null);
    setFpmcAttackerId(snap.fpmc?.attackerId ?? null);
    setFpmcPendingIds([...(snap.fpmc?.pendingIds || [])]);
    setFpmcNTargets(snap.fpmc?.nTargets ?? 0);
    setFpmcAttackerBase(snap.fpmc?.attackerBase ?? 0);
    setFpmcCurrent(snap.fpmc?.current ? { ...snap.fpmc.current } : null);
    setMancheNumber(snap.mancheNumber);
    setPhaseValidated({ ...(snap.phaseValidated || {}) });
    setVolDirection(snap.volDirection ?? null);
    setCurrentEvent(snap.currentEvent ?? null);
    setRainbowWinnerId(snap.rainbowWinnerId ?? null);
    setVertAssignments(structuredClone(snap.vertAssignments || {}));
    setGameOver(Boolean(snap.gameOver));
    setShowScoring(Boolean(snap.showScoring));
    setCoutRentree(snap.coutRentree ? { ...snap.coutRentree } : null);
    setMovingTitanOverride(null);
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
    setUndoTick((n) => n + 1);
    setUndoStack((prev) => prev.slice(0, -1));
  }, [undoStack]);

  useEffect(() => {
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
  useEffect(() => {
    if (phase !== "action" || activePlayerId == null) { setCoutRentree(null); return; }
    const joueur = aiTitanStateRef.current.players.find((t) => t.id === activePlayerId);
    if (!joueur?.horsPlateau) { setCoutRentree(null); return; }
    const retour = rentrerEnJeu(activePlayerId, {
      board: aiStateRef.current.board,
      titans: aiTitanStateRef.current.players,
      looseBlocks: aiLooseBlocksRef.current,
    });
    setActionLog((prev) => [...prev, ...retour.log]);
    // La rentrée se paie sur le Mouvement gratuit du tour : il lui reste
    // d'autant moins de cases à parcourir, et il devra peut-être dépenser
    // une Adrénaline pour retrouver de la marge.
    setCoutRentree(retour.rentre ? { titanId: activePlayerId, cout: retour.cout } : null);
    if (retour.rentre) setTitanState((p) => ({ ...p, players: [...p.players] }));
    // Tout le reste est lu via les refs « live » : cet effet ne dépend
    // réellement que du Titan actif et de la Phase, et le contrôle des
    // dépendances n'a plus rien à redire — la désactivation qui vivait ici
    // était devenue sans objet.
  }, [activePlayerId, phase]);

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

  useEffect(() => {
    if (!setupDone) return;
    if (phase !== "action") return;
    if (activePlayerId == null) return;
    if (titanModes[activePlayerId] !== "ia") return;
    if (aiPlayingRef.current) return;

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
        const jeu = { titans: curTitanState.players, board: curState.board, looseBlocks: curLooseBlocks };
        // Portée réduite si le Titan vient de rentrer sur le plateau : sa
        // rentrée a consommé une partie de son Mouvement gratuit.
        const deja = coutRentreeRef.current && coutRentreeRef.current.titanId === playerId
          ? coutRentreeRef.current.cout
          : 0;
        const choix = planMovement(playerId, jeu, profilDe(playerId), Math.max(0, 2 - deja));
        if (choix) {
          resolveFreeMovement(playerId, choix.destKey, jeu);
          setTitanState((p) => ({ ...p, players: [...p.players] }));
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

        const jeu2 = { board: curState2.board, titans: curTitanState2.players, looseBlocks: curLooseBlocks2 };
        const move = planCardPlay(playerId, jeu2, profilDe(playerId), mancheNumber);
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
          const d = dir || { dr: -1, dc: 0 };
          const res = resolveGraouhhh(playerId, d.dr, d.dc, mancheNumber, jeu2);
          newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
          setLooseBlocks((p) => ({ ...p }));
        } else if (cardId === "boing_boing") {
          if (dest) {
            const res = resolveBoingBoing(playerId, dest, mise, mancheNumber, jeu2);
            newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
            // L'IA n'a pas d'interface de répartition : elle applique la
            // répartition par défaut, cases vierges d'abord.
            if (res.ecroulement) {
              const choix = choisirRepartitionEcroulement(res.ecroulement, jeu2);
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
  }, [setupDone, phase, activePlayerId, titanModes, aiTrigger]);

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
    const curTitanState = aiTitanStateRef.current;
    curTitanState.ordreJeu.forEach((id) => {
      if (titanModes[id] === "ia" && !phaseValidated[id]) {
        if (phase === "programmation") {
          const t = curTitanState.players.find((p) => p.id === id);
          if (t && t.programmed.length < 3 && t.hand.length >= 3) {
            // Troisième molette du profil : le Novice programme au hasard
            // (l'erreur classique du débutant, qui subit sa programmation
            // au lieu de la préparer), les autres retiennent les cartes
            // qui rapporteraient le plus dans la situation présente.
            const chosen = planProgrammation(
              id,
              { titans: curTitanState.players, board: aiStateRef.current.board, looseBlocks: aiLooseBlocksRef.current },
              profilDe(id),
              mancheNumber
            );
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
  }, [setupDone, phase, titanModes, phaseValidated]);

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
        if (offered.length === 1) {
          const suffixe = acheminerBlocPerdu(d, defender, attacker, offered[0].color);
          setActionLog((prev) => [...prev, `DIL IA↔IA (${d.cardLabel}) : T${d.defenderId} perd ${offered[0].color} (seul choix)${suffixe}`]);
        } else {
          const defValued = offered.map((o) => ({ ...o, defVal: coutOptionDil(o.color, defender, curPlayers) }));
          const defChoice = defValued.reduce((best, curr) => curr.defVal < best.defVal ? curr : best);
          const suffixe = acheminerBlocPerdu(d, defender, attacker, defChoice.color);
          setActionLog((prev) => [...prev, `DIL IA↔IA (${d.cardLabel}) : T${d.defenderId} perd ${defChoice.color} (valeur marginale ${defChoice.defVal})${suffixe}`]);
        }
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
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setDecisionQueue((prev) => [
      ...prev,
      ...humanDecisions.map((d) => {
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

        return {
          ...d,
          id: Math.random().toString(36).slice(2, 9),
          stage: preset ? "DEFENDER_PICK" : "ATTACKER_PICK",
          attackerChoices: preset || [],
          autoAttackerPick: Boolean(preset) && !d.presetAttackerChoices,
        };
      }),
    ]);
    return humanDecisions;
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

    for (const r of liste) {
      if (r.cases.length <= 1) continue;
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
  const advanceGraouhhhLoop = useCallback((continuation) => {
    const gameState = { board: state.board, titans: titanState.players, looseBlocks, replis: [] };
    let cont = continuation;
    for (;;) {
      const result = advanceGraouhhh(gameState, cont);
      if (result.log.length > 0) setActionLog((prev) => [...prev, ...result.log]);
      if (result.done) break;
      const humanDecisions = enqueueDecisions([{ ...result.decision, graouhhh: result.continuation }]);
      if (humanDecisions && humanDecisions.length > 0) break;
      cont = result.continuation;
    }
    enqueueReplis(gameState.replis);
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [state.board, titanState.players, looseBlocks, enqueueDecisions, enqueueReplis]);

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

         L'arbitrage se fait au vrai barème, sans table de poids : une
         Adrénaline vaut 3 points au décompte final. La donner en coûte donc
         3, et 6 en différentiel pour qui suit ses adversaires, puisqu'elle
         passe chez l'attaquant. Elle paie quand le bloc menacé lui coûte
         davantage — typiquement un Socle de valeur, ou une couleur qui casse
         une paire d'Orange. */
      const voitAdversaires = FORCE_SETTINGS[aiTitanProfilesRef.current[cur.defenderId]?.force]?.voitAdversaires;
      const coutAdrenaline = voitAdversaires ? 6 : 3;
      if ((defender.adrenaline || 0) >= 1 && defChoice.defVal > coutAdrenaline) {
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

  const toggleProgCard = useCallback((cardId) => {
    setProgSelection((prev) => {
      if (prev.includes(cardId)) {
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
        return prev.filter((c) => c !== cardId); // désélection = annulation de cette carte seule
      }
      if (prev.length >= 3) return prev;
      const next = [...prev, cardId];
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
                const res = programCards(selectedTitanId, cur, curPlayers);
                if (res.ok) {
                  setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
                  setPhaseValidated((prev) => ({ ...prev, [selectedTitanId]: true }));
                  setActionLog((p) => [...p, `✅ T${selectedTitanId} programme : ${cur.map((c) => CARD_LABEL[c]).join(", ")}`]);
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
    const res = programCards(selectedTitanId, progSelection, titanState.players);
    if (!res.ok) {
      setActionLog((prev) => [...prev, `⚠️ ${res.reason}`]);
      return;
    }
    setActionLog((prev) => [...prev, `✅ T${selectedTitanId} programme : ${progSelection.map((c) => CARD_LABEL[c]).join(", ")}`]);
    setProgSelection([]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, progSelection, titanState.players]);

  const chooseVolDirection = useCallback(
    (direction) => {
      if (volDirection) return; // déjà résolu cette Manche
      captureSnapshot();
      setVolDirection(direction);
      const result = resolveVolPhaseRepos(mancheNumber, direction, titanState.ordreJeu, titanState.players);
      setActionLog((prev) => [...prev, `Vol Phase Repos — sens ${direction === "gauche" ? "⬅️ antihoraire" : "➡️ horaire"} choisi par le Détonateur (Titan ${titanState.detonateur}).`, ...result.log]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      // Aucune action individuelle à valider en Phase Repos (résolution
      // automatique) : on marque tout le monde validé pour déclencher la
      // transition normale (useEffect phaseValidated → advanceManche).
      setPhaseValidated((prev) => {
        const updated = { ...prev };
        titanState.ordreJeu.forEach((id) => { updated[id] = true; });
        return updated;
      });
    },
    [volDirection, mancheNumber, titanState.ordreJeu, titanState.players, titanState.detonateur, captureSnapshot]
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
      return true;
    },
    [phase, selectedTitan, activePlayerId, waitingNextTitan]
  );

  const getPlayBlockReason = useCallback(
    (cardId) => {
      if (!selectedTitan) return "";
      if (phase !== "action") return `Phase : ${PHASE_LABELS[phase]}`;
      if (selectedTitan.id !== activePlayerId) return `Pas le tour de T${selectedTitan.id}`;
      if (!selectedTitan.programmed.includes(cardId)) return `${CARD_LABEL[cardId]} non programmée.`;
      if (waitingNextTitan) return `Confirme "Titan suivant" avant de continuer.`;
      return "";
    },
    [phase, selectedTitan, activePlayerId, waitingNextTitan]
  );

  // Logique d'avancement de round (Phase Action) — commune à "jouer une
  // carte avec effet" (markCardPlayed) et "défausser sans jouer"
  // (discardCurrentCard, session) : dans les deux cas, 1 carte a été
  // désignée pour ce round et le tour doit passer au Titan suivant selon
  // les mêmes règles (1 carte/Titan/round, 3 rounds/Manche).
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
        // 3 rounds terminés → fin de phase action
        aiNextPlayerRef.current = null; // aucun Titan suivant : évite une relecture stale par finishAiTurn
        setActivePlayerId(null);
        setPhaseValidated((prev) => {
          const updated = { ...prev };
          ordreJeu.forEach((id) => { updated[id] = true; });
          return updated;
        });
        return;
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
  }, []);

  const markCardPlayed = useCallback(
    (titanId, cardId) => {
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

      // 2. Avancer le tour dans le round (1 carte par Titan, 3 rounds)
      advanceActionRound(titanId);
    },
    [advanceActionRound]
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
      if (logMsg) setActionLog((prevLog) => [...prevLog, logMsg]);
      advanceActionRound(titanId);
    },
    [advanceActionRound, captureSnapshot]
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
        const titansByCell2 = {};
        titanState.players.forEach((t) => (titansByCell2[t.cell] = t.id));
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
    setBbMode(false); setBbDest(null);
    setJnpMode(false); setJnpSelected([]);
  }, []);

  const toggleGraouMode = useCallback(() => {
    setGraouMode((m) => { const next = !m; if (next) { setTeaMode(false); setBbMode(false); setBbDest(null); setJnpMode(false); setJnpSelected([]); } return next; });
  }, []);

  const toggleTeaMode = useCallback(() => {
    setTeaMode((m) => { const next = !m; if (next) { setGraouMode(false); setBbMode(false); setBbDest(null); setJnpMode(false); setJnpSelected([]); } return next; });
  }, []);

  const jouerTeteEnAvant = useCallback((targetKey) => {
    if (!selectedTitanId || !canPlayCard("tete_en_avant")) return;
    const dir = teaTargets.get(targetKey);
    if (!dir) return;
    captureSnapshot();
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    const actuallyUseAdrenaline = Math.min(teaAdrenaline, attacker.adrenaline || 0);
    const replis = [];
    const result = resolveTeteEnAvant(selectedTitanId, dir.dr, dir.dc, actuallyUseAdrenaline, {
      board: state.board, titans: titanState.players, looseBlocks, replis,
    });
    if (actuallyUseAdrenaline) attacker.adrenaline -= actuallyUseAdrenaline;
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    enqueueReplis(replis);
    markCardPlayed(selectedTitanId, "tete_en_avant");
    setTeaMode(false);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, teaTargets, teaAdrenaline, state.board, titanState.players, looseBlocks, enqueueDecisions, enqueueReplis, canPlayCard, markCardPlayed, captureSnapshot]);

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
    setBbDest(null);
  }, []);
  const bbSelectCell = useCallback((key) => { if (!bbReachable.has(key)) return; setBbDest((prev) => (prev === key ? null : key)); }, [bbReachable]);

  const jouerBoingBoing = useCallback(() => {
    if (!selectedTitanId || !bbDest || !canPlayCard("boing_boing")) return;
    captureSnapshot();
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    const actuallyUseAdrenaline = Math.min(bbAdrenaline, attacker.adrenaline || 0);
    const replis = [];
    const result = resolveBoingBoing(selectedTitanId, bbDest, actuallyUseAdrenaline, mancheNumber, {
      board: state.board, titans: titanState.players, looseBlocks, replis,
    });
    if (result.applied && actuallyUseAdrenaline) attacker.adrenaline -= actuallyUseAdrenaline;
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    enqueueReplis(replis);
    // Atterrissage sur un Amas : la carte est jouée, mais la répartition des
    // débris revient au joueur, case par case (ruling Nikola du 2026-08-16).
    if (result.ecroulement) setEcroulement({ ...result.ecroulement, choix: [] });
    if (result.applied) { markCardPlayed(selectedTitanId, "boing_boing"); setBbMode(false); setBbDest(null); }
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, bbDest, bbAdrenaline, state.board, titanState.players, looseBlocks, enqueueDecisions, enqueueReplis, mancheNumber, canPlayCard, markCardPlayed, captureSnapshot]);

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
  }, [repliQueue, captureSnapshot]);

  const ecroulementPoserDebris = useCallback((cellKey) => {
    setEcroulement((prev) => {
      if (!prev || prev.choix.length >= prev.blocs.length) return prev;
      return { ...prev, choix: [...prev.choix, cellKey] };
    });
  }, []);
  const ecroulementAnnulerDernier = useCallback(() => {
    setEcroulement((prev) => (prev && prev.choix.length > 0 ? { ...prev, choix: prev.choix.slice(0, -1) } : prev));
  }, []);
  const ecroulementValider = useCallback(() => {
    if (!ecroulement || ecroulement.choix.length !== ecroulement.blocs.length) return;
    captureSnapshot();
    const replis = [];
    const result = resolveEcroulementAmas(
      activePlayerId,
      { cellKey: ecroulement.cellKey, blocs: ecroulement.blocs, energie: ecroulement.energie },
      ecroulement.choix,
      { board: state.board, titans: titanState.players, looseBlocks, replis }
    );
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueReplis(replis);
    setEcroulement(null);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [ecroulement, activePlayerId, state.board, titanState.players, looseBlocks, enqueueReplis, captureSnapshot]);
  const { reachable: moveReachable, classic: moveClassic, teleport: moveTeleport } = selectedTitan
    ? getMovementReachable(selectedTitan.cell, moveMaxRange, state.board, titansByCell, looseBlocks)
    : { reachable: new Set(), classic: new Set(), teleport: new Set() };

  const toggleMoveMode = useCallback(() => {
    if (!moveMode && !canUseMovePassif(selectedTitanId)) return;
    setMoveMode((m) => !m);
  }, [moveMode, canUseMovePassif, selectedTitanId]);

  const jouerMouvementGratuit = useCallback(
    (destKey) => {
      if (!selectedTitanId || !moveReachable.has(destKey) || !canUseMovePassif(selectedTitanId)) return;
      captureSnapshot();
      const attackerSnap = titanState.players.find((t) => t.id === selectedTitanId);
      if (!attackerSnap) return;
      const actuallyUseAdrenaline = Math.min(moveAdrenaline, attackerSnap.adrenaline || 0);
      // Calculer le chemin pour animation case/case (lecture seule, sûr même sur un snapshot figé)
      const path = getMovePath(attackerSnap.cell, destKey, moveMaxRange, state.board, titansByCell, looseBlocks);
      setMoveMode(false);
      setAnimating(true);
      setAnimLabel(`Titan ${selectedTitanId} se déplace…`);
      // Animer chaque case du chemin (hors case de départ) à 1s d'intervalle
      const steps = path.slice(1); // exclure la case de départ
      let i = 0;
      const titanIdSnap = selectedTitanId;

      // FIX (bug hunt) : la résolution réelle (mutation + coût Adrénaline)
      // est appliquée ICI, au moment où l'animation se termine, en relisant
      // l'état LIVE via aiTitanStateRef (toujours synchronisé après chaque
      // render, même pattern que le flux IA) — jamais via une copie figée
      // prise avant l'animation. Avant ce fix, `freshPlayers` était cloné en
      // tout début de fonction puis réinjecté tel quel 1 à plusieurs
      // secondes plus tard : toute mise à jour concurrente (ex. résolution
      // DIL/RAGE globale, indépendante du joueur actif, survenant pendant
      // l'animation) était silencieusement écrasée.
      const applyFinalMove = () => {
        setMovingTitanOverride(null);
        const livePlayers = aiTitanStateRef.current.players;
        const result = resolveFreeMovement(titanIdSnap, destKey, { titans: livePlayers, board: state.board, looseBlocks });
        if (actuallyUseAdrenaline) {
          const a = livePlayers.find((t) => t.id === titanIdSnap);
          if (a) a.adrenaline -= actuallyUseAdrenaline;
        }
        setActionLog((prev) => [...prev, ...result.log]);
        setPassifUsed((prev) => ({ ...prev, [titanIdSnap]: { ...(prev[titanIdSnap] || {}), move: true } }));
        setTitanState((prev) => ({ ...prev, players: [...prev.players] })); // force re-render, mêmes objets déjà mutés
        setAnimating(false);
        setAnimLabel("");
      };

      const tick = () => {
        if (i < steps.length - 1) {
          setMovingTitanOverride({ titanId: titanIdSnap, cell: steps[i] });
          i++;
          setTimeout(tick, 1000);
        } else {
          applyFinalMove();
        }
      };
      if (steps.length > 0) setTimeout(tick, 1000);
      else applyFinalMove(); // fallback direct (même case)
    },
    [selectedTitanId, moveReachable, moveAdrenaline, moveMaxRange, titanState.players, titansByCell, canUseMovePassif, captureSnapshot, state.board, looseBlocks]
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

  const jnpNbToPick = selectedTitanId ? (isLanterneRouge(selectedTitanId, { titans: titanState.players }) ? 3 : 2) : 2;
  const jnpPool = useMemo(
    () => (selectedTitanId
      ? new Set(getJeNePartagePasPool(selectedTitanId, { titans: titanState.players, looseBlocks }))
      : new Set()),
    [selectedTitanId, titanState.players, looseBlocks]
  );
  const toggleJnpMode = useCallback(() => {
    setJnpMode((m) => { const next = !m; if (next) { setTeaMode(false); setGraouMode(false); setBbMode(false); setBbDest(null); } return next; });
    setJnpSelected([]);
  }, []);
  const jnpToggleCell = useCallback((key) => {
    if (!jnpPool.has(key)) return;
    setJnpSelected((prev) => { if (prev.includes(key)) return prev.filter((k) => k !== key); if (prev.length >= jnpNbToPick) return prev; return [...prev, key]; });
  }, [jnpPool, jnpNbToPick]);
  const jouerJeNePartagePas = useCallback(() => {
    if (!selectedTitanId || !canPlayCard("je_ne_partage_pas")) return;
    captureSnapshot();
    const result = resolveJeNePartagePas(selectedTitanId, jnpSelected, { titans: titanState.players, looseBlocks, board: state.board });
    setActionLog((prev) => [...prev, ...result.log]);
    if (result.applied) { markCardPlayed(selectedTitanId, "je_ne_partage_pas"); setJnpMode(false); setJnpSelected([]); }
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, jnpSelected, titanState.players, looseBlocks, state.board, canPlayCard, markCardPlayed, captureSnapshot]);

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
    const result = resolveFautPasMeChauffer(fpmcAttackerId, cur.defenderId, fpmcNTargets, {
      board: state.board, titans: titanState.players, looseBlocks, replis,
    }, { attackerBid: cur.attackerBid, defenderBid: cur.defenderBid });

    attacker.adrenaline = Math.max(0, (attacker.adrenaline || 0) - cur.attackerBid);
    defender.adrenaline = Math.max(0, (defender.adrenaline || 0) - cur.defenderBid);
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    enqueueReplis(replis);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setFpmcCurrent(null);
  }, [fpmcCurrent, fpmcAttackerId, fpmcNTargets, titanState.players, state.board, looseBlocks, enqueueDecisions, enqueueReplis, captureSnapshot]);

  const jouerToutCasser = useCallback(() => {
    if (!selectedTitanId || !canPlayCard("tout_casser")) return;
    captureSnapshot();
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    // Bug trouvé au scan : le débit était figé à 1 (`attacker.adrenaline -= 1`)
    // alors que le bonus d'énergie, lui, passait entier au résolveur. Miser
    // deux Adrénalines sur Tout Casser rendait donc la seconde gratuite.
    const bonus = Math.min(Number(tcAdrenaline) || 0, attacker.adrenaline || 0);
    if (bonus > 0) attacker.adrenaline -= bonus;
    const replis = [];
    const result = resolveToutCasser(selectedTitanId, { board: state.board, titans: titanState.players, looseBlocks, replis }, bonus);
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    enqueueReplis(replis);
    markCardPlayed(selectedTitanId, "tout_casser");
    setTcAdrenaline(0); // état numérique : `false` y était écrit par erreur
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, tcAdrenaline, state.board, titanState.players, looseBlocks, enqueueDecisions, enqueueReplis, canPlayCard, markCardPlayed, captureSnapshot]);

  const getVertCount = useCallback((titan) => titan.repaire.filter((c) => c === "vert").length, []);

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
    if (!gameOver) return;
    const aFaire = titanState.players.filter(
      (t) => titanModes[t.id] === "ia"
        && getVertCount(t) > 0
        && (vertAssignments[t.id] || []).filter(Boolean).length < getVertCount(t)
    );
    if (aFaire.length === 0) return;
    const dejaPosees = { ...vertAssignments };
    const ajouts = {};
    const journal = [];
    for (const t of aFaire) {
      const choix = bestVertAssignment(t.id, titanState.players, { exact: true, autres: dejaPosees });
      ajouts[t.id] = choix;
      dejaPosees[t.id] = choix;
      // Le journal dit QUE l'IA a placé, jamais OÙ. Il est consultable à
      // tout moment : y écrire le détail rouvrait par la porte de derrière
      // le secret que l'écran de placement vient de fermer. Le détail
      // s'affiche dans ce même écran, une fois tout le monde placé.
      journal.push(`🤖 ${titanDisplayName(t.id)} (IA) place ses ${choix.length} Bloc(s) Vert, en secret.`);
    }
    setVertAssignments((prev) => ({ ...prev, ...ajouts }));
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

  // Le tableau de scoring affichait une colonne par Titan et un total, sans
  // jamais désigner de vainqueur : au joueur de comparer les chiffres à
  // l'œil. Le classement est calculé ici, départage compris (Adrénaline,
  // plus haut Socle, Force des cartes non jouées — ruling du 2026-08-15).
  const classementFinalPartie = finalScoreResult
    ? classementFinal(titanState.players, finalScoreResult.totals)
    : null;

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
  const decisionBloquante = currentDecision
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

  const perimeterCells = selectedTitan
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
          Math.min(Number(tcAdrenaline) || 0, selectedTitan.adrenaline || 0)
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
  if (!setupDone) {
    return (
      <div style={{
        fontFamily: "'Outfit', Arial, sans-serif",
        background: "linear-gradient(180deg, #2d1d5d 0%, #0a0212 100%)",
        color: "#fffaee", padding: 32, borderRadius: 20, maxWidth: 500, margin: "0 auto",
      }}>
        <h2 style={{ fontFamily: "'Bowlby One', sans-serif", color: "#FFD93D", fontSize: "1.15rem", marginBottom: 6 }}>
          PROJET TITAN — Configuration
        </h2>
        <p style={{ fontSize: ".78rem", color: "rgba(255,255,255,.55)", marginBottom: 22 }}>
          Paramètre la partie avant de lancer. Ces réglages sont <strong style={{ color: "#FFD93D" }}>verrouillés au démarrage</strong>.
        </p>

        <div style={{ marginBottom: 18 }}>
          <div style={{ color: "#FFD93D", fontFamily: "'Bowlby One', sans-serif", fontSize: ".78rem", marginBottom: 8 }}>
            Nombre de Titans
          </div>
          {/* Même police que les boutons Humain / IA plus bas : Bowlby One
              sur un libellé de bouton étirait le texte et jurait avec le
              reste du formulaire. Le nombre garde du poids, la précision
              entre parenthèses passe en seconde ligne discrète. */}
          <div style={{ display: "flex", gap: 8 }}>
            {[3, 4].map((n) => {
              const on = nbJoueurs === n;
              return (
                <button key={n} onClick={() => setNbJoueurs(n)} style={{
                  flex: 1,
                  background: on ? "linear-gradient(135deg,#ff9239,#FF2E63)" : "rgba(255,255,255,.07)",
                  border: `1px solid ${on ? "transparent" : "rgba(255,255,255,.18)"}`,
                  borderRadius: 10, color: on ? "#fff" : "rgba(255,255,255,.75)",
                  padding: "9px 0", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                }}>
                  <span style={{ fontSize: ".82rem", fontWeight: 700 }}>{n} Titans</span>
                  <span style={{ fontSize: ".68rem", opacity: on ? 0.85 : 0.5 }}>
                    {manchesMax(n)} Manches
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{
            color: "#FFD93D", fontFamily: "'Bowlby One', sans-serif", fontSize: ".78rem",
            marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
          }}>
            <img
              src={`${import.meta.env.BASE_URL}assets/rules/titan.png`}
              alt="" aria-hidden="true"
              style={{ width: 20, height: 20, objectFit: "contain", filter: "brightness(1.2)" }}
            />
            Titans
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Array.from({ length: nbJoueurs }, (_, i) => i + 1).map((id) => {
              const tc = TITAN_COLORS[id];
              const mode = titanModes[id] || "humain";
              return (
                // La ligne prend la couleur du Titan : liseré et fond teintés
                // par son accent, au lieu d'un gris uniforme qui ne disait pas
                // à qui appartenait la ligne.
                <div key={id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: `${tc?.accent || "#ffffff"}0f`,
                  border: `1px solid ${tc?.accent || "rgba(255,255,255,.2)"}44`,
                  borderRadius: 10, padding: "8px 10px", flexWrap: "wrap",
                }}>
                  <TitanIcon titanId={id} size={28} variant="plain" />
                  {/* Le champ ne porte plus ni cadre ni fond propres : il se
                      fond dans la ligne du Titan, avec un simple soulignement
                      à sa couleur. Le texte saisi reste blanc — en couleur
                      d'accent sur fond teinté, un nom devenait illisible. */}
                  <input
                    type="text"
                    value={titanNames[id]}
                    onChange={(e) => setTitanNames((prev) => ({ ...prev, [id]: e.target.value.slice(0, 18) }))}
                    placeholder={`Titan ${id}`}
                    maxLength={18}
                    style={{
                      flex: 1, minWidth: 110,
                      background: "transparent",
                      border: "none",
                      borderBottom: `1.5px solid ${tc?.accent || "rgba(255,255,255,.25)"}66`,
                      borderRadius: 0,
                      color: "#fffaee", padding: "5px 2px", fontSize: ".82rem",
                      fontWeight: 600, outline: "none",
                    }}
                    title="Choisis le nom de ton Titan (18 caractères max)"
                  />
                  <div style={{ display: "flex", gap: 5 }}>
                    {["humain", "ia"].map((m) => (
                      <button key={m} onClick={() => setTitanModes((prev) => ({ ...prev, [id]: m }))} style={{
                        background: mode === m
                          ? (m === "humain" ? "linear-gradient(135deg,#16E08C,#00C97A)" : "linear-gradient(135deg,#6366f1,#a855f7)")
                          : "rgba(255,255,255,.07)",
                        border: "none", borderRadius: 8, color: mode === m ? "#0E0420" : "rgba(255,255,255,.5)",
                        padding: "5px 10px", fontSize: ".72rem", fontWeight: 700, cursor: "pointer",
                      }}>
                        {m === "humain" ? "👤 Humain" : "🤖 IA"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ color: "#FFD93D", fontFamily: "'Bowlby One', sans-serif", fontSize: ".78rem", marginBottom: 8 }}>
            Modes de jeu
          </div>
          <label style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.15)",
            borderRadius: 10, padding: "10px 12px", cursor: "pointer", fontSize: ".78rem",
          }}>
            <input type="checkbox" checked={eventsEnabled} onChange={(e) => setEventsEnabled(e.target.checked)} />
            <span>
              <strong style={{ color: "#71dbff" }}>🎲 Événements</strong>
              <div style={{ color: "rgba(255,255,255,.5)", fontSize: ".72rem", marginTop: 2 }}>
                Ajoute la Phase 1 à chaque Manche (stub — effets codés plus tard).
              </div>
            </span>
          </label>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ color: "#FFD93D", fontFamily: "'Bowlby One', sans-serif", fontSize: ".78rem", marginBottom: 8 }}>
            🏙️ Seuil Apocalypse Urbaine
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.15)",
            borderRadius: 10, padding: "10px 12px",
          }}>
            <input type="number" min="0" max="24" value={apocalypseThreshold}
              onChange={(e) => setApocalypseThreshold(Math.max(0, Math.min(24, Number(e.target.value) || 0)))}
              style={{ width: 60, background: "rgba(255,255,255,.08)", color: "#fffaee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "6px 8px" }}
            />
            <span style={{ fontSize: ".74rem", color: "rgba(255,255,255,.55)" }}>
              bâtiments encore debout = fin de partie.
            </span>
          </div>
        </div>

        <button
          onClick={() => { regenerate(); setSetupDone(true); }}
          style={{
            width: "100%", background: "linear-gradient(135deg,#16E08C,#00C97A)", border: "none",
            borderRadius: 10, color: "#0E0420", fontWeight: 700, padding: "12px 0",
            fontFamily: "'Bowlby One', sans-serif", fontSize: ".82rem", cursor: "pointer",
          }}
        >
          🏙️ Lancer la partie
        </button>
      </div>
    );
  }

  // ── ÉCRAN DE JEU ──
  const tcSel = selectedTitan ? TITAN_COLORS[selectedTitan.id] : null;


  return {
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
    apocalypseThreshold,
    setApocalypseThreshold,
    regenerate,
    advanceManche,
    canValidatePhase,
    getPhaseBlockReason,
    validatePhase,
    movingTitanOverride,
    setMovingTitanOverride,
    selectedTitanId,
    setSelectedTitanId,
    selectedTitan,
    titansByCell,
    effectivePlayers,
    titansEnAttente,
    titanCorners,
    actionLog,
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
    setBbDest,
    ecroulement,
    ecroulementCells,
    repliQueue,
    currentRepli,
    choisirRepli,
    ecroulementPoserDebris,
    ecroulementAnnulerDernier,
    ecroulementValider,
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
    setAnimLabel,
    cardsPlayedCountRef,
    pendingCardConfirm,
    setPendingCardConfirm,
    waitingNextTitan,
    setWaitingNextTitan,
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
    bbSelectCell,
    jouerBoingBoing,
    moveMaxRange,
    coutRentreeCeTour,
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
    jouerJeNePartagePas,
    jouerFautPasMeChauffer,
    pickFpmcTarget,
    updateFpmcBid,
    revealFPMC,
    jouerToutCasser,
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
    tcSel
  };
}
