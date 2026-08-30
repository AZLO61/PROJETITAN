/* ============================================================
   PROJET TITAN — UNE INTENTION HOSTILE NE FAIT PAS TOMBER LA TABLE
   ============================================================
   Trouvé à la revue de sécurité du 2026-08-30, sur le chemin qui exécute chez
   l'hôte les actions demandées par un invité.

   L'hôte adoptait les « brouillons » envoyés avec une intention (chemin tracé,
   mise d'Adrénaline) en indexant simplement sa table de réglages :

       const poser = CONTEXTE_DISTANT[cle];
       if (poser) poser(valeur);

   Or `JSON.parse('{"__proto__": 1}')` crée une propriété PROPRE et énumérable
   littéralement nommée `__proto__`. `Object.entries` la restitue, l'indexation
   rend `Object.prototype` — un objet, donc « vrai » — et on l'appelle comme une
   fonction. L'exception part d'un `useEffect`, hors de tout filet : React
   démonte l'arbre, et la partie s'arrête POUR TOUTE LA TABLE.

   Il suffisait d'un invité assis et d'une seule requête.

   Ces tests portent sur la propriété du langage qui rendait l'attaque possible,
   et sur la forme exacte de la garde qui la referme — pas sur le composant
   React, qu'il faudrait monter avec un vrai réseau pour rejouer la scène.
============================================================ */
import { describe, expect, it } from "vitest";

describe("La clé piégée qui rendait l'attaque possible", () => {
  it("`__proto__` venu de JSON est bien une propriété PROPRE, pas le prototype", () => {
    /* C'est toute la subtilité, et la raison pour laquelle le code avait l'air
       correct : écrite dans un littéral, `__proto__` change le prototype ; venue
       de `JSON.parse`, elle devient une clé ordinaire. */
    const duReseau = JSON.parse('{"__proto__": 1}');
    expect(Object.prototype.hasOwnProperty.call(duReseau, "__proto__")).toBe(true);
    expect(Object.entries(duReseau).map(([k]) => k)).toContain("__proto__");
  });

  it("indexer une table de réglages avec cette clé rend une valeur « vraie »", () => {
    const table = { bbPath: () => {}, bbAdrenaline: () => {} };
    // Le piège : ce n'est pas `undefined`, c'est `Object.prototype`.
    expect(table.__proto__).toBeTruthy();
    expect(typeof table.__proto__).toBe("object");
    // …et l'appeler comme une fonction lève, hors de tout filet React.
    expect(() => table.__proto__(1)).toThrow(TypeError);
  });
});

describe("La garde qui la referme", () => {
  /* Exactement la forme retenue dans le contrôleur : propriété PROPRE, ET
     valeur qui est une vraie fonction. Chacun des deux verrous suffirait ici ;
     les deux ensemble tiennent aussi le jour où la table gagnerait une valeur
     non-fonction. */
  const appliquer = (table, contexte) => {
    const appliquees = [];
    Object.entries(contexte || {}).forEach(([cle, valeur]) => {
      if (!Object.prototype.hasOwnProperty.call(table, cle)) return;
      const poser = table[cle];
      if (typeof poser === "function") { poser(valeur); appliquees.push(cle); }
    });
    return appliquees;
  };

  const tableExemple = () => {
    const vus = {};
    return {
      table: {
        bbPath: (v) => { vus.bbPath = v; },
        bbAdrenaline: (v) => { vus.bbAdrenaline = v; },
      },
      vus,
    };
  };

  it("laisse passer les réglages légitimes", () => {
    const { table, vus } = tableExemple();
    const applique = appliquer(table, JSON.parse('{"bbPath":["C4","C5"],"bbAdrenaline":2}'));
    expect(applique.sort()).toEqual(["bbAdrenaline", "bbPath"]);
    expect(vus.bbPath).toEqual(["C4", "C5"]);
    expect(vus.bbAdrenaline).toBe(2);
  });

  it("ignore `__proto__` sans lever", () => {
    const { table } = tableExemple();
    expect(() => appliquer(table, JSON.parse('{"__proto__": 1}'))).not.toThrow();
    expect(appliquer(table, JSON.parse('{"__proto__": 1}'))).toEqual([]);
  });

  it("ignore les autres clés héritées, et n'altère pas Object.prototype", () => {
    const { table } = tableExemple();
    ["constructor", "toString", "valueOf", "hasOwnProperty"].forEach((cle) => {
      expect(() => appliquer(table, JSON.parse(`{"${cle}": 1}`))).not.toThrow();
      expect(appliquer(table, JSON.parse(`{"${cle}": 1}`))).toEqual([]);
    });
    // Rien n'a été écrit sur le prototype au passage.
    expect({}.bbPath).toBeUndefined();
    expect(Object.prototype.bbPath).toBeUndefined();
  });

  it("ignore une clé inconnue plutôt que de la poser au hasard", () => {
    const { table } = tableExemple();
    expect(appliquer(table, { setPhase: "action", gameOver: true })).toEqual([]);
  });
});
