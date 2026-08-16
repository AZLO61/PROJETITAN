import { describe, expect, it } from "vitest";
import {
  getBoingBoingReach,
  resolveBoingBoing,
  resolveTeteEnAvant,
  resolveGraouhhh,
  resolveFautPasMeChauffer,
  resolveToutCasser,
  destinationBlocPerdu,
  DESTINATION_BLOC_PERDU,
  PORTEE_BOING_BOING,
  canDil,
  getDilOptions,
  retirerSocleAuSort,
  SOCLE_OPTION,
  isSocleMarker,
  socleValue,
  getCasesRepliDebris,
  projectInDirection,
} from "../../src/domain/gameRules.js";
import { setSeed } from "../../src/domain/rng.js";
import { choisirRepliIA, appliquerRepli } from "../../src/domain/aiPlanner.js";
import { FORCES, TEMPERAMENTS, makeProfile } from "../../src/domain/aiEvaluation.js";

/* Rulings et corrections du 2026-08-17, remontés par Nikola en test à la
   table. Le README impose un test par règle modifiée : c'est ce fichier qui
   les verrouille.

   Deux sujets distincts :
   · la règle « Éléments collés = 1 seule case » de Boing Boing, écrite au
     livret depuis la V36 mais jamais implémentée ;
   · `cellAtImpact`, qui fige la case de la victime AU MOMENT DE L'IMPACT
     pour que le bloc perdu en DIL tombe là, et non sur sa case d'arrivée
     après projection. */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

// Bâtiment debout : bloque l'atterrissage, sert de saute-mouton en vol.
const bat = (cle, etages = 2) => ({
  [cle]: { row: cle[0], col: Number(cle.slice(1)), blocks: Array(etages).fill("bleu"), socle: etages, isTeleporter: false },
});

const plateau = (...batiments) => Object.assign({}, ...batiments);

describe("Boing Boing — « Éléments collés = 1 seule case » (livret V36.2)", () => {
  it("un mur de trois bâtiments accolés ne coûte qu'une seule case de saut", () => {
    // Titan en A1. A2·A3·A4 sont trois bâtiments COLLÉS : ils comptent pour
    // 1 case à eux trois. A5 est donc à distance 2 et A6 à distance 3, alors
    // qu'une distance de Chebyshev les mettait à 4 et 5 — hors de portée.
    const board = plateau(bat("A2"), bat("A3"), bat("A4"));
    const titans = [t(1, "A1")];
    const reach = getBoingBoingReach("A1", PORTEE_BOING_BOING, { board, looseBlocks: {}, titans });

    expect(reach.get("A5")).toBe(2);
    expect(reach.get("A6")).toBe(3);
  });

  it("sans obstacle, la portée reste celle de Chebyshev", () => {
    // Garde-fou : la règle des contigus ne doit RIEN changer sur un plateau
    // dégagé, sans quoi elle allongerait la portée de base de la carte.
    const titans = [t(1, "E5")];
    const reach = getBoingBoingReach("E5", PORTEE_BOING_BOING, { board: {}, looseBlocks: {}, titans });

    expect(reach.get("E6")).toBe(1);
    expect(reach.get("E7")).toBe(2);
    expect(reach.get("E8")).toBe(3);
    expect(reach.has("E9")).toBe(false); // distance 4, hors de portée
  });

  it("le groupe collé mélange bâtiments, débris au sol et Titans", () => {
    // Arbitrage Nikola du 2026-08-17 : « tout obstacle bloquant ». Le groupe
    // A2[bâtiment] · A3[débris] · A4[Titan] compte pour 1 seule case.
    const board = plateau(bat("A2"));
    const titans = [t(1, "A1"), t(2, "A4")];
    const reach = getBoingBoingReach("A1", PORTEE_BOING_BOING, {
      board, looseBlocks: { A3: ["rose"] }, titans,
    });

    expect(reach.get("A5")).toBe(2);
    expect(reach.get("A6")).toBe(3);
  });

  it("deux obstacles SÉPARÉS par une case libre coûtent bien deux cases", () => {
    // La règle dit « collés ». Un obstacle isolé ne fusionne avec rien et
    // garde son coût plein : c'est ce qui empêche la règle de transformer
    // n'importe quel plateau encombré en portée illimitée.
    const board = plateau(bat("A2"), bat("A4"));
    const titans = [t(1, "A1")];
    const reach = getBoingBoingReach("A1", PORTEE_BOING_BOING, { board, looseBlocks: {}, titans });

    // A2 coûte 1, A3 (libre) coûte 1, A4 coûte 1 → A5 est à 4, hors portée.
    expect(reach.get("A3")).toBe(2);
    expect(reach.has("A5")).toBe(false);
  });

  it("un bâtiment encore debout n'est jamais une destination", () => {
    // Saute-mouton autorisé en vol, atterrissage interdit dessus.
    const board = plateau(bat("A2"));
    const titans = [t(1, "A1")];
    const reach = getBoingBoingReach("A1", PORTEE_BOING_BOING, { board, looseBlocks: {}, titans });

    expect(reach.has("A2")).toBe(false);
  });

  it("une case occupée par un Titan RESTE une destination valide", () => {
    // Livret carte 04 : « Titan présent → DIL, projeté de la valeur
    // restante, +1 Bagarre ». L'interface refusait ce clic (bug remonté :
    // « je ne peux pas sauter sur un Titan alors qu'il est seul sur sa
    // case »), alors que c'est l'effet principal de la carte.
    const titans = [t(1, "E5"), t(2, "E6")];
    const reach = getBoingBoingReach("E5", PORTEE_BOING_BOING, { board: {}, looseBlocks: {}, titans });

    expect(reach.has("E6")).toBe(true);
  });

  it("le résolveur accepte une destination ouverte par la règle des contigus", () => {
    // Bout en bout : ce que la portée annonce, le résolveur l'applique.
    const board = plateau(bat("A2"), bat("A3"), bat("A4"));
    const titans = [t(1, "A1")];
    const res = resolveBoingBoing(1, "A6", 0, 1, { board, looseBlocks: {}, titans });

    expect(res.applied).toBe(true);
    expect(titans[0].cell).toBe("A6");
  });

  it("le résolveur refuse toujours une destination réellement hors de portée", () => {
    const titans = [t(1, "E5")];
    const res = resolveBoingBoing(1, "E9", 0, 1, { board: {}, looseBlocks: {}, titans });

    expect(res.applied).toBe(false);
    expect(titans[0].cell).toBe("E5");
  });

  it("chaque Adrénaline dépensée ajoute bien une case", () => {
    const titans = [t(1, "E5", { adrenaline: 1 })];
    const sansMise = getBoingBoingReach("E5", PORTEE_BOING_BOING, { board: {}, looseBlocks: {}, titans });
    const avecMise = getBoingBoingReach("E5", PORTEE_BOING_BOING + 1, { board: {}, looseBlocks: {}, titans });

    expect(sansMise.has("E9")).toBe(false);
    expect(avecMise.get("E9")).toBe(4);
  });
});

