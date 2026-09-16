/* ============================================================
   PROJET TITAN — La réflexion des IA dans un Web Worker
   ============================================================
   Nikola, 2026-09-16 : l'Expert bloquait l'onglet de l'hôte jusqu'à 1,6 s.
   La recherche part désormais dans un Worker (cf. `penseeIA.js`).

   jsdom n'a pas de Worker : toute la suite joue donc le repli synchrone, et
   rien ne vérifiait le vrai chemin — celui du navigateur, où le coup revient
   PLUS TARD. Ce fichier le joue avec un faux Worker asynchrone, qui clone ses
   messages comme le vrai : une donnée intransmissible le ferait échouer au
   lieu de retomber en silence sur le fil principal. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as planificateurs from "../../src/domain/aiPlanner.js";
import { avecGraine } from "../../src/domain/rng.js";

const PENSEE = "../../src/application/penseeIA.js";

class FauxWorker {
  static demandes = [];
  static echecsClonage = 0;
  static erreurAuProchain = false;
  constructor() { FauxWorker.derniere = this; }
  postMessage(message) {
    let copie;
    try { copie = structuredClone(message); } catch (e) { FauxWorker.echecsClonage++; throw e; }
    FauxWorker.demandes.push(copie.nom);
    const erreur = FauxWorker.erreurAuProchain;
    FauxWorker.erreurAuProchain = false;
    setTimeout(() => {
      const { id, nom, args, graine } = copie;
      this.onmessage?.({ data: erreur
        ? { id, erreur: "panne simulée" }
        : { id, resultat: structuredClone(avecGraine(graine, () => planificateurs[nom](...args))) } });
    }, 5);
  }
  terminate() {}
}

async function partieDeTest() {
  const { setSeed } = await import("../../src/domain/rng.js");
  const { generateBoard, placeTitans } = await import("../../src/domain/gameRules.js");
  const { makeProfile, FORCES } = await import("../../src/domain/aiEvaluation.js");
  setSeed(7);
  const plateau = generateBoard();
  const ts = placeTitans(4);
  return {
    args: [1, { board: plateau.board, looseBlocks: {}, titans: ts.players }, makeProfile(FORCES.EXPERT), 1],
  };
}

beforeEach(() => {
  vi.resetModules();
  FauxWorker.demandes = [];
  FauxWorker.echecsClonage = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cleanup();
});

describe("penser — sans Worker", () => {
  it("rappelle tout de suite, avec une recherche semée par UN tirage de la partie", async () => {
    vi.stubGlobal("Worker", undefined);
    const { penser } = await import(PENSEE);
    const rng = await import("../../src/domain/rng.js");
    const { args } = await partieDeTest();

    rng.setSeed(42);
    let recu;
    penser("planProgrammation", args, (r) => { recu = r; });
    expect(recu).toHaveLength(3); // synchrone : déjà là
    const suiteDeLaPartie = rng.random();

    rng.setSeed(42);
    const graine = rng.randomInt(0x100000000);
    expect(suiteDeLaPartie).toBe(rng.random()); // un seul tirage consommé
    const planif = await import("../../src/domain/aiPlanner.js");
    expect(recu).toEqual(rng.avecGraine(graine, () => planif.planProgrammation(...args)));
  });
});

describe("penser — avec un Worker", () => {
  it("rappelle au retour du Worker, et rejoue ici une recherche qui a échoué là-bas", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FauxWorker);
    const { penser } = await import(PENSEE);
    const { args } = await partieDeTest();

    let recu;
    penser("planProgrammation", args, (r) => { recu = r; });
    expect(recu).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10);
    expect(recu).toHaveLength(3);

    FauxWorker.erreurAuProchain = true;
    let rejoue;
    penser("planProgrammation", args, (r) => { rejoue = r; });
    await vi.advanceTimersByTimeAsync(10);
    expect(rejoue).toHaveLength(3);
  });

  it("un Worker qui ne se charge pas ne fige rien : l'attente est calculée ici", async () => {
    vi.stubGlobal("Worker", FauxWorker);
    const { penser } = await import(PENSEE);
    const { args } = await partieDeTest();

    let enAttente;
    penser("planProgrammation", args, (r) => { enAttente = r; });
    FauxWorker.derniere.postMessage = () => {};
    FauxWorker.derniere.onerror();
    expect(enAttente).toHaveLength(3);

    let ensuite;
    penser("planProgrammation", args, (r) => { ensuite = r; });
    expect(ensuite).toHaveLength(3); // plus de Worker : synchrone
  });

  it("le fil de réflexion répond sous l'identifiant reçu, et renvoie l'erreur au lieu de mourir", async () => {
    const envoyes = [];
    vi.stubGlobal("postMessage", (m) => envoyes.push(m));
    await import("../../src/application/iaWorker.js");
    const { args } = await partieDeTest();

    self.onmessage({ data: { id: 7, nom: "planProgrammation", args, graine: 3 } });
    self.onmessage({ data: { id: 8, nom: "inexistant", args: [], graine: 3 } });
    expect(envoyes[0]).toEqual({ id: 7, resultat: expect.any(Array) });
    expect(envoyes[1]).toEqual({ id: 8, erreur: expect.any(String) });
  });
});

describe("une partie à 4 IA avance quand la réflexion revient plus tard", () => {
  it("la main circule, et toutes les recherches passent par le Worker", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("Worker", FauxWorker);
    const { useBoardGeneratorController } = await import("../../src/application/useBoardGeneratorController.jsx");
    let vm = null;
    function Harnais() {
      const v = useBoardGeneratorController();
      if (isValidElement(v)) return v;
      vm = v;
      return <div />;
    }

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
    act(() => {
      const modes = {};
      vm.titanState.players.forEach((t) => { modes[t.id] = "ia"; });
      vm.setTitanModes(modes);
    });
    act(() => vm.terminerPlacement());

    const actifsVus = new Set();
    for (let i = 0; i < 30; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
      if (vm.activePlayerId != null) actifsVus.add(vm.activePlayerId);
    }

    const cartesJouees = vm.titanState.players.reduce((s, t) => s + t.playedThisManche.length, 0);
    expect(cartesJouees).toBeGreaterThan(4);
    expect(actifsVus.size).toBeGreaterThan(2);
    expect(FauxWorker.demandes.length).toBeGreaterThan(4);
    expect(FauxWorker.echecsClonage).toBe(0);
  });
});
