/* ============================================================
   PROJET TITAN — Les deux écarts assumés entre RAGE et Dilemme
   ============================================================
   Tranchés par Nikola le 2026-08-18, après que la revue avant démo les ait
   signalés comme des incohérences possibles avec le livret :

   1. Les SOCLES ne sont PAS ciblables par une RAGE. Le Dilemme a été étendu
      au Socle le 17 août (option anonyme, tirée au sort) ; la RAGE ne l'est
      pas, et ne le sera pas.
   2. Le VERT EST ciblable par une RAGE, alors que le Dilemme le protège.
      La RAGE est plus brutale, c'est ce qui la distingue.

   Ces deux points ne se lisent nulle part dans le code : ils s'expriment par
   une ABSENCE (les socles ne sont pas comptés, le vert n'est pas filtré).
   Une absence ne se remarque pas à la relecture et se « corrige » très bien
   par erreur en croyant réparer un oubli. D'où ce test.
============================================================ */
import { describe, expect, it } from "vitest";
import { canRage, canDil, getDilOptions } from "../../src/domain/gameRules.js";

const titan = (over = {}) => ({
  id: 1, cell: "E5", repaire: [], socles: [], adrenaline: 0,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  bagarre: 0, destruction: 0, ...over,
});

describe("RAGE vs Dilemme : les deux écarts sont voulus", () => {
  it("un Repaire vide plein de Socles ne suffit PAS à subir une RAGE", () => {
    const cible = titan({ id: 2, repaire: [], socles: [4, 3, 2], adrenaline: 0 });
    const jeu = { titans: [titan(), cible] };
    // Les Socles ne sont pas une ressource ciblable par la RAGE...
    expect(canRage(2, jeu)).toBe(false);
    // ...alors que le Dilemme, lui, les voit — mais il lui faut 2 options
    // distinctes, et « des Socles » n'en forme qu'une seule.
    expect(getDilOptions(2, jeu)).toEqual(["socle"]);
    expect(canDil(2, jeu)).toBe(false);
  });

  it("« 1 couleur + des Socles » ouvre le Dilemme mais pas davantage la RAGE aux Socles", () => {
    const cible = titan({ id: 2, repaire: ["bleu"], socles: [4], adrenaline: 0 });
    const jeu = { titans: [titan(), cible] };
    expect(getDilOptions(2, jeu)).toEqual(["bleu", "socle"]);
    expect(canDil(2, jeu)).toBe(true);
    // La RAGE est possible, mais grâce au bloc bleu — pas grâce au Socle.
    expect(canRage(2, jeu)).toBe(true);
  });

  it("le Vert est ciblable par une RAGE alors que le Dilemme le protège", () => {
    const cible = titan({ id: 2, repaire: ["vert", "bleu"], socles: [], adrenaline: 0 });
    const jeu = { titans: [titan(), cible] };
    // Le Dilemme écarte le Vert dès qu'une autre couleur existe.
    expect(getDilOptions(2, jeu)).toEqual(["bleu"]);
    expect(canDil(2, jeu)).toBe(false);
    // La RAGE, elle, s'applique : l'attaquant pourra désigner le Vert.
    expect(canRage(2, jeu)).toBe(true);
  });

  it("l'Adrénaline seule suffit à subir une RAGE (FAQ #5)", () => {
    const cible = titan({ id: 2, repaire: [], socles: [], adrenaline: 1 });
    expect(canRage(2, { titans: [titan(), cible] })).toBe(true);
  });

  it("une cible réellement vide ne subit aucune RAGE", () => {
    const cible = titan({ id: 2, repaire: [], socles: [], adrenaline: 0 });
    expect(canRage(2, { titans: [titan(), cible] })).toBe(false);
  });
});
