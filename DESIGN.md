# Design — La borne

Le monde visuel de Projet Titan, décrit d'après ce qui est construit, pas
d'après ce qui était prévu. Les jetons vivent dans `src/index.css` et sont
exposés au JavaScript par `src/ui/theme.js` ; les deux fichiers portent les
mêmes noms, et c'est le seul endroit où une valeur se change.

## La thèse

Projet Titan est un jeu de kaijus qui cassent une ville sur une grille. Son
interface est **sa borne d'arcade** — la descendance directe de Rampage et
King of the Monsters — et pas un tableau de bord sombre à accents néon, qui
est ce que tout produit sombre finit par livrer et ce que l'application était
devenue.

Concrètement, cela veut dire : **encre plate cernée de noir, arêtes dures,
jauges à segments, lignes de balayage.** Aucun dégradé décoratif, aucun halo
posé pour faire joli, aucun panneau translucide.

## Ce qui ne bouge pas

Les couleurs de jeu sont des **données**, pas des choix graphiques :

- les quatre Titans — T1 `#71dbff`, T2 `#fb923c`, T3 `#16e08c`, T4 `#f472b6` ;
- les cinq couleurs de blocs, et les six couleurs de cartes.

Elles ne se retouchent pas pour des raisons esthétiques. Le monde visuel se
construit autour d'elles.

## Règle de couleur

**Chaque couleur code une règle. Aucune ne décore.** C'est la contrainte qui
tient tout le reste, et elle se vérifie élément par élément :

| Jeton | Valeur | Ce qu'il dit |
|---|---|---|
| `--sig-you` | `#ffd93d` | c'est ton tour, c'est ton action primaire |
| `--sig-go` | `#16e08c` | disponible, validé |
| `--sig-warn` | `#fb923c` | attention, en attente |
| `--sig-stop` | `#f44336` | une décision bloque le jeu |
| `--sig-move` | `#71dbff` | passif, déplacement, portée |
| `--sig-tele` | `#b88cff` | téléporteur, Zone Repos |

Un élément qui n'encode rien reste dans les gris teintés (`--text-dim`,
`--text-faint`), tirés du violet du fond et jamais du gris neutre : un gris
franc sur un fond coloré se lit comme une tache morte.

## Le meuble

| Jeton | Valeur | Emploi |
|---|---|---|
| `--ink-void` | `#05060d` | derrière tout, le noir du meuble |
| `--ink-screen` | `#0d0a1c` | le fond du tube |
| `--ink-plate` | `#171331` | une plaque de HUD posée dessus |
| `--ink-plate-hi` | `#241d47` | la même, survolée ou active |
| `--ink-bezel` | `#2d1d5d` | le violet du meuble, hérité |

La classe `.titan-cabinet` porte le tube : lignes de balayage en `::after`
(coupées au-delà de 3 dppx, où elles moirent) et vignettage en `::before`. Le
contenu passe au-dessus, en `z-index: 3` — le texte doit rester net.

## Élévation

**Le cerne, pas l'ombre.** Un sprite d'arcade est cerné de noir, et c'est le
trait qui dit ce qui est posé sur quoi : `--edge` à `--edge-w` (2px). On ne
cumule jamais un cerne et une ombre portée sur le même objet.

L'ombre portée est réservée à **un seul élément à l'écran à la fois** : la
plaque du Titan dont c'est le tour, qui se lève de 4 px pendant que les autres
retombent à 82 % d'opacité. C'est le seul mouvement orchestré de l'interface,
et c'est lui qui répond à « savoir ce que je peux faire ».

L'épaisseur sous une touche (`0 3px 0 var(--edge)`) n'est pas un effet
néobrutaliste : c'est le capuchon du bouton, et il disparaît à l'enfoncement.

## Arêtes

`--r-plate: 3px`, `--r-chip: 2px`, et 1px sur les 81 cases du plateau. Une
borne n'a pas de coin arrondi à 14 px, et une grille de 81 cases arrondies se
lit comme une planche de pastilles.

## Typographie

Trois familles, trois rôles, chargées depuis `index.html`. **Avant cette
refonte, aucune n'était servie** — ni `<link>`, ni `@font-face`, ni `@import`
nulle part — et toutes les déclarations du code retombaient en silence sur le
`sans-serif` du système.

