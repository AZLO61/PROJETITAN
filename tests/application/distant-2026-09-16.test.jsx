/* ============================================================
   PROJET TITAN — LES ARBITRAGES DU 2026-09-16, À DISTANCE
   ============================================================
   · « Faut Pas Me Chauffer à distance : c'est le défenseur qui fait que ça
     se révèle » — et face à une IA, qui ne clique pas, l'attaquant.
   · « C'est pas normal que le journal et le résumé nomment la carte prise
     par la Fatigue » — et à distance, c'est la cible, et elle seule, qui voit
     la carte et décide de la reprendre.

   Même harnais que `distant-revue.test.jsx` : le vrai contrôleur, une session
   simulée, et les cartes jouées pour de vrai plutôt qu'un état fabriqué.
============================================================ */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { CARD_LABEL, getPerimeter, rowIndex, rowFromIndex } from "../../src/domain/index.js";
import { plateauPublic, mainPrivee } from "../../src/net/session.js";

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
    id: "TEST16", ref, siege, base: "http://relais.test",
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

const intention = (fn, de) => ({ t: "intention", de, pseudo: de, titanId: null, fn, args: [], contexte: {} });

/* T1 joue, chez l'hôte. T2 est posé à côté de lui, sur une case sans
   bâtiment — et T3 juste derrière, dans le même axe, si `deuxCibles` —, les
   autres Titans sortent du plateau le temps du test. Rend la direction de T1
   vers ses cibles. */
async function tableDeJeu(carte, { deuxCibles = false } = {}) {
  const user = userEvent.setup();
  render(<Harnais />);
  // Une graine fixe : le plateau, donc l'axe choisi plus bas, ne change pas d'un passage à l'autre.
  await user.type(screen.getByLabelText("Graine"), "2026");
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  act(() => vm.terminerPlacement());
  act(() => {
    vm.setTitanModes({ 1: "humain", 2: "humain", 3: "humain", 4: "humain" });
    vm.setPhase("action");
    vm.setActivePlayerId(1);
    vm.setSelectedTitanId(1);
  });
  let direction = null;
  act(() => {
    const joueurs = vm.titanState.players;
    const t1 = joueurs.find((t) => t.id === 1);
    const r1 = rowIndex(t1.cell[0]);
    const col1 = Number(t1.cell.slice(1));
    // La case à `d` pas dans la direction de `voisine` : sa clé, `null` hors du
    // plateau, `false` si un bâtiment debout l'occupe.
    const caseA = (voisine, d) => {
      const r = r1 + (rowIndex(voisine.row) - r1) * d;
      const c = col1 + (voisine.col - col1) * d;
      if (r < 0 || r > 8 || c < 1 || c > 9) return null;
      const cle = rowFromIndex(r) + c;
      return vm.state.board[cle]?.blocks?.length ? false : cle;
    };
    /* Un axe où les cibles tiennent, et où leur recul va jusqu'au bout — ou
       sort du plateau — sans buter sur un bâtiment : un repli suspendrait la
       carte avant la seconde Fatigue. */
    const nbCibles = deuxCibles ? 2 : 1;
    const voisine = getPerimeter(t1.cell[0], col1)
      .filter((c) => !c.isSelf)
      .find((c) => {
        for (let d = 1; d <= nbCibles + nbCibles + 1; d++) {
          const k = caseA(c, d);
          if (k === false) return false;
          if (k === null) return d > nbCibles;
        }
        return true;
      });
    direction = { dr: rowIndex(voisine.row) - r1, dc: voisine.col - col1 };
    const cibles = deuxCibles ? [2, 3] : [2];
    const mains = { 2: ["tout_casser"], 3: ["boing_boing"] }; // la seule carte que la Fatigue puisse prendre
    cibles.forEach((id, i) => {
      const t = joueurs.find((x) => x.id === id);
      t.cell = caseA(voisine, i + 1);
      t.horsPlateau = false;
      t.repaire = []; // pas de Dilemme possible : la carte va au bout d'un trait
      t.adrenaline = 1; // de quoi refuser une Fatigue
      t.hand = mains[id];
    });
    joueurs.filter((t) => t.id !== 1 && !cibles.includes(t.id)).forEach((t) => { t.horsPlateau = true; });
    t1.programmed = [carte, "tete_en_avant", "boing_boing"];
    vm.setTitanState((p) => ({ ...p, players: [...p.players] }));
  });
  return direction;
}

async function hoteAvecSieges(sieges) {
  const s = sessionSimulee("hote", { ref: "hote" });
  act(() => vm.brancherSession(s));
  act(() => s.emettre("presence", { joueurs: [], sieges }));
  return s;
}

