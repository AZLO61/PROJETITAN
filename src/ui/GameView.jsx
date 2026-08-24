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

export default function GameView(vm) {
  return (
    <div style={{
      fontFamily: "'Outfit', Arial, sans-serif",
      background: "linear-gradient(180deg, #2d1d5d 0%, #0a0212 100%)",
      color: "#fffaee", padding: "12px 10px", borderRadius: 16,
      maxWidth: 820, margin: "0 auto", boxSizing: "border-box",
    }}>
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
          catégorie ; là c'est bloqué, je ne peux rien faire alors que j'ai
          bien un Vert. Je suis repassé en Programmation mais en Manche 4,
          donc il n'y a rien qui se passe. »

          La partie repartait pour une Manche fantôme (corrigé côté
          contrôleur, cf. `gameOver`) ET l'écran de score restait enterré tout
          en bas de la page, sous le plateau, les panneaux de tour et le
          journal. Le placement secret des Verts, qui est le tout dernier
          geste de la partie, était donc invisible.

          Une fois la partie finie, le décompte passe EN TÊTE.

          Point 4.4 du 2026-08-19 : « maintenir le plateau et la carte
          totalement visibles et consultables même après l'affichage de
          l'écran de scoring final ». Le 17 août, tout avait été masqué
          derrière le décompte ; à la table, on veut au contraire pouvoir
          revenir sur le plateau pour comprendre le score, recompter un
          Périmètre ou montrer une position aux autres joueurs.

          Le plateau revient donc SOUS le décompte, en consultation seule :
          `clicCase` n'y route plus que la fiche d'un bâtiment et la sélection
          d'un Titan (cf. le garde `gameOver` dans RoundPanels). Les commandes
          de jeu (BoardPanel), elles, restent masquées : la partie est finie,
          il n'y a plus rien à jouer. */}
      {vm.gameOver ? (
        <>
          <DecisionPanels vm={vm} />
          <RoundPanels vm={vm} />
        </>
      ) : (
        <>
          <RoundPanels vm={vm} />
          <BoardPanel vm={vm} />
          <DecisionPanels vm={vm} />
        </>
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
