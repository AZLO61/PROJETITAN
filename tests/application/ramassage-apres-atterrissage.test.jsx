/* ============================================================
   PROJET TITAN — Ramasser reste possible après un atterrissage sur débris
   ============================================================
   Remonté plusieurs fois par Nikola : « j'ai sauté sur un débris, je l'ai
   ramassé automatiquement, mais je n'ai pas pu ramasser celui d'à côté avec
   mon passif — c'est passé directement au Titan suivant. »

   Le ramassage automatique de Tête en Avant / Boing Boing est le BUTIN DE LA
   CARTE. Le passif Récupération est une action distincte, qui vient APRÈS la
   carte et n'a rien à voir. Encaisser le premier ne doit jamais consommer le
   second.

   Ce test reconstitue la situation exacte : un débris sur la case
   d'atterrissage, un autre juste à côté.
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

/* Titan humain en F4, couloir libre vers l'est : F5 porte le débris sur
   lequel il va atterrir, F6 celui qu'il doit encore pouvoir ramasser. La
   ligne F n'accueille aucun bâtiment (seules A/C/E/G/I en portent), la
   trajectoire est donc garantie dégagée. */
async function partiePreteAAtterrirSurUnDebris() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  const id = vmCourant.titanState.ordreJeu[0];
  act(() => {
    vmCourant.setPhase("action");
    vmCourant.setActivePlayerId(id);
    vmCourant.setSelectedTitanId(id);
  });
  act(() => {
    const joueurs = vmCourant.titanState.players;
    joueurs.find((p) => p.id === id).cell = "F4";
    joueurs.find((p) => p.id === id).programmed = ["tete_en_avant", "tout_casser", "graouhhh"];
    // Les autres Titans sont écartés de la trajectoire : ce test porte sur le
    // ramassage, pas sur une percussion.
    joueurs.filter((p) => p.id !== id).forEach((p, i) => { p.cell = `A${i + 1}`; });
    vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    vmCourant.setLooseBlocks({ F5: ["rouge"], F6: ["bleu"] });
  });
  // `teaTargets` n'est calculée qu'en mode Tête en Avant, comme à l'écran.
  act(() => { vmCourant.toggleTeaMode(); });
  return id;
}

/* Fin du 3e round : tout le monde a joué ses 3 cartes sauf le Titan visé, qui
   pose la dernière de la Phase Action. Le compteur de rounds ET les mains
   doivent dire la même chose — la transition de phase se fie aux cartes
   encore programmées, pas au compteur. */
function tousLesAutresOntJoueLeurs3Cartes(id) {
  act(() => {
    const compte = {};
    vmCourant.titanState.ordreJeu.forEach((autre) => { compte[autre] = 3; });
    compte[id] = 2;
    vmCourant.cardsPlayedCountRef.current = compte;
    vmCourant.titanState.players.forEach((p) => {
      if (p.id !== id) { p.playedThisManche = [...p.programmed]; p.programmed = []; }
    });
    // Le Titan visé n'a plus que la carte qu'il s'apprête à jouer : c'est sa
    // 3e et dernière, celle qui fermait la phase sous ses pieds.
    const moi = vmCourant.titanState.players.find((p) => p.id === id);
    moi.playedThisManche = ["tout_casser", "graouhhh"];
    moi.programmed = ["tete_en_avant"];
    vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
  });
}

describe("Atterrir sur un débris ne consomme pas le passif Récupération", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("laisse le Ramassage ouvert sur le débris d'à côté", async () => {
    const id = await partiePreteAAtterrirSurUnDebris();

    act(() => { vmCourant.jouerTeteEnAvant("F5"); });

    const t = vmCourant.titanState.players.find((p) => p.id === id);
    // Le butin de la carte est bien encaissé, et le Titan a pris la place.
    expect(t.repaire).toContain("rouge");
    expect(t.cell).toBe("F5");

    // Le tour attend le joueur, il n'est pas passé au Titan suivant.
    expect(vmCourant.waitingNextTitan).toBe(true);
    expect(vmCourant.activePlayerId).toBe(id);

    // Et le passif Récupération est intact, avec F6 à portée.
    expect(vmCourant.passifUsed[id]?.recup).toBeFalsy();
    expect(vmCourant.canUseRecupPassif(id)).toBe(true);
    expect([...vmCourant.recupPool]).toContain("F6");
  });

  /* LE CAS RÉELLEMENT RENCONTRÉ À LA TABLE.
     Le Titan qui joue la DERNIÈRE carte du 3e round fermait la Phase Action
     dans la foulée : `activePlayerId` passait à null et la Programmation de
     la Manche suivante s'ouvrait sans que ce Titan — et lui seul — ait eu
     son Ramassage. Comme le tour du round 3 démarre sur le Détonateur, la
     victime change à chaque Manche, ce qui donnait un bug « aléatoire ». */
  it("laisse le Ramassage au dernier Titan du dernier round", async () => {
    const id = await partiePreteAAtterrirSurUnDebris();
    tousLesAutresOntJoueLeurs3Cartes(id);

    act(() => { vmCourant.jouerTeteEnAvant("F5"); });

    // Le tour de ce Titan n'est pas fini : il lui reste son passif.
    expect(vmCourant.activePlayerId).toBe(id);
    expect(vmCourant.waitingNextTitan).toBe(true);
    expect(vmCourant.canUseRecupPassif(id)).toBe(true);
    expect([...vmCourant.recupPool]).toContain("F6");
  });

  it("ferme quand même la Phase Action une fois le dernier tour terminé", async () => {
    const id = await partiePreteAAtterrirSurUnDebris();
    tousLesAutresOntJoueLeurs3Cartes(id);
    act(() => { vmCourant.jouerTeteEnAvant("F5"); });
    act(() => { vmCourant.jouerRecuperation("F6"); });
    expect(vmCourant.titanState.players.find((p) => p.id === id).repaire).toContain("bleu");

    // Tant que le joueur n'a pas rendu la main, son tour tient bon.
    expect(vmCourant.activePlayerId).toBe(id);
    expect(vmCourant.waitingNextTitan).toBe(true);

    act(() => { vmCourant.passerAuTitanSuivant(); });

    // Et le tour se referme bel et bien : le jeu ne reste pas coincé sur lui.
    expect(vmCourant.waitingNextTitan).toBe(false);
    expect(vmCourant.activePlayerId).not.toBe(id);
  });
});
