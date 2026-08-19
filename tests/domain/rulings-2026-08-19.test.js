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
import {
  POINTS_PAR_ADRENALINE,
  computeFinalScore,
  getJeNePartagePasCount,
  getJeNePartagePasPool,
  resolveJeNePartagePas,
  resolveJeNePartagePasElement,
  getMovementReachable,
  resolveFreeMovement,
  resolveTeteEnAvant,
  computeEnergyToutCasser,
  getPerimeter,
  indexerTitans,
} from "../../src/domain/gameRules.js";

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

describe("Je Ne Partage Pas : deux debris sur une MEME case (bug remonte)", () => {
  it("ramasse deux elements empiles sur une seule case", () => {
    /* Le bug : l'action exigeait deux cases DISTINCTES. Une case portant deux
       debris ne pouvait donc pas etre videe par la carte, alors que rien dans
       la regle ne l'interdit. */
    /* La Lanterne Rouge s'active dès l'ÉGALITÉ avec le plus petit Repaire de
       la table, et accorde alors 3 prélèvements. Pour mesurer le cas normal à
       2, c'est donc le Titan testeur qui doit être au-dessus du minimum. */
    const titan = t(1, "E5", { repaire: ["bleu", "bleu"] });
    const pauvre = t(2, "A1");
    const jeu = { titans: [titan, pauvre], looseBlocks: { E6: ["bleu", "rouge"] }, board: {} };
    expect(getJeNePartagePasCount(1, jeu)).toBe(2);
    const res = resolveJeNePartagePas(1, ["E6", "E6"], jeu);
    expect(res.applied).toBe(true);
    // Deux blocs de plus que les deux qu'il avait déjà.
    expect(titan.repaire).toEqual(["bleu", "bleu", "rouge", "bleu"]);
    // La case est videe, donc le Titan s'y deplace (regle transversale).
    expect(jeu.looseBlocks.E6).toBeUndefined();
    expect(titan.cell).toBe("E6");
  });

  it("refuse un troisieme prelevement sur une case qui n'en a que deux", () => {
    const titan = t(1, "E5");
    const jeu = { titans: [titan], looseBlocks: { E6: ["bleu", "rouge"] }, board: {} };
    resolveJeNePartagePasElement(1, "E6", jeu);
    resolveJeNePartagePasElement(1, "E6", jeu);
    const troisieme = resolveJeNePartagePasElement(1, "E6", jeu);
    expect(troisieme.applied).toBe(false);
    expect(titan.repaire).toHaveLength(2);
  });

  it("la Lanterne Rouge ramasse bien 3 elements, meme tous sur la meme case", () => {
    // Repaire vide = minimum de la table, donc Lanterne Rouge active.
    const moi = t(1, "E5");
    const autre = t(2, "A1", { repaire: ["bleu", "bleu", "bleu"] });
    const jeu = { titans: [moi, autre], looseBlocks: { E6: ["bleu", "rose", "rouge"] }, board: {} };
    expect(getJeNePartagePasCount(1, jeu)).toBe(3);
    const res = resolveJeNePartagePas(1, ["E6", "E6", "E6"], jeu);
    expect(res.applied).toBe(true);
    expect(moi.repaire).toHaveLength(3);
    expect(moi.cell).toBe("E6");
  });
});

