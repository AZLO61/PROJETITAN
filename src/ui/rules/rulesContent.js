// Contenu du livret de règles V36, transposé au format numérique.
//
// Source : le livret de règles V36 (conservé hors dépôt par Nikola) et les
// rulings inscrits dans `src/domain/gameRules.js`. Aucune règle n'est inventée ici : ce fichier ne
// fait que reformuler pour l'écran ce qui existe déjà. Toute évolution de
// règle doit être répercutée ici EN MÊME TEMPS que dans le moteur.
//
// Séparé du composant pour garder RulesPage.jsx lisible, et pour que le
// Fast Refresh de Vite continue de fonctionner sur le composant.

const ICON = (name) => `${import.meta.env.BASE_URL}assets/rules/${name}.png`;

export const LEXIQUE = [
  { icon: ICON("energie"), nom: "Énergie", def: "Détermine le seuil actif de l'action jouée, au moment où tu la joues." },
  { icon: ICON("seuil4"), nom: "Seuil 4", def: "Palier atteint à 4 ou plus : active l'effet le plus fort de la carte jouée." },
  { icon: ICON("adrenaline"), nom: "Adrénaline", def: "Permet de modifier la valeur d'énergie d'une action. Tu en gagnes 1 à chaque début de Manche." },
  { icon: ICON("fatigue"), nom: "Fatigue", def: "La cible perd 1 carte non jouée, piochée au hasard et placée en Repos." },
  { icon: ICON("perimetre"), nom: "Périmètre", def: "Les 8 cases autour de ton Titan, utilisées pour le calcul d'énergie et la récupération." },
  { icon: ICON("repaire"), nom: "Repaire", def: "Ta réserve personnelle, où sont stockés les blocs et socles que tu collectes." },
  { icon: ICON("batiment"), nom: "Bâtiment", def: "Empilement de blocs colorés, jusqu'à 4 étages, sur une case bâtiment du plateau." },
  { icon: ICON("bloc_bleu"), nom: "Bloc de béton", def: "Ressource de base récupérable. Sa couleur decide de son barème de score. Peut s'empiler pour former un Amas." },
  { icon: ICON("amas"), nom: "Amas de béton", def: "Plusieurs Blocs de béton empilés sur une même case." },
  { icon: ICON("titan"), nom: "Titan", def: "Le personnage que tu incarnes : un colosse qui détruit BIG CITY." },
  { icon: ICON("socle"), nom: "Socle", def: "Placé sous chaque bâtiment à sa construction. Sa valeur est fixe, même si le bâtiment perd des blocs ensuite." },
  { icon: ICON("rebond"), nom: "Arrêt faute de puissance", def: "Un élément qui percute un bâtiment ou atteint un bord de plateau sans l'énergie du Seuil 4 s'arrête net, sur une case adjacente à la fois à celle où il était et à celle qu'il visait. Il ne repart pas en sens inverse." },
  { icon: ICON("projection"), nom: "Projection", def: "Un TITAN qui arrive sur une case occupée pousse ce qui s'y trouve, d'un nombre de cases égal à l'énergie restante, et toujours d'au moins 1 case même s'il ne lui reste qu'une énergie de 1. Un DÉBRIS en vol, lui, ne pousse pas ce qu'il croise : il s'empile dessus et forme un Amas. La chaîne de poussée peut se poursuivre de proche en proche, et chaque Titan DISTINCT déplacé rapporte 1 Bagarre à l'initiateur — mais un Titan déjà en mouvement dans la réaction n'est jamais poussé une seconde fois." },
  { icon: ICON("amas"), nom: "Formation d'Amas", def: "Bloc + Bloc = Amas, Bloc + Amas = Amas. Un débris projeté qui rencontre du béton au sol s'arrête dessus et s'y empile : il ne le chasse pas plus loin." },
  { icon: ICON("titan"), nom: "Hors de BIG CITY", def: "Un Titan poussé hors du plateau réapparaît de l'autre côté et attend SON tour pour rentrer, jamais avant. Seul l'axe par lequel il est sorti boucle : sorti par la gauche depuis la ligne G, il revient en G9 ; sorti par un coin, où les deux axes dépassent, il revient au coin opposé. Sa rentrée lui coûte 1 case de son Mouvement gratuit, et 1 case de plus par obstacle à contourner." },
  { icon: ICON("detonateur"), nom: "Détonateur", def: "Désigne le Titan qui commence la Manche. Passe au joueur suivant à chaque Manche." },
];

