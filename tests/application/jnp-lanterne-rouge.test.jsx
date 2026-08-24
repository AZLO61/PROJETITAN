/* ============================================================
   PROJET TITAN — Lanterne Rouge ne doit pas s'éteindre en plein ramassage
   ============================================================
   Remonté par Nikola le 2026-08-24 : « j'étais Lanterne Rouge, c'était bien
   indiqué, mais je n'ai pas pu prendre mon 3e bloc. »

   Je Ne Partage Pas ramasse 2 blocs, 3 si le joueur actif a Lanterne Rouge
   (autant ou moins de blocs en Repaire que le Titan le moins doté). Le
   contrôleur recalculait ce nombre EN DIRECT à chaque rendu — or chaque bloc
   ramassé fait grossir le Repaire de l'acteur. Dès le 2e bloc pris, son
   Repaire (2) dépassait celui des autres (0), la Lanterne Rouge s'éteignait
   d'elle-même et le compte retombait à 2 en plein ramassage, juste avant le
   3e clic. Comme le recul de Graouhhh ou les cibles de FPMC, ce nombre doit
   être figé au moment où la carte s'engage.
============================================================ */
import { afterEach, describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { getPerimeter } from "../../src/domain/gameRules.js";

let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours" />;
}

describe("Je Ne Partage Pas — Lanterne Rouge figée pour toute la carte", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("laisse ramasser un 3e bloc même après que les 2 premiers aient fait perdre la Lanterne Rouge", async () => {
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

    const titanAvant = vmCourant.titanState.players.find((p) => p.id === id);
    // Deux cases voisines DISTINCTES du Périmètre (hors case du Titan lui-même).
    const voisines = getPerimeter(titanAvant.cell[0], Number(titanAvant.cell.slice(1)))
      .filter((c) => !c.isSelf)
      .slice(0, 2)
      .map((c) => c.row + c.col);

    act(() => {
      const t = vmCourant.titanState.players.find((p) => p.id === id);
      t.programmed = ["je_ne_partage_pas", "tout_casser", "graouhhh"];
      // Tout le monde à 0 en Repaire : l'acteur est bien Lanterne Rouge (à
      // égalité), condition de départ du bug de Nikola.
      vmCourant.titanState.players.forEach((p) => { p.repaire = []; });
      vmCourant.setLooseBlocks({
        [voisines[0]]: ["rouge"],
        [voisines[1]]: ["bleu"],
        [titanAvant.cell]: ["orange"], // sa propre case compte dans son Périmètre
      });
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });

    expect(vmCourant.jnpNbToPick).toBe(3); // Lanterne Rouge : annoncée avant de jouer

    act(() => { vmCourant.toggleJnpMode(); });
    expect(vmCourant.jnpNbToPick).toBe(3); // figé à l'engagement de la carte

    act(() => { vmCourant.jnpToggleCell(voisines[0]); });
    act(() => { vmCourant.jnpToggleCell(voisines[1]); });

    // À ce stade, en direct, le Titan n'est plus Lanterne Rouge (Repaire à 2
    // contre 0 pour les autres) — mais le compte figé doit rester à 3.
    expect(vmCourant.jnpNbToPick).toBe(3);
    expect(vmCourant.jnpMode).toBe(true); // la carte n'est pas close, le 3e bloc reste à prendre

    act(() => { vmCourant.jnpToggleCell(titanAvant.cell); });

    const titanApres = vmCourant.titanState.players.find((p) => p.id === id);
    expect(titanApres.repaire).toHaveLength(3);
    expect(vmCourant.jnpMode).toBe(false); // la carte s'est bien clôturée sur le 3e bloc
    expect(titanApres.programmed).not.toContain("je_ne_partage_pas");
  });
});
