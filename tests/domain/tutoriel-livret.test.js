/* ============================================================
   PROJET TITAN — Le tutoriel du livret dit-il encore la vérité ?
   ============================================================
   Le tutoriel « Ton premier tour » chiffrait trois trajectoires (A1, C1, C3)
   calculées à la main, du temps où les blocs rebondissaient. La règle a
   changé le 18 août — plus de rebond, et la Faille fait ressortir un bloc
   sorti du plateau — mais le texte, lui, n'avait pas bougé : il restait faux
   sur l'énergie de départ ET sur les trois trajectoires.

   Un tutoriel faux est pire qu'un tutoriel absent : c'est le premier texte
   que lit un éditeur ou un testeur, et il fixe sa compréhension du jeu.

   Ce test rejoue exactement la scène du livret sur le moteur. S'il casse, ce
   n'est pas lui qu'il faut ajuster : c'est le livret qui a pris du retard sur
   le moteur, une fois de plus.
============================================================ */
import { describe, expect, it } from "vitest";
import { releverPercussion, resolveToutCasser } from "../../src/domain/gameRules.js";

const mk = (id, cell) => ({
  id, cell, repaire: [], socles: [], adrenaline: 3, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  bagarre: 0, destruction: 0,
});

// L'énoncé du livret : Titan en B2 après son mouvement gratuit, bâtiments
// d'un étage en A1 et C1, un bâtiment en C3, et E5 sur la trajectoire.
const sceneDuLivret = () => ({
  board: {
    A1: { blocks: ["bleu"], socle: 1 },
    C1: { blocks: ["rose"], socle: 1 },
    C3: { blocks: ["bleu", "bleu"], socle: 2 },
    E5: { blocks: ["bleu", "rose"], socle: 2 },
  },
  looseBlocks: {},
  titans: [mk(1, "B2")],
  replis: [],
});

describe("Tutoriel « Ton premier tour » du livret", () => {
  it("l'énergie annoncée est 4 sans rien dépenser — la case du Titan compte", () => {
    const releve = releverPercussion(1, sceneDuLivret(), 0);
    expect(releve.energie).toBe(4);
    expect(releve.seuil4).toBe(true);
  });

  it("avec 1 Adrénaline misée, l'énergie passe à 5", () => {
    expect(releverPercussion(1, sceneDuLivret(), 1).energie).toBe(5);
  });

  it("les trois trajectoires annoncées sont celles que produit le moteur", () => {
    const e = sceneDuLivret();
    resolveToutCasser(1, e, 1);

    // A1 et C1 sortent du plateau et ressortent par la Faille.
    expect(e.looseBlocks.F6).toContain("bleu");   // le bloc de A1
    expect(e.looseBlocks.G6).toContain("rose");   // le bloc de C1
    // C3 percute E5 : ricochet au Seuil 4, le bloc s'immobilise en D4.
    expect(e.looseBlocks.D4).toContain("bleu");
    expect(e.board.E5.blocks).toHaveLength(1);    // E5 a perdu un bloc

    // Les deux socles restent sur place, à portée du Titan resté en B2.
    expect(e.looseBlocks.A1).toContain("socle:1");
    expect(e.looseBlocks.C1).toContain("socle:1");

    // 3 bâtiments frappés + 1 bloc arraché par ricochet.
    expect(e.titans[0].destruction).toBe(4);
    /* UN choix en attente depuis le 2026-08-19 : le bloc arraché par ricochet
       se pose désormais où l'attaquant veut, parmi les cases qui entourent le
       bâtiment touché. Nikola : « ce n'est pas moi qui ai choisi où le mettre,
       alors qu'il aurait pu aller en B1, B2 ou A2 ». Le tutoriel du livret le
       mentionne, il ne peut pas promettre un tour sans décision. */
    expect(e.replis).toHaveLength(1);
    expect(e.replis[0].cases.length).toBeGreaterThan(1);
  });
});
