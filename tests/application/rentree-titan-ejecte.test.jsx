/* ============================================================
   PROJET TITAN — Un Titan éjecté doit RENTRER à l'ouverture de son tour
   ============================================================
   Bug remonté par Nikola le 2026-08-28 : « j'ai créé un bug avec un warp
   into téléporteur, j'ai disparu du plateau et je ne peux plus jouer sauf
   faire défausser une carte ».

   Le symptôme décrit exactement l'état `horsPlateau` dont on ne sort pas :
   un Titan hors de BIG CITY ne peut plus jouer de carte à effet, seulement
   défausser (cf. `getPhaseBlockReason`). Il devait rentrer à l'ouverture de
   son tour suivant, et il ne rentrait pas.

   UNE PISTE ÉCARTÉE, ET IL VAUT MIEUX L'ÉCRIRE QUE LA REFAIRE. L'effet de
   rentrée lit l'état des Titans dans `aiTitanStateRef`, une ref
   synchronisée par un effet déclaré PLUS BAS dans le même fichier — donc
   exécuté APRÈS lui à chaque commit. Cela ressemble beaucoup à la cause,
   et ça n'en est pas une : les Titans sont mutés EN PLACE dans tout ce
   projet, la ref pointe sur les mêmes objets que l'état, et une ref d'un
   commit de retard voit donc la même mutation. Le premier test ci-dessous
   a été écrit pour reproduire ce scénario : il passe.

   Ce fichier reste le filet qui manquait sur `horsPlateau` côté
   application — aucun test ne vérifiait qu'un Titan sorti revient. Il pose
   l'état exact plutôt que de passer par une carte, parce que c'est ce que
   le contrôleur doit garantir quelle que soit la carte qui a éjecté.
============================================================ */
import { afterEach, describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";

let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours" />;
}

async function partieLancee() {
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  return vmCourant.titanState.players;
}

describe("Un Titan éjecté rentre à l'ouverture de son tour", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("il rentre même quand il est éjecté dans le même rendu que l'ouverture de son tour", async () => {
    const [t1, t2, t3, t4] = await partieLancee();
    act(() => {
      // Les autres dégagent du bord : ils ne doivent pas occuper la case de
      // rentrée et brouiller ce que ce test mesure.
      t2.cell = "E5"; t3.cell = "E6"; t4.cell = "E7";
      // Le Titan 1 est hors de BIG CITY, il rentrera par C1.
      t1.horsPlateau = true;
      t1.cell = "C1";
      t1.programmed = ["tout_casser"];
      /* TOUT DANS LE MÊME `act` : l'éjection et l'ouverture du tour tombent
         dans le même commit React, ce qui est le cas réel — la carte qui
         éjecte est résolue, puis la main passe. C'est précisément là que
         l'effet de rentrée lisait une ref d'un rendu trop vieux. */
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
      vmCourant.setPhase("action");
      vmCourant.setActivePlayerId(t1.id);
      vmCourant.setSelectedTitanId(t1.id);
    });

    const apres = vmCourant.titanState.players.find((p) => p.id === t1.id);
    expect(apres.horsPlateau).toBeFalsy();
    // Et il est bien quelque part sur le plateau 9x9.
    expect(apres.cell).toMatch(/^[A-I][1-9]$/);
  });

  it("sa rentrée lui coûte une case de Mouvement gratuit", async () => {
    /* Le coût de rentrée ne s'observe pas directement — il n'est pas
       exposé — mais il ampute la portée du Mouvement gratuit, qui l'est.
       C'est d'ailleurs la seule chose qui compte pour le joueur : 2 cases
       normalement, 1 seule quand il vient de rentrer. */
    const [t1, t2, t3, t4] = await partieLancee();
    act(() => {
      t2.cell = "E5"; t3.cell = "E6"; t4.cell = "E7";
      t1.horsPlateau = true;
      t1.cell = "G1";
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
      vmCourant.setPhase("action");
      vmCourant.setActivePlayerId(t1.id);
      vmCourant.setSelectedTitanId(t1.id);
    });
    expect(vmCourant.moveMaxRange).toBe(1);
  });

  it("un Titan qui n'est pas sorti garde ses deux cases", async () => {
    const [t1] = await partieLancee();
    act(() => {
      vmCourant.setPhase("action");
      vmCourant.setActivePlayerId(t1.id);
      vmCourant.setSelectedTitanId(t1.id);
    });
    expect(vmCourant.titanState.players.find((p) => p.id === t1.id).horsPlateau).toBeFalsy();
    expect(vmCourant.moveMaxRange).toBe(2);
  });
});

