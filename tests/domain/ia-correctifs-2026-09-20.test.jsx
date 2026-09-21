/* ============================================================
   PROJET TITAN — Non-régression de l'audit d'IA du 2026-09-20
   ============================================================
   Six bugs, une seule cause : l'IA a DEUX cerveaux. `aiPlanner` /
   `aiEvaluation` simulent le coup avec les vrais résolveurs — c'est celui que
   les campagnes mesurent et que les tests couvrent. Puis le contrôleur
   applicatif résout pour de vrai ce que la recherche avait projeté, avec sa
   propre table de valeur écrite à la main.

   Les six défauts vivaient TOUS dans l'écart entre les deux, jamais dans l'un
   des deux pris isolément. Aucun test existant ne pouvait les voir : ils
   portent sur un chemin à la fois.

   Chacun des tests ci-dessous ÉCHOUAIT avant sa correction. C'est la seule
   garantie qu'une refonte ne les rouvre pas — Faut Pas Me Chauffer est déjà
   sortie du domaine trois fois de suite.
============================================================ */
import { afterEach, describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { appliquerDecisions, planCardPlay, planTour } from "../../src/domain/aiPlanner.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../../src/domain/aiEvaluation.js";
import { makeDecisionRequest, scoreBareme } from "../../src/domain/gameRules.js";
import { setSeed } from "../../src/domain/rng.js";
import {
  marginalValue,
  useBoardGeneratorController,
} from "../../src/application/useBoardGeneratorController.jsx";

const titan = (id, extra = {}) => ({
  id, cell: "E5", repaire: [], socles: [], bagarre: 0, destruction: 0,
  adrenaline: 0, programmed: [], hand: [], repos: [],
  playedThisManche: [], discardedHidden: [], ...extra,
});
const expert = makeProfile(FORCES.EXPERT, TEMPERAMENTS.OPPORTUNISTE);

/* ────────────────────────────────────────────────────────────
   1 · L'ORANGE VALAIT 0, POUR TOUS LES COMPTES
   La garde `counts.orange % 2 === 1` avait sa condition à l'envers :
   `counts` est le compte AVANT ajout, donc impair = le bloc COMPLÈTE la
   paire, le seul cas où il vaut quelque chose. Elle annulait exactement ce
   qu'elle devait protéger. Conséquence : aucune IA ne volait un Orange en
   RAGE, n'en proposait un en Dilemme, ni ne payait pour garder une paire —
   sur le barème le plus raide du jeu.
──────────────────────────────────────────────────────────── */
describe("marginalValue — l'Orange se compte par paires, pas à zéro", () => {
  const seul = [{ id: 2, repaire: [] }];

  it("chiffre le bloc qui COMPLÈTE une paire à ce que la paire rapporte", () => {
    // 1 Orange en Repaire : le 2e ouvre la première paire, 5 points.
    expect(marginalValue("orange", ["orange"], seul, 1)).toBe(5);
    // 3 Orange : le 4e ouvre la deuxième paire, 11 - 5 = 6 points.
    expect(marginalValue("orange", Array(3).fill("orange"), seul, 1)).toBe(6);
  });

  it("laisse le bloc IMPAIR à zéro — c'est le barème qui le dit, pas une garde", () => {
    expect(marginalValue("orange", [], seul, 1)).toBe(0);
    expect(marginalValue("orange", Array(2).fill("orange"), seul, 1)).toBe(0);
  });

  it("colle au barème réel sur toute la plage", () => {
    for (let n = 0; n <= 7; n++) {
      const attendu = scoreBareme("orange", n + 1) - scoreBareme("orange", n);
      expect(marginalValue("orange", Array(n).fill("orange"), seul, 1)).toBe(attendu);
    }
  });
});

/* ────────────────────────────────────────────────────────────
   2 · LE BONUS ROSE ÉTAIT RECOMPTÉ À CHAQUE ROSE
   Il est acquis une fois pour toutes par le bloc qui prend la tête. L'ancien
   calcul le recréditait sur chacun : une IA déjà en tête surpayait tout vol
   de Rose de dix points, et un défenseur payait une Adrénaline pour protéger
   un bonus qu'il ne pouvait plus perdre.
──────────────────────────────────────────────────────────── */
describe("marginalValue — le bonus Rose est un écart, pas un forfait", () => {
  const rival = [{ id: 2, repaire: ["rose", "rose"] }];

  it("crédite le bonus au bloc qui fait basculer le classement", () => {
    // 1 → 2 Roses : égalité avec le rival, la moitié du bonus. Barème 4-2=2.
    expect(marginalValue("rose", ["rose"], rival, 1)).toBe(2 + 5);
    // 2 → 3 : passe en tête, l'autre moitié. Barème 6-4=2.
    expect(marginalValue("rose", Array(2).fill("rose"), rival, 1)).toBe(2 + 5);
  });

  it("ne le crédite plus une fois la tête acquise", () => {
    // 3 → 4 Roses, rival à 2 : le bonus est déjà à moi, il ne rebascule pas.
    // Reste le seul barème, 8 - 6 = 2. Rendait 12 avant correction.
    expect(marginalValue("rose", Array(3).fill("rose"), rival, 1)).toBe(2);
    expect(marginalValue("rose", Array(4).fill("rose"), rival, 1))
      .toBe(scoreBareme("rose", 5) - scoreBareme("rose", 4));
  });

  it("donne bien le bonus plein au premier Rose quand personne n'en a", () => {
    const personne = [{ id: 2, repaire: [] }];
    expect(marginalValue("rose", [], personne, 1)).toBe(2 + 10);
  });
});

/* ────────────────────────────────────────────────────────────
   3 · LE CLONE DE RECHERCHE PERDAIT LE RÉGLAGE DE TABLE
   `cloneEtat` ne transportait pas `egalitesLanterneRouge`. `isLanterneRouge`
   retombait donc sur `true` dans toute la recherche passant par `planTour` —
   c'est-à-dire les quatre niveaux. L'IA programmait un Je Ne Partage Pas sur
   TROIS cases, le contrôleur en attendait deux sur l'état réel, et
   `resolveJeNePartagePas` refusait la sélection entière : carte perdue.
──────────────────────────────────────────────────────────── */
describe("planTour — la Lanterne Rouge suit le réglage de la table", () => {
  const partieAEgalite = (egalites) => ({
    board: {},
    looseBlocks: { D4: ["rouge"], D5: ["rouge"], D6: ["rouge"], E4: ["rouge"], E6: ["rouge"], F4: ["rouge"] },
    titans: [
      titan(1, { repaire: ["bleu"], programmed: ["je_ne_partage_pas"] }),
      titan(2, { repaire: ["bleu"], cell: "A1" }),
    ],
    egalitesLanterneRouge: egalites,
  });

  it("ramasse 2 blocs quand les égalités sont décochées, même en passant par le clone", () => {
    setSeed(1);
    const direct = planCardPlay(1, partieAEgalite(false), expert, 1);
    setSeed(1);
    const viaTour = planTour(1, partieAEgalite(false), expert, 1, 2);
    // Les deux chemins doivent dire la même chose : c'est tout l'enjeu.
    expect(direct.jnpCells).toHaveLength(2);
    expect(viaTour.coup.jnpCells).toHaveLength(2);
  });

  it("en ramasse 3 quand les égalités sont actives", () => {
    setSeed(1);
    expect(planTour(1, partieAEgalite(true), expert, 1, 2).coup.jnpCells).toHaveLength(3);
  });
});

/* ────────────────────────────────────────────────────────────
   6 · UN DILEMME REFUSÉ RAPPORTE L'ADRÉNALINE À L'ATTAQUANT
   Le moteur la lui donne (`autoResolveIaDecisions`, comme la file humaine) ;
   le modèle de recherche l'effaçait. L'IA croyait donc qu'un Dilemme refusé
   ne lui rapportait rien, et sous-estimait d'autant ses cartes offensives.
──────────────────────────────────────────────────────────── */
describe("appliquerDecisions — le Dilemme payé n'est pas un Dilemme perdu", () => {
  it("crédite l'attaquant de l'Adrénaline que la cible lâche pour annuler", () => {
    // Cible riche en points et pourvue d'une Adrénaline : elle préfère payer.
    const etat = {
      board: {}, looseBlocks: {},
      titans: [
        titan(1, { adrenaline: 0 }),
        titan(2, { adrenaline: 1, repaire: ["rouge", "rouge", "rouge", "rose", "rose"] }),
      ],
    };
    appliquerDecisions(
      [makeDecisionRequest("DIL", 1, 2, "Tête en Avant", "E6")],
      etat, expert
    );
    const [attaquant, defenseur] = etat.titans;
    expect(defenseur.adrenaline).toBe(0);
    expect(attaquant.adrenaline).toBe(1); // valait 0 avant correction
    expect(defenseur.repaire).toHaveLength(5); // elle a payé, elle garde tout
  });
});

/* ────────────────────────────────────────────────────────────
   5 · RAGE — L'ADRÉNALINE EST UNE OPTION, PAS UN PIS-ALLER
   Le moteur ne la prenait que si le Repaire était VIDE. Le correctif FAQ #5
   n'avait été appliqué qu'au modèle de recherche : la recherche prévoyait
   l'Adrénaline, la partie prenait un bloc.

   `autoResolveIaDecisions` prend ses modes et ses joueurs en paramètres : on
   l'appelle directement, sans dérouler un tour d'IA derrière ses minuteries.
──────────────────────────────────────────────────────────── */
let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours" />;
}

