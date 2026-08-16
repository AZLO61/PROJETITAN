/* ============================================================
   PROJET TITAN — Le passage de Manche ne plante plus
   ============================================================
   Scan du 2026-08-15, défaut le plus grave trouvé : `advanceManche`
   appelait `manchesMax(nbJoueurs)`, une fonction bien exportée par le
   domaine mais jamais destructurée dans le contrôleur. Variable libre,
   donc ReferenceError — et comme `advanceManche` se déclenche dès que
   tous les Titans ont validé la Phase Repos, la partie s'arrêtait sur
   l'ErrorBoundary à la fin de CHAQUE Manche. Le jeu était inutilisable
   au-delà de la Manche 1.

   Ni le simulateur (qui ne passe pas par le contrôleur) ni les tests de
   rendu (qui s'arrêtent avant la fin d'une Manche) ne pouvaient le voir.
   D'où ce test, qui appelle la transition de Manche pour de vrai.
============================================================ */
import { afterEach, describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";

// Le contrôleur renvoie du JSX tant que la configuration n'est pas validée,
// puis un viewmodel. Ce harnais rend le premier et capture le second, ce qui
// donne accès aux actions réelles du jeu sans avoir à cliquer trois rounds.
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

describe("transition de fin de Manche", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("ne lève pas d'exception", async () => {
    const vm = await lancerUnePartie();
    expect(vm).not.toBeNull();
    expect(vm.mancheNumber).toBe(1);

    // C'est exactement l'appel qui plantait.
    expect(() => act(() => { vm.advanceManche(); })).not.toThrow();
  });

  it("fait bien avancer la Manche, ou termine la partie", async () => {
    const vm = await lancerUnePartie();
    act(() => { vm.advanceManche(); });

    // Deux issues légitimes : la Manche suivante démarre, ou un
    // déclencheur de fin de partie s'est présenté (Apocalypse Urbaine,
    // Pénurie, Vide Spatial) et le décompte s'ouvre. Les deux prouvent que
    // la transition s'est exécutée jusqu'au bout.
    expect(vmCourant.mancheNumber === 2 || vmCourant.showScoring).toBe(true);
  });

  it("distribue +1 Adrénaline à chaque Titan au passage de Manche", async () => {
    const vm = await lancerUnePartie();
    const avant = vm.titanState.players.map((t) => t.adrenaline);
    act(() => { vm.advanceManche(); });
    if (vmCourant.mancheNumber === 2) {
      const apres = vmCourant.titanState.players.map((t) => t.adrenaline);
      apres.forEach((v, i) => expect(v).toBe(avant[i] + 1));
    }
  });

  it("fait tourner le Détonateur", async () => {
    const vm = await lancerUnePartie();
    const avant = vm.titanState.detonateur;
    act(() => { vm.advanceManche(); });
    if (vmCourant.mancheNumber === 2) {
      expect(vmCourant.titanState.detonateur).not.toBe(avant);
    }
  });
});