describe("cellAtImpact — le bloc perdu tombe sur la case d'impact", () => {
  /* Ruling Nikola du 2026-08-17 : « quand un Titan doit perdre un bloc sans
     être pris par le Titan initiateur, il le perd sur la case où il est, et
     ensuite il est déplacé si besoin par rapport à l'action. »

     Les résolveurs projettent la victime IMMÉDIATEMENT et n'enfilent que la
     demande de décision. Sans `cellAtImpact`, le contrôleur ne dispose plus,
     au moment où le joueur clique la couleur perdue, que de la case
     d'ARRIVÉE — le bloc serait tombé au mauvais endroit. */

  it("Faut Pas Me Chauffer fige la case d'avant projection", () => {
    const attaquant = t(1, "E4", { repaire: ["bleu", "bleu", "bleu"], programmed: ["tout_casser", "tout_casser", "tout_casser"] });
    const cible = t(2, "E5", { repaire: ["bleu", "rose"], programmed: [] });
    const titans = [attaquant, cible];

    const res = resolveFautPasMeChauffer(1, 2, 1, { board: {}, looseBlocks: {}, titans });

    expect(res.decisions).toHaveLength(1);
    // La cible a bougé…
    expect(cible.cell).not.toBe("E5");
    // …mais la décision garde la case où elle a encaissé le coup.
    expect(res.decisions[0].cellAtImpact).toBe("E5");
  });

  it("Graouhhh fige la case d'avant recul", () => {
    const titans = [
      t(1, "E4", { repaire: [] }),
      t(2, "E5", { repaire: ["bleu", "rose"], hand: ["boing_boing"] }),
    ];
    const res = resolveGraouhhh(1, 0, 1, 1, { board: {}, looseBlocks: {}, titans });
    const dil = (res.decisions || []).find((d) => d.type === "DIL");

    expect(dil).toBeDefined();
    expect(dil.cellAtImpact).toBe("E5");
    expect(titans[1].cell).not.toBe("E5");
  });

  it("Tête en Avant fige la case percutée", () => {
    const titans = [
      t(1, "E4", { repaire: [] }),
      t(2, "E5", { repaire: ["bleu", "rose"] }),
    ];
    const res = resolveTeteEnAvant(1, 0, 1, 0, { board: {}, looseBlocks: {}, titans });
    const decision = (res.decisions || [])[0];

    expect(decision).toBeDefined();
    expect(decision.cellAtImpact).toBe("E5");
  });

  it("Boing Boing fige la case d'atterrissage, celle de l'occupant percuté", () => {
    const titans = [
      t(1, "E4", { repaire: [] }),
      t(2, "E5", { repaire: ["bleu", "rose"], hand: ["graouhhh"] }),
    ];
    const res = resolveBoingBoing(1, "E5", 0, 1, { board: {}, looseBlocks: {}, titans });
    const dil = (res.decisions || []).find((d) => d.type === "DIL");

    expect(dil).toBeDefined();
    expect(dil.cellAtImpact).toBe("E5");
    // L'attaquant prend la place, l'occupant est projeté ailleurs.
    expect(titans[0].cell).toBe("E5");
    expect(titans[1].cell).not.toBe("E5");
  });

  it("Tout Casser fige la case de chaque cible du Périmètre", () => {
    const titans = [
      t(1, "E5", { repaire: [] }),
      t(2, "E6", { repaire: ["bleu", "rose"] }),
    ];
    const res = resolveToutCasser(1, { board: {}, looseBlocks: {}, titans });
    const decision = (res.decisions || [])[0];

    expect(decision).toBeDefined();
    expect(decision.cellAtImpact).toBe("E6");
  });

  it("chaque décision porte la destination du bloc perdu", () => {
    // La destination est figée par le domaine à la création de la demande.
    // Le contrôleur ne fait que l'appliquer : s'il devait la redéduire lui
    // même, on retomberait sur le « DIL au sol, RAGE au Repaire » générique,
    // faux sur trois cartes sur cinq.
    const titans = [
      t(1, "E4", { repaire: [] }),
      t(2, "E5", { repaire: ["bleu", "rose"] }),
    ];
    const res = resolveTeteEnAvant(1, 0, 1, 0, { board: {}, looseBlocks: {}, titans });

    expect(res.decisions[0].destination).toBe("sol"); // TEA sous le Seuil 4 → DIL
  });

  it("toute décision produite porte une case d'impact exploitable", () => {
    // Garde-fou transversal : une décision sans `cellAtImpact` ferait
    // retomber le contrôleur sur la case d'ARRIVÉE de la victime, soit
    // exactement le bug que ce ruling corrige. Aucun résolveur ne doit en
    // émettre une.
    const titans = [
      t(1, "E4", { repaire: [] }),
      t(2, "E5", { repaire: ["bleu", "rose"], hand: ["graouhhh"] }),
    ];
    const res = resolveTeteEnAvant(1, 0, 1, 0, { board: {}, looseBlocks: {}, titans });

    (res.decisions || []).forEach((d) => {
      expect(typeof d.cellAtImpact).toBe("string");
      expect(d.cellAtImpact).toMatch(/^[A-I][1-9]$/);
    });
  });
});

