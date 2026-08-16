import { describe, expect, it } from "vitest";
import {
  appliquerReplElement,
  getCasesRepliDebris,
  projectInDirection,
  rentrerEnJeu,
  resolveGraouhhh,
} from "../../src/domain/gameRules.js";
import { setSeed } from "../../src/domain/rng.js";

/* Rulings du 2026-08-18, tranchés par Nikola après un test à la table.
   Un test par règle modifiée, comme l'impose le README : ce sont eux qui
   empêchent la prochaine passe de refaire le trajet inverse.

   Quatre sujets :
   · le MIROIR — par où revient un Titan poussé hors du ring ;
   · la POUSSÉE EN CHAÎNE — un Titan qui en rencontre un autre le pousse,
     quelle que soit l'énergie qu'il lui reste ;
   · le REPLI OFFENSIF — viser la case d'un adversaire pour le déloger ;
   · l'ORDRE DIL / DÉPLACEMENT — le bloc perdu tombe là où le coup a été
     encaissé, pas là où la cible finit sa course. */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

const bat = (cle, etages = 2) => ({
  [cle]: { row: cle[0], col: Number(cle.slice(1)), blocks: Array(etages).fill("bleu"), socle: etages, isTeleporter: false },
});

describe("Sortie du ring : on ressort à l'opposé, comme un miroir", () => {
  it("une sortie en diagonale renvoie au coin opposé", () => {
    // Le cas exact remonté par Nikola : « j'ai sorti un Titan de I8 en
    // direction de J9, il aurait dû apparaître sur A1 ». L'ancien warp ne
    // bouclait que sur la ligne et le laissait en A9, du même côté que
    // celui d'où il venait de partir.
    const titans = [t(1, "I8"), t(2, "H7")];
    const res = projectInDirection("I", 8, 1, 1, 3, {
      board: {}, looseBlocks: {}, titans, log: [], initiatorId: 2, movingTitanId: 1,
    });
    expect(res.ejecte).toBe(true);
    expect(res.row + res.col).toBe("A1");
    expect(titans[0].horsPlateau).toBe(true);
    expect(titans[0].cell).toBe("A1");
  });

  it("une sortie droite reste inchangée, elle ne boucle que sur son axe", () => {
    const titans = [t(1, "E9"), t(2, "E8")];
    const res = projectInDirection("E", 9, 0, 1, 3, {
      board: {}, looseBlocks: {}, titans, log: [], initiatorId: 2, movingTitanId: 1,
    });
    expect(res.row + res.col).toBe("E1");
  });

  it("le miroir vaut dans les quatre coins", () => {
    const titans = [t(1, "A2"), t(2, "B3")];
    const res = projectInDirection("A", 2, -1, -1, 3, {
      board: {}, looseBlocks: {}, titans, log: [], initiatorId: 2, movingTitanId: 1,
    });
    expect(res.row + res.col).toBe("I9");
  });

  it("un coin occupé par un bâtiment fait rentrer JUSTE À CÔTÉ, sur l'un des deux rebords", () => {
    // « Il aurait dû apparaître sur A1 mais il y avait un bâtiment, du coup
    // il devrait être pas loin. » Un coin appartient à deux rebords : on
    // longe les deux et on prend la case libre la plus proche, au lieu de
    // s'enfermer arbitrairement sur la colonne.
    const board = { ...bat("A1", 3), ...bat("B1", 3) };
    const titans = [t(1, "A1", { horsPlateau: true })];
    const retour = rentrerEnJeu(1, { board, titans, looseBlocks: {} });
    expect(retour.rentre).toBe(true);
    expect(retour.cellule).toBe("A2"); // écart 1 sur la ligne, la colonne est bouchée
    expect(titans[0].horsPlateau).toBe(false);
  });
});

