import React from "react";
import Board3D from "../board3d/Board3D.jsx";
import CardVisual from "../cards/CardVisual.jsx";
import BlockStockBar from "../cards/BlockStockBar.jsx";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon, TitanBadge } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { ACTION_CARDS, CARD_LABEL, CARD_FORCE, PHASE_LABELS, EVENT_NAMES, COULEURS, COLOR_HEX, STANDARD_COLORS } from "../../domain/index.js";
import { btnStyle, smallBtn, cancelBtn } from "../styles.js";

export default function BoardPanel({ vm }) {
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
      {/* ── PANNEAU TITAN SÉLECTIONNÉ ── */}
      {selectedTitan && (
        <div style={{
          // Panneau d'actions (cartes/passifs) : reste neutre — la
          // surbrillance "c'est ton tour" ne vit que sur le panneau
          // ressources (TitanResourceBand), pas ici, pour éviter que
          // l'œil hésite entre deux zones en glow simultanément.
          background: tcSel ? `${tcSel.accent}14` : "rgba(255,255,255,.04)",
          border: tcSel ? `1.5px solid ${tcSel.accent}55` : "1.5px solid rgba(255,255,255,.1)",
          boxShadow: "none",
          borderRadius: 14, padding: "12px 14px", marginBottom: 12,
          transition: "all .2s",
        }}>
          {/* En-tête Titan */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: tcSel?.gradient, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Titan One', sans-serif", fontSize: ".9rem", color: "#fff",
            }}>T{selectedTitan.id}</div>
            <div>
              <div style={{ fontFamily: "'Bowlby One', sans-serif", color: tcSel?.accent, fontSize: ".9rem" }}>
                Titan {selectedTitan.id} — {selectedTitan.cell}
              </div>
              <div style={{ fontSize: ".68rem", color: "rgba(255,255,255,.55)" }}>
                Périmètre: {perimeterCells.length} case(s) · Énergie TC: <strong style={{ color: "#FFD93D" }}>{energie}</strong> · 💉 {selectedTitan.adrenaline || 0}
              </div>
            </div>
          </div>

          {/* ── PASSIFS : MOUVEMENT + RÉCUPÉRATION ── */}
          {titanModes[selectedTitan.id] !== "ia" && (
          <div style={{
            background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 10, padding: "8px 10px", marginBottom: 10,
          }}>
            <div style={{ fontSize: ".65rem", color: "rgba(255,255,255,.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>
              Passifs (avant ou après une carte)
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>

              {/* MOUVEMENT */}
              <div style={{
                flex: 1, minWidth: 140,
                background: passifUsed[selectedTitan.id]?.move ? "rgba(255,255,255,.02)" : "rgba(113,219,255,.08)",
                border: `1px solid ${passifUsed[selectedTitan.id]?.move ? "rgba(255,255,255,.1)" : moveMode ? "#71dbff" : "rgba(113,219,255,.25)"}`,
                borderRadius: 8, padding: "7px 10px",
                opacity: passifUsed[selectedTitan.id]?.move ? 0.5 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: passifUsed[selectedTitan.id]?.move || moveMode ? 0 : 5 }}>
                  <span style={{ fontSize: ".75rem" }}>🦶</span>
                  <strong style={{ fontSize: ".72rem", color: "#71dbff" }}>Mouvement</strong>
                  {passifUsed[selectedTitan.id]?.move && (
                    <span style={{ fontSize: ".62rem", color: "rgba(255,255,255,.4)", marginLeft: "auto" }}>✅ utilisé</span>
                  )}
                </div>
                {!passifUsed[selectedTitan.id]?.move && !moveMode && (
                  <>
                    <div style={{ fontSize: ".62rem", color: "rgba(255,255,255,.45)", marginBottom: 6 }}>
                      Déplace ton Titan de {moveMaxRange} case{moveMaxRange > 1 ? "s" : ""} — clique le bouton puis une case sur la grille
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={toggleMoveMode}
                        disabled={!canUseMovePassif(selectedTitan.id)}
                        style={{
                          ...smallBtn(canUseMovePassif(selectedTitan.id), "#71dbff", "#2D8DF5"),
                          fontSize: ".72rem", padding: "5px 12px",
                        }}
                      >
                        ▶ Se déplacer
                      </button>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: ".68rem", color: (selectedTitan.adrenaline || 0) < 1 ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.7)" }}>
                        <input type="checkbox" checked={moveAdrenaline}
                          disabled={(selectedTitan.adrenaline || 0) < 1}
                          onChange={(e) => setMoveAdrenaline(e.target.checked)} />
                        +1 case 💉
                      </label>
                    </div>
                  </>
                )}
                {!passifUsed[selectedTitan.id]?.move && moveMode && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: ".7rem", color: "#71dbff", fontWeight: 600 }}>
                        👆 Clique une case ({moveReachable.size} dispo)
                      </span>
                      <button onClick={toggleMoveMode} style={{ ...cancelBtn(), fontSize: ".68rem" }}>✕ Annuler</button>
                    </div>
                    <div style={{ display: "flex", gap: 10, fontSize: ".62rem" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 2, background: "rgba(113,219,255,.25)", border: "2px solid #71dbff", display: "inline-block" }} />
                        <span style={{ color: "rgba(255,255,255,.6)" }}>Classique ({moveClassic.size})</span>
                      </span>
                      {moveTeleport.size > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 12, height: 12, borderRadius: 2, background: "rgba(113,219,255,.15)", border: "2px dashed #b88cff", display: "inline-block" }} />
                          <span style={{ color: "rgba(255,255,255,.6)" }}>🌀 Téléporteur ({moveTeleport.size})</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* RÉCUPÉRATION */}
              <div style={{
                flex: 1, minWidth: 140,
                background: passifUsed[selectedTitan.id]?.recup ? "rgba(255,255,255,.02)" : "rgba(22,224,140,.08)",
                border: `1px solid ${passifUsed[selectedTitan.id]?.recup ? "rgba(255,255,255,.1)" : recupMode ? "#16E08C" : "rgba(22,224,140,.25)"}`,
                borderRadius: 8, padding: "7px 10px",
                opacity: passifUsed[selectedTitan.id]?.recup ? 0.5 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: passifUsed[selectedTitan.id]?.recup || recupMode ? 0 : 5 }}>
                  <span style={{ fontSize: ".75rem" }}>🤲</span>
                  <strong style={{ fontSize: ".72rem", color: "#16E08C" }}>Récupération</strong>
                  {passifUsed[selectedTitan.id]?.recup && (
                    <span style={{ fontSize: ".62rem", color: "rgba(255,255,255,.4)", marginLeft: "auto" }}>✅ utilisé</span>
                  )}
                </div>
                {!passifUsed[selectedTitan.id]?.recup && !recupMode && (
                  <>
                    <div style={{ fontSize: ".62rem", color: "rgba(255,255,255,.45)", marginBottom: 6 }}>
                      Ramasse 1 bloc dans ton Périmètre — clique le bouton puis une case jaune
                    </div>
                    <button
                      onClick={toggleRecupMode}
                      disabled={recupPool.size === 0 || !canUseRecupPassif(selectedTitan.id)}
                      style={{
                        ...smallBtn(recupPool.size > 0 && canUseRecupPassif(selectedTitan.id), "#16E08C", "#00C97A"),
                        fontSize: ".72rem", padding: "5px 12px",
                      }}
                    >
                      ▶ Ramasser {recupPool.size === 0 ? "(aucun dispo)" : `(${recupPool.size})`}
                    </button>
                  </>
                )}
                {!passifUsed[selectedTitan.id]?.recup && recupMode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: ".7rem", color: "#16E08C", fontWeight: 600 }}>
                      👆 Clique une case jaune ({recupPool.size} dispo)
                    </span>
                    <button onClick={toggleRecupMode} style={{ ...cancelBtn(), fontSize: ".68rem" }}>✕ Annuler</button>
                  </div>
                )}
              </div>

            </div>
          </div>
          )} {/* fin guard passifs IA */}

          {/* ── CARTES ── */}
          {titanModes[selectedTitan.id] !== "ia" && (
          <div style={{ marginBottom: 8 }}>

            {/* PHASE PROGRAMMATION */}
            {phase === "programmation" && (
              <div>
                {selectedTitan.programmed.length === 3 ? (
                  <div style={{
                    background: "rgba(22,224,140,.08)", border: "1px solid rgba(22,224,140,.3)",
                    borderRadius: 8, padding: "8px 10px", fontSize: ".74rem", color: "#16E08C",
                  }}>
                    ✅ 3 cartes programmées — attends les autres Titans
                  </div>
                ) : progCountdown !== null ? (
                  // Compte à rebours actif : 3 cartes choisies, en attente de validation
                  <div style={{
                    background: "rgba(255,217,61,.08)", border: "1px solid rgba(255,217,61,.35)",
                    borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    <div style={{ fontSize: ".78rem", color: "#FFD93D", fontWeight: 700 }}>
                      Programmation dans {progCountdown}s…
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {progSelection.map((cardId) => (
                        <CardVisual key={cardId} cardId={cardId} selected size="small"
                          accentColor={TITAN_COLORS[selectedTitan.id]?.accent}
                          onClick={() => toggleProgCard(cardId)}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        if (progCountdownTimer) clearInterval(progCountdownTimer);
                        setProgCountdown(null);
                        setProgCountdownTimer(null);
                        setProgSelection([]);
                      }}
                      style={{ ...cancelBtn(), fontSize: ".72rem", alignSelf: "flex-start" }}
                    >
                      ✕ Modifier ma sélection
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: ".68rem", color: "rgba(255,255,255,.5)", marginBottom: 6 }}>
                      Sélectionne 3 cartes à programmer ({progSelection.length}/3) :
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      {selectedTitan.hand.map((cardId) => (
                        <CardVisual
                          key={cardId}
                          cardId={cardId}
                          selected={progSelection.includes(cardId)}
                          selectable={progSelection.length < 3 || progSelection.includes(cardId)}
                          onClick={() => toggleProgCard(cardId)}
                          size="small"
                          accentColor={TITAN_COLORS[selectedTitan.id]?.accent}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* PHASE ACTION */}
            {phase === "action" && (
              <div>
                {/* Cartes jouables */}
                {/* Refonte UI façon DIL/RAGE (demande explicite) : la
                    sélection de direction pour Graouhhh était un simple
                    <select> minuscule, sans explication, noyé dans la
                    liste des cartes. Remplacé par une rose des vents,
                    bordure épaisse + halo comme DIL/RAGE, phrase claire de
                    ce qui va se passer. Le clic sur la carte (plus bas)
                    déclenche toujours la résolution 5s comme avant, avec
                    la direction choisie ici. */}
                {selectedTitan.programmed.includes("graouhhh") && canPlayCard("graouhhh") && (
                  <div style={{
                    background: "rgba(45,212,191,.15)",
                    border: "2.5px solid #2DD4BF",
                    boxShadow: "0 0 0 3px rgba(45,212,191,.35), 0 4px 18px rgba(45,212,191,.35)",
                    borderRadius: 14, padding: "12px 16px", marginBottom: 10,
                  }}>
                    <div style={{
                      fontFamily: "'Bowlby One', sans-serif", marginBottom: 8, fontSize: ".95rem",
                      color: "#7cf5e8", display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span aria-hidden="true">😤</span> GRAOUHHH — choisis un axe
                    </div>
                    <p style={{ margin: "0 0 10px", fontSize: ".78rem", color: "rgba(255,255,255,.75)" }}>
                      Tous les Titans sur cet axe (jusqu'au premier bâtiment-mur) sont reculés, subissent Fatigue + DIL et +1 Bagarre chacun.
                    </p>
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(3, 44px)", gridTemplateRows: "repeat(3, 44px)",
                      gap: 4, justifyContent: "center",
                    }}>
                      {[
                        ["NO", "N", "NE"],
                        ["O", null, "E"],
                        ["SO", "S", "SE"],
                      ].flat().map((d, i) => {
                        if (d === null) {
                          return (
                            <div key={`c${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <TitanIcon titanId={selectedTitan.id} size={26} />
                            </div>
                          );
                        }
                        const dirs = { N:{dr:-1,dc:0}, NE:{dr:-1,dc:1}, E:{dr:0,dc:1}, SE:{dr:1,dc:1}, S:{dr:1,dc:0}, SO:{dr:1,dc:-1}, O:{dr:0,dc:-1}, NO:{dr:-1,dc:-1} };
                        const isSel = direction.label === d;
                        return (
                          <button
                            key={d}
                            onClick={() => setDirection({ ...dirs[d], label: d })}
                            style={{
                              background: isSel ? "#2DD4BF" : "rgba(255,255,255,.08)",
                              border: `2px solid ${isSel ? "#2DD4BF" : "rgba(255,255,255,.3)"}`,
                              borderRadius: 8, color: isSel ? "#04302c" : "#fff",
                              fontWeight: 700, fontSize: ".72rem", cursor: "pointer",
                            }}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: ".7rem", color: "rgba(255,255,255,.5)" }}>
                      Direction choisie : <strong style={{ color: "#7cf5e8" }}>{direction.label}</strong> — clique la carte Graouhhh ci-dessous pour lancer (résolution en 5s).
                    </p>
                  </div>
                )}
                {selectedTitan.programmed.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{
                      fontSize: ".62rem", color: "#FFD93D", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5,
                    }}>
                      🃏 Joue une carte ({selectedTitan.programmed.length} restante{selectedTitan.programmed.length > 1 ? "s" : ""})
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {selectedTitan.programmed.map((cardId) => {
                        const canPlay = canPlayCard(cardId);
                        const activeMode = (cardId === "boing_boing" && bbMode)
                          || (cardId === "je_ne_partage_pas" && jnpMode)
                          || (cardId === "tete_en_avant" && teaMode);
                        const needsDir = cardId === "graouhhh"; // TEA n'utilise plus le select
                        return (
                          <div key={cardId} style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            background: canPlay ? "rgba(255,217,61,.06)" : "transparent",
                            border: canPlay ? "1px solid rgba(255,217,61,.2)" : "1px solid transparent",
                            borderRadius: 10, padding: "6px",
                          }}>
                            <CardVisual
                              cardId={cardId}
                              selected={activeMode}
                              selectable={canPlay}
                              accentColor={TITAN_COLORS[selectedTitan.id]?.accent}
                              onClick={() => {
                                if (!canPlay || animating) return;
                                // Les cartes à résolution immédiate ont un délai visuel 5s
                                const immediate = ["tout_casser","graouhhh","faut_pas_me_chauffer"];
                                if (immediate.includes(cardId)) {
                                  setAnimating(true);
                                  setAnimLabel(`Résolution : ${CARD_LABEL[cardId] || cardId}…`);
                                }
                                if (cardId === "tout_casser") setTimeout(() => { jouerToutCasser(); setAnimating(false); setAnimLabel(""); }, 5000);
                                else if (cardId === "tete_en_avant") toggleTeaMode();
                                else if (cardId === "graouhhh") setTimeout(() => { jouerGraouhhh(); setAnimating(false); setAnimLabel(""); }, 5000);
                                else if (cardId === "boing_boing") toggleBbMode();
                                else if (cardId === "je_ne_partage_pas") toggleJnpMode();
                                else if (cardId === "faut_pas_me_chauffer") setTimeout(() => { jouerFautPasMeChauffer(); setAnimating(false); setAnimLabel(""); }, 5000);
                              }}
                              size="normal"
                            />
                            {/* Défausse volontaire face cachée (session) : sans effet, sans
                                révélation aux adversaires — fait quand même avancer le round. */}
                            {canPlay && (
                              <button
                                onClick={() => {
                                  if (animating) return;
                                  setTeaMode(false); setBbMode(false); setBbDest(null); setJnpMode(false); setJnpSelected([]);
                                  discardCurrentCard(selectedTitan.id, cardId);
                                }}
                                title="L'action n'est finalement pas intéressante — défausser sans effet, face cachée"
                                style={{
                                  background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.2)",
                                  borderRadius: 6, color: "rgba(255,255,255,.6)", padding: "2px 8px",
                                  fontSize: ".62rem", cursor: "pointer", marginTop: 1,
                                }}
                              >
                                🗑️ Défausser
                              </button>
                            )}
                            {/* Direction Graouhhh : sélection déplacée dans le
                                banner façon DIL/RAGE ci-dessus — ce qui reste ici
                                n'est qu'un rappel compact de la direction déjà
                                choisie, pas un second contrôle en doublon. */}
                            {canPlay && needsDir && (
                              <div style={{ fontSize: ".62rem", color: "#7cf5e8" }}>
                                Direction : {direction.label}
                              </div>
                            )}
                            {/* Adrénaline Tout Casser */}
                            {canPlay && cardId === "tout_casser" && (
                              <label style={{ fontSize: ".65rem", display: "flex", alignItems: "center", gap: 3, color: (selectedTitan.adrenaline || 0) < 1 ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.7)" }}>
                                <input type="checkbox" checked={tcAdrenaline} disabled={(selectedTitan.adrenaline || 0) < 1} onChange={(e) => setTcAdrenaline(e.target.checked)} />
                                +1 💉
                              </label>
                            )}
                            {/* Adrénaline TEA */}
                            {canPlay && cardId === "tete_en_avant" && (
                              <label style={{ fontSize: ".65rem", display: "flex", alignItems: "center", gap: 3, color: (selectedTitan.adrenaline || 0) < 1 ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.7)" }}>
                                <input type="checkbox" checked={teaAdrenaline} disabled={(selectedTitan.adrenaline || 0) < 1} onChange={(e) => setTeaAdrenaline(e.target.checked)} />
                                +1 💉
                              </label>
                            )}
                            {/* Adrénaline Boing Boing */}
                            {canPlay && cardId === "boing_boing" && (
                              <label style={{ fontSize: ".65rem", display: "flex", alignItems: "center", gap: 3, color: (selectedTitan.adrenaline || 0) < 1 ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.7)" }}>
                                <input type="checkbox" checked={bbAdrenaline} disabled={(selectedTitan.adrenaline || 0) < 1} onChange={(e) => setBbAdrenaline(e.target.checked)} />
                                +1 💉
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Cartes jouées + défaussées + repos + main — section repliable */}
                {(selectedTitan.playedThisManche.length > 0 || (selectedTitan.discardedHidden || []).length > 0 || selectedTitan.repos.length > 0 || selectedTitan.hand.length > 0) && (
                  <div style={{
                    background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 8, padding: "6px 8px",
                  }}>
                    <div style={{ fontSize: ".6rem", color: "rgba(255,255,255,.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>
                      Autres cartes
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {selectedTitan.playedThisManche.map((cardId) => (
                        <div key={`played-${cardId}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <CardVisual cardId={cardId} played selectable={false} size="normal" />
                          <span style={{ fontSize: ".55rem", color: "rgba(255,255,255,.3)" }}>jouée</span>
                        </div>
                      ))}
                      {(selectedTitan.discardedHidden || []).map((cardId, i) => (
                        <div key={`discard-${i}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <CardVisual cardId={cardId} played selectable={false} size="normal" />
                          <span style={{ fontSize: ".55rem", color: "rgba(255,255,255,.35)" }}>🗑️ défaussée</span>
                        </div>
                      ))}
                      {selectedTitan.repos.map((entry, i) => (
                        <div key={`repos-${i}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <CardVisual cardId={entry.cardId} inRepos selectable={false} size="normal" />
                          <span style={{ fontSize: ".55rem", color: "rgba(255,255,255,.3)" }}>repos</span>
                        </div>
                      ))}
                      {selectedTitan.hand.map((cardId) => (
                        <div key={`hand-${cardId}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <CardVisual cardId={cardId} selectable={false} size="small" />
                          <span style={{ fontSize: ".55rem", color: "rgba(255,255,255,.3)" }}>main</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mode TEA */}
            {teaMode && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: ".75rem", color: "#FB923C" }}>
                  {teaTargets.size > 0
                    ? `Clique une cible (${teaTargets.size} disponible${teaTargets.size > 1 ? "s" : ""})`
                    : "Aucune cible accessible dans cette position"}
                </span>
                <button onClick={toggleTeaMode} style={cancelBtn()}>Annuler</button>
              </div>
            )}

            {/* Mode BB — dest sélectionnée */}
            {bbMode && bbDest && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: ".75rem", color: "#FFD93D" }}>Destination : {bbDest}</span>
                <button onClick={jouerBoingBoing} style={smallBtn(true, "#16E08C", "#00C97A")}>Sauter !</button>
                <button onClick={toggleBbMode} style={cancelBtn()}>Annuler</button>
              </div>
            )}
            {bbMode && !bbDest && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: ".75rem", color: "#FFD93D" }}>Clique une case dans le rayon {bbMaxRange} (tous azimuts)</span>
                <button onClick={toggleBbMode} style={cancelBtn()}>Annuler</button>
              </div>
            )}

            {/* Mode JNP */}
            {jnpMode && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: ".75rem", color: "#71dbff" }}>
                  {jnpSelected.length}/{jnpNbToPick} sélectionné{jnpNbToPick === 3 ? " (🏆 Lanterne Rouge)" : ""}
                </span>
                <button
                  onClick={jouerJeNePartagePas}
                  disabled={jnpSelected.length !== jnpNbToPick}
                  style={smallBtn(jnpSelected.length === jnpNbToPick, "#16E08C", "#00C97A")}
                >Valider</button>
                <button onClick={toggleJnpMode} style={cancelBtn()}>Annuler</button>
              </div>
            )}

            {/* ── BOUTON TITAN SUIVANT (après résolution d'une carte) — masqué si IA ── */}
            {waitingNextTitan && titanModes[activePlayerId] !== "ia" && (
              <div style={{
                display: "flex", gap: 10, alignItems: "center", marginTop: 8,
                padding: "10px 14px", borderRadius: 10,
                background: "rgba(255,217,61,.08)", border: "1px solid rgba(255,217,61,.35)",
              }}>
                <span style={{ fontSize: ".8rem", color: "#FFD93D", fontWeight: 700 }}>
                  Carte jouée — prêt pour le Titan suivant ?
                </span>
                <button
                  onClick={() => {
                    setWaitingNextTitan(false);
                    setActivePlayerId(aiNextPlayerRef.current);
                  }}
                  style={{ ...smallBtn(true, "#FFD93D", "#F59E0B"), fontWeight: 700, fontSize: ".8rem" }}
                >
                  ▶ Titan suivant
                </button>
              </div>
            )}
          </div>
          )} {/* fin guard cartes IA */}

          {/* ── VALIDATION DE PHASE ── */}
          {/* Phase Repos : plus de validation manuelle ni de vol au choix —
              résolution automatique via la bannière "Vol Phase Repos"
              (sens choisi par le Détonateur), voir plus haut dans la page.
              Phase Action : la validation est 100% automatique via
              advanceActionRound (voir useBoardGeneratorController) dès que
              les 3 rounds sont joués par tout le monde — le seul geste que
              le joueur doit faire entre deux cartes est "▶ Titan suivant".
              Afficher "✔ Valider ma Phase" ici en plus créait un double
              effet de validation (bug remonté #boing-boing / passage de
              titan). */}
          {phase !== "repos" && phase !== "action" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              borderTop: "1px dashed rgba(255,255,255,.1)", paddingTop: 8,
            }}>
              <span style={{ fontSize: ".72rem", color: "#FFD93D", fontWeight: 700 }}>{PHASE_LABELS[phase]} :</span>
              {phaseValidated[selectedTitan.id]
                ? <span style={{ fontSize: ".72rem", color: "#16E08C" }}>✅ Validé — en attente des autres</span>
                : <button
                    onClick={() => validatePhase(selectedTitan.id)}
                    disabled={!canValidatePhase(selectedTitan.id)}
                    title={getPhaseBlockReason(selectedTitan.id)}
                    style={smallBtn(canValidatePhase(selectedTitan.id), "#16E08C", "#00C97A")}
                  >
                    ✔ Valider ma Phase
                  </button>
              }
            </div>
          )}
        </div>
      )}

  </>;
}
