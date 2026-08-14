import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/PROJETITAN/",
  test: {
    // jsdom est nécessaire aux tests qui montent réellement les composants
    // React. Réglage de test uniquement : aucun effet sur le rendu du jeu.
    environment: "jsdom",
  },
});
