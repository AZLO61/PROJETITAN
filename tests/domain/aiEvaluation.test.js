import { describe, expect, it } from "vitest";
import {
  FORCES,
  FORCE_SETTINGS,
  TEMPERAMENTS,
  allProfiles,
  bestVertAssignment,
  bestVertAssignments,
  chooseAmongBest,
  evaluatePosition,
  gagnantArcEnCiel,
  makeProfile,
  profileLabel,
  reglagesDe,
  valeurAPortee,
} from "../../src/domain/aiEvaluation.js";
import { setSeed } from "../../src/domain/rng.js";
import { computeFinalScore } from "../../src/domain/gameRules.js";

// Ces tests verrouillent les propriétés de COMPORTEMENT de l'évaluation,
// pas ses valeurs numériques exactes. Les notes doivent pouvoir bouger
// quand Nikola retouche un barème — c'est même tout l'intérêt du branchement
// sur computeFinalScore. Ce qui ne doit pas bouger, c'est l'ordre des
// préférences : un Expert doit lire le plateau plus finement qu'un Confirmé,
// un Novice rester aveugle aux Pistes ADN, un Agressif porté sur la bagarre.

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
  const profil = makeProfile(FORCES.MOYEN, TEMPERAMENTS.OPPORTUNISTE);
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
  const novice = makeProfile(FORCES.FACILE, TEMPERAMENTS.OPPORTUNISTE);
  const confirme = makeProfile(FORCES.MOYEN, TEMPERAMENTS.OPPORTUNISTE);

  it("le Novice compte son Adrénaline, comme le Confirmé", () => {
    /* Il l'ignorait totalement jusqu'au 2026-08-18, et la gaspillait donc
       sans compter. Ce sont des jetons posés devant lui, qui valent 3 points
       chacun et qui figurent sur la feuille de score : les ignorer ne
       modélisait pas un débutant mais un joueur qui n'a pas lu les règles.
       C'est l'un des deux angles morts qui le plombaient, avec la
       programmation au hasard (cf. FORCE_SETTINGS). */
    const sans = etat([titan(1), titan(2)]);
    const avec = etat([titan(1, { adrenaline: 4 }), titan(2)]);
    expect(evaluatePosition(1, avec, novice)).toBeGreaterThan(evaluatePosition(1, sans, novice));
    expect(evaluatePosition(1, avec, confirme)).toBeGreaterThan(evaluatePosition(1, sans, confirme));
  });

  it("le Novice sous-estime les Pistes ADN, le Confirmé les compte en entier", () => {
    /* LISSAGE DU 2026-08-19. Le Novice était AVEUGLE aux Pistes ADN et à tous
       les bonus de fin, ce qui le laissait à 63 % du score de l'Expert.
       Nikola : « lisse les niveaux [...] il faut un moins grand gap entre
       eux ». Il en perçoit désormais une part (`visionBonus`), ce qui est
       aussi un modèle plus juste du débutant : il n'ignore pas que les bonus
       existent, il les sous-estime.

       Ce qui doit rester vrai, et c'est l'objet du test : il les valorise
       toujours NETTEMENT MOINS que le Confirmé, sinon la hiérarchie
       disparaît. */
    const sans = etat([titan(1), titan(2, { bagarre: 5 })]);
    const avec = etat([titan(1, { bagarre: 5 }), titan(2)]);
    const gainNovice = evaluatePosition(1, avec, novice) - evaluatePosition(1, sans, novice);
    const gainConfirme = evaluatePosition(1, avec, confirme) - evaluatePosition(1, sans, confirme);
    expect(gainNovice).toBeGreaterThan(0);
    expect(gainConfirme).toBeGreaterThan(gainNovice);
  });

  it("le Novice voit quand même son butin : les Socles comptent", () => {
    const sans = etat([titan(1), titan(2)]);
    const avec = etat([titan(1, { socles: [3, 4] }), titan(2)]);
    expect(evaluatePosition(1, avec, novice)).toBeGreaterThan(evaluatePosition(1, sans, novice));
  });
});

