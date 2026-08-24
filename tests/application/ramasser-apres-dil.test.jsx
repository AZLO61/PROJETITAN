/* ============================================================
   PROJET TITAN — Le Ramassage doit rester proposé après un DIL résolu
   ============================================================
   Remonté par Nikola le 2026-08-24 : « j'ai chargé une case avec un Titan
   et un débris, j'ai poussé le Titan, et j'aurais pu faire un Ramasser mais
   après avoir fait le choix du DIL je n'ai pas eu le panneau. »

   Ce test isole la question au niveau du contrôleur (sans passer par la
   mécanique complète de ciblage de Tête en Avant, qui dépend du plateau) :
   une carte est jouée, elle déclenche un DIL sur un Titan qui cohabitait
   avec un débris resté sur sa case (règle de cohabitation), et une fois le
   DIL tranché, le débris doit rester ramassable — rien dans la résolution
   d'un DIL ne touche au sol.
============================================================ */
import { afterEach, describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { resolveTeteEnAvant } from "../../src/domain/gameRules.js";

let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours" />;
}

describe("Ramassage après un DIL tranché", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("le débris resté sur la case de la cible du DIL reste ramassable une fois le DIL résolu", async () => {
    vmCourant = null;
    const user = userEvent.setup();
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
    const [attackerId, targetId] = vmCourant.titanState.ordreJeu;

    act(() => {
      vmCourant.setPhase("action");
      vmCourant.setActivePlayerId(attackerId);
      vmCourant.setSelectedTitanId(attackerId);
    });

    act(() => {
      const attacker = vmCourant.titanState.players.find((p) => p.id === attackerId);
      const target = vmCourant.titanState.players.find((p) => p.id === targetId);
      attacker.cell = "E5";
      attacker.programmed = ["tete_en_avant", "graouhhh", "boing_boing"];
      target.cell = "E6"; // adjacent à l'attaquant, dans l'axe est
      target.repaire = ["bleu", "rose"]; // exactement 2 couleurs → DIL sans étape ATTACKER_PICK
      vmCourant.setLooseBlocks({ E6: ["orange"] }); // débris qui cohabite avec la cible
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });

    // Résolution réelle de la carte, exactement comme jouerTeteEnAvant :
    // charge vers l'est (dr=0, dc=1), sans Adrénaline engagée.
    act(() => {
      const replis = [];
      const result = resolveTeteEnAvant(attackerId, 0, 1, 0, {
        board: vmCourant.state.board, titans: vmCourant.titanState.players,
        looseBlocks: vmCourant.looseBlocks, replis,
      });
      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].type).toBe("DIL");
      // Mise en file identique à ce que fait enqueueDecisions pour une
      // cible à exactement 2 couleurs (saute l'étape ATTACKER_PICK).
      vmCourant.setDecisionQueue([{
        ...result.decisions[0], id: "test-dil", stage: "DEFENDER_PICK",
        attackerChoices: ["bleu", "rose"], autoAttackerPick: true,
      }]);
      vmCourant.markCardPlayed(attackerId, "tete_en_avant");
      vmCourant.setState((prev) => ({ ...prev }));
      vmCourant.setLooseBlocks((prev) => ({ ...prev }));
      vmCourant.setTitanState((prev) => ({ ...prev, players: [...prev.players] }));
    });

    expect(vmCourant.decisionBloquante).toBe("dil");
    expect(vmCourant.selectedTitanId ?? attackerId).toBe(attackerId);

    act(() => { vmCourant.resolveDilDefenderPick("bleu"); });

    // Le DIL est tranché : plus aucune décision bloquante...
    expect(vmCourant.decisionBloquante).not.toBe("dil");
    // ...le débris d'origine est toujours là — Tête en Avant envoie le bloc
    // perdu en DIL "au sol" (cf. DESTINATION_BLOC_PERDU), il rejoint donc
    // le débris déjà présent sur la case d'impact...
    expect(vmCourant.looseBlocks.E6).toEqual(["orange", "bleu"]);
    // ...et le Ramassage doit rester praticable pour l'attaquant.
    expect(vmCourant.canUseRecupPassif(attackerId)).toBe(true);
    expect(vmCourant.recupPool.has("E6")).toBe(true);
  });
});
