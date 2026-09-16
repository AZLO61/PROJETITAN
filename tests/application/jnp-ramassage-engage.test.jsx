/* ============================================================
   PROJET TITAN — Un ramassage engagé se termine avant tout le reste
   ============================================================
   Nikola, 2026-09-16 : « régler le souci d'ouvrir une autre carte pendant un
   ramassage remet le compteur à zéro, y compris pendant celui d'un invité ».

   Dès le premier bloc, Je Ne Partage Pas est jouée. Ouvrir une autre carte
   refermait les modes ET vidait le compteur : le quota repartait de zéro sur
   un Repaire qui gardait tout. Chez l'hôte, n'importe quel geste d'interface
   faisait de même pendant le ramassage d'un invité — ce sont les mêmes
   fonctions, c'est donc le même test.
============================================================ */
import { afterEach, describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { getPerimeter } from "../../src/domain/gameRules.js";

let vm = null;
function Harnais() {
  const v = useBoardGeneratorController();
  if (isValidElement(v)) return v;
  vm = v;
  return <div />;
}

describe("Je Ne Partage Pas — ramassage engagé", () => {
  afterEach(() => { cleanup(); vm = null; });

  it("aucun autre geste ne s'ouvre, et le compteur survit à tous les modes", async () => {
    const user = userEvent.setup();
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
    act(() => vm.terminerPlacement());
    const id = vm.titanState.ordreJeu[0];
    act(() => {
      vm.setPhase("action");
      vm.setActivePlayerId(id);
      vm.setSelectedTitanId(id);
    });
    const titan = vm.titanState.players.find((p) => p.id === id);
    const cases = getPerimeter(titan.cell[0], Number(titan.cell.slice(1)))
      .filter((c) => !c.isSelf).slice(0, 3).map((c) => c.row + c.col);
    act(() => {
      const t = vm.titanState.players.find((p) => p.id === id);
      t.programmed = ["je_ne_partage_pas", "tout_casser", "graouhhh"];
      t.playedThisManche = ["boing_boing"]; // le passif Récupération serait ouvert
      vm.titanState.players.forEach((p) => { p.repaire = []; }); // Lanterne Rouge : 3 blocs
      vm.setLooseBlocks({ [cases[0]]: ["rouge"], [cases[1]]: ["bleu"], [cases[2]]: ["rose"] });
      vm.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });
    expect(vm.canUseRecupPassif(id)).toBe(true);

    act(() => vm.toggleJnpMode());
    act(() => vm.jnpPickCell(cases[0]));
    expect(vm.jnpSelected).toHaveLength(1);

    // Plus rien d'autre ne s'ouvre tant que le ramassage n'est pas clos.
    expect(vm.canPlayCard("tout_casser")).toBe(false);
    expect(vm.getPlayBlockReason("tout_casser")).toMatch(/ramassage/);
    expect(vm.canPlayCard("je_ne_partage_pas")).toBe(true);
    expect(vm.canDiscardCard("graouhhh")).toBe(false);
    expect(vm.canUseMovePassif(id)).toBe(false);
    expect(vm.canUseRecupPassif(id)).toBe(false);
    act(() => vm.discardCurrentCard(id, "graouhhh"));
    expect(vm.titanState.players.find((p) => p.id === id).programmed).toContain("graouhhh");

    // Les modes s'ouvrent et se ferment : le compteur, lui, ne bouge pas.
    act(() => vm.toggleTeaMode());
    act(() => vm.toggleGraouMode());
    act(() => vm.toggleBbMode());
    act(() => vm.toggleMoveMode());
    expect(vm.jnpMode).toBe(false);
    expect(vm.jnpSelected).toHaveLength(1);

    // Rouvrir la carte reprend le ramassage, quota figé compris.
    act(() => vm.toggleBbMode());
    act(() => vm.toggleJnpMode());
    expect(vm.jnpMode).toBe(true);
    expect(vm.jnpSelected).toHaveLength(1);
    expect(vm.jnpNbToPick).toBe(3);

    act(() => vm.jnpPickCell(cases[1]));
    act(() => vm.jnpPickCell(cases[2]));
    const apres = vm.titanState.players.find((p) => p.id === id);
    expect(apres.repaire).toHaveLength(3);
    expect(apres.programmed).not.toContain("je_ne_partage_pas");
    expect(vm.jnpSelected).toHaveLength(0);
  });
});
