import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getBoingBoingReach,
  getCasesRepliDebris,
  getMovementReachable,
  projectInDirection,
  rentrerEnJeu,
  resolveFreeMovement,
  resolveTeteEnAvant,
} from "../../src/domain/gameRules.js";

/* Ruling des 2026-08-27 et 2026-08-28, à lire ensemble parce que le second
   corrige la lecture du premier.

   27 août : « un Titan ne peut pas cohabiter avec une tour de débris ». Lu
   comme une règle d'OBSTACLE — un Amas bloque le passage et l'arrêt. C'était
   faux, et une passe entière a été écrite dessus.

   28 août, précision de Nikola : « si un Titan peut cohabiter avec une tour
   de débris, il peut également se déplacer volontairement dessus grâce à son
   passif. En revanche, si le déplacement n'est pas effectué volontairement
   via son passif, la tour bascule, comme lorsque j'ai joué une action dessus
   ou lorsqu'un autre effet m'a projeté dessus. »

   C'est donc une règle d'ARRIVÉE, pas d'obstacle :
   · j'y monte par mon Mouvement gratuit, j'y reste, la tour tient ;
   · j'y arrive projeté ou par l'effet d'une carte, la tour BASCULE.

   Ces tests verrouillent les deux moitiés. La première est la plus
   importante à garder : c'est celle qui a été cassée en croyant appliquer la
   règle. */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

const amas = (cle, n = 2) => ({ [cle]: Array(n).fill("bleu") });

describe("Le déplacement VOLONTAIRE monte sur la tour (2026-08-28)", () => {
  it("un Titan s'arrête sur un Amas avec son Mouvement gratuit", () => {
    const titan = t(1, "E5");
    const jeu = { titans: [titan], looseBlocks: amas("E6", 2), board: {} };
    const res = resolveFreeMovement(1, "E6", jeu);
    expect(titan.cell).toBe("E6");
    expect(res.log.join(" ")).not.toMatch(/bloqu/i);
  });

  it("la tour reste debout sous lui : il l'a choisie", () => {
    const titan = t(1, "E5");
    const jeu = { titans: [titan], looseBlocks: amas("E6", 3), board: {} };
    resolveFreeMovement(1, "E6", jeu);
    expect(jeu.looseBlocks.E6).toHaveLength(3);
  });

  it("s'y arrêter ne ramasse toujours rien", () => {
    const titan = t(1, "E5");
    const jeu = { titans: [titan], looseBlocks: amas("E6", 2), board: {} };
    resolveFreeMovement(1, "E6", jeu);
    expect(titan.repaire).toEqual([]);
  });

  it("un Amas ne bloque ni la portée ni le passage", () => {
    const { reachable } = getMovementReachable("E5", 2, {}, {}, amas("E6", 4));
    expect(reachable.has("E6")).toBe(true);
    expect(reachable.has("E7")).toBe(true); // on traverse la tour
  });

  it("la rentrée sur le plateau peut se faire sur un Amas", () => {
    const titan = t(1, "A1", { horsPlateau: true });
    const retour = rentrerEnJeu(1, {
      board: {}, titans: [titan], looseBlocks: amas("A1", 2),
    }, { choisirAuto: true });
    expect(retour.cellule).toBe("A1");
  });

  it("le repli propose toujours une case portant un Amas", () => {
    /* La case choisie est D5, pas D6 : depuis la correction des cases de
       repli du 2026-08-28, une case qui a progressé sur l'axe du mouvement
       est derrière l'obstacle et n'est plus proposée. Ce que ce test
       vérifie est l'Amas, pas la géométrie — on prend donc une case qui
       reste dans la liste. */
    const cases = getCasesRepliDebris("E5", "E6", 0, 1, {
      board: {}, looseBlocks: amas("D5", 2),
      titans: [t(1, "E5")], movingTitanId: 1, initiatorId: 2,
    });
    expect(cases).toContain("D5");
  });

  it("Boing Boing atterrit sur un Amas — c'est ce qui déclenche l'Écroulement", () => {
    const reach = getBoingBoingReach("E5", 3, {
      board: {}, looseBlocks: amas("E6", 2), titans: [],
    });
    expect(reach.has("E6")).toBe(true);
  });

  it("Boing Boing n'atterrit jamais sur un bâtiment debout", () => {
    const reach = getBoingBoingReach("E5", 3, {
      board: { E6: { row: "E", col: 6, blocks: ["bleu"], socle: 1, isTeleporter: false } },
      looseBlocks: {}, titans: [],
    });
    expect(reach.has("E6")).toBe(false);
  });
});

