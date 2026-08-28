/* ============================================================
   PROJET TITAN — Rulings du 2026-08-19
   ============================================================
   Un test par règle modifiée, comme l'impose le README du livret : ce sont
   eux qui empêchent la prochaine passe de refaire le trajet inverse.

   Ce fichier couvre la VALEUR DE L'ADRÉNALINE au décompte final. Elle est
   passée de 3 à 2 points le 2026-08-19, puis du forfait plat au BARÈME
   PROGRESSIF le 2026-08-28 — les tests suivent le ruling en vigueur.

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
  BAREME_ADRENALINE,
  scoreAdrenaline,
  valeurMarginaleAdrenaline,
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

describe("Adrénaline conservée : barème PROGRESSIF, pas un forfait", () => {
  /* Ruling remplacé le 2026-08-28. Le forfait plat de 2 points datait du
     2026-08-19 ; Nikola : « faut qu'on fasse plus un barème progressif de
     détention d'adrénaline que juste 2 par adrénaline ».

     Ce que ces tests protègent, au-delà des chiffres : le PROFIL de la
     courbe. Une petite réserve doit valoir moins que sous l'ancien forfait
     (sinon on retombe sur le défaut que le ruling du 19 corrigeait : garder
     est trop rentable, donc on ne dépense jamais), et une grosse réserve
     doit valoir plus (sinon le barème n'est pas progressif du tout). */
  it("le barème est cumulatif et strictement croissant", () => {
    expect(BAREME_ADRENALINE).toEqual([1, 3, 5, 8, 11, 15, 19, 24]);
    for (let i = 1; i < BAREME_ADRENALINE.length; i++) {
      expect(BAREME_ADRENALINE[i]).toBeGreaterThan(BAREME_ADRENALINE[i - 1]);
    }
  });

  it("chaque Adrénaline supplémentaire vaut au moins autant que la précédente", () => {
    // C'est la définition même de « progressif » : la valeur marginale ne
    // redescend jamais. Sans ce test, une faute de frappe dans le tableau
    // passerait inaperçue tant que la somme reste croissante.
    let precedente = 0;
    for (let n = 0; n < BAREME_ADRENALINE.length; n++) {
      const marginale = valeurMarginaleAdrenaline(n);
      expect(marginale).toBeGreaterThanOrEqual(precedente);
      precedente = marginale;
    }
  });

  it("une petite réserve rapporte MOINS que l'ancien forfait de 2 par jeton", () => {
    expect(scoreAdrenaline(1)).toBeLessThan(2 * 1);
    expect(scoreAdrenaline(2)).toBeLessThan(2 * 2);
    expect(scoreAdrenaline(3)).toBeLessThan(2 * 3);
  });

  it("une grosse réserve rapporte PLUS que l'ancien forfait", () => {
    expect(scoreAdrenaline(5)).toBeGreaterThan(2 * 5);
    expect(scoreAdrenaline(8)).toBeGreaterThan(2 * 8);
  });

  it("le décompte final applique le barème, pas une multiplication", () => {
    const joueurs = [t(1, "A1", { adrenaline: 4 }), t(2, "A3", { adrenaline: 0 })];
    const res = computeFinalScore(joueurs, {}, null);
    expect(res.totals[1].adrenalinePts).toBe(8);
    expect(res.totals[2].adrenalinePts).toBe(0);
  });

  it("la ligne Adrénaline pèse bien dans le total, sans écraser le reste", () => {
    /* Deux Titans identiques à l'Adrénaline près : l'écart de total doit être
       exactement ce que dit le barème, ni plus (double comptage) ni moins
       (ligne oubliée dans la somme). C'est la somme `total` qui est vérifiée
       ici, pas seulement le détail : les deux avaient déjà divergé. */
    const sans = computeFinalScore([t(1, "A1", { adrenaline: 0 }), t(2, "A3")], {}, null);
    const avec = computeFinalScore([t(1, "A1", { adrenaline: 3 }), t(2, "A3")], {}, null);
    expect(avec.totals[1].total - sans.totals[1].total).toBe(scoreAdrenaline(3));
  });

  it("au-delà du barème, la réserve ne diverge pas", () => {
    // Une partie exotique ne doit pas faire exploser le score : le dernier
    // palier se répète au lieu de continuer à monter.
    const marginaleAuPlafond = valeurMarginaleAdrenaline(BAREME_ADRENALINE.length);
    expect(marginaleAuPlafond).toBe(0);
  });

  it("aucune Adrénaline ne rapporte rien du tout", () => {
    const res = computeFinalScore([t(1, "A1"), t(2, "A3")], {}, null);
    expect(res.totals[1].adrenalinePts).toBe(0);
  });
});

