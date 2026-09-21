import { describe, expect, it } from "vitest";
import { marquerDebutDeCarte, projectInDirection, resolveTeteEnAvant } from "../../src/domain/gameRules.js";
import { verifierPhraseTriomphe } from "../../src/ui/audio.js";

/* ============================================================
   PROJET TITAN — Règle en essai et jingle du 2026-09-19
   ============================================================
   Nikola : « si je charge un Titan qui est sur une case avec un bloc, les 2
   bougent à même distance (on tente mais c'est pas sûr) ».

   Le « c'est pas sûr » est la raison d'être de ce fichier : la règle est un
   essai, elle vit derrière `BLOC_SUIT_LE_TITAN` dans `gameRules.js`, et ces
   tests disent exactement ce qu'elle fait — y compris les trois cas où elle
   ne s'applique PAS. Si elle est retirée, ce fichier tombe avec elle et
   personne n'aura à deviner ce qui était voulu.

   ARBITRAGE DU MÊME JOUR : ON DISTINGUE DEUX SORTES DE DÉBRIS. La première
   version emportait tout ce qui traînait sur la case, et faisait tomber trois
   tests de rulings déjà tranchés — le bloc lâché par un Dilemme et le gravat
   d'un écroulement doivent, eux, RESTER sur la case d'impact. Nikola a
   tranché : seul le débris qui était DÉJÀ AU SOL avant que la carte soit
   jouée suit le Titan. Les deux derniers cas de ce fichier vérifient
   précisément cette frontière, et ce sont eux qui gardent les rulings.

   D'où `marquerDebutDeCarte` dans les tests qui appellent `projectInDirection`
   en direct : en partie, les six résolveurs de tête le posent en première
   ligne, mais un appel nu à la projection n'a jamais vu passer de carte.
   Sans relevé, la règle ne s'applique pas — c'est le défaut voulu.

   Le jingle, lui, n'a rien à voir avec la règle : il reste toujours mesuré.
============================================================ */

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0, horsPlateau: false,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [],
  repos: [], empruntees: [],
  ...extra,
});