describe("force — l'Expert lit le plateau, le Confirmé lit le barème", () => {
  /* Ce bloc verrouillait auparavant la NUISANCE : l'Expert préférant la
     position où son adversaire souffre. Mesuré le 2026-08-27 sur cinq poids
     et deux séries de graines, ce terme lui FAIT PERDRE des points de façon
     monotone (ratio Confirmé/Expert 97 % sans nuisance, 101 % à 0,5, 108 % à
     1,0, 120 % à 1,6) : à quatre joueurs, coûter trois points au meneur les
     fait gagner autant aux deux autres qu'à soi. Il a donc été retiré, et ce
     que l'Expert a de plus est désormais un REGARD, pas une agression. */
  const presqueArcEnCiel = { cell: "E5", repaire: ["bleu", "rose", "orange", "rouge"] };

  it("le barème seul ne voit pas les 5 points d'un trophée à portée", () => {
    // Un Vert au sol ne rapporte aucun point de BARÈME — il ne marque sur
    // aucune colonne. Mais il est la cinquième couleur de ce Titan-là, donc
    // l'Arc-en-ciel, donc 5 points fermes. C'est exactement le genre de
    // situation que l'ancienne lecture ratait.
    const autour = etat([titan(1, presqueArcEnCiel), titan(2, { cell: "A1" })], {}, { E6: ["vert"] });
    const auBareme = valeurAPortee(titan(1, presqueArcEnCiel), autour, 3, { auScoreComplet: false });
    const auScore = valeurAPortee(titan(1, presqueArcEnCiel), autour, 3, { auScoreComplet: true });
    expect(auScore).toBeGreaterThan(auBareme);
  });

  it("un tas qu'un adversaire touche vaut moins que le même tas gardé", () => {
    const moi = titan(1, { cell: "E5" });
    const tas = { E6: ["bleu", "bleu"] };
    const seul = etat([moi, titan(2, { cell: "A1" })], {}, tas);
    const dispute = etat([moi, titan(2, { cell: "E7" })], {}, tas);
    const opts = { voitConcurrence: true };
    expect(valeurAPortee(moi, dispute, 3, opts)).toBeLessThan(valeurAPortee(moi, seul, 3, opts));
  });

  it("sans ce regard, la présence de l'adversaire ne change rien", () => {
    const moi = titan(1, { cell: "E5" });
    const tas = { E6: ["bleu", "bleu"] };
    const seul = etat([moi, titan(2, { cell: "A1" })], {}, tas);
    const dispute = etat([moi, titan(2, { cell: "E7" })], {}, tas);
    expect(valeurAPortee(moi, dispute, 3)).toBe(valeurAPortee(moi, seul, 3));
  });

  it("le Confirmé reste indifférent à la fortune de son adversaire", () => {
    const confirme = makeProfile(FORCES.MOYEN, TEMPERAMENTS.OPPORTUNISTE);
    const monRepaire = { repaire: ["bleu", "bleu", "rose"] };
    // Les Bleu de l'adversaire ne disputent ni le bonus Rose ni un
    // classement de piste : sa fortune ne peut donc pas déplacer mon total.
    const riche = etat([titan(1, monRepaire), titan(2, { repaire: Array(7).fill("bleu") })]);
    const pauvre = etat([titan(1, monRepaire), titan(2, { repaire: ["bleu"] })]);
    expect(evaluatePosition(1, riche, confirme)).toBe(evaluatePosition(1, pauvre, confirme));
  });
});

describe("trophée Arc-en-ciel — l'IA sait qu'il reste à prendre", () => {
  it("il revient au premier Titan qui possède les cinq couleurs", () => {
    const cinq = ["bleu", "rose", "orange", "rouge", "vert"];
    expect(gagnantArcEnCiel([titan(1, { repaire: ["bleu"] }), titan(2, { repaire: cinq })])).toBe(2);
  });

  it("personne ne le tient tant qu'une couleur manque", () => {
    const quatre = ["bleu", "rose", "orange", "rouge"];
    expect(gagnantArcEnCiel([titan(1, { repaire: quatre }), titan(2, { repaire: quatre })])).toBe(null);
  });
});

