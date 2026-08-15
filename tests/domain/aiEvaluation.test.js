import { describe, expect, it } from "vitest";
import {
  FORCES,
  TEMPERAMENTS,
  allProfiles,
  bestVertAssignment,
  bestVertAssignments,
  chooseAmongBest,
  evaluatePosition,
  makeProfile,
  profileLabel,
  valeurAPortee,
} from "../../src/domain/aiEvaluation.js";
import { setSeed } from "../../src/domain/rng.js";
import { computeFinalScore } from "../../src/domain/gameRules.js";

// Ces tests verrouillent les propriétés de COMPORTEMENT de l'évaluation,
// pas ses valeurs numériques exactes. Les notes doivent pouvoir bouger
// quand Nikola retouche un barème — c'est même tout l'intérêt du branchement
// sur computeFinalScore. Ce qui ne doit pas bouger, c'est l'ordre des
// préférences : un Expert doit rester différentiel, un Novice aveugle aux
// Pistes ADN, un Agressif porté sur la bagarre.

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
  ...extra,
});

const etat = (titans, board = {}, looseBlocks = {}) => ({ board, looseBlocks, titans });

describe("évaluation — la valeur d'un bloc est marginale, pas fixe", () => {
  // C'est la raison d'être du branchement sur le vrai barème. Sur le
  // barème Bleu [1,3,5,7,10,15,20,25,30], le 2e bloc rapporte 2 et le
  // 6e en rapporte 5. Une table de poids à la main écraserait cette
  // courbe et l'IA accumulerait sans savoir quand s'arrêter.
  const profil = makeProfile(FORCES.CONFIRME, TEMPERAMENTS.OPPORTUNISTE);
  const noteAvec = (n) =>
    evaluatePosition(1, etat([titan(1, { repaire: Array(n).fill("bleu") })]), profil);

  it("le gain du 6e bloc Bleu dépasse celui du 2e", () => {
    const gain2e = noteAvec(2) - noteAvec(1);
    const gain6e = noteAvec(6) - noteAvec(5);
    expect(gain6e).toBeGreaterThan(gain2e);
  });

  it("un bloc Orange impair ne rapporte rien, la paire rapporte", () => {
    const orange = (n) =>
      evaluatePosition(1, etat([titan(1, { repaire: Array(n).fill("orange") })]), profil);
    expect(orange(1)).toBe(orange(0));
    expect(orange(2)).toBeGreaterThan(orange(1));
    expect(orange(3)).toBe(orange(2));
  });
});

describe("force — le Novice regarde moins loin, il ne triche pas", () => {
  const novice = makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE);
  const confirme = makeProfile(FORCES.CONFIRME, TEMPERAMENTS.OPPORTUNISTE);

  it("le Novice est insensible à l'Adrénaline capitalisée, le Confirmé non", () => {
    const sans = etat([titan(1), titan(2)]);
    const avec = etat([titan(1, { adrenaline: 4 }), titan(2)]);
    expect(evaluatePosition(1, avec, novice)).toBe(evaluatePosition(1, sans, novice));
    expect(evaluatePosition(1, avec, confirme)).toBeGreaterThan(evaluatePosition(1, sans, confirme));
  });

  it("le Novice est insensible aux Pistes ADN, le Confirmé les valorise", () => {
    const sans = etat([titan(1), titan(2, { bagarre: 5 })]);
    const avec = etat([titan(1, { bagarre: 5 }), titan(2)]);
    expect(evaluatePosition(1, avec, novice)).toBe(evaluatePosition(1, sans, novice));
    expect(evaluatePosition(1, avec, confirme)).toBeGreaterThan(evaluatePosition(1, sans, confirme));
  });

  it("le Novice voit quand même son butin : les Socles comptent", () => {
    const sans = etat([titan(1), titan(2)]);
    const avec = etat([titan(1, { socles: [3, 4] }), titan(2)]);
    expect(evaluatePosition(1, avec, novice)).toBeGreaterThan(evaluatePosition(1, sans, novice));
  });
});

describe("force — l'Expert évalue en différentiel", () => {
  const confirme = makeProfile(FORCES.CONFIRME, TEMPERAMENTS.OPPORTUNISTE);
  const expert = makeProfile(FORCES.EXPERT, TEMPERAMENTS.OPPORTUNISTE);

  // Deux positions où le Titan 1 marque EXACTEMENT pareil ; seule change
  // la fortune de son adversaire. Le Confirmé doit être indifférent, et
  // l'Expert doit préférer celle où l'adversaire souffre. C'est ce qui
  // fait émerger la nuisance sans qu'aucune règle d'attaque soit écrite.
  const monRepaire = { repaire: ["bleu", "bleu", "rose"] };
  const adversaireRiche = etat([titan(1, monRepaire), titan(2, { repaire: Array(7).fill("bleu") })]);
  const adversairePauvre = etat([titan(1, monRepaire), titan(2, { repaire: ["bleu"] })]);

  it("le Confirmé ne fait pas la différence", () => {
    expect(evaluatePosition(1, adversaireRiche, confirme)).toBe(
      evaluatePosition(1, adversairePauvre, confirme)
    );
  });

  it("l'Expert préfère nettement la position où l'adversaire est distancé", () => {
    expect(evaluatePosition(1, adversairePauvre, expert)).toBeGreaterThan(
      evaluatePosition(1, adversaireRiche, expert)
    );
  });
});

