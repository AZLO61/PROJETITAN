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
       est exactement la façon de rater un vrai rouge. */
    testTimeout: 30000,
  },
});
