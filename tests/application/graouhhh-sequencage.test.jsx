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

/* `ciblesIA` : les Titans à confier à l'IA AVANT le lancement. Il faut que ce
   soit avant — changer `titanModes` en cours de partie relance une partie
   neuve (l'effet de `regenerate` en dépend), ce qui efface silencieusement
   tout ce que le test vient de poser. On passe donc par les interrupteurs de
   l'écran d'accueil, comme un joueur. */
async function partieAvecTroisTitansEnLigne(ciblesIA = []) {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  if (ciblesIA.length > 0) {
    const commutateurs = screen.getAllByRole("switch");
    for (const id of ciblesIA) await user.click(commutateurs[id - 1]);
  }
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  /* Mise en place dépassée (ruling du 2026-08-28) : à 4 humains, la partie
     s'ouvre désormais sur le placement des Titans, un clic par joueur. Ce
     test-ci pose lui-même les positions qu'il veut examiner, la mise en
     place n'est donc pas son sujet — on la solde d'un coup. */
  act(() => vmCourant.terminerPlacement());

  const [t1, t2, t3] = vmCourant.titanState.players;
  act(() => {
    /* On DÉGAGE la ligne B et on écarte le 4e Titan, au lieu de compter
       sur le tirage. Le commentaire d'origine affirmait que la ligne B ne
       porte « jamais » de bâtiment : c'est faux, le plateau est aléatoire.
       Le test passait isolé mais échouait environ une fois sur trois en
       suite complète — l'état du RNG partagé n'y est pas le même, donc le
       plateau non plus, et un bâtiment en B5 (ou le 4e Titan tombé sur
       l'axe) changeait la liste des Titans touchés. Diagnostiqué le
       2026-08-18 en bouclant la suite jusqu'à capturer l'échec. */
    for (let c = 1; c <= 9; c++) delete vmCourant.state.board[`B${c}`];
    vmCourant.setState((prev) => ({ ...prev }));
    if (vmCourant.titanState.players[3]) vmCourant.titanState.players[3].cell = "I9";
    t1.cell = "B2"; t1.programmed = ["graouhhh"];
    t2.cell = "B4"; t2.repaire = ["bleu", "rose"]; t2.socles = [];
    t3.cell = "B6"; t3.repaire = ["bleu", "rose"]; t3.socles = [];
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

  /* ── LE BLOC PERDU TOMBE SUR LA CASE D'IMPACT, POUR LES DEUX CIBLES ──
     Nikola, 2026-09-07 : « j'ai fait un Graouhhh sur 2 Titans ; le 2e, donc le
     plus proche, n'a pas laissé de débris du DIL sur sa case avant de partir ».

     Le ruling du 2026-08-17 est explicite : « quand un Titan doit perdre un
     bloc sans qu'il soit pris par le Titan initiateur, il le perd sur la case
     où il est, et ensuite il est déplacé si besoin ». Le bloc tombe donc sur la
     case occupée À L'INSTANT DE L'IMPACT, jamais sur celle d'arrivée — c'est
     toute la raison d'être de `cellAtImpact`.

     Le premier Titan traité était déjà couvert par le test ci-dessus ; le
     SECOND ne l'était pas, et c'est justement lui que Nikola a vu partir les
     mains vides. Ce test suit les deux. */
  it("chaque cible laisse son bloc de DIL sur SA case d'impact, la seconde comme la première", async () => {
    const { t2, t3 } = await partieAvecTroisTitansEnLigne();
    // Le plateau de départ ne porte aucun débris sur les deux cases d'impact :
    // ce qu'on y trouvera à la fin ne peut venir que du Dilemme.
    expect(vmCourant.looseBlocks.B6).toBeUndefined();
    expect(vmCourant.looseBlocks.B4).toBeUndefined();

    act(() => { vmCourant.jouerGraouhhh(); });

    // T3, le plus loin, est traité en premier.
    expect(vmCourant.decisionQueue[0].defenderId).toBe(t3.id);
    expect(vmCourant.decisionQueue[0].cellAtImpact).toBe("B6");
    act(() => { vmCourant.resolveDilDefenderPick("bleu"); });
    expect(vmCourant.looseBlocks.B6).toEqual(["bleu"]);

    // Puis T2, le plus proche. C'est celui-ci qui partait sans rien laisser.
    expect(vmCourant.decisionQueue[0].defenderId).toBe(t2.id);
    expect(vmCourant.decisionQueue[0].cellAtImpact).toBe("B4");
    act(() => { vmCourant.resolveDilDefenderPick("rose"); });
    expect(vmCourant.looseBlocks.B4).toEqual(["rose"]);

    // Et les deux ont bien quitté leur case : le bloc reste derrière eux.
    expect(vmCourant.titanState.players.find((p) => p.id === t2.id).cell).not.toBe("B4");
    expect(vmCourant.titanState.players.find((p) => p.id === t3.id).cell).not.toBe("B6");
  });

});
