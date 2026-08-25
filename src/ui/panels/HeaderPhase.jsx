import React from "react";
import { btnStyle, cancelBtn } from "../styles.js";
import { T, marquee, prose, label, plate, key } from "../theme.js";
import Icon from "../icons.jsx";

/* Une commande du meuble : icône dessinée + libellé, jamais un émoji. Toutes
   au même gabarit, pour que la rangée se lise comme une rangée de touches et
   pas comme une collection de boutons de tailles différentes. */
function Commande({ onClick, disabled, title, icon, children, tone = null, badge = null, nomComplet = null }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      /* Le libellé visible est court pour tenir sur une ligne ; le nom
         accessible reste complet. Le visible est toujours contenu dans le
         complet (WCAG 2.5.3, « Label in Name »). */
      aria-label={nomComplet || undefined}
      style={{
        ...btnStyle(tone, null, !disabled),
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: T.micro,
        padding: "9px 12px",
      }}
    >
      <Icon name={icon} size={15} />
      {children}
      {badge != null && (
        <span style={{ opacity: 0.75, fontWeight: 800 }}>×{badge}</span>
      )}
    </button>
  );
}

export default function HeaderPhase({ vm }) {
  // Confirmation maison plutot que window.confirm : la boite systeme casse
  // la direction artistique et ne se style pas.
  const [confirmNouvelle, setConfirmNouvelle] = React.useState(false);
  const {
    eventsEnabled,
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
    animating,
    animLabel,
    undoStack,
    handleUndo,
    telechargerRapport,
  } = vm;

  return (
    <>
      {/* ── RANGÉE DE COMMANDES DU MEUBLE ──
          Ce ne sont pas des actions de jeu : aucune ne doit peser autant
          qu'une carte jouable. Elles restent en retrait, sur une seule ligne,
          et seule « Nouvelle partie » porte une couleur — parce qu'elle est
          la seule destructive. */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: T.s3,
        }}
      >
        <Commande
          onClick={() => setConfirmNouvelle(true)}
          icon="undo"
          tone={T.stop}
          title="Abandonner la partie en cours et en relancer une nouvelle"
        >
          Nouvelle partie
        </Commande>
        <Commande
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          icon="undo"
          badge={undoStack.length > 0 ? undoStack.length : null}
          title={
            undoStack.length === 0
              ? "Aucune action à annuler"
              : `Annuler (${undoStack.length} coup${undoStack.length > 1 ? "s" : ""} disponible${undoStack.length > 1 ? "s" : ""})`
          }
        >
          Annuler
        </Commande>
        {/* Le vert dit « disponible, validé » partout ailleurs dans le jeu :
            sur un bouton d'affichage, il annonçait une action réussie qui
            n'existe pas. Le décompte est le trophée de fin de partie, donc le
            jaune — la même couleur que la lanterne qu'il porte et que l'écran
            de décompte lui-même. */}
        <Commande
          onClick={() => setShowScoring((s) => !s)}
          icon="lantern"
          tone={showScoring ? T.you : null}
          title="Afficher ou masquer le décompte des points"
        >
          Scoring
        </Commande>
        {/* Bascule pure : le bouton annonce la vue vers laquelle il emmène,
            jamais celle qu'on regarde déjà, et ne porte pas d'état « actif »
            qui laisserait croire l'inverse. */}
        <Commande
          onClick={() => setShow3D((s) => !s)}
          icon="eye"
          title={show3D ? "Revenir à la grille 2D" : "Passer à la vue 3D du plateau"}
        >
          {show3D ? "Vue 2D" : "Vue 3D"}
        </Commande>
        <Commande
          onClick={() => setShowRules(true)}
          icon="card"
          nomComplet="Règles du jeu"
          title="Ouvrir le livret sans quitter la partie"
        >
          Règles
        </Commande>
        {/* SIGNALER — Nikola, 2026-08-24. Enregistre l'état complet de la
            partie dans un fichier, graine comprise, pour que le cas se
            rejoue au lieu d'être reconstitué de mémoire. Rien ne sort de
            l'appareil : le fichier est fabriqué et enregistré localement. */}
        <Commande
          onClick={telechargerRapport}
          icon="alert"
          title="Enregistre l'état exact de la partie dans un fichier, pour pouvoir rejouer ce qui vient de se passer"
        >
          Signaler
        </Commande>
      </div>

      {/* ── CONFIRMATION NOUVELLE PARTIE ── */}
      {confirmNouvelle && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer une nouvelle partie"
          onClick={() => setConfirmNouvelle(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9500,
            background: "rgba(12,8,32,.86)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...plate({ accent: T.stop, pad: "22px 24px" }),
              maxWidth: 440,
              width: "100%",
              boxShadow: "0 18px 50px rgba(0,0,0,.7)",
            }}
          >
            <h2 style={{ ...marquee(T.h3, T.stop), marginBottom: T.s2 }}>
              Abandonner la partie ?
            </h2>
            <p style={{ ...prose(T.dim, T.small), margin: `0 0 ${T.s4}` }}>
              Tu es en <strong style={{ color: T.you }}>Manche {mancheNumber}</strong>.
              Relancer une nouvelle partie efface le plateau, les Repaires et les
              scores en cours. Cette action est définitive.
            </p>
            <div style={{ display: "flex", gap: T.s2, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button onClick={() => setConfirmNouvelle(false)} style={cancelBtn()}>
                Continuer la partie
              </button>
              <button
                onClick={() => {
                  setConfirmNouvelle(false);
                  regenerate();
                }}
                style={key("stop", { size: "m" })}
              >
                <Icon name="undo" size={15} />
                Nouvelle partie
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PHASE ACTION TERMINÉE ── */}
      {phase === "action" && activePlayerId == null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: T.s2,
            marginBottom: T.s3,
            color: T.go,
            ...label(T.go, T.micro),
          }}
        >
          <Icon name="check" size={15} />
          Phase Action terminée — tous les Titans ont joué
        </div>
      )}

      {/* ── RÉSOLUTION EN COURS ──
          Une carte se résout en trois secondes, pendant lesquelles rien ne
          doit être cliquable. La barre le dit, et la barre de progression
          montre le temps qui reste plutôt qu'un disque qui tourne dans le
          vide. */}
      {animating && (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...plate({ accent: T.you, pad: "10px 14px" }),
            marginBottom: T.s3,
            display: "flex",
            alignItems: "center",
            gap: T.s3,
          }}
        >
          <Icon name="bolt" size={18} style={{ color: T.you }} />
          <span style={{ ...label(T.you, T.small), letterSpacing: ".06em" }}>
            {animLabel || "Résolution en cours…"}
          </span>
          <span
            aria-hidden="true"
            style={{
              marginLeft: "auto",
              width: 90,
              height: 8,
              background: "rgba(0,0,0,.45)",
              border: `1px solid ${T.edge}`,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                background: T.you,
                animation: "titan-resolve 3s linear both",
              }}
            />
          </span>
        </div>
      )}
      <style>{`@keyframes titan-resolve { from { width: 0 } to { width: 100% } }`}</style>

      {/* ── ÉVÉNEMENT ── */}
      {phase === "evenement" && eventsEnabled && (
        <div
          style={{
            ...plate({ accent: T.move, pad: "10px 14px" }),
            marginBottom: T.s3,
            display: "flex",
            alignItems: "center",
            gap: T.s2,
          }}
        >
          <Icon name="alert" size={16} style={{ color: T.move }} />
          <strong style={{ ...label(T.move, T.small) }}>
            Événement M{mancheNumber}
          </strong>
          <span style={prose(T.dim, T.small)}>{currentEvent || "…"}</span>
        </div>
      )}
    </>
  );
}
