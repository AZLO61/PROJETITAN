/* ============================================================
   PROJET TITAN — CE QU'UN APPAREIL MONTRE D'UNE DÉCISION QUI N'EST PAS À LUI
   ============================================================
   Arbitrages de Nikola du 2026-09-16. À distance : le défenseur lance le
   « 3-2-1 GO » de Faut Pas Me Chauffer, chacun ne voit que sa propre mise, et
   la carte prise par une Fatigue n'apparaît que chez sa cible. Autour d'une
   seule tablette, rien de tout cela ne change.
============================================================ */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FpmcBanner from "../../src/ui/panels/FpmcBanner.jsx";
import FatigueBanner from "../../src/ui/panels/FatigueBanner.jsx";
import { CARD_LABEL } from "../../src/domain/index.js";

const joueurs = [1, 2, 3].map((id) => ({ id, adrenaline: 2 }));
const noop = () => {};

// `tiens` : les Titans que CET appareil tient ; `null` = partie locale.
function vmDe(tiens, extra = {}) {
  return {
    titanState: { players: joueurs },
    titanDisplayName: (id) => `Titan ${id}`,
    session: tiens ? { siege: "x" } : null,
    titanMasque: (id) => (tiens ? !tiens.includes(id) : false),
    titanModes: { 1: "humain", 2: "humain", 3: "humain" },
    ...extra,
  };
}

const fpmc = {
  fpmcPendingIds: [], fpmcAttackerId: 1, fpmcAttackerBase: 5, fpmcRevelateur: 2,
  fpmcCurrent: { defenderId: 2, defenderBase: 4, attackerBid: null, defenderBid: 1 },
  pickFpmcTarget: noop, updateFpmcBid: noop, revealFPMC: noop,
};

afterEach(cleanup);

describe("Faut Pas Me Chauffer", () => {
  it("chez le défenseur : sa mise, la mise adverse cachée, et le bouton", () => {
    render(<FpmcBanner vm={vmDe([2], fpmc)} />);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    expect(screen.getByText("?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /3-2-1 GO/ })).toBeTruthy();
  });

  it("chez l'attaquant : sa mise seulement, et il attend le défenseur", () => {
    render(<FpmcBanner vm={vmDe([1], fpmc)} />);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /3-2-1 GO/ })).toBeNull();
    expect(screen.getByText(/lance le 3-2-1 GO/)).toBeTruthy();
  });

  it("autour d'une seule tablette : les deux mises et le bouton, comme avant", () => {
    render(<FpmcBanner vm={vmDe(null, fpmc)} />);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /3-2-1 GO/ })).toBeTruthy();
  });
});

describe("Fatigue", () => {
  const fatigue = {
    fatigueEnAttente: { attackerId: 1, targetId: 2, cardId: "tout_casser", cardLabel: "Graouhhh" },
    refuserFatigueEnCours: noop, accepterFatigueEnCours: noop,
  };

  it("chez la cible : la carte et le choix", () => {
    render(<FatigueBanner vm={vmDe([2], fatigue)} />);
    expect(screen.getAllByText(new RegExp(CARD_LABEL.tout_casser)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Encaisser/ })).toBeTruthy();
  });

  it("chez un autre : ni la carte, ni les boutons", () => {
    const vm = vmDe([3], { ...fatigue, fatigueEnAttente: { ...fatigue.fatigueEnAttente, cardId: "?" } });
    const { container } = render(<FatigueBanner vm={vm} />);
    expect(container.textContent).not.toContain(CARD_LABEL.tout_casser);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/décide/)).toBeTruthy();
  });
});
