# Changelog

## Non publié — rulings et corrections du 2026-08-18

Règles modifiées (chacune verrouillée par un test) :

- **Sortie du ring en miroir.** Un Titan poussé hors du plateau réapparaît à
  l'opposé : chaque axe sur lequel il avançait le renvoie au bord d'en face.
  Une sortie en diagonale rend donc le coin opposé (I8 vers le sud-est → A1),
  là où l'ancienne règle ne bouclait que sur le bord franchi et le laissait
  en A9. Les débris gardent la faille spatio-temporelle, leur trajectoire
  devant rester continue.
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
