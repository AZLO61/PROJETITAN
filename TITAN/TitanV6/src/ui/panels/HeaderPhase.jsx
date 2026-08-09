import React from "react";
import Board3D from "../board3d/Board3D.jsx";
import CardVisual from "../cards/CardVisual.jsx";
import BlockStockBar from "../cards/BlockStockBar.jsx";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon, TitanBadge } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { ACTION_CARDS, CARD_LABEL, CARD_FORCE, PHASE_LABELS, EVENT_NAMES, COULEURS, COLOR_HEX, STANDARD_COLORS } from "../../domain/index.js";
import { btnStyle, smallBtn, cancelBtn } from "../styles.js";

export default function HeaderPhase({ vm }) {
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
      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: "'Bowlby One', sans-serif", color: "#FFD93D", fontSize: "1.1rem", margin: 0 }}>
          BIG CITY <span style={{ color: "rgba(255,255,255,.4)", fontSize: ".75rem" }}>#{seedCount}</span>
        </h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={regenerate} style={btnStyle("#FF6B1A", "#FF2E63")}>🔄 Nouvelle partie</button>
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title={undoStack.length === 0 ? "Aucune action à annuler" : `Annuler (${undoStack.length} coup${undoStack.length > 1 ? "s" : ""} disponible${undoStack.length > 1 ? "s" : ""})`}
            style={{
              ...btnStyle(undoStack.length > 0 ? "#A78BFA" : null, undoStack.length > 0 ? "#7C3AED" : null),
              opacity: undoStack.length === 0 ? 0.35 : 1,
              cursor: undoStack.length === 0 ? "not-allowed" : "pointer",
              position: "relative",
            }}
          >
            ↩ Annuler{undoStack.length > 0 && <span style={{ fontSize: ".6rem", marginLeft: 4, opacity: .8 }}>×{undoStack.length}</span>}
          </button>
          <button onClick={() => setShowScoring((s) => !s)} style={btnStyle(showScoring ? "#16E08C" : null, showScoring ? "#00C97A" : null, showScoring)}>
            🏆 Scoring
          </button>
          <button onClick={() => setShow3D((s) => !s)} style={btnStyle(show3D ? "#71dbff" : null, show3D ? "#2D8DF5" : null, show3D)}>
            🧊 Vue 3D
          </button>
        </div>
      </div>


      {/* ── BARRE DE PHASE + INDICATEUR TITAN ACTIF ── */}
      <div style={{ marginBottom: 10 }}>
        {/* Ligne phase */}
        <div style={{
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
          background: "rgba(0,0,0,.25)", borderRadius: "10px 10px 0 0", padding: "6px 12px",
        }}>
          <span style={{ fontSize: ".78rem", fontFamily: "'Bowlby One', sans-serif", color: "#FFD93D" }}>
            M{mancheNumber} · {PHASE_LABELS[phase]}
          </span>
          <span style={{ fontSize: ".7rem", color: "rgba(255,255,255,.4)", marginLeft: "auto" }}>
            {titanState.ordreJeu.map((id) => {
              const isAi = titanModes[id] === "ia";
              return `T${id}${isAi ? "🤖" : ""}${phaseValidated[id] ? "✅" : "⬜"}`;
            }).join("  ")}
          </span>
        </div>
        {/* Bandeau Titan actif — bien visible */}
        {phase === "action" && activePlayerId != null && (() => {
          const atc = TITAN_COLORS[activePlayerId];
          const isAi = titanModes[activePlayerId] === "ia";
          return (
            <div style={{
              background: atc ? `linear-gradient(90deg, ${atc.accent}33 0%, ${atc.accent}11 100%)` : "rgba(22,224,140,.1)",
              border: `1px solid ${atc ? atc.accent : "#16E08C"}`,
              borderTop: "none",
              borderRadius: "0 0 10px 10px",
              padding: "7px 12px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <TitanIcon titanId={activePlayerId} size={26} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Bowlby One', sans-serif", fontSize: ".82rem", color: atc?.accent }}>
                  {isAi ? "🤖 IA — " : "👤 "}{titanDisplayName(activePlayerId)} joue
                  {isAi && aiPlaying && aiStepLabel && (
                    <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.6)", marginLeft: 8, fontStyle: "italic" }}>{aiStepLabel}</span>
                  )}
                </div>
                {!isAi && (() => {
                  const activeTitan = titanState.players.find(t => t.id === activePlayerId);
                  const cardsLeft = activeTitan?.programmed.length ?? 0;
                  const hint = cardsLeft > 0
                    ? `👆 Clique ton Titan sur la grille, puis joue une carte ou utilise un passif`
                    : `✅ Plus de cartes — clique "Valider ma Phase" pour finir ton tour`;
                  return (
                    <div style={{ fontSize: ".65rem", color: "rgba(255,255,255,.6)", marginTop: 2 }}>
                      {hint}
                    </div>
                  );
                })()}
                {isAi && (
                  <div style={{ fontSize: ".65rem", color: "rgba(255,255,255,.45)" }}>
                    {titanState.players.find(t => t.id === activePlayerId)?.programmed.length ?? 0} carte(s) restante(s)
                  </div>
                )}
              </div>
              {isAi && aiPlaying && (
                <div style={{
                  marginLeft: "auto", width: 20, height: 20,
                  border: `2px solid ${atc?.accent}`,
                  borderTop: "2px solid transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }} />
              )}
            </div>
          );
        })()}
        {phase === "action" && activePlayerId == null && (
          <div style={{
            background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)",
            borderTop: "none", borderRadius: "0 0 10px 10px",
            padding: "6px 12px", fontSize: ".75rem", color: "rgba(255,255,255,.4)",
          }}>
            ✅ Phase Action terminée — tous les Titans ont joué
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes titanPulse { 0%,100% { box-shadow: 0 0 0 3px var(--tc-accent,#16E08C)44, 0 0 18px var(--tc-accent,#16E08C)55; } 50% { box-shadow: 0 0 0 5px var(--tc-accent,#16E08C)66, 0 0 32px var(--tc-accent,#16E08C)88; } }`}</style>


      {/* ── ANIMATION IN PROGRESS INDICATOR ── */}
      {animating && (
        <div style={{
          background: "rgba(255,211,61,.12)", border: "1px solid #FFD93D",
          borderRadius: 10, padding: "6px 14px", marginBottom: 8,
          display: "flex", alignItems: "center", gap: 8, fontSize: ".75rem", color: "#FFD93D",
        }}>
          <div style={{ width: 14, height: 14, border: "2px solid #FFD93D", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          {animLabel || "Animation en cours…"}
        </div>
      )}


      {/* ── FIN DE PARTIE ALERT ── */}
      {endGameReasons.length > 0 && (
        <div style={{
          background: "rgba(227,35,71,.14)", border: "1.5px solid #e32347",
          borderRadius: 12, padding: "8px 14px", marginBottom: 10, fontSize: ".78rem",
        }}>
          🛑 <strong style={{ color: "#ff8fa3" }}>Condition de fin remplie</strong> — termine la Manche normalement.
          {endGameReasons.map((r, i) => <div key={i} style={{ marginTop: 3, color: "rgba(255,255,255,.7)" }}>{r}</div>)}
        </div>
      )}

      {/* ── EVENT ── */}
      {phase === "evenement" && eventsEnabled && (
        <div style={{
          background: "rgba(45,141,245,.1)", border: "1px solid rgba(45,141,245,.3)",
          borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontSize: ".8rem",
        }}>
          🎲 <strong style={{ color: "#71dbff" }}>Événement M{mancheNumber} :</strong> {currentEvent || "…"}{" "}
          <span style={{ color: "rgba(255,255,255,.4)", fontSize: ".7rem" }}>(stub)</span>
        </div>
      )}

  </>;
}
