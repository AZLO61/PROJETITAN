import { describe, expect, it } from "vitest";
import { rentrerEnJeu } from "../../src/domain/gameRules.js";

/* Ruling du 2026-08-24, demandé par Nikola après une partie : quand un Titan
   éjecté doit rentrer par un coin (A1, A9, I1, I9) et que ce coin est occupé,
   les deux cases immédiatement voisines — une sur chaque rebord — sont à
   égale distance. L'ancien tri en départageait une arbitrairement (toujours
   celle de la colonne, cf. le test du 18 août juste au-dessus dans le
   changelog). Nikola veut choisir lui-même entre les deux, et TRANCHÉ le
   24 août : ce choix se fait à la RENTRÉE réelle, pas à l'expulsion, parce
   que le plateau peut avoir changé entre-temps (le bâtiment qui bloquait le
   coin peut être tombé avant que le Titan rejoue). */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

const bat = (cle, etages = 2) => ({
  [cle]: { row: cle[0], col: Number(cle.slice(1)), blocks: Array(etages).fill("bleu"), socle: etages, isTeleporter: false },
});

describe("Rentrée par un coin bloqué : le choix revient au joueur", () => {
  it("propose les deux cases voisines quand elles sont TOUTES LES DEUX libres, sans en choisir une", () => {
    // Coin A9 occupé, mais A8 (ligne) ET B9 (colonne) libres tous les deux —
    // c'est le cas de Nikola : « je sors de I1 je rentre en A9, si bâtiment
    // alors A8 ou B9, c'est moi qui décide ».
    const board = { ...bat("A9", 3) };
    const titans = [t(1, "A9", { horsPlateau: true })];
    const retour = rentrerEnJeu(1, { board, titans, looseBlocks: {} });

    expect(retour.rentre).toBe(false);
    expect(retour.needsChoice).toBe(true);
    expect(retour.cellule).toBe("A9");
    expect([...retour.options].sort()).toEqual(["A8", "B9"]);
    // Rien n'est tranché tant que le joueur n'a pas choisi : le Titan reste hors plateau.
    expect(titans[0].horsPlateau).toBe(true);
  });

  it("ne demande rien quand une seule des deux cases voisines est libre (pas de vrai choix)", () => {
    // Reprend exactement le cas du 18 août : la colonne (B1) est bouchée,
    // seule la ligne (A2) est libre. Le comportement précédent doit tenir.
    const board = { ...bat("A1", 3), ...bat("B1", 3) };
    const titans = [t(1, "A1", { horsPlateau: true })];
    const retour = rentrerEnJeu(1, { board, titans, looseBlocks: {} });

    expect(retour.needsChoice).toBeUndefined();
    expect(retour.rentre).toBe(true);
    expect(retour.cellule).toBe("A2");
    expect(titans[0].horsPlateau).toBe(false);
  });

  it("ne demande rien sur une sortie par un bord simple (pas un coin)", () => {
    // E1 n'est pas un coin : un seul rebord concerné, pas de choix à offrir.
    const board = { ...bat("E1", 3) };
    const titans = [t(1, "E1", { horsPlateau: true })];
    const retour = rentrerEnJeu(1, { board, titans, looseBlocks: {} });

    expect(retour.needsChoice).toBeUndefined();
    expect(retour.rentre).toBe(true);
  });
});
