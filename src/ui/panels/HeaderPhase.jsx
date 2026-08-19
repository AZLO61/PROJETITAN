import React from "react";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { PHASE_LABELS } from "../../domain/index.js";
import { btnStyle, cancelBtn } from "../styles.js";

export default function HeaderPhase({ vm }) {
  // Confirmation maison plutot que window.confirm : la boite systeme casse
  // la direction artistique et ne se style pas.
  const [confirmNouvelle, setConfirmNouvelle] = React.useState(false);
  const {
    eventsEnabled,
    titanState,
    seedCount,
    mancheNumber,
    activePlayerId,
    titanModes,
    titanDisplayName,
    aiPlaying,
    aiStepLabel,
    phase,
    phaseValidated,
    currentEvent,
    showScoring,
    setShowScoring,
    show3D,
    setShow3D,
    setShowRules,
    regenerate,
    direction,
    animating,
    animLabel,
    undoStack,
    handleUndo,
    endGameReasons,
    phaseGuidance,
    selectedTitan,
    validatePhase,
    canValidatePhase,
    getPhaseBlockReason,
  } = vm;

  /* Ordre d'initiative REEL de la manche : l'ordre de jeu pivote sur le
     Detonateur, qui ouvre chaque round. */
  const ordreInitiative = (() => {
    const ordre = titanState?.ordreJeu ?? [];
    const depart = ordre.indexOf(titanState?.detonateur);
    if (depart <= 0) return ordre;
    return [...ordre.slice(depart), ...ordre.slice(0, depart)];
  })();

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
            {/* Point 4.1 du 2026-08-19 : « trier dynamiquement les icones de
                validation de tour pour refleter scrupuleusement l'ordre
                d'initiative de la manche en cours ».

                `ordreJeu` est l'ordre FIGE de la partie. L'ordre reel d'une
                manche commence au DETONATEUR et suit l'ordre circulaire :
                c'est ce que fait `advanceActionRound` (« chaque nouveau round
                repart du Detonateur en cours, et non du premier de l'ordre de
                jeu fige »). L'encart annoncait donc un ordre que la table ne
                jouait pas. */}
            {ordreInitiative.map((id) => {
              const isAi = titanModes[id] === "ia";
              return (
                <span
                  key={id}
                  title={
                    (id === titanState.detonateur
                      ? "Detonateur, ouvre la manche"
                      : `Joue en ${ordreInitiative.indexOf(id) + 1}e position`)
                    + (phaseValidated[id] ? " - a valide" : " - en attente")
                  }
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 2,
                    // Le Detonateur se repere d'un coup d'oeil : c'est lui qui ouvre.
                    outline: id === titanState.detonateur ? "1px solid rgba(255,255,255,.35)" : "none",
                    outlineOffset: 2, borderRadius: 4,
                  }}
                >
                  <TitanIcon titanId={id} size={16} />
                  {isAi ? "🤖" : ""}{phaseValidated[id] ? "✅" : "⬜"}
                </span>
              );
            })}
            {/* Point 4.6 du 2026-08-19 : « fusionner le panneau
                "M1 3 programmation" avec le composant de validation des
                autres Titans pour supprimer ce panneau redondant ».

                La validation de phase vivait plus bas, dans un bloc a part de
                BoardPanel, qui repetait le nom de la phase deja affiche a
                gauche de cette meme ligne et l'etat de validation deja lu
                dans les icones juste ici. Deux endroits pour une seule
                information, et le bouton loin des coches qu'il modifie.

                Il est maintenant a cote d'elles : on voit qui a valide, et on
                valide, au meme endroit. */}
            {phase !== "repos" && phase !== "action" && selectedTitan && (
              phaseValidated[selectedTitan.id] ? null : (
                <button
                  onClick={() => validatePhase(selectedTitan.id)}
                  disabled={!canValidatePhase(selectedTitan.id)}
                  title={getPhaseBlockReason(selectedTitan.id)}
                  style={{
                    marginLeft: 4,
                    background: canValidatePhase(selectedTitan.id) ? "#16E08C" : "rgba(255,255,255,.08)",
                    color: canValidatePhase(selectedTitan.id) ? "#04240f" : "rgba(255,255,255,.35)",
                    border: "none", borderRadius: 6, padding: "2px 8px",
                    fontSize: ".68rem", fontWeight: 800,
                    cursor: canValidatePhase(selectedTitan.id) ? "pointer" : "not-allowed",
                  }}
                >
                  Valider
                </button>
              )
            )}
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


      {/* ── FIN DE PARTIE EN APPROCHE ──
          Demande de Nikola (2026-08-17) : « supprime le bouton Voir les
          scores du panneau dernière Manche, et rends l'information de fin de
          partie en approche claire mais beaucoup moins grosse. »

          Le bouton partait de la bonne intention — éviter de chercher l'écran
          de résultats — mais il ouvrait le scoring EN COURS DE PARTIE, avec
          les Blocs Verts encore à placer et les totaux de tout le monde
          étalés : de quoi jouer la dernière Manche en sachant exactement quoi
          viser chez les autres. L'écran de résultats s'ouvre désormais tout
          seul, une fois la Manche terminée (cf. `gameOver`).

          L'encart passe d'un pavé à une seule ligne : le motif du
          déclenchement, qu'on ne lit qu'une fois, va dans l'infobulle. */}
      {endGameReasons.length > 0 && (
        <div
          title={endGameReasons.join("\n")}
          style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            background: "rgba(227,35,71,.1)", border: "1px solid rgba(227,35,71,.45)",
            borderRadius: 8, padding: "5px 10px", marginBottom: 8,
            fontSize: ".72rem", cursor: "help",
          }}
        >
          <strong style={{ color: "#ff8fa3", whiteSpace: "nowrap" }}>🛑 Dernière Manche</strong>
          <span style={{ color: "rgba(255,255,255,.6)" }}>
            la partie s'arrête à la fin de la Manche {mancheNumber}.
          </span>
        </div>
      )}

      {/* ── TITANS ÉJECTÉS HORS DU RING ──
          Ce panneau vivait ici. Il est remplacé par une icône 🥊 posée sur
          l'encart du Titan concerné, dans TitanResourceBand, avec la même
          information dans son infobulle (qui est dehors, par où il rentre).

          Demande de Nikola du 2026-08-17 : à quatre panneaux empilés sous
          l'en-tête — éjecté, décision à résoudre, consigne de phase, étape
          du tour — l'écran ne montrait plus le jeu. L'état « hors du ring »
          est une propriété d'UN Titan : sa place est sur sa carte, pas dans
          un bandeau qui pousse le plateau hors de l'écran. */}

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
