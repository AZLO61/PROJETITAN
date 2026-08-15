import { describe, expect, it } from "vitest";
import {
  canRage,
  canDil,
  releaseSocle,
  placeTitans,
  isSocleMarker,
  socleValue,
  projectInDirection,
  resolveTeteEnAvant,
  resolveGraouhhh,
  resolveBoingBoing,
  resolveRecuperation,
  computeFinalScore,
  checkEndGameTriggers,
  manchesMax,
  CORNERS,
} from "../../src/domain/gameRules.js";

// Tests de non-régression sur les points de règle V36 tranchés par Nikola.
// Le README impose un test pour toute modification de règle : c'est ici que
// les rulings sont verrouillés, pour qu'un futur refactor du moteur ne
// puisse pas les défaire silencieusement.

const titan = (id, repaire = [], adrenaline = 0) => ({ id, repaire, adrenaline });

describe("ruling — RAGE possible dès 1 ressource, seul DIL peut être impossible", () => {
  it("RAGE fonctionne avec une seule ressource en Repaire", () => {
    const gameState = { titans: [titan(1, ["bleu"])] };
    expect(canRage(1, gameState)).toBe(true);
  });

  it("RAGE fonctionne avec deux ressources ou plus", () => {
    const gameState = { titans: [titan(1, ["bleu", "rose", "vert"])] };
    expect(canRage(1, gameState)).toBe(true);
  });

  it("RAGE reste sans cible quand le Titan n'a ni ressource ni Adrénaline", () => {
    const gameState = { titans: [titan(1, [], 0)] };
    expect(canRage(1, gameState)).toBe(false);
  });

  it("FAQ #5 conservée : l'Adrénaline seule suffit à rendre RAGE possible", () => {
    const gameState = { titans: [titan(1, [], 1)] };
    expect(canRage(1, gameState)).toBe(true);
  });

  it("DIL reste impossible avec une seule couleur, même en plusieurs exemplaires", () => {
    const gameState = { titans: [titan(1, ["bleu", "bleu", "bleu"])] };
    expect(canDil(1, gameState)).toBe(false);
    // C'est tout l'objet du ruling : sur ce même état, RAGE passe et DIL non.
    expect(canRage(1, gameState)).toBe(true);
  });

  it("DIL devient possible dès deux couleurs différentes", () => {
    const gameState = { titans: [titan(1, ["bleu", "rose"])] };
    expect(canDil(1, gameState)).toBe(true);
  });
});

describe("ruling — Socle libéré : personne ne le récupère, il reste au sol", () => {
  it("dépose le Socle au sol de la case, sans l'attribuer à un joueur", () => {
    const board = {
      E5: { row: "E", col: 5, blocks: ["bleu"], socle: 3, isTeleporter: false },
    };
    const looseBlocks = {};

    releaseSocle("E5", board, looseBlocks);

    // Le bâtiment est vidé, le Socle atterrit dans les blocs libres.
    expect(board.E5.blocks).toHaveLength(0);
    expect(looseBlocks.E5).toHaveLength(1);
    expect(isSocleMarker(looseBlocks.E5[0])).toBe(true);
    expect(socleValue(looseBlocks.E5[0])).toBe(3);
  });

  it("ne touche à aucun Repaire : aucune attribution automatique", () => {
    const board = {
      A1: { row: "A", col: 1, blocks: [], socle: 2, isTeleporter: false },
    };
    const looseBlocks = {};
    const titans = [titan(1, ["bleu"]), titan(2, [])];
    const repairesAvant = titans.map((t) => [...t.repaire]);

    releaseSocle("A1", board, looseBlocks);

    // releaseSocle ne reçoit même pas les Titans : le Socle ne peut, par
    // construction, être crédité à personne au moment de la destruction.
    expect(titans.map((t) => t.repaire)).toEqual(repairesAvant);
  });

  it("empile le Socle avec les blocs déjà au sol sur la case", () => {
    const board = {
      C3: { row: "C", col: 3, blocks: ["rouge"], socle: 1, isTeleporter: false },
    };
    const looseBlocks = { C3: ["orange"] };

    releaseSocle("C3", board, looseBlocks);

    expect(looseBlocks.C3).toHaveLength(2);
    expect(looseBlocks.C3[0]).toBe("orange");
    expect(isSocleMarker(looseBlocks.C3[1])).toBe(true);
  });
});

