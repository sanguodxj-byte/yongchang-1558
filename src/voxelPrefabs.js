import * as THREE from 'three';
import {
  PolyBuilder,
  voxelHash,
  tintHex,
  getSharedVoxelMaterial,
  getSharedEmissiveMaterial,
} from './voxelEngine.js';

export const VOXEL_UNIT = 0.125;

function getThemePalette(team) {
  if (team === 'enemy') {
    // East China Sea Wokou Pirate Palette: Charred cedar, dark basalt, purple-black lacquer & blood-crimson banners
    return {
      isEnemy: true,
      stoneBase: 0x3b3d47,
      stoneA: 0x4c4f5c,
      stoneB: 0x414450,
      stoneTrim: 0x2f313a,
      stoneCap: 0x262830,
      plaster: 0x574e4a,
      timber: 0x38281e,
      pillar: 0x4a2520,
      plank: 0x694c38,
      plankAlt: 0x593f2d,
      roofA: 0x23242e,
      roofB: 0x1a1b24,
      banner: 0x991b1b,
      gold: 0xd97706,
      lantern: 0xff6b2b,
    };
  }
  // Ming Dynasty Yongchang Fortress Palette (江南粉墙黛瓦 + 青灰花岗条石 + 丹朱梁柱 + 鎏金铜饰!)
  return {
    isEnemy: false,
    stoneBase: 0x6f7a85,
    stoneA: 0x8b959e,
    stoneB: 0x7e8891,
    stoneTrim: 0x606b75,
    stoneCap: 0x3a4552,
    plaster: 0xf4efe4,
    timber: 0x5c3a24,
    pillar: 0xa32626,
    plank: 0xb08052,
    plankAlt: 0x9c6e42,
    roofA: 0x2f3b4a,
    roofB: 0x25303d,
    banner: 0xb91c1c,
    gold: 0xfacc15,
    lantern: 0xff4d2a,
  };
}

/**
 * 16-Bitmask Auto-Tiling Battered Granite Curtain Wall (`永昌堡花岗岩斜垒夹夯土城垣`)
 * Pure Low-Poly trapezoidal cross-section — zero voxel stair-steps!
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

  const x0 = hasW ? -0.50 : -0.46;
  const x1 = hasE ? 0.50 : 0.46;
  const z0 = hasN ? -0.50 : -0.46;
  const z1 = hasS ? 0.50 : 0.46;
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const sx = x1 - x0;
  const sz = z1 - z0;

  // 1. Deep Underground Skirt (-0.42..0.0) + Sloped Granite Plinth (0.0..0.24)
  pb.boxY(cx, -0.42, cz, sx * 0.96, 0.43, sz * 0.96, pal.stoneBase, { skipBottom: true });
  pb.boxY(cx, 0.0, cz, sx, 0.24, sz, pal.stoneTrim, {
    topScaleX: hasW && hasE ? 1.0 : 0.93,
    topScaleZ: hasN && hasS ? 1.0 : 0.93,
    skipBottom: true,
  });

  // 2. Signature Yongchang Battered Trapezoidal Granite Wall Body (y = 0.24 .. 1.66)
  const tsx = (hasW && hasE) ? 1.0 : 0.84;
  const tsz = (hasN && hasS) ? 1.0 : 0.84;
  pb.boxY(cx, 0.24, cz, sx * 0.94, 1.42, sz * 0.94, variant ? pal.stoneA : pal.stoneB, {
    topScaleX: tsx,
    topScaleZ: tsz,
    skipBottom: true,
  });

  // Projecting granite stringcourse cornice band (压顶挑檐石) at y = 1.64..1.72 + Rammed-Earth/Plank Walkway!
  const topW = sx * 0.94 * tsx + (hasW && hasE ? 0 : 0.06);
  const topD = sz * 0.94 * tsz + (hasN && hasS ? 0 : 0.06);
  pb.boxY(cx, 1.64, cz, Math.min(1.0, topW), 0.08, Math.min(1.0, topD), pal.stoneTrim, { skipBottom: true });
  pb.boxY(cx, 1.72, cz, Math.min(0.98, topW * 0.94), 0.04, Math.min(0.98, topD * 0.94), pal.plank, { skipBottom: true });

  // Sculpted Exterior Buttress (马面扶壁) or Loophole on Alternate Segments
  if (!pal.isEnemy && variant === 0) {
    if (!hasS) pb.boxY(0, 0.24, 0.40, 0.26, 1.15, 0.12, pal.stoneTrim, { topScaleZ: 0.35, topScaleX: 0.75, skipBottom: true });
    if (!hasE && !hasW && (hasN || hasS)) pb.boxY(0.40, 0.24, 0, 0.12, 1.15, 0.26, pal.stoneTrim, { topScaleX: 0.35, topScaleZ: 0.75, skipBottom: true });
  }

  // 3. Ming Crenelated Brick Parapet & Sloped Tile-Capped Merlons (青砖雉堞) on non-linked edges!
  const addParapetSide = (side) => {
    const isNS = side === 'n' || side === 's';
    const sgn = (side === 's' || side === 'e') ? 1 : -1;
    const edgeOff = 0.35 * sgn;
    if (isNS) {
      pb.boxY(cx, 1.75, edgeOff, Math.min(0.98, sx), 0.14, 0.13, pal.stoneA, { skipBottom: true });
      for (const mx of [-0.28, 0.28]) {
        pb.boxY(mx, 1.89, edgeOff, 0.28, 0.18, 0.13, pal.stoneA, { topScaleZ: 0.82, skipBottom: true });
        pb.boxY(mx, 2.07, edgeOff, 0.31, 0.045, 0.16, pal.stoneCap, { topScaleX: 0.88, topScaleZ: 0.65, skipBottom: true });
      }
    } else {
      pb.boxY(edgeOff, 1.75, cz, 0.13, 0.14, Math.min(0.98, sz), pal.stoneA, { skipBottom: true });
      for (const mz of [-0.28, 0.28]) {
        pb.boxY(edgeOff, 1.89, mz, 0.13, 0.18, 0.28, pal.stoneA, { topScaleX: 0.82, skipBottom: true });
        pb.boxY(edgeOff, 2.07, mz, 0.16, 0.045, 0.31, pal.stoneCap, { topScaleZ: 0.88, topScaleX: 0.65, skipBottom: true });
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

  // 4. Hillside Rampart Stone Steps when linking up to a higher wall segment!
  const addSlopeSteps = (dx, dz) => {
    for (let s = 1; s <= 3; s++) {
      pb.boxY(dx * (0.12 * s), 1.74 + s * 0.11, dz * (0.12 * s), dx !== 0 ? 0.16 : 0.48, 0.11, dz !== 0 ? 0.16 : 0.48, pal.stoneA);
    }
  };
  if (stepN) addSlopeSteps(0, -1);
  if (stepS) addSlopeSteps(0, 1);
  if (stepE) addSlopeSteps(1, 0);
  if (stepW) addSlopeSteps(-1, 0);

  return pb.buildGeometry();
}

/**
 * Unified 2-Body-Width Gatehouse (`永昌堡重檐谯楼陆门 / 倭寇橹门`)
 * Spans 2 tiles (`1.0m x 2.0m`) with a true 1.50m polygonal semicircular stone arch & sliding iron grate!
 */