export const BADGES = [
  { code: "DIL", nom: "Dilemme", def: "L'attaquant désigne 2 options différentes chez la cible : une couleur de son Repaire, ou « un Socle tiré au sort » si elle en possède au moins un. La cible choisit laquelle des 2 elle perd, ou paie 1 Adrénaline pour annuler. L'option Socle est anonyme : personne ne choisit lequel partira ni ne connaît sa valeur avant le tirage. Le VERT ne peut jamais être désigné, sauf s'il est la seule couleur du Repaire : sa valeur n'existe qu'au décompte final, en fixer la perte reviendrait à jouer un prix que personne ne connaît. Impossible s'il n'y a pas 2 options distinctes — mais « 1 couleur + 1 Socle » suffit. Où va l'élément perdu dépend de la CARTE jouée, voir le tableau ci-dessous.", color: "#FFD93D" },
  { code: "RAGE", nom: "Rage", def: "L'attaquant choisit librement 1 ressource dans le Repaire de la cible, sans étape de défense. Possible dès que la cible possède 1 seule ressource. Où va la ressource dépend de la CARTE jouée, voir le tableau ci-dessous. Une Adrénaline volée rejoint toujours la réserve de l'attaquant : elle ne se pose pas au sol.", color: "#FF2E63" },
  {
    code: "⊣",
    nom: "Arrêt faute de puissance",
    def: "Un élément projeté qui percute quelque chose sans avoir l'énergie de le déplacer ou de le casser ne finit PAS son déplacement : il s'arrête là. Le Titan initiateur choisit alors où le poser, parmi sa propre case et celles qui touchent à la fois sa case et la case visée. Une seule interdiction : jamais sur un bâtiment debout, sa case d'origine comprise. Tout le reste est ouvert — un débris déjà au sol (l'élément s'empile et forme un Amas), et même la case d'un autre Titan : un Titan replié qui la vise l'en chasse d'une case et marque 1 Bagarre, c'est un coup à part entière. Seule la case du Titan qui a joué la carte reste fermée, il a l'immunité sur sa propre action. Sa case d'origine reste toujours disponible. S'il sortait d'une faille et n'a donc pas de case précédente de ce côté du plateau, on prend les cases voisines de la case visée qui ne franchissent pas l'obstacle. Exemple : un élément qui ressort à l'ouest sur une case bloquée en C9 se pose en B9 ou D9.",
    color: "#FB923C",
  },
  {
    code: "→",
    nom: "Où va le bloc perdu",
    def: "Tout Casser : au sol dans les deux cas (DIL comme RAGE). Tête en Avant : DIL au sol, RAGE dans le Repaire de l'attaquant. Boing Boing : DIL au sol, RAGE dans le Repaire de l'attaquant. Graouhhh : au sol, cette carte n'a pas de RAGE. Faut Pas Me Chauffer : dans le Repaire de l'attaquant dans les deux cas. « Au sol » veut dire sur la case où la cible a encaissé le coup, AVANT sa projection éventuelle — le bloc y redevient ramassable par n'importe qui. Un Socle perdu en Dilemme suit la même route et conserve sa valeur.",
    color: "#16E08C",
  },
];

