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
    gameOver,
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
    classementFinalPartie,
    endGameReasons,
    boardSignature3D,
    perimeterCells,
    perimeterKeys,
    energie,
    stats,
    occupiedCount,
    tcSel
  } = vm;

  /* Une case du tableau de barème : « combien de blocs → combien de points ».
     Le compte affiché est celui qui SERT AU CALCUL, Vert affecté compris, et
     il est mis en évidence quand un Vert l'a fait monter — c'est là que se
     joue la différence que Nikola ne voyait pas. */
  const celluleBareme = (t, couleur) => {
    const compte = finalScoreResult.adjCounts[t.id][couleur];
    const base = countRepaireColors(t)[couleur];
    const pts = finalScoreResult.baremeScores[t.id][couleur];
    const boostéParVert = compte > base;
    return (
      <span
        title={boostéParVert
          ? `${base} bloc(s) ramassé(s) + ${compte - base} Vert affecté ici → ${pts} pts`
          : `${compte} bloc(s) → ${pts} pts`}
        style={{ display: "inline-flex", alignItems: "baseline", gap: 4, cursor: "help" }}
      >
        <strong style={{
          color: compte === 0 ? "rgba(255,255,255,.3)" : boostéParVert ? "#7ef2a8" : "#fffaee",
          fontVariantNumeric: "tabular-nums",
        }}>
          {compte}
        </strong>
        <span style={{ color: "rgba(255,255,255,.35)", fontSize: ".9em" }}>→</span>
        <span style={{ color: pts > 0 ? "#FFD93D" : "rgba(255,255,255,.3)", fontVariantNumeric: "tabular-nums" }}>
          {pts}
        </span>
      </span>
    );
  };

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
            {/* FERMER N'EST PAS VIDER — demande de Nikola du 2026-08-18 :
                « j'aimerais pouvoir fermer les logs d'action sans les
                vider ». Le seul bouton du bandeau était une croix qui
                EFFAÇAIT tout l'historique de la partie ; refermer le
                journal demandait de viser le titre lui-même, ce que rien
                n'indiquait. Les deux gestes sont désormais distincts et
                nommés, et le plus destructeur des deux n'est plus celui qui
                porte la croix. */}
            {showLog && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={() => setShowLog(false)}
                  title="Replier le journal — rien n'est effacé"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.55)", cursor: "pointer", fontSize: ".68rem", fontFamily: "inherit" }}
                >▲ Fermer</button>
                <button
                  onClick={() => setActionLog([])}
                  title="Effacer définitivement l'historique de la partie"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", cursor: "pointer", fontSize: ".68rem", fontFamily: "inherit" }}
                >🗑 Vider</button>
              </div>
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
          {/* Le décompte ne commence pas tant que chaque Vert n'a pas trouvé
              sa catégorie : c'est le dernier geste de la partie, et il était
              invisible tant que l'écran restait enterré sous le plateau. */}
          {gameOver && (() => {
            const restants = titanState.players.reduce(
              (n, t) => n + Math.max(0, getVertCount(t) - (vertAssignments[t.id] || []).filter(Boolean).length), 0
            );
            return (
              <div style={{
                background: restants > 0 ? "rgba(34,197,94,.14)" : "rgba(255,217,61,.12)",
                border: `1.5px solid ${restants > 0 ? "#22C55E" : "rgba(255,217,61,.5)"}`,
                borderRadius: 10, padding: "8px 12px", marginBottom: 12,
                fontSize: ".78rem", color: "rgba(255,255,255,.8)",
              }}>
                {restants > 0
                  ? <>🟢 <strong style={{ color: "#7ef2a8" }}>Partie terminée.</strong> Il reste {restants} Bloc{restants > 1 ? "s" : ""} Vert{restants > 1 ? "s" : ""} à placer avant que le décompte soit définitif.</>
                  : <>🏁 <strong style={{ color: "#FFD93D" }}>Partie terminée.</strong> Tous les Blocs Verts sont placés, le décompte ci-dessous est définitif.</>}
              </div>
            );
          })()}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#22C55E", fontWeight: 700, marginBottom: 6, fontSize: ".76rem" }}>
              Placement secret des Blocs Verts
            </div>
            {titanState.players.map((t) => {
              const vertCount = getVertCount(t);
              if (vertCount === 0) return null;
              const owned = countRepaireColors(t);
              /* CHACUN PLACE SES PROPRES VERTS — demande de Nikola du
                 2026-08-18. L'écran posait un menu déroulant par Vert et par
                 Titan, IA comprises : c'était donc l'humain qui affectait, à
                 la fin, les Verts de ses trois adversaires. Un placement de
                 Vert vaut plusieurs points et se décide en secret : ce choix
                 ne lui appartient pas. Les IA tranchent désormais elles-mêmes
                 (cf. le contrôleur), et leur ligne n'est plus qu'un compte
                 rendu, en lecture seule. */
              const estIA = titanModes[t.id] === "ia";
              const places = (vertAssignments[t.id] || []).filter(Boolean);
              return (
                <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  <strong style={{ color: "#FFD93D", fontSize: ".74rem" }}>{titanDisplayName(t.id)}</strong>
                  {estIA ? (
                    <span style={{ fontSize: ".72rem", color: "rgba(255,255,255,.7)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ color: "#a855f7", fontWeight: 700 }}>🤖 placés par l'IA :</span>
                      {places.length === 0
                        ? <span style={{ opacity: .55 }}>en cours…</span>
                        : places.map((a, i) => (
                            <span key={i} style={{
                              background: "rgba(168,85,247,.16)", border: "1px solid rgba(168,85,247,.45)",
                              borderRadius: 6, padding: "2px 7px",
                            }}>
                              {a.type === "color" ? `Barème ${BLOCK_NAME[a.target] || a.target}` : `Piste ${a.target}`}
                            </span>
                          ))}
                    </span>
                  ) : (
                    Array.from({ length: vertCount }).map((_, i) => (
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
                    ))
                  )}
                </div>
              );
            })}
            {titanState.players.every((t) => getVertCount(t) === 0) && (
              <div style={{ color: "rgba(255,255,255,.4)" }}>Aucun Vert collecté.</div>
            )}
          </div>
          {finalScoreResult && (
            <div style={{ overflowX: "auto" }}>
              {/* ── COMBIEN DE BLOCS, PAS SEULEMENT COMBIEN DE POINTS ──
                  Remonté par Nikola le 2026-08-18 : « au scoring final avec
                  les Verts, je n'ai pas de visuel clair sur les quantités de
                  blocs de chaque Titan — j'ai 0 chez l'orange, mais peut-être
                  qu'il en a 1, et donc le Vert en plus fait la différence. »

                  Le tableau n'affichait que des POINTS. Or l'Orange ne marque
                  que par paires : 1 bloc vaut 0 point, exactement comme 0
                  bloc. Impossible, à l'écran, de savoir si un Vert allait
                  compléter une paire à 5 points ou se perdre. Même angle mort
                  au seuil de chaque barème.

                  Chaque case porte donc le NOMBRE de blocs comptés (Vert
                  affecté compris) et le score qu'il produit. Un compte gonflé
                  par un Vert est signalé, pour qu'on voie d'où vient l'écart. */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".74rem" }}>
                <thead>
                  <tr style={{ color: "#FFD93D" }}>
                    <th style={{ padding: "3px 8px", textAlign: "left" }}></th>
                    {titanState.players.map((t) => <th key={t.id} style={{ padding: "3px 8px" }}>{titanDisplayName(t.id)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="bleu" size={18} />{BLOCK_NAME.bleu}</span>, (t) => celluleBareme(t, "bleu"), "bleu"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="rose" size={18} />{BLOCK_NAME.rose}</span>, (t) => celluleBareme(t, "rose"), "rose"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="orange" size={18} />{BLOCK_NAME.orange}</span>, (t) => celluleBareme(t, "orange"), "orange"],
                    [<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BlockIcon color="rouge" size={18} />{BLOCK_NAME.rouge}</span>, (t) => celluleBareme(t, "rouge"), "rouge"],
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

          {/* ── CLASSEMENT ET VAINQUEUR ──
              Le tableau ci-dessus donne les totaux, colonne par colonne,
              sans jamais dire qui gagne. Le classement applique le
              départage du livret : Adrénaline restante, puis Socle de plus
              haute valeur, puis Force des cartes non jouées. Une égalité
              qui résiste aux trois est annoncée comme telle. */}
          {classementFinalPartie && (
            <div style={{ marginTop: 14 }}>
              <div style={{ color: "#FFD93D", fontSize: ".74rem", fontWeight: 700, marginBottom: 6 }}>
                🏆 Classement final
              </div>
              {classementFinalPartie.map((ligne) => (
                <div key={ligne.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px", fontSize: ".76rem",
                  background: ligne.rang === 1 ? "rgba(255,217,61,.14)" : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,.06)",
                }}>
                  <span style={{ width: 26, color: "#FFD93D", fontWeight: 700 }}>
                    {ligne.rang === 1 ? "🥇" : `${ligne.rang}e`}
                  </span>
                  <span style={{ flex: 1, color: "#fffaee" }}>
                    {titanDisplayName(ligne.id)}
                    {ligne.exAequo && (
                      <span style={{ color: "rgba(255,255,255,.5)", fontSize: ".68rem", marginLeft: 6 }}>
                        ex aequo — départage impossible
                      </span>
                    )}
                  </span>
                  <span style={{ color: "#FFD93D", fontWeight: 700 }}>{ligne.total}</span>
                </div>
              ))}
              <div style={{ color: "rgba(255,255,255,.45)", fontSize: ".66rem", marginTop: 6 }}>
                Égalité départagée par : Adrénaline restante, puis Socle de plus haute valeur, puis Force des cartes non jouées.
              </div>
            </div>
          )}

          {/* ── RÉVÉLATION DES PROFILS D'IA ──
              Placée volontairement TOUT EN BAS, et conditionnée à ce que
              chaque Vert soit déjà affecté (demande explicite de Nikola).
              Apprendre qu'un adversaire est un Expert Agressif pendant
              qu'on décide encore où poser ses Verts, c'est une
              information qui influencerait ce choix : le placement doit
              rester un pari à l'aveugle jusqu'au bout. */}
          {(() => {
            const iaIds = titanState.players.map((t) => t.id).filter((id) => titanModes[id] === "ia");
            if (iaIds.length === 0 || !profileLabel) return null;
            const vertsPlaces = titanState.players.every(
              (t) => (vertAssignments[t.id] || []).filter(Boolean).length >= getVertCount(t)
            );
            if (!vertsPlaces) {
              return (
                <div style={{ marginTop: 12, fontSize: ".7rem", color: "rgba(255,255,255,.4)", fontStyle: "italic" }}>
                  🤖 Les profils des IA seront dévoilés une fois tous les Blocs Verts placés.
                </div>
              );
            }
            return (
              <div style={{
                marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.12)",
              }}>
                <div style={{ color: "#a855f7", fontWeight: 700, marginBottom: 6, fontSize: ".76rem" }}>
                  🤖 Qui étaient les IA
                </div>
                {iaIds.map((id) => (
                  <div key={id} style={{ fontSize: ".74rem", marginBottom: 3 }}>
                    <strong style={{ color: "#FFD93D" }}>{titanDisplayName(id)}</strong>
                    <span style={{ color: "rgba(255,255,255,.6)" }}> — </span>
                    <span style={{ color: "#a855f7", fontWeight: 700 }}>{profileLabel(titanProfiles[id])}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

  </>;
}
