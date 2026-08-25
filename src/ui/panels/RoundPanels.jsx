import React, { Suspense, lazy } from "react";
// La vue 3D tire tout Three.js (~500 kB). Elle n'est montée que si `show3D`
// est actif, donc on la charge à la demande : une partie jouée en 2D ne
// télécharge jamais Three.js. Aucun changement de rendu, seul le moment du
// téléchargement bouge.
const Board3D = lazy(() => import("../board3d/Board3D.jsx"));
import BlockStockBar from "../cards/BlockStockBar.jsx";
import TitanResourceBand from "../titans/TitanResourceBand.jsx";
import { TitanIcon, TitanBadge } from "../titans/TitanVisuals.jsx";
import { COLOR_HEX, ROWS, isBuildingCell, isSocleMarker, socleValue } from "../../domain/index.js";
import { BLOCK_NAME } from "../blockNames.js";
import { btnStyle, cancelBtn } from "../styles.js";
import BlockIcon from "../BlockIcon.jsx";
import { T, readout } from "../theme.js";

/* ── LE SOL DE BIG CITY ────────────────────────────────────
   Un seul matériau pour la rue et pour la parcelle rasée : c'est le même sol,
   vu au même endroit. La parcelle est à peine plus claire que la rue, juste
   assez pour qu'on lise encore la trame des îlots sans que la ville se
   fracture en damier. */
const SOL_RUE = "rgba(255,250,238,.075)";
const SOL_PARCELLE = "rgba(255,250,238,.115)";

/* Les bâtiments sont assombris de 20 % (demande de Nikola). Ils gardent leur
   couleur de bloc — c'est une donnée de jeu — mais cessent de vibrer sur le
   sol clair, et les chiffres blancs de Socle redeviennent lisibles dessus. */
