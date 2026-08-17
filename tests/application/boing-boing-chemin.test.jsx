/* ============================================================
   PROJET TITAN — Boing Boing : chemin cliqué case par case
   ============================================================
   Retour Nikola (test à la table, 2026-08-18) : « je dois indiquer par
   plusieurs clics sur les différentes cases mon chemin, pour que ce soit
   clair pour tout le monde. » Un seul clic sur la destination laissait le
   moteur choisir sa propre trajectoire (la plus courte) sans jamais la
   montrer. Ce test verrouille le tracé manuel : coût 0 entre deux
   obstacles du même groupe collé, coût 1 sinon, recliquer une case du
   chemin y revient, et on ne peut pas VALIDER un atterrissage sur un
   bâtiment encore debout — seulement le traverser en vol.
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

async function partieAvecUnGroupeColle() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

  const t1 = vmCourant.titanState.players[0];
  act(() => {
    // E5 et E6 forment un groupe collé (Moore-adjacents), E7 reste vide :
    // exactement l'exemple du livret validé avec Nikola le 2026-08-17.
    t1.cell = "E4";
    t1.programmed = ["boing_boing"];
    vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    vmCourant.setState((prev) => ({
      ...prev,
      board: {
        ...prev.board,
        E5: { row: "E", col: 5, blocks: ["bleu"], socle: 1, isTeleporter: false },
        E6: { row: "E", col: 6, blocks: ["rose"], socle: 1, isTeleporter: false },
        E7: { row: "E", col: 7, blocks: [], socle: 1, isTeleporter: false },
      },
    }));
    vmCourant.setPhase("action");
    vmCourant.setActivePlayerId(t1.id);
    vmCourant.setSelectedTitanId(t1.id);
    vmCourant.toggleBbMode();
  });
  return t1;
}

describe("Boing Boing : chemin tracé case par case", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("applique le coût 0 entre deux obstacles collés, 1 sinon, et refuse un clic non adjacent", async () => {
    await partieAvecUnGroupeColle();

    // E9 n'est adjacente à rien du chemin (encore vide, donc à la case du
    // Titan E4) : le clic ne doit produire aucun effet.
    act(() => { vmCourant.bbPathClick("E9"); });
    expect(vmCourant.bbPath).toEqual([]);

    act(() => { vmCourant.bbPathClick("E5"); }); // 1er pas : E4 (origine) -> E5, coût 1
    expect(vmCourant.bbPath).toEqual(["E5"]);
    expect(vmCourant.bbBudgetUsed).toBe(1);

    act(() => { vmCourant.bbPathClick("E6"); }); // E5 et E6 collés : coût 0
    expect(vmCourant.bbPath).toEqual(["E5", "E6"]);
    expect(vmCourant.bbBudgetUsed).toBe(1);

    act(() => { vmCourant.bbPathClick("E7"); }); // E6 collé, E7 vide : coût 1
    expect(vmCourant.bbPath).toEqual(["E5", "E6", "E7"]);
    expect(vmCourant.bbBudgetUsed).toBe(2);
    expect(vmCourant.bbDest).toBe("E7");
  });

  it("recliquer une case déjà dans le chemin y revient", async () => {
    await partieAvecUnGroupeColle();
    act(() => { vmCourant.bbPathClick("E5"); });
    act(() => { vmCourant.bbPathClick("E6"); });
    act(() => { vmCourant.bbPathClick("E7"); });
    expect(vmCourant.bbPath).toEqual(["E5", "E6", "E7"]);

    act(() => { vmCourant.bbPathClick("E5"); });
    expect(vmCourant.bbPath).toEqual(["E5"]);
    expect(vmCourant.bbDest).toBe("E5");
  });

  it("ne peut pas valider un atterrissage sur un bâtiment encore debout", async () => {
    const t1 = await partieAvecUnGroupeColle();
    act(() => { vmCourant.bbPathClick("E5"); });
    expect(vmCourant.bbDest).toBe("E5");
    expect(vmCourant.bbDestIsBuilding).toBe(true);

    act(() => { vmCourant.jouerBoingBoing(); });
    // Rien ne s'est passé : le chemin et la position du Titan n'ont pas bougé.
    expect(vmCourant.bbPath).toEqual(["E5"]);
    expect(vmCourant.titanState.players.find((p) => p.id === t1.id).cell).toBe("E4");

    act(() => { vmCourant.bbPathClick("E6"); });
    act(() => { vmCourant.bbPathClick("E7"); });
    expect(vmCourant.bbDestIsBuilding).toBe(false);

    act(() => { vmCourant.jouerBoingBoing(); });
    expect(vmCourant.titanState.players.find((p) => p.id === t1.id).cell).toBe("E7");
  });
});
