/* ============================================================
   PROJET TITAN — Le tour n'avance pas tant qu'une résolution est ouverte
   ============================================================
   Points 1.2, 1.5 et 1.8 de la liste de Nikola du 2026-08-19. Trois
   symptômes, une seule cause :

   · « le jeu passe directement au tour suivant après un déplacement de
     Titan suivi d'une action DIL » ;
   · « saut sur Amas : le ramassage est verrouillé et le tour prend fin
     immédiatement » ;
   · le désengagement qui empêche de réengager le déplacement passif.

   `markCardPlayed` appelait `advanceActionRound` dès que la carte quittait
   la main, sans attendre que ce qu'elle avait déclenché soit résolu. Le tour
   basculait donc pendant que le joueur avait encore un DIL devant lui, et
   son passif Récupération passait à la trappe. Le garde-fou existait déjà
   pour l'IA (`finishAiTurn`), pas pour le joueur humain.

   Ces tests portent sur l'ORDRE, seul endroit où le défaut se voyait :
   l'état final était le bon.
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

/* Deux Titans côte à côte, l'un avec de quoi subir un Dilemme. Tout Casser
   frappe le Périmètre entier, donc il touche forcément le voisin. */
async function partieAvecUneCibleAdjacente() {
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

  const [t1, t2] = vmCourant.titanState.players;
  act(() => {
    t1.cell = "E5";
    t1.programmed = ["tout_casser"];
    t1.hand = [];
    t2.cell = "E6";
    // Deux couleurs distinctes : le Dilemme est possible.
    t2.repaire = ["bleu", "rose"];
    // Les autres Titans sont écartés : leur position tirée au hasard
    // pourrait ajouter des décisions et brouiller ce que ce test mesure.
    vmCourant.titanState.players.slice(2).forEach((t, i) => { t.cell = i === 0 ? "A1" : "A9"; });
    vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    vmCourant.setPhase("action");
    vmCourant.setSelectedTitanId(t1.id);
    vmCourant.setActivePlayerId(t1.id);
  });
  return [t1, t2];
}

describe("Le tour attend la fin des résolutions", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("un DIL en attente empêche le tour de basculer", async () => {
    const [t1] = await partieAvecUneCibleAdjacente();

    act(() => { vmCourant.jouerToutCasser(); });

    // La carte est bien partie de la main.
    const apres = vmCourant.titanState.players.find((p) => p.id === t1.id);
    expect(apres.programmed).not.toContain("tout_casser");
    expect(apres.playedThisManche).toContain("tout_casser");

    if (vmCourant.currentDecision) {
      /* LE POINT DU TEST : tant que le Dilemme n'est pas tranché, la main
         reste au joueur. Avant le correctif, `waitingNextTitan` passait à
         true ici même et le tour était fini. */
      expect(vmCourant.waitingNextTitan).toBe(false);
      expect(vmCourant.activePlayerId).toBe(t1.id);

      act(() => { vmCourant.resolveDilDefenderPick("bleu"); });
    }

    // Le Dilemme tranché, le tour peut enfin avancer.
    expect(vmCourant.currentDecision).toBeNull();
  });

  it("le ramassage reste possible une fois la décision tranchée", async () => {
    const [t1] = await partieAvecUneCibleAdjacente();

    act(() => { vmCourant.jouerToutCasser(); });
    if (vmCourant.currentDecision) {
      act(() => { vmCourant.resolveDilDefenderPick("bleu"); });
    }

    /* C'est la phrase exacte de Nikola : « je n'ai pas pu ramasser le bloc
       tombé au sol ». Le passif Récupération s'ouvre après avoir joué une
       carte, il doit donc rester disponible une fois la carte résolue. */
    expect(vmCourant.canUseRecupPassif(t1.id)).toBe(true);
    expect(vmCourant.passifUsed[t1.id]?.recup).toBeFalsy();
  });

  it("aucune résolution ouverte : le tour avance normalement", async () => {
    /* Contre-épreuve. Le report ne doit pas devenir un blocage : sans rien à
       trancher, la main passe comme avant. */
    const user = userEvent.setup();
    render(<Harnais />);
    await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    const t1 = vmCourant.titanState.players[0];
    act(() => {
      t1.cell = "E5";
      t1.programmed = ["je_ne_partage_pas"];
      // Personne autour, aucun débris : la carte ne déclenche rien.
      vmCourant.titanState.players.slice(1).forEach((t, i) => { t.cell = ["A1", "A9", "I1"][i]; });
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
      vmCourant.setPhase("action");
      vmCourant.setSelectedTitanId(t1.id);
      vmCourant.setActivePlayerId(t1.id);
    });

    act(() => { vmCourant.discardCurrentCard(t1.id, "je_ne_partage_pas"); });

    expect(vmCourant.currentDecision).toBeNull();
    expect(vmCourant.currentRepli).toBeNull();
    expect(vmCourant.ecroulement).toBeNull();
    // Une défausse ne déclenche aucune résolution : le tour bascule.
    expect(vmCourant.waitingNextTitan).toBe(true);
  });
});
