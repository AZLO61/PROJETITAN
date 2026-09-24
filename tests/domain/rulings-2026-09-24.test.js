import { describe, expect, it } from "vitest";
import {
  projectInDirection,
  resolveBoingBoing,
  resolveTeteEnAvant,
  socleMarker,
} from "../../src/domain/gameRules.js";
import { acheminerPerte, appliquerCoup } from "../../src/domain/aiPlanner.js";

/* ============================================================
   PROJET TITAN — Quatre réponses de Nikola, le 2026-09-24
   ============================================================
   Trois questions sorties de l'audit du 24/09, et une précision sur Boing
   Boing. Aucune ne change le moteur : il appliquait déjà ce que Nikola veut.
   Ces tests existent pour qu'une « correction » future ne le défasse pas —
   deux de ces règles s'expriment par une ABSENCE (pas de bascule, pas de
   seconde Destruction), et une absence se « répare » très bien par erreur.
============================================================ */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

const jeu = (titans, looseBlocks = {}, board = {}) => ({
  board, titans, looseBlocks, replis: [], trajectoires: [],
});

describe("Le bloc d'un Dilemme qui tombe sous l'attaquant ne fait pas basculer la tour", () => {
  /* Nikola : « Un bloc perdu en Dilemme qui tombe sous l'attaquant, sur une
     tour : la tour doit-elle basculer ? = Non ». Cas observé en campagne : la
     cible est éjectée hors du plateau, son Socle reste sur la case, l'attaquant
     s'y pose, puis le bloc du Dilemme tombe par-dessus. */
  it("ni au Dilemme, ni à la carte suivante d'un autre Titan", () => {
    const titans = [t(1, "E7"), t(2, "E8", { repaire: ["bleu"] }), t(3, "A1")];
    const etat = jeu(titans, { E8: [socleMarker(2)] });

    const res = resolveBoingBoing(1, "E8", 0, 1, etat);
    expect(titans[0].cell).toBe("E8");
    const dil = res.decisions[0];
    expect(dil.cellAtImpact).toBe("E8");

    acheminerPerte(dil, titans[1], titans[0], "bleu", etat.looseBlocks);
    expect(etat.looseBlocks.E8).toEqual([socleMarker(2), "bleu"]);

    resolveTeteEnAvant(3, 0, 1, 0, etat);
    expect(etat.looseBlocks.E8).toEqual([socleMarker(2), "bleu"]);
    expect(titans[0].cell).toBe("E8");
  });
});

describe("Tête en Avant au Seuil 4 : +1 Destruction par case, pas par bloc", () => {
  /* Nikola : « Voulu (Oui car c'est par case) ». Le bloc du haut part au
     Repaire, celui du dessous est projeté dans l'axe : deux blocs, une case. */
  it("deux blocs arrachés au même bâtiment rapportent 1 Destruction", () => {
    const titans = [t(1, "E4", { adrenaline: 1 })];
    const board = { E5: { blocks: ["bleu", "rouge", "jaune"], socle: 2 } };
    const etat = jeu(titans, {}, board);

    resolveTeteEnAvant(1, 0, 1, 1, etat);

    expect(board.E5.blocks).toEqual(["bleu"]);
    expect(titans[0].repaire).toEqual(["jaune"]);
    expect(titans[0].destruction).toBe(1);
  });
});

describe("La Faille : 1 et 2 d'énergie mènent à la même case", () => {
  /* Nikola : « Traverser la Faille avec 1 ou 2 d'énergie mène à la même case
     d'arrivée. Voulu ? (oui) ». Arrivé au bord avec 1, l'élément passe quand
     même ; avec 2, la traversée en consomme 1 et il se pose au même endroit. */
  it("depuis E9 vers l'est, 1 et 2 d'énergie finissent en E1", () => {
    const arrivee = (energie) => {
      const r = projectInDirection("E", 9, 0, 1, energie, { board: {}, looseBlocks: {}, titans: [], log: [] });
      return r.row + r.col;
    };
    expect(arrivee(1)).toBe("E1");
    expect(arrivee(2)).toBe("E1");
    expect(arrivee(3)).toBe("E2");
  });
});

describe("Graouhhh : un débris d'avant la carte ne suit pas sa cible une fois le bloc du Dilemme tombé dessus", () => {
  /* Nikola, second échange du 24/09 : « Rien ne bouge (actuel) ». Sur Graouhhh,
     le Dilemme se tranche AVANT le recul ; son bloc tombe sur la case de la
     cible et forme une pile de 2 avec le débris qui s'y trouvait. La pile
     reste, la cible part seule. */
  it("la pile de 2 reste sur la case, la cible recule sans son débris", () => {
    const attaquant = t(1, "E1");
    const cible = t(2, "E3", { repaire: ["bleu"] });
    const etat = jeu([attaquant, cible], { E3: ["rouge"] });
    appliquerCoup({ cardId: "graouhhh", dir: { dr: 0, dc: 1 }, mise: 0 }, 1, etat, 1, undefined, {
      decision: (d) => acheminerPerte(d, cible, attaquant, "bleu", etat.looseBlocks),
      fatigue: () => {},
    });
    expect(etat.looseBlocks.E3).toEqual(["rouge", "bleu"]);
    expect(cible.cell).toBe("E5");
  });
});

describe("Boing Boing : chaque Adrénaline allonge la projection d'une case", () => {
  /* Nikola : « Si je rajoute 1 d'adrénaline sur mon boing boing ça déplace
     plus loin le titan sur lequel je saute car j'ai augmenté mon nombre de
     case ». La projection vaut le saut restant, et l'Adrénaline allonge le saut. */
  it("même saut, 0 → 1 → 2 Adrénalines : la cible recule de 1, 2 puis 3 cases", () => {
    const arrivee = (mise) => {
      const titans = [t(1, "E4", { adrenaline: 3 }), t(2, "E6", { repaire: ["bleu"] })];
      resolveBoingBoing(1, "E6", mise, 1, jeu(titans));
      return titans[1].cell;
    };
    expect(arrivee(0)).toBe("E7");
    expect(arrivee(1)).toBe("E8");
    expect(arrivee(2)).toBe("E9");
  });
});
