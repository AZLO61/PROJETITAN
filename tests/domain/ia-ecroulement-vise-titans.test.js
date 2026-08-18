/* ============================================================
   PROJET TITAN — L'IA vise les Titans avec les débris d'un Amas
   ============================================================
   Point ouvert de longue date : « l'IA ne vise pas les Titans avec les
   débris d'un écroulement, elle place au plus simple ». Elle prenait la
   première case venue (`eligibles[0]`), un ordre de balayage sans aucun
   rapport avec le jeu.

   Or un débris qui tombe sur un Titan le projette ET rapporte +1 Bagarre à
   l'initiateur. L'IA laissait donc filer des points gratuits à chaque Amas,
   et un joueur humain ne risquait jamais rien à camper à côté d'un tas prêt
   à s'écrouler — un trou de difficulté qu'on finit par exploiter sans même
   s'en rendre compte.
============================================================ */
import { describe, expect, it } from "vitest";
import { choisirRepartitionEcroulement } from "../../src/domain/aiPlanner.js";
import { resolveEcroulementAmas } from "../../src/domain/gameRules.js";

const mk = (id, cell) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  bagarre: 0, destruction: 0,
});

// T1 se tient sur l'Amas (c'est lui qui vient d'atterrir dessus), T2 et T3
// sont sur deux cases voisines. Aucun bâtiment : toutes les voisines sont
// éligibles, l'IA a donc un vrai choix à faire.
const etat = () => ({
  board: {},
  looseBlocks: { E5: ["rouge", "bleu"] },
  titans: [mk(1, "E5"), mk(2, "E6"), mk(3, "D5")],
  replis: [],
});

const ECROULEMENT = { cellKey: "E5", blocs: ["rouge", "bleu"], energie: 2 };

describe("Répartition d'un Amas par l'IA", () => {
  it("envoie ses débris sur les Titans adverses plutôt que sur des cases vides", () => {
    const choix = choisirRepartitionEcroulement(ECROULEMENT, etat(), 1);
    expect(choix).toHaveLength(2);
    expect(choix.every((c) => ["E6", "D5"].includes(c))).toBe(true);
    // Chaque Titan n'est visé qu'une fois : le premier débris le pousse hors
    // de la case, un second tomberait dans le vide.
    expect(new Set(choix).size).toBe(2);
  });

  it("ce choix rapporte réellement la Bagarre à l'initiateur", () => {
    const e = etat();
    const choix = choisirRepartitionEcroulement(ECROULEMENT, e, 1);
    resolveEcroulementAmas(1, ECROULEMENT, choix, e);
    expect(e.titans.find((t) => t.id === 1).bagarre).toBe(2);
    // Les deux cibles ont bien été projetées hors de leur case.
    expect(e.titans.find((t) => t.id === 2).cell).not.toBe("E6");
    expect(e.titans.find((t) => t.id === 3).cell).not.toBe("D5");
  });

  it("ne vise jamais l'initiateur lui-même", () => {
    // T1 sur l'Amas, et un allié fictif du même id ne doit pas être ciblé :
    // on vérifie surtout que la case de l'Amas n'est jamais choisie tant
    // qu'une voisine est disponible.
    const choix = choisirRepartitionEcroulement(ECROULEMENT, etat(), 1);
    expect(choix).not.toContain("E5");
  });

  it("retombe sur une case libre quand aucun Titan n'est à portée", () => {
    const e = { board: {}, looseBlocks: { E5: ["rouge"] }, titans: [mk(1, "E5")], replis: [] };
    const choix = choisirRepartitionEcroulement({ cellKey: "E5", blocs: ["rouge"], energie: 1 }, e, 1);
    expect(choix).toHaveLength(1);
    expect(choix[0]).not.toBe("E5");
  });
});
