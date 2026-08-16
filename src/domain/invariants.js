/* ============================================================
   PROJET TITAN — Contrôle d'intégrité d'une partie
   ============================================================
   POURQUOI

   Un simulateur qui tourne sans planter n'est pas un simulateur qui
   marche. Il peut très bien produire des milliers de parties dans
   lesquelles deux Titans occupent la même case, où un Repaire contient
   plus de blocs qu'il n'en existe dans la boîte, ou où l'Adrénaline part
   en négatif. Les statistiques seraient alors parfaitement propres et
   parfaitement fausses.

   Ce module vérifie, après CHAQUE action, les règles qui ne doivent
   jamais être violées. Chacune correspond à un ruling explicite de
   Nikola ou à une contrainte matérielle du jeu physique.

   Il sert deux usages :
   · le simulateur, qui l'active en mode diagnostic ;
   · les tests, qui peuvent l'appeler sur un état construit à la main.
============================================================ */

import { STOCK_INITIAL, isSocleMarker } from "./gameRules.js";

// Nombre total de blocs de chaque couleur existant dans la boîte. Un
// Repaire ne peut pas en contenir davantage : si le compte explose,
// c'est qu'une action en fabrique.
const STOCK_TOTAL = { ...STOCK_INITIAL };

/**
 * Vérifie tous les invariants sur un état de partie.
 * Retourne un tableau de violations (vide si tout va bien).
 *
 * @param {{ board: object, looseBlocks: object, titans: Array }} etat
 * @param {string} contexte  d'où l'on appelle, pour situer une violation
 */
