/* ============================================================
   PROJET TITAN — CE QUI PART SUR LE RÉSEAU, ET CE QUI N'EN PART PAS
   ============================================================
   Projet Titan repose sur une programmation SECRÈTE : trois cartes choisies
   sans que personne ne les voie. À distance, c'est la propriété la plus facile
   à perdre — et la plus difficile à voir disparaître, parce que rien à l'écran
   ne change quand une main fuit. Le tricheur n'a même pas à tricher : il ouvre
   l'onglet Réseau de son navigateur et lit.

   L'hôte diffuse donc un plateau PUBLIC, mains masquées, et envoie à chaque
   invité sa seule main par un canal privé. Ces tests tiennent cette frontière.
============================================================ */
import { describe, expect, it } from "vitest";
import { plateauPublic, mainPrivee, fusionnerMain, urlPropre } from "../../src/net/session.js";

const titan = (id, extra = {}) => ({
  id,
  cell: `A${id}`,
  repaire: [],
  socles: [],
  adrenaline: 1,
  bagarre: 0,
  destruction: 0,
  hand: ["tout_casser", "graouhhh", "boing_boing"],
  programmed: ["tete_en_avant", "je_ne_partage_pas"],
  playedThisManche: [],
  discardedHidden: ["faut_pas_me_chauffer"],
  /* ── LE GABARIT DOIT PORTER CE QU'ON PRÉTEND MASQUER ──
     Revue du 2026-09-07. L'assertion « aucun nom de carte » ci-dessous est la
     bonne forme de test — elle relit TOUT ce qui part sur le fil — mais elle
     mordait dans le vide : le gabarit n'avait ni Zone Repos, ni cartes
     empruntées, ni journal, ni récapitulatif de vol. Trois fuites réelles
     passaient donc sous un test vert.

     Une carte de Zone Repos FACE CACHÉE est celle que la Fatigue vient
     d'arracher : l'interface la masque déjà aux adversaires, la donnée doit en
     faire autant. Une carte face visible, elle, est publique par définition. */
  repos: [
    { cardId: "graouhhh", faceUp: false, revientALaManche: 3 },
    /* Face VISIBLE : publique par définition, elle doit survivre au masquage.
       Son nom est une sentinelle et non une vraie carte, pour que l'assertion
       « aucun nom de carte » d'en dessous garde toute sa portée — les six
       vraies cartes servent déjà toutes ailleurs dans ce gabarit. */
    { cardId: "__carte_visible__", faceUp: true, revientALaManche: 3 },
  ],
  // Une carte empruntée vit dans la MAIN du voleur, qu'on vient de masquer.
  empruntees: [{ cardId: "boing_boing", proprietaire: 2, rendueALaManche: 3 }],
  ...extra,
});

const instantane = () => ({
  phase: "programmation",
  activePlayerId: 1,
  titanState: {
    players: [titan(1), titan(2), titan(3), titan(4)],
    ordreJeu: [1, 2, 3, 4],
    detonateur: 4,
  },
  state: { board: { A1: { blocks: ["bleu"] } } },
  looseBlocks: {},
  /* Le placement secret des Verts, et de quoi savoir s'il est encore secret.
     Tant que tout le monde n'a pas validé, il ne doit pas franchir le fil :
     il suffirait de le lire pour choisir le sien à coup sûr. */
  vertAssignments: { 1: [{ type: "color", target: "rouge" }], 2: [{ type: "adn", target: "bagarre" }] },
  vertsValides: {},
  table: { gameSeed: 1234567, titanProfiles: { 1: { temperament: "agressif" } } },
});

