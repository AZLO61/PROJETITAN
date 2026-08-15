import { describe, expect, it } from "vitest";
import { getSeed, pick, random, randomInt, setSeed, shuffled } from "../../src/domain/rng.js";
import { generateBoard, placeTitans } from "../../src/domain/gameRules.js";

// Le générateur semé est la fondation de la simulation de masse : sans
// reproductibilité, comparer deux réglages d'IA sur des milliers de parties
// ne veut rien dire. Ces tests verrouillent la propriété qui compte —
// même graine, même partie.

describe("rng — reproductibilité", () => {
  it("deux générateurs sur la même graine produisent la même suite", () => {
    setSeed(12345);
    const a = Array.from({ length: 50 }, () => random());
    setSeed(12345);
    const b = Array.from({ length: 50 }, () => random());
    expect(a).toEqual(b);
  });

  it("deux graines différentes produisent des suites différentes", () => {
    setSeed(1);
    const a = Array.from({ length: 50 }, () => random());
    setSeed(2);
    const b = Array.from({ length: 50 }, () => random());
    expect(a).not.toEqual(b);
  });

  it("setSeed retourne la graine appliquée et getSeed la relit", () => {
    expect(setSeed(777)).toBe(777);
    expect(getSeed()).toBe(777);
  });

  it("setSeed sans argument tire une graine imprévisible", () => {
    setSeed(42);
    const applied = setSeed();
    expect(applied).not.toBe(42);
    expect(Number.isInteger(applied)).toBe(true);
  });
});

describe("rng — bornes et distribution", () => {
  it("random reste dans [0, 1)", () => {
    setSeed(99);
    for (let i = 0; i < 2000; i++) {
      const v = random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("randomInt couvre toutes les valeurs de [0, n) sans jamais dépasser", () => {
    setSeed(7);
    const vus = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = randomInt(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      vus.add(v);
    }
    expect(vus.size).toBe(6);
  });

  it("shuffled conserve tous les éléments et ne modifie pas la source", () => {
    setSeed(3);
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const melange = shuffled(source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...melange].sort((a, b) => a - b)).toEqual(source);
  });

  it("shuffled est uniforme : chaque élément visite chaque position", () => {
    // Le mélange biaisé qu'on a remplacé (sort avec comparateur aléatoire)
    // échouait typiquement ici, en laissant des éléments campés près de
    // leur position d'origine.
    setSeed(2024);
    const positions = [new Set(), new Set(), new Set(), new Set()];
    for (let i = 0; i < 500; i++) {
      shuffled(["a", "b", "c", "d"]).forEach((el, idx) => positions[idx].add(el));
    }
    positions.forEach((p) => expect(p.size).toBe(4));
  });

  it("pick renvoie undefined sur un tableau vide", () => {
    expect(pick([])).toBeUndefined();
    expect(pick(undefined)).toBeUndefined();
  });
});

describe("rng — le moteur est réellement branché dessus", () => {
  it("la même graine régénère exactement le même plateau BIG CITY", () => {
    setSeed(2026);
    const a = generateBoard();
    setSeed(2026);
    const b = generateBoard();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("deux graines différentes donnent deux plateaux différents", () => {
    setSeed(11);
    const a = generateBoard();
    setSeed(22);
    const b = generateBoard();
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("la même graine rejoue le même ordre de jeu et le même détonateur", () => {
    setSeed(555);
    const a = placeTitans(4);
    setSeed(555);
    const b = placeTitans(4);
    expect(a.ordreJeu).toEqual(b.ordreJeu);
    expect(a.detonateur).toBe(b.detonateur);
  });
});
