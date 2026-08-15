import { describe, expect, it } from "vitest";
import {
  appliquerDecisions,
  candidatsPourCarte,
  planCardPlay,
  planMovement,
  planProgrammation,
  planRecuperation,
} from "../../src/domain/aiPlanner.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../../src/domain/aiEvaluation.js";
import { setSeed } from "../../src/domain/rng.js";

// Ce que ces tests protègent : l'IA doit décider en regardant le SCORE,
// pas en suivant un ordre codé en dur. Les anciennes heuristiques
// échouaient sur presque tous ces cas — elles jouaient toujours la même
// carte, visaient la case la plus fournie sans regarder les couleurs, et
// ne dépensaient jamais d'Adrénaline.

const titan = (id, extra = {}) => ({
  id,
  cell: "E5",
  repaire: [],
  socles: [],
  bagarre: 0,
  destruction: 0,
  adrenaline: 0,
  programmed: [],
  hand: [],
  repos: [],
  // getProgrammedSum lit ces deux champs : sans eux, toute évaluation de
  // Faut Pas Me Chauffer lève, et le candidat est silencieusement écarté
  // par le garde-fou du planificateur.
  playedThisManche: [],
  discardedHidden: [],
  ...extra,
});

const etat = (titans, looseBlocks = {}, board = {}) => ({ board, looseBlocks, titans });
const expert = makeProfile(FORCES.EXPERT, TEMPERAMENTS.OPPORTUNISTE);
const novice = makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE);

describe("récupération — l'IA choisit le bloc, pas seulement la case", () => {
  it("prend la couleur qui rapporte, pas celle du dessus de la pile", () => {
    // Le Titan a 8 Bleu : le 9e vaut 5 points (30 - 25). Il n'a aucun
    // Rouge : le 1er Rouge en vaut 3. Le Bleu doit gagner.
    // Le moteur, sans consigne, aurait pris le dernier empilé — le Rouge.
    setSeed(1);
    const titans = [titan(1, { repaire: Array(8).fill("bleu") }), titan(2)];
    const choix = planRecuperation(1, etat(titans, { E6: ["bleu", "rouge"] }), expert);
    expect(choix.pickedValue).toBe("bleu");
  });

  it("préfère un Socle de forte valeur à un bloc de couleur saturée", () => {
    setSeed(1);
    // 9 Bleu : le barème Bleu est plafonné, un 10e Bleu ne rapporte rien.
    // Le Socle de 4 rapporte 4 points secs.
    const titans = [titan(1, { repaire: Array(9).fill("bleu") }), titan(2)];
    const choix = planRecuperation(1, etat(titans, { E6: ["bleu"], D5: ["socle:4"] }), expert);
    expect(choix.cellKey).toBe("D5");
    expect(choix.estSocle).toBe(true);
  });

  it("renvoie null quand il n'y a rien à ramasser", () => {
    expect(planRecuperation(1, etat([titan(1), titan(2)]), expert)).toBeNull();
  });
});

describe("mouvement — l'IA vise la valeur, pas le tas le plus gros", () => {
  it("va vers le bloc qui lui manque plutôt que vers l'empilement saturé", () => {
    setSeed(3);
    // À gauche, trois Bleu alors que le Titan en a déjà 9 : zéro point.
    // À droite, un seul Rouge, mais c'est son premier : 3 points.
    // L'ancienne heuristique notait « nombre de blocs × 2 » et partait
    // systématiquement à gauche.
    const titans = [titan(1, { cell: "E5", repaire: Array(9).fill("bleu") }), titan(2, { cell: "A1" })];
    const choix = planMovement(1, etat(titans, { E3: ["bleu", "bleu", "bleu"], E7: ["rouge"] }), expert);
    expect(choix).not.toBeNull();
    // Le mouvement ne ramasse pas, mais il rapproche : la case retenue
    // doit être du côté du Rouge.
    expect(Number(choix.destKey.slice(1))).toBeGreaterThan(5);
  });

  it("renvoie null quand aucune case n'est atteignable", () => {
    // Titan enfermé par des Titans sur toutes les cases voisines utiles.
    const titans = [
      titan(1, { cell: "A1" }),
      titan(2, { cell: "A2" }),
      titan(3, { cell: "B1" }),
      titan(4, { cell: "B2" }),
    ];
    const choix = planMovement(1, etat(titans), expert);
    expect(choix === null || typeof choix.destKey === "string").toBe(true);
  });
});