afterEach(() => { cleanup(); vm = null; });

describe("Faut Pas Me Chauffer à distance : le défenseur révèle", () => {
  it("refuse la révélation à l'attaquant et aux autres, l'accepte du défenseur", async () => {
    await tableDeJeu("faut_pas_me_chauffer");
    const s = await hoteAvecSieges({ 1: "attaquant", 2: "defenseur", 3: "voisin" });
    act(() => vm.jouerFautPasMeChauffer());
    act(() => vm.pickFpmcTarget(2));
    expect(vm.fpmcRevelateur).toBe(2);

    act(() => s.emettre("intention", intention("revealFPMC", "attaquant")));
    act(() => s.emettre("intention", intention("revealFPMC", "voisin")));
    expect(vm.fpmcCurrent).not.toBeNull();

    act(() => s.emettre("intention", intention("revealFPMC", "defenseur")));
    expect(vm.fpmcCurrent).toBeNull();
  });

  it("face à une IA, c'est l'attaquant qui révèle", async () => {
    await tableDeJeu("faut_pas_me_chauffer");
    act(() => vm.setTitanModes({ 1: "humain", 2: "ia", 3: "humain", 4: "humain" }));
    act(() => vm.jouerFautPasMeChauffer());
    act(() => vm.pickFpmcTarget(2));
    expect(vm.fpmcRevelateur).toBe(1);
  });
});

describe("La Fatigue ne se nomme pas, et ne se tranche que par sa cible", () => {
  async function fatiguerT2() {
    const direction = await tableDeJeu("graouhhh");
    act(() => vm.setDirection({ ...direction, label: "test" }));
    act(() => vm.jouerGraouhhh());
    expect(vm.fatigueEnAttente).toMatchObject({ attackerId: 1, targetId: 2, cardId: "tout_casser" });
  }

  it("Graouhhh sur deux humains : chacun tranche sa Fatigue, à son tour", async () => {
    const direction = await tableDeJeu("graouhhh", { deuxCibles: true });
    act(() => vm.setDirection({ ...direction, label: "test" }));
    act(() => vm.jouerGraouhhh());
    // Du plus loin au plus proche, comme le recul lui-même.
    expect(vm.fatigueEnAttente).toMatchObject({ targetId: 3, cardId: "boing_boing" });
    act(() => vm.accepterFatigueEnCours());
    expect(vm.fatigueEnAttente).toMatchObject({ targetId: 2, cardId: "tout_casser" });
    act(() => vm.refuserFatigueEnCours());
    expect(vm.fatigueEnAttente).toBeNull();
    expect(vm.titanState.players.find((t) => t.id === 2).hand).toContain("tout_casser");
    expect(vm.titanState.players.find((t) => t.id === 3).hand).not.toContain("boing_boing");
  });

  it("le journal ne dit pas quelle carte est partie", async () => {
    await fatiguerT2();
    const journal = vm.actionLog.join("\n");
    expect(journal).toMatch(/Fatigue/);
    expect(journal).not.toContain(CARD_LABEL.tout_casser);
  });

  it("seule la cible peut payer ou encaisser", async () => {
    await fatiguerT2();
    const s = await hoteAvecSieges({ 2: "cible", 3: "voisin" });
    act(() => s.emettre("intention", intention("refuserFatigueEnCours", "voisin")));
    expect(vm.fatigueEnAttente).not.toBeNull();
    expect(vm.titanState.players.find((t) => t.id === 2).adrenaline).toBe(1);

    act(() => s.emettre("intention", intention("refuserFatigueEnCours", "cible")));
    expect(vm.fatigueEnAttente).toBeNull();
    const t2 = vm.titanState.players.find((t) => t.id === 2);
    expect(t2.adrenaline).toBe(0);
    expect(t2.hand).toContain("tout_casser");
    expect(vm.actionLog.join("\n")).not.toContain(CARD_LABEL.tout_casser);
  });

  it("l'invité visé voit sa carte et son bandeau ; un autre invité, rien", async () => {
    await fatiguerT2();
    const complet = vm.instantaneCourant();
    cleanup();

    for (const [titanId, carteVue] of [[2, "tout_casser"], [3, "?"]]) {
      await tableDeJeu("graouhhh");
      const s = sessionSimulee("invite", { ref: "moi", sieges: { [titanId]: "moi" } });
      s.etatInitial = plateauPublic(complet);
      act(() => vm.brancherSession(s));
      act(() => s.emettre("prive", mainPrivee(complet, titanId)));
      expect(vm.decisionBloquante).toBe("fatigue");
      expect(vm.fatigueEnAttente.cardId).toBe(carteVue);
      cleanup();
    }
  });
});
