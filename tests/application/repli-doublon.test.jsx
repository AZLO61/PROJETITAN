/* ============================================================
   PROJET TITAN — Un élément arrêté ne se place qu'une fois
   ============================================================
   Remonté par Nikola sur la Manche 3 de la graine 3144532881 : « j'étais en
   F3, j'ai fait Graouhhh, j'aurais dû déplacer 1 Titan puis 1 autre — j'ai dû
   déplacer 2 fois le même. »

   Le journal de son rapport porte les deux lignes fautives à la suite :
     « Titan 4 arrêté faute de puissance → posé en I4 au lieu de H3 »
     « Titan 4 arrêté faute de puissance → posé en H2 au lieu de H3 »
   Même Titan, même case par défaut : deux demandes de repli pour un seul
   arrêt, parce que le Titan a été touché directement PUIS repercuté par la
   chaîne au même endroit. Le joueur plaçait donc deux fois le même Titan, et
   le second choix écrasait le premier.
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

async function partieLancee() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  return vmCourant.titanState.ordreJeu[0];
}

// Deux cases au choix : en dessous, `enqueueReplis` classe la demande sans
// rien demander au joueur (il n'y a pas de choix réel à faire).
const repli = (titanId, defaut, initiatorId) => ({
  titanId,
  defaut,
  cases: [defaut, "I4", "H2"],
  cible: defaut,
  initiatorId,
});

describe("File des replis", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("ne demande qu'une décision quand le même Titan s'arrête deux fois au même endroit", async () => {
    const moi = await partieLancee();

    act(() => {
      vmCourant.enqueueReplis([
        repli(4, "H3", moi),
        repli(4, "H3", moi), // le doublon né de la chaîne de réaction
      ]);
    });

    expect(vmCourant.repliQueue).toHaveLength(1);
    expect(vmCourant.repliQueue[0].titanId).toBe(4);
    expect(vmCourant.repliQueue[0].defaut).toBe("H3");
  });

  it("garde les deux quand ce sont deux arrêts réellement distincts", async () => {
    const moi = await partieLancee();

    act(() => {
      vmCourant.enqueueReplis([
        repli(4, "H3", moi),
        repli(2, "G3", moi), // un autre Titan, une autre case
      ]);
    });

    expect(vmCourant.repliQueue).toHaveLength(2);
  });

  it("garde les deux quand le même Titan s'arrête à deux endroits différents", async () => {
    const moi = await partieLancee();

    act(() => {
      vmCourant.enqueueReplis([
        repli(4, "H3", moi),
        repli(4, "C7", moi), // deux poussées séparées, deux vraies décisions
      ]);
    });

    expect(vmCourant.repliQueue).toHaveLength(2);
  });
});
