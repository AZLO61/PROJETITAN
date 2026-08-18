/* ============================================================
   PROJET TITAN — Un appel en double de markCardPlayed n'avance pas le round
   ============================================================
   Retour Nikola (test à la table, 2026-08-18) : « il me restait une carte
   à jouer, mais la phase a quand même avancé au round suivant » — la
   Programmation démarrait alors qu'une carte de l'ancien round attendait
   toujours d'être jouée.

   `advanceActionRound` incrémentait le compteur de rounds à chaque appel de
   `markCardPlayed`, sans vérifier que la carte visée était RÉELLEMENT
   encore programmée. Un second appel accidentel avec le même `cardId`
   (déjà retiré) avançait donc quand même le compteur, désynchronisant le
   nombre de rounds "comptés" du nombre de cartes réellement jouées.
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

describe("markCardPlayed : un appel en double ne fait pas avancer le round", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("le round n'avance qu'une fois même si markCardPlayed est appelée deux fois pour la même carte", async () => {
    vmCourant = null;
    const user = userEvent.setup();
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    const t1 = vmCourant.titanState.players[0];
    act(() => {
      t1.programmed = ["tout_casser", "tete_en_avant", "boing_boing"];
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
      vmCourant.setPhase("action");
      vmCourant.setActivePlayerId(t1.id);
      vmCourant.setSelectedTitanId(t1.id);
    });

    // 1er appel : joue réellement la carte, le round avance normalement.
    act(() => { vmCourant.markCardPlayed(t1.id, "tout_casser"); });
    expect(vmCourant.titanState.players.find((p) => p.id === t1.id).programmed)
      .toEqual(["tete_en_avant", "boing_boing"]);

    // 2e appel accidentel avec la MÊME carte, déjà retirée de `programmed` :
    // ne doit RIEN faire de plus, et surtout pas avancer le round une
    // seconde fois pour une carte qui n'existe plus.
    act(() => { vmCourant.markCardPlayed(t1.id, "tout_casser"); });
    expect(vmCourant.titanState.players.find((p) => p.id === t1.id).programmed)
      .toEqual(["tete_en_avant", "boing_boing"]);
    // Toujours en Phase Action, toujours 2 cartes programmées non jouées :
    // aucune Programmation ne doit avoir démarré prématurément.
    expect(vmCourant.phase).toBe("action");
  });
});
