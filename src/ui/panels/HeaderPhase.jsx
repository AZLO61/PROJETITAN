import React from "react";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { btnStyle, cancelBtn } from "../styles.js";

export default function HeaderPhase({ vm }) {
  // Confirmation maison plutot que window.confirm : la boite systeme casse
  // la direction artistique et ne se style pas.
  const [confirmNouvelle, setConfirmNouvelle] = React.useState(false);
  const {
    eventsEnabled,
    seedCount,
    mancheNumber,
    activePlayerId,
    phase,
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
    gameSeed,
    telechargerRapport,
  } = vm;


  return <>
      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: "'Bowlby One', sans-serif", color: "#FFD93D", fontSize: "1.1rem", margin: 0 }}>
          BIG CITY{" "}
          <span
            title={gameSeed != null
              ? `Partie n°${seedCount} · graine ${gameSeed} — relance une partie avec cette graine pour la rejouer à l'identique`
              : `Partie n°${seedCount}`}
            style={{ color: "rgba(255,255,255,.4)", fontSize: ".75rem", cursor: "help" }}
          >
            #{seedCount}{gameSeed != null && ` · 🎲 ${gameSeed}`}
          </span>
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
          {/* SIGNALER — Nikola, 2026-08-24. Enregistre l'état complet de la
              partie dans un fichier, graine comprise, pour que le cas se
              rejoue au lieu d'être reconstitué de mémoire. Rien ne sort de
              l'appareil : le fichier est fabriqué et enregistré localement. */}
          <button
            onClick={telechargerRapport}
            title="Enregistre l'état exact de la partie dans un fichier, pour pouvoir rejouer ce qui vient de se passer"
            style={btnStyle(null, null)}
          >
            📋 Signaler
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
        {/* ── LIGNE DE PHASE SUPPRIMEE (Nikola, 2026-08-19) ──
            « Supprime le panneau "M2 · 3 programmation", deplace les
            validations des titans ailleurs, ce panneau ne sert pas
            vraiment. »

            Elle affichait trois choses, toutes redites ailleurs :
            · le numero de Manche, deja dans la barre de stock (« Manche 1/4 ·
              Detonateur Titan 2 ») ;
            · le nom de la Phase, deja en toutes lettres dans la consigne du
              moment, qui explique en plus ce qu'il faut faire ;
            · les coches de validation de chaque Titan, qui n'avaient rien a
              faire loin des Titans eux-memes.

            Les coches et le bouton Valider vivent desormais dans la bande des
            Titans, sur l'encart de chacun : on voit qui a valide en regardant
            le Titan, et on valide au meme endroit. */}
        {/* Bandeau "Titan X joue" supprimé (Nikola) : le Titan actif est deja
            visible sur son encart (bordure lumineuse + "▶" dans TitanResourceBand). */}
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


      {/* ── CONSIGNE DU MOMENT, SUPPRIMEE (Nikola, 2026-08-19) ──
          « Supprime-moi le panneau d'indication de ce que fait un titan
          adverse, ou de quoi faire, celui au-dessus des encarts de titan. »

          Il annoncait a la fois ce que la Phase attendait et ce que le Titan
          actif etait en train de faire. Deux informations deja portees
          ailleurs : la carte en cours se lit sur le bandeau du Titan actif,
          et la sequence du tour est rappelee dessous. Sur une table, un
          pave de texte qui change a chaque clic se lit une fois puis
          s'ignore — et il poussait le plateau vers le bas. */}

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
          déclenchement, qu'on ne lit qu'une fois, va dans l'infobulle.

          Panneau supprimé (Nikola) : l'information "dernière Manche" vit
          desormais uniquement dans le panneau de stock (BlockStockBar),
          collee au compteur de Manche qu'elle qualifie. */}

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
