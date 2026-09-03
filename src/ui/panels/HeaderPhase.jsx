import React from "react";
import { btnStyle, cancelBtn } from "../styles.js";
import { T, marquee, prose, label, plate, key, readout } from "../theme.js";
import Icon from "../icons.jsx";
import BlockStockBar from "../cards/BlockStockBar.jsx";

/* Une commande du meuble : icône dessinée + libellé, jamais un émoji. Toutes
   au même gabarit, pour que la rangée se lise comme une rangée de touches et
   pas comme une collection de boutons de tailles différentes. */
function Commande({ onClick, disabled, title, icon, children, tone = null, badge = null, nomComplet = null, enfonce = false }) {
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
    setShowTutoriel,
    regenerate,
    animating,
    animLabel,
    showJournal,
    setShowJournal,
    actionLog,
    state,
    looseBlocks,
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
          // Le stock, plus haut que les touches depuis qu'il a grandi de 30 %,
          // ne doit pas les étirer avec lui : chacun garde sa hauteur propre.
          alignItems: "center",
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
        {/* ANNULER A QUITTÉ CETTE RANGÉE — Nikola, 2026-08-28. C'est un geste
            de TOUR, pas un réglage du meuble : il vit maintenant à côté de
            Périmètre / Énergie, dans le panneau du Titan qui joue (cf.
            BoardPanel), là où on regarde quand on vient de faire un coup
            qu'on regrette. */}
        {/* SCORING : UN INTERRUPTEUR D'AFFICHAGE, PAS UNE ACTION.

            Il a été vert, puis jaune, et aucun des deux n'allait. Le vert dit
            « disponible, validé » partout ailleurs : sur un bouton qui ne fait
            qu'ouvrir un panneau, il annonçait une réussite qui n'existe pas.
            Le jaune, lui, est la couleur de l'action primaire du tour — et il
            arrivait en plus avec du texte blanc dessus, illisible (le vrai
            défaut était dans `encrePour`, corrigé depuis).

            La bonne réponse était ailleurs : Scoring est un interrupteur, au
            même titre que Vue 3D et Règles, qui n'ont jamais porté de couleur
            de remplissage. Son état actif se dit donc comme celui d'un
            interrupteur — cerne et texte allumés, aplat éteint — au lieu
            d'emprunter une couleur qui veut dire autre chose. */}
        {/* SANS ICÔNE (Nikola, 2026-08-28 : « supprime l'icône poubelle du
            bouton Scoring »). C'était la Lanterne Rouge — le fanal de queue
            de convoi, qui sert au trophée du même nom. À 15 px, dans une
            rangée de commandes, elle se lit comme une corbeille : le
            pictogramme disait donc « jeter » sur le bouton qui ouvre le
            décompte. Aucune autre icône du jeu ne dit « compter les
            points », et le mot le dit très bien tout seul. */}
        <Commande
          onClick={() => setShowScoring((s) => !s)}
          enfonce={showScoring}
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
        {/* TUTORIEL À CÔTÉ DES RÈGLES, ET C'EST VOULU (Nikola, 2026-09-01 :
            « il faudrait un bouton tutoriel pour voir les principes du jeu
            rapidement et le fonctionnement des cartes visuellement »).

            Les deux répondent à deux questions différentes. « Comment on joue,
            déjà ? » se règle en sept écrans ; « que fait exactement cette carte
            au Seuil 4 ? » demande le livret. Les mettre côte à côte laisse
            choisir la bonne porte, au lieu d'enterrer la réponse courte sous la
            longue. */}
        <Commande
          onClick={() => setShowTutoriel(true)}
          icon="bolt"
          nomComplet="Tutoriel"
          title="Les principes du jeu et les six cartes, en sept écrans"
        >
          Tutoriel
        </Commande>
        {/* JOURNAL À LA PLACE DE SIGNALER — Nikola, 2026-08-28 : « place
            l'historique "journal" à la place de Signaler, car Signaler je ne
            m'en sers pas ».

            Le journal vivait sous le plateau, dans le flux : il poussait tout
            vers le bas sur une partie d'1 h 30. Il devient une superposition,
            ouverte d'ici et refermée d'un Échap.

            SIGNALER N'EST PAS SUPPRIMÉ pour autant — il enregistre l'état
            complet de la partie, graine comprise, et c'est ce qui permet de
            rejouer un bug au lieu de le reconstituer de mémoire. Il descend
            dans l'en-tête de cette superposition, juste à côté du journal
            qu'on est en train de lire quand on décide de signaler quelque
            chose : c'est là qu'il sert, pas dans une rangée de commandes où
            il ne faisait que prendre une place. */}
        <Commande
          onClick={() => setShowJournal((v) => !v)}
          enfonce={showJournal}
          icon="next"
          badge={actionLog.length > 0 ? actionLog.length : null}
          title="Ouvrir le journal de la partie par-dessus le plateau"
        >
          Journal
        </Commande>

        {/* LE STOCK GLOBAL, À DROITE DE LA MÊME RANGÉE — Nikola, 2026-08-28.
            C'est la seule position qui ne coûte aucune hauteur : la rangée
            existe déjà et sa moitié droite était vide. Tout ce qu'on lui reprend
            ici, l'écran le rend au plateau et aux panneaux du tour — qui doivent
            tenir sans défilement. */}
        <BlockStockBar board={state.board} looseBlocks={looseBlocks} orientation="rangee" />
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
