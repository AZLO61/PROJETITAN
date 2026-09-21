import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TutorielPage from "../../src/ui/rules/TutorielPage.jsx";
import { TON_DE_PHASE } from "../../src/ui/theme.js";
import { CARD_ICON } from "../../src/ui/icons.jsx";

/* ============================================================
   PROJET TITAN — La prise en main parle-t-elle la langue du jeu ?
   ============================================================
   Nikola, 2026-09-19 : « dans la prise en main certaines icônes ne
   correspondent pas aux vraies icônes ».

   Le tutoriel s'impose déjà cette règle, en toutes lettres dans son propre
   code : « le signe est celui du jeu, jamais un dessin inventé pour la
   circonstance — sans quoi on apprendrait un vocabulaire à jeter ». Elle
   était écrite, et violée à quatre endroits : l'icône de la carte Tout
   Casser servait à illustrer l'idée générale de casser, et les trois phases
   portaient des icônes absentes de la partie ET les couleurs les unes des
   autres.

   Une règle en commentaire ne tient pas. Celle-ci devient donc mécanique :
   ce fichier échoue si la prise en main réinvente un signe que la partie
   n'emploie pas. C'est le seul garde-fou qui survive à la prochaine
   retouche — le commentaire, lui, était déjà là.
============================================================ */

describe("La prise en main n'invente pas de vocabulaire", () => {
  it("les trois phases sont celles du bandeau de partie, mot et couleur", () => {
    /* Il n'y a plus de seconde copie à comparer : les deux écrans lisent
       `TON_DE_PHASE`. Ce test vérifie que le tutoriel L'UTILISE VRAIMENT —
       une future retouche qui recopierait les valeurs à la main le ferait
       tomber, et c'est exactement le retour en arrière qu'on veut attraper. */
    render(<TutorielPage onClose={() => {}} />);
    // Écran 2 sur 7 : « Une Manche ».
    fireEvent.click(screen.getByRole("button", { name: "Une Manche" }));

    for (const cle of ["programmation", "action", "repos"]) {
      const { mot, couleur } = TON_DE_PHASE[cle];
      const libelle = screen.getByText(mot);
      expect(libelle).toBeTruthy();
      expect(libelle.style.color).toBe(couleur);
    }
  });

  it("les trois couleurs de phase restent distinctes", () => {
    // Le bug d'origine était un DÉCALAGE d'un cran : chaque phase portait la
    // couleur de sa voisine. Trois valeurs distinctes ne suffisent pas à
    // l'attraper, mais une collision, elle, rendrait le bandeau illisible.
    const tons = ["programmation", "action", "repos", "evenement"]
      .map((c) => TON_DE_PHASE[c].couleur);
    expect(new Set(tons).size).toBe(tons.length);
  });

  it("`smash` reste réservé à la carte Tout Casser", () => {
    /* La règle qui a été enfreinte : `smash` EST l'icône d'une carte. Tant
       que `CARD_ICON` le dit, aucun écran ne doit s'en servir pour autre
       chose — sinon le joueur apprend un signe pour une idée générale, puis
       le retrouve sur une carte précise. */
    expect(CARD_ICON.tout_casser).toBe("smash");
  });
});
