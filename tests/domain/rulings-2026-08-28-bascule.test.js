import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  projectInDirection,
  resolveTeteEnAvant,
  resolveToutCasserAmas,
  resolveBoingBoing,
} from "../../src/domain/gameRules.js";

/* ============================================================
   PROJET TITAN — Ruling du 2026-08-28 : un tas PERCUTÉ bascule
   ============================================================
   Nikola, après une charge restée sans effet : « je viens de charger un
   Titan qui était en H2, j'étais en H3, il y avait un tas de débris en H1 ;
   les débris auraient dû être warpés. On va appliquer la règle : si je
   percute un tas de débris ou fais percuter un tas, ça bascule dans le sens
   de percussion, plus besoin du Seuil 4, ça va fluidifier la partie. Si je
   saute dessus ça s'effondre, la nuance est importante. »

   DEUX GESTES À NE JAMAIS CONFONDRE, et c'est tout l'objet de ce fichier :
   · PERCUTER (charge, Titan projeté, Tout Casser) → le tas bascule DANS
     L'AXE, chaque débris partant d'autant de cases que sa hauteur.
   · SAUTER dessus (Boing Boing) → le tas s'ÉCROULE autour, sur les 8 cases
     voisines, au choix du joueur. Inchangé, et c'est ce que l'avant-dernier
     bloc protège : la nuance se perd en une ligne si on unifie les deux.
============================================================ */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

const jeu = (titans, looseBlocks = {}, board = {}) => ({
  board, titans, looseBlocks, replis: [], trajectoires: [],
});

describe("Une charge renverse le tas quelle que soit son énergie", () => {
  it("un tas percuté sous l'ancien Seuil 4 bascule au lieu de bloquer la charge", () => {
    /* Portée 3 sans Adrénaline : à distance 3, l'énergie retombe à 1 — très
       en dessous des 4 que l'ancienne règle exigeait. Le tas était alors
       déclaré « obstacle infranchissable » et la charge s'arrêtait devant
       sans rien déplacer. */
    const titan = t(1, "E1");
    const looseBlocks = { E4: ["bleu", "rose"] };
    const etat = jeu([titan], looseBlocks);

    const res = resolveTeteEnAvant(1, 0, 1, 0, etat); // vers l'est, sans Adrénaline

    expect(looseBlocks.E4).toBeUndefined();          // le tas a quitté sa case
    expect(titan.cell).toBe("E4");                   // et le chargeur la prend
    expect(res.log.join(" ")).not.toMatch(/infranchissable/);
  });

  it("les débris partent DEVANT, chacun d'autant de cases que sa hauteur", () => {
    // Tas de 2 en E4, charge vers l'est : le sommet part de 2 cases (E6), le
    // bloc du bas d'une seule (E5). C'est la signature d'une tour qui
    // bascule, et non d'une explosion.
    const titan = t(1, "E1");
    const looseBlocks = { E4: ["bleu", "rose"] };
    resolveTeteEnAvant(1, 0, 1, 0, jeu([titan], looseBlocks));

    expect(looseBlocks.E6).toEqual(["rose"]); // sommet, hauteur 2
    expect(looseBlocks.E5).toEqual(["bleu"]); // base, hauteur 1
  });

  it("aucun débris ne repart à contre-sens de la charge", () => {
    const titan = t(1, "E1");
    const looseBlocks = { E4: ["bleu", "rose", "orange"] };
    resolveTeteEnAvant(1, 0, 1, 0, jeu([titan], looseBlocks));

    // Tout ce qui est retombé doit être STRICTEMENT à l'est de E4.
    Object.keys(looseBlocks).forEach((cle) => {
      expect(Number(cle.slice(1))).toBeGreaterThan(4);
    });
  });
});

