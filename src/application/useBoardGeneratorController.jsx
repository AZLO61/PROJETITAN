import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Domain from "../domain/index.js";
import { TITAN_COLORS } from "../ui/titans/constants.js";
import SetupScreen from "../ui/SetupScreen.jsx";
/* Partie à distance. Le contrôleur ne parle jamais au réseau directement : il
   passe par ces trois fonctions, qui décident CE QUI est public (le plateau) et
   ce qui ne l'est pas (les mains). Cf. `src/net/session.js`. */
import { plateauPublic, mainPrivee, fusionnerMain } from "../net/session.js";
// La recherche des IA, dans un Web Worker quand le navigateur en a un.
import { penser } from "./penseeIA.js";
import { jouerJingleFin } from "../ui/audio.js";

/* Destructuration du domaine au NIVEAU MODULE, et non plus à l'intérieur du
   hook. Ces fonctions sont des constantes de module : les déclarer dans le
   corps du composant en faisait, aux yeux de `react-hooks/exhaustive-deps`,
   des valeurs susceptibles de changer d'un rendu à l'autre — d'où une
   trentaine d'avertissements sans objet qui noyaient les vrais. Aucun
   identifiant ne change, seul leur emplacement bouge. */
const {
  STOCK_INITIAL, COULEURS, COLOR_HEX, ROWS, BUILDING_ROWS, BUILDING_COLS, socleMarker, isSocleMarker, socleValue, isBuildingCell,
  countStandingBuildings, countColorOnBoard, countActiveTeleporters, checkEndGameTriggers, manchesMax, shuffle, buildBag, getQuadrant, generateBoard,
  CORNERS, TITAN_GRADIENT, ACTION_CARDS, CARD_LABEL, PHASES, getActivePhases, PHASE_LABELS, EVENT_NAMES, placeTitans, getPlacementCells, placerTitanInitial, nextDetonateur,
  rowIndex, rowFromIndex, getPerimeter, computeEnergyToutCasser, releaseSocle, projectInDirection, estSurLePlateau, indexerTitans, rentrerEnJeu,
  resolveToutCasserBatiments, resolveToutCasserBlocs,
  resolveToutCasserTitans, resolveToutCasserAmas, resolveToutCasser, releverPercussion, listerCiblesToutCasser, resolveToutCasserCase, computeEnergieParDistance, PORTEE_TETE_EN_AVANT, resolveTeteEnAvant,
  scanGraouhhhAxis, advanceGraouhhh, isLanterneRouge, getJeNePartagePasPool, getJeNePartagePasCount, resolveJeNePartagePasElement, deplacerSiDerniereCaseLibre, resolveJeNePartagePas, PORTEE_BOING_BOING, getBoingBoingReach, resolveBoingBoing,
  appliquerReplElement, marquerDebutDeCarte, basculerToursSousTitans,
  canRage, canDil, optionsADesigner, SOCLE_OPTION, ADRENALINE_OPTION, getDilOptions, makeDecisionRequest, getEcroulementCells, resolveEcroulementAmas,
  getActiveTeleporterCells, getFreeAdjacentCells, getMovementReachable, getMovePath, resolveFreeMovement,
  getRecuperationPool, resolveRecuperation, retirerPileVide, programCards, ensureProgrammableHand, discardCardHidden, getNonPlayedPool, sendCardToOwnRepos, resolveVolPhaseRepos,
  resolveFatigue, refuserFatigue, applyRestitution, getProgrammedSum, getFPMCTargets, resolveFautPasMeChauffer, BAREME, BAREME_ORANGE_PAIRES, STANDARD_COLORS,
  scoreBareme, PODIUM_POINTS, rankWithTies, countRepaireColors, computeFinalScore, classementFinal,
  pick,
  setSeed,
  // IA : profils et choix de coup (cf. src/domain/aiEvaluation.js et aiPlanner.js)
  FORCES, TEMPERAMENTS, makeProfile, profileLabel, bestVertAssignment, reglagesDe,
  rendreCartesEmpruntees,
  // Les autres planificateurs passent par `penser` (cf. `penseeIA.js`).
  planRecuperation, choisirRepartitionEcroulement,
  // Ce qu'une IA tranche pour de vrai : le même code que le simulateur.
  trancherDecisionIA, optionsDesigneesIA, reponseCibleIA,
  acheminerPerte, iaRefuseFatigue, trancherReplisIA, miseDefenseFpmc,
  tiragesAveuglesSecrets,
} = Domain;

/* Ce qu'une IA tranche pour de vrai — valeur d'une option de Dilemme,
   arbitrage de l'Adrénaline, route du bloc perdu, refus de Fatigue, replis —
   vit dans le domaine depuis le 2026-09-21 (cf. aiPlanner.js, « CE QUE L'IA
   TRANCHE POUR DE VRAI »). Ces règles étaient écrites ici, hors d'atteinte du
   simulateur, qui en appliquait donc d'autres : le contrôleur et les
   campagnes exécutent maintenant le même code. */

export function useBoardGeneratorController() {
  const [nbJoueurs, setNbJoueurs] = useState(4);
  const [setupDone, setSetupDone] = useState(false);
  /* File du PLACEMENT D'OUVERTURE (Nikola, 2026-08-28) : les Titans restant à
     poser, dans l'inverse de l'initiative, Détonateur en dernier. Vide en
     dehors de cette séquence. Les IA s'y résolvent seules, un humain attend
     son clic — et voit donc, à SON tour, exactement qui est déjà posé. */
  const [placementRestant, setPlacementRestant] = useState([]);
  const placementRestantRef = useRef([]);
  const [eventsEnabled, setEventsEnabled] = useState(false);
  const [state, setState] = useState(() => generateBoard());
  const [titanState, setTitanState] = useState(() => placeTitans(4));
  // `actionLog` et `looseBlocks` sont déclarés ICI, en tête, et non plus au
  // milieu du fichier : `advanceManche` doit lire `looseBlocks` pour évaluer
  // les déclencheurs de fin de partie, et un tableau de dépendances est
  // évalué au moment du rendu — une déclaration plus bas provoquerait une
  // ReferenceError de zone morte temporelle.
  const [actionLog, setActionLog] = useState([]);
  /* Lu par la diffusion réseau du journal (cf. plus bas) : cet effet doit
     connaître le journal COURANT depuis un abonnement `presence` créé une
     seule fois par session, donc une fermeture classique y verrait une
     valeur figée au moment du branchement. */
  const actionLogRef = useRef([]);
  useEffect(() => { actionLogRef.current = actionLog; }, [actionLog]);
  const [looseBlocks, setLooseBlocks] = useState({});
  /* Files de DÉCISIONS EN ATTENTE, déclarées ici en tête pour la même
     raison que `actionLog` et `looseBlocks` juste au-dessus : les effets de
     Phase, plus haut dans le corps du hook, doivent les lire dans leur
     tableau de dépendances — et un tableau de dépendances est évalué AU
     RENDU. Une déclaration plus bas provoquerait une ReferenceError de zone
     morte temporelle. Leur documentation détaillée est restée à leur ancien
     emplacement, avec le reste de la mécanique de repli. */
  const [decisionQueue, setDecisionQueue] = useState([]);
  const [repliQueue, setRepliQueue] = useState([]);
  const [ecroulement, setEcroulement] = useState(null);
  /* File de Tout Casser : les éléments qu'il reste à projeter, dans l'ordre que
     le joueur décide (cf. `jouerToutCasser`). Déclarée ICI, avec les autres
     résolutions en plusieurs temps, et non près de la carte qui la remplit :
     `captureSnapshot` la cite dans ses dépendances, et un tableau de
     dépendances est évalué AU RENDU — une déclaration plus bas donnerait une
     ReferenceError de zone morte temporelle. */
  const [toutCasserFile, setToutCasserFile] = useState(null);
  const currentDecision = decisionQueue[0] || null;
  const currentRepli = repliQueue[0] || null;
  const [seedCount, setSeedCount] = useState(1);
  /* ── UNE PARTIE CHASSE L'AUTRE, Y COMPRIS DANS LES MINUTEURS EN VOL ──
     Défaut trouvé à l'audit du 2026-09-03. Deux familles de minuteurs
     survivent à « Nouvelle partie », et rien ne les arrêtait :

     · la cascade du tour d'une IA (déplacement à +2,6 s, carte à +5,2 s,
       récupération à +7,8 s), dont l'effet portait la note « pas de cleanup :
       les timers doivent s'exécuter jusqu'au bout même si le composant
       re-render » — vraie pour un simple rendu, fausse pour une régénération ;
     · les trois secondes d'animation que `BoardPanel` s'accorde avant
       d'appeler `jouerToutCasser` / `jouerGraouhhh` / `jouerFautPasMeChauffer`.

     Les deux lisent les MIROIRS (`aiTitanStateRef` & co.), synchronisés sur
     l'état courant : après une régénération ils désignaient donc de vrais
     Titans de la NOUVELLE partie, avec des cases et des directions calculées
     sur l'ancienne. Un Titan bougeait tout seul quelques secondes après le
     lancement, une carte se jouait sans main pour la porter, et le panneau
     « clique les cibles » s'ouvrait sur des cases qui n'existaient plus.

     `partieRef` est incrémenté SYNCHRONEMENT par `regenerate` : tout ce qui a
     été programmé avant compare et abandonne. `partieId`, lui, est de l'état
     — il force React à recréer les callbacks `jouer*`, pour que la valeur
     capturée dans leur closure soit celle du rendu qui les a créés. Les deux
     sont nécessaires : la ref dit « où on en est », l'état dit « d'où je
     viens ». */
  const partieRef = useRef(0);
  const [partieId, setPartieId] = useState(0);
  // Minuteurs de la cascade IA encore en vol, pour les couper à la source.
  const aiTimersRef = useRef([]);
  const annulerTimersIA = useCallback(() => {
    aiTimersRef.current.forEach(clearTimeout);
    aiTimersRef.current = [];
  }, []);
  /* GRAINE DE LA PARTIE (Nikola, 2026-08-24 : « rejouer une partie depuis sa
     graine »). Le module RNG etait deja seme et deterministe, mais l'APPLICATION
     ne l'appelait jamais : seul le simulateur le faisait. Une partie jouee a la
     table n'etait donc pas rejouable, et sa graine n'etait meme pas enregistree.
     regenerate() la fixe desormais explicitement et la retient. */
  const [gameSeed, setGameSeed] = useState(null);
  const [seedInput, setSeedInput] = useState("");
  const [mancheNumber, setMancheNumber] = useState(1);
  const [activePlayerId, setActivePlayerId] = useState(() => titanState.detonateur);

  // { 1: "humain"|"ia", 2: "humain"|"ia", ... }
  const [titanModes, setTitanModes] = useState({ 1: "humain", 2: "humain", 3: "humain", 4: "humain" });
  // { 2: { force, temperament }, ... } — profil de chaque Titan piloté par
  // l'IA. Tiré au sort à chaque nouvelle partie et JAMAIS affiché tant que
  // le joueur ne le demande pas (cf. profilsReveles) : deux parties de
  // suite avec les mêmes adversaires ne doivent pas se ressembler, et
  // savoir qui est l'Expert d'avance retirerait tout l'intérêt.
  // `profilsImposes` permet de figer les profils pour les campagnes de
  // simulation, où un tirage aléatoire rendrait les résultats
  // ininterprétables (on ne saurait plus si un Titan perd à cause de sa
  // position ou parce qu'il a tiré Novice trois fois de suite).
  const [titanProfiles, setTitanProfiles] = useState({});
  const [profilsImposes, setProfilsImposes] = useState(null);
  /* DIFFICULTÉ DE LA PARTIE — Nikola, 2026-08-28 : « j'aimerais avoir
     4 niveaux de difficulté clairement distincts ».

     La force de chaque IA était TIRÉE AU SORT, uniformément. C'était voulu
     — deux parties de suite ne devaient pas se ressembler — mais personne
     n'avait posé le calcul : à trois IA en face, 25,9 % des parties
     comptaient deux débutants ou plus, et 29,6 % n'avaient aucun Expert.
     Une soirée sur quatre tombait sur une table molle sans qu'aucun réglage
     n'ait bougé, et c'est ce que Nikola a lu comme « les IA sont moins
     fortes qu'avant ».

     Le niveau choisi s'applique donc à TOUTES les IA, et il est le seul à
     décider de leur force. La variété change de porte : les TEMPÉRAMENTS
     restent tirés au sort (voir `tirerProfils`), et ce sont eux qui font
     que deux parties ne se ressemblent pas — sans jamais faire varier la
     difficulté annoncée. */
  const [difficulte, setDifficulte] = useState(FORCES.MOYEN);
  /* Ce que fait le vol de Phase Repos, choisi avant le lancement (Nikola,
     2026-08-28). "main" = la carte est empruntée par le voleur pour une
     Manche puis rendue ; "repos" = elle part au frigo chez sa victime,
     la règle d'origine. Le défaut vit ici, et nulle part ailleurs. */
  const [modeVolRepos, setModeVolRepos] = useState("main");
  // Titans dont le profil a été dévoilé (easter-egg des 10 clics, ou
  // révélation générale de fin de partie).
  const [profilsReveles, setProfilsReveles] = useState({});

  // Dévoile le profil d'un Titan. Appelé par l'easter-egg des 10 clics sur
  // l'encart d'un Titan, et par la révélation générale de fin de partie.
  const revelerProfil = useCallback((id) => {
    setProfilsReveles((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, []);

  const tirerProfils = useCallback((modes, nb) => {
    if (profilsImposes) return { ...profilsImposes };
    // La FORCE vient du niveau choisi, la même pour toutes les IA : c'est
    // ce que « quatre niveaux de difficulté » veut dire. Seul le
    // TEMPÉRAMENT est tiré au sort — il change la façon de jouer, jamais la
    // force, et c'est lui qui fait que deux parties ne se ressemblent pas.
    const temperaments = Object.values(TEMPERAMENTS);
    const out = {};
    for (let id = 1; id <= nb; id++) {
      if (modes[id] !== "ia") continue;
      out[id] = makeProfile(difficulte, pick(temperaments));
    }
    return out;
  }, [profilsImposes, difficulte]);

  // { 1: "Max", 2: "Étagère", ... } — nom personnalisé choisi en config
  // (session, demande Nikola : "j'ai le droit de choisir mon nom"). Vide
  // par défaut → fallback affiché "Titan {id}" partout (cf. titanDisplayName).
  const [titanNames, setTitanNames] = useState({ 1: "", 2: "", 3: "", 4: "" });
  // Nom complet affiché ("Max" si renseigné, sinon fallback "Titan {id}").
  const titanDisplayName = useCallback(
    (id) => (titanNames[id] && titanNames[id].trim()) || `Titan ${id}`,
    [titanNames]
  );
  // Version compacte pour les contextes à espace réduit (colonnes de
  // tableau, badges) — mêmes règles, fallback "T{id}".
  const titanShort = useCallback(
    (id) => (titanNames[id] && titanNames[id].trim()) || `T${id}`,
    [titanNames]
  );
  const [aiPlaying, setAiPlaying] = useState(false); // true pendant qu'une IA joue
  const [aiStepLabel, setAiStepLabel] = useState(""); // étape visible dans l'UI
  const aiPlayingRef = useRef(false);
  const setAiPlayingSync = (val) => { aiPlayingRef.current = val; setAiPlaying(val); if (!val) setAiStepLabel(""); };

  const [phase, setPhase] = useState("evenement");
  const [phaseValidated, setPhaseValidated] = useState({});
  /* Le dernier motif de blocage déjà écrit au journal, pour ne l'écrire
     qu'une fois (cf. « QUAND ON NE PASSE PAS, ON DIT POURQUOI »). */
  const blocageSignaleRef = useRef(null);
  /* Le pendant côté tour d'IA : (Titan, motif) déjà signalé. */
  const blocageIaRef = useRef(null);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [rainbowWinnerId, setRainbowWinnerId] = useState(null);
  const [showScoring, setShowScoring] = useState(false);
  /* Journal en superposition (Nikola, 2026-08-28). Ce n'est PAS un état de
     partie : il ne part pas dans l'instantané d'annulation, et « Annuler » ne
     doit pas refermer un panneau de lecture qu'on avait ouvert. Le décompte,
     lui, y figure déjà — c'est un héritage, pas un modèle à suivre. */
  const [showJournal, setShowJournal] = useState(false);
  /* Podium de fin. Il s'ouvre TOUT SEUL la première fois que le classement
     devient connu, et une seule fois : le refermer doit tenir. */
  const [showPodium, setShowPodium] = useState(false);
  const podiumDejaOuvert = useRef(false);
  // Fin de partie atteinte. Distinct de `showScoring`, qui n'est qu'un
  // panneau consultable : `gameOver` arrête réellement la partie et empêche
  // la boucle de phases de repartir en Programmation. Sans lui, la fin de
  // partie détectée dans advanceManche relançait quand même une Manche
  // fantôme — le jeu revenait en Programmation sur la dernière Manche, sans
  // cartes à programmer, et restait figé là (bug remonté par Nikola le
  // 2026-08-17 : « je suis repassé en programmation mais en manche 4, donc
  // il n'y a rien qui se passe »).
  const [gameOver, setGameOver] = useState(false);
  const [show3D, setShow3D] = useState(false);
  // Page Règles : simple drapeau d'affichage. Le contrôleur n'est jamais
  // démonté quand elle s'ouvre, donc la partie en cours (plateau, Titans,
  // Manche, cartes, pile d'undo) est intégralement conservée.
  const [showRules, setShowRules] = useState(false);
  /* Le tutoriel (Nikola, 2026-09-01 : « il faudrait un bouton tutoriel pour voir
     les principes du jeu rapidement et le fonctionnement des cartes
     visuellement »). Une bascule comme les Règles, et pour la même raison : la
     partie reste montée derrière, on la retrouve exactement où on l'a laissée. */
  const [showTutoriel, setShowTutoriel] = useState(false);
  /* ══════════════════════════════════════════════════════════
     PARTIE À DISTANCE (Nikola, 2026-08-29)
     ══════════════════════════════════════════════════════════
     « J'aimerais pouvoir jouer avec des joueurs à distance en donnant un ID de
     session et son mot de passe. »

     UN SEUL ARBITRE. L'hôte fait tourner le moteur exactement comme en local —
     rien de ce qui suit ne s'applique à lui, sinon diffuser ce qu'il vient de
     calculer. Les invités ne calculent RIEN : ils reçoivent le plateau et
     renvoient des intentions.

     C'est le seul modèle honnête avec ce codebase. Faire tourner les règles en
     double chez quatre joueurs, en espérant qu'elles restent d'accord manche
     après manche, c'est signer pour une classe de bugs qu'on ne referme jamais
     — et ce jeu en a déjà refermé assez.

     TROIS CHOSES SEULEMENT changent dans ce contrôleur :
       1. chez un invité, tout ce qui MUTE l'état de partie se tait (les gardes
          `distantInvite` semées dans les effets plus bas) ;
       2. chez l'hôte, un effet diffuse l'instantané après chaque changement ;
       3. les actions d'un invité partent en intentions au lieu de s'exécuter.

     Le reste du fichier ne sait pas que le réseau existe. */
  const [session, setSession] = useState(null);
  const [distantJoueurs, setDistantJoueurs] = useState([]);
  const [distantSieges, setDistantSieges] = useState({});   // { titanId: refInvite }
  const [distantAvis, setDistantAvis] = useState(null);     // message d'état de la liaison
  // Un envoi « tire et oublie » qui échoue le dit dans le bandeau de liaison.
  const avisEnvoiRate = (quoi) => (e) => setDistantAvis(`${quoi} n'est pas partie : ${e?.message || "liaison coupée"}`);
  /* Garde-fou du F5 de l'hôte : quand cette page rejoint une table qui a déjà
     une partie alors qu'elle-même n'en a pas, elle ne publie RIEN — sans quoi
     son plateau neuf écraserait celui de toute la table (cf. `brancherSession`).
     La ref sert à l'effet de diffusion, l'état à l'interface : les deux disent
     la même chose, mais l'effet ne doit pas attendre un rendu pour se taire. */
  const diffusionBloqueeRef = useRef(false);
  const [distantDiffusionBloquee, setDistantDiffusionBloquee] = useState(false);
  /* `setupDone` lu depuis un callback réseau : la version d'état y serait
     figée au rendu qui a créé le callback. */
  const setupDoneRef = useRef(false);
  const [distantFin, setDistantFin] = useState(null);       // partie terminée côté réseau
  const [distantChat, setDistantChat] = useState([]);
  /* ── QUI VIENT D'ARRIVER, QUI VIENT DE PARTIR ──
     Nikola, 2026-09-01 : « si un joueur quitte la partie il faut un petit
     panneau bien lisible pour ne pas le rater, pareil s'il rejoint ».

     La table savait déjà tout : `distantJoueurs` change à chaque présence
     reçue. Mais rien ne le DISAIT — un joueur disparaissait de la liste des
     sièges au milieu d'une partie, et son Titan se mettait à jouer tout seul
     sans que personne comprenne pourquoi. C'est l'événement le plus important
     de la liaison, et le seul qui n'avait aucun bandeau.

     Ce sont des NOUVELLES, pas de l'état : elles s'affichent puis s'effacent
     (cf. le minuteur de `signalerMouvement`). Le fil est court, deux entrées
     suffisent — au-delà, ce n'est plus une nouvelle, c'est le journal. */
  const [distantMouvements, setDistantMouvements] = useState([]);
  const compteurMouvementRef = useRef(0);
  const signalerMouvement = useCallback((type, pseudo) => {
    compteurMouvementRef.current += 1;
    const id = compteurMouvementRef.current;
    setDistantMouvements((prev) => [...prev.slice(-1), { id, type, pseudo }]);
    // Neuf secondes : le temps de lever les yeux du plateau au milieu d'un
    // tour. En dessous, la nouvelle passe pendant qu'on regarde ailleurs.
    setTimeout(() => setDistantMouvements((prev) => prev.filter((m) => m.id !== id)), 9000);
  }, []);
  /* La main d'un invité arrive par un canal séparé de l'instantané : le plateau
     diffusé à toute la table a les mains masquées, sans quoi la programmation
     secrète tomberait à la première console ouverte. */
  const [mainPriveeRecue, setMainPriveeRecue] = useState(null);
  const [etatDistantRecu, setEtatDistantRecu] = useState(null);
  const sessionRef = useRef(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const distantInvite = session?.siege === "invite";
  const distantHote = session?.siege === "hote";
  useEffect(() => { setupDoneRef.current = setupDone; }, [setupDone]);
  // L'hôte d'une partie à distance tire Socle, Fatigue et Vol hors de la graine (cf. rng.js).
  useEffect(() => {
    tiragesAveuglesSecrets(distantHote);
    return () => tiragesAveuglesSecrets(false);
  }, [distantHote]);

  /* Reprendre la main malgré tout : l'hôte assume d'écraser la partie de la
     table par celle de cette page. Un seul cas légitime — l'onglet d'origine
     est perdu pour de bon et tout le monde accepte de repartir. Le geste est
     donc EXPLICITE, jamais automatique. */
  const reprendreDiffusion = useCallback(() => {
    diffusionBloqueeRef.current = false;
    dernierEnvoiRef.current = "";
    dernieresMainsRef.current = {};
    setDistantDiffusionBloquee(false);
    setDistantAvis("Diffusion reprise — le plateau de cette page remplace celui de la table.");
  }, []);
  /* La table des sièges lue au moment où une intention s'exécute, jamais celle
     capturée par la fermeture de l'effet : deux invités qui réclament un Titan
     coup sur coup arrivent dans le même rendu, et le second lirait sinon une
     table d'où le premier siège est absent — ils repartiraient tous deux avec
     le même Titan. */
  const distantSiegesRef = useRef({});
  useEffect(() => { distantSiegesRef.current = distantSieges; }, [distantSieges]);

  /* ── POURQUOI UNE REF ET PAS LA VALEUR ────────────────────
     Une douzaine d'effets doivent se taire chez un invité. Passer par leur
     tableau de dépendances obligerait à ajouter `distantInvite` à douze
     endroits, dont trois qui portent déjà un `eslint-disable` pour de bonnes
     raisons documentées — et un oubli laisserait un effet tourner avec la
     valeur du rendu PRÉCÉDENT, c'est-à-dire `false` juste après avoir rejoint
     une partie : le moteur de l'invité se remettrait à muter le plateau
     pendant la seule fenêtre où c'est le plus dangereux.

     Une ref est toujours à jour au moment où l'effet s'exécute, quels que
     soient les déclencheurs. C'est déjà l'idiome de ce fichier pour tout ce que
     l'IA doit lire sans le faire re-déclencher (cf. `aiTitanModesRef` et ses
     voisines). */
  const distantInviteRef = useRef(false);
  useEffect(() => { distantInviteRef.current = distantInvite; }, [distantInvite]);
  /* Le Titan que tient CE navigateur quand il est invité. `null` tant que
     l'hôte ne lui a pas donné de siège : il regarde alors la partie sans
     pouvoir agir, ce qui est exactement ce qu'on veut d'un spectateur. */
  const monTitanDistant = distantInvite
    ? Number(Object.keys(distantSieges).find((id) => distantSieges[id] === session.ref)) || null
    : null;
  // Miroir toujours à jour, pour les gardes qui ne veulent pas se relancer à
  // chaque rendu (même motif que `distantInviteRef` juste au-dessus).
  const monTitanDistantRef = useRef(null);
  useEffect(() => { monTitanDistantRef.current = monTitanDistant; }, [monTitanDistant]);

  /* ── LA MAIN D'UN JOUEUR DISTANT NE SE REGARDE PAS ────────
     Nikola, 2026-08-30 : « si je suis hôte, je ne dois pas voir la
     programmation, les déplacements ou les cartes des autres joueurs tant que
     ce n'est pas validé de leur part ».

     En local, le secret tient à la rotation de l'appareil : `cartesVisibles`
     ne montre la main que du Titan à qui c'est le tour, et l'appareil change
     de mains entre les tours. À distance, cette rotation n'existe plus — et
     l'hôte, qui fait tourner le moteur, a TOUTES les mains dans son état. Il
     lui suffisait de cliquer la plaque d'un adversaire pendant la Phase
     Programmation pour lire son jeu.

     La règle est donc posée là où elle se vérifie sans discuter : une main
     appartient à celui qui la tient. Un Titan confié à un invité est masqué
     chez l'hôte, un Titan qui n'est pas le sien est masqué chez l'invité — qui
     de toute façon ne le reçoit pas, `plateauPublic` l'ayant déjà retiré. Les
     deux bouts disent la même chose, et l'hôte n'est plus le seul à qui l'on
     demande d'être honnête.

     Hors partie en ligne, rien ne change : la règle locale reste seule. */
  const titanMasque = useCallback((id) => {
    if (!session) return false;
    if (distantInvite) return Number(id) !== monTitanDistant;
    return Boolean(distantSieges[id]);
  }, [session, distantInvite, monTitanDistant, distantSieges]);

  /* ── ON NE S'ASSIED PAS À LA PLACE DE QUELQU'UN D'AUTRE ──
     Nikola, 2026-09-01 : « en tant qu'hôte je ne dois jamais avoir accès aux
     panneaux des autres joueurs ».

     `titanMasque` fermait les CARTES ; le panneau du Titan, lui, s'ouvrait
     toujours — un clic sur la plaque d'un adversaire donnait à l'hôte ses
     passifs, son étape de tour et ses commandes. La sélection elle-même est
     donc refusée, et le refus vit sur le setter exposé à l'interface plutôt
     que dans chaque panneau qui l'appelle : c'est le seul endroit qui ne peut
     pas être oublié.

     ⚠️ Le setter BRUT (`setSelectedTitanId`) reste utilisé à l'intérieur de ce
     fichier, et c'est voulu : l'exécuteur d'intentions doit pouvoir adopter
     momentanément le siège d'un invité pour jouer son coup, puis rendre la
     main. Ce n'est pas une consultation, c'est un passage de relais, et il est
     borné par la liste blanche des actions distantes. */
  const selectionnerTitanDepuisInterface = useCallback((valeur) => {
    setSelectedTitanId((actuel) => {
      const voulu = typeof valeur === "function" ? valeur(actuel) : valeur;
      if (voulu == null) return voulu;
      if (distantSiegesRef.current[voulu] && !distantInviteRef.current) return actuel;
      if (distantInviteRef.current && monTitanDistantRef.current != null && Number(voulu) !== monTitanDistantRef.current) return actuel;
      return voulu;
    });
  }, []);

  const [vertAssignments, setVertAssignments] = useState({});
  /* QUI A VALIDÉ SES VERTS — Nikola, 2026-08-28 : « quand j'ai fait le choix
     des Verts au scoring, je dois valider, et après ça ne peut plus se
     changer ».

     Sans ce verrou, les menus restaient modifiables tant que le panneau
     était ouvert : on pouvait voir le pré-score des autres se mettre à jour
     et revenir sur son propre placement. Le placement des Verts est le
     dernier geste secret de la partie, il doit s'engager comme tel. */
  const [vertsValides, setVertsValides] = useState({});
  const validerVerts = useCallback((titanId) => {
    setVertsValides((prev) => (prev[titanId] ? prev : { ...prev, [titanId]: true }));
  }, []);
  const [apocalypseThreshold, setApocalypseThreshold] = useState(5);
  /* ── LES ÉGALITÉS EN LANTERNE ROUGE ──
     Nikola, 2026-09-01 : « rajoute dans la configuration : les égalités en
     "Lanterne Rouge" ne fonctionnent plus — on coche ou pas ».

     Coché (défaut) : tous les Titans les moins dotés touchent le bonus, comme
     depuis toujours. Décoché : seul celui qui est SEUL dernier y a droit — à
     égalité, personne. La règle elle-même vit dans le moteur
     (`isLanterneRouge`) ; ce champ ne fait que la lui transmettre. */
  const [egalitesLanterneRouge, setEgalitesLanterneRouge] = useState(true);

  const regenerate = useCallback((graineVoulue) => {
    // Chez un invité, la partie appartient à l'hôte : un plateau neuf tiré ici
    // restait affiché, faux, jusqu'au coup suivant de l'hôte (audit du 2026-09-23).
    if (distantInviteRef.current) return;
    /* PREMIER GESTE : couper ce qui appartient à la partie qu'on abandonne.
       Les minuteurs déjà programmés lisent des miroirs qui, dans un instant,
       décriront la partie SUIVANTE — ils y appliqueraient des coups calculés
       sur celle-ci (cf. `partieRef`). On les annule, et on incrémente le
       compteur pour que ceux qu'on ne peut plus annuler (déjà dépilés)
       renoncent d'eux-mêmes.

       Le compteur bouge ICI, synchroniquement, parce que c'est lui qui fait
       renoncer les minuteurs. L'annulation elle-même vit dans un effet plus
       bas (« NETTOYAGE D'UNE PARTIE ABANDONNÉE ») : `arreterTrace` et
       `traceTimersRef` sont déclarés après cette fonction, et les nommer dans
       le tableau de dépendances d'un `useCallback` rendu ici lèverait la zone
       morte temporelle que ce fichier documente déjà plus haut. Le décalage
       d'un commit est sans conséquence — les minuteurs visés se déclenchent
       en secondes. */
    partieRef.current += 1;
    setPartieId(partieRef.current);
    setAiStepLabel("");
    /* La graine est posee AVANT toute generation : le plateau, la position des
       Titans, l'ordre de jeu, le Detonateur et les profils d'IA en dependent
       tous. Passer `undefined` tire une graine imprevisible, comme une partie
       normale ; passer un nombre rejoue exactement la meme partie. */
    const graine = setSeed(
      graineVoulue === undefined || graineVoulue === null || graineVoulue === ""
        ? undefined
        : Number(graineVoulue) >>> 0
    );
    setGameSeed(graine);
    const newState = generateBoard();
    /* `titanModes` décide si le placement est interactif. Un plateau tout IA
       (campagne, simulateur, aperçu d'accueil) est placé d'un bloc comme
       avant, donc les graines des campagnes restent valables. */
    const newTitans = placeTitans(nbJoueurs, titanModes);
    setPlacementRestant(newTitans.ordrePlacement || []);
    setState(newState);
    setTitanState(newTitans);
    setSeedCount((n) => n + 1);
    // Nouvelle partie : le podium redevient ouvrable.
    podiumDejaOuvert.current = false;
    setShowPodium(false);
    setMancheNumber(1);
    setActivePlayerId(newTitans.detonateur);
    setPhase(getActivePhases(eventsEnabled)[0]);
    setPhaseValidated({});
    setCurrentEvent(null);
    setRainbowWinnerId(null);
    setShowScoring(false);
    setGameOver(false);
    setActionLog([]);
    setLooseBlocks({});
    setSelectedTitanId(null);
    setDecisionQueue([]);
    setRepliQueue([]);
    setProgSelection([]);
    setVolDirection(null);
    cardsPlayedCountRef.current = {};
    setWaitingNextTitan(false);
    setFpmcAttackerId(null);
    setFpmcPendingIds([]);
    setFpmcCurrent(null);
    setFatiguesEnAttente([]); // une Fatigue en suspens n'appartient qu'à la partie abandonnée
    setMoveMode(false);
    setRecupMode(false);
    setPassifUsed({});
    setBbMode(false);
    setBbPath([]); setBbSurvol([]);
    setJnpMode(false);
    setJnpSelected([]);
    setGraouMode(false);
    setVertAssignments({});
    setVertsValides({});
    setAiPlayingSync(false);
    setTitanProfiles(tirerProfils(titanModes, nbJoueurs));
    setProfilsReveles({});
  }, [nbJoueurs, eventsEnabled, titanModes, tirerProfils]);

  const advanceManche = useCallback(() => {
    // ── FIN DE PARTIE ──
    // Deux défauts corrigés ici d'un coup.
    //
    // 1) `manchesMax` était appelée sans jamais avoir été importée : variable
    //    libre, donc ReferenceError à la fin de CHAQUE Manche, et le jeu
    //    inutilisable au-delà de la Manche 1. Elle est désormais
    //    destructurée avec le reste du domaine, en tête de module.
    //
    // 2) Les trois déclencheurs « plateau » du livret (Apocalypse Urbaine,
    //    Pénurie, Vide Spatial) étaient calculés par checkEndGameTriggers,
    //    affichés dans le bandeau d'en-tête... et rien de plus. Aucun ne
    //    terminait la partie. Ils passent maintenant par le même contrôle
    //    que la limite de Manches — checkEndGameTriggers renvoyant DÉJÀ la
    //    raison « dernière Manche », il n'y a plus qu'une seule condition
    //    d'arrêt, et donc plus de risque de divergence entre les deux.
    //
    // Le moment est le bon : le livret précise que la partie s'arrête à la
    // FIN de la Manche en cours, jamais en plein tour.
    const raisonsFin = checkEndGameTriggers(state.board, looseBlocks, apocalypseThreshold, mancheNumber, nbJoueurs);
    if (raisonsFin.length > 0) {
      setActionLog((prev) => [...prev, `🏁 Fin de partie après ${mancheNumber} Manche(s) :`, ...raisonsFin]);
      setShowScoring(true);
      setGameOver(true);
      setActivePlayerId(null);
      // `false` = la partie ne continue pas. L'appelant s'en sert pour NE PAS
      // enchaîner sur la phase suivante : il remettait jusqu'ici la phase à
      // "Programmation" dans tous les cas, y compris celui-ci.
      return false;
    }
    // Repere de Manche dans le journal : sans separateur, retrouver ce qui
    // s'est passe au tour precedent obligeait a tout relire.
    setActionLog((prev) => [...prev, `— — — Manche ${mancheNumber + 1} — — —`]);
    setMancheNumber((n) => n + 1);
    setTitanState((prev) => {
      const players = prev.players.map((t) => {
        const clone = { ...t, hand: [...t.hand], programmed: [...t.programmed], repos: [...t.repos], playedThisManche: [], discardedHidden: [] };
        // Bug remonté (session) : playedThisManche/discardedHidden étaient
        // vidés SANS que les cartes qui n'ont pas été volées en Phase
        // Repos ne reviennent en main — elles disparaissaient purement et
        // simplement (perte de 2 cartes par Manche au lieu de 0, en plus
        // du décalage de timing sur la carte volée). Ces cartes doivent
        // revenir en main immédiatement, à la fin de la Manche.
        clone.hand.push(...t.playedThisManche, ...(t.discardedHidden || []));
        const returned = applyRestitution(clone, mancheNumber + 1);
        if (returned.length > 0) {
          /* log absorbed by action log elsewhere */
        }
        clone.adrenaline = (clone.adrenaline || 0) + 1;
        return clone;
      });
      const nextDet = nextDetonateur(prev.ordreJeu, prev.detonateur);
      return { ...prev, players, detonateur: nextDet };
    });
    // Le joueur actif suit désormais le Détonateur, seule source de vérité
    // sur qui ouvre la Manche (cf. correction du 2026-08-15). L'ancien
    // calcul faisait avancer d'un cran dans l'ordre de jeu à partir du
    // joueur courant, ce qui donnait un résultat sans rapport avec le
    // Détonateur — et de toute façon écrasé à l'ouverture de la Phase
    // Action.
    setActivePlayerId(nextDetonateur(titanState.ordreJeu, titanState.detonateur));
    setPassifUsed({});
    setMoveMode(false);
    setRecupMode(false);
    setMoveAdrenaline(0); setTeaAdrenaline(0); setTcAdrenaline(0); setBbAdrenaline(0);
    setVolDirection(null); // Phase Repos suivante : le nouveau Détonateur devra rechoisir un sens
    return true; // la partie continue
    // Dépendance sur `state` et non `state.board` : les résolveurs mutent le
    // plateau en place puis forcent le rendu par `setState((p) => ({ ...p }))`,
    // donc la référence de `.board` ne change jamais (même raison que pour le
    // useMemo de `endGameReasons` plus bas).
  }, [mancheNumber, nbJoueurs, titanState.ordreJeu, titanState.detonateur, state, looseBlocks, apocalypseThreshold]);

  /* ── RIEN NE COMMENCE TANT QUE LES QUATRE NE SONT PAS POSÉS ──
     Bug remonté par Nikola le 2026-08-29 : « je ne peux pas choisir mes cartes
     avant mon placement initial, car là ça a créé un bug : je ne vois aucun
     Titan et pourtant ils jouent ».

     La mise en place et la Programmation vivaient côte à côte sans se voir. La
     mise en place est une décision BLOQUANTE, mais rien ne l'imposait au
     moteur : les trois IA programmaient et validaient leur phase toutes
     seules, l'humain pouvait programmer par-dessus le bandeau de placement, et
     la Phase Action s'ouvrait dès que les quatre validations étaient là — sur
     un plateau où des Titans portaient encore `aPlacer`. Ils n'étaient donc
     dessinés nulle part (pas de `cell`) et jouaient quand même : exactement ce
     que décrit le retour.

     Le verrou vit ICI, dans le moteur de phases, et pas seulement dans
     l'interface : masquer les cartes aurait caché le symptôme en laissant
     l'enchaînement de phases capable de démarrer sans plateau. Quatre points
     s'y adossent — cette garde, son message, l'effet d'enchaînement et
     l'auto-validation IA — et tous lisent la même file `placementRestant`. */
  const placementEnCours = placementRestant.length > 0;

  const canValidatePhase = useCallback(
    (titanId) => {
      const t = titanState.players.find((p) => p.id === titanId);
      if (!t) return false;
      if (placementEnCours) return false;
      if (phase === "programmation") return t.programmed.length === 3;
      if (phase === "action") return t.programmed.length === 0;
      return true;
    },
    [phase, titanState.players, placementEnCours]
  );

  const getPhaseBlockReason = useCallback(
    (titanId) => {
      const t = titanState.players.find((p) => p.id === titanId);
      if (!t) return "";
      if (placementEnCours) return "Tous les Titans doivent d'abord prendre position sur le plateau.";
      if (phase === "programmation" && t.programmed.length !== 3) return "Programme d'abord tes 3 cartes.";
      if (phase === "action" && t.programmed.length !== 0) return "Il te reste des cartes programmées à jouer.";
      return "";
    },
    [phase, titanState.players, placementEnCours]
  );

  const validatePhase = useCallback(
    (titanId) => {
      if (!canValidatePhase(titanId)) return;
      setPhaseValidated((prev) => ({ ...prev, [titanId]: true }));
    },
    [canValidatePhase]
  );

  useEffect(() => {
    if (distantInviteRef.current) return; // à distance, seul l'hôte pioche
    if (!eventsEnabled || phase !== "evenement" || currentEvent !== null) return;
    const name = pick(EVENT_NAMES);
    setCurrentEvent(name);
  }, [phase, currentEvent, mancheNumber, eventsEnabled]);

  useEffect(() => {
    /* ── À DISTANCE, LE MOTEUR N'A QU'UN SEUL EXEMPLAIRE ──
       C'est la garde la plus importante des douze : sans elle, l'invité
       enchaînerait les phases de son côté et l'hôte du sien, chacun sur son
       rythme. Deux arbitres pour une partie, et un plateau qui se met à
       diverger sans que personne ne voie où. */
    if (distantInviteRef.current) return;
    if (gameOver) return; // la partie est finie : plus aucune phase ne s'enchaîne
    /* Une décision née de la Phase en cours se règle DANS cette Phase.
       Sans ce garde-fou, la Phase Action pouvait se clore sur un Dilemme
       encore ouvert : le bandeau DIL et celui du Vol de Phase Repos se
       retrouvaient à l'écran en même temps, et le bloc perdu tombait sur un
       plateau que la Manche suivante avait déjà commencé à changer. */
    /* ── QUAND ON NE PASSE PAS, ON DIT POURQUOI ──
       Nikola, 2026-09-07, sur les gels de parties IA. Le premier gel a été
       trouvé et corrigé ; il en reste au moins un plus loin, et le chercher a
       coûté cher pour une seule raison : quand cet effet refuse d'enchaîner,
       RIEN ne l'écrit. L'écran montre une Phase Action sans Titan actif, sans
       bandeau, sans bouton — et le journal n'a pas une ligne là-dessus.

       Les quatre motifs de refus sont connus et nommés ici. On les journalise
       une seule fois par motif (la ref évite d'inonder le journal, l'effet
       pouvant se rejouer à chaque rendu), et seulement quand la Phase est
       PRÊTE à s'enchaîner — sinon on écrirait à chaque tour de jeu normal.

       Aucun changement de comportement : c'est de l'instrumentation. Le
       prochain gel se nommera lui-même dans le rapport de partie. */
    const blocage = currentDecision ? "un Dilemme ou une RAGE non tranché"
      : currentRepli ? "un repli d'élément non placé"
      : ecroulement ? "un Amas non réparti"
      : placementEnCours ? "un Titan qui attend sa case de départ"
      : null;
    if (blocage) {
      const ids = titanState.ordreJeu;
      const pret = ids.every((id) => phaseValidated[id]);
      const signature = `${phase}|${mancheNumber}|${blocage}`;
      if (pret && blocageSignaleRef.current !== signature) {
        blocageSignaleRef.current = signature;
        setActionLog((prev) => [...prev,
          `⏸️ Phase ${phase} prête à s'enchaîner, mais retenue par ${blocage}.`]);
      }
      return;
    }
    blocageSignaleRef.current = null;
    const ids = titanState.ordreJeu;
    const allValidated = ids.every((id) => phaseValidated[id]);
    if (!allValidated) return;

    /* ── ON NE FERME PAS LA PHASE ACTION SUR UNE CARTE NON JOUÉE ──
       Retour Nikola (2026-08-18) : « il me restait une carte à jouer, mais
       la phase est passée au round suivant… je devais choisir trois
       nouvelles cartes alors qu'il m'en restait une, plus visible ni
       jouable. » État contradictoire, et partie faussée.

       `advanceActionRound` valide la phase pour TOUT LE MONDE dès que son
       compteur de rounds atteint 3, sans jamais regarder si les cartes ont
       réellement été jouées. Tant que compteur et réalité coïncident, tout
       va bien ; le moindre écart (un `advanceActionRound` de trop, cf. le
       correctif de `markCardPlayed`) enterrait une carte encore programmée
       et ouvrait la Programmation par-dessus.

       Plutôt que de faire confiance au compteur, on tranche ici sur le seul
       fait qui ne ment pas : reste-t-il des cartes programmées ? Si oui, la
       phase ne se ferme pas. On recale le compteur sur la vérité (3 cartes
       programmées par Titan en début de Phase Action) et on rend la main au
       Titan en retard. Le journal le dit, pour qu'un écart se voie au lieu
       de se rattraper en silence. */
    if (phase === "action") {
      const enRetard = ids.filter((id) => {
        const t = titanState.players.find((p) => p.id === id);
        return (t?.programmed.length || 0) > 0;
      });
      if (enRetard.length > 0) {
        const recale = { ...cardsPlayedCountRef.current };
        ids.forEach((id) => {
          const t = titanState.players.find((p) => p.id === id);
          if (t) recale[id] = 3 - t.programmed.length;
        });
        cardsPlayedCountRef.current = recale;
        setPhaseValidated({});
        setWaitingNextTitan(false);
        setActivePlayerId(enRetard[0]);
        /* ── RENDRE LA MAIN NE SUFFIT PAS À LA REPRENDRE ──
           Nikola, 2026-09-07 : « les parties en simulation IA plantent ; sur
           5 essais, une seule est allée au bout ». Deux rapports de partie
           envoyés, et le mien reproduit avec sa graine : les trois se figent
           sur CETTE ligne de journal, en Phase Action, sans aucune décision en
           attente.

           La cause est ici, et elle est bête. Ce garde-fou rend la main au
           Titan en retard par `setActivePlayerId(enRetard[0])` — mais dans les
           trois cas observés, `enRetard[0]` est DÉJÀ le Titan actif : c'est
           lui dont le tour n'a pas pu se jouer. React ne notifie pas une
           valeur identique, l'effet d'auto-jeu de l'IA ne dépend que de
           `activePlayerId`, il ne se relance donc jamais. Personne ne joue
           plus, et rien à l'écran ne dit pourquoi : la file de décisions est
           vide, la phase est la bonne, le tour est au bon Titan.

           On force donc la relance par le compteur qui existe exactement pour
           ça (`aiTrigger`, « pour forcer le re-trigger de l'effect IA entre
           chaque carte »), et on relâche le drapeau `aiPlaying` — s'il était
           resté levé par un tour interrompu, il bloquerait la reprise tout
           aussi silencieusement.

           Le garde-fou redevient ce qu'il prétendait être : un rattrapage, et
           non un point d'arrêt. */
        setAiPlayingSync(false);
        setAiTrigger((n) => n + 1);
        setActionLog((prev) => [...prev,
          `⚠️ Phase Action : ${enRetard.map((id) => `T${id}`).join(", ")} a encore une carte programmée — ` +
          `la Programmation ne démarre pas, la main revient à T${enRetard[0]}.`]);
        return;
      }
    }

    if (phase === "repos") {
      // advanceManche renvoie false quand elle a détecté la fin de partie.
      // La phase ne doit alors PAS repartir en Programmation : c'est ce qui
      // laissait le jeu figé sur la dernière Manche, écran de score enterré
      // en bas de page.
      if (advanceManche() === false) return;
      setPhase(getActivePhases(eventsEnabled)[0]);
      setCurrentEvent(null);
    } else {
      const activePhases = getActivePhases(eventsEnabled);
      const idx = activePhases.indexOf(phase);
      const nextPhase = activePhases[idx + 1];

      /* ── PAS DE PHASE REPOS QUAND IL N'Y A PLUS DE MANCHE APRÈS ──
         Nikola, 2026-09-07 : « le Manche suivant de Manche 4 à 4 Titans est
         inutile ». Il a raison, et le mot « inutile » est exact au sens
         propre : la Phase Repos ne sert qu'à PRÉPARER la Manche suivante —
         chacun vole une carte à son voisin pour la Manche d'après. Quand il
         n'y a pas de Manche d'après, elle déplace des cartes que personne ne
         jouera jamais, ne touche à aucun score, et fait attendre la table
         entre le dernier coup de la partie et son décompte.

         La condition est celle du moteur, pas une règle de plus :
         `checkEndGameTriggers` est exactement ce que `advanceManche`
         interroge pour décider si la partie s'arrête. Les deux ne peuvent donc
         pas diverger, et la Phase saute aussi bien sur la dernière Manche que
         sur une Apocalypse, une Pénurie ou un Vide Spatial — dans les quatre
         cas, elle n'aurait rien préparé. */
      if (nextPhase === "repos"
        && checkEndGameTriggers(state.board, looseBlocks, apocalypseThreshold, mancheNumber, nbJoueurs).length > 0) {
        setActionLog((prev) => [...prev,
          "⏭️ Phase Repos sautée : la partie s'arrête à la fin de cette Manche, il n'y a plus de main à préparer.",
        ]);
        advanceManche();
        setPhaseValidated({});
        return;
      }

      if (nextPhase === "action") {
        cardsPlayedCountRef.current = {};   // reset compteur de rounds
        setWaitingNextTitan(false);
        // Bug trouvé par le diagnostic, confirmé par Nikola le 2026-08-15 :
        // cette ligne lisait `ordreJeu[0]`, pas le Détonateur. Or le
        // Détonateur pivote bien à chaque Manche (cf. nextDetonateur dans
        // advanceManche) — mais sa rotation ne produisait STRICTEMENT
        // AUCUN effet : le même Titan ouvrait toutes les Manches de toutes
        // les parties. La rotation existait dans les données et nulle part
        // dans le jeu.
        setActivePlayerId(titanState.detonateur ?? titanState.ordreJeu[0]);
      }
      setPhase(nextPhase);
    }
    setPhaseValidated({});
  }, [phaseValidated, titanState.ordreJeu, titanState.detonateur, titanState.players, phase, advanceManche,
      eventsEnabled, gameOver, currentDecision, currentRepli, ecroulement, placementEnCours,
      // Lus depuis le 2026-09-07 pour décider si la Phase Repos a encore
      // quelque chose à préparer (cf. le saut de la dernière Manche).
      state.board, looseBlocks, apocalypseThreshold, mancheNumber, nbJoueurs]);

  /* ── MAIN TROP CIBLÉE : SECOURS À L'ENTRÉE EN PROGRAMMATION ──
     Retour de Nikola (test à la table, 2026-08-18) : « j'ai été extrêmement
     ciblé, j'ai que 2 cartes, c'est pas possible de jouer. » `programCards`
     exige exactement 3 cartes en main ; une main trop réduite par des
     Fatigues répétées bloquait durablement la Programmation de ce Titan.
     Effet séparé de la transition de phase ci-dessus (peu importe le
     chemin qui mène à "programmation" — mi-Manche ou nouvelle Manche —
     il suffit que la phase le devienne) pour rester simple et robuste. */
  useEffect(() => {
    if (distantInviteRef.current) return; // les mains sont distribuées par l'hôte
    if (phase !== "programmation") return;
    const logs = [];
    titanState.players.forEach((t) => {
      const res = ensureProgrammableHand(t);
      logs.push(...res.log);
    });
    if (logs.length > 0) {
      setActionLog((prev) => [...prev, ...logs]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Rainbow tracking
  // Bug remonté : "5 couleurs" attendu, mais le vert était explicitement
  // exclu du calcul (filtré + liste de 4 couleurs en dur, désynchronisée
  // de STANDARD_COLORS utilisée partout ailleurs pour le scoring). Le
  // livret liste bien 5 couleurs de blocs (Bleu/Rose/Orange/Rouge/Vert) —
  // recollecté sur STANDARD_COLORS pour ne plus jamais diverger.
  useEffect(() => {
    if (distantInviteRef.current) return; // le Trophée est décerné par l'hôte
    if (rainbowWinnerId !== null) return;
    for (const t of titanState.players) {
      const colors = new Set(t.repaire);
      if (STANDARD_COLORS.every((c) => colors.has(c))) {
        setRainbowWinnerId(t.id);
        setActionLog((prev) => [...prev, `🌈 Arc-en-ciel ! Titan ${t.id} est le premier à posséder les 5 couleurs → +5 pts fin de partie.`]);
        break;
      }
    }
  }, [titanState.players, rainbowWinnerId]);

  // { titanId, cout } — déplacements consommés par une rentrée sur le
  // plateau, à retrancher du Mouvement gratuit de ce tour-là uniquement.
  const [coutRentree, setCoutRentree] = useState(null);
  // { titanId, options: [cle, cle], coinBloque } — coin de rentrée bloqué,
  // deux cases également proches : en attente du choix du joueur.
  const [cornerChoice, setCornerChoice] = useState(null);
  const [selectedTitanId, setSelectedTitanId] = useState(null);

  // Bug remonté (persistant) : "impossible de se déplacer après avoir joué
  // une carte". Le passif Mouvement était bien réinitialisé à chaque round
  // (voir advanceActionRound), mais le panneau affiché (selectedTitanId)
  // ne suivait jamais automatiquement activePlayerId — si le joueur avait
  // cliqué sur un autre Titan entre-temps (pour regarder son état), le
  // panneau Passifs qu'il voyait n'était plus le sien du tout : le bouton
  // "Se déplacer" semblait absent alors qu'il était juste affiché ailleurs.
  // Focus auto sur le Titan actif à chaque changement de tour (phase
  // Action uniquement, jamais pour un Titan IA qui n'a pas de panneau
  // Passifs humain).
  useEffect(() => {
    /* ── UN INVITÉ RESTE SUR SON PROPRE TITAN ─────────────
       En local, l'appareil circule autour de la table : suivre le Titan actif
       est exactement ce qu'on veut, c'est la manette qui change de mains. À
       distance, chacun garde la sienne — recentrer sur le Titan actif ferait
       basculer l'écran d'un invité vers un Titan qu'il ne joue pas, au moment
       précis où il regarde le sien. */
    if (distantInvite) {
      if (monTitanDistant != null) setSelectedTitanId(monTitanDistant);
      return;
    }
    /* ── L'HÔTE NE SE FAIT PAS DÉPOSER SUR LE SIÈGE D'UN AUTRE ──
       Nikola, 2026-09-01 : « en tant qu'hôte je ne dois JAMAIS avoir accès aux
       panneaux des autres joueurs ».

       Le recentrage automatique décrit un appareil qui circule autour de la
       table. À distance il n'y a plus d'appareil qui circule : quand c'est le
       tour d'un invité, poser l'hôte sur ce Titan lui ouvre le panneau de
       quelqu'un d'autre — ses passifs, son étape de tour, ses commandes. Les
       CARTES étaient déjà masquées (`titanMasque`), le panneau, non.

       La même règle vaut pour la Phase Programmation, plus bas, et pour la
       sélection à la main (`setSelectedTitanId` exposé sur le vm). */
    if (distantSieges[activePlayerId]) return;
    if (phase === "action" && activePlayerId != null && titanModes[activePlayerId] !== "ia") {
      setSelectedTitanId(activePlayerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayerId, phase, distantInvite, monTitanDistant, distantSieges]);

  /* ── QUI PROGRAMME MAINTENANT ──
     Bug trouvé en inspectant l'écran d'ouverture d'une partie neuve : en
     Phase Programmation, `activePlayerId` est nul (elle n'a pas de tour), et
     l'effet ci-dessus ne s'applique qu'à la Phase Action. Résultat,
     `selectedTitanId` restait `null` au tout premier écran de la partie —
     et comme TOUT le panneau de jeu est monté derrière `selectedTitan`, le
     joueur arrivait sur un plateau sans la moindre commande, sans que rien
     lui dise qu'il devait d'abord cliquer sur SA propre plaque de Titan.
     C'est le premier écran de chaque partie, et c'est exactement la friction
     « savoir ce que je peux faire ».

     La règle appliquée est celle qui existait déjà en filigrane : « chacun
     programme à son tour, le Titan sélectionné est celui qui programme ». On
     désigne donc le premier humain qui n'a pas encore validé. Une sélection
     manuelle n'est jamais écrasée tant qu'elle reste valable : on ne bouge
     que si personne n'est sélectionné, ou si le sélectionné a fini. */
  useEffect(() => {
    // Un invité programme le sien, jamais « le prochain qui n'a pas validé » :
    // cette rotation-là décrit un appareil qui circule, pas quatre écrans.
    if (distantInvite) return;
    if (phase !== "programmation") return;
    const enCours = selectedTitanId != null
      && titanModes[selectedTitanId] !== "ia"
      && !phaseValidated[selectedTitanId];
    if (enCours) return;
    /* Et l'hôte ne se fait pas déposer sur le Titan d'un invité. « Le prochain
       qui n'a pas validé » décrit l'appareil qui circule : à distance, ce
       prochain-là peut très bien être quelqu'un d'autre, à l'autre bout de la
       liaison. L'hôte se retrouvait alors le nez sur une main qui n'est pas la
       sienne — masquée depuis (cf. `titanMasque`), donc sur un panneau vide,
       pendant que sa propre programmation attendait ailleurs. */
    const suivant = titanState.ordreJeu.find(
      (id) => titanModes[id] !== "ia" && !phaseValidated[id] && !distantSieges[id]
    );
    if (suivant != null && suivant !== selectedTitanId) setSelectedTitanId(suivant);
  }, [phase, phaseValidated, titanModes, titanState.ordreJeu, selectedTitanId, distantInvite, distantSieges]);
  const selectedTitan = titanState.players.find((t) => t.id === selectedTitanId) || null;
  /* `movingTitanOverride` a été retiré le 2026-08-29. Il servait à dessiner le
     jeton sur une case intermédiaire pendant que le Titan « marchait » d'une
     case par seconde ; cette marche a disparu au profit de la traînée colorée,
     qui dit la même chose mieux et sans immobiliser le tour. Plus personne
     n'écrivait dans cet état : il ne restait que sa plomberie. */
  const effectivePlayers = titanState.players;
  // Un Titan éjecté n'est PAS sur le plateau : il ne doit apparaître ni sur
  // la grille 2D, ni en 3D, ni dans aucun calcul d'occupation. Sa `cell`
  // n'indique plus où il est mais par où il rentrera à son tour.
  const titansByCell = indexerTitans(effectivePlayers);
  /* Les pistes d'attente au bord du plateau ne montrent que les ÉJECTÉS —
     ceux qui rentreront par cette case. Depuis que `estSurLePlateau` couvre
     aussi le placement d'ouverture (2026-08-28), lire sa négation y affichait
     « Titan 1 attend hors de BIG CITY » avant même le début de la partie : un
     Titan qui n'a pas encore posé n'est pas un Titan qu'on a sorti du ring.
     On nomme donc explicitement la condition qu'on veut. */
  const titansEnAttente = titanState.players.filter((t) => t.horsPlateau);
  const titanCorners = {};
  effectivePlayers.forEach((t) => {
    // Le lookup `CORNERS[t.corner]` qui vivait ici n'était jamais lu :
    // seul l'id du Titan est stocké. Retiré, aucun changement de contenu.
    if (estSurLePlateau(t)) titanCorners[t.cell] = { titanId: t.id };
  });

  // (`actionLog` et `looseBlocks` sont déclarés en tête de hook, cf. commentaire là-bas.)
  const [teaMode, setTeaMode] = useState(false);
  const [teaAdrenaline, setTeaAdrenaline] = useState(0);
  const [tcAdrenaline, setTcAdrenaline] = useState(0); // Tout Casser : +1 energie par Adrenaline
  // direction conservée pour Graouhhh (inchangé)
  const [direction, setDirection] = useState({ dr: -1, dc: 0, label: "N" });
  // Graouhhh : la rose des vents s'affichait des que la carte etait
  // programmee, occupant l'ecran tout le round meme si le Titan comptait
  // jouer autre chose. Elle passe sur le meme modele que Boing Boing /
  // Tete en Avant : un mode ouvert par un clic sur la carte, referme par
  // Annuler ou par la resolution.
  const [graouMode, setGraouMode] = useState(false);
  const [jnpMode, setJnpMode] = useState(false);
  const [jnpSelected, setJnpSelected] = useState([]);
  // Nombre de blocs à ramasser (2, ou 3 en Lanterne Rouge), figé à l'engagement
  // de la carte — cf. le commentaire de jnpNbToPick plus bas.
  const [jnpNbToPickFrozen, setJnpNbToPickFrozen] = useState(2);
  const [bbMode, setBbMode] = useState(false);
  const [bbAdrenaline, setBbAdrenaline] = useState(0);
  /* GRAOUHHH NE SE DOSE PAS (Nikola, 2026-09-23 : « Graouh ne peut pas avoir
     de + ou - »). Retour au livret V36 : le recul vaut « Titans touchés + 1 »,
     sans Adrénaline. Le doseur du 2026-09-01 est retiré. */
  // Chemin cliqué case par case (demande Nikola, 2026-08-18 : « je dois
  // indiquer par plusieurs clics mon chemin »). `bbDest` — la case où la
  // carte atterrit — n'est plus qu'un dérivé : la dernière case du chemin.
  // Une seule source de vérité, jamais désynchronisée.
  const [bbPath, setBbPath] = useState([]);
  // Cases FRANCHIES a chaque saut, une entree par atterrissage. Elles ne
  // coutent rien, elles ne servent qu'a dessiner la trajectoire.
  const [bbSurvol, setBbSurvol] = useState([]);
  const bbDest = bbPath.length > 0 ? bbPath[bbPath.length - 1] : null;
  // Écroulement d'Amas en attente de répartition par le joueur :
  // { cellKey, blocs, energie, choix } — un choix de case par débris, posé
  // dans l'ordre. Nul quand aucune répartition n'est en cours.

  /* ── FILE DES REPLIS À TRANCHER ──
     Ruling Nikola du 2026-08-17 : quand un élément projeté s'arrête faute de
     puissance, c'est le TITAN INITIATEUR qui choisit où le poser, parmi sa
     case d'origine et celles qui touchent à la fois cette case et la case
     visée (cf. getCasesRepliDebris).

     Pourquoi une FILE et non un choix unique : une seule activation peut en
     produire plusieurs. Tout Casser frappe tout le Périmètre, et chaque
     réaction en chaîne peut à son tour immobiliser un débris. Les résolveurs
     déposent donc leurs replis dans un tableau partagé (`gameState.replis`),
     et le joueur les tranche un par un, dans l'ordre où ils sont survenus. */
  const [progSelection, setProgSelection] = useState([]);
  /* Ce que l'HÔTE avait coché pour lui-même. Exécuter l'intention d'un invité
     lui fait adopter le brouillon de cet invité (cf. CONTEXTE_DISTANT) ; sans
     cette sauvegarde, l'hôte perdait sa propre sélection de cartes chaque fois
     qu'un joueur distant validait la sienne. Une ref, et pas une dépendance
     d'effet : l'exécuteur d'intentions doit lire la valeur du moment. */
  const progSelectionRef = useRef([]);
  useEffect(() => { progSelectionRef.current = progSelection; }, [progSelection]);
  /* Dernier échec de programmation, affiché DANS le panneau.
     Bug remonté par Nikola le 2026-08-17 : « en début de M4 je sélectionne
     mes 3 cartes et ça me redemande de sélectionner mes 3 cartes ». Quand
     `programCards` refuse, la sélection est vidée et le panneau se
     represente à l'identique : le joueur boucle sans jamais savoir pourquoi,
     la raison ne partant que dans le journal d'actions, tout en bas.
     Le refus a toujours une raison précise — cartes déjà programmées, Titan
     ayant déjà joué cette Manche, carte absente de la main. La montrer à
     l'endroit où le joueur est bloqué est la seule façon de trancher entre
     ces causes au prochain test à la table. */
  const [progErreur, setProgErreur] = useState(null);
  const [progCountdown, setProgCountdown] = useState(null);   // null | 1-3
  const [progCountdownTimer, setProgCountdownTimer] = useState(null); // setInterval id
  /* Le MÊME identifiant, en ref. L'état sert à l'affichage (BoardPanel lit
     `progCountdownTimer` pour son bouton « Confirmer maintenant ») ; la ref
     sert à `toggleProgCard`, qui doit pouvoir couper le minuteur sans passer
     par un updater à effets de bord. */
  const progCountdownTimerRef = useRef(null);
  /* Miroir, pour que la ref reste honnête quand c'est l'INTERFACE qui coupe le
     minuteur — le bouton « Modifier ma sélection » de `BoardPanel` remet
     l'état à null sans passer par `toggleProgCard`. */
  useEffect(() => { progCountdownTimerRef.current = progCountdownTimer; }, [progCountdownTimer]);
  // Vol Phase Repos (refonte session) : sens de rotation choisi UNE FOIS
  // par le Détonateur pour toute la chaîne, puis résolution automatique
  // par resolveVolPhaseRepos — remplace l'ancien choix manuel carte/cible.
  /* Cinq secondes pour lire le récapitulatif du vol avant que la Manche
     suivante ne démarre. Dix à la première demande, ramené à cinq à l'essai
     (Nikola, 2026-08-28) : le récapitulatif tient en quatre lignes, dix
     secondes à le regarder devenaient une attente. */
  const DUREE_LECTURE_VOL_MS = 5000;
  /* Sa propre référence, séparée des minuteurs de trace : ce délai-ci fait
     avancer la partie, il ne doit pas tomber avec une animation annulée.
     Voir `chooseVolDirection` pour le bug que ce mélange a produit. */
  const volTimerRef = useRef(null);
  const [volDirection, setVolDirection] = useState(null);
  // Qui a pris quoi à qui à la dernière Phase Repos, pour l'afficher au lieu
  // de le laisser au fond du journal (cf. `resolveVolPhaseRepos`).
  const [volResume, setVolResume] = useState([]);
  const [fpmcPendingIds, setFpmcPendingIds] = useState([]);
  const [fpmcNTargets, setFpmcNTargets] = useState(0);
  const [fpmcAttackerId, setFpmcAttackerId] = useState(null);
  const [fpmcAttackerBase, setFpmcAttackerBase] = useState(0);
  const [fpmcCurrent, setFpmcCurrent] = useState(null);
  /* Les Fatigues que des cibles humaines peuvent encore refuser, une à la fois
     (cf. `enqueueFatigues`). Une FILE et non une case (2026-09-16) : Graouhhh
     peut en poser plusieurs d'un coup, et la seconde écrasait la première. */
  const [fatiguesEnAttente, setFatiguesEnAttente] = useState([]);
  const fatigueEnAttente = fatiguesEnAttente[0] ?? null;
  const [moveMode, setMoveMode] = useState(false);
  const [moveAdrenaline, setMoveAdrenaline] = useState(0);
  const [recupMode, setRecupMode] = useState(false);
  const [passifUsed, setPassifUsed] = useState({});
  // Animation timing: case/case = 1s, action complète = 5s
  /* TRACE DE VOL (Nikola, 2026-08-24 : « animation de la trajectoire »).
     Les cases traversees par le dernier element projete, rejouees a l'ecran
     apres coup. La resolution, elle, reste synchrone et inchangee : on ne
     defere rien, on ne fait que MONTRER ou les choses sont passees — c'est
     ce qui rend cette animation sans risque pour le moteur.

     Un rebond ou une traversee de faille se voient donc enfin : ils etaient
     jusqu'ici deduits du seul point d'arrivee. */
  /* ── CHAQUE CASE DE LA TRACE DIT CE QUI L'A TRAVERSÉE ──
     Nikola, 2026-08-28 : « adapte l'illumination des cases en fonction de
     l'élément : débris = jaune comme là, Titan = de la couleur de la cible ou du
     Titan qui fait son déplacement passif — reprends les mêmes codes d'apparence
     et de fonctionnalité que pour un débris, mais adapte la couleur ».

     La trace était une simple liste de cases plus UNE couleur pour l'ensemble.
     Ça tenait tant qu'une carte ne déplaçait qu'une sorte de chose — mais un
     Tout Casser projette des débris ET bouscule des Titans dans le même souffle,
     et tout se peignait alors de la même teinte. Chaque case porte donc
     désormais ce qui l'a traversée :

       { key, titanId }   titanId = null → débris (jaune)
                          titanId = n    → ce Titan-là (sa couleur)
       { key, teleporteur: true, titanId } → la faille empruntée, peinte de la
                          couleur du Titan qui l'a prise (violet en repli)

     `projectInDirection` remplissait déjà `titanId` dans chaque trajectoire :
     l'information existait, elle était jetée à l'affichage. */
  const [traceVol, setTraceVol] = useState([]);

  const traceTimersRef = useRef([]);
  const [animating, setAnimating] = useState(false);

  /* Rejoue les trajectoires collectees. Toutes en PARALLELE (pas l'une apres
     l'autre) : un Tout Casser projette jusqu'a huit elements a la fois, et
     c'est bien ce qui se passe au meme instant dans la fiction du jeu. La
     duree totale reste donc courte quel que soit le nombre d'elements.

     Les minuteurs vivent dans une ref pour pouvoir etre annules : sans quoi
     une trace en cours se superposerait a la carte suivante, ou survivrait a
     un « Annuler ». */
  const arreterTrace = useCallback(() => {
    traceTimersRef.current.forEach(clearTimeout);
    traceTimersRef.current = [];
    setTraceVol([]);
  }, []);

  /* ── NETTOYAGE D'UNE PARTIE ABANDONNÉE ──
     Suite de `regenerate`, qui a incrémenté `partieRef` sans pouvoir toucher
     à ces deux-là : ils sont déclarés après lui (cf. le commentaire sur la
     zone morte temporelle, là-bas). On coupe donc ici tout ce que l'ancienne
     partie avait programmé — la cascade du tour d'une IA, et la traînée qui
     décrirait un vol sur un plateau qui n'existe plus.

     `partieId === 0` est la toute première partie : rien à nettoyer, et
     surtout rien à couper au montage. */
  useEffect(() => {
    if (partieId === 0) return;
    annulerTimersIA();
    arreterTrace();
    if (volTimerRef.current) { clearTimeout(volTimerRef.current); volTimerRef.current = null; }
  }, [partieId, annulerTimersIA, arreterTrace]);

  /* ── EN PARALLÈLE, OU UN ÉLÉMENT À LA FOIS ──
     Nikola, 2026-09-01 : « quand une IA fait de la projection d'éléments, il
     faut que ce soit aussi cas par cas, et qu'il y ait un petit délai de
     2 secondes entre chaque, pour bien comprendre la situation ».

     Le mode parallèle reste le défaut, et il est juste pour un joueur humain :
     il vient de désigner l'élément qui part, il sait ce qu'il regarde.

     Une IA, elle, joue toute sa carte d'un coup. Huit traînées qui s'allument
     ensemble sur le plateau ne racontent rien à la table — on voit un
     déplacement global, jamais QUI est parti OÙ. En séquentiel, chaque élément
     a le plateau pour lui seul : la trace précédente s'efface, la sienne
     s'égraine, et deux secondes de pause laissent le temps de la lire avant la
     suivante.

     C'est purement visuel : la résolution a déjà eu lieu et n'attend rien de
     cette animation. */
  const animerTrajectoires = useCallback((trajectoires, options = {}) => {
    const { sequentiel = false, pauseMs = 2000 } = options;
    arreterTrace();
    if (!trajectoires || trajectoires.length === 0) return;
    // La case de depart n'est pas une case traversee : on l'ecarte. Chaque
    // case garde l'identifiant de ce qui l'a franchie, pour sa couleur.
    /* ── UN DÉCOMPTE PAR CASE PARCOURUE ──
       Nikola, 2026-09-07 : « pour le côté chemin des éléments tracé, il faut
       faire 1 décompte par case parcourue, exemple 4 3 2 1 ».

       La traînée disait OÙ l'élément est passé, jamais dans quel ORDRE ni
       combien de cases il lui restait — donc, sur une trajectoire qui rebondit
       ou traverse la faille, on ne pouvait pas reconstituer le sens du vol une
       fois la trace complète. Chaque case porte donc ce qu'il RESTAIT à
       parcourir en y arrivant : la première du vol porte le total, celle
       d'arrivée porte 1. Le chiffre se lit de gauche à droite comme le vol
       s'est déroulé, et il dit du même coup la longueur du déplacement. */
    const vols = trajectoires
      .map((t) => {
        const cases = (t.cases || []).slice(1);
        return cases.map((key, i) => ({ key, titanId: t.titanId ?? null, reste: cases.length - i }));
      })
      .filter((cases) => cases.length > 0);
    if (vols.length === 0) return;

    const PAS_MS = 110;
    const TENUE_MS = 1500; // temps de lecture une fois la trace complete (650 ms passaient inapercus)

    if (sequentiel) {
      let depart = 0;
      vols.forEach((vol) => {
        const debutDeCeVol = depart;
        // Le plateau se vide avant chaque élément : c'est ce qui fait qu'on
        // lit UNE projection, et pas la somme de celles d'avant.
        traceTimersRef.current.push(setTimeout(() => setTraceVol([]), debutDeCeVol));
        vol.forEach((c, i) => {
          traceTimersRef.current.push(setTimeout(() => {
            setTraceVol((prev) => (prev.some((e) => e.key === c.key) ? prev : [...prev, c]));
          }, debutDeCeVol + i * PAS_MS));
        });
        depart = debutDeCeVol + vol.length * PAS_MS + pauseMs;
      });
      // `depart` porte déjà la pause du dernier élément : elle lui sert de
      // temps de lecture, inutile d'en rajouter un.
      traceTimersRef.current.push(setTimeout(arreterTrace, depart));
      return;
    }

    const longueurMax = Math.max(...vols.map((v) => v.length));
    for (let i = 0; i < longueurMax; i++) {
      const casesDuPas = vols.map((v) => v[Math.min(i, v.length - 1)]);
      traceTimersRef.current.push(setTimeout(() => {
        // Cumul : la trace s'allonge derriere l'element au lieu de sauter de
        // case en case, ce qui rend le rebond lisible.
        setTraceVol((prev) => [
          ...prev,
          ...casesDuPas.filter((c) => !prev.some((e) => e.key === c.key)),
        ]);
      }, i * PAS_MS));
    }
    traceTimersRef.current.push(setTimeout(arreterTrace, longueurMax * PAS_MS + TENUE_MS));
  }, [arreterTrace]);

  const [animLabel, setAnimLabel] = useState("");

  // ── TOUR PAR TOUR (Phase Action) ──
  // cardsPlayedCountRef : { titanId: n } cartes jouées ce round par chaque Titan.
  // Simple ref (PAS un useState) : jamais lue pour l'affichage, uniquement une
  // comptabilité interne à advanceActionRound. Corrige un bug de blocage IA
  // récurrent (session) : c'était auparavant un useState dont l'updater
  // fonctionnel portait un effet de bord (aiNextPlayerRef.current = next).
  // React n'exécute cet updater qu'au flush du state, à un instant non
  // déterministe par rapport au code appelant — qui relisait la ref juste
  // après via un Promise.resolve().then(). Selon le timing exact du flush,
  // la ref pouvait rester stale (null ou ancienne valeur) et le Titan
  // suivant n'était jamais activé, quelle que soit l'action jouée (carte
  // avec effet ou défausse cachée). En ref pure lue/écrite de façon
  // strictement synchrone, cette fenêtre de course n'existe plus.
  const cardsPlayedCountRef = useRef({});
  const [pendingCardConfirm, setPendingCardConfirm] = useState(null); // { titanId, cardId }
  const [waitingNextTitan, setWaitingNextTitan] = useState(false); // après résolution, attend "Titan suivant"

  // ── UNDO STACK ──
  // Chaque entrée = snapshot complet de l'état de jeu avant une action ou un
  // changement de joueur actif. On peut revenir en arrière tant qu'on est sur
  // le même joueur actif (annulation de coup) ou jusqu'au début de son tour
  // (annulation du tour complet). Dès que activePlayerId change pour un autre
  // joueur, l'historique est vidé (le tour est définitivement joué).
  const [undoStack, setUndoStack] = useState([]);
  // Incrémenté à chaque rollback. Les panneaux s'en servent pour remettre à
  // plat leur état local, que la restauration de l'état de jeu ne touche pas.
  const [undoTick, setUndoTick] = useState(0);

  /* ── CE QU'UN INSTANTANÉ DOIT CONTENIR ──
     Demande de Nikola du 2026-08-18 : « Annuler annule bien les actions
     jouées, donc placement, perte de débris, etc. — tout ce qu'une action
     fait doit être annulable si on clique sur le bouton. »

     L'instantané ne couvrait que le plateau, les Titans et les débris. Tout
     ce qu'une action laisse EN ATTENTE en était absent, et pire, le retour
     en arrière VIDAIT ces files au lieu de les restaurer : un Dilemme non
     encore tranché, un repli en attente, une répartition d'Amas en cours ou
     une comparaison Faut Pas Me Chauffer disparaissaient purement et
     simplement — l'action était à moitié défaite, et le joueur se retrouvait
     avec une carte jouée dont l'effet ne viendrait jamais.

     La règle est donc simple et sans exception : tout état de JEU entre dans
     l'instantané, y compris les décisions en suspens. Seuls restent dehors
     les états d'INTERFACE (mode carte ouvert, compteur d'Adrénaline engagé,
     animation), remis à plat par `undoTick`. */
  /* ⚠️ LE CLONE SE FAIT MAINTENANT, PAS DANS L'UPDATER ──
     Bug remonté par Nikola le 2026-08-18 : « les blocs qui ont pris le warp
     ne sont pas revenus à leur case initiale, ça fausse la partie. »

     L'instantané entier était construit À L'INTÉRIEUR de `setUndoStack(prev
     => ...)`. Or React n'exécute un updater fonctionnel qu'au traitement de
     sa file, donc APRÈS le retour de la fonction appelante — et le domaine,
     lui, mute l'état EN PLACE (`bldg.blocks.pop()`, `looseBlocks[k].push()`,
     `titan.destruction += 1`). Séquence réelle d'un Tout Casser :

       1. captureSnapshot()      → programme un updater, ne clone rien
       2. resolveToutCasser(...) → casse le plateau en place
       3. setState(prev => ...)  → déclenche le rendu
       4. React exécute (1)      → structuredClone d'un plateau DÉJÀ CASSÉ

     L'instantané enregistrait donc l'état d'APRÈS l'action. « Annuler »
     dépilait bien, restaurait bien, mais restaurait l'état détruit : le
     bouton semblait ne rien faire. Seules les actions qui clonent avant de
     modifier (défausse, programmation) échappaient au piège, ce qui
     explique que `annuler.test.jsx` restait vert.

     Le clone est désormais évalué de façon SYNCHRONE, à l'appel, avant que
     le moindre résolveur n'ait pu toucher à l'état. Ne jamais redéplacer
     ce calcul dans l'updater. */
  /* ── L'INSTANTANÉ, SÉPARÉ DE SON EMPILEMENT ───────────────
     Extrait de `captureSnapshot` le 2026-08-29. La partie à distance a besoin
     de DÉCRIRE l'état courant à chaque coup, sans pour autant ajouter un cran
     à la pile d'annulation : l'hôte diffuse cent fois plus souvent qu'il ne
     capture, et empiler à chaque diffusion aurait fait d'« Annuler » un bouton
     qui ne recule plus d'une action mais d'un battement de réseau.

     Le CONTENU ne change pas d'une ligne : ce que l'annulation doit restaurer
     et ce qu'un invité doit recevoir sont exactement la même chose. */
  const instantaneCourant = useCallback(() => {
    const snapshot = {
      /* Identité PUBLIQUE de la partie (la graine est secrète) : le cadre de
         l'invité la lit pour savoir qu'une nouvelle partie a commencé (C17). */
      partieId,
      state: structuredClone(state),
      titanState: structuredClone(titanState),
      looseBlocks: structuredClone(looseBlocks),
      activePlayerId,
      phase,
      passifUsed: structuredClone(passifUsed),
      actionLog: [...actionLog],
      // Décisions et placements en attente : ils font partie de l'action.
      decisionQueue: structuredClone(decisionQueue),
      repliQueue: structuredClone(repliQueue),
      ecroulement: ecroulement ? structuredClone(ecroulement) : null,
      /* ⚠️ LA FILE DE TOUT CASSER FAIT PARTIE DE L'ÉTAT À RESTAURER.
         Bug remonté par Nikola le 2026-08-29 : « le panneau "clique l'élément
         que tu projettes maintenant" — si j'annule, ça fait planter le
         déplacement, les annulations aussi, je ne peux plus vraiment revenir en
         arrière ».

         L'instantané restaurait le plateau et les Titans, mais PAS la file :
         « Annuler » rendait donc un plateau d'avant la projection avec une file
         d'après, qui désignait des cibles n'existant plus — un bâtiment qu'on
         venait de reconstituer, un Titan revenu sur sa case. Le clic suivant
         résolvait alors une case incohérente, et l'état partait de travers sans
         retour possible.

         La règle vaut pour toute résolution en plusieurs temps : ce qui
         SÉQUENCE l'action appartient à l'instantané au même titre que ce qu'elle
         a déjà modifié. `ecroulement` juste au-dessus le savait déjà. */
      toutCasserFile: toutCasserFile ? structuredClone(toutCasserFile) : null,
      fpmc: {
        attackerId: fpmcAttackerId,
        pendingIds: [...fpmcPendingIds],
        nTargets: fpmcNTargets,
        attackerBase: fpmcAttackerBase,
        current: fpmcCurrent ? { ...fpmcCurrent } : null,
      },
      // Avancement de la partie et acquis de fin de partie.
      mancheNumber,
      phaseValidated: { ...phaseValidated },
      volDirection,
      volResume: [...volResume],
      currentEvent,
      rainbowWinnerId,
      vertAssignments: structuredClone(vertAssignments),
      vertsValides: structuredClone(vertsValides),
      gameOver,
      showScoring,
      coutRentree: coutRentree ? { ...coutRentree } : null,
      // Bug #8 (tracker) : "Annuler une carte doit la rendre réellement
      // disponible, pas juste un rollback visuel". Ces deux valeurs
      // vivaient hors du snapshot : `waitingNextTitan` restait à `true`
      // après undo (canPlayCard/getPlayBlockReason le bloquent — la carte
      // réapparaît dans `programmed` mais reste injouable, "Confirme
      // Titan suivant" s'affiche quand même), et `cardsPlayedCountRef`
      // (compteur de rounds, hors state React) n'était jamais restauré,
      // désynchronisant l'avancement de round au coup suivant.
      waitingNextTitan,
      cardsPlayedCount: { ...cardsPlayedCountRef.current },
      /* COMBIEN DE COUPS L'HÔTE PEUT ENCORE DÉPILER. Un invité n'a pas de pile
         à lui — le moteur ne tourne que chez l'hôte — mais son bouton
         « Annuler » doit s'allumer quand il y a quelque chose à annuler, et
         s'éteindre sinon. Un simple entier suffit : c'est la seule chose que
         l'interface lit de cette pile. Inerte pour l'annulation locale, qui ne
         restaure jamais ce champ (on n'annule pas une annulation). */
      profondeurUndo: undoStack.length,
      /* Ajouté pour la partie à distance, et sans effet sur l'annulation (qui
         ne restaure jamais ce champ : on n'annule pas le lancement d'une
         partie). C'est l'instantané de l'hôte qui dit aux invités que la table
         est ouverte — eux n'ont aucun autre moyen de le savoir, et sans ça ils
         entraient sur un plateau généré chez eux, aussitôt remplacé. */
      partieLancee: setupDone,
      /* ── LA FILE DE MISE EN PLACE ET LES RÉGLAGES DE TABLE ──
         Ajoutés le 2026-08-29 pour la partie à distance, et absents jusque-là
         pour une raison parfaitement valable : « Annuler » n'en a jamais eu
         besoin. On n'annule pas pendant la mise en place, et les réglages de
         table ne changent pas en cours de partie — les restaurer revenait donc
         à réécrire ce qui était déjà là.

         Un invité, lui, n'a RIEN de tout ça : il n'est pas passé par l'écran
         d'accueil, il n'a jamais tiré de plateau. Sans la file, son bandeau de
         mise en place restait muet et aucune case ne s'allumait ; sans les
         réglages, il affichait quatre Titans humains sans nom sur une partie
         qui en compte trois, dont deux IA.

         Pour l'annulation, ces champs sont inertes : on y remet exactement ce
         qui s'y trouvait déjà. */
      placementRestant: [...placementRestant],
      /* Le ramassage en cours de Je Ne Partage Pas (2026-09-14). Depuis qu'il se
         joue chez l'hôte, c'est de l'état de partie : l'invité en a besoin pour
         voir son compteur et clôturer, et « Annuler » le remet à ce qu'il était
         avant le premier bloc. */
      jnpSelected: [...jnpSelected],
      /* Les Fatigues qui attendent le refus de leur cible (2026-09-16). Elles
         n'étaient pas ici : un invité visé ne voyait jamais son bandeau, et
         l'hôte le voyait à sa place, carte nommée. `plateauPublic` en masque
         les cartes ; chaque cible reçoit la sienne par son courrier privé. */
      fatiguesEnAttente: fatiguesEnAttente.map((f) => ({ ...f })),
      /* Le choix d'entrée par un coin bloqué (audit du 2026-09-23). Absent
         d'ici, un invité ne voyait jamais le bandeau de sa propre rentrée — sa
         défausse était refusée et son déplacement ne faisait rien — et Annuler
         laissait le Titan dehors, sans bandeau. */
      cornerChoice: cornerChoice ? { ...cornerChoice, options: [...cornerChoice.options] } : null,
      table: {
        nbJoueurs,
        titanModes: { ...titanModes },
        titanNames: { ...titanNames },
        titanProfiles: { ...titanProfiles },
        eventsEnabled,
        modeVolRepos,
        apocalypseThreshold,
        gameSeed,
        /* LE NIVEAU DES IA VOYAGE AVEC LE RESTE (Nikola, 2026-09-01 : « les
           invités doivent aussi savoir le niveau de l'IA au moment de la
           configuration de la partie »). Il manquait à cette table alors qu'il
           décide contre quoi on s'assied — l'invité voyait le nombre de Titans,
           les Événements et le Seuil, mais pas la seule chose qui change la
           difficulté de sa partie. Inerte pour l'annulation, comme ses voisins :
           on y remet ce qui s'y trouvait déjà. */
        difficulte,
        egalitesLanterneRouge,
      },
    };
    return snapshot;
  }, [
    partieId, setupDone, placementRestant, nbJoueurs, titanModes, titanNames, titanProfiles,
    eventsEnabled, modeVolRepos, gameSeed, apocalypseThreshold, difficulte, egalitesLanterneRouge,
    state, titanState, looseBlocks, activePlayerId, phase, passifUsed, actionLog, waitingNextTitan, volResume,
    decisionQueue, repliQueue, ecroulement, fpmcAttackerId, fpmcPendingIds, fpmcNTargets,
    fpmcAttackerBase, fpmcCurrent, mancheNumber, phaseValidated, volDirection, currentEvent,
    rainbowWinnerId, vertAssignments, vertsValides, gameOver, showScoring, coutRentree, toutCasserFile,
    undoStack.length, jnpSelected, fatiguesEnAttente, cornerChoice,
  ]);

  const captureSnapshot = useCallback(() => {
    /* ⚠️ L'instantané se calcule ICI, hors de l'updater — c'est la règle que
       le long commentaire ci-dessus a établie après un bug tenace. Écrire
       `setUndoStack((prev) => [...prev, instantaneCourant()])` remettrait le
       clone dans l'updater, donc à un instant indéterminé, potentiellement
       APRÈS qu'un résolveur ait muté le plateau en place : on capturerait
       alors l'état d'après en croyant garder celui d'avant. */
    const snapshot = instantaneCourant();
    setUndoStack((prev) => [...prev, snapshot]);
  }, [instantaneCourant]);

  // Vide l'historique quand le joueur actif change (tour terminé = irréversible)
  const prevActivePlayerRef = useRef(activePlayerId);
  useEffect(() => {
    if (prevActivePlayerRef.current !== activePlayerId) {
      setUndoStack([]);
      prevActivePlayerRef.current = activePlayerId;
    }
  }, [activePlayerId]);

  /* ── REPOSER LA PARTIE SUR UN INSTANTANÉ ──────────────────
     Extrait de `handleUndo` le 2026-08-29, sans changer une ligne de son
     contenu : « Annuler » n'est plus le seul à devoir remettre la partie dans
     un état déjà connu. Une partie à distance fait exactement le même geste à
     chaque coup — l'invité reçoit le plateau de l'hôte et se cale dessus.

     Les deux usages ont besoin de la MÊME exhaustivité, et c'est ce qui rend
     l'extraction évidente plutôt qu'astucieuse : tout ce que l'annulation
     avait dû apprendre à restaurer au fil des bugs (la file de Tout Casser, le
     compteur de rounds, les modes de carte laissés ouverts) est exactement ce
     qu'un invité doit recevoir. Écrire une seconde fonction « pour le réseau »
     aurait garanti qu'elle prenne du retard sur celle-ci. */
  /* ── POURQUOI `reinitialiserInterface` EXISTE ─────────────
     Nikola, 2026-08-30, six symptômes distincts qui n'en font qu'un : « je ne
     peux pas utiliser mon déplacement passif, quand je clique sur les cases
     rien ne se passe », « j'ai voulu charger un Titan, j'ai cliqué dessus,
     rien ne se passe », « ça ne garde pas en mémoire la programmation ».

     Cette fonction remet l'interface à plat — modes de carte fermés, chemin
     effacé, mises d'Adrénaline à zéro — et c'est exactement ce qu'il faut
     après un « Annuler » : le plateau revient en arrière, les brouillons qui
     le décrivaient n'ont plus de sens.

     Mais un invité l'appelle À CHAQUE INSTANTANÉ REÇU, c'est-à-dire après le
     moindre geste de n'importe qui à la table. Il ouvrait « Me déplacer », un
     autre joueur bougeait à l'autre bout du plateau, et son mode se refermait
     sous ses doigts. Le clic suivant tombait alors dans le vide : `clicCase`
     teste `moveMode` avant tout, et il valait `false`. Rien à l'écran ne
     disait pourquoi.

     L'état de PARTIE vient de l'hôte ; les BROUILLONS d'interface appartiennent
     à celui qui les compose. Cet argument sépare les deux : l'annulation
     continue de tout reposer, la synchronisation réseau ne touche qu'au
     plateau (cf. l'effet de calage côté invité, qui ne redemande la remise à
     plat que lorsque le tour, la Phase ou la Manche ont réellement changé). */
  const restaurerInstantane = useCallback((snap, { reinitialiserInterface = true, restaurerTable = true } = {}) => {
    if (!snap) return;
    setState(structuredClone(snap.state));
    setTitanState(structuredClone(snap.titanState));
    setLooseBlocks(structuredClone(snap.looseBlocks));
    setActivePlayerId(snap.activePlayerId);
    setPhase(snap.phase);
    setPassifUsed(structuredClone(snap.passifUsed));
    /* ── LE JOURNAL N'EST PLUS TOUJOURS DANS L'INSTANTANÉ ──
       2026-09-17. `snap` couvre deux cas : la pile d'annulation locale (elle
       garde TOUJOURS le journal complet, cf. `instantaneCourant`) et l'état
       reçu du réseau par un invité (`plateauPublic` l'en a retiré exprès,
       cf. `net/session.js`). Un invité reconstruit son journal en local par
       le canal dédié (`session.sur("journal", …)` plus bas) — l'écraser ici
       avec un champ absent remettrait sa vue à zéro à chaque coup. */
    if (snap.actionLog) setActionLog([...snap.actionLog]);
    if (reinitialiserInterface) {
      arreterTrace(); // la trace decrirait un vol que l'annulation vient d'effacer
      /* Le compte à rebours du Vol de Phase Repos décrit lui aussi une action
         qu'on vient de défaire : le laisser courir validerait les phases d'une
         Manche qui n'a plus eu lieu. */
      if (volTimerRef.current) { clearTimeout(volTimerRef.current); volTimerRef.current = null; }
      setMoveMode(false); setRecupMode(false); setBbMode(false); setBbPath([]); setBbSurvol([]);
      setJnpMode(false); setJnpSelected([]); setGraouMode(false);
    }
    /* Les files en attente sont RESTAURÉES, plus vidées. Les vider défaisait
       le plateau sans défaire les décisions qu'il avait déclenchées : on
       revenait avant la carte, mais le Dilemme qu'elle avait ouvert restait
       dû — ou disparaissait, selon la file. Ni l'un ni l'autre n'est une
       annulation. */
    setDecisionQueue(structuredClone(snap.decisionQueue || []));
    // Après la remise à plat de l'interface, qui le vide : cf. `instantaneCourant`.
    setJnpSelected([...(snap.jnpSelected || [])]);
    setFatiguesEnAttente((snap.fatiguesEnAttente || []).map((f) => ({ ...f })));
    setCornerChoice(snap.cornerChoice ? { ...snap.cornerChoice, options: [...snap.cornerChoice.options] } : null);
    setRepliQueue(structuredClone(snap.repliQueue || []));
    setEcroulement(snap.ecroulement ? structuredClone(snap.ecroulement) : null);
    setToutCasserFile(snap.toutCasserFile ? structuredClone(snap.toutCasserFile) : null);
    setFpmcAttackerId(snap.fpmc?.attackerId ?? null);
    setFpmcPendingIds([...(snap.fpmc?.pendingIds || [])]);
    setFpmcNTargets(snap.fpmc?.nTargets ?? 0);
    setFpmcAttackerBase(snap.fpmc?.attackerBase ?? 0);
    setFpmcCurrent(snap.fpmc?.current ? { ...snap.fpmc.current } : null);
    setMancheNumber(snap.mancheNumber);
    setPhaseValidated({ ...(snap.phaseValidated || {}) });
    setVolDirection(snap.volDirection ?? null);
    setVolResume(snap.volResume ? [...snap.volResume] : []);
    setCurrentEvent(snap.currentEvent ?? null);
    setRainbowWinnerId(snap.rainbowWinnerId ?? null);
    setVertAssignments(structuredClone(snap.vertAssignments || {}));
    setVertsValides(structuredClone(snap.vertsValides || {}));
    setGameOver(Boolean(snap.gameOver));
    setShowScoring(Boolean(snap.showScoring));
    setCoutRentree(snap.coutRentree ? { ...snap.coutRentree } : null);
    setAiPlayingSync(false);
    setWaitingNextTitan(snap.waitingNextTitan ?? false);
    cardsPlayedCountRef.current = { ...(snap.cardsPlayedCount || {}) };
    /* Le rollback restaurait le PLATEAU sans remettre l'interface à plat.
       Restaient debout : le mode Tête en Avant, une répartition d'Amas en
       cours, une comparaison Faut Pas Me Chauffer, la carte marquée comme
       cliquée, et les compteurs d'Adrénaline engagés. Résultat remonté par
       Nikola le 2026-08-17 : après avoir ouvert Boing Boing puis annulé, le
       plateau restait capté par un mode carte invisible et les clics de
       déplacement ne produisaient plus rien.

       `undoTick` sert aux panneaux à réinitialiser LEUR état local (l'étape
       du tour en cours, notamment) : ils ne peuvent pas le déduire du seul
       état de jeu restauré. */
    if (reinitialiserInterface) {
      setTeaMode(false);
      setPendingCardConfirm(null);
      setMoveAdrenaline(0); setTeaAdrenaline(0); setTcAdrenaline(0); setBbAdrenaline(0);
      setAnimating(false); setAnimLabel("");
    }
    /* Cf. le commentaire de `instantaneCourant` : inerte pour l'annulation (on
       y remet ce qui s'y trouvait), indispensable pour un invité, qui n'a
       jamais vu l'écran d'accueil et ne connaît la table que par là. */
    if (snap.placementRestant) setPlacementRestant([...snap.placementRestant]);
    /* Annuler défait des COUPS, pas la table : un siège repris par un invité
       depuis le coup annulé ne repasse pas à l'IA (audit du 2026-09-23). */
    if (snap.table && restaurerTable) {
      setNbJoueurs(snap.table.nbJoueurs);
      setTitanModes({ ...snap.table.titanModes });
      setTitanNames({ ...snap.table.titanNames });
      setTitanProfiles({ ...snap.table.titanProfiles });
      setEventsEnabled(Boolean(snap.table.eventsEnabled));
      setModeVolRepos(snap.table.modeVolRepos);
      setApocalypseThreshold(snap.table.apocalypseThreshold);
      setGameSeed(snap.table.gameSeed);
      if (snap.table.difficulte) setDifficulte(snap.table.difficulte);
      // `!== undefined` et non un `||` : la valeur utile est justement `false`.
      if (snap.table.egalitesLanterneRouge !== undefined) setEgalitesLanterneRouge(Boolean(snap.table.egalitesLanterneRouge));
    }
    /* `undoTick` fait remettre aux panneaux LEUR état local d'étape (le
       « Passer aux cartes » de BoardPanel, notamment). Le bousculer à chaque
       instantané reçu ramenait l'invité à l'étape Déplacement au milieu de son
       tour, aussi souvent que la table jouait. Il ne bouge donc que quand on
       remet réellement l'interface à plat. */
    if (reinitialiserInterface) setUndoTick((n) => n + 1);
  }, [arreterTrace]);

  const handleUndo = useCallback(() => {
    // Bug remonté (persistant) : le pattern précédent déclenchait un
    // setTimeout DEPUIS L'INTÉRIEUR du setter fonctionnel de setUndoStack —
    // un effet de bord dans un updater React, jamais garanti fiable (peut
    // s'exécuter plusieurs fois, ou sur un état pas encore commité, selon
    // le timing exact du rendu). Réécrit en séquence synchrone classique :
    // on lit le dernier snapshot directement (pas besoin de fonctionnel
    // puisqu'on ne dépend que de la valeur actuelle d'undoStack), on
    // restaure tout d'un coup, puis on dépile.
    if (undoStack.length === 0) return;
    /* Un tour d'IA en vol a été calculé sur l'état qu'on défait : il jouerait
       sa carte par-dessus le Dilemme restauré (audit du 2026-09-23). On le
       coupe ; l'effet de tour IA le relance depuis l'état rendu. */
    annulerTimersIA();
    coupJointRef.current = null;
    setAiPlayingSync(false);
    restaurerInstantane(undoStack[undoStack.length - 1], { restaurerTable: false });
    setUndoStack((prev) => prev.slice(0, -1));
  }, [undoStack, restaurerInstantane, annulerTimersIA]);

  /* ══════════════════════════════════════════════════════════
     CE QU'UN INVITÉ A LE DROIT DE DEMANDER
     ══════════════════════════════════════════════════════════
     La liste est BLANCHE, jamais noire : une action absente d'ici ne franchit
     pas le réseau, et le jour où le jeu en gagne une nouvelle, elle est
     inaccessible à distance jusqu'à ce que quelqu'un l'ajoute sciemment. Une
     liste noire aurait la propriété inverse — toute action nouvelle serait
     exposée par défaut, y compris celles qui n'ont aucun sens à distance
     (`regenerate`, `setTitanState`, `setPhase`…).

     Chaque entrée dit POUR QUI l'action se joue, et c'est cette colonne qui
     porte la sécurité côté hôte :

       "soi"        le Titan du siège de l'invité, à tout moment (programmer
                    ses cartes — chacun le fait chez lui). L'action ne PREND
                    PAS le Titan en argument : elle lit la sélection, que
                    l'hôte a déjà basculée sur le siège de l'expéditeur ;
       "soi-arg0"   pareil, mais l'action reçoit le Titan en PREMIER ARGUMENT.
                    Il faut alors vérifier cet argument-là, sans quoi le siège
                    ne protège plus rien (cf. `titanAutorise`) ;
       "actif"      le Titan du siège doit être celui à qui c'est le tour ;
       "placement"  il doit être celui que la file de mise en place attend ;
       "dil-attaquant", "dil-defenseur", "repli", "detonateur"
                    il doit être celui que la décision bloquante interroge.

     Un invité peut mentir sur tout ce qu'il envoie SAUF sur son siège : le
     relais y appose son expéditeur, et c'est l'hôte qui lit la table des
     sièges. Toute la confiance tient sur ce seul point. */
  const ACTIONS_DISTANTES = useMemo(() => ({
    // Mise en place d'ouverture
    placerTitanJoueur: "placement",
    chooseCornerEntry: "actif",

    /* Programmation — chacun la fait chez lui, en même temps que les autres.

       ⚠️ `toggleProgCard` N'EST PAS ICI, ET C'EST LE CORRECTIF (Nikola,
       2026-08-30 : « ça ne garde pas en mémoire la programmation des 3 cartes,
       quand je clique sur une carte ça perd la sélection de la carte d'avant,
       et je ne vois aucun encart de sélection — seul l'hôte le voit »).

       Cocher une carte n'est pas un coup, c'est un brouillon : rien n'a bougé
       sur le plateau tant que les trois ne sont pas confirmées. En faisant
       voyager ce clic, on obtenait très exactement les deux symptômes décrits.
       Chez l'invité, `progSelection` ne changeait jamais — d'où l'encart
       invisible. Chez l'hôte, chaque intention réinstallait le `progSelection`
       joint au message, c'est-à-dire l'état d'AVANT le clic : la sélection
       précédente était donc écrasée à chaque carte cochée. Et l'encart
       apparaissait chez l'hôte, qui n'a rien à voir avec cette main — la
       programmation secrète tombait par la même occasion.

       La sélection reste donc chez celui qui la compose, et ne traverse le
       réseau qu'une fois, jointe au `confirmProgrammation` qui l'engage. */
    confirmProgrammation: "soi",
    validatePhase: "soi-arg0",
    /* ANNULER EST UN GESTE DE TOUR, PAS UN PRIVILÈGE D'HÔTE (Nikola,
       2026-08-30 : « en tant qu'invité je ne peux pas annuler mon déplacement,
       il n'y a que le maître de la table qui peut faire ça, alors que ce
       n'est pas voulu »).

       La pile d'annulation vit chez l'hôte, seul à faire tourner le moteur —
       un invité n'a rien à dépiler chez lui. Il demande donc à l'hôte de
       dépiler la sienne. La portée « actif » suffit à borner le geste : la
       pile est vidée à chaque changement de Titan actif, on ne peut donc
       jamais annuler que ses propres coups, dans son propre tour. */
    handleUndo: "actif",

    // Phase Action : les six cartes et les deux passifs
    jouerTeteEnAvant: "actif",
    jouerGraouhhh: "actif",
    jouerBoingBoing: "actif",
    jouerJeNePartagePas: "actif",
    /* Le ramassage élément par élément de Je Ne Partage Pas (2026-09-14). Il
       manquait ici : chez un invité, le clic sur une case ramassait DANS SON
       NAVIGATEUR — l'hôte n'en savait rien, et le plateau suivant effaçait
       tout. Joué chez l'hôte, il y tient le vrai compteur (`jnpSelected`). */
    jnpPickCell: "actif",
    jouerFautPasMeChauffer: "actif",
    jouerToutCasser: "actif",
    jouerMouvementGratuit: "actif",
    jouerRecuperation: "actif",
    discardCurrentCard: "actif",
    passerAuTitanSuivant: "actif",
    toutCasserResoudre: "actif",
    pickFpmcTarget: "actif",
    // Chacun ne mise que pour lui : cf. la portée « mise-fpmc » de `titanAutorise`.
    updateFpmcBid: "mise-fpmc",
    /* « À distance, c'est le défenseur qui fait que ça se révèle » (Nikola,
       2026-09-16) — l'attaquant, lui, n'a plus la main une fois sa mise posée.
       Face à une IA, qui ne clique pas, c'est l'attaquant. */
    revealFPMC: "revele-fpmc",

    /* Décisions bloquantes : c'est le Titan interrogé qui répond, et lui seul.
       Audit du 2026-09-23 : une portée unique « decision » laissait passer
       n'importe quel siège, sur la foi d'une garde que les résolveurs ne
       portaient pas — un invité tranchait le Dilemme ou le Vol d'un autre. */
    dilAttackerPick: "dil-attaquant",
    dilValidateAttackerPick: "dil-attaquant",
    resolveDilDefenderPick: "dil-defenseur",
    resolveDilCancelWithAdrenaline: "dil-defenseur",
    resolveRagePick: "dil-attaquant",
    resolveRagePickAdrenaline: "dil-attaquant",
    choisirRepli: "repli",
    ecroulementPoserDebris: "actif",
    ecroulementAbandonner: "actif",
    // La Fatigue ne se tranche que par sa cible : payer, c'est dépenser SON
    // Adrénaline (2026-09-16 — la portée « decision » laissait n'importe qui le faire).
    refuserFatigueEnCours: "cible-fatigue",
    accepterFatigueEnCours: "cible-fatigue",
    chooseVolDirection: "detonateur",
    /* Couper la pause de lecture du Vol : n'importe quel joueur assis peut le
       faire, comme autour d'une vraie table. Elle s'exécutait chez l'invité
       seul, dont l'état divergeait de l'hôte (audit du 2026-09-23). */
    validerVolMaintenant: "soi",

    // Décompte final : le placement secret des Verts
    updateVertAssignment: "soi-arg0",
    validerVerts: "soi-arg0",
  }), []);

  /* Réglages d'interface que l'hôte doit adopter AVANT d'exécuter l'action
     d'un invité. Ils ne sont pas dans l'instantané — ce sont des brouillons,
     pas de l'état de partie : le chemin qu'on est en train de tracer, le
     nombre d'Adrénalines qu'on s'apprête à miser. Ils vivent donc chez celui
     qui les compose, et ne traversent le réseau qu'au moment de valider. */
  /* ── LES VALEURS SONT VÉRIFIÉES, PAS SEULEMENT LES CLÉS ──
     Revue du 2026-09-14. L'exécuteur ne laisse passer que ces clés-ci, mais la
     VALEUR arrivait telle quelle : `progSelection: 5` était posé chez l'hôte,
     et le rendu suivant appelait `.map` sur un nombre — un plantage hors de
     tout filet, et la partie de la table avec. Chaque réglage vérifie donc sa
     forme et ignore le reste.

     `jnpSelected` n'est plus ici : ce n'est pas un brouillon mais le compteur
     de ce que l'hôte a réellement ramassé (cf. `jnpPickCell`, désormais joué
     chez lui). L'adopter depuis le réseau permettait de le réécrire. */
  const CONTEXTE_DISTANT = useMemo(() => {
    const entier = (poser) => (v) => { if (Number.isInteger(v) && v >= 0 && v <= 99) poser(v); };
    return {
      bbPath: (v) => { if (Array.isArray(v) && v.length <= 64 && v.every((k) => typeof k === "string")) setBbPath(v); },
      bbAdrenaline: entier(setBbAdrenaline),
      moveAdrenaline: entier(setMoveAdrenaline),
      teaAdrenaline: entier(setTeaAdrenaline),
      tcAdrenaline: entier(setTcAdrenaline),
      progSelection: (v) => {
        if (Array.isArray(v) && v.length <= 3
          && v.every((c) => c && Number.isInteger(c.idx) && typeof c.cardId === "string")) setProgSelection(v);
      },
      direction: (v) => {
        if (v && Number.isInteger(v.dr) && Number.isInteger(v.dc) && Math.abs(v.dr) <= 1
          && Math.abs(v.dc) <= 1 && typeof v.label === "string") setDirection(v);
      },
      /* Le mode Tête en Avant ouvert chez l'invité : les cibles de la charge
         ne se calculent que mode ouvert, et celui de l'hôte est fermé. Sans
         lui, toute Tête en Avant d'un invité était refusée sans un mot (audit
         du 2026-09-23). */
      teaMode: (v) => { if (typeof v === "boolean") setTeaMode(v); },
    };
  }, []);

  /* ══════════════════════════════════════════════════════════
     L'HÔTE PRÊTE SA MAIN À UN INVITÉ, LE TEMPS D'UNE ACTION
     ══════════════════════════════════════════════════════════
     Presque toutes les actions du contrôleur se jouent POUR le Titan
     sélectionné : `jouerBoingBoing` lit `selectedTitanId`, `bbDest` et
     `bbAdrenaline` dans l'état local, et n'accepte aucun paramètre. C'est la
     bonne forme pour un appareil qui circule autour d'une table — et
     exactement la mauvaise pour quatre écrans.

     Deux issues étaient possibles. Réécrire les huit actions de validation
     pour qu'elles prennent tout en argument : correct, mais huit refactorings
     de soixante lignes chacun, sur les fonctions les plus chargées du fichier,
     pour un gain nul en local. Ou faire adopter à l'hôte, le temps d'une
     action, la position de l'invité — et laisser les fonctions inchangées.

     C'est la seconde. Une intention traverse TROIS RENDUS, un état par cran :

       recu     l'intention est en file, rien n'a bougé ;
       siege    l'hôte a basculé `selectedTitanId` sur le Titan de l'invité ;
       contexte l'hôte a adopté ses brouillons (chemin tracé, mise d'Adrénaline) ;
       → puis l'action s'exécute, et la sélection de l'hôte est rendue.

     Pourquoi trois rendus et pas un seul : les setters de React ne prennent
     effet qu'au rendu suivant. Tout faire d'affilée appellerait l'action avec
     l'ANCIENNE sélection et l'ANCIEN contexte — précisément la classe de bug
     que ce fichier documente à cinq endroits. On ne lutte donc pas contre le
     cycle de rendu, on s'en sert comme d'une horloge.

     Les intentions se traitent UNE À LA FOIS, dans l'ordre d'arrivée : deux
     joueurs qui cliquent en même temps ne peuvent pas s'entrelacer au milieu
     d'une adoption de siège. */
  const [fileIntentions, setFileIntentions] = useState([]);
  /* Les départs annoncés par le relais, en attente de traitement chez l'hôte.
     Cf. l'effet « une IA reprend la place » plus bas. */
  const [fileDeparts, setFileDeparts] = useState([]);
  const [etapeIntention, setEtapeIntention] = useState("recu");
  const selectionHoteRef = useRef(null);
  const progHoteRef = useRef([]);

  /* Les callbacks changent d'identité à chaque rendu ; une ref lue au moment
     de l'exécution donne toujours la version courante, sans faire dépendre
     l'effet de deux cents fonctions. */
  const actionsRef = useRef({});

  /* Qui lance le « 3-2-1 GO » de Faut Pas Me Chauffer : le défenseur, sauf
     s'il est tenu par une IA — elle ne clique pas, l'attaquant le fait. Lu par
     la liste blanche (portée « revele-fpmc ») et par le bandeau, qui ne montre
     le bouton qu'à cet appareil-là. */
  const fpmcRevelateur = fpmcCurrent
    ? (titanModes[fpmcCurrent.defenderId] === "ia" ? fpmcAttackerId : fpmcCurrent.defenderId)
    : null;

  const titanAutorise = useCallback((portee, titanDuSiege, args = []) => {
    if (titanDuSiege == null) return false;
    if (portee === "soi") return true;
    /* ── « SOI » NE PROTÈGE RIEN QUAND LE TITAN EST UN ARGUMENT ──
       Trouvé à la revue de sécurité du 2026-09-07. La portée « soi » rendait
       `true` dès que l'expéditeur avait un siège, quel qu'il soit — ce qui est
       juste pour une action qui lit la SÉLECTION (l'hôte l'a déjà basculée sur
       le siège de l'expéditeur, il ne peut donc pas jouer ailleurs). Ça ne
       l'est pas du tout pour une action qui reçoit le Titan en argument :
       l'argument, lui, vient du réseau tel quel.

       Trois actions étaient dans ce cas, et ce sont les trois qui touchent au
       geste le plus secret de la partie :
         · `updateVertAssignment(titanId, i, valeur)` — un invité assis sur le
           Titan 2 pouvait réécrire le placement secret des Verts du Titan 3 ;
         · `validerVerts(titanId)` — et le figer définitivement ;
         · `validatePhase(titanId)` — valider la phase à la place d'un autre,
           `canValidatePhase` étant un contrôle d'ÉTAT DE JEU, pas de
           propriété.

       On compare donc l'argument au siège, et on refuse dès qu'ils diffèrent.
       `Number()` des deux côtés : le siège est un nombre, l'argument arrive du
       JSON et peut être une chaîne. */
    if (portee === "soi-arg0") return Number(args?.[0]) === Number(titanDuSiege);
    if (portee === "actif") return titanDuSiege === activePlayerId;
    if (portee === "placement") {
      /* Même règle que `prochainAPlacer`, recopiée en une ligne plutôt
         qu'appelée : cette fonction est déclarée plus bas dans le fichier, et
         la nommer en dépendance ici la lirait avant son initialisation. La
         règle, elle, tient en un mot — c'est le drapeau `aPlacer` qui dit ce
         qui reste à faire, jamais la file. */
      const joueurs = aiTitanStateRef.current?.players || [];
      const attendu = (placementRestantRef.current || [])
        .find((id) => joueurs.find((t) => t.id === id)?.aPlacer) ?? null;
      return attendu === titanDuSiege;
    }
    /* Faut Pas Me Chauffer : chaque camp ne fixe que SA mise (2026-09-14). La
       portée « actif » donnait les deux champs à l'attaquant — un invité qui
       attaque réglait la mise du défenseur, et un défenseur distant ne pouvait
       pas miser du tout. */
    if (portee === "mise-fpmc") {
      const miseur = args?.[0] === "attackerBid" ? fpmcAttackerId : fpmcCurrent?.defenderId;
      return miseur != null && Number(miseur) === Number(titanDuSiege);
    }
    if (portee === "revele-fpmc") {
      return fpmcRevelateur != null && Number(fpmcRevelateur) === Number(titanDuSiege);
    }
    if (portee === "cible-fatigue") {
      return fatigueEnAttente != null && Number(fatigueEnAttente.targetId) === Number(titanDuSiege);
    }
    /* Une décision bloquante interroge quelqu'un de précis : on le nomme. */
    const est = (id) => id != null && Number(id) === Number(titanDuSiege);
    if (portee === "dil-attaquant") return est(currentDecision?.attackerId);
    if (portee === "dil-defenseur") return est(currentDecision?.defenderId);
    if (portee === "repli") return est(currentRepli?.initiatorId);
    if (portee === "detonateur") return est(titanState.detonateur);
    return false;
  }, [activePlayerId, fpmcAttackerId, fpmcCurrent, fpmcRevelateur, fatigueEnAttente,
    currentDecision, currentRepli, titanState.detonateur]);

  /* ══════════════════════════════════════════════════════════
     QUAND QUELQU'UN PART, SON TITAN NE S'ARRÊTE PAS DE JOUER
     ══════════════════════════════════════════════════════════
     Nikola, 2026-08-30 : « si un joueur quitte la partie, une IA reprend sa
     place » — et, dans le même souffle, « un joueur peut rejoindre la partie
     en cours de route, il prend juste un Titan qui était géré par l'IA ; s'il
     quitte, une IA reprend sa place ».

     Les deux moitiés décrivent une seule chose : un siège n'est jamais vide.
     Il est tenu par un humain ou par l'IA, et il passe de l'un à l'autre sans
     que la partie s'arrête. C'est ce qui permet à quelqu'un de partir en
     cours de Manche sans bloquer les trois autres devant un Titan qui ne
     jouera plus, et de revenir plus tard reprendre sa place.

     Le relais nomme le partant et rend son siège dans le même message (cf.
     `retirerParticipant`) : l'hôte n'a donc rien à deviner en comparant deux
     listes de présence.

     Le profil de l'IA est TIRÉ à ce moment-là, à la force réglée pour la
     table. Sans lui, `profilDe` retombe sur un profil par défaut qui ignore
     la difficulté choisie : une partie en Expert se serait poursuivie contre
     une IA de niveau moyen, sans que rien ne le dise. */
  useEffect(() => {
    if (!distantHote || fileDeparts.length === 0) return;
    const depart = fileDeparts[0];
    setFileDeparts((f) => f.slice(1));

    const qui = depart.pseudo || "Un joueur";
    const titanId = Number(depart.titanId);
    if (!Number.isInteger(titanId) || titanId < 1) {
      // Il n'avait pas de siège : un spectateur, ou quelqu'un parti du salon.
      setActionLog((prev) => [...prev, `👋 ${qui} a quitté la table.`]);
      return;
    }
    if (aiTitanModesRef.current[titanId] === "ia") return; // déjà repris
    setTitanModes((prev) => ({ ...prev, [titanId]: "ia" }));
    setTitanProfiles((prev) => (
      prev[titanId] ? prev : { ...prev, [titanId]: makeProfile(difficulte, pick(Object.values(TEMPERAMENTS))) }
    ));
    setActionLog((prev) => [
      ...prev,
      `👋 ${qui} a quitté la table — l'IA reprend ${titanNames[titanId] || `Titan ${titanId}`}.`,
    ]);
  }, [distantHote, fileDeparts, difficulte, titanNames]);

  useEffect(() => {
    if (!distantHote || fileIntentions.length === 0) return;
    const intention = fileIntentions[0];
    const rejeter = (raison) => {
      setFileIntentions((f) => f.slice(1));
      setEtapeIntention("recu");
      setActionLog((prev) => [...prev, `🚫 ${intention.pseudo} : ${raison}`]);
      /* Un refus APRÈS l'adoption du siège rend la main à l'hôte, comme le
         chemin qui aboutit (2026-09-14) : sans ça, son panneau restait
         accroché au Titan de l'invité et à sa sélection de cartes. */
      if (etapeIntention !== "recu") {
        if (selectionHoteRef.current != null) setSelectedTitanId(selectionHoteRef.current);
        setProgSelection(progHoteRef.current || []);
      }
    };

    /* ── UN INVITÉ PREND UN TITAN LIBRE, SANS PASSER PAR L'HÔTE ──
       Nikola, 2026-08-30 : « les autres ne doivent pas pouvoir régler les
       paramètres de la partie, par contre ils peuvent choisir un personnage
       libre ».

       Ce n'est pas une action de jeu : elle se traite avant la liste blanche,
       et hors de la machine à trois crans (il n'y a ni siège à emprunter ni
       brouillon à adopter — c'est précisément le siège qu'on est en train
       d'attribuer). L'hôte reste l'arbitre : il refuse un Titan déjà pris, un
       Titan confié à l'IA, ou un numéro hors table. Un invité ne peut donc pas
       s'asseoir de force, et surtout pas déloger quelqu'un.

       `intention.de` vient du relais, pas de la charge utile : un invité ne
       peut pas réclamer un siège au nom d'un autre. */
    if (intention.fn === "demanderSiege") {
      const voulu = Number(intention.args?.[0]);
      const sieges = { ...distantSiegesRef.current };
      if (!Number.isInteger(voulu) || voulu < 1 || voulu > nbJoueurs) {
        rejeter("ce Titan n'est pas à cette table."); return;
      }
      if (sieges[voulu] && sieges[voulu] !== intention.de) {
        rejeter("ce Titan est déjà pris."); return;
      }
      /* Partie lancée : seul un Titan tenu par l'IA est libre (2026-09-14). Un
         Titan humain sans siège distant se joue sur l'appareil de l'hôte ; le
         céder à qui le demandait délogeait l'hôte de sa propre place. Avant le
         lancement, le salon distribue encore les places librement. */
      if (setupDoneRef.current && !sieges[voulu] && aiTitanModesRef.current[voulu] !== "ia") {
        rejeter("ce Titan se joue à la table de l'hôte."); return;
      }
      /* ── ON PREND LA MAIN À L'IA, ET C'EST TOUT L'INTÉRÊT ──
         Nikola, 2026-08-30 : « un joueur peut rejoindre la partie en cours de
         route, il prend juste un Titan qui était géré par l'IA ».

         C'était refusé jusqu'ici : un Titan confié à l'IA était fermé, donc
         arriver en cours de partie voulait dire regarder. Or c'est exactement
         l'inverse qu'on veut — un siège tenu par l'IA est un siège LIBRE, et
         c'est même le seul qui puisse encore l'être une fois la partie
         commencée. Le retour d'un joueur parti passe par ce même chemin : sa
         place l'attend sous les traits d'une IA.

         Le basculement est immédiat, y compris au milieu du tour de ce Titan :
         la boucle d'IA lit `titanModes` à chaque étape et se tait dès qu'il
         n'est plus à elle. Le profil, lui, reste posé — il resservira si le
         joueur repart. */
      if (aiTitanModesRef.current[voulu] === "ia") {
        setTitanModes((prev) => ({ ...prev, [voulu]: "humain" }));
        setActionLog((prev) => [...prev, `🎮 ${intention.pseudo} reprend le Titan ${voulu} à l'IA.`]);
      }
      // Un joueur ne tient qu'un Titan : on libère celui qu'il occupait.
      Object.keys(sieges).forEach((k) => { if (sieges[k] === intention.de) delete sieges[k]; });
      sieges[voulu] = intention.de;
      distantSiegesRef.current = sieges;
      setDistantSieges(sieges);
      sessionRef.current?.publierSieges(sieges)?.catch(avisEnvoiRate("La table des sièges"));
      if (aiTitanModesRef.current[voulu] !== "ia") {
        setActionLog((prev) => [...prev, `🎮 ${intention.pseudo} prend le Titan ${voulu}.`]);
      }
      setFileIntentions((f) => f.slice(1));
      setEtapeIntention("recu");
      return;
    }

    /* `hasOwnProperty` et non une simple indexation : `intention.fn` vient du
       réseau, et `ACTIONS_DISTANTES["__proto__"]` ou `["constructor"]` rendrait
       une valeur héritée, donc « vraie », pour une action qui n'est pas dans la
       liste blanche. Même raison qu'à l'étape « contexte » plus bas. */
    const portee = Object.prototype.hasOwnProperty.call(ACTIONS_DISTANTES, intention.fn)
      ? ACTIONS_DISTANTES[intention.fn]
      : null;
    /* Le nom n'est cité que s'il a la forme d'un nom d'action : recopié tel
       quel, n'importe quel spectateur remplissait le journal de l'hôte de
       64 ko par message, fausses lignes comprises (audit du 2026-09-23). */
    if (typeof portee !== "string") {
      const nom = /^\w{1,40}$/.test(String(intention.fn)) ? ` « ${intention.fn} »` : "";
      rejeter(`action${nom} non autorisée à distance.`); return;
    }
    /* Le siège se lit dans la table de l'HÔTE, pas dans la copie du relais
       (2026-09-14) : `intention.titanId` est posé par le relais d'après la
       dernière table que l'hôte lui a publiée, et une réattribution encore en
       vol laissait l'ancien occupant jouer le Titan qu'on venait de lui
       retirer. L'expéditeur (`intention.de`), lui, vient toujours du relais. */
    const titanDuSiege = Number(Object.keys(distantSiegesRef.current)
      .find((id) => distantSiegesRef.current[id] === intention.de)) || null;
    if (!titanAutorise(portee, titanDuSiege, intention.args)) {
      rejeter("ce n'est pas à toi de jouer.");
      return;
    }

    if (etapeIntention === "recu") {
      selectionHoteRef.current = selectedTitanId;
      progHoteRef.current = progSelectionRef.current;
      setSelectedTitanId(titanDuSiege);
      setEtapeIntention("siege");
      return;
    }
    if (etapeIntention === "siege") {
      /* ⚠️ `CONTEXTE_DISTANT[cle]` SANS GARDE FAISAIT PLANTER TOUTE LA PARTIE.
         Trouvé à la revue de sécurité du 2026-08-30, et vérifié : `JSON.parse`
         d'un `{"__proto__": 1}` crée une propriété PROPRE et énumérable
         littéralement nommée `__proto__`. `Object.entries` la restitue, et
         l'indexation rendait alors `Object.prototype` — un objet, donc « vrai »
         — qu'on appelait ensuite comme une fonction.

         L'exception partait d'un `useEffect`, hors de tout filet : React démonte
         l'arbre entier, et la partie s'arrête pour toute la table. Il suffisait
         d'un invité assis et d'une seule requête.

         Deux verrous plutôt qu'un : la clé doit être une propriété PROPRE de la
         table (jamais héritée du prototype), et sa valeur doit être une vraie
         fonction. Et tout le bloc passe dans un filet, comme l'exécution de
         l'action juste en dessous — une intention malformée fait perdre son tour
         à son auteur, jamais la partie aux autres. */
      /* Le brouillon de l'invité ne sert qu'aux gestes qu'il fait AUX
         COMMANDES — son tour, sa programmation, sa mise en place. Une réponse
         à une décision, une mise FPMC ou un refus de Fatigue n'en lit rien, et
         l'adopter écrasait la direction et les mises d'Adrénaline que l'hôte
         préparait pour son propre tour (audit du 24/09, C15). */
      const aux = portee === "actif" || portee === "soi" || portee === "placement";
      try {
        if (aux) Object.entries(intention.contexte || {}).forEach(([cle, valeur]) => {
          if (!Object.prototype.hasOwnProperty.call(CONTEXTE_DISTANT, cle)) return;
          const poser = CONTEXTE_DISTANT[cle];
          if (typeof poser === "function") poser(valeur);
        });
      } catch (e) {
        console.error("[distant] contexte refusé", e);
        rejeter("réglages non reconnus.");
        return;
      }
      setEtapeIntention("contexte");
      return;
    }
    // etapeIntention === "contexte" : tout est en place, on joue.
    /* … sauf si la sélection a bougé entre deux crans (enchaînement d'une IA,
       clic de l'hôte) : l'action se jouerait pour le mauvais Titan. On refuse
       plutôt que de réadopter, ce qui pourrait tourner en rond (2026-09-14). */
    if (selectedTitanId !== titanDuSiege) {
      rejeter("la table a bougé pendant ton coup, rejoue-le.");
      return;
    }
    const action = Object.prototype.hasOwnProperty.call(actionsRef.current, intention.fn)
      ? actionsRef.current[intention.fn]
      : null;
    if (typeof action === "function") {
      try {
        action(...(intention.args || []));
      } catch (e) {
        /* Une action qui échoue ne doit pas figer la file pour tout le monde :
           on journalise et on passe à la suivante. L'invité verra dans le
           prochain instantané que rien n'a bougé. */
        console.error("[distant] action refusée", intention.fn, e);
        setActionLog((prev) => [...prev, `⚠️ L'action de ${intention.pseudo} n'a pas abouti.`]);
      }
    }
    setFileIntentions((f) => f.slice(1));
    setEtapeIntention("recu");
    // La main revient à l'hôte : son propre panneau ne doit pas rester
    // accroché au Titan de quelqu'un d'autre, ni à sa sélection de cartes.
    if (selectionHoteRef.current != null) setSelectedTitanId(selectionHoteRef.current);
    setProgSelection(progHoteRef.current || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distantHote, fileIntentions, etapeIntention, selectedTitanId, titanAutorise]);

  /* ══════════════════════════════════════════════════════════
     BRANCHER ET DÉBRANCHER LA SESSION
     ══════════════════════════════════════════════════════════ */
  const brancherSession = useCallback((nouvelle) => {
    setSession(nouvelle);
    setDistantJoueurs(nouvelle.joueurs || []);
    setDistantSieges(nouvelle.sieges || {});
    setDistantFin(null);
    setDistantAvis(null);
    /* Une AUTRE table repart sans garde-fou (2026-09-14) : levé pour une table
       précédente — un F5 de l'hôte —, il coupait en silence la diffusion de la
       suivante, faute de jamais être redescendu. La ref retient la table pour
       laquelle il a été posé : rebrancher la MÊME table le garde levé, et seul
       le geste explicite (`reprendreDiffusion`) l'abaisse. */
    if (diffusionBloqueeRef.current !== nouvelle.id) {
      diffusionBloqueeRef.current = false;
      setDistantDiffusionBloquee(false);
    }

    nouvelle.sur("presence", ({ joueurs, sieges }) => {
      /* La comparaison se fait sur la liste PRÉCÉDENTE, lue dans le setter :
         l'abonnement réseau est créé une fois pour toute la session, une
         fermeture y capturerait la liste vide du premier rendu et annoncerait
         tout le monde comme arrivant à chaque message de présence. */
      const arrivants = joueurs || [];
      setDistantJoueurs((avant) => {
        const refsAvant = new Set(avant.map((j) => j.ref));
        const refsApres = new Set(arrivants.map((j) => j.ref));
        // Le premier message de présence décrit la table telle qu'elle est, pas
        // une arrivée : on ne l'annonce pas (`avant` vide = on vient d'entrer).
        if (avant.length > 0) {
          arrivants.filter((j) => !refsAvant.has(j.ref)).forEach((j) => signalerMouvement("arrivee", j.pseudo));
          avant.filter((j) => !refsApres.has(j.ref)).forEach((j) => signalerMouvement("depart", j.pseudo));
        }
        /* ── UN ARRIVANT REÇOIT LE JOURNAL COMPLET, UNE SEULE FOIS ──
           2026-09-17. Le plateau public ne le porte plus (cf.
           `plateauPublic`). Sans ce resync, quiconque rejoint une partie déjà
           commencée — ou revient après un F5, qui change de `ref` — verrait
           un journal vide jusqu'à la prochaine ligne écrite par n'importe
           qui. Diffusé à TOUTE la table plutôt qu'au seul arrivant : plus
           simple qu'un courrier ciblé, et le coût ne se répète qu'aux
           arrivées, pas à chaque coup. */
        if (nouvelle.siege === "hote") {
          const nouveaux = arrivants.filter((j) => !refsAvant.has(j.ref));
          if (nouveaux.length > 0) {
            nouvelle.diffuserJournal({ complet: actionLogRef.current }).catch(() => {
              // Raté : le prochain envoi repartira du journal complet.
              dernierEnvoiJournalRef.current = 0;
              setTimeout(() => setRelanceDiffusion((n) => n + 1), 2000);
            });
          }
        }
        /* Même contenu, même référence (2026-09-14) : chaque relève redonne la
           présence, et un objet neuf relançait le rendu du contrôleur entier
           et les effets qui dépendent des sièges, pour rien. */
        return JSON.stringify(avant) === JSON.stringify(arrivants) ? avant : arrivants;
      });
      const nouveauxSieges = sieges || {};
      setDistantSieges((avant) => (JSON.stringify(avant) === JSON.stringify(nouveauxSieges) ? avant : nouveauxSieges));
    });
    nouvelle.sur("etat", (instantane) => setEtatDistantRecu(instantane));
    nouvelle.sur("prive", (charge) => setMainPriveeRecue(charge));
    /* ── RECONSTRUIRE LE JOURNAL EN LOCAL, CÔTÉ INVITÉ SEULEMENT ──
       2026-09-17. `complet` (resync d'arrivée) remplace tout ; `lignes`
       (delta d'un coup normal) s'ajoute à ce qui est déjà affiché — jamais
       l'inverse, cf. `restaurerInstantane` qui ne touche plus `actionLog`
       quand le réseau ne le porte pas. L'hôte reçoit aussi ses propres
       diffusions (le relais les dépose à toute la table) : les ignorer chez
       lui, sinon un `complet` capturé un instant plus tôt écraserait, à son
       retour par le réseau, les lignes écrites depuis. */
    nouvelle.sur("journal", ({ lignes, complet }) => {
      if (nouvelle.siege === "hote") return;
      if (Array.isArray(complet)) setActionLog([...complet]);
      else if (Array.isArray(lignes) && lignes.length > 0) setActionLog((prev) => [...prev, ...lignes]);
    });
    /* Les intentions n'arrivent que chez l'hôte — le relais les y adresse et
       nulle part ailleurs. On les met en file plutôt que de les jouer ici : le
       traitement demande trois rendus (cf. la machine ci-dessus), et un
       abonnement réseau n'est pas un endroit d'où piloter React. */
    nouvelle.sur("intention", (m) => setFileIntentions((f) => [...f, m]));
    nouvelle.sur("chat", (m) => setDistantChat((prev) => [...prev.slice(-40), m]));
    /* L'avis de coupure s'efface quand la liaison revient (2026-09-14) — mais
       seulement s'il est encore affiché : un avis plus récent (l'hôte s'est
       tu, par exemple) ne doit pas disparaître avec lui. */
    let dernierAvisCoupure = null;
    nouvelle.sur("erreur", ({ message }) => { dernierAvisCoupure = message; setDistantAvis(message); });
    nouvelle.sur("retablie", () => setDistantAvis((a) => (a === dernierAvisCoupure ? null : a)));
    /* Les nouvelles de liaison qui n'arrêtent rien : l'hôte s'est tu, l'hôte
       est revenu. Elles vont au même bandeau que les avis de reconnexion —
       c'est le même sujet, « où en est la liaison » — mais elles ne coupent
       pas la partie, contrairement à `fin`. */
    nouvelle.sur("liaison", ({ message }) => setDistantAvis(message));
    /* Un départ se traite comme une intention : en file, hors de l'abonnement
       réseau. Confier un Titan à l'IA touche à quatre morceaux d'état, ce n'est
       pas un geste à faire depuis un callback de socket. */
    nouvelle.sur("depart", (m) => setFileDeparts((f) => [...f, m]));
    nouvelle.sur("fin", ({ raison }) => { setDistantFin(raison); setDistantAvis(raison); });

    // Un invité qui arrive en cours de partie reçoit l'état courant d'emblée,
    // sans attendre le prochain coup de l'hôte.
    if (nouvelle.etatInitial) setEtatDistantRecu(nouvelle.etatInitial);

    /* ── UN HÔTE QUI REPREND SA TABLE GARDE SON PROPRE PLATEAU ──
       Le relais rend bien un instantané à la reprise, et il ne faut SURTOUT pas
       s'en servir : c'est le plateau PUBLIC, mains retirées (cf.
       `plateauPublic`). L'adopter effacerait les six cartes de chaque Titan.

       Le bon état est celui que l'hôte a toujours sous la main : sa session
       réseau est tombée, pas son onglet, et le moteur n'a jamais cessé de
       tourner dans cette page. On reprend donc la diffusion là où elle s'était
       arrêtée. `etatDistantRecu` reste inerte chez l'hôte — seul l'effet de
       calage côté invité le lit — mais on vide le garde-fou de diffusion pour
       que le premier envoi reparte à coup sûr, même si rien n'a bougé pendant
       l'absence.

       Ce qui n'est PAS rattrapable, et le livret le dit : un hôte qui RECHARGE
       sa page perd le moteur avec elle. Le relais ne garde qu'un plateau public,
       il ne peut pas rendre les mains. La reprise sert aux coupures, pas aux F5. */
    if (nouvelle.siege === "hote") {
      dernierEnvoiRef.current = "";
      dernieresMainsRef.current = {};
      /* ── UN F5 DE L'HÔTE NE DOIT PAS ÉCRASER LA TABLE ──
         Revue de sécurité du 2026-09-07, classée critique, et c'est le seul
         défaut du lot qui DÉTRUIT une partie.

         Le commentaire ci-dessus dit bien qu'un rechargement perd le moteur.
         Il ne disait pas ce qui se passait ensuite, et c'est le vrai problème :
         la page rechargée génère un plateau neuf au montage, et l'effet de
         diffusion — qui n'attend rien d'autre que « je suis hôte et j'ai une
         session » — le publiait 120 ms plus tard. `salle.etat` était écrasé, et
         tous les invités adoptaient la ville neuve. La partie de la table
         entière disparaissait à cause du F5 d'une seule personne.

         Deux faits suffisent à reconnaître ce cas, et ils sont tous les deux
         disponibles ici : le relais nous rend un état (`etatInitial`), donc une
         partie tournait ; et cette page-ci n'en a pas (`setupDone` faux), donc
         ce n'est pas la même. On coupe alors la diffusion, et on le DIT — le
         plateau des autres reste intact, et l'hôte peut encore récupérer son
         onglet d'origine s'il est ouvert quelque part.

         Ce n'est pas une reprise : c'est un garde-fou. La vraie reprise après
         F5 demanderait de persister la session ET les mains, ce que le relais
         ne stocke pas — c'est noté comme tel dans JOUER-A-DISTANCE.md. */
      if (nouvelle.etatInitial && !setupDoneRef.current) {
        diffusionBloqueeRef.current = nouvelle.id; // la table visée, cf. le début de `brancherSession`
        setDistantDiffusionBloquee(true);
        setDistantAvis(
          "Cette table a déjà une partie en cours, et cette page n'en a plus le moteur (elle a été rechargée). "
          + "Rien n'est envoyé : le plateau des autres joueurs est intact. Reprends l'onglet d'origine s'il est encore ouvert."
        );
      }
    }
    return nouvelle;
  }, [signalerMouvement]);

  const quitterSessionDistante = useCallback(async () => {
    const s = sessionRef.current;
    setSession(null);
    setDistantJoueurs([]); setDistantSieges({});
    setDistantMouvements([]);
    setEtatDistantRecu(null); setMainPriveeRecue(null);
    setFileIntentions([]); setEtapeIntention("recu"); setFileDeparts([]);
    // La table suivante repart d'un cadre vierge : ses brouillons survivaient au
    // changement de table quand la Manche, la Phase et le tour coïncidaient.
    dernierCadreDistantRef.current = "";
    if (s) await s.quitter();
  }, []);

  /* ── UN CONTRÔLEUR DÉMONTÉ QUITTE SA TABLE ──
     2026-09-14. Le contrôleur ne se démonte que sur un plantage rattrapé par la
     frontière de `main.jsx`. Sa boucle réseau, elle, continuait de relever le
     courrier : le relais croyait l'hôte présent alors que son moteur n'existait
     plus, et la table attendait sans fin, sans même l'avis « l'hôte s'est
     déconnecté ». */
  useEffect(() => () => { sessionRef.current?.quitter(); }, []);

  /* Fermer l'onglet doit libérer la place tout de suite. Sans ça, un joueur qui
     recharge sa page revient comme un SECOND participant, et son siège reste
     occupé par le fantôme du premier pendant quatre-vingt-dix secondes. */
  /* ── … MAIS L'HÔTE NE PART PAS PARCE QU'IL A CHANGÉ D'ONGLET ──
     Trouvé en rejouant une table complète dans un navigateur, 2026-08-30 :
     l'invité rejoignait, cliquait un Titan, et lisait « l'hôte a quitté la
     partie » — alors que l'hôte n'avait rien fait d'autre que passer au
     second plan.

     `pagehide` ne veut pas dire « cette page se ferme ». Il veut dire « cette
     page cesse d'être présentée », ce qui inclut le passage en arrière-plan —
     et c'est précisément le comportement d'iOS et d'Android quand on verrouille
     l'écran ou qu'on va lire un message. Le téléphone de l'hôte qui s'éteint
     trente secondes fermait donc la table pour tout le monde.

     Pour un INVITÉ, le geste reste bon marché : sa place se libère tout de
     suite, et s'il revient il reprend un siège. Pour l'HÔTE, il coûte la
     partie entière. On ne part donc plus de son côté : le relais tient déjà
     ce cas avec ses deux minutes de grâce (`GRACE_HOTE_MS`), qui existent
     exactement pour ça. Un hôte réellement parti finit par expirer ; un hôte
     qui a rangé son téléphone retrouve sa table. */
  useEffect(() => {
    if (!session || session.siege === "hote") return undefined;
    const partir = () => { sessionRef.current?.quitter(); };
    window.addEventListener("pagehide", partir);
    return () => window.removeEventListener("pagehide", partir);
  }, [session]);

  /* ── CÔTÉ INVITÉ : SE CALER SUR LE PLATEAU DE L'HÔTE ──
     Le plateau public arrive mains masquées, la main privée arrive à part. On
     attend d'avoir les deux avant de reposer la partie : appliquer le plateau
     seul ferait clignoter la main du joueur à chaque coup adverse. */
  /* Ce que l'invité regardait au dernier instantané appliqué. Sert d'unique
     critère pour décider si son interface doit être remise à plat : tant que
     le tour, la Phase et la Manche sont les mêmes, ses brouillons décrivent
     toujours la situation qu'il a sous les yeux, et rien ne justifie de les
     effacer (cf. `reinitialiserInterface` dans `restaurerInstantane`). */
  const dernierCadreDistantRef = useRef("");
  useEffect(() => {
    if (!distantInvite || !etatDistantRecu) return;
    // `partieId` : une nouvelle partie au même cadre (« 1|programmation|null »)
    // gardait les brouillons de l'ancienne (audit du 24/09, C17).
    const cadre = `${etatDistantRecu.partieId ?? ""}|${etatDistantRecu.mancheNumber}|${etatDistantRecu.phase}|${etatDistantRecu.activePlayerId}`;
    const cadreChange = cadre !== dernierCadreDistantRef.current;
    dernierCadreDistantRef.current = cadre;
    restaurerInstantane(
      fusionnerMain(etatDistantRecu, mainPriveeRecue),
      { reinitialiserInterface: cadreChange }
    );
    /* C'est l'hôte qui ouvre la table, pas le clic de l'invité sur
       « Rejoindre ». Entrer tout de suite montrait un plateau généré
       localement — quatre Titans posés, une ville complète — remplacé une
       seconde plus tard par celui de l'hôte. Un joueur qui voit ça croit
       légitimement que la partie a commencé sans lui. */
    if (etatDistantRecu.partieLancee) setSetupDone(true);
  }, [distantInvite, etatDistantRecu, mainPriveeRecue, restaurerInstantane]);

  /* ── L'ÉCRAN NE S'ÉTEINT PAS PENDANT UNE PARTIE ──
     Nikola, 2026-09-01 : « si l'hôte est sur tablette ou mobile, la page se met
     rapidement en veille, ça désynchronise les invités ».

     C'est le pire cas de cette architecture : le moteur ne tourne QUE chez
     l'hôte, et un téléphone qui verrouille son écran gèle sa page. La table
     entière attend alors un arbitre endormi, sans que rien ne l'explique — les
     invités voient un plateau qui ne bouge plus.

     Le verrou d'écran (`navigator.wakeLock`) est la réponse prévue pour ça. Il
     se perd tout seul quand l'onglet passe en arrière-plan, et il faut donc le
     REPRENDRE au retour : sans cet abonnement à `visibilitychange`, il ne
     protège que la première mise en veille.

     Il est demandé sur TOUS les appareils, pas seulement chez l'hôte : une
     partie locale se joue aussi en se passant une tablette, et voir l'écran
     s'éteindre entre deux tours n'y est pas moins pénible.

     Il n'est pas garanti — un navigateur peut le refuser, l'API peut manquer —
     donc chaque appel est protégé et son échec ne casse rien. Ce n'est pas un
     mécanisme de jeu, c'est un confort. */
  useEffect(() => {
    if (!setupDone || gameOver) return undefined;
    if (typeof navigator === "undefined" || !navigator.wakeLock) return undefined;
    let verrou = null;
    let vivant = true;
    const demander = async () => {
      try {
        // `document.hidden` : demander un verrou sur un onglet caché lève, et
        // c'est justement l'état d'où l'on revient.
        if (!vivant || (typeof document !== "undefined" && document.hidden)) return;
        verrou = await navigator.wakeLock.request("screen");
      } catch { /* refusé : la partie continue, l'écran s'éteindra comme avant */ }
    };
    const auRetour = () => { if (typeof document !== "undefined" && !document.hidden) demander(); };
    demander();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", auRetour);
    return () => {
      vivant = false;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", auRetour);
      try { verrou?.release(); } catch { /* déjà relâché par le navigateur */ }
    };
  }, [setupDone, gameOver]);

  /* ── CÔTÉ HÔTE : DIFFUSER APRÈS CHAQUE COUP ──
     Le déclencheur est l'état de partie lui-même, pas les actions : une
     diffusion par action aurait obligé à se souvenir d'en ajouter une à chaque
     fois qu'on écrit une nouvelle action — et on l'aurait oublié.

     L'attente de 120 ms n'est pas du confort : une action fait bouger huit
     morceaux d'état en autant de rendus, et diffuser huit fois soixante
     kilo-octets pour un seul coup sature la liaison sans rien apprendre à
     personne. On attend que ça se stabilise, puis on envoie une fois. */
  const dernierEnvoiRef = useRef("");
  const dernieresMainsRef = useRef({});
  /* ── LA REPRISE QUE L'AVIS PROMETTAIT ──
     2026-09-14. « Diffusion impossible, reprise… » ne reprenait rien : la passe
     suivante n'avait lieu qu'au prochain changement d'état chez l'hôte, et
     l'avis ne s'effaçait jamais. Un échec relance l'effet deux secondes plus
     tard, et un envoi réussi retire l'avis qu'un échec avait posé.

     `derniereDemandeRef` : les envois d'état partent en série (cf.
     `diffuserEtat`), donc la promesse d'une demande ancienne se résout APRÈS
     l'envoi d'une plus récente. Il évite de reposer une empreinte périmée, et
     de redemander un plateau déjà en vol. */
  const derniereDemandeRef = useRef("");
  const [relanceDiffusion, setRelanceDiffusion] = useState(0);
  const AVIS_DIFFUSION = "Diffusion impossible, reprise…";
  const AVIS_MAIN = "Envoi d'une main impossible, nouvelle tentative…";
  useEffect(() => {
    if (!distantHote || !session) return undefined;
    // Garde-fou du F5 (cf. `brancherSession`) : tant qu'il est levé, cette
    // page ne publie RIEN — ni plateau, ni courrier privé.
    if (diffusionBloqueeRef.current) return undefined;
    const relancer = () => { setTimeout(() => setRelanceDiffusion((n) => n + 1), 2000); };
    const minuteur = setTimeout(() => {
      const complet = instantaneCourant();
      const public_ = plateauPublic(complet);
      const signature = JSON.stringify(public_);
      /* ── L'EMPREINTE SE POSE QUAND L'ENVOI A RÉUSSI ──
         Revue du 2026-09-07. Elle était écrite AVANT la promesse : une
         diffusion tombée n'était donc jamais rejouée, et le plateau des
         invités restait figé jusqu'au prochain changement d'état chez l'hôte.
         En fin de tour, ça peut durer une minute entière sans que rien ne
         l'explique à l'écran. On note ce qu'on a réellement envoyé, et un
         échec laisse l'empreinte précédente, donc la prochaine passe réessaie. */
      /* `dernierEnvoiRef` vidé exprès (reprise de table, « Rafraîchir » de l'hôte,
         reprise de diffusion) force l'envoi, même si ce plateau est encore en
         vol : sans ça, la reprise attendait la fin d'un envoi pendu (15 s). */
      const force = dernierEnvoiRef.current === "";
      if (signature !== dernierEnvoiRef.current && (force || signature !== derniereDemandeRef.current)) {
        derniereDemandeRef.current = signature;
        session.diffuserEtat(public_)
          .then(() => {
            if (derniereDemandeRef.current === signature) {
              dernierEnvoiRef.current = signature;
              derniereDemandeRef.current = "";
            }
            setDistantAvis((a) => (a === AVIS_DIFFUSION ? null : a));
          })
          .catch(() => {
            if (derniereDemandeRef.current === signature) derniereDemandeRef.current = "";
            setDistantAvis(AVIS_DIFFUSION);
            relancer();
          });
      }
      /* ── LE COURRIER PRIVÉ A SON PROPRE COMPTEUR ──
         Nikola, 2026-08-30 : « si l'hôte prend la main pas de soucis, sauf que
         après du coup je ne peux pas jouer mes cartes, elles ne s'affichent
         pas ».

         L'envoi des mains était enfermé DERRIÈRE le raccourci de diffusion :
         plateau inchangé, on repartait sans rien envoyer du tout. Or les deux
         canaux ne bougent pas pour les mêmes raisons. Le cas qui mordait :
         l'hôte attribue un siège en cours de partie — la table des sièges
         change, l'effet se relance, mais le plateau public est identique au
         dernier diffusé. Le nouvel arrivant ne recevait donc sa main qu'au
         prochain coup joué par quelqu'un d'autre, et voyait entre-temps un
         plateau sans cartes.

         Chaque main a maintenant sa propre empreinte : on n'envoie que ce qui
         a changé, et on n'oublie plus ce qui a changé sans que le plateau
         bouge. Le nettoyage des sièges libérés évite que la table d'empreintes
         garde éternellement les mains de joueurs partis. */
      /* Même correction que pour la diffusion, et elle mord plus fort ici : un
         courrier privé perdu, et l'invité n'a JAMAIS sa main tant qu'elle ne
         change pas — en Phase Programmation, ça veut dire qu'il ne peut plus
         jouer du tout, sans qu'aucun message ne le dise. Le `catch` était
         totalement muet.

         On repart d'une table VIDE des sièges disparus (c'était l'objet de
         `vues`), puis chaque envoi réussi pose sa propre empreinte. */
      const encore = new Set(Object.keys(distantSieges));
      Object.keys(dernieresMainsRef.current).forEach((id) => {
        if (!encore.has(id)) delete dernieresMainsRef.current[id];
      });
      Object.entries(distantSieges).forEach(([titanId, ref]) => {
        const main = mainPrivee(complet, titanId);
        if (!main) return;
        const empreinte = `${ref}|${JSON.stringify(main)}`;
        if (dernieresMainsRef.current[titanId] === empreinte) return;
        session.envoyerPrive(ref, main)
          .then(() => {
            dernieresMainsRef.current[titanId] = empreinte;
            setDistantAvis((a) => (a === AVIS_MAIN ? null : a));
          })
          .catch(() => { setDistantAvis(AVIS_MAIN); relancer(); });
      });
    }, 120);
    return () => clearTimeout(minuteur);
    // Les deux avis sont des chaînes : les lister ne relance jamais l'effet.
  }, [distantHote, session, distantSieges, instantaneCourant, relanceDiffusion, AVIS_DIFFUSION, AVIS_MAIN]);

  /* ── DIFFUSER LE JOURNAL, À PART DE L'ÉTAT ──
     2026-09-17. `dernierEnvoiJournalRef` retient ce qui a déjà été envoyé
     DANS CETTE SESSION (remis à zéro si elle change — nouvelle table, ou
     reprise après absence de l'hôte). Premier envoi de la session, ou le
     journal a RÉTRÉCI (Annuler, ou « Vider » côté hôte) : on resynchronise
     tout le monde avec `complet`, jamais un delta qui dupliquerait ou
     creuserait un trou chez un invité déjà connecté. Sinon, seules les
     lignes réellement nouvelles partent. */
  const dernierEnvoiJournalRef = useRef(0);
  useEffect(() => {
    if (!distantHote || !session) { dernierEnvoiJournalRef.current = 0; return undefined; }
    if (diffusionBloqueeRef.current) return undefined;
    /* Audit 2026-09-23 : un envoi raté ne réessayait qu'au coup SUIVANT, et un
       delta raté arrivé après un delta réussi rouvrait des lignes déjà parties
       (doublons chez l'invité). Tout échec repart donc sur un `complet`, qui
       remplace le journal de l'invité au lieu de s'y ajouter, et relance
       l'effet sans attendre qu'un autre coup soit joué. */
    const echec = () => {
      dernierEnvoiJournalRef.current = 0;
      setTimeout(() => setRelanceDiffusion((n) => n + 1), 2000);
    };
    const deja = dernierEnvoiJournalRef.current;
    if (deja !== 0 && actionLog.length === deja) return undefined;
    if (deja === 0 || actionLog.length < deja) {
      dernierEnvoiJournalRef.current = actionLog.length;
      session.diffuserJournal({ complet: [...actionLog] }).catch(echec);
      return undefined;
    }
    const nouvelles = actionLog.slice(deja);
    dernierEnvoiJournalRef.current = actionLog.length;
    session.diffuserJournal({ lignes: nouvelles }).catch(echec);
    return undefined;
  }, [actionLog, distantHote, session, relanceDiffusion]);

  useEffect(() => {
    if (distantInviteRef.current) return; // `passifUsed` arrive dans l'instantané
    if (activePlayerId == null) return;
    setPassifUsed((prev) => ({
      ...prev,
      [activePlayerId]: { ...(prev[activePlayerId] || {}), move: false },
    }));
    /* Les quatre compteurs d'Adrénaline sont des réglages d'INTERFACE, pas
       de l'état de jeu : ils vivaient d'un tour à l'autre sans jamais être
       remis à zéro, et se retrouvaient appliqués au Titan suivant, qui n'a
       pas le même stock. D'où le décalage remonté par Nikola le 2026-08-17
       — un rayon de déplacement ou de saut visiblement trop large, et un
       sélecteur qui affichait « 2/0 ». Chaque Titan reprend donc son tour à
       zéro Adrénaline engagée, et l'engage explicitement s'il le veut. */
    setMoveAdrenaline(0);
    setTeaAdrenaline(0);
    setTcAdrenaline(0);
    setBbAdrenaline(0);
  }, [activePlayerId]);

  // ── RETOUR EN JEU D'UN TITAN ÉJECTÉ ──
  // Ruling Nikola du 2026-08-16 : un Titan poussé hors de BIG CITY attend
  // SON tour pour revenir, jamais avant — « ça évite l'acharnement ». C'est
  // donc ici, à l'ouverture de son tour en Phase Action, qu'il rentre.
  // Un seul effet, qui POSE ou EFFACE le coût de rentrée. Deux effets
  // séparés sur la même dépendance se seraient annulés : React les exécute
  // dans l'ordre de déclaration, et celui qui remet à zéro aurait effacé la
  // valeur que l'autre venait d'écrire.
  /* LA RENTRÉE N'EST PLUS SEULEMENT UN EFFET — Nikola, 2026-08-28, deuxième
     remontée du même symptôme : « j'aurais dû revenir sur le plateau
     visuellement mais je ne le suis pas […] j'ai encore dû faire défausser ».

     Elle vivait UNIQUEMENT dans un useEffect déclenché par le changement de
     Titan actif. Un effet ne se rejoue que si ses dépendances changent :
     toute séquence où le tour s'ouvre sans qu'elles bougent laisse le Titan
     dehors, et le reste du tour se déroule par-dessus cet état impossible.
     Une passe précédente a cherché la cause dans la fraîcheur des refs et a
     écrit un test qui passe : ce n'était pas ça, et le bug est revenu.

     La logique est donc extraite ici, appelable à la demande. L'effet reste —
     c'est le chemin normal — mais il n'est plus le SEUL : le Mouvement
     gratuit la rappelle avant d'agir. Deux déclencheurs indépendants pour une
     opération idempotente (elle sort tout de suite si le Titan est déjà
     rentré), et le domaine refuse de son côté de déplacer un Titan hors
     plateau (cf. resolveFreeMovement). */
  const assurerRentree = useCallback((titanId) => {
    if (titanId == null) return { rentre: false };
    const joueur = aiTitanStateRef.current.players.find((t) => t.id === titanId);
    if (!joueur?.horsPlateau) return { rentre: false, dejaEnJeu: true };

    /* Coin bloqué, deux cases également proches : demandé par Nikola le
       2026-08-24, c'est au joueur de choisir laquelle, pas au tri interne.
       Une IA n'a personne pour cliquer — choisirAuto laisse le domaine
       trancher, plutôt que de redupliquer ici la règle du départage. */
    const estIA = aiTitanModesRef.current[titanId] === "ia";
    const etatRentree = {
      board: aiStateRef.current.board,
      titans: aiTitanStateRef.current.players,
      looseBlocks: aiLooseBlocksRef.current,
    };
    const retour = rentrerEnJeu(titanId, etatRentree, { choisirAuto: estIA });
    if (retour.needsChoice) {
      setCornerChoice({ titanId, options: retour.options, coinBloque: retour.cellule });
      return retour;
    }
    setCornerChoice(null);
    setActionLog((prev) => [...prev, ...retour.log]);
    // La rentrée se paie sur le Mouvement gratuit du tour : il lui reste
    // d'autant moins de cases à parcourir, et il devra peut-être dépenser
    // une Adrénaline pour retrouver de la marge.
    setCoutRentree(retour.rentre ? { titanId, cout: retour.cout } : null);
    if (retour.rentre) setTitanState((p) => ({ ...p, players: [...p.players] }));
    return retour;
  }, []);

  useEffect(() => {
    if (distantInviteRef.current) return; // la rentrée est arbitrée par l'hôte
    if (phase !== "action" || activePlayerId == null) { setCoutRentree(null); setCornerChoice(null); return; }
    const joueur = aiTitanStateRef.current.players.find((t) => t.id === activePlayerId);
    if (!joueur?.horsPlateau) {
      setCornerChoice(null);
      /* ── NE PAS EFFACER LE COÛT DE CELUI QUI VIENT DE RENTRER ──
         Nikola, 2026-09-07 : « j'ai été poussé en dehors du plateau, j'aurais
         dû n'avoir qu'1 de déplacement, j'en ai eu 2 […] j'aurais dû n'avoir
         que 3 cases, car je n'avais qu'1 de déplacement après le warp. »

         Cet effet remet le coût à null dès que le Titan actif n'est plus hors
         de BIG CITY. C'est juste quand le tour a CHANGÉ — le coût appartenait
         à quelqu'un d'autre. Ça ne l'est pas quand il rejoue pour le Titan qui
         VIENT de rentrer : `assurerRentree` a reposé le Titan sur le plateau
         dans le rendu précédent, donc `horsPlateau` est déjà faux, et le
         moindre nouveau passage ici lui rendait sa deuxième case de Mouvement
         gratuit. Le plateau proposait alors une portée de 2 — huit cases au
         lieu des trois d'un coin.

         On ne nettoie donc que ce qui concerne un AUTRE Titan. La remise à
         zéro pour de bon se fait au changement de tour, par la branche
         ci-dessus quand la Phase Action se referme, et par le `null` que pose
         `assurerRentree` quand personne ne rentre. */
      setCoutRentree((prev) => (prev && prev.titanId === activePlayerId ? prev : null));
      return;
    }
    assurerRentree(activePlayerId);
  }, [activePlayerId, phase, titanModes, assurerRentree]);


  /* ── LA SÉQUENCE DE PLACEMENT ──
     Elle se déroule tant que la file n'est pas vide. Une IA prend son
     emplacement dès que son tour arrive ; un humain arrête la file, et c'est
     son clic sur le plateau qui la relance.

     C'est cette alternance qui donne son sens à l'ordre : chacun ne voit que
     les Titans DÉJÀ posés, jamais ceux qui posent après lui. Placer tout le
     monde d'un coup, même dans le bon ordre, retirait l'information que
     l'ordre était censé distribuer. */
  const placementCells = useMemo(
    () => (placementRestant.length > 0 ? getPlacementCells(titanState.players) : []),
    [placementRestant, titanState.players]
  );

  /* QUI DOIT POSER MAINTENANT — lu sur les TITANS, jamais sur la file.
     La file dit l'ordre ; c'est le drapeau `aPlacer` qui dit ce qui reste à
     faire, et lui seul est muté de façon synchrone par le domaine.

     Lire `placementRestant[0]` dans une fermeture rendait la pose sensible au
     rythme des clics : deux clics assez rapprochés pour tomber dans le même
     lot React voyaient la même file, désignaient le même Titan, et le second
     partait en échec — mais la file, elle, avait été décalée deux fois. La
     séquence se terminait alors avec des Titans jamais posés, invisibles sur
     un plateau où la partie démarrait quand même.

     En repartant des Titans, un second clic dans le même lot trouve
     naturellement le SUIVANT à poser : cliquer vite pose vite, au lieu de
     casser la mise en place. */
  const prochainAPlacer = useCallback((restant, joueurs) => (
    (restant || []).find((id) => (joueurs || []).find((t) => t.id === id)?.aPlacer) ?? null
  ), []);

  const placerTitanJoueur = useCallback((cellKey) => {
    const titanId = prochainAPlacer(placementRestantRef.current, aiTitanStateRef.current.players);
    if (titanId == null) return;
    const res = placerTitanInitial(titanId, cellKey, aiTitanStateRef.current.players);
    if (!res.pose) return;
    setActionLog((prev) => [...prev, ...res.log]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    // La file ne retient que ceux qui n'ont pas encore posé : elle ne peut
    // donc plus se décaler d'un cran de plus que le nombre de poses réelles.
    setPlacementRestant((prev) => prev.filter((id) => id !== titanId));
  }, [prochainAPlacer]);

  /* SORTIE DE SECOURS DE LA SÉQUENCE : pose d'un coup tous ceux qui restent,
     chacun sur son emplacement par défaut. Une partie ne doit jamais pouvoir
     rester coincée sur une mise en place — et c'est aussi ce qui permet à un
     harnais de test de sauter une étape qui n'est pas son sujet, sans avoir à
     simuler quatre clics. */
  useEffect(() => { placementRestantRef.current = placementRestant; }, [placementRestant]);

  const terminerPlacement = useCallback(() => {
    /* Séquence synchrone, comme `dilValidateAttackerPick` et `toggleProgCard` :
       `placerTitanInitial` MUTE les Titans en place, et deux autres états
       s'écrivaient depuis l'intérieur de l'updater. Un updater rejoué aurait
       placé deux fois les Titans restants et doublé les lignes de journal. */
    const restant = placementRestantRef.current || [];
    if (restant.length === 0) return;
    const joueurs = aiTitanStateRef.current.players;
    const logs = [];
    restant.forEach((id) => { logs.push(...placerTitanInitial(id, null, joueurs).log); });
    setPlacementRestant([]);
    setActionLog((prev) => [...prev, ...logs]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, []);

  useEffect(() => {
    if (distantInviteRef.current) return; // la file de mise en place est tenue par l'hôte
    /* ⚠️ `titanState.players`, PAS la ref. La ref est synchronisée par un effet,
       donc au premier rendu qui suit une nouvelle partie elle pointe encore
       sur les Titans de la PRÉCÉDENTE — qui sont tous posés. Lue ici, elle
       faisait conclure « plus personne à poser » et soldait la mise en place
       avant qu'elle ait commencé. */
    const titanId = prochainAPlacer(placementRestant, titanState.players);
    if (titanId == null) {
      // Plus personne à poser : la file peut contenir des ids déjà servis si
      // deux clics sont tombés dans le même lot. On la solde.
      if (placementRestant.length > 0) setPlacementRestant([]);
      return;
    }
    // Un humain décide lui-même : la file s'arrête là, et attend son clic.
    /* `titanModes` lu ici, pas sa ref : la ref se synchronise dans un effet
       déclaré plus bas, donc APRÈS celui-ci. Un invité qui partait pendant la
       mise en place rendait son Titan à l'IA, et cet effet — qui ne dépendait
       pas des modes — ne se relançait jamais : « elle choisit elle-même… »,
       et rien ne bougeait (audit du 2026-09-23). */
    if (titanModes[titanId] !== "ia") return;

    /* TOUTES LES IA CONSÉCUTIVES EN UNE PASSE, jamais une par rendu.
       Une IA par commit obligeait à quatre allers-retours dans une partie tout
       IA — quatre bandeaux qui s'affichent et disparaissent pour rien, et une
       cascade d'états qui ne se résout qu'après autant de flushs. On avance
       donc tant que la tête de file est une IA, et on s'arrête net sur le
       premier humain : c'est LUI qui doit voir le plateau tel qu'il est, et
       lui seul.

       Les Titans sont mutés en place, donc `prochainAPlacer` voit le
       précédent déjà posé à chaque tour de boucle : chacun choisit bien
       parmi les cases restantes, exactement comme s'ils avaient joué l'un
       après l'autre. */
    const joueurs = titanState.players;
    const logs = [];
    const poses = [];
    let restant = placementRestant;
    for (;;) {
      const suivant = prochainAPlacer(restant, joueurs);
      if (suivant == null || titanModes[suivant] !== "ia") break;
      /* Sans case demandée, le domaine retombe sur l'emplacement que le tirage
         avait réservé à cette IA — donc une partie tout IA se place exactement
         comme avant, à la graine près. */
      logs.push(...placerTitanInitial(suivant, null, joueurs).log);
      poses.push(suivant);
      restant = restant.filter((id) => id !== suivant);
    }
    if (poses.length === 0) return;
    setActionLog((prev) => [...prev, ...logs]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setPlacementRestant((prev) => prev.filter((id) => !poses.includes(id)));
  }, [placementRestant, titanState.players, prochainAPlacer, titanModes]);

  // Choix du joueur entre les deux cases d'un coin bloqué (cf. l'effet
  // ci-dessus) : résolu par un clic sur l'une des deux options proposées.
  const chooseCornerEntry = useCallback((cellKey) => {
    if (!cornerChoice || !cornerChoice.options.includes(cellKey)) return;
    captureSnapshot();
    const titan = titanState.players.find((t) => t.id === cornerChoice.titanId);
    if (!titan) return;
    titan.horsPlateau = false;
    titan.cell = cellKey;
    setActionLog((prev) => [...prev, `🥊 Titan ${cornerChoice.titanId} rentre sur BIG CITY par ${cellKey} (coin ${cornerChoice.coinBloque} bloqué — choisi).`]);
    setCoutRentree({ titanId: cornerChoice.titanId, cout: 1 });
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setCornerChoice(null);
  }, [cornerChoice, titanState.players, captureSnapshot]);

  // ── DÉCISIONS IA ──
  // Les heuristiques à priorité fixe qui vivaient ici ont été retirées.
  // Elles jouaient toujours la carte la plus haute d'un ordre codé en dur,
  // visaient la direction dont la SEULE case suivante contenait le plus de
  // blocs (sans jamais compter les Titans, ce qui était absurde pour
  // Graouhhh), ne dépensaient jamais d'Adrénaline et ignoraient
  // totalement le barème de scoring.
  //
  // Tout cela vit maintenant dans le domaine (`aiPlanner`), qui énumère
  // les coups légaux, les simule avec les vrais résolveurs et les note au
  // score réel. On ne garde ici que le branchement.
  const profilDe = useCallback(
    (id) => titanProfiles[id] ?? makeProfile(),
    [titanProfiles]
  );

  // Re-trigger IA quand activePlayerId change vers un joueur IA
  useEffect(() => {
    if (!setupDone) return;
    if (phase !== "action") return;
    if (activePlayerId == null) return;
    if (titanModes[activePlayerId] !== "ia") return;
    if (distantInviteRef.current) return; // les IA jouent chez l'hôte, une seule fois
    // Petit délai pour laisser setAiPlayingSync(false) se propager avant de vérifier
    const t = setTimeout(() => {
      if (!aiPlayingRef.current) {
        setAiTrigger((n) => n + 1);
      }
    }, 80);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayerId]);

  // ── AUTO-PLAY IA ──
  // Compteur pour forcer le re-trigger de l'effect IA entre chaque carte
  const [aiTrigger, setAiTrigger] = useState(0);

  // Ref pour transmettre le prochain joueur depuis setTitanState (batch) vers setActivePlayerId
  const aiNextPlayerRef = useRef(null);

  // Refs "live" pour que les timers IA lisent toujours l'état courant
  const aiStateRef = useRef(state);
  const aiTitanStateRef = useRef(titanState);
  const aiLooseBlocksRef = useRef(looseBlocks);
  const aiPassifUsedRef = useRef(passifUsed);
  const aiTitanModesRef = useRef(titanModes);
  // Profils des IA, lus au moment de trancher un repli (cf. enqueueReplis).
  const aiTitanProfilesRef = useRef(titanProfiles);
  useEffect(() => { aiStateRef.current = state; }, [state]);
  useEffect(() => { aiTitanStateRef.current = titanState; }, [titanState]);
  useEffect(() => { aiLooseBlocksRef.current = looseBlocks; }, [looseBlocks]);
  useEffect(() => { aiPassifUsedRef.current = passifUsed; }, [passifUsed]);
  useEffect(() => { aiTitanModesRef.current = titanModes; }, [titanModes]);
  useEffect(() => { aiTitanProfilesRef.current = titanProfiles; }, [titanProfiles]);
  // Les minuteries de l'IA lisent le coût de rentrée bien après le rendu :
  // il leur faut une ref à jour, pas la valeur figée par la fermeture.
  const coutRentreeRef = useRef(coutRentree);
  useEffect(() => { coutRentreeRef.current = coutRentree; }, [coutRentree]);

  /* Le coup choisi par la recherche conjointe a l'etape 1 (deplacement), a
     rejouer tel quel a l'etape 2 (carte). Les deux etapes sont separees par
     une minuterie d'affichage : sans cette ref, l'etape 2 rechercherait
     depuis un etat different et pourrait annuler le placement que l'etape 1
     venait de choisir POUR ce coup-la. */
  const coupJointRef = useRef(null);
  // La mise cachée qu'une IA attaquante engage sur chacun de ses duels contre
  // un humain (cf. la branche Faut Pas Me Chauffer de `jouerCarte`).
  const miseFpmcIARef = useRef(0);
  // `passerAuTitanSuivant` est déclaré plus bas : la ref fait le pont (même
  // motif que `validerVolRef`).
  const passerAuTitanSuivantRef = useRef(null);

  /* Les Titans qui jouent encore APRÈS celui-ci dans le round. C'est ce que
     l'évaluation consulte pour chiffrer ce qu'un coup offre (cf.
     `valeurOfferte`) : ce qu'on laisse devant eux, ils le ramassent.
     L'ordre d'initiative pivote sur le Détonateur, comme la rangée des
     plaques — la règle du pivot ne vit qu'à un endroit, `ordreJeu`. */
  const titansApresMoi = useCallback((titanId) => {
    const ordre = aiTitanStateRef.current?.ordreJeu ?? [];
    const depart = ordre.indexOf(aiTitanStateRef.current?.detonateur);
    const pivote = depart <= 0 ? ordre : [...ordre.slice(depart), ...ordre.slice(0, depart)];
    const i = pivote.indexOf(titanId);
    return new Set(i < 0 ? [] : pivote.slice(i + 1));
  }, []);

  useEffect(() => {
    if (!setupDone) return;
    if (phase !== "action") return;
    if (activePlayerId == null) return;
    if (titanModes[activePlayerId] !== "ia") return;
    if (aiPlayingRef.current) return;
    if (distantInviteRef.current) return; // les IA jouent chez l'hôte, une seule fois
    /* Une décision née d'un tour IA se règle AVANT le tour suivant.
       Bug remonté par Nikola (test à la table, 2026-08-18) : « dès que
       j'ai fait le dil c'est passé au joueur suivant automatiquement, je
       n'ai pas pu ramasser le bloc tombé au sol. » `finishAiTurn` faisait
       avancer `activePlayerId` dès que la carte de l'IA était jouée, sans
       jamais attendre qu'un DIL/RAGE qu'elle venait de déclencher soit
       tranché — si le Titan suivant était lui aussi une IA, cet effet
       démarrait alors SON tour (mouvement, carte, récupération) pendant
       que le joueur humain avait encore un DIL en attente. Même garde-fou
       que la Phase suivante (cf. l'effet d'avancement de Phase). */
    /* ── ET QUAND L'IA NE JOUE PAS, ON DIT POURQUOI AUSSI ──
       Même motif que l'effet d'avancement de Phase (cf. « QUAND ON NE PASSE
       PAS, ON DIT POURQUOI »), et c'est ici que ça manquait le plus : un tour
       d'IA qui ne démarre pas ne laisse AUCUNE trace. L'écran montre une Phase
       Action au bon Titan, sans bandeau et sans bouton, et le journal s'arrête
       net — c'est exactement ce qu'on a passé une heure à chercher le
       2026-09-07.

       Les quatre refus possibles sont nommés. Journalisés une seule fois par
       (Titan, motif) : cet effet se rejoue à chaque rendu, il inonderait le
       journal sinon. Purement de l'instrumentation, aucun comportement ne
       change — mais le prochain gel arrivera nommé dans le rapport de partie. */
    const refus = currentDecision ? "un Dilemme ou une RAGE non tranché"
      : currentRepli ? "un repli d'élément non placé"
      : ecroulement ? "un Amas non réparti"
      // Ces deux-là manquaient (audit du 2026-09-23) : l'IA suivante jouait
      // par-dessus un duel ou une Fatigue qu'un joueur n'avait pas tranché.
      : fpmcAttackerId && (fpmcPendingIds.length > 0 || fpmcCurrent) ? "un Faut Pas Me Chauffer non révélé"
      : fatigueEnAttente ? "une Fatigue non tranchée"
      : null;
    if (refus) {
      const signature = `${activePlayerId}|${refus}`;
      if (blocageIaRef.current !== signature) {
        blocageIaRef.current = signature;
        setActionLog((prev) => [...prev,
          `⏸️ Tour de Titan ${activePlayerId} (IA) en attente : ${refus}.`]);
      }
      return;
    }

    /* La carte de ce round est déjà jouée : un joueur l'a jouée puis a rendu
       son Titan à l'IA avant « Titan suivant » (audit du 2026-09-23). L'IA en
       jouait une SECONDE ; elle passe simplement la main. */
    if (waitingNextTitan) {
      passerAuTitanSuivantRef.current?.();
      return;
    }

    const titan = aiTitanStateRef.current.players.find((t) => t.id === activePlayerId);
    if (!titan) return;
    if (titan.programmed.length === 0) {
      const signature = `${activePlayerId}|sans carte`;
      if (blocageIaRef.current !== signature) {
        blocageIaRef.current = signature;
        setActionLog((prev) => [...prev,
          `⏸️ Tour de Titan ${activePlayerId} (IA) sans carte programmée : il ne peut rien jouer.`]);
      }
      return;
    }
    blocageIaRef.current = null;

    // Capturer l'identité du joueur UNE SEULE FOIS ici — ne jamais relire les refs pour ça
    const playerId = activePlayerId;

    setAiPlayingSync(true);
    setAiStepLabel("🦶 Déplacement…");

    // Fin de tour IA : joue la carte, puis avance RÉELLEMENT au Titan suivant.
    // Deux bugs corrigés ici (session) :
    // 1) L'ancienne condition `aiNextPlayerRef.current === playerId` comparait le
    //    prochain joueur à celui qui vient de jouer — toujours faux dès qu'il y a
    //    plusieurs Titans, donc setActivePlayerId n'était jamais rappelé.
    // 2) Une fois cette condition corrigée, un second bug plus profond subsistait :
    //    aiNextPlayerRef était écrite depuis l'intérieur d'un updater useState
    //    asynchrone (cf. cardsPlayedCountRef ci-dessus) — relue via un
    //    Promise.resolve().then() dont le timing n'était pas garanti par rapport
    //    au flush React, la ref pouvait rester stale et le blocage persistait,
    //    que la carte ait été jouée avec effet ou défaussée face cachée.
    // advanceActionRound étant désormais 100% synchrone, aiNextPlayerRef.current
    // est fiable dès le retour de markCardPlayed — plus besoin de microtask.
    const finishAiTurn = (cardId, { defausse = false } = {}) => {
      /* Une défausse d'IA se range FACE CACHÉE, comme celle d'un joueur
         (audit du 2026-09-23) : rangée comme jouée, elle nommait la carte à
         toute la table. Le round avance de la même façon. */
      if (defausse) {
        const res = discardCardHidden(playerId, cardId, aiTitanStateRef.current.players);
        if (res.ok) {
          setActionLog((prev) => [...prev, res.log]);
          advanceActionRound(playerId);
        }
      } else {
        markCardPlayed(playerId, cardId);
      }
      setTitanState((p) => ({ ...p, players: [...p.players] }));
      setAiPlayingSync(false); // réinitialise aussi aiStepLabel via setAiPlayingSync
      setWaitingNextTitan(false);
      if (aiNextPlayerRef.current != null) {
        setActivePlayerId(aiNextPlayerRef.current);
        /* ── RENDRE LA MAIN AU MÊME TITAN RESTE UN PASSAGE DE MAIN ──
           Trouvé le 2026-09-07 en corrigeant les gels de parties IA, et c'est
           le motif commun à tous : `setActivePlayerId` avec la MÊME valeur ne
           notifie rien — React compare — donc l'effet d'auto-jeu, qui ne
           dépend que d'`activePlayerId`, ne se relance pas. Or le Titan
           suivant PEUT légitimement être celui qui vient de jouer : c'est le
           cas dès que les autres n'ont plus de carte et qu'il lui en reste.

           `aiTrigger` existe exactement pour ça (« pour forcer le re-trigger
           de l'effect IA entre chaque carte ») : on le bouge à chaque
           passage de main, pas seulement quand le Titan change. */
        setAiTrigger((n) => n + 1);
      }
      // Sinon (null) : fin de Phase Action déjà gérée par advanceActionRound.
    };

    /* ── LE TOUR D'UNE IA PREND LE TEMPS QU'ON LE VOIE ──
       2 000 ms suffisaient tant que rien ne s'animait. Depuis que les IA
       tracent leurs chemins comme le joueur (Nikola, 2026-08-29 : « quitte à
       ralentir un peu la vitesse de leur tour »), il faut au moins la durée
       d'une traînée — 110 ms par case plus 1,5 s de tenue — avant que l'étape
       suivante n'efface la précédente. À quatre Titans dont trois IA, chaque
       tranche de 600 ms coûte presque deux secondes par round : on ajoute le
       minimum qui rende la trace lisible, pas plus. */
    const DELAI_IA_MS = 2600;

    /* La partie à laquelle CE tour appartient. Chaque étape la revérifie
       avant d'agir : une régénération incrémente `partieRef`, et la cascade
       déjà programmée renonce au lieu d'appliquer un coup calculé sur un
       plateau qui n'existe plus (cf. `regenerate`). */
    const partieDuTour = partieRef.current;
    const partieAbandonnee = () => {
      if (partieRef.current !== partieDuTour) return true;
      /* Un joueur a repris ce Titan en plein tour (audit du 2026-09-23) :
         l'IA lâche la main sans jouer la carte qu'elle préparait. */
      if (aiTitanModesRef.current[playerId] !== "ia") {
        annulerTimersIA();
        setAiPlayingSync(false);
        return true;
      }
      return false;
    };

    /* ── L'ÉTAT EST RELU À CHAQUE USAGE ──
       La recherche peut partir dans un Web Worker (cf. `penseeIA`) : le coup
       revient alors après un aller-retour, et c'est le plateau VIVANT qui doit
       le recevoir, pas la copie envoyée. Rien ne bouge entre-temps — le tour
       d'une IA est exclusif —, mais un objet gardé d'une étape à l'autre
       survivrait à ce qui le remplace (un instantané restauré, notamment). */
    const jeuIA = () => ({
      titans: aiTitanStateRef.current.players,
      board: aiStateRef.current.board,
      looseBlocks: aiLooseBlocksRef.current,
      // Qui joue encore après lui ce round : ce que son coup laisse
      // traîner devant eux, ils le ramassent (cf. `valeurOfferte`).
      aJouerEncore: titansApresMoi(playerId),
      // Ce qu'il faut pour juger si un coup RAPPROCHE la fin de partie
      // (cf. `valeurFinDePartie`). Le seuil d'Apocalypse est verrouillé au
      // lancement, la Manche et le nombre de joueurs bougent : les trois
      // sont relus à chaque tour plutôt que figés.
      finDePartie: { apocalypseThreshold, mancheNumber, nbJoueurs },
      // Le réglage de table suit le plateau : l'IA compte sa Lanterne Rouge
      // avec la même règle que l'humain, sans quoi elle jouerait Je Ne
      // Partage Pas en espérant trois blocs pour n'en ramasser que deux.
      egalitesLanterneRouge,
    });

    // ── ÉTAPE 1 : MOUVEMENT PASSIF ──
    const t1 = setTimeout(() => {
      if (partieAbandonnee()) return;
      if (!aiTitanStateRef.current.players.some((t) => t.id === playerId)) { setAiPlayingSync(false); return; }
      if (aiPassifUsedRef.current[playerId]?.move) { etapeCarte(); return; }

      // L'ancienne note « blocsLibres × 2 + hauteurBâtiment » ignorait la
      // couleur des blocs, donc le barème : un Titan au Bleu saturé
      // courait vers un tas de Bleu à 0 point. planMovement note la case
      // au score réel.
      // Portée réduite si le Titan vient de rentrer sur le plateau : sa
      // rentrée a consommé une partie de son Mouvement gratuit.
      const deja = coutRentreeRef.current && coutRentreeRef.current.titanId === playerId
        ? coutRentreeRef.current.cout
        : 0;
      const portee = Math.max(0, 2 - deja);
      /* LE TOUR SE DÉCIDE D'UN BLOC quand la force le permet : où se
         placer dépend de la carte qu'on jouera de là (cf. `planTour`).
         Le coup retenu est mis de côté pour l'étape 2, qui le rechercherait
         sinon depuis un état différent — et pourrait en choisir un autre,
         annulant le bénéfice du placement. */
      penser("planTour", [playerId, jeuIA(), profilDe(playerId), mancheNumber, portee], (tour) => {
        if (partieAbandonnee()) return;
        coupJointRef.current = tour ? { titanId: playerId, coup: tour.coup } : null;
        const deplacer = (choix) => {
          if (partieAbandonnee()) return;
          if (choix) {
            /* ── ON DOIT VOIR PAR OÙ PASSE UNE IA ──
               Nikola, 2026-08-29 : « quand les IA jouent, on doit aussi voir les
               chemins comme quand c'est moi qui joue, pareil pour les projections
               de leur part — là je les vois bouger sans chemin clair ».

               Le chemin est tracé depuis toujours pour le joueur humain, et
               jamais pour les IA : leurs états de résolution ne portaient même
               pas de collecteur `trajectoires`, donc `projectInDirection` n'avait
               nulle part où déposer ses trajets. Un Titan changeait de case entre
               deux clignements, et rien ne disait par où il était passé ni ce
               qu'il avait bousculé au passage — sur trois adversaires, c'est la
               moitié de la partie qu'on ne voit pas.

               Le mouvement passif n'appelle aucune projection : son chemin se
               calcule comme celui du joueur, avec `getMovePath`. */
            const jeu = jeuIA();
            const moi = jeu.titans.find((t) => t.id === playerId);
            const depart = moi.cell;
            // +1 case par Adrénaline, comme le joueur (audit du 24/09, L6).
            const mise = Math.min(choix.mise || 0, moi.adrenaline || 0);
            const cheminIA = getMovePath(
              depart, choix.destKey, portee + mise, jeu.board,
              indexerTitans(jeu.titans), jeu.looseBlocks
            );
            if (mise > 0) {
              moi.adrenaline -= mise;
              setActionLog((prev) => [...prev, `🤖 Titan ${playerId} dépense ${mise} 💉 pour allonger son déplacement.`]);
            }
            resolveFreeMovement(playerId, choix.destKey, jeu);
            setTitanState((p) => ({ ...p, players: [...p.players] }));
            animerTrajectoires([{ cases: cheminIA, arrivee: choix.destKey, titanId: playerId }]);
          }
          if (choix || tour) {
            setPassifUsed((prev) => ({ ...prev, [playerId]: { ...(prev[playerId] || {}), move: true } }));
          }
          etapeCarte();
        };
        if (tour) deplacer(tour.destKey ? { destKey: tour.destKey, mise: tour.miseMouvement || 0 } : null);
        else penser("planMovement", [playerId, jeuIA(), profilDe(playerId), portee], deplacer);
      });
    }, 2000);
    aiTimersRef.current.push(t1);

    // ── ÉTAPE 2 : CARTE ──
    // Déclarée et non plus imbriquée : l'étape 1 ne la lance qu'une fois son
    // déplacement joué, et ce moment peut venir d'un autre fil.
    function etapeCarte() {
      const t2 = setTimeout(() => {
        if (partieAbandonnee()) return;
        setAiStepLabel("🃏 Joue une carte…");
        // Le coup a déjà été choisi avec le déplacement (cf. étape 1) : le
        // rechercher ici depuis un autre état lui ferait perdre le placement.
        const joint = coupJointRef.current;
        coupJointRef.current = null;
        if (joint && joint.titanId === playerId) jouerCarte(joint.coup);
        else penser("planCardPlay", [playerId, jeuIA(), profilDe(playerId), mancheNumber], jouerCarte);
      }, 2000);
      aiTimersRef.current.push(t2);
    }

    function jouerCarte(move) {
      if (partieAbandonnee()) return;
      const curTitanState2 = aiTitanStateRef.current;
      const curTitan2 = curTitanState2.players.find((t) => t.id === playerId);
      if (!curTitan2 || curTitan2.programmed.length === 0) { setAiPlayingSync(false); return; }

      const jeu2 = {
        ...jeuIA(),
        // Collecteur de trajets : sans lui, `projectInDirection` n'a nulle
        // part où déposer ce qu'il déplace, et les cartes des IA se
        // résolvaient sans qu'aucun chemin ne s'allume (Nikola, 2026-08-29).
        trajectoires: [],
        /* Collecteur de replis, qui manquait de la même façon (2026-09-21).
           Sans lui, les résolveurs posent l'élément arrêté à sa case par
           défaut et ne demandent rien : sur Tout Casser, Tête en Avant et Boing
           Boing, l'IA ne choisissait JAMAIS où poser un débris ni où repousser
           un Titan, alors que le simulateur — donc chaque campagne et chaque
           duel — la faisait choisir (`appliquerCoup`). Les campagnes
           mesuraient une IA plus forte que celle de la table. */
        replis: [],
      };
      // Si aucun coup n'a pu être noté, on défausse la première carte —
      // vraiment, comme le simulateur : la jouer avec des paramètres par
      // défaut (charge vers le nord) produisait un coup que personne n'avait
      // choisi (audit du 2026-09-23).
      const cardId = move?.cardId ?? curTitan2.programmed[0];
      let defausse = !move;
      const { dir, mise = 0, bbDest: dest, jnpCells } = move || {};
      // L'Adrénaline est retranchée ici : les résolveurs du domaine la
      // lisent pour allonger la portée mais ne la débitent pas, c'est
      // l'application qui s'en charge (même contrat que pour un humain,
      // cf. les appels jouerToutCasser et consorts).
      // Faut Pas Me Chauffer fait exception : sa mise est engagée duel par
      // duel dans sa propre branche (cf. plus bas), la retrancher ici la
      // compterait deux fois. Même partage qu'en simulation (`simulerCarte`).
      if (mise > 0 && cardId !== "faut_pas_me_chauffer") {
        curTitan2.adrenaline = Math.max(0, (curTitan2.adrenaline || 0) - mise);
      }

      let newLog = [];
      let newDecisions = [];

      if (defausse) {
        newLog = [`IA T${playerId} : aucun coup jouable, défausse.`];
      } else if (cardId === "tout_casser") {
        const res = resolveToutCasser(playerId, jeu2, mise);
        newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
        setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
      } else if (cardId === "tete_en_avant") {
        const d = dir || { dr: -1, dc: 0 };
        const res = resolveTeteEnAvant(playerId, d.dr, d.dc, mise, jeu2);
        newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
        setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
      } else if (cardId === "graouhhh") {
        /* MÊME CHEMIN QUE LE JOUEUR HUMAIN, Titan par Titan.
           L'IA passait par le wrapper monolithique `resolveGraouhhh`, qui
           déplace TOUS les Titans de l'axe d'un coup puis rend les
           décisions en bloc. Un joueur humain visé par cette carte voyait
           donc ses Titans bouger AVANT qu'on lui demande de trancher son
           Dilemme — l'inverse de l'ordre que Nikola a fixé le 18 août
           (« DIL/RAGE puis déplacement, et Titan suivant si il y en a un
           autre »). L'état final était le bon (l'ordre de traitement est
           identique des deux côtés, du plus loin au plus proche), mais la
           table lisait la scène à l'envers.

           `advanceGraouhhhLoop` enchaîne toute seule tant que les
           défenseurs sont des IA, et ne rend la main que sur un vrai
           défenseur humain — le cas où l'ordre compte. Elle enfile
           elle-même ses décisions, d'où `newDecisions` laissé vide ici. */
        const d = dir || { dr: -1, dc: 0 };
        const scan = scanGraouhhhAxis(playerId, jeu2, d.dr, d.dc);
        newLog = [...scan.log];
        newDecisions = [];
        if (scan.touched.length === 0) {
          newLog.push("Aucun Titan touché sur cet axe.");
        } else {
          advanceGraouhhhLoop({
            titanId: playerId, dr: d.dr, dc: d.dc,
            reculDistance: scan.reculDistance, mancheNumber,
            remaining: scan.touched.slice().reverse().map((t) => t.id),
            bagarreIds: [], touchedCount: scan.touched.length,
          });
        }
        setLooseBlocks((p) => ({ ...p }));
      } else if (cardId === "boing_boing") {
        if (dest) {
          const res = resolveBoingBoing(playerId, dest, mise, mancheNumber, jeu2);
          newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
          // L'IA n'a pas d'interface de répartition : elle applique la
          // répartition par défaut, cases vierges d'abord.
          if (res.ecroulement) {
            const choix = choisirRepartitionEcroulement(res.ecroulement, jeu2, playerId);
            const suite = resolveEcroulementAmas(playerId, res.ecroulement, choix, jeu2);
            newLog = [...newLog, ...suite.log];
          }
          /* La Fatigue du Titan percuté est refusable (ruling du 2026-08-28),
             et ce chemin ne la transmettait pas (2026-09-21) : face au Boing
             Boing d'une IA, ni un humain ni une IA ne pouvait payer pour
             garder sa carte, alors que le même saut joué par un humain
             ouvrait bien le bandeau (cf. `jouerBoingBoing`). */
          if (res.fatigues?.length) enqueueFatigues(res.fatigues);
          setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
        } else {
          newLog = [`IA T${playerId} : Boing Boing sans destination, défausse.`];
          defausse = true;
        }
      } else if (cardId === "je_ne_partage_pas") {
        const cells = jnpCells || [];
        const res = resolveJeNePartagePas(playerId, cells, jeu2);
        newLog = res.log; newDecisions = res.decisions || []; // défensif (fix session) : certains résolveurs (ex. resolveJeNePartagePas) ne retournent jamais "decisions", d'autres l'omettent sur leurs early-returns "applied:false" — sans ce garde, newDecisions.some(...) plus bas plante avec "Cannot read properties of undefined (reading 'some')"
        setLooseBlocks((p) => ({ ...p }));
      } else if (cardId === "faut_pas_me_chauffer") {
        // Même résolveur de domaine que pour un joueur humain (cf.
        // revealFPMC). L'IA ne mise pas d'Adrénaline en secret — faute de
        // règle de décision pour ça — mais elle subit et applique
        // désormais TOUT le reste de la carte : projection de la cible,
        // Bagarre, DIL/RAGE. Auparavant elle n'en produisait que les
        // décisions, sans le moindre effet physique.
        const targets = getFPMCTargets(playerId, { titans: curTitanState2.players });
        if (targets.length === 0) {
          newLog = [`FPMC (IA T${playerId}) : aucune cible.`];
        } else {
          newLog = [`FPMC (IA T${playerId}) vs ${targets.length} cible(s)`];
          /* ── LA MISE CACHÉE DE L'IA EST ENFIN JOUÉE (audit du 2026-09-20) ──
             `candidatsPourCarte` cherche la mise duel par duel depuis le
             2026-09-07 et la porte dans `coup.miseFpmc` ; ce chemin-ci
             l'ignorait et appelait le résolveur sans `attackerBid` — alors
             que la déduction d'Adrénaline plus haut, elle, la PAYAIT. L'IA
             brûlait donc jusqu'à trois Adrénaline pour arriver au duel les
             mains vides, et perdait des comparaisons qu'elle avait payé pour
             gagner.

             Le simulateur, lui, passe bien la mise (`appliquerCoup` →
             `simulerCarte`) : les campagnes mesuraient une carte que la table
             ne voyait jamais. FPMC est jouée 3,7 fois par partie (mesure du
             2026-09-20, 40 parties de 4 Experts, 8,2 % des cartes).

             Même mécanique qu'en simulation : la mise est engagée sur CHAQUE
             cible tant que le stock suit, un duel ne se partage pas. */
          let stockFpmc = curTitan2.adrenaline || 0;
          const miseFpmcVoulue = move?.miseFpmc ?? 0;
          /* ── UNE CIBLE HUMAINE MISE, ELLE AUSSI (audit du 2026-09-23) ──
             « L'attaquant et la cible ajoutent chacun une mise cachée. » L'IA
             tranchait tous ses duels ici, défense à 0 : un joueur visé perdait
             sans avoir vu le bandeau. Ses duels passent donc par la même file
             que face à un attaquant humain — l'IA y désigne ses cibles et pose
             sa mise d'elle-même (cf. l'effet plus bas), la cible mise et
             révèle. Une IA ciblée mise elle aussi, depuis le 2026-09-24
             (`miseDefenseFpmc`). */
          const ciblesHumaines = targets.filter((id) => aiTitanModesRef.current[id] !== "ia");
          if (ciblesHumaines.length > 0) {
            miseFpmcIARef.current = miseFpmcVoulue;
            setFpmcAttackerId(playerId);
            setFpmcAttackerBase(getProgrammedSum(curTitan2));
            setFpmcNTargets(targets.length);
            setFpmcPendingIds(ciblesHumaines);
            setFpmcCurrent(null);
            newLog.push(`FPMC : ${ciblesHumaines.length} cible(s) humaine(s) — chacune mise en secret avant la révélation.`);
          }
          targets.filter((id) => !ciblesHumaines.includes(id)).forEach((defId, i) => {
            const miseIA = Math.min(miseFpmcVoulue, stockFpmc);
            stockFpmc -= miseIA;
            const cibleIA = curTitanState2.players.find((t) => t.id === defId);
            const miseCible = cibleIA ? miseDefenseFpmc(curTitan2, cibleIA, curTitanState2.players, {
              baseAttaquant: getProgrammedSum(curTitan2), baseDefenseur: getProgrammedSum(cibleIA),
              profile: aiTitanProfilesRef.current[defId],
            }) : 0;
            const res = resolveFautPasMeChauffer(playerId, defId, targets.length, jeu2, { attackerBid: miseIA, defenderBid: miseCible, premierDuel: i === 0 });
            if (cibleIA) cibleIA.adrenaline = Math.max(0, (cibleIA.adrenaline || 0) - miseCible);
            if (miseIA > 0) newLog.push(`Mise cachée de Titan ${playerId} : ${miseIA} 💉.`);
            if (miseCible > 0) newLog.push(`Mise cachée de Titan ${defId} : ${miseCible} 💉.`);
            newLog.push(...res.log);
            newDecisions.push(...(res.decisions || []));
          });
          curTitan2.adrenaline = Math.max(0, stockFpmc);
          setState((p) => ({ ...p })); setLooseBlocks((p) => ({ ...p }));
          setTitanState((p) => ({ ...p, players: [...p.players] }));
        }
      } else {
        newLog = [`IA T${playerId} : carte inconnue (${cardId}), défausse.`];
        defausse = true;
      }

      setActionLog((prev) => [...prev, ...newLog]);
      // Les replis de la carte, tranchés par l'IA qui l'a jouée (cf. `jeu2`).
      enqueueReplis(jeu2.replis);
      /* ── CE QUE L'IA TRANCHE SEULE SE RÉSOUT AVANT SON RAMASSAGE (2026-09-21) ──
         Une RAGE dont elle est l'attaquante, un Dilemme entre deux IA : tout
         se résolvait APRÈS son ramassage, en fin de tour. Le bloc que son
         propre Dilemme faisait tomber à ses pieds lui échappait donc à chaque
         fois — alors qu'un joueur humain ramasse une fois son Dilemme tranché,
         et que c'est l'intention même du ruling du 2026-08-18 (« son bloc
         perdu doit tomber dans le Périmètre de T1, qui pourra le ramasser avec
         son passif »). Mesuré au duel, simulateur aligné sur la table :
         +1,22 point par partie, IC 95 % [+0,32 ; +2,12], 480 parties
         d'Experts.
         Ce qui attend un humain reste en fin de tour : l'IA ne suspend pas son
         ramassage à un clic. */
      const modesIA = aiTitanModesRef.current;
      const tranchablesSeule = newDecisions.filter((d) =>
        modesIA[d.attackerId] === "ia" && (d.type === "RAGE" || modesIA[d.defenderId] === "ia"));
      if (tranchablesSeule.length > 0) {
        enqueueDecisions(tranchablesSeule);
        newDecisions = newDecisions.filter((d) => !tranchablesSeule.includes(d));
      }
      /* Le chemin de ce que la carte a déplacé s'allume, exactement comme
         quand c'est le joueur qui joue (Nikola, 2026-08-29). Chaque case y
         porte déjà son élément, donc les débris restent jaunes et les Titans
         prennent leur couleur, sans rien de spécifique à faire ici.

         EN SÉQUENTIEL, et c'est la différence avec un coup humain (Nikola,
         2026-09-01) : le joueur qui projette a désigné son élément et sait ce
         qu'il regarde, alors que la carte d'une IA part d'un bloc. Huit
         traînées simultanées ne disent rien à la table ; une à la fois, avec
         deux secondes pour la lire, racontent le tour. */
      animerTrajectoires(jeu2.trajectoires || [], { sequentiel: true });

      // ── ÉTAPE 3 : RÉCUPÉRATION PASSIVE ──
      const t3 = setTimeout(() => {
        if (partieAbandonnee()) return;
        setAiStepLabel("📦 Récupération…");
        const curTitanState3 = aiTitanStateRef.current;
        const curLooseBlocks3 = aiLooseBlocksRef.current;
        const curPassifUsed3 = aiPassifUsedRef.current;
        const curTitanModes3 = aiTitanModesRef.current;

        if (!curPassifUsed3[playerId]?.recup) {
          // L'ancienne version prenait la première case contenant un
          // Socle, sinon la première du pool, et laissait le moteur
          // ramasser « le dernier empilé » faute de logique de choix.
          // planRecuperation désigne la case ET le bloc précis, au gain
          // marginal réel : un 9e Bleu à 0 point ne vaut pas un 1er
          // Rouge à 3.
          // Le même contexte que le reste du tour (fin de partie, qui joue
          // encore après lui) : le simulateur le passait, la table non (audit
          // du 2026-09-23 — 15 Récupérations d'Expert sur 244 différaient).
          const jeu3 = { ...jeuIA(), titans: curTitanState3.players, looseBlocks: curLooseBlocks3, board: aiStateRef.current.board };
          const choix = planRecuperation(playerId, jeu3, profilDe(playerId));
          if (choix) {
            resolveRecuperation(playerId, choix.cellKey, jeu3, choix.pickedValue);
            setLooseBlocks((p) => ({ ...p }));
            setTitanState((p) => ({ ...p, players: [...p.players] }));
            setPassifUsed((prev) => ({ ...prev, [playerId]: { ...(prev[playerId] || {}), recup: true } }));
          }
        }

        const needsHuman = newDecisions.some((d) => {
          const atk = curTitanModes3[d.attackerId];
          const def = curTitanModes3[d.defenderId];
          return atk === "humain" || def === "humain";
        });

        enqueueDecisions(newDecisions);
        // Dans les deux cas, le tour avance immédiatement (comme pour un joueur
        // humain : enqueueDecisions puis markCardPlayed sont déjà synchrones côté
        // humain, cf. jouerToutCasser et consorts). La queue DIL/RAGE est globale
        // et se résout indépendamment du joueur actif — inutile d'attendre ici.
        finishAiTurn(cardId, { defausse });
      }, 2000);
      aiTimersRef.current.push(t3);
    }
    /* Toujours pas de cleanup sur le démontage : la cascade doit s'exécuter
       jusqu'au bout même si le composant se re-rend, c'était vrai et ça le
       reste. Ce qui a changé, c'est qu'une NOUVELLE PARTIE l'annule — les
       minuteurs vivent maintenant dans `aiTimersRef`, que l'effet de nettoyage
       vide, et chaque étape revérifie `partieAbandonnee()` pour le cas où elle
       serait déjà dépilée quand la coupure arrive. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupDone, phase, activePlayerId, titanModes, aiTrigger, currentDecision, currentRepli, ecroulement, waitingNextTitan,
    fpmcAttackerId, fpmcPendingIds, fpmcCurrent, fatigueEnAttente]);

  // ── AUTO-VALIDER PHASES IA ──
  // FIX (bug hunt) : cet effect lisait `titanState.players` depuis le closure
  // du composant sans l'avoir dans le tableau de dépendances (warning ESLint
  // désactivé ci-dessous) — la ref `t` trouvée pouvait donc être un objet
  // PÉRIMÉ, différent de celui présent dans `prev.players` au moment où
  // `setTitanState` s'exécutait réellement. `programCards` mute son objet en
  // entrée : muter l'objet périmé n'avait donc AUCUN effet sur l'état React
  // réel. Le Titan IA était marqué `phaseValidated = true` sans avoir de
  // cartes dans `programmed`, ce qui bloquait ensuite silencieusement l'IA en
  // Phase Action (`if (titan.programmed.length === 0) return;`) et gelait le
  // passage de tour ("en attente des autres Titans" indéfiniment).
  // Fix : on lit l'état courant via `aiTitanStateRef.current` (toujours à
  // jour, cf. le useEffect qui le synchronise plus haut) et on clone le
  // Titan visé DANS l'updater `setTitanState(prev => ...)` — donc toujours à
  // partir de `prev`, garanti à jour par React — avant de le muter.
  const programmationsEnCoursRef = useRef(new Set());
  useEffect(() => {
    if (!setupDone) return;
    if (phase === "action") return; // géré par l'auto-play + markCardPlayed
    if (aiPlayingRef.current) return;
    if (distantInviteRef.current) return; // seul l'hôte valide pour les IA
    // Une IA ne programme pas avant d'avoir un pied sur le plateau : c'est
    // cette auto-validation qui poussait la Phase Action à s'ouvrir sur des
    // Titans jamais posés (cf. `placementEnCours`).
    if (placementEnCours) return;
    const curTitanState = aiTitanStateRef.current;
    curTitanState.ordreJeu.forEach((id) => {
      if (titanModes[id] === "ia" && !phaseValidated[id]) {
        if (phase === "programmation") {
          const t = curTitanState.players.find((p) => p.id === id);
          if (t && t.programmed.length < 3 && t.hand.length >= 3) {
            /* Troisième molette du profil. Les niveaux du bas notent leurs
               six cartes dans l'état présent et gardent les trois
               meilleures — donc trois cartes qui visent souvent la même
               chose, dont deux seront mortes une fois la première jouée.
               La référence programme en SÉQUENCE : elle choisit la
               deuxième en sachant ce que la première aura fait du plateau
               (cf. `planProgrammationSequentielle`). */
            /* ── LA PROGRAMMATION VOIT CE QUE LA PHASE ACTION VOIT ──
               Audit de l'IA, 2026-09-07. Les deux états passés aux résolveurs
               d'IA en Phase Action (`jeu` et `jeu2`) transportent `finDePartie`
               et `aJouerEncore` ; celui de la PROGRAMMATION, non. Or c'est la
               décision qui engage toute la Manche.

               Sans `finDePartie`, `gestesAvantLaFin` retombe silencieusement
               sur un seuil d'apocalypse de 5, même quand la table est réglée
               autrement, et le poids de fin de partie ne peut jamais
               s'appliquer : l'IA programmait sa dernière Manche exactement
               comme la première. Sans `aJouerEncore`, l'Expert ne sait pas à
               qui il offre ce qu'il laisse au sol.

               Ajouter les champs suffit : les deux consommateurs les lisent
               déjà, ils ne recevaient rien. */
            const jeuProg = {
              titans: curTitanState.players,
              board: aiStateRef.current.board,
              looseBlocks: aiLooseBlocksRef.current,
              finDePartie: { apocalypseThreshold, mancheNumber, nbJoueurs },
              aJouerEncore: new Set(),
              egalitesLanterneRouge,
            };
            /* ── UNE RECHERCHE À LA FOIS PAR TITAN ──
               La réponse peut revenir d'un Web Worker (cf. `penseeIA`), et cet
               effet se relance à chaque validation des autres Titans : sans ce
               registre, chaque relance repartirait chercher la main de celui
               qui attend encore la sienne. La validation n'est posée qu'au
               retour, AVEC les cartes — jamais avant, sinon la Phase Action
               pourrait s'ouvrir sur une programmation vide. */
            const cle = `${partieRef.current}|${mancheNumber}|${id}`;
            if (programmationsEnCoursRef.current.has(cle)) return;
            programmationsEnCoursRef.current.add(cle);
            const partieProg = partieRef.current;
            const profilProg = profilDe(id);
            const planificateur = reglagesDe(profilProg).programmationSequentielle
              ? "planProgrammationSequentielle"
              : "planProgrammation";
            penser(planificateur, [id, jeuProg, profilProg, mancheNumber], (chosen) => {
              programmationsEnCoursRef.current.delete(cle);
              if (partieRef.current !== partieProg) return;
              setTitanState((prev) => ({
                ...prev,
                players: prev.players.map((p) => {
                  if (p.id !== id) return p;
                  const clone = { ...p, hand: [...p.hand], programmed: [...p.programmed] };
                  const res = programCards(id, chosen, [clone]);
                  return res.ok ? clone : p; // si programCards refuse, on garde l'état inchangé
                }),
              }));
              setPhaseValidated((prev) => ({ ...prev, [id]: true }));
            });
            return;
          }
        }
        setPhaseValidated((prev) => ({ ...prev, [id]: true }));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupDone, phase, titanModes, phaseValidated, placementEnCours]);

  /* ── UN RAMASSAGE ENGAGÉ SE TERMINE AVANT TOUT LE RESTE ──
     Nikola, 2026-09-16 : « régler le souci d'ouvrir une autre carte pendant un
     ramassage remet le compteur à zéro, y compris pendant celui d'un invité ».

     Dès le premier bloc, Je Ne Partage Pas est JOUÉE : chaque clic encaisse
     pour de bon. La garde « une carte par round » (`waitingNextTitan`) ne
     tombe pourtant qu'à la clôture, et entre les deux rien n'empêchait
     d'ouvrir une autre carte, de défausser, de se déplacer ou de ramasser au
     passif — chacun de ces gestes remettait le compteur à zéro en refermant
     les modes, chez l'hôte y compris pendant le ramassage d'un invité.

     Le compteur est de l'état de partie : aucun mode ne le touche plus, et
     tant qu'il n'est pas vide, seul le ramassage avance — jusqu'au dernier
     bloc, ou jusqu'à « Clôturer ». */
  const ramassageEnCours = jnpSelected.length > 0;

  const canUseMovePassif = useCallback(
    (titanId) => phase === "action" && titanId === activePlayerId && !(passifUsed[titanId]?.move) && !ramassageEnCours,
    [phase, activePlayerId, passifUsed, ramassageEnCours]
  );
  const canUseRecupPassif = useCallback(
    (titanId) => {
      if (phase !== "action") return false;
      /* Le Ramassage clôt SON tour, comme le Mouvement gratuit l'ouvre (audit
         du 2026-09-23) : sans cette ligne, sélectionner pendant la fin de tour
         d'un autre un Titan qui avait déjà joué dans la Manche lui ouvrait le
         Ramassage, hors de son tour. */
      if (titanId !== activePlayerId) return false;
      if (ramassageEnCours) return false;
      if (passifUsed[titanId]?.recup) return false;
      const titan = titanState.players.find((t) => t.id === titanId);
      if (!titan) return false;
      // Récupération uniquement après avoir joué OU défaussé (face cachée)
      // au moins une carte ce round — la défausse volontaire compte au
      // même titre qu'une carte réellement jouée (confirmé Nikola).
      return titan.playedThisManche.length > 0 || (titan.discardedHidden || []).length > 0;
    },
    [phase, activePlayerId, passifUsed, titanState.players, ramassageEnCours]
  );

  // ── AUTO-RÉSOLUTION DIL/RAGE avec IA (attaquant et/ou défenseur) ──
  // Bug remonté : seul le cas "attaquant ET défenseur IA" était auto-résolu.
  // Dès qu'UN SEUL des deux était humain, toute la décision (y compris la
  // part qui revient normalement à l'IA seule) passait par la queue UI
  // humaine — ex. un défenseur IA en DIL ne décidait jamais lui-même quelle
  // couleur perdre, c'était géré comme si un humain devait cliquer à sa
  // place. Règle du livret : en DIL, la CIBLE (défenseur) choisit laquelle
  // des 2 perdre ; en RAGE, l'ATTAQUANT choisit librement. Donc :
  // - RAGE : seul le mode de l'ATTAQUANT compte. IA → auto, quel que soit
  //   le défenseur. Humain → flux UI normal (resolveRagePick).
  // - DIL : les deux étapes (choix des 2 options, puis choix de la perte)
  //   sont indépendantes et chacune suit le mode de SON décideur.

  /* ── OÙ VA LE BLOC PERDU ── (arbitrage Nikola du 2026-08-17, carte par carte)
     La route vit dans le domaine (`acheminerPerte`, aiPlanner.js) : un seul
     code pour les quatre chemins d'ici (DIL humain, DIL IA, DIL IA↔IA, RAGE
     humaine) et pour le simulateur. `looseBlocks` y est muté en place, on
     notifie ensuite, exactement comme après un résolveur. */
  const acheminerBlocPerdu = useCallback((decision, defender, attacker, color) => {
    const suffixe = acheminerPerte(decision, defender, attacker, color, aiLooseBlocksRef.current);
    setLooseBlocks((prev) => ({ ...prev }));
    /* Un Socle se tire au sort : annuler, puis retrancher, relancerait le
       tirage jusqu'au Socle voulu (Nikola, 2026-09-24 — même règle que la
       désignation d'une cible FPMC). */
    if (color === SOCLE_OPTION) setUndoStack([]);
    return suffixe;
  }, []);

  const autoResolveIaDecisions = useCallback((rawDecisions, curTitanModes, curPlayers) => {
    const needHuman = [];
    for (const d of rawDecisions) {
      const atkIsIa = curTitanModes[d.attackerId] === "ia";
      const defIsIa = curTitanModes[d.defenderId] === "ia";
      const defender = curPlayers.find((t) => t.id === d.defenderId);
      const attacker = curPlayers.find((t) => t.id === d.attackerId);
      if (!defender || !attacker) continue;

      if (d.type === "RAGE") {
        // RAGE : décision 100% côté attaquant (livret) — indépendant du
        // mode du défenseur.
        if (!atkIsIa) { needHuman.push(d); continue; }
        // Bug trouvé en branchant les IA : le seuil était `>= 2`, reliquat
        // de l'ancien alignement erroné sur la contrainte de DIL. Le
        // ruling de Nikola est explicite (cf. canRage) : RAGE est possible
        // dès 1 seule ressource, l'attaquant n'en prend qu'une. Avec
        // l'ancien seuil, une cible possédant exactement 1 bloc et aucune
        // Adrénaline ne perdait RIEN face à un attaquant IA : le RAGE
        // était purement et simplement annulé.
        /* ── L'ADRÉNALINE EST UNE OPTION À PART ENTIÈRE (audit du 2026-09-20) ──
           Elle n'était prise que si le Repaire était VIDE — un pis-aller.
           Or la FAQ #5 la rend ciblable librement, et arracher la dernière
           Adrénaline de qui s'apprête à annuler un Dilemme vaut souvent mieux
           qu'un bloc de plus : c'est un des « vols de points » que Nikola
           signale depuis le 2026-08-28.

           Le correctif avait été écrit, mais dans `appliquerDecisions`
           seulement, c'est-à-dire dans le MODÈLE que l'IA consulte pour
           choisir son coup. Le moteur qui résout ensuite était resté à
           l'ancienne règle : la recherche prévoyait l'Adrénaline, la partie
           prenait un bloc. Les deux arbitrent désormais sur la même liste.

           Depuis le 2026-09-21, l'arbitrage est celui du modèle — ce que
           l'attaquant y gagne plus la moitié de ce que la cible y perd — et
           il vit dans `trancherDecisionIA` (aiPlanner.js), que le simulateur
           appelle aussi : la partie joue ce que la recherche a prévu. */
        const choixRage = trancherDecisionIA(d, curPlayers, null, aiTitanProfilesRef.current[d.attackerId]);
        if (!choixRage) continue;
        if (choixRage.option === ADRENALINE_OPTION) {
          // FAQ #5. Une Adrénaline ne se pose pas au sol : elle va toujours
          // à l'attaquant, quelle que soit la ligne du tableau des
          // destinations.
          defender.adrenaline -= 1;
          attacker.adrenaline = (attacker.adrenaline || 0) + 1;
          setActionLog((prev) => [...prev, `RAGE IA (T${d.attackerId} attaquant, FAQ#5) : prend 1 Adrénaline à T${d.defenderId}.`]);
        } else {
          // Le bloc arraché va au sol ou au Repaire selon la carte : c'est
          // juste pour Tête en Avant et Faut Pas Me Chauffer, faux pour la
          // RAGE de Tout Casser, que Nikola a tranchée « au sol » le
          // 2026-08-17 (cf. acheminerBlocPerdu).
          const suffixe = acheminerBlocPerdu(d, defender, attacker, choixRage.option);
          setActionLog((prev) => [...prev, `RAGE IA (T${d.attackerId} attaquant, ${d.cardLabel}) : arrache ${choixRage.option} à T${d.defenderId}${suffixe}`]);
        }
        continue;
      }

      // DIL
      /* Les options sont désormais les couleurs DU REPAIRE PLUS, le cas
         échéant, « un Socle tiré au sort » (livret). L'IA raisonnait sur
         `defender.repaire` seul : elle n'aurait jamais proposé le Socle, et
         aurait planté sur une cible « 1 couleur + 1 Socle » que canDil
         accepte maintenant. Ce que l'IA désigne vit dans
         `optionsDesigneesIA`, ce qu'elle lâche dans `reponseCibleIA`
         (aiPlanner.js) : une seule règle pour les trois configurations, et
         pour le simulateur. */

      if (atkIsIa && defIsIa) {
        /* Les deux étapes auto : l'attaquant désigne ses deux options, le
           défenseur lâche la moins chère ou paie 1 Adrénaline. La règle est
           `trancherDecisionIA`, la même que dans le simulateur ; le bloc perdu
           suit la même route que côté humain (cf. acheminerBlocPerdu). */
        const choixDil = trancherDecisionIA(
          d, curPlayers, aiTitanProfilesRef.current[d.defenderId], aiTitanProfilesRef.current[d.attackerId]
        );
        if (!choixDil) continue;
        if (choixDil.paie) {
          defender.adrenaline -= 1;
          if (attacker) attacker.adrenaline = (attacker.adrenaline || 0) + 1;
          setActionLog((prev) => [...prev, `DIL IA↔IA (${d.cardLabel}) : T${d.defenderId} préfère donner 1 Adrénaline à T${d.attackerId} plutôt que de perdre ${choixDil.option} (${choixDil.valeur} pts en jeu).`]);
          continue;
        }
        const suffixe = acheminerBlocPerdu(d, defender, attacker, choixDil.option);
        const seulChoix = choixDil.seulChoix ? " (seul choix)" : ` (valeur marginale ${choixDil.valeur})`;
        setActionLog((prev) => [...prev, `DIL IA↔IA (${d.cardLabel}) : T${d.defenderId} perd ${choixDil.option}${seulChoix}${suffixe}`]);
        continue;
      }

      if (atkIsIa && !defIsIa) {
        // Attaquant IA choisit seul ses 2 options (même règle qu'entre deux
        // IA), puis la décision est poussée à la queue humaine DÉJÀ au
        // stade DEFENDER_PICK — le défenseur humain choisit laquelle des 2 il
        // perd (via resolveDilDefenderPick, inchangé).
        const offered = optionsDesigneesIA(d, curPlayers, aiTitanProfilesRef.current[d.attackerId]);
        if (offered.length === 0) continue;
        needHuman.push({ ...d, presetAttackerChoices: offered });
        continue;
      }

      // !atkIsIa && defIsIa : attaquant humain choisit normalement les 2
      // options (ATTACKER_PICK, UI classique) ; on marque juste la décision
      // pour que dilValidateAttackerPick sache que le défenseur (IA) doit
      // être auto-résolu ensuite, sans jamais attendre de clic humain pour
      // le stade DEFENDER_PICK.
      needHuman.push({ ...d, defenderIsAi: defIsIa });
    }
    return needHuman;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enqueueDecisions = useCallback((rawDecisions) => {
    if (!rawDecisions || rawDecisions.length === 0) return [];
    // Utilise les refs live pour les modes et players (évite stale closure)
    const curModes = aiTitanModesRef.current;
    const curPlayers = aiTitanStateRef.current.players;
    const humanDecisions = autoResolveIaDecisions(rawDecisions, curModes, curPlayers);
    if (humanDecisions.length === 0) {
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      return humanDecisions;
    }
    /* ── UNE DÉCISION IMPOSSIBLE NE DOIT JAMAIS ARRIVER À L'ÉCRAN ──
       `canDil` / `canRage` sont évalués par le résolveur AU MOMENT DE
       L'IMPACT. Mais la suite de la carte continue de s'appliquer après :
       la cible est projetée, elle sème des blocs en chemin (replis), un
       Amas s'écroule sur elle. Son Repaire peut donc être retombé sous le
       seuil quand la décision s'affiche enfin.

       Le panneau devenait alors sans issue : DIL exige 2 options désignées
       pour activer « Valider » — avec une seule option affichée, ce bouton
       ne s'active JAMAIS, et rien d'autre ne permet de sortir. Même chose
       pour une RAGE dont la cible n'a plus la moindre ressource : aucun
       bouton, aucune sortie, partie perdue.

       Le ruling est déjà tranché (Nikola, 14/08) : quand la cible n'a pas
       de quoi subir la décision, l'action est notée au journal et ne
       produit simplement aucun effet. On l'applique ici aussi, et pas
       seulement à la création. */
    const jeuCourant = { titans: curPlayers };
    const impossibles = [];
    const jouables = humanDecisions.filter((d) => {
      const ok = d.type === "RAGE" ? canRage(d.defenderId, jeuCourant) : canDil(d.defenderId, jeuCourant, d.cardLabel);
      if (!ok) impossibles.push(d);
      return ok;
    });
    if (impossibles.length > 0) {
      setActionLog((prev) => [...prev, ...impossibles.map((d) =>
        `${d.type} (${d.cardLabel}) sans effet sur Titan ${d.defenderId} : il ne lui reste plus de quoi la subir ` +
        `au moment de la résoudre (la carte a continué de s'appliquer après l'impact).`)]);
    }
    if (jouables.length === 0) {
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      return jouables;
    }

    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setDecisionQueue((prev) => [
      ...prev,
      ...jouables.map((d) => {
        // Bug remonté (DIL vs IA) : si l'attaquant IA a déjà pré-calculé
        // ses 2 options (presetAttackerChoices), on saute directement au
        // stade DEFENDER_PICK pour le défenseur humain — jamais de stade
        // ATTACKER_PICK fantôme sans attaquant humain pour le résoudre.
        let preset = d.presetAttackerChoices || null;

        // DIL à combinaison unique : quand le défenseur n'a QUE 2 couleurs
        // distinctes en Repaire, l'attaquant n'a aucun choix à faire — les
        // 2 couleurs qu'il doit désigner sont forcément celles-là. On saute
        // son étape plutôt que de lui faire cliquer une seule option
        // possible. Même chose, depuis le 2026-09-23, pour la cible qui n'a
        // qu'UNE option sur un Dilemme au sol (cf. `seuilOptionsDil`).
        if (!preset && d.type === "DIL") {
          // Options = couleurs du Repaire + « un Socle tiré au sort » le cas
          // échéant. Lire `repaire` seul ratait la combinaison unique
          // « 1 couleur + 1 Socle », et faisait cliquer l'attaquant sur une
          // liste d'un seul élément qu'il ne pouvait pas valider.
          const options = getDilOptions(d.defenderId, { titans: aiTitanStateRef.current.players });
          if (options.length >= 1 && options.length <= 2) preset = options;
        }

        /* ⚠️ QUI TRANCHE LE STADE DÉFENSEUR, C'EST LE DÉFENSEUR.
           Bug remonté par Nikola le 2026-08-28 : « quand DIL · Graouhhh, Niko
           sur Pénélope, je n'ai pas le droit de choisir Adrénaline — c'est la
           victime qui doit faire ce choix, si pour elle les 2 autres blocs sont
           trop importants ».

           Le raccourci « combinaison unique » juste au-dessus est juste : quand
           la cible n'a que 2 options, l'attaquant n'a rien à désigner, on lui
           épargne un clic sans choix. Mais il enchaînait sur DEFENDER_PICK SANS
           REGARDER QUI EST LE DÉFENSEUR. Face à une IA, l'attaquant humain se
           retrouvait donc devant le panneau de sa VICTIME — il choisissait le
           bloc qu'elle perd, et pouvait même dépenser SON Adrénaline à sa
           place. L'arbitrage que la victime est censée faire (« ces deux blocs
           me coûtent plus cher qu'un jeton ») passait à l'attaquant, qui a
           exactement l'intérêt inverse.

           Le stade défenseur n'est donc atteint que si un HUMAIN doit y
           répondre. Quand la cible est une IA, on reste au stade attaquant avec
           les deux options déjà cochées : il valide, et c'est l'IA qui décide
           ensuite ce qu'elle lâche ou si elle paie (cf.
           `dilValidateAttackerPick` et `reponseCibleIA`). */
        const defenseurHumain = !d.defenderIsAi;
        return {
          ...d,
          id: Math.random().toString(36).slice(2, 9),
          stage: preset && defenseurHumain ? "DEFENDER_PICK" : "ATTACKER_PICK",
          attackerChoices: preset || [],
          autoAttackerPick: Boolean(preset) && !d.presetAttackerChoices,
        };
      }),
    ]);
    return jouables;
  }, [autoResolveIaDecisions]);

  /* ── FILE DES REPLIS ──
     Le pendant de `enqueueDecisions` pour les éléments arrêtés faute de
     puissance : chaque résolveur de carte appelle les deux à la suite.
     Déclaré ICI et pas plus bas, à côté du reste de la mécanique de repli :
     les `useCallback` qui l'appellent le citent dans leur tableau de
     dépendances, lequel est évalué AU RENDU — une déclaration plus bas
     donnait une ReferenceError de zone morte temporelle. */
  const enqueueReplis = useCallback((liste) => {
    if (!liste || liste.length === 0) return;
    const modes = aiTitanModesRef.current;
    const profils = aiTitanProfilesRef.current;
    const etat = {
      board: aiStateRef.current.board,
      looseBlocks: aiLooseBlocksRef.current,
      titans: aiTitanStateRef.current.players,
      // Même contexte que le simulateur (audit du 2026-09-23) : l'IA juge ses
      // replis en sachant où en est la partie et qui joue encore ce round.
      finDePartie: { apocalypseThreshold, mancheNumber, nbJoueurs },
      aJouerEncore: titansApresMoi(activePlayerId),
      egalitesLanterneRouge,
    };
    /* Le dédoublonnage et le choix de l'IA vivent dans le domaine
       (`trancherReplisIA`, aiPlanner.js) : le simulateur appliquait chaque
       demande sans dédoublonner, il appelle désormais le même code. */
    const { humains: aTrancher, journal } = trancherReplisIA(
      liste, etat, (id) => profils[id], (id) => modes[id] === "ia"
    );
    if (journal.length > 0) setActionLog((prev) => [...prev, ...journal]);

    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    if (aTrancher.length > 0) setRepliQueue((prev) => [...prev, ...aTrancher]);
    // Rendu à l'appelant : Graouhhh doit savoir s'il peut enchaîner sur le
    // Titan suivant ou s'il doit attendre un clic (cf. `advanceGraouhhhLoop`).
    return aTrancher;
  }, [apocalypseThreshold, mancheNumber, nbJoueurs, titansApresMoi, activePlayerId, egalitesLanterneRouge]);

  /* ── GRAOUHHH : DIL PUIS DÉPLACEMENT, TITAN PAR TITAN ──
     Ruling Nikola (test à la table, 2026-08-18) : « on fait dans l'ordre
     DIL/RAGE puis déplacement, et Titan suivant si il y en a un autre —
     impossible de passer au Titan suivant tant que ce n'est pas résolu. »

     `advanceGraouhhh` (domaine) traite les Titans touchés un par un, du
     plus loin au plus proche : pour chacun, soit il n'y a pas de DIL
     possible et il est déplacé tout de suite, soit une décision DIL est
     rendue et il faut attendre qu'elle soit tranchée avant de continuer.

     Boucle ici plutôt que dans le domaine : un défenseur IA se résout
     instantanément (cf. autoResolveIaDecisions dans enqueueDecisions), donc
     plusieurs Titans peuvent s'enchaîner d'un coup sans jamais passer par la
     file — seul un vrai défenseur humain interrompt la boucle. */
  /* Lit les MIROIRS (`aiStateRef` & co.) et non la closure, pour deux
     raisons. D'abord la robustesse : la boucle IA appelle cette fonction
     depuis un timer de 2 s, avec une closure capturée bien avant. Ensuite
     la stabilité : sans `state`/`titanState`/`looseBlocks` en dépendances,
     ce callback ne change plus d'identité à chaque rendu, et l'effet IA
     peut le capturer une fois pour toutes sans risque de version périmée.
     Pour le joueur humain, rien ne change : `jouerGraouhhh` appelle la
     boucle dans le même tick, quand les miroirs sont exacts. */
  /* ── REFUS DE FATIGUE ──────────────────────────────────────
     Ruling du 2026-08-28 : « l'Adrénaline permet de refuser une Fatigue ».

     La Fatigue est déjà appliquée quand cette file se remplit — c'est
     volontaire, cf. `resolveFatigue` : la carte étant tirée au sort, refuser
     sans savoir laquelle est partie ne serait pas un choix. La cible voit donc
     ce qu'elle vient de perdre, puis décide.

     Une IA tranche seule, au barème : elle paie si la carte vaut plus cher que
     la valeur marginale de sa réserve. Un humain reçoit le bandeau.
     Contrairement au Dilemme, aucun tour ne se joue là-dessus — une Fatigue
     non refusée est simplement une Fatigue, donc le refus n'a pas besoin d'un
     stade « attaquant ». */
  // La file `fatiguesEnAttente` est déclarée plus haut, près des autres
  // décisions : l'instantané la transporte, sa déclaration doit le précéder.

  const enqueueFatigues = useCallback((liste) => {
    if (!liste || liste.length === 0) return;
    // La carte prise par la Fatigue est tirée au sort : pas d'annulation qui
    // permettrait de retirer (Nikola, 2026-09-24).
    setUndoStack([]);
    const joueurs = aiTitanStateRef.current.players;
    const modes = aiTitanModesRef.current;
    const aTrancher = [];

    for (const f of liste) {
      if (modes[f.targetId] !== "ia") { aTrancher.push(f); continue; }
      // La règle de l'IA vit dans le domaine (`iaRefuseFatigue`), commune
      // avec le simulateur.
      if (iaRefuseFatigue(f, joueurs)) {
        const res = refuserFatigue(f.attackerId, f.targetId, f.cardId, joueurs);
        if (res.ok) setActionLog((prev) => [...prev, `${res.log} (décision automatique)`]);
      }
    }

    if (aTrancher.length > 0) setFatiguesEnAttente((file) => [...file, ...aTrancher]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, []);

  const refuserFatigueEnCours = useCallback(() => {
    const f = fatigueEnAttente;
    if (!f) return;
    captureSnapshot();
    const res = refuserFatigue(f.attackerId, f.targetId, f.cardId, aiTitanStateRef.current.players);
    setActionLog((prev) => [...prev, res.ok ? res.log : `⚠️ ${res.reason}`]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setFatiguesEnAttente((file) => file.slice(1));
  }, [fatigueEnAttente, captureSnapshot]);

  const accepterFatigueEnCours = useCallback(() => setFatiguesEnAttente((file) => file.slice(1)), []);

  const advanceGraouhhhLoop = useCallback((continuation) => {
    /* `trajectoires` MANQUAIT ICI — Nikola, 2026-08-28 : « quand il y a un
       Graouhhh, une charge, en gros une interaction qui fait bouger un Titan,
       fais comme pour les débris de Tout Casser, avec les petites cases jaunes
       qui montrent le chemin ».

       Le mécanisme existait déjà et marchait pour les quatre autres cartes :
       `projectInDirection` dépose chaque trajet dans ce tableau, et l'appelant
       le passe à `animerTrajectoires`. Graouhhh construisait son état SANS le
       champ — les trajets étaient donc jetés en silence, et la carte qui
       déplace le plus de Titans à la fois était la seule à ne rien montrer. */
    const gameState = {
      board: aiStateRef.current.board,
      titans: aiTitanStateRef.current.players,
      looseBlocks: aiLooseBlocksRef.current,
      replis: [],
      trajectoires: [],
    };
    let cont = continuation;
    for (;;) {
      const result = advanceGraouhhh(gameState, cont);
      if (result.log.length > 0) setActionLog((prev) => [...prev, ...result.log]);
      if (result.fatigues?.length) enqueueFatigues(result.fatigues);
      if (result.done) break;

      /* PAUSE SUR REPLI (2026-08-28). Le résolveur s'arrête dès qu'un Titan
         doit être replié : tant que l'initiateur n'a pas dit où le poser, la
         case qu'il occupe encore fausse le calcul du Titan suivant. On vide
         donc les replis MAINTENANT, en leur attachant la continuation, et on
         rend la main si un humain doit trancher — `choisirRepli` relancera la
         boucle. Une IA tranche dans `enqueueReplis` sans rien rendre : la
         boucle reprend alors immédiatement, sur un plateau à jour. */
      if (result.repliEnAttente) {
        const enAttente = gameState.replis.splice(0, gameState.replis.length);
        const aTrancher = enqueueReplis(enAttente.map((r) => ({ ...r, graouhhh: result.continuation })));
        if (aTrancher && aTrancher.length > 0) return;
        cont = result.continuation;
        continue;
      }

      const humanDecisions = enqueueDecisions([{ ...result.decision, graouhhh: result.continuation }]);
      if (humanDecisions && humanDecisions.length > 0) break;
      cont = result.continuation;
    }
    enqueueReplis(gameState.replis);
    animerTrajectoires(gameState.trajectoires);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [enqueueDecisions, enqueueReplis, animerTrajectoires, enqueueFatigues]);




  const dilAttackerPick = useCallback((color) => {
    setDecisionQueue((prev) => {
      const [cur, ...rest] = prev;
      if (!cur || cur.type !== "DIL" || cur.stage !== "ATTACKER_PICK") return prev;
      const already = cur.attackerChoices.includes(color);
      let choices;
      if (already) choices = cur.attackerChoices.filter((c) => c !== color);
      else if (cur.attackerChoices.length < 2) choices = [...cur.attackerChoices, color];
      else choices = cur.attackerChoices;
      return [{ ...cur, attackerChoices: choices }, ...rest];
    });
  }, []);

  const dilValidateAttackerPick = useCallback(() => {
    // La mutation du Repaire se faisait AUTREFOIS à l'intérieur de l'updater
    // passé à setDecisionQueue. C'est exactement le motif éliminé partout
    // ailleurs dans ce fichier : React ne garantit pas qu'un updater n'est
    // appelé qu'une fois, et le défenseur pouvait perdre deux blocs au lieu
    // d'un (aujourd'hui invisible faute de StrictMode, donc une bombe à
    // retardement pour le jour où quelqu'un l'active pour déboguer).
    // Réécrit en séquence synchrone : on lit, on décide, on mute, on dépile.
    const cur = decisionQueue[0];
    // Deux options à désigner, ou la seule que la cible possède (Dilemme au
    // sol, 2026-09-23) — cf. `optionsADesigner`, que le bandeau lit aussi.
    if (!cur || cur.type !== "DIL" || cur.stage !== "ATTACKER_PICK") return;
    // Une option désignée doit exister chez la cible : le clic du bandeau n'en
    // propose pas d'autre, une intention réseau, si.
    const offertes = getDilOptions(cur.defenderId, { titans: titanState.players });
    if (!cur.attackerChoices.every((c) => offertes.includes(c))) return;
    if (cur.attackerChoices.length === 0 || cur.attackerChoices.length !== optionsADesigner(cur.defenderId, { titans: titanState.players })) return;

    if (!cur.defenderIsAi) {
      setDecisionQueue((prev) => (prev[0] === cur ? [{ ...cur, stage: "DEFENDER_PICK" }, ...prev.slice(1)] : prev));
      return;
    }

    // À partir d'ici la décision se résout pour de bon : le Repaire de la
    // cible va bouger. On fige l'état avant, pour que « Annuler » défasse la
    // perte du bloc et repose la décision telle qu'elle était.
    captureSnapshot();
    // Défenseur IA : il n'a jamais son mot à dire par l'interface, la
    // décision resterait en attente d'un clic qui ne viendrait pas. Même
    // heuristique que l'auto-résolution IA↔IA — il perd la couleur dont la
    // valeur marginale lui coûte le moins.
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    if (defender) {
      // `reponseCibleIA` : la même règle que le défenseur IA d'un Dilemme
      // entre deux IA, qui sait aussi traiter l'option Socle (tirée au sort).
      const reponse = reponseCibleIA(cur, titanState.players, cur.attackerChoices, aiTitanProfilesRef.current[cur.defenderId]);
      const defChoice = { color: reponse.option, defVal: reponse.valeur };
      const attacker = titanState.players.find((t) => t.id === cur.attackerId);

      /* PAYER OU ENCAISSER — demande de Nikola du 2026-08-17 : « c'est l'IA
         qui décide si elle dépense une Adrénaline si je lui fais un DIL ».
         Elle n'avait pas le choix : elle perdait toujours un bloc, alors que
         le livret laisse au défenseur la possibilité d'annuler en donnant
         1 Adrénaline à l'attaquant.

         L'arbitrage se fait au vrai barème, sans table de poids, et il vit
         dans `reponseCibleIA` (aiPlanner.js) — partagé avec la résolution IA
         contre IA et avec le simulateur. Il chiffrait « 3 points, 6 en
         différentiel » en dur, deux nombres qui ne correspondaient déjà plus
         au forfait de 2 et qui n'ont plus de sens du tout depuis que le
         barème est progressif : c'est la valeur MARGINALE de la réserve du
         défenseur qui décide. Elle paie quand le bloc menacé lui coûte
         davantage — typiquement un Socle de valeur, ou une couleur qui casse
         une paire d'Orange. */
      if (reponse.paie) {
        defender.adrenaline -= 1;
        if (attacker) attacker.adrenaline = (attacker.adrenaline || 0) + 1;
        setActionLog((prevLog) => [...prevLog, `DIL (${cur.cardLabel}) : Titan ${cur.defenderId} (IA) préfère donner 1 Adrénaline à Titan ${cur.attackerId} plutôt que de perdre ${defChoice.color} (${defChoice.defVal} pts en jeu).`]);
        setTitanState((p) => ({ ...p, players: [...p.players] }));
        setDecisionQueue((prev) => prev.slice(1));
        // Graouhhh : ce Titan est tranché, on enchaîne sur le suivant de
        // l'axe (cf. advanceGraouhhhLoop) plutôt que d'attendre un clic qui
        // ne viendra jamais côté défenseur IA.
        if (cur.graouhhh) advanceGraouhhhLoop(cur.graouhhh);
        return;
      }

      const suffixe = acheminerBlocPerdu(cur, defender, attacker, defChoice.color);
      const quoi = defChoice.color === SOCLE_OPTION ? "1 Socle" : defChoice.color === ADRENALINE_OPTION ? "1 Adrénaline" : `1 bloc ${defChoice.color}`;
      setActionLog((prevLog) => [...prevLog, `DIL (${cur.cardLabel}) : Titan ${cur.defenderId} (IA) perd ${quoi} (décision automatique)${suffixe}`]);
      setTitanState((p) => ({ ...p, players: [...p.players] }));
    }
    setDecisionQueue((prev) => prev.slice(1));
    if (cur.graouhhh) advanceGraouhhhLoop(cur.graouhhh);
  }, [decisionQueue, titanState.players, acheminerBlocPerdu, captureSnapshot, advanceGraouhhhLoop]);

  const resolveDilDefenderPick = useCallback(
    (color) => {
      const cur = decisionQueue[0];
      /* La cible ne choisit que parmi ce que l'attaquant a désigné, et
         seulement une fois qu'il l'a fait (audit du 2026-09-23 : rien ne
         l'empêchait, à distance, de perdre une couleur jamais désignée). */
      if (!cur || cur.type !== "DIL" || cur.stage !== "DEFENDER_PICK" || !cur.attackerChoices.includes(color)) return;
      captureSnapshot();
      const defender = titanState.players.find((t) => t.id === cur.defenderId);
      const attacker = titanState.players.find((t) => t.id === cur.attackerId);
      const suffixe = acheminerBlocPerdu(cur, defender, attacker, color);
      const quoi = color === SOCLE_OPTION ? "1 Socle" : color === ADRENALINE_OPTION ? "1 Adrénaline" : `1 bloc ${color}`;
      setActionLog((prevLog) => [...prevLog, `DIL (${cur.cardLabel}) : Titan ${cur.defenderId} perd ${quoi}${suffixe}`]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      setDecisionQueue((prev) => prev.slice(1));
      if (cur.graouhhh) advanceGraouhhhLoop(cur.graouhhh);
    },
    [decisionQueue, titanState.players, acheminerBlocPerdu, captureSnapshot, advanceGraouhhhLoop]
  );

  const resolveDilCancelWithAdrenaline = useCallback(() => {
    const cur = decisionQueue[0];
    if (!cur || cur.type !== "DIL" || cur.stage !== "DEFENDER_PICK") return;
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    const attaquant = titanState.players.find((t) => t.id === cur.attackerId);
    if ((defender.adrenaline || 0) < 1) { return; }
    captureSnapshot();
    defender.adrenaline -= 1;
    // Livret : « le défenseur peut DONNER 1 adrénaline À L'ATTAQUANT pour
    // annuler le DIL ». Elle était retirée au défenseur sans jamais arriver
    // chez l'attaquant — elle disparaissait du jeu, comme les blocs de DIL
    // et de RAGE corrigés plus haut.
    if (attaquant) attaquant.adrenaline = (attaquant.adrenaline || 0) + 1;
    setActionLog((prevLog) => [...prevLog, `DIL annulé par Titan ${cur.defenderId} : 1 Adrénaline donnée à Titan ${cur.attackerId}.`]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    /* ── DÉPILER D'ABORD, ENCHAÎNER ENSUITE ──
       Cette fonction faisait l'inverse des trois autres résolveurs de décision
       (`dilValidateAttackerPick`, `resolveDilDefenderPick`, `resolveRagePick`),
       qui dépilent avant de relancer la chaîne. Ça ne se voyait pas, parce que
       les deux mises à jour sont fonctionnelles et se composent dans l'ordre
       d'appel : la décision suivante était ajoutée, puis `slice(1)` retirait
       bien l'ancienne tête.

       Ça tenait par accident. Le jour où l'un des deux chemins cesse d'être
       fonctionnel — ou où `advanceGraouhhhLoop` dépile lui-même — le `slice(1)`
       emporterait la décision QUI VIENT D'ARRIVER, et la cible suivante
       partirait sans jamais subir son Dilemme. On remet donc l'ordre commun aux
       quatre : la décision tranchée quitte la file, puis la chaîne reprend. */
    setDecisionQueue((prev) => prev.slice(1));
    if (cur.graouhhh) advanceGraouhhhLoop(cur.graouhhh);
  }, [decisionQueue, titanState.players, captureSnapshot, advanceGraouhhhLoop]);

  const resolveRagePick = useCallback(
    (color) => {
      const cur = decisionQueue[0];
      if (!cur || cur.type !== "RAGE") return;
      const defender = titanState.players.find((t) => t.id === cur.defenderId);
      // Une RAGE prend un bloc du Repaire (jamais un Socle : ruling du 18/08).
      if (!defender?.repaire.includes(color)) return;
      captureSnapshot();
      const attacker = titanState.players.find((t) => t.id === cur.attackerId);
      const suffixe = acheminerBlocPerdu(cur, defender, attacker, color);
      setActionLog((prevLog) => [...prevLog, `RAGE (${cur.cardLabel}) : Titan ${cur.attackerId} arrache ${color} à Titan ${cur.defenderId}${suffixe}`]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      setDecisionQueue((prev) => prev.slice(1));
    },
    [decisionQueue, titanState.players, acheminerBlocPerdu, captureSnapshot]
  );

  const resolveRagePickAdrenaline = useCallback(() => {
    const cur = decisionQueue[0];
    if (!cur || cur.type !== "RAGE") return;
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    const attacker = titanState.players.find((t) => t.id === cur.attackerId);
    if ((defender.adrenaline || 0) < 1) return;
    captureSnapshot();
    defender.adrenaline -= 1;
    // FAQ #5 : l'Adrénaline est une ressource comme une autre. RAGE la
    // PREND, elle ne s'évapore pas — l'attaquant la gagne.
    if (attacker) attacker.adrenaline = (attacker.adrenaline || 0) + 1;
    setActionLog((prevLog) => [...prevLog, `RAGE (FAQ#5) : Titan ${cur.attackerId} prend 1 Adrénaline à Titan ${cur.defenderId}.`]);
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setDecisionQueue((prev) => prev.slice(1));
  }, [decisionQueue, titanState.players, captureSnapshot]);

  /* ── ON SÉLECTIONNE UN EXEMPLAIRE, PAS UN TITRE ──
     Bug remonté par Nikola le 2026-08-28 : « ce n'est pas parce que je clique
     sur Graouhhh que si j'ai une autre carte Graouhhh ça la prend aussi ».

     Depuis que le vol de Phase Repos transfère la carte au voleur, une main
     peut contenir deux fois le même titre. La sélection était une liste
     d'identifiants de CARTE : cliquer l'un des deux Graouhhh marquait donc
     les deux à l'écran (`progSelection.includes(cardId)` ne sait pas
     distinguer deux exemplaires), et n'en programmait qu'un. Programmer les
     deux exemplaires était impossible.

     Elle est désormais une liste de `{ idx, cardId }` — la POSITION en main
     identifie l'exemplaire, le `cardId` reste ce qu'on envoie au moteur.
     `programCards` compte déjà les exemplaires de son côté, donc un index
     périmé ne peut rien casser : il ne sert qu'à l'affichage. */
  const toggleProgCard = useCallback((idx, cardId) => {
    /* ── SÉQUENCE SYNCHRONE, PAS UN UPDATER À EFFETS DE BORD ──
       Réécrit à l'audit du 2026-09-03, sur le motif déjà éliminé dans
       `dilValidateAttackerPick` : « React ne garantit pas qu'un updater n'est
       appelé qu'une fois ».

       Cette fonction faisait tout DEPUIS l'intérieur d'un `setProgSelection` :
       démarrer un `setInterval`, écrire trois autres états, muter les mains
       via `programCards`, et — le plus grave — envoyer au relais l'intention
       `confirmProgrammation` d'un invité. Un updater rejoué aurait envoyé la
       programmation DEUX FOIS sur le réseau, et rappelé `programCards` sur des
       objets déjà mutés. Invisible aujourd'hui faute de StrictMode, comme la
       version précédente du même défaut.

       On lit donc l'état courant, on décide, on écrit — dans cet ordre, une
       seule fois. `progSelectionRef` est écrite ici en même temps que l'état :
       son miroir par effet arrive un commit trop tard pour deux clics dans le
       même tick. */
    const prev = progSelectionRef.current;
    const deselection = prev.some((s) => s.idx === idx);
    if (!deselection && prev.length >= 3) return;
    const next = deselection
      ? prev.filter((s) => s.idx !== idx)
      : [...prev, { idx, cardId }];

    progSelectionRef.current = next;
    setProgSelection(next);

    /* Tout changement de sélection annule le compte à rebours en cours.
       Bug d'origine, conservé : désélectionner UNE carte pendant le décompte
       ne doit retirer QUE celle-là, pas vider la sélection. */
    if (progCountdownTimerRef.current) {
      clearInterval(progCountdownTimerRef.current);
      progCountdownTimerRef.current = null;
      setProgCountdownTimer(null);
      setProgCountdown(null);
    }
    if (next.length !== 3) return;

    // Le compteur interne part de la MÊME valeur que l'affichage : à 5 ici et
    // 3 à l'écran, le premier tick remontait de 3 à 4.
    let countdown = 3;
    /* La sélection et le Titan sont FIGÉS au troisième clic (audit du 24/09,
       B5) : relus au dernier tic, ils pouvaient être ceux d'un invité dont
       l'hôte adoptait le brouillon pendant ces 3 s. Et le minuteur ne survit
       pas à « Nouvelle partie » (garde `partieRef`, comme tout minuteur de jeu). */
    const choix = next;
    const titanProgramme = selectedTitanId;
    const partie = partieRef.current;
    const timerId = setInterval(() => {
      if (partie !== partieRef.current) { clearInterval(timerId); return; }
      countdown -= 1;
      setProgCountdown(countdown);
      if (countdown > 0) return;

      clearInterval(timerId);
      progCountdownTimerRef.current = null;
      setProgCountdownTimer(null);
      setProgCountdown(null);

      progSelectionRef.current = [];
      setProgSelection([]);

      /* ── À DISTANCE, LE MOTEUR N'A QU'UN EXEMPLAIRE ──
         L'invité coche ses trois cartes chez lui (c'est un brouillon, cf.
         l'absence de `toggleProgCard` dans ACTIONS_DISTANTES), mais il ne
         PROGRAMME pas : `programCards` mute la main, et cette main-là
         n'existe pour de vrai que chez l'hôte. Il envoie donc la sélection au
         bout du compte à rebours, exactement comme le bouton « Confirmer »
         l'aurait fait, et attend l'instantané qui lui rendra ses trois cartes
         programmées. */
      if (distantInviteRef.current) {
        if (choix.length === 3) {
          sessionRef.current?.envoyerIntention("confirmProgrammation", [], { progSelection: choix })
            ?.catch(avisEnvoiRate("Ta programmation"));
        }
        return;
      }
      if (choix.length !== 3 || !titanProgramme) return;

      // Lecture via la ref toujours à jour (jamais `titanState.players` par
      // closure, cf. le même bug côté IA plus haut) — évite de muter un objet
      // Titan périmé si l'état a changé pendant le compte à rebours.
      const curPlayers = aiTitanStateRef.current.players;
      const ids = choix.map((c) => c.cardId);
      const res = programCards(titanProgramme, ids, curPlayers);
      if (res.ok) {
        setTitanState((p) => ({ ...p, players: [...p.players] }));
        setPhaseValidated((p) => ({ ...p, [titanProgramme]: true }));
        /* Le journal dit QUE le Titan a programmé, jamais QUOI (2026-09-14) : il
           est diffusé à toute la table et lu par l'hôte, et nommer les trois
           cartes rendait publique la Phase Programmation — même principe que
           le placement des Verts d'une IA, plus bas. */
        setActionLog((p) => [...p, `✅ T${titanProgramme} a programmé ses 3 cartes.`]);
        setProgErreur(null);
      } else {
        // Échec (ex. état déjà modifié entre-temps) : on informe le joueur au
        // lieu de valider silencieusement une phase non réellement programmée
        // — ce silence était la cause du gel de tour ("en attente des autres
        // Titans").
        setActionLog((p) => [...p, `⚠️ Programmation T${titanProgramme} échouée : ${res.reason}`]);
        setProgErreur(res.reason);
      }
    }, 1000);

    progCountdownTimerRef.current = timerId;
    setProgCountdown(3);
    setProgCountdownTimer(timerId);
  }, [selectedTitanId]);

  /* ── LE POINT D'ENTRÉE DE LA PROGRAMMATION À DISTANCE ──
     C'est l'unique chemin par lequel un invité programme : il coche ses trois
     cartes chez lui, puis envoie cette action avec sa sélection en contexte
     (cf. `toggleProgCard` et CONTEXTE_DISTANT).

     Elle faisait la moitié du travail du compte à rebours local : elle
     programmait bien les cartes, mais ne posait JAMAIS `phaseValidated`. La
     Phase Programmation attend que tout le monde ait validé pour s'enchaîner —
     un invité restait donc bloqué sur « attends les autres Titans » alors que
     c'est lui que la table attendait. Les deux chemins font désormais
     exactement la même chose, échec compris : `progErreur` est ce que
     l'interface affiche pour dire POURQUOI une programmation a été refusée. */
  const confirmProgrammation = useCallback(() => {
    if (!selectedTitanId) return;
    const ids = progSelection.map((s) => s.cardId);
    /* Le miroir, jamais la fermeture : cette fonction est appelée par
       l'exécuteur d'intentions, un rendu après que l'hôte a adopté le siège de
       l'invité. `titanState.players` capturé plus tôt décrirait l'état d'avant. */
    const curPlayers = aiTitanStateRef.current?.players || titanState.players;
    const res = programCards(selectedTitanId, ids, curPlayers);
    if (!res.ok) {
      setActionLog((prev) => [...prev, `⚠️ Programmation T${selectedTitanId} échouée : ${res.reason}`]);
      setProgErreur(res.reason);
      return;
    }
    // Jamais QUOI : cf. le compte à rebours de `toggleProgCard`, plus haut.
    setActionLog((prev) => [...prev, `✅ T${selectedTitanId} a programmé ses 3 cartes.`]);
    setProgErreur(null);
    setProgSelection([]);
    setPhaseValidated((prev) => ({ ...prev, [selectedTitanId]: true }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, progSelection, titanState.players]);

  const chooseVolDirection = useCallback(
    (direction) => {
      if (volDirection) return; // déjà résolu cette Manche
      // Le Vol n'existe qu'en Phase Repos, et n'a que deux sens (audit du 2026-09-23).
      if (phase !== "repos" || gameOver || (direction !== "gauche" && direction !== "droite")) return;
      // Le Vol pioche à l'aveugle : il ferme l'annulation au lieu d'en ouvrir
      // une (Nikola, 2026-09-24).
      setUndoStack([]);
      setVolDirection(direction);
      /* ON REND AVANT DE PIQUER (Nikola, 2026-08-28). Une carte empruntée à
         la Manche précédente retourne à son propriétaire d'abord ; le pool
         de vol d'un Titan qui en a joué une ne compte donc plus que ses deux
         cartes à lui. Voler d'abord permettrait de piquer la carte d'un
         tiers, qui n'appartient pas à la victime. */
      const logRendus = rendreCartesEmpruntees(titanState.players);
      const result = resolveVolPhaseRepos(mancheNumber, direction, titanState.ordreJeu, titanState.players, modeVolRepos);
      setActionLog((prev) => [...prev, `Vol Phase Repos — sens ${direction === "gauche" ? "⬅️ antihoraire" : "➡️ horaire"} choisi par le Détonateur (Titan ${titanState.detonateur}).`, ...logRendus, ...result.log]);
      setVolResume(result.resume || []);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));

      /* ── ON LAISSE LE TEMPS DE LIRE QUI A VOLÉ QUOI À QUI ──
         Nikola, 2026-08-28 : « pour la phase automatique, quand on se prend une
         carte en repos, fais ça plus lentement, 10 secondes, qu'on voie qui vole
         quoi à qui, car on doit le savoir ».

         Le vol se résolvait et la Manche suivante s'enchaînait dans le même
         souffle : le récapitulatif s'affichait puis disparaîssait avant qu'on
         ait lu la première ligne. C'est pourtant le seul événement de la Manche
         qui touche directement la main de chacun, et il n'y a rien à y décider
         — donc rien qui justifie de le presser.

         ── CE MINUTEUR N'EST PAS UNE ANIMATION ──
         Nikola, 2026-09-07 : « la phase de vol en chaîne de la fin de manche
         est bien plus longue que 5 secondes, je dois appuyer sur Annuler et là
         ça passe à la Manche suivante ».

         Il vivait dans `traceTimersRef`, le seau des traînées de vol — un seau
         que `arreterTrace()` VIDE ENTIÈREMENT, et qu'appellent aussi bien
         `animerTrajectoires` que le nettoyage d'une partie relancée et la
         restauration d'un instantané. Un seul de ces appels dans la fenêtre de
         cinq secondes et la Manche ne s'enchaînait plus JAMAIS : rien ne
         reposait `phaseValidated`, et le seul moyen d'en sortir était
         d'annuler, ce qui restaure la file depuis l'instantané.

         Ce minuteur-ci ne montre rien : il fait AVANCER la partie. Il a donc
         sa propre référence, que seule la fin de partie ou une nouvelle partie
         peut couper, et le bandeau porte un bouton pour ne pas l'attendre. */
      if (volTimerRef.current) clearTimeout(volTimerRef.current);
      volTimerRef.current = setTimeout(() => {
        volTimerRef.current = null;
        validerVolRef.current();
      }, DUREE_LECTURE_VOL_MS);
    },
    [volDirection, phase, gameOver, mancheNumber, titanState.ordreJeu, titanState.players, titanState.detonateur, modeVolRepos]
  );

  /* Clôt la lecture du récapitulatif et laisse la Manche suivante démarrer.
     Appelée par le minuteur ci-dessus, et par le bouton « Manche suivante »
     du bandeau pour qui a déjà tout lu. Idempotente : valider deux fois pose
     les mêmes drapeaux. */
  const validerVolMaintenant = useCallback(() => {
    if (volTimerRef.current) { clearTimeout(volTimerRef.current); volTimerRef.current = null; }
    setPhaseValidated((prev) => {
      const updated = { ...prev };
      (aiTitanStateRef.current?.ordreJeu || titanState.ordreJeu).forEach((id) => { updated[id] = true; });
      return updated;
    });
  }, [titanState.ordreJeu]);
  /* Le minuteur est posé AVANT que `validerVolMaintenant` n'existe (il est
     déclaré au-dessus) : la ref fait le pont, et garde toujours la dernière
     version du callback. */
  const validerVolRef = useRef(validerVolMaintenant);
  useEffect(() => { validerVolRef.current = validerVolMaintenant; }, [validerVolMaintenant]);
  useEffect(() => () => { if (volTimerRef.current) clearTimeout(volTimerRef.current); }, []);

  /* PHASE REPOS : LE SENS APPARTIENT AU DÉTONATEUR, PAS AU PORTEUR DE LA
     TABLETTE. Bug remonté par Nikola le 2026-08-17 : « si c'est une IA qui a
     le jeton Détonateur, ce n'est pas à moi de choisir le sens. » La bannière
     posait les deux boutons à l'écran quel que soit le propriétaire du jeton,
     et c'était donc systématiquement l'humain qui tranchait un choix qui ne
     lui revenait pas — un choix qui décide de qui vole qui pour toute la
     Manche.

     Une IA Détonateur tranche donc elle-même, ici, dès l'ouverture de la
     Phase. Le tirage est neutre (aucune des deux directions n'est
     structurellement meilleure : la chaîne est circulaire, chacun vole et se
     fait voler exactement une fois dans les deux sens), et il passe par le
     `pick` du domaine, donc par le même RNG que le reste de la partie. */
  useEffect(() => {
    if (distantInviteRef.current) return; // le sens du Vol est choisi chez l'hôte
    if (phase !== "repos" || volDirection || gameOver) return;
    // Même règle que ci-dessus : le Vol ne démarre pas par-dessus une
    // décision non tranchée, fût-ce une IA qui le déclenche.
    if (currentDecision || currentRepli || ecroulement) return;
    const detId = titanState.detonateur;
    if (titanModes[detId] !== "ia") return;
    const sens = pick(["gauche", "droite"]);
    setActionLog((prev) => [...prev, `🤖 Titan ${detId} (IA, Détonateur) choisit le sens de la chaîne.`]);
    chooseVolDirection(sens);
  }, [phase, volDirection, gameOver, titanState.detonateur, titanModes, chooseVolDirection,
      currentDecision, currentRepli, ecroulement]);

  const canPlayCard = useCallback(
    (cardId) => {
      if (phase !== "action" || !selectedTitan || selectedTitan.id !== activePlayerId) return false;
      if (!selectedTitan.programmed.includes(cardId)) return false;
      // Garde-fou (fix session) : hors effet d'Événement (non encore codé,
      // cf. stub EVENT_NAMES), un Titan ne peut jamais jouer 2 cartes
      // d'affilée dans le même round. advanceActionRound calcule déjà le
      // Titan suivant et passe waitingNextTitan à true dès qu'une carte est
      // jouée — mais rien n'empêchait jusqu'ici de cliquer une 2e carte du
      // même Titan tant que la confirmation "Titan suivant" n'était pas
      // cliquée (activePlayerId ne change qu'à ce moment-là). TODO : quand
      // "Toujours plus"/"Gourmandise" seront codés, ajouter l'exception ici.
      if (waitingNextTitan) return false;
      /* Point 1.6 du 2026-08-19 : « un Titan sorti du plateau peut continuer
         a jouer ses cartes hors-champ ». Il n'a plus ni Perimetre, ni axe, ni
         case d'ou charger : toutes ses cartes s'appliquaient dans le vide, et
         certaines le laissaient dans un etat dont il ne revenait pas.

         Il rentre normalement a l'ouverture de SON tour (ruling du
         2026-08-16), mais il peut aussi etre ejecte PENDANT son propre tour,
         par une reaction en chaine ou un repli offensif : c'est la que le
         trou s'ouvrait. La defausse, elle, reste possible — voir
         `canDiscardCard` juste apres, sans quoi la partie se bloquerait. */
      if (selectedTitan.horsPlateau) return false;
      /* UNE DÉCISION NON TRANCHÉE GÈLE AUSSI LES CARTES.
         Le clic sur le PLATEAU était déjà bloqué pendant un DIL/RAGE, un
         repli ou une répartition d'Amas (cf. `decisionEnAttente` dans
         BoardPanel) — mais rien n'empêchait de jouer une CARTE par-dessus.
         La carte se résolvait alors sur un plateau que la décision en cours
         allait encore modifier : le bloc perdu en DIL tombe sur la case
         d'impact d'AVANT, l'Amas se répartit après coup. Deux actions se
         marchaient dessus, et l'ordre du résultat dépendait de la vitesse
         de clic. Même garde-fou, mêmes sources que le plateau. */
      if (currentDecision || currentRepli || ecroulement) return false;
      if (fpmcAttackerId && (fpmcPendingIds.length > 0 || fpmcCurrent)) return false;
      if (ramassageEnCours && cardId !== "je_ne_partage_pas") return false;
      return true;
    },
    [phase, selectedTitan, activePlayerId, waitingNextTitan,
     currentDecision, currentRepli, ecroulement, fpmcAttackerId, fpmcPendingIds, fpmcCurrent, ramassageEnCours]
  );

  /* Defausser reste TOUJOURS possible quand jouer ne l'est pas pour cause de
     hors-plateau. Sans cette porte, un Titan ejecte pendant son tour ne
     pourrait ni jouer ni defausser : le round n'avancerait plus et la partie
     serait definitivement bloquee — exactement le genre de panneau sans issue
     rencontre trois fois le 18 aout. Toutes les autres conditions de
     `canPlayCard` restent valables. */
  const canDiscardCard = useCallback(
    (cardId) => {
      if (phase !== "action" || !selectedTitan || selectedTitan.id !== activePlayerId) return false;
      if (!selectedTitan.programmed.includes(cardId)) return false;
      if (waitingNextTitan) return false;
      if (cornerChoice) return false;
      if (currentDecision || currentRepli || ecroulement) return false;
      if (fpmcAttackerId && (fpmcPendingIds.length > 0 || fpmcCurrent)) return false;
      // Même la carte en cours : ses blocs sont déjà au Repaire.
      if (ramassageEnCours) return false;
      return true;
    },
    [phase, selectedTitan, activePlayerId, waitingNextTitan, cornerChoice,
     currentDecision, currentRepli, ecroulement, fpmcAttackerId, fpmcPendingIds, fpmcCurrent, ramassageEnCours]
  );

  const getPlayBlockReason = useCallback(
    (cardId) => {
      if (!selectedTitan) return "";
      if (phase !== "action") return `Phase : ${PHASE_LABELS[phase]}`;
      if (selectedTitan.id !== activePlayerId) return `Pas le tour de T${selectedTitan.id}`;
      if (!selectedTitan.programmed.includes(cardId)) return `${CARD_LABEL[cardId]} non programmée.`;
      if (waitingNextTitan) return `Confirme "Titan suivant" avant de continuer.`;
      if (cornerChoice) return `Choisis d'abord par où T${selectedTitan.id} rentre sur BIG CITY.`;
      if (selectedTitan.horsPlateau) return `T${selectedTitan.id} est hors de BIG CITY : il ne peut que défausser. Il rentrera à l'ouverture de son prochain tour.`;
      // Dire CE QU'ON ATTEND, pas seulement que c'est bloqué : sans ça la
      // carte devient grise sans raison visible au milieu d'une partie.
      if (currentDecision) return `Tranche d'abord le ${currentDecision.type} en attente.`;
      if (currentRepli) return `Termine d'abord le repli en attente.`;
      if (ecroulement) return `Termine d'abord la répartition de l'Amas.`;
      if (fpmcAttackerId && (fpmcPendingIds.length > 0 || fpmcCurrent)) return `Termine d'abord Faut Pas Me Chauffer.`;
      if (ramassageEnCours && cardId !== "je_ne_partage_pas") return `Termine d'abord le ramassage de Je Ne Partage Pas.`;
      return "";
    },
    [phase, selectedTitan, activePlayerId, waitingNextTitan, cornerChoice,
     currentDecision, currentRepli, ecroulement, fpmcAttackerId, fpmcPendingIds, fpmcCurrent, ramassageEnCours]
  );

  // Logique d'avancement de round (Phase Action) — commune à "jouer une
  // carte avec effet" (markCardPlayed) et "défausser sans jouer"
  // (discardCurrentCard, session) : dans les deux cas, 1 carte a été
  // désignée pour ce round et le tour doit passer au Titan suivant selon
  // les mêmes règles (1 carte/Titan/round, 3 rounds/Manche).
  /* Fermeture de la Phase Action, en un seul exemplaire.
     Elle était écrite en ligne dans `advanceActionRound`, au moment même où
     la 3e carte du dernier Titan était jouée — donc AVANT que ce Titan ait
     eu son tour complet. Elle est extraite ici pour pouvoir être déclenchée
     au VRAI bout du tour : tout de suite pour une IA, à « Titan suivant »
     pour un humain (cf. `passerAuTitanSuivant`). */
  const cloturerPhaseAction = useCallback(() => {
    const { ordreJeu } = aiTitanStateRef.current;
    /* ⚠️ PAS DE GARDE « IL RESTE DES CARTES » ICI, ET C'EST MESURÉ.
       Essayé le 2026-09-07, en cherchant le gel des parties IA : refuser de
       fermer la Phase tant qu'un Titan a une carte programmée. Reproduit au
       navigateur, ça gèle la Manche 1 — parce qu'une carte encore programmée
       n'est pas toujours JOUABLE (un Titan hors de BIG CITY, une carte sans
       aucune cible), et qu'on retenait alors la Phase pour quelqu'un qui ne
       jouerait jamais.

       Le rattrapage vit donc là où il peut choisir un Titan qui a réellement
       la main : `advanceActionRound`, qui recale son compteur sur le plateau
       avant de conclure, et le garde-fou de l'effet d'avancement de Phase, qui
       relance explicitement la boucle IA. Cette fonction-ci ne fait
       qu'exécuter la décision. */
    aiNextPlayerRef.current = null; // évite une relecture stale par finishAiTurn
    setWaitingNextTitan(false);
    setActivePlayerId(null);
    setPhaseValidated((prev) => {
      const updated = { ...prev };
      ordreJeu.forEach((id) => { updated[id] = true; });
      return updated;
    });
  }, []);

  /* ── LE COMPTEUR DE ROUNDS REPART À CHAQUE PHASE ACTION ──
     Il était remis à zéro à UN seul endroit : la branche « la phase suivante
     est Action » de l'effet d'avancement. C'est le chemin normal, et il ne
     couvre pas tous les autres — une reprise d'instantané, une partie
     relancée, une Phase Action ouverte par un chemin qui ne passe pas par
     cette branche. Un compteur qui survit d'une Manche à l'autre fait croire
     à « 3 rounds joués » dès le premier coup de la suivante, ce qui referme
     la Phase Action sur douze cartes encore programmées.

     C'est le symptôme reproduit avec la graine de Nikola le 2026-09-07. La
     cause est traitée à la source dans `advanceActionRound`, qui ne clôt plus
     sur le compteur mais sur le plateau ; ceci est la ceinture qui va avec les
     bretelles, et elle coûte une comparaison par changement de Phase. */
  useEffect(() => {
    if (phase !== "action") return;
    cardsPlayedCountRef.current = {};
  }, [phase, mancheNumber]);

  const advanceActionRound = useCallback((titanId) => {
    const { ordreJeu, players } = aiTitanStateRef.current;
    const prevCount = cardsPlayedCountRef.current;
    const newCount = { ...prevCount, [titanId]: (prevCount[titanId] || 0) + 1 };
    cardsPlayedCountRef.current = newCount;
    const roundsDone = newCount[titanId]; // tous les Titans jouent en sync, ce compteur = round actuel

    /* ⚠️ LA CARTE DE CET APPEL-CI EST DÉJÀ CONSOMMÉE, PAS ENCORE RETIRÉE.
       `markCardPlayed` appelle `setTitanState` — asynchrone — puis nous appelle
       SYNCHRONEMENT (et c'est voulu : `finishAiTurn` lit `aiNextPlayerRef` dès
       le retour). Le miroir montre donc encore la carte qui vient d'être
       jouée. */
    const resteDe = (id) => {
      const t = players.find((p) => p.id === id);
      const n = t?.programmed.length || 0;
      return id === titanId ? Math.max(0, n - 1) : n;
    };

    /* ── ON NE DONNE PAS LE TOUR À QUELQU'UN QUI N'A RIEN À JOUER ──
       Nikola, 2026-09-07 : « les parties IA plantent ». Second gel, trouvé
       après le premier grâce au journal de blocage ajouté le même jour :
       « ⏸️ Tour de Titan 4 (IA) sans carte programmée : il ne peut rien
       jouer. »

       La recherche du Titan suivant ne regardait que le COMPTEUR de rounds.
       Or un Titan qui n'avait que deux cartes en main n'en programme que deux
       (cf. `programCards`) : son compteur ne peut jamais atteindre 3, la
       boucle le redésigne indéfiniment, et il n'a plus rien à jouer. Le tour
       ne repart plus, et rien à l'écran ne le dit — c'est exactement l'état
       des deux rapports de partie envoyés, où le Titan bloquant a bien deux
       cartes programmées au lieu de trois.

       On exige donc les deux : du retard au compteur ET une carte à jouer.
       Un Titan à court de cartes est simplement sauté, ce qui est le
       comportement voulu — il a fini sa Manche avant les autres. */
    const curIdx = ordreJeu.indexOf(titanId);
    let next = null;
    for (let i = 1; i <= ordreJeu.length; i++) {
      const candidate = ordreJeu[(curIdx + i) % ordreJeu.length];
      if ((newCount[candidate] || 0) < roundsDone && resteDe(candidate) > 0) { next = candidate; break; }
    }
    /* Personne en retard n'a de carte, mais il en reste peut-être à quelqu'un
       qui a DÉJÀ joué son round : c'est le cas quand les compteurs ont dérivé.
       On le sert avant de conclure que la Phase est finie. */
    if (next === null && roundsDone < 3) {
      const avecCartes = ordreJeu.filter((id) => resteDe(id) > 0);
      if (avecCartes.length > 0) next = avecCartes[0];
    }

    if (next === null) {
      // Tous ont joué ce round
      if (roundsDone < 3) {
        // Même correction qu'à l'ouverture de la Phase Action : chaque
        // nouveau round repart du Détonateur en cours, et non du premier
        // de l'ordre de jeu figé.
        next = aiTitanStateRef.current.detonateur ?? ordreJeu[0];
      } else {
        /* 3 rounds terminés → fin de Phase Action.

           BUG REMONTÉ PLUSIEURS FOIS PAR NIKOLA : « j'ai sauté sur un débris,
           je l'ai ramassé automatiquement, mais je n'ai pas pu ramasser celui
           d'à côté — c'est passé directement au Titan suivant. »

           La phase se fermait ICI, dans la seconde où la dernière carte du 3e
           round était jouée : `activePlayerId` tombait à null et la
           Programmation de la Manche suivante s'ouvrait par-dessus. Le Titan
           qui venait de jouer perdait donc son passif Récupération — le seul
           des quatre à le perdre, et un Titan différent à chaque Manche
           puisque le round démarre sur le Détonateur, qui pivote. D'où un bug
           qui semblait aléatoire alors qu'il tombait à tous les coups.

           Une IA n'a pas de tour à finir à l'écran : elle se ferme tout de
           suite. Un humain garde la main jusqu'à « Titan suivant », qui
           appellera `cloturerPhaseAction` à sa place. */
        /* ── ON NE CLÔT PAS SUR UN COMPTEUR, ON CLÔT SUR LE PLATEAU ──
           Nikola, 2026-09-07 : « les parties en simulation IA plantent ».
           Reproduit avec sa graine : en Manche 2, le PREMIER coup joué
           déclenchait déjà « 3 rounds terminés », donc la fermeture de la
           Phase Action alors que les quatre Titans avaient encore trois
           cartes programmées.

           `roundsDone` est un COMPTEUR, et un compteur peut dériver — c'est
           déjà arrivé deux fois dans ce fichier (cf. le correctif de
           `markCardPlayed`, et le garde-fou de l'effet d'avancement de Phase).
           Le plateau, lui, ne ment pas : tant qu'il reste une carte
           programmée, la Phase Action n'est pas finie.

           On vérifie donc avant de fermer, et on recale le compteur sur la
           vérité plutôt que de laisser le garde-fou de l'effet le rattraper
           après coup — il n'a alors plus rien à rattraper, et c'est bien ce
           qu'on veut d'un filet : qu'il ne serve jamais. */
        const encoreProgrammees = ordreJeu.filter((id) => resteDe(id) > 0);
        if (encoreProgrammees.length > 0) {
          const recale = { ...cardsPlayedCountRef.current };
          ordreJeu.forEach((id) => { recale[id] = 3 - resteDe(id); });
          cardsPlayedCountRef.current = recale;
          next = encoreProgrammees[0];
        } else {
          aiNextPlayerRef.current = null;
          if (aiTitanModesRef.current[titanId] === "ia") {
            cloturerPhaseAction();
            return;
          }
        }
        // Humain : on retombe dans le flux normal ci-dessous, `next` restant
        // null — le tour s'affiche, Ramassage compris, et se termine au clic.
      }
    }

    aiNextPlayerRef.current = next;
    setWaitingNextTitan(true);
    // Bug remonté : le passif "Mouvement gratuit" n'était réinitialisé
    // nulle part après un round — une fois utilisé, il restait bloqué
    // pour le reste de la Manche entière au lieu d'être de nouveau
    // disponible à CHAQUE tour (livret : "ces deux règles s'appliquent à
    // chaque tour"). Le passif "Récupération" était déjà correctement
    // remis à false ici ; on aligne "move" sur le même cycle.
    setPassifUsed((prev) => ({ ...prev, [titanId]: { ...(prev[titanId] || {}), recup: false, move: false } }));
  }, [cloturerPhaseAction]);

  /* Fin du tour d'un Titan humain, en un seul exemplaire lui aussi. Le bouton
     « Titan suivant » existe à deux endroits du panneau (fin de tour, et à
     côté du Ramassage) et faisait à chaque fois son `setActivePlayerId` en
     ligne — sans jamais savoir refermer la Phase Action quand il n'y a plus
     de Titan suivant. */
  const avancerAuTitanSuivant = useCallback(() => {
    if (aiNextPlayerRef.current == null) { cloturerPhaseAction(); return; }
    setWaitingNextTitan(false);
    setActivePlayerId(aiNextPlayerRef.current);
    // Même raison que dans `finishAiTurn` : le suivant peut être soi-même.
    setAiTrigger((n) => n + 1);
  }, [cloturerPhaseAction]);
  useEffect(() => { passerAuTitanSuivantRef.current = avancerAuTitanSuivant; }, [avancerAuTitanSuivant]);

  /* Le geste du joueur, lui, a ses gardes (audit du 2026-09-23) : le bouton
     n'apparaît qu'une fois la carte jouée et tout tranché, mais un message
     forgé par l'invité actif passait la main en plein Dilemme ou en plein
     ramassage — et au premier tour, clôturait la Phase Action. */
  const passerAuTitanSuivant = useCallback(() => {
    if (!waitingNextTitan || ramassageEnCours) return;
    if (currentDecision || currentRepli || ecroulement || fatigueEnAttente || cornerChoice) return;
    if (fpmcAttackerId && (fpmcPendingIds.length > 0 || fpmcCurrent)) return;
    avancerAuTitanSuivant();
  }, [waitingNextTitan, ramassageEnCours, currentDecision, currentRepli, ecroulement, fatigueEnAttente,
    cornerChoice, fpmcAttackerId, fpmcPendingIds, fpmcCurrent, avancerAuTitanSuivant]);

  const markCardPlayed = useCallback(
    (titanId, cardId) => {
      /* Retour de Nikola (test à la table, 2026-08-18) : « il me restait
         une carte à jouer, mais la phase a quand même avancé au round
         suivant. » `advanceActionRound` incrémentait le compteur de rounds
         SANS JAMAIS vérifier que la carte était réellement encore
         programmée — un second appel accidentel avec le même `cardId`
         (déjà retiré de `programmed` par le premier) avançait donc quand
         même le compteur, désynchronisant « combien de cartes ce Titan a
         réellement jouées » de « combien de fois cette fonction a été
         appelée pour lui ». Le round ne doit avancer QUE si cet appel a
         réellement déplacé une carte. */
      /* On lit le MIROIR (`aiTitanStateRef`, tenu à jour après chaque rendu)
         et non la closure : la boucle IA enchaîne ses étapes sur des timers
         de 2 s et rappelle donc un `markCardPlayed` capturé six secondes
         plus tôt. Sur la closure, un `programmed` périmé aurait pu faire
         sauter l'avancement du round et bloquer le tour de l'IA. */
      const source = aiTitanStateRef.current?.players || titanState.players;
      const titanAvant = source.find((t) => t.id === titanId);
      const carteReellementProgrammee = Boolean(titanAvant?.programmed.includes(cardId));

      // 1. Déplacer la carte programmed → playedThisManche
      setTitanState((prev) => {
        const updatedPlayers = prev.players.map((t) => {
          if (t.id !== titanId) return t;
          const clone = { ...t, programmed: [...t.programmed], playedThisManche: [...t.playedThisManche] };
          const idx = clone.programmed.indexOf(cardId);
          if (idx !== -1) { clone.programmed.splice(idx, 1); clone.playedThisManche.push(cardId); }
          return clone;
        });
        return { ...prev, players: updatedPlayers };
      });

      /* 2. Avancer le tour dans le round (1 carte par Titan, 3 rounds),
         seulement si une carte a réellement été consommée cette fois-ci.

         ⚠️ CET APPEL DOIT RESTER SYNCHRONE. `advanceActionRound` écrit
         `aiNextPlayerRef.current`, et `finishAiTurn` la lit DÈS LE RETOUR de
         `markCardPlayed` pour donner la main au Titan suivant. L'avoir différé
         dans un effet, le 2026-08-19, faisait lire une ref encore vide : l'IA
         ne passait jamais au Titan suivant et la partie figeait sur la toute
         première action. Le report de l'avancement se fait donc à l'intérieur
         d'`advanceActionRound`, qui sait attendre sans casser cette chaîne. */
      if (carteReellementProgrammee) advanceActionRound(titanId);
    },
    [advanceActionRound, titanState.players]
  );

  // Défausse volontaire face cachée (session) : le Titan désigne 1 de ses
  // 3 cartes programmées et choisit de ne pas la jouer. Aucun effet, rien
  // révélé aux adversaires, mais le round avance exactement comme si la
  // carte avait été jouée — voir discardCardHidden pour le détail des
  // rulings (pool distinct de playedThisManche, éligible au Vol Repos).
  const discardCurrentCard = useCallback(
    (titanId, cardId) => {
      /* Les gardes de la défausse vivaient seulement sur le BOUTON (2026-09-16).
         Une intention distante ne passe pas par le bouton : un invité actif
         défaussait n'importe quelle carte, y compris celle d'un autre Titan —
         `titanId` arrive du réseau tel quel — et au milieu d'un ramassage. */
      if (titanId !== selectedTitanId || !canDiscardCard(cardId)) return;
      // Une défausse consomme la carte du round et fait tourner le tour :
      // c'est une action de jeu comme une autre, donc annulable.
      captureSnapshot();
      // Même garde-fou que markCardPlayed : le round n'avance que si la
      // carte visée est RÉELLEMENT encore programmée à cet instant. `logMsg`
      // était renseigné DANS le updater de setTitanState, donc encore vide
      // juste après l'appel (le updater ne s'exécute pas synchronement) —
      // le vérifier ici, avant tout `setState`, sur l'état déjà connu.
      const source = aiTitanStateRef.current?.players || titanState.players;
      const titanAvant = source.find((t) => t.id === titanId);
      const carteReellementProgrammee = Boolean(titanAvant?.programmed.includes(cardId));
      let logMsg = "";
      setTitanState((prev) => {
        const updatedPlayers = prev.players.map((t) => {
          if (t.id !== titanId) return t;
          const clone = { ...t, programmed: [...t.programmed], discardedHidden: [...(t.discardedHidden || [])] };
          const res = discardCardHidden(titanId, cardId, [clone]);
          if (res.ok) logMsg = res.log;
          return clone;
        });
        return { ...prev, players: updatedPlayers };
      });
      if (carteReellementProgrammee) {
        setActionLog((prevLog) => [...prevLog, logMsg || `Titan ${titanId} défausse une carte face cachée.`]);
        advanceActionRound(titanId);
      }
    },
    [advanceActionRound, captureSnapshot, titanState.players, selectedTitanId, canDiscardCard]
  );

  // ── TEA : calcul des cibles disponibles ──────────────────────────────────
  // Pour chaque direction (8), on avance case par case jusqu'au premier
  // obstacle valide dans la portée (3 + éventuellement +1 Adrénaline).
  // Obstacle valide = bâtiment avec blocs, bloc libre, socle libre au sol
  // (bâtiment vide sans bloc libre = couloir, on traverse), Titan adverse.
  // Bornée au stock réel, comme Boing Boing et le Mouvement gratuit : sans
  // cela le plateau surligne des cibles de charge que la résolution refuse.
  const teaMaxRange = PORTEE_TETE_EN_AVANT + Math.min(teaAdrenaline, selectedTitan?.adrenaline || 0);
  const teaTargets = useMemo(() => (selectedTitan && teaMode
    ? (() => {
        const targets = new Map(); // key → { dr, dc }
        const oR = rowIndex(selectedTitan.cell[0]);
        const oC = Number(selectedTitan.cell.slice(1));
        /* `indexerTitans` et pas une boucle à la main : elle EXCLUT les
           Titans hors de BIG CITY, dont la `cell` ne dit plus où ils sont
           mais par où ils rentreront. La boucle qui vivait ici les comptait
           comme des obstacles, si bien que l'écran refusait une charge que
           `resolveTeteEnAvant` — qui passe, lui, par `indexerTitans` —
           aurait acceptée. Un Titan fantôme bloquait une case vide. */
        const titansByCell2 = indexerTitans(titanState.players);
        const DIRS = [
          { dr: -1, dc: 0 }, { dr: -1, dc: 1 }, { dr: 0, dc: 1 }, { dr: 1, dc: 1 },
          { dr: 1, dc: 0 }, { dr: 1, dc: -1 }, { dr: 0, dc: -1 }, { dr: -1, dc: -1 },
        ];
        for (const { dr, dc } of DIRS) {
          // Bug trouvé au scan : seule une direction PORTANT UN OBSTACLE
          // devenait cliquable. Le domaine, lui, gère parfaitement la charge
          // à vide (resolveTeteEnAvant : « avance librement, aucun obstacle
          // rencontré ») et l'IA pouvait jouer ce coup — le joueur humain
          // non. Sur un plateau bien détruit, la carte devenait injouable
          // dans plusieurs directions sans que rien ne l'explique à l'écran.
          // On mémorise donc la dernière case libre atteinte, et on la
          // propose en cible si aucun obstacle ne s'est présenté.
          let derniereCaseLibre = null;
          let obstacleTrouve = false;
          for (let step = 1; step <= teaMaxRange; step++) {
            const nr = oR + dr * step;
            const nc = oC + dc * step;
            if (nr < 0 || nr > 8 || nc < 1 || nc > 9) break;
            const key = rowFromIndex(nr) + nc;
            const cellData = state.board[key];
            const stack = looseBlocks[key] || [];
            const hasBuilding = cellData && cellData.blocks.length > 0;
            const hasLooseBlock = stack.length > 0; // bloc libre OU socle libre
            const occupantId = titansByCell2[key];
            const isAdverseOccupant = occupantId && occupantId !== selectedTitan.id;
            if (hasBuilding || hasLooseBlock || isAdverseOccupant) {
              targets.set(key, { dr, dc });
              obstacleTrouve = true;
              break;
            }
            // case vide (bâtiment vide, route libre) → on continue
            derniereCaseLibre = key;
          }
          if (!obstacleTrouve && derniereCaseLibre) targets.set(derniereCaseLibre, { dr, dc });
        }
        return targets;
      })()
    : new Map()),
    // Mémoïsé pour la même raison que `bbReachable`, `recupPool` et
    // `jnpPool` : cette Map servait de dépendance à `jouerTeteEnAvant` tout
    // en étant reconstruite à chaque rendu, ce qui annulait la mémoïsation.
    [selectedTitan, teaMode, teaMaxRange, state.board, looseBlocks, titanState.players]
  );

  // Un seul mode de carte ouvert a la fois. Chacun affichait son bandeau
  // d'instructions, et rien n'empechait Tete en Avant, Boing Boing, Je Ne
  // Partage Pas et Graouhhh d'etre tous ouverts en meme temps : le joueur
  // se retrouvait avec quatre consignes contradictoires empilees.
  // Les modes sont de l'interface : aucun ne touche au compteur de Je Ne
  // Partage Pas, qui est de l'état de partie (cf. `ramassageEnCours`).
  const closeAllCardModes = useCallback(() => {
    setTeaMode(false);
    setGraouMode(false);
    setBbMode(false); setBbPath([]); setBbSurvol([]);
    setJnpMode(false);
  }, []);

  const toggleGraouMode = useCallback(() => {
    setGraouMode((m) => { const next = !m; if (next) { setTeaMode(false); setBbMode(false); setBbPath([]); setBbSurvol([]); setJnpMode(false); } return next; });
  }, []);

  const toggleTeaMode = useCallback(() => {
    setTeaMode((m) => { const next = !m; if (next) { setGraouMode(false); setBbMode(false); setBbPath([]); setBbSurvol([]); setJnpMode(false); } return next; });
  }, []);

  const jouerTeteEnAvant = useCallback((targetKey) => {
    if (!selectedTitanId || !canPlayCard("tete_en_avant")) return;
    const dir = teaTargets.get(targetKey);
    if (!dir) return;
    captureSnapshot();
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    const actuallyUseAdrenaline = Math.min(teaAdrenaline, attacker.adrenaline || 0);
    const replis = [];
    const trajectoires = [];
    const result = resolveTeteEnAvant(selectedTitanId, dir.dr, dir.dc, actuallyUseAdrenaline, {
      board: state.board, titans: titanState.players, looseBlocks, replis, trajectoires,
    });
    if (actuallyUseAdrenaline) attacker.adrenaline -= actuallyUseAdrenaline;
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    enqueueReplis(replis);
    animerTrajectoires(trajectoires);
    markCardPlayed(selectedTitanId, "tete_en_avant");
    setTeaMode(false);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, teaTargets, teaAdrenaline, state.board, titanState.players, looseBlocks, enqueueDecisions, enqueueReplis, animerTrajectoires, canPlayCard, markCardPlayed, captureSnapshot]);

  // `compensateFatiguedRounds` vivait ici. Il rattrapait le compteur de
  // rounds quand la Fatigue volait une carte ENCORE PROGRAMMÉE, laissant sa
  // victime avec moins de 3 cartes à jouer dans la Manche en cours.
  //
  // Ce rattrapage n'a plus lieu d'être : ruling re-précisé par Nikola le
  // 2026-08-15, la Fatigue ne pioche QUE dans la main, jamais dans les
  // cartes de la Manche en cours (cf. getNonPlayedPool). La cause étant
  // supprimée, le pansement l'est aussi.

  const jouerGraouhhh = useCallback(() => {
    /* ── CETTE CARTE APPARTIENT-ELLE ENCORE À LA PARTIE EN COURS ? ──
       `BoardPanel` s'accorde 3 s d'animation avant d'appeler cette fonction.
       Pendant ce délai le joueur peut lancer une nouvelle partie : le
       minuteur invoquerait alors CE callback-ci, dont la closure décrit
       l'ancien plateau, sur les Titans bien réels du nouveau. `partieId` est
       la partie du rendu qui a créé ce callback ; `partieRef` dit où on en
       est vraiment (cf. `regenerate`). */
    if (partieId !== partieRef.current) return;
    if (!selectedTitanId || !canPlayCard("graouhhh")) return;
    captureSnapshot();
    // Titan par Titan (cf. advanceGraouhhhLoop) : seul le scan de l'axe se
    // fait d'un bloc, aucun Titan n'est déplacé avant que sa propre décision
    // DIL soit tranchée.
    // `looseBlocks` : c'est ce qui pose le relevé de début de carte (audit du 2026-09-23).
    const scan = scanGraouhhhAxis(selectedTitanId, { board: state.board, titans: titanState.players, looseBlocks }, direction.dr, direction.dc);
    setActionLog((prev) => [...prev, ...scan.log]);
    if (scan.touched.length === 0) {
      setActionLog((prev) => [...prev, "Aucun Titan touché sur cet axe."]);
    } else {
      advanceGraouhhhLoop({
        titanId: selectedTitanId, dr: direction.dr, dc: direction.dc,
        reculDistance: scan.reculDistance, mancheNumber,
        remaining: scan.touched.slice().reverse().map((t) => t.id),
        bagarreIds: [], touchedCount: scan.touched.length,
      });
    }
    markCardPlayed(selectedTitanId, "graouhhh");
    setGraouMode(false);
  }, [partieId, selectedTitanId, direction, state.board, titanState.players, looseBlocks, advanceGraouhhhLoop, mancheNumber, canPlayCard, markCardPlayed, captureSnapshot]);

  /* PORTÉE AFFICHÉE = PORTÉE RÉELLE.
     Deux écarts corrigés ici, tous deux remontés par Nikola le 2026-08-17.

     1) L'interface dessinait un simple carré de Chebyshev autour du Titan,
        alors que le livret compte les éléments contigus pour 1 seule case.
        Le plateau proposait donc des cases hors de portée et en cachait
        d'autres, réellement atteignables derrière un mur. Le calcul passe
        sur `getBoingBoingReach`, la MÊME fonction que le résolveur : ce que
        le joueur voit ne peut plus diverger de ce que le moteur accepte.

     2) La portée ajoutait `bbAdrenaline` sans jamais la borner au stock
        réel du Titan. Un compteur laissé à 2 par un tour précédent gonflait
        le rayon affiché d'un Titan qui n'avait plus une seule Adrénaline —
        « j'ai beaucoup trop de cases en choix ». La résolution, elle,
        bornait déjà (`Math.min`) : l'affichage promettait un saut que le
        moteur refusait. Même borne des deux côtés désormais. */
  const bbAdrenalineDispo = Math.min(bbAdrenaline, selectedTitan?.adrenaline || 0);
  const bbMaxRange = PORTEE_BOING_BOING + bbAdrenalineDispo;
  /* Mémoïsés, comme `recupPool` et `jnpPool` plus bas. Ces collections
     étaient reconstruites à CHAQUE rendu — un `new Set` neuf à chaque fois,
     donc une identité neuve — et servent de dépendance à des `useCallback` :
     toute la mémoïsation en aval tombait, à chaque frappe, à chaque survol.
     Le calcul lui-même n'est pas gratuit : `getBoingBoingReach` parcourt le
     plateau. */
  const bbReach = useMemo(
    () => (selectedTitan
      ? getBoingBoingReach(selectedTitan.cell, bbMaxRange, {
          board: state.board, looseBlocks, titans: titanState.players,
        })
      : new Map()),
    [selectedTitan, bbMaxRange, state.board, looseBlocks, titanState.players]
  );
  const bbReachable = useMemo(() => new Set(bbReach.keys()), [bbReach]);

  const toggleBbMode = useCallback(() => {
    setBbMode((m) => { const next = !m; if (next) { setTeaMode(false); setGraouMode(false); setJnpMode(false); } return next; });
    setBbPath([]); setBbSurvol([]);
  }, []);

  /* ── CHEMIN DE BOING BOING, CASE PAR CASE ──
     Demande de Nikola (test à la table, 2026-08-18) : « je dois indiquer
     par plusieurs clics sur les différentes cases mon chemin, pour que ce
     soit clair pour tout le monde. » Le clic unique sur la destination
     laissait le moteur choisir SA trajectoire (la plus courte) sans jamais
     la montrer ; le joueur trace maintenant la sienne, case adjacente par
     case adjacente, avec la même règle de coût que le calcul automatique
     (`getBoingBoingReach`) — le moteur de résolution, lui, ne regarde
     toujours que la dernière case (`bbDest`), inchangé. */
  /* BUDGET DU SAUT (refonte du 2026-08-19).

     Chaque case OU L'ON SE POSE coute 1, quoi qu'elle porte. Les obstacles
     survoles en chemin sont gratuits : ils n'entrent pas dans `bbPath`, ils
     vivent dans `bbSurvol` et ne servent qu'a dessiner la trajectoire.

     Avant, un obstacle coutait 0 ET pouvait recevoir l'atterrissage : en
     cliquant de debris en debris on traversait le plateau sans entamer son
     budget. Nikola : « j'ai un bug qui m'a permis de sauter une 4e fois sur
     un debris ou socle ». */
  const bbBudgetUsed = bbPath.length;

  /* Ce qui est cliquable depuis la pointe du trajet, et par quel chemin.

     Dans chaque direction on remonte l'axe et on propose TOUTE case ou l'on
     peut se poser, en franchissant gratuitement ce qui est sur le passage :
     la case du debris juste devant, et aussi celle qui le suit. C'est la
     demande de Nikola du 2026-08-19 : « je peux sauter par-dessus un debris ou
     un socle comme un batiment, ou bien sauter dessus volontairement ». Le
     choix lui revient, le moteur ne tranche pas a sa place.

     Un batiment encore debout reste la seule case ou l'on ne se pose jamais :
     il est franchi, jamais vise.

     `bbNextRoutes` retient pour chaque proposition les cases SURVOLEES, afin
     que la trajectoire se voie a l'ecran sans compter dans le budget. */
  const bbNextRoutes = useMemo(() => {
    const routes = new Map();
    if (!selectedTitan || !bbMode) return routes;
    if (bbBudgetUsed >= bbMaxRange) return routes; // budget epuise
    const tipKey = bbPath.length > 0 ? bbPath[bbPath.length - 1] : selectedTitan.cell;
    const tr = rowIndex(tipKey[0]);
    const tc = Number(tipKey.slice(1));

    const estBatimentDebout = (key) => Boolean(state.board[key]?.blocks?.length > 0);
    const estObstacle = (key) =>
      estBatimentDebout(key)
      || (looseBlocks[key] || []).length > 0
      || titanState.players.some((t) => !t.horsPlateau && t.cell === key);

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        let nr = tr + dr;
        let nc = tc + dc;
        const survoles = [];
        while (nr >= 0 && nr <= 8 && nc >= 1 && nc <= 9) {
          const key = rowFromIndex(nr) + nc;
          if (!estBatimentDebout(key) && !routes.has(key)) {
            routes.set(key, survoles.slice());
          }
          // On ne poursuit au-dela que tant qu'on longe des obstacles.
          if (!estObstacle(key)) break;
          survoles.push(key);
          nr += dr;
          nc += dc;
        }
      }
    }
    return routes;
  }, [selectedTitan, bbMode, bbPath, bbBudgetUsed, bbMaxRange, state.board, looseBlocks, titanState.players]);

  const bbNextClickable = useMemo(() => new Set(bbNextRoutes.keys()), [bbNextRoutes]);

  const bbPathClick = useCallback((key) => {
    if (!selectedTitan) return;
    // Recliquer une case deja posee y revient : tout ce qui suit est annule.
    const idx = bbPath.indexOf(key);
    if (idx !== -1) {
      setBbPath(bbPath.slice(0, idx + 1));
      setBbSurvol((prev) => prev.slice(0, idx + 1));
      return;
    }
    const survoles = bbNextRoutes.get(key);
    if (!survoles) return; // hors de portee, batiment, ou budget epuise
    setBbPath((prev) => [...prev, key]);
    setBbSurvol((prev) => [...prev, survoles]);
  }, [selectedTitan, bbPath, bbNextRoutes]);

  const bbUndoLastCell = useCallback(() => {
    setBbPath((prev) => prev.slice(0, -1));
    setBbSurvol((prev) => prev.slice(0, -1));
  }, []);

  // Un bâtiment encore debout se traverse en vol (saute-mouton) mais ne se
  // reçoit jamais comme atterrissage — la pointe du chemin doit continuer.
  const bbDestIsBuilding = Boolean(bbDest && state.board[bbDest]?.blocks?.length > 0);

  const jouerBoingBoing = useCallback(() => {
    if (!selectedTitanId || !bbDest || bbDestIsBuilding || !canPlayCard("boing_boing")) return;
    captureSnapshot();
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    const actuallyUseAdrenaline = Math.min(bbAdrenaline, attacker.adrenaline || 0);
    const replis = [];
    const trajectoires = [];
    const result = resolveBoingBoing(selectedTitanId, bbDest, actuallyUseAdrenaline, mancheNumber, {
      board: state.board, titans: titanState.players, looseBlocks, replis, trajectoires,
      /* Le chemin CLIQUÉ, pour que la percussion parte dans l'axe du DERNIER
         bond et non du point de départ (bug remonté le 2026-09-07 : un saut
         coudé envoyait la cible sur un axe que le joueur n'avait pas tracé).
         Voir `resolveBoingBoing`, qui retombe sur la case de départ quand ce
         champ manque — c'est ce que font l'IA et le simulateur. */
      chemin: bbPath,
    });
    if (result.applied && actuallyUseAdrenaline) attacker.adrenaline -= actuallyUseAdrenaline;
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    enqueueReplis(replis);
    animerTrajectoires(trajectoires);
    /* Atterrissage sur un Amas : la carte est jouée, mais la répartition des
       débris revient au joueur, case par case (ruling Nikola du 2026-08-16).

       ⚠️ Sauf s'il n'y a nulle part où les poser. `getEcroulementCells`
       écarte toute case portant un bâtiment DEBOUT : un Amas cerné de huit
       bâtiments intacts (les débris ayant été projetés de loin) ne renvoie
       aucune case éligible — vérifié par script, et un coin de plateau suffit
       à n'avoir que trois voisines. Le panneau s'ouvrait quand même : aucune
       case cliquable, « Valider » masqué tant que tous les débris ne sont pas
       placés, « Annuler le dernier » masqué tant qu'aucun ne l'est. Aucune
       sortie, partie définitivement bloquée.

       Même principe que pour un DIL/RAGE impossible (ruling Nikola du
       14/08) : ce qui ne peut pas se résoudre est noté au journal et ne
       produit aucun effet. Les débris restent sur l'Amas. */
    if (result.ecroulement) {
      const cellesDispo = getEcroulementCells(
        result.ecroulement.cellKey,
        { board: state.board, looseBlocks },
        []
      ).eligibles;
      if (cellesDispo.length === 0) {
        setActionLog((prev) => [...prev,
          `Amas de ${result.ecroulement.cellKey} : aucune case voisine ne peut recevoir de débris ` +
          `(bâtiments encore debout tout autour) — l'Amas ne se répartit pas, les débris restent en place.`]);
      } else {
        setEcroulement({ ...result.ecroulement, choix: [] });
      }
    }
    if (result.fatigues?.length) enqueueFatigues(result.fatigues);
    if (result.applied) { markCardPlayed(selectedTitanId, "boing_boing"); setBbMode(false); setBbPath([]); setBbSurvol([]); }
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
  }, [selectedTitanId, bbDest, bbPath, bbDestIsBuilding, bbAdrenaline, state.board, titanState.players, looseBlocks, enqueueDecisions, enqueueReplis, enqueueFatigues, animerTrajectoires, mancheNumber, canPlayCard, markCardPlayed, captureSnapshot]);

  // Le Mouvement gratuit vaut 2 cases, +1 par Adrénaline dépensée, MOINS ce
  // qu'a coûté une éventuelle rentrée sur le plateau ce tour-ci. C'est ce
  // qui peut forcer un Titan éjecté à dépenser une Adrénaline pour retrouver
  // de la marge (ruling Nikola du 2026-08-16).
  const coutRentreeCeTour = coutRentree && coutRentree.titanId === selectedTitanId ? coutRentree.cout : 0;
  // Même correction que sur Boing Boing : `moveAdrenaline` est un compteur
  // d'interface, il n'était borné au stock réel du Titan qu'au moment de la
  // résolution. Un compteur resté à 2 d'un tour précédent faisait surligner
  // un rayon de 4 cases à un Titan sans une seule Adrénaline — le plateau
  // proposait des cases que `jouerMouvementGratuit` refusait ensuite.
  const moveAdrenalineDispo = Math.min(moveAdrenaline, selectedTitan?.adrenaline || 0);
  const moveMaxRange = Math.max(0, 2 + moveAdrenalineDispo - coutRentreeCeTour);

  // ── RÉPARTITION DES DÉBRIS D'UN AMAS ÉCROULÉ ──
  // Cases proposées pour le PROCHAIN débris. Elles changent à chaque pose :
  // on ne peut empiler que lorsqu'il ne reste plus de case vierge.
  const ecroulementCells = ecroulement
    ? getEcroulementCells(ecroulement.cellKey, { board: state.board, looseBlocks }, ecroulement.choix).eligibles
    : [];
  /* Un repli n'est proposé que s'il y a réellement un choix à faire.
     Ceux d'une IA sont joués ICI, tout de suite, par `choisirRepliIA` :
     c'est un vrai coup, pas une formalité — poser un débris dans son propre
     Périmètre le rend ramassable au tour suivant, le poser dans celui d'un
     adversaire le lui offre. L'IA simule donc chaque case et lit le vrai
     barème, comme pour un déplacement ou une carte, et sa FORCE joue de la
     même façon : l'Expert prend la meilleure case, le Novice tire parmi ses
     trois premières. */


  /* Applique le choix du joueur puis dépile.

     Le DÉPLACEMENT lui-même n'est plus écrit ici : c'est une règle de jeu,
     elle vit dans le domaine (`appliquerReplElement`), et l'IA comme le
     simulateur passent par la même. La copie qui vivait à cet endroit ne
     savait pas pousser le Titan occupant — depuis le ruling du 2026-08-18,
     viser la case d'un adversaire est justement le coup qui rapporte une
     case de piste ADN Bagarre. Le contrôleur ne fait donc plus que ce qui
     lui revient : figer l'état pour l'annulation, appeler la règle,
     journaliser, et redessiner. */
  const choisirRepli = useCallback((cellKey) => {
    const cur = repliQueue[0];
    if (!cur || !cur.cases.includes(cellKey)) return;
    captureSnapshot();
    if (cellKey !== cur.defaut) {
      /* ── UN REPLI PEUT POUSSER, DONC IL PEUT SE VOIR ET REBONDIR ──
         Ces deux collecteurs manquaient. Tant qu'un repli ne faisait que
         DÉPOSER un élément, ça ne se remarquait pas ; depuis qu'il pousse le
         Titan qui occupe la case visée (cf. `appliquerReplElement`, ruling
         « même un rebond pousse un Titan », 2026-09-01), leur absence coûtait
         deux choses à chaque fois :

         · `trajectoires` — le Titan chassé changeait de case sans traînée. Il
           se téléportait, à l'écran, alors que c'est exactement le geste que
           le joueur vient de payer et qu'il veut voir.
         · `replis` — si ce Titan poussé s'arrête à son tour faute de puissance,
           sa propre demande de repli tombait dans le vide. La chaîne s'arrêtait
           en silence, un cran trop tôt. */
      const replisEnChaine = [];
      const trajectoires = [];
      const res = appliquerReplElement(cur, cellKey, {
        board: aiStateRef.current.board,
        titans: aiTitanStateRef.current.players,
        looseBlocks: aiLooseBlocksRef.current,
        replis: replisEnChaine,
        trajectoires,
      });
      const quoi = cur.titanId != null ? `Titan ${cur.titanId}` : "Élément";
      setActionLog((prev) => [
        ...prev,
        ...(res.applied
          ? [`${quoi} arrêté faute de puissance → posé en ${cellKey} au lieu de ${cur.defaut} (choix de l'initiateur).`]
          : []),
        ...res.log,
      ]);
      enqueueReplis(replisEnChaine);
      animerTrajectoires(trajectoires);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      setLooseBlocks((prev) => ({ ...prev }));
      setState((prev) => ({ ...prev }));
    }
    setRepliQueue((prev) => prev.slice(1));
    /* Ce repli interrompait une résolution de Graouhhh : on la relance là où
       elle s'est arrêtée, sur un plateau où la case vient d'être libérée. */
    if (cur.graouhhh) advanceGraouhhhLoop(cur.graouhhh);
  }, [repliQueue, captureSnapshot, advanceGraouhhhLoop, enqueueReplis, animerTrajectoires]);

  /* ── UN DÉBRIS PLACÉ EST UN DÉBRIS TOMBÉ ───────────────────
     Nikola, 2026-08-28 : « quand il y a plusieurs débris ou Titans qui doivent
     être bougés en même temps sur des cases différentes, il faut qu'on
     sélectionne l'ordre et que le jeu adapte son plateau à chaque déplacement ;
     ça permet de faire des tas de débris différemment que si c'est totalement
     automatique en 1 seconde. Là on clique juste pour l'ordre et ça s'applique
     cas par cas. »

     Le résolveur appliquait DÉJÀ les débris un par un, chacun faisant son effet
     avant le suivant — mais le joueur, lui, désignait les N cases d'affilée
     avant de valider, sur un plateau figé. Il ne pouvait donc pas voir qu'un
     débris venait d'occuper une case, ni décider d'empiler sur ce qu'il venait
     de poser. Le séquencement était dans le moteur et pas dans la main.

     Chaque clic RÉSOUT maintenant son débris : le plateau bouge, les cases
     éligibles se recalculent, et le débris suivant se choisit sur l'état réel.
     C'est aussi ce qui donne le choix de l'ordre — celui des clics.

     « Annuler la dernière case » disparaît : on ne défait plus un choix qui a
     déjà produit ses effets (un débris posé sur un Titan l'a déplacé, et peut
     avoir fait basculer une tour). L'annulation générale du tour, elle, reste :
     l'instantané est pris au premier débris. */
  /* Sortie de secours : si un Amas cerné de bâtiments debout n'offre aucune
     case où poser un débris, ce bouton reste la seule chose à l'écran qui
     permette de continuer la partie. Il ne s'affiche jamais tant qu'il existe
     une case éligible. */
  const ecroulementAbandonner = useCallback(() => {
    /* Seulement quand il n'y a vraiment plus où poser (audit du 2026-09-23) :
       appelé après un premier débris, par un message forgé, il faisait
       disparaître du jeu les débris pas encore posés. */
    if (!ecroulement) return;
    if (getEcroulementCells(ecroulement.cellKey, { board: state.board, looseBlocks }, ecroulement.choix).eligibles.length > 0) return;
    setActionLog((prev) => [...prev,
      `Amas de ${ecroulement?.cellKey} : aucune case voisine ne peut recevoir de débris — répartition abandonnée, ils restent en place.`]);
    setEcroulement(null);
  }, [ecroulement, state.board, looseBlocks]);

  const ecroulementPoserDebris = useCallback((cellKey) => {
    const cur = ecroulement;
    if (!cur || cur.choix.length >= cur.blocs.length) return;
    const rang = cur.choix.length;
    if (rang === 0) captureSnapshot();

    const replis = [];
    const trajectoires = [];
    const result = resolveEcroulementAmas(
      activePlayerId,
      { cellKey: cur.cellKey, blocs: [cur.blocs[rang]], energie: cur.energie },
      [cellKey],
      { board: state.board, titans: titanState.players, looseBlocks, replis, trajectoires },
      // L'Amas ne quitte sa case qu'au premier débris.
      { retirerAmas: rang === 0 }
    );
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueReplis(replis);
    animerTrajectoires(trajectoires);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));

    const choix = [...cur.choix, cellKey];
    // Dernier débris posé : la répartition est close, le tour reprend.
    setEcroulement(choix.length >= cur.blocs.length ? null : { ...cur, choix });
  }, [ecroulement, activePlayerId, state.board, titanState.players, looseBlocks, enqueueReplis, animerTrajectoires, captureSnapshot]);
  const { reachable: moveReachable, classic: moveClassic, teleport: moveTeleport } = selectedTitan
    ? getMovementReachable(selectedTitan.cell, moveMaxRange, state.board, titansByCell, looseBlocks)
    : { reachable: new Set(), classic: new Set(), teleport: new Set() };

  const toggleMoveMode = useCallback(() => {
    if (!moveMode && !canUseMovePassif(selectedTitanId)) return;
    // Bug remonté par Nikola : une carte restée sélectionnée (teaMode/bbMode/
    // jnpMode) avant de rouvrir le Mouvement gratuit ("← Me déplacer
    // finalement") empêchait tout clic sur le plateau — clicCase teste ces
    // modes AVANT moveMode et retourne sans jamais l'atteindre. Les quatre
    // autres toggles (Graouhhh/Tête en Avant/Boing Boing/Je Ne Partage Pas)
    // se désactivent déjà mutuellement ; moveMode était le seul absent de
    // cette symétrie.
    setMoveMode((m) => {
      const next = !m;
      if (next) closeAllCardModes();
      return next;
    });
  }, [moveMode, canUseMovePassif, selectedTitanId, closeAllCardModes]);

  const jouerMouvementGratuit = useCallback(
    (destKey) => {
      if (!selectedTitanId || !moveReachable.has(destKey) || !canUseMovePassif(selectedTitanId)) return;

      /* SECOND DECLENCHEUR DE LA RENTREE (cf. assurerRentree). Si le Titan est
         encore hors de BIG CITY au moment ou il tente son premier geste, c'est
         que l'effet d'ouverture de tour ne s'est pas joue. On le fait rentrer
         ici, et on S'ARRETE : la rentree a coute un deplacement, la portee
         restante et les cases atteignables viennent de changer, et destKey a
         ete calculee depuis sa case de RENTREE, pas depuis sa case reelle. Le
         joueur reclique, sur un plateau qui dit enfin la verite. */
      const rentree = assurerRentree(selectedTitanId);
      if (rentree.rentre || rentree.needsChoice) return;

      captureSnapshot();
      const attackerSnap = titanState.players.find((t) => t.id === selectedTitanId);
      if (!attackerSnap) return;
      const actuallyUseAdrenaline = Math.min(moveAdrenaline, attackerSnap.adrenaline || 0);
      const depart = attackerSnap.cell;
      const path = getMovePath(depart, destKey, moveMaxRange, state.board, titansByCell, looseBlocks);
      setMoveMode(false);

      /* ── PLUS DE MARCHE CASE PAR CASE ───────────────────────
         Nikola, 2026-08-29 : « plus besoin de prendre le temps de bien montrer
         l'icône du Titan sur quelle case il va en 2D, l'animation du chemin
         coloré aide à ça » — et, dans le même souffle, « j'ai l'impression que
         l'animation de chemin est moins fluide » depuis qu'elle coexiste avec
         le jeton qui avance.

         Les deux remarques n'en font qu'une : on montrait la même chose deux
         fois, à deux rythmes différents. Le jeton avançait d'une case par
         seconde pendant que la traînée s'égrainait à 110 ms — l'œil suivait
         l'un OU l'autre, jamais les deux, et le décalage se lisait comme une
         saccade. Un déplacement de trois cases immobilisait le tour trois
         secondes pour une information que la traînée donne mieux.

         Le Titan arrive donc d'un coup, exactement comme un débris projeté, et
         c'est le chemin qui raconte le trajet. Une seule mise en scène, un seul
         rythme.

         CE QUE ÇA RÈGLE AUSSI : la résolution était différée de plusieurs
         secondes derrière une cascade de `setTimeout`, et pendant ce temps
         « Annuler » agissait sur un état que l'animation allait écraser. Elle
         est maintenant synchrone — l'instantané pris juste au-dessus décrit
         exactement l'état d'avant, et l'annulation redevient fiable. */
      const livePlayers = aiTitanStateRef.current.players;
      const result = resolveFreeMovement(selectedTitanId, destKey, { titans: livePlayers, board: state.board, looseBlocks });
      if (actuallyUseAdrenaline) {
        const a = livePlayers.find((t) => t.id === selectedTitanId);
        if (a) a.adrenaline -= actuallyUseAdrenaline;
      }
      setActionLog((prev) => [...prev, ...result.log]);
      setPassifUsed((prev) => ({ ...prev, [selectedTitanId]: { ...(prev[selectedTitanId] || {}), move: true } }));
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));

      /* Le chemin s'égraine derrière lui, comme la traînée d'un débris. */
      animerTrajectoires([{ cases: path, arrivee: destKey, titanId: selectedTitanId }]);

      /* ── LES DEUX BOUCHES DE LA FAILLE, PAS TOUTES ──────────
         Nikola, 2026-08-29 : « quand j'ai dit "mets en surbrillance les
         téléporteurs", je parle de ceux que tu prends — entrée, sortie ».

         La version précédente allumait TOUS les téléporteurs actifs dès qu'un
         saut était détecté : sur un plateau qui en compte quatre, ça montrait
         deux failles que le Titan n'a jamais approchées, et noyait justement
         l'information cherchée. On identifie donc la paire réellement
         empruntée : le saut se repère à deux cases consécutives du chemin qui
         ne se touchent pas, et les deux bouches sont les téléporteurs actifs
         les plus proches de chacune de ces deux cases. */
      const failles = getActiveTeleporterCells(state.board);
      const distance = (a, b) => Math.max(
        Math.abs(rowIndex(a[0]) - rowIndex(b[0])),
        Math.abs(Number(a.slice(1)) - Number(b.slice(1)))
      );
      const bouches = [];
      for (let i = 1; i < path.length; i++) {
        if (distance(path[i - 1], path[i]) <= 1) continue; // pas un saut
        for (const bord of [path[i - 1], path[i]]) {
          const proche = failles.reduce(
            (best, f) => (best === null || distance(f, bord) < distance(best, bord) ? f : best),
            null
          );
          if (proche && !bouches.includes(proche)) bouches.push(proche);
        }
      }
      if (bouches.length > 0) {
        /* `titanId` accompagne la bouche : la faille se peint de la couleur du
           Titan qui vient de l'emprunter, pas du violet générique (Nikola,
           2026-08-29). Le drapeau `teleporteur` reste, il sert de repli quand
           aucun Titan n'est associé au saut. */
        setTraceVol((prev) => [
          ...prev,
          ...bouches.map((key) => ({ key, teleporteur: true, titanId: selectedTitanId })),
        ]);
      }
    },
    [selectedTitanId, moveReachable, moveAdrenaline, moveMaxRange, titanState.players, titansByCell, canUseMovePassif, captureSnapshot, state.board, looseBlocks, assurerRentree, animerTrajectoires]
  );

  const recupPool = useMemo(
    () => (selectedTitanId
      ? new Set(getRecuperationPool(selectedTitanId, { titans: titanState.players, looseBlocks }))
      : new Set()),
    [selectedTitanId, titanState.players, looseBlocks]
  );
  const toggleRecupMode = useCallback(() => {
    if (!recupMode && (!canUseRecupPassif(selectedTitanId) || recupPool.size === 0)) return;
    setRecupMode((m) => !m);
  }, [recupMode, canUseRecupPassif, selectedTitanId, recupPool]);
  const jouerRecuperation = useCallback(
    (cellKey, pickedValue) => {
      if (!selectedTitanId || !recupPool.has(cellKey) || !canUseRecupPassif(selectedTitanId)) return;
      captureSnapshot();
      const result = resolveRecuperation(selectedTitanId, cellKey, { titans: titanState.players, looseBlocks, board: state.board }, pickedValue);
      setActionLog((prev) => [...prev, ...result.log]);
      if (result.applied) { setRecupMode(false); setPassifUsed((prev) => ({ ...prev, [selectedTitanId]: { ...(prev[selectedTitanId] || {}), recup: true } })); }
      setLooseBlocks((prev) => ({ ...prev }));
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    },
    [selectedTitanId, recupPool, titanState.players, looseBlocks, state.board, canUseRecupPassif, captureSnapshot]
  );

  // Le compte vient du moteur : l'interface le recopiait, ce qui faisait deux
  // endroits a corriger le jour ou la Lanterne Rouge changerait.
  //
  // Bug remonte par Nikola le 2026-08-24 : « j'etais Lanterne Rouge, bien
  // indique, mais je n'ai pas pu prendre mon 3e bloc ». Le compte etait
  // recalcule EN DIRECT a chaque rendu, sur le Repaire courant — or chaque
  // bloc ramasse fait justement grossir ce Repaire. Des le 2e bloc pris, son
  // proprietaire pouvait ne plus etre le moins dote, la Lanterne Rouge
  // s'eteignait d'elle-meme et le compte retombait a 2 en plein ramassage.
  // Comme le recul de Graouhhh ou les cibles de FPMC, ce nombre doit etre
  // FIGE au moment ou la carte s'engage, pas recalcule a chaque bloc pris.
  const jnpNbToPickLive = selectedTitanId
    ? getJeNePartagePasCount(selectedTitanId, { titans: titanState.players, egalitesLanterneRouge })
    : 2;
  const jnpNbToPick = jnpMode ? jnpNbToPickFrozen : jnpNbToPickLive;
  const jnpPool = useMemo(
    () => (selectedTitanId
      ? new Set(getJeNePartagePasPool(selectedTitanId, { titans: titanState.players, looseBlocks }))
      : new Set()),
    [selectedTitanId, titanState.players, looseBlocks]
  );
  /* ── ROUVRIR LA CARTE NE REMET PAS LE COMPTEUR À ZÉRO ──
     Triche remontée par Nikola le 2026-09-07 : « si je sélectionne "Je ne
     partage pas", que je clique un débris puis que je reclique sur "Je ne
     partage pas" au lieu de faire Annuler, ça me garde le premier débris
     récupéré — donc je triche, je peux tout récupérer. »

     Il a raison, et c'est structurel. Depuis le ruling du 2026-08-19 le
     ramassage se résout ÉLÉMENT PAR ÉLÉMENT : chaque clic prend le bloc pour
     de bon, immédiatement, dans le Repaire. `jnpSelected` n'est donc pas une
     sélection en attente de validation, c'est un COMPTEUR de ce qui a déjà
     été encaissé — et ce compteur était remis à zéro par un simple aller-retour
     sur le bouton de la carte. Deux clics et le quota repartait à 2 ou 3, sur
     un Repaire qui gardait tout.

     Refermer la carte en cours de ramassage n'est donc pas un « annuler » :
     c'est une CLÔTURE ANTICIPÉE, exactement ce que fait déjà le bouton de
     sortie de secours (`jouerJeNePartagePas`). Le Titan se pose sur sa
     dernière case, la carte est marquée jouée, et il n'y a plus rien à
     rouvrir. Pour vraiment revenir en arrière, il reste « Annuler », dont
     c'est le métier — l'instantané a été pris avant le premier bloc. */
  const toggleJnpMode = useCallback(() => {
    if (jnpMode) {
      /* Par le vm du rendu courant, pas par une ref posée sur la fonction brute
         (2026-09-14) : chez un invité, `vm.jouerJeNePartagePas` est l'envoi à
         l'hôte, et la clôture partait jusqu'ici dans le moteur local, que
         l'hôte n'entend pas. Chez l'hôte, c'est la même fonction qu'avant. */
      if (jnpSelected.length > 0) { actionsRef.current.jouerJeNePartagePas?.(); return; }
      setJnpMode(false);
      setJnpSelected([]);
      return;
    }
    setTeaMode(false); setGraouMode(false); setBbMode(false); setBbPath([]); setBbSurvol([]);
    // Rouvrir un ramassage engagé le REPREND : son compteur et son quota figé
    // sont de l'état de partie, pas du mode (cf. `ramassageEnCours`).
    if (jnpSelected.length === 0) setJnpNbToPickFrozen(jnpNbToPickLive);
    setJnpMode(true);
  }, [jnpMode, jnpSelected, jnpNbToPickLive]);
  /* Ruling Nikola du 2026-08-19 (WIP) : le ramassage se resout ELEMENT PAR
     ELEMENT. Le clic ne coche donc plus une case en attendant une validation
     globale, il ramasse pour de bon, et le Titan se deplace aussitot si la
     case se vide. Le Perimetre du prelevement suivant est alors recalcule
     depuis sa NOUVELLE case, ce que `jnpPool` fait tout seul puisqu'il depend
     de la position du Titan.

     Deux consequences voulues :
     · deux debris empiles sur une MEME case se ramassent, ce que l'ancienne
       version interdisait (le second clic desélectionnait la case) ;
     · des debris du Perimetre de depart peuvent devenir hors de portee apres
       le premier ramassage. C'est la partie que Nikola garde en WIP. */
  const jnpPickCell = useCallback((key, pickedValue) => {
    if (!selectedTitanId || !canPlayCard("je_ne_partage_pas")) return;
    if (!jnpPool.has(key)) return;
    /* Le quota se fige au PREMIER bloc, ici, et plus seulement à l'ouverture du
       mode (2026-09-14) : chez l'hôte qui joue le ramassage d'un invité, son
       propre mode est fermé, et `jnpNbToPick` retombait sur le compte recalculé
       à chaque bloc — la Lanterne Rouge d'un invité s'éteignait en plein
       ramassage, le bug du 2026-08-24 revenu par le réseau. En local, le quota
       figé à l'ouverture et celui du premier bloc sont le même nombre. */
    const quota = jnpSelected.length === 0 ? jnpNbToPickLive : jnpNbToPickFrozen;
    if (jnpSelected.length >= quota) return;
    if (jnpSelected.length === 0) setJnpNbToPickFrozen(jnpNbToPickLive);

    // L'instantane est pris avant le PREMIER element seulement : Annuler doit
    // ramener avant la carte entiere, pas au milieu d'un ramassage.
    if (jnpSelected.length === 0) captureSnapshot();

    /* ── ON CHOISIT CE QU'ON PREND, MÊME ICI ──
       Nikola, 2026-09-01 : « en Lanterne Rouge j'avais un Socle et un débris
       sur la même case, j'ai eu le Socle sans avoir le choix de prendre le
       débris ».

       Le domaine acceptait déjà un `pickedValue` — c'est ce qui fait marcher le
       choix du passif Récupération — et cet appel-ci ne le passait jamais :
       faute d'indication, `resolveJeNePartagePasElement` prend le SOMMET de la
       pile, et un Socle tombé en dernier se trouve toujours au sommet. La carte
       la plus chère du jeu décidait donc à la place du joueur.

       Le choix arrive par l'interface (cf. la fenêtre de `RoundPanels`, la même
       que pour la Récupération) et n'est demandé que sur une case qui porte
       plusieurs éléments différents ; ailleurs, `undefined` garde le
       comportement d'avant. */
    const result = resolveJeNePartagePasElement(
      selectedTitanId, key,
      { titans: titanState.players, looseBlocks, board: state.board, egalitesLanterneRouge },
      pickedValue
    );
    setActionLog((prev) => [...prev, ...result.log]);
    if (!result.applied) {
      setLooseBlocks((prev) => ({ ...prev }));
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      return;
    }

    const dejaPris = [...jnpSelected, key];
    setJnpSelected(dejaPris);
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));

    /* Le compte atteint, la carte est jouee. Pas de bouton a cliquer : tout
       est deja resolu.

       C'est aussi le moment du SEUL deplacement (Nikola, 2026-08-19) : « on
       finit sur la derniere case selectionnee si elle devient libre ». Chaque
       clic intermediaire ne fait donc plus bouger le Titan, ce qui lui
       permet de piocher sur des cases eloignees les unes des autres sans que
       son Perimetre ne se derobe en cours de route. */
    if (dejaPris.length >= quota) {
      deplacerSiDerniereCaseLibre(
        selectedTitanId, key,
        { titans: titanState.players, looseBlocks, board: state.board }
      );
      setLooseBlocks((prev) => ({ ...prev }));
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
      markCardPlayed(selectedTitanId, "je_ne_partage_pas");
      setJnpMode(false);
      setJnpSelected([]);
    }
  }, [selectedTitanId, jnpPool, jnpSelected, jnpNbToPickLive, jnpNbToPickFrozen, titanState.players, looseBlocks, state.board, egalitesLanterneRouge, canPlayCard, markCardPlayed, captureSnapshot]);

  // Conserve sous son ancien nom : les panneaux l'appellent pour le clic case.
  /* Sortie de secours du ramassage sequentiel. Un Titan peut se retrouver
     sans aucun debris a portee apres s'etre deplace : la carte est alors
     ramassee a moitie et il n'y a plus rien a cliquer. Sans ce bouton, le
     panneau resterait ouvert sans issue — exactement le blocage de partie
     rencontre trois fois le 18 aout. Il cloture la carte avec ce qui a ete
     obtenu. */
  const cloturerRamassage = useCallback((titanId) => {
    if (jnpSelected.length === 0) return;
    // Cloture anticipee : le Titan se pose quand meme sur sa derniere case
    // choisie, si elle est libre. Meme regle que pour un ramassage complet.
    const derniere = jnpSelected[jnpSelected.length - 1];
    const journal = [];
    deplacerSiDerniereCaseLibre(
      titanId, derniere,
      { titans: titanState.players, looseBlocks, board: state.board },
      journal
    );
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setActionLog((prev) => [...prev, ...journal,
      `Je Ne Partage Pas : ramassage cloture a ${jnpSelected.length}/${jnpNbToPick} element(s).`]);
    markCardPlayed(titanId, "je_ne_partage_pas");
    setJnpMode(false);
    setJnpSelected([]);
  }, [jnpSelected, jnpNbToPick, markCardPlayed, titanState.players, looseBlocks, state.board]);

  const jouerJeNePartagePas = useCallback(() => {
    if (!selectedTitanId || !canPlayCard("je_ne_partage_pas")) return;
    cloturerRamassage(selectedTitanId);
  }, [selectedTitanId, canPlayCard, cloturerRamassage]);

  /* ── UN RAMASSAGE ORPHELIN SE CLÔT ──
     Audit du 2026-09-23. Le ramassage vit dans un compteur de TABLE
     (`jnpSelected`), qui gèle tout le reste tant qu'il n'est pas vide. Un
     invité qui perdait sa liaison en plein ramassage rendait son Titan à
     l'IA ; l'IA jouait son tour, la main passait, et le compteur restait
     levé : le Titan suivant ne pouvait plus ni jouer, ni défausser, ni
     bouger. L'IA ne sait pas reprendre un ramassage à moitié fait — on le
     clôt donc avec ce qui a été pris, comme le bouton « Clôturer ». */
  useEffect(() => {
    if (distantInviteRef.current) return;
    if (jnpSelected.length === 0 || activePlayerId == null) return;
    if (titanModes[activePlayerId] !== "ia") return;
    cloturerRamassage(activePlayerId);
  }, [jnpSelected.length, activePlayerId, titanModes, cloturerRamassage]);

  const jouerFautPasMeChauffer = useCallback(() => {
    /* ── CETTE CARTE APPARTIENT-ELLE ENCORE À LA PARTIE EN COURS ? ──
       `BoardPanel` s'accorde 3 s d'animation avant d'appeler cette fonction.
       Pendant ce délai le joueur peut lancer une nouvelle partie : le
       minuteur invoquerait alors CE callback-ci, dont la closure décrit
       l'ancien plateau, sur les Titans bien réels du nouveau. `partieId` est
       la partie du rendu qui a créé ce callback ; `partieRef` dit où on en
       est vraiment (cf. `regenerate`). */
    if (partieId !== partieRef.current) return;
    if (!selectedTitanId || !canPlayCard("faut_pas_me_chauffer")) return;
    captureSnapshot();
    const targets = getFPMCTargets(selectedTitanId, { titans: titanState.players });
    if (targets.length === 0) {
      setActionLog((prev) => [...prev, `FPMC : aucun Titan dans le Périmètre — sans effet.`]);
      markCardPlayed(selectedTitanId, "faut_pas_me_chauffer");
      return;
    }
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    const base = getProgrammedSum(attacker);
    setFpmcAttackerId(selectedTitanId);
    setFpmcAttackerBase(base);
    setFpmcNTargets(targets.length);
    setFpmcPendingIds(targets);
    setFpmcCurrent(null);
    setActionLog((prev) => [...prev, `FPMC : T${selectedTitanId} (somme ${base}) vs ${targets.length} cible(s) — choisis l'ordre.`]);
    markCardPlayed(selectedTitanId, "faut_pas_me_chauffer");
  }, [partieId, selectedTitanId, titanState.players, canPlayCard, markCardPlayed, captureSnapshot]);

  /* ── DÉSIGNER UNE CIBLE FERME L'ANNULATION ──
     Nikola, 2026-09-01 : « s'il y a un Faut Pas Me Chauffer et que tu cibles
     un Titan, après on ne peut plus annuler, car sinon c'est de la prise
     d'information ».

     Désigner une cible RÉVÈLE la somme de ses Forces — c'est tout l'enjeu de
     la carte, et c'est une information secrète jusque-là. Annuler après l'avoir
     lue reviendrait à sonder chaque adversaire à tour de rôle sans jamais
     s'engager, puis à choisir sa cible en connaissance de cause.

     La pile est donc VIDÉE ici, pas seulement gelée : un simple bouton grisé
     laisserait la pile revenir dès la fin de la carte, avec le coup d'avant
     encore dedans. Ce qui suit reste annulable normalement — la fermeture ne
     porte que sur ce qui précède la révélation. */
  const pickFpmcTarget = useCallback((defenderId) => {
    // Une cible de la liste, et un duel à la fois (audit du 2026-09-23 : un
    // attaquant distant visait un Titan hors de son Périmètre).
    if (!fpmcAttackerId || fpmcCurrent || !fpmcPendingIds.includes(defenderId)) return;
    const defender = titanState.players.find((t) => t.id === defenderId);
    const attacker = titanState.players.find((t) => t.id === fpmcAttackerId);
    /* Une IA ciblée mise en défense (Nikola, 2026-09-24). Posée dès la
       désignation ; le bandeau la montre « ? » à tout appareil qui ne la tient pas. */
    const defenderBid = titanModes[defenderId] === "ia" && attacker ? miseDefenseFpmc(attacker, defender, titanState.players, {
      baseAttaquant: getProgrammedSum(attacker), baseDefenseur: getProgrammedSum(defender),
      profile: titanProfiles[defenderId],
    }) : 0;
    setFpmcCurrent({ defenderId, defenderBase: getProgrammedSum(defender), attackerBid: 0, defenderBid });
    setFpmcPendingIds((prev) => prev.filter((id) => id !== defenderId));
    setUndoStack([]);
    setActionLog((prev) => [...prev,
      `FPMC : cible désignée (Titan ${defenderId}) — l'annulation se ferme, la comparaison des Forces est une information.`,
    ]);
  }, [titanState.players, fpmcAttackerId, fpmcCurrent, fpmcPendingIds, titanModes, titanProfiles]);

  /* Une IA attaquante désigne sa cible suivante et pose sa mise sans attendre
     de clic ; la cible humaine, elle, mise et révèle depuis le bandeau. */
  useEffect(() => {
    if (distantInviteRef.current) return;
    if (!fpmcAttackerId || fpmcCurrent || fpmcPendingIds.length === 0) return;
    if (titanModes[fpmcAttackerId] !== "ia") return;
    const attaquant = titanState.players.find((t) => t.id === fpmcAttackerId);
    const mise = Math.min(miseFpmcIARef.current, attaquant?.adrenaline || 0);
    pickFpmcTarget(fpmcPendingIds[0]);
    setFpmcCurrent((prev) => (prev ? { ...prev, attackerBid: mise } : prev));
  }, [fpmcAttackerId, fpmcCurrent, fpmcPendingIds, titanModes, titanState.players, pickFpmcTarget]);

  const updateFpmcBid = useCallback((side, value) => {
    const cur = fpmcCurrent;
    /* Deux champs, et rien d'autre (audit du 2026-09-23) : `side` vient du
       réseau, et `("defenderId", 3)` détournait le duel vers un autre Titan. */
    if (!cur || (side !== "attackerBid" && side !== "defenderBid")) return;
    const capId = side === "attackerBid" ? fpmcAttackerId : cur.defenderId;
    const capTitan = titanState.players.find((t) => t.id === capId);
    const cap = capTitan ? capTitan.adrenaline || 0 : 0;
    const clamped = Math.min(cap, Math.max(0, Number(value) || 0));
    setFpmcCurrent((prev) => (prev ? { ...prev, [side]: clamped } : prev));
  }, [fpmcCurrent, fpmcAttackerId, titanState.players]);

  const revealFPMC = useCallback(() => {
    const cur = fpmcCurrent;
    if (!cur || !fpmcAttackerId) return;
    const attacker = titanState.players.find((t) => t.id === fpmcAttackerId);
    const defender = titanState.players.find((t) => t.id === cur.defenderId);
    if (!attacker || !defender) return;
    /* AUCUN INSTANTANÉ ICI, ET C'EST LA MÊME RAISON QUE `pickFpmcTarget` : la
       révélation montre la mise cachée de l'adversaire. Pouvoir revenir juste
       avant permettrait de la lire, d'annuler, puis de remiser en conséquence.
       Les décisions et les replis que la carte déclenche prennent chacun leur
       propre instantané quand on les tranche : rien n'est perdu en aval. */
    setUndoStack([]);

    // La résolution vit désormais dans le domaine, avec les cinq autres
    // cartes (cf. resolveFautPasMeChauffer). La version manuscrite qui
    // occupait cette place avait raté trois correctifs successifs :
    // immunité de l'initiateur, auto-collision du Titan projeté, et
    // « bagarre non remportée = aucun point ». Le contrôleur ne fait plus
    // que ce qui lui revient : débiter les mises et rafraîchir l'affichage.
    const replis = [];
    const trajectoires = [];
    const result = resolveFautPasMeChauffer(fpmcAttackerId, cur.defenderId, fpmcNTargets, {
      board: state.board, titans: titanState.players, looseBlocks, replis, trajectoires,
    }, {
      attackerBid: cur.attackerBid, defenderBid: cur.defenderBid,
      // Duel en cours déjà retiré de la file : premier si aucun autre n'a eu lieu.
      premierDuel: fpmcPendingIds.length === fpmcNTargets - 1,
    });

    attacker.adrenaline = Math.max(0, (attacker.adrenaline || 0) - cur.attackerBid);
    defender.adrenaline = Math.max(0, (defender.adrenaline || 0) - cur.defenderBid);
    setActionLog((prev) => [...prev, ...result.log]);
    enqueueDecisions(result.decisions);
    enqueueReplis(replis);
    animerTrajectoires(trajectoires);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    setFpmcCurrent(null);
  }, [fpmcCurrent, fpmcAttackerId, fpmcNTargets, fpmcPendingIds, titanState.players, state.board, looseBlocks, enqueueDecisions, enqueueReplis, animerTrajectoires]);

  /* ── TOUT CASSER : LE JOUEUR CHOISIT L'ORDRE ────────────────
     Nikola, 2026-08-28 : « en cas de TOUT CASSER, on projette les éléments 1 par
     1 dans l'ordre, mon choix. »

     La carte ne se résout plus d'un bloc. On relève ce que la percussion va
     toucher, on ouvre une file, et chaque clic sur une case en résout UNE — le
     plateau bouge, et l'élément suivant se choisit sur l'état qui en résulte.
     C'est ce qui rend l'ordre porteur de sens : un bloc projeté sur une case
     qu'un Titan vient de quitter ne s'empile pas au même endroit.

     Le `bagarreSet` traverse toute la file : la FAQ #12 veut qu'un Titan
     distinct ne rapporte qu'UNE Bagarre pour la carte entière, quel que soit
     l'ordre dans lequel on le touche. Il est donc crédité à la fin, une fois la
     file vide — comme le faisait `resolveToutCasser` en un seul appel. */

  const jouerToutCasser = useCallback(() => {
    /* ── CETTE CARTE APPARTIENT-ELLE ENCORE À LA PARTIE EN COURS ? ──
       `BoardPanel` s'accorde 3 s d'animation avant d'appeler cette fonction.
       Pendant ce délai le joueur peut lancer une nouvelle partie : le
       minuteur invoquerait alors CE callback-ci, dont la closure décrit
       l'ancien plateau, sur les Titans bien réels du nouveau. `partieId` est
       la partie du rendu qui a créé ce callback ; `partieRef` dit où on en
       est vraiment (cf. `regenerate`). */
    if (partieId !== partieRef.current) return;
    if (!selectedTitanId || !canPlayCard("tout_casser")) return;
    captureSnapshot();
    const attacker = titanState.players.find((t) => t.id === selectedTitanId);
    // Bug trouvé au scan : le débit était figé à 1 (`attacker.adrenaline -= 1`)
    // alors que le bonus d'énergie, lui, passait entier au résolveur. Miser
    // deux Adrénalines sur Tout Casser rendait donc la seconde gratuite.
    const bonus = Math.min(Number(tcAdrenaline) || 0, attacker.adrenaline || 0);
    if (bonus > 0) attacker.adrenaline -= bonus;

    const jeu = { board: state.board, titans: titanState.players, looseBlocks, replis: [], trajectoires: [] };
    /* Le relevé de début de carte, comme `resolveToutCasser` le pose pour
       l'IA : sans lui, le chemin humain lisait celui de la carte précédente,
       et un débris arrivé depuis ne suivait pas le Titan projeté (audit du
       2026-09-23). */
    marquerDebutDeCarte(looseBlocks, titanState.players);
    const percussion = releverPercussion(selectedTitanId, jeu, bonus);
    const cibles = listerCiblesToutCasser(selectedTitanId, jeu, percussion);

    setActionLog((prev) => [...prev,
      `💥 Tout Casser (Titan ${selectedTitanId}) — énergie ${percussion.energie}${percussion.seuil4 ? " (Seuil 4)" : ""}, ${cibles.length} élément(s) à projeter dans l'ordre de ton choix.`,
    ]);
    markCardPlayed(selectedTitanId, "tout_casser");
    setTcAdrenaline(0); // état numérique : `false` y était écrit par erreur

    if (cibles.length === 0) {
      setActionLog((prev) => [...prev, "Aucun élément dans le Périmètre — la carte n'a rien à projeter."]);
      return;
    }
    setToutCasserFile({ titanId: selectedTitanId, percussion, cibles, bagarreIds: [] });
  }, [partieId, selectedTitanId, tcAdrenaline, state.board, titanState.players, looseBlocks, canPlayCard, markCardPlayed, captureSnapshot]);

  /* Résout la case cliquée, puis retire l'élément de la file. Quand elle se
     vide, la Bagarre est créditée une fois pour toute la carte. */
  const toutCasserResoudre = useCallback((cellKey) => {
    const file = toutCasserFile;
    if (!file) return;
    const cible = file.cibles.find((c) => c.key === cellKey);
    if (!cible) return;

    const replis = [];
    const trajectoires = [];
    const bagarreSet = new Set(file.bagarreIds);
    const jeu = { board: state.board, titans: titanState.players, looseBlocks, replis, trajectoires };
    const res = resolveToutCasserCase(file.titanId, cible, jeu, file.percussion, bagarreSet);

    setActionLog((prev) => [...prev, ...(res.log || [])]);
    enqueueDecisions(res.decisions || []);
    enqueueReplis(replis);
    animerTrajectoires(trajectoires);
    setState((prev) => ({ ...prev }));
    setLooseBlocks((prev) => ({ ...prev }));
    setTitanState((prev) => ({ ...prev, players: [...prev.players] }));

    const reste = file.cibles.filter((c) => c.key !== cellKey);
    if (reste.length > 0) {
      setToutCasserFile({ ...file, cibles: reste, bagarreIds: [...bagarreSet] });
      return;
    }
    /* Fin de carte : la Bagarre se compte ici, une seule fois par Titan touché
       (FAQ #12), exactement comme le faisait la résolution monolithique. */
    const attaquant = aiTitanStateRef.current.players.find((t) => t.id === file.titanId);
    if (attaquant && bagarreSet.size > 0) {
      attaquant.bagarre += bagarreSet.size;
      setActionLog((prev) => [...prev,
        `+${bagarreSet.size} Bagarre (Titan ${file.titanId} → ${attaquant.bagarre}) — ${bagarreSet.size} Titan(s) distinct(s) touché(s) sur toute la carte (FAQ #12).`,
      ]);
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    }
    // Fin de carte : la passe des tours, comme dans la résolution de l'IA.
    const bascule = basculerToursSousTitans(file.titanId, jeu, bagarreSet);
    if (bascule.length > 0) {
      setActionLog((prev) => [...prev, ...bascule]);
      setLooseBlocks((prev) => ({ ...prev }));
      setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    }
    setToutCasserFile(null);
  }, [toutCasserFile, state.board, titanState.players, looseBlocks, enqueueDecisions, enqueueReplis, animerTrajectoires]);

  const getVertCount = useCallback((titan) => titan.repaire.filter((c) => c === "vert").length, []);

  /* ══════════════════════════════════════════════════════════
     LE JOURNAL, TYPÉ — dérivé, pas stocké (Nikola, 2026-08-28)
     ══════════════════════════════════════════════════════════
     Il était une liste de chaînes, et c'est la seule mémoire de la partie.
     Deux défauts en découlaient, tous deux signalés :

     · LE RATTACHEMENT À UN TITAN se faisait par une expression régulière au
       moment de l'affichage, qui gardait le PREMIER identifiant rencontré.
       « Titan 1 prend 1 Adrénaline à Titan 2 » était donc classé chez le
       Titan 1 seul : filtrer sur le Titan 2 ne montrait pas la ligne qui lui
       coûte une Adrénaline.
     · LES NOMS. Le moteur écrit « Titan 3 », parce qu'il ne connaît pas les
       noms choisis à l'accueil — et c'est très bien ainsi, un moteur de règles
       n'a pas à connaître l'habillage. Mais le journal affichait ce texte tel
       quel, alors que tout le reste de l'écran dit « Pénélope ».

     DÉRIVÉ, ET PAS STOCKÉ. La version évidente — enrichir chaque ligne à
     l'écriture — oblige à passer par un `setActionLog` maison, qui n'est plus
     le setter stable de `useState` : les cinquante-trois sites d'écriture s'en
     moquent, mais les trente-huit hooks qui le citent en dépendance, non. Le
     type est donc CALCULÉ à partir du texte, une fois par changement de
     journal. Le coût est nul à l'échelle d'une partie, et rien en amont ne
     bouge : ni le domaine, ni les appelants, ni l'annulation.

     Ce qu'on en tire :
     · `acteurs` retient TOUS les Titans cités, pas le premier ;
     · `manche` est reconstituée en parcourant les séparateurs, donc le
       découpage du journal cesse d'être une affaire d'affichage ;
     · `texte` reste canonique — « Titan 3 », jamais « Pénélope » : le nom est
       substitué à l'AFFICHAGE, ce qui le rend rétroactif (renommer en cours de
       partie renomme tout le passé) et garde le journal enregistré lisible par
       quelqu'un qui n'a pas les mêmes noms.
     ══════════════════════════════════════════════════════════ */
  const journal = useMemo(() => {
    const ID_TITAN = /\bT(?:itan)?\.?\s?([1-4])\b/g;
    const SEPARATEUR = /^— — — Manche (\d+) — — —$/;
    let manche = 1;
    return actionLog.map((ligne, i) => {
      const texte = typeof ligne === "string" ? ligne : String(ligne);
      const sep = texte.match(SEPARATEUR);
      if (sep) manche = Number(sep[1]);
      const acteurs = [];
      for (const m of texte.matchAll(ID_TITAN)) {
        const id = Number(m[1]);
        if (!acteurs.includes(id)) acteurs.push(id);
      }
      return { i, texte, manche, acteurs, separateur: Boolean(sep) };
    });
  }, [actionLog]);

  /* Le texte prêt à lire : les identifiants du moteur laissent la place aux
     noms choisis. Fait ICI et pas dans le composant, pour que le rapport
     « Signaler » et le journal affichent exactement la même chose. */
  const nommerLigne = useCallback(
    (texte) => texte.replace(/\bT(?:itan)?\.?\s?([1-4])\b/g, (brut, id) => titanDisplayName(Number(id))),
    [titanDisplayName]
  );

  /* ── LES IA PLACENT LEURS PROPRES BLOCS VERTS ──
     Demande de Nikola du 2026-08-18 : « c'est les IA qui doivent placer
     leurs propres blocs verts. »

     L'écran de décompte posait un menu déroulant par Vert et PAR TITAN, y
     compris pour les Titans pilotés par l'IA : c'était donc l'humain qui
     affectait, à la fin, les Verts de ses trois adversaires — un choix qui
     vaut plusieurs points et qui ne lui appartient pas. Pire, tant qu'il ne
     les remplissait pas lui-même, le décompte restait annoncé comme « non
     définitif » et les profils d'IA ne se dévoilaient jamais.

     Chaque IA tranche donc elle-même, en mode EXACT : le glouton a un angle
     mort connu sur l'Orange, qui ne marque que par paires (cf.
     bestVertAssignment). Placer un Vert est le tout dernier geste de la
     partie, il n'est joué qu'une fois — autant le jouer juste.

     Le placement se fait à l'ouverture du décompte, une seule fois par
     Titan : la condition sur `vertAssignments` empêche l'effet de le
     recalculer et d'écraser un état restauré par « Annuler ».

     ⚠️ La condition est `gameOver`, PAS `showScoring`. `showScoring` n'est
     qu'un panneau consultable à tout moment par le bouton « 🏆 Scoring » :
     l'ouvrir en Manche 2 faisait placer aux IA des Verts calculés sur un
     plateau intermédiaire, et comme le placement n'est fait qu'une fois, il
     n'était plus jamais recalculé — les IA finissaient la partie avec des
     Verts posés d'après un état qui n'existait plus. */
  useEffect(() => {
    if (distantInviteRef.current) return; // les Verts des IA sont placés chez l'hôte
    if (!gameOver) return;
    const aFaire = titanState.players.filter(
      (t) => titanModes[t.id] === "ia"
        && getVertCount(t) > 0
        && (vertAssignments[t.id] || []).filter(Boolean).length < getVertCount(t)
    );
    if (aFaire.length === 0) return;
    const ajouts = {};
    const journal = [];
    for (const t of aFaire) {
      /* L'IA DÉCIDE SUR LES PRÉ-SCORES, PAS SUR LES VERTS DES AUTRES.
         Nikola, 2026-08-27 : « au moment du placement des Verts j'ai besoin
         de savoir les pré-scores des autres sans leur Vert, pour mieux me
         projeter — pareil pour les IA. »

         Elle recevait jusqu'ici `autres: dejaPosees`, c'est-à-dire les Verts
         DÉJÀ POSÉS par les humains et par les IA passées avant elle. Le
         placement est secret, révélé simultanément : cette information
         n'existe pour personne à cet instant. L'IA jouait donc paravent
         baissé, contre des humains qui, eux, décidaient à l'aveugle — et la
         dernière IA à trancher était la mieux renseignée des quatre, ce qui
         faisait dépendre sa force de son numéro de Titan.

         `autres: {}` la remet sur l'information publique : les Repaires et
         les pistes tels qu'ils sont, Verts de personne inclus. Exactement ce
         que le tableau de pré-scores montre au joueur en face. */
      const choix = bestVertAssignment(t.id, titanState.players, { exact: true, autres: {} });
      ajouts[t.id] = choix;
      // Le journal dit QUE l'IA a placé, jamais OÙ. Il est consultable à
      // tout moment : y écrire le détail rouvrait par la porte de derrière
      // le secret que l'écran de placement vient de fermer. Le détail
      // s'affiche dans ce même écran, une fois tout le monde placé.
      journal.push(`🤖 ${titanDisplayName(t.id)} (IA) place ses ${choix.length} Bloc(s) Vert, en secret.`);
    }
    setVertAssignments((prev) => ({ ...prev, ...ajouts }));
    // Une IA n'a personne pour cliquer « Valider » : poser, pour elle,
    // c'est s'engager. Sans ça, son placement resterait éternellement « en
    // cours » à l'écran.
    setVertsValides((prev) => {
      const suite = { ...prev };
      for (const id of Object.keys(ajouts)) suite[id] = true;
      return suite;
    });
    setActionLog((prev) => [...prev, ...journal]);
  }, [gameOver, titanState.players, titanModes, vertAssignments, getVertCount, titanDisplayName]);
  const updateVertAssignment = useCallback((titanId, index, value) => {
    /* Les trois arguments peuvent venir du réseau, et la portée « soi-arg0 »
       ne vérifie que le Titan. Une valeur non-chaîne faisait lever `split`
       DANS l'updater, donc pendant le rendu, hors du filet de l'exécuteur
       d'intentions : l'hôte perdait son moteur, la table sa partie. Un index
       démesuré allouait, lui, un tableau géant (revue du 2026-09-14). */
    if (!Number.isInteger(index) || index < 0 || index > 64) return;
    if (value != null && typeof value !== "string") return;
    /* Un placement validé est figé, et on ne place que les Verts qu'on a
       (audit du 2026-09-23 : un invité réécrivait ses Verts APRÈS avoir vu la
       révélation de ceux des autres, et s'en attribuait autant qu'il voulait). */
    if (vertsValides[titanId]) return;
    const titan = titanState.players.find((t) => Number(t.id) === Number(titanId));
    if (!titan || index >= getVertCount(titan)) return;
    setVertAssignments((prev) => {
      const current = prev[titanId] ? [...prev[titanId]] : [];
      current[index] = value ? (() => { const [type, target] = value.split(":"); return { type, target }; })() : null;
      return { ...prev, [titanId]: current };
    });
  }, [vertsValides, titanState.players, getVertCount]);

  const finalScoreResult = showScoring
    ? computeFinalScore(
        titanState.players,
        Object.fromEntries(Object.entries(vertAssignments).map(([id, arr]) => [id, (arr || []).filter(Boolean)])),
        rainbowWinnerId
      )
    : null;

  /* LE PRÉ-SCORE : le décompte tel qu'il serait si personne ne posait de
     Vert (Nikola, 2026-08-27 : « j'ai besoin de savoir les pré-scores des
     autres sans leur Vert pour mieux me projeter »).

     Le tableau des Repaires disait déjà combien de blocs chacun détient,
     couleur par couleur. Il ne disait pas ce que ça FAIT : additionner
     quatre barèmes, le bonus Rose, les Socles, deux classements de piste et
     l'Adrénaline, pour quatre Titans, de tête, au moment précis où l'on
     décide — c'est le calcul que personne ne fait à la table, et sans lui un
     Vert se place à l'estime.

     Verts de TOUT LE MONDE exclus, y compris les siens : c'est la seule
     photo que chacun peut légitimement avoir sous les yeux pendant un
     placement secret, et c'est aussi celle sur laquelle les IA tranchent
     désormais. Le même point de départ pour les quatre. */
  const preScoreSansVerts = showScoring
    ? computeFinalScore(titanState.players, {}, rainbowWinnerId)
    : null;

  // Le tableau de scoring affichait une colonne par Titan et un total, sans
  // jamais désigner de vainqueur : au joueur de comparer les chiffres à
  // l'œil. Le classement est calculé ici, départage compris (Adrénaline,
  // plus haut Socle, Force des cartes non jouées — ruling du 2026-08-15).
  const classementFinalPartie = finalScoreResult
    ? classementFinal(titanState.players, finalScoreResult.totals)
    : null;

  /* LE PODIUM S'OUVRE QUAND LE CLASSEMENT DEVIENT VRAI, pas à `gameOver`.
     Entre les deux il y a le placement des Blocs Verts : tant qu'un seul reste
     à poser, les totaux affichés sont provisoires et le vainqueur peut encore
     changer de nom. Annoncer un gagnant à ce moment-là serait le démentir une
     minute plus tard.

     `podiumDejaOuvert` fait que l'ouverture automatique n'a lieu qu'UNE fois :
     le classement est recalculé à chaque rendu, et sans ce garde le panneau se
     rouvrirait tout seul à chaque clic après qu'on l'a fermé. */
  /* ⚠️ LE CLASSEMENT N'EST VRAI QU'APRÈS LA VALIDATION DES VERTS, pas après
     leur simple placement. Nikola, 2026-08-28 : « attention, le panneau gagnant
     apparaît après la validation de placement de Vert, sinon ça fausse le
     classement ».

     Un Vert posé mais non validé peut encore être repris : le décompte le
     compte déjà, le joueur peut encore le déplacer, et le vainqueur affiché
     n'est donc pas celui qui gagnera. La condition n'est pas « tous les Verts
     sont placés » mais « plus personne ne peut changer d'avis » : chaque Titan
     porteur de Verts doit avoir ENGAGÉ son placement.

     Un Titan sans aucun Vert n'a rien à valider et ne bloque personne. */
  const versDeposesEtEngages = titanState.players.every(
    (t) => getVertCount(t) === 0 || vertsValides[t.id]
  );

  useEffect(() => {
    if (!gameOver || podiumDejaOuvert.current) return;
    if (!versDeposesEtEngages) return;
    if (!classementFinalPartie || classementFinalPartie.length === 0) return;
    podiumDejaOuvert.current = true;
    setShowPodium(true);
    jouerJingleFin();
  }, [gameOver, versDeposesEtEngages, classementFinalPartie]);

  // ⚠️ Dépendances posées sur `state` / `looseBlocks` / `titanState` (objets
  // de haut niveau) et NON sur `state.board` : les résolutions de cartes
  // mutent `state.board` en place puis forcent le rendu par
  // `setState((p) => ({ ...p }))`. La référence de `.board` ne change donc
  // jamais, alors que celle de `state` change à chaque action. Mémoïser sur
  // `.board` figerait le plateau après la première destruction.
  const endGameReasons = useMemo(
    () => checkEndGameTriggers(state.board, looseBlocks, apocalypseThreshold, mancheNumber, nbJoueurs),
    [state, looseBlocks, apocalypseThreshold, mancheNumber, nbJoueurs]
  );

  const boardSignature3D = useMemo(
    () => JSON.stringify({
      b: Object.entries(state.board).map(([k, v]) => [k, v.blocks.join(""), v.socle]),
      l: Object.entries(looseBlocks).map(([k, v]) => [k, (v || []).join(",")]),
      // `horsPlateau` fait partie de la signature : un Titan qui rentre par
      // la case exacte d'où il est sorti ne change pas de `cell`, et la 3D
      // ne se serait jamais reconstruite pour le refaire apparaître.
      t: titanState.players.map((p) => [p.id, p.cell, p.horsPlateau ? 1 : 0]),
    }),
    [state, looseBlocks, titanState]
  );

  /* ── UNE SEULE DÉCISION À L'ÉCRAN À LA FOIS ──
     Demande de Nikola du 2026-08-18 : « n'affiche pas plusieurs panneaux,
     fais panneau par panneau — là j'ai un DIL et une Phase Repos, ce n'est
     pas possible, on fait DIL puis Phase Repos. »

     Les quatre décisions bloquantes du jeu étaient montées côte à côte, et
     chacune s'affichait dès qu'elle avait quelque chose à dire. Un Graouhhh
     qui touche trois Titans, suivi d'un repli et d'une fin de Manche,
     empilait donc trois bandeaux d'alerte au même moment, tous en rouge,
     tous « bloquants » : impossible de savoir lequel répondre en premier.

     L'ordre ci-dessous est celui de la résolution réelle, du plus imbriqué
     au plus large : ce qu'une carte a déclenché se termine avant la carte,
     et la carte se termine avant la Manche. C'est aussi ce qui garantit le
     « Titan par Titan » sur Graouhhh — la file DIL se vide un Titan à la
     fois, et rien d'autre ne s'affiche pendant ce temps. */
  /* ── UN ÉLÉMENT SE FINIT AVANT QU'ON DÉSIGNE LE SUIVANT ──
     Nikola, 2026-09-01 : « on fait les résolutions de projection cas par cas.
     J'ai envoyé un Titan dehors et j'ai eu le DIL APRÈS avoir projeté tous les
     éléments suivants, alors qu'on fait bien cas par cas — si j'envoie le
     Titan, je résous le DIL, et ensuite je peux continuer la projection des
     autres éléments. »

     La file de Tout Casser passait avant tout le reste, au motif que « c'est
     elle qui produira les Dilemmes et les replis que les autres bandeaux
     traiteront ensuite ». C'était vrai de la file ENTIÈRE et faux de chaque
     élément : `toutCasserResoudre` résout une case, empile ses conséquences,
     et la file reprenait aussitôt la main sur l'affichage — donc le Dilemme
     qu'on venait de provoquer restait invisible jusqu'au dernier élément.

     Les conséquences d'un élément passent donc AVANT la désignation du
     suivant. La file ne redevient bloquante qu'une fois le plateau au repos,
     ce qui est exactement ce que « cas par cas » veut dire : projeter, voir ce
     que ça déclenche, trancher, puis reprendre. Aucun bandeau ne change ; ils
     lisent tous cette liste, et c'est elle qui porte la règle. */
  const decisionBloquante = placementRestant.length > 0
    ? "placement"
    /* Le refus de Fatigue passe AVANT le Dilemme de la même carte : la carte
       part d'abord, le bloc ensuite, et c'est l'ordre dans lequel la cible les
       subit. */
    : fatigueEnAttente
    ? "fatigue"
    : cornerChoice
    ? "coin"
    : currentDecision
    ? "dil"
    : currentRepli
    ? "repli"
    : ecroulement
    ? "ecroulement"
    : toutCasserFile
    ? "toutcasser"
    : // Faut Pas Me Chauffer entre ici le 2026-08-18 : la comparaison de
      // mises est une décision bloquante comme les autres, mais elle vivait
      // hors de cette liste. Le tour pouvait donc être rendu « terminé »
      // pendant qu'une cible attendait encore d'être désignée.
      fpmcAttackerId && (fpmcPendingIds.length > 0 || fpmcCurrent)
    ? "fpmc"
    : phase === "repos" && !gameOver
    ? "vol"
    : null;

  /* ⚠️ PAS DE PÉRIMÈTRE POUR UN TITAN QUI N'EST PAS SUR LE PLATEAU.
     Bug remonté par Nikola le 2026-08-28 : « un coin s'affiche déjà en
     surbrillance de ma couleur au tout début du jeu, alors que je n'ai pas
     encore placé mon Titan ».

     Sa `cell` porte pourtant déjà une valeur pendant la mise en place —
     l'emplacement que le tirage lui a réservé par défaut — et le périmètre se
     dessinait autour. Non seulement il n'a aucun sens (le Titan n'est nulle
     part), mais il RÉVÈLE où il compte aller à ceux qui posent avant lui, ce
     que tout le reste de la mise en place s'applique à cacher.

     Même garde qu'ailleurs : `estSurLePlateau` couvre `aPlacer` ET
     `horsPlateau` — un Titan éjecté n'a pas plus de périmètre qu'un Titan non
     posé, et la vue 3D le savait déjà de son côté. */
  const perimeterCells = selectedTitan && estSurLePlateau(selectedTitan)
    ? getPerimeter(selectedTitan.cell[0], Number(selectedTitan.cell.slice(1)))
    : [];
  const perimeterKeys = new Set(perimeterCells.map((c) => c.row + c.col));
  /* Retour de Nikola : le badge Énergie/Seuil 4 restait câblé sur Tout
     Casser même pendant que Tête en Avant ou Boing Boing étaient ouverts —
     il ne bougeait donc jamais avec LEURS boutons +/-. Il suit désormais la
     carte réellement en cours de configuration. Pour Tête en Avant/Boing
     Boing, c'est l'énergie de DÉPART de la charge (avant dégression avec la
     distance parcourue, cf. computeEnergieParDistance) — teaMaxRange et
     bbMaxRange la calculent déjà avec la même formule (portée + Adrénaline
     engagée), pas besoin d'un second calcul. */
  const energie = selectedTitan
    ? teaMode
      ? teaMaxRange
      : bbMode
      ? bbMaxRange
      : computeEnergyToutCasser(
          perimeterCells,
          state.board,
          titansByCell,
          // Sans ce bonus, l'aperçu "Énergie"/"Seuil 4" du panneau ne bougeait
          // pas au clic sur "+" alors que la résolution réelle (jouerToutCasser)
          // en tenait déjà compte : le joueur ne voyait jamais l'effet de son
          // Adrénaline avant de valider la carte.
          Math.min(Number(tcAdrenaline) || 0, selectedTitan.adrenaline || 0),
          // Bug remonté par Nikola : l'aperçu ignorait ce 5e argument et
          // retombait sur le défaut `{}`, donc ne comptait ni les débris ni
          // les Socles au sol — le badge Énergie/Seuil affichait 3 quand la
          // résolution réelle (qui, elle, passe `gameState.looseBlocks`)
          // appliquait déjà l'effet du Seuil 4 sur une énergie de 4 ou plus.
          looseBlocks
        )
    : 0;

  // Même raison que ci-dessus pour la dépendance sur `state` et non `state.board`.
  const { stats, occupiedCount } = useMemo(() => {
    const counts = { bleu: 0, rose: 0, orange: 0, rouge: 0, vert: 0 };
    let occupied = 0;
    Object.values(state.board).forEach((b) => {
      b.blocks.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
      if (b.blocks.length > 0) occupied++;
    });
    return { stats: counts, occupiedCount: occupied };
  }, [state]);

  // -- CONSIGNE DU MOMENT --
  // Un joueur qui decouvre le jeu ne sait pas ce que la Phase en cours
  // attend de lui. `what` explique la Phase, `you` dit l'action concrete a
  // faire tout de suite. Purement descriptif : aucune regle n'est decidee
  // ici, on ne fait que formuler ce que le moteur applique deja.
  // Place avec les autres valeurs derivees, donc AVANT le retour anticipe de
  // l'ecran de configuration : l'ordre des hooks doit rester constant.
  const phaseGuidance = useMemo(() => {
    if (currentDecision) {
      const mode = currentDecision.type === "RAGE" ? "RAGE" : "DIL";
      return {
        what: `Decision ${mode} en cours - le reste du jeu est en pause tant qu'elle n'est pas resolue.`,
        you: mode === "RAGE"
          ? "L'attaquant prend 1 ressource dans le Repaire de sa cible."
          : "L'attaquant designe 2 options (ou la seule que la cible possede, sur un Dilemme au sol), la cible choisit ce qu'elle perd (ou paie 1 Adrenaline pour annuler).",
      };
    }
    const me = selectedTitan;
    const validated = me ? phaseValidated[me.id] : false;
    if (phase === "evenement") {
      return {
        what: "Phase 1 - Evenement : un Evenement est tire pour toute la Manche.",
        you: validated ? "Tu as valide, on attend les autres Titans." : "Prends-en connaissance, puis valide ta Phase.",
      };
    }
    if (phase === "declenchement") {
      return {
        what: "Phase 2 - Declenchement : l'Evenement de la Manche prend effet.",
        you: validated ? "Tu as valide, on attend les autres Titans." : "Valide ta Phase pour continuer.",
      };
    }
    if (phase === "programmation") {
      const n = me ? me.programmed.length : 0;
      return {
        what: "Phase 3 - Programmation : chacun choisit en secret 3 cartes parmi les 6 de sa main.",
        you: n === 3
          ? "Tes 3 cartes sont programmees, on attend les autres Titans."
          : "Clique 3 cartes ci-dessous. Tu les joueras une par une en Phase Action, dans l'ordre que tu veux.",
      };
    }
    if (phase === "action") {
      // Silence volontaire. En Phase Action, le bandeau du Titan actif, juste
      // au-dessus, annonce deja qui joue, combien de cartes il lui reste et
      // quoi faire. Trois panneaux voisins disaient la meme chose ; celui-ci
      // se tait au profit du plus contextuel.
      return { what: "", you: "" };
    }
    if (phase === "repos") {
      return {
        what: "Phase 5 - Repos : un vol de carte en chaine, puis la Manche suivante demarre.",
        you: volDirection
          ? "Sens choisi, la chaine de vol se resout automatiquement."
          : "Le Detonateur choisit le sens de rotation du vol pour toute la chaine.",
      };
    }
    return { what: "", you: "" };
  }, [phase, currentDecision, selectedTitan, phaseValidated, volDirection]);

  // ── ÉCRAN CONFIG ──
  /* ── SIGNALER CE QUI VIENT DE SE PASSER (Nikola, 2026-08-24) ──
     « Aujourd'hui tu me decris de memoire » : un retour de table arrivait sous
     la forme « j'etais en F6 », et retrouver le cas exact demandait parfois une
     enumeration brute de tout le plateau. Ce bouton fige l'etat complet dans un
     fichier : avec la graine ET la position reelle de chaque element, le cas se
     rejoue directement au lieu d'etre reconstitue.

     Tout est LOCAL : le fichier est fabrique dans le navigateur et enregistre
     par le navigateur. Rien ne part sur un serveur, il n'y en a pas. */
  const construireRapport = useCallback(() => ({
    version: 1,
    genereLe: new Date().toISOString(),
    graine: gameSeed,
    partie: {
      nbJoueurs, mancheNumber, phase, activePlayerId, selectedTitanId,
      seuilApocalypse: apocalypseThreshold, evenementsActifs: eventsEnabled,
      evenementEnCours: currentEvent, gameOver,
    },
    titans: titanState.players.map((t) => ({
      id: t.id, cell: t.cell, horsPlateau: !!t.horsPlateau,
      mode: titanModes[t.id], profil: titanProfiles[t.id] ?? null,
      repaire: [...t.repaire], socles: [...t.socles],
      adrenaline: t.adrenaline, bagarre: t.bagarre, destruction: t.destruction,
      main: [...t.hand], programmees: [...t.programmed],
      joueesCetteManche: [...t.playedThisManche],
      defausseesCachees: [...(t.discardedHidden || [])], repos: [...t.repos],
    })),
    ordreJeu: [...titanState.ordreJeu],
    detonateur: titanState.detonateur,
    plateau: Object.fromEntries(
      Object.entries(state.board)
        .filter(([, b]) => b.blocks.length > 0)
        .map(([k, b]) => [k, { blocs: [...b.blocks], socle: b.socle, teleporteur: !!b.isTeleporter }])
    ),
    debrisAuSol: structuredClone(looseBlocks),
    enAttente: {
      decision: currentDecision ? { type: currentDecision.type, carte: currentDecision.cardLabel, attaquant: currentDecision.attackerId, defenseur: currentDecision.defenderId } : null,
      repli: currentRepli ? { cible: currentRepli.cible, cases: [...currentRepli.cases], defaut: currentRepli.defaut } : null,
      ecroulement: ecroulement ? { case: ecroulement.cellKey } : null,
      choixCoin: cornerChoice,
      decisionBloquante,
      placement: placementRestant.length > 0 ? [...placementRestant] : null,
    },
    // Les 30 dernieres lignes suffisent : au-dela on ne lit plus le tour en
    // cours mais l'historique de la Manche, qui n'aide pas a reproduire.
    /* Le rapport porte le texte NOMME : c'est ce que Nikola a sous les yeux
       quand il decide de signaler, et un rapport qui dit " Titan 3 " la ou son
       ecran dit " Penelope " oblige a retraduire de tete. Les acteurs partent
       en clair a cote, pour que le fichier reste exploitable sans re-parser la
       phrase. */
    journal: journal.slice(-30).map((e) => ({
      manche: e.manche,
      acteurs: e.acteurs,
      texte: nommerLigne(e.texte),
    })),
  }), [
    gameSeed, nbJoueurs, mancheNumber, phase, activePlayerId, selectedTitanId,
    apocalypseThreshold, eventsEnabled, currentEvent, gameOver, titanState,
    titanModes, titanProfiles, state, looseBlocks, currentDecision, currentRepli,
    ecroulement, cornerChoice, decisionBloquante, placementRestant, journal, nommerLigne,
  ]);

  const telechargerRapport = useCallback(() => {
    const rapport = construireRapport();
    const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const nom = `titan-rapport-M${mancheNumber}-graine${rapport.graine}-${horodatage}.json`;
    const blob = new Blob([JSON.stringify(rapport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Liberer l'URL au tour suivant : la revoquer immediatement annule le
    // telechargement sur certains navigateurs.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setActionLog((prev) => [...prev, `📋 Rapport enregistre (${nom}). Graine ${rapport.graine}.`]);
  }, [construireRapport, mancheNumber]);

  if (!setupDone) {
    /* L'écran d'accueil vivait ici, en 190 lignes de JSX au milieu de la
       logique de jeu. Il est sorti dans son propre composant : le contrôleur
       n'a pas à savoir à quoi ressemble un formulaire. */
    return (
      <SetupScreen
        nbJoueurs={nbJoueurs}
        setNbJoueurs={setNbJoueurs}
        manchesMax={manchesMax}
        titanNames={titanNames}
        setTitanNames={setTitanNames}
        titanModes={titanModes}
        setTitanModes={setTitanModes}
        eventsEnabled={eventsEnabled}
        setEventsEnabled={setEventsEnabled}
        difficulte={difficulte}
        setDifficulte={setDifficulte}
        egalitesLanterneRouge={egalitesLanterneRouge}
        setEgalitesLanterneRouge={setEgalitesLanterneRouge}
        modeVolRepos={modeVolRepos}
        setModeVolRepos={setModeVolRepos}
        apocalypseThreshold={apocalypseThreshold}
        setApocalypseThreshold={setApocalypseThreshold}
        seedInput={seedInput}
        setSeedInput={setSeedInput}
        onLancer={() => {
          regenerate(seedInput === "" ? undefined : seedInput);
          setSetupDone(true);
        }}
        /* ── PARTIE À DISTANCE ──
           L'écran d'accueil est le seul endroit où l'on peut encore choisir de
           jouer à plusieurs : une fois la partie lancée, la table est faite. */
        session={session}
        distantJoueurs={distantJoueurs}
        distantSieges={distantSieges}
        distantAvis={distantAvis}
        onBrancherSession={brancherSession}
        onQuitterSession={quitterSessionDistante}
        onPublierSieges={(sieges) => {
          setDistantSieges(sieges);
          sessionRef.current?.publierSieges(sieges)?.catch(avisEnvoiRate("La table des sièges"));
        }}
        /* Un invité prend un Titan libre lui-même (Nikola, 2026-08-30). La
           demande part en intention comme le reste : l'hôte reste l'arbitre,
           il refuse un siège déjà pris ou confié à l'IA. */
        monTitanDistant={monTitanDistant}
        onDemanderSiege={(titanId) => sessionRef.current?.envoyerIntention("demanderSiege", [titanId], {})?.catch(avisEnvoiRate("Ta demande de siège"))}
      />
    );
  }

  // ── ÉCRAN DE JEU ──
  const tcSel = selectedTitan ? TITAN_COLORS[selectedTitan.id] : null;


  const vm = {
    /* ── PARTIE À DISTANCE ──
       Tout ce que l'interface a besoin de savoir du réseau tient ici. Le reste
       du jeu l'ignore complètement : un panneau qui affiche le plateau ne sait
       pas s'il regarde une partie locale ou distante, et c'est voulu. */
    session,
    distantInvite,
    distantHote,
    monTitanDistant,
    distantJoueurs,
    distantSieges,
    distantAvis,
    distantDiffusionBloquee,
    reprendreDiffusion,
    distantFin,
    distantChat,
    brancherSession,
    quitterSessionDistante,
    publierSieges: (sieges) => {
      setDistantSieges(sieges);
      return sessionRef.current?.publierSieges(sieges);
    },
    envoyerChatDistant: (texte) => sessionRef.current?.envoyerChat(texte),
    distantMouvements,

    nbJoueurs,
    setNbJoueurs,
    // Le nombre de Manches de la partie vient du domaine (manchesMax), qui
    // en est propriétaire. Il était recopié en dur à deux endroits de
    // l'interface — un `nbJoueurs === 4 ? 4 : 6` qui aurait silencieusement
    // divergé le jour où la durée d'une partie change.
    manchesMaxPartie: manchesMax(nbJoueurs),
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
    gameSeed,
    seedInput,
    setSeedInput,
    telechargerRapport,
    showJournal,
    setShowJournal,
    showPodium,
    setShowPodium,
    versDeposesEtEngages,
    mancheNumber,
    setMancheNumber,
    activePlayerId,
    setActivePlayerId,
    titanModes,
    setTitanModes,
    titanProfiles,
    setTitanProfiles,
    profilsImposes,
    setProfilsImposes,
    profilsReveles,
    revelerProfil,
    profileLabel,
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
    gameOver,
    show3D,
    setShow3D,
    showRules,
    setShowRules,
    showTutoriel,
    setShowTutoriel,
    vertAssignments,
    setVertAssignments,
    vertsValides,
    validerVerts,
    preScoreSansVerts,
    apocalypseThreshold,
    setApocalypseThreshold,
    regenerate,
    advanceManche,
    canValidatePhase,
    getPhaseBlockReason,
    validatePhase,
    selectedTitanId,
    // La sélection passe par le garde (cf. `selectionnerTitanDepuisInterface`) :
    // l'hôte ne s'assied pas sur le siège d'un invité, l'invité ne quitte pas
    // le sien. Le setter brut reste interne au contrôleur.
    setSelectedTitanId: selectionnerTitanDepuisInterface,
    selectedTitan,
    titansByCell,
    effectivePlayers,
    titansEnAttente,
    titanCorners,
    actionLog,
    journal,
    nommerLigne,
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
    jnpMode,
    setJnpMode,
    // Sans son setter : le compteur ne bouge que par le ramassage lui-même.
    jnpSelected,
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
    bbNextClickable,
    bbNextRoutes,
    bbSurvol,
    bbPathClick,
    bbUndoLastCell,
    bbDestIsBuilding,
    ecroulement,
    setEcroulement,
    ecroulementCells,
    repliQueue,
    // Exposé pour le test de non-régression du dédoublonnage : c'est le seul
    // moyen de vérifier la file sans rejouer une chaîne de réaction entière.
    enqueueReplis,
    currentRepli,
    choisirRepli,
    ecroulementPoserDebris,
    ecroulementAbandonner,
    decisionQueue,
    setDecisionQueue,
    progSelection,
    setProgSelection,
    progErreur,
    setProgErreur,
    progCountdown,
    setProgCountdown,
    progCountdownTimer,
    setProgCountdownTimer,
    volDirection,
    volResume,
    modeVolRepos,
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
    traceVol,
    setAnimLabel,
    cardsPlayedCountRef,
    pendingCardConfirm,
    setPendingCardConfirm,
    waitingNextTitan,
    setWaitingNextTitan,
    passerAuTitanSuivant,
    undoStack,
    undoTick,
    setUndoStack,
    captureSnapshot,
    /* Le même instantané, sans l'empiler. `captureSnapshot` sert à l'annulation,
       celui-ci à décrire l'état courant — c'est ce que l'hôte diffuse à chaque
       coup, et ce que les tests de partie à distance rejouent. */
    instantaneCourant,
    prevActivePlayerRef,
    handleUndo,
    aiTrigger,
    setAiTrigger,
    aiNextPlayerRef,
    aiStateRef,
    aiTitanStateRef,
    aiLooseBlocksRef,
    aiPassifUsedRef,
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
    validerVolMaintenant,
    canPlayCard,
    canDiscardCard,
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
    bbReach,
    toggleBbMode,
    jouerBoingBoing,
    moveMaxRange,
    coutRentreeCeTour,
    cornerChoice,
    chooseCornerEntry,
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
    jnpPickCell,
    jouerJeNePartagePas,
    jouerFautPasMeChauffer,
    pickFpmcTarget,
    updateFpmcBid,
    revealFPMC,
    fpmcRevelateur,
    jouerToutCasser,
    toutCasserFile,
    toutCasserResoudre,
    getVertCount,
    updateVertAssignment,
    finalScoreResult,
    classementFinalPartie,
    endGameReasons,
    /* LA FORCE DE LA MANCHE, LISIBLE PENDANT LA MANCHE (Nikola, 2026-09-01 :
       « affiche la force totale des cartes programmées, jouées ou non, à côté
       du seuil »). C'est le nombre que Faut Pas Me Chauffer compare, et il
       n'apparaissait nulle part : on le découvrait au moment de la
       confrontation, quand il est trop tard pour en tenir compte. Le calcul
       vient du moteur (`getProgrammedSum`), qui compte déjà les trois cartes
       de la Manche quel que soit leur sort — programmées, jouées, défaussées
       face cachée — et exclut la Zone Repos. */
    getProgrammedSum,
    boardSignature3D,
    perimeterCells,
    perimeterKeys,
    energie,
    stats,
    occupiedCount,
    phaseGuidance,
    decisionBloquante,
    fatigueEnAttente,
    refuserFatigueEnCours,
    accepterFatigueEnCours,
    placementRestant,
    placementCells,
    /* QUI POSE MAINTENANT — la même réponse que le bandeau de mise en place,
       donnée par la même règle. La grille la déduisait de son côté avec
       `placementRestant[0]`, qui n'est pas la même chose : la file garde son
       premier élément jusqu'à ce qu'un effet la solde, alors que le drapeau
       `aPlacer` bascule tout de suite. Un rendu durant, les cases s'allumaient
       donc dans la couleur du Titan PRÉCÉDENT — celui qui venait de poser
       (constaté en partie à distance le 2026-08-30, sur les deux écrans à la
       fois, donc bien local et pas réseau). */
    titanQuiPose: prochainAPlacer(placementRestant, titanState.players),
    placerTitanJoueur,
    terminerPlacement,
    tcSel,
    /* Ce que l'interface a besoin de savoir de la partie en ligne, et rien de
       plus : qui tient quoi (pour masquer ce qui ne le regarde pas), et
       comment redemander le plateau quand la liaison a hoqueté. */
    titanMasque,
    /* ── RAFRAÎCHIR EST UN GESTE D'HÔTE ──
       Nikola, 2026-09-01 : « seul l'hôte de la partie doit avoir le bouton
       rafraîchir, et pas besoin d'afficher du texte, juste le bouton suffit ».

       Chez un invité, ce bouton redemandait le plateau — un geste que la
       boucle de réception refait déjà d'elle-même à chaque coupure. Chez
       l'hôte, il ne faisait RIEN d'utile : remettre son propre compteur de
       version à zéro ne renvoie rien à personne, puisque c'est lui la source.

       Il devient donc ce qu'il aurait dû être : la commande qui REPOUSSE le
       plateau à toute la table. On vide les deux garde-fous d'envoi — celui du
       plateau public et celui des mains privées — et la prochaine diffusion
       repart entière, même si rien n'a bougé. C'est exactement ce qu'il faut
       quand un invité est resté avec un écran périmé. */
    resynchroniserSession: () => {
      if (distantHote) {
        dernierEnvoiRef.current = "";
        dernieresMainsRef.current = {};
        setDistantAvis("Plateau renvoyé à toute la table.");
        // L'avis n'est pas de l'état : il dit qu'un geste a eu lieu, et il
        // s'efface, sans quoi il resterait à l'écran toute la partie.
        setTimeout(() => setDistantAvis((a) => (a === "Plateau renvoyé à toute la table." ? null : a)), 4000);
        return;
      }
      sessionRef.current?.resynchroniser();
      setDistantAvis("Mise à jour demandée à l'hôte…");
    },
  };

  /* ── LES VRAIES FONCTIONS RESTENT SOUS LA MAIN DE L'HÔTE ──
     Le motif « ref sur la dernière version » : l'exécuteur d'intentions lit ici
     la fonction du rendu courant, sans que l'effet ait à dépendre des deux
     cents callbacks du contrôleur — un tableau de dépendances de cette taille
     ne serait ni lisible ni juste. */
  actionsRef.current = vm;

  /* ── CHEZ UN INVITÉ, UNE ACTION SE DEMANDE, ELLE NE S'EXÉCUTE PAS ──
     C'est le dernier maillon, et le seul endroit du jeu où l'interface diverge
     entre local et distant. Les panneaux appellent `vm.jouerBoingBoing()`
     exactement comme avant ; ici, cet appel devient un message.

     Le CONTEXTE part avec : les brouillons composés localement (le chemin en
     cours de tracé, la mise d'Adrénaline) n'existent que dans ce navigateur,
     et l'hôte doit les adopter avant de jouer. Sans eux, il exécuterait
     l'action avec SES propres réglages — c'est-à-dire, presque toujours, avec
     zéro Adrénaline et aucun chemin.

     Ce qui n'est PAS dans la liste blanche garde son comportement local : les
     bascules de mode, la sélection, l'affichage 3D, la page Règles. Ce sont des
     gestes qui ne touchent pas la partie, et les faire voyager n'aurait servi
     qu'à faire clignoter l'écran des autres. */
  if (distantInvite) {
    const contexteCourant = () => ({
      bbPath, bbAdrenaline, moveAdrenaline, teaAdrenaline, tcAdrenaline,
      progSelection, direction, teaMode,
    });

    /* ── CE QUI FERME UN MODE UNE FOIS LE COUP PARTI ──
       Nikola, 2026-08-30 : « je ne peux pas utiliser mon déplacement passif,
       quand je clique sur les cases rien ne se passe ».

       En local, chaque résolveur referme son propre mode (`jouerMouvementGratuit`
       fait `setMoveMode(false)` avant de résoudre). Chez un invité, ces
       fonctions ne s'exécutent pas : elles partent en message. Le mode restait
       donc ouvert après le coup, le plateau continuait d'inviter au clic, et le
       clic suivant repartait en intention que l'hôte refusait — un passif ne se
       joue qu'une fois par tour. Rien à l'écran ne disait que le coup était
       déjà parti.

       Ces actions-là referment donc leur mode ICI, sans attendre l'hôte. Ce
       n'est pas de l'optimisme sur le RÉSULTAT — le plateau ne bouge toujours
       que sur l'instantané reçu — seulement sur le fait que la demande est
       partie, ce qui est vrai. Si l'hôte refuse, le mode se rouvre d'un clic. */
    const REFERME_SON_MODE = new Set([
      "jouerMouvementGratuit", "jouerTeteEnAvant", "jouerBoingBoing",
      "jouerJeNePartagePas", "jouerGraouhhh", "jouerToutCasser",
      "jouerFautPasMeChauffer", "jouerRecuperation",
    ]);

    /* Un envoi refusé par le relais (plafond, table fermée) ou perdu en route
       ne disait RIEN : le mode se refermait comme si le coup était parti, et
       l'invité attendait un plateau qui ne viendrait pas (2026-09-14). Le
       refus s'affiche dans le bandeau de liaison. */
    const envoyerIntention = (nom, args, contexte) => {
      const envoi = sessionRef.current?.envoyerIntention(nom, args, contexte);
      envoi?.catch?.((e) => setDistantAvis(`Ton coup n'est pas parti : ${e?.message || "liaison coupée"} Rejoue-le.`));
      return envoi;
    };

    Object.keys(ACTIONS_DISTANTES).forEach((nom) => {
      if (typeof vm[nom] !== "function") return;
      vm[nom] = (...args) => {
        const envoi = envoyerIntention(nom, args, contexteCourant());
        if (REFERME_SON_MODE.has(nom)) { closeAllCardModes(); setMoveMode(false); setRecupMode(false); }
        return envoi;
      };
    });

    /* ── ANNULER TRAVERSE LE RÉSEAU COMME LE RESTE ──
       Il ne faisait rien du tout ici (« vm.handleUndo = () => {} »), au motif
       qu'un invité n'a pas de pile à dépiler. C'est vrai, et ce n'était pas une
       raison de lui retirer le geste : la pile de l'hôte, elle, contient
       exactement les coups que l'invité vient de faire jouer. Il demande donc
       à l'hôte de dépiler — cf. `handleUndo` dans ACTIONS_DISTANTES, portée
       « actif », qui borne le geste au tour en cours et donc à ses propres
       coups (la pile est vidée à chaque changement de Titan actif).

       `undoStack` ne sert à l'interface qu'à savoir COMBIEN de coups sont
       annulables : un tableau de la bonne longueur suffit, et évite d'envoyer
       à chaque invité une pile d'instantanés complets dont il ne ferait rien. */
    vm.undoStack = new Array(Number(etatDistantRecu?.profondeurUndo) || 0).fill(null);

    /* Choisir son Titan dans le salon. Ce n'est pas une action de jeu — l'hôte
       la traite avant sa liste blanche — mais elle voyage par le même canal :
       un invité ne dispose de rien d'autre pour se faire entendre. */
    vm.demanderSiege = (titanId) => sessionRef.current?.envoyerIntention("demanderSiege", [titanId], {})?.catch(avisEnvoiRate("Ta demande de siège"));
  }

  return vm;
}
