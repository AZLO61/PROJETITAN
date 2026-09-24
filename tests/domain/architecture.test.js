import { describe, expect, it } from "vitest";
import { countActiveTeleporters, generateBoard, placeTitans } from "../../src/domain/index.js";

describe("domain smoke tests", () => {
  it("generates a board", () => {
    /* `toBeTruthy` sur un objet ne vérifiait rien (audit des tests du
       2026-09-24) : un plateau vide l'aurait passé. 25 emplacements de
       bâtiment et 5 Téléporteurs actifs à chaque tirage ; le nombre de blocs
       posés varie (36 à 54 mesuré sur 500 plateaux), jamais nul. */
    const { board } = generateBoard();
    const batiments = Object.values(board);
    expect(batiments).toHaveLength(25);
    expect(countActiveTeleporters(board)).toBe(5);
    expect(batiments.reduce((s, b) => s + b.blocks.length, 0)).toBeGreaterThan(25);
  });
  it("places four titans", () => expect(placeTitans(4).players).toHaveLength(4));
});
