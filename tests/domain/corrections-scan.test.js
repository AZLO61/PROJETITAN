/* ============================================================
   PROJET TITAN — Non-régression du scan du 2026-08-15
   ============================================================
   Un test par défaut corrigé. Chacun ÉCHOUAIT avant la correction : c'est
   la seule façon de garantir qu'un de ces bugs ne revienne pas par une
   refonte ultérieure, comme Faut Pas Me Chauffer l'a fait trois fois de
   suite en restant hors du domaine.

   Les points 04 et 14, laissés à l'arbitrage de Nikola, ont été tranchés
   par lui le 2026-08-15 : la case du Titan compte bien dans sa propre
   énergie (règle voulue, aucun changement), et une Piste ADN à 0 vaut
   désormais 0 point. Les deux sont verrouillés ici — le premier pour qu'on
   ne le « corrige » pas par erreur, le second parce que c'est un vrai
   changement de barème.
============================================================ */
import { describe, expect, it } from "vitest";
import {
  computeEnergieParDistance,
  computeEnergyToutCasser,
  getNonPlayedPool,
  getPerimeter,
  applyRestitution,
  classementFinal,
  rankWithTies,
  releverPercussion,
  resolveFatigue,
  resolveFautPasMeChauffer,
  resolveRecuperation,
  resolveToutCasser,
  resolveToutCasserBlocs,
  resolveTeteEnAvant,
} from "../../src/domain/gameRules.js";
import {
  indexerTitans, projectInDirection, rentrerEnJeu,
  resolveBoingBoing, getEcroulementCells, resolveEcroulementAmas,
} from "../../src/domain/gameRules.js";
import { candidatsPourCarte } from "../../src/domain/aiPlanner.js";
import { evaluatePosition, makeProfile, FORCES } from "../../src/domain/aiEvaluation.js";
import { jouerPartie, lancerCampagne } from "../../src/domain/simulation.js";
import { verifierHygiene, verifierInvariants } from "../../src/domain/invariants.js";
import { setSeed } from "../../src/domain/rng.js";

const bat = (row, col, blocks) => ({ row, col, blocks: [...blocks], socle: blocks.length, isTeleporter: false });
const titan = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], bagarre: 0, destruction: 0, adrenaline: 0,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [], ...extra,
});

describe("05 · l'Adrénaline compte en entier dans l'énergie", () => {
  it("deux Adrénaline valent +2, pas +1", () => {
    expect(computeEnergieParDistance(3, 0, 1)).toBe(3);
    expect(computeEnergieParDistance(3, 1, 1)).toBe(4);
    // Lue en booléen, cette valeur retombait à 4 : la 2e Adrénaline
    // allongeait la portée sans rien ajouter à l'énergie.
    expect(computeEnergieParDistance(3, 2, 1)).toBe(5);
  });

  it("une charge de 5 cases avec 2 Adrénaline atteint encore le Seuil 4", () => {
    setSeed(2);
    const etat = {
      board: { A5: bat("A", 5, ["bleu", "rose", "orange"]) },
      looseBlocks: {},
      titans: [titan(1, "F5")],
    };
    resolveTeteEnAvant(1, -1, 0, 2, etat);
    // Énergie à distance 5 = 3 + 2 - 4 = 1... mais le bâtiment est atteint
    // à distance 5, et le Titan ramasse 1 bloc. Ce qui compte ici, c'est
    // que l'énergie ne soit plus amputée : le Repaire reçoit son bloc.
    expect(etat.titans[0].repaire.length).toBe(1);
  });
});

