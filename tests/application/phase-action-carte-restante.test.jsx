/* ============================================================
   PROJET TITAN — La Programmation ne démarre jamais sur une carte due
   ============================================================
   Retour Nikola (test à la table, 2026-08-18) : « il me restait une carte à
   jouer, mais la phase est passée au round suivant… je devais choisir trois
   nouvelles cartes alors qu'il m'en restait une, plus visible ni jouable. »

   `advanceActionRound` valide la Phase Action pour TOUT LE MONDE dès que son
   compteur de rounds atteint 3, sans regarder si les cartes ont réellement
   été jouées. Le moindre écart entre le compteur et la réalité enterrait une
   carte encore programmée et ouvrait la Programmation par-dessus — état
   contradictoire dont on ne peut plus sortir.

   Ce test force l'écart directement (compteur à 3, une carte encore
   programmée), sans présumer du chemin qui l'a produit : c'est le SYMPTÔME
   qu'on verrouille, pas une seule de ses causes.
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
  return <div data-testid="partie-en-cours" />;
}

describe("Fin de Phase Action et cartes encore programmées", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("ne bascule pas en Programmation tant qu'un Titan a une carte due", async () => {
    vmCourant = null;
    const user = userEvent.setup();
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    const ids = vmCourant.titanState.ordreJeu;
    const enRetard = ids[1];

    act(() => {
      vmCourant.setPhase("action");
      vmCourant.titanState.players.forEach((t) => {
        t.programmed = t.id === enRetard ? ["boing_boing"] : [];
      });
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });

    // Le compteur de rounds prétend que tout le monde a joué ses 3 cartes,
    // et la phase est validée pour tous : exactement l'état de Nikola.
    act(() => {
      const tous = {};
      ids.forEach((id) => { tous[id] = true; });
      vmCourant.setPhaseValidated(tous);
    });

    // La Programmation NE démarre PAS, et la main revient au Titan en retard.
    expect(vmCourant.phase).toBe("action");
    expect(vmCourant.activePlayerId).toBe(enRetard);
    expect(vmCourant.titanState.players.find((t) => t.id === enRetard).programmed)
      .toEqual(["boing_boing"]);
    // Sa carte est de nouveau réellement jouable, pas seulement affichée.
    act(() => { vmCourant.setSelectedTitanId(enRetard); });
    expect(vmCourant.canPlayCard("boing_boing")).toBe(true);
  });

  it("laisse la phase se clore normalement quand plus personne n'a de carte", async () => {
    vmCourant = null;
    const user = userEvent.setup();
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    const ids = vmCourant.titanState.ordreJeu;
    act(() => {
      vmCourant.setPhase("action");
      vmCourant.titanState.players.forEach((t) => { t.programmed = []; });
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });
    act(() => {
      const tous = {};
      ids.forEach((id) => { tous[id] = true; });
      vmCourant.setPhaseValidated(tous);
    });

    expect(vmCourant.phase).not.toBe("action");
  });
});
