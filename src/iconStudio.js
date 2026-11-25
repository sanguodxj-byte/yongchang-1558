import * as THREE from 'three';
import { VoxelGrid, VMAT } from './voxelEngine.js';
import { prefabs } from './voxelPrefabs.js';
import { createVoxelHumanoid, createSiegeEngine } from './entities.js';

// Custom 3D Micro-Voxel Models for Pitch Barrel & Demolish Pickaxe so EVERY card has a true 3D model render!
function createPitchIconModel() {
  const vg = new VoxelGrid(12, 14, 12);
  // Dark wooden tar barrel with iron hoops + spilled glossy pitch puddle + flame spark!
  vg.cylinderY(5.5, 5.5, 0, 0, 5.2, 0x262134, 0.03, VMAT.PITCH);
  vg.cylinderY(5.5, 5.5, 1, 10, 3.3, 0x6b472c, 0.03, VMAT.TIMBER);
  vg.cylinderY(5.5, 5.5, 3, 3, 3.5, 0x475569, 0.02, VMAT.METAL);
  vg.cylinderY(5.5, 5.5, 8, 8, 3.5, 0x475569, 0.02, VMAT.METAL);
  vg.cylinderY(5.5, 5.5, 10, 10, 2.8, 0x1e192b, 0.02, VMAT.PITCH);
  vg.box(5, 11, 5, 6, 13, 6, 0xff8800, 0, true);
  vg.set(5, 13, 5, 0xfff3b0, 0, true);
  return vg.buildMeshGroup(0.11, { x: -0.5, y: 0, z: -0.5 }, true, true, true);
}

function createDemolishPickaxeModel() {
  const vg = new VoxelGrid(14, 14, 6);
  // Diagonal oak handle + curved forged steel pickaxe head + cracked stone blocks!
  vg.box(2, 0, 1, 6, 3, 4, 0xd9d2c5, 0.03, false, VMAT.ASHLAR);
  vg.box(8, 0, 2, 11, 2, 4, 0xc4bab0, 0.03, false, VMAT.ASHLAR);
  for (let i = 1; i <= 10; i++) {
    vg.box(i, i, 2, i + 1, i + 1, 3, 0x9c6b3b, 0.03, false, VMAT.TIMBER);
  }
  // Curved steel pickaxe head
  vg.box(7, 11, 2, 12, 12, 3, 0xdbe4ee, 0.02, false, VMAT.METAL);
  vg.box(11, 8, 2, 12, 11, 3, 0xcbd5e1, 0.02, false, VMAT.METAL);
  vg.box(6, 12, 2, 8, 13, 3, 0xcbd5e1, 0.02, false, VMAT.METAL);
  return vg.buildMeshGroup(0.11, { x: -0.5, y: 0, z: -0.5 }, true, true, false);
}

/**
 * Renders crisp 3D studio-lit miniature portraits for every building & unit using the main WebGLRenderer
 * via a 2x supersampled RenderTarget (zero extra WebGL context, 100% shared texture atlas compatibility!).
 */
