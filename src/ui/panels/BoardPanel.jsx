import React from "react";
import CardVisual from "../cards/CardVisual.jsx";
import { CARD_EFFECT } from "../cards/cardEffects.js";
import BlockStockBar from "../cards/BlockStockBar.jsx";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon, TitanBadge } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { ACTION_CARDS, CARD_LABEL, CARD_FORCE, PHASE_LABELS, EVENT_NAMES, COULEURS, COLOR_HEX, STANDARD_COLORS } from "../../domain/index.js";
import { btnStyle, smallBtn, cancelBtn } from "../styles.js";

// Selecteur d'Adrenaline : le livret dit « +1 par Adrenaline depensee », donc
// un Titan qui en a plusieurs peut toutes les investir. Une case a cocher ne
// permettait d'en jouer qu'une seule.
function AdrenalinePicker({ value, max, onChange, label }) {
  if (max <= 0) {
    return (
      <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.3)" }}>
        Pas d'Adrénaline
      </span>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }} title={label}>
      <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.6)" }}>💉</span>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        style={{
          width: 24, height: 24, borderRadius: 6, cursor: value > 0 ? "pointer" : "not-allowed",
          background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)",
          color: value > 0 ? "#fff" : "rgba(255,255,255,.25)", fontWeight: 700, lineHeight: 1,
        }}
      >−</button>
      <span style={{
        minWidth: 30, textAlign: "center", fontSize: ".76rem", fontWeight: 700,
        color: value > 0 ? "#86ff71" : "rgba(255,255,255,.45)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}/{max}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        style={{
          width: 24, height: 24, borderRadius: 6, cursor: value < max ? "pointer" : "not-allowed",
          background: value < max ? "rgba(134,255,113,.18)" : "rgba(255,255,255,.06)",
          border: `1px solid ${value < max ? "rgba(134,255,113,.5)" : "rgba(255,255,255,.15)"}`,
          color: value < max ? "#86ff71" : "rgba(255,255,255,.25)", fontWeight: 700, lineHeight: 1,
        }}
      >+</button>
    </div>
  );
}