describe("03 · Tout Casser tient une seule énergie pour toute la carte", () => {
  const scene = () => ({
    board: {
      D4: bat("D", 4, ["bleu"]),
      D6: bat("D", 6, ["bleu"]),
      F4: bat("F", 4, ["bleu"]),
      F6: bat("F", 6, ["bleu"]),
    },
    looseBlocks: {},
    titans: [titan(1, "E5"), titan(2, "D5", { repaire: ["bleu", "rose"] })],
  });

  it("le sous-cas Titan garde le verdict RAGE de la percussion", () => {
    setSeed(1);
    const etat = scene();
    const res = resolveToutCasser(1, etat);
    // 4 bâtiments + le Titan adverse + sa propre case = énergie 6.
    // Les bâtiments d'1 étage tombent au premier sous-cas : l'énergie
    // recalculée derrière valait 2, et la carte basculait en DIL.
    expect(res.seuil4).toBe(true);
    expect(res.decisions.map((d) => d.type)).toContain("RAGE");
  });

  it("un débris tombé pendant la carte n'est pas reprojeté par elle", () => {
    setSeed(1);
    const etat = {
      board: {},
      looseBlocks: { D5: ["rouge"] },
      titans: [titan(1, "E5")],
    };
    // Relevé volontairement vide : c'est l'état « aucun débris à la
    // percussion ». Le bloc présent en D5 ne doit donc pas bouger, même
    // s'il est bien dans le Périmètre au moment de l'appel.
    const percussion = { energie: 6, seuil4: true, blocs: new Set(), amas: new Set() };
    resolveToutCasserBlocs(1, etat, 0, percussion);
    expect(etat.looseBlocks.D5).toEqual(["rouge"]);
  });

  it("le relevé de percussion photographie bien les cibles", () => {
    const etat = {
      board: {},
      looseBlocks: { D5: ["rouge"], D4: ["bleu", "rose"] },
      titans: [titan(1, "E5")],
    };
    const p = releverPercussion(1, etat, 0);
    expect([...p.blocs].sort()).toEqual(["D4", "D5"]);
    expect([...p.amas]).toEqual(["D4"]);
  });
});

describe("02 et 07 · Faut Pas Me Chauffer, résolue par le domaine", () => {
  it("l'initiateur n'est jamais poussé par sa propre carte", () => {
    setSeed(7);
    const attaquant = titan(1, "B5", { programmed: ["je_ne_partage_pas", "faut_pas_me_chauffer", "graouhhh"] });
    const defenseur = titan(2, "A5", { repaire: ["bleu", "rose"] });
    const etat = { board: {}, looseBlocks: {}, titans: [attaquant, defenseur] };

    resolveFautPasMeChauffer(1, 2, 2, etat);
    // La cible rebondit sur le bord haut et revenait percuter l'attaquant,
    // qui se retrouvait expulsé en D5 par son propre coup.
    expect(attaquant.cell).toBe("B5");
  });

  it("une cible qui ne bouge pas rapporte quand même la Bagarre", () => {
    setSeed(7);
    /* ⚠️ RULING RENVERSÉ LE 2026-08-24. Ce test verrouillait l'inverse
       (« immobile = aucun point », ruling du 2026-08-15). Nikola : « pour
       Bagarre, juste je gagne la Bagarre, je gagne 1 case sur la piste,
       déplacement ou non. » C'est précisément ce cas-là qui l'a fait
       remonter : deux combats FPMC gagnés au même tour n'en rapportaient
       qu'un, parce que la seconde cible était coincée.

       Cible coincée entre un bâtiment devant et l'immunité de l'attaquant
       derrière : elle rebondit sur le mur, revient vers l'attaquant, et
       s'arrête juste avant lui — c'est-à-dire sur sa propre case. */
    const attaquant = titan(1, "E4", { programmed: ["faut_pas_me_chauffer"] });
    const defenseur = titan(2, "E5", { repaire: ["bleu", "rose"] });
    const etat = {
      board: { E6: bat("E", 6, ["bleu", "rose"]) },
      looseBlocks: {},
      titans: [attaquant, defenseur],
    };

    resolveFautPasMeChauffer(1, 2, 1, etat);
    expect(defenseur.cell).toBe("E5"); // immobile…
    expect(attaquant.bagarre).toBe(1); // …et la comparaison est gagnée
  });

  it("aucune décision DIL n'est émise sur une cible qui ne peut pas la subir", () => {
    setSeed(9);
    // Sommes égales (mêmes cartes programmées) → DIL. Mais le défenseur n'a
    // qu'une seule couleur : la décision serait invalidable à jamais et
    // bloquerait la partie sur une fenêtre sans issue (bug #9 du tracker).
    const attaquant = titan(1, "B5", { programmed: ["tout_casser"] });
    const defenseur = titan(2, "A5", { programmed: ["tout_casser"], repaire: ["bleu", "bleu"] });
    const etat = { board: {}, looseBlocks: {}, titans: [attaquant, defenseur] };
    const res = resolveFautPasMeChauffer(1, 2, 1, etat);
    expect(res.mode).toBe("DIL");
    expect(res.decisions).toHaveLength(0);
  });
});

describe("09 · l'IA voit Boing Boing sur un Titan", () => {
  it("une case occupée par un adversaire est une destination candidate", () => {
    const etat = { board: {}, looseBlocks: {}, titans: [titan(1, "E5"), titan(2, "E4")] };
    const cands = candidatsPourCarte("boing_boing", 1, etat);
    expect(cands.some((c) => c.bbDest === "E4")).toBe(true);
    // Sa propre case reste exclue : un saut de distance 0 est refusé.
    expect(cands.some((c) => c.bbDest === "E5")).toBe(false);
  });
});

