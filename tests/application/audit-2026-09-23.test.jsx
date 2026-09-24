/* ============================================================
   PROJET TITAN — AUDIT DU 2026-09-23
   ============================================================
   · À distance, une décision bloquante ne se tranche que par le Titan
     qu'elle interroge. La portée réseau « decision » laissait passer
     n'importe quel siège, sur la foi d'une garde que les résolveurs ne
     portaient pas : un invité tranchait le Dilemme ou le Vol d'un autre, et
     la cible d'un Dilemme pouvait perdre une couleur jamais désignée.
   · Le Ramassage n'appartient qu'au Titan dont c'est le tour.
   · Le coin bloqué, seule décision bloquante sans aucun test jusqu'ici.
   · Toute action du contrôleur qui mute la partie est classée : jouable à
     distance (liste blanche) ou locale, avec sa raison. Une action nouvelle
     et non classée fait tomber ce test — c'est ainsi que `jnpPickCell` avait
     échappé à la liste blanche pendant deux semaines.

   Même harnais que `distant-2026-09-16.test.jsx`.
============================================================ */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { CARD_LABEL, makeDecisionRequest, getPerimeter, SOCLE_OPTION } from "../../src/domain/index.js";
import { BADGES } from "../../src/ui/rules/rulesContent.js";

let vm = null;
function Harnais() {
  const v = useBoardGeneratorController();
  if (isValidElement(v)) return v;
  vm = v;
  return <div />;
}

function sessionSimulee(siege, { ref, sieges = {} }) {
  const abonnes = {};
  return {
    id: "AUDIT23", ref, siege, base: "http://relais.test",
    joueurs: [], sieges, etatInitial: null, intentions: [],
    sur(canal, cb) { (abonnes[canal] ||= []).push(cb); return () => {}; },
    emettre(canal, charge) { (abonnes[canal] || []).forEach((cb) => cb(charge)); },
    envoyerIntention(fn, args, contexte) { this.intentions.push({ fn, args, contexte }); return Promise.resolve({}); },
    diffuserEtat() { return Promise.resolve({}); },
    diffuserJournal() { return Promise.resolve({}); },
    envoyerPrive() { return Promise.resolve({}); },
    publierSieges() { return Promise.resolve({}); },
    resynchroniser: vi.fn(),
    quitter: vi.fn(() => Promise.resolve()),
    estVivante() { return true; },
  };
}

const intention = (fn, de, args = []) => ({ t: "intention", de, pseudo: de, titanId: null, fn, args, contexte: {} });
const titan = (id) => vm.titanState.players.find((t) => t.id === id);

async function partieHumaine() {
  const user = userEvent.setup();
  render(<Harnais />);
  await user.type(screen.getByLabelText("Graine"), "2026");
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  act(() => vm.terminerPlacement());
  act(() => {
    vm.setTitanModes({ 1: "humain", 2: "humain", 3: "humain", 4: "humain" });
    vm.setPhase("action");
    vm.setActivePlayerId(1);
    vm.setSelectedTitanId(1);
  });
}

async function hoteAvecSieges(sieges) {
  const s = sessionSimulee("hote", { ref: "hote" });
  act(() => vm.brancherSession(s));
  act(() => s.emettre("presence", { joueurs: [], sieges }));
  return s;
}

// Un Dilemme de T1 sur T2, posé directement dans la file au stade voulu.
function poserDilemme(stage, attackerChoices) {
  act(() => {
    titan(2).repaire = ["bleu", "rose", "jaune"];
    titan(2).adrenaline = 1;
    vm.setTitanState((p) => ({ ...p, players: [...p.players] }));
    vm.setDecisionQueue([{
      ...makeDecisionRequest("DIL", 1, 2, CARD_LABEL.tete_en_avant, titan(2).cell),
      id: "audit", defenderIsAi: false, stage, attackerChoices,
    }]);
  });
}

afterEach(() => { cleanup(); vm = null; });

