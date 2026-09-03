import { describe, expect, it } from "vitest";
import {
  projectInDirection,
  scanGraouhhhAxis,
  advanceGraouhhh,
  canDil,
  getDilOptions,
  ADRENALINE_OPTION,
  SOCLE_OPTION,
} from "../../src/domain/gameRules.js";

/* ============================================================
   PROJET TITAN — Rulings et correctifs du 2026-09-03
   ============================================================
   Deux points remontés par Nikola après une partie. Le troisième de sa liste
   était de l'interface (l'écrasement visuel d'un tas de débris), il ne se
   teste pas ici.

   Chaque bloc rappelle la phrase d'origine : c'est elle qui décide du
   comportement attendu, pas sa reformulation.
============================================================ */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [],
  repos: [], empruntees: [],
  ...extra,
});

const mur = () => ({ blocks: ["bleu", "bleu"], socle: 2 });

describe("« Si un débris pousse un Titan il le pousse et prend sa place »", () => {
  /* Les garde-fous de `projectInDirection` existent parce que deux TITANS ne
     partagent jamais une case. Ils s'appliquaient à tout ce qui vole, débris
     compris : la poussée avait bien lieu, mais le débris restait en arrière et
     le tas se formait une case trop tôt. */

  it("un débris qui pousse un Titan occupe la case libérée", () => {
    const titans = [t(2, "A2")];
    const looseBlocks = {};

    // Un débris part de A1 vers l'est avec 2 d'énergie ; A3 est libre.
    const landing = projectInDirection("A", 1, 0, 1, 2, {
      board: {}, looseBlocks, titans, log: [], replis: [], initiatorId: 1, movingTitanId: null,
    });

    expect(titans[0].cell).toBe("A3");                 // le Titan a été poussé
    expect(landing.row + landing.col).toBe("A2");      // et le débris a pris sa place
  });

  it("un débris se pose sur la case d'un Titan coincé, qui lui ne bouge pas", () => {
    /* Prolongement du même ruling, déjà tranché le 2026-09-01 pour le repli
       offensif : « un débris se pose sans problème sur la case d'un Titan ».
       Un Titan en vol, lui, s'arrête toujours avant — c'est le test suivant. */
    const titans = [t(2, "A2")];
    const board = { A3: mur(), B1: mur(), B2: mur(), B3: mur() };

    const landing = projectInDirection("A", 1, 0, 1, 2, {
      board, looseBlocks: {}, titans, log: [], replis: [], initiatorId: 1, movingTitanId: null,
    });

    expect(titans[0].cell).toBe("A2");                 // coincé, il n'a pas bougé
    expect(landing.row + landing.col).toBe("A2");      // le débris se pose par-dessus
  });

  it("un TITAN en vol, lui, s'arrête toujours avant un Titan coincé", () => {
    // Non-régression : la règle « deux Titans ne partagent jamais une case »
    // ne bouge pas, c'est elle qui justifiait les garde-fous à l'origine.
    const titans = [t(1, "A1"), t(2, "A2")];
    const board = { A3: mur(), B1: mur(), B2: mur(), B3: mur() };

    const landing = projectInDirection("A", 1, 0, 1, 2, {
      board, looseBlocks: {}, titans, log: [], replis: [], initiatorId: 3, movingTitanId: 1,
    });

    expect(titans[1].cell).toBe("A2");                 // l'occupant est resté coincé
    expect(landing.row + landing.col).toBe("A1");      // l'arrivant s'est arrêté avant
  });
});

describe("« Graouhhh sur 3 Titans : seul le plus proche a perdu un élément »", () => {
  /* Ce n'était pas un défaut du moteur, et ce test est là pour le prouver
     durablement : les deux autres cibles n'avaient qu'UNE couleur en Repaire,
     et le Dilemme exige deux options distinctes (règle du livret, reprise dans
     `rulesContent.js`). Elles subissent tout le reste — recul, Fatigue,
     Bagarre, bonus d'Adrénaline —, elles ne perdent simplement aucun bloc.

     Nikola a confirmé la règle le 2026-09-03, en l'assouplissant d'un cran :
     l'Adrénaline compte désormais comme une option (bloc suivant). Les deux
     cibles de ce scénario n'en avaient aucune, la conclusion ne bouge donc
     pas — et c'est exactement ce que ce test vérifie. */

  it("les trois cibles reculent et subissent une Fatigue, une seule subit un Dilemme", () => {
    const main = () => ["tout_casser", "tete_en_avant", "boing_boing"];
    const titans = [
      t(1, "A1", { repaire: ["bleu", "rose"] }),
      t(2, "A2", { repaire: ["bleu", "rose"], hand: main() }),
      t(3, "A3", { repaire: ["bleu"], hand: main() }),
      t(4, "A4", { repaire: ["bleu"], hand: main() }),
    ];
    const gameState = { board: {}, titans, looseBlocks: {}, replis: [], trajectoires: [] };

    expect(canDil(2, gameState)).toBe(true);
    expect(canDil(3, gameState)).toBe(false);
    expect(canDil(4, gameState)).toBe(false);

    const scan = scanGraouhhhAxis(1, gameState, 0, 1);
    expect(scan.touched.map((x) => x.id)).toEqual([2, 3, 4]);
    expect(scan.reculDistance).toBe(4); // nombre de Titans touchés + 1

    let cont = {
      titanId: 1, dr: 0, dc: 1, reculDistance: scan.reculDistance, mancheNumber: 1,
      remaining: scan.touched.slice().reverse().map((x) => x.id),
      bagarreIds: [], touchedCount: scan.touched.length,
    };
    const dilemmes = [];
    for (let garde = 0; garde < 12; garde++) {
      const res = advanceGraouhhh(gameState, cont);
      if (res.done) break;
      if (res.decision) dilemmes.push(res.decision.defenderId);
      cont = res.continuation;
    }

    // Un seul Dilemme, et c'est bien la cible la plus proche.
    expect(dilemmes).toEqual([2]);
    // Mais les trois ont reculé de 4 cases…
    expect(titans.map((x) => x.cell)).toEqual(["A1", "A6", "A7", "A8"]);
    // …les trois ont perdu une carte à la Fatigue…
    expect(titans.slice(1).map((x) => x.repos.length)).toEqual([1, 1, 1]);
    // …et l'attaquant marque pour les trois.
    expect(titans[0].bagarre).toBe(3);
    expect(titans[0].adrenaline).toBe(2); // +1 par Titan touché au-delà du premier
  });
});

