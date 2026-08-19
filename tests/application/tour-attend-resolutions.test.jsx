/* ============================================================
   PROJET TITAN — Une décision en attente ne vole pas le tour
   ============================================================
   Point 1.2 de la liste de Nikola du 2026-08-19 : « le jeu passe directement
   au tour suivant après un déplacement de Titan suivi d'une action DIL.
   Conserver la main au joueur pour lui permettre d'effectuer un ramassage de
   débris valide. »

   ⚠️ CE QUE CE TEST NE DOIT PAS MESURER. Une première version, écrite le
   2026-08-19, vérifiait que `waitingNextTitan` restait à `false` pendant le
   Dilemme, et le code avait été modifié pour ça : l'avancement de round était
   différé dans un effet React. C'était une erreur de cible, et elle a coûté
   cher — `finishAiTurn` lit `aiNextPlayerRef` DÈS LE RETOUR de
   `markCardPlayed`, si bien que différer l'avancement figeait la partie à la
   première action (cf. `partie-ia-avance.test.jsx`).

   `waitingNextTitan` n'est pas « le tour est fini », c'est « la carte du round
   est jouée ». Ce qui décide de ce que le joueur peut encore faire, c'est
   `decisionBloquante`, que BoardPanel consulte pour n'afficher NI le ramassage
   NI « Titan suivant » tant qu'une résolution est ouverte.

   Ce test porte donc sur le besoin réel : le joueur garde sa fenêtre de
   ramassage, et il ne peut pas passer la main avant d'avoir tranché.
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

/* Deux Titans côte à côte, la cible ayant de quoi subir un Dilemme. Tout
   Casser frappe le Périmètre entier, il touche donc forcément le voisin. */
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
    t2.repaire = ["bleu", "rose"]; // deux couleurs : le Dilemme est possible
    // Les autres Titans sont écartés : leur position tirée au hasard
    // ajouterait des décisions et brouillerait ce que ce test mesure.
    vmCourant.titanState.players.slice(2).forEach((t, i) => { t.cell = i === 0 ? "A1" : "A9"; });
    vmCourant.setTitanState((p) => ({ ...p, players: [...p.players] }));
    vmCourant.setPhase("action");
    vmCourant.setSelectedTitanId(t1.id);
    vmCourant.setActivePlayerId(t1.id);
  });
  return [t1, t2];
}

describe("Une décision en attente ne vole pas le tour", () => {
  afterEach(() => { cleanup(); vmCourant = null; });

  it("tant que le Dilemme n'est pas tranché, l'écran est verrouillé dessus", async () => {
    const [t1] = await partieAvecUneCibleAdjacente();
    act(() => { vmCourant.jouerToutCasser(); });

    // La carte est bien partie de la main.
    const apres = vmCourant.titanState.players.find((p) => p.id === t1.id);
    expect(apres.playedThisManche).toContain("tout_casser");

    if (vmCourant.currentDecision) {
      /* LE POINT DU TEST. `decisionBloquante` est ce que BoardPanel consulte
         pour masquer le ramassage ET « Titan suivant ». Tant qu'il est posé,
         le joueur ne peut pas passer la main par inadvertance. */
      expect(vmCourant.decisionBloquante).toBeTruthy();
      // Et le Titan actif n'a pas changé : la main est toujours à lui.
      expect(vmCourant.activePlayerId).toBe(t1.id);
    }
  });

  it("une fois TOUTES les résolutions tranchées, le ramassage reste ouvert", async () => {
    const [t1] = await partieAvecUneCibleAdjacente();
    act(() => { vmCourant.jouerToutCasser(); });

    /* Une seule carte peut ouvrir PLUSIEURS résolutions à la suite : le
       Dilemme d'abord, puis les replis des blocs projetés qui n'avaient pas
       l'énergie d'aller au bout. Elles se présentent une par une, dans
       l'ordre décidé par `decisionBloquante` — c'est exactement ce que Nikola
       demandait le 18 août, « panneau par panneau ». On les vide toutes,
       comme le joueur le ferait. */
    let garde = 0;
    while (vmCourant.decisionBloquante && garde++ < 20) {
      if (vmCourant.currentDecision) {
        act(() => { vmCourant.resolveDilDefenderPick("bleu"); });
      } else if (vmCourant.currentRepli) {
        const cible = vmCourant.currentRepli.defaut || vmCourant.currentRepli.cases[0];
        act(() => { vmCourant.choisirRepli(cible); });
      } else if (vmCourant.ecroulement) {
        act(() => { vmCourant.ecroulementAbandonner(); });
      } else {
        break;
      }
    }
    expect(garde).toBeLessThan(20); // aucune résolution ne tourne en rond

    /* C'est la phrase exacte de Nikola : « je n'ai pas pu ramasser le bloc
       tombé au sol ». Le passif Récupération s'ouvre après avoir joué une
       carte, il doit donc rester disponible une fois tout résolu. */
    expect(vmCourant.decisionBloquante).toBeFalsy();
    expect(vmCourant.canUseRecupPassif(t1.id)).toBe(true);
    expect(vmCourant.passifUsed[t1.id]?.recup).toBeFalsy();
    // La main est toujours à lui : c'est à lui de cliquer « Titan suivant ».
    expect(vmCourant.activePlayerId).toBe(t1.id);
  });

  it("la carte jouée fait bien avancer le round, sans quoi la partie fige", async () => {
    /* Contre-épreuve indispensable. Empêcher le tour d'avancer pour protéger
       le ramassage a fige la partie entière le 2026-08-19 : `waitingNextTitan`
       DOIT passer à true dès que la carte est consommée. C'est l'affichage,
       et lui seul, qui décide de ce qu'on montre au joueur. */
    const [t1] = await partieAvecUneCibleAdjacente();
    act(() => { vmCourant.jouerToutCasser(); });
    if (vmCourant.currentDecision) {
      act(() => { vmCourant.resolveDilDefenderPick("bleu"); });
    }
    expect(vmCourant.waitingNextTitan).toBe(true);
    const apres = vmCourant.titanState.players.find((p) => p.id === t1.id);
    expect(apres.programmed).not.toContain("tout_casser");
  });
});