export const PHASES_MANCHE = [
  { n: 1, nom: "Événement", texte: "1 carte Événement est tirée au hasard, appliquée, puis remise." },
  { n: 2, nom: "Déclenchement", texte: "Le Détonateur choisit le starter. L'ordre se poursuit dans le sens horaire." },
  { n: 3, nom: "Programmation", texte: "Chaque Titan choisit en secret 3 cartes parmi les 6 de sa main, posées face cachée." },
  { n: 4, nom: "Action", texte: "Chacun joue 1 action par tour, dans l'ordre du jeton, jusqu'à épuisement des 3 cartes." },
  { n: 5, nom: "Repos", texte: "Restitution des cartes, puis vol d'une carte programmée au Titan suivant. On passe la Manche." },
];

export const CARTES = [
  {
    num: "01",
    nom: "Tout Casser",
    force: 1,
    icon: "💥",
    couleur: "#FF6B1A",
    resume: "Énergie = nombre de cases occupées dans ton Périmètre (max 8).",
    effets: [
      "Bâtiment (Seuil 4) : casse 1 bloc du haut, projeté. +1 Destruction.",
      "Bloc libre : projeté d'autant de cases que l'énergie transmise.",
      "Amas (Seuil 4) : Patatras, éjection du haut vers le bas.",
      "Titan touché : DIL, ou RAGE au Seuil 4. Déplacé, +1 Bagarre.",
    ],
    note: "🛡 Immunité : tu ne peux pas être projeté par ton propre Tout Casser. Un élément qui revient sur ta case s'y arrête immédiatement.",
  },
  {
    num: "02",
    nom: "Tête en Avant",
    force: 2,
    icon: "🏃",
    couleur: "#9333EA",
    resume: "Tu fonces en ligne droite sur 3 cases (+1 par Adrénaline dépensée).",
    effets: [
      "Bâtiment 1 bloc : arrêt, +1 Destruction.",
      "Bâtiment plus haut : le bloc du dessous est projeté en direction opposée.",
      "Bloc libre : récupéré, tu prends sa place et tu t'arrêtes.",
      "Titan touché : DIL, ou RAGE au Seuil 4. +1 Bagarre.",
    ],
    note: "Un bâtiment encore debout t'arrête sur la case précédente. S'il est totalement vidé, la case devient un couloir et tu avances dessus.",
  },
  {
    num: "03",
    nom: "Graouhhh",
    force: 2,
    icon: "😤",
    couleur: "#2DD4BF",
    resume: "Tu choisis un axe. Un bâtiment sur l'axe fait mur : ce qui est derrière est protégé.",
    effets: [
      "Tous les Titans de l'axe reculent.",
      "Chacun subit Fatigue + DIL.",
      "+1 Bagarre par Titan touché.",
    ],
    note: "🎁 Bonus : +1 Adrénaline par Titan touché au-delà du premier (2 touchés → +1, 3 touchés → +2). 🚫 Aucune Adrénaline dépensable sur cette action.",
  },
  {
    num: "04",
    nom: "Boing Boing",
    force: 2,
    icon: "🦘",
    couleur: "#FFD93D",
    resume: "Destination au choix, 3 cases max, tous azimuts, obstacles ignorés. Éléments collés = 1 seule case.",
    effets: [
      "Bloc libre à l'arrivée : ramassé.",
      "Bâtiment (Seuil 4) : Écroulement, les blocs sont distribués sur les cases adjacentes.",
      "Titan présent : DIL, projeté de la valeur restante, +1 Bagarre.",
      "Titan présent (Seuil 4) : RAGE, le bloc part directement dans ton Repaire. Impossible sans Adrénaline.",
    ],
    note: "🦘 La projection du Titan sur lequel tu atterris est égale à la distance restante de ton saut. 🧱 Un groupe d'éléments bloquants COLLÉS les uns aux autres (bâtiments, débris, Titans) ne compte que pour 1 case dans ton décompte, quelle que soit sa longueur : un mur de trois bâtiments te coûte autant qu'une seule case.",
  },
  {
    num: "05",
    nom: "Faut Pas Me Chauffer",
    force: 3,
    icon: "🔥",
    couleur: "#F44336",
    resume: "Tu cibles les Titans de ton Périmètre. Somme de tes 3 cartes programmées contre la sienne.",
    effets: [
      "Victoire : RAGE, +1 Bagarre, perdants projetés de (n+1) cases.",
      "Égalité : l'attaquant l'emporte. DIL, +1 Bagarre, projection identique.",
      "Défaite : aucun effet.",
    ],
    note: "🎯 Attaquant et cible ajoutent chacun une mise cachée d'Adrénaline, révélée en même temps. Les mises sont dépensées quel que soit le résultat.",
  },
  {
    num: "06",
    nom: "Je Ne Partage Pas",
    force: 3,
    icon: "🤐",
    couleur: "#2D8DF5",
    resume: "Tu ramasses les blocs libres de 2 cases de ton Périmètre, au choix. Aucune condition de hauteur ni de couleur.",
    effets: [
      "🏆 Lanterne Rouge : si tu as autant ou moins de blocs que le moins doté, tu en ramasses 3 au lieu de 2.",
      "Une case entièrement vidée t'oblige à t'y déplacer.",
    ],
    note: "🚫 Aucune Adrénaline dépensable sur cette action.",
  },
];

