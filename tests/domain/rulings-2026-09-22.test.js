import { describe, expect, it } from "vitest";
import { appliquerReplElement, projectInDirection, resolveToutCasserAmas } from "../../src/domain/gameRules.js";
import { trancherReplisIA } from "../../src/domain/aiPlanner.js";

/* ============================================================
   PROJET TITAN — Retours de table du 2026-09-22
   ============================================================
   Nikola : « j'ai fait Tout Casser, G3 en diagonale : la tour de débris aurait
   dû s'écrouler totalement, mais ça l'a déplacée. J'ai pu placer 1 seul débris
   suite à la percussion du bâtiment 4/1 avec celui le plus haut, et 2 débris
   sont restés collés alors que j'aurais dû avoir le choix de placement de 2
   débris. »

   La tour bascule dans l'axe (ruling du 2026-08-28) : chaque débris part
   d'autant de cases que sa hauteur. Le bâtiment en E5 arrête les deux du haut
   en F4, et CHACUN des deux doit recevoir son choix de repli. Le moteur les
   déposait bien, mais le dédoublonnage de la file les fusionnait : tous les
   débris portaient la même clé, « debris@F4 ».
============================================================ */

const t = (id, cell) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
});

const humainsSeulement = (replis, etat) =>
  trancherReplisIA(replis, etat, () => null, () => false).humains;

describe("Tout Casser sur une tour de débris bloquée par un bâtiment", () => {
  it("donne un choix de placement à chaque débris arrêté, pas un seul pour tous", () => {
    const etat = {
      board: { E5: { blocks: ["rouge"], socle: 4 } },
      titans: [t(1, "H2")],
      looseBlocks: { G3: ["orange", "rose", "bleu"] }, // du bas vers le sommet
      replis: [],
      trajectoires: [],
    };

    resolveToutCasserAmas(1, etat);

    // Le bas de la tour (hauteur 1) arrive librement en F4 ; les deux du haut
    // y sont arrêtés par le bâtiment E5.
    expect(etat.looseBlocks.G3).toBeUndefined();
    expect(etat.looseBlocks.F4).toEqual(["orange", "rose", "bleu"]);
    const choix = humainsSeulement(etat.replis, etat);
    expect(choix).toHaveLength(2);

    // Le premier choix déplace le sommet, le second le débris du milieu :
    // chaque couleur part là où le joueur l'envoie.
    appliquerReplElement(choix[0], "E4", etat);
    appliquerReplElement(choix[1], "F5", etat);
    expect(etat.looseBlocks.E4).toEqual(["bleu"]);
    expect(etat.looseBlocks.F5).toEqual(["rose"]);
    expect(etat.looseBlocks.F4).toEqual(["orange"]);
  });

  it("garde une seule décision pour le bloc cassé par ricochet, compté deux fois", () => {
    /* Un bloc cassé au Seuil 4 dépose son repli (autour du bâtiment touché),
       et sa propre trajectoire en dépose un second s'il bute plus loin. C'est
       le MÊME bloc : une seule décision. */
    const etat = {
      board: {
        E3: { blocks: ["bleu", "bleu"], socle: 2 },
        E5: { blocks: ["rouge"], socle: 3 },
      },
      titans: [],
      looseBlocks: {},
      replis: [],
      trajectoires: [],
    };

    projectInDirection("E", 1, 0, 1, 5, { ...etat, initiatorId: 1 });

    expect(etat.replis).toHaveLength(2);
    expect(humainsSeulement(etat.replis, etat)).toHaveLength(1);
  });
});
