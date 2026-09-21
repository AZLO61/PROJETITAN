/* ============================================================
   PROJET TITAN — Le simulateur joue les décisions de la table
   ============================================================
   `npm run duel` tranche les réglages d'IA sur des parties simulées. Jusqu'au
   2026-09-21, le simulateur résolvait les Dilemmes et les RAGE avec le
   MODÈLE de l'IA (`appliquerDecisions`) — le code qu'elle consulte pour
   prévoir —, alors que la table les résout avec les règles du contrôleur.
   Il mesurait donc un jeu où les prévisions de l'IA tombaient toujours
   juste : une RAGE de Tout Casser y donnait son bloc à l'attaquant (la table
   le pose au sol), un bloc de Dilemme « au sol » y disparaissait, aucune
   Fatigue n'y était jamais refusée.

   Ces tests verrouillent la séparation : le coup JOUÉ rend ses décisions au
   lieu de les résoudre par le modèle, les règles réelles vivent en un seul
   exemplaire, et le contrôleur ne s'en refait pas une copie.
============================================================ */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acheminerPerte, appliquerCoup, appliquerDecisions, trancherDecisionIA } from "../../src/domain/aiPlanner.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../../src/domain/aiEvaluation.js";
import { makeDecisionRequest } from "../../src/domain/gameRules.js";
import { setSeed } from "../../src/domain/rng.js";

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});
const expert = makeProfile(FORCES.EXPERT, TEMPERAMENTS.OPPORTUNISTE);

describe("Le coup joué rend ses décisions, il ne les résout plus par le modèle", () => {
  it("Graouhhh : le Dilemme et la Fatigue remontent, le Repaire de la cible est intact", () => {
    setSeed(3);
    const cible = t(2, "E2", { repaire: ["bleu", "rose"], hand: ["tout_casser", "graouhhh"], adrenaline: 1 });
    const etat = { board: {}, looseBlocks: {}, titans: [t(1, "E1"), cible] };

    const res = appliquerCoup({ cardId: "graouhhh", dir: { dr: 0, dc: 1 }, mise: 0 }, 1, etat, 1, expert);

    // Avant : le modèle tranchait le Dilemme sur place et la cible perdait
    // un bloc que la table ne lui avait pas encore pris.
    expect(cible.repaire).toEqual(["bleu", "rose"]);
    expect(res.decisions).toEqual([expect.objectContaining({ type: "DIL", defenderId: 2, cellAtImpact: "E2" })]);
    // Et la Fatigue refusable remonte, là où `resolveGraouhhh` la jetait.
    expect(res.fatigues).toEqual([expect.objectContaining({ attackerId: 1, targetId: 2 })]);
  });
});

describe("La route du bloc perdu est celle de la carte (`acheminerPerte`)", () => {
  it("RAGE de Tout Casser : le bloc tombe au sol, à la case d'impact", () => {
    const attaquant = t(1, "E1", { repaire: ["bleu"] });
    const cible = t(2, "E2", { repaire: ["rouge"] });
    const looseBlocks = {};
    const d = makeDecisionRequest("RAGE", 1, 2, "Tout Casser", "E2");

    acheminerPerte(d, cible, attaquant, "rouge", looseBlocks);

    expect(cible.repaire).toEqual([]);
    expect(attaquant.repaire).toEqual(["bleu"]); // le modèle le lui donnait
    expect(looseBlocks.E2).toEqual(["rouge"]);
  });

  it("Faut Pas Me Chauffer : le bloc passe chez l'attaquant", () => {
    const attaquant = t(1, "E1");
    const cible = t(2, "E2", { repaire: ["rouge", "bleu"] });
    const looseBlocks = {};
    acheminerPerte(makeDecisionRequest("DIL", 1, 2, "Faut Pas Me Chauffer", "E2"), cible, attaquant, "rouge", looseBlocks);
    expect(attaquant.repaire).toEqual(["rouge"]);
    expect(looseBlocks).toEqual({});
  });
});

