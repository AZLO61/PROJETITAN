import * as THREE from "three";

function makeNumberSprite(number) {
  const canvas = document.createElement("canvas");

  canvas.width = 64;
  canvas.height = 64;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1a0a2e";
  ctx.font = "bold 42px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), 32, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);

  sprite.scale.set(0.3, 0.3, 1);

  return sprite;
}

export { makeNumberSprite };