describe("Ramassage sequentiel : le Perimetre suit le Titan (WIP 2026-08-19)", () => {
  it("le Titan se deplace des que la case ramassee se vide", () => {
    const titan = t(1, "B2");
    const jeu = { titans: [titan], looseBlocks: { A2: ["bleu"] }, board: {} };
    const res = resolveJeNePartagePasElement(1, "A2", jeu);
    expect(res.applied).toBe(true);
    expect(titan.cell).toBe("A2");
  });

  it("un debris hors de portee APRES le deplacement devient inaccessible", () => {
    /* C'est la consequence que Nikola assume et qui reste WIP. Titan en B2 :
       C3 est dans son Perimetre de depart. Il ramasse d'abord en A2, s'y
       deplace, et C3 n'est plus adjacent a A2 : le second prelevement est
       refuse. Avant ce ruling, il aurait ete accepte. */
    const titan = t(1, "B2");
    const jeu = { titans: [titan], looseBlocks: { A2: ["bleu"], C3: ["rouge"] }, board: {} };

    // Depart : les deux cases sont bien a portee.
    expect(getJeNePartagePasPool(1, jeu).sort()).toEqual(["A2", "C3"]);

    resolveJeNePartagePasElement(1, "A2", jeu);
    expect(titan.cell).toBe("A2");

    // Depuis A2, C3 n'est plus dans le Perimetre.
    expect(getJeNePartagePasPool(1, jeu)).not.toContain("C3");
    const refus = resolveJeNePartagePasElement(1, "C3", jeu);
    expect(refus.applied).toBe(false);
    expect(refus.log.join(" ")).toMatch(/hors P.rim.tre/);
    expect(titan.repaire).toEqual(["bleu"]);
  });

  it("un debris qui ENTRE dans le Perimetre grace au deplacement devient accessible", () => {
    /* Le revers de la meme regle, et la raison pour laquelle elle n'est pas
       qu'une restriction : en avancant, le Titan atteint des cases qui
       n'etaient pas a sa portee au depart. */
    const titan = t(1, "B2");
    const jeu = { titans: [titan], looseBlocks: { C3: ["bleu"], D4: ["rouge"] }, board: {} };
    expect(getJeNePartagePasPool(1, jeu)).not.toContain("D4");
    resolveJeNePartagePasElement(1, "C3", jeu);
    expect(titan.cell).toBe("C3");
    const second = resolveJeNePartagePasElement(1, "D4", jeu);
    expect(second.applied).toBe(true);
    expect(titan.repaire.sort()).toEqual(["bleu", "rouge"]);
    expect(titan.cell).toBe("D4");
  });

  it("un butin deja ramasse n'est jamais rendu si un choix suivant est refuse", () => {
    /* Sans cette garantie, l'appelant croirait la carte non jouee alors que le
       Titan a deja encaisse son butin et change de case. */
    const titan = t(1, "B2", { repaire: ["rose", "rose"] });
    const pauvre = t(2, "I9");
    const jeu = { titans: [titan, pauvre], looseBlocks: { A2: ["bleu"], C3: ["rouge"] }, board: {} };
    const res = resolveJeNePartagePas(1, ["A2", "C3"], jeu);
    expect(res.applied).toBe(true);
    expect(titan.repaire).toEqual(["rose", "rose", "bleu"]);
    expect(jeu.looseBlocks.C3).toEqual(["rouge"]);
  });
});

describe("Cohabitation avec un debris (WIP 2026-08-19)", () => {
  /* Ruling WIP : un Titan se deplace volontairement sur une case portant un
     debris, s'y arrete et la traverse, sans condition. Avant, un bloc Vert
     encore au sol bloquait l'arret. */
  it("un Titan peut s'arreter sur une case portant un bloc Vert", () => {
    const titan = t(1, "E5");
    const jeu = { titans: [titan], looseBlocks: { E6: ["vert"] }, board: {} };
    const res = resolveFreeMovement(1, "E6", jeu);
    expect(titan.cell).toBe("E6");
    expect(res.log.join(" ")).not.toMatch(/bloqu/);
  });

  it("s'y arreter ne ramasse PAS le bloc", () => {
    const titan = t(1, "E5");
    const jeu = { titans: [titan], looseBlocks: { E6: ["vert"] }, board: {} };
    resolveFreeMovement(1, "E6", jeu);
    expect(titan.repaire).toEqual([]);
    expect(jeu.looseBlocks.E6).toEqual(["vert"]);
  });

  it("une case portant un Vert reste atteignable dans le calcul de portee", () => {
    const titan = t(1, "E5");
    const board = {};
    const atteignables = getMovementReachable("E5", 2, board, {}, { E6: ["vert"] });
    expect([...atteignables.reachable]).toContain("E6");
    expect(titan.cell).toBe("E5");
  });

  it("les autres blocages restent en place : batiment debout et Titan present", () => {
    /* La cohabitation ne concerne QUE les elements au sol. Un batiment debout
       et un autre Titan bloquent toujours, ce sont deux invariants distincts
       qu'un WIP sur les debris ne doit pas emporter avec lui. */
    const moi = t(1, "E5");
    const autre = t(2, "E6");
    const jeuTitan = { titans: [moi, autre], looseBlocks: {}, board: {} };
    const versTitan = resolveFreeMovement(1, "E6", jeuTitan);
    expect(moi.cell).toBe("E5");
    expect(versTitan.log.join(" ")).toMatch(/bloqu|occup/i);

    const moi2 = t(1, "E5");
    const jeuBat = {
      titans: [moi2], looseBlocks: {},
      board: { E6: { row: "E", col: 6, blocks: ["bleu"], socle: 1, isTeleporter: false } },
    };
    const versBat = resolveFreeMovement(1, "E6", jeuBat);
    expect(moi2.cell).toBe("E5");
    expect(versBat.log.join(" ")).toMatch(/bloqu/i);
  });

  it("la regle ne vit qu'a un seul endroit, condition d'un WIP reversible", () => {
    const src = lire("src/domain/gameRules.js");
    // Plus aucune recopie de la condition : elle etait dupliquee 4 fois.
    expect(src).not.toMatch(/looseStack\.some\(\(e\) => e === "vert"\)/);
    expect(src).toContain("function elementAuSolBloqueArret");
    // Un seul point a rebasculer, et il est ecrit noir sur blanc.
    expect(src).toMatch(/Avant le 2026-08-19 : return .*e === "vert"/);
  });
});