describe("ruling — ricochet destructeur au Seuil 4", () => {
  // Bâtiment posé en E5 ; on projette depuis E3 vers l'est, donc l'élément
  // traverse E4 puis percute E5.
  const makeCtx = (blocks, socle = 2) => {
    const board = {
      E5: { row: "E", col: 5, blocks: [...blocks], socle, isTeleporter: false },
    };
    const looseBlocks = {};
    return { board, looseBlocks, titans: [], log: [] };
  };

  it("casse un bloc quand l'énergie à l'impact atteint le Seuil 4", () => {
    const ctx = makeCtx(["bleu", "rose"]);
    projectInDirection("E", 3, 0, 1, 6, ctx);

    // Le bâtiment a perdu son bloc du dessus.
    expect(ctx.board.E5.blocks).toEqual(["bleu"]);
    // Le bloc cassé a été projeté et posé quelque part sur le plateau.
    const posés = Object.values(ctx.looseBlocks).flat();
    expect(posés).toContain("rose");
  });

  it("rebondit sans rien casser en dessous du Seuil 4", () => {
    const ctx = makeCtx(["bleu", "rose"]);
    projectInDirection("E", 3, 0, 1, 2, ctx);

    // Comportement historique préservé : le bâtiment reste intact.
    expect(ctx.board.E5.blocks).toEqual(["bleu", "rose"]);
    expect(Object.values(ctx.looseBlocks).flat()).toHaveLength(0);
  });

  it("libère le Socle au sol, à personne, quand le ricochet vide le bâtiment", () => {
    const ctx = makeCtx(["bleu"], 3);
    projectInDirection("E", 3, 0, 1, 6, ctx);

    expect(ctx.board.E5.blocks).toHaveLength(0);
    const socleEntry = (ctx.looseBlocks.E5 || []).find((e) => isSocleMarker(e));
    expect(socleEntry).toBeTruthy();
    expect(socleValue(socleEntry)).toBe(3);
  });

  it("arrête l'élément percutant : il n'avance pas sur la case du bâtiment", () => {
    const ctx = makeCtx(["bleu", "rose"]);
    const landing = projectInDirection("E", 3, 0, 1, 6, ctx);
    expect(landing.row + landing.col).not.toBe("E5");
  });
});

describe("ruling — Adrénaline dépensable en quantité", () => {
  // Livret, cartes 02 et 04 : « +1 par Adrénaline dépensée ». Le moteur
  // acceptait un booléen, donc une seule Adrénaline par action. Il prend
  // maintenant un nombre, et l'ancien appel booléen reste valide.
  const board = {};
  const ctx = () => ({
    board,
    looseBlocks: {},
    titans: [{ id: 1, cell: "E5", repaire: [], adrenaline: 3, socles: [], bagarre: 0, destruction: 0 }],
  });

  it("Tête en Avant : la portée grandit d'une case par Adrénaline", () => {
    const sansAdr = resolveTeteEnAvant(1, 0, 1, 0, ctx());
    const uneAdr = resolveTeteEnAvant(1, 0, 1, 1, ctx());
    const deuxAdr = resolveTeteEnAvant(1, 0, 1, 2, ctx());

    // Sur un plateau vide, le Titan avance jusqu'au bout de sa portée.
    const col = (r) => Number(r.log.join(" ").match(/E(\d)/g)?.pop()?.slice(1) ?? 5);
    expect(col(uneAdr)).toBeGreaterThanOrEqual(col(sansAdr));
    expect(col(deuxAdr)).toBeGreaterThanOrEqual(col(uneAdr));
  });

  it("l'ancien appel booléen vaut toujours 1 Adrénaline", () => {
    const avecBool = resolveTeteEnAvant(1, 0, 1, true, ctx());
    const avecUn = resolveTeteEnAvant(1, 0, 1, 1, ctx());
    expect(avecBool.log.length).toBe(avecUn.log.length);
  });
});

