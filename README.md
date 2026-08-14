# Titan Game

Repository V6 du jeu Titan, refactorisé à partir du fichier source fourni.

## Objectif

Le projet sépare le moteur de règles, l'orchestration applicative, l'IA et l'interface React/Three.js. Le refactoring vise à conserver le comportement du jeu tout en rendant le repository lisible et exploitable par des développeurs et des agents IA.

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

## Validation

```bash
npm run check
npm run build
```

`check` exécute l'audit d'architecture, ESLint et les tests.

## Architecture

```text
UI (React / Three.js)
        ↓
Application
        ↓
Domain / règles du jeu
        ↑
AI contracts
```

- `src/domain/` : règles canoniques du jeu.
- `src/application/` : état React, séquencement et interactions.
- `src/ai/` : état compact et commandes IA.
- `src/ui/` : rendu et interactions visuelles.
- `schemas/` : contrats machine-readable.
- `docs/ai/` : point d'entrée pour les agents IA.

## Assets

Les sprites Titan sont des fichiers dans `public/assets/titans/`, pas des chaînes base64 dans le JavaScript. Ils sont donc séparés du code, cachables par le navigateur et plus faciles à comprendre pour une IA.

## Règle de sécurité du refactoring

Une optimisation de structure ne doit pas changer une règle de gameplay. Toute modification de règle doit être explicitement demandée et accompagnée d'un test de non-régression.

## GitHub

Le dépôt peut être envoyé directement à la racine d'un repository GitHub. Ne pas déposer le ZIP comme un fichier unique : extraire son contenu pour que `package.json`, `src/`, `public/`, `.github/` et `docs/` soient à la racine du repository.

Voir `AI_CONTEXT.md` pour le parcours de lecture recommandé par une IA.
