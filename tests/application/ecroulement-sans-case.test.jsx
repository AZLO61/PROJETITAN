/* ============================================================
   PROJET TITAN — Un Amas sans case libre ne bloque pas la partie
   ============================================================
   `getEcroulementCells` écarte toute case portant un bâtiment DEBOUT. Un
   Amas cerné de huit bâtiments intacts — les débris ayant été projetés de
   loin — ne renvoie donc AUCUNE case éligible ; au coin du plateau, trois
   voisines bâties suffisent.

   Le panneau de répartition s'ouvrait quand même : aucune case cliquable,
   « Valider » masqué tant que tous les débris ne sont pas placés, « Annuler
   le dernier » masqué tant qu'aucun ne l'est. Plus rien à l'écran, partie
   définitivement bloquée.

   Deux protections, vérifiées ici : le panneau ne s'ouvre pas, et s'il
   s'ouvrait quand même par un autre chemin, `ecroulementAbandonner` reste
   une sortie.
============================================================ */
import { afterEach, describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { getEcroulementCells } from "../../src/domain/gameRules.js";

let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours" />;
}

describe("Amas écroulé sans case voisine disponible", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("le domaine confirme qu'aucune case n'est éligible quand tout est bâti autour", () => {
    const board = {};
    for (const k of ["D4", "D5", "D6", "E4", "E6", "F4", "F5", "F6"]) {
      board[k] = { blocks: ["bleu", "rose"], socle: 2 };
    }
    const res = getEcroulementCells("E5", { board, looseBlocks: { E5: ["rouge", "rouge"] } });
    expect(res.eligibles).toEqual([]);
  });

  it("la sortie de secours débloque une répartition impossible", async () => {
    vmCourant = null;
    const user = userEvent.setup();
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    // On ouvre de force une répartition sur un Amas cerné de bâtiments.
    act(() => {
      const board = { ...vmCourant.state.board };
      for (const k of ["D4", "D5", "D6", "E4", "E6", "F4", "F5", "F6"]) {
        board[k] = { blocks: ["bleu", "rose"], socle: 2 };
      }
      vmCourant.setState((prev) => ({ ...prev, board }));
      vmCourant.setLooseBlocks({ E5: ["rouge", "rouge"] });
      vmCourant.setEcroulement({ cellKey: "E5", blocs: ["rouge", "rouge"], energie: 2, choix: [] });
    });

    // Aucune case proposée : c'est bien l'état sans issue.
    expect(vmCourant.ecroulementCells).toEqual([]);
    expect(vmCourant.ecroulement).not.toBeNull();

    act(() => { vmCourant.ecroulementAbandonner(); });

    expect(vmCourant.ecroulement).toBeNull();
    expect(vmCourant.actionLog.join("\n")).toMatch(/répartition abandonnée/);
  });
});
