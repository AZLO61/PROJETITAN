# Changelog

## Non publié — troisième passe du 2026-08-18 (test à la table)

Règles modifiées (chacune verrouillée par un test) :

- **Fini les rebonds qui repartent en arrière.** Sous le Seuil 4, un élément
  qui percute un mur ou atteint le bord du plateau s'arrête désormais net,
  sur une case adjacente à la fois à son origine et à sa destination visée —
  la même règle que celle déjà appliquée au « 2e obstacle » — au lieu de
  repartir en sens inverse. Le glossaire, la page Règles et le livret sont mis
  à jour ; le tutoriel du livret décrit encore l'ancienne trajectoire par
  rebond et reste à reprendre, le remplacer à la main risquait d'introduire de
  nouvelles erreurs sur un exemple déjà en partie périmé.
- **Graouhhh : DIL tranché puis déplacement, Titan par Titan.** L'ancien
  résolveur déplaçait TOUS les Titans touchés d'un bloc avant d'afficher la
  moindre décision DIL — l'attaquant voyait le résultat final avant même
  d'avoir choisi quoi que ce soit. Le moteur traite désormais chaque Titan
  touché individuellement (toujours du plus loin au plus proche) : sa
  décision DIL est tranchée, PUIS il se déplace, avant de passer au suivant.
  Impossible de passer au Titan suivant tant que ce n'est pas résolu — la
  file de décisions s'en charge. `resolveGraouhhh` reste inchangée en
  apparence (283 tests existants verrouillent son résultat final), elle
  n'est plus qu'un enchaînement synchrone des mêmes briques ; le contrôleur,
  lui, les rejoue une par une via `advanceGraouhhh`. Reste hors scope : le
  tour d'une IA qui joue elle-même Graouhhh applique encore tous les
  déplacements d'un coup (chemin séparé, plus gros chantier, non demandé
  cette session).

Corrections trouvées lors de la relecture du test à la table :

- **Un panneau DIL/RAGE (ou Faut Pas Me Chauffer) en attente ne bloquait pas
  le plateau.** Cliquer une case pendant qu'une décision de ce type restait à
  trancher — sur soi ou sur un autre Titan — pouvait changer la sélection ou
  déclencher un mode de carte au lieu d'être ignoré, ce qui risquait de faire
  perdre à l'attaquant la fenêtre pour récupérer son bloc.
- **L'aperçu d'Énergie de Tout Casser ne suivait pas le bouton "+".**
  L'Adrénaline ajoutée était bien comptée à la résolution réelle de la carte,
  mais pas dans le badge Énergie/Seuil 4 affiché avant de valider.
- **Classement provisoire/final : le total n'apparaît plus deux fois.** Le
  tableau détaillé donne déjà les totaux, colonne par colonne (ligne TOTAL) ;
  le bloc Classement juste en dessous répétait la même valeur à côté de
  chaque médaille. Il ne garde plus que le rang et le nom, sa vraie
  valeur ajoutée étant le départage, pas le total déjà visible au-dessus.

## Non publié — seconde passe du 2026-08-18 (test à la table)

Règles modifiées (chacune verrouillée par un test) :

- **Un débris qui en rencontre un autre forme un tas.** Le moteur transmettait
  l'énergie et expédiait le bloc dormant une case plus loin, alors que le
  tableau des combinaisons du livret ne connaît que Bloc + Bloc = Amas. La
  transmission ne vaut que pour l'élément FRAPPÉ par une carte. Le Titan en
  vol, lui, pousse toujours : le béton s'empile, le Titan bouscule.
- **Sortie du plateau : seul l'axe par lequel on sort boucle.** « J'étais en
  I2, un Titan en H1, Boing Boing à valeur 5 : il aurait dû être en G9, il
  était en I9. » La règle du miroir posée plus tôt dans la journée renvoyait
  au bord opposé sur chaque axe où le Titan avançait, coordonnée valide
  comprise. Un Titan traverse désormais comme un débris qui passe la Faille,
  et la sortie par un coin donne le coin opposé d'elle-même — ce que le livret
  V36 décrivait déjà.
- **Un Vert n'enlève jamais de blocs au décompte.** Le compte ajusté était
  borné à la longueur du barème : sur un Repaire déjà au maximum, ce plafond
  faisait BAISSER le compte. Dix Bleu plus un Vert affichaient 9, et le bonus
  Rose, qui se joue au nombre, pouvait changer de mains.

Secret et lisibilité du décompte :

