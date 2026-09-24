import { describe, expect, it } from "vitest";
import {
  appliquerReplElement,
  resolveEcroulementAmas,
  resolveGraouhhh,
} from "../../src/domain/gameRules.js";
import { verifierInvariants } from "../../src/domain/invariants.js";
import { forceEstimee, miseDefenseFpmc } from "../../src/domain/aiPlanner.js";
import { parReseau } from "../../server/relais.mjs";

/* ============================================================
   PROJET TITAN — Suite de l'audit du 2026-09-24
   ============================================================
   Les points laissés ouverts par la 35e passe, chacun rejoué par script
   avant d'être corrigé. Un test par défaut, sur la géométrie du script.
============================================================ */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});
const bat = (cell, blocks) => ({ [cell]: { row: cell[0], col: Number(cell.slice(1)), blocks: [...blocks], socle: blocks.length, isTeleporter: false } });

describe("C9 — un Titan re-percuté dans la même carte n'a qu'un repli", () => {
  it("Graouhhh d'un bloc : le Titan du fond garde un seul repli, qui porte son suiveur", () => {
    const jeu = { board: bat("E5", ["bleu", "bleu"]), titans: [t(1, "E2"), t(2, "E3"), t(3, "E4")], looseBlocks: {}, replis: [], trajectoires: [] };
    resolveGraouhhh(1, 0, 1, 1, jeu);
    const replisT3 = jeu.replis.filter((r) => r.titanId === 3);
    expect(replisT3).toHaveLength(1);
    expect(replisT3[0].suiveurs).toEqual([expect.objectContaining({ id: 2 })]);
  });
});

describe("C11 — un repli caduc ne s'applique pas", () => {
  it("un Titan sorti du plateau entre-temps reste dehors, l'occupant visé ne bouge pas", () => {
    const sorti = t(2, "D5", { horsPlateau: true });
    const voisin = t(3, "D6");
    const jeu = { board: {}, titans: [t(1, "A1"), sorti, voisin], looseBlocks: {}, replis: [], trajectoires: [] };
    const res = appliquerReplElement({ titanId: 2, defaut: "D5", cases: ["D5", "D6"], cible: "D6", initiatorId: 1 }, "D6", jeu);
    expect(res.applied).toBe(false);
    expect(sorti.cell).toBe("D5");
    expect(voisin.cell).toBe("D6");
  });
});

describe("C11 — le repli d'un débris déplace le débris arrêté, pas le sommet de la pile", () => {
  it("un bloc posé par-dessus entre-temps reste sur la case", () => {
    const jeu = { board: {}, titans: [t(1, "A1")], looseBlocks: { D5: ["rouge", "bleu"] }, replis: [], trajectoires: [] };
    const res = appliquerReplElement({ titanId: null, hauteur: 0, defaut: "D5", cases: ["D5", "D6"], cible: "D6", initiatorId: 1 }, "D6", jeu);
    expect(res.applied).toBe(true);
    expect(jeu.looseBlocks.D6).toEqual(["rouge"]);
    expect(jeu.looseBlocks.D5).toEqual(["bleu"]);
  });
});

describe("C18 — la bascule de fin de carte ne recompte pas la Bagarre", () => {
  it("un Titan déjà compté par la carte ne rapporte rien de plus quand la tour le repousse", () => {
    const attaquant = t(1, "A1");
    const jeu = { board: {}, titans: [attaquant, t(2, "E6")], looseBlocks: {}, replis: [], trajectoires: [] };
    const ecroulement = { cellKey: "E5", blocs: ["bleu", "rouge"], energie: 1 };
    resolveEcroulementAmas(1, ecroulement, ["E6", "E4"], jeu, { dejaTouches: new Set([2]) });
    expect(attaquant.bagarre).toBe(0);
  });
});

describe("C16 — l'invariant voit un bloc perdu, pas seulement un excès", () => {
  it("un bloc effacé entre deux contrôles est signalé", () => {
    const etat = { board: bat("E5", ["bleu", "rouge"]), titans: [t(1, "A1", { repaire: ["rose"] })], looseBlocks: { C3: ["bleu"] } };
    expect(verifierInvariants(etat).map((v) => v.regle)).not.toContain("blocs-perdus-ou-crees");
    delete etat.looseBlocks.C3;
    expect(verifierInvariants(etat).map((v) => v.regle)).toContain("blocs-perdus-ou-crees");
  });
});

describe("Faut Pas Me Chauffer — l'IA estime, et elle se défend", () => {
  /* Nikola, 2026-09-24 : « l'IA doit ESTIMER la Force adverse au lieu de lire
     la programmation secrète, et miser en DÉFENSE quand ça limite ce qu'elle
     perd ». */
  it("l'estimation ne dépend pas de QUELLES cartes sont programmées", () => {
    const a = t(2, "E5", { programmed: ["faut_pas_me_chauffer", "je_ne_partage_pas"], hand: ["tout_casser", "graouhhh"], playedThisManche: ["boing_boing"] });
    const b = t(2, "E5", { programmed: ["tout_casser", "graouhhh"], hand: ["faut_pas_me_chauffer", "je_ne_partage_pas"], playedThisManche: ["boing_boing"] });
    expect(forceEstimee(a)).toBe(forceEstimee(b));
  });

  it("une cible qui peut combler l'écart mise ; une cible déjà devant ou hors de portée ne mise rien", () => {
    const attaquant = t(1, "E4", { adrenaline: 0 });
    const cible = t(2, "E5", { adrenaline: 3, repaire: ["rouge", "rouge", "rose"] });
    const titans = [attaquant, cible];
    // Égalité (perdue) : 1 Adrénaline (2 points au barème, stock 3 → 2) sauve un Rouge (4 points).
    expect(miseDefenseFpmc(attaquant, cible, titans, { baseAttaquant: 7, baseDefenseur: 7 })).toBe(1);
    // Deux d'écart : 2 Adrénalines coûtent 4 points, autant que le Rouge — elle ne paie pas pour rien.
    expect(miseDefenseFpmc(attaquant, cible, titans, { baseAttaquant: 7, baseDefenseur: 6 })).toBe(0);
    expect(miseDefenseFpmc(attaquant, cible, titans, { baseAttaquant: 5, baseDefenseur: 8 })).toBe(0);
    expect(miseDefenseFpmc(attaquant, cible, titans, { baseAttaquant: 9, baseDefenseur: 3 })).toBe(0);
  });
});

describe("Relais — une adresse IPv6 compte pour son /64", () => {
  it("deux adresses du même /64 partagent un compteur ; IPv4 et boucle locale passent telles quelles", () => {
    expect(parReseau("2001:db8:1:2::a")).toBe(parReseau("2001:db8:1:2:ffff:1:2:3"));
    expect(parReseau("2001:db8:1:2::a")).not.toBe(parReseau("2001:db8:1:3::a"));
    expect(parReseau("203.0.113.7")).toBe("203.0.113.7");
    expect(parReseau("::1")).toBe("::1");
    expect(parReseau("::ffff:127.0.0.1")).toBe("::ffff:127.0.0.1");
  });
});
