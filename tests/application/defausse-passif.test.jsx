/* ============================================================
   PROJET TITAN — Une défausse ne fait pas sauter le Ramassage
   ============================================================
   Remonté par Nikola le 2026-08-18 : « j'ai défaussé Je Ne Partage Pas et ça
   m'a fait sauter mon passif de Ramassage. »

   Le livret est clair, et le moteur le suivait déjà : une défausse volontaire
   ouvre le droit au passif Récupération exactement comme une carte jouée. Ce
   test le verrouille — c'est la seule façon de savoir, au prochain test à la
   table, si le problème vient de la règle ou de l'affichage.

   Ce qu'il montre aussi : le panneau « Ramasser » ne s'affiche QUE s'il y a
   quelque chose à ramasser. Périmètre vide, aucun panneau — le tour n'a rien
   sauté, il n'y avait rien à prendre. C'est ce silence que le joueur lisait
   comme un passif escamoté, et à quoi le panneau de fin de tour répond
   désormais explicitement.
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

async function partieEnPhaseAction() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  const id = vmCourant.titanState.ordreJeu[0];
  act(() => {
    vmCourant.setPhase("action");
    vmCourant.setActivePlayerId(id);
    vmCourant.setSelectedTitanId(id);
  });
  act(() => {
    const t = vmCourant.titanState.players.find((p) => p.id === id);
    t.programmed = ["je_ne_partage_pas", "tout_casser", "graouhhh"];
    vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
  });
  return id;
}

function poserUnDebrisDansLePerimetre(id) {
  act(() => {
    const t = vmCourant.titanState.players.find((p) => p.id === id);
    const ligne = t.cell[0];
    const col = Number(t.cell.slice(1));
    const voisine = `${ligne}${col === 9 ? col - 1 : col + 1}`;
    vmCourant.setLooseBlocks({ [voisine]: ["rouge"] });
  });
}

describe("Défausse volontaire et passif Récupération", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("ouvre le droit au Ramassage, comme une carte réellement jouée", async () => {
    const id = await partieEnPhaseAction();
    poserUnDebrisDansLePerimetre(id);

    // Avant d'avoir rien fait de sa carte : pas de Ramassage, c'est la règle.
    expect(vmCourant.canUseRecupPassif(id)).toBe(false);

    act(() => { vmCourant.discardCurrentCard(id, "je_ne_partage_pas"); });

    const t = vmCourant.titanState.players.find((p) => p.id === id);
    expect(t.discardedHidden).toContain("je_ne_partage_pas");
    expect(t.programmed).not.toContain("je_ne_partage_pas");
    // Le droit est ouvert, et le passif n'a pas été marqué comme consommé.
    expect(vmCourant.canUseRecupPassif(id)).toBe(true);
    expect(vmCourant.passifUsed[id]?.recup).toBe(false);
    expect(vmCourant.recupPool.size).toBeGreaterThan(0);
  });

  it("est annulable comme n'importe quelle action", async () => {
    const id = await partieEnPhaseAction();
    act(() => { vmCourant.discardCurrentCard(id, "graouhhh"); });
    expect(vmCourant.titanState.players.find((p) => p.id === id).programmed)
      .not.toContain("graouhhh");

    act(() => { vmCourant.handleUndo(); });
    expect(vmCourant.titanState.players.find((p) => p.id === id).programmed)
      .toContain("graouhhh");
  });
});