describe("15 · aucune pile vide résiduelle", () => {
  it("la case est supprimée, pas laissée en tableau vide", () => {
    setSeed(4);
    const etat = {
      board: {},
      looseBlocks: { D5: ["rouge"] },
      titans: [titan(1, "E5")],
    };
    resolveRecuperation(1, "D5", etat);
    expect(etat.looseBlocks.D5).toBeUndefined();
    expect(verifierHygiene(etat)).toHaveLength(0);
  });
});

/* ── REMONTÉES DU PREMIER TEST À LA TABLE (2026-08-15) ──────── */

describe("Aucun débris ne se pose sur un bâtiment debout", () => {
  it("un bloc cassé ne retombe pas sur son propre bâtiment", () => {
    setSeed(21);
    // Bâtiment de 3 blocs en I9, coin du plateau. Le Titan frappe depuis
    // H8 : la trajectoire part en diagonale vers le coin et sort du plateau.
    const etat = {
      board: { I9: bat("I", 9, ["bleu", "rose", "orange"]) },
      looseBlocks: {},
      titans: [titan(1, "H8")],
    };
    const landing = projectInDirection("I", 9, 1, 1, 5, {
      board: etat.board, looseBlocks: etat.looseBlocks, titans: etat.titans, log: [], initiatorId: 1,
    });
    const arrivee = landing.row + landing.col;
    const batiment = etat.board[arrivee];
    expect(batiment?.blocks?.length ?? 0).toBe(0);
  });

  it("l'invariant le détecte sur un état construit à la main", () => {
    const etat = {
      board: { C3: bat("C", 3, ["bleu", "rose"]) },
      looseBlocks: { C3: ["orange"] },
      titans: [],
    };
    const v = verifierInvariants(etat, "test");
    expect(v.map((x) => x.regle)).toContain("debris-sur-batiment");
  });

  it("aucune campagne n'en produit", () => {
    const r = lancerCampagne({ parties: 30, nbJoueurs: 4, seed: 3000, verifier: true });
    const regles = Object.values(r.anomalies.invariant?.details || {}).length
      ? Object.keys(r.anomalies.invariant.details).join(" ")
      : "";
    expect(regles).not.toContain("debris-sur-batiment");
    expect(r.anomalies.invariant?.total ?? 0).toBe(0);
  }, 120000);
});

