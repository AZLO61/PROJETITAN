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
export default function Board3D({ board, looseBlocks, titans, boardVersion, selectedTitanId, onSelectTitan, moveClassic, moveTeleport, moveMode }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);
  const rebuildRef = useRef(null);
  const dataRef = useRef({ board, looseBlocks, titans, selectedTitanId, moveClassic, moveTeleport, moveMode });
  dataRef.current = { board, looseBlocks, titans, selectedTitanId, moveClassic, moveTeleport, moveMode };
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
    const ROAD_COLOR = 0x252528;
    for (let r = 0; r <= 8; r++) {
      for (let c = 1; c <= 9; c++) {
        const { x, z } = cellWorld(r, c);
        const geo = new THREE.BoxGeometry(CELL - GAP, 0.08, CELL - GAP);
        const mat = new THREE.MeshStandardMaterial({ color: ROAD_COLOR, roughness: 0.95 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, -0.04, z);
        groundGroup.add(mesh);
      }
    }

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
        ctx.strokeStyle = strokeBoosted;
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
      texture.colorSpace = THREE.SRGBColorSpace; // PNG couleur (sprite Titan) → décodage sRGB requis, sinon halo blanchâtre au blending alpha
      spriteTextureCache.set(key, texture);
      return texture;
    }

    const socleMeshes = [];

    function rebuildBuildings(boardData) {
      buildingGroup.clear();
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
          buildingGroup.add(socleMesh);
          socleMeshes.push(socleMesh);
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
          buildingGroup.add(mesh);
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
      looseGroup.clear();
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
            color: isSocle ? 0x8a8a8a : COLOR_HEX[entry] || "#999999",
            roughness: 0.6,
          });
          const mesh = new THREE.Mesh(geo, mat);
          const ox = (i - (stack.length - 1) / 2) * 0.2;
          mesh.position.set(x + ox, baseY + 0.16, z);
          looseGroup.add(mesh);
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
      titanGroup.clear();
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
        const r = rowIndex(t.cell[0]);
        const c = Number(t.cell.slice(1));
        const bldg = boardData[t.cell];
        const n = bldg ? bldg.blocks.length : 0;
        const socleH = bldg && bldg.blocks.length > 0 ? SOCLE_H : 0;
        const { x, z } = cellWorld(r, c);
        sprite.position.set(x, socleH + n * LEVEL_H, z);
        titanGroup.add(sprite);
      });
    }

    function rebuildHighlight(titansData, selId, boardData, classicCells, teleportCells, isMoveMode) {
      highlightGroup.clear();
      const titan = titansData.find((t) => t.id === selId);
      if (!titan) return;
      const slabColor = TITAN_RING_COLOR[titan.id] ?? 0xffd93d;
      const r0 = rowIndex(titan.cell[0]);
      const c0 = Number(titan.cell.slice(1));
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

      // Périmètre (toujours affiché)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const r = r0 + dr, c = c0 + dc;
          if (r < 0 || r > 8 || c < 1 || c > 9) continue;
          const cellKey = rowFromIndex(r) + c;
          addSlab(cellKey, slabColor, 0.72);
        }
      }

      // Cases de mouvement (uniquement en moveMode)
      if (isMoveMode) {
        if (classicCells) {
          classicCells.forEach((cellKey) => {
            addSlab(cellKey, 0x71dbff, 0.55); // bleu cyan — classique (plus opaque)
          });
        }
        if (teleportCells) {
          teleportCells.forEach((cellKey) => {
            addSlab(cellKey, 0xb88cff, 0.38); // violet — téléporteur (plus transparent)
          });
        }
      }
    }

    function rebuildAll() {
      const { board: b, looseBlocks: lb, titans: ts, selectedTitanId: sel, moveClassic: mc, moveTeleport: mt, moveMode: mm } = dataRef.current;
      rebuildBuildings(b);
      rebuildLoose(lb, b);
      rebuildTitans(ts, b);
      rebuildHighlight(ts, sel, b, mc, mt, mm);
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
    function handleClick(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(titanGroup.children, false);
      if (hits.length > 0 && onSelectTitan) onSelectTitan(hits[0].object.userData.titanId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mise en place unique — le contenu est reconstruit via rebuildRef

  // Reconstruction du contenu (bâtiments/blocs/titans/halo) à chaque
  // changement de signature de plateau ou de sélection — la caméra et
  // le renderer, eux, persistent (pas de saut de vue).
  useEffect(() => {
    if (rebuildRef.current) rebuildRef.current();
  }, [boardVersion, selectedTitanId, moveMode]);

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