describe("destination du bloc perdu — arbitrage carte par carte", () => {
  /* Arbitrage de Nikola du 2026-08-17, pris carte par carte. Il n'y a
     volontairement PAS de règle générale : deux cartes traitent la même
     RAGE différemment. Ce tableau est donc la seule source de vérité, et
     ces tests sont là pour qu'un futur « simplifions, DIL au sol et RAGE au
     Repaire » ne puisse pas passer inaperçu. */

  it("Tout Casser : DIL et RAGE tombent tous les deux au sol", () => {
    // Frappe tout le Périmètre sans bouger : les blocs s'éparpillent autour
    // de l'attaquant, qui ne pourra en ramasser qu'un.
    expect(destinationBlocPerdu("Tout Casser", "DIL")).toBe("sol");
    expect(destinationBlocPerdu("Tout Casser", "RAGE")).toBe("sol");
  });

  it("Tête en Avant : DIL au sol, RAGE dans le Repaire de l'attaquant", () => {
    // La charge physique arrache le bloc au Seuil 4.
    expect(destinationBlocPerdu("Tête en Avant", "DIL")).toBe("sol");
    expect(destinationBlocPerdu("Tête en Avant", "RAGE")).toBe("repaire");
  });

  it("Graouhhh : DIL au sol, et aucune RAGE possible", () => {
    // Aucune ligne Seuil 4 au livret, et aucune Adrénaline dépensable sur
    // cette carte : la RAGE n'y est pas seulement absente, elle est
    // structurellement inatteignable.
    expect(destinationBlocPerdu("Graouhhh", "DIL")).toBe("sol");
    expect(DESTINATION_BLOC_PERDU["Graouhhh"].RAGE).toBeUndefined();
  });

  it("Boing Boing : DIL au sol, RAGE dans le Repaire de l'attaquant", () => {
    expect(destinationBlocPerdu("Boing Boing", "DIL")).toBe("sol");
    expect(destinationBlocPerdu("Boing Boing", "RAGE")).toBe("repaire");
  });

  it("Faut Pas Me Chauffer : tout revient à l'attaquant", () => {
    // Bras de fer gagné de haute lutte : victoire comme égalité, le bloc
    // passe dans le Repaire de l'attaquant.
    expect(destinationBlocPerdu("Faut Pas Me Chauffer", "DIL")).toBe("repaire");
    expect(destinationBlocPerdu("Faut Pas Me Chauffer", "RAGE")).toBe("repaire");
  });

  it("une carte inconnue retombe au sol, jamais dans un Repaire", () => {
    // Le défaut sûr : un bloc mal routé au sol reste dans la partie et se
    // rattrape, un bloc mal routé dans un Repaire est un point volé à tort.
    expect(destinationBlocPerdu("Carte Inexistante", "RAGE")).toBe("sol");
  });

});