export function verifierInvariants(etat, contexte = "") {
  const violations = [];
  const signaler = (regle, detail) => violations.push({ regle, detail, contexte });

  const { board = {}, looseBlocks = {}, titans = [] } = etat;

  // Un Titan éjecté de BIG CITY attend son tour hors du plateau (ruling
  // Nikola du 2026-08-16, « ça évite l'acharnement »). Il n'occupe alors
  // aucune case : sa `cell` ne désigne plus sa position mais la case par
  // laquelle il rentrera. Les contrôles de position ne le concernent pas.
  const surPlateau = titans.filter((t) => !t.horsPlateau);

  // ── 1. Deux Titans ne partagent jamais une case ──
  // Ruling explicite de Nikola, déjà corrigé une fois dans le moteur
  // (l'attaquant recule si sa case d'arrivée est occupée).
  const parCase = {};
  for (const t of surPlateau) {
    if (parCase[t.cell]) {
      signaler("titans-superposes", `${t.cell} occupée par les Titans ${parCase[t.cell]} et ${t.id}`);
    }
    parCase[t.cell] = t.id;
  }

  // ── 2. Un Titan ne se tient jamais sur un bâtiment debout ──
  // Confirmé Nikola. Le moteur s'en protège à plusieurs endroits, mais
  // un chemin d'exécution oublié rendrait la position injouable.
  for (const t of surPlateau) {
    const bat = board[t.cell];
    if (bat?.blocks?.length > 0) {
      signaler("titan-sur-batiment", `Titan ${t.id} en ${t.cell}, bâtiment de ${bat.blocks.length} bloc(s)`);
    }
  }

  // ── 2 bis. Aucun débris ne repose sur un bâtiment debout ──
  // Règle rappelée par Nikola au premier test à la table (2026-08-15) :
  // « un débris sur un bâtiment c'est impossible, il ne peut jamais y en
  // avoir ». Un bâtiment occupe toute sa case, il n'y a pas de place au sol
  // à côté de lui. Le symptôme se voyait à l'écran : un bloc affiché
  // par-dessus une tour encore debout.
  for (const [cle, pile] of Object.entries(looseBlocks)) {
    if (!Array.isArray(pile) || pile.length === 0) continue;
    const bat = board[cle];
    if (bat?.blocks?.length > 0) {
      signaler("debris-sur-batiment", `${cle} porte ${pile.length} débris alors que son bâtiment tient encore (${bat.blocks.length} bloc(s))`);
    }
  }

  // ── 3. Toute case occupée est sur le plateau 9x9 ──
  for (const t of titans) {
    const ligne = "ABCDEFGHI".indexOf(t.cell?.[0]);
    const colonne = Number(t.cell?.slice(1));
    if (ligne < 0 || !Number.isInteger(colonne) || colonne < 1 || colonne > 9) {
      signaler("case-hors-plateau", `Titan ${t.id} en "${t.cell}"`);
    }
  }

  // ── 4. Aucune valeur négative ──
  // L'Adrénaline en négatif signifierait une dépense non couverte : le
  // score final en dépend directement (3 points par Adrénaline).
  for (const t of titans) {
    for (const champ of ["adrenaline", "bagarre", "destruction"]) {
      const v = t[champ];
      if (typeof v !== "number" || Number.isNaN(v)) {
        signaler("valeur-non-numerique", `Titan ${t.id} : ${champ} = ${v}`);
      } else if (v < 0) {
        signaler("valeur-negative", `Titan ${t.id} : ${champ} = ${v}`);
      }
    }
  }

  // ── 5. Le stock de blocs de la boîte n'est jamais dépassé ──
  // Contrainte matérielle : 19 Bleu, 12 Rose, 11 Orange, 7 Rouge. Si un
  // total dépasse, une action crée des blocs à partir de rien.
  const total = {};
  const compter = (couleur) => {
    if (STOCK_TOTAL[couleur] === undefined) return;
    total[couleur] = (total[couleur] || 0) + 1;
  };
  for (const t of titans) (t.repaire || []).forEach(compter);
  for (const pile of Object.values(looseBlocks)) {
    for (const bloc of pile || []) if (!isSocleMarker(bloc)) compter(bloc);
  }
  for (const bat of Object.values(board)) {
    for (const bloc of bat?.blocks || []) compter(bloc);
  }
  for (const [couleur, n] of Object.entries(total)) {
    if (n > STOCK_TOTAL[couleur]) {
      signaler("stock-depasse", `${couleur} : ${n} en jeu pour ${STOCK_TOTAL[couleur]} dans la boîte`);
    }
  }

  // ── 6. Les cartes d'un Titan ne se dupliquent pas ──
  // Chaque Titan possède un exemplaire des 6 cartes Actions. La même
  // carte ne peut pas être à la fois en main et programmée : le
  // symptôme classique d'un `splice` oublié.
  for (const t of titans) {
    const toutes = [
      ...(t.hand || []),
      ...(t.programmed || []),
      ...(t.playedThisManche || []),
      ...(t.discardedHidden || []),
      ...(t.repos || []).map((e) => e.cardId),
    ];
    const vues = new Set();
    for (const c of toutes) {
      if (vues.has(c)) signaler("carte-dupliquee", `Titan ${t.id} détient ${c} en double`);
      vues.add(c);
    }
    if (toutes.length > 6) {
      signaler("trop-de-cartes", `Titan ${t.id} détient ${toutes.length} cartes pour 6 possibles`);
    }
    // Une carte perdue est tout aussi grave qu'une carte dupliquée : le
    // Titan finirait la partie avec moins d'options que ses adversaires.
    if (toutes.length < 6) {
      signaler("carte-perdue", `Titan ${t.id} ne détient plus que ${toutes.length} cartes sur 6`);
    }
  }

  return violations;
}

/**
 * Défauts d'hygiène : rien d'illégal au regard des règles, mais des
 * scories qui peuvent devenir des bugs. Séparés des violations pour
 * qu'un vrai problème de règle ne se noie pas dans le bruit — le
 * diagnostic remontait 11 637 piles vides pour 104 superpositions, et
 * seules les secondes comptaient.
 */
export function verifierHygiene(etat) {
  const soucis = [];
  const { looseBlocks = {} } = etat;

  // Une pile de blocs libres vidée reste en place sous forme de tableau
  // vide au lieu d'être supprimée. Aujourd'hui sans conséquence : tous
  // les pools testent `length > 0`. Le jour où un parcours oublie ce
  // test, il verra des cases « avec des blocs » qui n'en ont plus.
  for (const [cle, pile] of Object.entries(looseBlocks)) {
    if (Array.isArray(pile) && pile.length === 0) {
      soucis.push({ regle: "pile-vide-residuelle", detail: `${cle} est un tableau vide au lieu d'être supprimé` });
    }
  }

  return soucis;
}
