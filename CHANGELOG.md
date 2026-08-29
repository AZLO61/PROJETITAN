# Changelog

## Non publié — vingt-troisième passe du 2026-08-30 (jouer à quatre sans être dans la même pièce)

« J'aimerais pouvoir jouer avec des joueurs à distance en donnant un ID de
session et son mot de passe — ça m'évite de mettre le serveur en public, donc je
m'évite énormément d'attaques, car ce sera mes connaissances qui vont me
rejoindre. »

### Ce que l'identifiant et le mot de passe protègent vraiment

Il faut le dire, parce que c'est la prémisse : **un identifiant et un mot de
passe n'évitent pas d'exposer quelque chose**. Les invités doivent bien joindre
un point de rendez-vous. Ce que ce montage change, c'est CE QUI est exposé.

Le relais (`server/relais.mjs`) ne connaît pas les règles de Titan. Pas une
carte, pas un Titan, pas un Seuil. Il garde des salles en mémoire et recopie des
messages — cinq cents lignes qui ne décident de rien. Le moteur, lui, ne quitte
jamais le navigateur de l'hôte, et sa machine n'a aucun port ouvert : un tunnel
Cloudflare appelle vers l'extérieur, jamais l'inverse.

**Aucune dépendance.** Ni `ws`, ni Express. Le transport est du long-polling sur
le module `http` de Node. Pour un jeu au tour par tour, la latence est
invisible, et ce choix supprime trois problèmes d'un coup : aucun `npm install`
sur la machine exposée, aucune chaîne d'approvisionnement à surveiller, et un
trafic qui passe à travers n'importe quel tunnel ou proxy.

Les garde-fous, tous au même endroit : mot de passe haché en `scrypt` et comparé
en temps constant, même réponse pour « salle inconnue » et « mot de passe faux »
(les distinguer offrirait un oracle pour énumérer les salles), dix échecs par
adresse IP puis un quart d'heure d'écart, soixante requêtes par dix secondes,
deux mégaoctets par message, rien sur disque. Vingt tests tiennent ces
propriétés.

### Un arbitre, des manettes

L'hôte fait tourner le moteur exactement comme en local : son contrôleur ne
change pas d'une ligne. Il diffuse un instantané après chaque coup. Les invités
ne calculent rien — ils affichent, et renvoient des intentions.

Ce n'est pas le modèle le plus élégant, c'est le seul honnête avec ce dépôt :
faire tourner cinq mille lignes de règles en double chez quatre joueurs, en
espérant qu'elles restent d'accord manche après manche, c'est signer pour une
classe de bugs qu'on ne referme jamais.

Douze effets du contrôleur se taisent donc chez un invité — enchaînement des
phases, distribution des mains, tours d'IA, mise en place, Trophée Arc-en-ciel.
La garde passe par une ref plutôt que par les tableaux de dépendances : un oubli
aurait laissé un effet tourner avec la valeur du rendu précédent, c'est-à-dire
pendant la seule fenêtre où c'est dangereux.

### Deux extractions qui tombaient sous le sens

`captureSnapshot` faisait deux choses : décrire l'état, et l'empiler pour
« Annuler ». La partie à distance a besoin de la première cent fois plus souvent
que de la seconde — empiler à chaque diffusion aurait fait d'« Annuler » un
bouton qui recule d'un battement de réseau. `instantaneCourant` en sort.

De même, `handleUndo` savait reposer la partie sur un état déjà connu :
`restaurerInstantane` en sort, et un invité s'en sert à chaque coup. Le contenu
ne bouge pas d'une ligne — et c'est le point : tout ce que l'annulation a dû
apprendre à restaurer au fil des bugs est exactement ce qu'un invité doit
recevoir. Écrire une seconde fonction « pour le réseau » aurait garanti qu'elle
prenne du retard.

Deux champs manquaient tout de même, et pour une raison valable : la file de
mise en place et les réglages de table, dont l'annulation n'a jamais eu besoin.
Un invité n'est pas passé par l'écran d'accueil — sans eux, son bandeau de mise
en place restait muet et il affichait quatre Titans humains sans nom sur une
partie qui en compte trois.

### La programmation reste secrète

C'est la propriété la plus facile à perdre à distance, et la plus difficile à
voir disparaître : rien à l'écran ne change quand une main fuit. Le tricheur n'a
même pas à tricher, il ouvre l'onglet Réseau et lit.

L'hôte diffuse donc un plateau PUBLIC, mains remplacées par leur nombre, et
envoie à chaque invité sa seule main par un canal privé que seul l'hôte peut
écrire. Le relais route sans lire : il ne sait pas qu'il transporte des cartes.
Le test qui compte ne vérifie pas des champs un par un — il relit tout ce qui
part sur le fil et y cherche les six noms de cartes.

Les jetons ne sortent jamais de la salle, pas même vers l'hôte : tout se désigne
par une référence courte que le relais seul sait retraduire. L'hôte peut ainsi
adresser un message à un invité sans jamais pouvoir se faire passer pour lui.

### L'hôte prête sa main, le temps d'une action

Presque toutes les actions se jouent pour le Titan sélectionné : `jouerBoingBoing`
lit `selectedTitanId`, `bbDest` et `bbAdrenaline` dans l'état local, et n'accepte
aucun paramètre. Bonne forme pour un appareil qui circule autour d'une table,
mauvaise pour quatre écrans.

