# Changelog

## Non publié — neuvième passe du 2026-08-18 (revue complète avant démo)

Passe de revue demandée par Nikola avant une démonstration : « trouve-moi
tous les bugs possibles et corrige-les, faut que ce soit nickel ». Quatre
défauts sérieux trouvés, dont **trois blocages définitifs de partie** que
rien ne permettait de contourner.

### Le bug d'« Annuler », cause racine enfin trouvée

L'instantané entier était construit À L'INTÉRIEUR de `setUndoStack(prev =>
…)`. React n'exécute un updater fonctionnel qu'au traitement de sa file,
donc APRÈS le retour de la fonction appelante — or les résolveurs du
domaine mutent l'état EN PLACE. Séquence réelle d'un Tout Casser :

1. `captureSnapshot()` → programme un updater, ne clone rien
2. `resolveToutCasser(…)` → casse le plateau en place
3. `setState(prev => …)` → déclenche le rendu
4. React exécute (1) → `structuredClone` d'un plateau **déjà cassé**

L'instantané enregistrait l'état d'APRÈS l'action. « Annuler » dépilait
bien et restaurait fidèlement… l'état détruit. Le défaut touchait TOUTES
les cartes, pas seulement le warp par la Faille remonté par Nikola. Le
clone est désormais évalué de façon synchrone, à l'appel.

Pourquoi `annuler.test.jsx` restait vert : il sépare capture et mutation
en deux `act()`, ce qui laisse React vider sa file entre les deux et
masque exactement le défaut.

### Trois blocages définitifs de partie

- **Une décision impossible arrivait à l'écran.** `canDil`/`canRage` sont
  évalués au moment de l'impact, mais la carte continue de s'appliquer
  ensuite (projection, replis, écroulement) : le Repaire de la cible peut
  être retombé sous le seuil quand la décision s'affiche. DIL exige alors
  2 options pour activer « Valider » — avec une seule affichée, ce bouton
  ne s'active jamais. RAGE sur une cible sans ressource n'affiche aucun
  bouton. Le ruling existait déjà (Nikola, 14/08 : décision impossible =
  notée au journal, aucun effet), il n'était appliqué qu'à la création.
- **Un Amas cerné de bâtiments debout.** `getEcroulementCells` écarte toute
  case portant un bâtiment : un Amas entouré de huit bâtiments intacts ne
  renvoie aucune case éligible (au coin du plateau, trois suffisent —
  vérifié par script). Le panneau s'ouvrait quand même : aucune case
  cliquable, « Valider » masqué, « Annuler le dernier » masqué. Corrigé à
  deux niveaux : le panneau ne s'ouvre plus, et une sortie de secours
  existe si un autre chemin l'ouvrait.
- **La Programmation démarrait sur une carte encore due.**
  `advanceActionRound` valide la phase pour tout le monde dès 3 rounds
  comptés, sans regarder si les cartes ont été jouées. La transition
  tranche désormais sur le seul fait qui ne ment pas — reste-t-il des
  cartes programmées ? — recale le compteur et rend la main au Titan en
  retard.

### Le reste

- **Les cartes sont gelées pendant qu'une décision attend.** Le clic sur le
  plateau l'était déjà, pas les cartes : la carte se résolvait sur un
  plateau que la décision en cours allait encore modifier, et l'ordre du
  résultat dépendait de la vitesse de clic.
- **Le simulateur n'appliquait pas `ensureProgrammableHand`**, le filet
  anti-blocage que le contrôleur applique depuis le 18 août. Sur 600
  parties de diagnostic, 49 signalaient une « manche sautée, main
  insuffisante » que le vrai jeu ne produit plus : les chiffres
  d'équilibrage mesuraient un jeu plus dur que celui qu'on joue.