describe("tempérament — même force, préférences différentes", () => {
  // Un Agressif et un Collectionneur de même force doivent classer
  // différemment deux positions de valeur brute comparable.
  const agressif = makeProfile(FORCES.CONFIRME, TEMPERAMENTS.AGRESSIF);
  const collectionneur = makeProfile(FORCES.CONFIRME, TEMPERAMENTS.COLLECTIONNEUR);

  const viaBagarre = etat([titan(1, { bagarre: 6 }), titan(2)]);
  const viaSocles = etat([titan(1, { socles: [4, 4] }), titan(2)]);

  it("l'Agressif place la piste Bagarre au-dessus des Socles", () => {
    const ecart = evaluatePosition(1, viaBagarre, agressif) - evaluatePosition(1, viaSocles, agressif);
    const ecartCollec =
      evaluatePosition(1, viaBagarre, collectionneur) - evaluatePosition(1, viaSocles, collectionneur);
    expect(ecart).toBeGreaterThan(ecartCollec);
  });

  it("le Collectionneur valorise les Socles plus que l'Agressif", () => {
    const vide = etat([titan(1), titan(2)]);
    const gainCollec = evaluatePosition(1, viaSocles, collectionneur) - evaluatePosition(1, vide, collectionneur);
    const gainAgressif = evaluatePosition(1, viaSocles, agressif) - evaluatePosition(1, vide, agressif);
    expect(gainCollec).toBeGreaterThan(gainAgressif);
  });
});

describe("valeur à portée — l'IA voit ce qui traîne autour d'elle", () => {
  it("un tas proche vaut plus que le même tas éloigné", () => {
    const proche = valeurAPortee(titan(1, { cell: "E5" }), etat([], {}, { E6: ["bleu", "bleu", "rose"] }));
    const loin = valeurAPortee(titan(1, { cell: "E5" }), etat([], {}, { E7: ["bleu", "bleu", "rose"] }));
    expect(proche).toBeGreaterThan(loin);
    expect(loin).toBeGreaterThan(0);
  });

  it("au-delà du rayon, plus rien n'est vu", () => {
    const horsRayon = valeurAPortee(titan(1, { cell: "A1" }), etat([], {}, { I9: ["bleu", "bleu"] }));
    expect(horsRayon).toBe(0);
  });

  it("un Socle au sol pèse plus lourd qu'un bloc simple", () => {
    const avecSocle = valeurAPortee(titan(1, { cell: "E5" }), etat([], {}, { E5: ["socle:4"] }));
    const avecBloc = valeurAPortee(titan(1, { cell: "E5" }), etat([], {}, { E5: ["bleu"] }));
    expect(avecSocle).toBeGreaterThan(avecBloc);
  });

  it("le Confirmé et l'Expert en tiennent compte, le Novice l'ignore", () => {
    const vide = etat([titan(1), titan(2)]);
    const entoure = etat([titan(1), titan(2)], {}, { E5: ["bleu", "bleu", "bleu"] });
    const novice = makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE);
    const confirme = makeProfile(FORCES.CONFIRME, TEMPERAMENTS.OPPORTUNISTE);
    expect(evaluatePosition(1, entoure, novice)).toBe(evaluatePosition(1, vide, novice));
    expect(evaluatePosition(1, entoure, confirme)).toBeGreaterThan(evaluatePosition(1, vide, confirme));
  });
});

