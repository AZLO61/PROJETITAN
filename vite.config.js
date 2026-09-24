import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* ── POLITIQUE DE SÉCURITÉ DU CONTENU (2026-09-16) ──
   Posée en <meta> : GitHub Pages ne laisse pas choisir les en-têtes. Au build
   SEULEMENT — le serveur de développement injecte un script en ligne (React
   Refresh) que `script-src 'self'` bloquerait.
   · script-src 'self' : aucun script en ligne ni étranger. C'est le cœur :
     une injection dans le journal ou un pseudo ne peut plus rien exécuter.
   · style-src 'unsafe-inline' : React pose des <style> (animations) ; plus
     la feuille de Google Fonts, et les polices elles-mêmes en font-src.
   · connect-src https: http: : l'adresse du relais est saisie par le joueur
     (tunnel tiré au sort, localhost, réseau local) — on ne peut pas la lister. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https: http:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "titan-csp",
      apply: "build",
      transformIndexHtml: () => [
        { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
      ],
    },
  ],
  base: "/PROJETITAN/",
  /* React à part (audit perf du 2026-09-23) : le chunk principal passait le
     seuil d'avertissement de 500 kB, et React, qu'aucun commit de jeu ne
     touche, reste ainsi en cache d'un déploiement à l'autre. Three.js n'est
     pas visé : il doit rester dans le chunk différé du plateau 3D. */
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor";
        },
      },
    },
  },
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