- **Favicon** : l'ICO et les PNG manquaient. Plusieurs navigateurs
  réclament un `.ico` classique et ignorent un SVG seul. Générés en pur
  Node depuis le même dessin (16/32/48 dans l'ICO, plus apple-touch-icon
  180 pour l'écran d'accueil d'une tablette).
- **`testTimeout` porté à 30 s.** Les tests de campagne tiennent 6 à 16 s
  pour un défaut Vitest à 5 s : `npm run check` échouait par intermittence
  sur un faux rouge, la meilleure façon de rater un vrai rouge. Ce n'était
  donc pas un « flake » mais un seuil mal réglé.

### Restent ouverts, volontairement

Deux points identifiés pendant la revue et **non corrigés sciemment** : la
démo est proche, et aucun des deux ne casse une partie.

- **Graouhhh joué par une IA** déplace encore tous les Titans touchés d'un
  coup au lieu d'attendre chaque DIL. Vérifié : l'ordre de traitement est
  identique à celui du joueur humain (du plus loin au plus proche), donc
  **l'état final du plateau est le même**. Défaut de séquençage visuel, pas
  de règle. Refondre ce chemin en asynchrone à la veille d'une démo coûtait
  plus de risque que de gain.
- **Boing Boing sur un Titan totalement coincé** (aucune case libre
  adjacente, cas rarissime) renvoie `applied: false` : la carte n'est pas
  consommée, alors que la projection a déjà pu déplacer des choses sur le
  plateau. Le joueur voit son clic « ne rien faire » sur un plateau qui a
  pourtant bougé. Corriger proprement demande de valider la destination
  AVANT de projeter — un changement au cœur du résolveur, à faire à tête
  reposée et pas la veille d'une présentation.

## Non publié — huitième passe du 2026-08-18 (repros précisées par Nikola)

- **Fix : une carte encore programmée (1 restante) ne fait plus sauter la
  phase en Programmation.** Repro précisée par Nikola : « il me restait une
  carte à jouer, mais la phase est passée au round suivant… je devais
  choisir trois nouvelles cartes alors qu'il m'en restait une, plus visible
  ni jouable. » Cause trouvée : `advanceActionRound` avançait le compteur
  de rounds à chaque appel de `markCardPlayed`/`discardCurrentCard`, sans
  vérifier que la carte visée était RÉELLEMENT encore programmée — un
  second appel (accidentel, sur une carte déjà retirée) avançait quand même
  le round. Les deux fonctions vérifient maintenant l'état avant d'agir.
  Nouveau test : `round-double-appel.test.jsx`. À reconfirmer à la
  prochaine table, cette hypothèse colle à la repro mais n'a pas été
  reproduite à l'identique du déroulé de Nikola.
- **Bug latent trouvé au passage, sans lien avec la repro ci-dessus :**
  dans `discardCurrentCard`, le message de log était renseigné DANS le
  updater `setTitanState` (exécution non synchrone) puis relu juste après,
  encore vide — la défausse volontaire ne marquait donc jamais le passif
  Récupération comme disponible après elle. Corrigé dans le même
  correctif ; verrouillé par `defausse-passif.test.jsx` (déjà existant).
- **Annuler + Tout Casser avec passage par la Faille : confirmé comme un
  vrai bug par Nikola**, avec repro précise : « les blocs qui ont pris le
  warp ne sont pas revenus à leur case initiale, ça fausse la partie. »
  Toujours sans cause racine identifiée — reste la priorité n°1 pour la
  prochaine session (voir passe précédente pour la piste des snapshots
  empilés, non confirmée).
- **Favicon : Nikola confirme tester en local via `localhost`.** Toujours
  aucune explication trouvée malgré un code vérifié correct en dev et en
  build.

## Non publié — septième passe du 2026-08-18 (Nikola demande de ne rien supposer)

- **Boing Boing, vraie règle enfin trouvée :** chaque obstacle se saute
  gratuitement, seule la case d'atterrissage (libre) coûte 1 — remplace la
  règle des "éléments collés" du 17 août, qui empêchait justement le
  saute-mouton sur un obstacle isolé. Trouvé après avoir signalé à Nikola
  la contradiction entre les deux règles ; il a tranché avec un exemple
  recalculé.
- **Sortie de plateau en diagonale : re-vérifiée avec de nouveaux exemples,
  toujours correcte.** Aucun changement de code, cette fois confirmé sans
  ambiguïté.
- **Débris qui pousse un Titan dans un bâtiment sous le Seuil 4 : vérifié
  par script direct, déjà correct** (corrigé par le retrait des rebonds
  plus tôt dans la session).

Trois points restent sans diagnostic confirmé, faute d'avoir pu reproduire
le mécanisme exact en lisant le code seul — repro plus précise demandée à
Nikola :

- **Favicon toujours absent après vidage de cache sur 2 navigateurs.** Le
  code est pourtant vérifié correct (dev ET build, avec le bon préfixe
  `/PROJETITAN/`) — reste à savoir sur quelle URL exactement Nikola teste
  (`JOUER-A-TITAN.bat` local, ou le site en ligne, qui ne peut de toute
  façon recevoir aucun de ces correctifs tant que le dépôt n'a pas de
  remote).
- **Annuler ne restaurerait pas les débris en 2D/3D.** Le mécanisme de
  snapshot capture et restaure pourtant explicitement `looseBlocks`, et la
  signature 3D en dépend bien. Piste probable non confirmée : plusieurs
  `captureSnapshot()` s'empilent parfois pour une seule action visible
  (un pour la carte, un de plus par décision DIL/RAGE résolue) — un seul
  clic sur "Annuler" ne défait alors que le dernier maillon.
- **Une carte encore programmée (1 restante) mais la phase saute quand
  même en Programmation.** `cardsPlayedCountRef` (compteur de rounds) est
  pourtant bien restauré par Annuler, contrairement à l'hypothèse initiale
  d'une désynchronisation par undo incomplet.

## Non publié — sixième passe du 2026-08-18 (nouveau test à la table)

- **Survol des cartes programmées : enfin la bonne règle.** Deux lectures
  précédentes s'étaient trompées (bloqué pendant l'inter-tour, puis rouvert
  mais toujours câblé sur `activePlayerId`). Nikola a précisé sans
  ambiguïté : c'est la SÉLECTION qui décide, pas le tour officiel — même
  règle que la Phase Programmation applique déjà au secret des cartes.
