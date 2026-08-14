import React from "react";
import CardVisual from "../cards/CardVisual.jsx";
import BlockStockBar from "../cards/BlockStockBar.jsx";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon, TitanBadge } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { ACTION_CARDS, CARD_LABEL, CARD_FORCE, PHASE_LABELS, EVENT_NAMES, COULEURS, COLOR_HEX, STANDARD_COLORS, countRepaireColors } from "../../domain/index.js";
import { btnStyle, smallBtn, cancelBtn } from "../styles.js";
import BlockIcon from "../BlockIcon.jsx";
import { BLOCK_NAME } from "../blockNames.js";

export default function DecisionPanels({ vm }) {
  // Journal d'actions : replie par defaut. Sur une partie d'1h30 il grossit
  // sans fin et poussait le reste de la page vers le bas, alors qu'on ne le
  // consulte que ponctuellement pour verifier ce qui vient de se passer.
  const [showLog, setShowLog] = React.useState(false);
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
      {/* ── LOG D'ACTIONS ── */}
      {actionLog.length > 0 && (
        <div style={{
          fontSize: ".72rem", background: "rgba(0,0,0,.3)", borderRadius: 10,
          padding: "8px 12px", marginBottom: 12, lineHeight: 1.6,
          maxHeight: showLog ? 220 : undefined, overflowY: showLog ? "auto" : "visible",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setShowLog((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6, flex: 1,
                background: "none", border: "none", padding: 0, cursor: "pointer",
                color: "rgba(255,255,255,.4)", fontSize: ".68rem", fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span>{showLog ? "▲" : "▼"}</span>
              Journal d'actions
              <span style={{ color: "rgba(255,255,255,.28)" }}>({actionLog.length})</span>
            </button>
            {showLog && (
              <button onClick={() => setActionLog([])} style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", cursor: "pointer", fontSize: ".68rem" }}>✕ vider</button>
            )}
          </div>
          {showLog && actionLog.map((line, i) => {
            // Bug #10 (tracker) : code couleur par Titan dans les logs —
            // on repère le 1er Titan mentionné ("Titan 3", "T2"…) et on
            // applique sa couleur (TITAN_COLORS) en liseré + texte, pour
            // repérer d'un coup d'œil qui a fait quoi. Lignes neutres
            // (sans Titan identifié, ex. résultats de scoring globaux)
            // gardent le style gris d'origine.
            const m = line.match(/T(?:itan)?\.?\s*(\d)/);
            const titanId = m ? m[1] : null;
            const c = titanId && TITAN_COLORS[titanId] ? TITAN_COLORS[titanId].accent : null;
            return (
              <div key={i} style={{
                color: c || "rgba(255,255,255,.7)",
                borderLeft: c ? `3px solid ${c}` : "3px solid transparent",
                paddingLeft: 6,
              }}>{line}</div>
            );
          })}
        </div>
      )}


      {/* ── SCORING FINAL ── */}
      {showScoring && (
        <div style={{
          background: "rgba(255,217,61,.06)", border: "1.5px solid rgba(255,217,61,.3)",
          borderRadius: 14, padding: "14px 16px", marginBottom: 12, fontSize: ".78rem",
        }}>
          <div style={{ fontFamily: "'Bowlby One', sans-serif", color: "#FFD93D", fontSize: "1rem", marginBottom: 10 }}>🏆 Scoring final</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#22C55E", fontWeight: 700, marginBottom: 6, fontSize: ".76rem" }}>
              Placement secret des Blocs Verts
            </div>
            {titanState.players.map((t) => {
              const vertCount = getVertCount(t);
              if (vertCount === 0) return null;
              const owned = countRepaireColors(t);
              return (
                <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  <strong style={{ color: "#FFD93D", fontSize: ".74rem" }}>{titanDisplayName(t.id)}</strong>
                  {Array.from({ length: vertCount }).map((_, i) => (
                    <select key={i}
                      value={vertAssignments[t.id]?.[i] ? `${vertAssignments[t.id][i].type}:${vertAssignments[t.id][i].target}` : ""}
                      onChange={(e) => updateVertAssignment(t.id, i, e.target.value)}
                      style={{ background: "rgba(255,255,255,.08)", color: "#fffaee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "3px 6px", fontSize: ".7rem" }}>
                      <option value="">Vert #{i + 1}…</option>
                      {["bleu","rose","orange","rouge"].map((c) => (
                        <option key={c} value={`color:${c}`} disabled={owned[c] < 1}>Barème {BLOCK_NAME[c]}{owned[c] < 1 ? " (0 bloc)" : ""}</option>
                      ))}
                      <option value="adn:bagarre">Piste Bagarre +1</option>
                      <option value="adn:destruction">Piste Destruction +1</option>
                    </select>
                  ))}
                </div>
              );
            })}
            {titanState.players.every((t) => getVertCount(t) === 0) && (
              <div style={{ color: "rgba(255,255,255,.4)" }}>Aucun Vert collecté.</div>
            )}
          </div>
          {finalScoreResult && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".74rem" }}>
                <thead>
                  <tr style={{ color: "#FFD93D" }}>
                    <th style={{ padding: "3px 8px", textAlign: "left" }}></th>
                    {titanState.players.map((t) => <th key={t.id} style={{ padding: "3px 8px" }}>{titanDisplayName(t.id)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="bleu" size={18} />{BLOCK_NAME.bleu}</span>, (t) => finalScoreResult.baremeScores[t.id].bleu, "bleu"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="rose" size={18} />{BLOCK_NAME.rose}</span>, (t) => finalScoreResult.baremeScores[t.id].rose, "rose"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="orange" size={18} />{BLOCK_NAME.orange}</span>, (t) => finalScoreResult.baremeScores[t.id].orange, "orange"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="rouge" size={18} />{BLOCK_NAME.rouge}</span>, (t) => finalScoreResult.baremeScores[t.id].rouge, "rouge"],
                    ["Bonus Rose +10", (t) => finalScoreResult.totals[t.id].roseBonus || "—"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <img src={`${import.meta.env.BASE_URL}assets/rules/socle.png`} alt="" aria-hidden="true"
                        style={{ width: 18, height: 18, objectFit: "contain", filter: "brightness(1.2)" }} />
                      Socles
                    </span>, (t) => finalScoreResult.socleTotal[t.id]],
                    ["🗿 Collectionneur", (t) => finalScoreResult.totals[t.id].collectionneurBonus || "—"],
                    ["🌈 Arc-en-ciel", (t) => rainbowWinnerId === t.id ? 5 : "—"],
                    ["💪 Bagarre", (t) => finalScoreResult.totals[t.id].bagarrePts],
                    ["💥 Destruction", (t) => finalScoreResult.totals[t.id].destructionPts],
                    ["💉 Adrénaline×3", (t) => finalScoreResult.totals[t.id].adrenalinePts],
                  ].map(([label, fn], rowIdx) => (
                    <tr key={rowIdx} style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      <td style={{ padding: "3px 8px", color: "rgba(255,255,255,.6)" }}>{label}</td>
                      {titanState.players.map((t) => <td key={t.id} style={{ padding: "3px 8px", textAlign: "center" }}>{fn(t)}</td>)}
                    </tr>
                  ))}
                  <tr style={{ background: "rgba(255,217,61,.1)", fontWeight: 700 }}>
                    <td style={{ padding: "5px 8px", color: "#FFD93D" }}>TOTAL</td>
                    {titanState.players.map((t) => <td key={t.id} style={{ padding: "5px 8px", color: "#FFD93D", textAlign: "center" }}>{finalScoreResult.totals[t.id].total}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

  </>;
}
