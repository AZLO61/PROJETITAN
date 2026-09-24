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

/* ── UN COMPOSANT CITÉ EN JSX EST UN COMPOSANT UTILISÉ (2026-09-24) ──
   Sans plugin React, `no-unused-vars` ne voit pas `<BoardPanel />` et croit
   l'import mort : la règle était donc coupée sur tout le JSX, et le code mort
   s'y accumulait sans bruit — l'audit du 24/09 y a trouvé ~90 imports, props
   et états jamais lus. Ces quelques lignes font ce que fait le plugin
   (`jsx-uses-vars`), sans dépendance de plus : elles marquent comme utilisé
   le nom de chaque élément JSX ouvert. */
const titan = {
  rules: {
    "jsx-uses-vars": {
      create(context) {
        return {
          JSXOpeningElement(node) {
            let nom = node.name;
            while (nom.type === "JSXMemberExpression") nom = nom.object;
            if (nom.type === "JSXIdentifier") context.sourceCode.markVariableAsUsed(nom.name, node);
          },
        };
      },
    },
  },
};

export default [
  {
    /* `dist-*` ajouté le 2026-09-07 : une seconde sortie de build (`dist-sm`)
       traînait à la racine et faisait analyser des bundles minifiés — 427
       erreurs `react-hooks/rules-of-hooks` sur du code généré, qui noyaient
       les deux seuls vrais avertissements du projet et rendaient
       `npm run lint` inutilisable. Le motif couvre les variantes futures
       plutôt que de les rattraper une par une. */
    ignores: ["dist/**", "dist-*/**", "public/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.jsx", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, titan },
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
      // ou un paramètre oublié. En ERREUR depuis le 2026-09-24 (Nikola : « ok
      // pour empêcher le code mort ») : un import, une prop, un état ou un
      // paramètre final jamais lus font échouer `npm run check`, donc la CI.
      // Un nom préfixé `_` reste permis quand l'inutilisation est voulue.
      "titan/jsx-uses-vars": "error",
      "no-unused-vars": ["error", {
        args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true,
      }],
    },
  },
  /* ── DEUX MONDES, DEUX JEUX DE GLOBALES (2026-09-16, accord de Nikola) ──
     Les globales du navigateur et celles de Node étaient ouvertes PARTOUT.
     `no-undef` ne voyait donc rien passer d'un monde à l'autre : un `process`
     glissé dans le jeu, ou un `window` dans le relais, n'est défini qu'à
     l'exécution — la même classe de plantage que `manchesMax` ci-dessus.

     Chaque dossier reçoit le monde où il tourne. Le domaine est aussi chargé
     par les scripts Node : il reste sous `src/`, donc au régime navigateur,
     et c'est voulu — il ne doit dépendre ni de l'un ni de l'autre, et n'en
     utilise aujourd'hui aucune globale propre. Les tests tournent sous
     jsdom, dans Node : ils gardent les deux. */
  { files: ["src/**"], languageOptions: { globals: globals.browser } },
  { files: ["server/**", "scripts/**", "*.config.js"], languageOptions: { globals: globals.node } },
  { files: ["tests/**"], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
];
