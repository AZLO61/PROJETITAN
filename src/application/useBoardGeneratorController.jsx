import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Domain from "../domain/index.js";
import { TITAN_COLORS } from "../ui/titans/constants.js";
import { TitanIcon } from "../ui/titans/TitanVisuals.jsx";

export function useBoardGeneratorController() {
  const {
    STOCK_INITIAL, COULEURS, COLOR_HEX, ROWS, BUILDING_ROWS, BUILDING_COLS, socleMarker, isSocleMarker, socleValue, isBuildingCell,
    countStandingBuildings, countColorOnBoard, countActiveTeleporters, checkEndGameTriggers, shuffle, buildBag, getQuadrant, generateBoard,
    CORNERS, TITAN_GRADIENT, ACTION_CARDS, CARD_LABEL, PHASES, getActivePhases, PHASE_LABELS, EVENT_NAMES, CARD_FORCE, placeTitans, nextDetonateur,
    rowIndex, rowFromIndex, getPerimeter, computeEnergyToutCasser, releaseSocle, projectInDirection, resolveToutCasserBatiments, resolveToutCasserBlocs,
    resolveToutCasserTitans, resolveToutCasserAmas, resolveToutCasser, computeEnergieParDistance, PORTEE_TETE_EN_AVANT, resolveTeteEnAvant,
    resolveGraouhhh, isLanterneRouge, getJeNePartagePasPool, resolveJeNePartagePas, PORTEE_BOING_BOING, chebyshevDistance, resolveBoingBoing,
    canRage, makeDecisionRequest, getActiveTeleporterCells, getFreeAdjacentCells, getMovementReachable, getMovePath, resolveFreeMovement,
    getRecuperationPool, resolveRecuperation, programCards, discardCardHidden, getNonPlayedPool, sendCardToOwnRepos, resolveVolPhaseRepos,
    resolveFatigue, applyRestitution, getProgrammedSum, getFPMCTargets, BAREME, BAREME_ORANGE_PAIRES, STANDARD_COLORS, scoreBareme, PODIUM_POINTS,
    rankWithTies, countRepaireColors, computeFinalScore,
    pick, shuffled
  } = Domain;

  const [nbJoueurs, setNbJoueurs] = useState(4);
  const [setupDone, setSetupDone] = useState(false);
  const [eventsEnabled, setEventsEnabled] = useState(false);
  const [state, setState] = useState(() => generateBoard());
  const [titanState, setTitanState] = useState(() => placeTitans(4));
  const [seedCount, setSeedCount] = useState(1);
  const [mancheNumber, setMancheNumber] = useState(1);
  const [activePlayerId, setActivePlayerId] = useState(() => titanState.detonateur);

  // { 1: "humain"|"ia", 2: "humain"|"ia", ... }
  const [titanModes, setTitanModes] = useState({ 1: "humain", 2: "humain", 3: "humain", 4: "humain" });
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
    setActionLog([]);
    setLooseBlocks({});
    setSelectedTitanId(null);
    setDecisionQueue([]);
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
  }, [nbJoueurs, eventsEnabled]);

  const advanceManche = useCallback(() => {
    // La limite de Manches du livret (6 a 3 Titans, 4 a 4 Titans) n'etait
    // appliquee nulle part : la partie continuait indefiniment. On arrete
    // ici, au moment ou la Manche se termine.
    if (mancheNumber >= manchesMax(nbJoueurs)) {
      setActionLog((prev) => [...prev, `🏁 Fin de partie : ${manchesMax(nbJoueurs)} Manches jouées à ${nbJoueurs} Titans.`]);
      setShowScoring(true);
      setActivePlayerId(null);
      return;
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
    setActivePlayerId((prev) => {
      const idx = titanState.ordreJeu.indexOf(prev);
      return titanState.ordreJeu[(idx + 1) % titanState.ordreJeu.length];
    });
    setPassifUsed({});
    setMoveMode(false);
    setRecupMode(false);
    setMoveAdrenaline(0); setTeaAdrenaline(0); setTcAdrenaline(0); setBbAdrenaline(0);
    setVolDirection(null); // Phase Repos suivante : le nouveau Détonateur devra rechoisir un sens
  }, [mancheNumber, nbJoueurs, titanState.ordreJeu]);

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
    const ids = titanState.ordreJeu;
    const allValidated = ids.every((id) => phaseValidated[id]);
    if (!allValidated) return;
    if (phase === "repos") {
      advanceManche();
      setPhase(getActivePhases(eventsEnabled)[0]);
      setCurrentEvent(null);
    } else {
      const activePhases = getActivePhases(eventsEnabled);
      const idx = activePhases.indexOf(phase);
      const nextPhase = activePhases[idx + 1];
      if (nextPhase === "action") {
        cardsPlayedCountRef.current = {};   // reset compteur de rounds
        setWaitingNextTitan(false);
        // Premier joueur = détonateur (ordreJeu[0])
        setActivePlayerId(titanState.ordreJeu[0]);
      }
      setPhase(nextPhase);
    }
    setPhaseValidated({});
  }, [phaseValidated, titanState.ordreJeu, phase, advanceManche, eventsEnabled]);

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
  const titansByCell = {};
  // Pendant animation de déplacement, on substitue la position visuelle du Titan animé
  const effectivePlayers = movingTitanOverride
    ? titanState.players.map((t) =>
        t.id === movingTitanOverride.titanId ? { ...t, cell: movingTitanOverride.cell } : t
      )
    : titanState.players;
  effectivePlayers.forEach((t) => (titansByCell[t.cell] = t.id));
  const titanCorners = {};
  titanState.players.forEach((t) => {
    // Le lookup `CORNERS[t.corner]` qui vivait ici n'était jamais lu :
    // seul l'id du Titan est stocké. Retiré, aucun changement de contenu.
    titanCorners[t.cell] = { titanId: t.id };
  });

  const [actionLog, setActionLog] = useState([]);
  const [looseBlocks, setLooseBlocks] = useState({});
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
  const [decisionQueue, setDecisionQueue] = useState([]);
  const [progSelection, setProgSelection] = useState([]);
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

  const captureSnapshot = useCallback(() => {
    setUndoStack((prev) => [...prev, {
      state: structuredClone(state),
      titanState: structuredClone(titanState),
      looseBlocks: structuredClone(looseBlocks),
      activePlayerId,
      phase,
      passifUsed: structuredClone(passifUsed),
      actionLog: [...actionLog],
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
  }, [state, titanState, looseBlocks, activePlayerId, phase, passifUsed, actionLog, waitingNextTitan]);

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
    setDecisionQueue([]);
    setAiPlayingSync(false);
    setWaitingNextTitan(snap.waitingNextTitan ?? false);
    cardsPlayedCountRef.current = { ...(snap.cardsPlayedCount || {}) };
    setUndoStack((prev) => prev.slice(0, -1));
  }, [undoStack]);

  useEffect(() => {
    if (activePlayerId == null) return;
    setPassifUsed((prev) => ({
      ...prev,
      [activePlayerId]: { ...(prev[activePlayerId] || {}), move: false },
    }));
  }, [activePlayerId]);

  // ── HEURISTIQUES IA ──
  // Retourne { cardId, dir, useAdrenaline, bbDest, jnpCells }
  const computeAiMove = useCallback((titan, boardData, looseBlocksData, allTitans) => {
    const byCellKey = {};
    allTitans.forEach((t) => { byCellKey[t.cell] = t.id; });
    const orderedCards = [...titan.programmed].sort((a, b) => {
      // Priorité : tout_casser si énergie élevée, puis tete_en_avant, graouhhh, boing_boing, fpmc, jnp
      const prio = { tout_casser: 0, tete_en_avant: 1, graouhhh: 2, boing_boing: 3, faut_pas_me_chauffer: 4, je_ne_partage_pas: 5 };
      return (prio[a] ?? 9) - (prio[b] ?? 9);
    });
    const card = orderedCards[0];
    if (!card) return null;

    const DIRS = [
      { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
      { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 },
    ];

    if (card === "tout_casser") {
      return { cardId: card, useAdrenaline: false };
    }
    if (card === "tete_en_avant" || card === "graouhhh") {
      // Préfère la direction avec le plus de blocs dans la case devant
      let bestDir = DIRS[0];
      let bestScore = -1;
      const r0 = rowIndex(titan.cell[0]);
      const c0 = Number(titan.cell.slice(1));
      for (const d of DIRS) {
        const r = r0 + d.dr, c = c0 + d.dc;
        if (r < 0 || r > 8 || c < 1 || c > 9) continue;
        const cellKey = rowFromIndex(r) + c;
        const bldg = boardData[cellKey];
        const score = bldg ? bldg.blocks.length : 0;
        if (score > bestScore) { bestScore = score; bestDir = d; }
      }
      return { cardId: card, dir: bestDir, useAdrenaline: false };
    }
    if (card === "boing_boing") {
      // Saute vers la case avec le plus de blocs libres dans le rayon
      const r0 = rowIndex(titan.cell[0]);
      const c0 = Number(titan.cell.slice(1));
      let bestKey = null, bestScore = -1;
      for (let r = 0; r <= 8; r++) {
        for (let c = 1; c <= 9; c++) {
          const d = chebyshevDistance(r0, c0, r, c);
          if (d < 1 || d > PORTEE_BOING_BOING) continue;
          const k = rowFromIndex(r) + c;
          if (byCellKey[k]) continue; // case occupée par un titan
          const loose = (looseBlocksData[k] || []).filter((x) => !isSocleMarker(x)).length;
          if (loose > bestScore) { bestScore = loose; bestKey = k; }
        }
      }
      if (!bestKey) {
        // fallback: case aléatoire accessible
        for (let r = 0; r <= 8; r++) {
          for (let c = 1; c <= 9; c++) {
            const d = chebyshevDistance(r0, c0, r, c);
            if (d >= 1 && d <= PORTEE_BOING_BOING && !byCellKey[rowFromIndex(r) + c]) {
              bestKey = rowFromIndex(r) + c; break;
            }
          }
          if (bestKey) break;
        }
      }
      return { cardId: card, bbDest: bestKey };
    }
    if (card === "je_ne_partage_pas") {
      const pool = getJeNePartagePasPool(titan.id, { titans: allTitans, looseBlocks: looseBlocksData });
      const nb = isLanterneRouge(titan.id, { titans: allTitans }) ? 3 : 2;
      return { cardId: card, jnpCells: [...pool].slice(0, nb) };
    }
    if (card === "faut_pas_me_chauffer") {
      return { cardId: card };
    }
    return { cardId: card };
  }, []);

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
  useEffect(() => { aiStateRef.current = state; }, [state]);
  useEffect(() => { aiTitanStateRef.current = titanState; }, [titanState]);
  useEffect(() => { aiLooseBlocksRef.current = looseBlocks; }, [looseBlocks]);
  useEffect(() => { aiPassifUsedRef.current = passifUsed; }, [passifUsed]);
  useEffect(() => { aiActivePlayerIdRef.current = activePlayerId; }, [activePlayerId]);
  useEffect(() => { aiTitanModesRef.current = titanModes; }, [titanModes]);

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
        const titansByCell = Object.fromEntries(curTitanState.players.map((t) => [t.cell, t.id]));
        const { reachable: aiReachable } = getMovementReachable(curTitan.cell, 2, curState.board, titansByCell, curLooseBlocks);
        if (aiReachable.size > 0) {
          let bestMoveKey = null, bestMoveScore = -1;
          aiReachable.forEach((cellKey) => {
            const loose = (curLooseBlocks[cellKey] || []).filter((x) => !isSocleMarker(x)).length;
            const bldg = curState.board[cellKey] ? curState.board[cellKey].blocks.length : 0;
            const score = loose * 2 + bldg;
            if (score > bestMoveScore) { bestMoveScore = score; bestMoveKey = cellKey; }
          });
          if (bestMoveKey) {
            resolveFreeMovement(playerId, bestMoveKey, { titans: curTitanState.players, board: curState.board, looseBlocks: curLooseBlocks });
            setTitanState((p) => ({ ...p, players: [...p.players] }));
            setPassifUsed((prev) => ({ ...prev, [playerId]: { ...(prev[playerId] || {}), move: true } }));
          }
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

        const move = computeAiMove(curTitan2, curState2.board, curLooseBlocks2, curTitanState2.players);
        // Si pas de move optimal, défausser la première carte disponible
        const cardId = move?.cardId ?? curTitan2.programmed[0];
        const { dir, useAdrenaline: useAdren, bbDest: dest, jnpCells } = move || {};

        let newLog = [];
        let newDecisions = [];

        if (cardId === "tout_casser") {
          const res = resolveToutCasser(playerId, { board: curState2.board, titans: curTitanState2.players, looseBlocks: curLooseBlocks2 });
          newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
          setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
        } else if (cardId === "tete_en_avant") {
          const d = dir || { dr: -1, dc: 0 };
          const res = resolveTeteEnAvant(playerId, d.dr, d.dc, !!useAdren, { board: curState2.board, titans: curTitanState2.players, looseBlocks: curLooseBlocks2 });
          newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
          setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
        } else if (cardId === "graouhhh") {
          const d = dir || { dr: -1, dc: 0 };
          const res = resolveGraouhhh(playerId, d.dr, d.dc, mancheNumber, { board: curState2.board, titans: curTitanState2.players, looseBlocks: curLooseBlocks2 });
          newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
          setLooseBlocks((p) => ({ ...p }));
        } else if (cardId === "boing_boing") {
          if (dest) {
            const res = resolveBoingBoing(playerId, dest, false, mancheNumber, { board: curState2.board, titans: curTitanState2.players, looseBlocks: curLooseBlocks2 });
            newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
            setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
          } else {
            newLog = [`IA T${playerId} : Boing Boing sans destination, défausse.`];
          }
        } else if (cardId === "je_ne_partage_pas") {
          const cells = jnpCells || [];
          const res = resolveJeNePartagePas(playerId, cells, { titans: curTitanState2.players, looseBlocks: curLooseBlocks2, board: curState2.board });
          newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
          setLooseBlocks((p) => ({ ...p }));
        } else if (cardId === "faut_pas_me_chauffer") {
          const targets = getFPMCTargets(playerId, { titans: curTitanState2.players });
          if (targets.length === 0) {
            newLog = [`FPMC (IA T${playerId}) : aucune cible.`];
          } else {
            newLog = [`FPMC (IA T${playerId}) vs ${targets.length} cible(s)`];
            targets.forEach((defId) => {
              const atk = curTitanState2.players.find((t) => t.id === playerId);
              const def = curTitanState2.players.find((t) => t.id === defId);
              if (!atk || !def) return;
              const atkSum = getProgrammedSum(atk);
              const defSum = getProgrammedSum(def);
              if (atkSum > defSum) {
                newDecisions.push(makeDecisionRequest("RAGE", playerId, defId, "Faut Pas Me Chauffer"));
                newLog.push(`FPMC : T${playerId}(${atkSum}) > T${defId}(${defSum}) → RAGE`);
              } else if (atkSum === defSum) {
                newDecisions.push(makeDecisionRequest("DIL", playerId, defId, "Faut Pas Me Chauffer"));
                newLog.push(`FPMC : Égalité → DIL`);
              } else {
                newLog.push(`FPMC : T${playerId}(${atkSum}) < T${defId}(${defSum}) → défaite IA`);
              }
            });
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

          const aiRecupPool = getRecuperationPool(playerId, { titans: curTitanState3.players, looseBlocks: curLooseBlocks3 });
          if (aiRecupPool.length > 0 && !curPassifUsed3[playerId]?.recup) {
            const targetCell = aiRecupPool.find((k) => (curLooseBlocks3[k] || []).some(isSocleMarker)) || aiRecupPool[0];
            if (targetCell) {
              resolveRecuperation(playerId, targetCell, { titans: curTitanState3.players, looseBlocks: curLooseBlocks3, board: aiStateRef.current.board });
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
            // Programmation IA provisoire : 3 cartes au hasard. Elle sera
            // remplacée par le choix piloté par le profil (la molette
            // "Programmation" du plan : au hasard chez le Novice, en
            // fonction des couleurs manquantes chez le Confirmé, en
            // séquence combinée chez l'Expert).
            // L'ancien `sort(() => Math.random() - 0.5)` était doublement
            // fautif : non semé, et biaisé (comparateur incohérent, la
            // distribution dépend de l'algorithme de tri du moteur JS).
            const chosen = shuffled(t.hand).slice(0, 3);
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
        if (defender.repaire.length >= 2) {
          let bestIdx = 0, bestScore = -Infinity;
          defender.repaire.forEach((color, idx) => {
            const val = marginalValue(color, attacker.repaire, curPlayers, d.attackerId);
            if (val > bestScore) { bestScore = val; bestIdx = idx; }
          });
          const [taken] = defender.repaire.splice(bestIdx, 1);
          attacker.repaire.push(taken);
          setActionLog((prev) => [...prev, `RAGE IA (T${d.attackerId} attaquant) : prend ${taken} (+${bestScore}pts) à T${d.defenderId}.`]);
        } else if (defender.adrenaline >= 1) {
          defender.adrenaline -= 1;
          setActionLog((prev) => [...prev, `RAGE IA (T${d.attackerId} attaquant, FAQ#5) : prend 1 Adrénaline à T${d.defenderId}.`]);
        }
        continue;
      }

      // DIL
      if (atkIsIa && defIsIa) {
        // Les deux étapes auto, comme avant.
        const rep = defender.repaire;
        if (rep.length < 1) continue;
        const ranked = rep
          .map((color, idx) => ({ color, idx, atkVal: marginalValue(color, attacker.repaire, curPlayers, d.attackerId) }))
          .sort((a, b) => b.atkVal - a.atkVal);
        const offered = ranked.slice(0, Math.min(2, ranked.length));
        if (offered.length === 0) continue;
        if (offered.length === 1) {
          const loseIdx = rep.indexOf(offered[0].color);
          if (loseIdx !== -1) rep.splice(loseIdx, 1);
          setActionLog((prev) => [...prev, `DIL IA↔IA : T${d.defenderId} perd ${offered[0].color} (seul choix).`]);
        } else {
          const defValued = offered.map((o) => ({ ...o, defVal: marginalValue(o.color, rep, curPlayers, d.defenderId) }));
          const defChoice = defValued.reduce((best, curr) => curr.defVal < best.defVal ? curr : best);
          const loseIdx = rep.indexOf(defChoice.color);
          if (loseIdx !== -1) rep.splice(loseIdx, 1);
          setActionLog((prev) => [...prev, `DIL IA↔IA : T${d.defenderId} perd ${defChoice.color} (valeur marginale ${defChoice.defVal}).`]);
        }
        continue;
      }

      if (atkIsIa && !defIsIa) {
        // Attaquant IA choisit seul ses 2 options (marginalValue la plus
        // haute pour l'attaquant), puis la décision est poussée à la queue
        // humaine DÉJÀ au stade DEFENDER_PICK — le défenseur humain choisit
        // laquelle des 2 il perd (via resolveDilDefenderPick, inchangé).
        const rep = defender.repaire;
        if (rep.length < 1) continue;
        const ranked = rep
          .map((color) => ({ color, atkVal: marginalValue(color, attacker.repaire, curPlayers, d.attackerId) }))
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
    if (!rawDecisions || rawDecisions.length === 0) return;
    // Utilise les refs live pour les modes et players (évite stale closure)
    const curModes = aiTitanModesRef.current;
    const curPlayers = aiTitanStateRef.current.players;
    const humanDecisions = autoResolveIaDecisions(rawDecisions, curModes, curPlayers);
    if (humanDecisions.length === 0) {
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      return;
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
          const defenseur = aiTitanStateRef.current.players.find((t) => t.id === d.defenderId);
          const couleurs = defenseur ? [...new Set(defenseur.repaire)] : [];
          if (couleurs.length === 2) preset = couleurs;
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
  }, [autoResolveIaDecisions]);

  const currentDecision = decisionQueue[0] || null;

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
    setDecisionQueue((prev) => {
      const [cur, ...rest] = prev;
      if (!cur || cur.attackerChoices.length !== 2) return prev;
      if (cur.defenderIsAi) {
        // Bug remonté : le défenseur IA n'a jamais son mot à dire — la
        // décision restait en attente d'un clic humain qui ne viendrait
        // jamais. On auto-résout immédiatement ici avec la même heuristique
        // que l'auto-résolution IA↔IA (valeur marginale la plus faible pour
        // le défenseur = celle qu'il perd), au lieu de passer par le stade
        // DEFENDER_PICK de l'UI.
        const defender = titanState.players.find((t) => t.id === cur.defenderId);
        if (defender) {
          const defValued = cur.attackerChoices.map((color) => ({
            color,
            defVal: marginalValue(color, defender.repaire, titanState.players, cur.defenderId),
          }));
          const defChoice = defValued.reduce((best, curr) => (curr.defVal < best.defVal ? curr : best));
          const idx = defender.repaire.indexOf(defChoice.color);
          if (idx !== -1) defender.repaire.splice(idx, 1);
          setActionLog((prevLog) => [...prevLog, `DIL (${cur.cardLabel}) : Titan ${cur.defenderId} (IA) perd 1 bloc ${defChoice.color} (décision automatique).`]);
          setTitanState((p) => ({ ...p, players: [...p.players] }));
        }
        return rest;
      }
      return [{ ...cur, stage: "DEFENDER_PICK" }, ...rest];
    });
  }, [titanState.players]);

  const resolveDilDefenderPick = useCallback(
    (color) => {
      const cur = decisionQueue[0];
      if (!cur) return;
      const defender = titanState.players.find((t) => t.id === cur.defenderId);
      const idx = defender.repaire.indexOf(color);
      if (idx !== -1) defender.repaire.splice(idx, 1);
      setActionLog((prevLog) => [...prevLog, `DIL (${cur.cardLabel}) : Titan ${cur.defenderId} perd 1 bloc ${color}.`]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      setDecisionQueue((prev) => prev.slice(1));
    },
    [decisionQueue, titanState.players]
  );

  const resolveDilCancelWithAdrenaline = useCallback(() => {
    const cur = decisionQueue[0];
    if (!cur) return;
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    if ((defender.adrenaline || 0) < 1) { return; }
    defender.adrenaline -= 1;
    setActionLog((prevLog) => [...prevLog, `DIL annulé par Titan ${cur.defenderId} (1 Adrénaline dépensée).`]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setDecisionQueue((prev) => prev.slice(1));
  }, [decisionQueue, titanState.players]);

  const resolveRagePick = useCallback(
    (color) => {
      const cur = decisionQueue[0];
      if (!cur) return;
      const defender = titanState.players.find((t) => t.id === cur.defenderId);
      const idx = defender.repaire.indexOf(color);
      if (idx !== -1) defender.repaire.splice(idx, 1);
      setActionLog((prevLog) => [...prevLog, `RAGE : Titan ${cur.attackerId} prend ${color} à Titan ${cur.defenderId}.`]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      setDecisionQueue((prev) => prev.slice(1));
    },
    [decisionQueue, titanState.players]
  );

  const resolveRagePickAdrenaline = useCallback(() => {
    const cur = decisionQueue[0];
    if (!cur) return;
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    if ((defender.adrenaline || 0) < 1) return;
    defender.adrenaline -= 1;
    setActionLog((prevLog) => [...prevLog, `RAGE (FAQ#5) : Titan ${cur.attackerId} prend 1 Adrénaline à Titan ${cur.defenderId}.`]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setDecisionQueue((prev) => prev.slice(1));
  }, [decisionQueue, titanState.players]);

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
                } else {
                  // Échec (ex. état déjà modifié entre-temps) : on informe le
                  // joueur au lieu de valider silencieusement une phase non
                  // réellement programmée — ce silence était la cause du gel
                  // de tour ("en attente des autres Titans").
                  setActionLog((p) => [...p, `⚠️ Programmation T${selectedTitanId} échouée : ${res.reason}`]);
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
  }, [selectedTitanId, titanState.players]);

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
    [phase, selectedTitan, activePlayerId, passifUsed, waitingNextTitan]
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
    [phase, selectedTitan, activePlayerId, passifUsed, waitingNextTitan]
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
        // Nouveau round : repart du détonateur (ordreJeu[0])
        next = ordreJeu[0];
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
    [advanceActionRound]
  );

  // ── TEA : calcul des cibles disponibles ──────────────────────────────────
  // Pour chaque direction (8), on avance case par case jusqu'au premier
  // obstacle valide dans la portée (3 + éventuellement +1 Adrénaline).
  // Obstacle valide = bâtiment avec blocs, bloc libre, socle libre au sol
  // (bâtiment vide sans bloc libre = couloir, on traverse), Titan adverse.
  const teaMaxRange = PORTEE_TETE_EN_AVANT + teaAdrenaline;
  const teaTargets = selectedTitan && teaMode
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
            if (hasBuilding) { targets.set(key, { dr, dc }); break; }
            if (hasLooseBlock) { targets.set(key, { dr, dc }); break; }
            if (isAdverseOccupant) { targets.set(key, { dr, dc }); break; }
            // case vide (bâtiment vide, route libre) → on continue
          }
        }
        return targets;
      })()
    : new Map();

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
    const result = resolveTeteEnAvant(selectedTitanId, dir.dr, dir.dc, actuallyUseAdrenaline, {
      board: state.board, titans: titanState.players, looseBlocks,
    });
    if (actuallyUseAdrenaline) attacker.adrenaline -= actuallyUseAdrenaline;
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    markCardPlayed(selectedTitanId, "tete_en_avant");
    setTeaMode(false);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, teaTargets, teaAdrenaline, state.board, titanState.players, looseBlocks, enqueueDecisions, canPlayCard, markCardPlayed, captureSnapshot]);

  // Bug remonté : "un Titan avait 0 carte à jouer en pleine Manche". Cause
  // trouvée : Fatigue (Graouhhh/Boing Boing) peut piocher une carte encore
  // dans `programmed` (pas seulement `hand`) chez la victime — cette carte
  // ne sera donc jamais "jouée" via markCardPlayed, et cardsPlayedCountRef
  // (qui compte les rounds réellement joués pour savoir quand un Titan a
  // fini sa Manche) ne le sait pas : le système continue d'attendre un 3e
  // tour de la victime alors qu'il ne lui reste plus aucune carte. Ce
  // helper compense manuellement le compteur pour chaque victime concernée,
  // juste après la résolution d'une action qui a déclenché une Fatigue sur
  // une carte programmée (voir jouerGraouhhh / jouerBoingBoing).
  const compensateFatiguedRounds = useCallback((victimIds) => {
    if (!victimIds || victimIds.length === 0) return;
    const prevCount = cardsPlayedCountRef.current;
    const newCount = { ...prevCount };
    victimIds.forEach((id) => { newCount[id] = (newCount[id] || 0) + 1; });
    cardsPlayedCountRef.current = newCount;
  }, []);

  const jouerGraouhhh = useCallback(() => {
    if (!selectedTitanId || !canPlayCard("graouhhh")) return;
    captureSnapshot();
    const result = resolveGraouhhh(selectedTitanId, direction.dr, direction.dc, mancheNumber, {
      board: state.board, titans: titanState.players, looseBlocks,
    });
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    compensateFatiguedRounds(result.fatiguedProgrammed);
    markCardPlayed(selectedTitanId, "graouhhh");
    setGraouMode(false);
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, direction, state.board, titanState.players, looseBlocks, enqueueDecisions, mancheNumber, canPlayCard, markCardPlayed, captureSnapshot, compensateFatiguedRounds]);

  const bbMaxRange = PORTEE_BOING_BOING + bbAdrenaline;
  const bbReachable = selectedTitan
    ? (() => {
        const set = new Set();
        const oR = rowIndex(selectedTitan.cell[0]);
        const oC = Number(selectedTitan.cell.slice(1));
        for (let r = 0; r < 9; r++) for (let c = 1; c <= 9; c++) {
          const d = chebyshevDistance(oR, oC, r, c);
          if (d > 0 && d <= bbMaxRange) set.add(rowFromIndex(r) + c);
        }
        return set;
      })()
    : new Set();

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
    const result = resolveBoingBoing(selectedTitanId, bbDest, actuallyUseAdrenaline, mancheNumber, {
      board: state.board, titans: titanState.players, looseBlocks,
    });
    if (result.applied && actuallyUseAdrenaline) attacker.adrenaline -= actuallyUseAdrenaline;
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    compensateFatiguedRounds(result.fatiguedProgrammed);
    if (result.applied) { markCardPlayed(selectedTitanId, "boing_boing"); setBbMode(false); setBbDest(null); }
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, bbDest, bbAdrenaline, state.board, titanState.players, looseBlocks, enqueueDecisions, mancheNumber, canPlayCard, markCardPlayed, captureSnapshot, compensateFatiguedRounds]);

  const moveMaxRange = 2 + moveAdrenaline;
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

  const recupPool = selectedTitanId
    ? new Set(getRecuperationPool(selectedTitanId, { titans: titanState.players, looseBlocks }))
    : new Set();
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
    [selectedTitanId, recupPool, titanState.players, looseBlocks, canUseRecupPassif, captureSnapshot]
  );

  const jnpNbToPick = selectedTitanId ? (isLanterneRouge(selectedTitanId, { titans: titanState.players }) ? 3 : 2) : 2;
  const jnpPool = selectedTitanId ? new Set(getJeNePartagePasPool(selectedTitanId, { titans: titanState.players, looseBlocks })) : new Set();
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
  }, [selectedTitanId, jnpSelected, titanState.players, looseBlocks, canPlayCard, markCardPlayed, captureSnapshot]);

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
    const attackerTotal = fpmcAttackerBase + cur.attackerBid;
    const defenderTotal = cur.defenderBase + cur.defenderBid;
    const log = [];
    log.push(`Révélation — T${fpmcAttackerId}: ${attackerTotal} vs T${cur.defenderId}: ${defenderTotal}`);
    const attacker = titanState.players.find((t) => t.id === fpmcAttackerId);
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    const dr = Math.sign(rowIndex(defender.cell[0]) - rowIndex(attacker.cell[0]));
    const dc = Math.sign(Number(defender.cell.slice(1)) - Number(attacker.cell.slice(1)));
    const projDistance = fpmcNTargets + 1;
    const decisions = [];
    if (attackerTotal > defenderTotal) {
      const bagarreSet = new Set([cur.defenderId]);
      const landing = projectInDirection(defender.cell[0], Number(defender.cell.slice(1)), dr, dc, projDistance, { board: state.board, looseBlocks, titans: titanState.players, log, bagarreSet });
      defender.cell = landing.row + landing.col;
      decisions.push(makeDecisionRequest("RAGE", fpmcAttackerId, cur.defenderId, "Faut Pas Me Chauffer"));
      attacker.bagarre = (attacker.bagarre || 0) + bagarreSet.size;
      log.push(`Victoire T${fpmcAttackerId} → RAGE · +Bagarre · T${cur.defenderId} → ${defender.cell}`);
    } else if (attackerTotal === defenderTotal) {
      const bagarreSet = new Set([cur.defenderId]);
      const landing = projectInDirection(defender.cell[0], Number(defender.cell.slice(1)), dr, dc, projDistance, { board: state.board, looseBlocks, titans: titanState.players, log, bagarreSet });
      defender.cell = landing.row + landing.col;
      decisions.push(makeDecisionRequest("DIL", fpmcAttackerId, cur.defenderId, "Faut Pas Me Chauffer"));
      attacker.bagarre = (attacker.bagarre || 0) + bagarreSet.size;
      log.push(`Égalité → DIL · T${cur.defenderId} → ${defender.cell}`);
    } else {
      log.push(`Défaite T${fpmcAttackerId} — aucun effet.`);
    }
    attacker.adrenaline = Math.max(0, (attacker.adrenaline || 0) - cur.attackerBid);
    defender.adrenaline = Math.max(0, (defender.adrenaline || 0) - cur.defenderBid);
    setActionLog((prev) => [...prev, ...log]);
    enqueueDecisions(decisions);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setFpmcCurrent(null);
  }, [fpmcCurrent, fpmcAttackerId, fpmcAttackerBase, fpmcNTargets, titanState.players, state.board, looseBlocks, enqueueDecisions]);

  const jouerToutCasser = useCallback(() => {
    if (!selectedTitanId || !canPlayCard("tout_casser")) return;
    captureSnapshot();
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    const bonus = Math.min(tcAdrenaline, attacker.adrenaline || 0);
    if (bonus) attacker.adrenaline -= 1;
    const result = resolveToutCasser(selectedTitanId, { board: state.board, titans: titanState.players, looseBlocks }, bonus);
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    markCardPlayed(selectedTitanId, "tout_casser");
    setTcAdrenaline(false);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, tcAdrenaline, state.board, titanState.players, looseBlocks, enqueueDecisions, canPlayCard, markCardPlayed, captureSnapshot]);

  const getVertCount = useCallback((titan) => titan.repaire.filter((c) => c === "vert").length, []);
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
      t: titanState.players.map((p) => [p.id, p.cell]),
    }),
    [state, looseBlocks, titanState]
  );

  const perimeterCells = selectedTitan
    ? getPerimeter(selectedTitan.cell[0], Number(selectedTitan.cell.slice(1)))
    : [];
  const perimeterKeys = new Set(perimeterCells.map((c) => c.row + c.col));
  const energie = selectedTitan
    ? computeEnergyToutCasser(perimeterCells, state.board, titansByCell)
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
  }, [phase, currentDecision, selectedTitan, phaseValidated, activePlayerId, volDirection, titanDisplayName]);

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
                    {n === 4 ? "4 Manches" : "6 Manches"}
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
    decisionQueue,
    setDecisionQueue,
    progSelection,
    setProgSelection,
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
    setUndoStack,
    captureSnapshot,
    prevActivePlayerRef,
    handleUndo,
    computeAiMove,
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
    toggleBbMode,
    bbSelectCell,
    jouerBoingBoing,
    moveMaxRange,
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
    endGameReasons,
    boardSignature3D,
    perimeterCells,
    perimeterKeys,
    energie,
    stats,
    occupiedCount,
    phaseGuidance,
    tcSel
  };
}
