// Effet de chaque carte en une phrase, pour un joueur qui découvre le jeu.
//
// Formulations tirées des resolvers de `src/domain/gameRules.js` et des
// rulings déjà écrits dans le code — aucune règle nouvelle n'est introduite
// ici. Si une règle change, cette table doit changer avec elle.
//
// Fichier séparé de CardVisual.jsx à dessein : un module qui exporte à la
// fois un composant React et des constantes perd le Fast Refresh de Vite.
export const CARD_EFFECT = {
  tout_casser:
    "Frappe tout ton Périmètre d'un coup. Ton Énergie = le nombre de cases occupées autour de toi. À partir du Seuil 4, tu casses aussi les bâtiments, tu éjectes les amas et tu repousses les Titans.",
  tete_en_avant:
    "Tu charges en ligne droite sur 3 cases (+1 avec 💉). Tu récupères ce que tu percutes ; un bâtiment encore debout t'arrête sur la case d'avant.",
  graouhhh:
    "Tu choisis un axe : tous les Titans sur cet axe, jusqu'au premier bâtiment-mur, sont reculés, subissent Fatigue + DIL, et te rapportent +1 Bagarre chacun.",
  boing_boing:
    "Tu sautes sur une case libre dans un rayon de 3 (+1 avec 💉), dans n'importe quelle direction.",
  faut_pas_me_chauffer:
    "Tu te compares aux Titans de ton Périmètre : somme des Forces de tes 3 cartes de la Manche, plus une mise d'Adrénaline cachée des deux côtés, révélée en même temps.",
  je_ne_partage_pas:
    "Tu ramasses les blocs libres de 2 cases de ton Périmètre (3 si tu es Lanterne Rouge). Une case entièrement vidée t'oblige à t'y déplacer.",
};