Plutôt que de réécrire huit fonctions de soixante lignes, l'hôte adopte la
position de l'invité le temps d'une action, en trois rendus : il bascule sa
sélection, adopte les brouillons transmis (chemin tracé, mise d'Adrénaline),
puis joue — et rend sa sélection. Trois rendus parce que les setters de React ne
prennent effet qu'au suivant : on ne lutte pas contre le cycle de rendu, on s'en
sert comme d'une horloge.

Ce qu'un invité peut demander vit dans une liste BLANCHE, jamais noire : une
action nouvelle est inaccessible à distance jusqu'à ce que quelqu'un l'ajoute
sciemment.

### Vérifié bout en bout

Deux navigateurs, un relais, une table : l'invité voit le même plateau et le même
Détonateur que l'hôte, son tour de mise en place s'allume chez lui, son clic
traverse le relais, l'hôte l'exécute, et le plateau revient identique des deux
côtés. La programmation s'ouvre ensuite avec sa main à lui, et elle seule.

## Non publié — vingt-deuxième passe du 2026-08-29 (la mise en place tient la porte, et les couleurs disent qui fait quoi)

Quatre points relevés par Nikola après une série de parties gagnées neuf fois
sur dix contre des Experts, mais gagnées de peu — « 36, 35, 34, 17 », le lead
pris sur la piste Destruction faisant la différence. Trois sont des questions de
lecture du plateau, le quatrième est un bug de démarrage.

### Rien ne commence avant que les quatre Titans soient posés

« Je ne peux pas choisir mes cartes avant mon placement initial, car là ça a
créé un bug : je ne vois aucun Titan et pourtant ils jouent. »

La mise en place d'ouverture et la Programmation vivaient côte à côte sans se
voir. La mise en place était bien une décision bloquante à l'écran, mais rien ne
l'imposait au moteur : les IA programmaient et validaient leur phase toutes
seules, l'humain pouvait programmer par-dessus le bandeau, et la Phase Action
s'ouvrait dès les quatre validations réunies. Sur un plateau où des Titans
portaient encore `aPlacer` — donc dessinés nulle part, et jouant quand même.

Le verrou vit maintenant dans le moteur de phases, pas seulement dans
l'interface : quatre points s'adossent à la même file `placementRestant` — la
garde de validation, son message, l'effet qui enchaîne les phases et
l'auto-validation des IA. Masquer les cartes aurait caché le symptôme en
laissant l'enchaînement capable de démarrer sans plateau ; les cartes sont donc
masquées EN PLUS, avec un rappel qui dit pourquoi, pas à la place.

Ce que le correctif a révélé au passage : deux tests de la Phase Action ne
passaient que parce que le moteur acceptait de démarrer sur un plateau non
placé. Ils soldent désormais la mise en place par la sortie de secours prévue
pour ça, comme les cinq autres tests qui le faisaient déjà.

### La case de mise en place prend la couleur de celui qui pose

« Pour le placement initial d'un Titan, illumine la case de sa couleur et non
pas le jaune. »

Les quatre Titans posent l'un après l'autre sur le même plateau, et le jaune
générique ne disait pas à qui c'était le tour : l'information vivait uniquement
dans le bandeau, au moment précis où l'œil est sur la grille. La couleur du
Titan la ramène sur la case qu'on s'apprête à cliquer — même opacité qu'avant,
seul le ton change, en 2D comme en 3D.

### La faille empruntée appartient à la traînée de celui qui l'a prise

« Illumine les téléporteurs empruntés par la couleur de traînée du Titan. »

Les deux bouches d'une faille traversée se peignaient du violet générique du
téléporteur — la même teinte que les cases « accessibles par faille » proposées
AVANT le déplacement. Deux informations différentes dans une seule couleur : on
ne lisait plus si le violet disait « tu pourrais passer par là » ou « il vient
de passer par là ». La faille prend donc la couleur du Titan, et le violet
redevient la seule couleur de l'offre.

### Le haut du barème d'Adrénaline accélère

« Rends le scoring des Adrénalines un petit peu plus intéressant. »

Le barème progressif posé la veille montait de 3, puis 4, puis 5. Sur des
parties qui se jouent à un ou deux points, pousser la réserve jusqu'au bout ne
se distinguait pas assez d'un Repaire mené normalement.

Les quatre premiers paliers NE BOUGENT PAS : c'est là que vit le risque que le
ruling du 2026-08-19 avait fermé — une petite réserve trop rentable décourage de
dépenser. Seule la partie haute accélère.

    réserve   1   2   3   4   5   6   7   8
    avant     1   3   5   8  11  15  19  24
    après     1   3   5   8  12  17  22  28

La valeur vit toujours à une seule source, et le test qui vérifie que les règles
de l'application, le livret et le tableau de décompte annoncent le même barème
l'a bien attrapée aux trois endroits.

## Non publié — vingt-et-unième passe du 2026-08-28 (mise en place, tas renversés, et le plateau qui reprend sa place)

Douze points relevés par Nikola. Neuf sont faits, un est laissé ouvert faute de
pouvoir l'identifier, deux relèvent d'un travail d'IA au long cours qui est
commencé mais pas conclu. Le détail des trois est en fin d'entrée.

### La mise en place devient un vrai choix

« Le placement choisi par le joueur au début du jeu (inverse de l'initiative,
Détonateur en dernier), on se place sur une des cases libres adjacentes à un
angle. C'est un choix, ça ne doit pas être automatique, sauf pour une IA. »

La passe précédente avait corrigé l'ORDRE — le Détonateur pose en dernier,
donc il voit tout le monde avant de se décider — et laissé le tirage au sort.
L'ordre était devenu juste pour une décision que personne ne prenait, alors que
c'est exactement ce qu'il sert à arbitrer.

La partie s'ouvre donc sur une séquence : une IA prend son emplacement dès que
son tour arrive, un humain arrête la file et c'est son clic qui la relance.
Chacun ne voit que les Titans DÉJÀ posés — jamais ceux qui posent après lui.
C'est la seule façon de rendre à l'ordre l'information qu'il est censé
distribuer : placer tout le monde d'un coup, même dans le bon ordre, ne
distribue rien.

Un drapeau `aPlacer` suffit à tenir l'invariant : tant qu'il est là, le Titan
n'est pas sur le plateau. Les quinze endroits qui demandent « qui est sur cette
case » passent tous par `estSurLePlateau`, il n'y avait donc qu'une fonction à
étendre. Sa case par défaut existe pendant tout ce temps — pour que rien ne
lise `null` — mais personne ne la lit, et la vue 3D ne la dessine pas :
l'afficher révélerait à ceux qui posent avant lui où il compte aller.

### Un tas de débris percuté bascule, et le Seuil 4 n'a plus son mot à dire

« Si je percute un tas de débris ou fais percuter un tas, ça bascule dans le
sens de percussion, plus besoin du seuil 4. Si je saute dessus ça s'effondre,
la nuance est importante. »

Sous le seuil, un tas était déclaré « obstacle infranchissable » : la charge
s'arrêtait pile devant sans rien déplacer, et un Titan projeté dessus y
grimpait au lieu de le pousser. Un tas valait mur, et il fallait une charge
chèrement payée en Adrénaline pour espérer le déblayer.

Les deux gestes sont maintenant distincts, et c'est la nuance demandée :
- on PERCUTE (charge, Titan projeté, Tout Casser) → le tas bascule DANS L'AXE,
  chaque débris partant d'autant de cases que sa hauteur ;
- on SAUTE dessus (Boing Boing) → il s'ÉCROULE autour, sur les 8 cases
  voisines, au choix du joueur. Inchangé.

Les trois sites de bascule passent par une seule fonction. Ils avaient déjà
divergé une fois — deux projetaient à contre-sens de la percussion, corrigés
séparément le 19 août — et une implémentation unique ferme le sujet.

**Le sous-cas Amas de Tout Casser est le seul des trois que Nikola n'a pas cité
en exemple, et c'est celui qui renforce le plus une carte** (elle touche jusqu'à
8 cases d'un coup, là où une charge n'en percute qu'une). Il est traité comme
les deux autres, parce que la règle énoncée parle du geste et non d'une carte,
et que Tout Casser EST une percussion. À rejuger si l'équilibre bouge.

### L'Adrénaline suit un barème progressif

« Faut qu'on fasse plus un barème progressif de détention d'adrénaline que juste
2 par adrénaline. »

Le forfait plat ne récompensait aucune intention : trois Adrénalines gardées par
négligence valaient autant que trois gardées par plan. Le barème est désormais
cumulatif comme celui des couleurs — 1 · 3 · 5 · 8 · 11 · 15 · 19 · 24 points
pour 1 à 8 jetons.

**Le profil de la courbe a été choisi pour préserver le ruling du 19 août**, qui
avait baissé la valeur de 3 à 2 points parce qu'une Adrénaline « était trop
rentable à garder, ce qui décourageait de la dépenser ». Ce risque vit dans les
PETITES réserves, celles qu'on traîne sans y penser — ce sont précisément celles
qui rendent moins qu'avant ici. Il faut monter à cinq jetons pour dépasser
l'ancien forfait : thésauriser reste un pari qu'on assume sur toute la partie,
pas une rente de consolation.

Un forfait n'ayant plus de sens sur une courbe, tout arbitrage « payer ou
encaisser » lit maintenant la valeur MARGINALE de la réserve concernée. Le
contrôleur portait encore `voitAdversaires ? 6 : 3` en dur — deux nombres qui ne
correspondaient déjà plus au forfait de 2, et qui n'avaient jamais été rattrapés
par aucun test.

### Le défenseur décide, y compris quand deux IA s'affrontent

« Ce n'est pas l'attaquant qui décide de lui prendre une Adrénaline, c'est le
défenseur qui peut l'utiliser pour ne pas avoir à donner un des deux blocs. »

Le choix existait dans deux des trois configurations. Il manquait exactement là
où personne ne pouvait le voir : la résolution automatique IA contre IA, qui
faisait perdre un bloc au défenseur sans jamais lui proposer de payer. Deux IA
de même force ne jouaient donc pas la même règle selon qui les attaquait.
L'arbitrage est extrait dans une seule fonction que les deux chemins appellent.

### Un Titan hors de BIG CITY ne peut plus jouer son tour

Deuxième remontée du même symptôme : « j'aurais dû revenir sur le plateau
visuellement mais je ne le suis pas ; j'ai encore dû faire défausser ». Son
journal en porte la signature exacte — une ligne « Mouvement gratuit → B3 » SANS
la ligne « revient sur BIG CITY » qui la précède toujours.

La rentrée vivait uniquement dans un effet React déclenché par le changement de
Titan actif. Un effet ne se rejoue que si ses dépendances changent : toute
séquence où le tour s'ouvre sans qu'elles bougent laisse le Titan dehors, et le
reste du tour se déroule par-dessus cet état impossible.

**Une passe précédente avait cherché la cause dans la fraîcheur des refs et
écrit un test qui passe.** Ce n'était pas ça, et le bug est revenu. Cette fois,
on ne cherche plus le chemin : on rend l'état inatteignable. La rentrée est une
opération idempotente appelée depuis deux endroits indépendants, et
`resolveFreeMovement` refuse de déplacer un Titan hors plateau — la `cell` d'un
Titan sorti ne dit pas où il est, elle dit par où il rentrera, et écrire dedans
déplaçait sa future entrée sans jamais le remettre en jeu. Un tour silencieusement
perdu devient une ligne de journal.

### Le plateau reprend la place que les panneaux lui prenaient

« Agrandis le plateau en réagençant les panneaux d'informations. Les
informations des Titans à la place de là où on joue les cartes, les cartes
qu'on joue en dessous là où y avait le scoring. Place le journal à la place de
Signaler, car Signaler je ne m'en sers pas. »

Fait tel quel. La colonne large ne porte plus que le plateau : la bande des
Titans est montée dans la colonne des commandes — elle n'a jamais eu besoin de
la largeur du plateau, seulement de sa hauteur — et le décompte comme le journal
se posent PAR-DESSUS, à la demande. Ce sont des panneaux de consultation :
montés dans le flux, ils prenaient en permanence la hauteur qu'ils occupent une
fois ouverts.

La case du plateau passe de 52 à 68 px. Ce que le plafond de 52 protégeait,
c'était la place des contrôles sous le plateau ; il n'a plus rien à protéger.

**Signaler n'est pas supprimé** — il enregistre l'état complet de la partie,
graine comprise, et c'est ce qui permet de rejouer un bug au lieu de le
reconstituer de mémoire. Il descend dans l'en-tête du journal, là où il sert.

### Deux Graouhhh en main sont deux cartes

« Ce n'est pas parce que je clique sur Graouhhh que si j'ai une autre carte
Graouhhh ça la prend aussi. »

Depuis que le vol de Phase Repos transfère la carte au voleur, une main peut
contenir deux fois le même titre. Le moteur savait déjà les compter ; c'est la
sélection qui était une liste d'identifiants de CARTE, donc incapable de
distinguer deux exemplaires. Elle porte maintenant la position en main.

### « Gauche » et « droite » ne disaient rien

Les deux mots décrivaient le sens de parcours d'une table qui n'existe pas à
l'écran : il n'y a pas de sièges, personne ne sait qui est à sa gauche. Chaque
bouton porte maintenant la règle en une phrase — « tu voles celui qui joue après
toi » — et la chaîne réelle de la partie, nommée Titan par Titan.

### L'IA sait qu'elle peut arrêter la partie

« Il faut qu'une IA ait bien conscience des moyens de mettre fin à la partie,
hors fin de Manche 4. »

L'évaluation ne voyait littéralement pas la fin de partie : elle note un état
comme si la partie durait toujours. Casser l'avant-dernier bâtiment valait pour
elle ce que valait le bloc récupéré, ni plus ni moins.

Elle mesure désormais la distance aux trois déclencheurs de plateau (Apocalypse
Urbaine, Pénurie, Vide Spatial) et la pondère par son AVANCE sur le meilleur
adversaire. Le signe porte tout : qui mène gagne à rapprocher la fin, qui suit a
besoin de Manches. Aucune règle en dur, et le terme s'annule quand la partie est
serrée. Portée volontairement courte — au-delà de trois gestes, la fin est une
supposition, pas une décision.

**CE QUE LA MESURE DIT, ET CE QU'ELLE NE DIT PAS.** Duel de réglages, Expert
opportuniste, 8 graines × 2 dispositions de sièges, 24 parties par série :
retirer le terme coûte **0,15 point par partie**, pour 46,1 % de victoires à
l'ablation. C'est à l'intérieur du bruit — l'écart par graine va de −2,15 à
+3,27. Le terme n'est donc PAS démontré bénéfique ; il est démontré inoffensif.

Il n'est pas non plus rare : sur 20 parties Expert, **11 se terminent sur un
déclencheur de plateau** (Pénurie 4, Apocalypse 4, Vide Spatial 3) contre 9 à
la fin de Manche 4. La lecture s'active donc dans la majorité des parties et ne
change pas le classement pour autant — vraisemblablement parce que les
déclencheurs arrivent de toute façon, tout le monde cassant des bâtiments pour
marquer. Le réglage est en place et son poids est réglable ; ce qu'il vaut à un
poids plus fort reste à mesurer.

### Dix-huit retouches d'interface après essai

Deuxième passe du même jour, sur ce que le réagencement a rendu visible.

**Le placement n'avait pas de surbrillance en 2D.** Elle avait bien été posée,
mais dans `cellulesActives` — qui ne sert QU'À LA VUE 3D. La grille 2D, où la
partie se joue réellement, teste chaque mode séparément et ne lisait rien de
tout ça. Le placement y est maintenant traité comme les autres actions :
bordure, fond, curseur, pulsation.

**Trois cartes par rangée, toujours.** C'était un `flex-wrap` sur des cartes à
largeur fixe : depuis que la colonne de droite a rétréci au profit du plateau,
la troisième ne tenait plus et la main basculait en 3×2. Une grille de trois
colonnes `1fr` ne peut pas se replier.

**Les bandeaux de décision ont maigri** (rembourrage, taille de titre,
interlignes) et ne renomment plus deux fois les mêmes Titans : « T1 vs T2 » dans
le titre PUIS « T1 désigne 2 options chez T2 » juste en dessous faisait quatre
étiquettes pour deux informations, sur un affichage où chaque ligne prise est
une ligne de plateau perdue.

**Le vol de Phase Repos dit enfin qui a pris quoi à qui.** L'information
existait, intégralement, mais uniquement en texte au fond du journal — il
fallait ouvrir un panneau et remonter des dizaines de lignes pour trouver le
seul événement de la Manche qui touche directement sa propre main. Le résolveur
rend désormais un résumé structuré, affiché en clair, en icônes.

**Le chemin du Mouvement gratuit va tout droit quand c'est droit.** En distance
de Chebyshev, E5 vers E7 fait deux pas qu'on passe par E6 ou par D6 : les deux
chemins sont valides ET de même longueur, aucun test de règle ne pouvait les
départager, seul l'œil les distingue. Le parcours en largeur énumérait les
voisins en commençant par la diagonale haut-gauche et gardait le premier parent
trouvé. Les huit directions sont désormais ordonnées orthogonales d'abord — un
déplacement réellement en biais retrouve la diagonale tout seul. Rien d'autre ne
change : ni les cases atteignables, ni le coût, ni les règles.

**Et aussi** : désélectionner un Titan en recliquant sa plaque ou sa case (le
périmètre teinte neuf cases en permanence, ce qui gêne quand on veut juste LIRE
le plateau) · journal segmenté par Manche, chaque bloc portant son titre EN TÊTE
au lieu du séparateur posé SOUS les lignes qu'il ouvrait · barre de stock
descendue dans la colonne des commandes · repères ABC et 123 remis à égale
distance du plateau (les lettres étaient à 2 px, les chiffres à la largeur d'une
gouttière) · trois débris de front par case, la case ayant grandi · « Annuler »
descendu à côté de Périmètre / Énergie, parce que c'est un geste de tour et non
un réglage du meuble · doseur d'Adrénaline réservé au mode Déplacer · consigne
« clique une case en surbrillance » retirée au ramassage, le compte de cases
gardé · plaque élargie pour le Titan tenu par un humain · chaîne du vol en
icônes · podium de fin de partie, ouvert quand le classement devient VRAI (pas à
`gameOver` : entre les deux il y a le placement des Verts, et annoncer un
gagnant à ce moment-là serait le démentir une minute plus tard), refermable et
rouvrable.

**L'IA regarde désormais tous ceux qui sont devant elle**, pas seulement le
premier. Le terme différentiel existant — mesuré à +0,25 / +0,60 point par
partie — ne retranche que le score du MEILLEUR adversaire : une IA quatrième
n'avait donc rien à gagner à dépasser la troisième, alors qu'une place est une
place et que les points de podium des Pistes ADN se jouent exactement là. Le
nouveau terme ajoute l'écart à ceux qui sont devant, le meilleur exclu pour
éviter le double comptage. **Non mesuré à ce jour** : poids délibérément faible,
réglable et réversible seul (`poidsPoursuite`).

### Troisième passe : le journal typé, et le DIL rendu à sa victime

**Le DIL à combinaison unique donnait le choix de la victime à l'attaquant.**
Nikola : « je n'ai pas le droit de choisir Adrénaline, c'est la victime qui doit
faire ce choix si pour elle les 2 autres blocs sont trop importants. »

Le raccourci est juste — quand la cible n'a que 2 options, l'attaquant n'a rien
à désigner, on lui épargne un clic sans choix. Mais il enchaînait sur le stade
DÉFENSEUR **sans regarder qui est le défenseur**. Face à une IA, l'attaquant
humain se retrouvait devant le panneau de sa propre victime : il choisissait le
bloc qu'elle perd, et pouvait même dépenser SON Adrénaline à sa place.
L'arbitrage que la victime est censée faire passait à celui qui a exactement
l'intérêt inverse. Le stade défenseur n'est plus atteint que si un humain doit y
répondre.

**Le journal est typé — dérivé, pas stocké.** Deux défauts signalés : le
rattachement à un Titan gardait le PREMIER identifiant trouvé (« Titan 1 prend 1
Adrénaline à Titan 2 » était classé chez le 1 seul, donc invisible au filtre du
2, à qui elle coûte pourtant une Adrénaline), et les noms choisis à l'accueil
n'apparaissaient jamais.

La version évidente — enrichir chaque ligne à l'écriture — oblige à un
`setActionLog` maison, qui n'est plus le setter stable de `useState` : les
cinquante-trois sites d'écriture s'en moquent, mais les trente-huit hooks qui le
citent en dépendance, non. Le type est donc CALCULÉ depuis le texte, une fois
par changement de journal, et rien en amont ne bouge — ni le domaine, ni les
appelants, ni l'annulation. On en tire `acteurs` (TOUS les Titans cités),
`manche` (donc un découpage qui n'est plus une affaire d'affichage), et un
`texte` qui reste canonique : le nom est substitué à l'AFFICHAGE, ce qui le rend
rétroactif et garde une partie enregistrée lisible par quelqu'un qui n'a pas les
mêmes noms.

**L'Adrénaline refuse une Fatigue.** Troisième emploi du jeton, et le premier qui
soit défensif sur une carte : depuis que le barème est progressif, l'Adrénaline
se thésaurise, il lui fallait une dépense qui vaille la peine d'entamer une
réserve. La carte est tirée AVANT le choix — sinon refuser serait un pari, pas
une décision.

**À noter : le livret le disait déjà.** « Défense : 1 adrénaline » figure dans
son glossaire depuis toujours, et sa règle du hors-tour cite explicitement la
dépense d'Adrénaline pour annuler une Fatigue. C'est le moteur qui ne
l'appliquait pas — la divergence habituelle de ce projet, mais dans l'autre
sens : d'ordinaire c'est le livret qui est en retard.

**Graouhhh ne montrait aucune trace.** Le mécanisme des petites cases jaunes
existait et marchait pour les quatre autres cartes : `projectInDirection` dépose
chaque trajet dans `trajectoires`, l'appelant l'anime. Graouhhh construisait son
état SANS le champ — les trajets étaient jetés en silence, et la carte qui
déplace le plus de Titans à la fois était la seule à ne rien montrer. La course
du chargeur de Tête en Avant est également tracée : elle ne passe par aucune
projection, il fallait l'ajouter à la main.

**Le podium attend la VALIDATION des Verts**, pas leur simple placement : un
Vert posé mais non engagé peut encore être repris, et le vainqueur affiché ne
serait pas celui qui gagne.

**Le stock de blocs remonte en tête de colonne.** Le problème n'était pas sa
hauteur mais sa position : tout ce qui vit sous les plaques de Titans les pousse
vers le haut quand le panneau de tour s'ouvre, et les quatre plaques se mettent
alors à défiler horizontalement. En tête, il prend une hauteur fixe qui ne
dépend d'aucun état de tour.

**Et aussi** : bouton « Annuler » passé en orange plein avec pastille de compte
— il portait le traitement d'un bouton secondaire de boîte de dialogue, alors
que c'est le filet du joueur · mode du vol de Phase Repos rappelé dans son
bandeau (les deux modes fonctionnent, vérifié ; c'est de ne pas pouvoir relire
lequel est actif qui faisait douter).
### Quatrième passe : Tout Casser perd sa RAGE, et le stock trouve sa place

**Tout Casser ne vole plus que sur un Dilemme.** Nikola : « sous le Seuil 4,
déplacement, gain piste Bagarre, mais aucun vol ; 4 ou au-dessus, DIL — il n'y a
pas de RAGE. »

La carte avait le barème le plus dur du jeu : elle frappe jusqu'à huit cases à la
fois, et chacune ouvrait un vol — un Dilemme sous le seuil, une RAGE au-dessus.
Elle prend le profil inverse des cartes dirigées : LARGE mais moins tranchante.
Sous le seuil elle bouscule et marque sans rien prendre ; au-dessus elle ouvre un
Dilemme, où la victime garde la main sur ce qu'elle lâche.

**Le Seuil 4 change de rôle pour la deuxième fois de la journée.** Il ne
départage plus DIL et RAGE sur cette carte — il décide s'il y a un vol ou pas.
Après le Patatras le matin, c'est son second rôle perdu : la piste n° 1 de la
liste de conception (« un palier qui ne commande plus qu'une chose ») vient de
gagner en poids toute seule.

Deux tests existants encodaient l'ancienne règle et sont tombés. L'un attendait
un verdict RAGE ; il vérifie maintenant le Dilemme, mais il garde son vrai objet
— que la carte tienne UNE SEULE énergie du début à la fin. L'autre construisait
un Périmètre à un seul Titan, donc une énergie de 1 : sous la nouvelle règle il
n'y a plus de décision du tout, et le test tombait sur un `decision` indéfini
sans que son sujet (`cellAtImpact`) soit en cause. La scène a été renforcée
jusqu'au seuil, pas l'assertion affaiblie.

**Le stock de blocs a fait trois escales avant de trouver sa place.** Au-dessus
du plateau il prenait une rangée à la colonne large ; dans la colonne des
commandes il volait une hauteur qui manquait au dernier panneau et laissait un
vide en tête. Cinq jauges n'ont besoin ni de la largeur du plateau ni de la
hauteur des commandes : elles ont besoin d'UNE LIGNE, et une ligne se prend en
travers. Il occupe désormais toute la largeur, sur 38 px.

**Et une régression du jour, corrigée le jour même.** Pour élargir la plaque de
« mon Titan », la passe précédente construisait un gabarit EXPLICITE de quatre
colonnes. Un gabarit explicite ne se replie pas : dans une colonne de 390 px,
quatre pistes de 160 px font 640 px, et la rangée se mettait à défiler
horizontalement — « c'est hors de question », et il a raison, une rangée de
référence dont on ne voit que la moitié ne référence rien. Deux colonnes
désormais, et « mon Titan » prend la première ligne entière : plus gros, les
trois autres égaux entre eux, et rien ne déborde.

**Le déplacement passif laisse une trace, aux couleurs du Titan.** Le jeton se
déplaçait case par case sans rien laisser derrière lui : à la fin de
l'animation on ne savait plus par où il était passé, ce qui compte précisément
quand le chemin contourne un bâtiment ou traverse un téléporteur. Même mécanisme
que les débris, même intensité (0,45), mais la couleur du Titan au lieu du jaune
— vérifié à l'écran : `rgba(113, 219, 255, 0.45)` pour le Titan 1.

**Un seuil de plateau atteint s'annonce enfin.** Le moteur calculait ces
déclencheurs à chaque rendu et personne ne les affichait : la valeur était
exposée par le contrôleur et lue nulle part. Or ils tombent souvent — sur vingt
parties Expert mesurées, onze se terminent sur un déclencheur de plateau contre
neuf à la limite de Manches. La fin de partie la plus fréquente était la seule
dont rien ne prévenait.

**Le bouton « Annuler », troisième version.** D'abord le traitement d'un bouton
secondaire de boîte de dialogue — invisible ; puis un aplat orange plein qui
criait plus fort que les actions de jeu. Il emprunte maintenant le vocabulaire
des touches du meuble : aplat sombre, cerne net, relèvement de 3 px. L'orange
tient le cerne, l'icône et le compteur, pas le fond.

**Au passage, deux fiches de règles en retard.** Tête en Avant annonçait encore
un bloc « projeté en direction opposée » (corrigé dans le moteur le 19 août,
jamais reporté), et la table des destinations promettait une RAGE de Tout Casser
qui n'existe plus.
### Cinquième passe : tout sur un écran, et le pack de quatre carrés rétabli

**Le stock rejoint la rangée de commandes, à droite.** Quatrième emplacement en
une journée, et cette fois il ne coûte rien : la rangée existe déjà, elle fait
37 px, et sa moitié droite était vide. Un troisième mode d'affichage
(`orientation="rangee"`) le rend sans cadre, sans fond et sans jauges — juste les
comptes, alignés à droite. À cette taille, la jauge ne disait rien que le rapport
chiffré ne dise déjà, et c'est elle qui imposait deux lignes de hauteur.

**Le pack de quatre carrés est rétabli, sans exception.** L'idée d'élargir la
plaque du joueur actif a échoué deux fois de suite, et pour la même raison de
fond : cette rangée sert À COMPARER. Quatre plaques de même taille se lisent d'un
coup d'œil, colonne par colonne ; dès que l'une change de format, il faut relire
chaque étiquette pour savoir ce qu'on compare. Le Titan actif est déjà signalé
par le seul relief de l'écran et par son cerne coloré — il n'avait pas besoin
d'une taille en plus, il avait besoin qu'on le laisse tranquille.

**La traînée du déplacement passif se construit pendant la marche.** Elle était
posée d'un bloc à l'ARRIVÉE puis effacée 650 ms plus tard : après une marche
d'une seconde par case, elle passait inaperçue (« je n'ai pas vu de case devenir
en surbrillance »). Chaque pas ajoute désormais sa case, comme la trace d'un
débris, et l'ensemble tient 1,4 s une fois le Titan arrivé. Couleur du Titan,
intensité du jaune des débris — vérifié : `rgba(113, 219, 255, 0.45)`.

**Ce que ça donne, mesuré.** Sur une fenêtre de 950 px de haut, en Phase Action
avec les cartes ouvertes : page 950 px pour 950 px de fenêtre, aucun défilement
ni dans la colonne des commandes ni dans la page, Périmètre et cartes tous deux
visibles. Le pied de page a été resserré et l'interligne des plaques réduit pour
y arriver.

⚠️ **Et la limite, dite franchement.** Sur une fenêtre de 880 px, il manque
encore 62 px. Le budget vertical se répartit ainsi : 24 px de rembourrage, 38 px
de fronton, 37 px de rangée de commandes, 336 px de plaques Titans, 428 px de
panneau de tour, 35 px de pied. Les deux gros postes sont les quatre plaques et
le panneau de tour — ce sont exactement les deux choses que Nikola demande de
garder visibles. Il n'y a donc plus de gras à retirer : à partir de là, il faut
choisir ce qui sort. La hauteur réelle de son écran décidera si la question se
pose.
### Sixième passe : le repli qui arrivait trop tard, et les traces qui disent quoi

**Graouhhh refusait de déplacer le second Titan alors que la place venait de se
libérer.** Nikola : « un bâtiment a bloqué le premier, le plus loin ; je l'ai
déplacé, et après je n'ai pas pu déplacer le second — il a considéré qu'il n'y
avait pas la place, sauf que si. »

Il a exactement raison, et la cause est une question d'ORDRE, pas de géométrie.
Un Titan arrêté faute de puissance ne bouge pas tout de suite : le résolveur
dépose une demande de repli et laisse le Titan sur place, puisque c'est
l'initiateur qui choisit où le poser. Or la boucle enchaînait sur le Titan
suivant SANS attendre ce choix, et l'appelant ne traitait les replis qu'une fois
tout le monde traité. Le second Titan voyait donc le premier encore à sa case
d'origine — celle-là même que le repli allait libérer une seconde plus tard.

La boucle s'arrête désormais sur un repli comme elle s'arrête déjà sur un
Dilemme, avec la même mécanique de continuation. C'est le ruling du 2026-08-18
appliqué jusqu'au bout : « impossible de passer au Titan suivant tant que ce
n'est pas résolu » — un repli en attente est tout autant non résolu qu'un
Dilemme.

**Deux Titans peuvent attendre sur la même case de rebord.** `cell` d'un Titan
sorti désigne PAR OÙ IL RENTRERA, pas où il est, et rien n'interdit à deux Titans
de viser la même entrée puisqu'aucun des deux n'est sur le plateau. C'est même
courant : deux poussées dans le même axe sortent par le même bord. L'index de la
gouttière écrasait le premier avec le second, et un joueur croyait un Titan
disparu. Ils s'y empilent maintenant, légèrement chevauchés — le chevauchement
dit « ils sont deux au même endroit », ce qui est le cas.

**La trace dit désormais CE QUI est passé là.** Elle portait une seule couleur
pour tout l'événement ; ça tenait tant qu'une carte ne déplaçait qu'une sorte de
chose, mais un Tout Casser projette des débris ET bouscule des Titans dans le
même souffle. Chaque case porte donc son élément : débris → jaune, Titan → sa
couleur, faille → violet du téléporteur. Même apparence et même intensité (0,45)
dans les trois cas — seul le ton change. L'information existait déjà dans les
trajectoires, elle était jetée à l'affichage.

**Les téléporteurs s'allument quand un déplacement passif les emprunte** — « ça
permet de mieux comprendre comment le Titan finit à 15 cases de son point de
départ ». Un saut de faille se repère à une chose : deux cases consécutives du
chemin qui ne se touchent pas.

**La Phase Repos prend dix secondes.** Le vol se résolvait et la Manche suivante
s'enchaînait dans le même souffle : le récapitulatif s'affichait puis
disparaissait avant qu'on ait lu la première ligne. C'est pourtant le seul
événement de la Manche qui touche directement la main de chacun, et il n'y a rien
à y décider — donc rien qui justifie de le presser. L'attente est annoncée à
l'écran : une pause qu'on ne comprend pas se lit comme un blocage.

**Et aussi** : « Sauter ! » et « Annuler » collés en bas du panneau, la rangée
s'ajoutant sous une main de cartes qui occupe déjà toute la hauteur · stock
global agrandi de 20 %, sans faire grandir la rangée de commandes qui l'accueille
(vérifié : toujours 37 px, toujours aucun défilement).

**Une hypothèse, dite comme telle.** Pour « quand on m'a demandé la 2e case,
c'étaient les mêmes que la première », le dédoublonnage des replis a été élargi :
il ne portait que sur « même élément, même case d'arrêt », ce qui laissait passer
deux arrêts à des cases différentes dont les voisines libres coïncident. Du point
de vue du joueur, deux demandes offrant exactement les mêmes destinations pour le
même élément sont indiscernables. Reste à confirmer que c'était bien ce cas-là.
### Septième passe : le chemin dans le bon sens, et plus rien de rogné

**Le périmètre s'affichait avant que le Titan soit posé.** Sa `cell` porte déjà
une valeur pendant la mise en place — l'emplacement que le tirage lui a réservé
par défaut — et le périmètre se dessinait autour. Non seulement il n'a aucun sens
(le Titan n'est nulle part), mais il RÉVÈLE où il compte aller à ceux qui posent
avant lui, ce que tout le reste de la mise en place s'applique à cacher. Même
garde qu'ailleurs : `estSurLePlateau`, qui couvre déjà `aPlacer` et `horsPlateau`.

**Le chemin s'égraine APRÈS le passage, jamais avant.** Nikola : « il y a une
sorte de chemin qui s'illumine après le passage du débris ; je veux exactement la
même idée pour un Titan, quelle que soit la carte, et même pour les déplacements
passifs. Là, le passif on dirait l'inverse : ça montre sa future case et il va
dessus. »

Il décrivait exactement ce que faisait le code : la case s'allumait AU MOMENT où
le jeton y arrivait, donc l'œil voyait la lumière avant le mouvement. Un débris,
lui, arrive d'un coup et sa traînée se déroule ensuite — c'est ce qui la rend
lisible. Le déplacement passif passe donc par `animerTrajectoires`, la même
fonction que toutes les cartes : une seule mise en scène pour tous les
déplacements du jeu, et plus rien à synchroniser à la main. La tenue passe de
650 ms à 1,5 s, parce que 650 ms passaient inaperçus.

**La répartition d'un écroulement s'applique clic par clic.** Nikola : « il faut
qu'on sélectionne l'ordre et que le jeu adapte son plateau à chaque déplacement ;
ça permet de faire des tas de débris différemment que si c'est totalement
automatique en 1 seconde. »

Le résolveur appliquait DÉJÀ les débris un par un — mais le joueur, lui,
désignait les N cases d'affilée sur un plateau figé, puis validait. Il ne pouvait
donc pas voir qu'un débris venait d'occuper une case, ni décider d'empiler sur ce
qu'il venait de poser. Le séquencement était dans le moteur et pas dans la main.
Chaque clic résout maintenant son débris : le plateau bouge, les cases éligibles
se recalculent, et le suivant se choisit sur l'état réel.

« Annuler le dernier » et « Valider » disparaissent avec ce changement : on ne
défait plus un choix qui a déjà produit ses effets — un débris tombé sur un Titan
l'a déplacé, et a pu faire basculer une tour derrière. L'annulation générale du
tour reste la porte de sortie, et l'instantané est pris au tout premier débris :
elle défait la répartition entière d'un coup.

**Plus aucun panneau rogné, par construction.** La colonne des commandes était
`sticky`, avec une hauteur maximale et un débordement interne. C'est ce couple
qui coupait : dès que le contenu dépassait la fenêtre, le dernier panneau passait
sous le bord d'une boîte qui, elle, ne bougeait plus — et comme la barre de
défilement interne ne se voit qu'au survol, rien ne disait qu'il y avait quelque
chose en dessous. Les trois contraintes sont retirées : la colonne fait la
hauteur de son contenu, et quand l'ensemble dépasse, c'est LA PAGE qui défile.

Ce qu'on perd : la colonne ne suit plus le regard sur un plateau plus haut
qu'elle. C'est un confort ; ne pas amputer un panneau de décision est une
condition.

**La graine remonte sous la rangée de commandes** (« le numéro de graine peut
être mis entre la ligne de boutons et le stock global »). En pied de meuble elle
coûtait 35 px à chaque tour pour une information qu'on lit une fois par partie.

**Et aussi** : stock global +30 % de plus, la rangée s'alignant au centre pour
que les touches ne s'étirent pas avec lui · consigne et raison du placement sur
une seule ligne · Phase Repos ramenée de 10 à 5 secondes, le récapitulatif tenant
en quatre lignes.
### Huitième passe : Tout Casser dans l'ordre du joueur, et une carte à la fois

**On pouvait ouvrir deux cartes à la fois.** Nikola : « j'ai pu sélectionner
Boing Boing ET Tout Casser, j'aurais pu jouer 2 cartes là. »

Chaque carte ouvre son propre mode, et rien ne fermait les autres : avec un
chemin de Boing Boing en cours de tracé, cliquer Tout Casser lançait sa
résolution différée SANS annuler ce chemin — les deux pouvaient donc se valider
dans le même round, alors qu'on n'a droit qu'à une carte. Cliquer une carte
referme désormais tout ce qui était ouvert ; recliquer la même la referme aussi,
via son propre bouton bascule, donc le geste reste réversible.

**Tout Casser projette élément par élément, dans l'ordre choisi.** La carte
résolvait ses quatre sous-cas d'affilée — bâtiments, puis blocs, puis Titans,
puis Amas — chacun balayant tout le Périmètre. Trois conséquences, aucune voulue :
l'ordre était celui du code, tout partait en une seconde, et le joueur n'avait
aucune prise sur la seule carte qui touche huit cases à la fois.

Or l'ordre change le résultat : un bloc projeté sur une case qu'un Titan vient de
quitter ne s'empile pas au même endroit, et un débris posé avant ou après une
poussée ne forme pas le même tas.

Le moteur gagne deux fonctions — `listerCiblesToutCasser`, qui relève ce que la
percussion va toucher avec la nature de chaque cible, et `resolveToutCasserCase`,
qui en résout UNE. Les quatre sous-résolveurs acceptent une restriction à une
case ; sans elle, ils balaient le Périmètre comme avant, donc l'IA et le
simulateur gardent exactement leur comportement et les graines des campagnes
restent valables.

**Deux choses ne changent pas, et c'est important.** L'ÉNERGIE ne se recalcule
pas entre deux éléments : c'est le relevé de percussion, pris une fois pour toute
la carte, qui la fixe — un test verrouille déjà ce point depuis le 2026-08-19.
Et la BAGARRE se compte à la fin, une seule fois par Titan distinct touché
(FAQ #12), quel que soit l'ordre — exactement comme le faisait la résolution
monolithique.

**La graine entre dans la rangée de commandes**, entre le bouton Journal et le
stock. Elle avait d'abord été posée sur sa propre ligne juste en dessous : ça
répondait à la lettre mais pas à l'intention, puisque ça reprenait une ligne à
l'écran. Elle est DANS la rangée, en 0,58 rem — c'est une plaque signalétique,
elle se lit une fois par partie. La rangée fait toujours 37 px.
### Neuvième passe : l'annulation réparée, et le jeton qui cesse de doubler le chemin

**« Annuler » cassait la partie pendant une résolution de Tout Casser.** Nikola :
« si j'annule, ça fait planter le déplacement, les annulations aussi, je ne peux
plus vraiment revenir en arrière. »

L'instantané restaurait le plateau et les Titans, mais PAS la file des éléments
restant à projeter. « Annuler » rendait donc un plateau d'avant la projection
avec une file d'après, qui désignait des cibles n'existant plus — un bâtiment
qu'on venait de reconstituer, un Titan revenu sur sa case. Le clic suivant
résolvait une case incohérente, et l'état partait de travers sans retour.

La règle vaut pour toute résolution en plusieurs temps, et mérite d'être écrite :
**ce qui SÉQUENCE une action appartient à l'instantané au même titre que ce
qu'elle a déjà modifié.** `ecroulement` le savait déjà ; la file de Tout Casser
l'a rejoint, déclaration remontée avec les autres pour éviter la zone morte
temporelle du tableau de dépendances.

**Le jeton ne marche plus case par case.** Nikola : « plus besoin de prendre le
temps de bien montrer l'icône du Titan sur quelle case il va, l'animation du
chemin coloré aide à ça » — et, dans le même souffle, « l'animation de chemin est
moins fluide ».

Les deux remarques n'en font qu'une : on montrait la même chose deux fois, à deux
rythmes. Le jeton avançait d'une case par seconde pendant que la traînée
s'égrainait à 110 ms — l'œil suivait l'un OU l'autre, jamais les deux, et le
décalage se lisait comme une saccade. Un déplacement de trois cases immobilisait
le tour trois secondes pour une information que la traînée donne mieux.

**Et ça règle un troisième problème que personne n'avait relié aux deux
premiers** : la résolution était différée derrière une cascade de `setTimeout`, et
pendant ce temps « Annuler » agissait sur un état que l'animation allait écraser.
Elle est maintenant synchrone — l'instantané décrit exactement l'état d'avant.

**Les téléporteurs : les deux bouches empruntées, pas les quatre.** La version
précédente allumait TOUS les téléporteurs actifs dès qu'un saut était détecté :
sur un plateau qui en compte quatre, ça montrait deux failles que le Titan n'a
jamais approchées, et noyait l'information cherchée. On identifie désormais la
paire réellement empruntée — le saut se repère à deux cases consécutives du
chemin qui ne se touchent pas, et les deux bouches sont les téléporteurs actifs
les plus proches de chacune.

**La graine finit dans le titre du Journal**, en petit. Quatrième emplacement :
pied de page (35 px par tour), ligne propre sous les commandes (une ligne de
plus), rangée de commandes, et enfin ici. C'est la bonne : le journal est
exactement ce qu'on ouvre pour comprendre ou signaler une partie, et la graine
est ce qui permet de la rejouer. Elle ne coûte plus rien à l'écran de jeu.

**Et aussi** : « Que font les cartes ? » devient un « ? » de 19 px contre le titre
de l'étape — c'était une touche pleine largeur pour une aide qu'on ouvre une fois,
le temps d'apprendre six cartes · le sous-titre « Joue une carte (N restantes) »
disparaît, il répétait le titre juste au-dessus et son compteur ne disait rien que
les cartes posées là ne montrent déjà.
### Dixième passe : les IA cessent de jouer en coulisses, et le grand nettoyage

**On ne voyait pas ce que faisaient les IA.** Nikola : « quand les IA jouent, on
doit aussi voir les chemins comme quand c'est moi qui joue, pareil pour les
projections de leur part — là je les vois bouger sans chemin clair. »

La cause était nette : leurs états de résolution ne portaient même pas de
collecteur `trajectoires`, donc `projectInDirection` n'avait nulle part où
déposer ses trajets. Un Titan changeait de case entre deux clignements, et rien
ne disait par où il était passé ni ce qu'il avait bousculé au passage. Sur trois
adversaires, c'est la moitié de la partie qu'on ne voyait pas.

Leurs mouvements passifs (calculés par `getMovePath`, comme ceux du joueur) et
leurs cartes tracent désormais leur chemin, avec le même code couleur : chaque
case porte l'élément qui l'a franchie. Vérifié à l'écran sur un tour complet —
Titan 3 en vert, Titan 2 en orange, Titan 4 en rose, débris en jaune, dans la
même seconde.

Le tour d'une IA passe de 2 000 à 2 600 ms : il faut au moins la durée d'une
traînée avant que l'étape suivante n'efface la précédente. C'est le minimum qui
rende la trace lisible, pas plus — à trois IA, chaque tranche de 600 ms coûte
presque deux secondes par round.

**Deux cartes pouvaient paraître sélectionnées.** La sélection avait DEUX sources :
`activeMode` pour les cartes qui ouvrent un mode, `pendingCardConfirm` pour celles
à résolution différée. Le second était posé pour TOUTES les cartes et n'était
effacé qu'au changement de tour : refermer une carte à mode la laissait allumée,
et la suivante s'allumait à son tour. Il est réservé aux deux cartes qui en ont
besoin — celles dont les 3 secondes d'attente ne montrent rien d'autre.

## Nettoyage des itérations

Neuf passes en deux jours laissent des restes. Trois ont été retirés, chacun
devenu mort par une décision explicite :

· `movingTitanOverride` dessinait le jeton sur une case intermédiaire pendant la
  marche d'une case par seconde. Cette marche a disparu au profit de la traînée ;
  plus personne n'écrivait dans cet état, il ne restait que sa plomberie.
· `ecroulementValider` n'avait plus rien à valider depuis que chaque clic pose
  son débris et applique ses effets.
· `ecroulementAnnulerDernier` non plus : on ne défait pas un choix qui a déjà
  déplacé un Titan et peut-être fait basculer une tour.

**Un quatrième a failli partir avec eux, et ne le devait pas.**
`ecroulementAbandonner` — la sortie de secours d'un Amas cerné de bâtiments, sans
laquelle la partie se bloque pour de bon — était collé aux deux précédents et a
été emporté par le même retrait. Rattrapé par le linter, restauré depuis
l'historique. C'est exactement le risque d'un nettoyage à la chaîne : supprimer
par voisinage plutôt que par usage.

## Vérifications

```
npm run audit   → 51 modules, aucune anomalie de structure
npm run lint    → 0 erreur, 0 avertissement
npm test        → 420 tests, 38 fichiers
diagnose        → 25 parties, 0 violation d'invariant, 0 scorie,
                  0 exception d'IA, 18 scores gagnants distincts sur 25
```
## Ce qui reste ouvert

**La double validation de case au saut sur un Titan.** Nikola : « quand je saute
sur un Titan j'ai une sorte de double validation de case, c'est bizarre. » Deux
chemins peuvent produire ce ressenti — un occupant coincé qu'on déplace ET pour
qui on ouvre ensuite un repli, ou la cible projetée qui s'arrête faute de
puissance et ouvre un repli légitime. Aucun des deux n'est systématique, et rien
dans le code ne permet de trancher lequel il a vu. Une partie signalée sur ce cas
précis suffira à le nommer ; y toucher à l'aveugle reviendrait à modifier une
mécanique qui porte déjà trois rulings.

**Le sous-emploi de Tout Casser.** La cause structurelle est identifiée et le
levier posé, mais la première mesure est négative. Rien n'est vendu qu'une mesure
ne soutienne pas.

## Non publié — vingtième passe du 2026-08-28 (retours de table, et un rebond qui traversait les murs)

Quatorze points relevés par Nikola. Onze sont faits, trois restent ouverts et
sont nommés en fin d'entrée plutôt que bâclés.

### Le repli traversait l'obstacle

« Quand y'a un rebond, c'est adjacent entre la case où il devait aller et
celle où il était. Là on me propose trop de cases : je viens de D7, je tape
C7, rebond = D6 D7 D8, pas C6 ou C8. »

Les cases proposées étaient l'intersection des voisines de l'origine et de la
cible, soit D7, C6, C8, D6, D8 pour son exemple. Les deux cases de la rangée C
sont DERRIÈRE le mur qu'on n'a pas eu la puissance de franchir : un élément
arrêté faute de puissance ne peut pas se retrouver de l'autre côté, c'est
toute la raison d'être du repli.

Le filtre retenu écarte une case qui a progressé sur TOUS les axes du
mouvement. Sur un déplacement droit il n'y a qu'un axe, et il supprime
exactement la rangée d'en face ; sur une diagonale il y en a deux, et la seule
case qui progresse sur les deux est la cible elle-même — les deux cases « de
biais » restent donc proposées.

**Ce correctif a fait tomber trois tests du 2026-08-17, et il fallait les
lire avant de les réparer.** Ils encodaient la règle telle qu'elle avait été
énoncée — « adjacent à la case où il était ET où il devait aller » — plutôt
que les exemples que Nikola avait donnés à la table, lesquels listaient
systématiquement une case de MOINS. Le commentaire d'origine assumait ce
choix. Nikola vient de trancher dans l'autre sens, et ses exemples 1, 2 et 3
tombent alors exactement juste.

**Son exemple 4 reste en désaccord, et il n'a pas été tranché à sa place** :
de B9 vers l'angle A9, il nommait A8 — qui est dans la rangée d'en face,
c'est-à-dire exactement le genre de case qu'il fait retirer aujourd'hui. Le
code suit la règle du 28 août, la plus récente et la seule qui nomme les
cases à EXCLURE ; le test porte la divergence par écrit.

### La Phase Repos a désormais deux modes, choisis avant la partie

« Soit c'est la carte de la victime qui va dans sa zone Repos, soit ça va dans
la main du Titan qui a sélectionné la carte. »

- **Mise au repos** — la carte part au frigo chez sa victime. Elle en est
  privée une Manche, personne ne la gagne. La règle d'origine.
- **Emprunt** — la carte passe en main du voleur, puis retourne à son
  propriétaire à la fin de la Manche, « même si pas joué ». Un prêt, pas une
  confiscation.

**L'ordre de fin de Manche change avec elle** : « on rend la carte AVANT le
fait de piquer une carte ». Ce n'est pas un détail de séquence — si l'on
volait d'abord, on pourrait piquer à sa victime une carte qui ne lui
appartient pas. Et le pool de vol d'un Titan qui a joué une carte empruntée
ne compte plus que ses deux cartes à lui, exactement comme Nikola le décrit.

Une carte empruntée porte son propriétaire (`empruntees`), ce qui rend le prêt
réversible où que la carte se trouve à la fin — en main, programmée, jouée ou
défaussée face cachée.

### Le placement des Verts se valide, et ne se reprend plus

« Quand j'ai fait le choix des Verts au scoring, je dois valider, et après ça
ne peut plus se changer. »

Il n'y avait pas de validation : le bouton « C'est placé » ne faisait que
replier le panneau, et les menus restaient modifiables tant qu'il était
ouvert. On pouvait donc voir le pré-score des autres bouger et revenir sur son
propre placement — alors que c'est le dernier geste SECRET de la partie.

Un bouton « Valider — définitif », actif seulement quand tous les Verts sont
placés, ferme le sujet. Une IA valide en posant : elle n'a personne pour
cliquer.

### L'écran d'accueil

- **« Big City · 9 × 9 » disparaît** au profit de « Règle ta partie avant de
  jouer ». La taille du plateau se découvre en le regardant ; sous le titre,
  la seule ligne utile est celle qui dit quoi faire de cet écran.
- **Les pastilles « 1P / 2P / 3P / 4P » disparaissent.** Elles numérotaient une
  place autour de la table alors que le portrait, la couleur et le nom saisi
  désignent déjà le Titan.
- **Un seul bouton IA, enfoncé ou non**, au lieu de la paire Humain / IA. Deux
  boutons pour un choix binaire obligent à lire les deux pour savoir lequel
  est actif ; et « Humain » n'est pas un réglage, c'est l'absence d'IA.
- **Une couleur par niveau de difficulté** — vert, cyan, orange, rouge, les
  quatre signaux que le jeu emploie déjà. Les quatre s'allumaient dans le même
  jaune : la couleur disait « sélectionné », pas LEQUEL.

### Deux choses qu'on ne pouvait pas voir

- **Quel débris tombe où.** Le bandeau d'Écroulement annonçait « Débris 2 sur
  3 » : un rang, pas un objet. La file entière est maintenant affichée avec
  l'icône de chaque bloc, celui qu'on place cerné, ceux déjà tombés éteints
  avec leur case.
- **Ce qu'il y a dans un tas.** Le survol temporisé n'ouvrait sa fiche que sur
  du béton DEBOUT ; or ce qui traîne au sol est précisément ce qu'on va
  ramasser, et un tas peut mêler trois couleurs et un Socle sans qu'aucune ne
  se voie à 30 px. La même fiche sert aux deux.

### L'icône du bouton Scoring

C'était la Lanterne Rouge — le fanal de queue de convoi, qui sert au trophée
du même nom. À 15 px, dans une rangée de commandes, elle se lit comme une
corbeille : le pictogramme disait donc « jeter » sur le bouton qui ouvre le
décompte. Aucune icône du jeu ne dit « compter les points », et le mot le dit
très bien seul.

### Ce qui reste ouvert, et pourquoi

- **Le placement choisi par le joueur.** L'ordre est fait depuis la passe
  précédente — inverse de l'initiative, le Détonateur pose en dernier — mais
  la case reste tirée au sort. En faire un vrai choix demande un écran de
  placement tour par tour, avant la Manche 1 ; ce n'est pas une retouche.
- **Le plateau plus grand.** Demande de réagencement des panneaux
  d'information, pas encore faite.
- **L'IA plus forte.** Le constat de Nikola est net (52 / 43 / 23 / 15, il
  gagne largement) et son intuition sur Tout Casser est confirmée par la
  mesure : sur 1 164 cartes jouées, Tête en Avant 31,6 %, Boing Boing 27,0 %,
  Tout Casser 15,8 % — alors que c'est la carte qui met le plus de blocs au
  Repaire.

  **Une cause structurelle a été identifiée** : la note contient une part
  heuristique (la valeur de ce qui est à portée) qui varie énormément d'un
  candidat à l'autre pour une carte qui DÉPLACE le Titan, et à peine pour
  Tout Casser. Or les cartes de déplacement proposent des dizaines de
  candidats (une par case d'arrivée et par mise) quand Tout Casser en propose
  trois ou quatre. Prendre le MAXIMUM d'une estimation bruitée favorise
  mécaniquement la carte qui a le plus de candidats, indépendamment de sa
  vraie valeur.

  Le poids de cette part est devenu réglable (`decotePortee`) pour pouvoir le
  mesurer. Premier essai à 0,18 contre 0,35 : entre −3,7 et +1,0 point selon
  la graine, donc plutôt négatif — la piste n'est pas celle-là, ou pas à ce
  dosage. Le levier est en place, la mesure reste à faire.

## Non publié — dix-neuvième passe du 2026-08-28 (retours de table, et deux cartes qui disparaissaient)

Six points relevés par Nikola. Un est resté ouvert faute d'arbitrage, et
l'un des autres a fait tomber un bug qui mangeait des cartes.

### Le placement de départ dépend du Détonateur

« En fonction de qui a le jeton Détonateur à la première Manche, on place les
Titans dans l'ordre inverse, dans une des 2 cases d'un angle, comme les
règles le disent. »

Le placement était tiré au sort et distribué aux Titans 1, 2, 3, 4 dans
l'ordre du tirage : il n'avait aucun rapport avec le Détonateur, qui était
d'ailleurs désigné APRÈS. Or l'ordre de placement est une vraie mécanique —
celui qui pose en dernier voit où sont tous les autres.

La séquence est donc inversée : on tire l'ordre de jeu et le Détonateur, on
en déduit l'ordre d'initiative pivoté sur lui, et on place dans l'ordre
inverse de celui-là. Le Détonateur pose en dernier.

**Une invention retirée en chemin.** La première version faisait préférer à
chacun un angle encore libre, ce qui interdisait de fait le partage d'un
pôle. Nikola n'a rien demandé de tel, et le partage est un ruling à lui, clos
depuis la V36 et verrouillé par un test — qui est tombé, comme il devait.
Seul l'ORDRE change.

### On voit enfin quel débris on place

« Quand je saute sur un amas de débris, je ne sais pas quel débris
précisément je mets à quelle place. »

Le bandeau d'Écroulement annonçait « Débris 2 sur 3 » : un rang, pas un
objet. Or les débris d'un Amas ne se valent pas — un Rouge vaut 3 au barème,
un Socle porte un chiffre — et c'est exactement ce qui décide de la case où
on l'envoie. La pile se vide du SOMMET vers le bas, donc l'ordre n'est pas au
choix : il faut voir ce qui tombe.

La file entière est maintenant affichée, avec l'icône de chaque bloc : celui
qu'on place est cerné, ceux déjà tombés sont éteints et portent leur case.

### Le vol de Phase Repos est devenu un vrai vol

« Au lieu de mettre la carte dans la zone Repos de la cible, on pique la
carte aléatoirement sur une des 3 et on la met dans sa main pour la Manche
suivante. »

La carte partait en Zone Repos CHEZ SA VICTIME : elle n'était volée que de
nom, personne ne la gagnait, elle dormait une Manche et revenait à son
propriétaire. Le geste ne rapportait rien à qui le faisait. Elle passe
maintenant en main du voleur, disponible dès la Manche suivante.

La Fatigue, elle, ne bouge pas : elle met toujours une carte au frigo chez
son propriétaire, sans la transférer. Ce sont deux mécaniques distinctes, et
seule celle de la Phase Repos était visée.

#### Et ce vol a fait tomber un bug qui mangeait des cartes

Les mains ne comptent plus six cartes toutes distinctes : un voleur peut
détenir deux exemplaires du même titre. Un invariant de comptage a été écrit
pour ça — et il a immédiatement crié, sur 200 parties : 24 cartes en jeu
devenaient 23, puis 22.

`programCards` validait par `hand.includes(id)` puis retirait par
`hand.filter((id) => !cardIds.includes(id))`. Un filtre supprime TOUTES les
copies : programmer un exemplaire détruisait l'autre. Le bug était là depuis
toujours, simplement inatteignable tant qu'aucune main ne pouvait contenir de
doublon. Il retire désormais UN exemplaire par carte demandée, et refuse la
demande si la main n'en contient pas autant.

**L'invariant a changé de forme au passage.** Il vérifiait que CHAQUE main
détient exactement les 6 cartes ; c'est faux depuis le nouveau vol. Il
vérifie maintenant que le TOTAL en jeu ne bouge pas — `6 × nbJoueurs` — ce
qui attrape toujours une carte perdue ou créée, sans interdire les
transferts. Après correction : 200 parties, zéro violation, zéro anomalie.

### Le Bloc Vert ne valait rien pour l'IA

« Personne n'a voulu prendre un bloc vert alors que c'est fort, ça va
n'importe où sur une catégorie avec une couleur. »

Mesuré avant de toucher à quoi que ce soit : **2,45 Verts ramassés par
partie** sur les 5 du plateau, et 73 Titans sur 160 finissant sans aucun.

La cause est une incohérence entre deux calculs de score du même module.
`evaluatePosition` chiffre une position avec `bestVertAssignments` — donc en
posant les Verts là où ils rapportent le plus. `valeurAPortee`, qui chiffre
ce qu'un bloc à portée ferait au total, appelait le même `computeFinalScore`
avec `{}` : aucun Vert posé nulle part, donc un Vert dans le Repaire valant
zéro. L'IA voyait un joker gratuit comme un bloc sans valeur.

Après correction : **2,95 Verts par partie**, et 99 Titans sur 160 en ont au
moins un. Le reste est probablement du jeu correct — prendre un Vert demande
de raser un Téléporteur, ce qui coûte, et rapproche la fin par Vide Spatial.

### Un Titan fantôme bloquait une charge

Trouvé en cherchant le bug du Titan disparu. Le calcul des cibles de Tête en
Avant construisait sa carte d'occupation à la main
(`titanState.players.forEach(...)`) au lieu de passer par `indexerTitans`, qui
EXCLUT les Titans hors de BIG CITY. Un Titan sorti du ring bloquait donc à
l'écran une case que `resolveTeteEnAvant` — qui passe, lui, par
`indexerTitans` — aurait acceptée. La charge s'arrêtait avant une case vide.

### Le Titan disparu : la cause n'est pas trouvée, et voici ce qui est écarté

« J'ai créé un bug avec un warp into téléporteur, j'ai disparu du plateau et
je ne peux plus jouer sauf faire défausser une carte. »

Le symptôme décrit exactement l'état `horsPlateau` : un Titan hors de BIG
CITY ne peut plus que défausser, et il n'apparaît plus sur la grille.

**Piste suivie et écartée**, écrite ici pour ne pas la refaire : l'effet de
rentrée lit l'état des Titans dans une ref synchronisée par un effet déclaré
plus bas dans le même fichier, donc exécuté après lui. Cela ressemble
beaucoup à la cause. Un test a été écrit pour reproduire ce scénario — il
passe. Les Titans sont mutés EN PLACE dans tout ce projet : la ref pointe sur
les mêmes objets que l'état, un commit de retard voit donc la même mutation.

Ce qui reste : `tests/application/rentree-titan-ejecte.test.jsx`, le filet qui
manquait — aucun test ne vérifiait qu'un Titan sorti revient, ni que sa
rentrée lui coûte bien une case de Mouvement gratuit. Et une campagne de
200 parties avec vérification des invariants après chaque action, qui ne
produit plus aucune anomalie.

**Pour aller plus loin il faut la partie.** Le bouton « Signaler » enregistre
l'état exact, graine comprise : c'est ce qui permettra de rejouer le cas au
lieu de le reconstituer.

### Un point de règle laissé ouvert, volontairement

Nikola écrit que pour se faire prendre un Vert, « faut que ça soit pas une
RAGE ». Le moteur applique l'inverse, et c'est un ruling explicite de lui du
2026-08-18, verrouillé par `tests/domain/rage-socle-vert.test.js` : « LE VERT
EST CIBLABLE PAR UNE RAGE, alors que `getDilOptions` le protège. La RAGE est
plus brutale, c'est ce qui la distingue. »

Les deux lectures s'excluent, sur les deux moitiés de la règle. Rien n'a été
changé : ce genre de règle s'exprime par une ABSENCE dans le code, et une
absence se « corrige » très bien par erreur en croyant réparer un oubli —
c'est écrit noir sur blanc à côté de `canRage` depuis le 18 août. La question
est posée, elle attend une réponse.

## Non publié — dix-huitième passe du 2026-08-28 (l'IA reprise à la racine, et une règle relue)

Quatre demandes de Nikola après une partie jouée en Expert, dont une qui
défait le travail de la veille et une qui touche le cœur du jeu.

### La règle de la tour de débris, relue à l'envers

La passe précédente avait lu « un Titan ne peut pas cohabiter avec une tour
de débris » comme une règle d'OBSTACLE : un Amas bloquait le passage et
l'arrêt, sur six chemins du moteur, avec un invariant et des tests pour le
tenir. Nikola a précisé : « si un Titan peut cohabiter avec une tour de
débris, il peut également se déplacer volontairement dessus grâce à son
passif. En revanche, si le déplacement n'est pas effectué volontairement via
son passif, la tour bascule. »

C'est une règle d'ARRIVÉE, pas d'obstacle, et les deux moitiés comptent :

- **J'y monte par mon Mouvement gratuit, j'y reste.** La tour tient sous moi,
  je l'ai choisie. Tout ce que la veille avait fermé — déplacement, portée,
  rentrée sur le plateau, repli, atterrissage de Boing Boing — est rouvert.
- **J'y arrive sans l'avoir choisi, elle bascule.** Projeté par une chaîne,
  poussé par une charge, replié dessus : ses débris tombent un par un sur les
  cases autour, chaque Titan touché est bousculé d'une case, et la Bagarre
  revient à qui a provoqué la chute. C'est l'Écroulement que Boing Boing
  déclenche depuis le 2026-08-16, appliqué aux arrivées subies.

**La bascule est une passe de fin de résolution, et c'est un choix de
conception, pas un raccourci.** Le moteur de projection ne déplace pas le
Titan : il calcule un point de chute, et huit résolveurs différents écrivent
`titan.cell` au retour. Tester à l'arrivée aurait demandé de modifier les
huit. Tester à la fin n'en demande qu'un — et le test de fin est EXACT, pas
approché : le seul chemin par lequel un Titan monte volontairement sur une
tour est `resolveFreeMovement`, qui n'appelle aucun résolveur de carte. Un
Titan debout sur un Amas à la fin d'une carte y est donc arrivé subi, sans
exception. Il n'y a rien à mémoriser.

**Ce qui reste de la veille**, et qui méritait de rester : `estAmas` (le seuil
de deux débris, nommé une fois au lieu d'être recopié quatre fois) et
`poserDebrisAuSol` (les onze écritures de débris du moteur passent par une
seule ligne). L'invariant `titan-sur-amas` a été retiré : il interdisait ce
que la règle autorise.

Un test porte le nom du piège — Boing Boing atterrit sur un Amas, c'est ce
qui déclenche l'Écroulement — parce que ce cas a été « corrigé » puis défait
en écrivant ces deux passes, et qu'il se recassera de la même façon.

### Quatre niveaux de difficulté, construits en dégradant la référence

« J'aimerais avoir 4 niveaux de difficulté clairement distincts : Facile,
Moyen, Difficile, Expert. Je crois qu'il y a un souci dans la description ou
dans l'ordre présenté sur la page de mise en place. »

Il y en avait trois, et ils portaient des noms de JOUEUR — Novice, Confirmé,
Expert — hérités de l'easter-egg qui dévoile le profil d'une IA. Sur l'écran
d'accueil, régler « Novice » voulait dire « je veux une partie facile »,
c'est-à-dire l'inverse de ce que le mot désigne. Le réglage était en plus
rangé en bas avec le Seuil Apocalypse, sous le nom « Niveau des IA », et deux
de ses trois entrées décrivaient un TIRAGE (« Mêlé », « Confirmé mini »)
plutôt qu'un niveau.

L'échelle porte donc les mots de la difficulté, partout — accueil, profil
dévoilé, campagnes de mesure. Et elle remonte juste sous la sélection des
joueurs, à la même taille : après « qui joue », la question suivante est
« contre quoi ». Chaque entrée dit en une ligne ce que l'IA sait faire de
plus que la précédente.

**Elle est écrite du haut vers le bas, comme Nikola le demande** : « module
vers le bas l'IA la plus forte, c'est elle qui doit servir de référence ».
Expert est complet ; chaque barreau du dessous lui RETIRE un regard nommé, et
aucun ne reçoit de comportement propre. Il n'existe pas de mauvaise règle
écrite pour les faibles, seulement des choses qu'ils ne voient pas.

    UN EXPERT SEUL contre trois IA du niveau teste, 180 parties par barreau

      table de 3 x Facile      l'Expert gagne 84,5 % des parties
      table de 3 x Moyen       l'Expert gagne 63 %
      table de 3 x Difficile   l'Expert gagne 30,5 %

    UN DIFFICILE SEUL, meme protocole

      table de 3 x Facile      le Difficile gagne 67 %
      table de 3 x Moyen       le Difficile gagne 43 %
      table de 3 x Expert      le Difficile gagne 19 %

(25 % = a egalite.) Quatre barreaux monotones, nettement separes, et separes
DEUX A DEUX — c'est le point qui manquait aux mesures precedentes. Comparer
chaque niveau au seul Expert ne dit pas si les niveaux se distinguent entre
eux : quand la reference s'ameliore, tous les ratios baissent ensemble et les
deux premiers barreaux finissent colles. Le premier espacement essaye ce
jour-la donnait Facile et Moyen a moins de deux points l'un de l'autre, sans
que la mesure contre l'Expert le laisse voir.

`mesure-forces.mjs` accepte donc une force de reference
(`REFERENCE=difficile npm run forces`), et c'est ce qui a fait re-espacer
l'echelle sur la largeur de recherche : 0, 2, 4, 10.

**La force n'est plus tirée au sort.** Elle l'était, uniformément : à trois IA
en face, 25,9 % des parties comptaient deux débutants ou plus et 29,6 %
n'avaient aucun Expert. Une soirée sur quatre tombait sur une table molle
sans qu'aucun réglage n'ait bougé — c'est une partie de ce que Nikola a lu
comme « les IA sont moins fortes qu'avant ». Le niveau choisi s'applique
désormais à toutes les IA ; la variété change de porte, ce sont les
TEMPÉRAMENTS qui restent tirés au sort, et ils ne font pas varier la
difficulté annoncée.

### L'IA de référence, reprise là où elle était structurellement aveugle

« Je veux vraiment qu'on soit au top du top concernant la compréhension des
règles et la qualité des décisions de l'IA. »

Mesure de contrôle avant de commencer, et elle a réorienté toute la passe :

    4 Experts identiques   1er 42,7   4e 22,8   ecart 1er-2e 8,0 (mediane 6)
                           74 % des parties finissent a moins de 10 points

Et apres toute la passe, sur 240 parties : ecart 1er-2e 7,93 (mediane 6),
71,7 % des parties a moins de 10 points. L'objectif de Nikola etait deja
tenu avant, il l'est toujours apres — ce n'etait pas la question.

**L'équilibre demandé est déjà là quand les quatre joueurs se valent.** Le
92-46 de Nikola n'est donc pas un problème de barème : c'est qu'il marque
deux fois le score du meilleur Expert. La cible n'était pas « resserrer les
scores », c'était « rendre l'IA meilleure », et l'écart se referme tout seul.

#### Le tour se décidait dans le mauvais ordre

C'est le défaut le plus coûteux, et il était invisible parce qu'il n'était
pas dans une formule : il était dans l'ORDRE. Un tour vaut Mouvement gratuit,
puis carte. Le planificateur les décidait l'un après l'autre, chacun en
aveugle du suivant — la case était choisie SANS SA CARTE, puis la carte
faisait de son mieux depuis là.

Or les deux décisions n'en font qu'une. Tout Casser tire son énergie du
nombre de cases occupées du Périmètre : se placer au contact de trois
bâtiments double sa puissance, et aucun déplacement ne pouvait le savoir.
Tête en Avant veut un axe aligné, Boing Boing veut de la place. L'IA se
plaçait pour ramasser, puis jouait sa carte depuis une case qui ne lui
servait à rien. C'est ce qu'un joueur humain fait sans y penser — il regarde
sa carte avant de bouger.

`planTour` développe donc les meilleures cases ET la meilleure carte depuis
chacune. Le produit complet serait hors de prix ; on garde les
`largeurJointe` premières cases au tri statique, rester sur place comprise.

La largeur a été mesurée, pas devinée — c'est un vrai levier, et il plafonne :

    largeur 10 contre 4     +2,50 pt/partie   61,7 % de victoires
    largeur 25 contre 10    +0,34 pt/partie   51,7 % de victoires

Dix cases, donc. Au-delà, on paie du temps de calcul pour du bruit.

#### Ce qu'un coup OFFRE, que rien ne chiffrait

Demande textuelle : « si je joue cette carte alors que ce Titan n'a pas joué,
j'offre quoi possiblement ». `valeurAPortee` ne regardait que MON Périmètre.
Un Tout Casser qui pulvérise un bâtiment éparpille quatre blocs autour de
lui ; si trois tombent devant le voisin qui joue juste après, je viens de lui
servir son tour, et rien dans la note ne le disait.

`valeurOfferte` ne compte que les Titans qui n'ont PAS encore joué ce round,
et c'est ce qui rend le terme jouable plutôt que paralysant : ce que je pose
devant un Titan qui a déjà joué, je peux encore aller le prendre — c'est un
dépôt, pas un cadeau.

**Son poids a été mesuré, et il fallait le baisser beaucoup**, ce qui est le
résultat le moins confortable de la passe. Posé à 0,5 par analogie avec la
nuisance, il COÛTE des points : l'éteindre rapporte +2,07 par partie (56,9 %
de victoires, 320 parties), le baisser à 0,15 en rapporte +1,07 (53,8 %). Il
reste à 0,15.

La raison de ne pas l'éteindre tient à une limite du protocole, qu'il vaut
mieux énoncer que masquer : en duel, les deux camps portent le même réglage,
donc ils sont également prudents, la valeur défensive du terme s'annule des
deux côtés, et il ne reste que son coût — casser moins, alors que la
destruction est le moteur du score. Ce que le duel ne peut pas mesurer est
exactement la situation de Nikola : un adversaire humain qui ramasse tout ce
qu'on laisse tomber devant lui. 0,15 est le meilleur compromis mesurable ;
monter demanderait une mesure contre un humain, que ce dépôt ne sait pas
faire.

#### La Manche se programmait trois fois de suite sur le même plateau

Les six cartes de la main étaient notées dans l'état ACTUEL, et les trois
meilleures retenues. Chacune était donc évaluée comme si elle était jouée la
PREMIÈRE. Le défaut se voit dès qu'on l'écrit : les trois cartes visent le
même bâtiment, le même voisin, la même case ; la première jouée, les deux
autres sont mortes. Une Manche sur quatre, décidée avant le premier coup.

La référence programme en séquence : elle choisit la deuxième carte en sachant
ce que la première aura fait du plateau.

#### L'Adrénaline ne se décide plus à la main

Le plafond de mise exploré était figé à 2 « parce qu'au-delà le gain de portée
ne compense presque jamais les points d'une Adrénaline conservée ». C'était
une décision prise À LA PLACE de l'évaluation, laquelle compte déjà
l'Adrénaline conservée : une mise qui ne vaut pas le coup se note toute seule
moins bien. Le plafond n'a de raison d'être que le temps de calcul, et il vit
maintenant dans les réglages.

Même chose pour la mise cachée de Faut Pas Me Chauffer, dernier choix du jeu
encore décidé par une règle écrite à la main (« engage 1 si mon avance est
nulle, 2 si je suis nettement derrière »). Elle devient un paramètre du coup :
la recherche essaie chaque mise, comme pour une portée de Tête en Avant.

#### Ce qu'un vol coûte, des deux côtés

« Si elle donne ce bloc, combien de points elle perd, combien elle en donne à
l'adversaire, si l'action est effectuée en RAGE ou en DIL. »

L'arbitrage d'un DIL ou d'une RAGE ne lisait que le BARÈME de la couleur.
C'est faux dès qu'un bonus de fin entre en jeu, et ces bonus sont ce qui
décide une partie : un bloc peut valoir 0 au barème et 10 au décompte s'il
fait basculer les +10 du plus grand nombre de Roses. La RAGE choisissait en
plus sur son seul gain, sans regarder ce que le bloc coûtait à l'autre — et
ne visait l'Adrénaline que si le Repaire était vide, alors que voler la
dernière Adrénaline de qui s'apprête à annuler un Dilemme vaut souvent mieux
qu'un bloc.

#### Ce que ça donne, mesuré en duel même-partie

Nouvelle IA contre ancienne, dans LES MÊMES parties, sièges croisés,
320 parties :

    ancienne IA   -6,24 point par partie   29,4 % de victoires

Six points par partie, très au-dessus du seuil de bruit de ce dépôt (2
points). C'est le plus gros écart jamais mesuré entre deux réglages ici.

**Une piste mesurée et gardée malgré un résultat neutre**, et il faut le dire
franchement : l'arbitrage des vols au score complet donne +1,2 point à la
version qui s'en passe, pour 50,0 % de victoires — donc rien, dans le bruit.
Elle est conservée parce que c'est le modèle JUSTE et que Nikola l'a demandé
nommément, pas parce qu'elle rapporte des points.

#### Deux divergences du simulateur, trouvées en chemin

- **Le trophée Arc-en-ciel n'était jamais attribué en campagne.** Le décompte
  final passait `null` comme gagnant : cinq points que le jeu réel donne et
  que le simulateur ne donnait pas. Toute mesure d'équilibrage était faussée
  d'autant.
- **`structuredClone` plafonnait la recherche.** Le clone d'état est la boucle
  chaude du module — un par coup candidat, des centaines par tour. Une copie
  écrite à la main pour cette forme-là a divisé le temps de campagne par
  quatre, et c'est ce qui a rendu la recherche conjointe abordable.

#### Où vont les points, après

`npm run composition` sur 60 parties, avant et après. Trois lignes du
décompte ont changé de nature :

    ligne                  ecart 1er-4e AVANT   APRES
    socles                        0,20           2,60
    collectionneurBonus           1,00           2,07
    rainbowBonus                  0,50           0,83

Les Socles étaient une ligne que PERSONNE ne jouait : le 1er et le 4e en
avaient autant, à 0,20 point près, alors qu'ils pèsent près d'un cinquième du
score. Ils se disputent maintenant. Le trophée Collectionneur et l'Arc-en-ciel
suivent — l'Arc-en-ciel n'était d'ailleurs jamais attribué en campagne, voir
plus bas.

Une ligne reste à l'envers, et c'est SAIN : l'Adrénaline conservée rapporte
plus au 4e (2,77) qu'au 1er (2,40). Celui qui gagne dépense sa réserve pour
allonger une portée ou emporter un duel, celui qui perd la garde en main. Deux
points conservés valent moins qu'une case de plus au bon moment.

### Deux tests qui encodaient l'ancienne IA

Ils tombaient, et pour de bonnes raisons — c'est-à-dire qu'ils mesuraient une
propriété de l'IA d'avant en croyant mesurer une propriété du moteur.

- **« des cartes sont réellement jouées »** comparait le compte de cartes au
  maximum THÉORIQUE de 4 Manches, ce qui suppose que toute partie va au bout.
  Ce n'est vrai que d'une IA qui casse peu : la référence termine maintenant
  une partie sur trois avant la dernière Manche, par pénurie de blocs ou
  Apocalypse Urbaine. Le test lisait 36 cartes en 3 Manches — un compte
  PARFAIT — contre un plafond de 48 qui n'existait plus. Il se lit désormais
  sur les Manches réellement jouées.
- **La campagne de l'échelle dépassait son délai de 30 secondes.** La
  référence développe dix cases avant de choisir sa carte : un tour coûte
  plusieurs fois plus cher. Délai porté à 90 s, avec la raison écrite à côté —
  c'est un prix assumé, pas une lenteur accidentelle.

### Trois outils de mesure, parce qu'il en manquait un à chaque question

- `npm run ecarts` — la DISPERSION d'une table (1er-2e, 1er-4e, part des
  parties serrées). C'est lui qui a montré que l'équilibre demandé était déjà
  atteint entre joueurs de même force, et donc que la question était l'IA.
- `npm run composition` — d'où viennent les points, ligne par ligne du
  décompte, 1er contre 4e. Une ligne où le 1er et le 4e sont à égalité est une
  ligne que personne ne joue.
- `npm run forces` et `npm run duel` existaient ; le second reste le seul
  protocole capable de trancher un écart de moins de deux points.

## Non publié — dix-septième passe du 2026-08-27 (une tour qu'on ne partage pas, et une barre en trop)

Six points relevés par Nikola après la partie suivante. Un touche la règle,
deux les pictogrammes, trois l'écran — et le point de règle a ouvert, à lui
seul, six chemins par lesquels le moteur fabriquait la position qu'il venait
d'interdire.

### « Un Titan ne peut pas cohabiter avec une tour de débris »

Le ruling du 2026-08-19 disait qu'un Titan se déplace sur un débris « sans
aucune condition particulière ». Celui-ci en pose la limite : une TOUR — donc
un Amas, deux débris empilés ou plus — n'est plus du sol qu'on enjambe, c'est
un volume. Un débris ISOLÉ continue de cohabiter, sans changement.

Le moteur disait déjà cela ailleurs sans que le déplacement le sache : Tête en
Avant traite un Amas sous le Seuil 4 comme « trop massif, bloque le Titan
comme un mur ». Les deux lectures du même volume concordent maintenant.

**La règle a été écrite à un seul endroit, puis un invariant a cherché les
autres.** `elementAuSolBloqueArret` rend `true` sur un Amas, et c'est tout ce
qu'il y avait à écrire pour le déplacement. Un invariant `titan-sur-amas` a
ensuite été ajouté au contrôle d'intégrité, et une campagne de 30 parties l'a
violé **28 fois**. Aucun de ces chemins n'aurait été trouvé à la lecture :

- **la projection** — un Titan projeté sur un Amas montait DESSUS et s'y
  arrêtait, par la branche de Formation d'Amas, qui ne distinguait pas le
  béton du Titan. Il s'arrête désormais sur la case précédente, comme devant
  un bâtiment, et l'initiateur choisit où le reposer ;
- **la rentrée sur le plateau** — « case libre » ne consultait que le bâtiment
  et l'occupant. Elle passe par la même fonction que le déplacement ;
- **l'immunité de l'initiateur** — le livret dit qu'un élément de ton Tout
  Casser qui revient sur ta case « s'arrête immédiatement dessus ». S'il y en
  avait déjà un, Tout Casser bâtissait une tour sous les pieds de qui l'avait
  jouée. L'immunité tient, c'est le débris qui s'arrête avant ;
- **le repli** — le seul geste du jeu qui pose un élément à la main pouvait
  fabriquer la cohabitation dans les deux sens (un Titan sur un Amas, un
  débris de trop sur un Titan qui en portait un). Ces deux cases sortent de
  la liste proposée ;
- **la charge de Tête en Avant** — la case libérée par la cible, et le couloir
  laissé par un bâtiment rasé, peuvent recevoir un débris de rebond pendant la
  résolution. L'attaquant recule si une tour s'y est formée ;
- **le Patatras** — l'Amas balayé peut se reconstituer si les blocs éjectés
  retombent sur place. Le Titan n'y monte alors pas.

**Onze écritures de débris sont devenues une.** Le moteur écrivait
`looseBlocks[k].push(bloc)` à la main en onze endroits : fin de trajectoire,
bloc cassé par ricochet, écroulement, repli, Socle libéré. Tant que poser un
débris ne consistait qu'à empiler, la duplication ne coûtait rien ; le jour où
elle a une conséquence, onze endroits auraient dû s'en souvenir. Ils passent
tous par `poserDebrisAuSol`, qui déloge d'une case le Titan sous la tour qui
se forme — c'est ce que le jeu fait déjà partout ailleurs (« dès qu'un élément
arrive sur une case occupée, il projette les éléments présents »). Le seuil
d'Amas, littéral `>= 2` recopié quatre fois, est nommé une fois dans
`estAmas`. Un test vérifie ces deux unicités : c'est le piège de ce projet, et
il est désormais gardé.

**Une exception, et elle est voulue : Boing Boing.** Sauter SUR un Amas reste
permis — c'est le geste qui déclenche l'Écroulement (ruling du 2026-08-16) et
le seul moyen de faire tomber une tour sans charger dedans. Le Titan s'y pose
le temps de répartir les débris, il n'y cohabite pas. Ce cas a été « corrigé »
en écrivant cette passe, puis défait : un test porte maintenant son nom pour
que personne ne le recasse en croyant appliquer le ruling.

**Ce qu'il reste.** Sur 120 parties, l'invariant se déclenche encore 5 fois,
toutes dans le même cas matériellement forcé : un Amas cerné de tous côtés,
ses débris n'ayant aucune case où tomber, retombent sur la case du Titan, qui
n'a lui-même aucune case libre où être délogé. Le choix est assumé et écrit
dans `poserDebrisAuSol` — mieux vaut une tour sous ses pieds qu'un Titan
effacé du plateau.

### « Je trouve les IA moins fortes qu'avant » — deux causes, dont une que personne ne regardait

Le matin même, la passe précédente avait retiré à l'Expert son **évaluation
différentielle** (`note -= meilleurAdverse × poids`), sur un balayage de six
poids qui la disait monotone-perdante — 97 % à 120 % de ratio Confirmé/Expert.
Nikola a joué dessus le soir, et a trouvé les IA molles.

#### Le protocole était le coupable, et c'est la troisième fois

Ce balayage comparait deux **campagnes séparées**, chacune avec son propre
tirage. C'est exactement le protocole dont l'en-tête de `mesure-forces.mjs`
dit lui-même qu'il ne distingue pas un écart de moins de 2 points du bruit, et
dont l'écart entre deux graines atteint 25 points de ratio à réglage
INCHANGÉ. Deux passes avaient déjà « corrigé » avec lui une hiérarchie d'IA
qui n'était pas corrigée.

Il manquait l'outil qui répond à la vraie question — « ce réglage-ci est-il
meilleur que celui-là ». `scripts/duel-reglages.mjs` (`npm run duel`) fait
jouer les deux réglages **dans la même partie** : quatre Titans de même force
et même tempérament, deux portant la variante. Même plateau, mêmes cartes,
mêmes Événements, mêmes adversaires. Chaque graine est jouée deux fois, la
variante occupant d'abord les sièges 1+3 puis 2+4, ce qui annule les ~3 % que
rapporte le siège du Titan 1. Ce que l'écart contient alors vient du réglage,
et de rien d'autre.

Il repose sur une seule ligne ajoutée au moteur : un profil peut porter un
`reglages` qui surcharge ceux de sa force (`reglagesDe`). Rien dans le jeu ne
s'en sert — un test vérifie que sans surcharge, une force rend exactement
`FORCE_SETTINGS`.

#### Remesure de la nuisance : elle ne coûtait rien

240 parties par tempérament, Expert, sièges croisés :

    opportuniste   +0,25 point par partie   52,5 % de victoires
    agressif       +0,60 point par partie   53,8 % de victoires

(50 % = à égalité.) Le tempérament Agressif est celui qui module la nuisance
le plus fort — s'il devait coûter quelque part, c'est là.

La conclusion du matin était un artefact. **Le terme est rebranché sur
l'Expert**, au poids qu'il avait (0,5), modulé par le tempérament — un
Agressif gêne plus, un Collectionneur nettement moins. C'est ce qui répond à
ce que Nikola décrit : une IA qui ne regarde que son propre score ne fait rien
contre celui qui mène, et au siège d'en face ça se lit comme de la faiblesse,
même quand son total n'a pas bougé. Le Novice et le Confirmé restent à 0 :
gêner n'est pas une lecture de débutant.

**La hiérarchie tient**, revérifiée au protocole habituel après rebranchement
(80 parties par force, 4 graines, opportuniste) :

    Novice / Expert      65,7 à 89,4 %
    Confirmé / Expert    87,8 à 99,6 %

Aucun Confirmé ne repasse devant l'Expert. Rendre l'Expert gênant ne lui a
donc rien coûté — c'est bien la mesure du matin qui se trompait, pas le terme.

Deux autres pistes ont été mesurées au même protocole et **rejetées, chiffres
à l'appui** — elles sont dans le bruit, et une piste dans le bruit ajoutée
« au cas où » est une complexité qu'on ne pourra plus retirer :

    Confirmé, chiffrage au score complet     +0,23 pt   53,8 %   (240 parties)
    Expert, portée de vue 3 → 4 cases        +0,35 pt   53,3 %   (240 parties)

#### La seconde cause n'est pas dans l'IA du tout : c'est le tirage

Les profils sont tirés au sort à chaque partie, **uniformément sur les trois
forces**. C'est voulu — deux parties de suite ne doivent pas se ressembler.
Mais personne n'avait posé le calcul. À trois IA en face :

    2 Novices ou plus à la table   25,9 %
    aucun Expert à la table        29,6 %

Une soirée sur quatre tombe donc sur une table molle, **sans qu'aucun réglage
d'IA n'ait bougé**. C'est une explication suffisante à elle seule de « moins
fortes qu'avant », et elle survivrait à n'importe quel réglage d'évaluation.

L'écran d'accueil reçoit donc un **Niveau des IA** : *Mêlé* (le tirage
d'avant, inchangé, toujours par défaut), *Confirmé mini* (plus de Novice à la
table), *Expert* (les trois au maximum). Il ne touche pas à l'évaluation — il
borne le tirage par le bas, rien d'autre, et les tempéraments continuent
d'être tirés librement : c'est la force qu'on règle, pas la personnalité.

### Les deux pictogrammes, tranchés sur planche

Huit gants de boxe et cinq arcs-en-ciel avaient été rendus côte à côte, de 11
à 48 px. Nikola a choisi.

- **Le gant : la variante « C droite », sans son arc bas.** Deux volumes
  seulement — la manchette, un rectangle debout, et la mitaine, un demi-disque
  franc qui part vers la droite. L'arc retiré figurait les doigts repliés :
  à 13 px il se collait au bord bas du demi-disque et refermait la silhouette
  en pâté, c'est-à-dire qu'il coûtait exactement ce qu'il prétendait ajouter.
  C'est le sixième gant de la série, et le premier à tenir en deux volumes.
- **L'Arc-en-ciel : la variante « R2 segments ».** Un SEUL arc, épais, découpé
  en cinq tronçons bout à bout, au lieu de cinq bandes concentriques. Les cinq
  couleurs sont alors à égalité — même rayon, même épaisseur, même longueur —
  et l'épaisseur ne dépend plus du nombre de couleurs. C'est ce qui règle le
  défaut de la version précédente : cinq bandes sur une grille de 24 rendue à
  13 px donnent une bande intérieure d'un demi-pixel, et c'est pour ça que le
  Vert avait dû être sorti de l'arc et posé en cœur plein — il se lisait alors
  comme autre chose que ses quatre voisines.

### La barre au-dessus du plateau est supprimée

« Supprime toute cette barre. » Elle empilait sur une seule rangée de
0,68 rem : la Manche, la mention DERNIERE MANCHE, le nom du Détonateur, le
compte de bâtiments, son seuil, et quatre pastilles de validation. Cinq
informations différentes, dont **trois étaient déjà écrites ailleurs à
l'écran** — la Manche et le Détonateur dans le fronton, la validation sur la
plaque de chaque Titan.

Les deux qui n'existaient qu'ici ont déménagé, chacune à l'endroit qui la rend
lisible :

- **Le compte de bâtiments et son seuil montent au fronton**, à côté de la
  Manche. C'est leur place : ce sont les DEUX comptes à rebours de la partie,
  et le premier des deux qui tombe l'arrête. Les voir côte à côte est ce qui
  permet de savoir laquelle des deux fins arrive — une Manche 3/4 avec 7
  bâtiments debout pour un seuil de 6 ne se joue pas comme une Manche 3/4 avec
  18 debout.
- **La dernière Manche se dit sur le compteur lui-même.** Le 4/4 passe au
  rouge d'arrêt, libellé compris, et une étiquette cernée « Dernière Manche »
  se pose sous lui, à la taille du fronton. C'est le même registre que la
  couleur de phase : lisible de l'autre bout de la table sans lire un mot, là
  où le « · DERNIERE MANCHE » précédent était un texte de 0,68 rem au bout
  d'une rangée chargée.

Il ne reste dans ce panneau que ce qu'il sait dire seul : les blocs encore en
jeu, couleur par couleur.

### L'ordre de passage descend sur les plaques des Titans

« Sois sûr qu'on ait l'information de l'ordre du tour des Titans par rapport
au passage du bloc Détonateur avec la nouvelle Manche. »

C'est le point qui se perd le plus vite à la table, parce que DEUX ordres
coexistent : l'ordre fixe des Titans (1, 2, 3, 4), qui ne bouge jamais, et
l'ordre d'initiative de la Manche, qui pivote — le Détonateur ouvre chaque
round, et le jeton passe au Titan suivant à chaque nouvelle Manche. En
Manche 3 avec le Détonateur sur le Titan 3, on joue 3, 4, 1, 2 : le Titan 1
est TROISIÈME, et le seul endroit qui le disait était la barre supprimée.

Le rang est donc écrit sur la plaque de chaque Titan, à côté de son nom, et le
Détonateur porte son pictogramme sur le rang 1 : les deux informations sont la
même, elles sont maintenant au même endroit. L'infobulle nomme qui joue avant
lui, et rappelle au Détonateur que le jeton passera au suivant à la Manche
prochaine. La règle du pivot ne vit pas dans l'affichage — elle reste dans
`RoundPanels`, qui la tire de `ordreJeu`.


## Non publié — seizième passe du 2026-08-27 (retours de table, et l'angle mort des IA)

Huit points relevés par Nikola après une partie jouée sur la refonte de la
borne. Sept touchent l'écran, un touche les cerveaux — et c'est celui-là qui a
mis au jour une hiérarchie d'IA inversée depuis plusieurs passes.

### Les pictogrammes

- **Le gant de boxe, refait, et les deux pistes remises à l'endroit.** Le gant
  était dessiné debout : mitaine et manchette formaient deux rectangles
  empilés, et à 15 px on y lisait une borne, pas un gant. Il est désormais
  couché, comme un gant qui frappe — la mitaine devient un demi-disque franc,
  le pouce a la place de sortir sur le côté au lieu d'être écrasé sous la
  masse. Trois volumes qui ne se touchent pas survivent à la réduction, trois
  volumes empilés non. Les couleurs suivent : **rouge pour la Bagarre, orange
  pour la Destruction**, elles étaient inversées.
- **Faut Pas Me Chauffer prend le gant.** Elle avait son propre pictogramme,
  deux blocs qui se mesuraient. C'est la carte de Bagarre du jeu : la voir
  porter le signe de la Bagarre dit d'un coup d'œil sur quelle piste elle
  marque. Son ancien dessin, devenu orphelin, est retiré.
- **Le Trophée Arc-en-ciel a enfin une icône, et c'est celle du jeu.** Il
  était rendu par l'émoji 🌈 au décompte et au livret, et par la *Lanterne
  Rouge* — un tout autre objet — dans le bandeau des Titans. Deux dessins pour
  un trophée, dont aucun ne disait ce qu'il récompense. Il se gagne en
  possédant un bloc de chaque couleur : son icône reprend donc le code couleur
  du jeu, quatre arcs et un cœur Vert. Le Vert est le cœur plein et non une
  cinquième bande — cinq bandes sur une grille de 24 rendue à 13 px donnent
  une bande intérieure d'un demi-pixel, c'est-à-dire une couleur qui
  disparaît.
- **Plus d'émojis dans les tableaux de décompte.** 💪 💥 💉 🗿 🌈 laissent la
  place aux pictogrammes déjà utilisés partout ailleurs, dans leurs couleurs.
  Une piste se reconnaît au même signe partout où elle apparaît.
- **Le menu des Verts porte les blocs.** La liste n'énonçait que des noms —
  « Barème Habitation », « Barème Boutique » — alors que tout le reste de
  l'écran désigne une couleur par son bloc isométrique. Il fallait retraduire
  un nom en couleur, de tête, à la seconde où l'on tranche le dernier geste de
  la partie.

### Les pistes ADN se comptent, elles ne se comparent plus

Les deux pistes étaient des barres proportionnelles, remplies par rapport au
meilleur de la table. Nikola : « fais plutôt ça avec des petits carrés — 2 sur
la piste ADN, 2 carrés ; 5 sur la piste, 5 petits carrés. »

Le défaut est plus profond qu'une question de goût. Une barre
PROPORTIONNELLE ment sur ce qu'elle mesure : le meneur avait toujours la barre
pleine, qu'il soit à 2 points ou à 14, et deux Titans à 3 et 4 points
affichaient 75 % et 100 % — un écart énorme pour un point. Comme la barre du
meneur ne bougeait plus, on avait exactement l'effet de chargement inversé que
Nikola décrit : tout le monde régressait quand lui avançait.

Un carré par point est une échelle ABSOLUE. On compte, on n'estime pas une
longueur, et l'écart entre deux Titans se lit en carrés, donc en points. La
file s'arrête à huit et écrit le reste en clair (« ▪▪▪▪▪▪▪▪ +4 ») : mieux vaut
ça qu'une file de carrés d'un pixel. Le meneur est signalé sur son COMPTE et
non par un cerne sur le dernier carré — un cerne tombait sur le huitième dès
qu'une piste dépassait le plafond, c'est-à-dire sur un carré qui n'est pas le
dernier.

### Le plateau remonte vers ses numéros

Les quatre pistes d'attente hors plateau étaient figées à 24 px, occupées ou
non. Elles sont vides la plupart du temps : la ligne des numéros se retrouvait
donc à 28 px du plateau quand la colonne des lettres n'en était qu'à 20 — le
repère horizontal décroché, le vertical collé. Une gouttière vide tombe à
12 px, la moitié comme demandé. Une gouttière OCCUPÉE s'ouvre en grand, à
30 px : l'icône du Titan qui attend n'y est plus à l'étroit, et c'est
justement le moment où l'on veut la voir.

### Le pré-score, pour se projeter avant de placer un Vert

« Au moment du placement des Verts, j'ai besoin de savoir les pré-scores des
autres sans leur Vert pour mieux me projeter — pareil pour les IA. »

Le tableau des Repaires disait déjà combien de blocs chacun détient, couleur
par couleur. Il ne disait pas ce que ça FAIT : additionner quatre barèmes, le
bonus Rose, les Socles, deux classements de piste et l'Adrénaline, pour quatre
Titans, de tête, au moment précis où l'on décide. Une ligne de **pré-score,
Verts de tout le monde exclus**, avec l'écart au meneur, ferme ce trou. Aucun
secret n'est éventé : ce total ne contient le Vert de personne, pas même celui
de qui le lit.

**Et les IA jouaient paravent baissé.** Elles recevaient les Verts DÉJÀ POSÉS
par les humains et par les IA passées avant elles. Le placement est secret,
révélé simultanément : cette information n'existe pour personne à cet instant.
La dernière IA à trancher était donc la mieux renseignée des quatre, ce qui
faisait dépendre sa force de son numéro de Titan. Elles décident maintenant
sur la même photo que le joueur en face.

### Ligne d'Adrénaline : le tableau promettait 3 points, le décompte en payait 2

Le ruling du 2026-08-19 a fait passer l'Adrénaline conservée de 3 à 2 points.
`POINTS_PAR_ADRENALINE` a suivi, la ligne du tableau de décompte non : elle
annonçait « ×3 » au-dessus d'un total calculé à 2. Le multiplicateur est
désormais LU depuis le moteur, il ne peut plus diverger.

### L'analyse des IA : trois angles morts, et une hiérarchie inversée

« Améliore l'analyse des IA, je pense qu'elle rate encore des axes
d'amélioration sur certaines situations. »

La première chose faite a été de MESURER avant de toucher quoi que ce soit, au
protocole habituel — un Expert contre trois IA de la force testée, 60 parties ×
2 séries de graines. Le relevé a montré autre chose que ce qui était cherché :

    tempérament       Novice/Expert   Confirmé/Expert
    opportuniste        77-80 %         106-110 %
    collectionneur      83-88 %          92- 96 %
    agressif            92-96 %          99-103 %

**Le Confirmé battait l'Expert** sur deux tempéraments sur trois, et le Novice
agressif était à 4 % de l'Expert — plus de niveaux du tout sur ce tempérament.
La même inversion avait déjà été diagnostiquée et « corrigée » le 2026-08-19 en
pondérant la nuisance de l'Expert par son tempérament. Elle était revenue.

#### La nuisance de l'Expert lui coûtait des points

Sa seule marque était l'évaluation différentielle : `note -= meilleurAdverse ×
poids`. Balayage sur six poids, deux séries — ratio Confirmé/Expert, plus bas =
meilleur Expert :

    poids   0      0,2     0,5     0,8     1,0     1,6
    ratio  97 %   102 %   101 %   102 %   104 %   120 %

Monotone. Ce n'est pas un problème de dosage, c'est l'arithmétique du jeu à
quatre : coûter trois points au meneur les fait gagner autant aux DEUX AUTRES
qu'à soi, et le tour dépensé n'a rien rapporté. C'est le piège du faiseur de
rois, et aucun réglage ne l'ouvre. Une variante ne déclenchant la nuisance
qu'en fin de partie — quand il ne reste plus de tours pour marquer — a été
écrite et mesurée : elle ne renverse pas la tendance non plus.

Le terme est retiré. Ce qu'il valorisait au passage, **sortir un adversaire de
BIG CITY**, est conservé à part : une éjection est presque toujours le
sous-produit d'un coup qu'on jouait de toute façon, le mauvais échange qui
condamne la nuisance n'existe pas là.

#### Trois choses que l'évaluation ne regardait pas

- **Le Trophée Arc-en-ciel valait zéro pour tout le monde.** `evaluatePosition`
  passait `null` à `computeFinalScore`, en jugeant que ne l'attribuer à
  personne était une sous-estimation identique pour tous, donc sans effet sur
  le classement des coups. C'est faux : ces 5 points sont DISPONIBLES pour qui
  il manque une couleur, et hors d'atteinte pour celui dont un adversaire a
  fait le plein. Aucune IA n'avait donc la moindre raison d'aller chercher sa
  couleur manquante. Corrigé pour toutes les forces — même un débutant voit
  qu'il lui manque une couleur sur cinq.
- **Un bloc au sol était chiffré au seul barème de sa couleur.** Le bonus Rose
  (+10 au plus grand nombre), le trophée Collectionneur, les classements de
  piste n'y entraient pas : un Rose qui faisait basculer dix points valait,
  pour l'IA en route vers lui, ce que valait le Rose suivant. L'Expert chiffre
  désormais un bloc à portée par ce qu'il ferait à son TOTAL. Idem pour les
  Socles, dont le trophée se joue au NOMBRE.
- **La concurrence était supposée, jamais regardée.** Un tas comptait pareil
  qu'un adversaire soit collé dessus ou à l'autre bout du plateau : la décote
  ne connaissait que la distance, et l'IA se mettait en route vers un butin
  déjà perdu. Elle lit maintenant qui est le plus près. Réservé à l'Expert,
  et c'est la mesure qui l'a décidé — voir plus bas.

#### Où placer ces regards : mesuré, pas supposé

La lecture de la concurrence ressemble à de la lecture de plateau élémentaire,
donc à donner aussi au Confirmé. La mesure dit le contraire — 30 parties ×
8 graines, ratio Confirmé/Expert :

    concurrence réservée à l'Expert    98,9 %
    concurrence ouverte au Confirmé   100,9 %

Elle vaut donc des points, et c'est précisément pour ça qu'elle appartient au
niveau du dessus. Relevé final, même protocole que le relevé d'entrée :

    tempérament       Novice/Expert            Confirmé/Expert
    opportuniste     77-80 % → 78-82 %      106-110 % →  89- 99 %
    collectionneur   83-88 % → 87-89 %       92- 96 % →  89-100 %
    agressif         92-96 % → 86-92 %       99-103 % →  98- 99 %

**Aucun Confirmé ne dépasse plus l'Expert**, et le Novice agressif — qui était
à 4 % de l'Expert, c'est-à-dire au même niveau — retrouve un écart de 8 à 14 %.
La hiérarchie Novice < Confirmé < Expert est rétablie sur les trois
tempéraments.

#### Ce que la mesure ne dit pas, et l'ornière du protocole

L'écart entre deux graines atteint **25 points de ratio sur un même réglage**
(85,8 % à 110,3 %). Seules des moyennes sur plusieurs centaines de parties
veulent dire quelque chose, et un écart de moins de 2 points entre deux
réglages ne se distingue pas du bruit. Les regards ajoutés ferment des
situations précises, vérifiées par des tests unitaires nommés ; ils ne sont pas
vendus comme un gain de points chiffré.

Le protocole historique — deux séries de graines — n'y suffisait pas, et
c'est probablement pourquoi la même inversion a déjà été « corrigée » deux
fois. Pire : mesuré à réglages STRICTEMENT IDENTIQUES pour les quatre Titans,
**le siège du Titan 1 rapporte à lui seul ~3 %**. Une lecture historique à
« 97 % » disait en réalité « à égalité », et les 104 % du Confirmé disaient
« il gagne largement ». Toute mesure future se lit contre ce témoin, et sur
huit graines au minimum.

## Non publié — quinzième passe du 2026-08-24 (outils de test, et mise en ligne)

Cinq outils demandés par Nikola pour rendre les tests à la table plus
efficaces, puis le rattachement du dossier local au dépôt GitHub.

### Cinq outils

- **Graine de partie.** L'application n'appelait JAMAIS `setSeed` : le module
  RNG était semé et déterministe depuis longtemps, mais seul le simulateur
  s'en servait. Une partie jouée à la table n'était donc pas rejouable, et sa
  graine n'était même pas enregistrée. Elle est désormais fixée avant toute
  génération (plateau, positions, ordre de jeu, Détonateur et profils d'IA en
  dépendent tous), affichée dans l'en-tête, et saisissable à la configuration.
- **Bouton « Signaler ».** Fige l'état complet dans un fichier : graine,
  plateau, débris, Titans, décisions en attente, 30 dernières lignes de
  journal. Tout est local, rien ne part sur un serveur.
- **Journal filtrable par Titan.** Le rattachement ligne → Titan RÉUTILISE la
  regex qui servait déjà au code couleur, au lieu d'en dupliquer une : la
  couleur d'une ligne et le filtre ne peuvent pas diverger.
- **Animation de la trajectoire.** `projectInDirection` construisait déjà la
  trace du trajet pour ses garde-fous ; elle porte donc exactement ce qu'il
  faut pour rejouer le vol, rebond et traversée de faille compris — ce
  qu'aucun calcul après coup ne saurait reconstituer. Collectée sur le modèle
  partagé de `replis`, rejouée en parallèle, visible en 2D et en 3D, effacée
  par un « Annuler ». Purement visuel : la résolution reste inchangée.
- **Pulsation des cases d'action.** 2,4 s par cycle, 6 % d'amplitude, sur les
  seules cases cliquables. « On teste mais pas sûr » : le retrait tient en une
  ligne, documentée sur place.

### Le dépôt est enfin en ligne

Le dossier local n'avait aucun remote : quinze passes de travail ne vivaient
que sur le disque, pendant que GitHub portait un instantané du 12 août
téléversé à la main. **Fusion plutôt que `push --force`** : les 12 commits
publiés sont conservés, le contenu local l'emporte sur les fichiers communs,
et les workflows GitHub Actions — qui n'existaient QUE sur le distant et font
vivre la page — sont récupérés.

Écartés du dépôt au passage : `ScoringPanel.jsx` et `TitanPanel.jsx`, que la
fusion avait fait revenir alors qu'ils avaient été supprimés volontairement le
18 août ; les deux `.bat`, lanceurs Windows qui restent sur le disque de
Nikola mais n'ont pas leur place sur un dépôt que GitHub Actions construit ;
et `.codegraph/`, artefact d'outillage.

### Le CI, et trois hypothèses dont deux fausses

Le premier passage en CI a échoué alors que tout était vert en local. Deux
hypothèses successives se sont révélées fausses : le budget de temps des
tests (relevé quand même de 30 s à 120 s — un seul test consommait 98 % des
30 s) et la casse des imports Windows → Linux (auditée, saine).

La vraie cause a été trouvée en REPRODUISANT l'environnement plutôt qu'en
devinant : sous Node 20, jsdom 30 charge undici, qui appelle
`webidl.util.markAsUncloneable`, absente de Node 20. La suite mourait au
démarrage — 33 erreurs, aucun test exécuté, en 3 secondes. Ce qui explique
les deux indices qui ne collaient pas : un job de 23 s (trop court pour un
timeout) et aucune annotation d'échec de Vitest (aucun test ne tombait).

Vérifié vert sous `node@22`. Les deux workflows passent à Node 22, et
`engines.node` passe de `>=20` à `>=22` pour que l'exigence soit écrite
plutôt que redécouverte.

**Leçon de méthode :** l'environnement se reproduit, il ne se devine pas.
`npx -p node@20` a donné la réponse en une commande, après deux corrections
inutiles poussées sur la foi d'un raisonnement.

### Vérifications

360 tests, lint et build au vert. CI et déploiement GitHub Actions au vert,
page en ligne (HTTP 200).

## Non publié — quatorzième passe du 2026-08-24 (chasse aux bugs)

Nikola : « assure-toi de régler tous les bugs, passe en mode engineer de bug ».
Quatre défauts trouvés et corrigés, dont un qui change une règle, plus une
régression attrapée par la campagne d'invariants avant d'avoir pu nuire.

### Le ruling de la Bagarre est renversé

« Pour Bagarre, juste je gagne la Bagarre, je gagne 1 case sur la piste,
déplacement ou non. » Nikola revient sur son ruling du 2026-08-15 (« pas de
déplacement, pas de point »), qui punissait l'attaquant pour une géométrie
dont il n'est pas responsable : une cible plaquée contre un mur lui faisait
perdre le point alors qu'il l'avait bel et bien percutée.

Appliqué aux **six** sites qui portaient la condition : Tout Casser, Tête en
Avant, Graouhhh, Faut Pas Me Chauffer, écroulement d'Amas, repli offensif.
C'est ce qui répond au cas remonté : deux combats Faut Pas Me Chauffer gagnés
au même tour valent enfin 2 cases de piste. Ce qui ne change pas : la FAQ #12
continue de valoir pour ce qu'elle dit vraiment, un Titan distinct ne rapporte
qu'UNE Bagarre par carte.

Quatre tests existants verrouillaient l'ancienne règle. Ils ont été **réécrits
sur la nouvelle**, pas supprimés, avec la trace de ce qui a changé et pourquoi.

### La Bagarre de chaîne n'était jamais créditée sur Tout Casser

« J'ai déplacé un titan avec un débris en faisant Tout Casser, j'aurais dû
gagner 1 point sur Bagarre. » Défaut réel, et net : les sous-cas **Bâtiments,
Blocs et Amas** ne transmettaient pas `bagarreSet` à `projectInDirection`.
Seul le sous-cas Titan comptait. Un Titan bousculé par un bloc de bâtiment,
un débris ou un Amas ne rapportait donc rien du tout, alors que c'est la même
carte et le même choc. Les quatre sous-cas partagent désormais un seul Set,
crédité une fois. Même correction sur les deux projections de Tête en Avant.

### Un repli à la sortie de faille ne proposait aucun choix

« Il tape le bâtiment en I9, il doit donc se placer sur H9 H8 ou I8 » — et il
n'avait rien eu à choisir. Reproduit par brute-force sur les 81 cases × 8
directions × 8 énergies : sur une sortie de faille **diagonale**, l'élément
ressort par un coin, et les trois voisines de ce coin progressent toutes sur
au moins un des deux axes du déplacement. Le filtre les éliminait donc TOUTES,
aucun repli n'était émis, et le moteur posait l'élément en silence — alors que
le ruling du 2026-08-17 donne ce choix à l'attaquant. Quand le filtre ne
laisse rien, on revient aux voisines de la case de sortie : le cas de Nikola
rend maintenant exactement H8/H9/I8.

### Les couleurs de la 3D

« En 3D les cases de périmètre et celles de déplacement sont exactement les
mêmes visuellement. » Ce n'était pas une impression : `TITAN_RING_COLOR`
contenait EXACTEMENT les couleurs des cases d'action — `0x71dbff` est celle du
déplacement, `0xfb923c` celle de Tête en Avant, `0x16e08c` celle de Boing
Boing. Un Titan 1 sélectionné peignait son périmètre dans la couleur même du
déplacement. Consigne de Nikola : « une petite variante, mais que ça reste pas
trop loin niveau couleur » — chaque teinte est donc conservée, seulement
assombrie et désaturée, et l'opacité passe de 0,72 à 0,4 (le périmètre était
plus opaque que les cases dessinées par-dessus). **3D uniquement**, la grille
2D n'utilise pas cette table.

### Une régression attrapée avant d'avoir nui

La campagne d'invariants a sorti **333 anomalies sur 120 parties** juste après
l'ajout du choix au coin bloqué. Cause : le SIMULATEUR — le cinquième endroit
où vit une règle — lisait le nouveau `rentre: false` comme « rentrée
impossible » et faisait perdre TOUT son tour au Titan. Plutôt que de
redupliquer le départage dans le simulateur et dans le contrôleur, le choix se
tranche dans le domaine via `choisirAuto` : la règle ne vit qu'à un endroit,
l'IA et le simulateur l'utilisent. 150 parties sur une autre plage de graines
repassent à zéro anomalie.

### Vérifications

357 tests, lint et build au vert. 150 parties de diagnostic sans une seule
anomalie. Règle de Bagarre propagée aux **cinq** emplacements (moteur, tests,
simulateur, livret, page Règles), et vérifiée après coup aux deux derniers.


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
