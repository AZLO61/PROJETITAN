/* ============================================================
   PROJET TITAN — LA CÉLÉBRATION DE L'ARC-EN-CIEL
   ============================================================
   Nikola, 2026-09-07 : « quand "arc en ciel" est atteint, faut une animation
   d'un arc-en-ciel au milieu de l'écran POUR TOUS, pour que ce soit bien
   visible, puis une petite musique mignonne de 3 secondes ».

   Ce composant est le seul du jeu à se déclencher sur une TRANSITION plutôt
   que sur un état : c'est ce qui le rend juste chez l'hôte comme chez un
   invité (les deux voient `rainbowWinnerId` passer de null à un identifiant),
   et c'est aussi ce qui peut se casser en silence. D'où ces quatre cas.

   L'audio n'est pas testé : jsdom n'a pas d'`AudioContext`, et le composant le
   prévoit — c'est justement ce que le premier cas vérifie au passage, puisque
   un jingle non gardé ferait tomber le rendu.
============================================================ */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import RainbowCelebration from "../../src/ui/panels/RainbowCelebration.jsx";

const vm = (rainbowWinnerId) => ({
  rainbowWinnerId,
  titanDisplayName: (id) => `Titan ${id}`,
});

describe("Le Trophée Arc-en-ciel se voit à l'écran", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("apparaît quand le Trophée est décerné en cours de partie", () => {
    const { rerender } = render(<RainbowCelebration vm={vm(null)} />);
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<RainbowCelebration vm={vm(3)} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/ARC-EN-CIEL/)).toBeTruthy();
    expect(screen.getByText(/Titan 3 réunit les 5 couleurs/)).toBeTruthy();
  });

  it("ne rejoue rien quand on arrive sur un Trophée déjà décerné", () => {
    // Un invité qui rejoint en cours de partie, ou une page rechargée : la
    // valeur au montage est une référence, jamais un déclencheur.
    render(<RainbowCelebration vm={vm(2)} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("s'efface au bout de trois secondes", () => {
    vi.useFakeTimers();
    const { rerender } = render(<RainbowCelebration vm={vm(null)} />);
    rerender(<RainbowCelebration vm={vm(1)} />);
    expect(screen.getByRole("status")).toBeTruthy();

    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("ne se déclenche pas quand un « Annuler » retire le Trophée", () => {
    const { rerender } = render(<RainbowCelebration vm={vm(4)} />);
    rerender(<RainbowCelebration vm={vm(null)} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