describe("Un Titan poussé qui en rencontre un autre le pousse", () => {
  it("Graouhhh : la chaîne passe, même avec 1 seule énergie restante", () => {
    setSeed(1);
    // T1 joue Graouhhh vers l'est. T2 est touché sur l'axe et recule de 2.
    // T3 est juste derrière lui : l'ancienne règle refusait la poussée en
    // dessous de 2 d'énergie transmise, T2 se collait à T3 sans le bouger.
    const titans = [t(1, "E1"), t(2, "E2"), t(3, "E3")];
    const res = resolveGraouhhh(1, 0, 1, 1, { board: {}, looseBlocks: {}, titans, replis: [] });
    expect(res.titansTouches).toContain(2);
    expect(titans[2].cell).not.toBe("E3"); // T3 a bien été délogé
    expect(titans[1].cell).not.toBe("E2"); // T2 a bien reculé
    expect(titans[0].bagarre).toBe(2);     // 2 Titans distincts déplacés (FAQ #12)
  });

  it("aucun Titan n'est poussé deux fois dans la même réaction", () => {
    // Garde-fou du 2026-08-18 : un Titan encore en vol est intouchable.
    // Sans lui, un rebond ramenait la chaîne sur lui et son appelant
    // écrasait ensuite le second déplacement — deux Titans sur une case.
    setSeed(2);
    const titans = [t(1, "E1"), t(2, "E2"), t(3, "E3"), t(4, "E4")];
    resolveGraouhhh(1, 0, 1, 1, { board: {}, looseBlocks: {}, titans, replis: [] });
    const cases = titans.filter((x) => !x.horsPlateau).map((x) => x.cell);
    expect(new Set(cases).size).toBe(cases.length);
  });
});

describe("Repli offensif : déloger un adversaire pour marquer sa Bagarre", () => {
  it("la case d'un autre Titan est proposée au repli d'un Titan", () => {
    const titans = [t(1, "B9"), t(2, "B8")];
    const cases = getCasesRepliDebris("B9", "C9", 1, 0, { board: {}, titans, movingTitanId: 1, initiatorId: 3 });
    expect(cases).toContain("B8");
  });

  it("la choisir pousse l'occupant d'une case et crédite la Bagarre", () => {
    const titans = [t(1, "B9"), t(2, "B8"), t(3, "E5")];
    const repli = { titanId: 1, defaut: "B9", cases: ["B9", "B8"], cible: "C9", initiatorId: 3 };
    const res = appliquerReplElement(repli, "B8", { board: {}, looseBlocks: {}, titans });
    expect(res.applied).toBe(true);
    expect(titans[0].cell).toBe("B8");   // le Titan replié prend la case
    expect(titans[1].cell).not.toBe("B8"); // l'occupant a été chassé
    expect(titans[2].bagarre).toBe(1);   // l'initiateur marque sa Bagarre
  });

  it("un débris ne se pose jamais sur un bâtiment debout, même sur sa case d'origine", () => {
    // Défaut trouvé en campagne (graine 7067) : un bloc cassé part de la
    // case du bâtiment qu'on vient d'entamer, et cette case échappait au
    // filtre au titre du « il peut revenir là où il était ».
    const board = bat("B9", 2);
    const cases = getCasesRepliDebris("B9", "C9", 1, 0, { board, looseBlocks: {}, titans: [] });
    expect(cases).not.toContain("B9");
  });
});

describe("Le Dilemme s'applique avant le recul", () => {
  it("la demande porte la case où le coup a été encaissé, pas la case d'arrivée", () => {
    setSeed(3);
    // T2 est adjacent à T1 : son bloc perdu doit tomber en E2, donc dans le
    // Périmètre de T1, qui pourra le ramasser avec son passif. S'il tombait
    // sur sa case d'arrivée après recul, il serait hors de portée.
    const titans = [
      t(1, "E1"),
      t(2, "E2", { repaire: ["bleu", "rose"] }),
    ];
    const res = resolveGraouhhh(1, 0, 1, 1, { board: {}, looseBlocks: {}, titans, replis: [] });
    const dil = (res.decisions || []).find((d) => d.type === "DIL" && d.defenderId === 2);
    expect(dil).toBeTruthy();
    expect(dil.cellAtImpact).toBe("E2");
    expect(titans[1].cell).not.toBe("E2"); // il a bien reculé ensuite
  });
});
