import * as THREE from 'three';
import { applyStylizedWaterShader } from './dioramaRenderer.js';

export function createVoxelMaterials() {
  const mkStd = (color, roughness = 0.86, metalness = 0.03, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      ...extra,
    });

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x45a3c7,
    roughness: 0.36,
    metalness: 0.08,
    transparent: true,
    opacity: 0.92,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  applyStylizedWaterShader(waterMat);

  return {
    grassLush: mkStd(0x8ab458, 0.88, 0.02),
    earthCliff: mkStd(0xb59c7b, 0.90, 0.02),
    desertSand: mkStd(0xecd9b2, 0.88, 0.02),
    limestone: mkStd(0xe6e1d6, 0.84, 0.02),
    ironCrag: mkStd(0x8c7c74, 0.82, 0.08),
    basaltCliff: mkStd(0x687282, 0.86, 0.04),
    cobbleRoad: mkStd(0xd9d2c5, 0.86, 0.02),

    water: waterMat,
    waterFoam: mkStd(0xeef8ff, 0.65, 0.0),
    pitchBog: new THREE.MeshStandardMaterial({
      color: 0x2a2538,
      roughness: 0.28,
      metalness: 0.10,
    }),

    stoneLight: mkStd(0xf3ede0, 0.82, 0.02),
    stoneMid: mkStd(0xe4ddd0, 0.84, 0.02),
    stoneDark: mkStd(0xc4bab0, 0.88, 0.02),
    stoneDamaged: mkStd(0xb8afa2, 0.90, 0.02),

    wolfStone: mkStd(0x6b7485, 0.80, 0.06),
    wolfStoneDark: mkStd(0x525a6b, 0.84, 0.06),
    wolfTrim: mkStd(0xc93b3b, 0.72, 0.04),

    timberDark: mkStd(0x7c5333, 0.86, 0.0),
    timberWarm: mkStd(0xad7c4c, 0.82, 0.0),
    plankLight: mkStd(0xd4a56e, 0.80, 0.0),
    thatchGold: mkStd(0xedc04c, 0.86, 0.0),
    wheatStalk: mkStd(0xf5cf56, 0.82, 0.0),

    leafOak: mkStd(0x6ba847, 0.86, 0.0),
    leafPine: mkStd(0x528f47, 0.86, 0.0),
    leafPalm: mkStd(0x78ba4c, 0.82, 0.0),

    crusaderBlue: mkStd(0x2e7de9, 0.68, 0.04),
    crusaderWhite: mkStd(0xfaf8f2, 0.75, 0.02),
    wolfRed: mkStd(0xd93b3b, 0.68, 0.04),
    goldTrim: mkStd(0xf7bd36, 0.38, 0.58),
    steelBright: mkStd(0xe2e8f0, 0.40, 0.55),
    ironDark: mkStd(0x526071, 0.48, 0.48),
    ironOreNugget: mkStd(0xd9804a, 0.52, 0.38),

    // HDR Emissive Fire picked up softly by half-res Bloom!
    fireCore: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 2.3, 1.1) }),
    fireMid: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.15, 0.25) }),
    fireOuter: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 0.48, 0.10) }),

    cloudWhite: new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      fog: false,
    }),

    ghostValid: new THREE.MeshBasicMaterial({
      color: 0x4ade80, transparent: true, opacity: 0.50, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }),
    ghostInvalid: new THREE.MeshBasicMaterial({
      color: 0xf87171, transparent: true, opacity: 0.50, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }),
    biomeHighlight: new THREE.MeshBasicMaterial({
      color: 0x86efac, transparent: true, opacity: 0.42, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
  };
}

// Subtle deterministic per-tile hue/value variation so large voxel surfaces feel hand-crafted
export function jitterColor(baseHex, seed, spread = 0.055) {
  const c = new THREE.Color(baseHex);
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  const frac = n - Math.floor(n); // 0..1
  const delta = (frac - 0.5) * 2 * spread;
  c.offsetHSL(delta * 0.18, delta * 0.15, delta);
  return c;
}