describe("À distance, seul le Titan interrogé tranche sa décision", () => {
  it("la cible choisit parmi ce que l'attaquant a désigné, et personne d'autre ne choisit pour elle", async () => {
    await partieHumaine();
    const s = await hoteAvecSieges({ 1: "attaquant", 2: "cible", 3: "voisin" });
    poserDilemme("DEFENDER_PICK", ["bleu", "rose"]);

    act(() => s.emettre("intention", intention("resolveDilDefenderPick", "voisin", ["bleu"])));
    act(() => s.emettre("intention", intention("resolveDilDefenderPick", "attaquant", ["bleu"])));
    act(() => s.emettre("intention", intention("resolveDilCancelWithAdrenaline", "voisin")));
    // Une couleur jamais désignée, même envoyée par la bonne cible.
    act(() => s.emettre("intention", intention("resolveDilDefenderPick", "cible", ["jaune"])));
    expect(vm.decisionQueue).toHaveLength(1);
    expect(titan(2).repaire).toEqual(["bleu", "rose", "jaune"]);
    expect(titan(2).adrenaline).toBe(1);

    act(() => s.emettre("intention", intention("resolveDilDefenderPick", "cible", ["rose"])));
    expect(vm.decisionQueue).toHaveLength(0);
    expect(titan(2).repaire).toEqual(["bleu", "jaune"]);
  });

  it("l'attaquant désigne, pas la cible — et pas au stade de la cible", async () => {
    await partieHumaine();
    const s = await hoteAvecSieges({ 1: "attaquant", 2: "cible" });
    poserDilemme("ATTACKER_PICK", []);

    act(() => s.emettre("intention", intention("dilAttackerPick", "cible", ["jaune"])));
    expect(vm.decisionQueue[0].attackerChoices).toEqual([]);
    act(() => s.emettre("intention", intention("dilAttackerPick", "attaquant", ["bleu"])));
    expect(vm.decisionQueue[0].attackerChoices).toEqual(["bleu"]);

    // Au stade de la cible, la désignation est close — même pour l'attaquant.
    poserDilemme("DEFENDER_PICK", ["bleu", "rose"]);
    act(() => s.emettre("intention", intention("dilAttackerPick", "attaquant", ["jaune"])));
    expect(vm.decisionQueue[0].attackerChoices).toEqual(["bleu", "rose"]);
  });

  it("une option désignée doit exister chez la cible", async () => {
    await partieHumaine();
    poserDilemme("ATTACKER_PICK", ["bleu", "vert"]);
    act(() => vm.dilValidateAttackerPick());
    expect(vm.decisionQueue[0].stage).toBe("ATTACKER_PICK");
  });

  it("seul le Détonateur choisit le sens du Vol", async () => {
    await partieHumaine();
    const det = vm.titanState.detonateur;
    const autre = [1, 2, 3, 4].find((id) => id !== det);
    act(() => vm.setPhase("repos"));
    const s = await hoteAvecSieges({ [det]: "detonateur", [autre]: "voisin" });

    act(() => s.emettre("intention", intention("chooseVolDirection", "voisin", ["gauche"])));
    expect(vm.volDirection).toBeFalsy();
    act(() => s.emettre("intention", intention("chooseVolDirection", "detonateur", ["droite"])));
    expect(vm.volDirection).toBe("droite");
  });
});

describe("Tête en Avant se joue à distance", () => {
  it("l'hôte adopte le mode ouvert chez l'invité, et la charge part", async () => {
    await partieHumaine();
    act(() => {
      const t1 = titan(1);
      const v = getPerimeter(t1.cell[0], Number(t1.cell.slice(1)))
        .filter((c) => !c.isSelf).find((c) => !vm.state.board[c.row + c.col]?.blocks?.length);
      titan(2).cell = v.row + v.col; titan(2).horsPlateau = false;
      [3, 4].forEach((id) => { titan(id).horsPlateau = true; });
      t1.programmed = ["tete_en_avant", "graouhhh", "boing_boing"];
      vm.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });
    act(() => vm.toggleTeaMode());
    const cible = [...vm.teaTargets.keys()][0];
    act(() => vm.toggleTeaMode()); // l'hôte, lui, n'a aucun mode ouvert
    expect(cible).toBeTruthy();

    const s = await hoteAvecSieges({ 1: "g1" });
    act(() => s.emettre("intention", { ...intention("jouerTeteEnAvant", "g1", [cible]), contexte: { teaAdrenaline: 0, teaMode: true } }));
    expect(titan(1).programmed).not.toContain("tete_en_avant");
  });
});

describe("Le Ramassage n'appartient qu'au Titan dont c'est le tour", () => {
  it("un Titan qui a joué plus tôt dans la Manche ne ramasse pas pendant le tour d'un autre", async () => {
    await partieHumaine();
    act(() => {
      titan(1).playedThisManche = ["tete_en_avant"];
      titan(2).playedThisManche = ["tete_en_avant"];
      vm.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });
    expect(vm.canUseRecupPassif(1)).toBe(true);
    expect(vm.canUseRecupPassif(2)).toBe(false);
  });
});