describe("tempérament — même force, préférences différentes", () => {
  // Un Agressif et un Collectionneur de même force doivent classer
  // différemment deux positions de valeur brute comparable.
  const agressif = makeProfile(FORCES.MOYEN, TEMPERAMENTS.AGRESSIF);
  const collectionneur = makeProfile(FORCES.MOYEN, TEMPERAMENTS.COLLECTIONNEUR);

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

  it("les trois forces en tiennent compte, Novice compris", () => {
    // Le Novice IGNORAIT la valeur à portée jusqu'au 2026-08-17. C'était le
    // rendre plus faible qu'un débutant humain : lire ce qu'on a sous la
    // main est de l'observation élémentaire, pas du calcul d'expert, et un
    // vrai débutant ne laisse pas trois blocs sur sa propre case.
    // Ouvert dans le cadre de la demande « améliore de 30 % l'IA Novice »
    // (cf. FORCE_SETTINGS et scripts/mesure-forces.mjs).
    const vide = etat([titan(1), titan(2)]);
    const entoure = etat([titan(1), titan(2)], {}, { E5: ["bleu", "bleu", "bleu"] });
    for (const force of [FORCES.FACILE, FORCES.MOYEN, FORCES.EXPERT]) {
      const profil = makeProfile(force, TEMPERAMENTS.OPPORTUNISTE);
      expect(evaluatePosition(1, entoure, profil)).toBeGreaterThan(evaluatePosition(1, vide, profil));
    }
  });

  it("le Novice reste en dessous du Confirmé, sans être relégué", () => {
    /* LISSAGE DU 2026-08-19. Le rayon de portée du Novice est passé de 2 à 3,
       comme les autres : un débutant VOIT le plateau, il le lit juste moins
       bien. Ce n'est donc plus lui qui porte la distinction.

       Ce qui la porte maintenant, et que ce test verrouille : il ne voit
       toujours pas le score complet, il ne voit pas les adversaires, et il ne
       perçoit qu'une PART des bonus de fin. Un `visionBonus` à 1 ferait de lui
       un Confirmé, à 0 il retomberait au gouffre d'avant. */
    expect(FORCE_SETTINGS[FORCES.FACILE].voitScoreComplet).toBe(false);
    expect(FORCE_SETTINGS[FORCES.FACILE].voitAdversaires).toBe(false);
    expect(FORCE_SETTINGS[FORCES.FACILE].visionBonus).toBeGreaterThan(0);
    expect(FORCE_SETTINGS[FORCES.FACILE].visionBonus).toBeLessThan(1);
    expect(FORCE_SETTINGS[FORCES.MOYEN].voitScoreComplet).toBe(true);
    // Il garde aussi du bruit là où le Confirmé n'en a plus.
    expect(FORCE_SETTINGS[FORCES.FACILE].topN).toBeGreaterThan(FORCE_SETTINGS[FORCES.MOYEN].topN);
    /* LA MARCHE ENTRE CONFIRMÉ ET EXPERT, REFAITE LE 2026-08-27.
       C'était le différentiel adverse — `poidsAdversaires` — mesuré depuis
       comme coûtant des points à l'Expert quel que soit son dosage, et
       retiré. Ce sont maintenant DEUX REGARDS de plus sur le plateau, et
       c'est la mesure qui les a placés là plutôt que l'intuition : ouvrir la
       lecture de la concurrence au Confirmé faisait repasser le ratio
       Confirmé/Expert de 98,9 % à 100,9 % sur 30 parties × 8 graines. */
    expect(FORCE_SETTINGS[FORCES.MOYEN].voitPorteeAuScore).toBe(false);
    expect(FORCE_SETTINGS[FORCES.EXPERT].voitPorteeAuScore).toBe(true);
    expect(FORCE_SETTINGS[FORCES.MOYEN].voitConcurrence).toBe(false);
    expect(FORCE_SETTINGS[FORCES.EXPERT].voitConcurrence).toBe(true);
  });

});

