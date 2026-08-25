import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/PROJETITAN/",
  test: {
    // jsdom est nécessaire aux tests qui montent réellement les composants
    // React. Réglage de test uniquement : aucun effet sur le rendu du jeu.
    environment: "jsdom",
    /* Les tests de campagne du simulateur jouent des dizaines de parties
       complètes : ils tiennent 6 à 16 s selon la charge de la machine, très
       au-dessus des 5 s par défaut de Vitest. `npm run check` échouait donc
       par intermittence sur « Test timed out in 5000ms », sans qu'aucun code
       ne soit en cause — un rouge qu'on prenait l'habitude d'ignorer, ce qui
       est exactement la façon de rater un vrai rouge.

       PORTÉ DE 30 s À 120 s LE 2026-08-24, après le premier passage en CI.
       Le test « aucune campagne ne pose de débris sur un bâtiment debout »
       tient 29,6 s sur la machine de Nikola : 98 % du budget. Vert en local,
       il dépassait systématiquement sur un runner GitHub Actions, plus lent
       et à deux cœurs — le tout premier push a donc échoué au CI alors que
       rien n'était casse.

       Ces tests jouent des CENTAINES de parties completes : leur duree est
       legitime, c'est le budget qui etait trop juste. On donne donc une
       marge franche plutot qu'un seuil au ras des mesures, sans quoi la
       moindre machine plus lente rouvre le meme faux rouge. */
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
