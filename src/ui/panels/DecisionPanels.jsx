import React from "react";
import Board3D from "../board3d/Board3D.jsx";
import CardVisual from "../cards/CardVisual.jsx";
import BlockStockBar from "../cards/BlockStockBar.jsx";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon, TitanBadge } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { ACTION_CARDS, CARD_LABEL, CARD_FORCE, PHASE_LABELS, EVENT_NAMES, COULEURS, COLOR_HEX, STANDARD_COLORS, countRepaireColors } from "../../domain/index.js";
import { btnStyle, smallBtn, cancelBtn } from "../styles.js";

export default function DecisionPanels({ vm }) {
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
      {/* ── DÉCISIONS DIL/RAGE ── */}
      {currentDecision && (
        <div style={{
          background: currentDecision.type === "RAGE" ? "rgba(227,35,71,.12)" : "rgba(45,141,245,.12)",
          border: `1.5px solid ${currentDecision.type === "RAGE" ? "#e32347" : "#2D8DF5"}`,
          borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: ".78rem",
        }}>
          <div style={{ fontFamily: "'Bowlby One', sans-serif", marginBottom: 8, color: currentDecision.type === "RAGE" ? "#ff8fa3" : "#71dbff" }}>
            {currentDecision.type} — {currentDecision.cardLabel} · T{currentDecision.attackerId} vs T{currentDecision.defenderId}
            {decisionQueue.length > 1 ? ` (+${decisionQueue.length - 1} en attente)` : ""}
          </div>

          {currentDecision.type === "DIL" && currentDecision.stage === "ATTACKER_PICK" && (() => {
            const defender = titanState.players.find((t) => t.id === currentDecision.defenderId);
            const availableColors = [...new Set(defender.repaire)];
            return (
              <div>
                <p style={{ marginBottom: 6 }}>T{currentDecision.attackerId} désigne 2 couleurs de T{currentDecision.defenderId} :</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {availableColors.length === 0 && <span style={{ color: "rgba(255,255,255,.5)" }}>Repaire vide.</span>}
                  {availableColors.map((c) => (
                    <button key={c} onClick={() => dilAttackerPick(c)} style={{
                      background: currentDecision.attackerChoices.includes(c) ? COLOR_HEX[c] : "rgba(255,255,255,.08)",
                      border: `2px solid ${COLOR_HEX[c]}`, borderRadius: 8, color: "#fff",
                      padding: "4px 12px", fontSize: ".76rem", cursor: "pointer", fontWeight: 700,
                    }}>{c}</button>
                  ))}
                </div>
                <button onClick={dilValidateAttackerPick} disabled={currentDecision.attackerChoices.length !== 2}
                  style={smallBtn(currentDecision.attackerChoices.length === 2, "#2D8DF5", "#1E3A8A")}>
                  Valider ({currentDecision.attackerChoices.length}/2)
                </button>
              </div>
            );
          })()}

          {currentDecision.type === "DIL" && currentDecision.stage === "DEFENDER_PICK" && (() => {
            const defender = titanState.players.find((t) => t.id === currentDecision.defenderId);
            const canPay = (defender.adrenaline || 0) >= 1;
            return (
              <div>
                <p style={{ marginBottom: 6 }}>T{currentDecision.defenderId} : laquelle perdre ?</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {currentDecision.attackerChoices.map((c) => (
                    <button key={c} onClick={() => resolveDilDefenderPick(c)} style={{
                      background: COLOR_HEX[c], border: "none", borderRadius: 8, color: "#fff",
                      padding: "5px 14px", fontSize: ".78rem", fontWeight: 700, cursor: "pointer",
                    }}>Perdre {c}</button>
                  ))}
                  <button onClick={resolveDilCancelWithAdrenaline} disabled={!canPay} style={{
                    background: canPay ? "rgba(134,255,113,.15)" : "rgba(255,255,255,.08)",
                    border: `1.5px solid ${canPay ? "#86ff71" : "rgba(255,255,255,.2)"}`,
                    borderRadius: 8, color: canPay ? "#86ff71" : "rgba(255,255,255,.4)",
                    padding: "5px 14px", fontSize: ".76rem", cursor: canPay ? "pointer" : "not-allowed",
                  }}>
                    Payer 1 💉 ({defender.adrenaline || 0}) → Annuler DIL
                  </button>
                </div>
              </div>
            );
          })()}

          {currentDecision.type === "RAGE" && (() => {
            const defender = titanState.players.find((t) => t.id === currentDecision.defenderId);
            const showAdrOpt = defender.repaire.length < 2 && (defender.adrenaline || 0) > 0;
            return (
              <div>
                <p style={{ marginBottom: 6 }}>T{currentDecision.attackerId} choisit librement :</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {defender.repaire.map((c, i) => (
                    <button key={i} onClick={() => resolveRagePick(c)} style={{
                      background: COLOR_HEX[c], border: "none", borderRadius: 8, color: "#fff",
                      padding: "5px 14px", fontSize: ".78rem", fontWeight: 700, cursor: "pointer",
                    }}>{c}</button>
                  ))}
                  {showAdrOpt && (
                    <button onClick={resolveRagePickAdrenaline} style={{
                      background: "rgba(134,255,113,.2)", border: "1.5px solid #86ff71",
                      borderRadius: 8, color: "#86ff71", padding: "5px 14px", fontSize: ".78rem", fontWeight: 700, cursor: "pointer",
                    }}>💉 ({defender.adrenaline}) FAQ#5</button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}


      {/* ── LOG D'ACTIONS ── */}
      {actionLog.length > 0 && (
        <div style={{
          fontSize: ".72rem", background: "rgba(0,0,0,.3)", borderRadius: 10,
          padding: "8px 12px", marginBottom: 12, lineHeight: 1.6,
          maxHeight: 120, overflowY: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ color: "rgba(255,255,255,.4)", fontSize: ".65rem" }}>Journal d'actions</span>
            <button onClick={() => setActionLog([])} style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", cursor: "pointer", fontSize: ".65rem" }}>✕ vider</button>
          </div>
          {actionLog.map((line, i) => <div key={i} style={{ color: "rgba(255,255,255,.7)" }}>{line}</div>)}
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
                  <strong style={{ color: "#FFD93D", fontSize: ".74rem" }}>T{t.id}</strong>
                  {Array.from({ length: vertCount }).map((_, i) => (
                    <select key={i}
                      value={vertAssignments[t.id]?.[i] ? `${vertAssignments[t.id][i].type}:${vertAssignments[t.id][i].target}` : ""}
                      onChange={(e) => updateVertAssignment(t.id, i, e.target.value)}
                      style={{ background: "rgba(255,255,255,.08)", color: "#fffaee", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "3px 6px", fontSize: ".7rem" }}>
                      <option value="">Vert #{i + 1}…</option>
                      {["bleu","rose","orange","rouge"].map((c) => (
                        <option key={c} value={`color:${c}`} disabled={owned[c] < 1}>Barème {c}{owned[c] < 1 ? " (0 bloc)" : ""}</option>
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
                    {titanState.players.map((t) => <th key={t.id} style={{ padding: "3px 8px" }}>T{t.id}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Bleu", (t) => finalScoreResult.baremeScores[t.id].bleu],
                    ["Rose", (t) => finalScoreResult.baremeScores[t.id].rose],
                    ["Orange", (t) => finalScoreResult.baremeScores[t.id].orange],
                    ["Rouge", (t) => finalScoreResult.baremeScores[t.id].rouge],
                    ["Bonus Rose +10", (t) => finalScoreResult.totals[t.id].roseBonus || "—"],
                    ["Socles", (t) => finalScoreResult.socleTotal[t.id]],
                    ["🗿 Collectionneur", (t) => finalScoreResult.totals[t.id].collectionneurBonus || "—"],
                    ["🌈 Arc-en-ciel", (t) => rainbowWinnerId === t.id ? 5 : "—"],
                    ["💪 Bagarre", (t) => finalScoreResult.totals[t.id].bagarrePts],
                    ["💥 Destruction", (t) => finalScoreResult.totals[t.id].destructionPts],
                    ["💉 Adrénaline×3", (t) => finalScoreResult.totals[t.id].adrenalinePts],
                  ].map(([label, fn]) => (
                    <tr key={label} style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
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
