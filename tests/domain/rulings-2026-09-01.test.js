import { describe, expect, it } from "vitest";
import {
  appliquerReplElement,
  isLanterneRouge,
  getJeNePartagePasCount,
  rendreCartesEmpruntees,
  projectInDirection,
} from "../../src/domain/gameRules.js";

/* ============================================================
   PROJET TITAN — Rulings et correctifs du 2026-09-01
   ============================================================
   Quatre points remontés par Nikola après une partie à distance jouée sur
   téléphone. Ils touchent le moteur, et c'est ce fichier qui les tient ; le
   reste de sa liste était de l'interface.

   Chaque bloc rappelle la phrase d'origine, parce que c'est elle qui décide du
   comportement attendu — pas ma reformulation.
============================================================ */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [],
  repos: [], empruntees: [],
  ...extra,
});

describe("« Même un rebond pousse un Titan »", () => {
  /* Un élément arrêté faute de puissance — ce que le jeu appelle un rebond —
     se pose sur une case adjacente choisie par l'initiateur. La poussée de
     l'occupant était réservée au repli qui déplace un TITAN ; un DÉBRIS se
     contentait de se poser par-dessus lui. Or c'est précisément le geste que
     le repli offensif existe pour permettre : « il y avait un Titan en A2,
     j'aurais aimé le mettre en A2 pour le faire sortir » (2026-08-19). */

  it("un repli de DÉBRIS chasse le Titan qui occupe la case visée", () => {
    const titans = [t(2, "B8"), t(3, "E5")];
    const looseBlocks = { B9: ["bleu"] };
    const repli = { titanId: null, defaut: "B9", cases: ["B9", "B8"], cible: "C9", initiatorId: 3 };

    const res = appliquerReplElement(repli, "B8", { board: {}, looseBlocks, titans });

    expect(res.applied).toBe(true);
    expect(titans[0].cell).not.toBe("B8");     // l'occupant a bien été poussé
    expect(looseBlocks.B8).toEqual(["bleu"]);  // et le débris a pris sa place
    expect(looseBlocks.B9).toBeUndefined();    // la case de départ s'est vidée
    expect(titans[1].bagarre).toBe(1);         // l'initiateur marque sa Bagarre
  });

  it("le repli d'un TITAN garde son comportement d'origine", () => {
    // Garde-fou de non-régression : la poussée existait déjà ici, et c'est le
    // seul cas que le code couvrait. Il ne doit pas bouger.
    const titans = [t(1, "B9"), t(2, "B8"), t(3, "E5")];
    const repli = { titanId: 1, defaut: "B9", cases: ["B9", "B8"], cible: "C9", initiatorId: 3 };

    const res = appliquerReplElement(repli, "B8", { board: {}, looseBlocks: {}, titans });

    expect(res.applied).toBe(true);
    expect(titans[0].cell).toBe("B8");
    expect(titans[1].cell).not.toBe("B8");
  });
});

describe("« On rend forcément la carte au Titan à la fin de la Manche suivante »", () => {
  /* Nikola : « j'ai 7 cartes en main dont 2 doubles, ce n'est pas possible ».
     Une carte empruntée peut atterrir dans la Zone Repos du VOLEUR — une
     Fatigue subie pioche dans sa main, où l'emprunt se trouve justement. La
     restitution ne fouillait pas cette liste, et vidait quand même l'ardoise :
     la carte revenait ensuite au voleur pour de bon, et l'écart entre les deux
     mains ne se refermait plus jamais. */

  it("retrouve une carte empruntée partie en Zone Repos du voleur", () => {
    const voleur = t(1, "A1", {
      hand: ["tout_casser"],
      repos: [{ cardId: "graouhhh", faceUp: false, returnAtManche: 4 }],
      empruntees: [{ cardId: "graouhhh", proprietaire: 2 }],
    });
    const proprietaire = t(2, "B2", { hand: [] });

    rendreCartesEmpruntees([voleur, proprietaire]);

    expect(proprietaire.hand).toEqual(["graouhhh"]);
    expect(voleur.repos).toHaveLength(0);
    expect(voleur.empruntees).toHaveLength(0);
  });

  it("garde la dette ouverte quand la carte reste introuvable", () => {
    /* Une dette effacée sans que la carte soit rendue, c'est une carte perdue
       pour son propriétaire et gagnée par le voleur. On préfère réessayer à la
       Phase Repos suivante. */
    const voleur = t(1, "A1", {
      hand: [],
      empruntees: [{ cardId: "boing_boing", proprietaire: 2 }],
    });
    const proprietaire = t(2, "B2", { hand: [] });

    rendreCartesEmpruntees([voleur, proprietaire]);

    expect(proprietaire.hand).toHaveLength(0);
    expect(voleur.empruntees).toEqual([{ cardId: "boing_boing", proprietaire: 2 }]);
  });

  it("le cas courant ne change pas : la carte en main retourne à son propriétaire", () => {
    const voleur = t(1, "A1", {
      hand: ["tete_en_avant", "graouhhh"],
      empruntees: [{ cardId: "graouhhh", proprietaire: 2 }],
    });
    const proprietaire = t(2, "B2", { hand: ["tout_casser"] });

    rendreCartesEmpruntees([voleur, proprietaire]);

    expect(voleur.hand).toEqual(["tete_en_avant"]);
    expect(proprietaire.hand).toEqual(["tout_casser", "graouhhh"]);
    expect(voleur.empruntees).toHaveLength(0);
  });
});

