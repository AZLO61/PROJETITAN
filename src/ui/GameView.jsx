import React, { Suspense, lazy } from "react";
// Même traitement que la vue 3D : la page Règles n'est chargée qu'à la
// première ouverture, elle ne pèse pas sur le démarrage du jeu.
const RulesPage = lazy(() => import("./rules/RulesPage.jsx"));
// Même traitement pour le tutoriel : sept écrans qu'on ouvre une fois dans une
// vie de joueur n'ont rien à faire dans le paquet de démarrage.
const TutorielPage = lazy(() => import("./rules/TutorielPage.jsx"));
import HeaderPhase, { StatutsTour } from "./panels/HeaderPhase.jsx";
import RoundPanels from "./panels/RoundPanels.jsx";
import BoardPanel from "./panels/BoardPanel.jsx";
import DilRageBanner from "./panels/DilRageBanner.jsx";
import RepoVolBanner from "./panels/RepoVolBanner.jsx";
import RepliBanner from "./panels/RepliBanner.jsx";
import FpmcBanner from "./panels/FpmcBanner.jsx";
import CornerChoiceBanner from "./panels/CornerChoiceBanner.jsx";
import PlacementBanner from "./panels/PlacementBanner.jsx";
import FatigueBanner from "./panels/FatigueBanner.jsx";
import ToutCasserBanner from "./panels/ToutCasserBanner.jsx";
import DecisionPanels from "./panels/DecisionPanels.jsx";
import TitanBandPanel from "./panels/TitanBandPanel.jsx";
import Superposition from "./panels/Superposition.jsx";
import PodiumFinal from "./panels/PodiumFinal.jsx";
import RainbowCelebration from "./panels/RainbowCelebration.jsx";
import { T, TON_DE_PHASE, readout, label } from "./theme.js";
import BlockStockBar from "./cards/BlockStockBar.jsx";
import { cancelBtn } from "./styles.js";
import Icon from "./icons.jsx";

/* ── LA LIAISON, ET COMMENT LA RATTRAPER ───────────────────
   Nikola, 2026-08-30 : « l'interface et même le plateau de l'invité n'étaient
   plus actualisés avec la partie, et le souci c'est que quand je rafraîchis la
   page ça me remet sur le panneau d'accueil ; il faudrait un bouton refresh
   sans relancer le panneau d'accueil ».

   Les deux moitiés du problème tiennent dans ce bandeau. F5 est le mauvais
   geste : la session ne vit qu'en mémoire, recharger l'onglet la détruit et
   renvoie à l'écran d'accueil, table quittée. Ce bouton-ci ne recharge rien —
   il redemande l'état à l'hôte sur la connexion déjà ouverte (cf.
   `resynchroniser` dans `net/session.js`).

   Et il dit à quoi on est branché. Une partie à distance qui décroche
   ressemble, à l'écran, à une partie où personne ne joue : sans cette ligne,
   « ça ne bouge plus » et « ils réfléchissent » ont exactement la même tête. */