describe("« les 2 bougent à même distance » — le débris suit le Titan poussé", () => {
  it("un Titan projeté de 3 cases emmène le bloc sur lequel il se tenait", () => {
    const titans = [t(2, "A2")];
    const looseBlocks = { A2: ["rouge"] };

    marquerDebutDeCarte(looseBlocks);

    const landing = projectInDirection("A", 2, 0, 1, 3, {
      board: {}, looseBlocks, titans, log: [], replis: [], initiatorId: 1, movingTitanId: 2,
    });

    expect(landing.row + landing.col).toBe("A5"); // 3 cases plus loin
    expect(looseBlocks.A2).toBeUndefined();       // la case de départ est nette
    expect(looseBlocks.A5).toEqual(["rouge"]);    // le bloc a fait la même distance
  });

  it("le Socle voyage comme un bloc, et le journal le nomme", () => {
    const titans = [t(2, "C3")];
    const looseBlocks = { C3: ["socle:4"] };
    const log = [];

    marquerDebutDeCarte(looseBlocks);

    projectInDirection("C", 3, 0, 1, 2, {
      board: {}, looseBlocks, titans, log, replis: [], initiatorId: 1, movingTitanId: 2,
    });

    expect(looseBlocks.C3).toBeUndefined();
    expect(looseBlocks.C5).toEqual(["socle:4"]);
    expect(log.join(" ")).toContain("Socle (valeur 4) emporté");
  });

  it("le bloc emporté ne court-circuite pas la réaction en chaîne", () => {
    /* Le débris déjà présent sur la case d'arrivée est poussé plus loin par
       le Titan, comme il l'a toujours été ; le bloc emporté se pose ENSUITE,
       sur la case ainsi libérée. L'ordre compte : l'inverse aurait formé un
       amas de deux débris que la chaîne aurait dû repousser en bloc. */
    const titans = [t(2, "A2")];
    const looseBlocks = { A2: ["rouge"], A4: ["bleu"] };

    marquerDebutDeCarte(looseBlocks);

    const landing = projectInDirection("A", 2, 0, 1, 2, {
      board: {}, looseBlocks, titans, log: [], replis: [], initiatorId: 1, movingTitanId: 2,
    });

    expect(landing.row + landing.col).toBe("A4");
    expect(looseBlocks.A2).toBeUndefined();
    expect(looseBlocks.A5).toEqual(["bleu"]);  // poussé par la chaîne
    expect(looseBlocks.A4).toEqual(["rouge"]); // le bloc emporté, seul
  });

  it("un DÉBRIS projeté n'emporte rien — la règle ne vaut que pour un Titan", () => {
    const titans = [];
    const looseBlocks = { A2: ["rouge"] };

    // movingTitanId à null : c'est un débris qui vole, pas un Titan.
    marquerDebutDeCarte(looseBlocks);
    projectInDirection("A", 2, 0, 1, 2, {
      board: {}, looseBlocks, titans, log: [], replis: [], initiatorId: 1, movingTitanId: null,
    });

    expect(looseBlocks.A2).toEqual(["rouge"]); // rien n'a bougé
  });

  it("un AMAS reste au sol : on n'emporte pas une tour", () => {
    const titans = [t(2, "A2")];
    const looseBlocks = { A2: ["rouge", "bleu"] };

    marquerDebutDeCarte(looseBlocks);

    projectInDirection("A", 2, 0, 1, 2, {
      board: {}, looseBlocks, titans, log: [], replis: [], initiatorId: 1, movingTitanId: 2,
    });

    expect(looseBlocks.A2).toEqual(["rouge", "bleu"]);
    expect(looseBlocks.A4).toBeUndefined();
  });

  it("un Titan éjecté hors de BIG CITY laisse son bloc sur place", () => {
    const titans = [t(2, "A9")];
    const looseBlocks = { A9: ["rouge"] };

    marquerDebutDeCarte(looseBlocks);

    const landing = projectInDirection("A", 9, 0, 1, 2, {
      board: {}, looseBlocks, titans, log: [], replis: [], initiatorId: 1, movingTitanId: 2,
    });

    expect(landing.ejecte).toBe(true);
    expect(looseBlocks.A9).toEqual(["rouge"]); // le bloc reste dans la partie
  });

  it("un Titan qui ne bouge pas garde son bloc sous les pieds", () => {
    const titans = [t(2, "A2")];
    const looseBlocks = { A2: ["rouge"] };

    // Énergie nulle : aucune case parcourue, donc rien à emporter.
    marquerDebutDeCarte(looseBlocks);
    projectInDirection("A", 2, 0, 1, 0, {
      board: {}, looseBlocks, titans, log: [], replis: [], initiatorId: 1, movingTitanId: 2,
    });

    expect(looseBlocks.A2).toEqual(["rouge"]);
  });
});

describe("Tête en Avant — le cas exact que Nikola décrit", () => {
  it("charger un Titan posé sur un bloc les déplace tous deux, et libère la case", () => {
    /* T1 charge vers l'est depuis A1. T2 est en A2, debout sur un bloc rouge.
       Avant cette règle : T2 partait seul, le bloc restait en A2, et le
       chargeur venait se poser dessus. */
    const titans = [t(1, "A1"), t(2, "A2", { repaire: ["bleu", "rouge"] })];
    const looseBlocks = { A2: ["rouge"] };
    const gameState = { board: {}, titans, looseBlocks, replis: [], trajectoires: [] };

    resolveTeteEnAvant(1, 0, 1, 0, gameState);

    expect(titans[1].cell).not.toBe("A2");        // la cible a été poussée
    expect(titans[0].cell).toBe("A2");            // le chargeur prend sa place
    expect(looseBlocks.A2).toBeUndefined();       // qui est désormais NETTE
    expect(looseBlocks[titans[1].cell]).toEqual(["rouge"]); // le bloc a suivi
  });
});