export const BAREMES = [
  {
    key: "bleu", couleur: "Bleu", hex: "#2D8DF5", type: "Habitation",
    paliers: [1, 3, 5, 7, 10, 15, 20, 25, 30],
    stock: 19, detail: "Barème progressif : chaque bloc supplémentaire fait monter d'un cran.",
  },
  {
    key: "rose", couleur: "Rose", hex: "#EC4899", type: "Boutique",
    paliers: [2, 4, 6, 8, 11, 14, 17, 20],
    stock: 12, detail: "+10 pts au Titan qui en a le plus. Égalité : les 10 pts sont divisés.",
  },
  {
    key: "orange", couleur: "Orange", hex: "#FB923C", type: "Loisir",
    paliers: [5, 11, 18, 26], paliersLabel: ["1 paire", "2 paires", "3 paires", "4 paires"],
    stock: 11, detail: "Se compte par paires exactes. Un bloc isolé ne rapporte rien.",
  },
  {
    key: "rouge", couleur: "Rouge", hex: "#EF4444", type: "Supermarché",
    paliers: [3, 7, 11, 16, 22],
    stock: 7, detail: "Barème progressif, sur un stock volontairement rare.",
  },
];

export const BAREME_VERT = {
  key: "vert", couleur: "Vert", hex: "#22C55E", type: "Téléporteur", stock: 5,
  detail: "Ne suit aucun barème. Chaque bloc Vert vaut +1 case, au choix, sur le barème d'une couleur ou sur une Piste ADN.",
};

export const TROPHEES = [
  { pts: "+5", icon: "🌈", nom: "Arc-en-ciel", def: "1er à posséder 1 bloc de chaque couleur. Attribué en cours de partie." },
  { pts: "+5", icon: "🗿", nom: "Collectionneur", def: "Plus grand nombre de socles (pas la valeur). Égalité = valeur la plus haute, puis divisé. Fin de partie." },
];

export const PISTES_ADN = [
  { rang: "🥇 1er", pts: "+7" },
  { rang: "🥈 2e", pts: "+3" },
  { rang: "🥉 3e", pts: "+1" },
  { rang: "4e", pts: "0" },
];

export const FINS_PARTIE = [
  { icon: "🏙️", nom: "Apocalypse Urbaine", def: "Il ne reste qu'un nombre défini de bâtiments encore debout. Le seuil est fixé sur l'écran de configuration, avant le lancement, puis verrouillé." },
  { icon: "📦", nom: "Pénurie", def: "Une couleur de bloc standard a entièrement disparu du plateau. Les exemplaires restés dans le sac ne comptent pas." },
  { icon: "🌀", nom: "Vide Spatial", def: "Il ne reste plus qu'un seul Téléporteur actif, c'est-à-dire dont le bloc Vert de base n'a pas encore été collecté." },
];