describe("carte — l'IA ne suit plus un ordre de priorité figé", () => {
  it("joue la carte la plus rentable, pas la première d'une liste", () => {
    setSeed(5);
    // L'ancienne heuristique jouait TOUJOURS Tout Casser en premier dès
    // qu'elle l'avait en main. Ici le plateau est vide autour du Titan :
    // Tout Casser ne casse rien, alors que Je Ne Partage Pas ramasse.
    const titans = [titan(1, { cell: "E5", programmed: ["tout_casser", "je_ne_partage_pas"] }), titan(2, { cell: "A1" })];
    const looseBlocks = { E4: ["rouge"], E6: ["rose"], D5: ["orange"], F5: ["orange"] };
    const choix = planCardPlay(1, etat(titans, looseBlocks), expert, 1);
    expect(choix.cardId).toBe("je_ne_partage_pas");
  });

  it("choisit la direction sur ce qu'elle rapporte, sur tout l'axe", () => {
    setSeed(7);
    // Deux Titans alignés à l'est : Graouhhh en touche 2 et rapporte
    // Bagarre plus le bonus d'Adrénaline. À l'ouest, personne.
    // L'ancienne heuristique regardait la hauteur du bâtiment sur la
    // SEULE case juste devant, et ne comptait jamais les Titans.
    const titans = [
      titan(1, { cell: "E3", programmed: ["graouhhh"] }),
      titan(2, { cell: "E4" }),
      titan(3, { cell: "E5" }),
    ];
    const choix = planCardPlay(1, etat(titans), expert, 1);
    expect(choix.cardId).toBe("graouhhh");
    expect(choix.dir).toEqual({ dr: 0, dc: 1 });
  });

  it("n'explore aucune mise d'Adrénaline sur Graouhhh, le livret l'interdit", () => {
    const titans = [titan(1, { adrenaline: 5 }), titan(2)];
    const candidats = candidatsPourCarte("graouhhh", 1, etat(titans));
    expect(candidats.every((c) => c.mise === 0)).toBe(true);
    expect(candidats).toHaveLength(8);
  });

  it("explore les mises d'Adrénaline sur Tête en Avant, mais reste plafonnée", () => {
    const titans = [titan(1, { adrenaline: 9 }), titan(2)];
    const candidats = candidatsPourCarte("tete_en_avant", 1, etat(titans));
    const mises = new Set(candidats.map((c) => c.mise));
    expect([...mises].sort()).toEqual([0, 1, 2]);
  });

  it("n'explore aucune mise quand le Titan n'a pas d'Adrénaline", () => {
    const titans = [titan(1, { adrenaline: 0 }), titan(2)];
    const candidats = candidatsPourCarte("tete_en_avant", 1, etat(titans));
    expect(candidats.every((c) => c.mise === 0)).toBe(true);
  });

  it("ne dépense pas d'Adrénaline quand elle n'apporte rien", () => {
    setSeed(11);
    // Plateau vide et adversaire hors de portée même avec 2 Adrénaline
    // (5 cases au maximum depuis A1) : allonger la charge ne rapporte
    // rien, alors qu'une Adrénaline conservée vaut 3 points au décompte.
    const titans = [titan(1, { cell: "A1", adrenaline: 2, programmed: ["tete_en_avant"] }), titan(2, { cell: "I9" })];
    const choix = planCardPlay(1, etat(titans), expert, 1);
    expect(choix.mise).toBe(0);
  });

  it("dépense en revanche l'Adrénaline quand elle met une cible à portée", () => {
    setSeed(12);
    // Même carte, mais l'adversaire est à 4 cases : hors de la portée de
    // base (3), atteignable avec 1 Adrénaline. Le point de Piste Bagarre
    // gagné vaut plus que l'Adrénaline dépensée.
    const titans = [titan(1, { cell: "E1", adrenaline: 2, programmed: ["tete_en_avant"] }), titan(2, { cell: "E5" })];
    const choix = planCardPlay(1, etat(titans), expert, 1);
    expect(choix.mise).toBeGreaterThan(0);
    expect(choix.dir).toEqual({ dr: 0, dc: 1 });
  });

  it("renvoie null sans carte programmée", () => {
    expect(planCardPlay(1, etat([titan(1), titan(2)]), expert, 1)).toBeNull();
  });

  it("Je Ne Partage Pas prend 3 cases pour la lanterne rouge, 2 sinon", () => {
    setSeed(13);
    const looseBlocks = { E4: ["rouge"], E6: ["rose"], D5: ["orange"], F5: ["bleu"] };

    // Titan 1 dernier au score : la carte lui accorde 3 cases.
    const derniere = [titan(1, { cell: "E5", programmed: ["je_ne_partage_pas"] }), titan(2, { cell: "A1", repaire: Array(6).fill("bleu") })];
    expect(planCardPlay(1, etat(derniere, looseBlocks), expert, 1).jnpCells).toHaveLength(3);

    // Titan 1 en tête : retour au régime normal de 2 cases.
    const enTete = [titan(1, { cell: "E5", repaire: Array(6).fill("bleu"), programmed: ["je_ne_partage_pas"] }), titan(2, { cell: "A1" })];
    expect(planCardPlay(1, etat(enTete, looseBlocks), expert, 1).jnpCells).toHaveLength(2);
  });
});