function BandeauDistant({ vm }) {
  const invite = vm.session?.siege === "invite";
  const nom = vm.monTitanDistant != null ? vm.titanDisplayName(vm.monTitanDistant) : null;
  /* ── S'ASSEOIR EN COURS DE PARTIE ──
     Nikola, 2026-08-30 : « un joueur peut rejoindre la partie en cours de
     route, il prend juste un Titan qui était géré par IA ».

     Le choix du Titan vivait uniquement dans le salon, c'est-à-dire avant le
     lancement. Un joueur arrivé en cours de Manche — ou revenu après une
     déconnexion — atterrissait donc sur le plateau sans siège et sans aucun
     moyen d'en prendre un : spectateur pour le reste de la partie.

     La liste ne montre que ce qui est réellement disponible : un Titan que
     personne ne tient, ou que l'IA tient à la place de quelqu'un. Le clic
     DEMANDE, comme dans le salon ; c'est l'hôte qui tranche. */
  const sansSiege = invite && vm.monTitanDistant == null;
  const dispos = sansSiege
    ? Array.from({ length: vm.nbJoueurs }, (_, i) => i + 1)
      /* Partie lancée : seul un Titan tenu par l'IA est libre (2026-09-14). Un
         Titan humain sans siège distant est celui de l'hôte, ou d'un joueur
         assis chez lui : le proposer invitait à le lui prendre (cf.
         `demanderSiege` dans le contrôleur). */
      .filter((id) => !vm.distantSieges?.[id] && vm.titanModes?.[id] === "ia")
    : [];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      border: `2px solid ${T.tele}`, borderRadius: T.rChip,
      padding: "7px 11px", marginBottom: T.s3, background: "rgba(184,140,255,.08)",
    }}>
      <Icon name="teleport" size={13} style={{ color: T.tele }} />
      <span style={label(T.tele, T.micro)}>
        Table {vm.session.id} · {invite ? "invité" : "hôte"}
      </span>
      {nom && <span style={label(T.dim, T.micro)}>tu joues {nom}</span>}
      {/* L'avis de liaison n'apparaît que quand il a quelque chose à dire :
          « reconnexion en cours », « diffusion impossible ». */}
      {vm.distantAvis && (
        <span style={{ ...label(T.warn, T.micro), flex: "1 1 180px" }}>{vm.distantAvis}</span>
      )}
      {/* ── LA SEULE SORTIE DU GARDE-FOU DE RECHARGEMENT ──
          Quand cette page a rejoint une table qui a déjà une partie sans en
          avoir le moteur (un F5 de l'hôte), plus rien n'est diffusé : le
          plateau des autres reste intact. Ce bouton est le geste qui assume
          l'inverse — repartir de zéro pour toute la table — et c'est
          exactement pour ça qu'il est explicite et nommé. */}
      {vm.distantDiffusionBloquee && vm.reprendreDiffusion && (
        <button
          onClick={vm.reprendreDiffusion}
          title="Écrase la partie en cours de la table par celle de cette page. Irréversible."
          style={{ ...cancelBtn(), borderColor: T.stop, color: T.stop }}
        >
          Écraser et repartir de cette page
        </button>
      )}
      {sansSiege && (
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flex: "1 1 100%" }}>
          <span style={label(T.you, T.micro)}>
            {dispos.length > 0 ? "Prends un Titan :" : "Aucun Titan libre pour l'instant."}
          </span>
          {dispos.map((id) => (
            <button
              key={id}
              onClick={() => vm.demanderSiege && vm.demanderSiege(id)}
              title={vm.titanModes?.[id] === "ia"
                ? `${vm.titanDisplayName(id)} est tenu par l'IA — reprends-le`
                : `${vm.titanDisplayName(id)} est libre`}
              style={{
                ...label(T.text, T.micro),
                background: "none", border: `2px solid ${T.rule}`, borderRadius: T.rChip,
                padding: "4px 9px", cursor: "pointer",
              }}
            >
              {vm.titanModes?.[id] === "ia" ? "🤖 " : ""}{vm.titanDisplayName(id)}
            </button>
          ))}
        </span>
      )}
      {/* ── RAFRAÎCHIR : L'HÔTE, ET RIEN QUE L'ICÔNE ──
          Nikola, 2026-09-01 : « seul l'hôte de la partie doit avoir le bouton
          rafraîchir, et pas besoin d'afficher du texte, juste le bouton
          suffit ».

          Chez un invité il doublait une reprise que la boucle de réception
          fait déjà seule. Chez l'hôte il repousse maintenant le plateau à
          toute la table (cf. `resynchroniserSession`), ce qui est le seul
          geste de rattrapage qui serve vraiment à quelque chose. Le mot
          « Rafraîchir » part avec : dans une barre qui porte déjà le numéro de
          table, le rôle, le Titan tenu et l'avis de liaison, une icône seule se
          trouve aussi vite et prend cinq fois moins de place. */}
      {!invite && (
        <button
          onClick={vm.resynchroniserSession}
          aria-label="Renvoyer le plateau à toute la table"
          title="Renvoie le plateau à tous les invités. Ne recharge pas la page et ne ferme pas la table."
          style={{
            ...label(T.tele, T.micro), marginLeft: "auto",
            background: "none", border: `2px solid ${T.tele}`, borderRadius: T.rChip,
            padding: "6px 9px", cursor: "pointer",
            display: "inline-flex", alignItems: "center",
          }}
        >
          <Icon name="undo" size={14} />
        </button>
      )}
    </div>
  );
}

