/* ============================================================
   PROJET TITAN — Un F5 de l'hôte ne perd plus la partie (2026-09-24)
   ============================================================
   Le relais ne garde qu'un plateau public, sans les mains : un hôte qui
   rechargeait sa page ne pouvait plus rien reprendre, et le garde-fou du
   2026-09-07 se contentait de couper sa diffusion pour ne pas écraser la
   table. Sa page range désormais l'instantané complet dans son navigateur ;
   en rejoignant la MÊME table après un F5, elle le retrouve.
============================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { plateauPublic } from "../../src/net/session.js";

let vmCourant = null;
let accueilCourant = null; // l'écran d'accueil, avant tout lancement de partie
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) { accueilCourant = vm; vmCourant = null; return vm; }
  vmCourant = vm;
  return <div data-testid="partie-en-cours" />;
}

function sessionHote(id) {
  return {
    id, ref: "hote", siege: "hote", base: "http://relais.test",
    joueurs: [{ ref: "hote", pseudo: "Hôte", siege: "hote" }],
    sieges: {}, etatInitial: null,
    sur() { return () => {}; },
    diffuserEtat() { return Promise.resolve({}); },
    diffuserJournal() { return Promise.resolve({}); },
    envoyerPrive() { return Promise.resolve({}); },
    publierSieges() { return Promise.resolve({}); },
    envoyerIntention() { return Promise.resolve({}); },
    resynchroniser: vi.fn(),
    quitter: vi.fn(() => Promise.resolve()),
    estVivante() { return true; },
  };
}

// Une partie lancée par un hôte, sauvegardée par sa page ; puis la page recharge.
async function hoteQuiRecharge(idTableRejointe) {
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  act(() => vmCourant.terminerPlacement());
  act(() => vmCourant.brancherSession(sessionHote("TABLE1")));
  await act(async () => { await new Promise((ok) => setTimeout(ok, 600)); }); // la sauvegarde part après 400 ms
  const avant = vmCourant.instantaneCourant();
  cleanup(); // le F5 : la page repart de zéro, la sauvegarde reste dans le navigateur

  render(<Harnais />);
  expect(vmCourant).toBeNull(); // page rechargée : écran d'accueil, aucune partie
  const s = sessionHote(idTableRejointe);
  s.etatInitial = plateauPublic(avant);
  // L'hôte rejoint sa table depuis l'écran d'accueil (panneau « Jouer à distance »).
  act(() => accueilCourant.props.onBrancherSession(s));
  return avant;
}

describe("Un hôte qui recharge sa page reprend sa partie", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vmCourant = null; accueilCourant = null; localStorage.clear(); });

  it("en rejoignant la même table, mains comprises, sans bloquer la diffusion", async () => {
    const avant = await hoteQuiRecharge("TABLE1");
    expect(vmCourant.setupDone).toBe(true);
    expect(vmCourant.distantDiffusionBloquee).toBe(false);
    const mains = (etat) => etat.titanState.players.map((t) => [...t.hand].sort().join(","));
    expect(mains(vmCourant)).toEqual(mains(avant));
    expect(vmCourant.titanState.players.every((t) => t.hand.length > 0)).toBe(true);
  });

  it("une autre table ne reprend rien : le garde-fou coupe la diffusion comme avant", async () => {
    await hoteQuiRecharge("TABLE2");
    expect(vmCourant).toBeNull(); // toujours l'écran d'accueil : rien n'a été repris
    expect(accueilCourant.props.distantAvis).toMatch(/déjà une partie en cours/);
  });
});
