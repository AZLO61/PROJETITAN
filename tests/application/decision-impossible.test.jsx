/* ============================================================
   PROJET TITAN — Aucune décision sans issue ne s'affiche
   ============================================================
   `canDil` / `canRage` sont évalués par le résolveur AU MOMENT DE L'IMPACT.
   Mais la carte continue de s'appliquer après : la cible est projetée, elle
   sème des blocs en chemin, un Amas s'écroule sur elle. Son Repaire peut
   donc être retombé sous le seuil quand la décision s'affiche enfin.

   Le panneau devenait alors sans issue :
   · DIL exige 2 options désignées pour activer « Valider ». Avec une seule
     option affichée, le bouton ne s'active JAMAIS et rien ne permet de sortir.
   · RAGE sur une cible sans la moindre ressource n'affiche aucun bouton.

   Dans les deux cas la partie est perdue — c'est le genre de blocage qui ne
   pardonne pas devant un éditeur. Le ruling est déjà tranché (Nikola,
   14/08) : décision impossible = notée au journal, aucun effet.
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

async function partieHumaine() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  // Les 4 Titans sont en « humain » par défaut : aucune auto-résolution IA
  // ne vient brouiller ce que l'on mesure ici.
  return vmCourant.titanState.ordreJeu;
}

describe("Décisions devenues impossibles avant d'être affichées", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("n'enfile pas un DIL dont la cible n'a plus 2 options", async () => {
    const [atk, def] = await partieHumaine();
    act(() => {
      const d = vmCourant.titanState.players.find((t) => t.id === def);
      d.repaire = ["bleu"];       // une seule couleur
      d.socles = [];              // et aucun Socle : 1 seule option
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });

    act(() => {
      vmCourant.enqueueDecisions([{
        type: "DIL", attackerId: atk, defenderId: def,
        cardLabel: "Tout Casser", cellAtImpact: "B2", destination: "sol",
      }]);
    });

    expect(vmCourant.decisionQueue).toHaveLength(0);
    expect(vmCourant.actionLog.join("\n")).toMatch(/sans effet sur Titan/);
  });

  it("n'enfile pas une RAGE dont la cible n'a plus rien à prendre", async () => {
    const [atk, def] = await partieHumaine();
    act(() => {
      const d = vmCourant.titanState.players.find((t) => t.id === def);
      d.repaire = [];
      d.socles = [];
      d.adrenaline = 0;
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });

    act(() => {
      vmCourant.enqueueDecisions([{
        type: "RAGE", attackerId: atk, defenderId: def,
        cardLabel: "Tête en Avant", cellAtImpact: "B2", destination: "repaire",
      }]);
    });

    expect(vmCourant.decisionQueue).toHaveLength(0);
  });

  it("laisse évidemment passer une décision parfaitement résoluble", async () => {
    const [atk, def] = await partieHumaine();
    act(() => {
      const d = vmCourant.titanState.players.find((t) => t.id === def);
      d.repaire = ["bleu", "rouge", "rose"];
      d.socles = [];
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });

    act(() => {
      vmCourant.enqueueDecisions([{
        type: "DIL", attackerId: atk, defenderId: def,
        cardLabel: "Tout Casser", cellAtImpact: "B2", destination: "sol",
      }]);
    });

    expect(vmCourant.decisionQueue).toHaveLength(1);
    expect(vmCourant.decisionQueue[0].defenderId).toBe(def);
  });
});
