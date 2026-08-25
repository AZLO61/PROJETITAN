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
import DecisionPanels from "./panels/DecisionPanels.jsx";
import { T, marquee, readout, label } from "./theme.js";
import Icon from "./icons.jsx";

/* ── LE FRONTON ────────────────────────────────────────────
   Le haut d'une borne d'arcade porte son titre en grand, éclairé par
   l'arrière, et juste dessous l'afficheur : où on en est. C'est la première
   chose lue depuis l'autre bout de la table, donc c'est la seule chose de
   cette taille sur tout l'écran. */
function Marquee({ mancheNumber, totalManches, phaseLabel, detonateurNom }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: T.s4,
        flexWrap: "wrap",
        paddingBottom: T.s3,
        marginBottom: T.s4,
        borderBottom: `2px solid ${T.ruleStrong}`,
      }}
    >
      <div>
        <h1
          style={{
            ...marquee("clamp(1.6rem, 4.5vw, 2.6rem)", T.you),
            display: "flex",
            alignItems: "baseline",
            gap: ".35em",
          }}
        >
          Projet Titan
        </h1>
        <div style={{ ...label(T.faint), marginTop: 6 }}>
          BIG CITY — {detonateurNom ? `Détonateur ${detonateurNom}` : "9 × 9"}
        </div>
      </div>

      {/* L'afficheur : Manche et Phase, en police bitmap, alignés à droite
          comme le compteur de crédits d'une borne. */}
      <div style={{ display: "flex", alignItems: "center", gap: T.s5 }}>
        <div>
          <div style={label(T.faint)}>Manche</div>
          <div style={{ ...readout("1.5rem", T.text), marginTop: 6 }}>
            {mancheNumber}
            <span style={{ color: T.faint }}>/{totalManches}</span>
          </div>
        </div>
        <div>
          <div style={label(T.faint)}>Phase</div>
          <div
            style={{
              ...marquee("1.05rem", T.go),
              marginTop: 6,
              whiteSpace: "nowrap",
            }}
          >
            {phaseLabel}
          </div>
        </div>
      </div>
    </header>
  );
}

export default function GameView(vm) {
  /* Le libellé de phase vivait dans un panneau supprimé depuis. Il revient
     ici, au seul endroit où il ne coûte pas une ligne d'écran : dans
     l'afficheur du fronton, à côté du numéro de Manche qu'il qualifie. */
  const PHASES = {
    programmation: "Programmation",
    action: "Action",
    evenement: "Événement",
    repos: "Repos",
  };
  const phaseLabel = vm.gameOver ? "Terminée" : PHASES[vm.phase] || vm.phase;
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
        padding: "16px 14px",
        maxWidth: 880,
        margin: "0 auto",
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
          phaseLabel={phaseLabel}
          detonateurNom={detonateurNom}
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
        {vm.decisionBloquante === "coin" && <CornerChoiceBanner vm={vm} />}
        {vm.decisionBloquante === "dil" && <DilRageBanner vm={vm} />}
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
          <div className="titan-layout">
            <div style={{ minWidth: 0 }}>
              <RoundPanels vm={vm} />
            </div>
            <div className="titan-layout__aside" style={{ minWidth: 0 }}>
              <BoardPanel vm={vm} />
              <DecisionPanels vm={vm} />
            </div>
          </div>
        )}

        {/* La graine, en pied de meuble : c'est une plaque signalétique, pas
            une information de jeu. Elle ne mérite pas une ligne en haut de
            l'écran, mais elle doit rester lisible pour rejouer une partie. */}
        <footer
          style={{
            marginTop: T.s5,
            paddingTop: T.s3,
            borderTop: `1px solid ${T.rule}`,
            display: "flex",
            alignItems: "center",
            gap: T.s2,
            ...label(T.faint),
          }}
          title={
            vm.gameSeed != null
              ? `Partie n°${vm.seedCount} · graine ${vm.gameSeed} — relance une partie avec cette graine pour la rejouer à l'identique`
              : `Partie n°${vm.seedCount}`
          }
        >
          <Icon name="socle" size={13} />
          Partie {vm.seedCount}
          {vm.gameSeed != null && (
            <>
              <span aria-hidden="true">·</span>
              <span style={readout(T.micro, T.faint)}>graine {vm.gameSeed}</span>
            </>
          )}
        </footer>
      </div>

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