describe("Un Titan projeté sur un tas le renverse, il ne grimpe plus dessus", () => {
  it("le tas quitte sa case quand le Titan arrive avec de l'énergie", () => {
    /* C'est le cas exact remonté : le Titan percuté est projeté sur la case
       du tas. Il la traversait en montant dessus ; il doit la dégager. */
    const projete = t(2, "E4");
    const looseBlocks = { E5: ["bleu", "rose"] };
    const etat = jeu([projete], looseBlocks);

    projectInDirection("E", 4, 0, 1, 3, { ...etat, movingTitanId: 2, initiatorId: 1 });

    expect(looseBlocks.E5).toBeUndefined();
  });

  it("à bout de course il monte dessus au lieu de le renverser", () => {
    // Il faut de l'énergie pour renverser un tas, comme pour pousser un
    // débris isolé. Ce n'est pas le Seuil 4 déguisé : c'est le même test que
    // le reste de la trajectoire applique déjà partout.
    const projete = t(2, "E4");
    const looseBlocks = { E5: ["bleu", "rose"] };
    const etat = jeu([projete], looseBlocks);

    projectInDirection("E", 4, 0, 1, 1, { ...etat, movingTitanId: 2, initiatorId: 1 });

    expect(looseBlocks.E5).toEqual(["bleu", "rose"]);
  });

  it("un DÉBRIS en vol, lui, s'empile toujours — le béton s'empile, le Titan bouscule", () => {
    /* Ruling du 2026-08-18, que celui du 28 ne touche pas. `projectInDirection`
       ne POSE rien : elle rend le point de chute, que l'appelant utilise. On
       vérifie donc que le débris s'arrête SUR le tas (E5) et que le tas n'a
       pas bougé — c'était toute la différence avec le Titan. */
    const looseBlocks = { E5: ["bleu", "rose"] };
    const etat = jeu([], looseBlocks);

    const landing = projectInDirection("E", 4, 0, 1, 3, { ...etat, movingTitanId: null, initiatorId: 1 });

    expect(landing.row + landing.col).toBe("E5");
    expect(looseBlocks.E5).toEqual(["bleu", "rose"]);
  });
});

describe("Tout Casser fait basculer les tas de son Périmètre sans Seuil 4", () => {
  it("un tas adjacent bascule même à énergie faible", () => {
    /* Un seul élément dans le Périmètre : l'énergie de la carte reste très
       en dessous de 4, et le sous-cas Amas ne se déclenchait donc jamais. */
    const titan = t(1, "E5");
    const looseBlocks = { E6: ["bleu", "rose"] };
    const etat = jeu([titan], looseBlocks);

    const res = resolveToutCasserAmas(1, etat, 0);

    expect(res.energie).toBeLessThan(4);
    expect(looseBlocks.E6).toBeUndefined();
  });
});

describe("SAUTER dessus reste un écroulement, pas une bascule", () => {
  it("Boing Boing sur un tas rend un écroulement à répartir", () => {
    /* La nuance que Nikola a explicitement demandé de préserver. Le
       résolveur ne distribue rien lui-même : il RENVOIE l'écroulement, que
       l'appelant résout une fois le joueur consulté. Un tas qui aurait
       basculé aurait déjà quitté la case, et `ecroulement` serait absent. */
    const sauteur = t(1, "E4");
    const looseBlocks = { E5: ["bleu", "rose"] };
    const etat = jeu([sauteur], looseBlocks);

    const res = resolveBoingBoing(1, "E5", 0, 1, etat);

    expect(res.applied).toBe(true);
    expect(res.ecroulement).toBeTruthy();
    expect(res.ecroulement.cellKey).toBe("E5");
    expect(res.ecroulement.blocs.length).toBe(2);
  });
});

