/* ============================================================
   PROJET TITAN — « Annuler » annule TOUT ce qu'une action a fait
   ============================================================
   Demande de Nikola du 2026-08-18 : « la fonction Annuler annule bien les
   actions jouées, donc placement, perte de débris, etc. — tout ce qu'une
   action fait peut être annulable si on clique sur le bouton. »

   L'instantané ne couvrait que le plateau, les Titans et les débris. Tout ce
   qu'une action laisse EN ATTENTE en était absent — et le retour en arrière
   VIDAIT ces files au lieu de les restaurer. Un Dilemme non tranché, un
   Titan poussé hors du ring, un repli en suspens : l'action était défaite à
   moitié.

   Ces tests passent par le vrai contrôleur, seul endroit où vit la pile
   d'annulation — ni le simulateur ni le domaine ne peuvent les voir.
============================================================ */
import { afterEach, describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";

let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours">Manche {vm.mancheNumber}</div>;
}

async function lancerUnePartie() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  return vmCourant;
}

describe("Annuler restaure l'état complet du jeu", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("ramène sur le plateau un Titan parti dans la gouttière", async () => {
    await lancerUnePartie();

    act(() => {
      vmCourant.captureSnapshot();
    });
    // On simule ce que fait une projection : le Titan quitte le ring et
    // attend son tour dans la gouttière.
    act(() => {
      const joueur = vmCourant.titanState.players[0];
      joueur.horsPlateau = true;
      joueur.cell = "A1";
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });
    expect(vmCourant.titansEnAttente).toHaveLength(1);

    act(() => { vmCourant.handleUndo(); });
    expect(vmCourant.titansEnAttente).toHaveLength(0);
    expect(vmCourant.titanState.players[0].horsPlateau).toBeFalsy();
  });

  it("repose une décision DIL non tranchée au lieu de la faire disparaître", async () => {
    await lancerUnePartie();

    // Une décision en attente, exactement comme en produit une carte.
    act(() => {
      vmCourant.setDecisionQueue([{
        id: "test", type: "DIL", attackerId: 1, defenderId: 2,
        cardLabel: "Tête en Avant", cellAtImpact: "B2", destination: "sol",
        stage: "ATTACKER_PICK", attackerChoices: [],
      }]);
    });
    expect(vmCourant.decisionQueue).toHaveLength(1);

    // Le joueur enchaîne une action, puis se ravise.
    act(() => { vmCourant.captureSnapshot(); });
    act(() => { vmCourant.setDecisionQueue([]); });
    act(() => { vmCourant.handleUndo(); });

    // La décision est de retour : l'annulation défait l'action, elle
    // n'efface pas ce qui restait dû.
    expect(vmCourant.decisionQueue).toHaveLength(1);
    expect(vmCourant.decisionQueue[0].defenderId).toBe(2);
  });

  it("rend les blocs perdus et remet la Manche où elle était", async () => {
    await lancerUnePartie();
    const avant = vmCourant.titanState.players[1].repaire.length;
    const mancheAvant = vmCourant.mancheNumber;

    act(() => { vmCourant.captureSnapshot(); });
    act(() => {
      vmCourant.titanState.players[1].repaire.push("rouge", "bleu");
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
      vmCourant.setMancheNumber((n) => n + 1);
    });
    expect(vmCourant.titanState.players[1].repaire.length).toBe(avant + 2);

    act(() => { vmCourant.handleUndo(); });
    expect(vmCourant.titanState.players[1].repaire.length).toBe(avant);
    expect(vmCourant.mancheNumber).toBe(mancheAvant);
  });
});

describe("Une seule décision bloquante à l'écran", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("le Dilemme passe avant la Phase Repos, jamais les deux ensemble", async () => {
    await lancerUnePartie();

    act(() => {
      vmCourant.setPhase("repos");
      vmCourant.setDecisionQueue([{
        id: "test", type: "DIL", attackerId: 1, defenderId: 2,
        cardLabel: "Graouhhh", cellAtImpact: "B2", destination: "sol",
        stage: "ATTACKER_PICK", attackerChoices: [],
      }]);
    });

    // Les deux prétendent à l'écran ; c'est le Dilemme qui l'occupe.
    expect(vmCourant.phase).toBe("repos");
    expect(vmCourant.decisionBloquante).toBe("dil");

    act(() => { vmCourant.setDecisionQueue([]); });
    expect(vmCourant.decisionBloquante).toBe("vol");
  });
});