describe("RAGE résolue par le moteur — l'Adrénaline est ciblable", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  const monter = async () => {
    vmCourant = null;
    const user = userEvent.setup();
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  };

  it("arrache l'Adrénaline plutôt qu'un bloc sans valeur, Repaire NON vide", async () => {
    await monter();
    const modes = { 1: "ia", 2: "ia" };
    // La cible ne détient qu'un Orange IMPAIR : il ne vaut rien à personne.
    // Son Adrénaline, elle, vaut un point à l'attaquant qui n'en a aucune.
    const joueurs = [
      titan(1, { adrenaline: 0, repaire: [] }),
      titan(2, { adrenaline: 1, repaire: ["orange"], cell: "E6" }),
    ];
    act(() => {
      vmCourant.autoResolveIaDecisions(
        [makeDecisionRequest("RAGE", 1, 2, "Tête en Avant", "E6")],
        modes, joueurs
      );
    });
    expect(joueurs[1].adrenaline).toBe(0);
    expect(joueurs[0].adrenaline).toBe(1); // ne bougeait pas avant correction
    expect(joueurs[1].repaire).toEqual(["orange"]); // le bloc nul reste chez elle
  });

  it("préfère toujours le bloc quand il vaut plus que l'Adrénaline", async () => {
    await monter();
    const modes = { 1: "ia", 2: "ia" };
    // Un Rouge : 3 points secs pour l'attaquant, contre 1 pour une Adrénaline.
    const joueurs = [
      titan(1, { adrenaline: 0, repaire: [] }),
      titan(2, { adrenaline: 1, repaire: ["rouge"], cell: "E6" }),
    ];
    act(() => {
      vmCourant.autoResolveIaDecisions(
        [makeDecisionRequest("RAGE", 1, 2, "Tête en Avant", "E6")],
        modes, joueurs
      );
    });
    expect(joueurs[1].repaire).toEqual([]);
    expect(joueurs[0].repaire).toEqual(["rouge"]);
    expect(joueurs[1].adrenaline).toBe(1);
  });
});
