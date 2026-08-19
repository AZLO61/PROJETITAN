/* ============================================================
   PROJET TITAN — Rulings du 2026-08-19
   ============================================================
   Un test par règle modifiée, comme l'impose le README du livret : ce sont
   eux qui empêchent la prochaine passe de refaire le trajet inverse.

   Ce fichier couvre la VALEUR DE L'ADRÉNALINE au décompte final, passée de
   3 à 2 points de victoire.

   Le dernier test du fichier est le plus important : il vérifie que la
   valeur est la même AUX QUATRE ENDROITS où la règle vit (moteur, étalon
   d'IA, règles affichées, livret). C'est précisément cette divergence
   silencieuse qui avait laissé le livret cinq rulings en retard sur le
   moteur avant la V36.1, et qui s'est refermée une fois de plus le 17 août
   sur la règle du Vert : trois endroits sur quatre.
============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { POINTS_PAR_ADRENALINE, computeFinalScore } from "../../src/domain/gameRules.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "../..");
const lire = (rel) => readFileSync(resolve(RACINE, rel), "utf8");

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

describe("Adrénaline conservée : 2 points de victoire, pas 3", () => {
  it("la constante du moteur vaut 2", () => {
    expect(POINTS_PAR_ADRENALINE).toBe(2);
  });

  it("le décompte final compte 2 points par Adrénaline restante", () => {
    const joueurs = [t(1, "A1", { adrenaline: 4 }), t(2, "A3", { adrenaline: 0 })];
    const res = computeFinalScore(joueurs, {}, null);
    expect(res.totals[1].adrenalinePts).toBe(8);
    expect(res.totals[2].adrenalinePts).toBe(0);
  });

  it("la ligne Adrénaline pèse bien dans le total, sans écraser le reste", () => {
    /* Deux Titans identiques à l'Adrénaline près : l'écart de total doit
       être exactement 2 par Adrénaline, ni plus (double comptage) ni moins
       (ligne oubliée dans la somme). C'est la somme `total` qui est vérifiée
       ici, pas seulement le détail : les deux avaient déjà divergé. */
    const sans = computeFinalScore([t(1, "A1", { adrenaline: 0 }), t(2, "A3")], {}, null);
    const avec = computeFinalScore([t(1, "A1", { adrenaline: 3 }), t(2, "A3")], {}, null);
    expect(avec.totals[1].total - sans.totals[1].total).toBe(6);
  });

  it("aucune Adrénaline ne rapporte rien du tout", () => {
    const res = computeFinalScore([t(1, "A1"), t(2, "A3")], {}, null);
    expect(res.totals[1].adrenalinePts).toBe(0);
  });
});

describe("La valeur de l'Adrénaline ne vit qu'à une seule source dans le code", () => {
  it("le planificateur d'IA importe la constante au lieu de la recopier", () => {
    const src = lire("src/domain/aiPlanner.js");
    expect(src).toContain("VALEUR_ADRENALINE = POINTS_PAR_ADRENALINE");
    // Un nombre en dur ici, et l'IA arbitre sur un barème qui n'existe plus.
    expect(src).not.toMatch(/VALEUR_ADRENALINE\s*=\s*\d/);
  });

  it("le moteur ne contient plus l'ancien facteur en dur", () => {
    const src = lire("src/domain/gameRules.js");
    expect(src).not.toMatch(/\d+\s*\*\s*\(t\.adrenaline/);
    expect(src).toContain("POINTS_PAR_ADRENALINE * (t.adrenaline");
  });
});

describe("Les quatre emplacements de la règle annoncent la même valeur", () => {
  /* Le moteur applique, mais ce sont ces trois autres endroits que lisent
     les joueurs. Une valeur juste dans le code et fausse au livret est un
     mensonge à la table. */
  it("les règles affichées dans l'application annoncent 2 points", () => {
    const src = lire("src/ui/rules/rulesContent.js");
    const entree = src.split("\n").find((l) => l.includes('nom: "Adrénaline"'));
    expect(entree).toBeTruthy();
    expect(entree).toMatch(/2 points de victoire/);
    expect(entree).not.toMatch(/3 points/);
  });

  it("le livret annonce 2 points partout où il chiffre l'Adrénaline", () => {
    const livret = lire("docs/livret/ProjetTitan_Livret.html");
    // Toute phrase du livret qui chiffre l'Adrénaline en points doit dire 2.
    const lignes = livret.split("\n").filter((l) => /Adr[ée]naline/i.test(l) && /\d+\s*points?/i.test(l));
    expect(lignes.length).toBeGreaterThan(0);
    lignes.forEach((l) => {
      const chiffres = [...l.matchAll(/(\d+)\s*points?/gi)].map((m) => Number(m[1]));
      // On ne contraint que les lignes qui parlent bien du barème Adrénaline.
      if (/restante|d[ée]compte/i.test(l)) {
        expect(chiffres).toContain(POINTS_PAR_ADRENALINE);
        expect(chiffres).not.toContain(3);
      }
    });
  });
});