describe("« Si la cible a au moins 1 bloc et 1 Adrénaline, un Dilemme est possible »", () => {
  /* Tranché par Nikola le 2026-09-03, en réponse au Graouhhh ci-dessus. Le
     Dilemme reste un CHOIX entre deux options ; ce qui change, c'est que
     l'Adrénaline en est une, comme le Socle depuis le 2026-08-17. */

  it("« 1 bloc + 1 Adrénaline » ouvre le Dilemme", () => {
    const jeu = { titans: [t(2, "A2", { repaire: ["bleu"], adrenaline: 1 })] };
    expect(getDilOptions(2, jeu)).toEqual(["bleu", ADRENALINE_OPTION]);
    expect(canDil(2, jeu)).toBe(true);
  });

  it("l'Adrénaline ne compte qu'une fois, quel que soit le stock", () => {
    // On ne perd qu'UNE ressource par Dilemme : proposer « 2 Adrénalines »
    // comme second choix n'aurait aucun sens.
    const jeu = { titans: [t(2, "A2", { repaire: ["bleu"], adrenaline: 4 })] };
    expect(getDilOptions(2, jeu).filter((o) => o === ADRENALINE_OPTION)).toHaveLength(1);
  });

  it("0 bloc et de l'Adrénaline reste immunisé", () => {
    // La phrase du ruling dit « à minima 1 bloc ET une Adrénaline ». Une seule
    // option ne fait pas un dilemme.
    const jeu = { titans: [t(2, "A2", { repaire: [], adrenaline: 3 })] };
    expect(getDilOptions(2, jeu)).toEqual([ADRENALINE_OPTION]);
    expect(canDil(2, jeu)).toBe(false);
  });

  it("sans Adrénaline, rien ne change", () => {
    // Non-régression : c'est le cas de la partie qui a déclenché le ruling.
    const jeu = { titans: [t(2, "A2", { repaire: ["bleu"], adrenaline: 0 })] };
    expect(canDil(2, jeu)).toBe(false);
  });

  it("elle s'ajoute aux options existantes sans les remplacer", () => {
    const jeu = { titans: [t(2, "A2", { repaire: ["bleu", "rose"], socles: [3], adrenaline: 2 })] };
    expect(getDilOptions(2, jeu)).toEqual(["bleu", "rose", SOCLE_OPTION, ADRENALINE_OPTION]);
  });
});

describe("« Quel que soit le maillon, l'initiateur avance sur la piste Bagarre »", () => {
  /* Tranché par Nikola le 2026-09-03 : « à partir du moment où un Titan que
     j'ai poussé en impacte un autre, quel que soit le maillon où il se trouve
     dans la réaction, le Titan initiateur avance sur la piste Bagarre. »
     C'est la FAQ #12 révisée le 2026-08-24 appliquée jusqu'au bout de la
     chaîne, là où seule la cible directe en bénéficiait. */

  it("un maillon de chaîne bloqué contre un mur rapporte quand même", () => {
    const titans = [t(1, "A1"), t(2, "A2"), t(3, "A3")];
    // A4 est un mur : Titan 3 est percuté par Titan 2, mais ne peut pas reculer.
    const board = { A4: mur(), B2: mur(), B3: mur(), B4: mur() };
    const bagarreSet = new Set();

    projectInDirection("A", 1, 0, 1, 3, {
      board, looseBlocks: {}, titans, log: [], replis: [], bagarreSet,
      initiatorId: 1, movingTitanId: 2,
    });

    expect(titans[2].cell).toBe("A3");           // Titan 3 n'a pas bougé…
    expect(bagarreSet.has(3)).toBe(true);        // …et compte quand même
  });

  it("un même Titan ne compte jamais deux fois", () => {
    // Le Set dédoublonne : c'est le plafond que pose déjà la FAQ #12.
    const titans = [t(1, "A1"), t(2, "A2")];
    const bagarreSet = new Set();
    projectInDirection("A", 1, 0, 1, 2, {
      board: {}, looseBlocks: {}, titans, log: [], replis: [], bagarreSet,
      initiatorId: 1, movingTitanId: null,
    });
    expect([...bagarreSet]).toEqual([2]);
  });
});