describe("Boing Boing — RAGE au Seuil 4 (ruling Nikola du 2026-08-17)", () => {
  /* La carte avait bien une ligne Seuil 4 au livret V36.2, mais son effet
     annoncé (« Tombe sur la case ») était appliqué de toute façon en
     permanence par le résolveur : le palier ne changeait rigoureusement
     rien. Il badge désormais une RAGE.

     L'équilibrage tient à la formule d'énergie, `3 + Adrénaline −
     (distance − 1)` : sans Adrénaline le maximum est 3, donc le Seuil 4 est
     strictement inaccessible gratuitement. C'est l'argument de Nikola, et
     ces tests le verrouillent — si la formule ou la portée bougent un jour,
     la RAGE gratuite réapparaîtrait sans que personne ne le voie. */

  const cible = (cell) => t(2, cell, { repaire: ["bleu", "rose"], hand: ["graouhhh"] });

  it("sans Adrénaline, le Seuil 4 est inatteignable : c'est un DIL", () => {
    const titans = [t(1, "E4"), cible("E5")]; // distance 1, énergie 3
    const res = resolveBoingBoing(1, "E5", 0, 1, { board: {}, looseBlocks: {}, titans });
    const decision = (res.decisions || [])[0];

    expect(decision.type).toBe("DIL");
    expect(decision.destination).toBe("sol");
  });

  it("avec 1 Adrénaline sur une case adjacente, le Seuil 4 passe : c'est une RAGE", () => {
    const titans = [t(1, "E4", { adrenaline: 1 }), cible("E5")]; // énergie 4
    const res = resolveBoingBoing(1, "E5", 1, 1, { board: {}, looseBlocks: {}, titans });
    const decision = (res.decisions || [])[0];

    expect(decision.type).toBe("RAGE");
    expect(decision.destination).toBe("repaire");
  });

  it("le coût en Adrénaline monte avec la distance sautée", () => {
    // Distance 2 avec 1 seule Adrénaline : énergie 4 − 1 = 3, pas de Seuil 4.
    const titans = [t(1, "E4", { adrenaline: 2 }), cible("E6")];
    const res = resolveBoingBoing(1, "E6", 1, 1, { board: {}, looseBlocks: {}, titans });
    expect((res.decisions || [])[0].type).toBe("DIL");

    // Avec 2 Adrénalines : énergie 5 − 1 = 4, le Seuil 4 passe.
    const titans2 = [t(1, "E4", { adrenaline: 2 }), cible("E6")];
    const res2 = resolveBoingBoing(1, "E6", 2, 1, { board: {}, looseBlocks: {}, titans: titans2 });
    expect((res2.decisions || [])[0].type).toBe("RAGE");
  });

  it("le Seuil 4 ne produit plus jamais de DIL sur cette carte", () => {
    // Les deux effets s'excluent : la RAGE remplace le DIL, elle ne s'y
    // ajoute pas. Deux décisions sur une seule cible bloqueraient la file.
    const titans = [t(1, "E4", { adrenaline: 1 }), cible("E5")];
    const res = resolveBoingBoing(1, "E5", 1, 1, { board: {}, looseBlocks: {}, titans });

    expect(res.decisions).toHaveLength(1);
    expect((res.decisions || []).some((d) => d.type === "DIL")).toBe(false);
  });
});

describe("DIL sur un Socle — « ou 1 socle tiré au sort si applicable »", () => {
  /* Livret V36.2, glossaire DIL. La moitié « ou 1 socle » n'était pas
     implémentée : seules les couleurs du Repaire étaient proposées, et les
     Socles échappaient totalement au Dilemme. Implémenté le 2026-08-17.

     Le Socle est une option ANONYME : l'attaquant peut la désigner mais ne
     choisit pas lequel partira, et personne n'en connaît la valeur avant le
     tirage. Sans cet anonymat, le Dilemme deviendrait un sniper à 4 points. */

  const avecSocles = (id, cell, repaire, socles) => t(id, cell, { repaire, socles });

  it("le Socle apparaît dans les options dès que la cible en possède un", () => {
    const titans = [avecSocles(2, "E5", ["bleu"], [3])];
    expect(getDilOptions(2, { titans })).toEqual(["bleu", SOCLE_OPTION]);
  });

  it("aucune option Socle quand la cible n'en a pas", () => {
    const titans = [avecSocles(2, "E5", ["bleu", "rose"], [])];
    expect(getDilOptions(2, { titans })).toEqual(["bleu", "rose"]);
  });

  it("une couleur unique PLUS un Socle rend le Dilemme possible", () => {
    // C'est le cas que la règle du livret visait avec son « si applicable ».
    // L'ancien seuil (« 2 couleurs différentes ») rendait cette cible
    // totalement immunisée alors qu'elle avait deux ressources à perdre.
    const titans = [avecSocles(2, "E5", ["bleu", "bleu"], [2])];
    expect(canDil(2, { titans })).toBe(true);
  });

  it("une couleur unique SANS Socle reste immunisée", () => {
    const titans = [avecSocles(2, "E5", ["bleu", "bleu"], [])];
    expect(canDil(2, { titans })).toBe(false);
  });

  it("un Socle seul ne suffit pas : il faut 2 options distinctes", () => {
    // Un seul type de ressource, donc aucun dilemme à poser.
    const titans = [avecSocles(2, "E5", [], [2, 3])];
    expect(getDilOptions(2, { titans })).toEqual([SOCLE_OPTION]);
    expect(canDil(2, { titans })).toBe(false);
  });

  it("le tirage retire bien UN Socle et rend sa valeur", () => {
    const defender = avecSocles(2, "E5", [], [4]);
    const tire = retirerSocleAuSort(defender);

    expect(tire.valeur).toBe(4);
    expect(defender.socles).toEqual([]);
  });

  it("le Socle tiré revient sous forme de marqueur posable au sol", () => {
    // C'est ce qui lui permet d'emprunter la même route que les blocs, et
    // de rester ramassable en conservant sa valeur.
    const defender = avecSocles(2, "E5", [], [3]);
    const tire = retirerSocleAuSort(defender);

    expect(isSocleMarker(tire.marker)).toBe(true);
    expect(socleValue(tire.marker)).toBe(3);
  });

  it("le tirage pioche réellement au hasard parmi plusieurs Socles", () => {
    // Garde-fou : une implémentation qui prendrait toujours le premier (ou
    // le plus gros) casserait l'anonymat qui équilibre l'option.
    setSeed(12345);
    const vus = new Set();
    for (let i = 0; i < 60; i++) {
      const defender = avecSocles(2, "E5", [], [1, 2, 3, 4]);
      vus.add(retirerSocleAuSort(defender).valeur);
    }
    expect(vus.size).toBeGreaterThan(1);
  });

  it("le tirage est reproductible à graine égale", () => {
    // Le simulateur exige qu'une partie rejouée soit identique au point
    // près : le tirage doit passer par le RNG semé, jamais par Math.random.
    const tirer = () => {
      setSeed(999);
      return Array.from({ length: 10 }, () =>
        retirerSocleAuSort(avecSocles(2, "E5", [], [1, 2, 3, 4])).valeur
      );
    };
    expect(tirer()).toEqual(tirer());
  });

  it("sans Socle, le tirage ne rend rien plutôt que de casser", () => {
    expect(retirerSocleAuSort(avecSocles(2, "E5", ["bleu"], []))).toBeNull();
  });
});

