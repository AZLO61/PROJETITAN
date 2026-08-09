import React from "react";
import Board3D from "../board3d/Board3D.jsx";
import CardVisual from "../cards/CardVisual.jsx";
import BlockStockBar from "../cards/BlockStockBar.jsx";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon, TitanBadge } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { ACTION_CARDS, CARD_LABEL, CARD_FORCE, PHASE_LABELS, EVENT_NAMES, COULEURS, COLOR_HEX, STANDARD_COLORS, ROWS, isBuildingCell, isSocleMarker } from "../../domain/index.js";
import { btnStyle, smallBtn, cancelBtn } from "../styles.js";

export default function RoundPanels({ vm }) {
  const {
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
    tcSel
  } = vm;
  return <>
      {/* ── PHASE REPOS — Vol en chaîne (refonte session) ──
          Ne démarre qu'une fois que TOUS les Titans ont joué leurs 3 cartes
          de la Manche (jouées ou défaussées cachées). Le Détonateur choisit
          UNE FOIS un sens de rotation, puis la chaîne se résout d'un coup :
          chaque Titan tire au hasard 1 carte parmi les 3 de son voisin dans
          ce sens, la révèle publiquement, puis la repose face cachée en
          Zone Repos (indisponible jusqu'à la Manche suivante). Plus de
          choix individuel — objectif anti-répétitivité (confirmé Nikola). */}
      {phase === "repos" && (
        <div style={{
          background: "rgba(227,35,71,.1)", border: "1px solid rgba(227,35,71,.35)",
          borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontSize: ".8rem",
        }}>
          <div style={{ fontFamily: "'Bowlby One', sans-serif", color: "#ff8fa3", marginBottom: 6 }}>
            🎴 Vol en chaîne — Phase Repos M{mancheNumber}
          </div>
          {!volDirection ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: "rgba(255,255,255,.75)" }}>
                Titan {titanState.detonateur} (Détonateur) choisit le sens de la chaîne :
              </span>
              <button onClick={() => chooseVolDirection("gauche")} style={smallBtn(true, "#e32347", "#C2185B")}>
                ⬅️ Gauche
              </button>
              <button onClick={() => chooseVolDirection("droite")} style={smallBtn(true, "#e32347", "#C2185B")}>
                ➡️ Droite
              </button>
              <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.45)" }}>
                Chaque Titan vole ensuite, au hasard, 1 carte à son voisin dans ce sens — révélée puis reposée face cachée.
              </span>
            </div>
          ) : (
            <div style={{ color: "#16E08C", fontSize: ".76rem" }}>
              ✅ Vol résolu (sens {volDirection === "gauche" ? "⬅️ antihoraire" : "➡️ horaire"}) — voir le journal d'actions ci-dessous.
            </div>
          )}
        </div>
      )}


      {/* ── VUE 3D ── */}
      {show3D && (
        <div style={{ marginBottom: 14 }}>
          <Board3D
            board={state.board}
            looseBlocks={looseBlocks}
            titans={titanState.players}
            boardVersion={boardSignature3D}
            selectedTitanId={selectedTitanId}
            onSelectTitan={setSelectedTitanId}
            moveClassic={moveClassic}
            moveTeleport={moveTeleport}
            moveMode={moveMode}
          />
          <div style={{ fontSize: ".66rem", color: "rgba(255,255,255,.35)", textAlign: "center", marginTop: 4 }}>
            Visualisation uniquement — joue sur la grille 2D ci-dessous
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
      />


      {/* ── STOCK BLOCS ── */}
      <BlockStockBar board={state.board} looseBlocks={looseBlocks} />


      {/* ── GRILLE 9×9 ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "18px repeat(9, minmax(28px, 1fr))",
        gridTemplateRows: "18px repeat(9, minmax(28px, 1fr))",
        gap: 2, marginBottom: 14,
        overflowX: "auto",
      }}>
        <div />
        {[1,2,3,4,5,6,7,8,9].map((c) => (
          <div key={c} style={{ display: "grid", placeItems: "center", fontSize: ".6rem", color: "rgba(255,255,255,.4)" }}>{c}</div>
        ))}
        {ROWS.map((r) => (
          <React.Fragment key={r}>
            <div style={{ display: "grid", placeItems: "center", fontSize: ".6rem", color: "rgba(255,255,255,.4)" }}>{r}</div>
            {[1,2,3,4,5,6,7,8,9].map((c) => {
              const key = r + c;
              const titan = titanCorners[key];
              const cellData = state.board[key];
              const isBldg = isBuildingCell(r, c);
              const topBlock = cellData && cellData.blocks.length > 0 ? cellData.blocks[cellData.blocks.length - 1] : null;
              const inPerimeter = perimeterKeys.has(key);
              const jnpSelectable = jnpMode && jnpPool.has(key);
              const jnpIsSelected = jnpMode && jnpSelected.includes(key);
              const bbSelectable = bbMode && bbReachable.has(key);
              const bbIsSelected = bbMode && bbDest === key;
              const moveSelectable = moveMode && moveReachable.has(key);
              const moveIsClassic = moveMode && moveClassic.has(key); // accessible sans téléporteur
              const moveIsTeleport = moveMode && !moveClassic.has(key) && moveTeleport.has(key); // téléporteur uniquement
              const recupSelectable = recupMode && recupPool.has(key);
              const teaSelectable = teaMode && teaTargets.has(key);

              // Périmètre 2D : couleur du Titan sélectionné
              const perimAccent = tcSel ? tcSel.accent : "#FFD93D";
              // Fond de la case dans le périmètre :
              // bâtiment → teinte du Titan en overlay sur la couleur du bloc du dessus
              // case vide → teinte légère
              let cellBg;
              if (jnpIsSelected || bbIsSelected) {
                cellBg = "rgba(22,224,140,.25)";
              } else if (teaSelectable) {
                cellBg = "rgba(251,146,60,.25)"; // orange TEA
              } else if (moveIsClassic) {
                cellBg = "rgba(113,219,255,.25)"; // classique : +10% opacité (0.25 vs 0.15)
              } else if (moveIsTeleport) {
                cellBg = "rgba(113,219,255,.15)"; // téléporteur : plus transparent
              } else if (recupSelectable) {
                cellBg = "rgba(255,217,61,.15)";
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
                cellBg = "rgba(255,255,255,.02)";
              }

              return (
                <div
                  key={key}
                  onClick={() => {
                    if (jnpMode) { if (jnpSelectable) jnpToggleCell(key); return; }
                    if (bbMode) { if (bbSelectable) bbSelectCell(key); return; }
                    if (teaMode) { if (teaSelectable) jouerTeteEnAvant(key); return; }
                    if (moveMode) { if (moveSelectable) jouerMouvementGratuit(key); return; }
                    if (recupMode) { if (recupSelectable) jouerRecuperation(key); return; }
                    if (titansByCell[key]) setSelectedTitanId(titansByCell[key]);
                  }}
                  title={cellData ? `${key} · ${cellData.blocks.length}étg · socle${cellData.socle}` : key}
                  style={{
                    minWidth: 28, height: 30, borderRadius: 4, position: "relative",
                    cursor: jnpSelectable || bbSelectable || teaSelectable || moveSelectable || recupSelectable || titansByCell[key] ? "pointer" : "default",
                    background: cellBg,
                    border: jnpIsSelected || bbIsSelected
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
                      : "1px solid rgba(255,255,255,.04)",
                    boxShadow: teaSelectable
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
                    <span style={{ position: "absolute", bottom: 2, right: 3, fontSize: ".56rem", fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.7)", whiteSpace: "nowrap" }}>
                      {cellData.socle !== cellData.blocks.length
                        ? `${cellData.socle}/${cellData.blocks.length}`
                        : cellData.blocks.length}
                    </span>
                  )}
                  {cellData && cellData.isTeleporter && (
                    <span style={{ position: "absolute", top: 1, left: 2, fontSize: ".5rem" }}>🌀</span>
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
                        {/* Badge total blocs libres */}
                        <div style={{
                          position: "absolute", top: 1, left: 2,
                          background: "rgba(0,0,0,.65)", borderRadius: 3,
                          padding: "1px 3px", display: "flex", alignItems: "center", gap: 2,
                        }}>
                          {hasSocle && <span style={{ fontSize: "7px", lineHeight: 1 }}>🧱</span>}
                          {colorBlocks.length > 0 && (
                            <span style={{ fontSize: ".5rem", fontWeight: 700, color: "#FFD93D", lineHeight: 1 }}>
                              {total}
                            </span>
                          )}
                        </div>
                        {/* Carrés couleur empilés */}
                        <div style={{ position: "absolute", bottom: 2, left: 2, display: "flex", gap: 1, flexWrap: "wrap", maxWidth: "80%" }}>
                          {preview.map((c, i) =>
                            isSocleMarker(c) ? (
                              <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: "#8a8a8a", border: "1px solid rgba(255,255,255,.3)", display: "block" }} />
                            ) : (
                              <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_HEX[c], border: "1px solid rgba(0,0,0,.5)", display: "block", boxShadow: `0 0 4px ${COLOR_HEX[c]}88` }} />
                            )
                          )}
                          {total > 2 && (
                            <span style={{ fontSize: "7px", color: "rgba(255,255,255,.6)", fontWeight: 700, lineHeight: "8px" }}>+{total - 2}</span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                  {titan && <TitanBadge {...titan} />}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

  </>;
}