function buildGateData(team) {
  const pal = getThemePalette(team);
  const pb = new PolyBuilder();

  // 1. Foundation & Cobblestone Passage Roadbed (z = -1.0 .. +1.0)
  pb.boxY(0, -0.40, 0, 0.96, 0.42, 1.98, pal.stoneBase, { skipBottom: true });
  pb.boxY(0, 0.0, 0, 0.98, 0.05, 1.54, pal.stoneTrim, { skipBottom: true });

  // 2. True Semicircular Stone Archway Wall (clear width 1.50m along Z = -0.75..+0.75, arch crown at y = 1.52m!)
  pb.extrudedArchWallX(0, 0.0, 0, 0.94, 1.98, 1.74, 0.75, 0.98, 1.52, pal.stoneA, pal.stoneTrim, 0.06);

  // Projecting stone cornice & walkway deck at y = 1.74..1.82
  pb.boxY(0, 1.74, 0, 0.98, 0.08, 2.00, pal.stoneTrim);
  pb.boxY(0, 1.82, 0, 0.86, 0.03, 1.94, pal.plank);

  if (!pal.isEnemy) {
    // 3. Authentic Ming Qiaolou Watchtower Pavilion (重檐歇山飞檐城门谯楼) atop the stone arch!
    const colPositions = [
      [-0.30, -0.68], [0.30, -0.68], [-0.30, 0.0], [0.30, 0.0], [-0.30, 0.68], [0.30, 0.68],
    ];
    colPositions.forEach(([px, pz]) => {
      pb.prismY(px, 1.84, pz, 0.048, 0.044, 0.62, 6, pal.pillar);
    });
    // White-plaster & lattice inner chamber
    pb.boxY(0, 1.84, 0, 0.48, 0.58, 1.24, pal.plaster);
    pb.boxY(0, 1.92, 0, 0.52, 0.34, 0.32, pal.pillar); // Vermilion door frame

    // Lower Swept Skirt Eave + Upper Swept Xieshan Roof with Upturned Flying Corners!
    pb.chineseRoof(0, 2.28, 0, 0.98, 1.84, 0.22, pal.roofA, pal.stoneCap, { style: 'hip', cornerLift: 0.09, noFinial: true });
    pb.boxY(0, 2.44, 0, 0.42, 0.24, 1.02, pal.pillar);
    pb.chineseRoof(0, 2.66, 0, 0.88, 1.56, 0.36, pal.roofA, pal.stoneCap, {
      style: 'hip',
      cornerLift: 0.13,
      finialHex: pal.gold,
      gableWallHex: pal.plaster,
    });

    // Inscribed Golden Gate Plaque (「迎川门」金字匾) on both +X and -X portals + 4 Glowing Red Silk Lanterns!
    for (const sgn of [-1, 1]) {
      pb.boxY(sgn * 0.45, 1.55, 0, 0.05, 0.16, 0.42, 0x1e293b);
      pb.boxY(sgn * 0.47, 1.58, 0, 0.03, 0.10, 0.34, pal.gold);
      for (const lz of [-0.66, 0.66]) {
        pb.prismY(sgn * 0.42, 2.12, lz, 0.055, 0.055, 0.13, 6, pal.lantern, { emissive: true });
      }
    }
  } else {
    // Enemy Wokou Timber Yagura Gatehouse
    pb.boxY(0, 1.84, 0, 0.64, 0.56, 1.46, pal.timber);
    pb.chineseRoof(0, 2.38, 0, 0.92, 1.76, 0.34, pal.roofA, pal.stoneCap, {
      style: 'hip',
      cornerLift: 0.08,
      finialHex: pal.banner,
      gableWallHex: pal.plaster,
    });
    for (const lz of [-0.74, 0.74]) {
      pb.prismY(-0.46, 1.52, lz, 0.05, 0.03, 0.14, 5, pal.lantern, { emissive: true });
    }
  }

  // 4. Sliding Forged-Iron Sluice / Portcullis Grate (`千斤铁水陆闸门`, 1.48m wide)
  const pg = new PolyBuilder();
  pg.boxY(0, 1.18, 0, 0.06, 0.07, 1.46, 0x334155);
  pg.boxY(0, 0.58, 0, 0.06, 0.06, 1.46, 0x334155);
  for (let z = -0.68; z <= 0.69; z += 0.17) {
    pg.boxY(0, 0.10, z, 0.045, 1.16, 0.045, 0x475569);
    pg.prismY(0, 0.02, z, 0.03, 0.005, 0.09, 4, 0x94a3b8);
  }

  const mainData = pb.buildGeometry();
  const portcullisGeo = pg.buildGeometry().geo;
  return {
    geo: mainData.geo,
    emissiveGeo: mainData.emissiveGeo,
    portcullisGeo,
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
    const fullKey = `lp_wall_${team}_m${mask}_s${stepMask}_v${variant}`;
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
    const fullKey = `lp_gate_${team}`;
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
    if (entry.portcullisGeo) {
      const gateLeaf = new THREE.Mesh(entry.portcullisGeo, getSharedVoxelMaterial());
      gateLeaf.castShadow = true;
      gateLeaf.position.y = 0;
      group.add(gateLeaf);
      group.userData.gateLeaf = gateLeaf;
    }
    return group;
  }

  instantiate(key, team = 'player') {
    if (key === 'wall') {
      return this.instantiateWall(team, 0b1010, 0, 0);
    }
    if (key === 'gate') {
      return this.instantiateGate(team);
    }
    const fullKey = `lp_${key}_${team}`;
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
      sails.position.set(0.36, 0.56, 0.0);
      group.add(sails);
      group.userData.sails = sails;
    }

    if (key === 'ballista' && entry.turretGeo) {
      const turretGroup = new THREE.Group();
      turretGroup.position.set(0, 1.98, 0);
      const tMesh = new THREE.Mesh(entry.turretGeo, getSharedVoxelMaterial());
      tMesh.castShadow = true;
      turretGroup.add(tMesh);
      group.add(turretGroup);
      group.userData.turretGroup = turretGroup;
    }

    return group;
  }

  getDirectionArrowGeometry() {
    return this.get('lp_ghost_dir_arrow_geo', () => {
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
      entry = this.get('lp_wall_player_m0_s0_v0', () => buildConnectedWallData('player', 0, 0, 0));
    } else if (key === 'gate') {
      entry = this.get('lp_gate_player', () => buildGateData('player'));
    } else if (key && key !== 'pitch' && key !== 'demolish') {
      entry = this.get(`lp_${key}_player`, () => this.buildPrefabData(key, 'player'));
    }

    if (entry && entry.geo) {
      const m = new THREE.Mesh(entry.geo, ghostMat);
      m.userData.noOutline = true;
      group.add(m);
      if (key === 'farm' && entry.sailsGeo) {
        const sm = new THREE.Mesh(entry.sailsGeo, ghostMat);
        sm.position.set(0.36, 0.56, 0.0);
        sm.userData.noOutline = true;
        group.add(sm);
      } else if (key === 'ballista' && entry.turretGeo) {
        const tm = new THREE.Mesh(entry.turretGeo, ghostMat);
        tm.position.set(0, 1.98, 0);
        tm.userData.noOutline = true;
        group.add(tm);
      } else if (key === 'gate' && entry.portcullisGeo) {
        const pm = new THREE.Mesh(entry.portcullisGeo, ghostMat);
        pm.userData.noOutline = true;
        group.add(pm);
      }
    }

    if (key && key !== 'pitch' && key !== 'demolish') {
      const arrowMat = this.get('lp_ghost_arrow_mat', () => new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
      }));
      const arrow = new THREE.Mesh(this.getDirectionArrowGeometry(), arrowMat);
      arrow.userData.noOutline = true;
      if (key === 'gate') {
        arrow.rotation.y = Math.PI * 0.5;
        arrow.position.set(0.52, 0.06, 0);
      } else {
        arrow.position.set(0, 0.06, 0.50);
      }
      group.add(arrow);
    }

    return group;
  }

  instantiateTreeStump() {
    const entry = this.get('lp_felled_stump', () => {
      const pb = new PolyBuilder();
      pb.prismY(0, 0, 0, 0.22, 0.16, 0.20, 7, 0x69472c);
      pb.prismY(0, 0.20, 0, 0.14, 0.13, 0.02, 7, 0xe6c896);
      pb.boxY(-0.14, 0, 0.04, 0.14, 0.06, 0.08, 0x593a22, { rotZ: 0.25 });
      pb.boxY(0.13, 0, -0.05, 0.14, 0.06, 0.08, 0x593a22, { rotZ: -0.25 });
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
    // 1. KEEP: 英桥王氏大宗祠·都堂第 (Player) vs 东海倭寇安宅巨舰本阵 (Enemy) [2x2]
    // =========================================================================
    if (key === 'keep') {
      if (!pal.isEnemy) {
        // Raised Bluestone Xumi Terrace (青石须弥台基) + Front Ceremonial Steps (+X courtyard facing!)
        pb.boxY(0, -0.35, 0, 1.94, 0.36, 1.94, pal.stoneBase, { skipBottom: true });
        pb.boxY(0, 0.0, 0, 1.92, 0.26, 1.92, pal.stoneA, { topScaleX: 0.96, topScaleZ: 0.96 });
        pb.boxY(0, 0.26, 0, 1.84, 0.08, 1.84, pal.stoneTrim);
        // Front spirit-way stairs (+X) & Twin Low-Poly Stone Guardian Lions (青石瑞狮)!
        pb.boxY(0.92, 0.02, 0, 0.22, 0.14, 0.56, pal.stoneA);
        pb.boxY(0.84, 0.14, 0, 0.18, 0.14, 0.50, pal.stoneB);
        for (const lz of [-0.40, 0.40]) {
          pb.boxY(0.86, 0.34, lz, 0.16, 0.12, 0.16, pal.stoneTrim);
          pb.boxY(0.86, 0.46, lz, 0.13, 0.16, 0.12, 0xdbe2e8, { topScaleX: 0.8 });
          pb.facetedBlob(0.88, 0.64, lz, 0.08, 0.08, 0.08, 0xe2e8f0, lz > 0 ? 3 : 7, 0.12);
        }

        // Jiangnan White-Plaster Courtyard Hall + Twin Five-Step Ma-Tou-Qiang (五岳朝天马头墙) along Z = -0.80 & +0.80!
        pb.boxY(-0.08, 0.34, 0, 1.38, 1.06, 1.56, pal.plaster);
        pb.maTouQiang(-0.08, 0.34, 0, 1.66, 0.96, 1.68, 3, pal.plaster, pal.roofA); // Wait: orient Ma-Tou-Qiang on Z flanks!
        // Left (-Z) and Right (+Z) stepped horse-head fire-gable walls!
        for (const zSgn of [-1, 1]) {
          const zWall = zSgn * 0.79;
          for (let s = 0; s < 3; s++) {
            const wSpan = 1.44 * (1 - s * 0.26);
            const hTop = 1.36 + s * 0.26;
            pb.boxY(-0.08, 0.34, zWall, wSpan, hTop - 0.34, 0.09, pal.plaster);
            pb.boxY(-0.08, hTop, zWall, wSpan + 0.08, 0.05, 0.13, pal.roofA);
            pb.boxY(-0.08 + wSpan * 0.5 + 0.02, hTop + 0.04, zWall, 0.06, 0.06, 0.12, pal.roofA, { rotZ: -0.3 });
            pb.boxY(-0.08 - wSpan * 0.5 - 0.02, hTop + 0.04, zWall, 0.06, 0.06, 0.12, pal.roofA, { rotZ: 0.3 });
          }
        }

        // Front Vermilion Colonnade Porch (+X) + Golden Ancestral Plaque (「王氏宗祠 / 忠义守望」)
        for (const pz of [-0.62, -0.24, 0.24, 0.62]) {
          pb.prismY(0.66, 0.34, pz, 0.052, 0.046, 0.96, 6, pal.pillar);
        }
        pb.boxY(0.62, 0.34, 0, 0.06, 0.64, 0.42, 0x7f1d1d); // Double red-lacquer gates
        pb.boxY(0.66, 0.64, -0.07, 0.03, 0.05, 0.05, pal.gold);
        pb.boxY(0.66, 0.64, 0.07, 0.03, 0.05, 0.05, pal.gold);
        pb.boxY(0.69, 1.06, 0, 0.05, 0.18, 0.48, 0x1e293b);
        pb.boxY(0.71, 1.09, 0, 0.03, 0.11, 0.38, pal.gold);

        // Glowing Palace Lanterns under Front Porch
        for (const lz of [-0.42, 0.42]) {
          pb.prismY(0.68, 1.02, lz, 0.06, 0.06, 0.14, 6, pal.lantern, { emissive: true });
        }

        // Double-Eaved Grand Swept Xieshan Roof (`重檐歇山黛瓦飞檐大屋顶`, apex ~2.22m!)
        pb.chineseRoof(-0.04, 1.28, 0, 1.72, 1.76, 0.30, pal.roofA, pal.stoneCap, {
          style: 'hip',
          cornerLift: 0.12,
          noFinial: true,
        });
        pb.boxY(-0.08, 1.54, 0, 1.06, 0.34, 1.18, pal.pillar);
        // Warm glowing clerestory lattice windows
        pb.boxY(0.46, 1.62, 0, 0.04, 0.16, 0.48, 0xffcf66, { emissive: true });
        pb.chineseRoof(-0.08, 1.86, 0, 1.48, 1.54, 0.42, pal.roofA, pal.stoneCap, {
          style: 'hip',
          cornerLift: 0.16,
          finialHex: pal.gold,
          gableWallHex: pal.plaster,
        });
      } else {
        // Enemy Keep: Beached Giant Wokou Atakebune Warship Stronghold (`东海倭寇安宅巨舰本阵`)!
        pb.boxY(0, -0.35, 0, 1.88, 0.38, 1.88, 0x4b443c, { skipBottom: true });
        // Swept Dark-Timber Armored Warship Hull (prow pointing -X toward Yongchang Fortress!)
        pb.boxY(0.05, 0.02, 0, 1.82, 0.58, 1.46, 0x3b281d, { topScaleX: 1.08, topScaleZ: 1.14 });
        // Sharp bronze-clad ship prow (-X)
        pb.box(-0.96, 0.42, 0, 0.44, 0.52, 0.92, 0x2b1d15, { topScaleZ: 0.35, rotZ: -0.25 });
        pb.boxY(-1.12, 0.38, 0, 0.14, 0.48, 0.16, pal.gold, { rotZ: -0.35 });
        // 2-Story Black-Lacquer Yagura Deck Fortress + Crimson Wokou Sails & Sashimono Banners!
        pb.boxY(0.12, 0.60, 0, 1.24, 0.64, 1.18, 0x262630, { topScaleX: 0.90, topScaleZ: 0.90 });
        pb.chineseRoof(0.12, 1.22, 0, 1.46, 1.40, 0.24, pal.roofA, pal.stoneCap, { style: 'hip', cornerLift: 0.08, noFinial: true });
        pb.boxY(0.14, 1.44, 0, 0.84, 0.48, 0.84, 0x332224);
        pb.chineseRoof(0.14, 1.90, 0, 1.12, 1.12, 0.36, pal.roofA, pal.stoneCap, {
          style: 'hip',
          cornerLift: 0.11,
          finialHex: pal.banner,
        });
        // Tall Mainmast + Tattered Crimson Pirate Sail & Torches!
        pb.prismY(-0.32, 0.60, 0, 0.055, 0.04, 1.75, 6, 0x4a3324);
        pb.boxY(-0.36, 1.25, 0, 0.06, 0.78, 1.04, pal.banner, { rotY: 0.08 });
        pb.prismY(-0.68, 0.66, -0.45, 0.06, 0.04, 0.16, 5, pal.lantern, { emissive: true });
        pb.prismY(-0.68, 0.66, 0.45, 0.06, 0.04, 0.16, 5, pal.lantern, { emissive: true });
      }
      return pb.buildGeometry();
    }

    // =========================================================================
    // 2. TOWER: 永昌空心敌台·烽燧楼 (Hollow Bastion Watchtower)
    // =========================================================================
    if (key === 'tower') {
      pb.boxY(0, -0.38, 0, 0.94, 0.40, 0.94, pal.stoneBase, { skipBottom: true });
      // Battered 2-story granite hollow bastion (下层空心炮窗 + 上层飞檐瞭望亭)
      pb.boxY(0, 0.0, 0, 0.94, 1.88, 0.94, pal.stoneA, { topScaleX: 0.80, topScaleZ: 0.80 });
      // Lower hollow cannon embrasures on all 4 faces
      pb.boxY(0, 0.95, 0, 0.88, 0.18, 0.20, 0x1e2530);
      pb.boxY(0, 0.95, 0, 0.20, 0.18, 0.88, 0x1e2530);
      // Corbelled stone parapet deck at y = 1.88..2.02
      pb.boxY(0, 1.88, 0, 0.92, 0.10, 0.92, pal.stoneTrim);
      pb.boxY(0, 1.98, 0, 0.84, 0.04, 0.84, pal.plank);
      // 4 Vermilion Watchtower Posts + Four-Corner Swept Pavilion Roof (`四角攒尖飞檐顶`)
      [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]].forEach(([px, pz]) => {
        pb.prismY(px, 2.02, pz, 0.042, 0.038, 0.54, 6, pal.pillar);
      });
      pb.chineseRoof(0, 2.54, 0, 0.96, 0.96, 0.42, pal.roofA, pal.stoneCap, {
        style: 'pavilion',
        sides: 4,
        cornerLift: 0.13,
        finialHex: pal.gold,
      });
      // Beacon Fire Brazier (昼烟夜火烽燧盆) projecting at front corner!
      pb.prismY(0.24, 2.02, 0.24, 0.08, 0.11, 0.12, 6, 0x334155);
      pb.prismY(0.24, 2.14, 0.24, 0.08, 0.02, 0.16, 5, 0xff8811, { emissive: true });
      return pb.buildGeometry();
    }

    // =========================================================================
    // 3. BALLISTA: 八角佛郎机火炮台 (Octagonal Ming Folangji Cannon Bastion)
    // =========================================================================
    if (key === 'ballista') {
      pb.prismY(0, -0.35, 0, 0.52, 0.52, 0.36, 8, pal.stoneBase);
      pb.prismY(0, 0.0, 0, 0.52, 0.43, 1.86, 8, pal.stoneA, { yawOffset: Math.PI / 8 });
      pb.prismY(0, 1.86, 0, 0.46, 0.48, 0.12, 8, pal.stoneTrim, { yawOffset: Math.PI / 8 });
      // Low stone gunnery lip + stacked iron cannonballs
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        pb.boxY(Math.cos(a) * 0.38, 1.98, Math.sin(a) * 0.38, 0.14, 0.11, 0.14, pal.stoneCap);
      }

      // Rotating Ming Bronze Folangji Cannon Turret (`铜铸佛郎机子母火炮`) pointing +Z!
      const tg = new PolyBuilder();
      tg.prismY(0, 0.0, 0, 0.24, 0.22, 0.06, 8, pal.timber);
      // Twin red-lacquered wooden gun-carriage cheeks
      tg.boxY(-0.11, 0.06, -0.04, 0.06, 0.20, 0.52, pal.pillar, { topScaleZ: 0.75 });
      tg.boxY(0.11, 0.06, -0.04, 0.06, 0.20, 0.52, pal.pillar, { topScaleZ: 0.75 });
      // Tapered Cast-Bronze Cannon Barrel + 3 Reinforcing Rings + Breech Chamber!
      tg.cylinderAxis(0, 0.24, 0.08, 0.095, 0.068, 0.78, 8, 'z', 0xc98a2c, { endHex: 0x1e293b });
      tg.cylinderAxis(0, 0.24, -0.14, 0.108, 0.108, 0.06, 8, 'z', 0xfacc15);
      tg.cylinderAxis(0, 0.24, 0.10, 0.098, 0.098, 0.05, 8, 'z', 0xfacc15);
      tg.cylinderAxis(0, 0.24, 0.34, 0.086, 0.086, 0.05, 8, 'z', 0xfacc15);

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
    // 4. FARM: 江南水田与龙骨水车坊 (Jiangnan Irrigated Rice Paddy & Waterwheel)
    // =========================================================================
    if (key === 'farm') {
      // Earthen paddy bunds (`田埂`) + glistening irrigated water paddy (`江南水田`)
      pb.boxY(0, -0.28, 0, 0.96, 0.30, 0.96, 0x6e5539, { skipBottom: true });
      // Raised mud bund border
      pb.boxY(0, 0.0, -0.44, 0.96, 0.08, 0.08, 0x7c6242);
      pb.boxY(0, 0.0, 0.44, 0.96, 0.08, 0.08, 0x7c6242);
      pb.boxY(-0.44, 0.0, 0, 0.08, 0.08, 0.82, 0x7c6242);
      pb.boxY(0.44, 0.0, 0, 0.08, 0.08, 0.82, 0x7c6242);
      // Irrigated turquoise-jade water mirror surface inside paddy!
      pb.boxY(-0.08, 0.01, 0, 0.72, 0.03, 0.80, 0x4ca6a8);

      // Lush Rows of Low-Poly Emerald & Golden Ripening Rice Stalks (`青翠秧苗与金黄稻穗`)!
      for (let rz = -0.30; rz <= 0.31; rz += 0.20) {
        for (let rx = -0.34; rx <= 0.08; rx += 0.20) {
          pb.prismY(rx, 0.04, rz, 0.025, 0.075, 0.22, 5, 0x65a30d);
          pb.prismY(rx + 0.02, 0.24, rz, 0.055, 0.01, 0.13, 5, 0xfacc15);
        }
      }

      // Rustic Swept-Roof Jiangnan Rice-Husking Pavilion on +X side (`水碓谷亭`)
      pb.boxY(0.24, 0.02, 0, 0.36, 0.08, 0.56, pal.stoneA);
      [[-0.13, -0.21], [0.13, -0.21], [-0.13, 0.21], [0.13, 0.21]].forEach(([dx, dz]) => {
        pb.prismY(0.24 + dx, 0.10, dz, 0.028, 0.025, 0.48, 5, pal.timber);
      });
      pb.boxY(0.22, 0.10, -0.06, 0.22, 0.26, 0.26, pal.plaster);
      pb.chineseRoof(0.24, 0.56, 0, 0.48, 0.68, 0.28, pal.roofA, pal.stoneCap, {
        style: 'gable',
        cornerLift: 0.08,
        noFinial: true,
        gableWallHex: pal.plaster,
      });

      // Rotating 8-Paddle Chinese Wooden Waterwheel (`转动筒车水车`, spins around local X!)
      const sg = new PolyBuilder();
      sg.cylinderAxis(0, 0, 0, 0.05, 0.05, 0.12, 6, 'x', pal.timber);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const py = Math.sin(a) * 0.34;
        const pz = Math.cos(a) * 0.34;
        sg.box(0, py * 0.5, pz * 0.5, 0.03, 0.34, 0.03, pal.plank, { rotX: -a });
        sg.box(0.02, py, pz, 0.08, 0.05, 0.11, i % 2 === 0 ? pal.plank : 0xd9a05b, { rotX: -a });
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
    // 5. WOODCUTTER: 楠竹松木作坊 (Bamboo & Pine Sawmill Pavilion)
    // =========================================================================
    if (key === 'woodcutter') {
      pb.boxY(0, -0.28, 0, 0.92, 0.30, 0.92, pal.stoneBase, { skipBottom: true });
      pb.boxY(0, 0.0, 0, 0.92, 0.08, 0.92, pal.stoneTrim);
      // Left Jiangnan wood-and-plaster cabin + Right open sawyer's awning
      pb.boxY(-0.18, 0.08, -0.05, 0.46, 0.58, 0.66, pal.plaster);
      pb.boxY(-0.18, 0.08, 0.29, 0.14, 0.38, 0.04, pal.timber);
      pb.prismY(0.32, 0.08, -0.30, 0.032, 0.03, 0.52, 5, pal.pillar);
      pb.prismY(0.32, 0.08, 0.28, 0.032, 0.03, 0.52, 5, pal.pillar);
      pb.chineseRoof(-0.02, 0.64, -0.02, 0.88, 0.84, 0.32, pal.roofA, pal.stoneCap, {
        style: 'gable',
        cornerLift: 0.08,
        noFinial: true,
        gableWallHex: pal.plaster,
      });
      // Sawyer's wooden trestle + felled Pine Trunk + stacked green Moso Bamboo poles!
      pb.boxY(0.20, 0.08, 0.0, 0.20, 0.20, 0.44, pal.timber);
      pb.cylinderAxis(0.20, 0.32, 0.02, 0.075, 0.070, 0.58, 7, 'z', 0x7c4e2b, { endHex: 0xe6c896 });
      pb.cylinderAxis(-0.26, 0.14, 0.38, 0.045, 0.045, 0.36, 6, 'x', 0x5c9e38);
      pb.cylinderAxis(-0.26, 0.22, 0.38, 0.042, 0.042, 0.34, 6, 'x', 0x74b843);
      return pb.buildGeometry();
    }

    // =========================================================================
    // 6. QUARRY: 大罗山采石场 + 水牛车桩 (Granite Quarry & Sweep Crane)
    // =========================================================================
    if (key === 'quarry') {
      pb.boxY(0, -0.28, 0, 0.94, 0.30, 0.94, pal.stoneBase, { skipBottom: true });
      pb.boxY(0, 0.0, 0, 0.94, 0.10, 0.94, pal.stoneB);
      // Stone-mason's open tile-roofed shed (-X, -Z)
      [[-0.36, -0.36], [0.02, -0.36], [-0.36, 0.06], [0.02, 0.06]].forEach(([px, pz]) => {
        pb.prismY(px, 0.10, pz, 0.032, 0.03, 0.54, 5, pal.timber);
      });
      pb.chineseRoof(-0.17, 0.62, -0.15, 0.52, 0.56, 0.24, pal.roofA, pal.stoneCap, {
        style: 'hip',
        cornerLift: 0.06,
        noFinial: true,
      });
      // Tall Chinese Wooden Counterbalanced Jib Crane (`天车吊杆`) + Suspended Dressed Granite Block!
      pb.prismY(0.26, 0.10, -0.20, 0.055, 0.045, 1.32, 6, pal.timber);
      pb.box(0.26, 1.30, 0.02, 0.06, 0.06, 0.72, pal.plank, { rotX: -0.18 });
      pb.boxY(0.26, 0.66, 0.22, 0.02, 0.58, 0.02, 0xcbd5e1);
      pb.boxY(0.26, 0.44, 0.22, 0.24, 0.22, 0.24, 0xdbe2e8);
      // Carved Stone Hitching Post & Water Buffalo Trough in front (+Z)
      pb.prismY(-0.30, 0.10, 0.32, 0.04, 0.035, 0.36, 6, pal.stoneA);
      pb.facetedBlob(-0.30, 0.49, 0.32, 0.055, 0.055, 0.055, pal.gold, 5, 0.08);
      pb.boxY(-0.08, 0.10, 0.32, 0.28, 0.12, 0.16, pal.stoneTrim);
      pb.boxY(-0.08, 0.19, 0.32, 0.22, 0.04, 0.10, 0x38bdf8);
      return pb.buildGeometry();
    }

    // =========================================================================
    // 7. IRON MINE: 浙南天工铁冶炉 (Ming Tiangong Kaiwu Blast Furnace & Mine Adit)
    // =========================================================================
    if (key === 'ironMine') {
      pb.boxY(0, -0.30, 0, 0.94, 0.32, 0.94, 0x57534e, { skipBottom: true });
      pb.boxY(0, 0.0, 0, 0.94, 0.08, 0.94, 0x6b635b);
      // Faceted Rust-Veined Iron Ore Crag (-Z) + Timber-Shored Mine Adit Portal!
      pb.facetedBlob(-0.14, 0.46, -0.20, 0.38, 0.44, 0.28, 0x73655c, 11, 0.18);
      pb.facetedBlob(-0.28, 0.34, -0.10, 0.16, 0.18, 0.14, 0xe07838, 19, 0.15);
      pb.boxY(-0.14, 0.08, 0.04, 0.34, 0.48, 0.10, pal.timber);
      pb.boxY(-0.14, 0.08, 0.06, 0.22, 0.38, 0.10, 0x18181b);
      // Traditional Tapered Stone-and-Brick Ming Blast Furnace (`竖炉高炉`, +X) with Glowing Hearth!
      pb.boxY(0.24, 0.08, -0.06, 0.38, 1.02, 0.38, 0x7c5a4a, { topScaleX: 0.66, topScaleZ: 0.66 });
      pb.prismY(0.24, 1.10, -0.06, 0.10, 0.08, 0.14, 6, 0xff6a00, { emissive: true });
      pb.boxY(0.24, 0.14, 0.14, 0.14, 0.16, 0.05, 0xff8811, { emissive: true });
      // Stacked Pig-Iron Ingots on Front Apron
      pb.boxY(-0.18, 0.08, 0.30, 0.22, 0.12, 0.16, 0x64748b);
      return pb.buildGeometry();
    }

    // =========================================================================
    // 8. PITCH RIG: 猛火油熬制坊 (Ming Fire-Oil Distillation Cauldron & Clay Jars)
    // =========================================================================
    if (key === 'pitchRig') {
      pb.boxY(0, -0.30, 0, 0.92, 0.32, 0.92, 0x2e293b, { skipBottom: true });
      pb.boxY(0, 0.0, 0, 0.92, 0.09, 0.92, pal.plank);
      // Brick Distillation Stove + Iron Cauldron + Tall Chimney (-X, -Z)
      pb.boxY(-0.16, 0.09, -0.12, 0.46, 0.44, 0.46, 0x8c4230, { topScaleX: 0.88, topScaleZ: 0.88 });
      pb.boxY(-0.16, 0.14, 0.12, 0.16, 0.16, 0.05, 0xff6a00, { emissive: true });
      pb.prismY(-0.16, 0.52, -0.12, 0.20, 0.14, 0.22, 8, 0x334155);
      pb.prismY(-0.30, 0.52, -0.26, 0.065, 0.05, 0.72, 6, 0x475569);
      // Sloped Tile Awning + Bamboo Pipe + Red-Cloth-Sealed Clay Fire-Oil Jars (`封泥火油坛`)!
      pb.chineseRoof(0.06, 0.82, 0.02, 0.78, 0.76, 0.24, pal.roofA, pal.stoneCap, {
        style: 'gable',
        cornerLift: 0.06,
        noFinial: true,
      });
      for (const [jx, jz] of [[0.22, 0.20], [0.26, -0.14], [-0.14, 0.28]]) {
        pb.prismY(jx, 0.09, jz, 0.075, 0.095, 0.16, 7, 0x3f2e26);
        pb.prismY(jx, 0.25, jz, 0.095, 0.055, 0.08, 7, 0x3f2e26);
        pb.prismY(jx, 0.33, jz, 0.065, 0.060, 0.04, 7, pal.banner); // Red cloth jar seal!
      }
      return pb.buildGeometry();
    }

    // =========================================================================
    // 9. FLETCHER: 神机军器局 (Ming Shenji Arquebus & Bow Guildhouse)
    // =========================================================================
    if (key === 'fletcher') {
      pb.boxY(0, -0.28, 0, 0.94, 0.30, 0.94, pal.stoneBase, { skipBottom: true });
      pb.boxY(0, 0.0, 0, 0.94, 0.10, 0.94, pal.stoneTrim);
      // Crisp Jiangnan White-Wall Guildhall + Vermilion Corner Columns + Swept Xieshan Roof!
      pb.boxY(-0.10, 0.10, -0.06, 0.62, 0.68, 0.66, pal.plaster);
      [[-0.40, -0.38], [0.20, -0.38], [-0.40, 0.26], [0.20, 0.26]].forEach(([px, pz]) => {
        pb.prismY(px, 0.10, pz, 0.035, 0.032, 0.70, 6, pal.pillar);
      });
      pb.boxY(-0.10, 0.42, 0.28, 0.24, 0.18, 0.04, 0xffcf66, { emissive: true });
      pb.chineseRoof(-0.08, 0.78, -0.06, 0.82, 0.86, 0.36, pal.roofA, pal.stoneCap, {
        style: 'hip',
        cornerLift: 0.10,
        finialHex: pal.gold,
        gableWallHex: pal.plaster,
      });
      // Front Archery/Gun Target + Weapon Rack (+X, +Z)
      pb.boxY(0.28, 0.10, -0.08, 0.16, 0.34, 0.36, pal.timber);
      pb.prismY(0.26, 0.28, 0.30, 0.14, 0.14, 0.05, 8, 0xfef08a, { scaleZ: 0.35 });
      pb.prismY(0.26, 0.28, 0.32, 0.06, 0.06, 0.05, 8, pal.banner, { scaleZ: 0.35 });
      return pb.buildGeometry();
    }

    // =========================================================================
    // 10. BLACKSMITH: 百炼甲仗锻造铺 (Ming Armor & Yanling-Saber Smithy)
    // =========================================================================
    if (key === 'blacksmith') {
      pb.boxY(0, -0.28, 0, 0.94, 0.30, 0.94, pal.stoneBase, { skipBottom: true });
      pb.boxY(0, 0.0, 0, 0.94, 0.10, 0.94, pal.stoneTrim);
      // Heavy Stone Forge Furnace & Tall Flue (-X, -Z) with Roaring HDR Coals!
      pb.boxY(-0.20, 0.10, -0.16, 0.44, 0.74, 0.44, pal.stoneA, { topScaleX: 0.85, topScaleZ: 0.85 });
      pb.boxY(-0.22, 0.84, -0.20, 0.22, 0.68, 0.22, pal.stoneB, { topScaleX: 0.78, topScaleZ: 0.78 });
      pb.boxY(-0.20, 0.18, 0.07, 0.20, 0.20, 0.05, 0xff6a00, { emissive: true });
      // Side Cabin & Swept Dark-Tile Smithy Porch Roof
      pb.boxY(0.20, 0.10, -0.16, 0.34, 0.62, 0.44, pal.plaster);
      pb.prismY(-0.36, 0.10, 0.34, 0.032, 0.03, 0.58, 5, pal.pillar);
      pb.prismY(0.36, 0.10, 0.34, 0.032, 0.03, 0.58, 5, pal.pillar);
      pb.chineseRoof(0.02, 0.68, 0.04, 0.88, 0.86, 0.30, pal.roofA, pal.stoneCap, {
        style: 'gable',
        cornerLift: 0.08,
        noFinial: true,
        gableWallHex: pal.plaster,
      });
      // Iron Anvil on Oak Stump + Quench Vat in Forecourt!
      pb.prismY(0.0, 0.10, 0.22, 0.08, 0.07, 0.14, 6, pal.timber);
      pb.boxY(0.0, 0.24, 0.22, 0.22, 0.10, 0.10, 0xcbd5e1, { topScaleX: 1.25 });
      pb.prismY(0.26, 0.10, 0.22, 0.09, 0.10, 0.18, 7, pal.plank);
      return pb.buildGeometry();
    }

    // =========================================================================
    // 11. GRANARY: 永昌义仓 (Swept-Roof Official Clan Relief Granary)
    // =========================================================================
    if (key === 'granary') {
      pb.boxY(0, -0.28, 0, 0.96, 0.30, 0.96, pal.stoneBase, { skipBottom: true });
      // Raised Moisture-Proof Bluestone Plinth + Sloped Timber Ramp (+Z)
      pb.boxY(0, 0.0, -0.04, 0.90, 0.24, 0.84, pal.stoneA, { topScaleX: 0.95, topScaleZ: 0.95 });
      pb.box(0, 0.10, 0.42, 0.30, 0.06, 0.22, pal.plank, { rotX: 0.35 });
      // Stout Ochre-and-Vermilion Timber Granary Barn + Swept Xieshan Roof!
      pb.boxY(0, 0.24, -0.04, 0.78, 0.68, 0.72, 0xc49358);
      [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.30], [0.38, 0.30]].forEach(([px, pz]) => {
        pb.prismY(px, 0.24, pz, 0.04, 0.036, 0.70, 6, pal.pillar);
      });
      pb.boxY(0, 0.24, 0.33, 0.24, 0.44, 0.04, pal.timber);
      pb.boxY(0, 0.74, 0.34, 0.24, 0.12, 0.04, pal.gold); // 「义仓」鎏金匾
      pb.chineseRoof(0, 0.92, -0.04, 0.98, 0.94, 0.40, pal.roofA, pal.stoneCap, {
        style: 'hip',
        cornerLift: 0.12,
        finialHex: pal.gold,
      });
      return pb.buildGeometry();
    }

    // =========================================================================
    // 12. ARMORY: 演武军器厅 (Open Vermilion-Columned Ming Arsenal Pavilion)
    // =========================================================================
    if (key === 'armory') {
      pb.boxY(0, -0.28, 0, 0.96, 0.30, 0.96, pal.stoneBase, { skipBottom: true });
      pb.boxY(0, 0.0, 0, 0.94, 0.12, 0.94, pal.stoneA);
      // Rear white-plaster shield wall + 6 Vermilion Pillars supporting a Swept Xieshan Roof!
      pb.boxY(0, 0.12, -0.26, 0.80, 0.68, 0.22, pal.plaster);
      [[-0.38, -0.34], [0.38, -0.34], [-0.38, 0.34], [0.38, 0.34], [0, 0.34]].forEach(([px, pz]) => {
        pb.prismY(px, 0.12, pz, 0.04, 0.036, 0.68, 6, pal.pillar);
      });
      // Crimson heraldic banners & glowing hall lantern
      pb.boxY(-0.22, 0.34, -0.14, 0.16, 0.32, 0.03, pal.banner);
      pb.boxY(0.22, 0.34, -0.14, 0.16, 0.32, 0.03, pal.banner);
      pb.prismY(0, 0.64, 0.34, 0.05, 0.05, 0.12, 6, pal.lantern, { emissive: true });
      pb.chineseRoof(0, 0.80, 0, 0.98, 0.94, 0.38, pal.roofA, pal.stoneCap, {
        style: 'hip',
        cornerLift: 0.12,
        finialHex: pal.gold,
      });
      return pb.buildGeometry();
    }

    // =========================================================================
    // 13. STOCKPILE: 营造司竹木石场 [2x2 Courtyard]
    // =========================================================================
    if (key === 'stockpile') {
      pb.boxY(0, -0.28, 0, 1.92, 0.30, 1.92, pal.stoneBase, { skipBottom: true });
      pb.boxY(0, 0.0, 0, 1.92, 0.07, 1.92, pal.stoneA);
      // 4 Carved Ming Hitching Bollards (`青石拴马桩`) at corners + 4 Timber Cargo Pallets!
      for (const [bx, bz] of [[-0.88, -0.88], [0.88, -0.88], [-0.88, 0.88], [0.88, 0.88]]) {
        pb.boxY(bx, 0.07, bz, 0.12, 0.28, 0.12, pal.stoneTrim);
        pb.facetedBlob(bx, 0.39, bz, 0.07, 0.07, 0.07, pal.gold, 3, 0.06);
      }
      for (const [px, pz] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]]) {
        pb.boxY(px, 0.07, pz, 0.68, 0.06, 0.68, pal.plank);
      }
      return pb.buildGeometry();
    }

    // =========================================================================
    // 14. CAMPFIRE: 宗祠社火义聚坛 (Clan Rally Brazier Altar & Banner)
    // =========================================================================
    if (key === 'campfire') {
      pb.prismY(0, -0.25, 0, 0.50, 0.48, 0.26, 8, pal.stoneBase);
      pb.prismY(0, 0.0, 0, 0.46, 0.42, 0.08, 8, pal.stoneA);
      // 3-Legged Bronze Ritual Brazier Cauldron (`三足青铜社火鼎`) + Roaring HDR Flames!
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        pb.prismY(Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14, 0.03, 0.025, 0.16, 5, 0x3f4a59);
      }
      pb.prismY(0, 0.20, 0, 0.17, 0.22, 0.16, 8, 0x475569);
      pb.prismY(0, 0.34, 0, 0.15, 0.02, 0.26, 6, 0xff6a00, { emissive: true });
      pb.prismY(0, 0.36, 0, 0.08, 0.01, 0.32, 5, 0xfff3b0, { emissive: true });
      // Tall Vermilion Rally Flagpole + Ming Serrated Clan Banner (`守望义勇牙旗`)!
      pb.prismY(0.32, 0.08, -0.28, 0.028, 0.022, 1.15, 6, pal.pillar);
      pb.facetedBlob(0.32, 1.26, -0.28, 0.045, 0.055, 0.045, pal.gold, 2, 0.05);
      pb.tri([0.32, 1.18, -0.26], [0.32, 0.82, -0.26], [0.32, 1.00, 0.12], pal.banner, 1, 1, 1);
      pb.tri([0.32, 1.00, 0.12], [0.32, 0.82, -0.26], [0.32, 1.18, -0.26], pal.banner, 1, 1, 1);
      return pb.buildGeometry();
    }

    // =========================================================================
    // 15. HOVEL: 江南粉墙黛瓦民居 (2-Story Jiangnan White-Wall Courtyard House)
    // =========================================================================
    pb.boxY(0, -0.28, 0, 0.90, 0.30, 0.90, pal.stoneBase, { skipBottom: true });
    pb.boxY(0, 0.0, 0, 0.90, 0.10, 0.90, pal.stoneTrim);
    // Ground white-plaster story + Overhanging dark-timber & white-plaster upper loft!
    pb.boxY(-0.04, 0.10, -0.02, 0.72, 0.46, 0.70, pal.plaster);
    pb.boxY(-0.04, 0.10, 0.34, 0.16, 0.34, 0.04, pal.timber);
    pb.boxY(-0.04, 0.56, -0.02, 0.78, 0.05, 0.76, pal.timber);
    pb.boxY(-0.04, 0.61, -0.02, 0.76, 0.42, 0.74, pal.plaster);
    // Glowing warm amber lattice windows (`木格花窗`) + side stepped horse-head gable!
    pb.boxY(-0.18, 0.72, 0.36, 0.18, 0.18, 0.03, 0xffcf66, { emissive: true });
    pb.boxY(0.12, 0.72, 0.36, 0.18, 0.18, 0.03, 0xffcf66, { emissive: true });
    // Swept Dark-Tile Gable Roof + Brick Hearth Chimney + Corner Emerald Bamboo!
    pb.chineseRoof(-0.04, 1.02, -0.02, 0.92, 0.90, 0.38, pal.roofA, pal.stoneCap, {
      style: 'gable',
      cornerLift: 0.09,
      noFinial: true,
      gableWallHex: pal.plaster,
    });
    pb.boxY(0.28, 0.60, -0.22, 0.14, 0.82, 0.14, pal.stoneA);
    // Corner green bamboo accent!
    pb.prismY(0.36, 0.10, 0.32, 0.022, 0.018, 0.62, 5, 0x4d9432);
    pb.facetedBlob(0.36, 0.74, 0.32, 0.12, 0.09, 0.12, 0x65b841, 9, 0.12);
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
    const key = `lp_cargo_${kind}`;
    return this.get(key, () => {
      const pb = new PolyBuilder();
      if (kind === 'log') {
        // Bundled Moso Bamboo & Pine Trunk!
        pb.cylinderAxis(0, 0.08, -0.05, 0.055, 0.055, 0.32, 6, 'x', 0x6e472b, { endHex: 0xe6c896 });
        pb.cylinderAxis(0, 0.08, 0.06, 0.048, 0.048, 0.32, 6, 'x', 0x5c9e38, { endHex: 0xd9f99d });
      } else if (kind === 'wood') {
        // Sawn Cedar Planks strapped together
        pb.boxY(0, 0.02, 0, 0.30, 0.13, 0.22, 0xc89358);
        pb.boxY(0, 0.01, 0, 0.05, 0.15, 0.24, 0x5c3a21);
      } else if (kind === 'stone') {
        // Dressed Yongchang Granite Block
        pb.boxY(0, 0.02, 0, 0.24, 0.16, 0.24, 0xdbe2e8, { topScaleX: 0.92, topScaleZ: 0.92 });
      } else if (kind === 'wheat') {
        // Harvested Golden Rice Sheaf (`金黄稻穗束`)
        pb.cylinderAxis(0, 0.09, 0, 0.06, 0.09, 0.30, 6, 'x', 0xfacc15);
        pb.cylinderAxis(0, 0.09, 0, 0.068, 0.068, 0.05, 6, 'x', 0x991b1b);
      } else if (kind === 'food') {
        // Plump Clan Granary Rice Sack (`义仓麻布米袋`)
        pb.prismY(0, 0.01, 0, 0.11, 0.08, 0.17, 7, 0xf2ead8);
        pb.prismY(0, 0.18, 0, 0.05, 0.07, 0.05, 6, 0xd6c7ab);
      } else if (kind === 'ore') {
        // Faceted Hematite Iron Ore Chunk
        pb.facetedBlob(0, 0.10, 0, 0.12, 0.10, 0.12, 0xd97736, 17, 0.2);
      } else if (kind === 'iron') {
        // Stacked Ming Pig-Iron Ingots in Wooden Tray
        pb.boxY(0, 0.01, 0, 0.24, 0.05, 0.20, 0x7c4e2b);
        pb.boxY(0, 0.06, -0.04, 0.18, 0.07, 0.07, 0x64748b, { topScaleX: 0.8 });
        pb.boxY(0, 0.06, 0.04, 0.18, 0.07, 0.07, 0x475569, { topScaleX: 0.8 });
      } else if (kind === 'oil') {
        // Red-Cloth-Sealed Clay Fire-Oil Jar (`封泥猛火油坛`)
        pb.prismY(0, 0.01, 0, 0.08, 0.11, 0.15, 7, 0x3f2e26);
        pb.prismY(0, 0.16, 0, 0.11, 0.06, 0.06, 7, 0x3f2e26);
        pb.prismY(0, 0.22, 0, 0.07, 0.065, 0.035, 7, 0xb91c1c);
      } else if (kind === 'bow') {
        // Ming Matchlock Arquebus & Horn Bow Bundle (`鸟铳与强弓`)
        pb.cylinderAxis(0, 0.08, -0.03, 0.025, 0.02, 0.34, 6, 'x', 0x475569);
        pb.boxY(-0.08, 0.04, -0.03, 0.12, 0.05, 0.04, 0x7c4222);
        pb.boxY(0, 0.06, 0.05, 0.26, 0.04, 0.04, 0xd97706);
      } else {
        // Ming Red-Trimmed Mountain-Pattern Armor (`明光山文甲`)
        pb.boxY(0, 0.02, 0, 0.22, 0.18, 0.16, 0xb91c1c, { topScaleX: 0.85 });
        pb.prismY(0, 0.06, 0.02, 0.07, 0.07, 0.10, 6, 0xfacc15);
      }
      return pb.buildGeometry();
    });
  }

  /**
   * Stylized Low-Poly Chinese Landscape Trees:
   * - `pine`: Tiered Flat-Crown Chinese Pine (`苍翠迎客松`)
   * - `birch`: Multi-Culm Jiangnan Emerald Bamboo Grove (`江南翠竹丛`)
   * - `willow`: Waterside Cascading Weeping Willow (`垂柳`)
   * - `oak`: Lush Faceted Camphor Tree (`江南古香樟`)
   */
  instantiateTree(style = 'oak', variant = 0) {
    const vIdx = variant % 3;
    const key = `lp_tree_${style}_${vIdx}`;
    const entry = this.get(key, () => {
      const pb = new PolyBuilder();
      if (style === 'birch') {
        // Multi-Culm Jiangnan Emerald Bamboo Grove (`翠竹丛`, 4 segmented culms + layered leaf fans!)
        const culms = [
          [-0.12, -0.08, 2.35, 0.04],
          [0.11, 0.06, 2.05, -0.05],
          [-0.02, 0.13, 1.75, 0.03],
          [0.08, -0.13, 1.55, -0.03],
        ];
        culms.forEach(([bx, bz, h, tilt], ci) => {
          const segs = 4;
          const segH = h / segs;
          for (let s = 0; s < segs; s++) {
            const sx = bx + tilt * s * 0.4;
            pb.prismY(sx, s * segH, bz, 0.038 - s * 0.004, 0.035 - s * 0.004, segH - 0.015, 6, ci % 2 === 0 ? 0x559e35 : 0x6ab344);
            // Crisp bamboo node ring!
            pb.prismY(sx, (s + 1) * segH - 0.02, bz, 0.042 - s * 0.004, 0.042 - s * 0.004, 0.02, 6, 0x86cc52);
          }
          const topX = bx + tilt * 1.4;
          pb.prismY(topX, h - 0.35, bz, 0.36, 0.03, 0.42, 6, 0x5ca83b);
          pb.prismY(topX, h - 0.08, bz, 0.28, 0.02, 0.36, 6, 0x82cf52);
        });
        return pb.buildGeometry();
      }

      if (style === 'pine') {
        // Sculpted Chinese Mountain Pine (`苍松`, gnarled trunk + flat-topped layered low-poly needle pads!)
        const hBoost = vIdx === 1 ? 0.25 : 0;
        pb.prismY(0, 0, 0, 0.14, 0.08, 1.65 + hBoost, 6, 0x5c3c26);
        const pads = [
          [0.0, 0.95, 0.0, 0.62, 0.28, 0x2f6b36],
          [-0.14, 1.32 + hBoost * 0.5, 0.08, 0.52, 0.26, 0x3b7d3e],
          [0.12, 1.62 + hBoost * 0.8, -0.06, 0.44, 0.24, 0x4c9449],
          [0.0, 1.92 + hBoost, 0.0, 0.32, 0.22, 0x62ad55],
        ];
        pads.forEach(([px, py, pz, r, h, col]) => {
          pb.prismY(px, py, pz, r, r * 0.22, h, 7, col);
        });
        return pb.buildGeometry();
      }

      if (style === 'willow') {
        // Waterside Jiangnan Weeping Willow (`江南垂柳`)
        pb.prismY(0, 0, 0, 0.16, 0.10, 1.28, 6, 0x69472c);
        pb.facetedBlob(0.05, 1.52, 0, 0.58, 0.38, 0.58, 0x6ab543, 21 + vIdx, 0.12);
        pb.facetedBlob(-0.10, 1.72, 0.08, 0.42, 0.28, 0.42, 0x8ad158, 25 + vIdx, 0.12);
        // Low-poly hanging frond prisms!
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const fx = Math.cos(a) * 0.46;
          const fz = Math.sin(a) * 0.46;
          pb.prismY(fx, 0.45 + (i % 2) * 0.18, fz, 0.03, 0.09, 0.95, 4, i % 2 === 0 ? 0x7ac44e : 0x5ea33a);
        }
        return pb.buildGeometry();
      }

      // Faceted Jiangnan Camphor Tree (`古香樟`, multi-cluster folded icosahedron crown!)
      pb.prismY(0, 0, 0, 0.17, 0.11, 1.15, 6, 0x6e472b);
      pb.box(-0.14, 1.05, 0, 0.08, 0.38, 0.08, 0x6e472b, { rotZ: 0.48 });
      pb.box(0.15, 1.08, 0, 0.08, 0.38, 0.08, 0x6e472b, { rotZ: -0.45 });
      pb.facetedBlob(-0.24, 1.42, 0.12, 0.44, 0.34, 0.44, 0x458537, 31 + vIdx, 0.13);
      pb.facetedBlob(0.24, 1.46, -0.10, 0.42, 0.34, 0.42, 0x4d913c, 37 + vIdx, 0.13);
      pb.facetedBlob(0, 1.74, 0, 0.52, 0.40, 0.52, 0x67b044, 41 + vIdx, 0.13);
      pb.facetedBlob(-0.08, 2.02, -0.05, 0.34, 0.26, 0.34, 0x88cf54, 43 + vIdx, 0.12);
      return pb.buildGeometry();
    });

    const mesh = new THREE.Mesh(entry.geo, getSharedVoxelMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.voxelCount = entry.voxelCount;
    return mesh;
  }

  getShrubGeometry() {
    return this.get('lp_shrub_geo', () => {
      const pb = new PolyBuilder();
      pb.facetedBlob(0, 0.14, 0, 0.22, 0.15, 0.22, 0x4b8f3b, 51, 0.15);
      pb.facetedBlob(0.08, 0.20, 0.05, 0.15, 0.12, 0.15, 0x76c24d, 53, 0.14);
      return pb.buildGeometry().geo;
    });
  }

  instantiateBoulder(kind = 'stone') {
    const key = `lp_boulder_${kind}`;
    const entry = this.get(key, () => {
      const pb = new PolyBuilder();
      if (kind === 'stone') {
        // Faceted Daluo Mountain Pale Granite Outcrops (`大罗山花岗岩露头`)
        pb.facetedBlob(-0.08, 0.30, 0.04, 0.44, 0.36, 0.40, 0xd8dee3, 61, 0.22);
        pb.facetedBlob(0.18, 0.42, -0.08, 0.28, 0.46, 0.28, 0xe6ebef, 67, 0.20);
      } else if (kind === 'iron') {
        // Faceted Hematite Iron Ore Vein (`赤铁矿脉露头`)
        pb.facetedBlob(-0.06, 0.32, 0.04, 0.42, 0.38, 0.38, 0x6b5c54, 71, 0.22);
        pb.facetedBlob(0.16, 0.44, -0.06, 0.26, 0.44, 0.26, 0xd97232, 73, 0.22);
        pb.prismY(-0.18, 0.22, 0.14, 0.14, 0.02, 0.36, 5, 0xe8843c);
      } else {
        // Bubbling Fire-Oil Tar Seep (`猛火油泉眼`)
        pb.prismY(0, 0.0, 0, 0.48, 0.40, 0.18, 8, 0x443e54);
        pb.prismY(0, 0.18, 0, 0.36, 0.35, 0.04, 8, 0x1c172b);
        pb.facetedBlob(-0.06, 0.23, 0.04, 0.12, 0.08, 0.12, 0x2f2747, 79, 0.1);
      }
      return pb.buildGeometry();
    });

    const mesh = new THREE.Mesh(entry.geo, getSharedVoxelMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.voxelCount = entry.voxelCount;
    return mesh;
  }
}

export const prefabs = new PrefabLibrary();
