/* ============================================================
   PROJET TITAN — CE QU'UN INVITÉ DOIT POUVOIR FAIRE
   ============================================================
   Retour de table de Nikola, 2026-08-30, dix symptômes séparés qui se
   ramènent à trois causes :

     · l'interface de l'invité était remise à plat À CHAQUE instantané reçu,
       donc après le moindre geste de n'importe qui à la table — d'où « mon
       déplacement passif ne marche pas », « charger un Titan ne fait rien »,
       « Titan suivant ne passe pas le tour » ;
     · la sélection de cartes voyageait carte par carte jusqu'à l'hôte — d'où
       « ça ne garde pas la programmation » ET « seul l'hôte voit l'encart » ;
     · « Annuler » était purement et simplement retiré à l'invité.

   Ces tests passent par le vrai contrôleur avec une session simulée : c'est le
   seul endroit où le branchement réseau existe. Le relais n'est pas nécessaire
   — ce qu'on vérifie est ce que le contrôleur FAIT d'un message reçu et ce
   qu'il ENVOIE en retour, jamais la façon dont ça transite.
============================================================ */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useBoardGeneratorController } from "../../src/application/useBoardGeneratorController.jsx";
import { plateauPublic, mainPrivee } from "../../src/net/session.js";

let vmCourant = null;
function Harnais() {
  const vm = useBoardGeneratorController();
  if (isValidElement(vm)) return vm;
  vmCourant = vm;
  return <div data-testid="partie-en-cours">Manche {vm.mancheNumber}</div>;
}

/* Une session de test : elle n'ouvre aucune connexion, elle retient ce qu'on
   lui donne. Les abonnements sont conservés pour qu'un test puisse jouer le
   rôle du relais et pousser un instantané. */
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
    envoyerPrive() { return Promise.resolve({}); },
    publierSieges(s) { this.siegesPublies.push(s); return Promise.resolve({}); },
    envoyerChat() { return Promise.resolve({}); },
    resynchroniser: vi.fn(),
    quitter() { return Promise.resolve(); },
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

/* Branche une session d'invité sur une partie déjà lancée, et pose l'invité
   sur le Titan demandé. L'instantané de départ est celui de la partie
   elle-même : on se met dans l'état réel d'un invité calé sur son hôte. */
async function partieCoteInvite(titanId = 2) {
  await lancerUnePartie();
  const complet = vmCourant.instantaneCourant();
  const s = sessionSimulee("invite", { ref: "moi", sieges: { [titanId]: "moi" } });
  s.etatInitial = plateauPublic(complet);
  act(() => { vmCourant.brancherSession(s); });
  act(() => { s.emettre("prive", mainPrivee(complet, titanId)); });
  return s;
}

describe("Un invité garde ses brouillons quand la table joue", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("ne referme pas le mode Déplacement à chaque instantané reçu", async () => {
    const s = await partieCoteInvite(2);

    // Il ouvre « Me déplacer ». Rien n'est parti sur le réseau : c'est un
    // brouillon, pas un coup.
    act(() => { vmCourant.setMoveMode(true); });
    expect(vmCourant.moveMode).toBe(true);

    /* L'hôte rediffuse le plateau — quelqu'un d'autre vient de jouer, mais ni
       le tour, ni la Phase, ni la Manche n'ont changé. C'est le cas qui cassait
       tout : le mode se refermait, et le clic suivant sur une case tombait dans
       le vide sans que rien ne l'explique. */
    const suivant = vmCourant.instantaneCourant();
    act(() => { s.emettre("etat", plateauPublic(suivant)); });

    expect(vmCourant.moveMode).toBe(true);
  });

  it("referme bien l'interface quand le tour change vraiment", async () => {
    const s = await partieCoteInvite(2);
    act(() => { vmCourant.setMoveMode(true); });

    const suivant = plateauPublic(vmCourant.instantaneCourant());
    // Le tour passe à quelqu'un d'autre : là, les brouillons n'ont plus de
    // sens, et l'interface doit repartir propre.
    const autre = vmCourant.titanState.ordreJeu.find((id) => id !== suivant.activePlayerId);
    act(() => { s.emettre("etat", { ...suivant, activePlayerId: autre }); });

    expect(vmCourant.moveMode).toBe(false);
  });
});

