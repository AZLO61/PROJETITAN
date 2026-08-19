/* ============================================================
   PROJET TITAN — Une partie à 4 IA se déroule jusqu'au bout
   ============================================================
   Bug remonté par Nikola le 2026-08-19 : « quand un titan a joué sa carte ça
   ne passe pas au suivant donc ça fige dès la première action ».

   C'était une régression introduite le jour même. `markCardPlayed` appelait
   `advanceActionRound` de façon SYNCHRONE, et `finishAiTurn` lisait
   `aiNextPlayerRef.current` dès le retour de cet appel pour donner la main au
   Titan suivant — invariante écrite noir sur blanc dans le code. Différer
   l'avancement dans un effet React faisait lire une ref encore vide : l'IA ne
   passait jamais au Titan suivant.

   Mesuré dans les deux sens avant/après correctif : 1 carte jouée puis plus
   rien, contre 10 cartes et les quatre Titans qui alternent.

   Ce test est un FILET DE VIE : il ne vérifie pas une règle, il vérifie que
   la partie tourne. Aucun test ne le faisait, ce qui explique que la
   régression soit passée à travers 334 tests verts.
============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("Une partie à 4 IA avance sans intervention", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); cleanup(); vmCourant = null; });

  it("les quatre Titans jouent chacun leur tour, la main circule", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    act(() => {
      const modes = {};
      vmCourant.titanState.players.forEach((t) => { modes[t.id] = "ia"; });
      vmCourant.setTitanModes(modes);
    });

    // L'IA enchaîne ses étapes sur des minuteries de 2 s. On laisse tourner
    // de quoi couvrir largement plusieurs tours complets.
    const actifsVus = new Set();
    for (let i = 0; i < 30; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      if (vmCourant.activePlayerId != null) actifsVus.add(vmCourant.activePlayerId);
    }

    const cartesJouees = vmCourant.titanState.players
      .reduce((s, t) => s + t.playedThisManche.length, 0);

    /* Le seuil compte : AVANT le correctif, exactement 1 carte était jouée
       puis la partie figeait, le même Titan restant actif indéfiniment. */
    expect(cartesJouees).toBeGreaterThan(4);
    // Et la main a réellement circulé entre plusieurs Titans.
    expect(actifsVus.size).toBeGreaterThan(2);
  });

  it("aucun Titan ne reste bloqué avec waitingNextTitan indéfiniment", async () => {
    /* Symptôme exact du figeage : `waitingNextTitan` restait à true sur le
       même Titan, tour après tour, parce que personne ne prenait la main. */
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
    act(() => {
      const modes = {};
      vmCourant.titanState.players.forEach((t) => { modes[t.id] = "ia"; });
      vmCourant.setTitanModes(modes);
    });

    let bloqueSur = null;
    let compteur = 0;
    for (let i = 0; i < 20; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      const signature = `${vmCourant.activePlayerId}-${vmCourant.waitingNextTitan}`;
      if (signature === bloqueSur) compteur++;
      else { bloqueSur = signature; compteur = 0; }
      // 8 relevés de suite sur le même Titan en attente = la partie est figée.
      expect(compteur).toBeLessThan(8);
    }
  });
});
