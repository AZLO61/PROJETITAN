# Jouer à Projet Titan à distance

Comment faire une partie avec des gens qui ne sont pas dans la pièce, sans
ouvrir un seul port sur ta box.

---

## Ce qui est exposé, et ce qui ne l'est pas

Il faut le dire clairement, parce que c'est la raison d'être de ce montage.

**Un identifiant et un mot de passe n'évitent pas d'exposer quelque chose.** Tes
joueurs doivent bien joindre un point de rendez-vous sur Internet. Ce que ce
montage change, c'est **ce qui** est exposé :

| | Exposé ? | Pourquoi |
|---|---|---|
| Ton PC | **Non** | aucun port ouvert, aucune redirection sur la box |
| Le jeu, ses règles, tes parties | **Non** | tout tourne dans ton navigateur |
| Le relais (`server/relais.mjs`) | Oui | 500 lignes qui ne savent que recopier des messages |

Le relais **ne connaît pas les règles de Titan**. Pas une carte, pas un Titan,
pas un Seuil. Il garde des salles en mémoire et recopie des messages. C'est là
qu'est la sécurité : la chose joignable ne décide de rien.

Ses garde-fous, tous dans le même fichier, en haut :

- mot de passe haché (`scrypt`), jamais gardé ni journalisé en clair ;
- même réponse pour « salle inconnue » et « mot de passe faux » — sinon on
  énumère les salles ;
- 10 échecs par adresse IP → un quart d'heure de mise à l'écart ;
- 60 requêtes par 10 s et par adresse ;
- 2 Mo par message, 50 salles, 8 participants ;
- rien sur disque : couper le relais efface tout.

---

## Une fois : installer le tunnel

Un tunnel donne une adresse `https://…` publique qui pointe vers ton relais,
**sans rien ouvrir sur ta box** — c'est le tunnel qui appelle vers l'extérieur.

Télécharge `cloudflared` (gratuit, aucun compte nécessaire) :

```bash
winget install --id Cloudflare.cloudflared
```

---

## À chaque partie

### 1. Lance le relais et le tunnel

Double-clique **`JOUER-A-DISTANCE.bat`**. Deux fenêtres s'ouvrent. Celle du
tunnel affiche une ligne comme :

```
https://tremble-rope-hills-fever.trycloudflare.com
```

**C'est l'adresse à donner.** Elle change à chaque redémarrage du tunnel : c'est
la contrepartie du gratuit et du sans-compte.

### 2. Ouvre la table

Dans le jeu → **Jouer à distance** → **Ouvrir une table**.

- **Adresse du relais** : l'adresse `https://…` du tunnel ;
- **Mot de passe** : ce que tu veux, 4 caractères minimum.

Le jeu affiche un **identifiant de 6 caractères** (`AB3K7P`). Il se dicte au
téléphone : ni `I`, ni `O`, ni `0`, ni `1` dans l'alphabet employé.

### 3. Donne trois choses à tes joueurs

L'adresse du relais, l'identifiant, le mot de passe. **Le mot de passe n'est
affiché nulle part dans le jeu** : c'est toi qui l'as choisi, à toi de le dire —
par un autre canal que celui où tu envoies l'adresse, tant qu'à faire.

### 4. Ils rejoignent

Chez eux → **Jouer à distance** → **Rejoindre une table** → les trois lignes.
Ils apparaissent dans ton salon.

### 5. Distribue les Titans, et lance

Chaque Titan humain a un menu déroulant : toi sur cet appareil, ou l'un des
joueurs connectés. Les Titans laissés en IA sont joués par la machine, chez toi.

Puis **Lancer la partie**. Les invités entrent automatiquement.

---

## Ce qu'il faut savoir avant de jouer

**Ton navigateur est l'arbitre.** Le moteur tourne chez toi, et chez toi seul.
Les autres voient ton plateau et t'envoient leurs coups. C'est ce qui garantit
que quatre écrans ne divergent jamais.

**Si tu fermes ton onglet, la partie s'arrête** pour tout le monde — ils sont
prévenus au lieu d'attendre devant un plateau figé. Un rechargement de page, en
revanche, est rattrapable : tu as deux minutes pour revenir.

**Chacun ne voit que sa main.** Le plateau part en clair à toute la table, les
cartes de chacun lui partent à part. Un joueur qui ouvre la console de son
navigateur ne verra pas le jeu de ses adversaires.

**Un invité qui recharge sa page** revient dans la partie : il redonne
l'identifiant et le mot de passe, tu lui rends son siège.

---

## Si ça ne marche pas

| Symptôme | Cause probable |
|---|---|
| « Impossible de joindre le relais » | tunnel éteint, ou adresse recopiée de travers |
| « Identifiant ou mot de passe incorrect » | l'un des deux est faux — le message ne dit pas lequel, c'est voulu |
| « Trop de tentatives » | 10 échecs : attends un quart d'heure, ou redémarre le relais |
| « L'hôte a quitté la partie » | l'onglet de l'hôte est fermé ou son PC en veille |
| « Connexion interrompue, reprise en cours » | coupure réseau ; ça se rattrape tout seul |

Pour vérifier que le relais respire, ouvre `https://…/api/sante` dans un
navigateur : il répond `{"ok":true,"salles":N}`.

---

## Lancer le relais à la main

```bash
node server/relais.mjs
```

```bash
cloudflared tunnel --url http://localhost:8787
```

Réglages par variables d'environnement : `PORT` (8787), `MAX_SALLES` (50),
`ORIGINES` (`*` par défaut ; une liste séparée par des virgules pour resserrer
si le jeu est hébergé à une adresse fixe).

Aucune dépendance à installer : le relais n'utilise que Node.
