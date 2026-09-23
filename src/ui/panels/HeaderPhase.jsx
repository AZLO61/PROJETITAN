import React from "react";
import { btnStyle, cancelBtn } from "../styles.js";
import { T, marquee, prose, label, plate, key } from "../theme.js";
import Icon, { SonIcon } from "../icons.jsx";
import { volumeSon, definirVolumeSon, palierSuivant, ondesPourVolume, jouerApercuVolume } from "../audio.js";

/* Une commande du meuble : icône dessinée + libellé, jamais un émoji. Toutes
   au même gabarit, pour que la rangée se lise comme une rangée de touches et
   pas comme une collection de boutons de tailles différentes. */
function Commande({ onClick, disabled, title, icon, children, tone = null, badge = null, nomComplet = null, enfonce = false, padding = "9px 12px" }) {
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
        padding,
        // Interrupteur allumé : le cerne et le texte prennent la couleur, pas
        // l'aplat. Un aplat clair sous un libellé court se lit moins bien
        // qu'un contour, et n'entre pas en concurrence avec les vraies
        // actions du tour, qui sont pleines.
        ...(enfonce ? { borderColor: T.you, color: T.you } : null),
      }}
    >
      {icon ? <Icon name={icon} size={15} /> : null}
      {children}
      {badge != null && (
        <span style={{ opacity: 0.75, fontWeight: 800 }}>×{badge}</span>
      )}
    </button>
  );
}