- **Le placement des Verts est réellement secret.** La ligne des IA annonçait
  leur choix en clair, les menus des humains restaient tous ouverts côte à
  côte, et le journal écrivait le détail. Chaque Titan a désormais sa fenêtre,
  aucun score n'est montré tant qu'un Vert reste à poser, et tout se révèle
  d'un coup — placement derrière paravent, révélation simultanée.
- **Un tableau public des Repaires pendant le placement** : combien de blocs,
  combien de points, et ce que rapporterait un bloc de plus. C'est la question
  exacte que pose un Vert en main.
- Le panneau de scoring faisait placer leurs Verts aux IA dès qu'on l'ouvrait,
  même en Manche 2, sur un plateau intermédiaire, et sans jamais recalculer.
- Les Pistes ADN affichent leur position, pas seulement les points de podium.
- Les Socles se comptent en NOMBRE dans le bandeau des Titans, la valeur passe
  en infobulle. Icône du Titan à côté de son nom dans le décompte.

IA :

- **Novice +33,7 %, Confirmé +14,4 %**, mesurés sur deux séries de graines
  (`node scripts/mesure-forces.mjs 60`). Ce qui plombait le Novice n'était pas
  sa molette de bruit mais deux angles morts : il PROGRAMMAIT AU HASARD, et il
  ignorait l'Adrénaline. Le Confirmé bute sur un plafond de structure,
  documenté au-dessus des réglages.

Ordre du tour :

- **Le panneau Ramasser n'apparaît plus par-dessus une décision.** Il
  n'écartait que le Dilemme et le repli ; la répartition d'un Amas et la
  comparaison de Faut Pas Me Chauffer passaient au travers.
- Le coût de la rentrée dans BIG CITY est écrit à l'écran (1 case de Mouvement
  gratuit). La règle existait depuis le 16 août, rien ne la disait.

Code :

- Mille identifiants morts retirés des panneaux, deux fichiers supprimés
  (`ScoringPanel.jsx` vide, `TitanPanel.jsx` devenu `FpmcBanner.jsx`), les 16
  avertissements de hooks ramenés à zéro, et le barème du livret unifié : il
  vivait en double dans `blockNames.js`.

## Non publié — rulings et corrections du 2026-08-18 (première passe)

Règles modifiées (chacune verrouillée par un test) :

- **Sortie du ring en miroir.** ⚠️ Révisée le jour même, voir plus haut.
- **Un Titan pousse toujours un autre Titan**, même avec 1 seule énergie
  restante — c'était déjà l'exception écrite au livret, elle n'était pas
  implémentée. La chaîne de Graouhhh passe enfin.
- **Repli offensif.** Un Titan arrêté faute de puissance peut être posé sur la
  case d'un adversaire : il l'en chasse d'une case et marque 1 Bagarre. Seule
  la case de l'initiateur reste fermée.
- **Le Dilemme s'applique avant le recul** : la demande porte la case où le
  coup a été encaissé, pour que le bloc perdu tombe dans le Périmètre de
  l'attaquant.

Corrections trouvées en campagne, en marge de ces rulings :

- Un Titan encore en vol pouvait être poussé une seconde fois par une chaîne
  revenue sur lui, et l'appelant écrasait ensuite ce déplacement — deux Titans
  sur une case (graines 3020, 7086).
- Un débris pouvait être reposé sur un bâtiment encore debout via sa case
  d'origine, qui échappait au filtre (graine 7067).
- Boing Boing éjectait un occupant coincé vers une case « libre » d'après un
  relevé périmé, alors qu'un Titan venait de s'y poser.

Interface et confort :

- **La 3D est jouable** : clic sur les cases, surlignage des cases actives, un
  seul aiguilleur de clic partagé avec la 2D.
- **Annuler défait TOUT** ce qu'une action a produit — décisions DIL/RAGE en
  attente, replis, répartition d'Amas, gouttière, Manche, placement des Verts.
- **Un seul panneau de décision à l'écran**, dans l'ordre de la résolution
  réelle, et les cibles d'un Graouhhh se tranchent une par une.
- **Les IA placent leurs propres Blocs Verts** au décompte final.
- Le décompte affiche le nombre de blocs par couleur, pas seulement les points.
- Le journal d'actions se ferme sans se vider.
- Les marqueurs de cartes passent en format portrait.

## 6.0.0

- Passage à une structure repository orientée domaine/application/UI/IA.
- Ajout d'un point d'entrée de contexte IA.
- Ajout de contrats JSON pour l'état et les commandes IA.
- Audit structurel renforcé.
- CI GitHub renforcée avec audit, lint, tests et build.
- Ajout de Dependabot.
- Ajout de templates GitHub.
- Assets Titan externalisés du code source.
- Aucun changement de règle de gameplay introduit volontairement par cette passe.
