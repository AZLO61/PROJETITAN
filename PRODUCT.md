# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Nikola, l'auteur du jeu, et deux à trois adversaires — humains autour d'une
table ou IA. Ils jouent une partie complète de **Projet Titan** pour la jouer
et pour l'équilibrer : chaque partie sert autant de test de règle que de
divertissement.

Deux scènes d'usage à parts égales, confirmées :

- **tablette posée à table**, l'appareil circulant entre les joueurs — d'où le
  secret de la programmation (les cartes d'un Titan ne sont visibles que
  pendant son tour) et le besoin de lisibilité à distance de bras ;
- **PC en grand écran**, un joueur pilotant face aux IA.

## Product Purpose

Jouer une partie de Projet Titan de bout en bout — 4 Manches, 5 phases par
Manche, 3 cartes jouées par Titan et par Manche — en laissant la machine
arbitrer tout ce qu'un humain ne veut pas arbitrer à la main : projections,
chaînes de réaction, Dilemmes, seuils d'énergie, décomptes.

Succès = une partie se joue sans jamais ouvrir le livret, et un désaccord de
règle se tranche en relisant le journal d'actions.

## Positioning

Le moteur de règles n'est pas une approximation du livret : c'est le livret,
rulings compris, chacun daté et commenté dans `src/domain/gameRules.js`. Une
partie est rejouable à l'identique depuis sa graine, et n'importe quel état
peut être exporté en rapport JSON pour reproduire un bug ou trancher une
règle. Un jeu vidéo adapté d'un jeu de plateau simplifie les règles ; ici
l'application existe pour ne pas les simplifier.

## Operating Context

- Plateau **BIG CITY** 9×9, lignes A→I, colonnes 1→9. Bâtiments sur les cases
  impaires, couloirs entre eux, 3 téléporteurs.
- Manche = 5 phases : Programmation, Action (3 rounds), Repos. Le Détonateur
  ouvre chaque round et pivote à chaque Manche.
- Tour d'un Titan : Mouvement gratuit (2 cases) → 1 carte → Ramassage. Les
  deux passifs sont facultatifs et se rejouent à chaque tour.
- 6 cartes d'action, Force 1 à 3. L'Adrénaline se mise pour allonger une
  portée ou emporter un duel.
- Ressources suivies par Titan : Repaire (blocs de 5 couleurs), Socles,
  Adrénaline, et deux pistes de score, Bagarre et Destruction.
- Deux vues du plateau au choix : grille 2D et scène 3D Three.js.
- Interface entièrement en français ; vocabulaire du livret (Repaire, Socle,
  Détonateur, Périmètre, Amas, Patatras, Lanterne Rouge, DIL, RAGE) à
  préserver mot pour mot.

## Capabilities and Constraints

- React 19 + Vite + Three.js. Aucune librairie d'UI, aucun moteur de style :
  tout est en styles inline aujourd'hui.
- Architecture en couches vérifiée par `npm run audit` : `domain/` ne connaît
  pas `ui/`. Une règle de jeu ne se corrige que dans `domain/`.
- 363 tests. `npm run check` = audit + lint + tests.
- IA à trois forces (novice / confirmé / expert) et quatre tempéraments.
- Simulateur de campagne en ligne de commande pour l'équilibrage.
- Export d'un rapport JSON de l'état courant, avec graine et journal.
- **Contrainte confirmée par l'auteur : aucune fonction ne disparaît, et la
  palette de couleurs existante est conservée.**

## Brand Commitments

- Nom : **Projet Titan**. Ville : **BIG CITY**.
- Les quatre Titans ont chacun leur couleur d'identité, utilisée partout où on
  les désigne : T1 cyan, T2 orange, T3 vert, T4 rose.
- Les cinq couleurs de blocs et les six couleurs de cartes sont des données de
  jeu, pas des choix décoratifs : elles ne peuvent pas changer.
- Sprites de Titans fournis dans `public/assets/titans/`.
- Ton : celui du livret — direct, imagé, jamais corporate.

## Evidence on Hand

- `src/domain/gameRules.js` : les règles et tous les rulings tranchés, datés.
- `src/ui/rules/rulesContent.js` : les 6 cartes, les 5 phases, les barèmes.
- `public/assets/` : sprites de Titans, icônes de blocs, Socle.
- Rapports de partie JSON exportés en séance, avec graine et journal.
- Aucun chiffre d'audience, aucune date de sortie, aucun prix : le jeu n'est
  pas publié et rien ne doit le laisser croire.

## Product Principles

1. **Le moteur tranche, l'écran explique.** Toute règle vit dans `domain/` en
   un seul exemplaire ; l'interface ne la recopie jamais, elle l'affiche.
2. **Une décision à l'écran à la fois.** Dilemme, repli, écroulement, duel,
   vol : elles s'enchaînent dans l'ordre de la résolution réelle, jamais en
   parallèle.
3. **Le tour se lit dans son ordre réel** — se déplacer, jouer, ramasser — une
   étape visible à la fois.
4. **Ce qui vient de se passer doit être relisible.** Le journal est une pièce
   à conviction, pas un décor.
5. **Rien ne se joue en secret contre le joueur.** Un placement automatique,
   une valeur tirée au sort, un choix fait par l'IA : le journal le dit.

## Accessibility & Inclusion

Lisibilité à distance de bras sur une tablette partagée, et cibles tactiles
d'au moins 44 px : ce sont des exigences de la scène d'usage, pas du confort.
Les quatre frictions que l'auteur signale aujourd'hui — savoir ce qu'on peut
faire, comprendre ce qui vient de se passer, lire le plateau, se situer au
score — sont toutes des échecs de lisibilité et font partie du problème à
résoudre.
