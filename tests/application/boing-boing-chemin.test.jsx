/* ============================================================
   PROJET TITAN — Boing Boing : chemin cliqué case par case
   ============================================================
   Retour Nikola (test à la table, 2026-08-18) : « je dois indiquer par
   plusieurs clics sur les différentes cases mon chemin, pour que ce soit
   clair pour tout le monde. » Un seul clic sur la destination laissait le
   moteur choisir sa propre trajectoire (la plus courte) sans jamais la
   montrer. Ce test verrouille le tracé manuel : coût 0 sur une case
   obstacle (on saute par-dessus, saute-mouton, reprécisé le 18 août), coût
   1 sur une case libre, recliquer une case du chemin y revient, et on ne
   peut pas VALIDER un atterrissage sur un bâtiment encore debout —
   seulement le traverser en vol.
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

async function partieAvecUnGroupeColle() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

  const t1 = vmCourant.titanState.players[0];
  act(() => {
    // E5 et E6 forment un groupe collé (Moore-adjacents), E7 reste vide :
    // exactement l'exemple du livret validé avec Nikola le 2026-08-17.
    t1.cell = "E4";
    t1.programmed = ["boing_boing"];
    vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    vmCourant.setState((prev) => ({
      ...prev,
      board: {
        ...prev.board,
        E5: { row: "E", col: 5, blocks: ["bleu"], socle: 1, isTeleporter: false },
        E6: { row: "E", col: 6, blocks: ["rose"], socle: 1, isTeleporter: false },
        E7: { row: "E", col: 7, blocks: [], socle: 1, isTeleporter: false },
      },
    }));
    vmCourant.setPhase("action");
    vmCourant.setActivePlayerId(t1.id);
    vmCourant.setSelectedTitanId(t1.id);
    vmCourant.toggleBbMode();
  });
  return t1;
}

describe("Boing Boing : chemin tracé case par case", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  /* RULING DU 2026-08-19 — LA CASE D'UN BÂTIMENT N'EST PLUS CLIQUABLE.

     Ces tests validaient l'ancien tracé, où l'on cliquait une à une les cases
     du groupe collé, bâtiments compris. Nikola l'a explicitement retiré :
     « ne jamais proposer la case C5 en cible, mais suggérer directement la
     case d'atterrissage située immédiatement derrière selon l'angle de
     percussion ».

     Deux raisons, toutes deux constatées à la table : on ne s'arrête jamais
     sur un bâtiment, donc le proposer n'a pas de sens ; et surtout un bâtiment
     coûte 0 (saute-mouton), si bien qu'en cliquant de bâtiment en bâtiment on
     traversait le plateau sans jamais entamer son budget.

     Ce qui NE change pas, et ces tests le vérifient toujours : le coût. Le
     groupe collé E5+E6 compte pour 1 seule case avec la case d'arrivée E7,
     exactement comme le livret V36.2 le décrit. Seul le nombre de clics
     change : un seul, sur la destination. */

  it("un seul clic derrière un groupe collé pose tout le trajet, au coût du livret", async () => {
    await partieAvecUnGroupeColle();

    // E9 n'est adjacente à rien du chemin (encore vide, donc à la case du
    // Titan E4) : le clic ne doit produire aucun effet.
    act(() => { vmCourant.bbPathClick("E9"); });
    expect(vmCourant.bbPath).toEqual([]);

    // E5 et E6 sont des bâtiments debout : ils ne sont plus proposés.
    expect(vmCourant.bbNextClickable.has("E5")).toBe(false);
    expect(vmCourant.bbNextClickable.has("E6")).toBe(false);
    act(() => { vmCourant.bbPathClick("E5"); });
    expect(vmCourant.bbPath).toEqual([]);

    // E7, la première case posable derrière le groupe, l'est.
    expect(vmCourant.bbNextClickable.has("E7")).toBe(true);
    act(() => { vmCourant.bbPathClick("E7"); });
    // Le trajet complet est enregistré : les bâtiments survolés se voient.
    expect(vmCourant.bbPath).toEqual(["E5", "E6", "E7"]);
    // Et le coût reste celui du livret : le groupe collé vaut 1 case.
    expect(vmCourant.bbBudgetUsed).toBe(1);
    expect(vmCourant.bbDest).toBe("E7");
  });

  it("recliquer une case déjà dans le chemin y revient", async () => {
    await partieAvecUnGroupeColle();
    act(() => { vmCourant.bbPathClick("E7"); });
    expect(vmCourant.bbPath).toEqual(["E5", "E6", "E7"]);

    // Recliquer une case survolée ramène le tracé jusqu'à elle.
    act(() => { vmCourant.bbPathClick("E5"); });
    expect(vmCourant.bbPath).toEqual(["E5"]);
    expect(vmCourant.bbDest).toBe("E5");
  });

  it("un atterrissage sur un bâtiment reste impossible à valider", async () => {
    /* Double filet. Le tracé ne propose plus la case d'un bâtiment, mais si
       l'on y revient en recliquant une case survolée, la destination redevient
       un bâtiment : jouer la carte doit rester refusé. */
    const t1 = await partieAvecUnGroupeColle();
    act(() => { vmCourant.bbPathClick("E7"); });
    act(() => { vmCourant.bbPathClick("E5"); });
    expect(vmCourant.bbDest).toBe("E5");
    expect(vmCourant.bbDestIsBuilding).toBe(true);

    act(() => { vmCourant.jouerBoingBoing(); });
    // Rien ne s'est passé : le chemin et la position du Titan n'ont pas bougé.
    expect(vmCourant.bbPath).toEqual(["E5"]);
    expect(vmCourant.titanState.players.find((p) => p.id === t1.id).cell).toBe("E4");

    act(() => { vmCourant.bbPathClick("E7"); });
    expect(vmCourant.bbDestIsBuilding).toBe(false);

    act(() => { vmCourant.jouerBoingBoing(); });
    expect(vmCourant.titanState.players.find((p) => p.id === t1.id).cell).toBe("E7");
  });

  it("le budget ne peut pas être contourné en enchaînant des bâtiments", async () => {
    /* L'abus signalé par Nikola le 2026-08-19 : un bâtiment coûte 0, donc en
       s'arrêtant dessus on avançait sans fin. Le trajet derrière un groupe
       compte désormais la case d'atterrissage, et le budget se consomme. */
    await partieAvecUnGroupeColle();
    act(() => { vmCourant.bbPathClick("E7"); });
    expect(vmCourant.bbBudgetUsed).toBe(1);

    /* La suite du trajet doit se jouer sur des cases dont ce test MAÎTRISE le
       contenu. Le plateau est tiré au hasard : sans ce nettoyage, un bâtiment
       ou un débris en E8 changerait le coût et le test mesurerait autre chose
       que ce qu'il annonce. */
    act(() => {
      delete vmCourant.state.board.E8;
      delete vmCourant.state.board.E9;
      delete vmCourant.looseBlocks.E8;
      delete vmCourant.looseBlocks.E9;
      vmCourant.setState((prev) => ({ ...prev }));
      vmCourant.setLooseBlocks((prev) => ({ ...prev }));
    });

    // Portée 3 sans Adrénaline : chaque case libre supplémentaire coûte 1.
    act(() => { vmCourant.bbPathClick("E8"); });
    expect(vmCourant.bbBudgetUsed).toBe(2);
    act(() => { vmCourant.bbPathClick("E9"); });
    expect(vmCourant.bbBudgetUsed).toBe(3);

    // Budget épuisé : plus aucune case libre ne peut être ajoutée.
    const avant = [...vmCourant.bbPath];
    act(() => { vmCourant.bbPathClick("D9"); });
    expect(vmCourant.bbPath).toEqual(avant);
  });
});
