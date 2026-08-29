/* ============================================================
   PROJET TITAN — Rien ne commence avant que les quatre soient posés
   ============================================================
   Retour Nikola (2026-08-29) : « je ne peux pas choisir mes cartes avant mon
   placement initial, car là ça a créé un bug : je ne vois aucun Titan et
   pourtant ils jouent. »

   La mise en place d'ouverture et la Programmation vivaient côte à côte sans
   se voir. Les trois IA programmaient et validaient leur phase toutes seules,
   l'humain pouvait programmer par-dessus le bandeau de mise en place, et la
   Phase Action s'ouvrait dès les quatre validations réunies — sur un plateau
   où des Titans portaient encore `aPlacer`. Sans `cell`, ils n'étaient
   dessinés nulle part et jouaient quand même : le symptôme exact décrit.

   Ce test verrouille les DEUX moitiés du symptôme, celle qu'on voit et celle
   qu'on ne voit pas : aucune phase ne s'enchaîne pendant la mise en place, et
   aucun Titan ne peut se retrouver actif sans case.
============================================================ */
import { afterEach, describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { estSurLePlateau } from "../../src/domain/index.js";

let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours" />;
}

async function lancerPartie() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
}

describe("Mise en place d'ouverture : préalable à toute phase", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("la partie s'ouvre sur une mise en place qui attend un humain", async () => {
    await lancerPartie();
    // Les IA en tête de file se posent seules ; la file s'arrête sur l'humain.
    expect(vmCourant.decisionBloquante).toBe("placement");
    expect(vmCourant.placementRestant.length).toBeGreaterThan(0);
  });

  it("aucune phase ne peut être validée tant qu'un Titan attend sa case", async () => {
    await lancerPartie();
    const ids = vmCourant.titanState.ordreJeu;
    ids.forEach((id) => {
      expect(vmCourant.canValidatePhase(id)).toBe(false);
      expect(vmCourant.getPhaseBlockReason(id)).toMatch(/prendre position/i);
    });
  });

  it("valider la phase pour tout le monde ne fait PAS démarrer la Phase Action", async () => {
    await lancerPartie();
    const phaseDepart = vmCourant.phase;
    const ids = vmCourant.titanState.ordreJeu;

    // L'état exact du bug : les quatre validations réunies pendant que la mise
    // en place est encore ouverte.
    act(() => {
      const tous = {};
      ids.forEach((id) => { tous[id] = true; });
      vmCourant.setPhaseValidated(tous);
    });

    expect(vmCourant.phase).toBe(phaseDepart);
    expect(vmCourant.phase).not.toBe("action");
  });

  it("aucun Titan ne joue sans case sur le plateau", async () => {
    await lancerPartie();
    const ids = vmCourant.titanState.ordreJeu;
    act(() => {
      const tous = {};
      ids.forEach((id) => { tous[id] = true; });
      vmCourant.setPhaseValidated(tous);
    });

    /* Le cœur du retour : « je ne vois aucun Titan et pourtant ils jouent ».
       Un Titan sans `cell` n'est dessiné nulle part — il ne doit donc rien
       avoir joué ni programmé.

       `activePlayerId` n'est PAS testé ici : il désigne le Détonateur dès
       l'ouverture, et le Détonateur pose en DERNIER (c'est l'avantage que lui
       donne l'ordre inverse de l'initiative). Il est donc normal qu'il porte
       encore `aPlacer` — ce qui ne l'était pas, c'est qu'il joue. */
    const nonPoses = vmCourant.titanState.players.filter((t) => t.aPlacer);
    expect(nonPoses.length).toBeGreaterThan(0);
    nonPoses.forEach((t) => {
      // `cell` porte déjà l'emplacement que le tirage lui a réservé, mais
      // `estSurLePlateau` reste faux tant que `aPlacer` tient : c'est ce
      // drapeau, et lui seul, qui décide s'il est dessiné.
      expect(estSurLePlateau(t)).toBe(false);
      expect(t.playedThisManche.length).toBe(0);
      expect(t.programmed.length).toBe(0);
    });
  });

  it("une fois la mise en place soldée, les phases repartent normalement", async () => {
    await lancerPartie();
    act(() => vmCourant.terminerPlacement());

    expect(vmCourant.decisionBloquante).not.toBe("placement");
    expect(vmCourant.placementRestant.length).toBe(0);
    vmCourant.titanState.players.forEach((t) => {
      expect(t.aPlacer).toBeFalsy();
      expect(t.cell).toBeTruthy();
    });
    // Le blocage tombe avec la file : plus aucun Titan n'est retenu par la
    // mise en place, seule la règle de la phase en cours peut encore bloquer.
    vmCourant.titanState.ordreJeu.forEach((id) => {
      expect(vmCourant.getPhaseBlockReason(id)).not.toMatch(/prendre position/i);
    });
  });
});
