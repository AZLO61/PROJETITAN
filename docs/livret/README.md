# Livret de règles — PROJET TITAN

`ProjetTitan_Livret.html` est le **livret de règles officiel**. Ouvre-le
directement dans un navigateur, il est autonome : la feuille de style et les
icônes sont dans ce dossier, à côté de lui.

## Pourquoi il vit ici

Il était conservé hors dépôt, dans `Bureau\SITE WEB\`, au milieu d'une
quarantaine de versions antérieures éparpillées sur plusieurs dossiers. Rien
ne disait laquelle faisait foi, et le moteur avait pris trois rulings d'avance
sur elle sans que le livret ne le sache.

Il est désormais versionné avec le code. Une règle qui change se voit donc
dans le même historique que le code qui l'applique.

## La règle vit à deux endroits — et doit changer aux deux

| Où | Quoi |
|---|---|
| `docs/livret/ProjetTitan_Livret.html` | Le livret pour les joueurs. Fait foi à la table. |
| `src/domain/gameRules.js` | Le moteur. Chaque ruling y est commenté avec son raisonnement. |
| `src/ui/rules/rulesContent.js` | Les règles affichées dans l'application. |
| `tests/domain/` | Les tests qui empêchent une règle de repartir en arrière. |

**Modifier une règle sans toucher aux quatre, c'est créer une divergence
silencieuse.** C'est exactement ce qui s'était produit avant la révision
V36.1 : cinq cas marqués « OUVERT » dans le livret étaient déjà tranchés et
appliqués dans le moteur.

## Historique des révisions

### V36.2 — 16 août 2026

Issues du premier test à la table, après une partie réellement jouée :

- **Fatigue** — elle pioche dans la **main**, jamais dans les 3 cartes de la
  Manche en cours. Le moteur prenait aussi les cartes programmées non encore
  résolues, ce qui amputait la Manche de sa victime.
- **Titan poussé hors du plateau** — c'est du catch, on le sort du ring. Ni
  rebond, ni faille, ni condition d'énergie. Il attend **son** tour pour
  rentrer, ce qui empêche l'acharnement, et sa rentrée lui coûte une partie
  de son Mouvement gratuit. Il rentre toujours, au pire par la case libre la
  plus proche du bord.
- **Aucun élément ne se pose sur un bâtiment debout**, jamais.
- **Au Seuil 4, l'élément prend la place** du bâtiment qu'il fait tomber
  entièrement. Règle unique pour Titans et débris, trajectoire normale ou
  sortie de faille.
- **Périmètre** — ton propre Titan compte pour 1 dans le calcul d'énergie.

### V36.1 — 15 août 2026

Trois arbitrages nouveaux :

- **Énergie** — ton propre Titan compte pour 1 dans ton Périmètre, ta case
  incluse. Il suffit donc de 3 cases occupées autour de toi pour le Seuil 4.
- **Pistes ADN** — une piste restée à 0 ne rapporte aucun point, quel que soit
  le rang. Avant, à 3 Titans, trois joueurs sans la moindre Bagarre
  repartaient avec 1 point chacun.
- **Départage du vainqueur** (section nouvelle) — à score égal : le plus
  d'Adrénaline restante, puis le Socle de plus haute valeur, puis la Force
  totale des cartes non jouées. Si les trois se valent, l'égalité est réelle.

Cinq cas « OUVERT » fermés, tous déjà appliqués par le moteur :

- **RAGE** est possible dès 1 seule ressource, l'Adrénaline comprise.
- **Socle cassé par ricochet** : il n'est attribué à personne et reste au sol.
- **Coin de départ partagé** : aucun conflit, chaque coin offre 2 cases.
- **Bonus Graouhhh** : cumulatif, +1 Adrénaline par Titan au-delà du premier.
- **DIL impossible** : aucun effet de repli, l'action est sans effet.

### V36 — 13 août 2026

Version d'origine, conservée dans `Bureau\SITE WEB\`.