describe("Faille spatio-temporelle — sortie bloquée, arrêt sec", () => {
  /* Ruling Nikola du 2026-08-17 : « si un élément qui warp touche un élément
     mais n'a pas la puissance de l'impacté, alors arrêt sur case adjacente,
     il ne finit pas son déplacement. »

     Au moment du warp, la position courante pointe encore sur la case
     d'AVANT la faille, à l'autre bout du plateau. Un rebond depuis là-bas
     renvoyait l'élément traverser tout le plateau en sens inverse. Même
     famille que le bloc de G9 qui « finissait » en I9 : le cas de l'ARRÊT
     avait été corrigé le 15 août, celui du REBOND était resté. */

  const murEn = (cle) => ({
    [cle]: { row: cle[0], col: Number(cle.slice(1)), blocks: ["bleu"], socle: 1, isTeleporter: false },
  });

  it("un débris bloqué à la sortie de la faille reste près de sa case de sortie", () => {
    // Départ en G9, poussé vers l'est avec assez d'énergie pour warper.
    // Il ressort en G1, où un mur l'attend avec une énergie sous le Seuil 4.
    const board = murEn("G1");
    const log = [];
    const res = projectInDirection("G", 9, 0, 1, 4, {
      board, looseBlocks: {}, titans: [], log, initiatorId: 1,
    });
    const arrivee = res.row + res.col;

    // Il doit rester du côté de la sortie (colonnes basses), jamais repartir
    // à l'autre bout du plateau d'où il venait.
    expect(Number(arrivee.slice(1))).toBeLessThanOrEqual(2);
  });

  it("le déplacement ne se poursuit pas après un mur en sortie de faille", () => {
    const board = murEn("G1");
    const log = [];
    projectInDirection("G", 9, 0, 1, 4, {
      board, looseBlocks: {}, titans: [], log, initiatorId: 1,
    });

    expect(log.some((l) => l.includes("le déplacement ne se poursuit pas"))).toBe(true);
  });

  it("le mur de sortie n'est pas cassé quand l'énergie est sous le Seuil 4", () => {
    // « n'a pas la puissance de l'impacté » : il s'arrête, il ne détruit rien.
    const board = murEn("G1");
    projectInDirection("G", 9, 0, 1, 4, {
      board, looseBlocks: {}, titans: [], log: [], initiatorId: 1,
    });

    expect(board.G1.blocks).toHaveLength(1);
  });

  it("une sortie de faille DÉGAGÉE laisse la trajectoire se poursuivre", () => {
    // Garde-fou : la correction ne doit pas figer les warps réussis, que le
    // livret décrit bien comme « réapparaît du côté opposé et FINIT son
    // déplacement ».
    const res = projectInDirection("G", 9, 0, 1, 5, {
      board: {}, looseBlocks: {}, titans: [], log: [], initiatorId: 1,
    });

    expect(res.row + res.col).not.toBe("G9");
  });
});

