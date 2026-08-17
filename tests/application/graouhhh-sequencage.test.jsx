/* ============================================================
   PROJET TITAN — Graouhhh : DIL tranché puis déplacement, un Titan à la fois
   ============================================================
   Ruling Nikola (test à la table, 2026-08-18) : « on fait dans l'ordre
   DIL/RAGE puis déplacement, et Titan suivant si il y en a un autre —
   impossible de passer au Titan suivant tant que ce n'est pas résolu. »

   Avant ce ruling, resolveGraouhhh déplaçait TOUS les Titans touchés d'un
   bloc avant que la moindre décision DIL ne soit affichée : l'attaquant
   voyait le résultat final avant même d'avoir choisi quoi que ce soit. Ce
   test verrouille le nouveau déroulé via le vrai contrôleur, seul endroit
   où vit la file de décisions.
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

async function partieAvecTroisTitansEnLigne() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

  const [t1, t2, t3] = vmCourant.titanState.players;
  act(() => {
    // Ligne B : jamais une case de bâtiment, quel que soit le plateau
    // généré aléatoirement pour ce test — l'axe est donc garanti dégagé.
    t1.cell = "B2"; t1.programmed = ["graouhhh"];
    t2.cell = "B4"; t2.repaire = ["bleu", "rose"];
    t3.cell = "B6"; t3.repaire = ["bleu", "rose"];
    vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    vmCourant.setPhase("action");
    vmCourant.setActivePlayerId(t1.id);
    vmCourant.setSelectedTitanId(t1.id);
    vmCourant.setDirection({ dr: 0, dc: 1, label: "E" });
  });
  return { t1, t2, t3 };
}

describe("Graouhhh : DIL tranché puis déplacement, Titan par Titan", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("le Titan le plus loin ne bouge pas avant que son DIL soit tranché, et le suivant attend son tour", async () => {
    const { t1, t2, t3 } = await partieAvecTroisTitansEnLigne();
    const bagarreAvant = t1.bagarre;
    const adrenalineAvant = t1.adrenaline;

    act(() => { vmCourant.jouerGraouhhh(); });

    // T3 (le plus loin) est traité en premier : une décision DIL est en
    // attente pour lui, et il n'a PAS encore bougé.
    expect(vmCourant.decisionQueue).toHaveLength(1);
    expect(vmCourant.decisionQueue[0].defenderId).toBe(t3.id);
    expect(vmCourant.decisionQueue[0].cardLabel).toBe("Graouhhh");
    expect(vmCourant.titanState.players.find((p) => p.id === t3.id).cell).toBe("B6");
    // T2 non plus : son tour n'est même pas encore arrivé.
    expect(vmCourant.titanState.players.find((p) => p.id === t2.id).cell).toBe("B4");

    // Le DIL de T3 n'a que 2 couleurs distinctes en Repaire : combinaison
    // unique, l'étape de l'attaquant est sautée, on tranche directement
    // côté défenseur.
    act(() => { vmCourant.resolveDilDefenderPick("bleu"); });

    // T3 a maintenant bougé, et T2 a désormais son propre DIL en attente —
    // toujours pas bougé.
    expect(vmCourant.titanState.players.find((p) => p.id === t3.id).cell).not.toBe("B6");
    expect(vmCourant.decisionQueue).toHaveLength(1);
    expect(vmCourant.decisionQueue[0].defenderId).toBe(t2.id);
    expect(vmCourant.titanState.players.find((p) => p.id === t2.id).cell).toBe("B4");

    act(() => { vmCourant.resolveDilDefenderPick("rose"); });

    // Les deux Titans ont bougé, plus aucune décision en attente, et
    // l'initiateur touche la Bagarre et le bonus d'Adrénaline des deux
    // Titans touchés (FAQ #11 : +1 Adrénaline au-delà du premier).
    expect(vmCourant.decisionQueue).toHaveLength(0);
    expect(vmCourant.titanState.players.find((p) => p.id === t2.id).cell).not.toBe("B4");
    const attaquant = vmCourant.titanState.players.find((p) => p.id === t1.id);
    expect(attaquant.bagarre).toBe(bagarreAvant + 2);
    expect(attaquant.adrenaline).toBe(adrenalineAvant + 1);
  });
});
