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

  /* Repère de l'écran de configuration : le champ de nom du premier Titan.
     Le titre de l'écran servait de repère jusqu'ici ; c'est une chaîne
     décorative, qui a changé avec la refonte visuelle alors que l'écran
     faisait toujours exactement son travail. Un champ nommé, lui, ne peut
     pas disparaître sans que la fonction disparaisse avec. */
  const champDeNom = () => screen.queryByLabelText(/Nom du Titan 1/);

  it("affiche l'écran de configuration au démarrage", () => {
    render(<BoardGenerator />);
    expect(champDeNom()).toBeTruthy();
    expect(screen.getByRole("button", { name: /Lancer la partie/ })).toBeTruthy();
  });

  it("passe en écran de jeu sans casser l'ordre des hooks", async () => {
    const user = userEvent.setup();
    render(<BoardGenerator />);

    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    // L'écran de configuration a laissé place au plateau : si l'ordre des
    // hooks avait changé entre les deux rendus, React aurait levé ici.
    expect(champDeNom()).toBeNull();
  });

  it("ouvre et referme les Règles sans perdre la partie en cours", async () => {
    const user = userEvent.setup();
    render(<BoardGenerator />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    // Repère stable de la partie en cours : le titre du plateau porte le
    // numéro de tirage, il disparaîtrait si le contrôleur était remonté.
    const avant = screen.getByText(/BIG CITY/).textContent;

    await user.click(screen.getByRole("button", { name: /Règles du jeu/ }));
    /* La page Règles est en import dynamique derrière un Suspense : son
       arrivée dépend de la résolution d'un module, pas d'un rendu React. Le
       délai par défaut d'une seconde suffit quand ce fichier tourne seul,
       mais pas quand toute la campagne de tests tourne en parallèle — d'où un
       échec qui n'apparaissait qu'en suite complète. On attend le chargement,
       pas une durée arbitraire. */
    expect(
      await screen.findByRole("dialog", { name: /Règles du jeu/ }, { timeout: 8000 })
    ).toBeTruthy();

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