export function generateAll3DIcons(renderer, mats) {
  const OUT_SIZE = 136;
  const SSAA = 2;
  const RT_SIZE = OUT_SIZE * SSAA; // 272x272 supersampled capture -> downscaled to 136x136 crisp icon!

  const rt = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    colorSpace: THREE.SRGBColorSpace,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  const studioScene = new THREE.Scene();
  studioScene.add(new THREE.AmbientLight('#fff5e6', 0.30));
  const hemi = new THREE.HemisphereLight('#d9efff', '#6d8258', 0.68);
  studioScene.add(hemi);

  // Align warm golden keyLight + right bounce fillLight with front-left camera (-0.62, 0.70, 0.92)!
  const keyLight = new THREE.DirectionalLight('#fff2d6', 2.25);
  keyLight.position.set(-9, 13, 8);
  studioScene.add(keyLight);

  const fillLight = new THREE.DirectionalLight('#ffe8c8', 1.15);
  fillLight.position.set(9, 8, 9);
  studioScene.add(fillLight);

  const rimLight = new THREE.DirectionalLight('#bfe0ff', 0.80);
  rimLight.position.set(4, 10, -9);
  studioScene.add(rimLight);

  // Subtle warm stone diorama pedestal disc under every 3D icon!
  const plinthGeo = new THREE.CylinderGeometry(0.95, 1.04, 0.12, 8);
  const plinthMat = new THREE.MeshStandardMaterial({
    color: '#e5dac3',
    roughness: 0.88,
    metalness: 0.03,
  });
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  studioScene.add(plinth);

  const pivot = new THREE.Group();
  studioScene.add(pivot);

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);

  const pixelBuf = new Uint8Array(RT_SIZE * RT_SIZE * 4);
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = RT_SIZE;
  srcCanvas.height = RT_SIZE;
  const srcCtx = srcCanvas.getContext('2d');
  const imgData = srcCtx.createImageData(RT_SIZE, RT_SIZE);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = OUT_SIZE;
  dstCanvas.height = OUT_SIZE;
  const dstCtx = dstCanvas.getContext('2d');
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = 'high';

  const prevTarget = renderer.getRenderTarget();
  const prevClearColor = new THREE.Color();
  renderer.getClearColor(prevClearColor);
  const prevClearAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  const prevExposure = renderer.toneMappingExposure;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0x000000, 0);

  const captureObject = (obj, rotY = -0.62) => {
    while (pivot.children.length > 0) pivot.remove(pivot.children[0]);
    obj.rotation.y = rotY;
    pivot.add(obj);
    pivot.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Seat model cleanly atop pedestal plinth
    const shiftY = -box.min.y;
    obj.position.set(-center.x, shiftY, -center.z);
    pivot.updateMatrixWorld(true);

    const pRadius = Math.max(size.x, size.z) * 0.42;
    plinth.scale.set(pRadius, 1, pRadius);
    plinth.position.set(0, -0.06, 0);

    const framedBox = new THREE.Box3().setFromObject(pivot);
    const fSize = new THREE.Vector3();
    const fCenter = new THREE.Vector3();
    framedBox.getSize(fSize);
    framedBox.getCenter(fCenter);

    // Isometric 32-degree studio camera framing!
    const camDir = new THREE.Vector3(-0.62, 0.70, 0.92).normalize();
    cam.position.copy(fCenter).addScaledVector(camDir, 15);
    cam.lookAt(fCenter);
    cam.updateMatrixWorld(true);

    // Tight hero framing so 3D models fill ~88% of the card portrait!
    let maxExtent = 0.32;
    for (let dx = -0.5; dx <= 0.5; dx += 1) {
      for (let dy = -0.5; dy <= 0.5; dy += 1) {
        for (let dz = -0.5; dz <= 0.5; dz += 1) {
          const pt = new THREE.Vector3(
            fCenter.x + dx * fSize.x,
            fCenter.y + dy * fSize.y,
            fCenter.z + dz * fSize.z
          ).applyMatrix4(cam.matrixWorldInverse);
          maxExtent = Math.max(maxExtent, Math.abs(pt.x), Math.abs(pt.y));
        }
      }
    }
    const halfSpan = maxExtent * 0.92;
    cam.left = -halfSpan;
    cam.right = halfSpan;
    cam.top = halfSpan;
    cam.bottom = -halfSpan;
    cam.updateProjectionMatrix();

    renderer.setRenderTarget(rt);
    renderer.clear(true, true, false);
    renderer.render(studioScene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, RT_SIZE, RT_SIZE, pixelBuf);

    // Flip WebGL bottom-up rows & convert linear/output to crisp sRGB image!
    const dst = imgData.data;
    for (let y = 0; y < RT_SIZE; y++) {
      const srcRow = (RT_SIZE - 1 - y) * RT_SIZE * 4;
      const dstRow = y * RT_SIZE * 4;
      for (let x = 0; x < RT_SIZE * 4; x += 4) {
        const a = pixelBuf[srcRow + x + 3];
        dst[dstRow + x] = pixelBuf[srcRow + x];
        dst[dstRow + x + 1] = pixelBuf[srcRow + x + 1];
        dst[dstRow + x + 2] = pixelBuf[srcRow + x + 2];
        dst[dstRow + x + 3] = a;
      }
    }
    srcCtx.putImageData(imgData, 0, 0);
    dstCtx.clearRect(0, 0, OUT_SIZE, OUT_SIZE);
    dstCtx.drawImage(srcCanvas, 0, 0, OUT_SIZE, OUT_SIZE);
    return dstCanvas.toDataURL('image/png');
  };

  const icons = { buildings: {}, units: {} };

  const buildIds = [
    'wall', 'tower', 'gate', 'pitch', 'ballista', 'demolish',
    'woodcutter', 'quarry', 'farm', 'ironMine', 'pitchRig', 'hovel',
    'fletcher', 'blacksmith',
  ];
  buildIds.forEach((id) => {
    let model;
    if (id === 'pitch') model = createPitchIconModel();
    else if (id === 'demolish') model = createDemolishPickaxeModel();
    else if (id === 'wall') {
      // 2-segment connected curtain wall diorama showing arrow-slit, buttress, oak walkway & finished end-caps!
      model = new THREE.Group();
      const segL = prefabs.instantiateWall('player', 2, 0, 0);
      const segR = prefabs.instantiateWall('player', 8, 0, 1);
      segL.position.x = -0.5;
      segR.position.x = 0.5;
      model.add(segL, segR);
    } else model = prefabs.instantiate(id, 'player');
    icons.buildings[id] = captureObject(model, id === 'farm' ? -0.85 : (id === 'wall' ? -0.55 : -0.65));
  });

  const unitIds = ['spearman', 'archer', 'swordsman', 'knight', 'trebuchet', 'ram'];
  unitIds.forEach((id) => {
    const isSiege = id === 'trebuchet' || id === 'ram';
    const model = isSiege
      ? createSiegeEngine(id, 'player', mats)
      : createVoxelHumanoid(id, 'player');
    icons.units[id] = captureObject(model, isSiege ? 0.65 : 0.52);
  });

  // Restore main renderer state & free offscreen studio target
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClearColor, prevClearAlpha);
  renderer.toneMapping = prevTone;
  renderer.toneMappingExposure = prevExposure;
  rt.dispose();
  plinthGeo.dispose();
  plinthMat.dispose();

  return icons;
}
