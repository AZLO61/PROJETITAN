/* ============================================================
   PROJET TITAN — Annuler un Tout Casser rend VRAIMENT le plateau
   ============================================================
   Retour Nikola (test à la table, 2026-08-18) : « les blocs qui ont pris le
   warp ne sont pas revenus à leur case initiale, ça fausse la partie. »

   Cause trouvée : l'instantané entier était construit DANS l'updater
   `setUndoStack(prev => ...)`, que React n'exécute qu'au traitement de sa
   file — donc après que le résolveur ait muté le plateau EN PLACE. Le
   snapshot clonait un plateau déjà cassé ; « Annuler » restaurait fidèlement
   l'état d'après l'action.

   Pourquoi `annuler.test.jsx` restait vert malgré tout : il appelle
   `captureSnapshot()` dans un `act()` SÉPARÉ de la mutation, ce qui laisse
   React vider sa file entre les deux et masque exactement le défaut.

   ⚠️ Ne pas se fier au seul premier test ci-dessous : même en groupant tout
   dans un `act()`, `act()` reste assez agressif sur le vidage de la file
   pour que le défaut ne s'y manifeste pas. C'est le SECOND test, qui passe
   par le vrai `jouerToutCasser`, qui échoue sans le correctif — vérifié.
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

async function lancerUnePartie() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  return vmCourant;
}

describe("Annuler après une action qui mute le plateau en place", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("restaure l'état d'AVANT quand capture et mutation ont lieu dans le même tick", async () => {
    await lancerUnePartie();

    const cible = Object.keys(vmCourant.state.board).find(
      (k) => vmCourant.state.board[k]?.blocks?.length > 0
    );
    const hauteurAvant = vmCourant.state.board[cible].blocks.length;

    // Séquence réelle d'une carte : capture PUIS mutation en place PUIS
    // setState de rafraîchissement, le tout sans rendu intermédiaire.
    act(() => {
      vmCourant.captureSnapshot();
      vmCourant.state.board[cible].blocks.pop();
      vmCourant.looseBlocks["E5"] = ["rouge"];
      vmCourant.setState((prev) => ({ ...prev }));
      vmCourant.setLooseBlocks((prev) => ({ ...prev }));
    });
    expect(vmCourant.state.board[cible].blocks.length).toBe(hauteurAvant - 1);

    act(() => { vmCourant.handleUndo(); });
    expect(vmCourant.state.board[cible].blocks.length).toBe(hauteurAvant);
    expect(vmCourant.looseBlocks.E5 ?? []).toEqual([]);
  });

  it("un vrai Tout Casser est intégralement annulable, débris projetés compris", async () => {
    await lancerUnePartie();

    const id = vmCourant.titanState.ordreJeu[0];
    act(() => {
      vmCourant.setPhase("action");
      vmCourant.setActivePlayerId(id);
      vmCourant.setSelectedTitanId(id);
      const t = vmCourant.titanState.players.find((p) => p.id === id);
      t.programmed = ["tout_casser", "graouhhh", "boing_boing"];
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });

    const boardAvant = structuredClone(vmCourant.state.board);
    const looseAvant = structuredClone(vmCourant.looseBlocks);
    const destructionAvant = vmCourant.titanState.players.find((p) => p.id === id).destruction;

    act(() => { vmCourant.jouerToutCasser(); });

    act(() => { vmCourant.handleUndo(); });

    expect(vmCourant.state.board).toEqual(boardAvant);
    expect(vmCourant.looseBlocks).toEqual(looseAvant);
    expect(vmCourant.titanState.players.find((p) => p.id === id).destruction)
      .toBe(destructionAvant);
    // La carte redevient réellement jouable, pas seulement visible.
    expect(vmCourant.titanState.players.find((p) => p.id === id).programmed)
      .toContain("tout_casser");
  });
});