/* ── QUI ARRIVE, QUI PART ────────────────────────────────
   Nikola, 2026-09-01 : « si un joueur quitte la partie il faut un petit
   panneau bien lisible pour ne pas le rater, pareil s'il rejoint ».

   Il vit SOUS la barre de liaison et non dedans : celle-ci porte déjà quatre
   informations permanentes, et une nouvelle glissée au milieu s'y serait lue
   comme un cinquième réglage. Ici, c'est une plaque à part, qui apparaît puis
   s'en va — la forme dit déjà qu'il vient de se passer quelque chose.

   Le vert de l'arrivée et le rouge du départ sont les mêmes signaux que
   partout ailleurs dans le jeu : on sait lequel des deux avant d'avoir lu. */
function MouvementsDistants({ vm }) {
  const mouvements = vm.distantMouvements || [];
  if (mouvements.length === 0) return null;
  return (
    <div role="status" aria-live="polite" style={{ display: "grid", gap: 6, marginBottom: T.s3 }}>
      {mouvements.map((m) => {
        const arrive = m.type === "arrivee";
        const ton = arrive ? T.go : T.stop;
        return (
          <div
            key={m.id}
            style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              border: `${T.edgeW} solid ${ton}`, borderRadius: T.rChip,
              padding: "9px 13px", background: `${ton}1f`,
            }}
          >
            <Icon name={arrive ? "teleport" : "ringout"} size={16} style={{ color: ton }} />
            <span style={label(ton, T.small)}>
              {m.pseudo} {arrive ? "a rejoint la table" : "a quitté la table"}
            </span>
            {!arrive && (
              <span style={{ ...label(T.faint, T.micro), marginLeft: "auto" }}>
                son Titan repasse à l&apos;IA — il peut le reprendre en revenant
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── LA LIGNE D'INFOS, AU-DESSUS DU PLATEAU ─────────────────
   Nikola, 2026-09-22, maquette à l'appui : « déplace l'information des blocs
   dans la partie au-dessus du plateau, que ça ne dépasse pas la largeur du
   plateau » — et « ne fais pas autant d'espace entre l'information des blocs
   globaux, la Manche et le plateau ».

   Le stock, la Manche et les bâtiments sont les trois comptes à rebours de la
   partie : ils se lisent contre le plateau qu'ils décrivent, pas dans la
   rangée des commandes. Le titre et la Phase sont montés dans cette rangée
   (cf. HeaderPhase) ; « BIG CITY — Détonateur » en est parti, le Détonateur
   étant déjà marqué sur la plaque de son Titan. */
function InfosPlateau({
  board, looseBlocks, mancheNumber, totalManches,
  occupiedCount, apocalypseThreshold, endGameReasons,
}) {
  /* DERNIÈRE MANCHE, DIT COMME TEL (Nikola, 2026-08-27 : « indique mieux que
     c'est la dernière manche »).

     Elle se disait par « · DERNIERE MANCHE » en 0,68 rem, au bout d'une
     rangée qui portait déjà cinq autres informations — supprimée depuis. Ici
     elle prend le compteur lui-même : le 4/4 passe au rouge d'arrêt et
     l'étiquette se pose SOUS lui, cernée, à la taille du reste du fronton.
     C'est le même signal que la couleur de phase, lisible de l'autre bout de
     la table sans qu'on ait à lire un mot.

     LE COMPTE DE BÂTIMENTS MONTE ICI (« garde juste le seuil des bâtiments,
     mais place-le ailleurs »). Sa place est à côté de la Manche : ce sont les
     DEUX comptes à rebours de la partie, et le premier des deux qui tombe
     l'arrête. Les voir côte à côte est ce qui permet de savoir laquelle des
     deux fins arrive — une Manche 3/4 avec 7 bâtiments debout pour un seuil
     de 6 ne se joue pas comme une Manche 3/4 avec 18 debout. */
  const derniereManche = mancheNumber != null && mancheNumber === totalManches;
  const apocalypseProche = occupiedCount != null && occupiedCount <= apocalypseThreshold;

  /* UN SEUIL DE PLATEAU ATTEINT ARRÊTE LA PARTIE, ET IL FAUT LE DIRE — Nikola,
     2026-08-28 : « faut indiquer quand un seuil autre que la 4e Manche va mettre
     fin à la partie, si le seuil est atteint ».

     Le moteur calculait déjà ces déclencheurs à chaque rendu (`endGameReasons`),
     et personne ne les affichait : la valeur était exposée par le contrôleur et
     lue nulle part. Or ils tombent SOUVENT — sur vingt parties Expert mesurées,
     onze se terminent sur un déclencheur de plateau contre neuf à la limite de
     Manches. La fin de partie la plus fréquente était donc la seule dont rien
     ne prévenait.

     On écarte la ligne « dernière Manche », qui a déjà son propre badge juste à
     côté : ce qu'on annonce ici, c'est la fin qu'on n'attendait pas. */
  const finsPlateau = (endGameReasons || []).filter((r) => !/Dernière Manche/i.test(r));

  const badge = (texte, title) => (
    <span
      title={title}
      style={{
        ...label(T.stop, T.micro),
        border: `1px solid ${T.stop}`,
        padding: "1px 6px",
        whiteSpace: "nowrap",
        cursor: "help",
      }}
    >
      {texte}
    </span>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      flexWrap: "wrap", columnGap: T.s5, rowGap: T.s1,
    }}>
      <BlockStockBar board={board} looseBlocks={looseBlocks} orientation="rangee" />
      {/* Manche et bâtiments restent ENSEMBLE : ce sont les deux comptes à
          rebours de la partie. Quand la ligne ne tient pas dans la largeur du
          plateau, elle se coupe entre le stock et eux, jamais entre les deux. */}
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: T.s5, flexWrap: "wrap", justifyContent: "center" }}>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: T.s2 }}>
        <span style={label(derniereManche ? T.stop : T.faint)}>Manche</span>
        <span style={readout("0.95rem", derniereManche ? T.stop : T.text)}>
          {mancheNumber}
          <span style={{ color: derniereManche ? T.stop : T.faint, opacity: derniereManche ? 0.7 : 1 }}>
            /{totalManches}
          </span>
        </span>
        {derniereManche && badge("Dernière Manche", "Dernière Manche de la partie : après elle, on compte les points.")}
        {!derniereManche && finsPlateau.length > 0 && badge(
          "Dernière Manche — seuil atteint",
          ["La partie s'arrêtera à la fin de cette Manche :", ...finsPlateau].join(" · ")
        )}
      </span>
      {occupiedCount != null && (
        <span
          title={`Fin de partie déclenchée dès qu'il ne reste plus que ${apocalypseThreshold} bâtiment(s) debout — il y en a ${occupiedCount} sur 25.`}
          style={{ display: "inline-flex", alignItems: "baseline", gap: T.s2, cursor: "help" }}
        >
          <span style={label(apocalypseProche ? T.stop : T.faint)}>Bâtiments</span>
          <span style={readout("0.95rem", apocalypseProche ? T.stop : T.text)}>
            {occupiedCount}
            <span style={{ color: T.faint }}>/25</span>
          </span>
          <span style={label(T.faint)}>seuil {apocalypseThreshold}</span>
        </span>
      )}
      </span>
    </div>
  );
}