describe("règle — deux Titans ne partagent jamais une case", () => {
  // Bug remonté : après une charge, T1 et T4 se retrouvaient tous deux en H6.
  // La cible projetée peut rebondir et revenir sur la case d'arrêt prévue de
  // l'attaquant, ou rester bloquée sur place. Le livret interdit la
  // superposition Titan + Titan : l'attaquant doit reculer.
  it("l'attaquant recule si sa case d'arrêt est occupée après la charge", () => {
    for (let essai = 0; essai < 60; essai++) {
      // Plateau clos : la cible n'a nulle part où aller, elle reste collée.
      const board = {};
      const titans = [
        { id: 1, cell: "H4", repaire: ["bleu", "rose"], adrenaline: 0, socles: [], bagarre: 0, destruction: 0 },
        { id: 4, cell: "H6", repaire: ["bleu", "rose"], adrenaline: 0, socles: [], bagarre: 0, destruction: 0 },
      ];
      resolveTeteEnAvant(1, 0, 1, 0, { board, looseBlocks: {}, titans });

      const cases = titans.map((t) => t.cell);
      expect(new Set(cases).size).toBe(cases.length);
    }
  });
});

describe("ruling — bonus Graouhhh cumulatif linéaire (FAQ #11, revue 2026-08-15)", () => {
  // Ancien ruling (2026-08-11) : +1 fixe et plafonné, quel que soit le nombre
  // de Titans touchés. Revu par Nikola : +1 par Titan touché au-delà du
  // premier. Le plafond de fait est +2, l'initiateur ne pouvant toucher que
  // 3 autres Titans au maximum dans une partie à 4 joueurs.
  const cible = (id, cell) => ({
    id, cell, repaire: [], adrenaline: 0, socles: [], bagarre: 0,
    destruction: 0, programmed: [], hand: [], repos: [],
  });

  it("aucun bonus quand un seul Titan est touché", () => {
    const titans = [cible(1, "E1"), cible(2, "E2")];
    resolveGraouhhh(1, 0, 1, 1, { board: {}, looseBlocks: {}, titans });
    expect(titans[0].adrenaline).toBe(0);
  });

  it("+1 Adrénaline pour 2 Titans touchés", () => {
    const titans = [cible(1, "E1"), cible(2, "E2"), cible(3, "E3")];
    resolveGraouhhh(1, 0, 1, 1, { board: {}, looseBlocks: {}, titans });
    expect(titans[0].adrenaline).toBe(1);
  });

  it("+2 Adrénaline pour 3 Titans touchés, le bonus n'est plus plafonné à +1", () => {
    const titans = [cible(1, "E1"), cible(2, "E2"), cible(3, "E3"), cible(4, "E4")];
    resolveGraouhhh(1, 0, 1, 1, { board: {}, looseBlocks: {}, titans });
    expect(titans[0].adrenaline).toBe(2);
  });

  it("le bonus s'ajoute au stock d'Adrénaline déjà possédé", () => {
    const titans = [cible(1, "E1"), cible(2, "E2"), cible(3, "E3")];
    titans[0].adrenaline = 2;
    resolveGraouhhh(1, 0, 1, 1, { board: {}, looseBlocks: {}, titans });
    expect(titans[0].adrenaline).toBe(3);
  });
});

describe("règle — la Récupération ne téléporte jamais sur un autre Titan", () => {
  // Bug trouvé par le diagnostic (npm run diagnose) : le déplacement
  // obligatoire déclenché par une case libérée ne vérifiait que la
  // présence d'un bâtiment. Un Titan qui ramassait le dernier bloc d'une
  // case occupée par un adversaire se téléportait dessus. 13 occurrences
  // sur 15 parties simulées, et le cas est atteignable en jeu humain :
  // les débris tombent régulièrement sous les pieds d'un adversaire.
  const t = (id, cell) => ({
    id, cell, repaire: [], socles: [], bagarre: 0, destruction: 0,
    adrenaline: 0, programmed: [], hand: [], repos: [],
    playedThisManche: [], discardedHidden: [],
  });

  it("le ramasseur reste sur place si la case libérée est occupée", () => {
    const titans = [t(1, "E5"), t(2, "E6")];
    resolveRecuperation(1, "E6", { board: {}, looseBlocks: { E6: ["bleu"] }, titans }, "bleu");
    expect(titans[0].cell).toBe("E5");
    expect(titans[1].cell).toBe("E6");
    // Le bloc est bien récupéré : seul le déplacement est empêché.
    expect(titans[0].repaire).toEqual(["bleu"]);
  });

  it("le déplacement a bien lieu quand la case libérée est libre", () => {
    const titans = [t(1, "E5"), t(2, "A1")];
    resolveRecuperation(1, "E6", { board: {}, looseBlocks: { E6: ["bleu"] }, titans }, "bleu");
    expect(titans[0].cell).toBe("E6");
  });

  it("le garde-fou bâtiment reste actif", () => {
    const titans = [t(1, "E5"), t(2, "A1")];
    const board = { E6: { row: "E", col: 6, blocks: ["bleu"], socle: 1, isTeleporter: false } };
    resolveRecuperation(1, "E6", { board, looseBlocks: { E6: ["rouge"] }, titans }, "rouge");
    expect(titans[0].cell).toBe("E5");
  });
});

