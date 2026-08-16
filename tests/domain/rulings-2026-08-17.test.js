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
} from "../../src/domain/gameRules.js";
import { setSeed } from "../../src/domain/rng.js";

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
