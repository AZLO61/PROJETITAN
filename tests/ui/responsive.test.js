import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ============================================================
   LA CSS RESPONSIVE NE DOIT PAS DÉRIVER DE LA GRILLE RÉELLE
   ============================================================
   Bug remonté par Nikola le 2026-08-17 : « le rendu n'est pas bon en mode
   développeur navigateur sur mobile et tablette ».

   Cause : `index.css` redéfinissait `.titan-grid` sous 560px avec DIX
   colonnes (1 label + 9 cases), la structure d'avant l'ajout des gouttières
   « hors du ring ». Le composant, lui, en rend DOUZE (gouttière, label,
   9 cases, gouttière). Sous le point de rupture, deux pistes manquaient :
   les colonnes en trop tombaient dans des pistes implicites et tout le
   plateau se décalait.

   C'est le même piège que « une règle vit à quatre endroits » : la structure
   de la grille vit maintenant à DEUX endroits, le JSX et les media queries.
   Ce test les compare, pour qu'ajouter une colonne au plateau sans toucher
   à la CSS échoue tout de suite plutôt qu'au prochain test sur téléphone.
============================================================ */

const lire = (p) => readFileSync(resolve(process.cwd(), p), "utf-8");

/** Nombre de pistes décrites par une valeur de grid-template-*.
 *  « 24px 18px repeat(9, minmax(30px, 1fr)) 24px » → 3 + 9 = 12. */
function compterPistes(valeur) {
  let total = 0;
  // Les repeat(n, …) d'abord : on les compte puis on les retire.
  const reste = valeur.replace(/repeat\(\s*(\d+)\s*,([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (_m, n) => {
    total += Number(n);
    return " ";
  });
  // Ce qui reste : des pistes simples séparées par des espaces. Les
  // fonctions résiduelles (minmax(...), min(...)) comptent pour une piste.
  const simples = reste
    .replace(/\b(?:minmax|min|max|clamp|fit-content)\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "X")
    .trim()
    .split(/\s+/)
    .filter((x) => x && x !== "!important");
  return total + simples.length;
}

function pistesDuComposant(propriete) {
  const src = lire("src/ui/panels/RoundPanels.jsx");
  /* Guillemets OU accent grave. Depuis que les gouttières d'attente ne
     s'ouvrent que lorsqu'un Titan y patiente, leur largeur est calculée et la
     valeur est écrite en gabarit.

     On prend donc la LIGNE entière, on remplace chaque interpolation par une
     piste neutre, puis on retire les délimiteurs. Découper sur le guillemet
     fermant ne marcherait pas : `${piste("gauche")}` en contient un.
     Ce que ce test vérifie est le NOMBRE de pistes du plateau, jamais la
     valeur de chacune. */
  const m = src.match(new RegExp(`${propriete}:\\s*([^\\n]+)`));
  expect(m, `${propriete} introuvable dans RoundPanels.jsx`).toBeTruthy();
  const valeur = m[1]
    .replace(/\$\{[^}]*\}/g, "X")
    .replace(/^["`]/, "")
    .replace(/["`],?\s*$/, "");
  return compterPistes(valeur);
}

/** Toutes les redéfinitions de .titan-grid dans les media queries. */
function pistesDesMediaQueries(propriete) {
  const css = lire("src/index.css");
  const blocs = [...css.matchAll(/\.titan-grid\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const kebab = propriete.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return blocs
    .map((bloc) => {
      const m = bloc.match(new RegExp(`${kebab}\\s*:([^;]+);`));
      return m ? compterPistes(m[1]) : null;
    })
    .filter((n) => n !== null);
}

describe("responsive — la CSS suit la structure réelle du plateau", () => {
  it("le composant décrit bien 12 colonnes (gouttière, label, 9 cases, gouttière)", () => {
    expect(pistesDuComposant("gridTemplateColumns")).toBe(12);
  });

  it("le composant décrit bien 12 rangées (numéros, gouttière, 9 lignes, gouttière)", () => {
    expect(pistesDuComposant("gridTemplateRows")).toBe(12);
  });

  it("chaque media query redéfinit le MÊME nombre de colonnes", () => {
    const attendu = pistesDuComposant("gridTemplateColumns");
    const trouvees = pistesDesMediaQueries("gridTemplateColumns");
    expect(trouvees.length, "aucune règle .titan-grid trouvée dans index.css").toBeGreaterThan(0);
    trouvees.forEach((n) => expect(n).toBe(attendu));
  });

  it("chaque media query redéfinit le MÊME nombre de rangées", () => {
    const attendu = pistesDuComposant("gridTemplateRows");
    const trouvees = pistesDesMediaQueries("gridTemplateRows");
    expect(trouvees.length).toBeGreaterThan(0);
    trouvees.forEach((n) => expect(n).toBe(attendu));
  });
});

describe("responsive — aucune piste ne peut déborder un écran étroit", () => {
  /* Une grille `repeat(auto-fit, minmax(260px, 1fr))` NE se réduit PAS sous
     260px : quand le conteneur est plus étroit, la piste garde sa largeur
     minimale et déborde. C'est la cause classique du défilement horizontal
     fantôme sur téléphone, et `overflow-x: hidden` sur le body ne fait que
     masquer le symptôme en coupant le contenu.

     La parade est `minmax(min(260px, 100%), 1fr)` : le plancher s'efface dès
     que le conteneur est plus petit. Ce test interdit la forme nue. */
  const fichiers = [
    "src/ui/titans/TitanResourceBand.jsx",
    "src/ui/rules/RulesPage.jsx",
    "src/ui/panels/RoundPanels.jsx",
    "src/ui/panels/BoardPanel.jsx",
    "src/ui/panels/DecisionPanels.jsx",
    "src/ui/panels/HeaderPhase.jsx",
  ];

  it("toute grille auto-fit/auto-fill borne son minimum par min(…, 100%)", () => {
    const fautifs = [];
    fichiers.forEach((f) => {
      const src = lire(f);
      [...src.matchAll(/repeat\(\s*auto-(?:fit|fill)\s*,\s*minmax\(\s*([^,]+),/g)].forEach((m) => {
        const plancher = m[1].trim();
        if (!plancher.startsWith("min(")) fautifs.push(`${f} → minmax(${plancher}, …)`);
      });
    });
    expect(fautifs).toEqual([]);
  });
});
