import * as THREE from "three";

/* ============================================================
   Étiquettes numériques des Socles (vue 3D)
   ============================================================
   Cette fonction créait un <canvas>, une CanvasTexture et un SpriteMaterial
   NEUFS à chaque appel — soit jusqu'à 25 textures par reconstruction de la
   scène, jamais libérées, et une reconstruction a lieu à chaque action
   jouée, chaque changement de Titan sélectionné et chaque bascule du mode
   déplacement. Une texture est la ressource GPU la plus coûteuse du lot :
   c'était la principale fuite mémoire de la vue 3D.

   Il n'existe pourtant que cinq valeurs de Socle possibles (0 à 4, la
   hauteur du bâtiment à sa construction). Le matériau et sa texture sont
   donc mis en cache par valeur, et seul le Sprite — un objet léger, sans
   ressource GPU propre — est recréé à chaque appel, puisque sa position et
   son échelle diffèrent d'un usage à l'autre.

   Les matériaux du cache portent `userData.partage`, qui signale au
   ramasse-miettes de la scène (viderGroupe, dans Board3D) de ne PAS les
   libérer : ils sont réutilisés d'une reconstruction à l'autre.
============================================================ */
const materiauxParNombre = new Map();

/* ── LA COULEUR ENTRE DANS LA CLÉ DU CACHE ──
   Ajouté le 2026-09-07 avec le décompte de traînée en 3D. L'étiquette d'un
   Socle est sombre, parce qu'elle se pose sur le dessus clair d'un socle ; un
   décompte de vol se pose sur le PLATEAU, qui est sombre, et prend la couleur
   de ce qui a volé — jaune pour un débris, l'accent du Titan sinon.

   Même valeur, deux apparences : la couleur fait donc partie de l'identité du
   matériau. Le cache reste petit — cinq valeurs de Socle, une dizaine de
   longueurs de vol, six teintes au plus — et il garde tout son sens : sans
   lui, chaque reconstruction de scène créait jusqu'à vingt-cinq textures GPU
   jamais libérées. */
const CONTOUR_ETIQUETTE = "rgba(0,0,0,.85)";

function getNumberSpriteMaterial(number, couleur) {
  const cle = `${number}|${couleur}`;
  if (materiauxParNombre.has(cle)) return materiauxParNombre.get(cle);

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;

  const ctx = canvas.getContext("2d");
  ctx.font = "bold 42px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  /* Un liseré noir sous le chiffre : posé sur un plateau sombre il resterait
     lisible sans, mais il passe aussi au-dessus de bâtiments de toutes les
     couleurs, dont le jaune. Le contour le détache de n'importe quel fond,
     comme l'ombre portée le fait en 2D. Sans effet visible sur l'étiquette
     sombre des Socles, dont le contour se confond avec le trait. */
  ctx.lineWidth = 6;
  ctx.strokeStyle = CONTOUR_ETIQUETTE;
  ctx.strokeText(String(number), 32, 34);
  ctx.fillStyle = couleur;
  ctx.fillText(String(number), 32, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.partage = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  material.userData.partage = true;

  materiauxParNombre.set(cle, material);
  return material;
}

/* `couleur` et `taille` sont facultatifs : sans eux, on obtient exactement
   l'étiquette de Socle d'avant le 2026-09-07. */
function makeNumberSprite(number, { couleur = "#1a0a2e", taille = 0.3 } = {}) {
  const sprite = new THREE.Sprite(getNumberSpriteMaterial(number, couleur));
  sprite.scale.set(taille, taille, 1);
  return sprite;
}

export { makeNumberSprite };