describe("Un Titan poussé hors du plateau sort du ring", () => {
  it("il quitte le plateau et attend son tour, il ne réapparaît pas tout de suite", () => {
    setSeed(31);
    // Cible collée au bord droit, poussée vers la droite avec 2 d'énergie :
    // trop peu pour une faille. Avant le ruling du 2026-08-16 elle
    // rebondissait et revenait VERS l'attaquant, en E8.
    const attaquant = titan(1, "E7");
    const cible = titan(2, "E9");
    const etat = { board: {}, looseBlocks: {}, titans: [attaquant, cible] };
    const landing = projectInDirection("E", 9, 0, 1, 2, {
      board: etat.board, looseBlocks: etat.looseBlocks, titans: etat.titans, log: [],
      initiatorId: 1, movingTitanId: 2,
    });
    expect(landing.ejecte).toBe(true);
    expect(cible.horsPlateau).toBe(true);
    expect(cible.cell).toBe("E1"); // case de RETOUR, pas sa position
    expect(landing.hasBounced).toBe(false);
  });

  it("hors plateau, il n'occupe plus aucune case", () => {
    setSeed(35);
    const cible = titan(2, "E1", { horsPlateau: true });
    const etat = { board: {}, looseBlocks: {}, titans: [titan(1, "E7"), cible] };
    // Sa case de retour n'est pas une case occupée : personne n'est bloqué
    // par un Titan qui n'est pas là.
    expect(indexerTitans(etat.titans).E1).toBeUndefined();
    expect(verifierInvariants(etat, "hors-plateau")
      .filter((v) => v.regle === "titans-superposes")).toHaveLength(0);
  });

  it("il rentre par sa case, au début de son tour", () => {
    const cible = titan(2, "E1", { horsPlateau: true });
    const etat = { board: {}, looseBlocks: {}, titans: [titan(1, "E7"), cible] };
    const retour = rentrerEnJeu(2, etat);
    expect(retour.rentre).toBe(true);
    expect(cible.cell).toBe("E1");
    expect(cible.horsPlateau).toBe(false);
  });

  it("si sa case de retour est prise, il rentre juste à côté sur le même bord", () => {
    // Exemple donné par Nikola : sorti en C9, il rentre par C1 ; si C1 est
    // occupé, alors B1 ou D1.
    const cible = titan(2, "C1", { horsPlateau: true });
    const etat = {
      board: { C1: bat("C", 1, ["bleu", "rose"]) },
      looseBlocks: {},
      titans: [titan(1, "E7"), cible],
    };
    const retour = rentrerEnJeu(2, etat);
    expect(retour.rentre).toBe(true);
    expect(["B1", "D1"]).toContain(cible.cell);
  });

  it("la rentrée coûte toujours 1 déplacement, le détour est gratuit", () => {
    // Précision de Nikola : longer le rebord pour trouver une place ne coûte
    // rien de plus. Seule l'entrée se paie, sur le Mouvement gratuit.
    const direct = titan(2, "E1", { horsPlateau: true });
    const etatDirect = { board: {}, looseBlocks: {}, titans: [titan(1, "E7"), direct] };
    expect(rentrerEnJeu(2, etatDirect).cout).toBe(1);

    const devie = titan(2, "C1", { horsPlateau: true });
    const etatDevie = {
      board: { C1: bat("C", 1, ["bleu"]) },
      looseBlocks: {},
      titans: [titan(1, "E7"), devie],
    };
    const retour = rentrerEnJeu(2, etatDevie);
    expect(retour.cout).toBe(1);
    expect(devie.cell).not.toBe("C1");
  });

  it("il longe le rebord, il ne s'enfonce pas dans le plateau", () => {
    // Colonne 1 bouchée en A1, C1, E1 : sorti en C9, il rentre par C1 —
    // occupée — donc B1 ou D1, jamais une case de la colonne 2.
    const cible = titan(2, "C1", { horsPlateau: true });
    const board = {
      A1: bat("A", 1, ["bleu"]),
      C1: bat("C", 1, ["bleu"]),
      E1: bat("E", 1, ["bleu"]),
    };
    const etat = { board, looseBlocks: {}, titans: [titan(1, "I9"), cible] };
    const retour = rentrerEnJeu(2, etat);
    expect(retour.rentre).toBe(true);
    expect(["B1", "D1"]).toContain(cible.cell);
    expect(Number(cible.cell.slice(1))).toBe(1); // toujours sur le rebord
  });

  it("il rentre même quand tout le rebord est saturé", () => {
    // Ruling Nikola : « il rentre dans tous les cas, sinon c'est trop
    // punitif ». Rebord bouché → on élargit à la case libre la plus proche.
    const cible = titan(2, "E1", { horsPlateau: true });
    const board = {};
    for (const row of ["A", "C", "E", "G", "I"]) {
      board[row + 1] = bat(row, 1, ["bleu", "rose"]);
    }
    const autres = [titan(3, "B1"), titan(4, "D1"), titan(5, "F1")];
    const etat = { board, looseBlocks: {}, titans: [titan(1, "I9"), cible, ...autres] };
    const retour = rentrerEnJeu(2, etat);
    expect(retour.rentre).toBe(true);
    expect(cible.horsPlateau).toBe(false);
    expect(retour.cout).toBe(1);
  });

  it("il ne revient jamais vers l'attaquant", () => {
    setSeed(32);
    const attaquant = titan(1, "E7");
    const cible = titan(2, "E9");
    const etat = { board: {}, looseBlocks: {}, titans: [attaquant, cible] };
    const landing = projectInDirection("E", 9, 0, 1, 3, {
      board: etat.board, looseBlocks: etat.looseBlocks, titans: etat.titans, log: [],
      initiatorId: 1, movingTitanId: 2,
    });
    expect(landing.row + landing.col).not.toBe("E8");
    expect(cible.horsPlateau).toBe(true);
  });

  it("un débris, lui, garde la faille mais ne rebondit plus", () => {
    setSeed(34);
    // Même configuration, mais l'élément projeté est un débris : sous le
    // Seuil 4 il ne sort pas du plateau — et depuis le ruling du
    // 2026-08-18 (fini les rebonds qui repartent en arrière), il s'arrête
    // net sur la case où il se trouve déjà, sans repartir en sens inverse.
    const etat = { board: {}, looseBlocks: {}, titans: [titan(1, "E7")] };
    const landing = projectInDirection("E", 9, 0, 1, 2, {
      board: etat.board, looseBlocks: etat.looseBlocks, titans: etat.titans, log: [], initiatorId: 1,
    });
    expect(landing.hasBounced).toBe(false);
    expect(landing.row + landing.col).toBe("E9");
  });
});