describe("blocs Vert — l'IA sait où elle les poserait", () => {
  const profil = makeProfile(FORCES.CONFIRME, TEMPERAMENTS.OPPORTUNISTE);

  it("un Vert vaut quelque chose, il n'est plus compté zéro", () => {
    const sans = etat([titan(1, { repaire: ["bleu", "bleu"] }), titan(2)]);
    const avec = etat([titan(1, { repaire: ["bleu", "bleu", "vert"] }), titan(2)]);
    expect(evaluatePosition(1, avec, profil)).toBeGreaterThan(evaluatePosition(1, sans, profil));
  });

  it("le Vert renforce une couleur déjà possédée quand c'est le plus payant", () => {
    // 5 Bleu en Repaire : le 6e vaut 5 points (15 - 10), largement plus
    // que ce qu'un point de Piste ADN rapporterait ici.
    const titans = [titan(1, { repaire: [...Array(5).fill("bleu"), "vert"] }), titan(2, { bagarre: 9 })];
    const placement = bestVertAssignment(1, titans);
    expect(placement).toEqual([{ type: "color", target: "bleu" }]);
  });

  it("le Vert part en Piste ADN quand aucune couleur ne peut l'accueillir", () => {
    // Repaire sans aucun bloc réel : la règle interdit d'affecter un Vert
    // à une couleur qu'on ne possède pas. Il ne reste que les Pistes.
    const titans = [titan(1, { repaire: ["vert"] }), titan(2)];
    const placement = bestVertAssignment(1, titans);
    expect(placement[0].type).toBe("adn");
  });

  it("ne propose jamais une couleur absente du Repaire réel", () => {
    // Contrainte du livret : un Vert ne rejoint une couleur que si le
    // Titan possède déjà au moins un bloc RÉEL de cette couleur.
    const titans = [titan(1, { repaire: ["rouge", "vert", "vert"] }), titan(2)];
    const placement = bestVertAssignment(1, titans, { exact: true });
    placement.forEach((p) => {
      if (p.type === "color") expect(p.target).toBe("rouge");
    });
  });

  it("le mode exact rattrape l'angle mort du glouton sur les paires d'Orange", () => {
    // Le piège : 2 Orange réels forment déjà une paire (5 pts). Un 3e
    // Orange ne rapporte RIEN, seul un 4e refait une paire (11 pts, soit
    // +6). Le glouton, qui juge bloc par bloc, voit ce premier Vert à
    // gain nul et lui préfère le Bleu qui rapporte +2 tout de suite. Il
    // s'enferme et termine à +4, là où les deux Verts en Orange
    // valaient +6. Le mode exact, qui énumère les répartitions, le voit.
    // L'adversaire est hors d'atteinte sur les deux Pistes ADN : sans ça,
    // grimper d'un cran au classement rapporterait plus que tout le reste
    // et masquerait le phénomène qu'on veut montrer ici.
    const titans = [
      titan(1, { repaire: ["bleu", "orange", "orange", "vert", "vert"] }),
      titan(2, { bagarre: 10, destruction: 10 }),
    ];
    const total = (a) => computeFinalScore(titans, { 1: a }, null).totals[1].total;

    const glouton = bestVertAssignment(1, titans);
    const exact = bestVertAssignment(1, titans, { exact: true });

    expect(glouton.every((p) => p.target === "bleu")).toBe(true);
    expect(exact.filter((p) => p.target === "orange")).toHaveLength(2);
    expect(total(exact)).toBeGreaterThan(total(glouton));
  });

  it("bestVertAssignments couvre tous les Titans et reste vide sans Vert", () => {
    const titans = [titan(1, { repaire: ["bleu", "vert"] }), titan(2, { repaire: ["rose"] })];
    const tous = bestVertAssignments(titans);
    expect(tous[1]).toHaveLength(1);
    expect(tous[2]).toEqual([]);
  });

  it("le placement est déterministe, deux appels donnent le même résultat", () => {
    const titans = [titan(1, { repaire: ["bleu", "rose", "vert", "vert"] }), titan(2)];
    expect(bestVertAssignment(1, titans)).toEqual(bestVertAssignment(1, titans));
  });
});

describe("choix du coup — la molette de bruit", () => {
  const candidats = [
    { note: 10, id: "a" },
    { note: 9, id: "b" },
    { note: 8, id: "c" },
    { note: 1, id: "d" },
    { note: 0, id: "e" },
  ];

  it("l'Expert prend toujours le meilleur coup", () => {
    setSeed(1);
    const profil = makeProfile(FORCES.EXPERT, TEMPERAMENTS.OPPORTUNISTE);
    for (let i = 0; i < 50; i++) {
      expect(chooseAmongBest(candidats, profil).id).toBe("a");
    }
  });

  it("le Novice varie, mais reste dans ses trois meilleurs coups", () => {
    setSeed(4);
    const profil = makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE);
    const vus = new Set();
    for (let i = 0; i < 200; i++) vus.add(chooseAmongBest(candidats, profil).id);
    expect(vus.size).toBeGreaterThan(1);
    // Il se trompe, mais il ne joue jamais un coup absurde : c'est ce qui
    // sépare une IA faible crédible d'une IA qui tire au hasard.
    expect(vus.has("d")).toBe(false);
    expect(vus.has("e")).toBe(false);
  });

  it("le tirage est reproductible à graine égale", () => {
    const profil = makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE);
    setSeed(2026);
    const a = Array.from({ length: 30 }, () => chooseAmongBest(candidats, profil).id);
    setSeed(2026);
    const b = Array.from({ length: 30 }, () => chooseAmongBest(candidats, profil).id);
    expect(a).toEqual(b);
  });

  it("renvoie null sans candidat", () => {
    expect(chooseAmongBest([], makeProfile())).toBeNull();
  });
});

describe("profils — inventaire", () => {
  it("expose les 9 combinaisons de force et de tempérament", () => {
    expect(allProfiles()).toHaveLength(9);
  });

  it("s'affiche en clair pour la révélation en fin de partie", () => {
    expect(profileLabel(makeProfile(FORCES.EXPERT, TEMPERAMENTS.AGRESSIF))).toBe("Expert Agressif");
  });
});