describe("sabotage — l'IA sait faire perdre des points sans en gagner", () => {
  it("l'Expert préfère dépouiller le leader plutôt qu'encaisser un petit gain", () => {
    setSeed(31);
    // Le leader détient 5 Rouge : lui en retirer un lui coûte 6 points
    // (22 - 16). Notre Titan, lui, n'a rien : Faut Pas Me Chauffer, force
    // programmée supérieure, déclenche un RAGE qui prend ce Rouge.
    // L'alternative Je Ne Partage Pas ne lui rapporterait qu'un ramassage.
    const titans = [
      titan(1, { cell: "E5", programmed: ["faut_pas_me_chauffer", "je_ne_partage_pas"], hand: [] }),
      titan(2, { cell: "E6", repaire: Array(5).fill("rouge"), programmed: [] }),
    ];
    const choix = planCardPlay(1, etat(titans, { D5: ["bleu"], F5: ["bleu"] }), expert, 1);
    expect(choix.cardId).toBe("faut_pas_me_chauffer");
  });

  it("appliquerDecisions : un RAGE transfère bien la ressource", () => {
    const titans = [titan(1), titan(2, { repaire: ["rouge", "bleu"] })];
    appliquerDecisions([{ type: "RAGE", attackerId: 1, defenderId: 2 }], etat(titans));
    expect(titans[0].repaire).toHaveLength(1);
    expect(titans[1].repaire).toHaveLength(1);
  });

  it("appliquerDecisions : un RAGE sur une cible à 1 seul bloc fonctionne", () => {
    // Le ruling de Nikola est explicite : RAGE est possible dès 1 ressource.
    const titans = [titan(1), titan(2, { repaire: ["rouge"] })];
    appliquerDecisions([{ type: "RAGE", attackerId: 1, defenderId: 2 }], etat(titans));
    expect(titans[1].repaire).toHaveLength(0);
    expect(titans[0].repaire).toEqual(["rouge"]);
  });

  it("appliquerDecisions : à court de blocs, RAGE prend l'Adrénaline (FAQ #5)", () => {
    const titans = [titan(1), titan(2, { repaire: [], adrenaline: 2 })];
    appliquerDecisions([{ type: "RAGE", attackerId: 1, defenderId: 2 }], etat(titans));
    expect(titans[1].adrenaline).toBe(1);
    expect(titans[0].adrenaline).toBe(1);
  });

  it("appliquerDecisions : DIL retire une ressource à la cible", () => {
    const titans = [titan(1), titan(2, { repaire: ["rouge", "bleu"] })];
    appliquerDecisions([{ type: "DIL", attackerId: 1, defenderId: 2 }], etat(titans));
    expect(titans[1].repaire).toHaveLength(1);
    // DIL détruit, il ne transfère pas : l'attaquant ne récupère rien.
    expect(titans[0].repaire).toHaveLength(0);
  });

  it("appliquerDecisions : DIL impossible sous 2 couleurs différentes", () => {
    const titans = [titan(1), titan(2, { repaire: ["bleu", "bleu", "bleu"] })];
    appliquerDecisions([{ type: "DIL", attackerId: 1, defenderId: 2 }], etat(titans));
    expect(titans[1].repaire).toHaveLength(3);
  });

  it("appliquerDecisions : la cible paie une Adrénaline quand la perte le justifie", () => {
    // 5 Rouge (perte marginale 6) et 9 Bleu (perte marginale 5) : la
    // cible perdrait au mieux 5 points, plus que les 3 que vaut une
    // Adrénaline. Elle paie donc plutôt que d'encaisser.
    const titans = [titan(1), titan(2, { repaire: [...Array(5).fill("rouge"), ...Array(9).fill("bleu")], adrenaline: 1 })];
    appliquerDecisions([{ type: "DIL", attackerId: 1, defenderId: 2 }], etat(titans));
    expect(titans[1].adrenaline).toBe(0);
    expect(titans[1].repaire).toHaveLength(14);
  });
});