export default function BoardPanel({ vm }) {
  // Detail des autres cartes (jouees, defaussees, en Repos, en main) : replie
  // par defaut. Ces cartes ne servent qu'a verifier un historique, elles
  // n'ont pas a occuper l'ecran en permanence pendant le tour.
  const [showCardDetail, setShowCardDetail] = React.useState(false);
  // Descriptions d'effet sous les cartes : masquees par defaut. Elles sont
  // indispensables a qui decouvre le jeu, encombrantes pour qui le connait.
  const [showCardEffects, setShowCardEffects] = React.useState(false);
  // Le Mouvement gratuit est optionnel et se joue AVANT la carte. Le joueur
  // peut donc le passer explicitement pour arriver a l'etape suivante.
  // Remis a zero des que le Titan actif change.
  const [moveSkipped, setMoveSkipped] = React.useState(false);
  // Le marqueur de carte cliquee se vide des que la resolution est terminee
  // (waitingNextTitan) ou que le Titan actif change.
  React.useEffect(() => {
    if (!vm.animating) vm.setPendingCardConfirm(null);
  }, [vm.animating, vm.activePlayerId]);
  // `undoTick` : un rollback restaure le plateau mais pas l'étape du tour.
  // Sans ça, un joueur qui avait cliqué « Passer aux cartes » restait sans
  // panneau de déplacement après annulation, et ses clics sur le plateau
  // ne produisaient plus rien (bug remonté le 2026-08-17).
  React.useEffect(() => { setMoveSkipped(false); }, [vm.activePlayerId, vm.undoTick]);
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
    tcSel
  } = vm;

  // ── DÉROULÉ DU TOUR ──
  // Une seule étape visible à la fois, dans l'ordre réel : se déplacer,
  // jouer sa carte, ramasser. Le panneau empilait les trois d'un coup, dans
  // des cadres imbriqués, alors que deux d'entre elles n'étaient pas encore
  // jouables.
  const carteJouee = selectedTitan
    ? selectedTitan.playedThisManche.length > 0 || (selectedTitan.discardedHidden || []).length > 0
    : false;
  // Le tour se lit par ROUND, pas par Manche. `canUseRecupPassif` est vrai
  // des qu'une carte a ete jouee dans la Manche : au round suivant, avant
  // meme d'avoir joue, le Ramassage s'affichait et masquait les cartes,
  // alors que le joueur devait d'abord se deplacer puis jouer.
  // `waitingNextTitan` marque la fin d'un round : c'est le seul moment ou
  // le ramassage a lieu d'etre propose.
  const roundJoue = waitingNextTitan && titanModes[activePlayerId] !== "ia";
  /* DÉCISION BLOQUANTE EN ATTENTE.
     Bug remonté par Nikola le 2026-08-17 : « si un RAGE ou un Dilemme est
     provoqué pour un joueur humain, il ne peut pas finir son tour sans
     valider cette phase, et même le panneau Ramasser n'apparaît pas tant
     que ce n'est pas le cas. »

     La carte était résolue, `waitingNextTitan` passait à true, et le
     panneau de fin de tour proposait « ▶ Titan suivant » PAR-DESSUS un
     DIL/RAGE encore en attente. On pouvait donc passer la main en laissant
     une décision non résolue dans la file — elle réapparaissait au tour du
     joueur suivant, hors contexte. Le ramassage souffrait du même défaut :
     proposé avant que le sort des blocs de la victime soit tranché, alors
     que le DIL peut justement en faire tomber un dans le Périmètre. */
  // Un repli non tranché bloque le tour au même titre qu'un DIL/RAGE :
  // l'élément n'est pas encore posé là où l'initiateur le veut, passer la
  // main laisserait le plateau dans un état que personne n'a validé.
  const decisionEnAttente = Boolean(currentDecision) || Boolean(vm.currentRepli);
  /* Le panneau Ramasser ne s'affiche que s'il y a réellement quelque chose
     à ramasser (`recupPool.size > 0`). Il se montrait aussi quand le
     Périmètre était vide, avec son seul bouton grisé « (rien à portée) » —
     une étape de plus à lire et à passer pour rien. */
  const stepRecup = phase === "action"
    && selectedTitan
    && roundJoue
    && !decisionEnAttente
    && canUseRecupPassif(selectedTitan.id)
    && !passifUsed[selectedTitan.id]?.recup
    && recupPool.size > 0;
  // Fin de tour : le round est joue, et le ramassage est fait ou impossible.
  // Les deux panneaux etaient rendus sous des conditions differentes, ce qui
  // les faisait cohabiter quand un ramassage etait possible, et laissait le
  // joueur sans bouton "Titan suivant" dans certains cas.
  const finDeTour = roundJoue && !stepRecup && !decisionEnAttente;
  const stepMove = phase === "action"
    && selectedTitan
    && !roundJoue
    && canUseMovePassif(selectedTitan.id)
    && !moveSkipped;
  // Les cartes n'apparaissent qu'une fois l'etape Deplacement close.
  const stepCarte = phase !== "action" || (!roundJoue && !stepMove);

  // ── SECRET DE LA PROGRAMMATION ──
  // L'appareil circule entre les joueurs et Projet Titan repose sur une
  // programmation secrete : cliquer un Titan adverse exposait sa main et ses
  // 3 cartes programmees a qui tenait l'appareil. Le jeu de cartes n'est
  // donc montre qu'au Titan a qui c'est le tour.
  // En Phase Programmation, chacun programme a son tour : le Titan
  // selectionne est celui qui programme, ses cartes lui appartiennent.
  // En Phase Action, seul le Titan actif voit les siennes.
  const cartesVisibles = selectedTitan
    ? (phase === "programmation" || selectedTitan.id === activePlayerId)
    : false;

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
          {/* En-tête Titan — nom, case, couleur et Adrénaline vivent déjà sur
              la carte du Titan dans le bandeau juste au-dessus, en
              surbrillance quand il est sélectionné. Il ne reste ici que les
              deux valeurs qu'on ne lit nulle part ailleurs : le Périmètre et
              l'Énergie, qui changent à chaque déplacement et décident du
              Seuil 4. */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
            <div title="Cases occupées autour de ton Titan" style={{ cursor: "help" }}>
              <span style={{ fontSize: ".7rem", color: "rgba(255,255,255,.55)" }}>Périmètre </span>
              <strong style={{ fontSize: ".9rem", color: "#fffaee", fontVariantNumeric: "tabular-nums" }}>
                {perimeterCells.length}
              </strong>
            </div>
            <div
              title="Énergie de Tout Casser — à 4 ou plus, les effets forts s'activent"
              style={{ cursor: "help" }}
            >
              <span style={{ fontSize: ".7rem", color: "rgba(255,255,255,.55)" }}>Énergie </span>
              <strong style={{
                fontSize: "1.05rem", color: energie >= 4 ? "#FF2E63" : "#FFD93D",
                fontVariantNumeric: "tabular-nums",
              }}>
                {energie}
              </strong>
              {energie >= 4 && (
                <span style={{ fontSize: ".7rem", color: "#FF2E63", fontWeight: 700, marginLeft: 5 }}>
                  Seuil 4
                </span>
              )}
            </div>
          </div>

          {/* ── FIN DE TOUR ──
              Remplace toutes les etapes : quand la carte est resolue, la
              seule action possible est de passer la main. Le bouton etait
              relegue en bas du panneau des cartes, apres tout le reste. */}
          {/* Un second panneau annonçait ici « Dilemme à résoudre » et
              renvoyait vers le bandeau du haut. Retiré le 2026-08-17 : il
              disait la même chose que le bandeau DIL/RAGE, deux écrans plus
              bas, et faisait partie des quatre panneaux empilés dont Nikola
              demande la réduction. Le blocage réel du tour, lui, reste :
              `decisionEnAttente` retire « ▶ Titan suivant » et le panneau
              Ramasser tant que la décision n'est pas tranchée. */}

          {finDeTour && (
            <div style={{
              background: "rgba(255,217,61,.12)", border: "2px solid rgba(255,217,61,.5)",
              borderRadius: 12, padding: "16px 18px", marginBottom: 10, textAlign: "center",
            }}>
              <div style={{
                fontFamily: "'Bowlby One', sans-serif", fontSize: "1rem",
                color: "#FFD93D", marginBottom: 4,
              }}>
                Tour terminé
              </div>
              <div style={{ fontSize: ".76rem", color: "rgba(255,255,255,.6)", marginBottom: 12 }}>
                Passe l'appareil au Titan suivant.
              </div>
              <button
                onClick={() => {
                  setWaitingNextTitan(false);
                  setActivePlayerId(aiNextPlayerRef.current);
                }}
                style={{
                  ...smallBtn(true, "#FFD93D", "#F59E0B"),
                  fontSize: ".95rem", fontWeight: 700,
                  padding: "12px 28px", minHeight: 48, width: "100%", maxWidth: 320,
                }}
              >
                ▶ Titan suivant
              </button>
            </div>
          )}

          {/* ── ÉTAPE 1 · DÉPLACEMENT ──
              Le panneau empilait trois cadres imbriques (passifs > mouvement,
              passifs > recuperation, cartes) tous visibles en meme temps.
              Le tour suit desormais son ordre reel, une etape a la fois :
              deplacement, puis carte, puis ramassage. Chaque etape disparait
              quand elle est faite ou passee. */}
          {titanModes[selectedTitan.id] !== "ia" && stepMove && (
              <div style={{
                background: moveMode ? "rgba(113,219,255,.12)" : "rgba(113,219,255,.07)",
                border: `1px solid ${moveMode ? "#71dbff" : "rgba(113,219,255,.3)"}`,
                borderRadius: 10, padding: "9px 11px", marginBottom: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: moveMode ? 0 : 5 }}>
                  <span style={{ fontSize: ".78rem" }}>🦶</span>
                  <strong style={{ fontSize: ".76rem", color: "#71dbff" }}>1 · Te déplacer ?</strong>
                  <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.4)", marginLeft: "auto" }}>
                    avant ta carte
                  </span>
                </div>
                {!moveMode && (
                  <>
                    <div style={{ fontSize: ".7rem", color: "rgba(255,255,255,.5)", marginBottom: 7 }}>
                      Jusqu'à {moveMaxRange} case{moveMaxRange > 1 ? "s" : ""}. C'est facultatif, et ça change ton Périmètre donc ton Énergie.
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={toggleMoveMode}
                        disabled={!canUseMovePassif(selectedTitan.id)}
                        style={smallBtn(canUseMovePassif(selectedTitan.id), "#71dbff", "#2D8DF5")}
                      >
                        ▶ Se déplacer
                      </button>
                      {/* Bouton mis en avant : tant qu'il n'est pas clique,
                          les cartes ne s'affichent pas. Un joueur qui ne le
                          voyait pas restait bloque tout son tour. */}
                      <button
                        onClick={() => setMoveSkipped(true)}
                        style={{ ...smallBtn(true, "#FFD93D", "#F59E0B"), fontWeight: 700 }}
                      >
                        Passer aux cartes →
                      </button>
                      <AdrenalinePicker
                        value={moveAdrenaline}
                        max={selectedTitan.adrenaline || 0}
                        onChange={setMoveAdrenaline}
                        label="Chaque Adrénaline dépensée ajoute 1 case de déplacement"
                      />
                    </div>
                  </>
                )}
                {moveMode && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: ".7rem", color: "#71dbff", fontWeight: 600 }}>
                        👆 Clique une case ({moveReachable.size} dispo)
                      </span>
                      <button onClick={toggleMoveMode} style={{ ...cancelBtn(), fontSize: ".68rem" }}>✕ Annuler</button>
                    </div>
                    <div style={{ display: "flex", gap: 10, fontSize: ".68rem" }}>
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
          )} {/* fin étape 1 */}

          {/* ── ÉTAPE 3 · RAMASSAGE ──
              Apparaît seulement une fois la carte du round jouée ou
              défaussée, et disparaît une fois le ramassage fait. */}
          {titanModes[selectedTitan.id] !== "ia" && stepRecup && (
              <div style={{
                background: recupMode ? "rgba(22,224,140,.14)" : "rgba(22,224,140,.07)",
                border: `1px solid ${recupMode ? "#16E08C" : "rgba(22,224,140,.3)"}`,
                borderRadius: 10, padding: "9px 11px", marginBottom: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: recupMode ? 0 : 5 }}>
                  <span style={{ fontSize: ".78rem" }}>🤲</span>
                  <strong style={{ fontSize: ".76rem", color: "#16E08C" }}>3 · Ramasser ?</strong>
                  <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.4)", marginLeft: "auto" }}>
                    après ta carte
                  </span>
                </div>
                {!recupMode && (
                  <>
                    <div style={{ fontSize: ".7rem", color: "rgba(255,255,255,.5)", marginBottom: 7 }}>
                      1 Bloc ou 1 Socle au choix dans ton Périmètre. Une case entièrement vidée t'oblige à t'y déplacer.
                    </div>
                    {/* Le passage au Titan suivant vit ici tant que le
                        ramassage est possible : soit on ramasse, soit on
                        passe, sans avoir a chercher un autre panneau. */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        onClick={toggleRecupMode}
                        disabled={recupPool.size === 0}
                        style={smallBtn(recupPool.size > 0, "#16E08C", "#00C97A")}
                      >
                        ▶ Ramasser {recupPool.size === 0 ? "(rien à portée)" : `(${recupPool.size} case${recupPool.size > 1 ? "s" : ""})`}
                      </button>
                      <button
                        onClick={() => {
                          setWaitingNextTitan(false);
                          setActivePlayerId(aiNextPlayerRef.current);
                        }}
                        style={{ ...smallBtn(true, "#FFD93D", "#F59E0B"), fontWeight: 700, marginLeft: "auto" }}
                      >
                        ▶ Titan suivant
                      </button>
                    </div>
                  </>
                )}
                {recupMode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: ".72rem", color: "#16E08C", fontWeight: 600 }}>
                      👆 Clique une case jaune ({recupPool.size} dispo)
                    </span>
                    <button onClick={toggleRecupMode} style={cancelBtn()}>✕ Annuler</button>
                  </div>
                )}
              </div>
          )} {/* fin étape 3 */}

          {/* ── ÉTAPE 2 · TA CARTE ── */}
          {titanModes[selectedTitan.id] !== "ia" && !cartesVisibles && phase === "action" && (
            <div style={{
              background: "rgba(255,255,255,.04)", border: "1px dashed rgba(255,255,255,.2)",
              borderRadius: 10, padding: "12px 14px", marginBottom: 10,
              fontSize: ".76rem", color: "rgba(255,255,255,.5)", textAlign: "center",
            }}>
              🔒 Jeu caché — les cartes de {titanDisplayName(selectedTitan.id)} ne sont
              visibles que pendant son tour.
            </div>
          )}
          {titanModes[selectedTitan.id] !== "ia" && cartesVisibles && stepCarte && (
          <div style={{ marginBottom: 8 }}>
            {phase === "action" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: ".78rem" }}>🃏</span>
                <strong style={{ fontSize: ".76rem", color: "#FFD93D" }}>
                  2 · Joue une carte
                </strong>
                {/* Retour possible tant que le deplacement n'est pas consomme :
                    passer l'etape ne doit pas etre irreversible. */}
                {moveSkipped && canUseMovePassif(selectedTitan.id) && (
                  <button
                    onClick={() => setMoveSkipped(false)}
                    style={{ ...cancelBtn(), marginLeft: "auto", fontSize: ".68rem" }}
                  >
                    ← Me déplacer finalement
                  </button>
                )}
              </div>
            )}

            {/* Bascule des descriptions d'effet, valable pour les cartes de la
                main comme pour les cartes programmees. */}
            {(phase === "programmation" || phase === "action") && (
              <button
                onClick={() => setShowCardEffects((v) => !v)}
                title={showCardEffects ? "Masquer ce que font les cartes" : "Afficher ce que font les cartes"}
                style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
                  background: showCardEffects ? "rgba(255,217,61,.12)" : "rgba(255,255,255,.06)",
                  border: `1px solid ${showCardEffects ? "rgba(255,217,61,.45)" : "rgba(255,255,255,.18)"}`,
                  borderRadius: 8, padding: "4px 10px", cursor: "pointer",
                  color: showCardEffects ? "#FFD93D" : "rgba(255,255,255,.6)",
                  fontSize: ".68rem", fontWeight: 700, fontFamily: "inherit",
                }}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 15, height: 15, borderRadius: "50%", flexShrink: 0,
                  border: `1px solid currentColor`, fontSize: ".68rem",
                }}>?</span>
                {showCardEffects ? "Masquer ce que font les cartes" : "Que font les cartes ?"}
              </button>
            )}

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
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                      {selectedTitan.hand.map((cardId) => (
                        <div key={cardId} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 128 }}>
                          <CardVisual
                            cardId={cardId}
                            selected={progSelection.includes(cardId)}
                            selectable={progSelection.length < 3 || progSelection.includes(cardId)}
                            onClick={() => toggleProgCard(cardId)}
                            size="small"
                            accentColor={TITAN_COLORS[selectedTitan.id]?.accent}
                          />
                          {showCardEffects && (
                            <div style={{ fontSize: ".68rem", lineHeight: 1.35, textAlign: "center", color: "rgba(255,255,255,.5)" }}>
                              {CARD_EFFECT[cardId]}
                            </div>
                          )}
                        </div>
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
                    déclenche toujours la résolution 3s comme avant, avec
                    la direction choisie ici. */}
                {graouMode && selectedTitan.programmed.includes("graouhhh") && canPlayCard("graouhhh") && (
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
                      Direction choisie : <strong style={{ color: "#7cf5e8" }}>{direction.label}</strong>
                    </p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                      <button
                        onClick={() => {
                          if (animating) return;
                          setAnimating(true);
                          setAnimLabel(`Résolution : ${CARD_LABEL.graouhhh}…`);
                          setTimeout(() => { jouerGraouhhh(); setAnimating(false); setAnimLabel(""); }, 3000);
                        }}
                        disabled={animating}
                        style={smallBtn(!animating, "#2DD4BF", "#0E7C7B")}
                      >
                        😤 Lancer Graouhhh (3s)
                      </button>
                      <button onClick={toggleGraouMode} style={cancelBtn()}>✕ Annuler</button>
                    </div>
                  </div>
                )}
                {selectedTitan.programmed.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{
                      fontSize: ".68rem", color: "#FFD93D", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5,
                    }}>
                      🃏 Joue une carte ({selectedTitan.programmed.length} restante{selectedTitan.programmed.length > 1 ? "s" : ""})
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {selectedTitan.programmed.map((cardId) => {
                        const canPlay = canPlayCard(cardId);
                        const activeMode = (cardId === "boing_boing" && bbMode)
                          || (cardId === "je_ne_partage_pas" && jnpMode)
                          || (cardId === "tete_en_avant" && teaMode)
                          || (cardId === "graouhhh" && graouMode);
                        const needsDir = cardId === "graouhhh"; // TEA n'utilise plus le select
                        return (
                          <div key={cardId} style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            background: canPlay ? "rgba(255,217,61,.06)" : "transparent",
                            border: canPlay ? "1px solid rgba(255,217,61,.2)" : "1px solid transparent",
                            borderRadius: 10, padding: "4px", width: showCardEffects ? 140 : "auto",
                          }}>
                            <CardVisual
                              cardId={cardId}
                              selected={activeMode || pendingCardConfirm?.cardId === cardId}
                              selectable={canPlay}
                              accentColor={TITAN_COLORS[selectedTitan.id]?.accent}
                              onClick={() => {
                                if (!canPlay || animating) return;
                                // Retour visuel immediat : sans lui, un clic
                                // sur une carte a resolution differee ne
                                // produisait rien pendant 3 secondes.
                                setPendingCardConfirm({ titanId: selectedTitan.id, cardId });
                                // Les cartes à résolution immédiate ont un délai visuel 3s
                                const immediate = ["tout_casser","faut_pas_me_chauffer"];
                                if (immediate.includes(cardId)) {
                                  setAnimating(true);
                                  setAnimLabel(`Résolution : ${CARD_LABEL[cardId] || cardId}…`);
                                }
                                if (cardId === "tout_casser") setTimeout(() => { jouerToutCasser(); setAnimating(false); setAnimLabel(""); }, 3000);
                                else if (cardId === "tete_en_avant") toggleTeaMode();
                                else if (cardId === "graouhhh") toggleGraouMode();
                                else if (cardId === "boing_boing") toggleBbMode();
                                else if (cardId === "je_ne_partage_pas") toggleJnpMode();
                                else if (cardId === "faut_pas_me_chauffer") setTimeout(() => { jouerFautPasMeChauffer(); setAnimating(false); setAnimLabel(""); }, 3000);
                              }}
                              size="normal"
                            />
                            {showCardEffects && (
                              <div style={{
                                fontSize: ".68rem", lineHeight: 1.35, textAlign: "center",
                                color: canPlay ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.3)",
                              }}>
                                {CARD_EFFECT[cardId]}
                              </div>
                            )}
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
                                  fontSize: ".68rem", cursor: "pointer", marginTop: 1,
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
                              <div style={{ fontSize: ".68rem", color: "#7cf5e8" }}>
                                Direction : {direction.label}
                              </div>
                            )}
                            {/* Adrénaline : quantité libre, dans la limite du stock */}
                            {canPlay && cardId === "tout_casser" && (
                              <AdrenalinePicker value={tcAdrenaline} max={selectedTitan.adrenaline || 0}
                                onChange={setTcAdrenaline} label="+1 Énergie par Adrénaline dépensée" />
                            )}
                            {canPlay && cardId === "tete_en_avant" && (
                              <AdrenalinePicker value={teaAdrenaline} max={selectedTitan.adrenaline || 0}
                                onChange={setTeaAdrenaline} label="+1 case de charge par Adrénaline dépensée" />
                            )}
                            {canPlay && cardId === "boing_boing" && (
                              <AdrenalinePicker value={bbAdrenaline} max={selectedTitan.adrenaline || 0}
                                onChange={setBbAdrenaline} label="+1 case de saut par Adrénaline dépensée" />
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
                    <button
                      onClick={() => setShowCardDetail((v) => !v)}
                      title={showCardDetail ? "Masquer le detail des cartes" : "Afficher le detail des cartes (jouees, defaussees, Repos, main)"}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, width: "100%",
                        background: "transparent", border: "none", padding: 0, cursor: "pointer",
                        fontSize: ".68rem", color: "rgba(255,255,255,.35)",
                        textTransform: "uppercase", letterSpacing: ".04em",
                        marginBottom: showCardDetail ? 4 : 0, fontFamily: "inherit",
                      }}
                    >
                      Autres cartes
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 14, height: 14, borderRadius: "50%",
                        border: "1px solid rgba(255,255,255,.3)", fontSize: ".68rem",
                        color: "rgba(255,255,255,.5)", flexShrink: 0,
                      }}>?</span>
                      <span style={{ marginLeft: "auto" }}>{showCardDetail ? "▲" : "▼"}</span>
                    </button>
                    {showCardDetail && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {selectedTitan.playedThisManche.map((cardId) => (
                        <div key={`played-${cardId}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <CardVisual cardId={cardId} played selectable={false} size="normal" />
                          <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.3)" }}>jouée</span>
                        </div>
                      ))}
                      {(selectedTitan.discardedHidden || []).map((cardId, i) => (
                        <div key={`discard-${i}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <CardVisual cardId={cardId} played selectable={false} size="normal" />
                          <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.35)" }}>🗑️ défaussée</span>
                        </div>
                      ))}
                      {selectedTitan.repos.map((entry, i) => (
                        <div key={`repos-${i}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <CardVisual cardId={entry.cardId} inRepos selectable={false} size="normal" />
                          <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.3)" }}>repos</span>
                        </div>
                      ))}
                      {selectedTitan.hand.map((cardId) => (
                        <div key={`hand-${cardId}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <CardVisual cardId={cardId} selectable={false} size="small" />
                          <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.3)" }}>main</span>
                        </div>
                      ))}
                    </div>
                    )}
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