describe("La programmation d'un invité se compose chez lui", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("garde la sélection à l'écran au lieu de l'envoyer carte par carte", async () => {
    const s = await partieCoteInvite(2);
    const main = vmCourant.titanState.players.find((t) => t.id === 2).hand;

    act(() => { vmCourant.toggleProgCard(0, main[0]); });
    act(() => { vmCourant.toggleProgCard(1, main[1]); });

    // Les deux cartes sont visibles CHEZ LUI : c'est l'encart que seul l'hôte
    // voyait jusque-là.
    expect(vmCourant.progSelection.map((c) => c.idx)).toEqual([0, 1]);
    // Et rien n'est parti : cocher une carte n'engage rien.
    expect(s.intentions).toHaveLength(0);
  });

  it("n'envoie qu'un seul message, au bout du compte à rebours, avec les trois cartes", async () => {
    const s = await partieCoteInvite(2);
    const moi = () => vmCourant.titanState.players.find((t) => t.id === 2);
    const main = [...moi().hand];
    const avant = [...moi().programmed];

    vi.useFakeTimers();
    try {
      act(() => { vmCourant.toggleProgCard(0, main[0]); });
      act(() => { vmCourant.toggleProgCard(1, main[1]); });
      act(() => { vmCourant.toggleProgCard(2, main[2]); });
      // Le compte à rebours de 3 s se déroule sans que rien ne parte avant.
      expect(s.intentions).toHaveLength(0);
      act(() => { vi.advanceTimersByTime(3500); });
    } finally {
      vi.useRealTimers();
    }

    expect(s.intentions).toHaveLength(1);
    expect(s.intentions[0].fn).toBe("confirmProgrammation");
    expect(s.intentions[0].contexte.progSelection.map((c) => c.cardId))
      .toEqual([main[0], main[1], main[2]]);
    /* Et surtout : la main de l'invité n'a PAS été programmée chez lui. Le
       moteur n'a qu'un exemplaire, il tourne chez l'hôte, et c'est l'instantané
       qui lui rendra ses cartes programmées. */
    expect(moi().programmed).toEqual(avant);
  });
});

describe("Un invité peut annuler et réclamer un siège", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("fait voyager « Annuler » au lieu de le désactiver", async () => {
    const s = await partieCoteInvite(2);
    act(() => { vmCourant.handleUndo(); });
    expect(s.intentions.map((i) => i.fn)).toContain("handleUndo");
  });

  it("annonce à l'interface le nombre de coups annulables chez l'hôte", async () => {
    const s = await partieCoteInvite(2);
    const snap = plateauPublic(vmCourant.instantaneCourant());
    act(() => { s.emettre("etat", { ...snap, profondeurUndo: 2 }); });
    expect(vmCourant.undoStack).toHaveLength(2);
  });

  it("demande un Titan libre au lieu d'écrire lui-même dans la table des sièges", async () => {
    const s = await partieCoteInvite(2);
    act(() => { vmCourant.demanderSiege(3); });
    const demande = s.intentions.find((i) => i.fn === "demanderSiege");
    expect(demande).toBeTruthy();
    expect(demande.args).toEqual([3]);
    // La table des sièges n'a pas bougé : c'est l'hôte qui tranche.
    expect(s.siegesPublies).toHaveLength(0);
  });
});

describe("L'hôte ne voit pas le jeu de ceux qui jouent ailleurs", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("masque la main d'un Titan confié à un invité, et garde la sienne", async () => {
    await lancerUnePartie();
    const s = sessionSimulee("hote", { ref: "hote", sieges: {} });
    act(() => { vmCourant.brancherSession(s); });
    act(() => { s.emettre("presence", { joueurs: [], sieges: { 2: "unInvite" } }); });

    expect(vmCourant.titanMasque(2)).toBe(true);
    expect(vmCourant.titanMasque(1)).toBe(false);
  });

  it("ne masque rien hors partie en ligne", async () => {
    await lancerUnePartie();
    expect(vmCourant.titanMasque(1)).toBe(false);
    expect(vmCourant.titanMasque(2)).toBe(false);
  });
});