describe("« Les égalités en Lanterne Rouge — on coche ou pas »", () => {
  const troisEgaux = () => [
    t(1, "A1", { repaire: ["bleu"] }),
    t(2, "B2", { repaire: ["bleu"] }),
    t(3, "C3", { repaire: ["bleu", "rose", "rouge"] }),
  ];

  it("par défaut, l'égalité vaut Lanterne Rouge — la règle historique", () => {
    const titans = troisEgaux();
    expect(isLanterneRouge(1, { titans })).toBe(true);
    expect(isLanterneRouge(2, { titans })).toBe(true);
    expect(getJeNePartagePasCount(1, { titans })).toBe(3);
  });

  it("réglage décoché : il faut être SEUL dernier", () => {
    const titans = troisEgaux();
    const jeu = { titans, egalitesLanterneRouge: false };
    expect(isLanterneRouge(1, jeu)).toBe(false);
    expect(isLanterneRouge(2, jeu)).toBe(false);
    expect(getJeNePartagePasCount(1, jeu)).toBe(2);
  });

  it("réglage décoché : le seul dernier garde son bonus", () => {
    const titans = [
      t(1, "A1", { repaire: [] }),
      t(2, "B2", { repaire: ["bleu"] }),
      t(3, "C3", { repaire: ["bleu", "rose"] }),
    ];
    const jeu = { titans, egalitesLanterneRouge: false };
    expect(isLanterneRouge(1, jeu)).toBe(true);
    expect(isLanterneRouge(2, jeu)).toBe(false);
    expect(getJeNePartagePasCount(1, jeu)).toBe(3);
  });
});

describe("« J'ai envoyé un Titan en dehors — il manquait la traînée »", () => {
  it("une éjection hors de BIG CITY enregistre sa trajectoire, case de rentrée comprise", () => {
    /* Le `return` anticipé de l'éjection court-circuitait l'enregistrement de
       la trajectoire, qui vit en fin de fonction : le seul vol vraiment
       spectaculaire du jeu était le seul qu'on ne voyait pas passer. La case de
       RENTRÉE en fait partie — c'est là que le Titan réapparaîtra, et personne
       ne pouvait le deviner. */
    const titans = [t(1, "E2")];
    const trajectoires = [];
    const res = projectInDirection("E", 2, 0, -1, 5, {
      board: {}, looseBlocks: {}, titans, trajectoires, movingTitanId: 1, initiatorId: 3,
    });

    expect(res.ejecte).toBe(true);
    expect(trajectoires).toHaveLength(1);
    expect(trajectoires[0].titanId).toBe(1);
    expect(trajectoires[0].ejecte).toBe(true);
    // Sortie par l'ouest : il rentrera par la colonne 9, sur sa propre ligne.
    expect(trajectoires[0].arrivee).toBe("E9");
    expect(trajectoires[0].cases[0]).toBe("E2");
    expect(trajectoires[0].cases.at(-1)).toBe("E9");
  });
});
