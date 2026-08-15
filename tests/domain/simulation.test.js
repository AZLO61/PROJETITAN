import { describe, expect, it } from "vitest";
import { agreger, jouerPartie, lancerCampagne } from "../../src/domain/simulation.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../../src/domain/aiEvaluation.js";
import { manchesMax } from "../../src/domain/gameRules.js";

// Le simulateur ne vaut que par sa reproductibilité et par le fait qu'il
// joue vraiment une partie entière. Ces deux propriétés sont ce qui est
// verrouillé ici : des statistiques tirées d'un moteur qui dérive ou qui
// s'arrête en cours de route ne veulent rien dire.

const tousPareils = (nb, force, temperament) => {
  const out = {};
  for (let id = 1; id <= nb; id++) out[id] = makeProfile(force, temperament);
  return out;
};

describe("simulateur — une partie complète", () => {
  it("produit un classement complet et un gagnant", () => {
    const r = jouerPartie({ nbJoueurs: 4, seed: 7 });
    expect(r.classement).toHaveLength(4);
    expect(r.gagnantId).toBe(r.classement[0].id);
    expect(r.classement[0].total).toBeGreaterThanOrEqual(r.classement[3].total);
  });

  it("joue à 3 comme à 4 Titans", () => {
    expect(jouerPartie({ nbJoueurs: 3, seed: 7 }).classement).toHaveLength(3);
    expect(jouerPartie({ nbJoueurs: 4, seed: 7 }).classement).toHaveLength(4);
  });

  it("des cartes sont réellement jouées sur toute la partie", () => {
    // Une partie à 4 Titans compte au plus 4 Manches × 3 rounds ×
    // 4 Titans = 48 cartes. Le total peut être légèrement INFÉRIEUR sans
    // que rien ne soit cassé : la Fatigue pioche parfois une carte encore
    // programmée, et le Vol de Phase Repos peut laisser un Titan à moins
    // de 3 cartes en main, donc incapable de programmer. C'est le jeu.
    // Ce qu'on vérifie ici, c'est qu'on reste dans cette bande — un
    // effondrement du compte signalerait une boucle qui s'interrompt.
    const maximum = manchesMax(4) * 3 * 4;
    const r = jouerPartie({ nbJoueurs: 4, seed: 11 });
    const total = Object.values(r.cartesJouees).reduce((s, v) => s + v, 0);
    expect(total).toBeLessThanOrEqual(maximum);
    expect(total).toBeGreaterThan(maximum * 0.85);
  });

  it("les Titans marquent réellement des points", () => {
    const r = jouerPartie({ nbJoueurs: 4, seed: 3 });
    expect(r.classement[0].total).toBeGreaterThan(0);
  });
});

describe("simulateur — reproductibilité", () => {
  it("même graine, partie identique au point près", () => {
    const profils = tousPareils(4, FORCES.EXPERT, TEMPERAMENTS.AGRESSIF);
    const a = jouerPartie({ nbJoueurs: 4, seed: 99, profils });
    const b = jouerPartie({ nbJoueurs: 4, seed: 99, profils });
    expect(a.classement).toEqual(b.classement);
    expect(a.cartesJouees).toEqual(b.cartesJouees);
  });

  it("graines différentes, parties différentes", () => {
    const profils = tousPareils(4, FORCES.EXPERT, TEMPERAMENTS.AGRESSIF);
    const a = jouerPartie({ nbJoueurs: 4, seed: 1, profils });
    const b = jouerPartie({ nbJoueurs: 4, seed: 2, profils });
    expect(a.classement).not.toEqual(b.classement);
  });

  it("une campagne entière est rejouable à l'identique", () => {
    const params = { parties: 5, nbJoueurs: 4, seed: 500 };
    expect(lancerCampagne(params).stats).toEqual(lancerCampagne(params).stats);
  });
});

describe("simulateur — l'échelle de force est bien ordonnée", () => {
  it("un Expert bat un Novice sur une série de parties", () => {
    // La raison d'être des trois niveaux : si l'Expert ne l'emporte pas
    // nettement, c'est que la molette d'horizon ne sert à rien.
    const profils = {
      1: makeProfile(FORCES.EXPERT, TEMPERAMENTS.OPPORTUNISTE),
      2: makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE),
      3: makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE),
      4: makeProfile(FORCES.NOVICE, TEMPERAMENTS.OPPORTUNISTE),
    };
    const { stats } = lancerCampagne({ parties: 12, nbJoueurs: 4, seed: 77, profils });
    expect(stats.parForce.expert.scoreMoyen).toBeGreaterThan(stats.parForce.novice.scoreMoyen);
  });
});

describe("agrégation — les indicateurs utiles à un auteur", () => {
  it("expose taux de victoire, usage des cartes, biais du Détonateur et tension", () => {
    const { stats } = lancerCampagne({ parties: 6, nbJoueurs: 4, seed: 21 });
    expect(stats.parTitan["Titan 1"].parties).toBe(6);
    expect(Object.keys(stats.usageCartes).length).toBeGreaterThan(0);
    expect(stats.victoiresDetonateur.attenduSiEquilibre).toBeCloseTo(0.25);
    expect(stats.tension.ecartMoyenPremierDernier).toBeGreaterThanOrEqual(0);
  });

  it("les parts d'usage des cartes totalisent 100 %", () => {
    const { stats } = lancerCampagne({ parties: 4, nbJoueurs: 4, seed: 33 });
    const somme = Object.values(stats.usageCartes).reduce((s, v) => s + v.part, 0);
    expect(somme).toBeCloseTo(1, 5);
  });

  it("agreger renvoie null sur une campagne vide", () => {
    expect(agreger([])).toBeNull();
  });
});