export default function HeaderPhase({ vm, phase: phaseAffichee = null, enteteRef = null }) {
  // Confirmation maison plutot que window.confirm : la boite systeme casse
  // la direction artistique et ne se style pas.
  const [confirmNouvelle, setConfirmNouvelle] = React.useState(false);
  // Lu depuis localStorage au premier rendu ; l'icône écrit et relit la même
  // clé, cf. `ui/audio.js`.
  const [volume, setVolume] = React.useState(() => volumeSon());
  const changerVolume = () => {
    const suite = palierSuivant(volume);
    definirVolumeSon(suite);
    setVolume(suite);
    jouerApercuVolume(suite);
  };
  const {
    mancheNumber,
    showScoring,
    setShowScoring,
    show3D,
    setShow3D,
    setShowRules,
    regenerate,
    showJournal,
    setShowJournal,
    actionLog,
  } = vm;

  return (
    <>
      {/* ── LA RANGÉE DU HAUT, SUR LES DEUX COLONNES DU JEU ──
          Nikola, 2026-09-22, maquette à l'appui : à gauche du titre ce qu'on
          touche une fois par partie (Nouvelle partie, Règles, Journal) ;
          au-dessus des Titans ce qui décrit le moment (Phase), le son, et les
          deux vues (Scoring, Vue 3D). La grille reprend celle de
          `.titan-layout` pour que la moitié droite tombe exactement au-dessus
          des Titans. Toute la rangée est cachée au-dessus de l'écran pendant
          la partie : on la retrouve en remontant (cf. GameView).

          Ce ne sont pas des actions de jeu : aucune ne pèse autant qu'une
          carte jouable, et seule « Nouvelle partie » porte une couleur —
          parce qu'elle est la seule destructive. Le Tutoriel a quitté cette
          rangée pour le sommaire des Règles, où l'on vient apprendre. */}
      <div ref={enteteRef} className="titan-layout titan-entete">
        <div style={{
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0,
          paddingBottom: T.s2, borderBottom: `2px solid ${T.ruleStrong}`,
        }}>
          <h1 style={{ ...marquee("clamp(1.25rem, 2.2vw, 1.6rem)", T.you), margin: `0 ${T.s3} 0 0` }}>
            Projet Titan
          </h1>
          {/* SANS ICÔNE (Nikola, 2026-09-22) : le mot suffit. Fond VIOLET
              (Nikola, 2026-09-23) : seule touche colorée de la rangée. */}
          <Commande
            onClick={() => setConfirmNouvelle(true)}
            tone={T.tele}
            title="Abandonner la partie en cours et en relancer une nouvelle"
          >
            Nouvelle partie
          </Commande>
          <Commande
            onClick={() => setShowRules(true)}
            icon="card"
            nomComplet="Règles du jeu"
            title="Ouvrir le livret sans quitter la partie"
          >
            Règles
          </Commande>
          {/* JOURNAL SANS ICÔNE (Nikola, 2026-09-22) : la flèche « suivant »
              qu'il portait ne disait rien d'un journal. Le compteur reste —
              c'est l'information. */}
          <Commande
            onClick={() => setShowJournal((v) => !v)}
            enfonce={showJournal}
            badge={actionLog.length > 0 ? actionLog.length : null}
            title="Ouvrir le journal de la partie par-dessus le plateau"
          >
            Journal
          </Commande>
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          gap: 5, flexWrap: "wrap", minWidth: 0,
        }}>
          {/* Le libellé AU-DESSUS de la valeur, comme Périmètre et Énergie :
              en ligne, « Phase Programmation » prenait 205 px et poussait
              « Vue 3D » à la ligne, dans une colonne qui n'en a que 360. */}
          {phaseAffichee && (
            <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
              <span style={label(T.faint, T.micro)}>Phase</span>
              <span style={{ ...marquee("0.95rem", phaseAffichee.couleur), whiteSpace: "nowrap" }}>{phaseAffichee.mot}</span>
            </span>
          )}
          {/* LE SON EST UN HAUT-PARLEUR, PAS UN MOT (Nikola, 2026-09-22), et
              il vit ici, juste après la Phase (2026-09-23). Quatre paliers, un
              clic pour passer au suivant : 3 ondes à 100 %, 2 à 67 %, 1 à 33 %,
              barré de rouge à 0. Le palier choisi joue une note, pour qu'on
              l'entende tout de suite. Rembourrage réduit : c'est une touche
              sans texte, et la colonne des Titans ne fait que 360 px au plus
              juste. */}
          <Commande
            onClick={changerVolume}
            nomComplet={`Volume ${volume} %`}
            title={volume === 0 ? "Son coupé — clic pour le remettre à 100 %" : `Volume ${volume} % — clic pour baisser`}
            padding="9px 9px"
          >
            <SonIcon ondes={ondesPourVolume(volume)} size={18} />
          </Commande>
          {/* Vue 3D AVANT Scoring (Nikola, 2026-09-23 : « inverse les positions »). */}
          {/* Bascule pure : le bouton annonce la vue vers laquelle il emmène,
              jamais celle qu'on regarde déjà. */}
          <Commande
            onClick={() => setShow3D((s) => !s)}
            icon="eye"
            title={show3D ? "Revenir à la grille 2D" : "Passer à la vue 3D du plateau"}
            padding="9px 11px"
          >
            {show3D ? "Vue 2D" : "Vue 3D"}
          </Commande>
          {/* SCORING : UN INTERRUPTEUR D'AFFICHAGE, PAS UNE ACTION — son état
              se dit par le cerne et le texte allumés, jamais par un aplat. */}
          <Commande
            onClick={() => setShowScoring((s) => !s)}
            enfonce={showScoring}
            title="Afficher ou masquer le décompte des points"
            padding="9px 11px"
          >
            Scoring
          </Commande>
        </div>
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

    </>
  );
}

/* ── LES ÉTATS DU TOUR, DANS LA ZONE DES BANDEAUX ──
   Nikola, 2026-09-23 : ce qui apparaît sous la ligne ne doit plus pousser le
   plateau hors de l'écran. Ces trois lignes vivaient juste sous la rangée du
   haut ; GameView les pose désormais dans la même zone que les bandeaux de
   décision, dont il mesure la hauteur. Resserrés pour tenir dans la hauteur
   minimale de cette zone : « Résolution en cours » passe à chaque carte, il
   ne doit pas faire bouger le plateau à chaque fois. */
export function StatutsTour({ vm }) {
  const { eventsEnabled, mancheNumber, activePlayerId, phase, currentEvent, animating, animLabel } = vm;
  return (
    <>
      {/* ── PHASE ACTION TERMINÉE ── */}
      {phase === "action" && activePlayerId == null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: T.s2,
            marginBottom: 6,
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
            ...plate({ accent: T.you, pad: "6px 12px" }),
            marginBottom: 6,
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
            ...plate({ accent: T.move, pad: "6px 12px" }),
            marginBottom: 6,
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