describe("La règle vit au même endroit partout", () => {
  const lire = (rel) => readFileSync(resolve(process.cwd(), rel), "utf8");

  it("les trois sites de bascule passent par la même fonction", () => {
    /* Ils ont DÉJÀ divergé une fois, sur le sens de la projection : deux
       partaient à contre-sens de la percussion, corrigés séparément le
       2026-08-19. Une seule implémentation ferme le sujet. */
    const src = lire("src/domain/gameRules.js");
    const appels = src.match(/basculerAmasDansLAxe\(/g) || [];
    // 1 déclaration + 3 sites (charge, chaîne, Tout Casser).
    expect(appels.length).toBeGreaterThanOrEqual(4);
    // L'ancien refus (« obstacle infranchissable ») ne doit plus être écrit
    // au journal. On vise l'appel `log.push`, pas la phrase : elle survit
    // légitimement dans le commentaire qui explique ce qui a changé.
    expect(src).not.toMatch(/log\.push\([^)]*obstacle infranchissable/);
  });

  it("les règles affichées ne conditionnent plus le Patatras au Seuil 4", () => {
    const src = lire("src/ui/rules/rulesContent.js");
    expect(src).not.toContain("Amas (Seuil 4)");
  });

  it("le livret non plus", () => {
    const livret = lire("docs/livret/ProjetTitan_Livret.html");
    expect(livret).toMatch(/PERCUTÉE par une action/);
  });
});

/* ============================================================
   Ruling du 2026-08-28 : l'Adrénaline refuse une Fatigue
   ============================================================
   Nikola : « l'Adrénaline permet de refuser une Fatigue, comme tu me l'as
   conseillé. »

   À noter, et c'est ce que le dernier bloc vérifie : LE LIVRET LE DISAIT DÉJÀ.
   « Défense : 1 adrénaline » figure dans son glossaire, et sa règle du hors-tour
   cite explicitement « dépense d'Adrénaline pour annuler un vol / DIL /
   Fatigue ». C'est le moteur qui ne l'appliquait pas — la divergence habituelle
   de ce projet, mais dans l'autre sens.
============================================================ */
describe("Une Fatigue peut être refusée contre 1 Adrénaline", () => {
  it("le refus rend la carte, et le jeton passe à l'attaquant", async () => {
    const { resolveFatigue, refuserFatigue } = await import("../../src/domain/gameRules.js");
    const cible = t(2, "E5", { hand: ["tout_casser", "graouhhh"], adrenaline: 2 });
    const attaquant = t(1, "E4", { adrenaline: 0 });
    const joueurs = [attaquant, cible];

    const fatigue = resolveFatigue(1, 2, 1, joueurs);
    expect(fatigue.ok).toBe(true);
    expect(fatigue.refusable).toBe(true);
    expect(cible.repos).toHaveLength(1);

    const refus = refuserFatigue(1, 2, fatigue.cardId, joueurs);
    expect(refus.ok).toBe(true);
    expect(cible.repos).toHaveLength(0);
    expect(cible.hand).toContain(fatigue.cardId);
    // Le jeton PASSE, il ne s'évapore pas — même correction que sur le DIL.
    expect(cible.adrenaline).toBe(1);
    expect(attaquant.adrenaline).toBe(1);
  });

  it("sans Adrénaline, la Fatigue n'est pas refusable", async () => {
    const { resolveFatigue, refuserFatigue } = await import("../../src/domain/gameRules.js");
    const cible = t(2, "E5", { hand: ["tout_casser"], adrenaline: 0 });
    const joueurs = [t(1, "E4"), cible];

    const fatigue = resolveFatigue(1, 2, 1, joueurs);
    expect(fatigue.refusable).toBe(false);
    expect(refuserFatigue(1, 2, fatigue.cardId, joueurs).ok).toBe(false);
    expect(cible.repos).toHaveLength(1); // elle encaisse
  });

  it("le tirage a lieu AVANT le choix : la cible sait ce qu'elle perd", async () => {
    /* La carte est déjà en Zone Repos quand le refus est proposé, et
       `resolveFatigue` renvoie son identifiant. Sans ça, refuser reviendrait à
       parier sur une carte inconnue — ce n'est pas une décision. */
    const { resolveFatigue } = await import("../../src/domain/gameRules.js");
    const cible = t(2, "E5", { hand: ["graouhhh"], adrenaline: 1 });
    const fatigue = resolveFatigue(1, 2, 1, [t(1, "E4"), cible]);
    expect(fatigue.cardId).toBe("graouhhh");
  });

  it("les règles affichées annoncent la défense", async () => {
    const src = readFileSync(resolve(process.cwd(), "src/ui/rules/rulesContent.js"), "utf8");
    const entree = src.split(/\r?\n/).find((l) => l.includes('nom: "Fatigue"'));
    expect(entree).toMatch(/1 Adr\u00e9naline/);
  });
});

/* ============================================================
   Ruling du 2026-08-28 : Tout Casser perd sa RAGE
   ============================================================
   Nikola : « on va modifier Tout Casser : en dessous du Seuil 4, déplacement,
   gain piste Bagarre, mais aucun vol ; 4 ou au-dessus, DIL — il n'y a pas de
   RAGE. »

   La carte avait le barème le plus dur du jeu : elle frappe jusqu'à huit cases
   à la fois, et chacune ouvrait un vol. Elle prend le profil inverse des cartes
   dirigées — LARGE mais moins tranchante.

   Le Seuil 4 change donc de rôle ICI : il ne départage plus DIL et RAGE, il
   décide s'il y a un vol ou pas. C'est le deuxième rôle qu'il perd dans la
   journée, après le Patatras.
============================================================ */
describe("Tout Casser : aucun vol sous le Seuil 4, un Dilemme au-dessus", () => {
  const cible = () => t(2, "E6", { repaire: ["bleu", "rose"] });

  it("sous le seuil : la cible est déplacée et rapporte une Bagarre, sans rien perdre", async () => {
    const { resolveToutCasser } = await import("../../src/domain/gameRules.js");
    const attaquant = t(1, "E5");
    const victime = cible();
    const res = resolveToutCasser(1, { board: {}, looseBlocks: {}, titans: [attaquant, victime] });

    expect(res.seuil4).toBe(false);
    expect(res.decisions).toHaveLength(0);   // aucun vol, ni DIL ni RAGE
    expect(victime.cell).not.toBe("E6");     // mais elle bouge
    expect(attaquant.bagarre).toBe(1);       // et ça marque
    expect(victime.repaire).toEqual(["bleu", "rose"]); // rien ne lui est pris
  });

  it("au-dessus du seuil : un Dilemme, jamais une RAGE", async () => {
    const { resolveToutCasser } = await import("../../src/domain/gameRules.js");
    const victime = cible();
    const looseBlocks = { D4: ["bleu"], D5: ["rose"], D6: ["orange"], E4: ["rouge"] };
    const res = resolveToutCasser(1, { board: {}, looseBlocks, titans: [t(1, "E5"), victime] });

    expect(res.seuil4).toBe(true);
    const types = res.decisions.map((d) => d.type);
    expect(types).toContain("DIL");
    expect(types).not.toContain("RAGE");
  });

  it("plus aucune RAGE de Tout Casser nulle part dans le moteur", () => {
    const src = readFileSync(resolve(process.cwd(), "src/domain/gameRules.js"), "utf8");
    expect(src).not.toMatch(/makeDecisionRequest\("RAGE"[^)]*"Tout Casser"/);
  });

  it("les règles et le livret disent la même chose", () => {
    /* Portée limitée à la fiche de TOUT CASSER : Tête en Avant et Boing Boing
       gardent leur RAGE, c'est même ce qui les distingue désormais de cette
       carte-ci. Un `not.toMatch` sur le fichier entier interdirait la RAGE
       partout, ce que le ruling ne dit pas. */
    const regles = readFileSync(resolve(process.cwd(), "src/ui/rules/rulesContent.js"), "utf8");
    const fiche = regles.slice(regles.indexOf('nom: "Tout Casser"'), regles.indexOf('nom: "Tête en Avant"'));
    expect(fiche).toMatch(/AUCUN vol/);
    // On interdit la PROMESSE d'une RAGE, pas le mot : la fiche dit
    // justement « cette carte n'a pas de RAGE », et c'est ce qu'on veut lire.
    expect(fiche).not.toMatch(/ou RAGE|RAGE au Seuil/);

    const livret = readFileSync(resolve(process.cwd(), "docs/livret/ProjetTitan_Livret.html"), "utf8");
    // La ligne « Titan » de la matrice Tout Casser ne porte plus de badge RAGE.
    const matrice = livret.slice(livret.indexOf("01 TOUT CASSER"), livret.indexOf("02 TÊTE EN AVANT"));
    expect(matrice).not.toMatch(/b-rage/);
  });
});
