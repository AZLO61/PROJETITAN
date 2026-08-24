# Changelog

## Non publié — treizième passe du 2026-08-24 (9 retours supplémentaires)

Nikola continue de jouer et revient avec 9 points de plus, dont une réponse à
une question posée en retour : la partie était bien encore jouable à 4/25
bâtiments en Manche 4 (le déclenchement ne s'est donc pas fait au milieu d'un
tour — reste à vérifier ce qui se passe à la frontière de Manche suivante).

### Traités

- **Icônes "qui on attend" fusionnées** avec la ligne Manche/Détonateur/
  Bâtiments du panneau de stock — une seule ligne au lieu de deux.
- **Bug de fond, Lanterne Rouge de Je Ne Partage Pas** : « j'étais Lanterne
  Rouge, bien indiqué, mais je n'ai pas pu prendre mon 3e bloc. » Le compte à
  ramasser était recalculé EN DIRECT à chaque bloc pris — or chaque bloc
  ramassé grossit le Repaire de l'acteur, exactement ce qui détermine la
  Lanterne Rouge. Dès le 2e bloc, elle pouvait s'éteindre d'elle-même et le
  3e devenait injouable en plein ramassage. Figé à l'engagement de la carte,
  comme le recul de Graouhhh ou les cibles de FPMC. Verrouillé par un test.

### Vérifié par reproduction directe, comportement déjà correct

