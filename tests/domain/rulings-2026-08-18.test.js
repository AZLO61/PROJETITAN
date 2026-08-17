import { describe, expect, it } from "vitest";
import {
  appliquerReplElement,
  computeFinalScore,
  getCasesRepliDebris,
  projectInDirection,
  rentrerEnJeu,
  resolveGraouhhh,
} from "../../src/domain/gameRules.js";
import { setSeed } from "../../src/domain/rng.js";

/* Rulings du 2026-08-18, tranchés par Nikola après un test à la table.
   Un test par règle modifiée, comme l'impose le README : ce sont eux qui
   empêchent la prochaine passe de refaire le trajet inverse.

   Les sujets :
   · la SORTIE DU RING — par où revient un Titan poussé hors du plateau ;
   · le TAS DE DÉBRIS — deux blocs sur une case s'empilent, ils ne se
     poussent pas ;
   · la POUSSÉE EN CHAÎNE — un Titan qui en rencontre un autre le pousse,
     quelle que soit l'énergie qu'il lui reste ;
   · le REPLI OFFENSIF — viser la case d'un adversaire pour le déloger ;
   · l'ORDRE DIL / DÉPLACEMENT — le bloc perdu tombe là où le coup a été
     encaissé, pas là où la cible finit sa course ;
   · le COMPTE DES VERTS au décompte final. */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

const bat = (cle, etages = 2) => ({
  [cle]: { row: cle[0], col: Number(cle.slice(1)), blocks: Array(etages).fill("bleu"), socle: etages, isTeleporter: false },
});