describe("règle — durée de la partie", () => {
  it("6 Manches à 3 Titans, 4 Manches à 4 Titans", () => {
    expect(manchesMax(3)).toBe(6);
    expect(manchesMax(4)).toBe(4);
  });

  it("signale la fin quand la dernière Manche est atteinte", () => {
    const board = { E5: { row: "E", col: 5, blocks: ["bleu"], socle: 1, isTeleporter: true } };
    const avant = checkEndGameTriggers(board, {}, 0, 3, 4);
    const pendant = checkEndGameTriggers(board, {}, 0, 4, 4);
    expect(avant.some((r) => r.includes("Dernière Manche"))).toBe(false);
    expect(pendant.some((r) => r.includes("Dernière Manche"))).toBe(true);
  });
});

describe("règle — immunité de l'initiateur (Tout Casser)", () => {
  it("un élément qui revient sur l'initiateur s'arrête sans le pousser", () => {
    const titans = [{ id: 1, cell: "E6", repaire: [], adrenaline: 0, socles: [], bagarre: 0, destruction: 0 }];
    const ctx = { board: {}, looseBlocks: {}, titans, log: [], initiatorId: 1 };
    projectInDirection("E", 4, 0, 1, 6, ctx);
    // Le Titan initiateur n'a pas bougé de sa case.
    expect(titans[0].cell).toBe("E6");
  });

  it("un autre Titan est bien poussé, lui", () => {
    const titans = [{ id: 2, cell: "E6", repaire: [], adrenaline: 0, socles: [], bagarre: 0, destruction: 0 }];
    const ctx = { board: {}, looseBlocks: {}, titans, log: [], initiatorId: 1 };
    projectInDirection("E", 4, 0, 1, 6, ctx);
    expect(titans[0].cell).not.toBe("E6");
  });

  // Conflit de règles tranché par Nikola le 2026-08-15. Le livret dit que
  // l'élément « s'arrête immédiatement dessus », ce qui convient à un
  // débris mais mettait DEUX TITANS sur la même case quand l'élément
  // projeté était lui-même un Titan. Arbitrage : l'immunité joue toujours,
  // mais un Titan s'arrête sur la case précédente.
  it("un Titan projeté sur l'initiateur s'arrête juste avant, sans le pousser", () => {
    const titans = [
      { id: 1, cell: "E6", repaire: [], adrenaline: 0, socles: [], bagarre: 0, destruction: 0 },
      { id: 4, cell: "E3", repaire: [], adrenaline: 0, socles: [], bagarre: 0, destruction: 0 },
    ];
    const ctx = { board: {}, looseBlocks: {}, titans, log: [], initiatorId: 1, movingTitanId: 4 };
    const arrivee = projectInDirection("E", 3, 0, 1, 6, ctx);
    const cellule = arrivee.row + arrivee.col;
    expect(cellule).toBe("E5");           // la case juste avant l'initiateur
    expect(titans[0].cell).toBe("E6");    // l'initiateur n'a pas bougé
  });

  it("un débris, lui, s'arrête bien SUR la case de l'initiateur", () => {
    const titans = [{ id: 1, cell: "E6", repaire: [], adrenaline: 0, socles: [], bagarre: 0, destruction: 0 }];
    const ctx = { board: {}, looseBlocks: {}, titans, log: [], initiatorId: 1 };
    const arrivee = projectInDirection("E", 3, 0, 1, 6, ctx);
    expect(arrivee.row + arrivee.col).toBe("E6");
  });
});

