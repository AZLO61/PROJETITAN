/* ============================================================
   PROJET TITAN — LE BORD DU PLATEAU N'ARRÊTE PLUS RIEN
   ============================================================
   Nikola, 2026-08-30 : « finalement même le débris sort du plateau pour passer
   de l'autre côté, qu'importe l'énergie ; donc normalement il n'y a plus aucune
   condition différente ».

   Il revient sur son ruling du 18 août, qui faisait s'arrêter net au rebord
   tout élément arrivant là sans l'énergie du Seuil 4. Ce ruling-là produisait
   le cas remonté à la table : un Titan chargé pousse son voisin, celui-ci
   devait chasser un troisième élément posté au rebord, et l'élément restait
   collé au bord au lieu de traverser.

   Le bord n'est donc plus un obstacle pour personne. Ce qui reste différent
   entre un Titan et un débris n'est plus une CONDITION mais une CONSÉQUENCE :
   le débris finit son déplacement de l'autre côté, le Titan quitte la partie
   jusqu'à son tour.

   Ce que ces tests protègent, au-delà du cas : le Seuil 4 ne décide plus RIEN
   au bord. Il garde tout le reste — DIL contre RAGE, et le bâtiment percuté
   qui casse un bloc ou fait mur.
============================================================ */
import { describe, expect, it } from "vitest";
import { projectInDirection, resolveTeteEnAvant } from "../../src/domain/gameRules.js";

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

describe("Un débris traverse le bord quelle que soit son énergie", () => {
  it("avec 1 d'énergie, il ressort de l'autre côté au lieu de rester au rebord", () => {
    /* E9, poussé plein est avec 1 d'énergie : sous l'ancien ruling il
       s'arrêtait sur place. Il doit maintenant ressortir en E1. */
    const log = [];
    const res = projectInDirection("E", 9, 0, 1, 1, {
      board: {}, looseBlocks: {}, titans: [], log, initiatorId: 1,
    });
    expect(res.row + res.col).toBe("E1");
    expect(log.join(" ")).toMatch(/Faille spatio-temporelle/);
  });

  it("avec 3 d'énergie non plus, le Seuil 4 ne commande plus rien ici", () => {
    // 3 était l'exemple le plus courant : juste sous le seuil.
    const res = projectInDirection("E", 9, 0, 1, 3, {
      board: {}, looseBlocks: {}, titans: [], log: [], initiatorId: 1,
    });
    // Il traverse et poursuit : il est de l'autre côté, pas au rebord d'origine.
    expect(Number((res.row + res.col).slice(1))).toBeLessThan(5);
  });

  it("plus aucun message d'arrêt au bord faute d'énergie", () => {
    const log = [];
    projectInDirection("E", 9, 0, 1, 2, {
      board: {}, looseBlocks: {}, titans: [], log, initiatorId: 1,
    });
    expect(log.join(" ")).not.toMatch(/bord du plateau atteint|énergie insuffisante pour la faille/);
  });

  it("la sortie en diagonale par un coin boucle sur les deux axes", () => {
    // I9 vers le sud-est avec 1 : les deux axes dépassent ensemble.
    const res = projectInDirection("I", 9, 1, 1, 1, {
      board: {}, looseBlocks: {}, titans: [], log: [], initiatorId: 1,
    });
    expect(res.row + res.col).toBe("A1");
  });
});

describe("Le Titan, lui, sort du ring — et c'est une conséquence, pas une condition", () => {
  it("est éjecté avec 1 d'énergie comme avec 5", () => {
    for (const energie of [1, 5]) {
      const cible = t(2, "E9");
      const res = projectInDirection("E", 9, 0, 1, energie, {
        board: {}, looseBlocks: {}, titans: [cible], log: [],
        initiatorId: 1, movingTitanId: 2,
      });
      expect(res.ejecte, `énergie ${energie}`).toBe(true);
      expect(cible.horsPlateau, `énergie ${energie}`).toBe(true);
      expect(cible.cell, `énergie ${energie}`).toBe("E1");
    }
  });
});

describe("Le cas remonté à la table : une charge qui pousse jusqu'au rebord", () => {
  it("le Titan posté au bord est chassé du plateau au lieu de bloquer la chaîne", () => {
    /* L'attaquant en E7 charge plein est. Sa cible est en E8, et un troisième
       Titan est collé au rebord en E9 : c'est lui qui devait « être warp » et
       qui restait coincé. */
    const attaquant = t(1, "E7");
    const cible = t(2, "E8");
    const auBord = t(3, "E9");
    const jeu = {
      titans: [attaquant, cible, auBord],
      looseBlocks: {}, board: {}, replis: [], trajectoires: [],
    };

    resolveTeteEnAvant(1, 0, 1, 0, jeu);

    // Celui du rebord est sorti du ring, et rentrera par l'autre bord.
    expect(auBord.horsPlateau).toBe(true);
    expect(auBord.cell).toBe("E1");
    // La chaîne a bien joué : la cible a pris la case libérée.
    expect(cible.cell).toBe("E9");
    // Deux Titans distincts déplacés, deux Bagarres (FAQ #12).
    expect(attaquant.bagarre).toBe(2);
  });
});