function assombrir(hex, facteur = 0.8) {
  if (!hex || hex[0] !== "#" || hex.length !== 7) return hex;
  const c = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * facteur);
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(c(1))}${h(c(3))}${h(c(5))}`;
}

export default function RoundPanels({ vm }) {
  // Bug remonté : quand une case cumule 2 débris DIFFÉRENTS (ex. bloc rose
  // + socle, ou bloc bleu + bloc rouge), cliquer "Ramasser" prenait
  // toujours le dernier empilé sans jamais laisser le joueur choisir.
  // recupChoiceCell mémorise la case en attente de choix (popup rendu plus
  // bas, juste après la grille) ; nul tant qu'aucun choix n'est nécessaire.
  const [recupChoiceCell, setRecupChoiceCell] = React.useState(null);
  // Composition d'un batiment : elle ne tient pas dans une case de 30px, et
  // un panneau pose EN ABSOLU dans la case etait tronque par le defilement
  // horizontal de la grille (overflowX: auto). Il est donc rendu en position
  // fixe, au-dessus de tout, avec les coordonnees de la case cliquee.
  const [hoverCell, setHoverCell] = React.useState(null);
  const [hoverPos, setHoverPos] = React.useState(null);
  /* Comment la fiche a ete ouverte : "clic" ou "survol".

     Demande de Nikola du 2026-08-19 : « corrige le hover sur batiment et
     remplace le visuel par celui du clic sur batiment ». Le survol affichait
     l'infobulle NATIVE du navigateur (`title`) : rectangle gris, police
     systeme, delai d'apparition, aucun rapport avec la charte du jeu ni avec
     la fiche montree au clic. Deux visuels pour la meme information.

     Le survol ouvre desormais exactement la meme fiche. Seule difference, et
     elle est necessaire : ouverte au clic, la fiche pose un voile plein ecran
     qui la referme au clic suivant ; ouverte au survol, elle se referme quand
     le pointeur quitte la case et ne pose aucun voile, sans quoi le plateau
     deviendrait injouable a la souris. */
  const [hoverSource, setHoverSource] = React.useState(null);
  /* Une seconde d'arret volontaire avant que la fiche d'un batiment ne
     s'ouvre au survol (Nikola : 2s etait trop long). Le minuteur vit dans
     une ref : le redemarrer ne doit pas provoquer de rendu. */
  const DELAI_SURVOL_MS = 1000;
  const survolTimerRef = React.useRef(null);
  const annulerAttenteSurvol = React.useCallback(() => {
    if (survolTimerRef.current) {
      clearTimeout(survolTimerRef.current);
      survolTimerRef.current = null;
    }
  }, []);
  // Un minuteur en cours ne doit jamais survivre au demontage du plateau.
  React.useEffect(() => annulerAttenteSurvol, [annulerAttenteSurvol]);
  const openComposition = (key, el, source = "clic") => {
    if (source === "clic") annulerAttenteSurvol();
    // Recliquer la meme case referme ; le survol, lui, ne bascule pas.
    if (hoverCell === key && source === "clic") {
      setHoverCell(null); setHoverPos(null); setHoverSource(null); return;
    }
    setHoverSource(source);
    /* Point 4.2 du 2026-08-19. L'ouverture au clic existait deja en 2D, mais
       la 3D ne passe aucun element DOM : la fiche ne s'ouvrait donc jamais
       depuis le plateau 3D, alors que c'est le meme aiguilleur de clic. Sans
       element, on affiche la fiche au centre de l'ecran. */
    if (!el) {
      setHoverPos({ x: window.innerWidth / 2, y: Math.round(window.innerHeight * 0.35) });
      setHoverCell(key);
      return;
    }
    const r = el.getBoundingClientRect();
    setHoverPos({ x: r.left + r.width / 2, y: r.top });
    setHoverCell(key);
  };
  const {
    manchesMaxPartie,
    titansEnAttente,
    ecroulement,
    ecroulementCells,
    currentRepli,
    choisirRepli,
    ecroulementPoserDebris,
    ecroulementAnnulerDernier,
    ecroulementValider,
    state,
    titanState,
    mancheNumber,
    activePlayerId,
    titanModes,
    titanDisplayName,
    phase,
    show3D,
    apocalypseThreshold,
    selectedTitanId,
    setSelectedTitanId,
    titansByCell,
    titanCorners,
    looseBlocks,
    teaMode,
    jnpMode,
    jnpSelected,
    bbMode,
    bbDest,
    bbPath,
    bbMaxRange,
    bbNextClickable,
    bbDestIsBuilding,
    moveMode,
    recupMode,
    traceVol,
    waitingNextTitan,
    titanProfiles,
    profilsReveles,
    revelerProfil,
    profileLabel,
    teaTargets,
    jouerTeteEnAvant,
    bbReachable,
    bbPathClick,
    moveReachable,
    moveClassic,
    moveTeleport,
    jouerMouvementGratuit,
    recupPool,
    jouerRecuperation,
    jnpPool,
    jnpToggleCell,
    boardSignature3D,
    perimeterKeys,
    energie,
    occupiedCount,
    tcSel,
  } = vm;

  /* ── UN SEUL AIGUILLEUR DE CLIC POUR LES DEUX VUES ──
     Il vivait en JSX, à l'intérieur du `onClick` d'une case de la grille 2D.
     La vue 3D ne pouvait donc pas s'en servir, et c'est exactement ce qui la
     réduisait à une visualisation (demande de Nikola du 2026-08-18 : « le
     clic sur les cases en 3D »). Le recopier là-bas aurait créé deux
     comportements à maintenir en parallèle — le motif que tout ce fichier
     essaie d'éviter.

     Il est donc extrait ici, tel quel, et les deux plateaux l'appellent avec
     une clé de case. L'ORDRE DES TESTS est la règle et ne doit pas bouger :
     une décision en attente capte le plateau entier, puis les modes de
     carte, puis le ramassage, et seulement à défaut la consultation d'un
     bâtiment ou la sélection d'un Titan.

     `el` est l'élément DOM cliqué, dont la composition d'un bâtiment tire sa
     position à l'écran. La 3D n'en a pas : elle passe null, et ce seul
     affichage-là reste propre à la 2D. */
  /* Ordre d'initiative REEL de la Manche : l'ordre de jeu pivote sur le
     Detonateur, qui ouvre chaque round (cf. `advanceActionRound`). C'est lui
     que le panneau de stock affiche, pas l'ordre fige de la partie. */
  const ordreInitiative = (() => {
    const ordre = titanState?.ordreJeu ?? [];
    const depart = ordre.indexOf(titanState?.detonateur);
    if (depart <= 0) return ordre;
    return [...ordre.slice(depart), ...ordre.slice(0, depart)];
  })();

  const clicCase = (key, el = null) => {
    /* Partie finie : le plateau reste CONSULTABLE mais ne se joue plus
       (point 4.4 du 2026-08-19). On saute tous les modes d'action et on ne
       garde que la fiche d'un bâtiment et la sélection d'un Titan, qui sont
       de la lecture. */
    if (vm.gameOver) {
      const fin = state.board[key];
      if (fin && fin.blocks.length > 0) { openComposition(key, el); return; }
      if (titansByCell[key]) setSelectedTitanId(titansByCell[key]);
      return;
    }
    // DIL/RAGE et Faut Pas Me Chauffer se tranchent dans leur bandeau dédié,
    // jamais par un clic sur une case : sans cette garde, cliquer le plateau
    // pendant qu'une décision de ce type attend (sur MOI ou sur un AUTRE
    // Titan) pouvait changer la sélection ou déclencher un mode de carte
    // avant que la décision ne soit tranchée — l'attaquant perdait alors la
    // fenêtre pour récupérer son bloc au tour (demande de Nikola).
    if (vm.decisionBloquante === "dil" || vm.decisionBloquante === "fpmc") return;
    if (currentRepli) { if (currentRepli.cases.includes(key)) choisirRepli(key); return; }
    if (ecroulement) { if (ecroulementCells.includes(key)) ecroulementPoserDebris(key); return; }
    if (jnpMode) { if (jnpPool.has(key)) jnpToggleCell(key); return; }
    if (bbMode) { bbPathClick(key); return; }
    if (teaMode) { if (teaTargets.has(key)) jouerTeteEnAvant(key); return; }
    if (moveMode) { if (moveReachable.has(key)) jouerMouvementGratuit(key); return; }
    if (recupMode) {
      if (recupPool.has(key)) {
        const distinct = [...new Set(looseBlocks[key] || [])];
        // Plusieurs débris DIFFÉRENTS sur la case : le livret laisse le choix,
        // on ouvre le popup au lieu de prendre le dernier empilé.
        if (distinct.length > 1) setRecupChoiceCell(key);
        else jouerRecuperation(key);
      }
      return;
    }
    const cellData = state.board[key];
    if (cellData && cellData.blocks.length > 0) { openComposition(key, el); return; }
    if (titansByCell[key]) setSelectedTitanId(titansByCell[key]);
  };

  /* Les cases que le plateau 3D doit allumer, avec leur couleur. Mêmes
     ensembles que ceux qui peignent la grille 2D juste en dessous : ce que
     le joueur voit en 3D ne peut pas diverger de ce que le moteur accepte. */
  const cellulesActives = (() => {
    const out = [];
    const add = (key, couleur, opacite) => out.push({ key, couleur, opacite });
    /* La trace de vol se dessine dans les DEUX vues : elle est ajoutee en
       PREMIER pour que les cases d'action, ajoutees ensuite, restent visibles
       par-dessus si les deux se superposent. */
    if (traceVol && traceVol.length > 0) traceVol.forEach((k) => add(k, 0xffd93d, 0.7));
    if (currentRepli) {
      currentRepli.cases.forEach((k) =>
        add(k, 0xfb923c, k === currentRepli.defaut ? 0.75 : 0.45));
    } else if (ecroulement) {
      ecroulementCells.forEach((k) => add(k, 0xfb923c, 0.5));
    } else if (jnpMode) {
      jnpPool.forEach((k) => add(k, 0x16e08c, jnpSelected.includes(k) ? 0.8 : 0.4));
    } else if (bbMode) {
      // Chemin cliqué case par case (demande Nikola, 2026-08-18) : la zone
      // théorique reste visible en fond très pâle, les cases déjà posées
      // dans le chemin ressortent, la pointe actuelle (bbDest) le plus, et
      // les voisines cliquables ensuite ont leur propre teinte pour inviter
      // le prochain clic — plus un seul "un clic = arrivée".
      bbReachable.forEach((k) => { if (!bbPath.includes(k)) add(k, 0x16e08c, 0.12); });
      bbNextClickable.forEach((k) => { if (!bbPath.includes(k)) add(k, 0x16e08c, 0.45); });
      bbPath.forEach((k) => add(k, 0x16e08c, k === bbDest ? 0.85 : 0.6));
    } else if (teaMode) {
      teaTargets.forEach((_, k) => add(k, 0xfb923c, 0.55));
    } else if (moveMode) {
      moveClassic.forEach((k) => add(k, 0x71dbff, 0.55));
      moveTeleport.forEach((k) => { if (!moveClassic.has(k)) add(k, 0xb88cff, 0.38); });
    } else if (recupMode) {
      recupPool.forEach((k) => add(k, 0xffd93d, 0.5));
    }
    return out;
  })();

  return <>
      {/* Le banner "Vol en chaîne / Phase Repos" a été extrait dans
          RepoVolBanner.jsx et remonté juste sous DilRageBanner dans
          GameView.jsx (refonte UI façon DIL/RAGE — décision bloquante,
          doit avoir le même traitement visuel et la même position
          qu'une autre décision bloquante du jeu). Voir GameView.jsx. */}


      {/* ── VUE 3D ── */}
      {show3D && (
        <div style={{ marginBottom: 14 }}>
          <Suspense fallback={
            <div style={{ padding: "28px 0", textAlign: "center", fontSize: ".68rem", color: "rgba(255,255,255,.35)" }}>
              Chargement de la vue 3D…
            </div>
          }>
            <Board3D
              board={state.board}
              looseBlocks={looseBlocks}
              titans={titanState.players}
              boardVersion={boardSignature3D}
              selectedTitanId={selectedTitanId}
              onSelectTitan={setSelectedTitanId}
              cellulesActives={cellulesActives}
              onCellClick={clicCase}
            />
          </Suspense>
          <div style={{ fontSize: ".7rem", color: "rgba(255,255,255,.45)", textAlign: "center", marginTop: 6 }}>
            Clique une case pour jouer · glisse pour tourner · molette pour zoomer
          </div>
        </div>
      )}


      {/* ── BANDEAU RESSOURCES TITANS ── */}
      <TitanResourceBand
        titans={titanState.players}
        selectedTitanId={selectedTitanId}
        onSelect={setSelectedTitanId}
        activePlayerId={activePlayerId}
        phase={phase}
        titanDisplayName={titanDisplayName}
        titanModes={titanModes}
        titanProfiles={titanProfiles}
        profilsReveles={profilsReveles}
        revelerProfil={revelerProfil}
        profileLabel={profileLabel}
        waitingNextTitan={waitingNextTitan}
        titansEnAttente={titansEnAttente}
        rainbowWinnerId={vm.rainbowWinnerId}
        phaseValidated={vm.phaseValidated}
        detonateurId={titanState.detonateur}
        validatePhase={vm.validatePhase}
        canValidatePhase={vm.canValidatePhase}
        getPhaseBlockReason={vm.getPhaseBlockReason}
      />


      {/* ── STOCK BLOCS ── */}
      <BlockStockBar
        board={state.board}
        looseBlocks={looseBlocks}
        mancheNumber={mancheNumber}
        totalManches={manchesMaxPartie}
        detonateurName={titanDisplayName(titanState.detonateur)}
        occupiedCount={occupiedCount}
        apocalypseThreshold={apocalypseThreshold}
        ordreInitiative={ordreInitiative}
        phaseValidated={vm.phaseValidated}
        titanModes={titanModes}
        detonateurId={titanState.detonateur}
        titanDisplayName={titanDisplayName}
      />


      {/* ── RÉPARTITION D'UN AMAS ÉCROULÉ ──
          Boing Boing sur un tas : le joueur place les débris un par un, et
          chacun fait son effet avant le suivant. */}
      {/* Une seule décision à l'écran : la répartition attend son tour
          derrière un Dilemme ou un repli non tranché (cf. decisionBloquante
          dans le contrôleur, demande Nikola du 2026-08-18). */}
      {ecroulement && vm.decisionBloquante === "ecroulement" && (
        <div style={{
          background: "rgba(251,146,60,.14)", border: "1.5px solid #fb923c",
          borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: ".8rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ color: "#ffb877", fontFamily: "'Bowlby One', sans-serif" }}>
              🧱 Écroulement de l'Amas
            </strong>
            <span style={{ color: "rgba(255,255,255,.75)" }}>
              Débris {Math.min(ecroulement.choix.length + 1, ecroulement.blocs.length)} sur {ecroulement.blocs.length} :
              clique la case où il tombe.
            </span>
          </div>
          <div style={{ marginTop: 6, color: "rgba(255,255,255,.6)", fontSize: ".74rem" }}>
            Un débris qui tombe sur un Titan le pousse de {ecroulement.energie} case(s) et te rapporte la Bagarre.
            {ecroulementCells.length > 0 && ecroulement.choix.length < ecroulement.blocs.length
              && " Les cases déjà servies ne sont proposées que s'il n'en reste plus de vierge."}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {ecroulement.choix.length > 0 && (
              <button onClick={ecroulementAnnulerDernier} style={btnStyle()}>↩️ Annuler le dernier</button>
            )}
            {ecroulement.choix.length === ecroulement.blocs.length && (
              <button onClick={ecroulementValider} style={btnStyle("#16E08C", "#00C97A", true)}>
                ✅ Valider l'écroulement
              </button>
            )}
            {/* Sortie de secours. Sans elle, un Amas cerné de bâtiments
                encore debout n'offre aucune case cliquable, « Valider »
                reste masqué tant que tous les débris ne sont pas placés et
                « Annuler le dernier » tant qu'aucun ne l'est : plus rien à
                l'écran, partie bloquée pour de bon. Ce bouton n'apparaît
                jamais tant qu'il existe une case où poser un débris. */}
            {ecroulementCells.length === 0 && ecroulement.choix.length < ecroulement.blocs.length && (
              <button onClick={vm.ecroulementAbandonner} style={btnStyle("#fb923c", "#c2410c", true)}>
                🚧 Aucune case libre autour — laisser les débris sur l'Amas
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── GRILLE 9×9 ──
          La 2D et la 3D ne coexistent plus : afficher les deux allongeait la
          page d'un ecran entier et obligeait a faire defiler entre la vue et
          les controles. Le bouton Vue 3D bascule de l'une a l'autre. */}
      {!show3D && (() => {
        /* GOUTTIÈRES HORS PLATEAU
           Un Titan éjecté attend DEHORS, aligné avec la case par laquelle il
           rentrera (demande de Nikola). La grille gagne donc une piste de
           chaque côté, en dehors du 9×9, où l'on pose son icône en
           translucide. Elles restent vides tant que personne n'est sorti. */
        const attenteParCase = {};
        (titansEnAttente || []).forEach((t) => { attenteParCase[t.cell] = t; });
        /* UN TITAN N'ATTEND QUE DANS UNE SEULE GOUTTIÈRE.
           Les quatre pistes se recoupent aux coins : A1 appartient à la fois
           à la gouttière haute (colonne 1) et à celle de gauche (ligne A).
           Le même Titan s'y affichait donc en double. C'était rare tant
           qu'on ne sortait que par un bord droit ; depuis la règle du
           miroir du 2026-08-18, une poussée en diagonale renvoie
           précisément sur un coin, et le cas est devenu courant.

           La piste retenue est celle par laquelle il rentrera vraiment :
           `rentrerEnJeu` fait longer la COLONNE en priorité quand la case
           est sur une colonne de bord, l'affichage suit la même règle. */
        const zoneDe = (cle) => {
          const col = Number(cle.slice(1));
          if (col === 1) return "gauche";
          if (col === 9) return "droite";
          return cle[0] === "A" ? "haut" : "bas";
        };
        const Gouttiere = ({ cle, zone }) => {
          const t = attenteParCase[cle];
          if (!t || zoneDe(cle) !== zone) return <div />;
          return (
            <div
              title={`${titanDisplayName(t.id)} attend hors de BIG CITY — rentre par ${cle} au début de son tour`}
              style={{ display: "grid", placeItems: "center", opacity: 0.5 }}
            >
              <TitanIcon titanId={t.id} size={26} />
            </div>
          );
        };
        /* PLATEAU CARRÉ (demande de Nikola, 2026-08-17 : « rends les cases du
           plateau 2D plus carrées pour une meilleure lisibilité »).

           Les colonnes étaient en `1fr` et s'étiraient donc jusqu'à ~80 px sur
           un écran large, pendant que la hauteur restait figée à 30 px : le
           9×9 se lisait comme une grille d'aplats très plats, où les icônes de
           blocs et les badges de Titan se noyaient. Chaque case tient
           désormais sa hauteur de sa largeur (`aspectRatio`), et la grille est
           bornée pour que la case ne dépasse pas ~52 px — au-delà, le plateau
           repousse les contrôles hors de l'écran sur une tablette. */
        return (
      <div className="titan-grid" style={{
        display: "grid",
        gridTemplateColumns: "24px 18px repeat(9, minmax(30px, 1fr)) 24px",
        gridAutoRows: "auto",
        gridTemplateRows: "18px 24px repeat(9, auto) 24px",
        gap: 2, marginBottom: 14,
        maxWidth: 24 + 18 + 24 + 9 * 52 + 12 * 2,
        marginLeft: "auto", marginRight: "auto",
        overflowX: "auto",
      }}>
        {/* Ligne des numéros de colonne */}
        <div /><div />
        {[1,2,3,4,5,6,7,8,9].map((c) => (
          <div key={c} style={{ display: "grid", placeItems: "center", ...readout("0.62rem", T.dim) }}>{c}</div>
        ))}
        <div />
        {/* Gouttière haute : attente au-dessus de la ligne A */}
        <div /><div />
        {[1,2,3,4,5,6,7,8,9].map((c) => <Gouttiere key={`haut${c}`} cle={`A${c}`} zone="haut" />)}
        <div />
        {ROWS.map((r) => (
          <React.Fragment key={r}>
            <Gouttiere cle={`${r}1`} zone="gauche" />
            <div style={{ display: "grid", placeItems: "center", ...readout("0.62rem", T.dim) }}>{r}</div>
            {[1,2,3,4,5,6,7,8,9].map((c) => {
              const key = r + c;
              const titan = titanCorners[key];
              const cellData = state.board[key];
              const isBldg = isBuildingCell(r, c);
              const topBlock = cellData && cellData.blocks.length > 0 ? cellData.blocks[cellData.blocks.length - 1] : null;
              const inPerimeter = perimeterKeys.has(key);
              /* NUMERO DE SAUT (Nikola, 2026-08-19) : « indique un chiffre pour
                 chaque case que je clique 1 2 3, pense a rajouter un chiffre si
                 j'utilise de l'Adrenaline, et apres que la carte soit utilisee
                 enleve les chiffres du saut ».

                 `bbPath` ne contient que les ATTERRISSAGES depuis la refonte du
                 meme jour : son index + 1 est donc exactement le numero du saut,
                 Adrenaline comprise puisqu'elle allonge la portee et donc le
                 nombre de sauts possibles. Les chiffres disparaissent tout seuls
                 avec `bbMode`, remis a false des que la carte est jouee. */
              const bbNumeroSaut = bbMode ? bbPath.indexOf(key) + 1 : 0;
              const jnpSelectable = jnpMode && jnpPool.has(key);
              const jnpIsSelected = jnpMode && jnpSelected.includes(key);
              /* Boing Boing : chemin cliqué case par case (demande Nikola,
                 2026-08-18). `bbPath` est la trajectoire déjà tracée,
                 `bbNextClickable` les voisines directes de sa pointe encore
                 dans le budget, `bbReachable` la zone théorique complète
                 (simple fond, plus la seule source de vérité du clic). La
                 pointe (bbDest) reste cliquable comme n'importe quelle case
                 du chemin — un Titan dessus est une cible légitime (DIL,
                 projection, +1 Bagarre, livret carte 04) — mais ne peut pas
                 être VALIDÉE comme arrivée si c'est un bâtiment encore
                 debout (bbDestIsBuilding) : le chemin doit continuer. */
              const bbInPath = bbMode && bbPath.includes(key);
              const bbIsTip = bbMode && bbDest === key;
              const bbBloquee = bbIsTip && bbDestIsBuilding;
              const bbNextSelectable = bbMode && !bbInPath && bbNextClickable.has(key);
              const bbFaintReach = bbMode && !bbInPath && !bbNextSelectable && bbReachable.has(key);
              const bbSelectable = bbNextSelectable;
              const bbIsSelected = bbInPath && !bbBloquee;
              const moveSelectable = moveMode && moveReachable.has(key);
              const moveIsClassic = moveMode && moveClassic.has(key); // accessible sans téléporteur
              const moveIsTeleport = moveMode && !moveClassic.has(key) && moveTeleport.has(key); // téléporteur uniquement
              const recupSelectable = recupMode && recupPool.has(key);
              const teaSelectable = teaMode && teaTargets.has(key);
              // Répartition des débris d'un Amas écroulé : les cases encore
              // proposées pour le prochain débris.
              const ecroulSelectable = Boolean(ecroulement) && ecroulementCells.includes(key);
              const ecroulDejaServie = Boolean(ecroulement) && ecroulement.choix.includes(key);
              // Repli d'un élément arrêté faute de puissance : les cases où
              // le Titan initiateur peut le poser (ruling du 2026-08-17).
              const repliSelectable = Boolean(currentRepli) && currentRepli.cases.includes(key);
              const repliDefaut = Boolean(currentRepli) && currentRepli.defaut === key;
              const repliCible = Boolean(currentRepli) && currentRepli.cible === key;

              // Périmètre 2D : couleur du Titan sélectionné
              const perimAccent = tcSel ? tcSel.accent : "#FFD93D";
              // Fond de la case dans le périmètre :
              // bâtiment → teinte du Titan en overlay sur la couleur du bloc du dessus
              // case vide → teinte légère
              /* TRACE DE VOL (Nikola, 2026-08-24). Les cases que l'element
                 vient de traverser, rejouees case par case juste apres la
                 resolution. Testee en premier : c'est un evenement bref, il
                 doit passer par-dessus les surlignages permanents, sinon il
                 disparait derriere le perimetre du Titan actif. */
              const dansLaTrace = traceVol && traceVol.includes(key);

              let cellBg;
              if (dansLaTrace) {
                cellBg = "rgba(255,217,61,.45)"; // jaune vif, le temps du vol
              } else if (repliCible) {
                cellBg = "rgba(239,68,68,.22)"; // la case qu'il n'a pas pu atteindre
              } else if (repliDefaut) {
                cellBg = "rgba(251,146,60,.34)"; // là où il se poserait sans choix
              } else if (repliSelectable) {
                cellBg = "rgba(251,146,60,.18)";
              } else if (ecroulDejaServie) {
                cellBg = "rgba(251,146,60,.32)"; // débris déjà posé là
              } else if (ecroulSelectable) {
                cellBg = "rgba(251,146,60,.16)"; // case proposée pour le prochain
              } else if (jnpIsSelected || bbIsSelected) {
                cellBg = "rgba(22,224,140,.25)";
              } else if (teaSelectable) {
                cellBg = "rgba(251,146,60,.25)"; // orange TEA
              } else if (moveIsClassic) {
                cellBg = "rgba(113,219,255,.25)"; // classique : +10% opacité (0.25 vs 0.15)
              } else if (moveIsTeleport) {
                cellBg = "rgba(113,219,255,.15)"; // téléporteur : plus transparent
              } else if (recupSelectable) {
                cellBg = "rgba(255,217,61,.15)";
              } else if (bbBloquee) {
                cellBg = "rgba(239,68,68,.16)";
              } else if (jnpSelectable || bbSelectable) {
                cellBg = "rgba(22,224,140,.12)";
              } else if (bbFaintReach) {
                cellBg = "rgba(22,224,140,.05)"; // zone théorique, pas encore cliquable
              } else if (inPerimeter) {
                if (isBldg && topBlock) {
                  // Bâtiment dans le périmètre : couleur du bloc seule, sans
                  // overlay Titan — assombrie comme partout ailleurs.
                  cellBg = assombrir(COLOR_HEX[topBlock]);
                } else if (isBldg) {
                  cellBg = `${perimAccent}22`;
                } else {
                  cellBg = `${perimAccent}18`;
                }
              } else if (isBldg) {
                // Une parcelle de bâtiment vidée reste une PARCELLE : elle ne
                // doit pas se confondre avec la rue, sinon on ne voit plus la
                // trame de la ville et on perd le repère du Périmètre.
                cellBg = topBlock ? assombrir(COLOR_HEX[topBlock]) : SOL_PARCELLE;
              } else {
                /* LA RUE PREND LE MÊME SOL QUE LES PARCELLES.
                   Elle avait d'abord été creusée à `rgba(0,0,0,.42)` pour
                   détacher la ville du fond. Retour de Nikola : « les tuiles
                   où il n'y a pas de bâtiment sont beaucoup trop sombres,
                   repars sur celle sous les bâtiments pour la couleur ». Le
                   sol de BIG CITY est donc UN seul matériau, celui qu'on voit
                   sous un bâtiment rasé, et ce sont les bâtiments — assombris
                   de 20 % — qui portent seuls le contraste. */
                cellBg = SOL_RUE;
              }

              // Cases sur lesquelles un clic declenche une ACTION (selectionner
              // un Titan n'en est pas une).
              const estActionnable = repliSelectable || jnpSelectable || bbSelectable
                || teaSelectable || moveSelectable || recupSelectable || ecroulSelectable;

              return (
                <div
                  key={key}

                  // Aiguillage commun aux vues 2D et 3D (cf. `clicCase` en
                  // tête de composant) : une seule description de ce que
                  // « cliquer une case » veut dire, quelle que soit la vue.
                  onClick={(e) => clicCase(key, e.currentTarget)}
                  // Les icones empilees dans une case de 30px etaient
                  // illisibles. La composition exacte passe dans l'infobulle,
                  // du haut vers le bas, et la case garde des reperes
                  // d'etages discrets sur son bord gauche.
                  title={bbBloquee
                    ? `${key} — bâtiment encore debout, tu peux passer par-dessus mais pas y atterrir : continue ton chemin`
                    : bbInPath
                    ? `${key} — déjà dans ton chemin, reclique ici pour revenir à ce point`
                    : bbSelectable && titansByCell[key]
                    ? `${key} — sauter sur ce Titan : Dilemme, projection et +1 Bagarre`
                    : bbSelectable
                    ? `${key} — case suivante possible`
                    : cellData && cellData.blocks.length > 0
                    /* Pas de `title` natif sur un batiment debout : sa
                       composition s'affiche dans la fiche du jeu, au survol
                       comme au clic. Laisser les deux faisait apparaitre
                       l'infobulle grise du systeme par-dessus la fiche. */
                    ? undefined
                    : cellData
                    ? `${key} · couloir · socle ${cellData.socle}`
                    : key}
                  onMouseEnter={(e) => {
                    /* SURVOL TEMPORISE (Nikola, 2026-08-19) : « je souhaite la
                       fonction qu'il faut rester 2 sec dessus pour avoir le
                       detail du batiment ».

                       Sans delai, la fiche s'ouvrait au moindre passage de
                       souris sur le plateau et clignotait sans arret pendant
                       qu'on cherchait sa case. Deux secondes, c'est le temps
                       d'un arret volontaire : on ne l'obtient pas par accident,
                       et le clic reste la voie immediate pour qui la veut tout
                       de suite. */
                    if (!cellData || cellData.blocks.length === 0) return;
                    const cible = e.currentTarget;
                    annulerAttenteSurvol();
                    survolTimerRef.current = setTimeout(() => {
                      openComposition(key, cible, "survol");
                    }, DELAI_SURVOL_MS);
                  }}
                  onMouseLeave={() => {
                    annulerAttenteSurvol();
                    // Une fiche ouverte au CLIC reste ouverte : elle a ete demandee.
                    if (hoverSource === "survol" && hoverCell === key) {
                      setHoverCell(null); setHoverPos(null); setHoverSource(null);
                    }
                  }}
                  style={{
                    // `aspectRatio` : la case prend sa hauteur de sa largeur
                    // réelle, elle reste carrée quelle que soit la taille de
                    // l'écran. `height: 30` la figeait en rectangle plat.
                    // `minWidth: 0` : c'est la piste de la grille qui fixe le
                    // plancher (minmax), pas la case. Un minimum posé ici
                    // empêchait la case de suivre une colonne plus étroite sur
                    // téléphone et débordait la grille.
                    // Arête dure : le monde de la borne n'a pas de coin
                    // arrondi à 4 px, et une grille de 81 cases arrondies se
                    // lit comme une planche de pastilles.
                    minWidth: 0, aspectRatio: "1 / 1", borderRadius: 1, position: "relative",
                    /* PULSATION DES CASES D'ACTION (Nikola, 2026-08-24, « on
                       teste mais pas sûr »). Volontairement TRES discrete :
                       2,4 s par cycle et 6 % d'amplitude, la ou une pulsation
                       marquee fatiguerait l'oeil sur une partie d'1 h 30 —
                       c'est exactement le motif pour lequel l'ancienne
                       animation "titanPulse" avait ete retiree. Elle ne touche
                       QUE les cases cliquables, jamais le perimetre.

                       Pour la retirer : supprimer cette ligne et le bloc
                       "@keyframes pulseAction" en bas du composant. */
                    animation: estActionnable ? "pulseAction 2.4s ease-in-out infinite" : undefined,
                    zIndex: hoverCell === key ? 55 : undefined,
                    cursor: repliSelectable || jnpSelectable || bbSelectable || bbInPath || teaSelectable || moveSelectable || recupSelectable || titansByCell[key] ? "pointer" : "default",
                    background: cellBg,
                    border: repliSelectable
                      ? `2px ${repliDefaut ? "solid" : "dashed"} #fb923c`
                      : jnpIsSelected || bbIsSelected
                      ? "2px solid #16E08C"
                      : teaSelectable
                      ? "2px solid #FB923C"           // orange TEA
                      : moveIsClassic
                      ? "2px solid #71dbff"
                      : moveIsTeleport
                      ? "2px dashed #b88cff"
                      : recupSelectable
                      ? "2px dashed #FFD93D"
                      : jnpSelectable || bbSelectable
                      ? "2px dashed #16E08C"
                      : inPerimeter
                      ? `2px solid ${perimAccent}`
                      : isBldg
                      ? "1px solid rgba(255,255,255,.12)"
                      : "1px solid rgba(255,255,255,.14)",
                    boxShadow: repliSelectable
                      ? "0 0 10px rgba(251,146,60,.85)"
                      : teaSelectable
                      ? "0 0 10px rgba(251,146,60,.8)"
                      : moveIsClassic
                      ? "0 0 10px rgba(113,219,255,.7)"
                      : moveIsTeleport
                      ? "0 0 8px rgba(184,140,255,.6)"
                      : recupSelectable
                      ? "0 0 6px rgba(255,217,61,.5)"
                      : inPerimeter
                      ? `0 0 10px ${perimAccent}88, 0 0 3px ${perimAccent}`
                      : "none",
                    transition: "box-shadow .1s, background .1s",
                  }}
                >
                  {isBldg && cellData && cellData.blocks.length > 0 && (
                    <span style={{ position: "absolute", bottom: 2, right: 3, fontSize: ".68rem", fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.7)", whiteSpace: "nowrap" }}>
                      {cellData.socle !== cellData.blocks.length
                        ? `${cellData.socle}/${cellData.blocks.length}`
                        : cellData.blocks.length}
                    </span>
                  )}
                  {/* Un Téléporteur ne fonctionne que TANT QU'IL LUI RESTE
                      DES BLOCS (cf. getActiveTeleporterCells). Le 🌀 était
                      posé sur `isTeleporter` seul : une fois le bâtiment
                      cassé et vidé, l'icône restait affichée sur une case
                      devenue un simple couloir. Le joueur voyait deux
                      téléporteurs là où le moteur n'en comptait plus qu'un
                      (bug remonté par Nikola le 2026-08-17). */}
                  {cellData && cellData.isTeleporter && cellData.blocks.length > 0 && (
                    <span title={`${key} — Téléporteur actif`} style={{ position: "absolute", top: 1, left: 2, fontSize: ".68rem" }}>🌀</span>
                  )}
                  {moveIsTeleport && (
                    <span style={{ position: "absolute", top: 1, right: 2, fontSize: "8px", opacity: .8 }}>🌀</span>
                  )}
                  {bbNumeroSaut > 0 && (
                    <span
                      title={`Saut ${bbNumeroSaut} sur ${bbMaxRange}`}
                      style={{
                        position: "absolute", top: 1, left: 2,
                        minWidth: 13, height: 13, borderRadius: "50%",
                        background: "#16E08C", color: "#04240f",
                        fontSize: "9px", fontWeight: 900, lineHeight: "13px",
                        textAlign: "center", padding: "0 2px",
                        boxShadow: "0 0 4px rgba(22,224,140,.8)",
                      }}
                    >
                      {bbNumeroSaut}
                    </span>
                  )}
                  {looseBlocks[key] && looseBlocks[key].length > 0 && (() => {
                    const stack = looseBlocks[key];
                    const colorBlocks = stack.filter(c => !isSocleMarker(c));
                    const hasSocle = stack.some(isSocleMarker);
                    const total = stack.length;
                    const preview = stack.slice(-2); // 2 derniers
                    return (
                      <>
                        {/* Badge : nombre de blocs libres, et valeur du Socle
                            quand il y en a un au sol. Cette valeur est le
                            nombre d'étages qu'avait le bâtiment à sa
                            construction, et c'est ce qu'elle rapportera au
                            score : le joueur a le droit de la connaître.
                            Le conteneur ne se rend plus quand il n'a rien à
                            afficher — son fond noir laissait un petit carré
                            sombre sur les cases qui ne portaient qu'un Socle. */}
                        {colorBlocks.length > 0 && (
                          <div style={{
                            position: "absolute", top: 1, left: 2,
                            background: "rgba(0,0,0,.65)", borderRadius: 3,
                            padding: "1px 3px", display: "flex", alignItems: "center", gap: 3,
                          }}>
                            {colorBlocks.length > 0 && (
                              <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#FFD93D", lineHeight: 1 }}>
                                {colorBlocks.length}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Le Socle vit a droite de la case, les blocs a
                            gauche : les deux ne se confondent plus. Sa valeur
                            est le nombre d'etages du batiment a sa
                            construction, et vaut autant de points. */}
                        {hasSocle && (
                          <div
                            title={`Socle de valeur ${stack.filter(isSocleMarker).map(socleValue).join(" + ")} — autant que d'étages qu'avait le bâtiment à sa construction`}
                            style={{
                              position: "absolute", top: 1, right: 2, zIndex: 4,
                              display: "flex", alignItems: "center", gap: 2,
                              background: "rgba(0,0,0,.65)", borderRadius: 3,
                              padding: "1px 3px", cursor: "help",
                            }}
                          >
                            <img src={`${import.meta.env.BASE_URL}assets/rules/socle.png`}
                              alt="" aria-hidden="true"
                              style={{ width: 11, height: 11, objectFit: "contain", filter: "brightness(1.3)", display: "block" }} />
                            <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#fff", lineHeight: 1 }}>
                              {stack.filter(isSocleMarker).map(socleValue).join("+")}
                            </span>
                          </div>
                        )}
                        {/* Blocs libres au sol : meme icone que dans le stock
                            et le Repaire, pour qu'un bloc se reconnaisse
                            partout au meme dessin. */}
                        <div style={{ position: "absolute", bottom: 1, left: 2, display: "flex", gap: 1, flexWrap: "wrap", maxWidth: "80%", alignItems: "center", zIndex: 4 }}>
                          {colorBlocks.slice(-2).map((c, i) => (
                            <BlockIcon key={i} color={c} size={16} />
                          ))}
                          {colorBlocks.length > 2 && (
                            <span style={{ fontSize: "9px", color: "rgba(255,255,255,.75)", fontWeight: 700, lineHeight: "11px" }}>+{colorBlocks.length - 2}</span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                  {titan && <TitanBadge {...titan} />}
                </div>
              );
            })}
            <Gouttiere cle={`${r}9`} zone="droite" />
          </React.Fragment>
        ))}
        {/* Amplitude volontairement faible : la case reste lisible en
            permanence, la pulsation ne fait que la signaler du coin de
            l'oeil. Voir la propriete "animation" sur la case, plus haut. */}
        <style>{"@keyframes pulseAction { 0%, 100% { opacity: 1; } 50% { opacity: .94; } }"}</style>
        {/* Gouttière basse : attente sous la ligne I */}
        <div /><div />
        {[1,2,3,4,5,6,7,8,9].map((c) => <Gouttiere key={`bas${c}`} cle={`I${c}`} zone="bas" />)}
        <div />
      </div>
        );
      })()}

      {/* Composition du bâtiment cliqué, en position fixe pour ne pas être
          tronquée par le défilement horizontal de la grille. Les blocs sont
          listés du haut vers le bas, avec les vraies icônes. */}
      {hoverCell && hoverPos && state.board[hoverCell] && state.board[hoverCell].blocks.length > 0 && (
        <>
          {hoverSource === "clic" && (
            <div
              onClick={() => { setHoverCell(null); setHoverPos(null); setHoverSource(null); }}
              style={{ position: "fixed", inset: 0, zIndex: 300 }}
            />
          )}
          <div
            style={{
              position: "fixed", zIndex: 301,
              left: Math.min(Math.max(hoverPos.x, 90), window.innerWidth - 90),
              top: hoverPos.y - 8,
              transform: "translate(-50%, -100%)",
              background: "rgba(14,4,32,.97)", border: "1px solid rgba(255,217,61,.55)",
              borderRadius: 10, padding: "8px 10px",
              boxShadow: "0 10px 30px rgba(0,0,0,.7)", pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: ".66rem", color: "#FFD93D", fontWeight: 700, marginBottom: 5, whiteSpace: "nowrap", textAlign: "center" }}>
              {hoverCell} · socle {state.board[hoverCell].socle}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[...state.board[hoverCell].blocks].reverse().map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  <BlockIcon color={c} size={20} />
                  <span style={{ fontSize: ".66rem", color: "rgba(255,255,255,.7)" }}>{BLOCK_NAME[c]}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Popup de choix — bug remonté "2 débris différents sur la même
          case, je dois pouvoir choisir". N'apparaît que quand la case
          cliquée a plus d'1 type de débris distinct (couleur ou socle) ;
          sinon jouerRecuperation(key) s'exécute directement sans popup
          inutile. */}
      {recupChoiceCell && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }} onClick={() => setRecupChoiceCell(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "rgba(20,8,35,.97)", border: "2.5px solid #16E08C",
              boxShadow: "0 0 0 3px rgba(22,224,140,.35), 0 4px 18px rgba(22,224,140,.35)",
              borderRadius: 14, padding: "16px 20px", maxWidth: 280,
            }}
          >
            <div style={{ fontFamily: "'Bowlby One', sans-serif", color: "#7CF5C8", fontSize: ".95rem", marginBottom: 10 }}>
              🤲 Case {recupChoiceCell} — que ramasser ?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...new Set(looseBlocks[recupChoiceCell] || [])].map((val) => (
                <button
                  key={val}
                  onClick={() => { jouerRecuperation(recupChoiceCell, val); setRecupChoiceCell(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                    borderRadius: 8, border: "1.5px solid rgba(255,255,255,.25)",
                    background: "rgba(255,255,255,.06)", color: "#fff", cursor: "pointer", fontSize: ".8rem", fontWeight: 600,
                  }}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, display: "inline-block",
                    background: isSocleMarker(val) ? "#8a8a8a" : COLOR_HEX[val],
                    border: "1px solid rgba(0,0,0,.5)",
                  }} />
                  {isSocleMarker(val) ? `Socle (${socleValue(val)})` : `Bloc ${val}`}
                </button>
              ))}
            </div>
            <button onClick={() => setRecupChoiceCell(null)} style={{ ...cancelBtn(), marginTop: 10, width: "100%", fontSize: ".72rem" }}>
              ✕ Annuler
            </button>
          </div>
        </div>
      )}

  </>;
}
