import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as regles from "../../src/domain/gameRules.js";

/* ============================================================
   PROJET TITAN — Chaque chiffre de règle du livret suit le moteur
   ============================================================
   Le livret et le moteur ont divergé dans les deux sens (Boing Boing
   projetait à l'énergie au lieu de la distance, une règle « Contigus »
   écrite et jamais codée). Les tests ciblés tenaient une règle à la fois.

   Ici, chaque chiffre de règle du livret porte une balise invisible
   `data-const="CHEMIN"` (ex. `STOCK_INITIAL.bleu`, `BAREME_ORANGE_PAIRES.0`).
   Deux sens vérifiés :
   1. chaque chiffre balisé vaut la constante exportée par le moteur ;
   2. chaque constante de CONSTANTES_DE_REGLE est balisée au moins une fois.
   Une constante de règle nouvelle s'ajoute à la liste ET se balise au livret.
============================================================ */

const CONSTANTES_DE_REGLE = [
  "STOCK_INITIAL", "BAREME", "BAREME_ORANGE_PAIRES", "BAREME_ADRENALINE",
  "PODIUM_POINTS", "CARD_FORCE", "PORTEE_TETE_EN_AVANT", "PORTEE_BOING_BOING",
  "SEUIL_4", "SEUIL_PENURIE", "MANCHES_PAR_NB_JOUEURS",
];

const MOTS = { aucun: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4 };

const livret = readFileSync(resolve(process.cwd(), "docs/livret/ProjetTitan_Livret.html"), "utf8");
// Un élément balisé ne contient que du texte : pas besoin d'un vrai DOM.
const balises = [...livret.matchAll(/<(\w+)[^>]*\sdata-const="([^"]+)"[^>]*>([^<]*)<\/\1>/g)]
  .map(([, , chemin, texte]) => [chemin, texte]);

const valeur = (chemin) => chemin.split(".").reduce((o, k) => o?.[k], regles);
const nombresLus = (texte) => {
  const chiffres = texte.match(/\d+/g);
  if (chiffres) return chiffres.map(Number);
  const mot = texte.trim().toLowerCase().split(/\s+/).find((m) => m in MOTS);
  return mot === undefined ? [] : [MOTS[mot]];
};

// Feuilles attendues : un nombre ou un tableau = le nom seul ; un objet = chaque clé.
const feuilles = CONSTANTES_DE_REGLE.flatMap((nom) => {
  const v = regles[nom];
  return v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).map((k) => `${nom}.${k}`) : [nom];
});
const cheminsBalises = new Set(balises.map(([chemin]) => chemin));
const couvert = (chemin) => {
  const v = valeur(chemin);
  return cheminsBalises.has(chemin)
    || (Array.isArray(v) && v.every((_, i) => cheminsBalises.has(`${chemin}.${i}`)));
};

describe("livret ↔ moteur : les chiffres de règle", () => {
  it("toutes les balises du livret sont lues", () => {
    expect(balises.length).toBe((livret.match(/data-const="/g) || []).length);
  });

  it.each(balises)("%s : le chiffre du livret vaut la constante du moteur (« %s »)", (chemin, texte) => {
    const attendu = valeur(chemin);
    expect(attendu, `constante inconnue du moteur : ${chemin}`).toBeDefined();
    expect(nombresLus(texte)).toEqual([attendu].flat());
  });

  it.each(feuilles)("%s est balisé au moins une fois dans le livret", (chemin) => {
    expect(regles[chemin.split(".")[0]], `constante non exportée : ${chemin}`).toBeDefined();
    expect(couvert(chemin)).toBe(true);
  });
});
