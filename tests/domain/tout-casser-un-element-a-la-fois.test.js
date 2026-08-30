/* ============================================================
   PROJET TITAN — UN ÉLÉMENT ENTIÈREMENT RÉSOLU AVANT LE SUIVANT
   ============================================================
   Nikola, 2026-08-30 : « quand on déplace plusieurs éléments avec une action,
   si j'ai un élément qui fait un rebond ou une percussion, je dois l'appliquer
   avant de passer à l'élément suivant ».

   Tout Casser est la seule carte qui frappe jusqu'à huit cases d'un coup, et
   c'est là que l'ordre se voyait. Elle avait DEUX résolutions :

     · l'humain cliquait chaque cible l'une après l'autre, et chacune partait
       d'un plateau que la précédente avait déjà modifié
       (`listerCiblesToutCasser` + `resolveToutCasserCase`) ;
     · l'IA passait par `resolveToutCasser`, qui enchaînait quatre balayages du
       Périmètre — tous les bâtiments, puis tous les blocs, puis tous les
       Titans, puis tous les Amas.

   Deux ordres de résolution pour la même carte, donc deux résultats possibles
   pour le même coup. Et l'ordre groupé était faux en lui-même : un bloc qui
   rebondit peut revenir sur une case qu'un balayage ultérieur s'apprête à
   frapper, un Titan poussé en chaîne peut libérer ou occuper une case avant
   qu'on ne la traite.

   Ce test tient l'invariant qui ferme les deux : l'ordre de résolution est
   celui du Périmètre, jamais celui des natures.
============================================================ */
import { describe, expect, it } from "vitest";
import {
  resolveToutCasser,
  listerCiblesToutCasser,
  releverPercussion,
} from "../../src/domain/gameRules.js";

const t = (id, cell, extra = {}) => ({
  id, cell, repaire: [], socles: [], adrenaline: 0,
  bagarre: 0, destruction: 0,
  hand: [], programmed: [], playedThisManche: [], discardedHidden: [], repos: [],
  ...extra,
});

const bat = (key, etages) => ({
  [key]: {
    row: key[0], col: Number(key.slice(1)),
    blocks: Array.from({ length: etages }, () => "bleu"),
    socle: etages, isTeleporter: false,
  },
});

/* Le Périmètre de E5 énumère ses huit voisines dans un ordre fixe. On y pose
   un Titan, un bâtiment et un Amas sur des cases différentes : sous l'ancien
   groupement par nature, le bâtiment passait forcément avant le Titan, quelle
   que soit leur place autour de l'attaquant. */
function scene() {
  const attaquant = t(1, "E5");
  const voisin = t(2, "D4");
  return {
    titans: [attaquant, voisin],
    looseBlocks: { F6: ["rouge", "jaune"] },   // un Amas
    board: { ...bat("E4", 2) },
    replis: [],
    trajectoires: [],
  };
}

describe("Tout Casser résout ses cibles dans l'ordre du Périmètre", () => {
  it("traite chaque case entièrement avant de passer à la suivante", () => {
    const jeu = scene();
    /* L'ordre attendu est celui que le joueur voit dans sa file : c'est la
       même fonction qui l'établit pour lui et pour l'IA. On le relève AVANT de
       résoudre, sur le plateau intact. */
    const attendu = listerCiblesToutCasser(1, jeu, releverPercussion(1, jeu, 0))
      .map((c) => c.key);
    expect(attendu.length).toBeGreaterThan(1);

    const res = resolveToutCasser(1, jeu, 0);
    const journal = res.log.join("\n");

    /* Chaque cible apparaît dans le journal, et dans l'ordre du Périmètre. On
       compare des POSITIONS dans le texte plutôt que des lignes exactes : ce
       qu'on protège est la séquence, pas la formulation, qui a le droit de
       bouger. */
    const positions = attendu.map((key) => journal.indexOf(key));
    positions.forEach((pos, i) => {
      expect(pos, `la cible ${attendu[i]} devrait apparaître dans le journal`).toBeGreaterThanOrEqual(0);
    });
    const trie = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(trie);
  });

  it("ne rend qu'une Bagarre par Titan touché, malgré la résolution case par case", () => {
    /* La contrepartie de la boucle : le relevé de percussion et le compteur de
       Bagarre restent COMMUNS à toute la carte. Sans ça, découper la carte en
       autant d'appels aurait crédité une Bagarre par case (FAQ #12). */
    const jeu = scene();
    resolveToutCasser(1, jeu, 0);
    expect(jeu.titans.find((x) => x.id === 1).bagarre).toBe(1);
  });
});