describe("La valeur de l'Adrénaline ne vit qu'à une seule source dans le code", () => {
  it("le planificateur d'IA lit la valeur MARGINALE, jamais un forfait recopié", () => {
    const src = lire("src/domain/aiPlanner.js");
    expect(src).toContain("valeurMarginaleAdrenaline");
    /* Sur un barème progressif, arbitrer sur une constante est faux des deux
       côtés : trop cher quand l'IA est pauvre, trop bon marché quand elle est
       riche. Aucune constante locale ne doit donc réapparaître. */
    expect(src).not.toMatch(/VALEUR_ADRENALINE\s*=/);
  });

  it("le moteur ne multiplie plus, il lit le barème", () => {
    const src = lire("src/domain/gameRules.js");
    expect(src).not.toMatch(/\d+\s*\*\s*\(t\.adrenaline/);
    expect(src).toContain("scoreAdrenaline(t.adrenaline");
  });

  it("le contrôleur ne chiffre plus le coût d'une Adrénaline en dur", () => {
    /* Il portait `voitAdversaires ? 6 : 3` — deux nombres qui ne
       correspondaient déjà plus au forfait de 2, et qui n'ont plus aucun sens
       sur un barème progressif. */
    const src = lire("src/application/useBoardGeneratorController.jsx");
    expect(src).not.toMatch(/coutAdrenaline\s*=\s*voitAdversaires\s*\?\s*\d/);
    expect(src).toContain("valeurMarginaleAdrenaline");
  });
});

describe("Les quatre emplacements de la règle annoncent le même barème", () => {
  /* Le moteur applique, mais ce sont ces autres endroits que lisent les
     joueurs. Une valeur juste dans le code et fausse au livret est un
     mensonge à la table. */
  const paliers = BAREME_ADRENALINE.join(" · ");

  it("les règles affichées dans l'application annoncent le barème", () => {
    const src = lire("src/ui/rules/rulesContent.js");
    const entree = src.split(/\r?\n/).find((l) => l.includes('nom: "Adrénaline"'));
    expect(entree).toBeTruthy();
    expect(entree).toContain(paliers);
    expect(entree).not.toMatch(/rapporte 2 points de victoire/);
  });

  it("le livret annonce le même barème", () => {
    const livret = lire("docs/livret/ProjetTitan_Livret.html");
    expect(livret).toContain(paliers);
    // L'ancien forfait ne doit plus traîner nulle part.
    expect(livret).not.toMatch(/2 points par <img src="Adr/);
  });

  it("le tableau de décompte affiche le barème plutôt qu'un multiplicateur", () => {
    const src = lire("src/ui/panels/DecisionPanels.jsx");
    expect(src).toContain("BAREME_ADRENALINE.join");
    expect(src).not.toContain("POINTS_PAR_ADRENALINE");
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

describe("Je Ne Partage Pas : un seul deplacement, a la fin (WIP revise 2026-08-19)", () => {
  /* CE WIP A ETE REVISE LE JOUR MEME, apres trois parties de Nikola.

     Premiere version, le matin : le Titan se deplacait des qu'une case se
     vidait, et le Perimetre des prelevements suivants etait recalcule depuis
     sa nouvelle position. Consequence, des debris du Perimetre de depart
     devenaient inaccessibles.

     Version retenue, le soir : « n'impose plus de deplacement directement sur
     la tuile des qu'elle est libre. Pars du principe qu'en fonction du clic je
     finis sur la derniere case selectionnee : on peut donc choisir de
     recuperer plusieurs blocs sur des cases differentes, c'est juste qu'on
     finit sur la derniere selectionnee si elle devient libre. »

     La carte redevient donc ce qu'elle doit etre : on pioche a plusieurs
     endroits de son Perimetre, sans qu'il se derobe en cours de route. */

  it("ramasser sur deux cases eloignees reste possible", () => {
    /* Le cas que l'ancienne version rendait impossible : A2 puis C3, deux
       cases opposees du Perimetre de B2. Avant, prendre A2 tirait le Titan en
       A2 et C3 sortait de portee. */
    const titan = t(1, "B2", { repaire: ["rose", "rose"] });
    const pauvre = t(2, "I9");
    const jeu = { titans: [titan, pauvre], looseBlocks: { A2: ["bleu"], C3: ["rouge"] }, board: {} };
    const res = resolveJeNePartagePas(1, ["A2", "C3"], jeu);
    expect(res.applied).toBe(true);
    expect(titan.repaire).toEqual(["rose", "rose", "bleu", "rouge"]);
    // Il finit sur la DERNIERE case choisie, devenue libre.
    expect(titan.cell).toBe("C3");
  });

  it("le Titan ne bouge pas entre deux prelevements", () => {
    const titan = t(1, "B2", { repaire: ["rose", "rose"] });
    const pauvre = t(2, "I9");
    const jeu = { titans: [titan, pauvre], looseBlocks: { A2: ["bleu"], C3: ["rouge"] }, board: {} };
    resolveJeNePartagePasElement(1, "A2", jeu);
    // Apres le premier element, il est encore chez lui : c'est tout l'enjeu.
    expect(titan.cell).toBe("B2");
    expect(getJeNePartagePasPool(1, jeu)).toContain("C3");
  });

  it("il ne se pose pas sur une case ou il reste quelque chose", () => {
    const titan = t(1, "E5", { repaire: ["rose", "rose"] });
    const pauvre = t(2, "I9");
    const jeu = { titans: [titan, pauvre], looseBlocks: { E6: ["bleu", "rouge"] }, board: {} };
    // Une seule prise sur une case qui en porte deux : elle n'est pas videe.
    resolveJeNePartagePasElement(1, "E6", jeu);
    expect(titan.cell).toBe("E5");
    expect(jeu.looseBlocks.E6).toEqual(["bleu"]);
  });

  it("deux prises sur la meme case la vident, et il s'y installe", () => {
    const titan = t(1, "E5", { repaire: ["rose", "rose"] });
    const pauvre = t(2, "I9");
    const jeu = { titans: [titan, pauvre], looseBlocks: { E6: ["bleu", "rouge"] }, board: {} };
    const res = resolveJeNePartagePas(1, ["E6", "E6"], jeu);
    expect(res.applied).toBe(true);
    expect(jeu.looseBlocks.E6).toBeUndefined();
    expect(titan.cell).toBe("E6");
  });

  it("un butin deja ramasse n'est jamais rendu si un choix suivant est refuse", () => {
    const titan = t(1, "B2", { repaire: ["rose", "rose"] });
    const pauvre = t(2, "I9");
    const jeu = { titans: [titan, pauvre], looseBlocks: { A2: ["bleu"] }, board: {} };
    // Le second choix vise une case vide : refuse, mais le premier reste acquis.
    const res = resolveJeNePartagePas(1, ["A2", "H8"], jeu);
    expect(res.applied).toBe(true);
    expect(titan.repaire).toEqual(["rose", "rose", "bleu"]);
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
