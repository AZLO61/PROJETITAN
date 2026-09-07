/* ============================================================
   PROJET TITAN — La Phase Action ne se ferme pas sur des cartes non jouées
   ============================================================
   Nikola, 2026-09-07 : « les parties en simulation IA plantent à un moment ;
   sur 5 essais, une seule est allée au bout — il y a une situation récurrente
   qui doit bloquer ça. » Deux rapports de partie joints, et une reproduction
   au navigateur avec sa graine (227542583) : les trois se figent exactement au
   même endroit, sur cette ligne de journal —

     « ⚠️ Phase Action : T4, T1, T2, T3 a encore une carte programmée —
       la Programmation ne démarre pas, la main revient à T4. »

   … puis plus rien. Phase Action, aucune décision en attente, tour au bon
   Titan, et personne ne joue plus.

   DEUX DÉFAUTS SUPERPOSÉS, et il fallait les deux pour geler la partie.

   1. `advanceActionRound` fermait la Phase sur son COMPTEUR de rounds. Un
      compteur peut dériver — c'est déjà arrivé deux fois dans ce fichier — et
      quand il dérive, la Phase se ferme alors que douze cartes sont encore
      programmées.

   2. Le garde-fou qui rattrapait ça rendait la main « au Titan en retard »
      par `setActivePlayerId(enRetard[0])`. Or dans les trois cas observés, ce
      Titan est DÉJÀ le Titan actif. React ne notifie pas une valeur identique,
      l'effet d'auto-jeu de l'IA ne dépend que d'`activePlayerId`, il ne se
      relance jamais. Le rattrapage était un point d'arrêt.

   Ce test attaque le premier défaut à sa source : on force la dérive du
   compteur, on joue une carte, et on vérifie que la Phase tient bon.
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

async function partieEnPhaseAction() {
  vmCourant = null;
  const user = userEvent.setup();
  render(<Harnais />);
  await user.click(screen.getByRole("button", { name: /Lancer la partie/ }));
  act(() => vmCourant.terminerPlacement());
  act(() => {
    vmCourant.titanState.players.forEach((t) => {
      t.programmed = ["tout_casser", "graouhhh", "boing_boing"];
      t.playedThisManche = [];
      t.discardedHidden = [];
      t.horsPlateau = false;
    });
    vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    vmCourant.setPhase("action");
    vmCourant.setPhaseValidated({});
    vmCourant.setActivePlayerId(vmCourant.titanState.ordreJeu[0]);
  });
  return vmCourant.titanState.ordreJeu[0];
}

describe("La Phase Action ne se ferme pas tant qu'il reste une carte programmée", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("un compteur de rounds qui a dérivé ne referme pas la Phase", async () => {
    const premier = await partieEnPhaseAction();

    act(() => {
      /* La dérive, reproduite : le compteur croit que tout le monde a joué
         ses trois cartes, alors que personne n'en a joué une seule. C'est
         l'état exact des deux rapports de Nikola et de la reproduction avec
         sa graine. */
      const compte = {};
      vmCourant.titanState.ordreJeu.forEach((id) => { compte[id] = 3; });
      /* Le Titan actif à 2 : sa carte va le porter à 3, c'est-à-dire au même
         rang que les autres. C'est très exactement la condition qui faisait
         conclure « tout le monde a joué ses 3 rounds » et fermer la Phase. */
      compte[vmCourant.titanState.ordreJeu[0]] = 2;
      vmCourant.cardsPlayedCountRef.current = compte;
    });

    // Le Titan actif joue une carte : c'est cet appel qui, avant, concluait
    // « 3 rounds terminés » et fermait la Phase sous les cartes des autres.
    act(() => { vmCourant.markCardPlayed(premier, "tout_casser"); });

    // La Phase Action tient : elle n'est validée pour personne…
    const valides = vmCourant.titanState.ordreJeu.filter((id) => vmCourant.phaseValidated[id]);
    expect(valides).toEqual([]);
    // … le tour n'est rendu à personne…
    expect(vmCourant.activePlayerId).not.toBeNull();
    // … et le compteur a été recalé sur la vérité du plateau : une carte jouée
    // pour celui qui vient de jouer, zéro pour les autres.
    const compte = vmCourant.cardsPlayedCountRef.current;
    expect(compte[premier]).toBe(1);
    vmCourant.titanState.ordreJeu
      .filter((id) => id !== premier)
      .forEach((id) => { expect(compte[id]).toBe(0); });
  });

  it("elle se ferme normalement quand plus personne n'a de carte", async () => {
    /* Le pendant du test ci-dessus : le correctif ne doit pas empêcher la
       Phase de se terminer, sinon on remplace un blocage par un autre. */
    const premier = await partieEnPhaseAction();
    act(() => {
      const compte = {};
      vmCourant.titanState.ordreJeu.forEach((id) => { compte[id] = 3; });
      compte[vmCourant.titanState.ordreJeu[0]] = 2;
      vmCourant.cardsPlayedCountRef.current = compte;
      // Tout le monde a réellement tout joué, sauf la carte que le Titan actif
      // s'apprête à consommer.
      vmCourant.titanState.players.forEach((t) => {
        t.playedThisManche = ["graouhhh", "boing_boing"];
        t.programmed = t.id === premier ? ["tout_casser"] : [];
      });
      vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    });

    act(() => { vmCourant.markCardPlayed(premier, "tout_casser"); });

    /* Un humain garde la main jusqu'à « Titan suivant » — ruling du
       2026-08-19, qui lui laisse son Ramassage après sa dernière carte. Une IA
       referme tout de suite. On accepte les deux, ce qui compte ici est que la
       Phase FINISSE par se fermer : c'est l'autre moitié du correctif, celle
       qui garantit qu'on n'a pas remplacé un blocage par un autre. */
    if (vmCourant.phase === "action") {
      act(() => { vmCourant.passerAuTitanSuivant(); });
    }
    /* On regarde la PHASE et non `phaseValidated` : dès que tout le monde a
       validé, l'effet d'avancement enchaîne et remet les drapeaux à zéro pour
       la Phase suivante. Le drapeau est donc vrai pendant un rendu, la Phase,
       elle, reste observable. */
    expect(vmCourant.phase).not.toBe("action");
  });
});
