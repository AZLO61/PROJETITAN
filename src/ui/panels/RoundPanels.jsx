import React, { Suspense, lazy } from "react";
// La vue 3D tire tout Three.js (~500 kB). Elle n'est montée que si `show3D`
// est actif, donc on la charge à la demande : une partie jouée en 2D ne
// télécharge jamais Three.js. Aucun changement de rendu, seul le moment du
// téléchargement bouge.
const Board3D = lazy(() => import("../board3d/Board3D.jsx"));
import CardVisual from "../cards/CardVisual.jsx";
import BlockStockBar from "../cards/BlockStockBar.jsx";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon, TitanBadge } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { ACTION_CARDS, CARD_LABEL, CARD_FORCE, PHASE_LABELS, EVENT_NAMES, COULEURS, COLOR_HEX, STANDARD_COLORS, ROWS, isBuildingCell, isSocleMarker, socleValue } from "../../domain/index.js";
import { BLOCK_NAME } from "../blockNames.js";
import { btnStyle, cancelBtn } from "../styles.js";
import BlockIcon from "../BlockIcon.jsx";

export default function RoundPanels({ vm }) {
  // Bug remonté : quand une case cumule 2 débris DIFFÉRENTS (ex. bloc rose
  // + socle, ou bloc bleu + bloc rouge), cliquer "Ramasser" prenait
  // toujours le dernier empilé sans jamais laisser le joueur choisir.
  // recupChoiceCell mémorise la case en attente de choix (popup rendu plus
  // bas, juste après la grille) ; nul tant qu'aucun choix n'est nécessaire.
  const [recupChoiceCell, setRecupChoiceCell] = React.useState(null);
  // Composition d'un batiment : elle ne tient pas dans une case de 30px, et
  // un panneau pose EN ABSOLU dans la case etait tronque par le defilement
  // horizontal de la grille (overflowX: auto). Il est donc rendu en position
  // fixe, au-dessus de tout, avec les coordonnees de la case cliquee.
  const [hoverCell, setHoverCell] = React.useState(null);
  const [hoverPos, setHoverPos] = React.useState(null);
  const openComposition = (key, el) => {
    if (hoverCell === key) { setHoverCell(null); setHoverPos(null); return; }
    const r = el.getBoundingClientRect();
    setHoverPos({ x: r.left + r.width / 2, y: r.top });
    setHoverCell(key);
  };
  const {
    nbJoueurs,
    manchesMaxPartie,
    titansEnAttente,
    ecroulement,
    ecroulementCells,
    currentRepli,
    choisirRepli,
    ecroulementPoserDebris,
    ecroulementAnnulerDernier,
    ecroulementValider,
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
    titanProfiles,
    profilsReveles,
    revelerProfil,
    profileLabel,
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
    jouerTeteEnAvant,
    jouerGraouhhh,
    bbMaxRange,
    bbReachable,
    bbReach,
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
    tcSel
  } = vm;

  /* ── UN SEUL AIGUILLEUR DE CLIC POUR LES DEUX VUES ──
     Il vivait en JSX, à l'intérieur du `onClick` d'une case de la grille 2D.
     La vue 3D ne pouvait donc pas s'en servir, et c'est exactement ce qui la
     réduisait à une visualisation (demande de Nikola du 2026-08-18 : « le
     clic sur les cases en 3D »). Le recopier là-bas aurait créé deux
     comportements à maintenir en parallèle — le motif que tout ce fichier
     essaie d'éviter.

     Il est donc extrait ici, tel quel, et les deux plateaux l'appellent avec
     une clé de case. L'ORDRE DES TESTS est la règle et ne doit pas bouger :
     une décision en attente capte le plateau entier, puis les modes de
     carte, puis le ramassage, et seulement à défaut la consultation d'un
     bâtiment ou la sélection d'un Titan.

     `el` est l'élément DOM cliqué, dont la composition d'un bâtiment tire sa
     position à l'écran. La 3D n'en a pas : elle passe null, et ce seul
     affichage-là reste propre à la 2D. */
  const clicCase = (key, el = null) => {
    if (currentRepli) { if (currentRepli.cases.includes(key)) choisirRepli(key); return; }
    if (ecroulement) { if (ecroulementCells.includes(key)) ecroulementPoserDebris(key); return; }
    if (jnpMode) { if (jnpPool.has(key)) jnpToggleCell(key); return; }
    if (bbMode) { if (bbReachable.has(key)) bbSelectCell(key); return; }
    if (teaMode) { if (teaTargets.has(key)) jouerTeteEnAvant(key); return; }
    if (moveMode) { if (moveReachable.has(key)) jouerMouvementGratuit(key); return; }
    if (recupMode) {
      if (recupPool.has(key)) {
        const distinct = [...new Set(looseBlocks[key] || [])];
        // Plusieurs débris DIFFÉRENTS sur la case : le livret laisse le choix,
        // on ouvre le popup au lieu de prendre le dernier empilé.
        if (distinct.length > 1) setRecupChoiceCell(key);
        else jouerRecuperation(key);
      }
      return;
    }
    const cellData = state.board[key];
    if (el && cellData && cellData.blocks.length > 0) { openComposition(key, el); return; }
    if (titansByCell[key]) setSelectedTitanId(titansByCell[key]);
  };

  /* Les cases que le plateau 3D doit allumer, avec leur couleur. Mêmes
     ensembles que ceux qui peignent la grille 2D juste en dessous : ce que
     le joueur voit en 3D ne peut pas diverger de ce que le moteur accepte. */
  const cellulesActives = (() => {
    const out = [];
    const add = (key, couleur, opacite) => out.push({ key, couleur, opacite });
    if (currentRepli) {
      currentRepli.cases.forEach((k) =>
        add(k, 0xfb923c, k === currentRepli.defaut ? 0.75 : 0.45));
    } else if (ecroulement) {
      ecroulementCells.forEach((k) => add(k, 0xfb923c, 0.5));
    } else if (jnpMode) {
      jnpPool.forEach((k) => add(k, 0x16e08c, jnpSelected.includes(k) ? 0.8 : 0.4));
    } else if (bbMode) {
      bbReachable.forEach((k) => add(k, 0x16e08c, bbDest === k ? 0.8 : 0.4));
    } else if (teaMode) {
      teaTargets.forEach((_, k) => add(k, 0xfb923c, 0.55));
    } else if (moveMode) {
      moveClassic.forEach((k) => add(k, 0x71dbff, 0.55));
      moveTeleport.forEach((k) => { if (!moveClassic.has(k)) add(k, 0xb88cff, 0.38); });
    } else if (recupMode) {
      recupPool.forEach((k) => add(k, 0xffd93d, 0.5));
    }
    return out;
  })();

  return <>
      {/* Le banner "Vol en chaîne / Phase Repos" a été extrait dans
          RepoVolBanner.jsx et remonté juste sous DilRageBanner dans
          GameView.jsx (refonte UI façon DIL/RAGE — décision bloquante,
          doit avoir le même traitement visuel et la même position
          qu'une autre décision bloquante du jeu). Voir GameView.jsx. */}


      {/* ── VUE 3D ── */}
      {show3D && (
        <div style={{ marginBottom: 14 }}>
          <Suspense fallback={
            <div style={{ padding: "28px 0", textAlign: "center", fontSize: ".68rem", color: "rgba(255,255,255,.35)" }}>
              Chargement de la vue 3D…
            </div>
          }>
            <Board3D
              board={state.board}
              looseBlocks={looseBlocks}
              titans={titanState.players}
              boardVersion={boardSignature3D}
              selectedTitanId={selectedTitanId}
              onSelectTitan={setSelectedTitanId}
              cellulesActives={cellulesActives}
              onCellClick={clicCase}
            />
          </Suspense>
          <div style={{ fontSize: ".7rem", color: "rgba(255,255,255,.45)", textAlign: "center", marginTop: 6 }}>
            Clique une case pour jouer · glisse pour tourner · molette pour zoomer
          </div>
        </div>
      )}


      {/* ── BANDEAU RESSOURCES TITANS ── */}
      <TitanResourceBand
        titans={titanState.players}
        selectedTitanId={selectedTitanId}
        onSelect={setSelectedTitanId}
        activePlayerId={activePlayerId}
        phase={phase}
        titanDisplayName={titanDisplayName}
        titanModes={titanModes}
        titanProfiles={titanProfiles}
        profilsReveles={profilsReveles}
        revelerProfil={revelerProfil}
        profileLabel={profileLabel}
        waitingNextTitan={waitingNextTitan}
        titansEnAttente={titansEnAttente}
      />


      {/* ── STOCK BLOCS ── */}
      <BlockStockBar
        board={state.board}
        looseBlocks={looseBlocks}
        mancheNumber={mancheNumber}
        totalManches={manchesMaxPartie}
        detonateurName={titanDisplayName(titanState.detonateur)}
        occupiedCount={occupiedCount}
        apocalypseThreshold={apocalypseThreshold}
      />


      {/* ── RÉPARTITION D'UN AMAS ÉCROULÉ ──
          Boing Boing sur un tas : le joueur place les débris un par un, et
          chacun fait son effet avant le suivant. */}
      {/* Une seule décision à l'écran : la répartition attend son tour
          derrière un Dilemme ou un repli non tranché (cf. decisionBloquante
          dans le contrôleur, demande Nikola du 2026-08-18). */}
      {ecroulement && vm.decisionBloquante === "ecroulement" && (
        <div style={{
          background: "rgba(251,146,60,.14)", border: "1.5px solid #fb923c",
          borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: ".8rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ color: "#ffb877", fontFamily: "'Bowlby One', sans-serif" }}>
              🧱 Écroulement de l'Amas
            </strong>
            <span style={{ color: "rgba(255,255,255,.75)" }}>
              Débris {Math.min(ecroulement.choix.length + 1, ecroulement.blocs.length)} sur {ecroulement.blocs.length} :
              clique la case où il tombe.
            </span>
          </div>
          <div style={{ marginTop: 6, color: "rgba(255,255,255,.6)", fontSize: ".74rem" }}>
            Un débris qui tombe sur un Titan le pousse de {ecroulement.energie} case(s) et te rapporte la Bagarre.
            {ecroulementCells.length > 0 && ecroulement.choix.length < ecroulement.blocs.length
              && " Les cases déjà servies ne sont proposées que s'il n'en reste plus de vierge."}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {ecroulement.choix.length > 0 && (
              <button onClick={ecroulementAnnulerDernier} style={btnStyle()}>↩️ Annuler le dernier</button>
            )}
            {ecroulement.choix.length === ecroulement.blocs.length && (
              <button onClick={ecroulementValider} style={btnStyle("#16E08C", "#00C97A", true)}>
                ✅ Valider l'écroulement
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── GRILLE 9×9 ──
          La 2D et la 3D ne coexistent plus : afficher les deux allongeait la
          page d'un ecran entier et obligeait a faire defiler entre la vue et
          les controles. Le bouton Vue 3D bascule de l'une a l'autre. */}
      {!show3D && (() => {
        /* GOUTTIÈRES HORS PLATEAU
           Un Titan éjecté attend DEHORS, aligné avec la case par laquelle il
           rentrera (demande de Nikola). La grille gagne donc une piste de
           chaque côté, en dehors du 9×9, où l'on pose son icône en
           translucide. Elles restent vides tant que personne n'est sorti. */
        const attenteParCase = {};
        (titansEnAttente || []).forEach((t) => { attenteParCase[t.cell] = t; });
        /* UN TITAN N'ATTEND QUE DANS UNE SEULE GOUTTIÈRE.
           Les quatre pistes se recoupent aux coins : A1 appartient à la fois
           à la gouttière haute (colonne 1) et à celle de gauche (ligne A).
           Le même Titan s'y affichait donc en double. C'était rare tant
           qu'on ne sortait que par un bord droit ; depuis la règle du
           miroir du 2026-08-18, une poussée en diagonale renvoie
           précisément sur un coin, et le cas est devenu courant.

           La piste retenue est celle par laquelle il rentrera vraiment :
           `rentrerEnJeu` fait longer la COLONNE en priorité quand la case
           est sur une colonne de bord, l'affichage suit la même règle. */
        const zoneDe = (cle) => {
          const col = Number(cle.slice(1));
          if (col === 1) return "gauche";
          if (col === 9) return "droite";
          return cle[0] === "A" ? "haut" : "bas";
        };
        const Gouttiere = ({ cle, zone }) => {
          const t = attenteParCase[cle];
          if (!t || zoneDe(cle) !== zone) return <div />;
          return (
            <div
              title={`${titanDisplayName(t.id)} attend hors de BIG CITY — rentre par ${cle} au début de son tour`}
              style={{ display: "grid", placeItems: "center", opacity: 0.5 }}
            >
              <TitanIcon titanId={t.id} size={20} />
            </div>
          );
        };
        /* PLATEAU CARRÉ (demande de Nikola, 2026-08-17 : « rends les cases du
           plateau 2D plus carrées pour une meilleure lisibilité »).

           Les colonnes étaient en `1fr` et s'étiraient donc jusqu'à ~80 px sur
           un écran large, pendant que la hauteur restait figée à 30 px : le
           9×9 se lisait comme une grille d'aplats très plats, où les icônes de
           blocs et les badges de Titan se noyaient. Chaque case tient
           désormais sa hauteur de sa largeur (`aspectRatio`), et la grille est
           bornée pour que la case ne dépasse pas ~52 px — au-delà, le plateau
           repousse les contrôles hors de l'écran sur une tablette. */
        return (
      <div className="titan-grid" style={{
        display: "grid",
        gridTemplateColumns: "24px 18px repeat(9, minmax(30px, 1fr)) 24px",
        gridAutoRows: "auto",
        gridTemplateRows: "18px 24px repeat(9, auto) 24px",
        gap: 2, marginBottom: 14,
        maxWidth: 24 + 18 + 24 + 9 * 52 + 12 * 2,
        marginLeft: "auto", marginRight: "auto",
        overflowX: "auto",
      }}>
        {/* Ligne des numéros de colonne */}
        <div /><div />
        {[1,2,3,4,5,6,7,8,9].map((c) => (
          <div key={c} style={{ display: "grid", placeItems: "center", fontSize: ".68rem", color: "rgba(255,255,255,.4)" }}>{c}</div>
        ))}
        <div />
        {/* Gouttière haute : attente au-dessus de la ligne A */}
        <div /><div />
        {[1,2,3,4,5,6,7,8,9].map((c) => <Gouttiere key={`haut${c}`} cle={`A${c}`} zone="haut" />)}
        <div />
        {ROWS.map((r) => (
          <React.Fragment key={r}>
            <Gouttiere cle={`${r}1`} zone="gauche" />
            <div style={{ display: "grid", placeItems: "center", fontSize: ".68rem", color: "rgba(255,255,255,.4)" }}>{r}</div>
            {[1,2,3,4,5,6,7,8,9].map((c) => {
              const key = r + c;
              const titan = titanCorners[key];
              const cellData = state.board[key];
              const isBldg = isBuildingCell(r, c);
              const topBlock = cellData && cellData.blocks.length > 0 ? cellData.blocks[cellData.blocks.length - 1] : null;
              const inPerimeter = perimeterKeys.has(key);
              const jnpSelectable = jnpMode && jnpPool.has(key);
              const jnpIsSelected = jnpMode && jnpSelected.includes(key);
              /* Boing Boing : seul un BÂTIMENT ENCORE DEBOUT interdit
                 l'atterrissage. Un Titan sur la case, lui, est une cible
                 parfaitement légitime — c'est même l'effet principal de la
                 carte : « Titan présent → DIL, projeté de la valeur
                 restante, +1 Bagarre » (livret, carte 04). Le moteur le
                 gère depuis toujours (cf. resolveBoingBoing), c'est
                 l'interface qui refusait le clic et peignait la case en
                 rouge « atterrissage impossible ». Bug remonté par Nikola
                 le 2026-08-17 : « je ne peux pas sauter sur un Titan alors
                 qu'il est seul sur sa case ».
                 `bbReachable` filtre déjà les bâtiments debout, ce test
                 n'est donc plus qu'une ceinture de sécurité. */
              const bbBloquee = bbMode && bbReachable.has(key)
                && isBldg && cellData && cellData.blocks.length > 0;
              const bbSelectable = bbMode && bbReachable.has(key) && !bbBloquee;
              const bbIsSelected = bbMode && bbDest === key;
              const moveSelectable = moveMode && moveReachable.has(key);
              const moveIsClassic = moveMode && moveClassic.has(key); // accessible sans téléporteur
              const moveIsTeleport = moveMode && !moveClassic.has(key) && moveTeleport.has(key); // téléporteur uniquement
              const recupSelectable = recupMode && recupPool.has(key);
              const teaSelectable = teaMode && teaTargets.has(key);
              // Répartition des débris d'un Amas écroulé : les cases encore
              // proposées pour le prochain débris.
              const ecroulSelectable = Boolean(ecroulement) && ecroulementCells.includes(key);
              const ecroulDejaServie = Boolean(ecroulement) && ecroulement.choix.includes(key);
              // Repli d'un élément arrêté faute de puissance : les cases où
              // le Titan initiateur peut le poser (ruling du 2026-08-17).
              const repliSelectable = Boolean(currentRepli) && currentRepli.cases.includes(key);
              const repliDefaut = Boolean(currentRepli) && currentRepli.defaut === key;
              const repliCible = Boolean(currentRepli) && currentRepli.cible === key;

              // Périmètre 2D : couleur du Titan sélectionné
              const perimAccent = tcSel ? tcSel.accent : "#FFD93D";
              // Fond de la case dans le périmètre :
              // bâtiment → teinte du Titan en overlay sur la couleur du bloc du dessus
              // case vide → teinte légère
              let cellBg;
              if (repliCible) {
                cellBg = "rgba(239,68,68,.22)"; // la case qu'il n'a pas pu atteindre
              } else if (repliDefaut) {
                cellBg = "rgba(251,146,60,.34)"; // là où il se poserait sans choix
              } else if (repliSelectable) {
                cellBg = "rgba(251,146,60,.18)";
              } else if (ecroulDejaServie) {
                cellBg = "rgba(251,146,60,.32)"; // débris déjà posé là
              } else if (ecroulSelectable) {
                cellBg = "rgba(251,146,60,.16)"; // case proposée pour le prochain
              } else if (jnpIsSelected || bbIsSelected) {
                cellBg = "rgba(22,224,140,.25)";
              } else if (teaSelectable) {
                cellBg = "rgba(251,146,60,.25)"; // orange TEA
              } else if (moveIsClassic) {
                cellBg = "rgba(113,219,255,.25)"; // classique : +10% opacité (0.25 vs 0.15)
              } else if (moveIsTeleport) {
                cellBg = "rgba(113,219,255,.15)"; // téléporteur : plus transparent
              } else if (recupSelectable) {
                cellBg = "rgba(255,217,61,.15)";
              } else if (bbBloquee) {
                cellBg = "rgba(239,68,68,.16)";
              } else if (jnpSelectable || bbSelectable) {
                cellBg = "rgba(22,224,140,.12)";
              } else if (inPerimeter) {
                if (isBldg && topBlock) {
                  // Bâtiment dans le périmètre : couleur du bloc seule, sans overlay Titan
                  cellBg = COLOR_HEX[topBlock];
                } else if (isBldg) {
                  cellBg = `${perimAccent}22`;
                } else {
                  cellBg = `${perimAccent}18`;
                }
              } else if (isBldg) {
                cellBg = topBlock ? COLOR_HEX[topBlock] : "rgba(255,255,255,.05)";
              } else {
                // Bug remonté : les cases couloir (sans bâtiment) se
                // fondaient presque totalement dans le fond du site
                // (.02 d'opacité). Accentué à .07 pour rester nettement
                // en retrait des cases bâtiment tout en restant lisible.
                cellBg = "rgba(255,255,255,.07)";
              }

              return (
                <div
                  key={key}

                  // Aiguillage commun aux vues 2D et 3D (cf. `clicCase` en
                  // tête de composant) : une seule description de ce que
                  // « cliquer une case » veut dire, quelle que soit la vue.
                  onClick={(e) => clicCase(key, e.currentTarget)}
                  // Les icones empilees dans une case de 30px etaient
                  // illisibles. La composition exacte passe dans l'infobulle,
                  // du haut vers le bas, et la case garde des reperes
                  // d'etages discrets sur son bord gauche.
                  title={bbBloquee
                    ? `${key} — atterrissage impossible : le bâtiment est encore debout`
                    : bbSelectable && titansByCell[key]
                    ? `${key} — sauter sur ce Titan : Dilemme, projection et +1 Bagarre (distance ${bbReach.get(key)})`
                    : bbSelectable
                    ? `${key} — atterrissage possible (distance ${bbReach.get(key)}, éléments contigus comptés pour 1 case)`
                    : cellData
                    ? `${key} · ${cellData.blocks.length} étage${cellData.blocks.length > 1 ? "s" : ""} · socle ${cellData.socle}${
                        cellData.blocks.length
                          ? `
De haut en bas : ${[...cellData.blocks].reverse().map((c) => BLOCK_NAME[c] || c).join(" · ")}`
                          : ""
                      }`
                    : key}
                  style={{
                    // `aspectRatio` : la case prend sa hauteur de sa largeur
                    // réelle, elle reste carrée quelle que soit la taille de
                    // l'écran. `height: 30` la figeait en rectangle plat.
                    // `minWidth: 0` : c'est la piste de la grille qui fixe le
                    // plancher (minmax), pas la case. Un minimum posé ici
                    // empêchait la case de suivre une colonne plus étroite sur
                    // téléphone et débordait la grille.
                    minWidth: 0, aspectRatio: "1 / 1", borderRadius: 4, position: "relative",
                    zIndex: hoverCell === key ? 55 : undefined,
                    cursor: repliSelectable || jnpSelectable || bbSelectable || teaSelectable || moveSelectable || recupSelectable || titansByCell[key] ? "pointer" : "default",
                    background: cellBg,
                    border: repliSelectable
                      ? `2px ${repliDefaut ? "solid" : "dashed"} #fb923c`
                      : jnpIsSelected || bbIsSelected
                      ? "2px solid #16E08C"
                      : teaSelectable
                      ? "2px solid #FB923C"           // orange TEA
                      : moveIsClassic
                      ? "2px solid #71dbff"
                      : moveIsTeleport
                      ? "2px dashed #b88cff"
                      : recupSelectable
                      ? "2px dashed #FFD93D"
                      : jnpSelectable || bbSelectable
                      ? "2px dashed #16E08C"
                      : inPerimeter
                      ? `2px solid ${perimAccent}`
                      : isBldg
                      ? "1px solid rgba(255,255,255,.12)"
                      : "1px solid rgba(255,255,255,.14)",
                    boxShadow: repliSelectable
                      ? "0 0 10px rgba(251,146,60,.85)"
                      : teaSelectable
                      ? "0 0 10px rgba(251,146,60,.8)"
                      : moveIsClassic
                      ? "0 0 10px rgba(113,219,255,.7)"
                      : moveIsTeleport
                      ? "0 0 8px rgba(184,140,255,.6)"
                      : recupSelectable
                      ? "0 0 6px rgba(255,217,61,.5)"
                      : inPerimeter
                      ? `0 0 10px ${perimAccent}88, 0 0 3px ${perimAccent}`
                      : "none",
                    transition: "box-shadow .1s, background .1s",
                  }}
                >
                  {isBldg && cellData && cellData.blocks.length > 0 && (
                    <span style={{ position: "absolute", bottom: 2, right: 3, fontSize: ".68rem", fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.7)", whiteSpace: "nowrap" }}>
                      {cellData.socle !== cellData.blocks.length
                        ? `${cellData.socle}/${cellData.blocks.length}`
                        : cellData.blocks.length}
                    </span>
                  )}
                  {/* Un Téléporteur ne fonctionne que TANT QU'IL LUI RESTE
                      DES BLOCS (cf. getActiveTeleporterCells). Le 🌀 était
                      posé sur `isTeleporter` seul : une fois le bâtiment
                      cassé et vidé, l'icône restait affichée sur une case
                      devenue un simple couloir. Le joueur voyait deux
                      téléporteurs là où le moteur n'en comptait plus qu'un
                      (bug remonté par Nikola le 2026-08-17). */}
                  {cellData && cellData.isTeleporter && cellData.blocks.length > 0 && (
                    <span title={`${key} — Téléporteur actif`} style={{ position: "absolute", top: 1, left: 2, fontSize: ".68rem" }}>🌀</span>
                  )}
                  {moveIsTeleport && (
                    <span style={{ position: "absolute", top: 1, right: 2, fontSize: "8px", opacity: .8 }}>🌀</span>
                  )}
                  {looseBlocks[key] && looseBlocks[key].length > 0 && (() => {
                    const stack = looseBlocks[key];
                    const colorBlocks = stack.filter(c => !isSocleMarker(c));
                    const hasSocle = stack.some(isSocleMarker);
                    const total = stack.length;
                    const preview = stack.slice(-2); // 2 derniers
                    return (
                      <>
                        {/* Badge : nombre de blocs libres, et valeur du Socle
                            quand il y en a un au sol. Cette valeur est le
                            nombre d'étages qu'avait le bâtiment à sa
                            construction, et c'est ce qu'elle rapportera au
                            score : le joueur a le droit de la connaître.
                            Le conteneur ne se rend plus quand il n'a rien à
                            afficher — son fond noir laissait un petit carré
                            sombre sur les cases qui ne portaient qu'un Socle. */}
                        {colorBlocks.length > 0 && (
                          <div style={{
                            position: "absolute", top: 1, left: 2,
                            background: "rgba(0,0,0,.65)", borderRadius: 3,
                            padding: "1px 3px", display: "flex", alignItems: "center", gap: 3,
                          }}>
                            {colorBlocks.length > 0 && (
                              <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#FFD93D", lineHeight: 1 }}>
                                {colorBlocks.length}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Le Socle vit a droite de la case, les blocs a
                            gauche : les deux ne se confondent plus. Sa valeur
                            est le nombre d'etages du batiment a sa
                            construction, et vaut autant de points. */}
                        {hasSocle && (
                          <div
                            title={`Socle de valeur ${stack.filter(isSocleMarker).map(socleValue).join(" + ")} — autant que d'étages qu'avait le bâtiment à sa construction`}
                            style={{
                              position: "absolute", top: 1, right: 2, zIndex: 4,
                              display: "flex", alignItems: "center", gap: 2,
                              background: "rgba(0,0,0,.65)", borderRadius: 3,
                              padding: "1px 3px", cursor: "help",
                            }}
                          >
                            <img src={`${import.meta.env.BASE_URL}assets/rules/socle.png`}
                              alt="" aria-hidden="true"
                              style={{ width: 11, height: 11, objectFit: "contain", filter: "brightness(1.3)", display: "block" }} />
                            <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#fff", lineHeight: 1 }}>
                              {stack.filter(isSocleMarker).map(socleValue).join("+")}
                            </span>
                          </div>
                        )}
                        {/* Blocs libres au sol : meme icone que dans le stock
                            et le Repaire, pour qu'un bloc se reconnaisse
                            partout au meme dessin. */}
                        <div style={{ position: "absolute", bottom: 1, left: 2, display: "flex", gap: 1, flexWrap: "wrap", maxWidth: "80%", alignItems: "center", zIndex: 4 }}>
                          {colorBlocks.slice(-2).map((c, i) => (
                            <BlockIcon key={i} color={c} size={16} />
                          ))}
                          {colorBlocks.length > 2 && (
                            <span style={{ fontSize: "9px", color: "rgba(255,255,255,.75)", fontWeight: 700, lineHeight: "11px" }}>+{colorBlocks.length - 2}</span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                  {titan && <TitanBadge {...titan} />}
                </div>
              );
            })}
            <Gouttiere cle={`${r}9`} zone="droite" />
          </React.Fragment>
        ))}
        {/* Gouttière basse : attente sous la ligne I */}
        <div /><div />
        {[1,2,3,4,5,6,7,8,9].map((c) => <Gouttiere key={`bas${c}`} cle={`I${c}`} zone="bas" />)}
        <div />
      </div>
        );
      })()}

      {/* Composition du bâtiment cliqué, en position fixe pour ne pas être
          tronquée par le défilement horizontal de la grille. Les blocs sont
          listés du haut vers le bas, avec les vraies icônes. */}
      {hoverCell && hoverPos && state.board[hoverCell] && state.board[hoverCell].blocks.length > 0 && (
        <>
          <div
            onClick={() => { setHoverCell(null); setHoverPos(null); }}
            style={{ position: "fixed", inset: 0, zIndex: 300 }}
          />
          <div
            style={{
              position: "fixed", zIndex: 301,
              left: Math.min(Math.max(hoverPos.x, 90), window.innerWidth - 90),
              top: hoverPos.y - 8,
              transform: "translate(-50%, -100%)",
              background: "rgba(14,4,32,.97)", border: "1px solid rgba(255,217,61,.55)",
              borderRadius: 10, padding: "8px 10px",
              boxShadow: "0 10px 30px rgba(0,0,0,.7)", pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: ".66rem", color: "#FFD93D", fontWeight: 700, marginBottom: 5, whiteSpace: "nowrap", textAlign: "center" }}>
              {hoverCell} · socle {state.board[hoverCell].socle}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[...state.board[hoverCell].blocks].reverse().map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  <BlockIcon color={c} size={20} />
                  <span style={{ fontSize: ".66rem", color: "rgba(255,255,255,.7)" }}>{BLOCK_NAME[c]}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Popup de choix — bug remonté "2 débris différents sur la même
          case, je dois pouvoir choisir". N'apparaît que quand la case
          cliquée a plus d'1 type de débris distinct (couleur ou socle) ;
          sinon jouerRecuperation(key) s'exécute directement sans popup
          inutile. */}
      {recupChoiceCell && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }} onClick={() => setRecupChoiceCell(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(20,8,35,.97)", border: "2.5px solid #16E08C",
              boxShadow: "0 0 0 3px rgba(22,224,140,.35), 0 4px 18px rgba(22,224,140,.35)",
              borderRadius: 14, padding: "16px 20px", maxWidth: 280,
            }}
          >
            <div style={{ fontFamily: "'Bowlby One', sans-serif", color: "#7CF5C8", fontSize: ".95rem", marginBottom: 10 }}>
              🤲 Case {recupChoiceCell} — que ramasser ?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...new Set(looseBlocks[recupChoiceCell] || [])].map((val) => (
                <button
                  key={val}
                  onClick={() => { jouerRecuperation(recupChoiceCell, val); setRecupChoiceCell(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                    borderRadius: 8, border: "1.5px solid rgba(255,255,255,.25)",
                    background: "rgba(255,255,255,.06)", color: "#fff", cursor: "pointer", fontSize: ".8rem", fontWeight: 600,
                  }}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, display: "inline-block",
                    background: isSocleMarker(val) ? "#8a8a8a" : COLOR_HEX[val],
                    border: "1px solid rgba(0,0,0,.5)",
                  }} />
                  {isSocleMarker(val) ? `Socle (${socleValue(val)})` : `Bloc ${val}`}
                </button>
              ))}
            </div>
            <button onClick={() => setRecupChoiceCell(null)} style={{ ...cancelBtn(), marginTop: 10, width: "100%", fontSize: ".72rem" }}>
              ✕ Annuler
            </button>
          </div>
        </div>
      )}

  </>;
}