describe("L'IA sait qu'un Titan hors du ring perd son tour", () => {
  it("elle préfère une position où elle est sur le plateau", () => {
    const surPlateau = {
      board: {}, looseBlocks: {},
      titans: [titan(1, "E5", { repaire: ["bleu"] }), titan(2, "A1")],
    };
    const ejecte = {
      board: {}, looseBlocks: {},
      titans: [titan(1, "E5", { repaire: ["bleu"], horsPlateau: true }), titan(2, "A1")],
    };
    const profil = makeProfile(FORCES.CONFIRME);
    expect(evaluatePosition(1, ejecte, profil)).toBeLessThan(evaluatePosition(1, surPlateau, profil));
  });

  it("l'Expert valorise d'avoir sorti un adversaire", () => {
    const normal = {
      board: {}, looseBlocks: {},
      titans: [titan(1, "E5", { repaire: ["bleu"] }), titan(2, "A1", { repaire: ["bleu"] })],
    };
    const adversaireDehors = {
      board: {}, looseBlocks: {},
      titans: [titan(1, "E5", { repaire: ["bleu"] }), titan(2, "A1", { repaire: ["bleu"], horsPlateau: true })],
    };
    const expert = makeProfile(FORCES.EXPERT);
    expect(evaluatePosition(1, adversaireDehors, expert)).toBeGreaterThan(evaluatePosition(1, normal, expert));
  });
});

describe("Boing Boing sur un Amas — répartition au choix", () => {
  it("le résolveur rend la main au lieu de distribuer tout seul", () => {
    setSeed(41);
    const etat = {
      board: {},
      looseBlocks: { E6: ["bleu", "rose", "orange"] },
      titans: [titan(1, "E5")],
    };
    const res = resolveBoingBoing(1, "E6", 0, 1, etat);
    expect(res.applied).toBe(true);
    expect(res.ecroulement.blocs).toHaveLength(3);
    expect(res.ecroulement.cellKey).toBe("E6");
    /* REGLE REVISEE LE 2026-08-19 : atterrir coute 1, meme sur un obstacle.
       E6 est donc a distance 1 et non plus 0, et il reste 2 d'energie au lieu
       de 3. C'est la contrepartie assumee de la correction du « 4e saut » :
       on ne peut plus enchainer les debris gratuitement, mais chaque saut
       coute aussi 1 d'energie a l'arrivee. */
    expect(res.ecroulement.energie).toBe(2);
    expect(etat.titans[0].cell).toBe("E6");
  });

  it("on ne peut empiler que lorsqu'il ne reste plus de case vierge", () => {
    const etat = { board: {}, looseBlocks: {}, titans: [titan(1, "E6")] };
    const { libres, eligibles } = getEcroulementCells("E6", etat, []);
    expect(libres.length).toBe(8);
    expect(eligibles).toEqual(libres);
    // Une fois les 8 servies, l'empilement devient la seule option.
    const apres = getEcroulementCells("E6", etat, libres);
    expect(apres.libres).toHaveLength(0);
    expect(apres.eligibles).toHaveLength(8);
  });

  it("jamais sur un bâtiment debout", () => {
    const etat = {
      board: { E7: bat("E", 7, ["bleu"]), G5: bat("G", 5, ["rose"]) },
      looseBlocks: {},
      titans: [titan(1, "E6")],
    };
    const { eligibles } = getEcroulementCells("E6", etat, []);
    expect(eligibles).not.toContain("E7");
    expect(eligibles).not.toContain("G5");
  });

  it("une case portant un Titan adverse reste choisissable", () => {
    const etat = { board: {}, looseBlocks: {}, titans: [titan(1, "E6"), titan(2, "E7")] };
    expect(getEcroulementCells("E6", etat, []).eligibles).toContain("E7");
  });

  it("un débris posé sur un Titan le pousse et rapporte la Bagarre", () => {
    setSeed(42);
    const attaquant = titan(1, "E6");
    const cible = titan(2, "E7");
    const etat = { board: {}, looseBlocks: { E6: ["bleu"] }, titans: [attaquant, cible] };
    const res = resolveEcroulementAmas(1, { cellKey: "E6", blocs: ["bleu"], energie: 2 }, ["E7"], etat);
    expect(res.applied).toBe(true);
    expect(cible.cell).not.toBe("E7");       // poussé dans l'axe E6 → E7
    expect(attaquant.bagarre).toBe(1);
    expect(etat.looseBlocks.E7).toEqual(["bleu"]); // le débris, lui, reste
  });

  it("désigner deux fois la même case est refusé tant qu'il reste de la place", () => {
    setSeed(43);
    const attaquant = titan(1, "E6");
    const cible = titan(2, "E7");
    const etat = { board: {}, looseBlocks: { E6: ["bleu", "rose"] }, titans: [attaquant, cible] };
    const res = resolveEcroulementAmas(1, { cellKey: "E6", blocs: ["rose", "bleu"], energie: 2 }, ["E7", "E7"], etat);
    // Le second choix n'est pas éligible : E7 vient d'être servie et sept
    // cases vierges restent disponibles.
    expect(res.log.join(" ")).toContain("n'est pas une case valide");
    expect(etat.looseBlocks.E7).toHaveLength(1);
  });

  it("un Titan touché deux fois ne rapporte qu'une Bagarre", () => {
    setSeed(44);
    // Deux débris, deux cases distinctes. Le premier pousse la cible, le
    // second tombe ailleurs. Même si la chaîne la touchait à nouveau, la
    // Bagarre reste comptée une seule fois par Titan distinct (FAQ #12).
    const attaquant = titan(1, "E6");
    const cible = titan(2, "E7");
    const etat = { board: {}, looseBlocks: { E6: ["bleu", "rose"] }, titans: [attaquant, cible] };
    resolveEcroulementAmas(1, { cellKey: "E6", blocs: ["rose", "bleu"], energie: 2 }, ["E7", "D6"], etat);
    expect(attaquant.bagarre).toBe(1);
    expect(etat.looseBlocks.D6).toEqual(["bleu"]);
  });
});

