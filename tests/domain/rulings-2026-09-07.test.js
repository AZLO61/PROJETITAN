import { describe, expect, it } from "vitest";
import {
  projectInDirection,
  resolveBoingBoing,
  resolveToutCasser,
} from "../../src/domain/gameRules.js";

/* ============================================================
   PROJET TITAN — Rulings et correctifs du 2026-09-07
   ============================================================
   Retours de Nikola après plusieurs parties. Chaque bloc rappelle la phrase
   d'origine : c'est elle qui décide du comportement attendu, pas sa
   reformulation.

   Les points d'INTERFACE de la même liste (décompte sur la traînée, filtre du
   journal par Manche, animation de l'Arc-en-ciel, Force en cours de
   présélection) ne se testent pas ici — ils vivent dans les composants.
============================================================ */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [],
  repos: [], empruntees: [],
  ...extra,
});

const mur = () => ({ blocks: ["bleu", "bleu"], socle: 2 });

describe("Boing Boing : « la projection vaut la distance restante de ton saut »", () => {
  /* Nikola : « il était à 2 cases, quand je suis arrivé dessus c'était la 2e
     case, donc il aurait dû être déplacé de 1 case en plus sans Adrénaline ;
     pourtant il a été déplacé de 2 cases. »

     C'est la note du livret, carte 04, mot pour mot. Le résolveur projetait
     avec l'ÉNERGIE (`3 + Adrénaline − (distance − 1)`), qui ne vaut jamais la
     même chose. L'énergie garde son rôle : elle décide du Seuil 4, donc de DIL
     ou RAGE. */

  it("sur une cible à 2 cases, la cible recule d'UNE case", () => {
    const titans = [t(1, "E5"), t(2, "E7")];
    const gs = { board: {}, titans, looseBlocks: {}, replis: [], trajectoires: [] };

    resolveBoingBoing(1, "E7", 0, 1, gs);

    // Portée 3, distance 2 → il reste 1 case de saut.
    expect(titans[1].cell).toBe("E8");
    expect(titans[0].cell).toBe("E7"); // le sauteur prend la place
  });

  it("sur une cible adjacente, elle recule de DEUX cases", () => {
    const titans = [t(1, "E5"), t(2, "E6")];
    const gs = { board: {}, titans, looseBlocks: {}, replis: [], trajectoires: [] };

    resolveBoingBoing(1, "E6", 0, 1, gs);

    expect(titans[1].cell).toBe("E8"); // 3 − 1 = 2 cases restantes
  });

  it("en bout de portée, elle recule quand même d'une case", () => {
    // Deux Titans ne partagent jamais une case : le minimum est 1, même quand
    // le saut ne laisse rien.
    const titans = [t(1, "E5"), t(2, "E8")];
    const gs = { board: {}, titans, looseBlocks: {}, replis: [], trajectoires: [] };

    resolveBoingBoing(1, "E8", 0, 1, gs);

    expect(titans[1].cell).toBe("E9");
    expect(titans[0].cell).toBe("E8");
  });
});

