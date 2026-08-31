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

- **la clé du relais est tirée au sort à chaque lancement** du `.bat` : sans
  elle, personne ne peut ouvrir de table chez toi, même en connaissant
  l'adresse du tunnel. 10 caractères, valables le temps de cette fenêtre ;
- **le mot de passe de table est tiré au sort**, pas choisi — 8 caractères sur
  un alphabet de 32, soit environ mille milliards de combinaisons ;
- mots de passe hachés (`scrypt`), comparés en temps constant, jamais gardés ni
  journalisés en clair ;
- même réponse pour « salle inconnue » et « mot de passe faux » — sinon on
  énumère les salles ;
- 10 échecs par adresse IP → un quart d'heure de mise à l'écart ;
- 60 requêtes par 10 s et par adresse ;
- 2 Mo par message, 50 salles, 8 participants ;
- rien sur disque : couper le relais efface tout.

### Les deux secrets, à ne pas confondre

| | Qui la connaît | À quoi elle sert |
|---|---|---|
| **Clé du relais** | toi seul | ouvrir une table. Tirée au sort par `JOUER-A-DISTANCE.bat`, affichée dans sa fenêtre jaune, recopiée dans le jeu. |
| **Mot de passe de table** | toi et tes joueurs | rejoindre cette table-là. Tiré au sort, affiché une fois. |

La clé **ne doit jamais entrer dans le dépôt** : il est public, le jeu est servi
depuis GitHub Pages. Elle n'y est plus écrite nulle part — le `.bat` la tire au
sort à chaque lancement et te l'affiche. Tu n'as donc rien à changer pour en
changer : relancer le fichier suffit, et l'ancienne ne vaut plus rien.

C'est aussi ce qui la rend sûre. Une phrase écrite en dur survivait à la partie,
et se tapait de mémoire — donc elle était courte, donc devinable. Dix caractères
tirés au sort ne valent que le temps de cette fenêtre, et personne n'a besoin de
les retenir.

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
- **Clé du relais** : les 10 caractères affichés dans la fenêtre jaune du
  `.bat`, juste sous l'adresse. Elle change à chaque lancement.

> **Tu as perdu la fenêtre jaune ?** La clé est aussi affichée en clair dans la
> fenêtre du relais — celle qui reste ouverte toute la partie, en haut de son
> texte. Et l'adresse du tunnel se relit dans son journal, sans rien relancer :
>
> ```
> powershell -NoProfile -Command "(Select-String -Path $env:TEMP\titan-tunnel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches).Matches[0].Value"
> ```

Le salon affiche alors trois choses : un **identifiant de 6 caractères**
(`AB3K7P`), un **mot de passe tiré au sort** (`SV4K-QLRT`) et l'adresse. Les
deux se dictent au téléphone : ni `I`, ni `O`, ni `0`, ni `1` dans l'alphabet
employé.

### 3. Donne le lien — ou les trois lignes

**Le plus simple : « Copier le lien d'invitation ».** Le bouton est dans ton
salon, sous les trois lignes. Le lien porte l'adresse du relais, l'identifiant
et le mot de passe : ton joueur clique, et il est à la table. Il n'a rien à
taper, rien à recopier, rien à comprendre.

> **Ce que ça coûte, et il faut le savoir.** Le mot de passe voyage dans le
> lien. Il finit donc dans l'historique du navigateur de celui qui clique, et
> dans le fil de discussion par lequel tu l'as envoyé — c'est un secret partagé
> avec tous ceux qui voient ce fil. Ne le publie pas sur une page ouverte.
> Deux garde-fous, qui le rendent raisonnable sans le rendre inoffensif :
> l'adresse est nettoyée de la barre du navigateur dès la connexion faite, et un
> mot de passe ne vaut que le temps de cette table-là. **La clé du relais, elle,
> n'est jamais dans un lien** : elle ouvre la porte de ta machine.

### 3 bis. Ou les trois lignes, à la main

L'adresse du relais, l'identifiant, le mot de passe. **Note le mot de passe tout
de suite** : il ne s'affiche qu'une fois et le relais ne peut pas le retrouver —
il n'en garde qu'une empreinte. Fermer la table et en rouvrir une en tire un
nouveau, ce qui n'est pas grave.

Envoie-le de préférence par un autre canal que l'adresse.

### 4. Ils rejoignent

Chez eux → **Jouer à distance** → **Rejoindre une table** → les trois lignes.
Ils n'ont **pas** besoin de la clé du relais. Ils apparaissent dans ton salon.

### 5. Ils choisissent leur Titan — et l'IA garde les places vides

Chaque invité prend un Titan libre depuis son propre écran. Tu gardes la main :
ton salon a toujours le menu déroulant qui réattribue les sièges.