describe("Un siège n'est jamais vide", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  /* Nikola, 2026-08-30 : « si un joueur quitte la partie, une IA reprend sa
     place » et « un joueur peut rejoindre la partie en cours de route, il prend
     juste un Titan qui était géré par IA ; s'il quitte, une IA reprend sa
     place ».

     Les deux moitiés décrivent une seule chose : un Titan est tenu par un
     humain ou par l'IA, et il passe de l'un à l'autre sans que la partie
     s'arrête. C'est ce qui permet de partir en cours de Manche sans bloquer les
     autres, et de revenir plus tard. */

  it("l'IA reprend le Titan de celui qui s'en va, avec un profil à la bonne force", async () => {
    await lancerUnePartie();
    const s = sessionSimulee("hote", { ref: "hote", sieges: {} });
    act(() => { vmCourant.brancherSession(s); });
    act(() => { s.emettre("presence", { joueurs: [], sieges: { 3: "eddy" } }); });
    expect(vmCourant.titanModes[3]).not.toBe("ia");

    // Le relais nomme le partant ET rend son siège dans le même message.
    act(() => { s.emettre("depart", { t: "depart", ref: "eddy", pseudo: "Eddy", siege: "invite", titanId: 3 }); });

    expect(vmCourant.titanModes[3]).toBe("ia");
    // Un profil est tiré : sans lui, l'IA retomberait sur un niveau par défaut
    // qui ignore la difficulté choisie pour la table.
    expect(vmCourant.titanProfiles[3]).toBeTruthy();
    expect(vmCourant.actionLog.join(" ")).toMatch(/Eddy.*quitté/);
  });

  it("ne touche à rien quand le partant n'avait pas de siège", async () => {
    await lancerUnePartie();
    const s = sessionSimulee("hote", { ref: "hote", sieges: {} });
    act(() => { vmCourant.brancherSession(s); });
    const avant = { ...vmCourant.titanModes };

    act(() => { s.emettre("depart", { t: "depart", ref: "x", pseudo: "Passant", siege: "invite", titanId: null }); });

    expect(vmCourant.titanModes).toEqual(avant);
    expect(vmCourant.actionLog.join(" ")).toMatch(/Passant a quitté la table/);
  });

  it("un arrivant reprend un Titan tenu par l'IA, et l'hôte publie le siège", async () => {
    await lancerUnePartie();
    act(() => { vmCourant.setTitanModes((p) => ({ ...p, 3: "ia" })); });
    const s = sessionSimulee("hote", { ref: "hote", sieges: {} });
    act(() => { vmCourant.brancherSession(s); });

    act(() => {
      s.emettre("intention", {
        t: "intention", de: "eddy", pseudo: "Eddy", titanId: null,
        fn: "demanderSiege", args: [3], contexte: {},
      });
    });

    expect(vmCourant.titanModes[3]).toBe("humain");
    expect(vmCourant.distantSieges[3]).toBe("eddy");
    expect(s.siegesPublies.at(-1)).toEqual({ 3: "eddy" });
    expect(vmCourant.actionLog.join(" ")).toMatch(/Eddy reprend le Titan 3 à l'IA/);
  });

  it("refuse un Titan déjà tenu par quelqu'un d'autre", async () => {
    await lancerUnePartie();
    const s = sessionSimulee("hote", { ref: "hote", sieges: {} });
    act(() => { vmCourant.brancherSession(s); });
    act(() => { s.emettre("presence", { joueurs: [], sieges: { 2: "premier" } }); });

    act(() => {
      s.emettre("intention", {
        t: "intention", de: "second", pseudo: "Second", titanId: null,
        fn: "demanderSiege", args: [2], contexte: {},
      });
    });

    expect(vmCourant.distantSieges[2]).toBe("premier");
    expect(vmCourant.actionLog.join(" ")).toMatch(/déjà pris/);
  });
});