describe("Boing Boing : la percussion part dans l'axe du DERNIER bond", () => {
  /* Nikola : « Chemin : F6 → E5 · 2/3, Titan en E5 déplacé en C4 […] mais
     panneau qui me demande de bouger aussi celui de F4 alors que je ne le
     touche pas. »

     Le joueur trace son saut case par case depuis le 2026-08-18 ; la direction
     était pourtant toujours calculée du point de DÉPART à la destination. Un
     chemin coudé envoyait donc la cible sur un axe qui n'est celui d'aucun des
     deux bonds — et lui faisait croiser des Titans jamais approchés. */

  it("un chemin coudé pousse la cible dans l'axe du dernier segment", () => {
    // Départ E5, on passe par D5, puis on saute plein est sur D6 occupé.
    // Sans le chemin, la direction serait E5 → D6, une diagonale nord-est.
    const titans = [t(1, "E5"), t(2, "D6")];
    const gs = {
      board: {}, titans, looseBlocks: {}, replis: [], trajectoires: [],
      chemin: ["D5", "D6"],
    };

    resolveBoingBoing(1, "D6", 0, 1, gs);

    // La cible part plein est, sur sa propre rangée.
    expect(titans[1].cell[0]).toBe("D");
  });

  it("sans chemin fourni, on retombe sur la case de départ", () => {
    // C'est ce que font l'IA, le simulateur et les tests écrits avant ce jour :
    // le comportement doit rester exactement celui d'avant.
    const titans = [t(1, "E5"), t(2, "D6")];
    const gs = { board: {}, titans, looseBlocks: {}, replis: [], trajectoires: [] };

    resolveBoingBoing(1, "D6", 0, 1, gs);

    // E5 → D6 est une diagonale nord-est : la cible continue dessus, donc elle
    // change de rangée ET de colonne.
    expect(titans[1].cell[0]).not.toBe("D");
  });
});

describe("« Un Titan coincé garde son choix de case »", () => {
  /* Nikola, deux fois dans la même session : « un débris aurait dû pousser mon
     Titan, il ne l'a pas fait ; juste après il a tapé un bâtiment, le débris a
     rebondi sur ma case et moi je n'ai pas bougé » puis « il a rebondi
     automatiquement sur la case d'où il venait alors que j'aurais dû avoir le
     choix comme d'habitude ».

     La géométrie du repli n'offre que la charnière entre la case de départ et
     la case visée : rien du tout dès que ces voisines portent un bâtiment. On
     s'aligne sur ce que Boing Boing fait déjà pour un occupant coincé — toutes
     ses cases libres adjacentes, au choix de l'attaquant. */

  it("le Titan plaqué contre un mur reçoit un repli sur ses cases libres", () => {
    // T1 en E5 joue Tout Casser. Le débris de E4 part vers l'ouest, percute T2
    // en E3, qui ne peut pas reculer : E2 est un bâtiment debout.
    const board = { E2: mur() };
    const titans = [t(1, "E5"), t(2, "E3")];
    const looseBlocks = { E4: ["rouge"] };
    const replis = [];
    const gs = { board, titans, looseBlocks, replis, trajectoires: [] };

    resolveToutCasser(1, gs, 0);

    const sien = replis.find((r) => r.titanId === 2);
    expect(sien).toBeTruthy();
    expect(sien.defaut).toBe("E3");                // il n'a pas bougé
    expect(sien.cases.length).toBeGreaterThan(1);  // il a un vrai choix
    expect(sien.cases).toContain("E3");            // rester est toujours possible
    expect(sien.initiatorId).toBe(1);
    // Et le débris a bien pris sa case, comme le veut le ruling du 2026-09-03.
    expect(looseBlocks.E3).toEqual(["rouge"]);
  });
});

describe("« C'est une action d'une attaque qui l'a fait se déplacer »", () => {
  /* Un Titan qu'une attaque a mis en mouvement bouscule ce qu'il rencontre,
     sans aucune condition d'énergie — débris isolé comme tas. Le détail des
     deux cas est couvert par `rulings-2026-08-28-bascule.test.js` ; on vérifie
     ici que la chaîne complète tient : le débris chassé s'en va vraiment, et
     le Titan prend sa place. */

  it("le débris part et le Titan poussé occupe la case", () => {
    const titans = [t(2, "E4")];
    const looseBlocks = { E5: ["rose"] };
    const gs = { board: {}, titans, looseBlocks, replis: [], trajectoires: [] };

    const arrivee = projectInDirection("E", 4, 0, 1, 1, {
      ...gs, movingTitanId: 2, initiatorId: 1,
    });

    expect(arrivee.row + arrivee.col).toBe("E5");
    expect(looseBlocks.E5).toBeUndefined();
    expect(looseBlocks.E6).toEqual(["rose"]);
  });
});