describe("Faille spatio-temporelle", () => {
  it("l'élément ressort du côté opposé, il ne revient pas sur sa case de départ", () => {
    setSeed(22);
    // Plateau vide : depuis I9 en diagonale bas-droite avec 5 d'énergie,
    // l'élément sort par le coin et doit réapparaître en A1, puis continuer.
    const etat = { board: {}, looseBlocks: {}, titans: [titan(1, "H8")] };
    const landing = projectInDirection("I", 9, 1, 1, 5, {
      board: etat.board, looseBlocks: etat.looseBlocks, titans: etat.titans, log: [], initiatorId: 1,
    });
    const arrivee = landing.row + landing.col;
    // Le symptôme remonté par Nikola : l'élément « finissait » sur I9,
    // c'est-à-dire là d'où il était parti, à l'autre bout de sa trajectoire.
    expect(arrivee).not.toBe("I9");
  });

  it("l'élément qui ressort tape ce qu'il rencontre, et s'arrête de ce côté-là", () => {
    setSeed(23);
    // Ruling Nikola : « si Seuil 4 atteint il warp, tape l'élément qu'il
    // rencontre, prend la place si la case devient libre, sinon adjacente
    // à celle-ci et arrêt ». A1 tient encore debout après le coup, donc
    // l'élément se pose à côté de A1 — jamais de retour à l'autre bout.
    const etat = {
      board: { A1: bat("A", 1, ["bleu", "rose", "orange", "rouge"]) },
      looseBlocks: {},
      titans: [titan(1, "H8")],
    };
    const landing = projectInDirection("I", 9, 1, 1, 5, {
      board: etat.board, looseBlocks: etat.looseBlocks, titans: etat.titans, log: [], initiatorId: 1,
    });
    const arrivee = landing.row + landing.col;
    expect(etat.board.A1.blocks).toHaveLength(3); // 1 bloc cassé au Seuil 4
    expect(arrivee).not.toBe("I9");               // pas de retour à l'origine
    // Il s'immobilise sur A1 ou juste à côté, du bon côté du plateau.
    const r = "ABCDEFGHI".indexOf(arrivee[0]);
    const c = Number(arrivee.slice(1));
    expect(Math.max(Math.abs(r - 0), Math.abs(c - 1))).toBeLessThanOrEqual(1);
  });

  it("la case libérée par le coup revient à l'élément", () => {
    setSeed(24);
    // A1 n'a qu'un bloc : le Seuil 4 le fait tomber, la case devient un
    // couloir, l'élément y prend place (normalisation demandée par Nikola).
    const etat = {
      board: { A1: bat("A", 1, ["bleu"]) },
      looseBlocks: {},
      titans: [titan(1, "H8")],
    };
    const landing = projectInDirection("I", 9, 1, 1, 5, {
      board: etat.board, looseBlocks: etat.looseBlocks, titans: etat.titans, log: [], initiatorId: 1,
    });
    expect(etat.board.A1.blocks).toHaveLength(0);
    expect(landing.row + landing.col).toBe("A1");
  });
});