describe("règle — un débris ne se pose jamais sur un bâtiment debout", () => {
  it("l'écroulement d'un amas évite les cases occupées par un bâtiment", () => {
    // Amas de 3 débris en E5, entouré de bâtiments debout sauf une case.
    const board = {};
    for (const [r, c] of [["D", 4], ["D", 5], ["D", 6], ["E", 4], ["E", 6], ["F", 4], ["F", 5]]) {
      board[r + c] = { row: r, col: c, blocks: ["bleu", "rose"], socle: 2, isTeleporter: false };
    }
    const looseBlocks = { E5: ["bleu", "rose", "rouge"] };
    const titans = [{ id: 1, cell: "E3", repaire: [], adrenaline: 0, socles: [], bagarre: 0, destruction: 0 }];

    resolveBoingBoing(1, "E5", 0, 1, { board, looseBlocks, titans });

    // Aucun débris ne doit se trouver sur une case portant un bâtiment.
    for (const key of Object.keys(looseBlocks)) {
      const bldg = board[key];
      if (bldg && bldg.blocks.length > 0) {
        expect(looseBlocks[key]).toHaveLength(0);
      }
    }
  });
});

describe("ruling — égalité : bonus divisé et arrondi à l'inférieur", () => {
  const joueur = (id, repaire, socles = []) => ({
    id, repaire, socles, adrenaline: 0, bagarre: 0, destruction: 0,
  });

  it("le bonus Rose partagé à 3 donne 3 points chacun, pas 3,33", () => {
    // Trois Titans à égalité sur le Rose : 10 / 3 = 3,33 -> 3.
    const players = [
      joueur(1, ["rose", "rose"]),
      joueur(2, ["rose", "rose"]),
      joueur(3, ["rose", "rose"]),
    ];
    const res = computeFinalScore(players, {}, null);
    for (const t of players) {
      expect(res.totals[t.id].roseBonus).toBe(3);
      expect(Number.isInteger(res.totals[t.id].total)).toBe(true);
    }
  });

  it("le Collectionneur partagé à 2 donne 2 points chacun, pas 2,5", () => {
    // Deux Titans avec autant de socles, de même valeur totale : 5 / 2 -> 2.
    const players = [joueur(1, [], [2, 2]), joueur(2, [], [2, 2])];
    const res = computeFinalScore(players, {}, null);
    for (const t of players) {
      expect(res.totals[t.id].collectionneurBonus).toBe(2);
      expect(Number.isInteger(res.totals[t.id].total)).toBe(true);
    }
  });

  it("aucun score final ne comporte de virgule", () => {
    const players = [
      joueur(1, ["rose", "rose", "bleu"], [3]),
      joueur(2, ["rose", "rose", "rouge"], [3]),
      joueur(3, ["orange", "orange", "orange"], [1, 2]),
    ];
    const res = computeFinalScore(players, {}, 1);
    for (const t of players) {
      expect(Number.isInteger(res.totals[t.id].total)).toBe(true);
    }
  });
});

describe("ruling — coin partagé : 2 Titans par pôle, sans conflit", () => {
  it("chaque pôle offre bien 2 positions distinctes", () => {
    for (const corner of Object.keys(CORNERS)) {
      expect(CORNERS[corner].adjacents).toHaveLength(2);
      const [a, b] = CORNERS[corner].adjacents;
      expect(a).not.toBe(b);
    }
  });

  it("ne place jamais deux Titans sur la même case, même à 4 joueurs", () => {
    // Le placement est aléatoire : on répète pour couvrir les tirages où
    // deux Titans tombent effectivement sur le même pôle.
    for (let i = 0; i < 200; i++) {
      const { players } = placeTitans(4);
      const cells = players.map((p) => p.cell);
      expect(new Set(cells).size).toBe(cells.length);
    }
  });

  it("autorise deux Titans sur un même pôle, sur ses deux cases distinctes", () => {
    let sharedSeen = false;
    for (let i = 0; i < 200 && !sharedSeen; i++) {
      const { players } = placeTitans(4);
      const byCorner = {};
      players.forEach((p) => {
        byCorner[p.corner] = byCorner[p.corner] || [];
        byCorner[p.corner].push(p.cell);
      });
      const shared = Object.values(byCorner).find((cells) => cells.length === 2);
      if (shared) {
        sharedSeen = true;
        expect(shared[0]).not.toBe(shared[1]);
      }
    }
    // À 4 Titans sur 4 pôles, le partage finit toujours par sortir.
    expect(sharedSeen).toBe(true);
  });
});
