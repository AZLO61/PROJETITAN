/* ============================================================
   PROJET TITAN — Graouhhh joué par une IA respecte le même ordre
   ============================================================
   Ruling Nikola (2026-08-18) : « on fait dans l'ordre DIL/RAGE puis
   déplacement, et Titan suivant si il y en a un autre. »

   Le joueur humain suivait cet ordre depuis le 18 août, mais l'IA passait
   encore par le wrapper monolithique `resolveGraouhhh`, qui déplace TOUS les
   Titans de l'axe d'un coup puis rend les décisions en bloc. Un joueur
   humain visé voyait donc ses Titans bouger AVANT qu'on lui demande de
   trancher son Dilemme : la table lisait la scène à l'envers.

   L'état final était le bon — l'ordre de traitement est identique des deux
   côtés, du plus loin au plus proche — ce qui rendait le défaut invisible
   à tout test portant sur le résultat. Ce test porte donc sur l'ORDRE, seul
   endroit où il se voyait.
============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { FORCES, TEMPERAMENTS, makeProfile } from "../../src/domain/aiEvaluation.js";

let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours" />;
}

describe("Graouhhh joué par une IA", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); cleanup(); vmCourant = null; });

  it("laisse la cible humaine trancher son DIL AVANT de la déplacer", async () => {
    vmCourant = null;
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  /* Mise en place dépassée (ruling du 2026-08-28) : à 4 humains, la partie
     s'ouvre désormais sur le placement des Titans, un clic par joueur. Ce
     test-ci pose lui-même les positions qu'il veut examiner, la mise en
     place n'est donc pas son sujet — on la solde d'un coup. */
  act(() => vmCourant.terminerPlacement());

    const [t1, t2, t3] = vmCourant.titanState.players;

    act(() => {
      // T1 est l'IA qui joue Graouhhh. T2 et T3 sont humains et alignés
      // derrière lui sur la ligne B, jamais bâtie.
      vmCourant.setTitanModes((prev) => ({ ...prev, [t1.id]: "ia" }));
      /* On DÉGAGE explicitement la ligne B. Le plateau est tiré au hasard à
         chaque partie : un bâtiment en B5 tronque l'axe après T2, et le test
         mesure alors autre chose que ce qu'il annonce. Vu une fois pendant
         l'écriture de ce test — sans ce nettoyage il serait passé ou échoué
         selon le tirage, ce qui est pire qu'un test absent. */
      for (let c = 1; c <= 9; c++) delete vmCourant.state.board[`B${c}`];
      vmCourant.setState((prev) => ({ ...prev }));
      /* Profil FIXÉ. Il est tiré au hasard au lancement, et c'est lui qui
         pèse le choix de direction de `planCardPlay` : selon le tirage,
         l'IA visait parfois un axe vide et le test échouait sans qu'aucun
         code ne soit en cause. Vu une fois sur trois en suite complète —
         un test qui ment une fois sur trois est pire que pas de test. */
      vmCourant.setTitanProfiles((prev) => ({
        ...prev, [t1.id]: makeProfile(FORCES.EXPERT, TEMPERAMENTS.OPPORTUNISTE),
      }));
      t1.cell = "B2"; t1.programmed = ["graouhhh"]; t1.hand = [];
      t2.cell = "B4"; t2.repaire = ["bleu", "rose"];
      t3.cell = "B6"; t3.repaire = ["bleu", "rose"];
      // Le 4e Titan est écarté du plateau : sa position aléatoire pouvait
      // offrir à l'IA un axe plus tentant que celui qu'on a préparé.
      if (vmCourant.titanState.players[3]) vmCourant.titanState.players[3].cell = "I9";
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
      vmCourant.setPhase("action");
      vmCourant.setSelectedTitanId(t1.id);
      vmCourant.setActivePlayerId(t1.id);
    });

    /* Mouvement passif et Ramassage consommés — mais dans un SECOND act, et
       c'est tout l'enjeu. Un effet sur `activePlayerId` réarme `move: false`
       à l'ouverture du tour de chaque Titan (c'est la règle : le Mouvement
       gratuit revient à chaque tour). Posé dans le même act que
       `setActivePlayerId`, le réglage était donc écrasé par cet effet, l'IA
       se déplaçait quand même, et l'axe de tir n'était plus celui qu'on avait
       préparé. Le test ne passait alors que si l'IA atterrissait par chance
       sur un axe contenant encore une cible : vert 10 fois sur 12 en isolé,
       rouge en suite complète où le plateau tiré n'est pas le même. Mesuré,
       pas supposé. */
    act(() => {
      vmCourant.setPassifUsed((prev) => ({ ...prev, [t1.id]: { move: true, recup: true } }));
    });

    // La boucle IA enchaîne ses étapes sur des minuteries de 2 s.
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });

    /* On vérifie l'INVARIANT, pas l'identité de la cible. Le plateau est
       tiré au hasard et le 4e Titan est placé où il veut : selon la partie,
       l'IA vise T2 ou T3, et l'axe compte deux ou trois Titans. Ce qui doit
       être vrai dans TOUS les cas, et qui était faux avant ce correctif :
       le Titan dont le Dilemme est affiché n'a pas encore bougé. */
    const positionsAvant = new Map(
      vmCourant.titanState.players.map((p) => [p.id, p.cell])
    );

    expect(vmCourant.decisionQueue.length).toBeGreaterThan(0);
    const enCours = vmCourant.decisionQueue[0];
    expect(enCours.cardLabel).toBe("Graouhhh");
    // La cible attend son tour, immobile — c'est tout l'enjeu.
    expect([t2.id, t3.id]).toContain(enCours.defenderId);
    expect(positionsAvant.get(enCours.defenderId))
      .toBe(enCours.defenderId === t3.id ? "B6" : "B4");

    // Et personne d'autre sur l'axe n'a été déplacé par anticipation.
    expect(positionsAvant.get(t2.id)).toBe("B4");
    expect(positionsAvant.get(t3.id)).toBe("B6");

    // On tranche : la cible bouge alors, et alors seulement.
    const ciblee = enCours.defenderId;
    act(() => { vmCourant.resolveDilDefenderPick("bleu"); });
    expect(vmCourant.titanState.players.find((p) => p.id === ciblee).cell)
      .not.toBe(positionsAvant.get(ciblee));
  });
});