| Famille | Rôle | Emploi |
|---|---|---|
| **Bowlby One** | le fronton | titres, nom du jeu, noms de carte (`marquee()`) |
| **Press Start 2P** | l'afficheur | chiffres et compteurs uniquement (`readout()`) — police bitmap, illisible en paragraphe |
| **Archivo** | le bandeau sérigraphié | tout le reste : libellés (`label()`), phrases de règle (`prose()`) |

Échelle : `--fs-micro` 0.78rem → `--fs-h1` 2.25rem. **Le plancher est
12,5 px.** L'ancienne interface vivait entre 11 et 12,5 px sur un appareil
qu'on lit à bout de bras, posé au milieu d'une table : c'était la cause
commune des quatre frictions signalées par l'auteur.

Les chiffres sont en `tabular-nums` sur `body` : ce sont des mesures, elles
doivent s'aligner en colonne et ne pas danser quand un score passe de 9 à 10.

## Icônes

`src/ui/icons.jsx` — grille de 24, bouts carrés, `currentColor`. **Aucun
émoji.** Un émoji est dessiné par le système : il change d'un appareil à
l'autre, ne prend jamais la couleur qui l'entoure, ne s'aligne sur aucune
grille, et sur une tablette Android le 🦶 du déplacement et le 🤲 du ramassage
ne se distinguaient plus à bout de bras.

L'épaisseur du trait suit la taille (2.6 sous 13 px, 2.25 sous 16, 2 au-delà) :
un trait constant sur une grille de 24 rendue à 12 px se referme en pâté. Une
icône doit garder le même **poids visuel** à toutes ses tailles.

Chaque carte a son pictogramme, qui dit son **geste** et pas son thème :
`smash`, `charge`, `roar`, `hop`, `duel`, `hoard`.

## Mouvement

`--ease-out` et `--ease-snap` sont deux décélérations exponentielles. **Pas de
rebond** : un objet réel ralentit, il ne repart pas en arrière.

Une seule chose bouge en permanence — la plaque du Titan actif. Rien ne pulse
en boucle : une pulsation infinie sur une partie d'1 h 30 fatigue l'œil et vide
la batterie d'une tablette. Les barres se remplissent par `transform:
scaleX()`, jamais par `width`.

`prefers-reduced-motion` coupe tout.

## Composition

- **Une seule chose en relief à l'écran**, toujours.
- **Une seule décision à la fois** : l'ordre vit dans `decisionBloquante`, côté
  contrôleur, jamais dans l'affichage.
- **Le tour se lit dans son ordre réel** — se déplacer, jouer, ramasser — une
  étape visible à la fois, numérotée, via le composant `Step`.
- **Aucune plaque n'existe pour porter une bordure.** Un titre en bandeau et un
  filet suffisent à séparer deux blocs.
- **Deux colonnes au-delà de 1100 px** (`.titan-layout`) : le plateau à gauche,
  les commandes du tour en colonne collante à droite. Sous ce seuil, la pile
  d'origine, à laquelle la tablette est habituée.

## Lecture du plateau

La rue est un **creux** (`rgba(0,0,0,.42)`, plus sombre que le fond), les
bâtiments sont des aplats posés dessus dans la couleur de leur bloc du haut.
C'est ce qui rend la ville lisible d'un coup d'œil, et c'est comme ça qu'un
plateau imprimé la dessine.

Les pistes Bagarre et Destruction n'ont pas de maximum connu : chaque barre est
tracée **par rapport au meilleur de la table**, jamais sur une échelle absolue
qui ne voudrait rien dire.

## Les surfaces du navigateur

Sélection, anneau de focus, ascenseurs sont peints dans la palette de la
borne. Livrés par défaut, ils n'appartiennent à aucun système de design.

## Accessibilité

Cibles tactiles de 44 px au pointeur grossier. Anneau de focus visible à 3 px
sur `--sig-you`. Les libellés courts portent un `aria-label` complet, dont le
texte visible est toujours un sous-ensemble (WCAG 2.5.3). Les états
indisponibles se disent **en toutes lettres** — une carte jouée porte un tampon
« Jouée », pas seulement une opacité qu'on peut prendre pour un bug d'affichage.
