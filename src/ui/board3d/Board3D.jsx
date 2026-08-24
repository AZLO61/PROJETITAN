import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { rowFromIndex, rowIndex, socleValue, isSocleMarker, COLOR_HEX } from "../../domain/gameRules.js";
import {
  COLOR_HEX_3D,
  CELL,
  GAP,
  LEVEL_H,
  LEVEL_GAP,
  SOCLE_H,
  SPRITE_ASPECT,
  TITAN_SPRITE_KEY,
  TITAN_RING_COLOR,
  SPRITE_DATA,
  cellWorld,
  BOARD3D_BTN_STYLE,
} from "./constants.js";
import { makeNumberSprite } from "./helpers.js";
/* ============================================================
   LA 3D EST JOUABLE, PLUS SEULEMENT REGARDABLE
   ============================================================
   Demande de Nikola du 2026-08-18 : « le clic sur les cases en 3D ».

   La vue 3D ne savait faire qu'une chose, sélectionner un Titan en cliquant
   son sprite ; tout le reste — se déplacer, viser une charge, choisir une
   destination de saut, ramasser, poser un débris arrêté — n'existait qu'en
   2D, d'où la mention « Visualisation uniquement, repasse en Vue 2D pour
   jouer » sous le plateau. Jouer une partie entière en 3D était impossible.

   Deux briques suffisent, et aucune ne duplique une règle :

   · CHAQUE MESH PORTE SA CASE (`userData.cellKey`) — sol, blocs, socle,
     débris, sprite de Titan. Un clic renvoie donc une clé de case, exactement
     ce que la 2D produit, et part dans le MÊME aiguilleur (`onCellClick`,
     cf. RoundPanels). Aucune logique de jeu ne vit ici.

   · LES CASES ACTIVES ARRIVENT DÉJÀ CALCULÉES (`cellulesActives`), avec leur
     couleur, depuis le même code que le surlignage 2D. Ce que le joueur voit
     en 3D ne peut donc pas diverger de ce que la 2D propose — c'est le
     défaut qui avait déjà mordu sur la portée de Boing Boing.
============================================================ */
export default function Board3D({ board, looseBlocks, titans, boardVersion, selectedTitanId, onSelectTitan, cellulesActives = [], onCellClick }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const rebuildRef = useRef(null);
  const dataRef = useRef({ board, looseBlocks, titans, selectedTitanId, cellulesActives, onCellClick, onSelectTitan });
  dataRef.current = { board, looseBlocks, titans, selectedTitanId, cellulesActives, onCellClick, onSelectTitan };
  const [hoverSocle, setHoverSocle] = useState(null);

  // --- Effet unique : mise en place de la scène, caméra, lumières,
  // interactions. Ne dépend d'aucune prop — s'exécute une seule fois au
  // montage. Le contenu (bâtiments/blocs/titans) est (re)construit par
  // rebuildAll(), appelé ici puis à chaque changement de boardVersion.
  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth || 760;
    const height = mount.clientHeight || 460;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    // Bug #1/#2 (tracker) : depuis three.js r152, une texture couleur
    // (diffuse/albedo) doit déclarer explicitement colorSpace =
    // SRGBColorSpace, sinon le renderer la traite comme des données
    // linéaires — résultat : rendu global assombri ET, sur les sprites
    // PNG à alpha partiel (Titans), un liseré/voile blanchâtre sur les
    // pixels semi-transparents (mauvais espace colorimétrique au
    // blending). outputColorSpace est SRGBColorSpace par défaut sur ces
    // versions, on le fixe quand même explicitement pour ne plus jamais
    // dépendre d'une valeur par défaut qui pourrait changer.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const viewSize = 7.5;
    let aspect = width / height;
    const camera = new THREE.OrthographicCamera(-viewSize * aspect, viewSize * aspect, viewSize, -viewSize, 0.1, 100);
    camera.zoom = 2;
    camera.updateProjectionMatrix();

    const target = new THREE.Vector3(0, 0.3, 0);
    const spherical = { radius: 14, theta: Math.PI / 4, phi: THREE.MathUtils.degToRad(55) };
    function updateCamera() {
      const sinPhiR = Math.sin(spherical.phi) * spherical.radius;
      camera.position.set(
        target.x + sinPhiR * Math.sin(spherical.theta),
        target.y + Math.cos(spherical.phi) * spherical.radius,
        target.z + sinPhiR * Math.cos(spherical.theta)
      );
      camera.lookAt(target);
    }
    updateCamera();

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.05);
    dirLight.position.set(6, 10, 4);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8899ff, 0.32);
    fillLight.position.set(-6, 4, -4);
    scene.add(fillLight);

    const groundGroup = new THREE.Group();
    const buildingGroup = new THREE.Group();
    const titanGroup = new THREE.Group();
    const looseGroup = new THREE.Group();
    const highlightGroup = new THREE.Group();
    scene.add(groundGroup, buildingGroup, titanGroup, looseGroup, highlightGroup);

    // --- Sol 9×9 (statique — la forme du plateau ne change jamais) ---
    // Bug remonté (x2) : la première correction gardait un jitter aléatoire
    // par case, ce qui donnait un effet damier encore pire une fois
    // appliqué à TOUTES les cases (avant, seules les cases bâtiment
    // avaient un jitter, les cases couloir étaient plates). Le livret ne
    // demande qu'une seule et même couleur de sol pour toutes les cases —
    // couleur strictement plate, aucun jitter du tout.
    // Bug remonté : cases grises trop sombres, +30% de luminosité demandé.
    // 0x252528 (37,37,40) × 1.3 ≈ 0x303034 (48,48,52).
    // Éclaircissement suivant demandé (+20%) :
    // 0x303034 (48,48,52) × 1.2 ≈ 0x3A3A3E (58,58,62).
    // Puis +40% demandé :
    // 0x3A3A3E (58,58,62) × 1.4 ≈ 0x515157 (81,81,87).
    const ROAD_COLOR = 0x515157;
    // Cibles de clic. Le sol est posé une fois pour toutes ; bâtiments,
    // débris et Titans y sont ajoutés à chaque reconstruction (cf. `viderPick`).
    const pickables = [];
    for (let r = 0; r <= 8; r++) {
      for (let c = 1; c <= 9; c++) {
        const { x, z } = cellWorld(r, c);
        const geo = new THREE.BoxGeometry(CELL - GAP, 0.08, CELL - GAP);
        const mat = new THREE.MeshStandardMaterial({ color: ROAD_COLOR, roughness: 0.95 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, -0.04, z);
        mesh.userData.cellKey = rowFromIndex(r) + c;
        groundGroup.add(mesh);
        pickables.push(mesh);
      }
    }
    // Le sol occupe les 81 premières entrées et ne bouge jamais : on ne
    // recycle que ce qui vient après.
    const PICK_SOL = pickables.length;
    const viderPick = () => { pickables.length = PICK_SOL; };

    // --- Façades procédurales par couleur (cache, réutilisé à chaque
    // reconstruction pour éviter de regénérer les textures canvas) ---
    // Motifs de façade calqués sur les 5 icônes officielles (Bloc_*.png) :
    // chaque couleur a son propre pattern de fenêtres/rainures, pas un
    // brick pattern générique partagé.
    function shadeColor(hex, factor) {
      const c = new THREE.Color(hex);
      c.multiplyScalar(factor);
      return `#${c.getHexString()}`;
    }
    function roundRectPath(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
    // Fenêtre "pleine" : voile sombre translucide (intensité paramétrable,
    // calée sur celle des lignes du bloc rouge) + reflet subtil en haut
    // (bevel) + contour noir, reproduisant le rendu ligne-claire des
    // icônes officielles sans noircir excessivement le remplissage.
    function drawRoundedWindow(ctx, x, y, w, h, r, intensity) {
      roundRectPath(ctx, x, y, w, h, r);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = `rgba(0,0,0,${intensity})`;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.fillRect(x, y, w, h * 0.32);
      ctx.restore();
      roundRectPath(ctx, x, y, w, h, r);
      ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.11);
      ctx.strokeStyle = "rgba(0,0,0,.6)";
      ctx.stroke();
    }
    function drawFacade(ctx, size, colorKey, baseHex) {
      ctx.fillStyle = baseHex;
      ctx.fillRect(0, 0, size, size);
      // Intensité de référence = alpha des lignes du bloc Rouge (état
      // d'origine, avant boost). Bleu/Rose/Vert calent leurs fenêtres sur
      // cette même intensité (demande Nikola : "moins foncé, même
      // intensité que les lignes du rouge"). Rouge et Jaune reçoivent
      // ensuite +20% sur LEURS lignes (restent donc plus marqués).
      const WINDOW_LINE_ALPHA = 0.28;
      // Bleu et Vert éclaircis de 30% par rapport à la référence (demande
      // Nikola, session) — Rose reste sur la référence d'origine.
      const WINDOW_LINE_ALPHA_LIGHT = WINDOW_LINE_ALPHA * 0.7;
      const strokeBoosted = `rgba(0,0,0,${WINDOW_LINE_ALPHA * 1.2})`;
      const strokeLight = "rgba(255,255,255,.15)";

      if (colorKey === "bleu") {
        // 2×2 fenêtres quasi carrées, gap net, peu de marge au bord (cf.
        // image fournie Bloc_bleu_512)
        const pad = size * 0.13;
        const gap = size * 0.1;
        const cell = (size - pad * 2 - gap) / 2;
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 2; col++) {
            const x = pad + col * (cell + gap);
            const y = pad + row * (cell + gap);
            drawRoundedWindow(ctx, x, y, cell, cell, cell * 0.14, WINDOW_LINE_ALPHA_LIGHT);
          }
        }
      } else if (colorKey === "rose") {
        // 2 bandeaux horizontaux pleine largeur, même traitement bevel
        const pad = size * 0.12;
        const gap = size * 0.08;
        const bandH = (size - pad * 2 - gap) / 2;
        for (let i = 0; i < 2; i++) {
          const y = pad + i * (bandH + gap);
          drawRoundedWindow(ctx, pad, y, size - pad * 2, bandH, bandH * 0.1, WINDOW_LINE_ALPHA);
        }
      } else if (colorKey === "rouge") {
        // Rainures verticales fines, pleine hauteur — lignes +20%
        // (cf. icône Bloc Rouge, demande Nikola : rouge/jaune boostés)
        const nStripes = 9;
        const stripeW = size / nStripes;
        ctx.strokeStyle = strokeBoosted;
        ctx.lineWidth = 2;
        for (let i = 1; i < nStripes; i++) {
          const x = i * stripeW;
          ctx.beginPath();
          ctx.moveTo(x, size * 0.06);
          ctx.lineTo(x, size * 0.94);
          ctx.stroke();
        }
      } else if (colorKey === "orange") {
        // Chevrons diagonaux, pas de fenêtres — lignes +20%
        // (cf. icône Bloc Jaune/Orange, demande Nikola : rouge/jaune boostés)
        // Puis +40% supplémentaires sur ces diagonales : elles se lisaient
        // mal sur l'aplat orange, plus clair que les autres faces.
        ctx.strokeStyle = `rgba(0,0,0,${WINDOW_LINE_ALPHA * 1.2 * 1.4})`;
        ctx.lineWidth = 3;
        const step = size / 6;
        for (let i = -6; i <= 6; i++) {
          ctx.beginPath();
          ctx.moveTo(i * step, 0);
          ctx.lineTo(i * step + size, size);
          ctx.stroke();
        }
      } else if (colorKey === "vert") {
        // Grille 4×2 de fenêtres étroites et élancées, colonnes plus
        // espacées (cf. image fournie Bloc_Vert_512)
        const pad = size * 0.09;
        const gapX = size * 0.045;
        const gapY = size * 0.11;
        const cellW = (size - pad * 2 - gapX * 3) / 4;
        const cellH = (size - pad * 2 - gapY) / 2;
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 4; col++) {
            const x = pad + col * (cellW + gapX);
            const y = pad + row * (cellH + gapY);
            drawRoundedWindow(ctx, x, y, cellW, cellH, Math.min(cellW, cellH) * 0.22, WINDOW_LINE_ALPHA_LIGHT);
          }
        }
      } else {
        // Fallback générique (Socle blanc, etc.) : léger effet de matière
        ctx.strokeStyle = strokeLight;
        ctx.lineWidth = 1;
        ctx.strokeRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9);
      }
    }
    /* ============================================================
       LIBÉRATION DES RESSOURCES GPU
       ============================================================
       Les quatre fonctions de reconstruction commençaient par
       `group.clear()`. Dans Three.js, `clear()` détache les enfants mais ne
       libère RIEN : géométries, matériaux et textures restent alloués sur
       la carte graphique jusqu'à un `dispose()` qui n'arrivait jamais.

       Chaque reconstruction alloue une BoxGeometry par bloc, plus une par
       stud et son ombre, plus socle et matériau — et une reconstruction a
       lieu à chaque action jouée, chaque changement de Titan sélectionné et
       chaque bascule du mode déplacement. La mémoire GPU grimpait donc tout
       au long d'une partie sans jamais redescendre.

       `viderGroupe` remplace `clear()` partout. Elle épargne les ressources
       marquées `userData.partage` — celles des caches (textures de façade,
       matériaux de bloc, sprites de Titan, étiquettes de Socle, contour
       noir), réutilisées d'une reconstruction à l'autre et dont la
       libération casserait le rendu suivant.
    ============================================================ */
    function libererRessource(res) {
      if (!res || res.userData?.partage) return;
      if (res.map && !res.map.userData?.partage) res.map.dispose();
      res.dispose();
    }
    function viderGroupe(group) {
      group.traverse((obj) => {
        if (obj === group) return;
        if (obj.geometry) libererRessource(obj.geometry);
        if (Array.isArray(obj.material)) obj.material.forEach(libererRessource);
        else if (obj.material) libererRessource(obj.material);
      });
      group.clear();
    }

    const facadeTextureCache = new Map();
    function getFacadeTexture(colorKey) {
      if (facadeTextureCache.has(colorKey)) return facadeTextureCache.get(colorKey);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d");
      const baseHex = COLOR_HEX_3D[colorKey] ? `#${COLOR_HEX_3D[colorKey].toString(16).padStart(6, "0")}` : "#999999";
      drawFacade(ctx, 128, colorKey, baseHex);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace; // couleur (pas une donnée) → décodage sRGB requis
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.userData.partage = true; // en cache : jamais libérée par viderGroupe
      facadeTextureCache.set(colorKey, texture);
      return texture;
    }
    const blockMaterialCache = new Map();
    function getBlockMaterial(colorKey) {
      if (blockMaterialCache.has(colorKey)) return blockMaterialCache.get(colorKey);
      const tex = getFacadeTexture(colorKey);
      // Deux tons par cube (cf. icônes officielles : face gauche/arrière
      // plus claire, face droite/avant plus sombre) — même texture, tint
      // différent via `color` (multiplie la texture), pas besoin de 2
      // canvas séparés.
      const sideMatLight = new THREE.MeshStandardMaterial({ map: tex, color: 0xf2f2f2, roughness: 0.8 });
      const sideMatDark = new THREE.MeshStandardMaterial({ map: tex, color: 0xb8b8b8, roughness: 0.8 });
      const flatMat = new THREE.MeshStandardMaterial({ color: COLOR_HEX_3D[colorKey] || 0x999999, roughness: 0.7 });
      // Ordre des faces BoxGeometry : [+x, -x, +y (dessus), -y (dessous), +z, -z].
      // +x/+z (droite/avant) = ton sombre · -x/-z (gauche/arrière) = ton clair.
      // Dessus/dessous en couleur unie (cf. icônes : jamais de fenêtres sur
      // le dessus) — le stud sommital (rebuildBuildings) apporte le relief.
      const materials = [sideMatDark, sideMatLight, flatMat, flatMat, sideMatDark, sideMatLight];
      // En cache : partagés par tous les blocs de cette couleur, d'une
      // reconstruction à l'autre. viderGroupe doit les épargner.
      [sideMatDark, sideMatLight, flatMat].forEach((m) => { m.userData.partage = true; });
      blockMaterialCache.set(colorKey, materials);
      return materials;
    }
    // Contour noir épais (cf. icônes officielles : silhouette cerclée de
    // noir) — technique "inverted hull" : un clone de la géométrie, plus
    // grand, matériau noir en BackSide, ajouté en enfant du mesh. Rendu
    // visible uniquement en bordure (le mesh normal masque le reste),
    // fonctionne sous n'importe quel angle de vue (contrairement à des
    // LineSegments dont l'épaisseur WebGL est peu fiable).
    // Contour bleu très très foncé (pas noir pur), épaisseur réduite de
    // 50% par rapport à la version précédente (scale 1.045→1.0225,
    // 1.08→1.04) — demande Nikola, session.
    const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x050b1a, side: THREE.BackSide });
    outlineMaterial.userData.partage = true; // instance unique réutilisée par tous les contours
    function addToonOutline(mesh, geometry, scale = 1.0225) {
      const outlineMesh = new THREE.Mesh(geometry, outlineMaterial);
      outlineMesh.scale.multiplyScalar(scale);
      mesh.add(outlineMesh);
    }

    // --- Cache de textures des sprites Titan (évite de recharger le
    // même base64 à chaque reconstruction — les reconstructions sont
    // fréquentes, une par action jouée) ---
    const spriteTextureCache = new Map();
    function getSpriteTexture(key) {
      if (spriteTextureCache.has(key)) return spriteTextureCache.get(key);
      const texture = new THREE.TextureLoader().load(SPRITE_DATA[key]);
      texture.userData.partage = true; // en cache : jamais libérée par viderGroupe
      texture.colorSpace = THREE.SRGBColorSpace; // PNG couleur (sprite Titan) → décodage sRGB requis, sinon halo blanchâtre au blending alpha
      spriteTextureCache.set(key, texture);
      return texture;
    }

    const socleMeshes = [];

    function rebuildBuildings(boardData) {
      viderGroupe(buildingGroup);
      socleMeshes.length = 0;
      Object.entries(boardData).forEach(([key, b]) => {
        const r = rowIndex(key[0]);
        const c = Number(key.slice(1));
        const { x, z } = cellWorld(r, c);
        const socleVal = b.socle || 0;
        // Le Socle n'est un pédestal visible que tant que le bâtiment
        // tient debout (≥1 bloc) — une fois totalement détruit, sa
        // valeur devient un objet libre au sol (cf. rebuildLoose),
        // conformément à la FAQ #9 (ramassable comme un Bloc de béton).
        if (socleVal > 0 && b.blocks.length > 0) {
          const socleGeo = new THREE.BoxGeometry(CELL - GAP, SOCLE_H, CELL - GAP);
          const socleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
          const socleMesh = new THREE.Mesh(socleGeo, socleMat);
          socleMesh.position.set(x, SOCLE_H / 2, z);
          socleMesh.userData.socleValue = socleVal;
          socleMesh.userData.cellKey = key;
          buildingGroup.add(socleMesh);
          socleMeshes.push(socleMesh);
          pickables.push(socleMesh);
          const label = makeNumberSprite(socleVal);
          label.position.set(x, SOCLE_H + 0.16, z);
          buildingGroup.add(label);
        }
        const baseH = socleVal > 0 && b.blocks.length > 0 ? SOCLE_H : 0;
        b.blocks.forEach((color, i) => {
          const geo = new THREE.BoxGeometry(CELL - GAP, LEVEL_H - LEVEL_GAP, CELL - GAP);
          const mesh = new THREE.Mesh(geo, getBlockMaterial(color));
          addToonOutline(mesh, geo);
          const centerY = baseH + i * LEVEL_H + LEVEL_H / 2;
          mesh.position.set(x, centerY, z);
          mesh.userData.cellKey = key;
          buildingGroup.add(mesh);
          pickables.push(mesh);
          // Stud sommital (cf. icônes officielles Bloc_*.png) : petit cube
          // en relief au centre du dessus + ombre douce à sa base, visible
          // uniquement sur le bloc du SOMMET de la pile — les studs des
          // blocs inférieurs sont cachés par le bloc suivant, comme un
          // connecteur Lego.
          if (i === b.blocks.length - 1) {
            const topY = centerY + (LEVEL_H - LEVEL_GAP) / 2;
            const studSize = (CELL - GAP) * 0.34;
            const studH = (LEVEL_H - LEVEL_GAP) * 0.24;

            const shadowGeo = new THREE.CircleGeometry(studSize * 0.62, 24);
            const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
            const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
            shadowMesh.rotation.x = -Math.PI / 2;
            shadowMesh.position.set(x, topY + 0.004, z);
            buildingGroup.add(shadowMesh);

            const studGeo = new THREE.BoxGeometry(studSize, studH, studSize);
            const studMat = new THREE.MeshStandardMaterial({ color: COLOR_HEX_3D[color] || 0x999999, roughness: 0.65 });
            const studMesh = new THREE.Mesh(studGeo, studMat);
            addToonOutline(studMesh, studGeo, 1.04);
            studMesh.position.set(x, topY + studH / 2, z);
            buildingGroup.add(studMesh);
          }
        });
      });
    }

    function rebuildLoose(looseData, boardData) {
      viderGroupe(looseGroup);
      Object.entries(looseData).forEach(([key, stack]) => {
        if (!stack || stack.length === 0) return;
        const r = rowIndex(key[0]);
        const c = Number(key.slice(1));
        const { x, z } = cellWorld(r, c);
        const bldg = boardData[key];
        const baseN = bldg ? bldg.blocks.length : 0;
        const baseSocle = bldg && bldg.blocks.length > 0 ? SOCLE_H : 0;
        const baseY = baseSocle + baseN * LEVEL_H;
        stack.forEach((entry, i) => {
          const isSocle = isSocleMarker(entry);
          const geo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
          const mat = new THREE.MeshStandardMaterial({
            // Un debris de Socle est blanc, comme le socle sous les
            // batiments (voir socleMat plus haut) — le gris le faisait
            // passer pour un bloc de beton neutre.
            color: isSocle ? 0xffffff : COLOR_HEX[entry] || "#999999",
            roughness: 0.6,
          });
          const mesh = new THREE.Mesh(geo, mat);
          const ox = (i - (stack.length - 1) / 2) * 0.2;
          mesh.position.set(x + ox, baseY + 0.16, z);
          mesh.userData.cellKey = key;
          looseGroup.add(mesh);
          pickables.push(mesh);
          if (isSocle) {
            const label = makeNumberSprite(socleValue(entry));
            label.scale.set(0.2, 0.2, 1);
            label.position.set(x + ox, baseY + 0.32, z);
            looseGroup.add(label);
          }
        });
      });
    }

    function rebuildTitans(titansData, boardData) {
      viderGroupe(titanGroup);
      titansData.forEach((t) => {
        const key = TITAN_SPRITE_KEY[t.id] || "escargot";
        const texture = getSpriteTexture(key);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        const asp = SPRITE_ASPECT[key] || 1;
        const H = 0.85;
        sprite.scale.set(H * asp, H, 1);
        sprite.center.set(0.5, 0);
        sprite.userData.titanId = t.id;
        sprite.userData.cellKey = t.cell;
        const r = rowIndex(t.cell[0]);
        const c = Number(t.cell.slice(1));

        // Titan éjecté du ring : il attend HORS du plateau, aligné avec la
        // case par laquelle il rentrera. On le pose une case au-delà du
        // bord concerné, translucide, pour qu'on lise à la fois « il n'est
        // pas en jeu » et « c'est par là qu'il revient ».
        if (t.horsPlateau) {
          let dr = 0, dc = 0;
          if (c === 1) dc = -1;
          else if (c === 9) dc = 1;
          else if (r === 0) dr = -1;
          else if (r === 8) dr = 1;
          else dc = -1; // sécurité : cas qui ne devrait pas se produire
          const { x: xo, z: zo } = cellWorld(r + dr, c + dc);
          material.opacity = 0.45;
          sprite.position.set(xo, 0, zo);
          // Il attend HORS du ring : sa case ne désigne plus une position
          // jouable, cliquer dessus ne doit rien viser sur le plateau.
          delete sprite.userData.cellKey;
          titanGroup.add(sprite);
          return;
        }

        const bldg = boardData[t.cell];
        const n = bldg ? bldg.blocks.length : 0;
        const socleH = bldg && bldg.blocks.length > 0 ? SOCLE_H : 0;
        const { x, z } = cellWorld(r, c);
        sprite.position.set(x, socleH + n * LEVEL_H, z);
        titanGroup.add(sprite);
        pickables.push(sprite);
      });
    }

    function rebuildHighlight(titansData, selId, boardData, cellules) {
      viderGroupe(highlightGroup);
      const titan = titansData.find((t) => t.id === selId);
      const slabSize = CELL - GAP;

      function addSlab(cellKey, color, opacity) {
        const r = rowIndex(cellKey[0]);
        const c = Number(cellKey.slice(1));
        if (r < 0 || r > 8 || c < 1 || c > 9) return;
        const { x, z } = cellWorld(r, c);
        const bldg = boardData ? boardData[cellKey] : null;
        const bldgH = bldg && bldg.blocks.length > 0
          ? SOCLE_H + bldg.blocks.length * LEVEL_H
          : 0;
        const boxH = bldgH > 0 ? bldgH * 1.1 : LEVEL_H;
        const geo = new THREE.BoxGeometry(slabSize, boxH, slabSize);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
        const slab = new THREE.Mesh(geo, mat);
        slab.position.set(x, boxH / 2, z);
        highlightGroup.add(slab);
      }

      // Périmètre du Titan sélectionné, toujours affiché. Un Titan hors du
      // ring n'occupe aucune case : on ne dessine pas sa zone d'action là où
      // il n'est pas.
      if (titan && !titan.horsPlateau) {
        const slabColor = TITAN_RING_COLOR[titan.id] ?? 0xffd93d;
        const r0 = rowIndex(titan.cell[0]);
        const c0 = Number(titan.cell.slice(1));
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const r = r0 + dr, c = c0 + dc;
            if (r < 0 || r > 8 || c < 1 || c > 9) continue;
            // Opacite baissee de 0.72 a 0.4 avec l'assombrissement de
            // TITAN_RING_COLOR : le perimetre etait PLUS opaque que les cases
            // d'action dessinees par-dessus (0.55), donc il les ecrasait.
            addSlab(rowFromIndex(r) + c, slabColor, 0.4);
          }
        }
      }

      /* Cases cliquables du moment. Elles arrivent toutes calculées et déjà
         colorées, depuis le même code qui peint la grille 2D : déplacement,
         charge, saut, ramassage, repli, écroulement. Le plateau 3D n'a donc
         plus une seule règle à connaître, et ne peut plus proposer autre
         chose que la 2D. Dessinées APRÈS le périmètre pour rester lisibles
         par-dessus lui. */
      (cellules || []).forEach(({ key, couleur, opacite }) => {
        addSlab(key, couleur, opacite ?? 0.55);
      });
    }

    function rebuildAll() {
      const { board: b, looseBlocks: lb, titans: ts, selectedTitanId: sel, cellulesActives: ca } = dataRef.current;
      viderPick();
      rebuildBuildings(b);
      rebuildLoose(lb, b);
      rebuildTitans(ts, b);
      rebuildHighlight(ts, sel, b, ca);
    }
    rebuildRef.current = rebuildAll;
    rebuildAll();

    // --- Interactions : orbite (glisser), zoom (molette/boutons),
    // clic sur Titan → sélection, survol Socle → tooltip valeur ---
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;

    // Pinch-to-zoom state
    const activePointers = new Map();
    let lastPinchDist = null;

    function getPinchDist() {
      const pts = [...activePointers.values()];
      if (pts.length < 2) return null;
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onPointerDown(e) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 1) {
        dragging = true;
        moved = false;
        lastX = e.clientX;
        lastY = e.clientY;
      } else if (activePointers.size === 2) {
        dragging = false;
        lastPinchDist = getPinchDist();
      }
    }
    function onPointerMove(e) {
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      // Pinch zoom (2 doigts)
      if (activePointers.size === 2) {
        const dist = getPinchDist();
        if (lastPinchDist !== null && dist !== null) {
          const factor = dist / lastPinchDist;
          camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, 0.4, 5);
          camera.updateProjectionMatrix();
        }
        lastPinchDist = dist;
        return;
      }
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        spherical.theta -= dx * 0.008;
        spherical.phi = THREE.MathUtils.clamp(
          spherical.phi - dy * 0.006,
          THREE.MathUtils.degToRad(25),
          THREE.MathUtils.degToRad(85)
        );
        lastX = e.clientX;
        lastY = e.clientY;
        updateCamera();
        setHoverSocle(null);
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(socleMeshes, false);
      setHoverSocle(hits.length > 0 ? { x: e.clientX, y: e.clientY, value: hits[0].object.userData.socleValue } : null);
    }
    function onPointerLeave(e) {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) lastPinchDist = null;
      if (activePointers.size === 0) setHoverSocle(null);
    }
    function onPointerUp(e) {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) lastPinchDist = null;
      dragging = false;
      if (!moved) handleClick(e);
    }
    function onWheel(e) {
      e.preventDefault();
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * (1 - e.deltaY * 0.001), 0.4, 5);
      camera.updateProjectionMatrix();
    }
    /* UN CLIC = UNE CASE. On prend le premier objet touché — sol, étage de
       bâtiment, débris ou sprite de Titan — et on lit la case qu'il porte.
       Cliquer le sommet d'une tour vise donc bien SA case, et non la case du
       sol qu'on aperçoit derrière elle sous cet angle de caméra.

       La case part ensuite dans l'aiguilleur commun aux deux vues : c'est
       lui qui sait si on est en train de se déplacer, de viser une charge ou
       simplement de sélectionner un Titan. Rien de tout ça ne se décide ici.
       À défaut d'aiguilleur (vue montée en simple visualisation), on retombe
       sur l'ancien comportement, la sélection du Titan cliqué. */
    function handleClick(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      if (hits.length === 0) return;
      const touche = hits[0].object;
      const { onCellClick: clic, onSelectTitan: selectionner } = dataRef.current;
      if (clic && touche.userData.cellKey) { clic(touche.userData.cellKey); return; }
      if (selectionner && touche.userData.titanId != null) selectionner(touche.userData.titanId);
    }

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointerleave", onPointerLeave);
    dom.addEventListener("wheel", onWheel, { passive: false });

    let rafId;
    function tick() {
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    function resetView() {
      spherical.theta = Math.PI / 4;
      spherical.phi = THREE.MathUtils.degToRad(55);
      camera.zoom = 2;
      camera.updateProjectionMatrix();
      updateCamera();
    }
    function rotateBy(dir) {
      spherical.theta += dir * (Math.PI / 2);
      updateCamera();
    }
    function zoomBy(factor) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, 0.5, 3.5);
      camera.updateProjectionMatrix();
    }

    function handleResize() {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      aspect = w / h;
      camera.left = -viewSize * aspect;
      camera.right = viewSize * aspect;
      camera.top = viewSize;
      camera.bottom = -viewSize;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    apiRef.current = { resetView, rotateBy, zoomBy };

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointerleave", onPointerLeave);
      dom.removeEventListener("wheel", onWheel);
      renderer.dispose();
      if (mount.contains(dom)) mount.removeChild(dom);
    };
    // Aucune dépendance, et plus besoin d'en désactiver le contrôle : depuis
    // que les gestionnaires de clic lisent `dataRef` plutôt que les props
    // capturées, cet effet ne référence réellement plus rien de l'extérieur.
  }, []); // mise en place unique — le contenu est reconstruit via rebuildRef

  // Reconstruction du contenu (bâtiments/blocs/titans/halo) à chaque
  // changement de signature de plateau ou de sélection — la caméra et
  // le renderer, eux, persistent (pas de saut de vue).
  // `signatureCellules` : les cases actives changent à chaque ouverture de
  // mode, et leur tableau est reconstruit à chaque rendu. Comparer leur
  // contenu plutôt que leur référence évite de reconstruire toute la scène
  // à chaque frappe de clavier ailleurs dans la page.
  const signatureCellules = cellulesActives.map((c) => `${c.key}:${c.couleur}`).join("|");
  useEffect(() => {
    if (rebuildRef.current) rebuildRef.current();
  }, [boardVersion, selectedTitanId, signatureCellules]);

  return (
    <div>
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "min(460px, 55vw)",
          borderRadius: 16,
          overflow: "hidden",
          background: "rgba(0,0,0,.15)",
          cursor: "grab",
          touchAction: "none",
          position: "relative",
        }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={() => apiRef.current && apiRef.current.rotateBy(-1)} style={BOARD3D_BTN_STYLE}>
          ⟲ 90°
        </button>
        <button onClick={() => apiRef.current && apiRef.current.rotateBy(1)} style={BOARD3D_BTN_STYLE}>
          ⟳ 90°
        </button>
        <button onClick={() => apiRef.current && apiRef.current.zoomBy(1.2)} style={BOARD3D_BTN_STYLE}>
          🔍 +
        </button>
        <button onClick={() => apiRef.current && apiRef.current.zoomBy(1 / 1.2)} style={BOARD3D_BTN_STYLE}>
          🔍 −
        </button>
        <button onClick={() => apiRef.current && apiRef.current.resetView()} style={BOARD3D_BTN_STYLE}>
          Réinitialiser la vue
        </button>
      </div>
      {hoverSocle && (
        <div
          style={{
            position: "fixed",
            left: hoverSocle.x + 14,
            top: hoverSocle.y + 14,
            pointerEvents: "none",
            background: "rgba(10,2,18,.92)",
            border: "1px solid rgba(255,255,255,.25)",
            borderRadius: 6,
            padding: "4px 9px",
            fontSize: ".76rem",
            fontFamily: "'Bowlby One', sans-serif",
            color: "#fff",
            zIndex: 1000,
            whiteSpace: "nowrap",
          }}
        >
          Socle : {hoverSocle.value}
        </div>
      )}
    </div>
  );
}

