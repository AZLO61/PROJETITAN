import { describe, expect, it } from "vitest";
import { canDil, resolveGraouhhh } from "../../src/domain/gameRules.js";
import { acheminerPerte, trancherDecisionIA } from "../../src/domain/aiPlanner.js";

/* ============================================================
   PROJET TITAN — Retours de table du 2026-09-23
   ============================================================
   Nikola : « j'ai fait Graouh sur un Titan, il n'a rien perdu sur sa case (il
   n'avait qu'un bloc) », puis, une fois la règle rappelée (le Dilemme exigeait
   deux options) : « comme c'est une perte sur sa case, oui, il le laisse
   tomber au DIL ».

   Portée tranchée le même jour : tous les Dilemmes dont la perte tombe au sol
   (Tout Casser, Tête en Avant, Graouhhh, Boing Boing). Faut Pas Me Chauffer,
   dont le Dilemme envoie la perte chez l'attaquant, garde deux options
   minimum. La cible garde sa défense : payer 1 Adrénaline.
============================================================ */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

describe("Dilemme à une seule option", () => {
  const etat = { titans: [t(2, "E6", { repaire: ["rouge"] })] };

  it("suffit sur les quatre cartes dont la perte tombe au sol", () => {
    for (const carte of ["Tout Casser", "Tête en Avant", "Graouhhh", "Boing Boing"]) {
      expect(canDil(2, etat, carte), carte).toBe(true);
    }
  });

  it("ne suffit pas sur Faut Pas Me Chauffer, ni sans carte nommée", () => {
    expect(canDil(2, etat, "Faut Pas Me Chauffer")).toBe(false);
    expect(canDil(2, etat)).toBe(false);
  });

  it("reste impossible contre un Repaire vide", () => {
    expect(canDil(3, { titans: [t(3, "E6")] }, "Graouhhh")).toBe(false);
  });
});

describe("Graouhhh sur un Titan qui n'a qu'un bloc", () => {
  it("ouvre le Dilemme, et le bloc tombe sur la case d'impact", () => {
    const etat = {
      board: {},
      titans: [t(1, "E5"), t(2, "E6", { repaire: ["rouge"] })],
      looseBlocks: {},
      replis: [],
      trajectoires: [],
    };

    const res = resolveGraouhhh(1, 0, 1, 1, etat);
    const dil = (res.decisions || []).find((d) => d.type === "DIL" && d.defenderId === 2);
    expect(dil).toBeTruthy();
    expect(dil.destination).toBe("sol");
    expect(dil.cellAtImpact).toBe("E6");

    // Sans Adrénaline pour se défendre, la cible lâche sa seule option.
    const choix = trancherDecisionIA(dil, etat.titans);
    expect(choix).toMatchObject({ option: "rouge", paie: false, seulChoix: true });

    const cible = etat.titans.find((x) => x.id === 2);
    const attaquant = etat.titans.find((x) => x.id === 1);
    acheminerPerte(dil, cible, attaquant, choix.option, etat.looseBlocks);
    expect(cible.repaire).toEqual([]);
    expect(etat.looseBlocks.E6).toEqual(["rouge"]);
  });
});