describe("Repli d'un élément sans la puissance de passer", () => {
  /* Ruling Nikola du 2026-08-17, énoncé littéralement : « adjacent à la case
     où il était ET où il devait aller — donc il peut revenir sur la case où
     il était, ou adjacent entre sa destination et celle d'avant ». Le choix
     revient au Titan initiateur.

     Les quatre exemples donnés à la table sont repris tels quels ci-dessous.
     Deux d'entre eux (1 et 4) listaient une case de moins que la règle n'en
     autorise : la règle énoncée fait foi, et toutes les cases nommées par
     Nikola y figurent bien. */

  const vide = { board: {} };

  it("exemple 1 — de B9 vers C9 bloquée : il revient ou glisse en arrière", () => {
    // Nikola : « B9 ou B8 ». La règle ajoute C8, qui touche elle aussi les
    // deux cases. Toutes les cases citées sont proposées.
    const cases = getCasesRepliDebris("B9", "C9", 1, 0, vide).sort();
    expect(cases).toContain("B9"); // il revient sur sa case
    expect(cases).toContain("B8"); // cité par Nikola
    expect(cases).toEqual(["B8", "B9", "C8"]);
  });

  it("exemple 2 — sortie de faille vers l'ouest sur C9 bloquée : B9 ou D9", () => {
    // Aucune case précédente de ce côté du plateau : on prend les voisines
    // de la cible qui ne franchissent pas l'obstacle. Rendu exact.
    expect(getCasesRepliDebris(null, "C9", 0, -1, vide).sort()).toEqual(["B9", "D9"]);
  });

  it("exemple 3 — sortie de faille en diagonale sud-ouest sur C9 : B9 seule", () => {
    // Le déplacement avance vers le sud ET vers l'ouest : toute case plus au
    // sud ou plus à l'ouest reviendrait à traverser l'obstacle. Rendu exact.
    expect(getCasesRepliDebris(null, "C9", 1, -1, vide)).toEqual(["B9"]);
  });

  it("exemple 4 — de B9 vers l'angle A9 bloqué : A8 et B9 sont proposées", () => {
    // Nikola : « A8 ou B9 ». La règle ajoute B8. Les deux cases citées y sont.
    const cases = getCasesRepliDebris("B9", "A9", -1, 0, vide).sort();
    expect(cases).toContain("A8");
    expect(cases).toContain("B9");
    expect(cases).toEqual(["A8", "B8", "B9"]);
  });

  it("jamais une case portant un bâtiment encore debout", () => {
    // Un débris ne se pose jamais sur un bâtiment : la règle transversale du
    // 2026-08-15 s'applique aussi au repli.
    const board = {
      B8: { row: "B", col: 8, blocks: ["bleu"], socle: 1, isTeleporter: false },
    };
    expect(getCasesRepliDebris("B9", "C9", 1, 0, { board })).not.toContain("B8");
  });

  it("un débris PEUT se poser sur un autre débris — ça forme un tas", () => {
    // Précision de Nikola du 2026-08-17 : « on peut poser le débris qui
    // rebondit sur un débris, ça forme un tas ». C'est la façon normale de
    // constituer un Amas, donc un coup à part entière, pas un accident.
    const cases = getCasesRepliDebris("B9", "C9", 1, 0, { board: {}, looseBlocks: { C8: ["rose"] } });
    expect(cases).toContain("C8");
  });

  it("un débris PEUT se poser sur la case d'un Titan", () => {
    // C'est même une case que l'attaquant peut vouloir viser.
    const titans = [{ id: 1, cell: "E4" }, { id: 2, cell: "B8" }];
    expect(getCasesRepliDebris("B9", "C9", 1, 0, { board: {}, titans })).toContain("B8");
  });

  it("un TITAN replié PEUT viser la case d'un autre Titan, pour le pousser", () => {
    // Ruling Nikola du 2026-08-18, qui revient sur celui du 2026-08-17 :
    // « il peut aller sur une case d'un autre Titan si elle est dans la zone
    // possible, ça permet de le pousser pour gagner une case sur la piste
    // ADN Bagarre. » Ce n'est pas une superposition : l'occupant est chassé
    // d'une case (cf. appliquerReplElement).
    const titans = [{ id: 1, cell: "B9" }, { id: 2, cell: "B8" }];
    expect(getCasesRepliDebris("B9", "C9", 1, 0, { board: {}, titans, movingTitanId: 1 })).toContain("B8");
  });

  it("un TITAN replié ne peut jamais viser la case de l'initiateur", () => {
    // Seule fermeture qui reste : le livret accorde l'immunité à l'auteur de
    // la carte, il ne peut pas se pousser lui-même.
    const titans = [{ id: 1, cell: "B9" }, { id: 3, cell: "B8" }];
    expect(
      getCasesRepliDebris("B9", "C9", 1, 0, { board: {}, titans, movingTitanId: 1, initiatorId: 3 })
    ).not.toContain("B8");
  });

  it("sa propre case reste proposée même si elle est occupée", () => {
    // « Il peut revenir sur la case où il était ». C'est aussi ce qui
    // garantit qu'il reste toujours une issue, quel que soit l'encombrement.
    const board = {
      B8: { row: "B", col: 8, blocks: ["bleu"], socle: 1, isTeleporter: false },
      C8: { row: "C", col: 8, blocks: ["bleu"], socle: 1, isTeleporter: false },
    };
    expect(getCasesRepliDebris("B9", "C9", 1, 0, { board })).toEqual(["B9"]);
  });

  it("la case visée n'est jamais proposée — c'est justement celle qu'il ne peut pas atteindre", () => {
    expect(getCasesRepliDebris("B9", "C9", 1, 0, vide)).not.toContain("C9");
    expect(getCasesRepliDebris(null, "C9", 0, -1, vide)).not.toContain("C9");
  });

  it("la trajectoire expose le choix quand il y a plusieurs cases possibles", () => {
    // Bout en bout : un débris bloqué par un mur qu'il ne peut pas casser
    // rend la liste des cases où l'initiateur peut le poser.
    // Couloir fermé des deux côtés : l'élément tape le mur devant, rebondit,
    // puis tape celui derrière. Le rebond étant consommé, il s'arrête là.
    const mur = (cle) => ({ [cle]: { row: cle[0], col: Number(cle.slice(1)), blocks: ["bleu"], socle: 1, isTeleporter: false } });
    const board = { ...mur("E5"), ...mur("E3") };
    const res = projectInDirection("E", 4, 0, 1, 2, {
      board, looseBlocks: {}, titans: [], log: [], initiatorId: 1,
    });

    expect(res.repliOptions).toBeTruthy();
    expect(res.repliOptions.cases.length).toBeGreaterThan(1);
    // Le défaut reste la case où l'élément s'est naturellement arrêté.
    expect(res.repliOptions.cases).toContain(res.repliOptions.defaut);
    expect(res.repliOptions.defaut).toBe(res.row + res.col);
  });
});