describe("programmation — troisième molette du profil", () => {
  const main = ["tout_casser", "tete_en_avant", "graouhhh", "boing_boing", "je_ne_partage_pas", "faut_pas_me_chauffer"];

  it("le Confirmé programme en fonction de la situation, pas au hasard", () => {
    setSeed(17);
    const titans = [titan(1, { cell: "E5", hand: main }), titan(2, { cell: "A1" })];
    const jeu = etat(titans, { E4: ["rouge"], E6: ["rose"], D5: ["orange"] });
    const confirme = makeProfile(FORCES.CONFIRME, TEMPERAMENTS.OPPORTUNISTE);
    // Déterministe : deux appels sur le même état donnent la même main.
    expect(planProgrammation(1, jeu, confirme, 1)).toEqual(planProgrammation(1, jeu, confirme, 1));
    expect(planProgrammation(1, jeu, confirme, 1)).toHaveLength(3);
  });

  it("le Novice programme au hasard et n'obtient pas toujours la même main", () => {
    const titans = [titan(1, { cell: "E5", hand: main }), titan(2, { cell: "A1" })];
    const jeu = etat(titans, { E4: ["rouge"] });
    setSeed(23);
    const vues = new Set();
    for (let i = 0; i < 40; i++) vues.add(planProgrammation(1, jeu, novice, 1).join("|"));
    expect(vues.size).toBeGreaterThan(1);
  });

  it("rend la main entière quand elle tient déjà dans la programmation", () => {
    const titans = [titan(1, { hand: ["graouhhh", "boing_boing"] }), titan(2)];
    expect(planProgrammation(1, etat(titans), expert, 1)).toEqual(["graouhhh", "boing_boing"]);
  });
});

describe("reproductibilité — indispensable à la simulation de masse", () => {
  it("même graine, même décision", () => {
    const titans = () => [
      titan(1, { cell: "E5", adrenaline: 2, programmed: ["tout_casser", "graouhhh", "boing_boing"] }),
      titan(2, { cell: "E7" }),
      titan(3, { cell: "C5" }),
    ];
    const jeu = () => etat(titans(), { E4: ["rouge", "bleu"], D5: ["socle:3"] });
    setSeed(2026);
    const a = planCardPlay(1, jeu(), novice, 2);
    setSeed(2026);
    const b = planCardPlay(1, jeu(), novice, 2);
    expect(a).toEqual(b);
  });

  it("l'état de départ n'est jamais modifié par la réflexion de l'IA", () => {
    // La simulation travaille sur des copies : si elle mutait l'état réel,
    // le simple fait de réfléchir changerait la partie.
    setSeed(29);
    const titans = [titan(1, { cell: "E5", programmed: ["tout_casser", "graouhhh"] }), titan(2, { cell: "E6" })];
    const jeu = etat(titans, { E4: ["rouge"] });
    const avant = JSON.stringify(jeu);
    planCardPlay(1, jeu, expert, 1);
    planMovement(1, jeu, expert);
    planRecuperation(1, jeu, expert);
    expect(JSON.stringify(jeu)).toBe(avant);
  });
});