/* ============================================================
   DEUXIÈME REMONTÉE, 2026-08-28 — et cette fois le journal la nomme
   ============================================================
   « J'ai encore dû faire défausser et je n'étais quand même pas visible
   ensuite. » Son journal porte la signature exacte du défaut : une ligne
   « Titan 1 : Mouvement gratuit → B3 » SANS la ligne « revient sur BIG
   CITY » qui la précède toujours quand la rentrée a eu lieu.

   Le Titan avait donc joué son Mouvement gratuit en étant encore dehors.
   `cell` d'un Titan sorti ne dit pas où il est — il n'est nulle part — mais
   PAR OÙ il rentrera : écrire dedans déplaçait sa future case d'entrée sans
   jamais le remettre en jeu.

   Les tests ci-dessus couvrent le chemin normal (l'effet d'ouverture de
   tour). Ceux-ci couvrent le FILET, c'est-à-dire ce qui doit tenir quand ce
   chemin-là n'a pas été pris — puisqu'il ne l'a manifestement pas toujours
   été, deux fois de suite.
============================================================ */
describe("Un Titan hors de BIG CITY ne peut pas se déplacer", () => {
  it("le domaine refuse le Mouvement gratuit et le dit au journal", async () => {
    const { resolveFreeMovement } = await import("../../src/domain/gameRules.js");
    const titan = {
      id: 1, cell: "I5", horsPlateau: true, repaire: [], socles: [],
      adrenaline: 0, bagarre: 0, destruction: 0,
      hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
    };
    const res = resolveFreeMovement(1, "B3", { titans: [titan], board: {}, looseBlocks: {} });

    // Ni déplacé, ni silencieusement remis en jeu.
    expect(titan.cell).toBe("I5");
    expect(titan.horsPlateau).toBe(true);
    expect(res.log.join(" ")).toMatch(/hors de BIG CITY/);
    // Et surtout : plus jamais la ligne qui a trompé la lecture du journal.
    expect(res.log.join(" ")).not.toMatch(/Mouvement gratuit →/);
  });

  it("la rentrée est appelable à la demande, pas seulement par un effet", async () => {
    /* C'est la correction structurelle : un `useEffect` ne se rejoue que si
       ses dépendances changent, donc il ne peut pas être le seul garant
       d'une étape obligatoire du tour. */
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/application/useBoardGeneratorController.jsx", "utf8");
    expect(src).toContain("const assurerRentree = useCallback(");
    // Appelée par l'effet ET par le Mouvement gratuit.
    expect((src.match(/assurerRentree\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

/* ============================================================
   MISE EN PLACE D'OUVERTURE — ruling du 2026-08-28
   ============================================================
   « Le placement choisi par le joueur au début du jeu (inverse de
   l'initiative, Détonateur en dernier) [...] c'est un choix, ça ne doit pas
   être automatique, sauf pour une IA. »

   Le second test est le plus important, et il vient d'un vrai incident
   observé au navigateur : quatre clics assez rapprochés pour tomber dans le
   même lot React laissaient trois Titans jamais posés — donc invisibles — sur
   un plateau où la partie démarrait quand même. La cause était une fermeture
   qui lisait la file au lieu de lire les Titans.
============================================================ */
describe("Le placement d'ouverture", () => {
  it("pose les quatre Titans, dans l'inverse de l'initiative", async () => {
    const user = userEvent.setup();
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    // Détonateur en dernier : c'est la compensation du fait qu'il ouvre la
    // Manche, et la seule raison pour laquelle l'ordre a un sens.
    const file = [...vmCourant.placementRestant];
    expect(file).toHaveLength(4);
    expect(file[file.length - 1]).toBe(vmCourant.titanState.detonateur);

    for (let i = 0; i < 4; i++) {
      const cible = vmCourant.placementCells[0];
      await act(async () => { vmCourant.placerTitanJoueur(cible); });
    }
    expect(vmCourant.titanState.players.every((t) => !t.aPlacer)).toBe(true);
    expect(vmCourant.placementRestant).toHaveLength(0);
  });

  it("quatre clics dans le MÊME lot posent quatre Titans, pas un seul", async () => {
    /* Le rythme des clics ne doit rien décider. Sans la lecture sur les
       Titans, ce test laisse trois `aPlacer` à true et une file vide : le pire
       des deux mondes, puisque la partie démarre sur un plateau incomplet. */
    const user = userEvent.setup();
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    await act(async () => {
      vmCourant.placerTitanJoueur("A2");
      vmCourant.placerTitanJoueur("B1");
      vmCourant.placerTitanJoueur("A8");
      vmCourant.placerTitanJoueur("B9");
    });

    const restants = vmCourant.titanState.players.filter((t) => t.aPlacer).map((t) => t.id);
    expect(restants).toEqual([]);
    const cases = vmCourant.titanState.players.map((t) => t.cell).sort();
    expect(new Set(cases).size).toBe(4); // et jamais deux sur la même case
  });

  it("une IA prend position toute seule", async () => {
    /* On passe par les interrupteurs de l'écran d'accueil plutôt que par le
       setter : c'est le chemin réel, et il garantit que `regenerate` voit les
       modes à jour au moment où il construit la file. */
    const user = userEvent.setup();
    render(<Harnais />);
    for (const commutateur of screen.getAllByRole("switch")) {
      await user.click(commutateur);
    }
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
    expect(vmCourant.titanState.players.every((t) => !t.aPlacer)).toBe(true);
    expect(vmCourant.placementRestant).toHaveLength(0);
  });
});