describe("Repli — collecte pour l'interface", () => {
  /* Le choix doit remonter jusqu'au joueur. Les résolveurs déposent leurs
     replis dans `gameState.replis`, un tableau partagé transmis tel quel aux
     réactions en chaîne — même mécanisme que `log` et `bagarreSet`. Sans
     cette collecte, la règle vivrait dans le moteur sans jamais atteindre
     l'interface, et l'élément se poserait toujours sur la case par défaut. */

  const mur = (cle) => ({
    [cle]: { row: cle[0], col: Number(cle.slice(1)), blocks: ["bleu"], socle: 1, isTeleporter: false },
  });

  it("un arrêt faute de puissance est déposé dans le collecteur", () => {
    const replis = [];
    const board = { ...mur("E5"), ...mur("E3") };
    projectInDirection("E", 4, 0, 1, 2, {
      board, looseBlocks: {}, titans: [], log: [], initiatorId: 1, replis,
    });

    expect(replis).toHaveLength(1);
    expect(replis[0].cases.length).toBeGreaterThan(1);
    expect(replis[0].defaut).toBe("E4");
    expect(replis[0].cible).toBe("E3");
    expect(replis[0].initiatorId).toBe(1);
  });

  it("un débris arrêté porte titanId à null, un Titan porte son identifiant", () => {
    // C'est ce qui dit à l'interface QUOI déplacer quand le joueur tranche :
    // un Titan nommément, ou le débris posé sur la case par défaut.
    const board = { ...mur("E5"), ...mur("E3") };

    const replisDebris = [];
    projectInDirection("E", 4, 0, 1, 2, {
      board, looseBlocks: {}, titans: [], log: [], initiatorId: 1, replis: replisDebris,
    });
    expect(replisDebris[0].titanId).toBeNull();

    const replisTitan = [];
    const titans = [t(1, "A1"), t(2, "E4")];
    projectInDirection("E", 4, 0, 1, 2, {
      board, looseBlocks: {}, titans, log: [], initiatorId: 1, movingTitanId: 2, replis: replisTitan,
    });
    expect(replisTitan[0].titanId).toBe(2);
  });

  it("aucun repli collecté quand l'élément s'arrête simplement à court d'énergie", () => {
    // Il n'y a de choix que lorsque l'élément est BLOQUÉ. Une trajectoire qui
    // se termine normalement ne doit rien proposer, sans quoi le joueur
    // arbitrerait un placement à chaque projection.
    const replis = [];
    projectInDirection("E", 4, 0, 1, 2, {
      board: {}, looseBlocks: {}, titans: [], log: [], initiatorId: 1, replis,
    });

    expect(replis).toHaveLength(0);
  });

  it("la case par défaut fait toujours partie des cases proposées", () => {
    // L'interface propose le défaut comme les autres : ne pas choisir revient
    // à laisser l'élément où il s'est arrêté, sans état incohérent possible.
    const replis = [];
    const board = { ...mur("E5"), ...mur("E3") };
    projectInDirection("E", 4, 0, 1, 2, {
      board, looseBlocks: {}, titans: [], log: [], initiatorId: 1, replis,
    });

    expect(replis[0].cases).toContain(replis[0].defaut);
  });
});