describe("La logique de charge s'applique a TOUT ce qui est percute", () => {
  /* Nikola, 2026-08-19 : « je veux que tu appliques la logique de charge pour
     tout ». Un Titan qui charge envoie ce qu'il percute DEVANT lui, dans l'axe
     de percussion. Deux projections partaient a contre-sens et revenaient sur
     l'attaquant : le second bloc d'un batiment au Seuil 4, et les blocs d'un
     Amas balaye au Seuil 4. */

  const bat = (cle, etages) => ({
    [cle]: { row: cle[0], col: Number(cle.slice(1)), blocks: Array(etages).fill("bleu"), socle: etages, isTeleporter: false },
  });
  // Colonne = distance vers l'est. L'attaquant part de E1 et charge vers E9.
  const versEst = { dr: 0, dc: 1 };

  it("le second bloc d'un batiment part DEVANT, jamais sur l'attaquant", () => {
    /* Charge de E1 vers l'est, batiment de 3 etages en E2. Au Seuil 4, un
       second bloc est ejecte : il doit atterrir a l'EST de E2, donc en colonne
       superieure a 2, et surtout jamais en colonne 1 (la case de depart). */
    const titan = t(1, "E1", { adrenaline: 5 });
    const jeu = { titans: [titan], looseBlocks: {}, board: { ...bat("E2", 3) }, replis: [] };
    // 3 Adrenalines : l'energie a distance 1 depasse largement le Seuil 4.
    resolveTeteEnAvant(1, versEst.dr, versEst.dc, 3, jeu);

    const casesAvecBlocs = Object.keys(jeu.looseBlocks).filter((k) => jeu.looseBlocks[k].length > 0);
    expect(casesAvecBlocs.length).toBeGreaterThan(0);
    casesAvecBlocs.forEach((cle) => {
      expect(cle[0]).toBe("E");                    // reste sur la ligne de charge
      expect(Number(cle.slice(1))).toBeGreaterThan(2); // et DEVANT le batiment
    });
  });

  it("les blocs d'un Amas balaye partent DEVANT, jamais sur l'attaquant", () => {
    /* Meme charge, mais l'obstacle est un Amas de 3 blocs en E2. Au Seuil 4
       c'est un Patatras : les blocs sont ejectes. Ils partaient a contre-sens,
       donc vers E1, la case meme d'ou venait le Titan. */
    const titan = t(1, "E1", { adrenaline: 5 });
    const jeu = {
      titans: [titan],
      looseBlocks: { E2: ["bleu", "rose", "rouge"] },
      board: {},
      replis: [],
    };
    resolveTeteEnAvant(1, versEst.dr, versEst.dc, 3, jeu);

    const casesAvecBlocs = Object.keys(jeu.looseBlocks).filter((k) => jeu.looseBlocks[k].length > 0);
    expect(casesAvecBlocs.length).toBeGreaterThan(0);
    casesAvecBlocs.forEach((cle) => {
      expect(Number(cle.slice(1))).toBeGreaterThan(2);
    });
    // Et rien n'est revenu sur la case de depart de l'attaquant.
    expect(jeu.looseBlocks.E1 || []).toHaveLength(0);
  });

  it("plus aucune projection a contre-sens ne subsiste dans le moteur", () => {
    /* Filet de coherence : le jour ou quelqu'un rajoute une projection, elle
       doit suivre la meme regle. On ne cherche que le CODE, pas les
       commentaires qui expliquent l'ancien comportement. */
    const src = lire("src/domain/gameRules.js");
    const lignesDeCode = src
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"));
    const fautives = lignesDeCode.filter((l) => /projectInDirection\([^)]*-dr,\s*-dc/.test(l));
    expect(fautives).toEqual([]);
  });
});