/* ── RULINGS DE NIKOLA DU 2026-08-15 ────────────────────────── */

describe("04 · la case du Titan compte dans sa propre énergie", () => {
  it("un Titan seul sur un plateau vide a une énergie de 1", () => {
    // « Notre propre Titan compte pour 1 pour le seuil dans le périmètre,
    // on inclut sa case. » Règle voulue : ce test existe pour qu'un
    // prochain nettoyage ne la prenne pas pour une erreur de comptage.
    const energie = computeEnergyToutCasser(getPerimeter("E", 5), {}, { E5: 1 });
    expect(energie).toBe(1);
  });

  it("le Seuil 4 est atteint avec 3 cases occupées autour de soi", () => {
    const board = {
      D4: bat("D", 4, ["bleu"]),
      D6: bat("D", 6, ["bleu"]),
      F4: bat("F", 4, ["bleu"]),
    };
    const energie = computeEnergyToutCasser(getPerimeter("E", 5), board, { E5: 1 });
    expect(energie).toBe(4); // 3 bâtiments + sa propre case
  });
});

describe("14 · une Piste ADN à 0 vaut 0", () => {
  it("trois Titans sans la moindre Bagarre ne marquent rien", () => {
    // À 3 Titans, ils étaient tous ex aequo au 3e rang, qui vaut 1 point :
    // chacun repartait avec 1 point pour n'avoir rien fait.
    const r = rankWithTies([{ id: 1, value: 0 }, { id: 2, value: 0 }, { id: 3, value: 0 }]);
    expect(r).toEqual({ 1: 0, 2: 0, 3: 0 });
  });

  it("le classement des autres n'est pas modifié", () => {
    const r = rankWithTies([{ id: 1, value: 5 }, { id: 2, value: 2 }, { id: 3, value: 0 }]);
    expect(r).toEqual({ 1: 7, 2: 3, 3: 0 });
  });

  it("une égalité en tête garde la règle du rang le plus bas", () => {
    const r = rankWithTies([{ id: 1, value: 4 }, { id: 2, value: 4 }, { id: 3, value: 1 }]);
    expect(r).toEqual({ 1: 3, 2: 3, 3: 1 }); // les deux premiers prennent le 2e rang
  });
});

describe("Fatigue · cartes non jouées, indisponibles la Manche suivante", () => {
  it("ne pioche que dans la main, jamais dans la Manche en cours", () => {
    const cible = titan(2, "E5", {
      hand: ["tout_casser", "graouhhh"],
      programmed: ["boing_boing"],          // engagée dans la Manche en cours
      playedThisManche: ["tete_en_avant"],
      discardedHidden: ["je_ne_partage_pas"],
    });
    // Ruling re-précisé par Nikola le 2026-08-15 après test à la table : les
    // 3 cartes de la Manche en cours sont intouchables, y compris celles qui
    // ne sont pas encore résolues. Amputer une Manche en cours était le bug.
    expect(getNonPlayedPool(cible).sort()).toEqual(["graouhhh", "tout_casser"]);
    expect(getNonPlayedPool(cible)).not.toContain("boing_boing");
  });

  it("une Fatigue ne retire jamais une carte programmée", () => {
    setSeed(11);
    const cible = titan(2, "E5", {
      hand: ["tout_casser"],
      programmed: ["boing_boing", "graouhhh", "tete_en_avant"],
    });
    resolveFatigue(1, 2, 3, [cible]);
    // Les 3 cartes de la Manche sont toujours là : le Titan pourra finir
    // ses 3 tours. C'est très exactement ce qui cassait en test réel.
    expect(cible.programmed).toHaveLength(3);
    expect(cible.hand).toHaveLength(0);
  });

  it("la carte reste indisponible pendant toute la Manche suivante", () => {
    setSeed(3);
    const cible = titan(2, "E5", { hand: ["tout_casser"], programmed: [], playedThisManche: [] });
    const res = resolveFatigue(1, 2, 4, [cible]); // Fatigue subie en Manche 4
    expect(res.ok).toBe(true);
    expect(cible.hand).toHaveLength(0);

    // Passage en Manche 5 : la carte NE revient PAS, c'est tout l'objet
    // de la règle — elle n'est pas jouable pour la Manche à venir.
    applyRestitution(cible, 5);
    expect(cible.hand).toHaveLength(0);
    expect(cible.repos).toHaveLength(1);

    // Passage en Manche 6 : elle revient en main, chez son propriétaire.
    applyRestitution(cible, 6);
    expect(cible.hand).toEqual(["tout_casser"]);
    expect(cible.repos).toHaveLength(0);
  });
});

