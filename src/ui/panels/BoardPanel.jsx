import React from "react";
import CardVisual from "../cards/CardVisual.jsx";
import { CARD_EFFECT } from "../cards/cardEffects.js";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon } from "../titans/TitanVisuals.jsx";
import { TITAN_COLORS } from "../titans/constants.js";
import { CARD_LABEL, PHASE_LABELS } from "../../domain/index.js";
import { smallBtn, cancelBtn } from "../styles.js";
import { T, marquee, readout, label, prose } from "../theme.js";
import Icon, { AdrenalineIcon } from "../icons.jsx";

/* ── UNE ÉTAPE DU TOUR ─────────────────────────────────────
   Le tour suit son ordre réel — se déplacer, jouer, ramasser — et une seule
   étape est visible à la fois. Ce cadre est leur forme commune : un numéro
   d'ordre, un titre, ce que l'étape permet, et ses commandes.

   Le numéro n'est pas là pour décorer : la séquence EST l'information. Un
   joueur qui découvre le jeu doit voir qu'il en est à 1 sur 3, et qu'il ne
   peut pas jouer sa carte avant d'avoir tranché son déplacement. */
function Step({ n, titre, quand, accent, ouvert, children }) {
  return (
    <section
      style={{
        background: ouvert ? "rgba(0,0,0,.32)" : "transparent",
        border: `2px solid ${ouvert ? accent : T.rule}`,
        borderRadius: T.rPlate,
        padding: "11px 13px",
        marginBottom: 10,
        transition: `border-color 180ms linear, background 180ms linear`,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <span
          aria-hidden="true"
          style={{
            ...readout("0.7rem", ouvert ? "#0f0826" : T.faint),
            background: ouvert ? accent : "transparent",
            border: `2px solid ${ouvert ? accent : T.rule}`,
            width: 22,
            height: 22,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {n}
        </span>
        <h3 style={marquee("0.95rem", ouvert ? accent : T.dim)}>{titre}</h3>
        {quand && (
          <span style={{ ...label(T.faint), marginLeft: "auto", whiteSpace: "nowrap" }}>
            {quand}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

// Selecteur d'Adrenaline : le livret dit « +1 par Adrenaline depensee », donc
// un Titan qui en a plusieurs peut toutes les investir. Une case a cocher ne
// permettait d'en jouer qu'une seule.
function AdrenalinePicker({ value, max, onChange, label: aide }) {
  if (max <= 0) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...label(T.faint, T.micro) }}>
        <AdrenalineIcon size={15} style={{ opacity: 0.4 }} />
        Pas d'Adrénaline
      </span>
    );
  }
  // Deux touches de borne encadrant l'afficheur : mêmes arêtes dures, même
  // épaisseur de capuchon que le reste du meuble.
  const pas = (actif) => ({
    width: 28, height: 28, flexShrink: 0,
    background: actif ? T.go : "rgba(255,250,238,.06)",
    border: `2px solid ${T.edge}`,
    borderRadius: T.rChip,
    color: actif ? "#00311e" : T.faint,
    fontWeight: 800, lineHeight: 1, fontSize: T.body,
    cursor: actif ? "pointer" : "not-allowed",
    boxShadow: actif ? `0 2px 0 ${T.edge}` : "none",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }} title={aide}>
      <AdrenalineIcon size={17} />
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label="Dépenser une Adrénaline de moins"
        style={pas(value > 0)}
      >−</button>
      <span style={{ ...readout("0.72rem", value > 0 ? T.go : T.faint), minWidth: 34, textAlign: "center" }}>
        {value}/{max}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Dépenser une Adrénaline de plus"
        style={pas(value < max)}
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
  // Les deux valeurs lues sont extraites AVANT l'effet : dépendre de `vm`
  // entier relancerait l'effet à chaque rendu du contrôleur, c'est-à-dire à
  // chaque clic de la partie.
  const { animating: vmAnimating, activePlayerId: vmActivePlayerId, setPendingCardConfirm: vmSetPendingCardConfirm } = vm;
  React.useEffect(() => {
    if (!vmAnimating) vmSetPendingCardConfirm(null);
  }, [vmAnimating, vmActivePlayerId, vmSetPendingCardConfirm]);
  // `undoTick` : un rollback restaure le plateau mais pas l'étape du tour.
  // Sans ça, un joueur qui avait cliqué « Passer aux cartes » restait sans
  // panneau de déplacement après annulation, et ses clics sur le plateau
  // ne produisaient plus rien (bug remonté le 2026-08-17).
  React.useEffect(() => { setMoveSkipped(false); }, [vm.activePlayerId, vm.undoTick]);
  const {
    activePlayerId,
    setActivePlayerId,
    titanModes,
    titanDisplayName,
    phase,
    phaseValidated,
    canValidatePhase,
    getPhaseBlockReason,
    validatePhase,
    selectedTitan,
    teaMode,
    setTeaMode,
    teaAdrenaline,
    setTeaAdrenaline,
    tcAdrenaline,
    setTcAdrenaline,
    direction,
    setDirection,
    jnpMode,
    setJnpMode,
    jnpSelected,
    setJnpSelected,
    bbMode,
    setBbMode,
    bbAdrenaline,
    setBbAdrenaline,
    bbDest,
    bbPath,
    setBbPath,
    setBbSurvol,
    setGraouMode,
    bbBudgetUsed,
    bbUndoLastCell,
    bbDestIsBuilding,
    progSelection,
    setProgSelection,
    progCountdown,
    setProgCountdown,
    progCountdownTimer,
    setProgCountdownTimer,
    moveMode,
    moveAdrenaline,
    setMoveAdrenaline,
    recupMode,
    passifUsed,
    animating,
    setAnimating,
    setAnimLabel,
    pendingCardConfirm,
    setPendingCardConfirm,
    waitingNextTitan,
    setWaitingNextTitan,
    passerAuTitanSuivant,
    canUseMovePassif,
    canUseRecupPassif,
    toggleProgCard,
    undoStack,
    handleUndo,
    canPlayCard,
    advanceActionRound,
    discardCurrentCard,
    canDiscardCard,
    teaTargets,
    toggleTeaMode,
    graouMode,
    toggleGraouMode,
    jouerGraouhhh,
    bbMaxRange,
    toggleBbMode,
    jouerBoingBoing,
    moveMaxRange,
    moveReachable,
    moveClassic,
    moveTeleport,
    toggleMoveMode,
    recupPool,
    toggleRecupMode,
    jnpNbToPick,
    toggleJnpMode,
    jouerJeNePartagePas,
    jouerFautPasMeChauffer,
    jouerToutCasser,
    perimeterCells,
    energie,
    tcSel,
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
     que ce n'est pas le cas. » La carte était résolue, `waitingNextTitan`
     passait à true, et le panneau de fin de tour proposait « ▶ Titan
     suivant » PAR-DESSUS un DIL/RAGE encore en attente : on pouvait passer
     la main en laissant une décision dans la file, qui réapparaissait au
     tour du joueur suivant, hors contexte.

     TOUTES les décisions bloquantes comptent, pas seulement le DIL et le
     repli. Nikola le 2026-08-18 : « je ne veux pas que le panneau Ramasser
     apparaisse alors qu'il y a un Dilemme ou une Rage à résoudre, il y a un
     ordre précis à respecter. »

     Cette ligne énumérait deux cas sur cinq. La répartition d'un Amas
     écroulé et la comparaison de Faut Pas Me Chauffer passaient au travers :
     le Ramassage et « ▶ Titan suivant » s'affichaient par-dessus, alors que
     ces deux résolutions peuvent encore faire tomber des blocs dans le
     Périmètre — ramasser avant qu'elles soient tranchées, c'est ramasser sur
     un plateau qui n'est pas le bon.

     L'ordre lui-même vit dans le contrôleur (`decisionBloquante`), au même
     endroit que celui des bandeaux : une seule liste, un seul ordre. */
  const decisionEnAttente = Boolean(vm.decisionBloquante);
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
          // l'œil hésite entre deux zones en relief simultanément.
          background: T.plate,
          border: `2px solid ${tcSel ? tcSel.accent : T.edge}`,
          borderRadius: T.rPlate,
          padding: "10px 12px",
          // Dernier panneau de la colonne : sa marge basse ne sépare plus de
          // rien depuis que le stock et la graine sont remontés dans l'en-tête,
          // et elle coûtait 12 px à un écran qui compte ses pixels.
          marginBottom: 0,
        }}>
          {/* En-tête Titan — nom, case, couleur et Adrénaline vivent déjà sur
              la carte du Titan dans le bandeau juste au-dessus, en
              surbrillance quand il est sélectionné. Il ne reste ici que les
              deux valeurs qu'on ne lit nulle part ailleurs : le Périmètre et
              l'Énergie, qui changent à chaque déplacement et décident du
              Seuil 4. */}
          {/* Les deux seules valeurs qu'on ne lit nulle part ailleurs, et
              qui décident de tout : le Périmètre change à chaque déplacement,
              et l'Énergie qui en découle décide du Seuil 4. Elles vont donc
              sur l'afficheur, en grand, avant les étapes. */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 22, marginBottom: 12, flexWrap: "wrap" }}>
            <div title="Cases occupées autour de ton Titan" style={{ cursor: "help" }}>
              <div style={label(T.faint)}>Périmètre</div>
              <div style={{ ...readout("1.15rem", T.text), marginTop: 5 }}>{perimeterCells.length}</div>
            </div>
            <div
              title={
                teaMode
                  ? "Énergie de départ de Tête en Avant — à 4 ou plus, les effets forts s'activent. Elle baisse d'1 par case parcourue."
                  : bbMode
                  ? "Énergie de départ de Boing Boing — à 4 ou plus, les effets forts s'activent. Elle baisse d'1 par case parcourue."
                  : "Énergie de Tout Casser — à 4 ou plus, les effets forts s'activent"
              }
              style={{ cursor: "help" }}
            >
              <div style={label(T.faint)}>Énergie</div>
              {/* Retour de Nikola (répété) : le chiffre lui-même reste en
                  jaune, y compris au Seuil 4 — l'avertissement rouge vit
                  déjà dans le badge "Seuil 4" juste à côté, pas besoin de
                  répéter la couleur sur les deux. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                <span style={readout("1.15rem", T.you)}>{energie}</span>
                {energie >= 4 && (
                  <span
                    style={{
                      ...label(T.stop, "0.66rem"),
                      border: `1.5px solid ${T.stop}`,
                      padding: "2px 5px",
                    }}
                  >
                    Seuil 4
                  </span>
                )}
              </div>
            </div>

            {/* ANNULER VIT ICI DEPUIS LE 2026-08-28 (Nikola : « le bouton
                Annuler devrait plutôt être à côté de Périmètre / Énergie, sur
                la droite »). Il était dans la rangée de commandes du meuble,
                avec « Nouvelle partie » et « Règles » — des réglages qu'on
                touche une fois par partie. Or annuler est un geste de TOUR :
                on s'en sert juste après un coup, en regardant le panneau du
                Titan, pas en haut de l'écran. */}
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title={undoStack.length === 0
                ? "Aucune action à annuler"
                : `Annuler (${undoStack.length} coup${undoStack.length > 1 ? "s" : ""} disponible${undoStack.length > 1 ? "s" : ""})`}
              /* Il a eu deux vies ratées dans la journée : d'abord le
                 traitement d'un bouton secondaire de boîte de dialogue —
                 contour discret, texte gris, invisible — puis un aplat orange
                 plein qui criait plus fort que les actions de jeu elles-mêmes.

                 La troisième version emprunte le vocabulaire que le meuble
                 utilise déjà pour ses touches : aplat sombre, cerne net, et le
                 relèvement de 3 px qui dit « ça s'enfonce ». L'orange ne peint
                 plus le fond, il tient le cerne, l'icône et le compteur — assez
                 pour qu'on le trouve du premier coup d'œil, pas assez pour
                 concurrencer la carte qu'on est en train de jouer. Éteint, tout
                 retombe en gris et le relief disparaît : rien à annuler ne doit
                 pas attirer l'œil. */
              style={{
                marginLeft: "auto",
                display: "inline-flex", alignItems: "center", gap: 7,
                background: undoStack.length === 0 ? "rgba(255,255,255,.04)" : "rgba(251,146,60,.12)",
                border: `${T.edgeW} solid ${undoStack.length === 0 ? T.rule : "#fb923c"}`,
                borderRadius: T.rChip,
                color: undoStack.length === 0 ? T.faint : "#ffb877",
                padding: "8px 14px",
                fontFamily: T.ui,
                fontWeight: 700,
                fontSize: T.small,
                letterSpacing: ".02em",
                boxShadow: undoStack.length === 0 ? "none" : `0 3px 0 ${T.edge}`,
                transform: undoStack.length === 0 ? "none" : "translateY(-1px)",
                transition: `transform 90ms ${T.easeOut}, box-shadow 90ms ${T.easeOut}`,
                cursor: undoStack.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              <Icon name="undo" size={13} />
              Annuler
              {undoStack.length > 0 && (
                <span style={{
                  ...readout("0.62rem", "#120d02"),
                  background: "#fb923c", borderRadius: 99, padding: "1px 7px",
                  lineHeight: "14px",
                }}>{undoStack.length}</span>
              )}
            </button>
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
              background: "rgba(0,0,0,.32)", border: `2px solid ${T.you}`,
              borderRadius: T.rPlate, padding: "18px", marginBottom: 10, textAlign: "center",
            }}>
              <div style={{ ...marquee(T.h3, T.you), marginBottom: 5 }}>
                Tour terminé
              </div>
              <div style={{ ...prose(T.dim, T.small), margin: "0 auto 14px" }}>
                Passe l'appareil au Titan suivant.
              </div>
              {/* POURQUOI LE RAMASSAGE N'EST PAS PROPOSÉ.
                  Remonté par Nikola le 2026-08-18 : « j'ai défaussé Je Ne
                  Partage Pas et ça m'a fait sauter mon passif de Ramassage. »
                  Le passif était bien disponible — une défausse y donne droit
                  au même titre qu'une carte jouée — mais le panneau Ramasser
                  ne se montre QUE s'il y a réellement quelque chose à
                  ramasser. Périmètre vide, aucun panneau, et rien à l'écran
                  ne disait que le tour n'avait rien sauté. On le dit. */}
              {!passifUsed[selectedTitan.id]?.recup && recupPool.size === 0 && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  marginBottom: 14, color: T.faint, ...prose(T.faint, T.micro),
                }}>
                  <Icon name="grab" size={14} />
                  Ramassage : aucun débris dans ton Périmètre, il n'y avait rien à prendre.
                </div>
              )}
              <button
                onClick={passerAuTitanSuivant}
                style={{
                  ...smallBtn(true, "#FFD93D"),
                  fontSize: T.lead,
                  padding: "14px 28px", minHeight: 52, width: "100%", maxWidth: 340,
                }}
              >
                <Icon name="next" size={16} />
                Titan suivant
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
              <Step n={1} titre="Te déplacer ?" quand="avant ta carte" accent={T.move} ouvert={moveMode}>
                {!moveMode && (
                  <>
                    <div style={{ ...prose(T.dim, T.small), marginBottom: 9 }}>
                      Jusqu'à {moveMaxRange} case{moveMaxRange > 1 ? "s" : ""}. C'est facultatif, et ça change ton Périmètre donc ton Énergie.
                    </div>
                    {/* CE QUE COÛTE UNE RENTRÉE — remonté par Nikola le
                        2026-08-18 : « il faut bien indiquer que quand on est
                        éjecté de BIG CITY, le fait de rentrer coûte un de
                        passif. » La règle existait et était appliquée : le
                        Mouvement gratuit passait de 2 à 1 case au tour du
                        retour. Mais rien ne le disait, alors le joueur lisait
                        simplement « jusqu'à 1 case » et croyait à un bug. */}
                    {vm.coutRentreeCeTour > 0 && (
                      <div style={{
                        display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 9,
                        border: `2px solid ${T.stop}`, padding: "7px 9px",
                        ...prose(T.text, T.micro),
                      }}>
                        <Icon name="ringout" size={15} style={{ color: T.stop, marginTop: 2 }} />
                        <span>
                          Tu rentres de hors de BIG CITY : ta rentrée a coûté {vm.coutRentreeCeTour} déplacement
                          {vm.coutRentreeCeTour > 1 ? "s" : ""} sur ton Mouvement gratuit. Dépense une Adrénaline pour retrouver de la marge.
                        </span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={toggleMoveMode}
                        disabled={!canUseMovePassif(selectedTitan.id)}
                        style={smallBtn(canUseMovePassif(selectedTitan.id), "#71dbff")}
                      >
                        <Icon name="move" size={14} />
                        Se déplacer
                      </button>
                      {/* Bouton mis en avant : tant qu'il n'est pas clique,
                          les cartes ne s'affichent pas. Un joueur qui ne le
                          voyait pas restait bloque tout son tour. */}
                      <button
                        onClick={() => setMoveSkipped(true)}
                        style={smallBtn(true, "#FFD93D")}
                      >
                        Passer aux cartes
                        <Icon name="next" size={13} />
                      </button>
                    </div>
                  </>
                )}
                {moveMode && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...label(T.move, T.small) }}>
                        <Icon name="pointer" size={14} />
                        Clique une case ({moveReachable.size} dispo)
                      </span>
                      {/* LE DOSEUR D'ADRÉNALINE NE VIT QUE DANS LE MODE
                          DÉPLACER — Nikola, 2026-08-28 : « enlève l'information
                          d'adrénaline en + ou − si je ne suis pas dans
                          déplacer ». Il traînait dans la rangée d'ouverture, à
                          côté de « Passer aux cartes » : on y réglait donc une
                          portée pour un déplacement qu'on n'avait pas décidé de
                          faire. Les doseurs des cartes gardent leur place et
                          leur format, ils sont déjà sur la carte concernée. */}
                      <AdrenalinePicker
                        value={moveAdrenaline}
                        max={selectedTitan.adrenaline || 0}
                        onChange={setMoveAdrenaline}
                        label="Chaque Adrénaline dépensée ajoute 1 case de déplacement"
                      />
                      <button onClick={toggleMoveMode} style={{ ...cancelBtn(), marginLeft: "auto" }}>
                        <Icon name="close" size={12} /> Annuler
                      </button>
                    </div>
                    {/* La légende dit ce que peignent les cases du plateau.
                        Les pastilles reprennent EXACTEMENT le traitement de la
                        grille, sinon la légende ment. */}
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", ...label(T.dim, T.micro) }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 13, height: 13, background: "rgba(113,219,255,.25)", border: `2px solid ${T.move}`, display: "inline-block" }} />
                        Classique ({moveClassic.size})
                      </span>
                      {moveTeleport.size > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 13, height: 13, background: "rgba(113,219,255,.15)", border: `2px dashed ${T.tele}`, display: "inline-block" }} />
                          <Icon name="teleport" size={12} style={{ color: T.tele }} />
                          Téléporteur ({moveTeleport.size})
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </Step>
          )} {/* fin étape 1 */}

          {/* ── ÉTAPE 3 · RAMASSAGE ──
              Apparaît seulement une fois la carte du round jouée ou
              défaussée, et disparaît une fois le ramassage fait. */}
          {titanModes[selectedTitan.id] !== "ia" && stepRecup && (
              <Step n={3} titre="Ramasser ?" quand="après ta carte" accent={T.go} ouvert={recupMode}>
                {!recupMode && (
                  <>
                    <div style={{ ...prose(T.dim, T.small), marginBottom: 9 }}>
                      1 Bloc ou 1 Socle au choix dans ton Périmètre. Une case entièrement vidée t'oblige à t'y déplacer.
                    </div>
                    {/* Le passage au Titan suivant vit ici tant que le
                        ramassage est possible : soit on ramasse, soit on
                        passe, sans avoir a chercher un autre panneau. */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        onClick={toggleRecupMode}
                        disabled={recupPool.size === 0}
                        style={smallBtn(recupPool.size > 0, "#16E08C")}
                      >
                        <Icon name="grab" size={14} />
                        Ramasser {recupPool.size === 0 ? "(rien à portée)" : `(${recupPool.size} case${recupPool.size > 1 ? "s" : ""})`}
                      </button>
                      <button
                        onClick={passerAuTitanSuivant}
                        style={{ ...smallBtn(true, "#FFD93D"), marginLeft: "auto" }}
                      >
                        <Icon name="next" size={13} />
                        Titan suivant
                      </button>
                    </div>
                  </>
                )}
                {recupMode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    {/* « La phrase pour ramasser "clique sur une des cases en
                        surbrillance" n'est pas nécessaire, c'est intuitif »
                        (Nikola, 2026-08-28). Il reste le COMPTE, qui lui n'est
                        pas devinable : savoir qu'il y a trois cases évite d'en
                        chercher une quatrième. */}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...label(T.go, T.small) }}>
                      <Icon name="pointer" size={14} />
                      {recupPool.size} case{recupPool.size > 1 ? "s" : ""}
                    </span>
                    <button onClick={toggleRecupMode} style={{ ...cancelBtn(), marginLeft: "auto" }}>
                      <Icon name="close" size={12} /> Annuler
                    </button>
                  </div>
                )}
              </Step>
          )} {/* fin étape 3 */}

          {/* ── ÉTAPE 2 · TA CARTE ── */}
          {titanModes[selectedTitan.id] !== "ia" && !cartesVisibles && phase === "action" && (
            <div style={{
              border: `2px dashed ${T.rule}`,
              borderRadius: T.rPlate, padding: "16px 14px", marginBottom: 10,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
              textAlign: "center", color: T.faint,
            }}>
              <Icon name="lock" size={16} />
              <span style={prose(T.faint, T.small)}>
                Jeu caché — les cartes de {titanDisplayName(selectedTitan.id)} ne sont
                visibles que pendant son tour.
              </span>
            </div>
          )}
          {titanModes[selectedTitan.id] !== "ia" && cartesVisibles && stepCarte && (
          <div style={{ marginBottom: 8 }}>
            {phase === "action" && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9, flexWrap: "wrap" }}>
                <span
                  aria-hidden="true"
                  style={{
                    ...readout("0.7rem", "#1a1400"), background: T.you,
                    border: `2px solid ${T.you}`, width: 22, height: 22,
                    display: "grid", placeItems: "center", flexShrink: 0,
                  }}
                >
                  2
                </span>
                <h3 style={marquee("0.95rem", T.you)}>Joue une carte</h3>
                {/* « QUE FONT LES CARTES ? » TIENT EN UN POINT D'INTERROGATION —
                    Nikola, 2026-08-29 : « supprime "que font les cartes", mets
                    juste un ? à côté de "joue les cartes" pour afficher ».
                    C'était une touche pleine largeur avec un libellé qui changeait
                    selon l'état, pour une aide qu'on ouvre une fois le temps
                    d'apprendre les six cartes. Elle vit désormais où on la
                    cherche : contre le titre de l'étape. */}
                {(phase === "programmation" || phase === "action") && (
                  <button
                    onClick={() => setShowCardEffects((v) => !v)}
                    aria-pressed={showCardEffects}
                    title={showCardEffects ? "Masquer ce que font les cartes" : "Que font les cartes ?"}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 19, height: 19, flexShrink: 0, marginLeft: 2,
                      background: "transparent",
                      border: `1.5px solid ${showCardEffects ? T.you : T.rule}`,
                      borderRadius: 99, cursor: "pointer",
                      color: showCardEffects ? T.you : T.dim,
                      fontFamily: T.ui, fontWeight: 700, fontSize: ".7rem", lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    ?
                  </button>
                )}
                {/* Retour possible tant que le deplacement n'est pas consomme :
                    passer l'etape ne doit pas etre irreversible. */}
                {moveSkipped && canUseMovePassif(selectedTitan.id) && (
                  <button
                    onClick={() => setMoveSkipped(false)}
                    style={{ ...cancelBtn(), marginLeft: "auto" }}
                  >
                    <Icon name="move" size={12} /> Me déplacer finalement
                  </button>
                )}
              </div>
            )}


            {/* ── LES CARTES ATTENDENT QUE TOUT LE MONDE SOIT POSÉ ──
                Nikola, 2026-08-29 : « je ne peux pas choisir mes cartes avant
                mon placement initial, car là ça a créé un bug : je ne vois
                aucun Titan et pourtant ils jouent ».

                Le vrai verrou est dans le contrôleur (cf. `placementEnCours`),
                qui empêche désormais toute phase de s'enchaîner tant qu'un
                Titan attend sa case. Ce rappel-ci évite de laisser le choix des
                cartes ouvert par-dessus le bandeau de mise en place : on ne
                programme pas à l'aveugle un plateau dont on ne connaît pas
                encore les positions de départ — c'est précisément ce que
                l'ordre de pose est censé faire savoir. */}
            {phase === "programmation" && vm.decisionBloquante === "placement" && (
              <div style={{
                background: "rgba(255,217,61,.10)", border: "1px solid rgba(255,217,61,.35)",
                borderRadius: 8, padding: "8px 10px", fontSize: ".74rem", color: T.dim,
              }}>
                📍 Mise en place en cours — les cartes s'ouvrent quand les quatre
                Titans ont pris position.
              </div>
            )}

            {/* PHASE PROGRAMMATION */}
            {phase === "programmation" && vm.decisionBloquante !== "placement" && (
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
                      {progSelection.map(({ idx, cardId }) => (
                        <CardVisual key={`${cardId}-${idx}`} cardId={cardId} selected size="small"
                          accentColor={TITAN_COLORS[selectedTitan.id]?.accent}
                          onClick={() => toggleProgCard(idx, cardId)}
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
                    {/* Pourquoi la programmation précédente a échoué. Sans
                        ça, un refus vide la sélection et represente le même
                        panneau : le joueur reboucle sans savoir pourquoi
                        (bug remonté par Nikola le 2026-08-17 en début de
                        Manche 4). La raison est précise côté moteur, elle
                        n'était simplement affichée nulle part. */}
                    {vm.progErreur && (
                      <div style={{
                        background: "rgba(227,35,71,.16)", border: "1.5px solid #e32347",
                        borderRadius: 8, padding: "7px 10px", marginBottom: 7,
                        fontSize: ".72rem", color: "#ff8fa3",
                      }}>
                        ⚠️ La programmation précédente a été refusée : {vm.progErreur}
                        <button
                          onClick={() => vm.setProgErreur(null)}
                          style={{ ...cancelBtn(), marginLeft: 8, fontSize: ".66rem" }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: ".68rem", color: "rgba(255,255,255,.5)", marginBottom: 6 }}>
                      Sélectionne 3 cartes à programmer ({progSelection.length}/3) :
                    </div>
                    {/* TROIS PAR RANGÉE, QUOI QU'IL ARRIVE — Nikola, 2026-08-28 :
                        « là j'ai 2 colonnes de 3 cartes, avant j'avais 2 lignes de
                        3 cartes, je préfère ».

                        C'était un `flex-wrap` sur des cartes à largeur fixe : depuis
                        que la colonne de droite a rétréci au profit du plateau, la
                        troisième carte ne tenait plus et la main basculait en 3×2
                        au lieu de 2×3. Une grille à trois colonnes `1fr` ne peut
                        pas se replier : les cartes se resserrent, elles ne
                        changent pas de disposition. */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 5, marginBottom: 8, justifyItems: "center",
                    }}>
                      {/* CLE ET SELECTION PAR EXEMPLAIRE, PAS PAR TITRE.
                          Une main peut contenir deux fois le meme titre depuis
                          que le vol de Phase Repos transfere la carte au
                          voleur. Indexer sur `cardId` seul donnait deux <div>
                          de meme cle a React, et surtout marquait les DEUX
                          exemplaires des qu'on en cliquait un. La position en
                          main les distingue (Nikola, 2026-08-28 : « je dois
                          bien cliquer sur les 2 cartes »). */}
                      {selectedTitan.hand.map((cardId, idx) => (
                        <div key={`${cardId}-${idx}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "100%", minWidth: 0 }}>
                          <CardVisual
                            cardId={cardId}
                            selected={progSelection.some((sel) => sel.idx === idx)}
                            selectable={progSelection.length < 3 || progSelection.some((sel) => sel.idx === idx)}
                            onClick={() => toggleProgCard(idx, cardId)}
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
                    {/* Le sous-titre « Joue une carte (N restantes) » est retiré
                        (Nikola, 2026-08-29 : « on comprend visuellement qu'il
                        reste X cartes à jouer »). Il répétait le titre de
                        l'étape juste au-dessus, et son compteur ne disait rien
                        que les cartes posées là ne montrent déjà. */}
                    {/* Meme grille de trois que la programmation : « je préfère
                        même quand je dois jouer mes cartes ». */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 5, justifyItems: "center",
                    }}>
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
                            borderRadius: 10, padding: "4px", width: "100%", minWidth: 0,
                          }}>
                            <CardVisual
                              cardId={cardId}
                              selected={activeMode || pendingCardConfirm?.cardId === cardId}
                              selectable={canPlay}
                              accentColor={TITAN_COLORS[selectedTitan.id]?.accent}
                              onClick={() => {
                                if (!canPlay || animating) return;

                                /* ⚠️ UNE SEULE CARTE OUVERTE À LA FOIS.
                                   Bug remonté par Nikola le 2026-08-28 : « j'ai
                                   pu sélectionner Boing Boing ET Tout Casser,
                                   j'aurais pu jouer 2 cartes là ».

                                   Chaque carte ouvre son propre mode, et rien
                                   ne fermait les autres : avec Boing Boing en
                                   cours de tracé, cliquer Tout Casser lançait
                                   sa résolution différée SANS annuler le
                                   chemin — le joueur pouvait donc valider les
                                   deux dans le même round, alors qu'il n'a
                                   droit qu'à une carte par round.

                                   Cliquer une carte referme donc tout ce qui
                                   était ouvert. Recliquer la même la referme
                                   aussi, via son propre `toggle` juste en
                                   dessous : le geste reste réversible. */
                                if (cardId !== "tete_en_avant") setTeaMode(false);
                                if (cardId !== "boing_boing") { setBbMode(false); setBbPath([]); setBbSurvol([]); }
                                if (cardId !== "je_ne_partage_pas") { setJnpMode(false); setJnpSelected([]); }
                                if (cardId !== "graouhhh") setGraouMode(false);

                                /* ⚠️ DEUX CARTES POUVAIENT PARAÎTRE SÉLECTIONNÉES.
                                   Bug remonté par Nikola le 2026-08-29.

                                   La sélection avait DEUX sources : `activeMode`
                                   pour les cartes qui ouvrent un mode, et
                                   `pendingCardConfirm` pour celles à résolution
                                   différée. Le second était posé pour TOUTES les
                                   cartes et n'était effacé qu'au changement de
                                   tour : refermer une carte à mode la laissait
                                   donc allumée par `pendingCardConfirm`, et la
                                   suivante s'allumait à son tour par
                                   `activeMode`. Deux cartes en surbrillance pour
                                   un round qui n'en autorise qu'une.

                                   `pendingCardConfirm` ne sert qu'à combler les
                                   3 secondes d'attente des cartes à résolution
                                   différée, où rien d'autre ne bouge à l'écran.
                                   Il est donc réservé à celles-là, et remis à
                                   zéro pour les autres : une seule source de
                                   vérité par carte. */
                                const immediate = ["tout_casser","faut_pas_me_chauffer"];
                                setPendingCardConfirm(
                                  immediate.includes(cardId) ? { titanId: selectedTitan.id, cardId } : null
                                );
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
                            {canDiscardCard(cardId) && (
                              <button
                                onClick={() => {
                                  if (animating) return;
                                  setTeaMode(false); setBbMode(false); setBbPath([]); setJnpMode(false); setJnpSelected([]);
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
                      {selectedTitan.hand.map((cardId, idx) => (
                        <div key={`hand-${cardId}-${idx}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
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

            {/* Mode BB — chemin cliqué case par case (demande Nikola,
                2026-08-18 : « je dois indiquer par plusieurs clics mon
                chemin, pour que ce soit clair pour tout le monde »). Chaque
                clic sur une case adjacente à la pointe l'ajoute au chemin ;
                recliquer une case déjà posée y revient (annule ce qui suit).
                "Sauter !" valide la DERNIÈRE case du chemin comme
                atterrissage — désactivé sur un bâtiment encore debout,
                simple point de passage. */}
            {bbMode && (
              /* « SAUTER » ET « ANNULER » NE DOIVENT JAMAIS SORTIR DE L'ÉCRAN —
                 Nikola, 2026-08-28 : « quand j'ai la carte Sauter à jouer, le
                 panneau dépasse un peu vers le bas, "Sauter" et "Annuler" sont
                 rognés ».

                 Cette rangée s'ajoute SOUS la main de cartes, qui occupe déjà
                 toute la hauteur disponible : le chemin se trace en cliquant le
                 plateau, donc on ne pense pas à faire défiler le panneau, et les
                 deux seuls boutons qui terminent l'action passent sous la ligne
                 de flottaison. Ils se collent donc en bas : c'est le traitement
                 habituel d'une paire valider/annuler, et il ne coûte rien
                 puisque la rangée existait déjà. Le fond est opaque pour que les
                 cartes ne transparaissent pas dessous. */
              <div style={{
                display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap",
                position: "sticky", bottom: 0, zIndex: 3,
                background: T.plate, borderTop: `1px solid ${T.rule}`,
                paddingTop: 7, paddingBottom: 3, marginBottom: -3,
              }}>
                <span style={{ fontSize: ".75rem", color: "#FFD93D" }}>
                  {bbPath.length === 0
                    ? `Clique une case adjacente pour commencer ton chemin (budget ${bbMaxRange})`
                    : `Chemin : ${bbPath.join(" → ")} · ${bbBudgetUsed}/${bbMaxRange}`}
                </span>
                {bbDestIsBuilding && (
                  <span style={{ fontSize: ".72rem", color: "#FF2E63" }}>
                    Bâtiment encore debout — continue, tu ne peux pas y atterrir.
                  </span>
                )}
                {bbPath.length > 0 && (
                  <button onClick={bbUndoLastCell} style={cancelBtn()}>↩️ Annuler la dernière case</button>
                )}
                <button
                  onClick={jouerBoingBoing}
                  disabled={!bbDest || bbDestIsBuilding}
                  style={smallBtn(Boolean(bbDest) && !bbDestIsBuilding, "#16E08C", "#00C97A")}
                >
                  Sauter !
                </button>
                <button onClick={toggleBbMode} style={cancelBtn()}>Annuler</button>
              </div>
            )}

            {/* Mode JNP */}
            {jnpMode && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                {/* Ramassage séquentiel (ruling 2026-08-19) : chaque clic sur
                    une case ramasse pour de bon et déplace le Titan si la case
                    se vide. Il n'y a donc plus rien à « valider » — le compteur
                    dit où on en est, et « Terminer » ne sert qu'à clôturer une
                    carte qu'on ne peut plus finir faute de débris à portée. */}
                <span style={{ fontSize: ".75rem", color: "#71dbff" }}>
                  {jnpSelected.length}/{jnpNbToPick} ramassé{jnpSelected.length > 1 ? "s" : ""}{jnpNbToPick === 3 ? " (🏆 Lanterne Rouge)" : ""}
                </span>
                <span style={{ fontSize: ".7rem", color: "#8fa6b8" }}>
                  Clique une case : le ramassage est immédiat, la portée se recalcule depuis ta nouvelle position.
                </span>
                <button
                  onClick={jouerJeNePartagePas}
                  disabled={jnpSelected.length === 0}
                  style={smallBtn(jnpSelected.length > 0, "#16E08C", "#00C97A")}
                >Terminer</button>
                <button onClick={toggleJnpMode} style={cancelBtn()} disabled={jnpSelected.length > 0}>Annuler</button>
              </div>
            )}

          </div>
          )} {/* fin guard cartes IA */}

          {/* ── VALIDATION DE PHASE ──
              Fusionnee dans l'en-tete le 2026-08-19 (point 4.6). Le bloc qui
              vivait ici repetait le nom de la phase et l'etat de validation
              deja affiches en haut de page, et posait son bouton loin des
              coches qu'il modifie. Il est desormais a cote d'elles, dans
              HeaderPhase.

              Rappel de ce qui n'a pas change : la Phase Repos se resout par
              sa banniere de vol, et la Phase Action se valide toute seule via
              `advanceActionRound` des que les 3 rounds sont joues. Aucune de
              ces deux phases n'a jamais eu de bouton ici. */}
        </div>
      )}

  </>;
}
