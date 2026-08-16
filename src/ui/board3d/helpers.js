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

function getNumberSpriteMaterial(number) {
  const cle = String(number);
  if (materiauxParNombre.has(cle)) return materiauxParNombre.get(cle);

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1a0a2e";
  ctx.font = "bold 42px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cle, 32, 34);

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

function makeNumberSprite(number) {
  const sprite = new THREE.Sprite(getNumberSpriteMaterial(number));
  sprite.scale.set(0.3, 0.3, 1);
  return sprite;
}

export { makeNumberSprite };
