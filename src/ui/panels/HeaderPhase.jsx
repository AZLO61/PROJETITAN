import React from "react";
import CardVisual from "../cards/CardVisual.jsx";
import BlockStockBar from "../cards/BlockStockBar.jsx";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon, TitanBadge } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { ACTION_CARDS, CARD_LABEL, CARD_FORCE, PHASE_LABELS, EVENT_NAMES, COULEURS, COLOR_HEX, STANDARD_COLORS } from "../../domain/index.js";
import { btnStyle, smallBtn, cancelBtn } from "../styles.js";

export default function HeaderPhase({ vm }) {
  // Confirmation maison plutot que window.confirm : la boite systeme casse
  // la direction artistique et ne se style pas.
  const [confirmNouvelle, setConfirmNouvelle] = React.useState(false);
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
    titansEnAttente,
    boardSignature3D,
    perimeterCells,
    perimeterKeys,
    energie,
    stats,
    occupiedCount,
    phaseGuidance,
    tcSel
  } = vm;
  return <>
      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: "'Bowlby One', sans-serif", color: "#FFD93D", fontSize: "1.1rem", margin: 0 }}>
          BIG CITY <span style={{ color: "rgba(255,255,255,.4)", fontSize: ".75rem" }}>#{seedCount}</span>
        </h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {/* Confirmation : un clic accidentel detruisait une partie en cours
              sans retour possible, la pile d'undo etant videe a chaque
              changement de Titan actif. Pas de garde avant le 1er tour. */}
          <button
            // Confirmation systematique : le garde-fou ne se declenchait qu'en
            // cours de partie, donc le panneau restait invisible au moment ou
            // on voulait le voir.
            onClick={() => setConfirmNouvelle(true)}
            style={btnStyle("#FF6B1A", "#FF2E63")}
          >
            🔄 Nouvelle partie
          </button>
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
            ↩ Annuler{undoStack.length > 0 && <span style={{ fontSize: ".68rem", marginLeft: 4, opacity: .8 }}>×{undoStack.length}</span>}
          </button>
          <button onClick={() => setShowScoring((s) => !s)} style={btnStyle(showScoring ? "#16E08C" : null, showScoring ? "#00C97A" : null, showScoring)}>
            🏆 Scoring
          </button>
          {/* Un seul bouton qui bascule : son libelle annonce la vue vers
              laquelle il emmene, pas celle qu'on regarde deja. */}
          {/* Bascule pure : le bouton ne porte jamais d'etat "actif". En bleu
              plein pendant la 3D, il donnait l'impression qu'on regardait
              deja la 2D qu'il propose. */}
          <button onClick={() => setShow3D((s) => !s)} style={btnStyle(null, null)}>
            {show3D ? "⊞ Vue 2D" : "🧊 Vue 3D"}
          </button>
          {/* Ouvre le livret en superposition : la partie en cours reste
              montée derrière, rien n'est perdu. */}
          {/* Bouton de consultation, pas d'action de jeu : il ne doit pas
              peser autant qu'une carte jouable. Traitement neutre comme
              Scoring et Vue 3D au repos, au lieu du plein jaune-orange. */}
          <button onClick={() => setShowRules(true)} style={btnStyle(null, null)}>
            📖 Règles du jeu
          </button>
        </div>
      </div>


      {/* ── CONFIRMATION NOUVELLE PARTIE ── */}
      {confirmNouvelle && (
        <div
          role="dialog"
          aria-label="Confirmer une nouvelle partie"
          onClick={() => setConfirmNouvelle(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9500,
            background: "rgba(10,2,18,.78)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(180deg, #2d1d5d 0%, #1a0f38 100%)",
              border: "2px solid rgba(255,46,99,.5)",
              borderRadius: 16, padding: "22px 24px", maxWidth: 420, width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,.6)",
            }}
          >
            <div style={{
              fontFamily: "'Bowlby One', sans-serif", fontSize: "1.05rem",
              color: "#FF2E63", marginBottom: 8,
            }}>
              Abandonner la partie ?
            </div>
            <p style={{ fontSize: ".82rem", color: "rgba(255,255,255,.7)", lineHeight: 1.55, margin: "0 0 18px" }}>
              Tu es en <strong style={{ color: "#FFD93D" }}>Manche {mancheNumber}</strong>. Relancer une
              nouvelle partie efface le plateau, les Repaires et les scores en cours.
              Cette action est définitive.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button onClick={() => setConfirmNouvelle(false)} style={cancelBtn()}>
                Continuer la partie
              </button>
              <button
                onClick={() => { setConfirmNouvelle(false); regenerate(); }}
                style={btnStyle("#FF6B1A", "#FF2E63")}
              >
                🔄 Nouvelle partie
              </button>
            </div>
          </div>
        </div>
      )}

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
          <span style={{ fontSize: ".7rem", color: "rgba(255,255,255,.4)", marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {/* Bug remonté : "T1/T2/T3/T4" en texte brut ne parlait à
                personne d'externe au projet — remplacé par l'icône du
                Titan (même sprite que partout ailleurs dans l'UI). */}
            {titanState.ordreJeu.map((id) => {
              const isAi = titanModes[id] === "ia";
              return (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                  <TitanIcon titanId={id} size={16} />
                  {isAi ? "🤖" : ""}{phaseValidated[id] ? "✅" : "⬜"}
                </span>
              );
            })}
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
                  // Seul endroit qui dit quoi faire pendant la Phase Action :
                  // la consigne generale se tait desormais dans cette phase
                  // pour ne pas repeter ce bandeau. La sequence du tour est
                  // rappelee ici, la ou le joueur actif regarde deja.
                  const hint = cardsLeft > 0
                    ? `1 deplacement avant ta carte · joue ou defausse 1 carte · 1 ramassage apres`
                    : `Plus de cartes — clique "▶ Titan suivant" (le passage est automatique, pas de "Valider ma Phase" en Phase Action)`;
                  return (
                    <div style={{ fontSize: ".68rem", color: "rgba(255,255,255,.6)", marginTop: 2 }}>
                      {hint}
                    </div>
                  );
                })()}
                {isAi && (
                  <div style={{ fontSize: ".68rem", color: "rgba(255,255,255,.45)" }}>
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
      {/* titanPulse retiree : une pulsation infinie pendant 1h30 fatigue
          l'oeil et vide la batterie d'une tablette. Seul le spinner des
          animations de resolution reste, il est bref et ponctuel. */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>


      {/* ── CONSIGNE DU MOMENT ──
          Dit ce que la Phase en cours attend, et l'action concrete a faire
          maintenant. C'etait jusqu'ici soit implicite, soit cache dans un
          `title` HTML que personne ne survole. Meme traitement visuel que le
          bandeau Evenement ci-dessous. */}
      {phaseGuidance && (phaseGuidance.what || phaseGuidance.you) && (
        <div style={{
          background: "rgba(255,217,61,.08)", border: "1px solid rgba(255,217,61,.3)",
          borderRadius: 10, padding: "8px 12px", marginBottom: 10,
        }}>
          {phaseGuidance.what && (
            <div style={{ fontSize: ".72rem", color: "rgba(255,255,255,.6)", lineHeight: 1.4 }}>
              {phaseGuidance.what}
            </div>
          )}
          {phaseGuidance.you && (
            <div style={{ fontSize: ".78rem", color: "#FFD93D", fontWeight: 700, marginTop: 3, lineHeight: 1.4 }}>
              👉 {phaseGuidance.you}
            </div>
          )}
        </div>
      )}


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
      {/* Fin de partie : l'alerte se contentait d'un encart discret. Elle
          annonce maintenant clairement que la partie s'arrete a la fin de la
          Manche, et propose directement l'ecran de resultats plutot que de
          laisser chercher le bouton Scoring. */}
      {endGameReasons.length > 0 && (
        <div style={{
          background: "rgba(227,35,71,.14)", border: "1.5px solid #e32347",
          borderRadius: 12, padding: "8px 14px", marginBottom: 10, fontSize: ".78rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ color: "#ff8fa3", fontSize: ".92rem", fontFamily: "'Bowlby One', sans-serif" }}>
              🛑 Dernière Manche
            </strong>
            <span style={{ color: "rgba(255,255,255,.7)" }}>
              La partie s'arrête à la fin de la Manche {mancheNumber}, jamais en plein tour.
            </span>
            <button
              onClick={() => setShowScoring(true)}
              style={{ ...btnStyle("#FFD93D", "#F59E0B"), marginLeft: "auto" }}
            >
              🏆 Voir les scores
            </button>
          </div>
          {endGameReasons.map((r, i) => (
            <div key={i} style={{ marginTop: 5, color: "rgba(255,255,255,.7)" }}>{r}</div>
          ))}
        </div>
      )}

      {/* ── TITANS ÉJECTÉS HORS DU RING ──
          Un Titan poussé hors de BIG CITY attend SON tour pour revenir
          (ruling Nikola : « ça évite l'acharnement »). Il faut donc voir
          d'un coup d'œil qui est dehors et par où il rentrera — sans ça,
          un joueur disparaît du plateau sans explication. */}
      {titansEnAttente.length > 0 && (
        <div style={{
          background: "rgba(255,146,57,.14)", border: "1.5px solid #ff9239",
          borderRadius: 12, padding: "8px 14px", marginBottom: 10, fontSize: ".78rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ color: "#ffb877", fontSize: ".92rem", fontFamily: "'Bowlby One', sans-serif" }}>
              🥊 Hors du ring
            </strong>
            <span style={{ color: "rgba(255,255,255,.7)" }}>
              Poussé hors de BIG CITY. Rentre en jeu au début de son tour, pas avant.
            </span>
          </div>
          {titansEnAttente.map((t) => (
            <div key={t.id} style={{ marginTop: 5, color: "rgba(255,255,255,.8)" }}>
              <strong style={{ color: "#ffb877" }}>{titanDisplayName(t.id)}</strong> attend de rentrer par <strong>{t.cell}</strong>
            </div>
          ))}
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