describe("blocs Vert — l'IA sait où elle les poserait", () => {
  const profil = makeProfile(FORCES.MOYEN, TEMPERAMENTS.OPPORTUNISTE);

  it("un Vert vaut quelque chose, il n'est plus compté zéro", () => {
    const sans = etat([titan(1, { repaire: ["bleu", "bleu"] }), titan(2)]);
    const avec = etat([titan(1, { repaire: ["bleu", "bleu", "vert"] }), titan(2)]);
    expect(evaluatePosition(1, avec, profil)).toBeGreaterThan(evaluatePosition(1, sans, profil));
  });

  it("le Vert renforce une couleur déjà possédée quand c'est le plus payant", () => {
    // 5 Bleu en Repaire : le 6e vaut 5 points (15 - 10), largement plus
    // que ce qu'un point de Piste ADN rapporterait ici.
    //
    // L'adversaire est distancé sur les DEUX Pistes (ruling du 2026-08-15 :
    // une Piste à 0 vaut 0). Avec un seul adversaire en tête, envoyer le
    // Vert sur la piste vide ferait passer le Titan de 0 à 3 points, soit
    // plus que les 5 points du Bleu ne le laissent croire une fois la
    // comparaison faite — le test mesurerait alors le classement, pas la
    // valeur marginale de la couleur, qui est son vrai sujet.
    const titans = [
      titan(1, { repaire: [...Array(5).fill("bleu"), "vert"] }),
      titan(2, { bagarre: 9, destruction: 9 }),
    ];
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
    // Les adversaires sont hors d'atteinte sur les deux Pistes ADN : sans
    // ça, grimper d'un cran au classement rapporterait plus que tout le
    // reste et masquerait le phénomène qu'on veut montrer ici.
    //
    // Il en faut TROIS depuis le ruling du 2026-08-15 (« une Piste ADN à 0
    // vaut 0 »). À deux joueurs, la dernière place rapporte encore 3 points
    // dès qu'on a marqué le moindre point : envoyer un Vert sur une piste
    // vide ferait gagner 3, plus que les 2 points du Bleu, et le glouton
    // choisirait la piste. À quatre, la dernière place vaut 0 : le Vert en
    // Piste ne rapporte rien du tout, et la comparaison porte bien sur les
    // seules couleurs, ce que ce test veut éprouver.
    const titans = [
      titan(1, { repaire: ["bleu", "orange", "orange", "vert", "vert"] }),
      titan(2, { bagarre: 10, destruction: 10 }),
      titan(3, { bagarre: 9, destruction: 9 }),
      titan(4, { bagarre: 8, destruction: 8 }),
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
    const profil = makeProfile(FORCES.FACILE, TEMPERAMENTS.OPPORTUNISTE);
    const vus = new Set();
    for (let i = 0; i < 200; i++) vus.add(chooseAmongBest(candidats, profil).id);
    expect(vus.size).toBeGreaterThan(1);
    // Il se trompe, mais il ne joue jamais un coup absurde : c'est ce qui
    // sépare une IA faible crédible d'une IA qui tire au hasard.
    expect(vus.has("d")).toBe(false);
    expect(vus.has("e")).toBe(false);
  });

  it("le tirage est reproductible à graine égale", () => {
    const profil = makeProfile(FORCES.FACILE, TEMPERAMENTS.OPPORTUNISTE);
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
  it("expose les 12 combinaisons de niveau et de tempérament", () => {
    // Quatre niveaux de difficulté depuis le 2026-08-28, trois tempéraments.
    expect(allProfiles()).toHaveLength(12);
  });

  it("s'affiche en clair pour la révélation en fin de partie", () => {
    expect(profileLabel(makeProfile(FORCES.EXPERT, TEMPERAMENTS.AGRESSIF))).toBe("Expert Agressif");
  });
});

describe("tirage pondéré — le Novice revient vers son meilleur coup", () => {
  /* Le tirage était UNIFORME dans la fenêtre des `topN` meilleurs coups :
     le Novice jetait donc son meilleur coup deux fois sur trois, ce qui le
     rendait bien plus faible qu'un débutant. Le `biais` pondère le tirage
     sans jamais rendre l'IA déterministe — elle se trompe encore, mais
     plausiblement. */

  const candidats = [{ note: 10, id: "A" }, { note: 8, id: "B" }, { note: 6, id: "C" }];

  const distribution = (profil, tirages = 3000) => {
    setSeed(12345);
    const compte = { A: 0, B: 0, C: 0 };
    for (let i = 0; i < tirages; i++) compte[chooseAmongBest(candidats, profil).id]++;
    return compte;
  };

  it("le meilleur coup sort nettement plus souvent que le troisième", () => {
    const d = distribution(makeProfile(FORCES.FACILE, TEMPERAMENTS.OPPORTUNISTE));
    expect(d.A).toBeGreaterThan(d.B);
    expect(d.B).toBeGreaterThan(d.C);
    // Poids 9 / 3 / 1 pour un biais de 3 : le meilleur doit dominer largement.
    expect(d.A).toBeGreaterThan(d.C * 4);
  });

  it("il se trompe encore : le second coup sort réellement", () => {
    /* LISSAGE DU 2026-08-19 : la fenêtre de tirage passe de 3 coups à 2, et le
       biais de 3 à 4. Le Novice tire donc beaucoup plus souvent son meilleur
       coup — c'est l'essentiel de ce qui l'a remonté sans lui donner la vue
       du Confirmé.

       Ce qui doit rester vrai : il se trompe ENCORE. Un Novice qui prendrait
       toujours le meilleur coup serait un Expert myope, pas un débutant. Son
       second choix sort donc toujours, le troisième n'existe plus. */
    const d = distribution(makeProfile(FORCES.FACILE, TEMPERAMENTS.OPPORTUNISTE));
    expect(d.B).toBeGreaterThan(0);
    expect(d.C).toBe(0);
    // Et il penche nettement vers le meilleur, sans s'y enfermer.
    expect(d.A).toBeGreaterThan(d.B);
  });

  it("l'Expert prend toujours le meilleur, sans tirage", () => {
    const d = distribution(makeProfile(FORCES.EXPERT, TEMPERAMENTS.OPPORTUNISTE));
    expect(d.A).toBe(3000);
  });

  it("le Novice penche vers son meilleur coup sans jamais s'y enfermer", () => {
    // Garde-fou de la pondération elle-même : sur deux candidats, le mieux
    // noté doit dominer largement, sans que l'autre disparaisse.
    setSeed(999);
    const deux = [{ note: 5, id: "X" }, { note: 4, id: "Y" }];
    const profil = { force: FORCES.FACILE, temperament: TEMPERAMENTS.OPPORTUNISTE };
    const compte = { X: 0, Y: 0 };
    for (let i = 0; i < 2000; i++) compte[chooseAmongBest(deux, profil).id]++;
    expect(compte.X).toBeGreaterThan(compte.Y);
    expect(compte.Y).toBeGreaterThan(0);
  });

  it("à topN 1, il n'y a plus de tirage du tout", () => {
    // Depuis le 2026-08-18 le Confirmé joue lui aussi son meilleur coup :
    // ce qui le sépare de l'Expert est la VUE (le différentiel adverse),
    // plus le bruit. Deux profils déterministes, donc, et c'est voulu.
    setSeed(4);
    const deux = [{ note: 5, id: "X" }, { note: 4, id: "Y" }];
    for (const force of [FORCES.MOYEN, FORCES.EXPERT]) {
      const profil = { force, temperament: TEMPERAMENTS.OPPORTUNISTE };
      for (let i = 0; i < 50; i++) expect(chooseAmongBest(deux, profil).id).toBe("X");
    }
  });
});

/* ── L'INTERRUPTEUR DE MESURE (2026-08-27) ──────────────────
   `FORCE_SETTINGS` reste la source de verite d'une force. Un profil peut
   porter un `reglages` qui la surcharge, et c'est reserve a la mesure :
   `scripts/duel-reglages.mjs` s'en sert pour faire jouer deux reglages dans
   LA MEME partie, protocole qui manquait aux deux passes precedentes.

   Ces tests verrouillent la seule chose qui compte pour le jeu : sans
   surcharge, rien ne bouge. */
describe("Surcharge de reglages, reservee a la mesure", () => {
  it("sans surcharge, un profil rend exactement les reglages de sa force", () => {
    for (const force of Object.values(FORCES)) {
      expect(reglagesDe(makeProfile(force))).toEqual(FORCE_SETTINGS[force]);
    }
  });

  it("une surcharge ne remplace que les cles qu'elle nomme", () => {
    const r = reglagesDe(makeProfile(FORCES.MOYEN, TEMPERAMENTS.OPPORTUNISTE, { rayonPortee: 4 }));
    expect(r.rayonPortee).toBe(4);
    expect(r.voitScoreComplet).toBe(FORCE_SETTINGS[FORCES.MOYEN].voitScoreComplet);
  });

  it("la nuisance est la marque de l'Expert, et de lui seul", () => {
    /* Remesuree le 2026-08-27 au soir en duel meme-partie (240 parties,
       sieges croises) : +0,25 point, 52,5 % de victoires — elle ne coute
       rien, contrairement a ce que disait le balayage du matin, fait sur
       deux campagnes separees. Elle est donc rebranchee sur l'Expert.

       Si ce test tombe, c'est qu'une force a change de camp — un arbitrage
       de jeu (une IA qui GENE ne joue pas comme une IA qui MARQUE), pas un
       detail de reglage. */
    expect(FORCE_SETTINGS[FORCES.EXPERT].poidsAdversaires).toBeGreaterThan(0);
    expect(FORCE_SETTINGS[FORCES.FACILE].poidsAdversaires).toBe(0);
    expect(FORCE_SETTINGS[FORCES.MOYEN].poidsAdversaires).toBe(0);
  });
});
