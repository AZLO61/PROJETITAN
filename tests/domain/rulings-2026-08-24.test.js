import { describe, expect, it } from "vitest";
import {
  rentrerEnJeu,
  resolveTeteEnAvant,
  resolveToutCasser,
  resolveFautPasMeChauffer,
  projectInDirection,
} from "../../src/domain/gameRules.js";

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

  it("choisirAuto tranche sans jamais rendre la rentrée impossible", () => {
    /* Régression attrapée en campagne d'invariants juste après l'ajout du
       choix : le SIMULATEUR (cinquième endroit où vit une règle) lisait
       `rentre: false` comme « rentrée impossible » et faisait perdre TOUT
       son tour au Titan — 333 anomalies sur 120 parties.

       L'IA et le simulateur passent donc par `choisirAuto`, qui tranche dans
       le domaine. La règle ne vit qu'à un seul endroit. */
    const board = { ...bat("A9", 3) };
    const titans = [t(1, "A9", { horsPlateau: true })];
    const retour = rentrerEnJeu(1, { board, titans, looseBlocks: {} }, { choisirAuto: true });

    expect(retour.needsChoice).toBeUndefined();
    expect(retour.rentre).toBe(true);
    expect(["A8", "B9"]).toContain(retour.cellule);
    expect(retour.cout).toBe(1);
    expect(titans[0].horsPlateau).toBe(false);
  });
});

describe("Tête en Avant : en percutant un Titan, l'attaquant prend sa place", () => {
  it("avance sur la case que la cible vient de quitter, comme Boing Boing", () => {
    // Confirmé Nikola le 2026-08-24 : Tête en Avant s'arrêtait jusqu'ici sur
    // la case juste AVANT la cible, comme contre un mur. Boing Boing, lui,
    // fait déjà prendre la place de la cible poussée — Tête en Avant doit se
    // comporter pareil.
    const titans = [
      t(1, "E4"),
      t(2, "E5", { repaire: ["bleu"] }), // 1 seule couleur : pas de DIL possible, aucune décision à trancher
    ];
    resolveTeteEnAvant(1, 0, 1, 0, { board: {}, titans, looseBlocks: {}, replis: [] });

    expect(titans[1].cell).not.toBe("E5"); // la cible a bien été poussée
    expect(titans[0].cell).toBe("E5"); // l'attaquant occupe la case qu'elle a quittée
  });
});

describe("Repli à une sortie de faille bloquée : le choix est bien proposé", () => {
  it("propose les voisines de la case de sortie quand le filtre d'axe les élimine toutes", () => {
    /* Cas de Nikola du 2026-08-24 : « il tape le bâtiment en I9, il doit donc
       se placer sur H9 H8 ou I8 » — et il n'avait rien eu à choisir.

       Un élément projeté en diagonale sort par un coin et ressort par la
       faille sur le coin opposé. Les TROIS voisines de ce coin progressent
       toutes sur au moins un des deux axes du déplacement : l'ancien filtre
       les éliminait donc toutes, aucun repli n'était émis, et le moteur
       posait l'élément tout seul. */
    const board = {
      ...bat("G7"), // obstacle en aval, pour que la trajectoire s'arrête
      ...bat("I9"), // le bâtiment que l'élément percute à la sortie de faille
    };
    const looseBlocks = { E5: ["rouge"] };
    const replis = [];
    projectInDirection("E", 5, -1, -1, 8, {
      board, looseBlocks, titans: [t(1, "F6")], log: [], replis, initiatorId: 1,
    });

    expect(replis).toHaveLength(1);
    expect(replis[0].cible).toBe("I9");
    expect([...replis[0].cases].sort()).toEqual(["H8", "H9", "I8"]);
  });
});

describe("Bagarre : toucher suffit, le déplacement n'entre plus dans le calcul", () => {
  /* Ruling révisé par Nikola le 2026-08-24 : « pour Bagarre, juste je gagne
     la Bagarre, je gagne 1 case sur la piste, déplacement ou non. » Il revient
     sur son ruling du 2026-08-15. */

  it("Faut Pas Me Chauffer : 2 combats gagnés au même tour = 2 Bagarre, même si une cible est coincée", () => {
    const att = t(1, "E5", { programmed: ["tout_casser", "tout_casser", "tout_casser"] });
    const cible1 = t(2, "E6", { repaire: ["bleu"] });
    const cible2 = t(3, "D5", { repaire: ["bleu"] });
    const mur = t(4, "C5"); // colle derrière cible2 pour la coincer
    const titans = [att, cible1, cible2, mur];
    const board = { ...bat("B5", 3) };

    resolveFautPasMeChauffer(1, 2, 2, { board, titans, looseBlocks: {}, replis: [] });
    resolveFautPasMeChauffer(1, 3, 2, { board, titans, looseBlocks: {}, replis: [] });

    expect(cible2.cell).toBe("D5"); // elle n'a pas pu bouger…
    expect(att.bagarre).toBe(2); // …et pourtant les deux combats comptent
  });

  it("Tout Casser : un Titan bousculé en chaîne par un débris projeté rapporte sa Bagarre", () => {
    /* « J'ai déplacé un titan avec un débris en faisant Tout Casser, j'aurais
       dû gagner 1 point sur Bagarre. » Les sous-cas Bâtiments / Blocs / Amas
       ne transmettaient pas `bagarreSet` à projectInDirection : seul le
       sous-cas Titan comptait, donc une poussée en chaîne ne rapportait rien. */
    const titans = [t(1, "E5"), t(2, "E7")];
    const looseBlocks = { E6: ["rouge"] }; // débris du Périmètre, projeté vers l'est
    resolveToutCasser(1, { board: {}, titans, looseBlocks, replis: [] });

    expect(titans[1].cell).not.toBe("E7"); // le Titan 2 a bien été bousculé…
    expect(titans[0].bagarre).toBe(1); // …et l'attaquant marque
  });

  it("ne compte qu'une seule Bagarre par Titan, même touché par deux sous-cas de la carte", () => {
    // FAQ #12 : un Titan distinct ne rapporte qu'une fois pour toute la carte.
    const titans = [t(1, "E5"), t(2, "E6")];
    const looseBlocks = { D5: ["rouge"], F5: ["bleu"] };
    resolveToutCasser(1, { board: {}, titans, looseBlocks, replis: [] });

    expect(titans[0].bagarre).toBe(1);
  });
});
