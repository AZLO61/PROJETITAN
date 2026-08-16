/* ============================================================
   PROJET TITAN — Configuration ESLint
   ============================================================
   POURQUOI CE FICHIER A DU CONTENU

   Ce fichier ne contenait qu'une liste d'exclusions, aucune règle.
   `npm run lint` parcourait donc tout le projet sans pouvoir, par
   construction, signaler quoi que ce soit — et `npm run check` renvoyait
   un feu vert qui ne valait rien.

   Ce n'est pas resté théorique : `manchesMax` était appelée dans le
   contrôleur sans avoir jamais été importée. Une variable libre, donc une
   ReferenceError à la fin de CHAQUE Manche, et le jeu inutilisable
   au-delà de la Manche 1. `no-undef` la trouve en deux secondes.

   Les règles retenues ci-dessous sont celles qui attrapent des bugs
   réels, pas des règles de style : le formatage n'est pas le sujet ici.
============================================================ */

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist/**", "public/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.jsx", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // La règle qui manquait. Toute la raison d'être de ce fichier.
      "no-undef": "error",

      // Les hooks React : le contrôleur a déjà connu plusieurs bugs de
      // closure périmée (un objet Titan muté hors de l'état réel). Cette
      // règle les signale. Laissée en `warn` : les `eslint-disable` posés
      // dans le contrôleur sont des choix délibérés et documentés, mais on
      // veut voir les nouveaux cas apparaître.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Une variable inutilisée signale souvent un renommage à moitié fait
      // ou un paramètre oublié. En `warn` : le JSX n'étant pas analysé
      // sans plugin React, quelques faux positifs subsistent sur les
      // composants.
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Les composants d'interface utilisent leurs imports dans du JSX, que
    // `no-unused-vars` ne sait pas voir sans le plugin React. La règle y
    // est donc coupée plutôt que de noyer les vrais signaux.
    files: ["src/ui/**/*.jsx", "src/**/*.jsx", "tests/**/*.jsx"],
    rules: { "no-unused-vars": "off" },
  },
];
