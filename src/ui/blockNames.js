// Noms de destination des blocs, tels qu'ils apparaissent dans le barème du
// livret V36 : « Bleu — Habitation », « Rose — Boutique », etc.
//
// L'interface n'affichait que le nom technique de la couleur en minuscules
// (« bleu », « rose »), qui ne dit rien à un joueur et ne correspond à aucun
// terme du livret. Le nom de destination est celui que les joueurs lisent sur
// la feuille de score.
export const BLOCK_NAME = {
  bleu: "Habitation",
  rose: "Boutique",
  orange: "Loisir",
  rouge: "Supermarché",
  vert: "Téléporteur",
};

// Ordre d'affichage : celui du barème, du stock le plus grand au plus petit,
// le Vert à part puisqu'il ne suit pas un barème de couleur.
export const BLOCK_ORDER = ["bleu", "rose", "orange", "rouge"];

// Barèmes du livret V36, pour rappeler au survol ce que vaut le prochain bloc
// d'une couleur. Sans ça, il fallait ouvrir les Règles et descendre jusqu'au
// Scoring pour savoir si un cinquième bloc bleu valait la peine.
export const BAREME_PALIERS = {
  bleu: [1, 3, 5, 7, 10, 15, 20, 25, 30],
  rose: [2, 4, 6, 8, 11, 14, 17, 20],
  rouge: [3, 7, 11, 16, 22],
};

// Orange : se compte par paires exactes, un bloc isolé ne rapporte rien.
const BAREME_ORANGE_PAIRES = [0, 5, 11, 18, 26];

/** Points rapportés par `n` blocs de cette couleur. `null` pour le Vert. */
export function scoreBloc(color, n) {
  if (n <= 0) return 0;
  if (color === "orange") {
    const paires = Math.floor(n / 2);
    return BAREME_ORANGE_PAIRES[Math.min(paires, BAREME_ORANGE_PAIRES.length - 1)];
  }
  const paliers = BAREME_PALIERS[color];
  if (!paliers) return null; // vert : pas de barème
  return paliers[Math.min(n, paliers.length) - 1];
}

/** Infobulle : ce que vaut la position actuelle, et ce que rapporte la suite. */
export function baremeHint(color, n) {
  const nom = BLOCK_NAME[color];

  if (color === "vert") {
    return `${n} ${nom} — chaque bloc vaut +1 case sur un barème ou une Piste ADN, au choix`;
  }

  const actuel = scoreBloc(color, n);
  const suivant = scoreBloc(color, color === "orange" ? n + 2 : n + 1);
  const gain = suivant != null && suivant > actuel ? suivant - actuel : null;
  const base = `${n} ${nom} = ${actuel} pt${actuel > 1 ? "s" : ""}`;

  if (color === "orange") {
    return gain ? `${base} · +${gain} avec la paire suivante` : base;
  }
  return gain ? `${base} · +${gain} au prochain bloc` : `${base} · barème au maximum`;
}