- **Un débris qui pousse un Titan** applique désormais la même règle qu'un
  Titan qui en pousse un autre (toujours, d'au moins 1 case, dès qu'il
  reste de l'énergie) — l'ancienne exception à 2 d'énergie minimum est
  retirée.
- **Main trop ciblée par la Fatigue :** nouveau filet de sécurité en
  Programmation (`ensureProgrammableHand`), qui reprend au hasard depuis la
  Zone Repos du Titan si sa main est descendue sous 3 cartes.
- **Le chiffre "Énergie" reste en jaune** même au Seuil 4 (l'avertissement
  reste porté par le badge "Seuil 4" à côté).

Vérifié sans changement de code nécessaire : Boing Boing autorise déjà de
passer par-dessus un débris/bâtiment/Titan en case intermédiaire ; Fatigue
sur un Titan à 0 carte non jouée échoue déjà proprement ; le favicon est
correctement configuré (probable cache navigateur, pas un bug de code).

Restent ouverts, faute de temps ou d'ambiguïté non résolue cette session :

- **DIL/RAGE doit bloquer TOUT déplacement pour toutes les cartes**, pas
  seulement Graouhhh joué par un humain (déjà fait, cf. passe précédente).
  Tout Casser, Tête en Avant, Boing Boing, Faut Pas Me Chauffer côté humain,
  et Graouhhh lui-même côté IA, utilisent encore l'ancien schéma
  "décision + déplacement dans le même résolveur synchrone". Chantier de
  taille comparable à celui déjà fait sur Graouhhh, à refaire carte par
  carte.
- **Sortie de plateau en diagonale : vérifiée, déjà correcte.** Les deux
  premiers exemples de Nikola étaient géométriquement incohérents entre eux
  (H4→I6 n'est pas une diagonale à pas unitaire) ; une fois reformulés avec
  des cases et directions précises (A9 poussé par A8 → A1, par B8 → I1, par
  B9 → I9), les trois correspondent exactement au comportement déjà
  implémenté (vérifié par script direct sur `projectInDirection`). Aucun
  changement de code.
- **Double panneau au survol d'un bâtiment :** repro pas assez précise pour
  localiser le défaut exact (tooltip natif du navigateur vs popup de
  composition au clic ? deux états qui se marchent dessus ?).

## Non publié — cinquième passe du 2026-08-18 (précisions sur la quatrième)

Un vrai bug trouvé grâce à des précisions de Nikola sur 3 points restés
ouverts :

- **Le tour d'un Titan IA pouvait démarrer par-dessus un DIL/RAGE encore en
  attente.** `finishAiTurn` faisait avancer `activePlayerId` dès que la
  carte de l'IA était jouée, sans jamais attendre qu'un DIL/RAGE qu'elle
  venait de déclencher soit tranché par le défenseur humain — si le Titan
  suivant dans l'ordre était lui aussi une IA, son propre tour (mouvement,
  carte, récupération) démarrait pendant que le joueur avait encore une
  décision bloquante à l'écran. Même garde-fou que l'effet d'avancement de
  Phase, qui protégeait déjà la transition Action→Repos mais pas
  l'enchaînement d'un Titan IA au suivant.

Deux points vérifiés sans bug trouvé :

- **La dégression d'énergie par case parcourue** est correcte partout où
  elle a été tracée en détail (y compris un cas où l'enquête a d'abord cru
  trouver un bug, avant de découvrir que c'était une erreur dans le script
  de vérification, pas dans le moteur). Confirmé par Nikola : la case de
  collision elle-même (le mur qu'on percute) ne coûte pas d'énergie
  supplémentaire, seules les cases réellement traversées avant comptent.
- **La distance de saut Boing Boing F1→A4** reste sans repro exploitable
  (pas d'état de plateau exact disponible). Le nouveau système de chemin
  cliqué case par case (cf. quatrième passe) rend ce genre de défaut
  immédiatement visible et signalable avec précision au prochain test, si
  le défaut persiste.

## Non publié — quatrième passe du 2026-08-18 (test à la table)

Fonctionnalité :

- **Boing Boing : chemin tracé case par case**, au lieu d'un clic unique sur
  la destination qui laissait le moteur choisir sa propre trajectoire sans
  jamais la montrer. Le joueur clique désormais chaque case adjacente de son
  trajet ; la même règle de coût que le calcul automatique (0 entre deux
  obstacles collés, 1 sinon) s'applique à chaque clic. Recliquer une case
  déjà posée y revient. Un bâtiment encore debout se traverse en vol mais ne
  peut pas être validé comme atterrissage.

Corrections et clarifications de ce même test, certaines tranchées après
question posée à Nikola :

- **Le survol des cartes programmées ne dépend plus que d'une seule règle :**
  son propre Titan, toujours ; les autres, jamais. Une première lecture
  avait ajouté une exception pendant l'inter-tour (entre la carte jouée et
  le clic sur « Titan suivant »), pensant fermer une fuite qui n'existe pas
  réellement à ce moment (`activePlayerId` ne change qu'AU clic). Confirmé
  par Nikola : la règle simple, sans exception, est la bonne.
- **Le badge Énergie/Seuil 4 suit la carte réellement ouverte** (Tout Casser,
  Tête en Avant ou Boing Boing) au lieu de rester câblé sur Tout Casser en
  permanence — il ne suivait donc jamais les boutons +/- des deux autres
  cartes.
- **Le classement provisoire (en cours de partie) a été retiré** : le
  tableau détaillé donne déjà les totaux, et sa ligne TOTAL porte désormais
  elle-même une médaille pour le meilleur score. Le classement complet
  (rang, médaille, départage du livret) ne reste qu'en fin de partie, où il
  a un enjeu réel.
- **Les panneaux DIL/RAGE, Faut Pas Me Chauffer et Vol Phase Repos affichent
  l'icône du Titan et son nom choisi**, plutôt que « T1 »/« T3 » en toutes
  lettres ou un ID nu à côté d'une icône déjà posée.
- **Vérifié, sans changement de code nécessaire :** un débris qui pousse un
  Titan dans un bâtiment sous le Seuil 4 le pose déjà correctement sur une
  case adjacente au choix de l'initiateur — corrigé par le retrait des
  rebonds plus tôt dans la session. Un script direct sur le moteur confirme
  le comportement attendu.

Trois retours restent sans code changé, faute d'avoir pu reproduire le bug
en lisant le moteur — repro plus précise nécessaire au prochain test :

- Un Seuil 4 qui se déclencherait avec l'énergie de départ d'une carte au
  lieu de l'énergie réellement restante après plusieurs cases parcourues.
  Tous les points de vérification trouvés (Tout Casser, Tête en Avant,
  Boing Boing, chaînes de ricochet dans `projectInDirection`) dégressent
  correctement l'énergie au fil du trajet.
- Un DIL tranché, le bloc perdu tombé sur la case de l'attaquant, sans que
  le panneau Ramasser ni « Titan suivant » ne s'affichent. `recupPool`
  inclut bien la case du Titan dans son propre Périmètre, et le mécanisme
  Graouhhh ajouté cette session (`advanceGraouhhhLoop`) ne se déclenche que
  si la décision porte le champ `graouhhh`, absent sur un DIL classique.
- Une distance de saut F1→A4 jugée excessive sur Boing Boing. Le mécanisme
  des « obstacles collés = 1 seule case » (déjà validé par Nikola le
  2026-08-17) peut légitimement produire un grand saut Chebyshev avec une
  portée nominale de 3 s'il y a une chaîne d'obstacles contigus sur le
  chemin — impossible à confirmer sans l'état du plateau à ce moment précis.

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