describe("Le plateau public ne porte aucune main", () => {
  it("vide les mains et les cartes programmées de TOUS les Titans", () => {
    const pub = plateauPublic(instantane());
    pub.titanState.players.forEach((t) => {
      expect(t.hand).toEqual([]);
      expect(t.programmed).toEqual([]);
    });
  });

  it("ne laisse passer AUCUN nom de carte, où qu'il soit", () => {
    /* Le test qui compte vraiment : on ne vérifie pas des champs un par un —
       une carte oubliée dans un recoin de l'instantané passerait au travers —
       on relit tout ce qui part sur le fil et on y cherche les noms de cartes.
       La défausse cachée en fait partie : elle porte son nom. */
    const surLeFil = JSON.stringify(plateauPublic(instantane()));
    ["tout_casser", "graouhhh", "boing_boing", "tete_en_avant",
      "je_ne_partage_pas", "faut_pas_me_chauffer"].forEach((carte) => {
      expect(surLeFil).not.toContain(carte);
    });
  });

  it("anonymise le placement des Verts tant que tout le monde n'a pas validé", () => {
    const avecVerts = instantane();
    avecVerts.titanState.players[0].repaire = ["vert"];
    const pub = plateauPublic(avecVerts);
    // Même nombre de jetons — l'écran doit pouvoir dire « 1 Vert placé » —
    // mais aucune destination lisible.
    expect(pub.vertAssignments[1]).toHaveLength(1);
    expect(JSON.stringify(pub.vertAssignments)).not.toContain("rouge");
    expect(JSON.stringify(pub.vertAssignments)).not.toContain("bagarre");
  });

  it("rend le détail des Verts une fois la table entièrement validée", () => {
    const fini = instantane();
    fini.titanState.players[0].repaire = ["vert"];
    fini.vertsValides = { 1: true };
    const pub = plateauPublic(fini);
    expect(pub.vertAssignments[1][0].target).toBe("rouge");
  });

  it("ne diffuse ni la graine ni les tempéraments d'IA", () => {
    /* La graine sème un générateur DÉTERMINISTE : la connaître, c'est
       anticiper quelle carte le Vol de Phase Repos prendra et laquelle la
       Fatigue arrachera. Un invité n'exécute aucun moteur, il n'en a aucun
       usage légitime. */
    const pub = plateauPublic(instantane());
    expect(pub.table?.gameSeed).toBeUndefined();
    expect(pub.table?.titanProfiles).toBeUndefined();
  });

  it("rend au propriétaire sa Zone Repos réelle et ses Verts", () => {
    const complet = instantane();
    const main = mainPrivee(complet, 2);
    expect(main.repos.map((e) => e.cardId)).toContain("graouhhh");
    expect(main.vertAssignments).toEqual([{ type: "adn", target: "bagarre" }]);
    const recolle = fusionnerMain(plateauPublic(complet), main);
    const sien = recolle.titanState.players.find((t) => t.id === 2);
    expect(sien.repos.map((e) => e.cardId)).toContain("graouhhh");
    expect(recolle.vertAssignments[2]).toEqual([{ type: "adn", target: "bagarre" }]);
    // Et le voisin, lui, reste masqué.
    const autre = recolle.titanState.players.find((t) => t.id === 3);
    expect(autre.repos.find((e) => !e.faceUp).cardId).toBe("?");
    // Et ce qui était face visible l'est resté, pour tout le monde.
    expect(autre.repos.find((e) => e.faceUp).cardId).toBe("__carte_visible__");
  });

  it("dit COMBIEN de cartes chacun tient, jamais lesquelles", () => {
    // L'information est légitime : à la table, on voit l'épaisseur d'une main.
    const pub = plateauPublic(instantane());
    pub.titanState.players.forEach((t) => {
      expect(t.nbMain).toBe(3);
      expect(t.nbProgrammees).toBe(2);
      expect(t.discardedHidden).toEqual(["?"]);
    });
  });

  it("laisse passer tout le reste du plateau, intact", () => {
    // Masquer plus que nécessaire casserait l'affichage sans rien protéger.
    const pub = plateauPublic(instantane());
    expect(pub.state.board.A1.blocks).toEqual(["bleu"]);
    expect(pub.titanState.detonateur).toBe(4);
    expect(pub.phase).toBe("programmation");
    pub.titanState.players.forEach((t) => expect(t.adrenaline).toBe(1));
  });

  it("ne modifie pas l'instantané de l'hôte", () => {
    /* L'hôte continue de jouer avec le sien : si `plateauPublic` mutait au lieu
       de copier, diffuser une seule fois viderait la main de l'hôte lui-même. */
    const source = instantane();
    plateauPublic(source);
    expect(source.titanState.players[0].hand).toHaveLength(3);
  });
});

describe("Le courrier privé porte une main, et une seule", () => {
  it("extrait la main du Titan demandé", () => {
    const main = mainPrivee(instantane(), 2);
    expect(main.titanId).toBe(2);
    expect(main.hand).toEqual(["tout_casser", "graouhhh", "boing_boing"]);
    expect(main.programmed).toEqual(["tete_en_avant", "je_ne_partage_pas"]);
  });

  it("accepte un identifiant en texte — il vient d'une clé d'objet", () => {
    // `Object.entries(sieges)` rend des clés en chaîne : « 2 », pas 2.
    expect(mainPrivee(instantane(), "3").titanId).toBe(3);
  });

  it("rend null pour un Titan qui n'existe pas", () => {
    expect(mainPrivee(instantane(), 9)).toBeNull();
  });
});

describe("L'invité recolle sa main sur le plateau reçu", () => {
  it("retrouve SA main, et celles des autres restent vides", () => {
    const pub = plateauPublic(instantane());
    const fusionne = fusionnerMain(pub, mainPrivee(instantane(), 2));
    const moi = fusionne.titanState.players.find((t) => t.id === 2);
    const autre = fusionne.titanState.players.find((t) => t.id === 3);
    expect(moi.hand).toEqual(["tout_casser", "graouhhh", "boing_boing"]);
    expect(autre.hand).toEqual([]);
    expect(autre.programmed).toEqual([]);
  });

  it("sans main privée, rend le plateau public tel quel", () => {
    // Un spectateur sans siège, ou un invité dont la main n'est pas encore
    // arrivée : il voit le plateau, pas de cartes, et rien ne casse.
    const pub = plateauPublic(instantane());
    expect(fusionnerMain(pub, null)).toEqual(pub);
  });
});

describe("L'adresse du relais se colle telle qu'on la reçoit", () => {
  it("ajoute le protocole absent et retire la barre finale", () => {
    expect(urlPropre("xyz.trycloudflare.com/")).toBe("https://xyz.trycloudflare.com");
    expect(urlPropre("  http://localhost:8787//  ")).toBe("http://localhost:8787");
  });

  it("refuse une adresse vide plutôt que d'appeler dans le vide", () => {
    expect(() => urlPropre("")).toThrow();
  });
});