describe("Sortie du ring : seul l'axe par lequel on sort boucle", () => {
  it("une sortie en diagonale par un seul bord garde sa trajectoire sur l'autre axe", () => {
    /* Le cas exact remonté par Nikola le 2026-08-18 : « j'étais en I2, un
       Titan était en H1, j'ai fait un Boing Boing à valeur 5 : il aurait dû
       être en G9, il était en I9. »

       Le Titan de H1 poussé vers le nord-ouest sort par la COLONNE, pas par
       la ligne : la colonne boucle de 0 à 9, la ligne suit sa route (H puis
       G). La règle précédente le renvoyait au bord opposé sur chaque axe où
       il avançait, coordonnée valide comprise, d'où le I9 constaté. */
    const titans = [t(1, "H1"), t(2, "I2")];
    const res = projectInDirection("H", 1, -1, -1, 3, {
      board: {}, looseBlocks: {}, titans, log: [], initiatorId: 2, movingTitanId: 1,
    });
    expect(res.ejecte).toBe(true);
    expect(res.row + res.col).toBe("G9");
    expect(titans[0].horsPlateau).toBe(true);
    expect(titans[0].cell).toBe("G9");
  });

  it("une sortie droite ne boucle que sur son axe", () => {
    const titans = [t(1, "E9"), t(2, "E8")];
    const res = projectInDirection("E", 9, 0, 1, 3, {
      board: {}, looseBlocks: {}, titans, log: [], initiatorId: 2, movingTitanId: 1,
    });
    expect(res.row + res.col).toBe("E1");
  });

  it("une sortie par un coin fait boucler les deux axes, donc renvoie au coin opposé", () => {
    // Les deux coordonnées dépassent en même temps : les deux bouclent, et
    // le Titan réapparaît au coin diamétralement opposé.
    const titans = [t(1, "I9"), t(2, "H8")];
    const res = projectInDirection("I", 9, 1, 1, 3, {
      board: {}, looseBlocks: {}, titans, log: [], initiatorId: 2, movingTitanId: 1,
    });
    expect(res.row + res.col).toBe("A1");
  });

  it("un Titan et un débris ressortent par la même case", () => {
    // Même départ, même direction : la case de réapparition est la même.
    // Ce qui change, c'est la suite — le Titan quitte la partie jusqu'à son
    // tour, le débris finit son déplacement de l'autre côté.
    const log = [];
    projectInDirection("H", 1, -1, -1, 5, {
      board: {}, looseBlocks: {}, titans: [], log, initiatorId: 1,
    });
    expect(log.some((l) => l.includes("Faille") && l.includes("G9"))).toBe(true);
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

describe("Un débris qui en rencontre un autre forme un tas", () => {
  it("le débris projeté s'empile au lieu de chasser celui qui dormait", () => {
    // « Lorsqu'un débris rencontre un autre débris, ça forme un tas de
    // débris, et non pas ça le pousse. » C'est le tableau des combinaisons
    // du livret : Bloc + Bloc → Amas. Le moteur transmettait l'énergie et
    // expédiait le bloc dormant une case plus loin.
    const looseBlocks = { E5: ["rouge"] };
    const res = projectInDirection("E", 4, 0, 1, 5, {
      board: {}, looseBlocks, titans: [], log: [], initiatorId: 1,
    });
    expect(res.row + res.col).toBe("E5");   // l'élément s'arrête sur le tas
    expect(looseBlocks.E5).toEqual(["rouge"]); // le dormant n'a pas bougé
    expect(looseBlocks.E6).toBeUndefined();    // rien n'a été transmis plus loin
  });

  it("un amas déjà formé arrête aussi la course, sans rien éjecter", () => {
    const looseBlocks = { E5: ["rouge", "bleu"] };
    const res = projectInDirection("E", 4, 0, 1, 5, {
      board: {}, looseBlocks, titans: [], log: [], initiatorId: 1,
    });
    expect(res.row + res.col).toBe("E5");
    expect(looseBlocks.E5).toHaveLength(2);
  });

  it("un TITAN en vol, lui, pousse toujours le débris qu'il croise", () => {
    // La différence est voulue : le béton s'empile, le Titan bouscule.
    const looseBlocks = { E5: ["rouge"] };
    const titans = [t(1, "E4")];
    projectInDirection("E", 4, 0, 1, 5, {
      board: {}, looseBlocks, titans, log: [], initiatorId: 2, movingTitanId: 1,
    });
    expect(looseBlocks.E5).toBeUndefined();
    expect(Object.values(looseBlocks).flat()).toContain("rouge");
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

describe("Décompte : un Vert n'enlève jamais de blocs", () => {
  it("un barème déjà au maximum ne perd pas de blocs quand un Vert s'y ajoute", () => {
    /* Le compte ajusté était borné à la longueur du barème. Sur un Repaire
       au-delà du maximum, ce `Math.min` ne bornait pas l'ajout : il faisait
       BAISSER le compte. Dix Bleu plus un Vert affichaient 9. */
    const dix = Array(10).fill("bleu");
    const joueurs = [t(1, "E5", { repaire: [...dix, "vert"] }), t(2, "A1")];
    const res = computeFinalScore(joueurs, { 1: [{ type: "color", target: "bleu" }] }, null);
    expect(res.adjCounts[1].bleu).toBe(11);
    // Le barème, lui, plafonne bien : 9 blocs ou plus valent 30 points.
    expect(res.baremeScores[1].bleu).toBe(30);
  });

  it("le bonus Rose se joue sur le compte réel, pas sur un compte rogné", () => {
    // T1 a 9 Rose (barème long de 8) plus un Vert placé en Rose, T2 en a 9.
    // Avec l'ancien plafond, T1 tombait à 8 et perdait les 10 points.
    const joueurs = [
      t(1, "E5", { repaire: [...Array(9).fill("rose"), "vert"] }),
      t(2, "A1", { repaire: Array(9).fill("rose") }),
    ];
    const res = computeFinalScore(joueurs, { 1: [{ type: "color", target: "rose" }] }, null);
    expect(res.adjCounts[1].rose).toBe(10);
    expect(res.roseWinners).toEqual([1]);
    expect(res.totals[1].roseBonus).toBe(10);
    expect(res.totals[2].roseBonus).toBe(0);
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