/* Hauteur minimale de la zone des bandeaux, sous la ligne : un bandeau d'une
   ligne y tient sans rien déplacer, et sans bandeau c'est l'air qui manquait
   au-dessus de la ligne d'infos (Nikola, 2026-09-23). */
const BANDEAU_MIN = 46;

export default function GameView(vm) {
  /* CHAQUE PHASE A SA COULEUR (demande de Nikola).

     Le mot était toujours vert, donc il ne disait que « il y a une phase ».
     Il porte maintenant l'information : on sait où on en est dans la Manche
     sans lire, à la couleur seule, depuis l'autre bout de la table.

     La table est passée dans `theme.js` le 2026-09-19 : le tutoriel en tenait
     une seconde copie, décalée d'un cran, et enseignait donc un code couleur
     que cet écran-ci démentait. Le rouge de la partie terminée reste ici, lui
     — ce n'est pas une phase de la Manche, c'est son absence. */
  const phaseCourante = vm.gameOver
    ? { mot: "Terminée", couleur: T.stop }
    : TON_DE_PHASE[vm.phase] || { mot: vm.phase, couleur: T.dim };
  const infos = (
    <InfosPlateau
      board={vm.state.board}
      looseBlocks={vm.looseBlocks}
      mancheNumber={vm.mancheNumber}
      totalManches={vm.manchesMaxPartie}
      occupiedCount={vm.occupiedCount}
      apocalypseThreshold={vm.apocalypseThreshold}
      endGameReasons={vm.endGameReasons}
    />
  );

  /* ── LE PLATEAU TIENT DANS LA FENÊTRE ──
     Nikola, 2026-09-22 : « grandis le plateau un peu, mais que tout soit
     lisible en pleine page à partir du dessous de la ligne qui sépare le
     titre ». Le plateau se borne donc aussi en HAUTEUR : ce qui reste de la
     fenêtre sous la rangée du haut (cf. RoundPanels). La rangée peut passer
     sur deux lignes selon la largeur, d'où la mesure plutôt qu'une constante. */
  const enteteRef = React.useRef(null);
  const [enteteBas, setEnteteBas] = React.useState(0);
  /* ── LA RANGÉE DU HAUT SE CACHE AU-DESSUS DE L'ÉCRAN ──
     Nikola, 2026-09-23 : « n'affiche pas la zone du titre et des boutons, sauf
     si on remonte ; si on redescend, ça re-masque toute la zone au-dessus de
     la ligne de séparation, Scoring et Vue 3D compris ».

     C'est le défilement de la page lui-même, pas un panneau qui glisse : la
     partie s'ouvre défilée juste sous la ligne, on remonte pour trouver les
     commandes, on redescend pour les ranger. Le meuble fait au moins une
     fenêtre de plus que la rangée (`minHeight`), sinon il n'y aurait rien à
     faire défiler.

     Le plateau, lui, ne réserve plus la place de la rangée (2026-09-23) :
     cachée, elle laissait ce vide sous les numéros. Les bandeaux ont leur
     propre zone, tenue plus bas.

     `cibleAuto` retient où l'on a défilé soi-même. Si la rangée change de
     hauteur (police chargée après coup, fenêtre redimensionnée), on suit —
     mais seulement si le joueur n'a pas bougé depuis : s'il est remonté
     chercher « Règles », on ne le redescend pas de force. */
  const cibleAuto = React.useRef(null);
  React.useEffect(() => {
    if (!enteteBas || typeof window.scrollTo !== "function") return;
    const joueurImmobile = cibleAuto.current == null || Math.abs(window.scrollY - cibleAuto.current) < 2;
    if (!joueurImmobile) return;
    // + 8 : la marge sous la ligne ne sépare plus rien quand la rangée est
    // cachée. Il en reste 4 px au-dessus du contenu, et les 8 autres vont aux
    // bandeaux de décision (celui de mise en place en fait 72).
    const cible = enteteBas + 8;
    cibleAuto.current = cible;
    window.scrollTo(0, cible);
  }, [enteteBas]);
  React.useLayoutEffect(() => {
    const el = enteteRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const mesurer = () => setEnteteBas(Math.ceil(el.getBoundingClientRect().bottom + window.scrollY));
    // Tout de suite, puis à chaque changement de taille : l'observateur ne
    // rappelle qu'à la prochaine image, et le plateau sauterait à l'ouverture.
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── LA RANGÉE S'EFFACE EN FONDU ──
     Nikola, 2026-09-23 : « les informations au-dessus de la ligne de
     séparation ne doivent pas être visibles […] c'est seulement si je remonte
     que ça apparaît, vraiment un fondu d'opacité ». L'opacité suit la
     position : 1 tout en haut, 0 dès que la ligne est sortie de l'écran.
     Écrite directement sur l'élément, pas dans l'état : un rendu React par
     événement de défilement serait du gâchis. */
  React.useEffect(() => {
    const el = enteteRef.current;
    if (!el || !enteteBas) return undefined;
    const fondu = () => {
      el.style.opacity = String(Math.max(0, Math.min(1, 1 - window.scrollY / enteteBas)));
    };
    fondu();
    window.addEventListener("scroll", fondu, { passive: true });
    return () => window.removeEventListener("scroll", fondu);
  }, [enteteBas]);

  /* ── LA ZONE DES BANDEAUX, TENUE PENDANT TOUTE UNE SÉQUENCE ──
     Nikola, 2026-09-23, en deux temps. D'abord : un bandeau qui s'ouvre
     « fait disparaître des informations de l'écran », et sans bandeau la
     ligne d'infos est « trop collée vers le haut ». La zone garde donc une
     hauteur minimale, et un bandeau plus haut l'agrandit : le plateau
     rétrécit d'autant (`--bandeau-h`, lue par RoundPanels) au lieu de
     pousser ses numéros sous le bord de l'écran.

     Puis : « une sorte de zoom-dézoom […] ne fais pas le rezoom tant qu'il y
     a un bandeau de décision, c'est seulement quand il n'y a plus aucun
     bandeau qu'on revient à l'état initial », et « dès que quelque chose
     apparaît ou disparaît, ça bouge l'écran ». La zone GRANDIT donc tout de
     suite (sinon le bandeau pousserait le plateau), mais ne RÉTRÉCIT que
     lorsque plus aucune décision n'attend et qu'aucune carte ne se résout,
     après un court répit : une DIL suivie d'une Fatigue, puis d'un repli,
     ne font bouger le plateau qu'une fois à l'aller et une fois au retour.

     Tout passe par le DOM et pas par l'état React : l'observateur écrit la
     hauteur avant que l'image ne soit peinte. Un `setState` arrivait une
     image trop tard — la zone avait déjà grandi, le plateau pas encore
     rétréci, et ses numéros sortaient de l'écran le temps d'un éclair. */
  const cabinetRef = React.useRef(null);
  const zoneRef = React.useRef(null);
  const tenueRef = React.useRef(null);
  const contenuRef = React.useRef(null);
  const calme = !vm.decisionBloquante && !vm.animating;
  const calmeRef = React.useRef(calme);
  calmeRef.current = calme;
  const ajusterZoneRef = React.useRef(() => {});
  React.useLayoutEffect(() => {
    const cabinet = cabinetRef.current;
    const zone = zoneRef.current;
    const tenueEl = tenueRef.current;
    const contenu = contenuRef.current;
    if (!cabinet || !zone || !tenueEl || !contenu) return undefined;
    let tenue = BANDEAU_MIN;
    let relache = null;
    const publier = () => cabinet.style.setProperty("--bandeau-h", `${Math.ceil(zone.getBoundingClientRect().height)}px`);
    const tenir = (h) => {
      tenue = h;
      tenueEl.style.minHeight = `${h}px`;
      publier();
    };
    const ajuster = () => {
      const h = Math.ceil(contenu.getBoundingClientRect().height);
      if (h > tenue) {
        clearTimeout(relache);
        relache = null;
        tenir(h);
        return;
      }
      publier();
      if (!calmeRef.current || h >= tenue || relache) return;
      relache = setTimeout(() => {
        relache = null;
        if (calmeRef.current) tenir(Math.max(BANDEAU_MIN, Math.ceil(contenu.getBoundingClientRect().height)));
      }, 600);
    };
    ajusterZoneRef.current = ajuster;
    tenir(BANDEAU_MIN);
    ajuster();
    if (typeof ResizeObserver === "undefined") return () => clearTimeout(relache);
    const ro = new ResizeObserver(ajuster);
    ro.observe(contenu);
    ro.observe(zone);
    return () => { ro.disconnect(); clearTimeout(relache); };
  }, []);
  // Le calme peut revenir sans qu'aucune taille ne change (le dernier bandeau
  // avait la hauteur d'un statut) : c'est lui qui déclenche alors le retour.
  React.useEffect(() => { ajusterZoneRef.current(); }, [calme]);

  return (
    <div
      ref={cabinetRef}
      className="titan-cabinet"
      style={{
        fontFamily: T.ui,
        background: T.screen,
        color: T.text,
        padding: "12px 14px",
        maxWidth: 880,
        minHeight: `calc(100dvh + ${enteteBas + 8}px)`,
        boxSizing: "border-box",
      }}
    >
      {/* Le contenu passe au-dessus des lignes de balayage et du vignettage,
          qui sont posés par ::before/::after du meuble. */}
      <div style={{ position: "relative", zIndex: 3 }}>
        <HeaderPhase vm={vm} phase={phaseCourante} enteteRef={enteteRef} />


        {/* ── UNE SEULE DÉCISION À L'ÉCRAN ──
            Demande de Nikola du 2026-08-18 : « n'affiche pas plusieurs
            panneaux, fais panneau par panneau — là j'ai un DIL et une Phase
            Repos, ce n'est pas possible, on fait DIL puis Phase Repos. »

            Les trois bandeaux étaient montés côte à côte et chacun décidait
            seul de s'afficher : trois alertes rouges pouvaient donc cohabiter,
            sans rien indiquer de l'ordre dans lequel y répondre. C'est le
            contrôleur qui tranche désormais (`decisionBloquante`), avec
            l'ordre de la résolution réelle : ce qu'une carte a déclenché passe
            avant la carte, et la carte avant la Manche. La règle vit à un
            seul endroit, l'affichage ne fait plus que la suivre. */}
        {/* La barre de liaison d'une partie à distance vit dans la zone : elle
            est permanente, et le plateau doit tenir SOUS elle, pas derrière
            le bord de l'écran (elle le poussait de toute sa hauteur). */}
        <div ref={zoneRef} className="titan-bandeaux">
        {vm.session && <BandeauDistant vm={vm} />}
        <div ref={tenueRef} style={{ minHeight: BANDEAU_MIN, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div ref={contenuRef}>
        {vm.session && <MouvementsDistants vm={vm} />}
        <StatutsTour vm={vm} />
        {vm.decisionBloquante === "placement" && <PlacementBanner vm={vm} />}
        {vm.decisionBloquante === "toutcasser" && <ToutCasserBanner vm={vm} />}
        {vm.decisionBloquante === "coin" && <CornerChoiceBanner vm={vm} />}
        {vm.decisionBloquante === "dil" && <DilRageBanner vm={vm} />}
        {vm.decisionBloquante === "fatigue" && <FatigueBanner vm={vm} />}
        {vm.decisionBloquante === "repli" && <RepliBanner vm={vm} />}
        {vm.decisionBloquante === "fpmc" && <FpmcBanner vm={vm} />}
        {vm.decisionBloquante === "vol" && <RepoVolBanner vm={vm} />}
        </div>
        </div>
        </div>

        {/* ── FIN DE PARTIE ──
            Bug remonté par Nikola le 2026-08-17 : « fais bien la transition de
            fin de partie, que je puisse placer mon Bloc Vert dans une
            catégorie ; là c'est bloqué. »

            Point 4.4 du 2026-08-19 : « maintenir le plateau et la carte
            totalement visibles et consultables même après l'affichage de
            l'écran de scoring final ». Le plateau revient donc SOUS le
            décompte, en consultation seule (cf. le garde `gameOver` dans
            `clicCase`). Les commandes de jeu restent masquées : la partie est
            finie, il n'y a plus rien à jouer. */}
        {vm.gameOver ? (
          <>
            {/* Une porte pour rouvrir le podium une fois qu'on l'a refermé :
                sans elle, « enlevable » voudrait dire « perdu ». */}
            {!vm.showPodium && vm.versDeposesEtEngages && vm.classementFinalPartie?.length > 0 && (
              <button
                onClick={() => vm.setShowPodium(true)}
                style={{
                  ...label(T.you, T.micro),
                  background: "none", border: `1.5px solid ${T.you}`, borderRadius: T.rChip,
                  padding: "6px 12px", cursor: "pointer", marginBottom: T.s3,
                }}
              >
                🏆 Revoir le classement
              </button>
            )}
            <DecisionPanels vm={vm} />
            <RoundPanels vm={vm} entete={infos} />
          </>
        ) : (
          /* ── DEUX COLONNES SUR GRAND ÉCRAN ──
             Les deux scènes d'usage comptent autant l'une que l'autre : la
             tablette posée à table, et le PC. En colonne unique de 880px, le
             PC affichait le plateau en haut et les commandes du tour hors de
             l'écran, ce qui obligeait à faire défiler à chaque action. Au-delà
             de 1100px, le plateau tient la colonne large et les commandes
             restent visibles en permanence à droite. Sous ce seuil, rien ne
             change : c'est la même pile qu'avant. */
          /* RÉAGENCEMENT DU 2026-08-28 (Nikola) : « agrandis le plateau en
             réagençant les panneaux d'informations ».

             La colonne large ne porte plus QUE le plateau. Tout ce qui
             l'encombrait est parti ailleurs :
             · la bande des Titans monte dans la colonne des commandes, en
               tête — elle se lit au même moment que le tour qu'on joue ;
             · les cartes qu'on joue restent juste dessous, là où vivait le
               décompte ;
             · le décompte et le journal se posent PAR-DESSUS le plateau, à la
               demande (cf. Superposition, plus bas).

             C'est l'agencement que Nikola a décrit mot pour mot. */
          <>

            <div className="titan-layout">
            <div style={{ minWidth: 0 }}>
              <RoundPanels vm={vm} entete={infos} />
            </div>
            <div className="titan-layout__aside" style={{ minWidth: 0 }}>
              <TitanBandPanel vm={vm} />
              <BoardPanel vm={vm} />
            </div>
            </div>
          </>
        )}

        {/* La graine, en pied de meuble : c'est une plaque signalétique, pas
            une information de jeu. Elle ne mérite pas une ligne en haut de
            l'écran, mais elle doit rester lisible pour rejouer une partie. */}

      </div>

      {/* ── DÉCOMPTE ET JOURNAL, PAR-DESSUS LE PLATEAU ──
          Deux panneaux de CONSULTATION : on les ouvre, on lit, on referme.
          Montés dans le flux, ils prenaient en permanence la hauteur qu'ils
          occupent une fois ouverts. Ni l'un ni l'autre ne démonte la partie
          — on la retrouve exactement où on l'a laissée, comme pour les
          Règles. Rien de tout ça ne s'applique aux décisions bloquantes
          ci-dessus : celles-là se répondent EN REGARDANT le plateau, elles
          gardent donc leur bandeau dans le flux. */}
      {!vm.gameOver && vm.showScoring && (
        <Superposition
          titre={vm.gameOver ? "Décompte final" : "Décompte — aperçu"}
          onClose={() => vm.setShowScoring(false)}
        >
          <DecisionPanels vm={vm} vue="scoring" />
        </Superposition>
      )}
      {!vm.gameOver && vm.showJournal && (
        <Superposition
          /* LA GRAINE VIT DANS LE TITRE DU JOURNAL — Nikola, 2026-08-29 :
             « mets la seed directement dans le panneau journal à côté du texte
             "journal de partie", adapte la taille des numéros ».

             Elle a fait trois escales : pied de page (35 px par tour), ligne
             propre sous les commandes (une ligne de plus), puis dans la rangée
             elle-même. C'est sa quatrième et la bonne : le journal est
             exactement ce qu'on ouvre pour comprendre ou signaler une partie,
             et la graine est ce qui permet de la rejouer. Elle ne coûte plus
             rien à l'écran de jeu, et elle est là quand elle sert. */
          titre={`Journal de la partie${vm.gameSeed != null ? ` · graine ${vm.gameSeed}` : ""}`}
          onClose={() => vm.setShowJournal(false)}
          largeur={860}
          pied={
            /* SIGNALER vit ici depuis le 2026-08-28 : c'est en relisant le
               journal qu'on décide de signaler quelque chose, et le fichier
               qu'il enregistre contient précisément ce qu'on est en train de
               lire, graine comprise. */
            <button
              onClick={vm.telechargerRapport}
              title="Enregistre l'état exact de la partie dans un fichier, pour pouvoir rejouer ce qui vient de se passer"
              style={{
                background: "none", border: `1px solid ${T.rule}`, borderRadius: T.rChip,
                color: T.dim, padding: "5px 11px", cursor: "pointer",
                ...label(T.dim, T.micro),
              }}
            >
              Signaler cette partie
            </button>
          }
        >
          <DecisionPanels vm={vm} vue="journal" />
        </Superposition>
      )}

      {/* Le podium ne s'ouvre PAS à `gameOver` mais quand le classement est
          réellement connu : tant qu'un Bloc Vert n'est pas placé, les totaux
          sont provisoires et le vainqueur peut encore changer. */}
      {vm.showPodium && vm.versDeposesEtEngages && vm.classementFinalPartie?.length > 0 && (
        <PodiumFinal
          classement={vm.classementFinalPartie}
          titanDisplayName={vm.titanDisplayName}
          titanModes={vm.titanModes}
          onClose={() => vm.setShowPodium(false)}
        />
      )}

      {/* Page Règles en superposition. Le reste de l'arbre React n'est pas
          démonté : on retrouve la partie exactement où on l'a laissée. */}
      {vm.showRules && (
        <Suspense fallback={null}>
          <RulesPage
            onClose={() => vm.setShowRules(false)}
            onOuvrirTutoriel={() => { vm.setShowRules(false); vm.setShowTutoriel(true); }}
          />
        </Suspense>
      )}

      {/* Le tutoriel, même mécanique que les Règles : une superposition, la
          partie intacte derrière. Sa dernière page ouvre le livret — on ferme
          l'un en ouvrant l'autre, pour ne jamais avoir deux plein-écrans
          empilés. */}
      {vm.showTutoriel && (
        <Suspense fallback={null}>
          <TutorielPage
            onClose={() => vm.setShowTutoriel(false)}
            onOuvrirRegles={() => { vm.setShowTutoriel(false); vm.setShowRules(true); }}
          />
        </Suspense>
      )}

      {/* Le Trophée Arc-en-ciel, en dernier : c'est une célébration qui passe
          par-dessus TOUT, y compris les Règles et le tutoriel s'ils sont
          ouverts. Elle n'intercepte aucun clic et s'efface d'elle-même au bout
          de trois secondes. */}
      <RainbowCelebration vm={vm} />
    </div>
  );
}
