import * as THREE from 'three';
import {
  PolyBuilder,
  VMAT,
  tintHex,
  getSharedVoxelMaterial,
  getSharedEmissiveMaterial,
} from './voxelEngine.js';

export const VOXEL_UNIT = 0.125;

function getThemePalette(team) {
  if (team === 'enemy') {
    // East China Sea Wokou Pirate Stronghold: Charred cedar, dark basalt, weathered mud plaster & blood-crimson banners
    return {
      isEnemy: true,
      stoneBase: 0x3f3d3c,
      stoneA: 0x565352,
      stoneB: 0x4a4746,
      stoneTrim: 0x363434,
      stoneCap: 0x26262b,
      plaster: 0x73685d,
      timber: 0x332419,
      pillar: 0x4d241e,
      plank: 0x6e5038,
      cloth: 0x8c7b6b,
      roofA: 0x282930,
      roofB: 0x1f2026,
      banner: 0x8a1c1c,
      gold: 0xb8822e,
      lantern: 0xff6b2b,
    };
  }
  // Grounded Ming Dynasty Yongchang Fortress Palette (matching historical reference: aged walnut timber, warm lime-ochre plaster, charcoal clay tiles & granite!)
  return {
    isEnemy: false,
    stoneBase: 0x615d55,
    stoneA: 0x8f887d,
    stoneB: 0x80796f,
    stoneTrim: 0x6b655c,
    stoneCap: 0x363a40,
    plaster: 0xdcd0bc,
    timber: 0x4a3423,
    pillar: 0x6e2920,
    plank: 0x9e774d,
    cloth: 0xe2d6c0,
    roofA: 0x393e45,
    roofB: 0x2e3238,
    banner: 0x94231d,
    gold: 0xc89a3c,
    lantern: 0xff8533,
  };
}

// Helper: Add exposed Ming perimeter timber columns + tie-beams around a rectangular hall
function addTimberFrame(pb, cx, y0, cz, sx, sy, sz, timberHex) {
  const hx = sx * 0.5, hz = sz * 0.5;
  for (const dx of [-hx, hx]) {
    for (const dz of [-hz, hz]) {
      pb.prismY(cx + dx, y0, cz + dz, 0.036, 0.033, sy, 10, timberHex, { matId: VMAT.TIMBER });
    }
  }
  // Top tie-beams (额枋) & bottom wooden sill (地栿)
  pb.boxY(cx, y0 + sy - 0.05, cz - hz, sx + 0.04, 0.05, 0.045, timberHex, { matId: VMAT.TIMBER });
  pb.boxY(cx, y0 + sy - 0.05, cz + hz, sx + 0.04, 0.05, 0.045, timberHex, { matId: VMAT.TIMBER });
  pb.boxY(cx - hx, y0 + sy - 0.05, cz, 0.045, 0.05, sz + 0.04, timberHex, { matId: VMAT.TIMBER });
  pb.boxY(cx + hx, y0 + sy - 0.05, cz, 0.045, 0.05, sz + 0.04, timberHex, { matId: VMAT.TIMBER });
}

// Helper: Ming woven bamboo basket / wooden barrel prop (`市井木桶/竹篓`)
function addBarrelOrBasket(pb, cx, y0, cz, r = 0.085, h = 0.17, woodHex = 0x8c643b, hoopHex = 0x3b332b) {
  pb.latheY(cx, y0, cz, [[r * 0.86, 0], [r, h * 0.45], [r * 0.90, h]], 10, woodHex, { matId: VMAT.TIMBER });
  pb.prismY(cx, y0 + h * 0.25, cz, r * 0.97, r * 0.97, 0.022, 10, hoopHex, { openTop: true, matId: VMAT.METAL });
  pb.prismY(cx, y0 + h * 0.72, cz, r * 0.96, r * 0.96, 0.022, 10, hoopHex, { openTop: true, matId: VMAT.METAL });
}

/**
 * Seamless 16-Bitmask Battered Ming Granite Rampart (`永昌堡条石斜垒城垣`)
 * Connected edges span -0.506..+0.506 so adjacent wall/gate/tower segments weld with ZERO gaps!
 */