describe("Tout Casser : une case qui porte un debris EST une case occupee", () => {
  /* Bug remonte par Nikola apres trois parties : « tu es sur de bien jauger
     la puissance de l'energie ? je suis en D4, batiment C3 qui se prend une
     energie de 5 ». Mesure sur son cas : l'energie sortait a 2.

     Les blocs libres au sol n'entraient pas dans le compte. Or le livret dit
     « nombre de cases OCCUPEES dans ton Perimetre », et une case qui porte un
     debris ou un Socle est occupee — c'est meme le cas le plus courant en fin
     de Manche, quand le sol se couvre de gravats. */
  const perim = (cle) => getPerimeter(cle[0], Number(cle.slice(1)));

  it("les debris au sol comptent dans l'energie", () => {
    const sans = computeEnergyToutCasser(perim("E5"), {}, {}, 0, {});
    const avec = computeEnergyToutCasser(perim("E5"), {}, {}, 0, {
      D4: ["bleu"], D5: ["rose"], E4: ["rouge"], F6: ["bleu"],
    });
    expect(sans).toBe(0);
    expect(avec).toBe(4);
  });

  it("batiments, Titans et debris se cumulent sans doublon", () => {
    const board = { D4: { row: "D", col: 4, blocks: ["bleu"], socle: 1, isTeleporter: false } };
    const titans = [{ id: 2, cell: "E4", horsPlateau: false }];
    // D4 porte a la fois un batiment ET un debris : la case ne compte qu'une fois.
    const energie = computeEnergyToutCasser(
      perim("E5"), board, indexerTitans(titans), 0, { D4: ["bleu"], D6: ["rose"] }
    );
    expect(energie).toBe(3); // D4 (batiment+debris) + E4 (Titan) + D6 (debris)
  });

  it("le plafond de 8 tient toujours", () => {
    const partout = {};
    perim("E5").forEach((c) => { partout[c.row + c.col] = ["bleu"]; });
    expect(computeEnergyToutCasser(perim("E5"), {}, {}, 3, partout)).toBe(8);
  });
});

describe("Tete en Avant : la cible bouge meme sous le Seuil 4", () => {
  it("une charge sans Adrenaline projette quand meme sa cible", () => {
    const a = t(1, "E1");
    const cible = t(2, "E2", { repaire: ["bleu", "rose"] });
    const jeu = { titans: [a, cible], looseBlocks: {}, board: {}, replis: [] };
    resolveTeteEnAvant(1, 0, 1, 0, jeu);
    expect(cible.cell).not.toBe("E2");
    expect(a.bagarre).toBeGreaterThan(0);
  });

  it("la chaine part aussi : deux Titans alignes reculent tous les deux", () => {
    /* Le cas exact de Nikola : « j'etais sur F1, le titan G1 et le suivant
       H1, les cibles impactees ne se sont pas deplacees meme en DIL ». */
    const a = t(1, "F1");
    const g = t(2, "G1", { repaire: ["bleu", "rose"] });
    const h = t(3, "H1", { repaire: ["bleu", "rose"] });
    const jeu = { titans: [a, g, h], looseBlocks: {}, board: {}, replis: [] };
    resolveTeteEnAvant(1, 1, 0, 0, jeu);
    expect(g.cell).not.toBe("G1");
    expect(h.cell).not.toBe("H1");
  });
});
