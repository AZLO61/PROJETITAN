/* ============================================================
   PROJET TITAN — CE QUE LA REVUE DU 2026-09-14 A FERMÉ À DISTANCE
   ============================================================
   Un test par correctif de la revue. Même harnais que
   `invite-distant.test.jsx` : le vrai contrôleur, et une session simulée qui
   retient ce qu'on lui confie et laisse le test jouer le rôle du relais.
============================================================ */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { CARD_LABEL } from "../../src/domain/index.js";
import { plateauPublic, mainPrivee } from "../../src/net/session.js";

let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours">Manche {vm.mancheNumber}</div>;
}

function sessionSimulee(siege, { ref = "moi", sieges = {} } = {}) {
  const abonnes = {};
  return {
    id: "TEST01", ref, siege, base: "http://relais.test",
    joueurs: [{ ref, pseudo: "Invité", siege }],
    sieges,
    etatInitial: null,
    intentions: [],
    siegesPublies: [],
    sur(canal, cb) { (abonnes[canal] ||= []).push(cb); return () => {}; },
    emettre(canal, charge) { (abonnes[canal] || []).forEach((cb) => cb(charge)); },
    envoyerIntention(fn, args, contexte) { this.intentions.push({ fn, args, contexte }); return Promise.resolve({}); },
    diffuserEtat() { return Promise.resolve({}); },
    diffuserJournal() { return Promise.resolve({}); },
    envoyerPrive() { return Promise.resolve({}); },
    publierSieges(s) { this.siegesPublies.push(s); return Promise.resolve({}); },
    envoyerChat() { return Promise.resolve({}); },
    resynchroniser: vi.fn(),
    quitter: vi.fn(() => Promise.resolve()),
    estVivante() { return true; },
  };
}

async function lancerUnePartie() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  act(() => vmCourant.terminerPlacement());
  return vmCourant;
}

async function partieCoteHote(sieges) {
  await lancerUnePartie();
  const s = sessionSimulee("hote", { ref: "hote", sieges: {} });
  act(() => { vmCourant.brancherSession(s); });
  act(() => { s.emettre("presence", { joueurs: [], sieges }); });
  return s;
}

async function partieCoteInvite(titanId = 2) {
  await lancerUnePartie();
  const complet = vmCourant.instantaneCourant();
  const s = sessionSimulee("invite", { ref: "moi", sieges: { [titanId]: "moi" } });
  s.etatInitial = plateauPublic(complet);
  act(() => { vmCourant.brancherSession(s); });
  act(() => { s.emettre("prive", mainPrivee(complet, titanId)); });
  return s;
}

const intention = (fn, args, contexte = {}, de = "eddy") => ({
  t: "intention", de, pseudo: "Eddy", titanId: null, fn, args, contexte,
});

afterEach(() => { cleanup(); vmCourant = null; vi.useRealTimers(); });

describe("La Phase Programmation reste secrète", () => {
  it("le journal dit qu'un Titan a programmé, jamais quelles cartes", async () => {
    await lancerUnePartie();
    const id = vmCourant.selectedTitanId
      ?? vmCourant.titanState.ordreJeu.find((t) => vmCourant.titanModes[t] !== "ia");
    act(() => { vmCourant.setSelectedTitanId(id); });
    const main = [...vmCourant.titanState.players.find((t) => t.id === id).hand];
    vi.useFakeTimers();
    act(() => { vmCourant.toggleProgCard(0, main[0]); });
    act(() => { vmCourant.toggleProgCard(1, main[1]); });
    act(() => { vmCourant.toggleProgCard(2, main[2]); });
    act(() => { vi.advanceTimersByTime(3500); });
    const ligne = vmCourant.actionLog.find((l) => l.startsWith(`✅ T${id}`));
    expect(ligne).toMatch(/a programmé ses 3 cartes/);
    main.slice(0, 3).forEach((c) => expect(ligne).not.toContain(CARD_LABEL[c]));
  });
});

describe("Une intention malformée ne fait pas tomber l'hôte", () => {
  it("ignore une valeur de Vert qui n'est pas une chaîne", async () => {
    const s = await partieCoteHote({ 2: "eddy" });
    // Un Vert à placer : on ne place que ceux qu'on possède (audit du 2026-09-23).
    act(() => {
      vmCourant.titanState.players.find((t) => t.id === 2).repaire.push("vert");
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });
    // Témoin : la même intention, bien formée, va jusqu'au bout.
    act(() => { s.emettre("intention", intention("updateVertAssignment", [2, 0, "piste:rouge"])); });
    expect(vmCourant.vertAssignments[2]?.[0]).toEqual({ type: "piste", target: "rouge" });
    expect(() => {
      act(() => { s.emettre("intention", intention("updateVertAssignment", [2, 0, 42])); });
    }).not.toThrow();
    expect(vmCourant.vertAssignments[2]?.[0]).toEqual({ type: "piste", target: "rouge" });
  });

  it("ignore un brouillon qui n'a pas la bonne forme", async () => {
    const s = await partieCoteHote({ 2: "eddy" });
    act(() => { s.emettre("intention", intention("confirmProgrammation", [], { progSelection: 5, bbPath: "C4" })); });
    // Adopté tel quel, `progSelection: 5` faisait lever l'action (« n'a pas abouti »).
    expect(vmCourant.actionLog.join(" ")).not.toMatch(/n'a pas abouti/);
    expect(Array.isArray(vmCourant.bbPath)).toBe(true);
  });
});

describe("Un invité ne prend que ce qui est libre", () => {
  it("partie lancée, le Titan joué chez l'hôte ne se prend pas", async () => {
    const s = await partieCoteHote({});
    act(() => { s.emettre("intention", intention("demanderSiege", [1])); });
    expect(vmCourant.distantSieges[1]).toBeUndefined();
    expect(vmCourant.actionLog.join(" ")).toMatch(/table de l'hôte/);
  });

  it("la table des sièges de l'hôte prime sur la copie du relais", async () => {
    const s = await partieCoteHote({ 2: "autre" });
    // Le relais croit encore qu'Eddy tient le Titan 2 : l'hôte, lui, sait que non.
    act(() => { s.emettre("intention", { ...intention("validatePhase", [2]), titanId: 2 }); });
    expect(vmCourant.actionLog.join(" ")).toMatch(/pas à toi de jouer/);
  });
});

describe("Je Ne Partage Pas se joue chez l'hôte", () => {
  it("le ramassage d'un invité part en intention au lieu de s'exécuter chez lui", async () => {
    const s = await partieCoteInvite(2);
    act(() => { vmCourant.jnpPickCell("C4"); });
    expect(s.intentions.map((i) => i.fn)).toContain("jnpPickCell");
  });
});

describe("La liaison dit ce qui se passe", () => {
  it("une présence identique ne remplace pas la table des sièges", async () => {
    const s = await partieCoteHote({ 2: "eddy" });
    const avant = vmCourant.distantSieges;
    act(() => { s.emettre("presence", { joueurs: [], sieges: { 2: "eddy" } }); });
    expect(vmCourant.distantSieges).toBe(avant);
  });

  it("un coup d'invité qui n'est pas parti le dit", async () => {
    const s = await partieCoteInvite(2);
    s.envoyerIntention = () => Promise.reject(new Error("Trop de requêtes."));
    await act(async () => { vmCourant.handleUndo(); await Promise.resolve(); });
    expect(vmCourant.distantAvis).toMatch(/pas parti/);
  });

  it("un contrôleur démonté quitte sa table au lieu de la hanter", async () => {
    const s = await partieCoteInvite(2);
    cleanup();
    expect(s.quitter).toHaveBeenCalled();
  });
});