function buildConnectedWallData(team, mask = 0, stepMask = 0, variant = 0) {
  const pal = getThemePalette(team);
  const pb = new PolyBuilder();

  const hasN = Boolean(mask & 1); // -Z
  const hasE = Boolean(mask & 2); // +X
  const hasS = Boolean(mask & 4); // +Z
  const hasW = Boolean(mask & 8); // -X

  const stepN = Boolean(stepMask & 1);
  const stepE = Boolean(stepMask & 2);
  const stepS = Boolean(stepMask & 4);
  const stepW = Boolean(stepMask & 8);

  const x0 = hasW ? -0.506 : -0.47;
  const x1 = hasE ?  0.506 :  0.47;
  const z0 = hasN ? -0.506 : -0.47;
  const z1 = hasS ?  0.506 :  0.47;
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const sx = x1 - x0;
  const sz = z1 - z0;

  // 1. Underground Skirt (-0.42..0.0) + Stepped Granite Plinth (0.0..0.24)
  pb.boxY(cx, -0.42, cz, sx, 0.43, sz, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
  pb.boxY(cx, 0.0, cz, sx, 0.24, sz, pal.stoneTrim, {
    topScaleX: (hasW || hasE) ? 1.0 : 0.94,
    topScaleZ: (hasN || hasS) ? 1.0 : 0.94,
    skipBottom: true,
    matId: VMAT.ASHLAR,
  });

  // 2. Battered Granite Curtain Body (y = 0.24..1.66) — flush 1.0 along connected axis, tapered 0.86 across thickness!
  const runNS = (hasN || hasS) && !hasE && !hasW;
  const runEW = (hasE || hasW) && !hasN && !hasS;
  const tsx = runEW ? 1.0 : (runNS ? 0.86 : 0.92);
  const tsz = runNS ? 1.0 : (runEW ? 0.86 : 0.92);
  const bodyW = runEW ? sx : sx * 0.96;
  const bodyD = runNS ? sz : sz * 0.96;

  pb.boxY(cx, 0.24, cz, bodyW, 1.42, bodyD, variant ? pal.stoneA : pal.stoneB, {
    topScaleX: tsx,
    topScaleZ: tsz,
    skipBottom: true,
    matId: VMAT.ASHLAR,
  });

  // Projecting stone stringcourse cornice (`挑檐压顶石`) + Paved Bluestone Rampart Walkway (`马道`, y = 1.66..1.76)!
  const deckW = runEW ? sx : Math.min(0.98, bodyW * tsx + 0.08);
  const deckD = runNS ? sz : Math.min(0.98, bodyD * tsz + 0.08);
  pb.boxY(cx, 1.65, cz, deckW, 0.07, deckD, pal.stoneTrim, { skipBottom: true, matId: VMAT.ASHLAR });
  pb.boxY(cx, 1.72, cz, deckW * 0.96, 0.04, deckD * 0.96, pal.stoneB, { skipBottom: true, matId: VMAT.COBBLE });

  // Sculpted Exterior Stone Buttresses (`墙台扶壁`) on alternate segments
  if (variant === 0) {
    if (runEW) {
      pb.boxY(0, 0.22, 0.42, 0.24, 1.22, 0.12, pal.stoneTrim, { topScaleZ: 0.35, topScaleX: 0.78, skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.22, -0.42, 0.24, 1.22, 0.12, pal.stoneTrim, { topScaleZ: 0.35, topScaleX: 0.78, skipBottom: true, matId: VMAT.ASHLAR });
    } else if (runNS) {
      pb.boxY(0.42, 0.22, 0, 0.12, 1.22, 0.24, pal.stoneTrim, { topScaleX: 0.35, topScaleZ: 0.78, skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(-0.42, 0.22, 0, 0.12, 1.22, 0.24, pal.stoneTrim, { topScaleX: 0.35, topScaleZ: 0.78, skipBottom: true, matId: VMAT.ASHLAR });
    }
  }

  // 3. Detailed Ming Brick Parapet & Tile-Capped Merlons (`青砖雉堞与射孔`) ONLY on exposed outer edges!
  const addParapetSide = (side) => {
    const isNS = side === 'n' || side === 's';
    const sgn = (side === 's' || side === 'e') ? 1 : -1;
    const edgeOff = 0.37 * sgn;
    if (isNS) {
      pb.boxY(cx, 1.75, edgeOff, deckW, 0.15, 0.11, pal.stoneA, { skipBottom: true, matId: VMAT.ASHLAR });
      for (const mx of [-0.26, 0.26]) {
        pb.boxY(mx, 1.90, edgeOff, 0.34, 0.19, 0.11, pal.stoneA, { skipBottom: true, matId: VMAT.ASHLAR });
        // Recessed loophole slit (`射孔`)
        pb.boxY(mx, 1.94, edgeOff + sgn * 0.045, 0.05, 0.10, 0.03, 0x1f2328, { matId: VMAT.ASHLAR });
        // Pitched dark clay coping cap (`压顶砖瓦`)
        pb.chineseRoof(mx, 2.09, edgeOff, 0.38, 0.16, 0.055, pal.stoneCap, pal.stoneCap, { style: 'gable', cornerLift: 0.0, noFinial: true });
      }
    } else {
      pb.boxY(edgeOff, 1.75, cz, 0.11, 0.15, deckD, pal.stoneA, { skipBottom: true, matId: VMAT.ASHLAR });
      for (const mz of [-0.26, 0.26]) {
        pb.boxY(edgeOff, 1.90, mz, 0.11, 0.19, 0.34, pal.stoneA, { skipBottom: true, matId: VMAT.ASHLAR });
        pb.boxY(edgeOff + sgn * 0.045, 1.94, mz, 0.03, 0.10, 0.05, 0x1f2328, { matId: VMAT.ASHLAR });
        pb.boxY(edgeOff, 2.09, mz, 0.16, 0.05, 0.38, pal.stoneCap, { topScaleX: 0.55, matId: VMAT.ROOF });
      }
    }
  };

  if (mask === 0) {
    addParapetSide('n');
    addParapetSide('s');
  } else {
    if (!hasN) addParapetSide('n');
    if (!hasS) addParapetSide('s');
    if (!hasE) addParapetSide('e');
    if (!hasW) addParapetSide('w');
  }

  // 4. Hillside Stone Rampart Steps when neighboring wall is higher
  const addSlopeSteps = (dx, dz) => {
    for (let s = 1; s <= 4; s++) {
      pb.boxY(dx * (0.10 * s), 1.74 + s * 0.09, dz * (0.10 * s), dx !== 0 ? 0.14 : 0.46, 0.09, dz !== 0 ? 0.14 : 0.46, pal.stoneA, { matId: VMAT.ASHLAR });
    }
  };
  if (stepN) addSlopeSteps(0, -1);
  if (stepS) addSlopeSteps(0, 1);
  if (stepE) addSlopeSteps(1, 0);
  if (stepW) addSlopeSteps(-1, 0);

  return pb.buildGeometry();
}

/**
 * Unified 2-Body-Width Gatehouse (`永昌堡重檐歇山谯楼城门`)
 * - Flush 2.02m span (`z = -1.01..+1.01`) welding seamlessly into adjacent walls!
 * - 14-segment radial stone voussoir arch (`1.46m` clear width, `1.54m` crown)
 * - Swinging Double Crimson Iron-Studded Gate Doors (`gateLeafL` & `gateLeafR`, never poking through roof!)
 */
function buildGateData(team) {
  const pal = getThemePalette(team);
  const pb = new PolyBuilder();

  // 1. Foundation & Bluestone Flagstone Passage Roadbed
  pb.boxY(0, -0.40, 0, 0.98, 0.42, 2.02, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
  pb.boxY(0, 0.0, 0, 1.00, 0.045, 1.52, pal.stoneB, { skipBottom: true, matId: VMAT.COBBLE });

  // 2. 14-Segment Carved Voussoir Stone Archway Wall (clear width 1.46m along Z = -0.73..+0.73)
  pb.extrudedArchWallX(0, 0.0, 0, 0.96, 2.02, 1.74, 0.73, 0.96, 1.54, pal.stoneA, pal.stoneTrim, 0.05);

  // Projecting stone cornice, walkway deck & flanking crenelated parapets (aligning with adjacent walls!)
  pb.boxY(0, 1.72, 0, 1.00, 0.07, 2.02, pal.stoneTrim, { matId: VMAT.ASHLAR });
  pb.boxY(0, 1.79, 0, 0.92, 0.04, 1.98, pal.stoneB, { matId: VMAT.COBBLE });
  for (const sx of [-0.40, 0.40]) {
    pb.boxY(sx, 1.83, -0.84, 0.11, 0.24, 0.30, pal.stoneA, { matId: VMAT.ASHLAR });
    pb.boxY(sx, 2.07, -0.84, 0.15, 0.045, 0.34, pal.stoneCap, { topScaleX: 0.6, matId: VMAT.ROOF });
    pb.boxY(sx, 1.83, 0.84, 0.11, 0.24, 0.30, pal.stoneA, { matId: VMAT.ASHLAR });
    pb.boxY(sx, 2.07, 0.84, 0.15, 0.045, 0.34, pal.stoneCap, { topScaleX: 0.6, matId: VMAT.ROOF });
  }

  if (!pal.isEnemy) {
    // 3. Two-Story Timber-Framed Ming Qiaolou Pavilion (`重檐歇山谯楼`) with Balustrades & Lattice Windows!
    // Perimeter wooden balustrade (`寻杖栏杆`)
    for (const sx of [-0.38, 0.38]) {
      pb.boxY(sx, 1.96, 0, 0.03, 0.03, 1.36, pal.timber, { matId: VMAT.TIMBER });
      pb.boxY(sx, 1.86, 0, 0.025, 0.04, 1.36, pal.plank, { matId: VMAT.TIMBER });
    }
    // 8 Smooth Cinnabar-Walnut Columns
    const cols = [
      [-0.32, -0.64], [0.32, -0.64], [-0.32, -0.22], [0.32, -0.22],
      [-0.32,  0.22], [0.32,  0.22], [-0.32,  0.64], [0.32,  0.64],
    ];
    cols.forEach(([px, pz]) => {
      pb.prismY(px, 1.83, pz, 0.038, 0.035, 0.64, 10, pal.pillar, { matId: VMAT.TIMBER });
    });
    // Warm plaster & timber lower hall + 3D lattice windows
    pb.boxY(0, 1.83, 0, 0.54, 0.62, 1.18, pal.plaster, { matId: VMAT.PLASTER });
    pb.boxY(0, 1.83, 0, 0.58, 0.42, 0.28, pal.timber, { matId: VMAT.TIMBER });
    for (const sgn of [-1, 1]) {
      pb.latticeWindow(sgn * 0.28, 2.14, -0.38, 0.24, 0.24, sgn > 0 ? 'x+' : 'x-', pal.timber, 0xe8c98e, false);
      pb.latticeWindow(sgn * 0.28, 2.14,  0.38, 0.24, 0.24, sgn > 0 ? 'x+' : 'x-', pal.timber, 0xe8c98e, false);
    }

    // Lower Swept Ribbed Skirt Roof + Upper Story + Grand Ribbed Xieshan Roof!
    pb.chineseRoof(0, 2.40, 0, 1.06, 1.76, 0.22, pal.roofA, pal.stoneCap, { style: 'hip', cornerLift: 0.08, noFinial: true });
    pb.boxY(0, 2.58, 0, 0.44, 0.30, 0.96, pal.timber, { matId: VMAT.TIMBER });
    pb.latticeWindow( 0.23, 2.72, 0, 0.42, 0.16, 'x+', pal.timber, 0xffcf70, true);
    pb.latticeWindow(-0.23, 2.72, 0, 0.42, 0.16, 'x-', pal.timber, 0xffcf70, true);
    pb.chineseRoof(0, 2.86, 0, 0.92, 1.52, 0.38, pal.roofA, pal.stoneCap, {
      style: 'hip',
      cornerLift: 0.12,
      finialHex: pal.gold,
      gableWallHex: pal.plaster,
    });

    // Carved Stone Gate Name Plaque (`「迎川门」青石匾额`) & Warm Paper Lanterns
    for (const sgn of [-1, 1]) {
      pb.boxY(sgn * 0.46, 1.54, 0, 0.05, 0.15, 0.44, 0x2b3038, { matId: VMAT.TIMBER });
      pb.boxY(sgn * 0.48, 1.565, 0, 0.025, 0.10, 0.36, pal.gold, { matId: VMAT.METAL });
      for (const lz of [-0.62, 0.62]) {
        pb.latheY(sgn * 0.40, 2.14, lz, [[0.03, 0], [0.06, 0.05], [0.06, 0.12], [0.03, 0.16]], 10, pal.lantern, { emissive: true });
      }
    }
  } else {
    // Enemy Wokou Fortified Timber Yagura Gatehouse
    pb.boxY(0, 1.83, 0, 0.62, 0.58, 1.38, pal.timber, { matId: VMAT.TIMBER });
    addTimberFrame(pb, 0, 1.83, 0, 0.64, 0.58, 1.40, 0x221710);
    pb.chineseRoof(0, 2.40, 0, 0.96, 1.72, 0.36, pal.roofA, pal.stoneCap, {
      style: 'hip',
      cornerLift: 0.07,
      finialHex: pal.banner,
      gableWallHex: pal.plaster,
    });
  }

  // 4. Swinging Double Crimson Iron-Studded Gate Doors (`双扇包铁铜钉城门`)
  // Left leaf hinge at z = 0 (mounted at z = -0.72, extends +0.71 along +Z); Right leaf extends -0.71 along -Z!
  const buildDoorLeaf = (zDir) => {
    const dp = new PolyBuilder();
    const w = 0.71;
    const zMid = zDir * (w * 0.5);
    const doorCol = pal.isEnemy ? 0x38261b : 0x73221c;
    // Heavy plank leaf with rounded arch-shoulder top
    dp.boxY(0, 0.03, zMid, 0.07, 1.12, w, doorCol, { matId: VMAT.TIMBER });
    dp.boxY(0, 1.15, zDir * (w * 0.62), 0.065, 0.20, w * 0.72, doorCol, { matId: VMAT.TIMBER });
    // Forged iron cross-straps + 4x3 gilded brass door studs (`门钉`)
    for (const sy of [0.22, 0.62, 1.02]) {
      dp.boxY(0, sy, zMid, 0.082, 0.045, w * 0.96, 0x2e343b, { matId: VMAT.METAL });
      for (let r = 1; r <= 3; r++) {
        const sz = zDir * (w * (r / 4));
        dp.cylinderAxis(0, sy + 0.10, sz, 0.018, 0.018, 0.095, 8, 'x', pal.gold, { matId: VMAT.METAL });
      }
    }
    return dp.buildGeometry().geo;
  };

  const mainData = pb.buildGeometry();
  return {
    geo: mainData.geo,
    emissiveGeo: mainData.emissiveGeo,
    doorGeoL: buildDoorLeaf(1),
    doorGeoR: buildDoorLeaf(-1),
    voxelCount: mainData.voxelCount,
  };
}

export class PrefabLibrary {
  constructor() {
    this.cache = new Map();
  }

  get(key, builderFn) {
    if (!this.cache.has(key)) {
      this.cache.set(key, builderFn());
    }
    return this.cache.get(key);
  }

  instantiateWall(team = 'player', mask = 0, stepMask = 0, variant = 0) {
    const fullKey = `mp_wall_${team}_m${mask}_s${stepMask}_v${variant}`;
    const entry = this.get(fullKey, () => buildConnectedWallData(team, mask, stepMask, variant));
    const group = new THREE.Group();
    const main = new THREE.Mesh(entry.geo, getSharedVoxelMaterial());
    main.castShadow = true;
    main.receiveShadow = true;
    group.add(main);
    group.userData.mainMesh = main;
    group.userData.voxelCount = entry.voxelCount;
    if (entry.emissiveGeo) {
      const em = new THREE.Mesh(entry.emissiveGeo, getSharedEmissiveMaterial());
      em.userData.noOutline = true;
      group.add(em);
    }
    return group;
  }

  instantiateGate(team = 'player') {
    const fullKey = `mp_gate_${team}`;
    const entry = this.get(fullKey, () => buildGateData(team));
    const group = new THREE.Group();
    const main = new THREE.Mesh(entry.geo, getSharedVoxelMaterial());
    main.castShadow = true;
    main.receiveShadow = true;
    group.add(main);
    group.userData.mainMesh = main;
    group.userData.voxelCount = entry.voxelCount;
    if (entry.emissiveGeo) {
      const em = new THREE.Mesh(entry.emissiveGeo, getSharedEmissiveMaterial());
      em.userData.noOutline = true;
      group.add(em);
    }
    if (entry.doorGeoL && entry.doorGeoR) {
      const gateLeafL = new THREE.Mesh(entry.doorGeoL, getSharedVoxelMaterial());
      const gateLeafR = new THREE.Mesh(entry.doorGeoR, getSharedVoxelMaterial());
      gateLeafL.castShadow = true;
      gateLeafR.castShadow = true;
      gateLeafL.position.set(0.0, 0.0, -0.72);
      gateLeafR.position.set(0.0, 0.0,  0.72);
      group.add(gateLeafL, gateLeafR);
      group.userData.gateLeafL = gateLeafL;
      group.userData.gateLeafR = gateLeafR;
      group.userData.gateLeaf = gateLeafL;
    }
    return group;
  }

  instantiate(key, team = 'player') {
    if (key === 'wall') return this.instantiateWall(team, 0b1010, 0, 0);
    if (key === 'gate') return this.instantiateGate(team);

    const fullKey = `mp_${key}_${team}`;
    const entry = this.get(fullKey, () => this.buildPrefabData(key, team));
    const group = new THREE.Group();

    const main = new THREE.Mesh(entry.geo, getSharedVoxelMaterial());
    main.castShadow = true;
    main.receiveShadow = true;
    group.add(main);
    group.userData.mainMesh = main;
    group.userData.voxelCount = entry.voxelCount;

    if (entry.emissiveGeo) {
      const em = new THREE.Mesh(entry.emissiveGeo, getSharedEmissiveMaterial());
      em.userData.noOutline = true;
      group.add(em);
    }

    if (key === 'farm' && entry.sailsGeo) {
      const sails = new THREE.Mesh(entry.sailsGeo, getSharedVoxelMaterial());
      sails.castShadow = true;
      sails.position.set(-0.38, 0.40, 0.0);
      group.add(sails);
      group.userData.sails = sails;
    }

    if (key === 'ballista' && entry.turretGeo) {
      const turretGroup = new THREE.Group();
      turretGroup.position.set(0, 1.94, 0);
      const tMesh = new THREE.Mesh(entry.turretGeo, getSharedVoxelMaterial());
      tMesh.castShadow = true;
      turretGroup.add(tMesh);
      group.add(turretGroup);
      group.userData.turretGroup = turretGroup;
    }

    return group;
  }

  getDirectionArrowGeometry() {
    return this.get('mp_ghost_dir_arrow_geo', () => {
      const pb = new PolyBuilder();
      pb.boxY(0, 0, 0.08, 0.14, 0.05, 0.16, 0xd97706);
      pb.tri([-0.22, 0.05, 0.16], [0.22, 0.05, 0.16], [0, 0.05, 0.40], 0xfef08a, 1, 1, 1);
      pb.tri([0, 0.01, 0.40], [0.22, 0.01, 0.16], [-0.22, 0.01, 0.16], 0xfacc15, 1, 1, 1);
      pb.quad([-0.22, 0.01, 0.16], [0.22, 0.01, 0.16], [0.22, 0.05, 0.16], [-0.22, 0.05, 0.16], 0xfacc15);
      pb.quad([0.22, 0.01, 0.16], [0, 0.01, 0.40], [0, 0.05, 0.40], [0.22, 0.05, 0.16], 0xfef08a);
      pb.quad([0, 0.01, 0.40], [-0.22, 0.01, 0.16], [-0.22, 0.05, 0.16], [0, 0.05, 0.40], 0xfef08a);
      return pb.buildGeometry().geo;
    });
  }

  instantiateGhost(key, ghostMat) {
    const group = new THREE.Group();
    let entry = null;
    if (key === 'wall') {
      entry = this.get('mp_wall_player_m0_s0_v0', () => buildConnectedWallData('player', 0, 0, 0));
    } else if (key === 'gate') {
      entry = this.get('mp_gate_player', () => buildGateData('player'));
    } else if (key && key !== 'pitch' && key !== 'demolish') {
      entry = this.get(`mp_${key}_player`, () => this.buildPrefabData(key, 'player'));
    }

    if (entry && entry.geo) {
      const m = new THREE.Mesh(entry.geo, ghostMat);
      m.userData.noOutline = true;
      group.add(m);
      if (key === 'farm' && entry.sailsGeo) {
        const sm = new THREE.Mesh(entry.sailsGeo, ghostMat);
        sm.position.set(0.38, 0.48, 0.0);
        sm.userData.noOutline = true;
        group.add(sm);
      } else if (key === 'ballista' && entry.turretGeo) {
        const tm = new THREE.Mesh(entry.turretGeo, ghostMat);
        tm.position.set(0, 1.94, 0);
        tm.userData.noOutline = true;
        group.add(tm);
      } else if (key === 'gate' && entry.doorGeoL && entry.doorGeoR) {
        const dl = new THREE.Mesh(entry.doorGeoL, ghostMat);
        const dr = new THREE.Mesh(entry.doorGeoR, ghostMat);
        dl.position.set(0, 0, -0.72);
        dr.position.set(0, 0,  0.72);
        dl.userData.noOutline = true;
        dr.userData.noOutline = true;
        group.add(dl, dr);
      }
    }

    if (key && key !== 'pitch' && key !== 'demolish') {
      const arrowMat = this.get('mp_ghost_arrow_mat', () => new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }));
      const arrow = new THREE.Mesh(this.getDirectionArrowGeometry(), arrowMat);
      arrow.userData.noOutline = true;
      if (key === 'gate') {
        arrow.rotation.y = Math.PI * 0.5;
        arrow.position.set(0.54, 0.06, 0);
      } else {
        arrow.position.set(0, 0.06, 0.52);
      }
      group.add(arrow);
    }

    return group;
  }

  instantiateTreeStump() {
    const entry = this.get('mp_felled_stump', () => {
      const pb = new PolyBuilder();
      pb.latheY(0, 0, 0, [[0.24, 0], [0.18, 0.08], [0.15, 0.21]], 10, 0x593d28, { matId: VMAT.TIMBER });
      pb.prismY(0, 0.21, 0, 0.145, 0.14, 0.018, 10, 0xd8ba8c, { matId: VMAT.TIMBER });
      pb.box(-0.15, 0.04, 0.05, 0.14, 0.06, 0.07, 0x4d3422, { rotZ: 0.28, matId: VMAT.TIMBER });
      pb.box(0.14, 0.04, -0.05, 0.14, 0.06, 0.07, 0x4d3422, { rotZ: -0.28, matId: VMAT.TIMBER });
      return pb.buildGeometry();
    });
    const m = new THREE.Mesh(entry.geo, getSharedVoxelMaterial());
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  buildPrefabData(key, team) {
    const pal = getThemePalette(team);
    const pb = new PolyBuilder();

    // =========================================================================
    // 1. KEEP: 英桥王氏大宗祠 (Player) vs 东海倭寇安宅巨舰水寨 (Enemy) [2x2]
    // =========================================================================
    if (key === 'keep') {
      if (!pal.isEnemy) {
        // Stepped Bluestone Xumi Terrace + Carved Stone Balustrade Posts (`青石须弥台基与望柱栏板`)
        pb.boxY(0, -0.35, 0, 1.96, 0.36, 1.96, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
        pb.boxY(0, 0.0, 0, 1.94, 0.24, 1.94, pal.stoneA, { topScaleX: 0.97, topScaleZ: 0.97, matId: VMAT.ASHLAR });
        pb.boxY(0, 0.24, 0, 1.88, 0.08, 1.88, pal.stoneB, { matId: VMAT.COBBLE });

        // Perimeter Stone Balustrades around front courtyard (+X)
        for (const zSgn of [-1, 1]) {
          pb.boxY(0.86, 0.32, zSgn * 0.64, 0.06, 0.16, 0.46, pal.stoneA, { matId: VMAT.ASHLAR });
          for (const bz of [0.42, 0.86]) {
            pb.boxY(0.86, 0.32, zSgn * bz, 0.08, 0.24, 0.08, pal.stoneTrim, { matId: VMAT.ASHLAR });
            pb.ellipsoid(0.86, 0.59, zSgn * bz, 0.045, 0.05, 0.045, pal.stoneA, { uSegs: 8, vSegs: 6, matId: VMAT.ASHLAR });
          }
        }

        // Ceremonial 3-Step Spirit Stairs (+X) & Twin Sculpted Stone Guardian Lions (`青石镇宅石狮`)!
        for (let st = 0; st < 3; st++) {
          pb.boxY(0.95 - st * 0.07, st * 0.10, 0, 0.16, 0.10, 0.56, pal.stoneA, { matId: VMAT.ASHLAR });
        }
        for (const lz of [-0.36, 0.36]) {
          pb.boxY(0.86, 0.32, lz, 0.18, 0.14, 0.16, pal.stoneTrim, { matId: VMAT.ASHLAR });
          pb.ellipsoid(0.85, 0.54, lz, 0.07, 0.10, 0.065, 0xc7c2b8, { uSegs: 10, vSegs: 7, matId: VMAT.ASHLAR });
          pb.ellipsoid(0.88, 0.66, lz, 0.075, 0.075, 0.075, 0xd4cfc5, { uSegs: 10, vSegs: 7, matId: VMAT.ASHLAR });
        }

        // Main Ancestral Hall Body (`正堂`) — ZERO stray center wall!
        pb.boxY(-0.10, 0.32, 0, 1.34, 1.04, 1.54, pal.plaster, { matId: VMAT.PLASTER });
        addTimberFrame(pb, -0.10, 0.32, 0, 1.36, 1.04, 1.56, pal.timber);

        // Authentic Five-Step Ma-Tou-Qiang (`五岳朝天马头墙`) strictly on North (-Z) & South (+Z) Gable Flanks!
        for (const zSgn of [-1, 1]) {
          const zWall = zSgn * 0.79;
          for (let s = 0; s < 3; s++) {
            const wSpan = 1.42 * (1 - s * 0.25);
            const hTop = 1.32 + s * 0.26;
            pb.boxY(-0.10, 0.32, zWall, wSpan, hTop - 0.32, 0.085, pal.plaster, { matId: VMAT.PLASTER });
            pb.boxY(-0.10, hTop, zWall, wSpan + 0.08, 0.045, 0.13, pal.roofA, { matId: VMAT.ROOF });
            pb.boxY(-0.10 + wSpan * 0.5 + 0.02, hTop + 0.035, zWall, 0.055, 0.06, 0.11, pal.roofA, { rotZ: -0.30, matId: VMAT.ROOF });
            pb.boxY(-0.10 - wSpan * 0.5 - 0.02, hTop + 0.035, zWall, 0.055, 0.06, 0.11, pal.roofA, { rotZ: 0.30, matId: VMAT.ROOF });
          }
        }

        // 6-Column Front Veranda Colonnade (+X) + 3D Lattice Doors & Windows + Ancestral Plaque (`王氏大宗祠`)
        for (const pz of [-0.66, -0.38, -0.14, 0.14, 0.38, 0.66]) {
          pb.prismY(0.66, 0.32, pz, 0.042, 0.038, 0.96, 12, pal.pillar, { matId: VMAT.TIMBER });
          pb.boxY(0.66, 0.32, pz, 0.095, 0.05, 0.095, pal.stoneTrim, { matId: VMAT.ASHLAR }); // Column stone drum (`柱础`)
        }
        pb.boxY(0.66, 1.22, 0, 0.06, 0.06, 1.42, pal.timber, { matId: VMAT.TIMBER });
        // Central Crimson Lattice Ritual Doors + Flanking 3D Lattice Windows
        pb.boxY(0.58, 0.32, 0, 0.06, 0.68, 0.38, pal.pillar, { matId: VMAT.TIMBER });
        pb.latticeWindow(0.58, 0.80, -0.44, 0.28, 0.34, 'x+', pal.timber, 0xe8c98e, false);
        pb.latticeWindow(0.58, 0.80,  0.44, 0.28, 0.34, 'x+', pal.timber, 0xe8c98e, false);
        // Inscribed Plaque & Porch Lanterns
        pb.boxY(0.69, 1.06, 0, 0.045, 0.17, 0.48, 0x22262e, { matId: VMAT.TIMBER });
        pb.boxY(0.71, 1.085, 0, 0.025, 0.11, 0.40, pal.gold, { matId: VMAT.METAL });
        for (const lz of [-0.38, 0.38]) {
          pb.latheY(0.68, 0.98, lz, [[0.03, 0], [0.06, 0.05], [0.06, 0.12], [0.03, 0.16]], 10, pal.lantern, { emissive: true });
        }

        // Double-Tier High-Detail Ribbed Xieshan Roof (`重檐歇山筒瓦顶`, apex ~2.24m)
        pb.chineseRoof(-0.04, 1.26, 0, 1.76, 1.74, 0.28, pal.roofA, pal.stoneCap, { style: 'hip', cornerLift: 0.10, noFinial: true });
        pb.boxY(-0.10, 1.50, 0, 1.02, 0.34, 1.16, pal.timber, { matId: VMAT.TIMBER });
        pb.latticeWindow(0.42, 1.66, -0.26, 0.28, 0.18, 'x+', pal.timber, 0xffcf70, true);
        pb.latticeWindow(0.42, 1.66,  0.26, 0.28, 0.18, 'x+', pal.timber, 0xffcf70, true);
        pb.chineseRoof(-0.10, 1.82, 0, 1.48, 1.52, 0.42, pal.roofA, pal.stoneCap, {
          style: 'hip',
          cornerLift: 0.14,
          finialHex: pal.gold,
          gableWallHex: pal.plaster,
        });
      } else {
        // Enemy Keep: Beached Giant Wokou Atakebune Warship Stronghold (`东海倭寇安宅巨舰水寨`)!
        pb.boxY(0, -0.35, 0, 1.90, 0.38, 1.90, 0x4b443c, { skipBottom: true, matId: VMAT.ASHLAR });
        pb.boxY(0.05, 0.02, 0, 1.84, 0.58, 1.48, 0x3b281d, { topScaleX: 1.08, topScaleZ: 1.15, matId: VMAT.TIMBER });
        // Swept copper-sheathed warship prow (-X) + wooden oars/gunports
        pb.box(-0.96, 0.42, 0, 0.46, 0.54, 0.94, 0x2b1d15, { topScaleZ: 0.32, rotZ: -0.24, matId: VMAT.TIMBER });
        pb.boxY(-1.14, 0.38, 0, 0.14, 0.50, 0.15, pal.gold, { rotZ: -0.34, matId: VMAT.METAL });
        for (let gz = -0.52; gz <= 0.52; gz += 0.34) {
          pb.boxY(0.10, 0.34, gz > 0 ? 0.75 : -0.75, 1.24, 0.08, 0.06, 0x1e1b18, { matId: VMAT.METAL });
        }
        // 2-Story Armored Yagura Superstructure + Ribbed Roofs & Tall Mast
        pb.boxY(0.14, 0.60, 0, 1.24, 0.64, 1.18, 0x2b282e, { topScaleX: 0.90, topScaleZ: 0.90, matId: VMAT.TIMBER });
        pb.chineseRoof(0.14, 1.22, 0, 1.48, 1.42, 0.24, pal.roofA, pal.stoneCap, { style: 'hip', cornerLift: 0.08, noFinial: true });
        pb.boxY(0.16, 1.44, 0, 0.84, 0.48, 0.84, 0x382422, { matId: VMAT.TIMBER });
        pb.chineseRoof(0.16, 1.90, 0, 1.14, 1.14, 0.36, pal.roofA, pal.stoneCap, { style: 'hip', cornerLift: 0.10, finialHex: pal.banner });
        pb.prismY(-0.34, 0.60, 0, 0.055, 0.038, 1.82, 10, 0x4a3324, { matId: VMAT.TIMBER });
        pb.cylinderAxis(-0.34, 2.18, 0, 0.025, 0.025, 1.14, 8, 'z', 0x4a3324, { matId: VMAT.TIMBER });
        pb.clothAwning(-0.38, 2.16, -0.52, 0.08, 0.82, 1.04, 1, pal.banner, 0x4a3324);
        pb.latheY(-0.68, 0.66, -0.45, [[0.04, 0], [0.065, 0.08], [0.03, 0.16]], 8, pal.lantern, { emissive: true });
        pb.latheY(-0.68, 0.66,  0.45, [[0.04, 0], [0.065, 0.08], [0.03, 0.16]], 8, pal.lantern, { emissive: true });
      }
      return pb.buildGeometry();
    }

    // =========================================================================
    // 2. TOWER: 永昌空心敌台·烽燧楼 (High-Clearance Eaves — ZERO Garrison Head Clipping!)
    // =========================================================================
    if (key === 'tower') {
      pb.boxY(0, -0.38, 0, 0.98, 0.40, 0.98, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.0, 0, 0.98, 0.26, 0.98, pal.stoneTrim, { topScaleX: 0.95, topScaleZ: 0.95, matId: VMAT.ASHLAR });
      // Battered 2-story hollow granite bastion (`y = 0.26..1.86`) with 2 tiers of arched gun embrasures!
      pb.boxY(0, 0.26, 0, 0.94, 1.60, 0.94, pal.stoneA, { topScaleX: 0.84, topScaleZ: 0.84, matId: VMAT.ASHLAR });
      for (const ey of [0.68, 1.24]) {
        pb.boxY(0, ey, 0, 0.92, 0.16, 0.18, 0x1c2026, { matId: VMAT.ASHLAR });
        pb.boxY(0, ey, 0, 0.18, 0.16, 0.92, 0x1c2026, { matId: VMAT.ASHLAR });
      }
      // Projecting corbelled fighting platform (`y = 1.86..1.98`,arrison deck at `y = 1.98`!) + Corner Merlons
      pb.boxY(0, 1.86, 0, 1.00, 0.08, 1.00, pal.stoneTrim, { matId: VMAT.ASHLAR });
      pb.boxY(0, 1.94, 0, 0.94, 0.04, 0.94, pal.stoneB, { matId: VMAT.COBBLE });
      for (const sgn of [-1, 1]) {
        pb.boxY(0, 1.98, sgn * 0.43, 0.96, 0.16, 0.09, pal.stoneA, { matId: VMAT.ASHLAR });
        pb.boxY(sgn * 0.43, 1.98, 0, 0.09, 0.16, 0.96, pal.stoneA, { matId: VMAT.ASHLAR });
      }
      // 4 Tall Timber Posts (`y = 1.98 .. 3.04` -> 1.06m full headroom so 0.95m tall musketeers NEVER clip the roof!)
      [[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]].forEach(([px, pz]) => {
        pb.prismY(px, 1.98, pz, 0.036, 0.032, 1.06, 10, pal.pillar, { matId: VMAT.TIMBER });
      });
      pb.boxY(0, 2.98, 0, 0.72, 0.06, 0.72, pal.timber, { matId: VMAT.TIMBER });
      pb.chineseRoof(0, 3.02, 0, 1.06, 1.06, 0.44, pal.roofA, pal.stoneCap, {
        style: 'pavilion',
        sides: 4,
        cornerLift: 0.12,
        finialHex: pal.gold,
      });
      // Iron Beacon Brazier (`烽燧火盆`)
      pb.latheY(0.30, 2.14, 0.30, [[0.05, 0], [0.09, 0.08], [0.08, 0.12]], 8, 0x333840, { matId: VMAT.METAL });
      pb.prismY(0.30, 2.26, 0.30, 0.07, 0.01, 0.15, 8, 0xff881a, { emissive: true });
      return pb.buildGeometry();
    }

    // =========================================================================
    // 3. BALLISTA: 十二边形佛郎机火炮台 (Ming Bronze Breech-Loading Cannon Bastion)
    // =========================================================================
    if (key === 'ballista') {
      pb.prismY(0, -0.35, 0, 0.54, 0.54, 0.36, 12, pal.stoneBase, { smooth: false, matId: VMAT.ASHLAR });
      pb.prismY(0, 0.0, 0, 0.54, 0.45, 1.82, 12, pal.stoneA, { smooth: false, matId: VMAT.ASHLAR });
      pb.prismY(0, 1.82, 0, 0.47, 0.50, 0.09, 12, pal.stoneTrim, { smooth: false, matId: VMAT.ASHLAR });
      pb.prismY(0, 1.91, 0, 0.48, 0.48, 0.03, 12, pal.stoneB, { smooth: false, matId: VMAT.COBBLE });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        pb.box(Math.cos(a) * 0.41, 2.00, Math.sin(a) * 0.41, 0.14, 0.13, 0.09, pal.stoneA, { rotY: -a + Math.PI / 2, matId: VMAT.ASHLAR });
      }
      // Powder keg & pyramid of cast-iron cannonballs on deck
      addBarrelOrBasket(pb, -0.24, 1.94, -0.22, 0.065, 0.14, pal.plank, 0x2d3238);
      for (const [bx, by, bz] of [[0.22, 1.98, -0.20], [0.30, 1.98, -0.20], [0.26, 1.98, -0.27], [0.26, 2.04, -0.22]]) {
        pb.ellipsoid(bx, by, bz, 0.042, 0.042, 0.042, 0x2b3038, { uSegs: 8, vSegs: 6, matId: VMAT.METAL });
      }

      // Rotating Ming Bronze Folangji Cannon + Spoked Naval Gun Carriage!
      const tg = new PolyBuilder();
      tg.prismY(0, 0.0, 0, 0.25, 0.24, 0.04, 12, pal.timber, { matId: VMAT.TIMBER });
      for (const sx of [-0.13, 0.13]) {
        tg.boxY(sx, 0.06, -0.04, 0.055, 0.20, 0.54, pal.pillar, { topScaleZ: 0.72, matId: VMAT.TIMBER });
        tg.spokedWheel(sx * 1.35, 0.09, 0.10, 0.09, 0.032, 8, 0x2f353d, pal.timber, pal.gold);
        tg.spokedWheel(sx * 1.35, 0.08, -0.18, 0.08, 0.032, 8, 0x2f353d, pal.timber, pal.gold);
      }
      // Cast-Bronze Cannon Barrel with Cascabel, Breech Chamber (`子铳`), Trunnions & 4 Reinforcing Astragals!
      tg.cylinderAxis(0, 0.24, -0.32, 0.045, 0.075, 0.10, 12, 'z', 0xb88430, { matId: VMAT.METAL });
      tg.cylinderAxis(0, 0.24, 0.10, 0.102, 0.074, 0.80, 14, 'z', 0xb88430, { endHex: 0x14171c, matId: VMAT.METAL });
      tg.cylinderAxis(0, 0.24, 0.02, 0.032, 0.032, 0.36, 10, 'x', 0x8f6622, { matId: VMAT.METAL }); // Trunnions
      for (const rz of [-0.18, 0.04, 0.26, 0.46]) {
        const rr = 0.112 - (rz + 0.18) * 0.035;
        tg.cylinderAxis(0, 0.24, rz, rr, rr, 0.042, 14, 'z', pal.gold, { matId: VMAT.METAL });
      }

      const mainData = pb.buildGeometry();
      const turretGeo = tg.buildGeometry().geo;
      return {
        geo: mainData.geo,
        emissiveGeo: mainData.emissiveGeo,
        turretGeo,
        voxelCount: mainData.voxelCount + tg.triCount,
      };
    }

    // =========================================================================
    // 4. FARM: 江南水车稻田与水碓谷坊 (Irrigated Paddy, Bunds, Grain Sacks & 12-Blade Waterwheel)
    // =========================================================================
    if (key === 'farm') {
      pb.boxY(0, -0.28, 0, 0.96, 0.30, 0.96, 0x69543c, { skipBottom: true, matId: VMAT.SAND });
      // Raised mud bunds (`田埂`) + wooden sluice channel
      pb.boxY(0, 0.0, -0.44, 0.96, 0.07, 0.08, 0x786248, { matId: VMAT.SAND });
      pb.boxY(0, 0.0,  0.44, 0.96, 0.07, 0.08, 0x786248, { matId: VMAT.SAND });
      pb.boxY(-0.44, 0.0, 0, 0.08, 0.07, 0.82, 0x786248, { matId: VMAT.SAND });
      pb.boxY( 0.44, 0.0, 0, 0.08, 0.07, 0.82, 0x786248, { matId: VMAT.SAND });
      pb.boxY(-0.08, 0.015, 0, 0.72, 0.025, 0.80, 0x45635e, { matId: VMAT.SAND }); // Natural olive-jade paddy water

      // 4x5 Tufts of Multi-Stalk Ripening Rice (`青秆垂穗水稻`)
      for (let rz = -0.32; rz <= 0.33; rz += 0.16) {
        for (let rx = -0.36; rx <= 0.06; rx += 0.14) {
          pb.prismY(rx, 0.03, rz, 0.022, 0.058, 0.20, 6, 0x6b8538, { matId: VMAT.LEAVES });
          pb.ellipsoid(rx + 0.02, 0.24, rz, 0.048, 0.035, 0.035, 0xd9aa42, { uSegs: 7, vSegs: 5, matId: VMAT.LEAVES });
        }
      }

      // Timber-Framed Jiangnan Husking Shed + Stone Millstone + Rice Sacks
      pb.boxY(0.24, 0.02, 0, 0.38, 0.08, 0.62, pal.stoneA, { matId: VMAT.COBBLE });
      addTimberFrame(pb, 0.24, 0.10, 0, 0.34, 0.48, 0.54, pal.timber);
      pb.boxY(0.22, 0.10, -0.08, 0.26, 0.32, 0.30, pal.plaster, { matId: VMAT.PLASTER });
      pb.prismY(0.22, 0.10, 0.18, 0.09, 0.09, 0.08, 12, pal.stoneB, { matId: VMAT.ASHLAR }); // Stone quern
      addBarrelOrBasket(pb, 0.12, 0.10, 0.34, 0.065, 0.13, 0xc8b48a, 0x7c6242);
      pb.chineseRoof(0.24, 0.56, 0, 0.50, 0.72, 0.26, pal.roofA, pal.stoneCap, {
        style: 'gable',
        cornerLift: 0.07,
        noFinial: true,
        gableWallHex: pal.plaster,
      });

      // Rotating 12-Spoke Double-Rim Bamboo Irrigation Waterwheel (`龙骨筒车`)
      const sg = new PolyBuilder();
      sg.cylinderAxis(0, 0, 0, 0.045, 0.045, 0.14, 10, 'x', pal.timber, { matId: VMAT.TIMBER });
      for (const wx of [-0.045, 0.045]) {
        sg.spokedWheel(wx, 0, 0, 0.32, 0.022, 12, pal.timber, pal.plank, pal.timber);
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const py = Math.sin(a) * 0.31;
        const pz = Math.cos(a) * 0.31;
        sg.box(0, py, pz, 0.11, 0.035, 0.075, pal.plank, { rotX: -a, matId: VMAT.TIMBER });
      }

      const mainData = pb.buildGeometry();
      const sailsGeo = sg.buildGeometry().geo;
      return {
        geo: mainData.geo,
        emissiveGeo: mainData.emissiveGeo,
        sailsGeo,
        voxelCount: mainData.voxelCount + sg.triCount,
      };
    }

    // =========================================================================
    // 5. WOODCUTTER: 楠竹松木作坊 (Ming Timber Joinery Hall + Hemp Awning & Log Trestle)
    // =========================================================================
    if (key === 'woodcutter') {
      pb.boxY(0, -0.28, 0, 0.94, 0.30, 0.94, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.0, 0, 0.94, 0.09, 0.94, pal.stoneA, { matId: VMAT.COBBLE });
      // Left plaster-and-timber cabin + 3D lattice window
      pb.boxY(-0.18, 0.09, -0.08, 0.48, 0.62, 0.64, pal.plaster, { matId: VMAT.PLASTER });
      addTimberFrame(pb, -0.18, 0.09, -0.08, 0.50, 0.62, 0.66, pal.timber);
      pb.boxY(-0.18, 0.09, 0.25, 0.16, 0.42, 0.04, pal.timber, { matId: VMAT.TIMBER });
      pb.latticeWindow(-0.18, 0.46, -0.41, 0.24, 0.20, 'z-', pal.timber, 0xe8c98e, false);
      pb.chineseRoof(-0.16, 0.70, -0.08, 0.64, 0.80, 0.30, pal.roofA, pal.stoneCap, {
        style: 'gable',
        cornerLift: 0.07,
        noFinial: true,
        gableWallHex: pal.plaster,
      });
      // Right Hemp Cloth Sawyer's Awning (`布幌木作棚`) + Trestle, Logs & Bamboo Stack!
      pb.clothAwning(0.22, 0.64, -0.34, 0.44, 0.16, 0.68, 1, pal.cloth, pal.timber);
      pb.boxY(0.22, 0.09, -0.02, 0.22, 0.18, 0.46, pal.timber, { matId: VMAT.TIMBER });
      pb.cylinderAxis(0.22, 0.33, 0.0, 0.08, 0.072, 0.58, 12, 'z', 0x6e472b, { endHex: 0xd8ba8c, matId: VMAT.TIMBER });
      for (const [bx, by] of [[-0.28, 0.14], [-0.18, 0.14], [-0.23, 0.22]]) {
        pb.cylinderAxis(bx, by, 0.36, 0.042, 0.042, 0.36, 10, 'x', 0x5c7d38, { endHex: 0xcbd590, matId: VMAT.TIMBER });
      }
      return pb.buildGeometry();
    }

    // =========================================================================
    // 6. QUARRY: 大罗山采石场 (Stone-Mason Pavilion, Spoked Wheel Hoist Crane & Dressed Blocks)
    // =========================================================================
    if (key === 'quarry') {
      pb.boxY(0, -0.28, 0, 0.96, 0.30, 0.96, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.0, 0, 0.96, 0.10, 0.96, pal.stoneB, { matId: VMAT.COBBLE });
      // Stone-mason's timber pavilion (-X, -Z)
      pb.boxY(-0.18, 0.10, -0.18, 0.44, 0.48, 0.44, pal.plaster, { matId: VMAT.PLASTER });
      addTimberFrame(pb, -0.18, 0.10, -0.18, 0.48, 0.52, 0.48, pal.timber);
      pb.chineseRoof(-0.18, 0.62, -0.18, 0.62, 0.62, 0.26, pal.roofA, pal.stoneCap, {
        style: 'hip',
        cornerLift: 0.06,
        noFinial: true,
      });
      // Heavy Timber A-Frame Hoist Crane + Spoked Winch Wheel + Suspended Granite Block!
      pb.prismY(0.26, 0.10, -0.22, 0.052, 0.044, 1.28, 10, pal.timber, { matId: VMAT.TIMBER });
      pb.box(0.26, 0.54, -0.34, 0.05, 0.92, 0.05, pal.timber, { rotX: 0.28, matId: VMAT.TIMBER });
      pb.spokedWheel(0.34, 0.42, -0.22, 0.16, 0.035, 8, 0x333840, pal.plank, pal.gold);
      pb.box(0.26, 1.28, 0.04, 0.065, 0.065, 0.76, pal.plank, { rotX: -0.16, matId: VMAT.TIMBER });
      pb.prismY(0.26, 0.64, 0.26, 0.012, 0.012, 0.58, 6, 0x94a3b8, { matId: VMAT.METAL });
      pb.boxY(0.26, 0.42, 0.26, 0.24, 0.22, 0.24, pal.stoneA, { matId: VMAT.ASHLAR });
      // Stone-working bench; ox husbandry is a separate buildable yard.
      pb.boxY(-0.08, 0.10, 0.32, 0.48, 0.18, 0.22, pal.stoneTrim, { matId: VMAT.ASHLAR });
      pb.boxY(-0.16, 0.28, 0.32, 0.16, 0.045, 0.12, pal.stoneA, { matId: VMAT.ASHLAR });
      return pb.buildGeometry();
    }

    if (key === 'oxPost') {
      pb.boxY(0, -0.18, 0, 1.92, 0.20, 1.92, 0x877756, { matId: VMAT.SAND });
      for (const x of [-.79, .79]) {
        pb.prismY(x, .02, -.72, .075, .06, .78, 10, pal.timber, { matId: VMAT.TIMBER });
        pb.ellipsoid(x, .58, -.66, .055, .055, .025, pal.gold, { uSegs: 10, vSegs: 6, matId: VMAT.METAL });
      }
      pb.boxY(0, .42, -.72, 1.68, .10, .10, pal.plank, { matId: VMAT.TIMBER });
      pb.boxY(.53, .02, .48, .64, .18, .36, pal.stoneTrim, { matId: VMAT.ASHLAR });
      pb.boxY(.53, .17, .48, .53, .025, .24, 0x456b6e);
      for (let i = 0; i < 5; i++) pb.boxY(-.6+i*.12, .02, .6, .10, .14, .38, 0xbba35b, { matId: VMAT.TIMBER });
      return pb.buildGeometry();
    }

    // =========================================================================
    // 7. IRON MINE: 天工铁冶高炉 (Ming Tiangong Kaiwu Masonry Blast Furnace, Bellows Shed & Adit)
    // =========================================================================
    if (key === 'ironMine') {
      pb.boxY(0, -0.30, 0, 0.96, 0.32, 0.96, 0x57524b, { skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.0, 0, 0.96, 0.09, 0.96, 0x6e675e, { matId: VMAT.COBBLE });
      // Stratified Iron-Ore Rock Crag + Timber-Braced Mine Portal (-X, -Z)
      pb.ellipsoid(-0.18, 0.42, -0.22, 0.36, 0.42, 0.26, 0x6b5d53, { uSegs: 10, vSegs: 7, jitter: 0.16, seed: 11, matId: VMAT.CLIFF });
      pb.ellipsoid(-0.30, 0.32, -0.10, 0.16, 0.18, 0.15, 0xb86432, { uSegs: 9, vSegs: 6, jitter: 0.16, seed: 19, matId: VMAT.CLIFF });
      pb.boxY(-0.18, 0.09, 0.04, 0.34, 0.46, 0.09, pal.timber, { matId: VMAT.TIMBER });
      pb.boxY(-0.18, 0.09, 0.06, 0.22, 0.36, 0.09, 0x17171a);

      // Banded Stone-and-Brick Ming Blast Furnace (`竖炉高炉`, +X) + Bellows Roof!
      pb.boxY(0.24, 0.09, -0.08, 0.40, 1.06, 0.40, 0x7c6252, { topScaleX: 0.68, topScaleZ: 0.68, matId: VMAT.ASHLAR });
      for (const hy of [0.36, 0.68, 0.96]) {
        const sc = 1 - (hy - 0.09) * 0.26;
        pb.boxY(0.24, hy, -0.08, 0.42 * sc, 0.04, 0.42 * sc, pal.timber, { matId: VMAT.TIMBER });
      }
      pb.prismY(0.24, 1.15, -0.08, 0.11, 0.09, 0.12, 10, 0xff771a, { emissive: true });
      pb.boxY(0.24, 0.14, 0.13, 0.14, 0.16, 0.05, 0xff881a, { emissive: true });
      pb.chineseRoof(-0.16, 0.56, 0.22, 0.48, 0.44, 0.20, pal.roofA, pal.stoneCap, { style: 'gable', cornerLift: 0.04, noFinial: true });
      addBarrelOrBasket(pb, 0.24, 0.09, 0.32, 0.075, 0.15, pal.plank, 0x2b3038);
      return pb.buildGeometry();
    }

    // =========================================================================
    // 8. PITCH RIG: 猛火油熬制坊 (Brick Distillation Stove, Iron Cauldron, Shed & Sealed Clay Jars)
    // =========================================================================
    if (key === 'pitchRig') {
      pb.boxY(0, -0.30, 0, 0.94, 0.32, 0.94, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.0, 0, 0.94, 0.09, 0.94, pal.stoneB, { matId: VMAT.COBBLE });
      // Brick Distillation Stove + Lathe-Turned Iron Cauldron + Tall Brick Flue
      pb.boxY(-0.16, 0.09, -0.12, 0.46, 0.42, 0.46, 0x7c4b3a, { topScaleX: 0.90, topScaleZ: 0.90, matId: VMAT.ASHLAR });
      pb.boxY(-0.16, 0.14, 0.12, 0.15, 0.15, 0.04, 0xff771a, { emissive: true });
      pb.latheY(-0.16, 0.48, -0.12, [[0.14, 0], [0.21, 0.10], [0.18, 0.20]], 12, 0x2c323b, { matId: VMAT.METAL });
      pb.boxY(-0.32, 0.48, -0.28, 0.14, 0.78, 0.14, pal.stoneA, { topScaleX: 0.80, topScaleZ: 0.80, matId: VMAT.ASHLAR });

      // Timber Awning Roof + Lathe-Turned Glazed Clay Fire-Oil Jars (`封泥猛火油坛`)!
      addTimberFrame(pb, 0.08, 0.09, -0.04, 0.68, 0.70, 0.68, pal.timber);
      pb.chineseRoof(0.08, 0.78, -0.04, 0.82, 0.80, 0.26, pal.roofA, pal.stoneCap, { style: 'gable', cornerLift: 0.06, noFinial: true });
      for (const [jx, jz] of [[0.24, 0.22], [0.28, -0.12], [-0.12, 0.30]]) {
        pb.latheY(jx, 0.09, jz, [[0.065, 0], [0.105, 0.11], [0.095, 0.20], [0.055, 0.25], [0.068, 0.28]], 12, 0x4a3528, { matId: VMAT.TIMBER });
        pb.prismY(jx, 0.36, jz, 0.068, 0.060, 0.035, 10, pal.banner, { matId: VMAT.PLASTER });
      }
      return pb.buildGeometry();
    }

    // =========================================================================
    // 9. FLETCHER: 神机军器局 (2-Bay Ming Guildhall, Lattice Windows, Awning & Arquebus Rack)
    // =========================================================================
    if (key === 'fletcher') {
      pb.boxY(0, -0.28, 0, 0.96, 0.30, 0.96, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.0, 0, 0.96, 0.10, 0.96, pal.stoneA, { matId: VMAT.COBBLE });
      pb.boxY(-0.08, 0.10, -0.08, 0.66, 0.68, 0.64, pal.plaster, { matId: VMAT.PLASTER });
      addTimberFrame(pb, -0.08, 0.10, -0.08, 0.68, 0.68, 0.66, pal.timber);
      pb.latticeWindow(-0.22, 0.46, 0.25, 0.20, 0.22, 'z+', pal.timber, 0xffcf70, true);
      pb.boxY(0.06, 0.10, 0.25, 0.16, 0.44, 0.04, pal.pillar, { matId: VMAT.TIMBER });
      pb.chineseRoof(-0.08, 0.78, -0.08, 0.86, 0.84, 0.36, pal.roofA, pal.stoneCap, {
        style: 'hip',
        cornerLift: 0.09,
        finialHex: pal.gold,
        gableWallHex: pal.plaster,
      });
      // Front Hemp Cloth Porch Awning + Arquebus Rack + Concentric Archery/Gun Target!
      pb.clothAwning(-0.08, 0.68, 0.25, 0.58, 0.14, 0.22, 1, pal.cloth, pal.timber);
      pb.boxY(0.32, 0.10, -0.10, 0.14, 0.36, 0.38, pal.timber, { matId: VMAT.TIMBER });
      pb.cylinderAxis(0.28, 0.29, 0.30, 0.13, 0.13, 0.04, 12, 'z', 0xede0c4, { matId: VMAT.PLASTER });
      pb.cylinderAxis(0.28, 0.29, 0.315, 0.07, 0.07, 0.04, 12, 'z', pal.banner, { matId: VMAT.PLASTER });
      return pb.buildGeometry();
    }

    // =========================================================================
    // 10. BLACKSMITH: 百炼甲仗锻局 (Stone Forge Hearth, Timber Hall, Iron Anvil & Quench Barrel)
    // =========================================================================
    if (key === 'blacksmith') {
      pb.boxY(0, -0.28, 0, 0.96, 0.30, 0.96, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.0, 0, 0.96, 0.10, 0.96, pal.stoneB, { matId: VMAT.COBBLE });
      // Stone Forge Hearth & Stepped Chimney (-X, -Z)
      pb.boxY(-0.22, 0.10, -0.16, 0.42, 0.72, 0.44, pal.stoneA, { topScaleX: 0.86, topScaleZ: 0.86, matId: VMAT.ASHLAR });
      pb.boxY(-0.22, 0.82, -0.20, 0.22, 0.68, 0.22, pal.stoneB, { topScaleX: 0.78, topScaleZ: 0.78, matId: VMAT.ASHLAR });
      pb.boxY(-0.22, 0.18, 0.07, 0.18, 0.18, 0.04, 0xff771a, { emissive: true });
      // Right Timber-and-Plaster Smithy Hall + Lattice Window + Ribbed Tile Roof
      pb.boxY(0.18, 0.10, -0.14, 0.42, 0.64, 0.48, pal.plaster, { matId: VMAT.PLASTER });
      addTimberFrame(pb, 0.18, 0.10, -0.14, 0.44, 0.64, 0.50, pal.timber);
      pb.latticeWindow(0.18, 0.46, 0.11, 0.20, 0.20, 'z+', pal.timber, 0xffcf70, true);
      pb.chineseRoof(0.02, 0.72, -0.06, 0.88, 0.76, 0.30, pal.roofA, pal.stoneCap, {
        style: 'gable',
        cornerLift: 0.08,
        noFinial: true,
        gableWallHex: pal.plaster,
      });
      // Forecourt Hemp Awning + Forged Anvil on Stump + Wooden Quench Barrel!
      pb.clothAwning(0.08, 0.66, 0.12, 0.56, 0.14, 0.28, 1, pal.cloth, pal.timber);
      pb.prismY(-0.02, 0.10, 0.26, 0.08, 0.075, 0.14, 10, pal.timber, { matId: VMAT.TIMBER });
      pb.boxY(-0.02, 0.24, 0.26, 0.22, 0.09, 0.09, 0x4b535e, { topScaleX: 1.28, matId: VMAT.METAL });
      addBarrelOrBasket(pb, 0.26, 0.10, 0.26, 0.085, 0.18, pal.plank, 0x2b3038);
      return pb.buildGeometry();
    }

    // =========================================================================
    // 11. GRANARY: 永昌义仓 (Raised Bluestone Granary Hall, Grain Sacks & Ribbed Xieshan Roof)
    // =========================================================================
    if (key === 'granary') {
      pb.boxY(0, -0.28, 0, 0.96, 0.30, 0.96, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.0, -0.04, 0.92, 0.24, 0.84, pal.stoneA, { topScaleX: 0.96, topScaleZ: 0.96, matId: VMAT.ASHLAR });
      pb.box(0, 0.10, 0.42, 0.32, 0.06, 0.22, pal.plank, { rotX: 0.35, matId: VMAT.TIMBER });
      // Timber-framed ochre-plank & plaster granary walls + ventilation louvers
      pb.boxY(0, 0.24, -0.04, 0.78, 0.68, 0.72, pal.plaster, { matId: VMAT.PLASTER });
      addTimberFrame(pb, 0, 0.24, -0.04, 0.80, 0.68, 0.74, pal.timber);
      pb.boxY(0, 0.24, 0.33, 0.26, 0.46, 0.045, pal.plank, { matId: VMAT.TIMBER });
      pb.latticeWindow(-0.24, 0.66, 0.33, 0.16, 0.14, 'z+', pal.timber, 0x3b2a1d, false);
      pb.latticeWindow( 0.24, 0.66, 0.33, 0.16, 0.14, 'z+', pal.timber, 0x3b2a1d, false);
      pb.boxY(0, 0.74, 0.35, 0.26, 0.11, 0.035, 0x262930, { matId: VMAT.TIMBER });
      pb.boxY(0, 0.755, 0.365, 0.20, 0.075, 0.02, pal.gold, { matId: VMAT.METAL });
      pb.chineseRoof(0, 0.92, -0.04, 0.98, 0.94, 0.38, pal.roofA, pal.stoneCap, {
        style: 'hip',
        cornerLift: 0.10,
        finialHex: pal.gold,
      });
      return pb.buildGeometry();
    }

    // =========================================================================
    // 12. ARMORY: 演武军器厅 (Open Ming Martial Pavilion, Weapon Racks & Ribbed Xieshan Roof)
    // =========================================================================
    if (key === 'armory') {
      pb.boxY(0, -0.28, 0, 0.96, 0.30, 0.96, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.0, 0, 0.94, 0.12, 0.94, pal.stoneA, { matId: VMAT.COBBLE });
      pb.boxY(0, 0.12, -0.26, 0.80, 0.68, 0.20, pal.plaster, { matId: VMAT.PLASTER });
      addTimberFrame(pb, 0, 0.12, -0.26, 0.82, 0.68, 0.22, pal.timber);
      [[-0.38, -0.34], [0.38, -0.34], [-0.38, 0.34], [0.38, 0.34], [0, 0.34]].forEach(([px, pz]) => {
        pb.prismY(px, 0.12, pz, 0.038, 0.035, 0.68, 10, pal.pillar, { matId: VMAT.TIMBER });
      });
      pb.boxY(-0.22, 0.34, -0.15, 0.16, 0.32, 0.03, pal.banner, { matId: VMAT.PLASTER });
      pb.boxY( 0.22, 0.34, -0.15, 0.16, 0.32, 0.03, pal.banner, { matId: VMAT.PLASTER });
      pb.latheY(0, 0.60, 0.34, [[0.03, 0], [0.055, 0.06], [0.03, 0.13]], 10, pal.lantern, { emissive: true });
      pb.chineseRoof(0, 0.80, 0, 0.98, 0.94, 0.36, pal.roofA, pal.stoneCap, {
        style: 'hip',
        cornerLift: 0.10,
        finialHex: pal.gold,
      });
      return pb.buildGeometry();
    }

    // =========================================================================
    // 13. STOCKPILE: 营造司青石堆场 [2x2 Paved Bluestone Yard + Timber Pallets & Crates]
    // =========================================================================
    if (key === 'stockpile') {
      pb.boxY(0, -0.28, 0, 1.94, 0.30, 1.94, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
      pb.boxY(0, 0.0, 0, 1.94, 0.07, 1.94, pal.stoneA, { matId: VMAT.COBBLE });
      for (const [bx, bz] of [[-0.88, -0.88], [0.88, -0.88], [-0.88, 0.88], [0.88, 0.88]]) {
        pb.boxY(bx, 0.07, bz, 0.11, 0.26, 0.11, pal.stoneTrim, { matId: VMAT.ASHLAR });
        pb.ellipsoid(bx, 0.36, bz, 0.06, 0.06, 0.06, pal.stoneA, { uSegs: 8, vSegs: 6, matId: VMAT.ASHLAR });
      }
      for (const [px, pz] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]]) {
        pb.boxY(px, 0.07, pz, 0.68, 0.05, 0.68, pal.plank, { matId: VMAT.TIMBER });
      }
      return pb.buildGeometry();
    }

    // =========================================================================
    // 14. CAMPFIRE: 宗祠社火义聚坛 (Octagonal Bluestone Altar, Carved Bronze Tripod Ding & Clan Banner)
    // =========================================================================
    if (key === 'campfire') {
      pb.prismY(0, -0.25, 0, 0.52, 0.50, 0.26, 8, pal.stoneBase, { smooth: false, matId: VMAT.ASHLAR });
      pb.prismY(0, 0.0, 0, 0.48, 0.44, 0.08, 8, pal.stoneA, { smooth: false, matId: VMAT.COBBLE });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        pb.prismY(Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14, 0.028, 0.022, 0.16, 8, 0x3b424a, { matId: VMAT.METAL });
      }
      pb.latheY(0, 0.20, 0, [[0.12, 0], [0.21, 0.08], [0.22, 0.16], [0.24, 0.18]], 12, 0x454d56, { matId: VMAT.METAL });
      pb.prismY(0, 0.36, 0, 0.15, 0.02, 0.24, 8, 0xff771a, { emissive: true });
      pb.prismY(0, 0.38, 0, 0.08, 0.01, 0.30, 8, 0xfff0aa, { emissive: true });
      // Tall Flagpole + Ming Serrated Clan Banner
      pb.prismY(0.34, 0.08, -0.28, 0.026, 0.020, 1.22, 10, pal.timber, { matId: VMAT.TIMBER });
      pb.ellipsoid(0.34, 1.32, -0.28, 0.04, 0.05, 0.04, pal.gold, { uSegs: 8, vSegs: 6, matId: VMAT.METAL });
      pb.boxY(0.34, 0.86, -0.08, 0.025, 0.38, 0.36, pal.banner, { matId: VMAT.PLASTER });
      return pb.buildGeometry();
    }

    // =========================================================================
    // 15. HOVEL: 江南双层木构市井民居 (Directly modeled after the 2-story house in the user's reference!)
    // =========================================================================
    pb.boxY(0, -0.28, 0, 0.94, 0.30, 0.94, pal.stoneBase, { skipBottom: true, matId: VMAT.ASHLAR });
    pb.boxY(0, 0.0, 0, 0.94, 0.10, 0.94, pal.stoneA, { matId: VMAT.COBBLE });
    // Ground story: dark timber plank wainscot + warm lime-ochre plaster + double wooden door
    pb.boxY(0, 0.10, -0.05, 0.78, 0.48, 0.68, pal.plaster, { matId: VMAT.PLASTER });
    addTimberFrame(pb, 0, 0.10, -0.05, 0.80, 0.48, 0.70, pal.timber);
    pb.boxY(-0.14, 0.10, 0.30, 0.22, 0.38, 0.04, pal.timber, { matId: VMAT.TIMBER });
    pb.latticeWindow(0.18, 0.36, 0.30, 0.20, 0.18, 'z+', pal.timber, 0xe8c98e, false);

    // Projecting Hemp Cloth Porch Awning + Street Barrel & Grain Basket (exact match to reference!)
    pb.clothAwning(0.16, 0.54, 0.30, 0.42, 0.13, 0.22, 1, pal.cloth, pal.timber);
    addBarrelOrBasket(pb, -0.32, 0.10, 0.36, 0.065, 0.14, pal.plank, 0x332b22);

    // Overhanging 2nd-Story Timber Gallery + Three 3D Glowing Lattice Windows (`二层排窗`)!
    pb.boxY(0, 0.58, -0.04, 0.84, 0.05, 0.74, pal.timber, { matId: VMAT.TIMBER });
    pb.boxY(0, 0.63, -0.04, 0.82, 0.44, 0.72, pal.plaster, { matId: VMAT.PLASTER });
    addTimberFrame(pb, 0, 0.63, -0.04, 0.84, 0.44, 0.74, pal.timber);
    for (const wx of [-0.25, 0.0, 0.25]) {
      pb.latticeWindow(wx, 0.85, 0.33, 0.18, 0.22, 'z+', pal.timber, 0xffcf75, true);
    }

    // High-Detail Ribbed Grey Clay-Tile Gable Roof (`悬山筒瓦屋顶`) + Rear Brick Chimney!
    pb.chineseRoof(0, 1.07, -0.04, 0.94, 0.90, 0.36, pal.roofA, pal.stoneCap, {
      style: 'gable',
      cornerLift: 0.07,
      noFinial: true,
      gableWallHex: pal.plaster,
    });
    pb.boxY(0.28, 0.65, -0.26, 0.13, 0.80, 0.13, pal.stoneA, { matId: VMAT.ASHLAR });
    return pb.buildGeometry();
  }

  instantiateCargoItem(kind = 'wood') {
    const entry = this.getCargoGeometryEntry(kind);
    const m = new THREE.Mesh(entry.geo, getSharedVoxelMaterial());
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  getCargoGeometryEntry(kind = 'wood') {
    const key = `mp_cargo_${kind}`;
    return this.get(key, () => {
      const pb = new PolyBuilder();
      if (kind === 'log') {
        pb.cylinderAxis(0, 0.08, -0.05, 0.055, 0.055, 0.32, 10, 'x', 0x6e472b, { endHex: 0xd8ba8c, matId: VMAT.TIMBER });
        pb.cylinderAxis(0, 0.08,  0.06, 0.048, 0.048, 0.32, 10, 'x', 0x5c7d38, { endHex: 0xcbd590, matId: VMAT.TIMBER });
      } else if (kind === 'wood') {
        pb.boxY(0, 0.02, 0, 0.30, 0.13, 0.22, 0xb58654, { matId: VMAT.TIMBER });
        pb.boxY(0, 0.01, 0, 0.045, 0.15, 0.24, 0x4a3423, { matId: VMAT.TIMBER });
      } else if (kind === 'stone') {
        pb.boxY(0, 0.02, 0, 0.24, 0.16, 0.24, 0x9c968b, { topScaleX: 0.94, topScaleZ: 0.94, matId: VMAT.ASHLAR });
      } else if (kind === 'wheat') {
        pb.cylinderAxis(0, 0.09, 0, 0.06, 0.09, 0.30, 10, 'x', 0xd9aa42, { matId: VMAT.LEAVES });
        pb.cylinderAxis(0, 0.09, 0, 0.068, 0.068, 0.045, 10, 'x', 0x8f241e, { matId: VMAT.PLASTER });
      } else if (kind === 'food') {
        pb.latheY(0, 0.01, 0, [[0.09, 0], [0.125, 0.08], [0.095, 0.17], [0.05, 0.20], [0.075, 0.24]], 10, 0xcab896, { matId: VMAT.PLASTER });
      } else if (kind === 'ore') {
        pb.ellipsoid(0, 0.10, 0, 0.12, 0.10, 0.12, 0xb86432, { uSegs: 9, vSegs: 6, jitter: 0.18, seed: 17, matId: VMAT.CLIFF });
      } else if (kind === 'iron') {
        pb.boxY(0, 0.01, 0, 0.24, 0.05, 0.20, 0x6e472b, { matId: VMAT.TIMBER });
        pb.boxY(0, 0.06, -0.04, 0.18, 0.07, 0.07, 0x525a66, { topScaleX: 0.82, matId: VMAT.METAL });
        pb.boxY(0, 0.06,  0.04, 0.18, 0.07, 0.07, 0x3f4752, { topScaleX: 0.82, matId: VMAT.METAL });
      } else if (kind === 'oil') {
        pb.latheY(0, 0.01, 0, [[0.07, 0], [0.115, 0.10], [0.09, 0.18], [0.065, 0.22]], 10, 0x453124, { matId: VMAT.TIMBER });
        pb.prismY(0, 0.22, 0, 0.07, 0.065, 0.035, 10, 0x8f241e, { matId: VMAT.PLASTER });
      } else if (kind === 'bow') {
        pb.cylinderAxis(0, 0.08, -0.03, 0.025, 0.02, 0.34, 10, 'x', 0x3f4752, { matId: VMAT.METAL });
        pb.boxY(-0.08, 0.04, -0.03, 0.12, 0.05, 0.04, 0x6b4428, { matId: VMAT.TIMBER });
        pb.boxY(0, 0.06, 0.05, 0.26, 0.04, 0.04, 0xb88636, { matId: VMAT.TIMBER });
      } else {
        pb.boxY(0, 0.02, 0, 0.22, 0.18, 0.16, 0x8f241e, { topScaleX: 0.85, matId: VMAT.PLASTER });
        pb.prismY(0, 0.06, 0.02, 0.07, 0.07, 0.10, 10, 0xc89a3c, { matId: VMAT.METAL });
      }
      return pb.buildGeometry();
    });
  }

  /**
   * Grounded High-Detail Ming Landscape Trees (Olive-Sage Camphor, Golden-Autumn Ginkgo/Maple, Mountain Pine, Willow & Bamboo!)
   */
  instantiateTree(style = 'oak', variant = 0) {
    const vIdx = variant % 3;
    const key = `mp_tree_${style}_${vIdx}`;
    const entry = this.get(key, () => {
      const pb = new PolyBuilder();
      if (style === 'birch') {
        // Multi-Culm Jiangnan Bamboo Grove (5 smooth segmented culms + layered olive-emerald leaf canopies!)
        const culms = [
          [-0.13, -0.09, 2.38, 0.04],
          [ 0.12,  0.07, 2.10, -0.05],
          [-0.02,  0.14, 1.82, 0.03],
          [ 0.09, -0.14, 1.62, -0.03],
          [ 0.00, -0.01, 2.22, 0.02],
        ];
        culms.forEach(([bx, bz, h, tilt], ci) => {
          const segs = 5;
          const segH = h / segs;
          for (let s = 0; s < segs; s++) {
            const sx = bx + tilt * s * 0.35;
            pb.prismY(sx, s * segH, bz, 0.035 - s * 0.003, 0.032 - s * 0.003, segH - 0.012, 8, ci % 2 === 0 ? 0x5c7d3b : 0x6a8c44, { smooth: true, matId: VMAT.TIMBER });
            pb.prismY(sx, (s + 1) * segH - 0.016, bz, 0.039 - s * 0.003, 0.039 - s * 0.003, 0.016, 8, 0x7b9e50, { smooth: true, matId: VMAT.TIMBER });
          }
          const topX = bx + tilt * 1.4;
          pb.ellipsoid(topX, h - 0.18, bz, 0.32, 0.16, 0.32, 0x5a7a3a, { uSegs: 10, vSegs: 6, jitter: 0.12, seed: ci + 3, matId: VMAT.LEAVES });
          pb.ellipsoid(topX + 0.05, h + 0.02, bz, 0.24, 0.13, 0.24, 0x719449, { uSegs: 9, vSegs: 6, jitter: 0.10, seed: ci + 9, matId: VMAT.LEAVES });
        });
        return pb.buildGeometry();
      }

      if (style === 'pine') {
        // Gnarled Chinese Mountain Pine (`苍松`, curved trunk + branches + 5 lush flat-topped needle clouds!)
        const hBoost = vIdx === 1 ? 0.28 : 0;
        pb.latheY(0, 0, 0, [[0.18, 0], [0.13, 0.45], [0.10, 1.15], [0.07, 1.75 + hBoost]], 10, 0x4f3624, { matId: VMAT.TIMBER });
        pb.box(-0.18, 1.12, 0, 0.07, 0.42, 0.07, 0x4f3624, { rotZ: 0.55, matId: VMAT.TIMBER });
        pb.box( 0.18, 1.38, 0, 0.06, 0.38, 0.06, 0x4f3624, { rotZ: -0.52, matId: VMAT.TIMBER });
        const pads = [
          [ 0.00, 1.02,  0.00, 0.62, 0.19, 0x355233],
          [-0.22, 1.34 + hBoost * 0.4,  0.10, 0.50, 0.17, 0x3e5e39],
          [ 0.20, 1.58 + hBoost * 0.7, -0.08, 0.46, 0.16, 0x476b3f],
          [-0.08, 1.84 + hBoost * 0.9, -0.06, 0.38, 0.15, 0x527846],
          [ 0.04, 2.06 + hBoost,        0.04, 0.28, 0.13, 0x5e874e],
        ];
        pads.forEach(([px, py, pz, r, ry, col], idx) => {
          pb.ellipsoid(px, py, pz, r, ry, r, col, { uSegs: 11, vSegs: 7, jitter: 0.10, seed: 20 + idx, matId: VMAT.LEAVES });
        });
        return pb.buildGeometry();
      }

      if (style === 'willow') {
        // Waterside Jiangnan Weeping Willow (`垂柳`)
        pb.latheY(0, 0, 0, [[0.20, 0], [0.14, 0.45], [0.11, 1.30]], 10, 0x573d29, { matId: VMAT.TIMBER });
        pb.ellipsoid(0.04, 1.56, 0, 0.60, 0.36, 0.60, 0x5d7e3e, { uSegs: 12, vSegs: 8, jitter: 0.10, seed: 31 + vIdx, matId: VMAT.LEAVES });
        pb.ellipsoid(-0.12, 1.78, 0.08, 0.44, 0.28, 0.44, 0x71944b, { uSegs: 10, vSegs: 7, jitter: 0.10, seed: 35 + vIdx, matId: VMAT.LEAVES });
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const fx = Math.cos(a) * 0.48;
          const fz = Math.sin(a) * 0.48;
          pb.prismY(fx, 0.42 + (i % 2) * 0.16, fz, 0.025, 0.075, 0.98, 6, i % 2 === 0 ? 0x6b8e47 : 0x567538, { smooth: true, matId: VMAT.LEAVES });
        }
        return pb.buildGeometry();
      }

      // Broadleaf Camphor (`古香樟`) + Autumn Golden-Ochre Ginkgo/Maple Variant (`vIdx === 2`, matching reference background!)
      const isAutumn = vIdx === 2;
      const cDark = isAutumn ? 0x9e682c : 0x466333;
      const cMid  = isAutumn ? 0xbd8038 : 0x54753c;
      const cTop  = isAutumn ? 0xd69b49 : 0x688a47;

      pb.latheY(0, 0, 0, [[0.22, 0], [0.15, 0.40], [0.12, 1.15]], 10, 0x593d28, { matId: VMAT.TIMBER });
      pb.box(-0.16, 1.08, 0.04, 0.08, 0.44, 0.08, 0x593d28, { rotZ: 0.52, matId: VMAT.TIMBER });
      pb.box( 0.17, 1.10, -0.04, 0.08, 0.44, 0.08, 0x593d28, { rotZ: -0.48, matId: VMAT.TIMBER });
      pb.ellipsoid(-0.26, 1.44,  0.12, 0.46, 0.34, 0.46, cDark, { uSegs: 12, vSegs: 8, jitter: 0.11, seed: 41 + vIdx, matId: VMAT.LEAVES });
      pb.ellipsoid( 0.26, 1.48, -0.10, 0.44, 0.34, 0.44, cMid,  { uSegs: 12, vSegs: 8, jitter: 0.11, seed: 47 + vIdx, matId: VMAT.LEAVES });
      pb.ellipsoid( 0.02, 1.46, -0.24, 0.40, 0.30, 0.40, cDark, { uSegs: 10, vSegs: 7, jitter: 0.11, seed: 49 + vIdx, matId: VMAT.LEAVES });
      pb.ellipsoid( 0.00, 1.78,  0.02, 0.54, 0.38, 0.54, cMid,  { uSegs: 12, vSegs: 8, jitter: 0.10, seed: 53 + vIdx, matId: VMAT.LEAVES });
      pb.ellipsoid(-0.06, 2.06, -0.04, 0.36, 0.26, 0.36, cTop,  { uSegs: 10, vSegs: 7, jitter: 0.09, seed: 59 + vIdx, matId: VMAT.LEAVES });
      return pb.buildGeometry();
    });

    const mesh = new THREE.Mesh(entry.geo, getSharedVoxelMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.voxelCount = entry.voxelCount;
    return mesh;
  }

  getShrubGeometry() {
    return this.get('mp_shrub_geo', () => {
      const pb = new PolyBuilder();
      pb.ellipsoid(0, 0.14, 0, 0.24, 0.15, 0.24, 0x4c6b36, { uSegs: 9, vSegs: 6, jitter: 0.12, seed: 61, matId: VMAT.LEAVES });
      pb.ellipsoid(0.09, 0.20, 0.05, 0.16, 0.12, 0.16, 0x648543, { uSegs: 8, vSegs: 6, jitter: 0.12, seed: 63, matId: VMAT.LEAVES });
      return pb.buildGeometry().geo;
    });
  }

  instantiateBoulder(kind = 'stone') {
    const key = `mp_boulder_${kind}`;
    const entry = this.get(key, () => {
      const pb = new PolyBuilder();
      if (kind === 'stone') {
        pb.ellipsoid(-0.08, 0.28, 0.04, 0.44, 0.34, 0.40, 0x9e988e, { uSegs: 10, vSegs: 7, jitter: 0.18, seed: 71, smooth: false, matId: VMAT.CLIFF });
        pb.ellipsoid( 0.18, 0.40, -0.08, 0.28, 0.44, 0.28, 0xb0aaa0, { uSegs: 9, vSegs: 7, jitter: 0.18, seed: 77, smooth: false, matId: VMAT.CLIFF });
      } else if (kind === 'iron') {
        pb.ellipsoid(-0.06, 0.30, 0.04, 0.42, 0.36, 0.38, 0x695a50, { uSegs: 10, vSegs: 7, jitter: 0.18, seed: 81, smooth: false, matId: VMAT.CLIFF });
        pb.ellipsoid( 0.16, 0.42, -0.06, 0.26, 0.42, 0.26, 0xb56533, { uSegs: 9, vSegs: 7, jitter: 0.18, seed: 83, smooth: false, matId: VMAT.CLIFF });
      } else {
        // Natural Stone-Rimmed Ming Petroleum/Tar Seep Spring (`天然石围猛火油泉眼`)
        pb.prismY(0, 0, 0, 0.46, 0.40, 0.12, 12, 0x6e675c, { matId: VMAT.ASHLAR });
        pb.prismY(0, 0.12, 0, 0.34, 0.34, 0.03, 12, 0x1e1d22, { matId: VMAT.PITCH });
        pb.ellipsoid(-0.24, 0.14, 0.20, 0.14, 0.11, 0.12, 0x7c7468, { uSegs: 8, vSegs: 6, jitter: 0.16, seed: 91, smooth: false, matId: VMAT.CLIFF });
      }
      return pb.buildGeometry();
    });
    const group = new THREE.Group();
    const m = new THREE.Mesh(entry.geo, getSharedVoxelMaterial());
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    group.userData.voxelCount = entry.voxelCount;
    return group;
  }
}

export const prefabs = new PrefabLibrary();
