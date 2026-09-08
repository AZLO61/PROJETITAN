/* ============================================================
   PROJET TITAN — Retours de table du 8 septembre 2026
   ============================================================
   Trois défauts remontés par Nikola dans la même partie, tous sur le même
   mécanisme : le REPLI, c'est-à-dire le choix laissé à l'attaquant quand un
   élément projeté n'a pas la puissance de franchir ce qu'il percute.

   1. « J'ai boing boing sur 1 titan qui a tapé un bâtiment, j'ai eu le choix
      de le replacer 2 fois alors que 1 fois suffit. » Deux demandes pour un
      seul arrêt physique.

   2. « J'ai chargé un titan en C5, j'étais en E7, un titan était en B4, un
      bâtiment en A3 : le titan B4 a été déplacé mais celui en C5 n'a pas pris
      la place de B4. » La chaîne conclut « personne n'a bougé » et s'arrête,
      alors que le repli libère la case juste après.

   3. « Le débris qui était en A4 aurait dû warp avec le titan B4 qui est allé
      en A4. » Un Titan reposé par un repli ne bousculait pas le béton qui
      dormait sur sa case, alors que la réaction en chaîne le fait depuis le
      ruling du 2026-09-07.

   Rappel de l'arbitrage du même jour, vérifié ici aussi : un maillon avance
   d'UNE case, celle qui se libère devant lui, et s'arrête là quelle que soit
   l'énergie qui lui restait.
============================================================ */
import { describe, expect, it } from "vitest";
import {
  appliquerReplElement,
  resolveBoingBoing,
  resolveTeteEnAvant,
} from "../../src/domain/gameRules.js";
import { setSeed } from "../../src/domain/rng.js";

const bat = (row, col, blocks) => ({ row, col, blocks: [...blocks], socle: blocks.length, isTeleporter: false });
const titan = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], bagarre: 0, destruction: 0, adrenaline: 0,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [], ...extra,
});

describe("Boing Boing · une seule demande de placement", () => {
  it("un occupant projeté contre un bâtiment n'est replacé qu'une fois", () => {
    setSeed(1);
    const replis = [];
    const etat = {
      board: { C7: bat("C", 7, ["bleu", "rose", "orange"]) },
      looseBlocks: {},
      titans: [titan(1, "C5"), titan(2, "C6")],
      replis,
      trajectoires: [],
    };

    const res = resolveBoingBoing(1, "C6", 0, 1, etat);
    expect(res.applied).toBe(true);

    // Avant la correction : deux entrées pour le même Titan 2, l'une venue de
    // la charnière (projectInDirection), l'autre des cases libres adjacentes
    // recalculées ici — le joueur plaçait deux fois le même Titan.
    expect(replis.filter((r) => r.titanId === 2)).toHaveLength(1);

    // Le sauteur prend la case visée, donc l'occupant ne peut pas y rester :
    // elle est retirée de ses options.
    expect(replis[0].cases).not.toContain("C6");
    expect(etat.titans.find((t) => t.id === 1).cell).toBe("C6");
    expect(etat.titans.find((t) => t.id === 2).cell).toBe(replis[0].defaut);
  });
});

describe("Tête en Avant · la file avance quand le repli libère la case", () => {
  const scene = () => {
    const replis = [];
    return {
      replis,
      etat: {
        board: { A3: bat("A", 3, ["bleu", "rose"]) },
        looseBlocks: { A4: ["orange"] },
        titans: [titan(1, "E7"), titan(2, "C5"), titan(3, "B4")],
        replis,
        trajectoires: [],
      },
    };
  };

  it("le repli du Titan coincé sait qui attend derrière lui", () => {
    setSeed(1);
    const { etat, replis } = scene();
    resolveTeteEnAvant(1, -1, -1, 0, etat);

    const repli = replis.find((r) => r.titanId === 3);
    expect(repli).toBeTruthy();
    expect(repli.cases).toContain("A4");
    // Du plus proche du blocage au plus lointain : le Titan 2 poussait le 3,
    // le Titan 1 chargeait le 2.
    expect(repli.suiveurs.map((s) => `${s.id}:${s.vers}`)).toEqual(["2:B4", "1:C5"]);
  });

  it("chaque maillon prend la case que le précédent vient de quitter", () => {
    setSeed(1);
    const { etat, replis } = scene();
    resolveTeteEnAvant(1, -1, -1, 0, etat);
    const repli = replis.find((r) => r.titanId === 3);

    // Sans la correction, seul le Titan 3 bougeait : le 2 restait en C5 et le
    // chargeur reculait en D6 pour rien.
    const res = appliquerReplElement(repli, "A4", etat);
    expect(res.applied).toBe(true);
    expect(etat.titans.find((t) => t.id === 3).cell).toBe("A4");
    expect(etat.titans.find((t) => t.id === 2).cell).toBe("B4");
    expect(etat.titans.find((t) => t.id === 1).cell).toBe("C5");
  });

  it("le débris qui dormait sur la case part par la faille", () => {
    setSeed(1);
    const { etat, replis } = scene();
    resolveTeteEnAvant(1, -1, -1, 0, etat);
    const repli = replis.find((r) => r.titanId === 3);

    appliquerReplElement(repli, "A4", etat);
    // Poussé de B4 vers A4, donc vers le nord : le bord ne l'arrête pas, il
    // ressort en I4 (« il aurait dû warp avec le titan »).
    expect(etat.looseBlocks.A4).toBeUndefined();
    expect(etat.looseBlocks.I4).toEqual(["orange"]);
  });

  it("la file avance d'une case, pas de deux", () => {
    setSeed(1);
    const { etat, replis } = scene();
    resolveTeteEnAvant(1, -1, -1, 0, etat);
    appliquerReplElement(replis.find((r) => r.titanId === 3), "A4", etat);
    // Le Titan 2 s'arrête sur la case libérée ; il ne poursuit pas vers A3
    // avec ce qui lui restait d'énergie (arbitrage Nikola du 2026-09-08).
    expect(etat.titans.find((t) => t.id === 2).cell).toBe("B4");
    expect(etat.board.A3.blocks).toHaveLength(2);
  });
});
