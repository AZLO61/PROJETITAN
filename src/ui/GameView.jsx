import React, { Suspense, lazy } from "react";
// Même traitement que la vue 3D : la page Règles n'est chargée qu'à la
// première ouverture, elle ne pèse pas sur le démarrage du jeu.
const RulesPage = lazy(() => import("./rules/RulesPage.jsx"));
import HeaderPhase from "./panels/HeaderPhase.jsx";
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
import { T, marquee, readout, label } from "./theme.js";
import Icon from "./icons.jsx";

/* ── LE FRONTON ────────────────────────────────────────────
   Le haut d'une borne d'arcade porte son titre en grand, éclairé par
   l'arrière, et juste dessous l'afficheur : où on en est. C'est la première
   chose lue depuis l'autre bout de la table, donc c'est la seule chose de
   cette taille sur tout l'écran. */
function Marquee({
  mancheNumber, totalManches, phase, detonateurNom,
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

  return (
    /* Ce bandeau était plus haut de moitié : le titre montait à 2,6 rem et
       chaque bloc portait sa propre ligne de libellé. Retour de Nikola : « je
       dois défiler un peu vers le bas pour avoir le plateau lisible avec les
       informations de jeu ». Le fronton d'une borne se lit une fois en
       s'asseyant ; c'est le plateau qu'on regarde pendant 1 h 30. Il rend donc
       la hauteur au jeu — le grand format reste sur l'écran d'accueil, où il a
       toute la place. */
    <header
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: T.s4,
        flexWrap: "wrap",
        paddingBottom: T.s2,
        marginBottom: T.s3,
        borderBottom: `2px solid ${T.ruleStrong}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: T.s3, flexWrap: "wrap" }}>
        <h1 style={marquee("clamp(1.25rem, 2.6vw, 1.75rem)", T.you)}>Projet Titan</h1>
        <span style={label(T.faint)}>
          BIG CITY{detonateurNom ? ` — Détonateur ${detonateurNom}` : ""}
        </span>
      </div>

      {/* L'afficheur : Manche et Phase, en police bitmap, alignés à droite
          comme le compteur de crédits d'une borne. Sur une seule ligne, le
          libellé devant la valeur : deux lignes empilées coûtaient 30 px de
          plateau pour deux mots qu'on lit une fois par Manche. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: T.s4, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: T.s2 }}>
            <span style={label(derniereManche ? T.stop : T.faint)}>Manche</span>
            <span style={readout("0.95rem", derniereManche ? T.stop : T.text)}>
              {mancheNumber}
              <span style={{ color: derniereManche ? T.stop : T.faint, opacity: derniereManche ? 0.7 : 1 }}>
                /{totalManches}
              </span>
            </span>
          </span>
          {derniereManche && (
            <span
              title="Dernière Manche de la partie : après elle, on compte les points."
              style={{
                ...label(T.stop, T.micro),
                border: `1px solid ${T.stop}`,
                padding: "1px 6px",
                whiteSpace: "nowrap",
                cursor: "help",
              }}
            >
              Dernière Manche
            </span>
          )}
          {!derniereManche && finsPlateau.length > 0 && (
            <span
              title={["La partie s'arrêtera à la fin de cette Manche :", ...finsPlateau].join(" · ")}
              style={{
                ...label(T.stop, T.micro),
                border: `1px solid ${T.stop}`,
                padding: "1px 6px",
                whiteSpace: "nowrap",
                cursor: "help",
              }}
            >
              Dernière Manche — seuil atteint
            </span>
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
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: T.s2 }}>
          <span style={label(T.faint)}>Phase</span>
          <span style={{ ...marquee("0.95rem", phase.couleur), whiteSpace: "nowrap" }}>{phase.mot}</span>
        </span>
      </div>
    </header>
  );
}

export default function GameView(vm) {
  /* CHAQUE PHASE A SA COULEUR (demande de Nikola).

     Le mot était toujours vert, donc il ne disait que « il y a une phase ».
     Il porte maintenant l'information : on sait où on en est dans la Manche
     sans lire, à la couleur seule, depuis l'autre bout de la table.

     Les couleurs ne sont pas décoratives, elles reprennent le sens que le
     signal a déjà partout ailleurs dans le jeu : le cyan du passif pour la
     Programmation, qui prépare ; le jaune du tour pour l'Action, où l'on
     joue ; le violet du téléporteur pour l'Événement, qui vient de dehors ;
     le vert du disponible pour le Repos, qui rend les cartes ; le rouge du
     blocage quand la partie est finie. */
  const PHASES = {
    programmation: { mot: "Programmation", couleur: T.move },
    action: { mot: "Action", couleur: T.you },
    evenement: { mot: "Événement", couleur: T.tele },
    repos: { mot: "Repos", couleur: T.go },
  };
  const phaseCourante = vm.gameOver
    ? { mot: "Terminée", couleur: T.stop }
    : PHASES[vm.phase] || { mot: vm.phase, couleur: T.dim };
  const detonateurNom = vm.titanState?.detonateur
    ? vm.titanDisplayName(vm.titanState.detonateur)
    : null;

  return (
    <div
      className="titan-cabinet"
      style={{
        fontFamily: T.ui,
        background: T.screen,
        color: T.text,
        padding: "12px 14px",
        maxWidth: 880,
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      {/* Le contenu passe au-dessus des lignes de balayage et du vignettage,
          qui sont posés par ::before/::after du meuble. */}
      <div style={{ position: "relative", zIndex: 3 }}>
        <Marquee
          mancheNumber={vm.mancheNumber}
          totalManches={vm.manchesMaxPartie}
          phase={phaseCourante}
          detonateurNom={detonateurNom}
          occupiedCount={vm.occupiedCount}
          apocalypseThreshold={vm.apocalypseThreshold}
          endGameReasons={vm.endGameReasons}
        />

        <HeaderPhase vm={vm} />


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
        {vm.decisionBloquante === "placement" && <PlacementBanner vm={vm} />}
        {vm.decisionBloquante === "toutcasser" && <ToutCasserBanner vm={vm} />}
        {vm.decisionBloquante === "coin" && <CornerChoiceBanner vm={vm} />}
        {vm.decisionBloquante === "dil" && <DilRageBanner vm={vm} />}
        {vm.decisionBloquante === "fatigue" && <FatigueBanner vm={vm} />}
        {vm.decisionBloquante === "repli" && <RepliBanner vm={vm} />}
        {vm.decisionBloquante === "fpmc" && <FpmcBanner vm={vm} />}
        {vm.decisionBloquante === "vol" && <RepoVolBanner vm={vm} />}

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
            <RoundPanels vm={vm} />
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
              <RoundPanels vm={vm} />
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
          <RulesPage onClose={() => vm.setShowRules(false)} />
        </Suspense>
      )}
    </div>
  );
}