describe("Repli — l'IA le joue vraiment", () => {
  /* Demande de Nikola du 2026-08-17 : « je veux qu'elle joue de manière
     intelligente en tout point ». Le repli est un vrai coup — poser un
     débris dans son propre Périmètre le rend ramassable au tour suivant, le
     poser dans celui d'un adversaire le lui offre.

     Aucune heuristique de placement n'est écrite : `choisirRepliIA` simule
     chaque case et lit le VRAI barème via evaluatePosition, comme pour un
     déplacement ou une carte. C'est le principe fondateur du module IA, et
     ces tests vérifient qu'il tient. */

  it("elle rapproche un débris de son propre Titan plutôt que de le laisser loin", () => {
    setSeed(4242);
    // L'initiateur est en E5. Deux cases possibles : E4, collée à lui donc
    // ramassable, et A1, à l'autre bout du plateau.
    const initiateur = t(1, "E5", { repaire: ["bleu"] });
    const etat = { board: {}, looseBlocks: { A1: ["rouge"] }, titans: [initiateur] };
    const repli = { titanId: null, defaut: "A1", cases: ["A1", "E4"], cible: "A2", initiatorId: 1 };

    const choix = choisirRepliIA(repli, etat, makeProfile(FORCES.EXPERT, TEMPERAMENTS.COLLECTIONNEUR));
    expect(choix).toBe("E4");
  });

  it("appliquerRepli déplace le débris du sommet de la pile par défaut", () => {
    const etat = { board: {}, looseBlocks: { A1: ["bleu", "rouge"] }, titans: [] };
    appliquerRepli({ titanId: null, defaut: "A1", cases: ["A1", "B2"] }, "B2", etat);

    expect(etat.looseBlocks.A1).toEqual(["bleu"]); // seul le sommet part
    expect(etat.looseBlocks.B2).toEqual(["rouge"]);
  });

  it("appliquerRepli repose un Titan, pas un bloc", () => {
    const titan = t(2, "C3");
    const etat = { board: {}, looseBlocks: {}, titans: [titan] };
    appliquerRepli({ titanId: 2, defaut: "C3", cases: ["C3", "C4"] }, "C4", etat);

    expect(titan.cell).toBe("C4");
    expect(etat.looseBlocks).toEqual({});
  });

  it("choisir la case par défaut ne touche à rien", () => {
    const etat = { board: {}, looseBlocks: { A1: ["bleu"] }, titans: [] };
    appliquerRepli({ titanId: null, defaut: "A1", cases: ["A1", "B2"] }, "A1", etat);

    expect(etat.looseBlocks).toEqual({ A1: ["bleu"] });
  });

  it("une seule case possible : aucun calcul, elle la prend", () => {
    const etat = { board: {}, looseBlocks: {}, titans: [t(1, "E5")] };
    expect(choisirRepliIA({ titanId: null, defaut: "B9", cases: ["B9"], initiatorId: 1 }, etat)).toBe("B9");
  });

  it("la vidange de la pile ne laisse pas de case fantôme", () => {
    // Une case sans débris ne doit pas rester dans looseBlocks : elle
    // compterait comme obstacle pour les portées et les trajectoires.
    const etat = { board: {}, looseBlocks: { A1: ["bleu"] }, titans: [] };
    appliquerRepli({ titanId: null, defaut: "A1", cases: ["A1", "B2"] }, "B2", etat);

    expect(etat.looseBlocks.A1).toBeUndefined();
  });
});

describe("DIL — le Vert échappe au Dilemme", () => {
  /* Ruling Nikola du 2026-08-17 : « on ne peut pas faire de DIL sur du Vert,
     sauf si c'est la seule couleur ».

     Le Vert n'est pas une couleur comme les autres : sa valeur n'existe pas
     avant le décompte final, où son propriétaire la fixe en secret. Le viser
     ferait perdre une carte dont personne à la table ne connaît le prix.
     L'exception « seule couleur » empêche qu'un Titan devienne intouchable
     en ne collectant que du Vert. */

  const cible = (repaire, socles = []) => ({ titans: [{ id: 2, repaire, socles }] });

  it("le Vert est écarté dès qu'une autre couleur existe", () => {
    expect(getDilOptions(2, cible(["bleu", "vert"]))).toEqual(["bleu"]);
    expect(getDilOptions(2, cible(["bleu", "rose", "vert"]))).toEqual(["bleu", "rose"]);
  });

  it("un Repaire « 1 couleur + du Vert » redevient donc immunisé", () => {
    // Conséquence directe et voulue : il n'y a plus 2 options distinctes.
    expect(canDil(2, cible(["bleu", "vert"]))).toBe(false);
  });

  it("le Vert redevient ciblable quand c'est la seule couleur", () => {
    expect(getDilOptions(2, cible(["vert", "vert"]))).toEqual(["vert"]);
  });

  it("Vert seul PLUS un Socle : le Dilemme est possible", () => {
    // Sans quoi un Titan tout-Vert deviendrait intouchable, ce que
    // l'exception vise précisément à éviter.
    expect(getDilOptions(2, cible(["vert"], [3]))).toEqual(["vert", SOCLE_OPTION]);
    expect(canDil(2, cible(["vert"], [3]))).toBe(true);
  });

  it("le Vert ne bloque pas un Dilemme entre deux autres couleurs", () => {
    expect(canDil(2, cible(["bleu", "rose", "vert", "vert"]))).toBe(true);
  });
});
