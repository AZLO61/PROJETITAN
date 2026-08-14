import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BoardGenerator from "../../src/BoardGenerator.jsx";

// Filet de non-régression sur le RENDU (pas sur les règles du jeu).
// Le contrôleur retourne du JSX pendant l'écran de configuration puis un
// viewmodel une fois la partie lancée : les deux chemins passent par la
// même liste de hooks. C'est exactement ce qu'un ajout de useMemo peut
// casser, et aucun test ne couvrait ce passage jusqu'ici.
describe("rendu de l'application", () => {
  afterEach(cleanup);

  it("affiche l'écran de configuration au démarrage", () => {
    render(<BoardGenerator />);
    expect(screen.getByText(/PROJET TITAN — Configuration/)).toBeTruthy();
  });

  it("passe en écran de jeu sans casser l'ordre des hooks", async () => {
    const user = userEvent.setup();
    render(<BoardGenerator />);

    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    // L'écran de configuration a laissé place au plateau : si l'ordre des
    // hooks avait changé entre les deux rendus, React aurait levé ici.
    expect(screen.queryByText(/PROJET TITAN — Configuration/)).toBeNull();
  });

  it("ouvre et referme les Règles sans perdre la partie en cours", async () => {
    const user = userEvent.setup();
    render(<BoardGenerator />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    // Repère stable de la partie en cours : le titre du plateau porte le
    // numéro de tirage, il disparaîtrait si le contrôleur était remonté.
    const avant = screen.getByText(/BIG CITY/).textContent;

    await user.click(screen.getByRole("button", { name: /Règles du jeu/ }));
    expect(await screen.findByRole("dialog", { name: /Règles du jeu/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Retour à la partie/ }));
    expect(screen.queryByRole("dialog", { name: /Règles du jeu/ })).toBeNull();

    // Même partie qu'avant l'ouverture : rien n'a été régénéré.
    expect(screen.getByText(/BIG CITY/).textContent).toBe(avant);
  });

  it("ne charge pas la vue 3D tant qu'elle n'est pas demandée", async () => {
    const user = userEvent.setup();
    render(<BoardGenerator />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    // Board3D est en import dynamique : tant que show3D est faux, ni le
    // canvas ni le fallback de chargement ne doivent apparaître.
    expect(screen.queryByText(/Chargement de la vue 3D/)).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
  });
});