describe("Départage d'une égalité parfaite", () => {
  const totaux = (map) => Object.fromEntries(Object.entries(map).map(([id, total]) => [id, { total }]));

  it("le score total prime sur tout", () => {
    const joueurs = [titan(1, "A1", { adrenaline: 0 }), titan(2, "A2", { adrenaline: 9 })];
    const c = classementFinal(joueurs, totaux({ 1: 50, 2: 40 }));
    expect(c[0].id).toBe(1);
    expect(c[0].exAequo).toBe(false);
  });

  it("à score égal, le plus d'Adrénaline l'emporte", () => {
    const joueurs = [titan(1, "A1", { adrenaline: 1 }), titan(2, "A2", { adrenaline: 3 })];
    const c = classementFinal(joueurs, totaux({ 1: 50, 2: 50 }));
    expect(c[0].id).toBe(2);
  });

  it("puis le Socle de la plus haute valeur", () => {
    // Même total, même Adrénaline. Le Titan 1 a plus de socles EN NOMBRE,
    // mais c'est la plus haute VALEUR qui départage, et elle est au 2.
    const joueurs = [
      titan(1, "A1", { adrenaline: 2, socles: [1, 1, 2] }),
      titan(2, "A2", { adrenaline: 2, socles: [4] }),
    ];
    const c = classementFinal(joueurs, totaux({ 1: 50, 2: 50 }));
    expect(c[0].id).toBe(2);
  });

  it("puis la Force totale des cartes non jouées", () => {
    // Tout est égal jusque-là. Le Titan 2 garde en main des cartes plus
    // fortes : Je Ne Partage Pas et Faut Pas Me Chauffer valent 3 chacune,
    // Tout Casser ne vaut que 1.
    // « Carte non jouée » a le même sens ici que pour la Fatigue : ce qui
    // est en main. En fin de partie la question est de toute façon théorique,
    // les 3 cartes de la dernière Manche ayant toutes été résolues.
    const joueurs = [
      titan(1, "A1", { adrenaline: 2, socles: [3], hand: ["tout_casser"] }),
      titan(2, "A2", { adrenaline: 2, socles: [3], hand: ["je_ne_partage_pas", "faut_pas_me_chauffer"] }),
    ];
    const c = classementFinal(joueurs, totaux({ 1: 50, 2: 50 }));
    expect(c[0].id).toBe(2);
    expect(c[0].forceNonJouee).toBe(6);
    expect(c[1].forceNonJouee).toBe(1);
  });

  it("une égalité que rien ne départage est signalée, pas tranchée au hasard", () => {
    const joueurs = [
      titan(1, "A1", { adrenaline: 2, socles: [3], hand: ["graouhhh"] }),
      titan(2, "A2", { adrenaline: 2, socles: [3], hand: ["boing_boing"] }), // même Force 2
    ];
    const c = classementFinal(joueurs, totaux({ 1: 50, 2: 50 }));
    expect(c[0].exAequo).toBe(true);
    expect(c[1].exAequo).toBe(true);
  });
});

describe("08 · les fins de partie plateau arrêtent réellement la partie", () => {
  it("une partie rapporte sa durée réelle et sa cause d'arrêt", () => {
    const r = jouerPartie({ nbJoueurs: 4, seed: 1042 });
    expect(r.manchesJouees).toBeGreaterThanOrEqual(1);
    expect(r.manchesJouees).toBeLessThanOrEqual(4);
    expect(Array.isArray(r.raisonsFin)).toBe(true);
    expect(r.raisonsFin.length).toBeGreaterThan(0);
  });

  it("un seuil d'Apocalypse très haut coupe la partie dès la Manche 1", () => {
    // 24 bâtiments debout ou moins = fin. La condition est vraie d'emblée :
    // la partie doit s'arrêter à la fin de la première Manche.
    const r = jouerPartie({ nbJoueurs: 4, seed: 7, apocalypseThreshold: 24 });
    expect(r.manchesJouees).toBe(1);
    expect(r.raisonsFin.join(" ")).toContain("Apocalypse");
  });
});