describe("La frontière tranchée par Nikola : déjà au sol, ou arrivé par le choc ?", () => {
  /* C'est l'arbitrage du 2026-09-19, et c'est lui qui fait tenir ensemble la
     règle neuve et deux rulings anciens. Les deux cas ci-dessous partent du
     MÊME état final — un Titan sur une case portant un débris, puis projeté —
     et se séparent sur une seule chose : le débris était-il là avant que la
     carte soit jouée ? */

  it("déjà au sol avant la carte → il part avec le Titan", () => {
    const titans = [t(2, "A2")];
    const looseBlocks = { A2: ["rouge"] };
    marquerDebutDeCarte(looseBlocks); // la carte est jouée maintenant

    projectInDirection("A", 2, 0, 1, 2, {
      board: {}, looseBlocks, titans, log: [], replis: [], initiatorId: 1, movingTitanId: 2,
    });

    expect(looseBlocks.A2).toBeUndefined();
    expect(looseBlocks.A4).toEqual(["rouge"]);
  });

  it("posé sur la case PAR la carte → il reste sur la case d'impact", () => {
    /* Le cas du bloc de Dilemme et du gravat d'écroulement : la case était
       vide quand la carte a commencé, le débris y est tombé À CAUSE du choc.
       Il ne monte pas dans le camion. */
    const titans = [t(2, "A2")];
    const looseBlocks = {};
    marquerDebutDeCarte(looseBlocks); // relevé pris AVANT le dépôt
    looseBlocks.A2 = ["rouge"];       // le choc fait tomber le bloc ici

    projectInDirection("A", 2, 0, 1, 2, {
      board: {}, looseBlocks, titans, log: [], replis: [], initiatorId: 1, movingTitanId: 2,
    });

    expect(looseBlocks.A2).toEqual(["rouge"]); // il reste où il est tombé
    expect(looseBlocks.A4).toBeUndefined();
  });

  it("sans relevé du tout, la règle ne s'applique pas", () => {
    // Le défaut voulu : un chemin qui n'a pas posé de relevé se comporte
    // comme avant l'ajout de la règle, jamais comme une projection surprise.
    const titans = [t(2, "A2")];
    const looseBlocks = { A2: ["rouge"] };

    projectInDirection("A", 2, 0, 1, 2, {
      board: {}, looseBlocks, titans, log: [], replis: [], initiatorId: 1, movingTitanId: 2,
    });

    expect(looseBlocks.A2).toEqual(["rouge"]);
  });

  it("le relevé ne se voit ni dans les cases, ni dans le JSON du plateau", () => {
    /* Il voyage sur `looseBlocks`, que quinze endroits parcourent en
       `Object.keys` — rendu du plateau, décompte, détection de Pénurie — et
       que le jeu à distance sérialise. Un symbole n'apparaît dans aucun des
       deux ; une clé ordinaire aurait ajouté une case fantôme partout. */
    const looseBlocks = { A2: ["rouge"] };
    marquerDebutDeCarte(looseBlocks);

    expect(Object.keys(looseBlocks)).toEqual(["A2"]);
    expect(JSON.parse(JSON.stringify(looseBlocks))).toEqual({ A2: ["rouge"] });
  });
});

describe("Le jingle de fin de partie", () => {
  it("la phrase s'enchaîne sans trou et finit sur sa note la plus longue", () => {
    expect(verifierPhraseTriomphe()).toBe(true);
  });

  it("le vérificateur refuse une phrase trouée", () => {
    expect(verifierPhraseTriomphe([
      { freq: 1, debut: 0, duree: 0.1 },
      { freq: 2, debut: 0.5, duree: 0.1 },
      { freq: 3, debut: 0.6, duree: 0.1 },
      { freq: 4, debut: 0.7, duree: 0.1 },
      { freq: 5, debut: 0.8, duree: 0.2 },
    ])).toBe(false);
  });
});