describe("Un seul cerveau : ce que l'IA prévoit est ce qu'elle joue", () => {
  /* Mesuré au duel le 2026-09-21 : faire trancher la table comme le modèle
     prévoit rapporte +1,24 point par partie. Ce test verrouille l'égalité
     elle-même — le modèle (`appliquerDecisions`) et la table
     (`trancherDecisionIA` + `acheminerPerte`) produisent le même état. */
  const cas = [
    ["RAGE", "Tête en Avant", { repaire: ["rouge", "bleu", "rose"], adrenaline: 1 }],
    ["RAGE", "Tout Casser", { repaire: ["rouge", "bleu"] }],
    ["DIL", "Tête en Avant", { repaire: ["rouge", "rouge", "rose", "bleu"], adrenaline: 2 }],
    ["DIL", "Faut Pas Me Chauffer", { repaire: ["orange", "bleu", "rouge"] }],
    ["DIL", "Graouhhh", { repaire: ["rose", "bleu"] }],
  ];
  it.each(cas)("%s de %s : même issue dans le modèle et à la table", (type, carte, cible) => {
    const partie = () => ({
      board: {}, looseBlocks: {},
      titans: [t(1, "E1", { repaire: ["bleu"] }), t(2, "E2", structuredClone(cible))],
    });
    const d = makeDecisionRequest(type, 1, 2, carte, "E2");

    const prevue = partie();
    appliquerDecisions([d], prevue, expert);

    const jouee = partie();
    const choix = trancherDecisionIA(d, jouee.titans, expert, expert);
    const [attaquant, defenseur] = jouee.titans;
    if (choix?.paie) { defenseur.adrenaline -= 1; attaquant.adrenaline += 1; }
    else if (choix) acheminerPerte(d, defenseur, attaquant, choix.option, jouee.looseBlocks);

    const empreinte = (e) => ({
      titans: e.titans.map((x) => ({ repaire: [...x.repaire].sort(), adrenaline: x.adrenaline, socles: x.socles })),
      looseBlocks: e.looseBlocks,
    });
    expect(empreinte(jouee)).toEqual(empreinte(prevue));
  });

  it("le modèle pose au sol le bloc d'une RAGE de Tout Casser, comme la table", () => {
    const etat = { board: {}, looseBlocks: {}, titans: [t(1, "E1"), t(2, "E2", { repaire: ["rouge"] })] };
    appliquerDecisions([makeDecisionRequest("RAGE", 1, 2, "Tout Casser", "E2")], etat, expert);
    expect(etat.titans[0].repaire).toEqual([]); // le modèle le lui donnait
    expect(etat.looseBlocks.E2).toEqual(["rouge"]);
  });
});

describe("Une seule règle pour la table et pour le simulateur", () => {
  it("la cible d'un Dilemme décide avec SON profil : l'Expert voit le bonus Rose qu'il perdrait", () => {
    // Trois Titans à un Rose chacun : perdre le sien coûte au défenseur sa
    // part du bonus. L'Expert, qui chiffre au score complet, lâche plutôt le
    // Rouge et paie une Adrénaline ; le Moyen ne lit que le barème, où le
    // Rose vaut moins que le Rouge, et le lâche sans payer.
    const situation = () => [
      t(1, "E1", { repaire: ["rose"] }),
      t(2, "E2", { repaire: ["rouge", "rose"], adrenaline: 2 }),
      t(3, "A1", { repaire: ["rose"] }),
    ];
    const d = makeDecisionRequest("DIL", 1, 2, "Tête en Avant", "E2");
    const moyen = trancherDecisionIA(d, situation(), makeProfile(FORCES.MOYEN, TEMPERAMENTS.OPPORTUNISTE), expert);
    const exp = trancherDecisionIA(d, situation(), expert, expert);
    expect(moyen).toMatchObject({ option: "rose", paie: false });
    expect(exp).toMatchObject({ option: "rouge", paie: true });
  });

  it("le contrôleur ne réécrit pas les règles de décision de l'IA, il les importe", () => {
    const controleur = readFileSync("src/application/useBoardGeneratorController.jsx", "utf8");
    // Les noms de l'ancienne table de valeur, supprimée le 2026-09-21 : si
    // l'un d'eux réapparaît comme fonction du contrôleur, le second cerveau
    // est de retour.
    for (const regle of ["marginalValue", "esperanceSocle", "valeurOptionDil", "coutOptionDil", "defenseurPaieAdrenaline"]) {
      expect(controleur).not.toMatch(new RegExp(`function ${regle}\\b`));
    }
    // Le tour d'une IA tranche ses replis et transmet les Fatigues de son
    // Boing Boing : deux manques trouvés en comparant la table au simulateur.
    expect(controleur).toContain("enqueueReplis(jeu2.replis)");
    expect(controleur.match(/if \(res(ult)?\.fatigues\?\.length\) enqueueFatigues\(res(ult)?\.fatigues\);/g)).toHaveLength(3);
  });

  it("l'IA tranche ses propres Dilemmes AVANT son ramassage, comme un joueur humain", () => {
    // Mesuré au duel le 2026-09-21 : l'ordre inverse lui coûtait 1,22 point
    // par partie — le bloc que son Dilemme faisait tomber à ses pieds lui
    // échappait à chaque fois.
    const controleur = readFileSync("src/application/useBoardGeneratorController.jsx", "utf8");
    const avant = controleur.indexOf("enqueueDecisions(tranchablesSeule)");
    const ramassage = controleur.indexOf("// ── ÉTAPE 3 : RÉCUPÉRATION PASSIVE ──");
    expect(avant).toBeGreaterThan(0);
    expect(ramassage).toBeGreaterThan(avant);
  });
});