describe("L'arrivée SUBIE fait basculer la tour (2026-08-28)", () => {
  it("une charge qui pousse un Titan sur une tour la fait basculer", () => {
    /* Titan 1 charge vers l'est depuis E4, percute Titan 2 en E5 et prend sa
       place ; Titan 2 part vers E6, où une tour de 2 débris l'attend. Il n'a
       rien choisi : elle bascule, et ses débris se répartissent autour. */
    const attaquant = t(1, "E4");
    const cible = t(2, "E5");
    const jeu = {
      board: {}, titans: [attaquant, cible],
      looseBlocks: amas("E6", 2), replis: [], trajectoires: [],
    };
    const res = resolveTeteEnAvant(1, 0, 1, false, jeu);
    expect(res.log.join(" ")).toMatch(/bascule/i);
    // La case de la tour ne porte plus la pile : elle est tombée autour.
    expect((jeu.looseBlocks.E6 || []).length).toBeLessThan(2);
  });

  it("un Titan projeté ne s'arrête plus devant la tour, il s'y pose", () => {
    const vole = t(2, "E5");
    const jeu = { board: {}, titans: [vole], looseBlocks: amas("E7", 2) };
    const landing = projectInDirection("E", 5, 0, 1, 3, {
      ...jeu, log: [], movingTitanId: 2,
    });
    expect(landing.row + landing.col).toBe("E7");
  });

  it("un DÉBRIS projeté s'arrête sur l'Amas : la Formation d'Amas ne change pas", () => {
    /* `projectInDirection` ne pose pas le débris, elle rend son point de
       chute — c'est l'appelant qui empile. Ce qui se vérifie ici est donc
       que le point de chute est bien la case de la tour, et pas celle
       d'avant. */
    const looseBlocks = amas("E7", 2);
    const landing = projectInDirection("E", 5, 0, 1, 3, {
      board: {}, looseBlocks, titans: [], movingTitanId: null,
    });
    expect(landing.row + landing.col).toBe("E7");
    expect(looseBlocks.E7).toHaveLength(2);
  });
});

describe("La règle et l'écriture d'un débris ne vivent qu'à un endroit", () => {
  const lireMoteur = () =>
    readFileSync(resolve(process.cwd(), "src/domain/gameRules.js"), "utf8");

  it("le seuil d'Amas est nommé une seule fois", () => {
    const src = lireMoteur();
    expect(src).toContain("function estAmas");
    expect(src.match(/length >= TAILLE_AMAS/g)).toHaveLength(1);
  });

  it("une seule ligne écrit un débris au sol", () => {
    /* Onze `looseBlocks[k].push()` vivaient à la main dans le moteur. La
       bascule n'en dépend plus, mais le point d'entrée unique reste : la
       prochaine règle qui touchera la pose d'un débris n'aura qu'un endroit
       à modifier. */
    const src = lireMoteur();
    expect(src).toContain("function poserDebrisAuSol");
    expect(src.match(/^\s*looseBlocks\[\w+\]\.push\(/gm)).toHaveLength(1);
  });

  it("la bascule est branchée sur tous les résolveurs de carte", () => {
    /* Un Titan debout sur un Amas à la fin d'une carte y est arrivé subi :
       le seul chemin volontaire est `resolveFreeMovement`, qui n'appelle
       aucun résolveur. Chaque carte doit donc fermer par la bascule — si ce
       compte baisse, une carte a été oubliée. */
    const src = lireMoteur();
    const appels = src.match(/\bbasculerToursSousTitans\(/g) || [];
    expect(appels.length).toBeGreaterThanOrEqual(8);
  });
});