describe("Coin bloqué : le joueur choisit par où il rentre", () => {
  it("ouvre une décision bloquante à deux cases, et la referme au choix", async () => {
    await partieHumaine();
    act(() => {
      titan(2).cell = "A1"; titan(2).horsPlateau = false; // il occupe le coin
      titan(3).cell = "E5"; titan(3).horsPlateau = false;
      titan(4).cell = "E6"; titan(4).horsPlateau = false;
      titan(1).horsPlateau = true;
      titan(1).cell = "A1";
      vm.setTitanState((p) => ({ ...p, players: [...p.players] }));
      vm.setActivePlayerId(2);
    });
    act(() => vm.setActivePlayerId(1));

    expect(vm.decisionBloquante).toBe("coin");
    expect([...vm.cornerChoice.options].sort()).toEqual(["A2", "B1"]);

    act(() => vm.chooseCornerEntry("C5")); // hors des deux options : ignoré
    expect(titan(1).horsPlateau).toBe(true);

    act(() => vm.chooseCornerEntry("A2"));
    expect(titan(1).horsPlateau).toBe(false);
    expect(titan(1).cell).toBe("A2");
    expect(vm.cornerChoice).toBeNull();
    expect(vm.decisionBloquante).not.toBe("coin");
  });
});

/* ── TOUTE ACTION QUI MUTE LA PARTIE EST CLASSÉE ──
   Ce qu'un invité ne doit PAS pouvoir déclencher, et pourquoi. Ajouter une
   action au contrôleur oblige à la ranger ici ou dans `ACTIONS_DISTANTES`. */
const LOCALES = {
  // Brouillon d'interface : il reste chez celui qui le compose (cf. 2026-08-30).
  toggleProgCard: "brouillon de programmation",
  // Sortie de secours de la mise en place, et harnais de test : hôte seul.
  terminerPlacement: "sortie de secours, hôte seul",
};
const VERBE_MUTANT = /^(jouer|resolve|choose|choisir|dil[A-Z]|valider|validate|update|pick|refuser|accepter|ecroulement|passer|discard|toutCasser|reveal|confirm|placer|jnp[A-Z])/;

describe("Liste blanche des actions distantes", () => {
  it("chaque action mutante exposée à l'interface est jouable à distance ou déclarée locale", async () => {
    await partieHumaine();
    const source = readFileSync(resolve(process.cwd(), "src/application/useBoardGeneratorController.jsx"), "utf8");
    const debut = source.indexOf("const ACTIONS_DISTANTES = useMemo(() => ({");
    const bloc = source.slice(debut, source.indexOf("}), []);", debut));
    const blanche = new Set([...bloc.matchAll(/^\s+(\w+): "/gm)].map((m) => m[1]));
    expect(blanche.size).toBeGreaterThan(20);

    const nonClassees = Object.keys(vm)
      .filter((cle) => typeof vm[cle] === "function" && VERBE_MUTANT.test(cle))
      .filter((cle) => !blanche.has(cle) && !(cle in LOCALES));
    expect(nonClassees).toEqual([]);
  });
});

describe("Un tirage aveugle ferme l'annulation (Nikola, 2026-09-24)", () => {
  it("le Socle tiré au sort d'un Dilemme vide la pile", async () => {
    await partieHumaine();
    act(() => {
      titan(2).repaire = ["bleu"];
      titan(2).socles = [2, 3];
      vm.setTitanState((p) => ({ ...p, players: [...p.players] }));
      vm.setDecisionQueue([{
        ...makeDecisionRequest("DIL", 1, 2, CARD_LABEL.tete_en_avant, titan(2).cell),
        id: "socle", defenderIsAi: false, stage: "DEFENDER_PICK", attackerChoices: ["bleu", SOCLE_OPTION],
      }]);
    });
    act(() => vm.resolveDilDefenderPick(SOCLE_OPTION));
    expect(vm.decisionQueue).toHaveLength(0);
    expect(vm.undoStack).toHaveLength(0);
  });

  it("le Vol de Phase Repos ne s'annule pas", async () => {
    await partieHumaine();
    act(() => vm.setPhase("repos"));
    act(() => vm.chooseVolDirection("gauche"));
    expect(vm.volDirection).toBe("gauche");
    expect(vm.undoStack).toHaveLength(0);
  });
});

describe("RAGE : l'Adrénaline se prend à tout moment (Nikola, 2026-09-24)", () => {
  it("le glossaire de l'application le dit", () => {
    const rage = BADGES.find((b) => b.code === "RAGE");
    expect(rage.def).toMatch(/à la place d'un bloc, à tout moment/);
  });
});

describe("Le livret suit les rulings", () => {
  const livret = readFileSync(resolve(process.cwd(), "docs/livret/ProjetTitan_Livret.html"), "utf8");
  it("le lexique rapide du Dilemme connaît le Dilemme au sol et la défense par l'Adrénaline", () => {
    const ligne = livret.split("\n").find((l) => l.includes('class="badge b-dil"'));
    expect(ligne).toMatch(/une seule option/);
    expect(ligne).toMatch(/adrénaline/);
  });
  it("la section Amas dit qu'on peut y monter, et ce qui se passe quand on y tombe", () => {
    const section = livret.slice(livret.indexOf('id="tour"'), livret.indexOf("Élément hors du plateau"));
    expect(section).toMatch(/Mouvement gratuit/);
    expect(section).toMatch(/sans l'avoir choisi/);
  });
});
