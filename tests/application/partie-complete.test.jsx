/* ============================================================
   PROJET TITAN — Une partie entière, dans le VRAI contrôleur, jusqu'au podium
   ============================================================
   Audit des tests du 2026-09-24 (constat 4) : le simulateur joue des parties
   complètes, mais c'est un autre chemin que la table — il en a divergé six
   fois avant le 21/09. Côté contrôleur, aucun test n'allait jusqu'à la fin :
   `partie-ia-avance` s'arrête après quelques tours, `fin-de-manche` appelle
   `advanceManche` à la main. Or la fin de PARTIE a déjà été cassée deux fois
   (fin de Manche qui plantait, dernière Manche qui relançait une
   Programmation fantôme) sans qu'un test le voie.

   Quatre IA, horloge simulée : la partie doit aller au podium toute seule,
   sans jamais violer un invariant du moteur en route.
============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { verifierInvariants } from "../../src/domain/invariants.js";

let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours" />;
}

describe("Une partie à 4 IA se joue jusqu'au podium dans le contrôleur", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); cleanup(); vmCourant = null; });

  it("fin de partie atteinte, aucun invariant violé en route", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
    act(() => {
      const modes = {};
      vmCourant.titanState.players.forEach((t) => { modes[t.id] = "ia"; });
      vmCourant.setTitanModes(modes);
    });
    // Même sortie de secours que `partie-ia-avance` : la file de mise en place
    // a été montée avec T1 humain et attendrait un clic.
    act(() => vmCourant.terminerPlacement());

    const violations = new Set();
    for (let i = 0; i < 2000 && !vmCourant.gameOver; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      const etat = { board: vmCourant.state.board, titans: vmCourant.titanState.players, looseBlocks: vmCourant.looseBlocks };
      for (const v of verifierInvariants(etat, `manche ${vmCourant.mancheNumber}`)) violations.add(`${v.regle} — ${v.detail}`);
    }

    expect(vmCourant.gameOver).toBe(true);
    // Une vraie partie, pas une fin prématurée : plusieurs Manches, des blocs ramassés.
    expect(vmCourant.mancheNumber).toBeGreaterThan(1);
    expect(vmCourant.titanState.players.every((t) => t.repaire.length > 0)).toBe(true);
    expect([...violations]).toEqual([]);
  }, 600000);
});
