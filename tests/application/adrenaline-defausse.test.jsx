/* ============================================================
   PROJET TITAN — Option de table « Adrénaline à la défausse »
   ============================================================
   Nikola, 2026-09-24 : « Rajoute un mode si on défausse une carte ça donne
   une adrénaline ». Cochée avant de lancer, chaque défausse rapporte +1
   Adrénaline ; décochée (défaut), la défausse reste sans effet.
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

async function defausserUneCarte({ option }) {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  if (option) await user.click(screen.getByRole("checkbox", { name: /Adrénaline à la défausse/ }));
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  const id = vmCourant.titanState.ordreJeu[0];
  act(() => {
    vmCourant.setPhase("action");
    vmCourant.setActivePlayerId(id);
    vmCourant.setSelectedTitanId(id);
  });
  act(() => {
    const t = vmCourant.titanState.players.find((p) => p.id === id);
    t.programmed = ["je_ne_partage_pas", "tout_casser", "graouhhh"];
    vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
  });
  const avant = vmCourant.titanState.players.find((p) => p.id === id).adrenaline;
  act(() => { vmCourant.discardCurrentCard(id, "je_ne_partage_pas"); });
  const t = vmCourant.titanState.players.find((p) => p.id === id);
  expect(t.discardedHidden).toContain("je_ne_partage_pas");
  return t.adrenaline - avant;
}

describe("Option « Adrénaline à la défausse »", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("cochée : la défausse rapporte 1 Adrénaline", async () => {
    expect(await defausserUneCarte({ option: true })).toBe(1);
  });

  it("décochée (défaut) : la défausse ne rapporte rien", async () => {
    expect(await defausserUneCarte({ option: false })).toBe(0);
  });
});