- **Ramassage après un DIL tranché** : reproduit précisément le scénario
  décrit (charge sur un Titan qui cohabitait avec un débris, DIL résolu) —
  le débris reste ramassable, `canUseRecupPassif` et `recupPool` sont
  corrects juste après la résolution. Si le panneau ne s'affiche vraiment
  pas à la table, la cause est ailleurs (rendu, timing d'une animation) et
  demande une reproduction encore plus précise.
- **Boing Boing, poussée d'un Titan hors du plateau** : reproduit un push de
  3 cases depuis H8 plein sud (hors plateau dès le 2e pas) — l'occupant est
  bien éjecté (`horsPlateau: true`), et le journal confirme même que
  l'attaquant « prend la place » du Titan pour Boing Boing spécifiquement.

### Traité après confirmation de Nikola

- **Tête en Avant, "on prend sa place"** : confirmé — comme Boing Boing le
  fait déjà en sautant sur un Titan, une charge qui percute un adversaire
  avance désormais jusqu'à la case que la cible vient de quitter, au lieu de
  s'arrêter juste avant comme contre un mur. Le garde-fou anti-superposition
  (recul sur son propre chemin si la cible n'a pas pu bouger) est conservé,
  juste déclenché sur la bonne case.

### Ouvert, faute de repro exacte ou en attente d'un arbitrage

- **Choix de couleur en 3D** : le Périmètre (couleur du Titan) et les cases
  de déplacement peuvent être visuellement identiques — `TITAN_RING_COLOR`
  du Titan 1 (`0x71dbff`) est EXACTEMENT la couleur utilisée pour les cases
  de déplacement en 3D, et il y a la même collision entre le Titan 3 (vert)
  et les cases de Boing Boing/Je Ne Partage Pas, et le Titan 2 (orange) et
  Tête en Avant/Repli/Écroulement. Nikola garde la main sur la direction
  artistique : pas de changement de couleur sans son feu vert.
- **Bagarre de Tout Casser sur un Titan qui cohabitait avec un débris** :
  le sous-cas Titan crédite la Bagarre uniquement si la cible a RÉELLEMENT
  bougé (ruling du 15 août) — a-t-elle bougé, ou est-ce le débris cohabitant
  qui a été projeté à sa place (sous-cas Blocs, indépendant) ?
- **Repli d'un débris : cases proposées incohérentes avec l'obstacle
  annoncé** (G8/H7/H8 proposées, alors que l'obstacle touché semble avoir
  été un bâtiment en I9, ce qui donnerait H9/H8/I8). Signe possible d'un
  rebond intermédiaire non recalculé. Repro plus précise nécessaire (carte
  jouée, position de départ, direction).
- **2 combats Faut Pas Me Chauffer gagnés au même tour → 1 seul point de
  Bagarre** : chaque victoire incrémente indépendamment `attacker.bagarre`.
  La cible du second combat a-t-elle vraiment été déplacée ?
- **Fin de partie à 4/25 bâtiments** : confirmé encore jouable en cours de
  Manche (normal, le livret dit "jamais en plein tour"). Reste à vérifier
  si le seuil configuré était bien atteint et si la partie s'est arrêtée à
  la frontière de Manche suivante.

## Non publié — douzième passe du 2026-08-24 (liste de 14 retours)

Nikola arrive avec une liste de 14 points. Huit sont des demandes d'interface
et corrections de fond traitées directement ; deux (projection de Tout Casser
en fonction du Périmètre, recul de Graouhhh en nombre de Titans+1) étaient déjà
conformes, vérifiés dans le code sans rien changer ; les quatre restants
(défausse/Tout Casser qui semblent sauter le Ramassage, Bagarre de Faut Pas Me
Chauffer, déclenchement de fin de partie) demandent soit un arbitrage de
Nikola, soit une reproduction plus précise — aucun défaut de code n'a pu être
confirmé à la lecture pour ceux-là, et un test de non-régression existant
(`defausse-passif.test.jsx`) couvre déjà le scénario le plus proche de la
défausse sans échouer.

### Rentrée par un coin bloqué : le choix revient au joueur

« Je sors de I1 je rentre en A9, si bâtiment [...] alors A8 ou B9, c'est moi
qui décide. » Un coin appartient à deux rebords, et ses deux voisins immédiats
(un par rebord) sont à égale distance : `rentrerEnJeu` les départageait
arbitrairement (toujours celui de la colonne). Question posée en retour :
le choix se fait-il à l'expulsion ou à la rentrée réelle ? Réponse de
Nikola : à la rentrée réelle, le plateau pouvant changer entre-temps (le
bâtiment qui bloquait le coin peut tomber avant que le Titan rejoue).

Quand les DEUX voisins sont libres, la fonction ne tranche plus : elle
retourne `needsChoice` avec les deux options, et un nouveau bandeau
(`CornerChoiceBanner`) les propose au joueur, sur le même principe que DIL,
Repli et FPMC — rien d'autre n'avance tant que ce n'est pas choisi. Une IA
tranche seule (les deux options sont strictement équivalentes). Si un seul
voisin est libre, ou si la sortie n'est pas un coin, rien ne change — pas de
choix fictif là où il n'y en a pas de réel.

### Traités

- **"Titan X joue" retiré** : redondant avec la surbrillance de l'encart actif
  dans `TitanResourceBand`.
- **"Ordre du tour" n'est plus écrit**, et les icônes sous "Bâtiments · seuil"
  sont plafonnées à 2 lignes.
- **Bug de fond, aperçu Tout Casser** : le badge Énergie/Seuil du panneau
  appelait `computeEnergyToutCasser` sans son 5ᵉ paramètre `looseBlocks` — il
  ignorait donc les débris et Socles au sol dans l'AFFICHAGE, contrairement à
  la résolution réelle qui les comptait déjà depuis la onzième passe. D'où le
  "seuil affiché à 3" alors que l'effet de Seuil 4 s'appliquait correctement.
- **Panneau "Dernière Manche" séparé retiré** : l'information vit uniquement
  dans le panneau de stock, comme demandé le 19 août.
- **IA en DIL** : elle ne pesait que la perte infligée au défenseur. Elle
  compare désormais aussi ce qu'ELLE gagne, sur les cartes dont le bloc perdu
  rejoint son propre Repaire (Faut Pas Me Chauffer, cf. `DESTINATION_BLOC_PERDU`).
  Corrige au passage un oubli du modèle simplifié de l'IA : ce bloc n'était
  jamais crédité à l'attaquant dans sa simulation interne.
- **Classement final fusionné** dans la ligne TOTAL du tableau de scoring —
  médailles 🥇🥈🥉 au lieu du bloc de classement séparé (départage du livret
  inchangé, juste plus de bloc dédié).
- **Survol d'un bâtiment : 2 s → 1 s.**

### Déjà conformes, vérifiés sans rien changer

- Tout Casser projette déjà ses blocs cassés sur une distance égale à
  l'énergie (= cases occupées du Périmètre, cf. `computeEnergyToutCasser`).
- Graouhhh recule déjà les Titans touchés de `nombre de Titans touchés + 1`
  (`reculDistance`, `scanGraouhhhAxis`).

### Ce qui reste ouvert, dit franchement

- **Défausse et Tout Casser qui sembleraient sauter le Ramassage** : le test
  `defausse-passif.test.jsx` verrouille déjà le cas générique et passe.
  Aucune anomalie retrouvée à la lecture de `advanceActionRound` /
  `canUseRecupPassif` / `recupPool`. Faute de repro précise (quelle carte,
  décision DIL/RAGE en attente ou non), non reproduit.
- **2 combats Faut Pas Me Chauffer gagnés au même tour → 1 seul point de
  Bagarre au lieu de 2** : chaque victoire incrémente indépendamment
  `attacker.bagarre` dans `resolveFautPasMeChauffer`. Piste à vérifier : la
  cible du second combat a-t-elle réellement été déplacée (une bagarre non
  remportée ne rapporte rien, ruling du 15 août) ?
- **Fin de partie à 4/25 bâtiments qui ne s'est pas comportée comme prévu**
  en Manche 4 : le déclenchement (`checkEndGameTriggers`) n'agit qu'à la
  frontière de Manche (`advanceManche`), jamais en plein tour, conformément
  au livret. Le détail de ce qui a été observé (partie arrêtée trop tôt ? pas
  arrêtée du tout ?) manque pour confirmer un défaut.

## Non publié — onzième passe du 2026-08-19 (3 parties de Nikola, 15 retours)

Nikola joue trois parties et remonte quinze points. Trois d'entre eux ont
d'abord demandé un arbitrage de sa part, posé carte par carte comme il l'a
souhaité : distance de projection, sort du bloc cassé en chaîne, panneau de
choix au ramassage.

### La régression du figeage, d'abord

« Un énorme bug : quand un titan a joué sa carte ça ne passe pas au suivant,
ça fige dès la première action. » C'était une régression introduite le matin
même, documentée dans son propre paragraphe du changelog précédent.

### Ce que trois parties ont trouvé que 345 tests ne voyaient pas

**L'énergie de Tout Casser était fausse.** Le livret dit « nombre de cases
OCCUPÉES dans ton Périmètre », mais les blocs libres au sol n'étaient pas
comptés : seuls les bâtiments et les Titans l'étaient. Sur le cas de Nikola,
l'énergie sortait à 2 là où il en attendait 5. Une case qui porte un débris est
occupée, c'est même le cas le plus courant en fin de Manche.

**La cible d'une charge ne bougeait pas sous le Seuil 4.** « Les cibles
impactées ne se sont pas déplacées même en DIL. » Le Seuil 4 ne décide plus que
de RAGE contre DIL ; le déplacement, lui, a toujours lieu, avec l'énergie
restante. Le moteur faisait déjà ainsi dans ses réactions en chaîne : les deux
lectures divergeaient depuis le début.

**Boing Boing laissait sauter à l'infini.** Un obstacle coûtait 0 et pouvait
recevoir l'atterrissage : de débris en débris, on traversait le plateau sans
entamer son budget. Une règle unique remplace tout : se poser coûte 1, quoi que
porte la case ; les obstacles ne sont gratuits que survolés. Le groupe collé
vaut donc toujours 1 case comme au livret, puisqu'on ne paie que l'arrivée. Et
c'est ce qui permet aussi de « sauter par-dessus un débris ou dessus
volontairement » : les deux cases sont proposées, au même prix.

**Je Ne Partage Pas se sabotait.** Chaque case vidée déplaçait le Titan
immédiatement, ce qui rétrécissait son Périmètre et rendait la deuxième case
inatteignable — alors que la carte est faite pour piocher à plusieurs endroits.
Un seul déplacement désormais, à la fin, sur la dernière case choisie.

**Le bloc cassé par ricochet ne demandait rien.** Il part maintenant où
l'attaquant veut, parmi les cases autour du bâtiment touché, celle d'un Titan
comprise — « j'aurais aimé le mettre en A2 pour le faire sortir ».

### Un bug qui n'en était pas un : le jeu mentait

« J'ai fait tout casser sur un titan qui a déclenché un RAGE mais il n'a pas été
déplacé, il aurait dû taper dans un bâtiment juste après. » Il L'AVAIT tapé et
cassé un bloc, mais le bâtiment tenait encore, donc il restait sur place. Le
journal affichait « déplacé en E6 » alors qu'il était déjà en E6. Ce qui
ressemblait à un bug n'était qu'un silence, et le journal le dit maintenant.

### Deux points vérifiés, déjà conformes

Graouhhh projette déjà de « nombre de Titans touchés + 1 », et un Titan pousse
bien un débris même quand c'est le second de la chaîne qui le rencontre : test
à l'appui, ils finissent voisins et non superposés. Aucun code touché.

### L'interface

Survol d'un bâtiment après 2 secondes d'arrêt volontaire, le clic restant
immédiat. Numéros de saut 1, 2, 3 sur les cases posées, effacés avec la carte.
Panneau de consigne supprimé. Coches de validation rapatriées dans le panneau
de stock, à droite sous « Bâtiments seuil », dans l'ordre d'initiative de la
Manche. Information « dernière Manche » au même endroit, sans panneau
supplémentaire.

### Ce qui reste ouvert, dit franchement

- **Boing Boing sur un Socle** : non reproduit. Socle et débris se comportent à
  l'identique côté moteur, ramassage et pool de récupération compris.
- **Panneau de choix de bloc après un Boing Boing sur un tas** : demande à
  préciser, un tas de 2 blocs ou plus est un Amas et déclenche un écroulement,
  pas un ramassage.
- **Faut Pas Me Chauffer** : l'IA mise enfin de l'Adrénaline, mais l'usage de la
  carte passe de 9,0 % à 9,1 % sur 100 parties. Son manque d'attrait vient
  d'ailleurs.

### Vérifications

Audit, lint, **346 tests** et build au vert. Diagnostic d'invariants sans défaut
sur 200 parties.


## Non publié — dixième passe du 2026-08-19 (liste de retours de Nikola)

Nikola arrive avec une liste structurée de 19 points : bugs systémiques, règles
dont deux marquées **WIP**, équilibrage des IA, et interface. Cette passe en
solde une première partie. Les points restants sont listés en fin de section,
avec les deux arbitrages qui lui reviennent.

### Un rouge préexistant, et le test avait tort

`npm run check` n'était pas au vert au départ : le test de séquençage Graouhhh
joué par une IA échouait en suite complète et passait isolé. C'est le motif déjà
rencontré le 18 août, mais la cause était nouvelle et le correctif de la veille
ne l'avait pas atteinte.

Le test posait `passifUsed` dans le MÊME `act()` que `setActivePlayerId`. Or un
effet sur `activePlayerId` réarme `move: false` à l'ouverture du tour de chaque
Titan — c'est la règle voulue, le Mouvement gratuit revient à chaque tour. Le
réglage du test était donc systématiquement écrasé, l'IA se déplaçait avant de
jouer, et l'axe de tir n'était plus celui que le test avait préparé. Il ne
passait alors que si l'IA atterrissait par chance sur un axe contenant encore
une cible.

Mesuré sur 12 graines : vert 10 fois sur 12 en isolé, rouge en suite complète où
le plateau tiré n'est pas le même. Après correctif, 12 graines sur 12 donnent le
même résultat. **Aucun code de production n'était en cause.**

### L'Adrénaline vaut 2 points, et la valeur ne vit plus qu'à une source

Ruling : l'Adrénaline conservée rapporte 2 points de victoire au décompte, au
lieu de 3. Elle était trop rentable à garder, ce qui décourageait de la dépenser.

La valeur vivait à **deux endroits dans le code** : le calcul du décompte final
et l'étalon `VALEUR_ADRENALINE` du planificateur d'IA, qui arbitre entre payer
une Adrénaline et encaisser la perte. Baisser l'un sans l'autre aurait laissé
l'IA jouer sur un barème inexistant. Les deux partagent désormais la constante
exportée `POINTS_PAR_ADRENALINE`.

C'est aussi ce qui règle le point « réduire la conservation d'Adrénaline par les
IA » : l'étalon baissant, l'IA paie plus volontiers et en garde moins. Aucun
réglage séparé n'a été nécessaire.

Un test vérifie que les **quatre** emplacements annoncent la même valeur
(moteur, étalon d'IA, règles affichées, livret) et que le code ne contient plus
de nombre en dur. Le lexique de l'application ne chiffrait pas du tout
l'Adrénaline : un joueur ne pouvait pas savoir qu'elle rapportait des points.

### Le Vert ne valait rien pour l'IA, et ce n'était pas un poids

Demande : « augmenter l'attrait pour la couleur Verte dans l'attribution des
récompenses des cerveaux IA ». Ce n'était pas un réglage de poids mais un
**trou** : `gainMarginal` retournait 0 pour le Vert, absent du compteur de
couleurs du Repaire. Un bloc Vert au sol valait littéralement zéro et aucune IA
n'avait la moindre raison d'aller le chercher, alors que c'est un joker valant,
au décompte, la meilleure case disponible.

Il est désormais valorisé à ce qu'il est : le meilleur gain marginal du moment,
majoré de sa valeur d'option (`ATTRAIT_VERT` = 1,3). Vérification : un Vert
reste attractif là où le Bleu saturé ne vaut plus rien, ce qui est le
comportement attendu d'un joker.

Mesure sur 2 séries de 60 parties, tempérament Collectionneur :

| | avant | après |
|---|---|---|
| Novice, score moyen | 25,76 | 26,16 |
| Novice, ratio / Expert | 60,7 % | 63,3 % |
| Confirmé, score moyen | 31,20 | 30,36 |

Le script de mesure sait maintenant cibler un tempérament
(`node scripts/mesure-forces.mjs 60 collectionneur`) : il était figé sur
Opportuniste, donc incapable de répondre à une demande portant sur le
Collectionneur.

### Ramassage : deux débris sur une même case, et résolution séquentielle

**Le bug (point 1.7).** Je Ne Partage Pas exigeait des cases DISTINCTES :
cliquer deux fois la même case la désélectionnait, donc une case portant deux
débris ne pouvait pas être vidée par la carte. Rien dans la règle ne
l'interdisait.

**La règle (point 2.1, WIP).** Le ramassage se résout élément par élément : dès
qu'un débris est choisi, le Titan s'y déplace si la case se vide, et les débris
suivants doivent être à portée depuis CETTE nouvelle position. Conséquence
assumée, et c'est la partie WIP : des débris du Périmètre de départ peuvent
devenir inaccessibles. Le revers est vrai aussi, et il est testé : en avançant,
le Titan atteint des cases qui n'étaient pas à sa portée au départ.

Le clic ne coche donc plus une case en attendant une validation globale, il
ramasse pour de bon. Un bouton « Terminer » clôture une carte qu'on ne peut plus
finir faute de débris à portée : sans lui, un Titan sans voisin après son
déplacement se retrouvait devant un panneau sans issue, exactement le blocage
rencontré trois fois le 18 août.

Une seule fonction porte la règle, appelée élément par élément : le wrapper la
boucle pour l'IA et les tests, l'interface l'appelle à chaque clic. L'humain et
l'IA ne peuvent pas jouer deux règles différentes.

### Cohabitation avec un débris (WIP), et une règle qui vivait à quatre endroits

Ruling WIP : un Titan se déplace volontairement sur une case portant un débris,
s'y arrête et la traverse, sans condition, et sans le ramasser. Avant, un bloc
Vert encore au sol bloquait l'arrêt.

La condition était **recopiée à quatre endroits** avec le même commentaire
dupliqué. Elle ne vit plus que dans `elementAuSolBloqueArret`, avec l'ancienne
ligne conservée en commentaire juste à côté : revenir en arrière coûte une ligne,
ce qui est la condition pour qu'un WIP reste réellement réversible.

Le livret n'interdisait déjà pas les débris, il ne parlait que des Titans et des
bâtiments : le code était donc plus restrictif que la règle écrite. Livret et
règles affichées le disent maintenant explicitement.

### Un invariant qu'une fonction exportée ne défendait pas

Trouvé en écrivant les tests de cohabitation : `resolveFreeMovement` ne
vérifiait pas qu'un autre Titan occupait la case de destination, alors que
`deplacerVersCaseLiberee`, dans le même fichier, le faisait déjà. En pratique
l'interface ne propose que des cases de `getMovementReachable`, qui écarte les
cases occupées, donc le défaut n'était pas atteignable en jeu, mais une fonction
exportée qui peut casser un invariant du jeu doit le refuser elle-même. Les deux
disent maintenant la même chose.

### Le lissage des niveaux d'IA

Nikola, après lecture des mesures : « lisse les niveaux des IA pour avoir un
peu d'écart entre les niveaux mais il faut un moins grand gap entre eux ».

Deux problèmes mesurés au départ, tempérament Collectionneur, 2 séries de 60
parties : le Novice plafonnait à **63 %** du score de l'Expert, et le Confirmé
**battait** l'Expert (104 à 106 %) — la hiérarchie était inversée.

**L'inversion venait de la nuisance.** L'évaluation différentielle, réservée à
l'Expert, lui fait maximiser son avance plutôt que son score. Elle était
appliquée au même poids quel que soit son tempérament : un Expert
Collectionneur dépensait donc ses tours à gêner les autres alors que son barème
ne le paie pas. Gêner un adversaire est une action de la famille ADN, elle est
désormais pondérée par le tempérament. Un Agressif (adn 1,5) nuit plus qu'avant,
un Collectionneur (adn 0,7) nettement moins, un Opportuniste (adn 1,0)
exactement comme avant.

**Le Novice garde son vrai handicap.** Il ne voit toujours ni le score complet
ni les adversaires — c'est l'erreur du débutant et ça doit rester sa signature.
Ce qui a changé : il perçoit une PART des bonus de fin (`visionBonus`, réglé à
0,25 après trois mesures), sa fenêtre de tirage passe de 3 coups à 2 avec un
biais plus fort, et son rayon de vision passe de 2 à 3 cases comme les autres.
Un débutant voit le plateau, il le lit moins bien.

Réglage de `visionBonus` par la mesure, pas au jugé : à 0,5 le Novice atteignait
95 % et devenait indiscernable du Confirmé ; à 0 il retombait à 72 %.

Résultat, 2 séries de 60 parties par tempérament :

| | avant | après |
|---|---|---|
| Novice Collectionneur | 63 % | ~87 % |
| Confirmé Collectionneur | 104-107 % (inversé) | ~96 % |
| Novice Opportuniste | — | ~83 % |
| Confirmé Opportuniste | — | ~98 % |

Progression monotone dans les deux tempéraments, écarts resserrés.

Trois tests décrivaient l'ancien réglage et ont été alignés. Ils disent
maintenant ce qui doit rester vrai plutôt que les valeurs d'hier : le Novice se
trompe encore (son second choix sort réellement, le troisième n'existe plus), et
il reste sous le Confirmé.

### Les sept bugs restants

**1.2 + 1.5 + 1.8 — une seule cause pour trois symptômes.** « Le jeu passe
directement au tour suivant après un déplacement suivi d'un DIL », « le saut sur
un Amas verrouille le ramassage et finit le tour », et le désengagement qui
bloque le passif. `markCardPlayed` appelait `advanceActionRound` dès que la carte
quittait la main, sans attendre que ce qu'elle avait déclenché soit résolu : DIL
à trancher, repli à placer, Amas à répartir. Le tour basculait donc pendant que
le joueur avait encore une décision devant lui, et son passif Récupération
passait à la trappe — « j'ai fait le dil c'est passé au joueur suivant
automatiquement, je n'ai pas pu ramasser le bloc tombé au sol ». Le garde-fou
existait déjà pour l'IA (`finishAiTurn`), pas pour le joueur humain.
L'avancement est désormais mis en attente et ne part que lorsque plus aucune
résolution n'est ouverte.

**1.1 — le placement du Titan coincé devient un choix.** C'était le dernier
placement automatique du jeu, signalé par un TODO dans le code. Aucun mécanisme
neuf : c'est le même choix géométrique que le REPLI, qui a déjà sa file, son
bandeau, son surlignage sur le plateau, sa résolution automatique quand
l'initiateur est une IA, et son instantané d'annulation.

**1.3 — portée du saut et cases cibles.** Deux défauts pour un seul calcul. Un
bâtiment debout était cliquable comme étape ET comme destination, alors qu'on ne
s'y arrête jamais. Pire, un obstacle coûte 0 (saute-mouton) : en cliquant de
bâtiment en bâtiment, on traversait le plateau sans jamais entamer son budget.
On propose désormais « directement la case d'atterrissage située immédiatement
derrière selon l'angle de percussion », et le trajet complet entre dans le
chemin pour rester lisible à la table.

Le test de tracé du 17 août validait l'ancien comportement, celui où l'on
cliquait les cases du groupe collé une à une. Il a été réécrit : ce qui ne
change pas, et qu'il vérifie toujours, c'est le COÛT — le groupe collé compte
pour 1 case, exactement comme le livret V36.2 le décrit. Seul le nombre de clics
change.

**1.4 — projection sur double charge.** Le second bloc partait en `-dr, -dc`,
à contre-sens de la charge : il revenait sur la case de l'attaquant au lieu
d'être expulsé. Il part maintenant dans l'axe de percussion, ce que dit aussi la
physique de la carte. **À signaler à Nikola** : les blocs d'un AMAS balayé au
Seuil 4 partent eux aussi à contre-sens, quelques lignes plus bas. Il n'a pas
demandé ce cas, il n'a pas été touché.

**1.6 — cartes jouées hors-champ.** Un Titan sorti du plateau pouvait jouer ses
cartes, qui s'appliquaient dans le vide. Il rentre à l'ouverture de SON tour,
mais il peut être éjecté PENDANT son propre tour, par une réaction en chaîne ou
un repli offensif : c'est là que le trou s'ouvrait. La défausse reste possible
via `canDiscardCard`, sans quoi un Titan éjecté ne pourrait ni jouer ni
défausser et la partie se bloquerait — exactement le genre de panneau sans issue
rencontré trois fois le 18 août.

### L'interface

**4.1 — ordre du tour.** L'encart affichait `ordreJeu`, l'ordre figé de la
partie, alors qu'une manche commence au Détonateur. L'en-tête annonçait donc un
ordre que la table ne jouait pas. La liste est pivotée sur le Détonateur, qui
porte son propre repérage.

**4.2 — fiches bâtiments au clic.** Déjà au clic en 2D, mais la 3D ne passe
aucun élément DOM : la fiche ne s'ouvrait jamais depuis le plateau 3D, alors que
c'est le même aiguilleur de clic.

**4.3 — les « + » du scoring.** La ligne affichait « 3 → 5 (+2) » : trois
nombres côte à côte dont deux comptent des choses différentes et le troisième un
gain hypothétique, au moment précis où l'on place ses Verts. Le gain marginal
reste dans l'infobulle, où il est expliqué au lieu d'être juxtaposé.

**4.3 — menu déroulant à la charte.** Le placement des Verts se faisait avec des
`<select>` NATIFS : sur Windows, le système dessine sa propre liste, fond blanc
et police système, qu'aucun CSS ne peut atteindre. Sur le fond violet du
décompte, l'effet était celui d'une boîte de dialogue étrangère au jeu. Le menu
est désormais dessiné par l'application, aux couleurs déjà en place, et garde le
comportement d'un select : fermeture au clic extérieur et à Échap, option
désactivée non cliquable.

**4.4 — plateau consultable après le scoring.** Tout était masqué derrière le
décompte depuis le 17 août. À la table, on veut au contraire pouvoir revenir au
plateau pour comprendre le score ou montrer une position. Il revient sous le
décompte, en consultation seule.

**4.5 — badge Arc-en-ciel.** Le trophée était annoncé une fois au journal puis
n'apparaissait plus avant le décompte final. Personne ne se souvient qui l'a
pris trois manches plus tôt, alors que c'est 5 points et que ça ne se reprend
pas.

**4.6 — panneau redondant supprimé.** La validation de phase vivait dans un bloc
à part, qui répétait le nom de la phase et l'état de validation déjà affichés en
haut de page, et posait son bouton loin des coches qu'il modifie.

### Vérifié sur l'application construite, pas seulement en test

Une partie pilotée dans un Chromium headless a servi à contrôler ce que la table
verra : l'ordre du tour commence bien par le Détonateur, et le bouton de
validation est fusionné dans l'en-tête. C'est aussi ce qui a permis d'écarter
une fausse alerte — le panneau des cartes semblait avoir disparu, il était
simplement conditionné à la sélection d'un Titan, comme avant.

### Une régression que j'ai créée, et pourquoi les tests ne l'ont pas vue

Nikola, quelques minutes après la livraison : « j'ai un énorme bug, quand un
titan a joué sa carte ça ne passe pas au suivant donc ça fige dès la première
action ».

**La cause.** `markCardPlayed` appelait `advanceActionRound` de façon
SYNCHRONE, et `finishAiTurn` lit `aiNextPlayerRef.current` dès le retour de cet
appel pour donner la main au Titan suivant. L'invariante était écrite juste
au-dessus, en toutes lettres : « advanceActionRound étant désormais 100 %
synchrone, aiNextPlayerRef.current est fiable dès le retour de markCardPlayed ».
Différer l'avancement dans un effet React faisait lire une ref encore vide.

Mesuré dans les deux sens : avec le code fautif, 1 carte jouée puis plus rien,
le même Titan restant actif indéfiniment. Après correctif, 10 cartes et les
quatre Titans qui alternent.

**Pourquoi 334 tests n'ont rien vu.** Aucun ne vérifiait que la partie TOURNE.
Ils vérifiaient tous des règles, sur des états posés à la main, avec un seul
coup joué. `partie-ia-avance.test.jsx` comble ce trou : quatre IA, la partie
doit se dérouler seule sur une trentaine de tours, et aucun Titan ne doit rester
bloqué. C'est un filet de vie, pas un test de règle — la catégorie qui manquait.

**Et le point 1.2 dans tout ça.** Mon premier test visait la mauvaise cible : il
exigeait que `waitingNextTitan` reste faux pendant un Dilemme, et j'ai modifié
le code pour satisfaire ce test. Or `waitingNextTitan` ne veut pas dire « le
tour est fini » mais « la carte du round est jouée ». Ce qui décide de ce que le
joueur peut encore faire, c'est `decisionBloquante`, que BoardPanel consultait
**déjà correctement** pour masquer le ramassage et « Titan suivant » tant qu'une
résolution est ouverte. Le mécanisme demandé existait donc avant que j'y touche.

**Leçon, à garder :** avant de modifier un rouage central, lire le commentaire
qui l'entoure. Celui-ci disait exactement ce que j'allais casser. Et un test qui
force à changer un rouage interne doit faire suspecter le test, pas le rouage.

### La logique de charge, partout

Il restait une projection à contre-sens : les blocs d'un Amas balayé au Seuil 4.
Un Titan qui défonçait un Amas se le renvoyait dessus. C'est le cas signalé le
matin même comme restant à arbitrer, et Nikola a tranché : « applique la logique
de charge pour tout ». Tout ce qu'une charge percute part désormais devant, dans
l'axe de percussion. Un test vérifie qu'aucune projection à contre-sens ne
subsiste dans le code.

### Le survol des bâtiments

Il affichait l'infobulle NATIVE du navigateur (`title`) : rectangle gris, police
système, délai d'apparition. Rien à voir avec la fiche du clic. Deux visuels pour
la même information. Le survol ouvre maintenant la même fiche, sans le voile
plein écran qui rendrait le plateau injouable à la souris.

### La barre « M2 · 3 · Programmation », supprimée

Elle affichait trois choses, toutes redites ailleurs : le numéro de Manche (déjà
dans la barre de stock), le nom de la Phase (déjà dans la consigne du moment,
qui explique en plus quoi faire), et les coches de validation, qui n'avaient rien
à faire loin des Titans. Les coches et le bouton Valider sont maintenant sur
l'encart de chaque Titan.

C'est le deuxième passage sur ce panneau : la veille, la demande avait été lue
comme « fusionner » alors qu'elle disait « supprimer ».

### Ce qui reste de la liste

Rien. Les 19 points sont traités.

Deux remarques a signaler, hors perimetre demande :

1. Les blocs d'un **Amas balaye au Seuil 4** par une charge partent a
   contre-sens, comme le faisait le second bloc d'un batiment avant le point
   1.4. Nikola n'a pas demande ce cas, il n'a pas ete touche.
2. Le **Confirme Opportuniste** est a 98 % de l'Expert, tres pres. C'est le
   sens du lissage demande, mais l'ecart entre ces deux niveaux est desormais
   mince sur ce temperament.

### Vérifications

Audit, lint, **339 tests** et build au vert. Diagnostic d'invariants sans défaut
sur 1100 parties supplémentaires, à 3 et à 4 Titans. Interface contrôlée sur
l'application réellement construite, dans un navigateur, y compris le
déroulement d'une partie complète à quatre IA.


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

### Les points laissés ouverts, repris dans la foulée

Nikola ayant demandé de tout solder, les deux points ci-dessus ont été
traités juste après — plus trois autres qui traînaient de longue date.

- **Graouhhh joué par une IA** suit maintenant le même chemin que le
  joueur humain (`advanceGraouhhhLoop`), Titan par Titan. L'IA passait par
  le wrapper monolithique `resolveGraouhhh`, qui déplace tous les Titans de
  l'axe d'un coup : une cible humaine voyait ses Titans projetés AVANT
  qu'on lui demande de trancher son Dilemme. Sans le correctif, le test
  trouve la cible déjà en I6 quand son Dilemme s'affiche.
- **Boing Boing sur un Titan totalement coincé : vérifié, ce n'était pas un
  bug.** Le soupçon était que `applied: false` laisse un plateau déjà
  modifié. Script à l'appui sur le vrai résolveur : un Titan qui ne bouge
  pas ne pousse personne, l'empreinte du plateau est identique avant et
  après. Aucun code changé.
- **L'IA vise les Titans avec les débris d'un Amas.** Elle prenait la
  première case venue, alors qu'un débris tombant sur un Titan le projette
  et rapporte +1 Bagarre. Elle laissait filer des points gratuits à chaque
  Amas, et camper à côté d'un tas ne coûtait rien à un humain. Vérifié : 2
  Bagarre au lieu de 1 sur le cas de référence.
- **Le tutoriel du livret est refait sur les chiffres du moteur.** Il
  annonçait une énergie de 3 (en oubliant que la case du Titan compte dans
  son Périmètre) et trois trajectoires calculées à la main du temps des
  rebonds. Rejoué au moteur : l'exemple illustre désormais la Faille et le
  ricochet, et un test le verrouille.
- **Le simulateur ne perd plus une campagne à la dernière ligne.**
  `npm run simulate -- --json simulations/x.json` jouait toutes les parties
  puis mourait sur un ENOENT faute de dossier. Sur 500 parties, un quart
  d'heure de calcul perdu. Les deux `.bat` ont aussi été vérifiés pour de
  bon, point ouvert depuis leur écriture.

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