**Un Titan tenu par l'IA est un siège libre.** C'est même le seul qui puisse
l'être une fois la partie commencée : quelqu'un qui arrive en cours de route, ou
qui revient après une déconnexion, reprend un Titan à l'IA d'un clic — depuis le
salon avant le lancement, depuis le bandeau violet en cours de partie.

**Quand un joueur part, l'IA reprend son Titan** au niveau réglé pour la table.
La partie ne s'arrête pas, et sa place l'attend s'il revient.

### 5 bis. Distribue les Titans, et lance

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

**L'hôte qui perd la liaison ne perd plus la table.** Tant que le relais tourne,
la salle et son dernier plateau tiennent en mémoire : les autres voient
« l'hôte s'est déconnecté », et la partie reprend dès qu'il répond. Pour
reprendre le moteur après une coupure longue, il rejoint sa propre table
(identifiant + mot de passe) en dépliant **« Tu es l'hôte et tu reprends ta
table ? »** et en collant la clé du relais.

> Une limite qui reste, et elle est structurelle : si l'hôte **recharge sa
> page**, le moteur part avec elle. Le relais ne garde qu'un plateau PUBLIC,
> mains retirées — il ne peut pas rendre les cartes de chacun. La reprise sert
> aux coupures réseau, pas aux F5.

**Un invité qui recharge sa page** revient dans la partie : il redonne
l'identifiant et le mot de passe (ou reclique le lien d'invitation), et reprend
son Titan, que l'IA tenait pendant son absence. Mais il n'a
normalement pas à le faire : le bandeau violet, en haut de l'écran de jeu, porte
un bouton **Rafraîchir** qui redemande le plateau à l'hôte sans quitter la
table. C'est lui qu'il faut utiliser quand l'affichage semble figé — recharger
l'onglet, lui, coupe la session et renvoie à l'écran d'accueil.

**Un invité choisit son Titan lui-même** dans le salon : les Titans libres y sont
cliquables. L'hôte garde la main — il peut réattribuer les sièges depuis son
propre salon, et un Titan déjà pris ou confié à l'IA se refuse.

---

## Si ça ne marche pas

| Symptôme | Cause probable |
|---|---|
| « Impossible de joindre le relais » | tunnel éteint, ou adresse recopiée de travers |
| La fenêtre jaune ne vient jamais | elle attend l'adresse du tunnel, jusqu'à 45 s. Elle le dit (« Attente de l'adresse publique ») — ne la ferme pas, elle est peut-être derrière les autres |
| J'ai fermé la fenêtre jaune | rien n'est perdu : la clé est dans la fenêtre du relais, l'adresse dans `%TEMP%	itan-tunnel.log` (commande ci-dessus) |
| « Identifiant ou mot de passe incorrect » | l'un des deux est faux — le message ne dit pas lequel, c'est voulu |
| « Clé du relais incorrecte » | la clé saisie ne correspond pas à celle affichée par le `.bat` — attention, elle change à chaque lancement |
| « Trop de tentatives » | 10 échecs : attends un quart d'heure, ou redémarre le relais |
| « L'hôte a quitté la partie » | l'hôte a cliqué **Fermer la table**. C'est la seule fin définitive |
| « L'hôte s'est déconnecté… » | sa liaison est tombée. **La table reste ouverte**, le plateau est gardé, et la partie reprend à son retour |
| « Le relais ne répond plus » | la fenêtre `JOUER-A-DISTANCE` a été fermée, ou la machine de l'hôte est en veille. Rouvre-la : la partie reprend toute seule |
| « Cette table n'existe plus sur le relais » | elle a été fermée, ou le relais a redémarré — il ne garde rien sur disque |
| « Connexion interrompue, reprise en cours » | coupure réseau ; ça se rattrape tout seul |

Pour vérifier que le relais respire, ouvre `https://…/api/sante` dans un
navigateur : il répond `{"ok":true,"salles":N}`.

---

## Lancer le relais à la main

```bash
CLE_RELAIS="ta-phrase" node server/relais.mjs
```

Sans `CLE_RELAIS`, le relais démarre quand même — pratique en local — mais il le
dit en gros au démarrage : n'importe qui trouvant l'adresse du tunnel pourra y
ouvrir des tables.

```bash
cloudflared tunnel --url http://localhost:8787
```

Réglages par variables d'environnement : `CLE_RELAIS` (vide par défaut),
`PORT` (8787), `MAX_SALLES` (50), `ORIGINES` (`*` par défaut ; une liste séparée
par des virgules pour resserrer si le jeu est hébergé à une adresse fixe).

Aucune dépendance à installer : le relais n'utilise que Node.
