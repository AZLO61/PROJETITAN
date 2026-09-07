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

  /* ── LA PHASE REPOS SAUTE QUAND IL N'Y A PLUS DE MANCHE APRÈS ──
     Nikola, 2026-09-07 : « le Manche suivant de Manche 4 à 4 Titans est
     inutile ». La Phase Repos ne sert qu'à PRÉPARER la Manche suivante — vol
     en chaîne d'une carte à son voisin. Sans Manche suivante, elle déplace des
     cartes que personne ne jouera, ne touche aucun score, et fait attendre la
     table entre le dernier coup et le décompte.

     On vérifie ici les DEUX sens : elle saute quand la partie s'arrête, elle
     ne saute pas quand il reste une Manche. Sinon le correctif pourrait
     supprimer le vol de toute la partie sans que rien ne le dise. */
  it("saute la Phase Repos quand la partie s'arrête à la fin de cette Manche", async () => {
    const vm = await lancerUnePartie();
    act(() => {
      vmCourant.terminerPlacement();
      // Dernière Manche à 4 Titans : `checkEndGameTriggers` le dit déjà.
      vmCourant.setMancheNumber(4);
      vmCourant.setPhase("action");
    });
    act(() => {
      const valide = {};
      vmCourant.titanState.ordreJeu.forEach((id) => {
        const t = vmCourant.titanState.players.find((p) => p.id === id);
        if (t) t.programmed = [];
        valide[id] = true;
      });
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
      vmCourant.setPhaseValidated(valide);
    });

    expect(vmCourant.phase).not.toBe("repos");
    expect(vmCourant.gameOver).toBe(true);
    expect(vmCourant.actionLog.join(" | ")).toMatch(/Phase Repos sautée/);
    void vm;
  });

  it("garde la Phase Repos tant qu'il reste une Manche à préparer", async () => {
    await lancerUnePartie();
    act(() => {
      vmCourant.terminerPlacement();
      vmCourant.setMancheNumber(1);
      vmCourant.setPhase("action");
    });
    act(() => {
      const valide = {};
      vmCourant.titanState.ordreJeu.forEach((id) => {
        const t = vmCourant.titanState.players.find((p) => p.id === id);
        if (t) t.programmed = [];
        valide[id] = true;
      });
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
      vmCourant.setPhaseValidated(valide);
    });

    /* La partie peut tout de même s'arrêter sur un autre déclencheur du
       livret (Apocalypse, Pénurie, Vide Spatial) selon le plateau tiré : dans
       ce cas le saut est JUSTE, et le journal le dit. On n'exige la Phase
       Repos que lorsque la partie continue vraiment. */
    if (!vmCourant.gameOver) {
      expect(vmCourant.phase).toBe("repos");
      expect(vmCourant.actionLog.join(" | ")).not.toMatch(/Phase Repos sautée/);
    }
  });
});
