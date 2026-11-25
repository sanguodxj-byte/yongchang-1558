import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VoxelGrid, VMAT, voxelHash, getSharedVoxelMaterial } from './voxelEngine.js';
import { prefabs } from './voxelPrefabs.js';
import { createDioramaCloudSeaAndOcean, atmosphereTime } from './dioramaRenderer.js';

export const GRID_W = 64;
export const GRID_H = 40;
const T_SUB = 4;        // 256 x 160 high-resolution micro-voxel topography!
const T_VOX = 0.25;     // 0.25m micro-voxel step
const T_BASE_Y = 5;     // yVoxel=5 -> world y = 0.0m
const T_MAX_Y = 28;     // Up to +5.75m natural mountain ridges

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export const BUILDINGS = {
  wall: {
    id: 'wall', name: '十字军石墙', cat: 'castle', mode: 'line',
    cost: { stone: 2 }, hp: 360, height: 1.75,
    desc: '一指划线依地势筑城！弓手登墙+25%射程',
  },
  tower: {
    id: 'tower', name: '火盆角楼高塔', cat: 'castle', mode: 'single',
    cost: { stone: 10, wood: 4 }, hp: 680, height: 2.44,
    desc: '3层巨塔！弓手射程+45%且射出火箭引燃沥青火沟',
  },
  gate: {
    id: 'gate', name: '铁闸城门楼', cat: 'castle', mode: 'single',
    cost: { stone: 6, wood: 4 }, hp: 560, height: 2.2,
    desc: '我军进出自动升起铁闸，敌军靠近自动落锁',
  },
  pitch: {
    id: 'pitch', name: '沥青火油沟', cat: 'castle', mode: 'line',
    cost: { oil: 1, gold: 4 }, hp: 999, height: 0.1,
    desc: '涂抹在渡口或城前草地！火箭命中或点【引燃】连环爆燃',
  },
  ballista: {
    id: 'ballista', name: '城防重弩塔', cat: 'castle', mode: 'single',
    cost: { wood: 12, stone: 8, gold: 35 }, hp: 460, height: 2.35,
    desc: '高台旋转巨弩，自动狙击攻城锤与重甲敌军',
  },
  woodcutter: {
    id: 'woodcutter', name: '伐木锯木坊', cat: 'econ', mode: 'single',
    cost: { wood: 6 }, hp: 190, height: 1.8,
    desc: '篝火农夫上岗：砍树取原木→回坊锯木板→送入堆场',
  },
  quarry: {
    id: 'quarry', name: '采石场+系牛桩', cat: 'econ', mode: 'single',
    reqBiome: 'limestone',
    cost: { wood: 10 }, hp: 240, height: 1.9,
    desc: '【北麓石灰岩旁】石匠凿石堆放，系牛桩牛车装运回堆场',
  },
  farm: {
    id: 'farm', name: '风车麦庄', cat: 'econ', mode: 'single',
    cost: { wood: 10 }, hp: 190, height: 2.6,
    desc: '【全陆地随处可建】耕种金麦→风车磨粉→送入皇家谷仓',
  },
  ironMine: {
    id: 'ironMine', name: '赤铁矿井', cat: 'econ', mode: 'single',
    reqBiome: 'iron',
    cost: { wood: 12, stone: 4 }, hp: 240, height: 1.9,
    desc: '【南麓铁矿脉旁】采矿石→回矿冶炼生铁锭→送入堆场',
  },
  pitchRig: {
    id: 'pitchRig', name: '沥青采油坊', cat: 'econ', mode: 'single',
    reqBiome: 'pitchBog',
    cost: { wood: 10 }, hp: 200, height: 1.8,
    desc: '【河湾黑油湿地旁】舀取原浆→蒸馏装桶→送入堆场',
  },
  fletcher: {
    id: 'fletcher', name: '制弓工坊', cat: 'military', mode: 'single',
    cost: { wood: 12, gold: 20 }, hp: 210, height: 1.8,
    desc: '去堆场领木板→回坊精制长弓→送入军械库',
  },
  blacksmith: {
    id: 'blacksmith', name: '十字军铁匠铺', cat: 'military', mode: 'single',
    cost: { wood: 14, stone: 8, gold: 30 }, hp: 250, height: 1.9,
    desc: '去堆场领生铁→回炉锻造重甲→送入军械库',
  },
  hovel: {
    id: 'hovel', name: '木屋民居', cat: 'econ', mode: 'single',
    cost: { wood: 8 }, hp: 170, height: 1.8,
    desc: '提供+8人口上限，吸引更多流民围聚篝火',
  },
  demolish: {
    id: 'demolish', name: '拆除铲', cat: 'castle', mode: 'line',
    cost: {}, hp: 0, height: 0,
    desc: '拆除我方墙体或建筑并返还50%建材',
  },
};

export function gridToWorld(gx, gz) {
  return {
    x: gx - GRID_W / 2 + 0.5,
    z: gz - GRID_H / 2 + 0.5,
  };
}

export function worldToGrid(wx, wz) {
  return {
    gx: Math.floor(wx + GRID_W / 2),
    gz: Math.floor(wz + GRID_H / 2),
  };
}

export function getGridLine(x0, y0, x1, y1) {
  const pts = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0;
  let cy = y0;
  while (true) {
    pts.push({ gx: cx, gz: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return pts;
}

// Smooth Quintic Value Noise + 3-Octave FBM for authentic natural geomorphology!
function valueNoise2D(x, z, seed = 17) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = voxelHash(ix, 0, iz, seed);
  const b = voxelHash(ix + 1, 0, iz, seed);
  const c = voxelHash(ix, 0, iz + 1, seed);
  const d = voxelHash(ix + 1, 0, iz + 1, seed);
  return (a * (1 - ux) + b * ux) * (1 - uz) + (c * (1 - ux) + d * ux) * uz;
}

function fbm2D(x, z, seed = 17) {
  let v = 0;
  let amp = 0.55;
  let freq = 1.0;
  for (let i = 0; i < 3; i++) {
    v += valueNoise2D(x * freq, z * freq, seed + i * 31) * amp;
    freq *= 2.05;
    amp *= 0.45;
  }
  return v; // ~ [0, 1]
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class VoxelWorld {
  constructor(scene, mats, debris) {
    this.scene = scene;
    this.mats = mats;
    this.debris = debris;

    this.cells = [];
    this.structures = [];
    this.trees = [];
    this.stoneNodes = [];
    this.ironNodes = [];
    this.pitchNodes = [];
    this.pitchFires = [];
    this.windmills = [];
    this.braziers = [];
    this.layoutVersion = 1;
    this.totalVoxelCount = 0;

    this.stockpileVisuals = new THREE.Group();
    this.scene.add(this.stockpileVisuals);
    this.armoryVisuals = new THREE.Group();
    this.scene.add(this.armoryVisuals);
    this.granaryVisuals = new THREE.Group();
    this.scene.add(this.granaryVisuals);

    this.ghostGroup = new THREE.Group();
    this.scene.add(this.ghostGroup);
    this.biomeHintGroup = new THREE.Group();
    this.scene.add(this.biomeHintGroup);

    this.playerKeep = null;
    this.enemyKeep = null;
    this.campfirePos = { x: 0, y: 0.5, z: 0 };
    this.stockpilePos = { x: 0, y: 0.5, z: 0 };
    this.granaryPos = { x: 0, y: 0.5, z: 0 };
    this.armoryPos = { x: 0, y: 0.5, z: 0 };
    this.subElev = null;
    this.cellFloraRefs = new Map();
    this._zeroDummy = new THREE.Matrix4().makeScale(0, 0, 0);

    this.compileRealisticBasinTerrain();
    createDioramaCloudSeaAndOcean(this.scene, GRID_W, GRID_H);
    this.initNaturalForestsDepositsAndCastles();
  }

  inBounds(gx, gz) {
    return gx >= 0 && gx < GRID_W && gz >= 0 && gz < GRID_H;
  }

  getCell(gx, gz) {
    if (!this.inBounds(gx, gz)) return null;
    return this.cells[gx][gz];
  }

  sampleSubElevAt(wx, wz) {
    if (!this.subElev) {
      const { gx, gz } = worldToGrid(wx, wz);
      const c = this.getCell(gx, gz);
      return c ? c.elev : 0;
    }
    const totalSubX = GRID_W * T_SUB;
    const totalSubZ = GRID_H * T_SUB;
    const vx = Math.max(0, Math.min(totalSubX - 1, Math.floor((wx + GRID_W * 0.5) / T_VOX)));
    const vz = Math.max(0, Math.min(totalSubZ - 1, Math.floor((wz + GRID_H * 0.5) / T_VOX)));
    return this.subElev[vz * totalSubX + vx];
  }

  // Exact sub-voxel surface height under a unit's feet (prevents sinking into 0.25m terrain steps!)
  getElevationAtWorld(wx, wz, bodyRadius = 0.22) {
    const centerY = this.sampleSubElevAt(wx, wz);
    if (bodyRadius <= 0.05) return centerY;
    const r = bodyRadius * 0.55;
    let supportY = centerY;
    const offsets = [[r, 0], [-r, 0], [0, r], [0, -r]];
    for (let i = 0; i < 4; i++) {
      const sy = this.sampleSubElevAt(wx + offsets[i][0], wz + offsets[i][1]);
      // Support feet on walkable micro-steps (<=0.48m), ignoring vertical cliff walls!
      if (sy > supportY && sy - centerY <= 0.48) {
        supportY = sy;
      }
    }
    return supportY;
  }

  /**
   * Natural River-Valley Geomorphology Model (Zero artificial axis-aligned boxes!):
   * - Meandering river cuts the lowest thalweg through the valley floor (x ~ 29..35) with two natural shallow gravel fords.
   * - Smooth rolling foothills & mountain ridges frame the northern & southern horizons, with organic spurs extending inward.
   * - Gently leveled natural river terraces on West (Player starting clearing) & East (Rival foothill stronghold) so castles sit naturally!
   */
  evaluateRawElevation(fx, fz) {
    const macroN = fbm2D(fx * 0.055, fz * 0.055, 101);
    const midN = fbm2D(fx * 0.14, fz * 0.14, 203);

    // 1. Natural Meandering River Centerline & Width
    const riverX = 31.0 + Math.sin(fz * 0.145 - 0.6) * 4.4 + (macroN - 0.5) * 2.6;
    const distRiver = Math.abs(fx - riverX);

    // Two Natural Shallow Gravel Fords where the river widens over hard gravel bars (South-Central z~21.5 & North Bend z~10.5)!
    const fordMain = Math.exp(-Math.pow((fz - 21.5) / 2.2, 2));
    const fordNorth = Math.exp(-Math.pow((fz - 10.5) / 1.9, 2));
    const fordFactor = Math.max(fordMain, fordNorth);
    const riverHalfW = 1.95 + fordFactor * 0.75 + (midN - 0.5) * 0.35;

    // 2. Valley Floor Base Elevation: rises gently away from the river channel (natural alluvial floodplain!)
    let h = smoothstep(riverHalfW, riverHalfW + 14.0, distRiver) * 0.75;

    // 3. Natural Mountain Ridges along North & South watersheds + West/East headlands (organic FBM ridge lines!)
    const northRidgeLine = 5.2 + (macroN - 0.45) * 5.8 + Math.sin(fx * 0.12) * 2.2;
    if (fz < northRidgeLine + 7.5) {
      // Carve river headwater gorge where river enters from the north!
      const riverGorgeMask = smoothstep(2.2, 7.5, distRiver);
      const tN = smoothstep(northRidgeLine + 7.5, northRidgeLine - 2.0, fz);
      h += tN * (3.6 + midN * 2.1) * riverGorgeMask;
    }

    const southRidgeLine = GRID_H - 5.0 - (fbm2D(fx * 0.07, 9.3, 307) - 0.45) * 5.5 - Math.cos(fx * 0.11) * 2.0;
    if (fz > southRidgeLine - 7.5) {
      const riverMouthMask = smoothstep(2.2, 7.5, distRiver);
      const tS = smoothstep(southRidgeLine - 7.5, southRidgeLine + 2.0, fz);
      h += tS * (3.4 + midN * 2.0) * riverMouthMask;
    }

    // Western & Eastern highland backdrops (curved natural amphitheaters, NOT rectangular walls!)
    const westBackLine = 3.8 + Math.pow((fz - 20) / 15.0, 2) * 3.5 + (midN - 0.5) * 2.4;
    if (fx < westBackLine + 5.0) {
      const tW = smoothstep(westBackLine + 5.0, westBackLine - 2.0, fx);
      h += tW * (3.2 + macroN * 1.8);
    }

    const eastBackLine = GRID_W - 4.0 - Math.pow((fz - 20) / 15.5, 2) * 3.2 + (midN - 0.5) * 2.4;
    if (fx > eastBackLine - 5.5) {
      const tE = smoothstep(eastBackLine - 5.5, eastBackLine + 2.0, fx);
      h += tE * (3.5 + macroN * 1.9);
    }

    // One natural rolling hillock dividing the northern ford trail from the main southern valley!
    const hillDist = Math.hypot((fx - 26.5) * 0.85, (fz - 15.2) * 1.05) + (midN - 0.5) * 1.4;
    if (hillDist < 4.8) {
      h += Math.pow(1 - hillDist / 4.8, 1.8) * 2.35;
    }

    // 4. Gently flatten two organic river-terrace clearings so castles sit on realistic level ground without square edges!
    const dPlayerClearing = Math.hypot((fx - 13.0) / 7.5, (fz - 20.5) / 6.5) + (midN - 0.5) * 0.16;
    if (dPlayerClearing < 1.35) {
      const blend = 1 - smoothstep(0.65, 1.35, dPlayerClearing);
      h = THREE.MathUtils.lerp(h, 0.50, blend);
    }

    const dEnemyClearing = Math.hypot((fx - 51.5) / 7.2, (fz - 20.0) / 6.8) + (midN - 0.5) * 0.16;
    if (dEnemyClearing < 1.35) {
      const blend = 1 - smoothstep(0.65, 1.35, dEnemyClearing);
      h = THREE.MathUtils.lerp(h, 0.75, blend);
    }

    // 5. Carve the River Channel & Gravel Fords!
    let isWater = false;
    let isFord = false;
    if (distRiver < riverHalfW) {
      if (fordFactor > 0.48) {
        // Natural shallow gravel-bar river crossing!
        isFord = true;
        h = -0.02;
      } else {
        isWater = true;
        const depthT = 1 - Math.pow(distRiver / riverHalfW, 2);
        h = -0.28 - depthT * 0.42;
      }
    }

    return { h, distRiver, riverHalfW, isWater, isFord, macroN, midN };
  }

  sampleTopography(fx, fz) {
    const c = this.evaluateRawElevation(fx, fz);
    // Measure local terrain gradient (slope) to expose natural bedrock on steep faces!
    const hx = this.evaluateRawElevation(fx + 0.5, fz).h - c.h;
    const hz = this.evaluateRawElevation(fx, fz + 0.5).h - c.h;
    const slope = Math.hypot(hx, hz) / 0.5;

    // Natural Geological Outcrop Zones along real foothill fault lines:
    const dLimestone = Math.hypot((fx - 15.5) * 0.8, (fz - 9.2) * 1.1) + (c.midN - 0.5) * 1.4;
    const dIron = Math.hypot((fx - 16.0) * 0.8, (fz - 31.2) * 1.1) + (c.midN - 0.5) * 1.4;
    const dPitchSeep = Math.hypot(fx - 26.2, fz - 28.5) + (c.midN - 0.5) * 0.9;

    // Subtle dirt country track winding naturally from West Keep across the main river ford toward East Valley!
    const trackZ = 21.3 + Math.sin((fx - 13.0) * 0.11) * 1.4 + (c.midN - 0.5) * 0.6;
    const onDirtTrack = fx >= 11.5 && fx <= 50.0 && Math.abs(fz - trackZ) < 0.85 && !c.isWater && c.h < 1.15;

    let matType = 'upland_grass';
    let biome = 'plains';

    if (c.isWater) {
      matType = 'water';
      biome = 'river';
    } else if (c.isFord) {
      matType = 'ford';
      biome = 'ford';
    } else if (dPitchSeep < 2.1 && c.h < 0.65) {
      matType = 'pitchBog';
      biome = 'pitchBog';
    } else if (dLimestone < 3.6 && c.h < 2.2) {
      matType = 'limestone';
      biome = 'limestone';
    } else if (dIron < 3.5 && c.h < 2.2) {
      matType = 'iron';
      biome = 'iron';
    } else if (slope > 0.52 || c.h > 2.35) {
      // Steep slopes or high alpine crags naturally expose layered bedrock!
      matType = c.h > 3.1 && slope < 0.48 ? 'alpine_grass' : 'bedrock';
      biome = c.h > 1.65 ? 'cliff' : 'hill';
    } else if (onDirtTrack) {
      matType = 'dirt_road';
      biome = 'road';
    } else if (c.distRiver < c.riverHalfW + 1.05 && c.h < 0.35) {
      // Realistic sandy/gravelly river beach bar along water's edge!
      matType = 'river_sand';
      biome = 'beach';
    } else if (c.distRiver < c.riverHalfW + 8.2 && c.h <= 0.62) {
      // Moisture-rich dark emerald alluvial meadow along the river floodplain (Farm zone!)
      matType = 'oasis';
      biome = 'oasis';
    } else if (fx > 38.0 && c.distRiver > 8.5 && c.h < 1.3 && c.macroN > 0.48) {
      // Semi-arid warm steppe/loess transition on eastern rain-shadow flank
      matType = 'dry_steppe';
      biome = 'plains';
    } else {
      // Natural sunlit rolling pasture grass
      matType = 'upland_grass';
      biome = c.h > 1.65 ? 'cliff' : 'plains';
    }

    return {
      elev: c.h,
      matType,
      biome,
      isBridge: false,
      isFord: c.isFord,
      slope,
    };
  }

  compileRealisticBasinTerrain() {
    // 1. Populate logical 64x40 navigation & building grid
    for (let gx = 0; gx < GRID_W; gx++) {
      this.cells[gx] = [];
      for (let gz = 0; gz < GRID_H; gz++) {
        const s = this.sampleTopography(gx + 0.5, gz + 0.5);
        const yTopVox = Math.max(2, Math.round(s.elev / T_VOX) + T_BASE_Y);
        const quantElev = (yTopVox - T_BASE_Y) * T_VOX;
        this.cells[gx][gz] = {
          gx,
          gz,
          elev: s.matType === 'water' ? -0.35 : quantElev,
          ground: s.matType === 'water' ? 'water' : s.matType,
          biome: s.biome,
          isBridge: false,
          isFord: s.isFord,
          structure: null,
          tree: null,
          resourceNode: null,
          hasPitch: false,
          pitchMesh: null,
          fireTimer: 0,
          fireMesh: null,
          rubbleMesh: null,
        };
      }
    }

    // 2. Sculpt ONE Unified 256 x 28 x 160 Seamless Micro-Voxel Basin (ZERO inter-chunk seam Z-fighting!)
    const totalSubX = GRID_W * T_SUB; // 256
    const totalSubZ = GRID_H * T_SUB; // 160
    const waterColumns = [];
    const waterMask = new Uint8Array(totalSubX * totalSubZ);
    const topYGrid = new Uint8Array(totalSubX * totalSubZ);
    const matGrid = new Array(totalSubX * totalSubZ);
    this.subElev = new Float32Array(totalSubX * totalSubZ);
    const vg = new VoxelGrid(totalSubX, T_MAX_Y, totalSubZ);

    // Pass 1: Precompute exact micro-voxel heights so cliff edges get mossy turf overhangs & physics gets exact foot Y!
    for (let lz = 0; lz < totalSubZ; lz++) {
      const fz = (lz + 0.5) / T_SUB;
      const gz = Math.min(GRID_H - 1, Math.floor(lz / T_SUB));
      for (let vx = 0; vx < totalSubX; vx++) {
        const fx = (vx + 0.5) / T_SUB;
        const gx = Math.min(GRID_W - 1, Math.floor(vx / T_SUB));
        const parentCell = this.cells[gx][gz];
        const s = this.sampleTopography(fx, fz);
        const idx = lz * totalSubX + vx;
        matGrid[idx] = s;

        if (s.matType === 'water') {
          waterMask[idx] = 1;
          topYGrid[idx] = 2;
          this.subElev[idx] = -0.35;
          waterColumns.push({ vx, vz: lz });
        } else {
          const useTileFlat = parentCell.biome !== 'cliff' && parentCell.biome !== 'beach' && s.slope < 0.36;
          const targetElev = useTileFlat ? parentCell.elev : s.elev;
          const topY = Math.min(T_MAX_Y - 2, Math.max(3, Math.round(targetElev / T_VOX) + T_BASE_Y));
          topYGrid[idx] = topY;
          this.subElev[idx] = (topY - T_BASE_Y) * T_VOX;
        }
      }
    }

    // Pass 2: Paint rich multi-layered sedimentary rock strata, mossy terrace rims, clover meadows & pebbled roads!
    for (let lz = 0; lz < totalSubZ; lz++) {
      const fz = (lz + 0.5) / T_SUB;
      for (let vx = 0; vx < totalSubX; vx++) {
        const fx = (vx + 0.5) / T_SUB;
        const idx = lz * totalSubX + vx;
        const s = matGrid[idx];

        if (s.matType === 'water') {
          const bedCol = voxelHash(vx, 0, lz, 19) > 0.5 ? 0xb7a27e : 0xcab692;
          vg.set(vx, 0, lz, bedCol, 0.02, false, VMAT.SAND);
          vg.set(vx, 1, lz, 0xcfbe9a, 0.02, false, VMAT.SAND);
          continue;
        }

        const topY = topYGrid[idx];
        let minN = topY;
        if (vx > 0) minN = Math.min(minN, topYGrid[idx - 1]);
        if (vx < totalSubX - 1) minN = Math.min(minN, topYGrid[idx + 1]);
        if (lz > 0) minN = Math.min(minN, topYGrid[idx - totalSubX]);
        if (lz < totalSubZ - 1) minN = Math.min(minN, topYGrid[idx + totalSubX]);
        const isTerraceRim = topY - minN >= 1;
        const meadowTone = fbm2D(fx * 0.28, fz * 0.28, 733);

        for (let y = 0; y < topY; y++) {
          const isTop = y === topY - 1;
          const strata = y % 4;
          let col = 0xb5a48b;
          let mId = VMAT.CLIFF;

          if (s.matType === 'oasis') {
            if (isTop) {
              col = meadowTone > 0.55 ? 0x6ea944 : (meadowTone < 0.42 ? 0x7cb84e : 0x74b048);
              mId = VMAT.GRASS;
            } else {
              col = y >= topY - 2 ? 0x9c8265 : 0x8c7358;
            }
          } else if (s.matType === 'upland_grass') {
            if (isTop) {
              col = meadowTone > 0.56 ? 0x95c45c : (meadowTone < 0.42 ? 0x7eb050 : 0x8ab957);
              mId = VMAT.GRASS;
            } else if (isTerraceRim && y === topY - 2) {
              col = 0x6b9e43; // Trailing mossy turf lip on terrace steps!
              mId = VMAT.GRASS;
            } else {
              col = y >= topY - 2 ? 0xa88f70 : 0x967e61;
            }
          } else if (s.matType === 'alpine_grass') {
            col = isTop ? (meadowTone > 0.5 ? 0x95b659 : 0x86a850) : 0xa69884;
            mId = isTop ? VMAT.GRASS : VMAT.CLIFF;
          } else if (s.matType === 'bedrock') {
            if (isTop && s.slope < 0.88 && topY < T_MAX_Y - 4) {
              // Lush highland moss & heather turf crowning natural mountain terraces!
              col = meadowTone > 0.48 ? 0x78ad4e : 0x89b558;
              mId = VMAT.GRASS;
            } else if (isTerraceRim && y === topY - 1 && s.slope < 1.05) {
              col = 0x679844;
              mId = VMAT.GRASS;
            } else {
              // Warm sunlit limestone-sandstone sedimentary strata (no cold concrete gray!)
              const bandCols = [0xd4c7b2, 0xc1b29b, 0xad9d86, 0x988973];
              col = bandCols[strata];
              mId = VMAT.CLIFF;
            }
          } else if (s.matType === 'limestone') {
            col = isTop ? 0xebe6db : (strata % 2 === 0 ? 0xd8d2c5 : 0xe2ddd1);
            mId = isTop ? VMAT.ASHLAR : VMAT.CLIFF;
          } else if (s.matType === 'iron') {
            const isOre = voxelHash(vx, y, lz, 5) > 0.70;
            col = isOre ? 0xd97941 : (isTop ? 0x8f7d72 : 0x7a6a61);
            mId = isOre ? VMAT.METAL : VMAT.CLIFF;
          } else if (s.matType === 'river_sand' || s.matType === 'ford') {
            const isPebble = voxelHash(vx, 3, lz, 71) > 0.68;
            if (isTop) {
              col = s.isFord ? (isPebble ? 0xe0d9cb : 0xd4c39f) : (isPebble ? 0xe2dac8 : 0xeddcb7);
              mId = (s.isFord || isPebble) ? VMAT.COBBLE : VMAT.SAND;
            } else {
              col = 0xc4b08b;
              mId = VMAT.SAND;
            }
          } else if (s.matType === 'dirt_road') {
            const isCobble = voxelHash(vx, 9, lz, 83) > 0.42;
            col = isTop ? (isCobble ? 0xd1c6b4 : 0xdfd0b0) : 0xa68d6f;
            mId = isTop ? (isCobble ? VMAT.COBBLE : VMAT.SAND) : VMAT.CLIFF;
          } else if (s.matType === 'dry_steppe') {
            col = isTop ? (meadowTone > 0.5 ? 0xc2be6e : 0xb3b564) : 0xb39c7b;
            mId = isTop ? VMAT.GRASS : VMAT.CLIFF;
          } else if (s.matType === 'pitchBog') {
            col = isTop ? 0x2a2438 : 0x423b52;
            mId = VMAT.PITCH;
          }

          vg.set(vx, y, lz, col, 0.018, false, mId);
        }
      }
    }

    this.totalVoxelCount += vg.countSolidVoxels();
    const terrainMeshGroup = vg.buildMeshGroup(T_VOX, { x: 0, y: 0, z: 0 }, true, true, true);
    terrainMeshGroup.position.set(-GRID_W / 2, -T_BASE_Y * T_VOX, -GRID_H / 2);
    this.scene.add(terrainMeshGroup);

    // 3. Single Seamless Zero-Overlap Flat River Surface Mesh with Per-Vertex Shoreline Foam Factor!
    if (waterColumns.length > 0) {
      const wPos = [];
      const wNorm = [];
      const wShore = [];
      const wIdx = [];
      const wy = -0.32;
      const isDryAt = (sx, sz) => {
        if (sx < 0 || sx >= totalSubX || sz < 0 || sz >= totalSubZ) return 0.0;
        return waterMask[sz * totalSubX + sx] === 0 ? 1.0 : 0.0;
      };
      waterColumns.forEach(({ vx, vz }, i) => {
        const x0 = -GRID_W / 2 + vx * T_VOX;
        const x1 = x0 + T_VOX;
        const z0 = -GRID_H / 2 + vz * T_VOX;
        const z1 = z0 + T_VOX;
        wPos.push(x0, wy, z1, x1, wy, z1, x1, wy, z0, x0, wy, z0);
        wNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
        const s01 = Math.max(isDryAt(vx - 1, vz), isDryAt(vx, vz + 1), isDryAt(vx - 1, vz + 1) * 0.7);
        const s11 = Math.max(isDryAt(vx + 1, vz), isDryAt(vx, vz + 1), isDryAt(vx + 1, vz + 1) * 0.7);
        const s10 = Math.max(isDryAt(vx + 1, vz), isDryAt(vx, vz - 1), isDryAt(vx + 1, vz - 1) * 0.7);
        const s00 = Math.max(isDryAt(vx - 1, vz), isDryAt(vx, vz - 1), isDryAt(vx - 1, vz - 1) * 0.7);
        wShore.push(s01, s11, s10, s00);
        const b = i * 4;
        wIdx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      });
      const waterGeo = new THREE.BufferGeometry();
      waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
      waterGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wNorm, 3));
      waterGeo.setAttribute('aShore', new THREE.Float32BufferAttribute(wShore, 1));
      waterGeo.setIndex(wIdx);
      waterGeo.computeBoundingSphere();
      const riverMesh = new THREE.Mesh(waterGeo, this.mats.water);
      riverMesh.receiveShadow = true;
      riverMesh.userData.noOutline = true;
      this.scene.add(riverMesh);
      this.totalVoxelCount += waterColumns.length;
    }
  }

  initNaturalForestsDepositsAndCastles() {
    // 1. Player Starting Clearing: Spaced-out Basic Castle Core with generous 2-3 tile walkways (ZERO building overlap!)
    this.playerKeep = this.buildGrandKeep(9, 19, 'player');
    this.buildCampfire(14, 19);
    this.buildStockpilePad(9, 15);
    this.buildArmoryRack(13, 15);
    this.buildGranary(9, 23);

    // 2. Rival Wolf Duke Foothill Castle (nestled naturally in the eastern valley pass at x=50..56, z=16..24)
    this.enemyKeep = this.buildGrandKeep(53, 19, 'enemy');
    for (let z = 15; z <= 24; z++) {
      if (z === 15 || z === 24) this.placeStructure('tower', 48, z, 'enemy', true);
      else if (z === 19) this.placeStructure('gate', 48, 19, 'enemy', true);
      else if (z === 20) continue; // Covered by unified 2-tile (2-body-width) Gatehouse at (48, 19..20)!
      else this.placeStructure('wall', 48, z, 'enemy', true);
    }
    for (let x = 49; x <= 56; x++) {
      this.placeStructure('wall', x, 15, 'enemy', true);
      this.placeStructure('wall', x, 24, 'enemy', true);
    }

    // 3. Natural Geological Boulders clustered strictly on their real fault outcrops
    [[14, 8], [16, 8], [15, 9], [17, 9]].forEach(([x, z]) => this.spawnDeposit(x, z, 'stone'));
    [[15, 31], [17, 31], [16, 32]].forEach(([x, z]) => this.spawnDeposit(x, z, 'iron'));
    [[26, 28], [27, 29]].forEach(([x, z]) => this.spawnDeposit(x, z, 'pitch'));

    // 4. Multi-Species Organic Forest Groves (Spruce/Pine ridges, Silver Birch foothills, Broadleaf Oak woods, Weeping Willows by the river!)
    for (let x = 3; x < GRID_W - 4; x++) {
      for (let z = 3; z < GRID_H - 3; z++) {
        const c = this.cells[x][z];
        if (!c || c.structure || c.resourceNode || c.ground === 'water' || c.isFord || c.biome === 'road') continue;
        if (Math.hypot(x - 12, z - 19.5) < 6.8) continue;
        if (Math.hypot(x - 52, z - 20) < 7.5) continue;
        if (c.biome === 'limestone' || c.biome === 'iron' || c.biome === 'pitchBog') continue;

        const groveNoise = fbm2D(x * 0.18, z * 0.18, 509);
        const jitter = voxelHash(x, 31, z, 613);

        // Check proximity to river water for graceful Weeping Willows!
        let nearRiverWater = false;
        for (let dx = -2; dx <= 2 && !nearRiverWater; dx++) {
          for (let dz = -2; dz <= 2 && !nearRiverWater; dz++) {
            const nc = this.getCell(x + dx, z + dz);
            if (nc && nc.ground === 'water') nearRiverWater = true;
          }
        }

        if (nearRiverWater && c.elev <= 0.55 && jitter > 0.78) {
          this.spawnTree(x, z, 'willow');
        } else if (c.elev >= 0.65 && c.elev <= 2.4 && groveNoise > 0.49 && jitter > 0.50) {
          const sp = c.elev > 1.35 ? 'pine' : (jitter > 0.78 ? 'birch' : 'oak');
          this.spawnTree(x, z, sp);
        } else if (c.biome === 'oasis' && groveNoise > 0.59 && jitter > 0.67) {
          this.spawnTree(x, z, jitter > 0.84 ? 'willow' : 'oak');
        }
      }
    }

    // 5. Lush Multi-Layer Dynamic Vegetation (Auto-clears whenever player builds over any cell!)
    this.initDioramaFlora();
  }

  registerFloraRef(gx, gz, mesh, idx) {
    if (!this.inBounds(gx, gz)) return;
    const key = gx * GRID_H + gz;
    let list = this.cellFloraRefs.get(key);
    if (!list) {
      list = [];
      this.cellFloraRefs.set(key, list);
    }
    list.push({ mesh, idx });
  }

  clearFloraAtCell(gx, gz) {
    const key = gx * GRID_H + gz;
    const list = this.cellFloraRefs.get(key);
    if (!list || list.length === 0) return;
    for (let i = 0; i < list.length; i++) {
      const { mesh, idx } = list[i];
      mesh.setMatrixAt(idx, this._zeroDummy);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.cellFloraRefs.delete(key);
  }

  initDioramaFlora() {
    // Build a 3-blade fanned grass tuft geometry (looks lush from isometric 3/4 view instead of single cubes!)
    const b1 = new THREE.BoxGeometry(0.042, 0.28, 0.042);
    b1.translate(0, 0.14, 0);
    const b2 = new THREE.BoxGeometry(0.038, 0.24, 0.038);
    b2.translate(0, 0.12, 0);
    b2.rotateZ(0.32);
    b2.rotateY(1.05);
    const b3 = new THREE.BoxGeometry(0.038, 0.22, 0.038);
    b3.translate(0, 0.11, 0);
    b3.rotateZ(-0.30);
    b3.rotateY(-1.05);
    const tuftGeo = mergeGeometries([b1, b2, b3], false);
    b1.dispose(); b2.dispose(); b3.dispose();

    const swayMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.80,
      metalness: 0.0,
    });
    swayMat.customProgramCacheKey = () => 'diorama-wind-sway-v2';
    swayMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = atmosphereTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec2 fIp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          #else
            vec2 fIp = vec2(0.0);
          #endif
          float gust = sin(uWindTime * 2.2 + fIp.x * 0.62 + fIp.y * 0.48) * 0.10
                     + sin(uWindTime * 4.0 + fIp.x * 1.15) * 0.035;
          transformed.x += gust * clamp(position.y * 2.8, 0.0, 1.3);
          transformed.z += gust * 0.45 * clamp(position.y * 2.8, 0.0, 1.3);`
        );
    };

    const grassTufts = [];
    const blossoms = [];
    const shrubs = [];
    const lilyTransforms = [];
    const flowerPalette = [0xfef08a, 0xfdf4ff, 0xfbcfe8, 0x93c5fd, 0xfda4af, 0xfde047];

    for (let x = 3; x < GRID_W - 3; x++) {
      for (let z = 2; z < GRID_H - 2; z++) {
        const c = this.cells[x][z];
        if (!c || c.structure || c.isFord || c.biome === 'road') continue;
        const wp = gridToWorld(x, z);

        // A. Shallow Riverbank Cattails & Floating Water-Lilies
        if (c.ground === 'water') {
          let touchesBank = false;
          [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx, dz]) => {
            const nc = this.getCell(x + dx, z + dz);
            if (nc && nc.ground !== 'water' && !nc.isFord) touchesBank = true;
          });
          if (touchesBank && voxelHash(x, 7, z, 901) > 0.40) {
            const count = 3 + Math.floor(voxelHash(x, 11, z, 907) * 3);
            for (let k = 0; k < count; k++) {
              const ox = (voxelHash(x, k, z, 911) - 0.5) * 0.68;
              const oz = (voxelHash(x, k, z, 919) - 0.5) * 0.68;
              const hScale = 1.25 + voxelHash(x, k, z, 929) * 0.70;
              grassTufts.push({ gx: x, gz: z, x: wp.x + ox, y: -0.34, z: wp.z + oz, sx: 0.9, sy: hScale, col: 0x5c9e42 });
              if (k === 0) {
                // Brown velvety cattail seed-spike!
                blossoms.push({ gx: x, gz: z, x: wp.x + ox, y: -0.34 + 0.25 * hScale, z: wp.z + oz, sc: 0.85, col: 0x6b4223 });
              }
            }
            if (voxelHash(x, 19, z, 937) > 0.50) {
              lilyTransforms.push({
                x: wp.x + (voxelHash(x, 2, z, 941) - 0.5) * 0.48,
                y: -0.305,
                z: wp.z + (voxelHash(x, 3, z, 947) - 0.5) * 0.48,
                hasFlower: voxelHash(x, 5, z, 953) > 0.40,
              });
            }
          }
          continue;
        }

        if (c.biome === 'pitchBog' || c.biome === 'limestone' || c.biome === 'iron') continue;
        // Keep the central paved/trodden castle courtyards neat around both Keeps
        if (Math.hypot(x - 11.5, z - 19.0) < 4.8) continue;
        if (Math.hypot(x - 52.0, z - 19.5) < 4.8) continue;

        // Check if adjacent to a cliff step or tree for natural hedgerow shrubs!
        let nearCliffOrTree = Boolean(c.tree || c.resourceNode);
        for (let dx = -1; dx <= 1 && !nearCliffOrTree; dx++) {
          for (let dz = -1; dz <= 1 && !nearCliffOrTree; dz++) {
            const nc = this.getCell(x + dx, z + dz);
            if (nc && (Math.abs(nc.elev - c.elev) >= 0.50 || nc.tree)) nearCliffOrTree = true;
          }
        }

        const meadowPatch = fbm2D(x * 0.24, z * 0.24, 811);
        const h1 = voxelHash(x, 13, z, 823);

        // B. Sculpted Leafy Hedgerow & Cliff-Skirt Berry Shrubs (auto-cleared if built over!)
        if (nearCliffOrTree && !c.tree && !c.resourceNode && c.elev <= 2.6 && h1 > 0.74) {
          const sx = wp.x + (voxelHash(x, 17, z, 827) - 0.5) * 0.52;
          const sz = wp.z + (voxelHash(x, 23, z, 829) - 0.5) * 0.52;
          const sy = this.sampleSubElevAt(sx, sz);
          shrubs.push({
            gx: x, gz: z,
            x: sx, y: sy - 0.02, z: sz,
            sc: 0.78 + voxelHash(x, 29, z, 839) * 0.42,
            rot: h1 * Math.PI * 2,
          });
        }

        // C. Soft Wind-Swaying Meadow Grass Tufts & Sunlit Wildflower Clusters!
        if ((c.biome === 'plains' || c.biome === 'oasis' || c.biome === 'hill') && meadowPatch > 0.47 && h1 > 0.36) {
          const tuftCount = meadowPatch > 0.62 ? 3 : 2;
          for (let k = 0; k < tuftCount; k++) {
            const ox = (voxelHash(x, k + 1, z, 853) - 0.5) * 0.74;
            const oz = (voxelHash(x, k + 5, z, 857) - 0.5) * 0.74;
            if (c.tree && Math.hypot(ox, oz) < 0.34) continue;
            const tx = wp.x + ox;
            const tz = wp.z + oz;
            const ty = this.sampleSubElevAt(tx, tz);
            const gCol = c.biome === 'oasis'
              ? (k % 2 === 0 ? 0x62a840 : 0x76be4d)
              : (k % 2 === 0 ? 0x7bc24e : 0x91d15b);
            const sy = 0.65 + voxelHash(x, k, z, 863) * 0.48;
            grassTufts.push({ gx: x, gz: z, x: tx, y: ty - 0.02, z: tz, sx: 0.92, sy, col: gCol });

            if (meadowPatch > 0.58 && voxelHash(x, k + 9, z, 877) > 0.54) {
              const fCol = flowerPalette[(x * 3 + z + k) % flowerPalette.length];
              blossoms.push({ gx: x, gz: z, x: tx, y: ty + 0.16 * sy, z: tz, sc: 0.85 + (k % 2) * 0.25, col: fCol });
            }
          }
        }
      }
    }

    // 1. Batched Swaying Grass Tufts & Reeds InstancedMesh
    if (grassTufts.length > 0) {
      const inst = new THREE.InstancedMesh(tuftGeo, swayMat, grassTufts.length);
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      grassTufts.forEach((it, i) => {
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(0, i * 1.9, 0);
        dummy.scale.set(it.sx, it.sy, it.sx);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        col.setHex(it.col);
        inst.setColorAt(i, col);
        this.registerFloraRef(it.gx, it.gz, inst, i);
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.userData.noOutline = true;
      this.scene.add(inst);
    }

    // 2. Batched Wildflower Blossoms & Cattail Spikes InstancedMesh
    if (blossoms.length > 0) {
      const petalGeo = new THREE.BoxGeometry(0.095, 0.065, 0.095);
      const bInst = new THREE.InstancedMesh(petalGeo, swayMat, blossoms.length);
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      blossoms.forEach((bl, i) => {
        dummy.position.set(bl.x, bl.y, bl.z);
        dummy.rotation.set(0, i * 1.1, 0);
        dummy.scale.setScalar(bl.sc);
        dummy.updateMatrix();
        bInst.setMatrixAt(i, dummy.matrix);
        col.setHex(bl.col);
        bInst.setColorAt(i, col);
        this.registerFloraRef(bl.gx, bl.gz, bInst, i);
      });
      bInst.instanceMatrix.needsUpdate = true;
      if (bInst.instanceColor) bInst.instanceColor.needsUpdate = true;
      bInst.userData.noOutline = true;
      this.scene.add(bInst);
    }

    // 3. Batched Sculpted 3-Tone Leafy Hedgerow & Berry Shrubs InstancedMesh
    if (shrubs.length > 0) {
      const sGeo = prefabs.getShrubGeometry();
      const sInst = new THREE.InstancedMesh(sGeo, getSharedVoxelMaterial(), shrubs.length);
      sInst.castShadow = true;
      sInst.receiveShadow = true;
      const dummy = new THREE.Object3D();
      shrubs.forEach((sh, i) => {
        dummy.position.set(sh.x, sh.y, sh.z);
        dummy.rotation.set(0, sh.rot, 0);
        dummy.scale.setScalar(sh.sc);
        dummy.updateMatrix();
        sInst.setMatrixAt(i, dummy.matrix);
        this.registerFloraRef(sh.gx, sh.gz, sInst, i);
      });
      sInst.instanceMatrix.needsUpdate = true;
      this.scene.add(sInst);
    }

    // 4. Batched Floating River Water-Lilies
    if (lilyTransforms.length > 0) {
      const padGeo = new THREE.BoxGeometry(0.26, 0.025, 0.26);
      const padMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
      const lilyInst = new THREE.InstancedMesh(padGeo, padMat, lilyTransforms.length * 2);
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      let ptr = 0;
      lilyTransforms.forEach((lt, i) => {
        dummy.position.set(lt.x, lt.y, lt.z);
        dummy.rotation.set(0, i * 0.9, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        lilyInst.setMatrixAt(ptr, dummy.matrix);
        col.setHex(0x52a346);
        lilyInst.setColorAt(ptr++, col);

        dummy.position.set(lt.x, lt.y + (lt.hasFlower ? 0.03 : -10), lt.z);
        dummy.scale.set(0.38, 1.8, 0.38);
        dummy.updateMatrix();
        lilyInst.setMatrixAt(ptr, dummy.matrix);
        col.setHex(i % 2 === 0 ? 0xfce7f3 : 0xfef9c3);
        lilyInst.setColorAt(ptr++, col);
      });
      lilyInst.instanceMatrix.needsUpdate = true;
      if (lilyInst.instanceColor) lilyInst.instanceColor.needsUpdate = true;
      lilyInst.userData.noOutline = true;
      this.scene.add(lilyInst);
    }
  }

  spawnTree(gx, gz, style = 'oak') {
    const cell = this.getCell(gx, gz);
    if (!cell || cell.structure) return;
    const wp = gridToWorld(gx, gz);
    const mesh = prefabs.instantiateTree(style, gx + gz);
    mesh.position.set(wp.x, cell.elev, wp.z);
    mesh.rotation.y = ((gx * 3 + gz) % 4) * (Math.PI / 2);
    const scaleVar = 0.88 + voxelHash(gx, 12, gz, 91) * 0.26;
    mesh.scale.setScalar(scaleVar);
    this.scene.add(mesh);
    this.totalVoxelCount += mesh.userData.voxelCount || 240;

    const treeObj = { gx, gz, x: wp.x, y: cell.elev, z: wp.z, mesh, stumpMesh: null, woodLeft: 40, regrowTimer: 0 };
    cell.tree = treeObj;
    this.trees.push(treeObj);
  }

  fellTree(treeObj) {
    if (!treeObj) return;
    treeObj.woodLeft = 0;
    treeObj.mesh.visible = false;
    treeObj.regrowTimer = 26;
    if (!treeObj.stumpMesh) {
      treeObj.stumpMesh = prefabs.instantiateTreeStump();
      treeObj.stumpMesh.position.set(treeObj.x, treeObj.y, treeObj.z);
      this.scene.add(treeObj.stumpMesh);
    }
    treeObj.stumpMesh.visible = true;
  }

  spawnDeposit(gx, gz, kind = 'stone') {
    const cell = this.getCell(gx, gz);
    if (!cell || cell.structure) return;
    const wp = gridToWorld(gx, gz);
    const mesh = prefabs.instantiateBoulder(kind);
    mesh.position.set(wp.x, cell.elev, wp.z);
    this.scene.add(mesh);
    this.totalVoxelCount += mesh.userData.voxelCount || 180;

    const node = { gx, gz, x: wp.x, y: cell.elev, z: wp.z, kind, mesh };
    cell.resourceNode = node;
    if (kind === 'stone') this.stoneNodes.push(node);
    else if (kind === 'iron') this.ironNodes.push(node);
    else this.pitchNodes.push(node);
  }

  buildGrandKeep(gx, gz, team) {
    const isEnemy = team === 'enemy';
    const baseCell = this.getCell(gx, gz);
    const elev = baseCell ? baseCell.elev : 0;
    const wp = gridToWorld(gx + 0.5, gz + 0.5);

    const group = prefabs.instantiate('keep', team);
    group.position.set(wp.x, elev, wp.z);
    this.scene.add(group);
    this.totalVoxelCount += group.userData.voxelCount || 5200;

    // Exact flat roof deck height of Norman Keep (21 * 0.106 = 2.23m) so Lord stands cleanly with zero clipping!
    const struct = {
      id: `keep_${team}`,
      type: 'keep',
      team,
      gx,
      gz,
      x: wp.x,
      y: elev,
      z: wp.z,
      hp: isEnemy ? 2200 : 2400,
      maxHp: isEnemy ? 2200 : 2400,
      height: 2.23,
      mesh: group,
      cells: [],
    };

    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        const c = this.getCell(gx + dx, gz + dz);
        if (c) {
          c.structure = struct;
          struct.cells.push(c);
        }
      }
    }
    this.structures.push(struct);
    return struct;
  }

  buildCampfire(gx, gz) {
    const cell = this.getCell(gx, gz);
    const elev = cell ? cell.elev : 0;
    const wp = gridToWorld(gx, gz);
    this.campfirePos = { x: wp.x, y: elev, z: wp.z };

    const group = prefabs.instantiate('campfire', 'player');
    group.position.set(wp.x, elev, wp.z);
    const warmLight = new THREE.PointLight(0xff8c2b, 2.4, 12, 1.6);
    warmLight.position.set(0, 1.35, 0);
    group.add(warmLight);

    this.scene.add(group);
    this.totalVoxelCount += group.userData.voxelCount || 620;
    if (cell) cell.structure = { type: 'campfire', team: 'player', hp: 9999, maxHp: 9999, x: wp.x, y: elev, z: wp.z };
  }

  buildStockpilePad(gx, gz) {
    const cell = this.getCell(gx, gz);
    const elev = cell ? cell.elev : 0;
    const wp = gridToWorld(gx + 0.5, gz + 0.5);
    this.stockpilePos = { x: wp.x, y: elev, z: wp.z };

    const pad = prefabs.instantiate('stockpile', 'player');
    pad.position.set(wp.x, elev, wp.z);
    this.scene.add(pad);
    this.totalVoxelCount += pad.userData.voxelCount || 1150;

    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        const c = this.getCell(gx + dx, gz + dz);
        if (c) c.structure = { type: 'stockpile', team: 'player', hp: 9999, maxHp: 9999, x: wp.x, y: elev, z: wp.z };
      }
    }
  }

  buildArmoryRack(gx, gz) {
    const cell = this.getCell(gx, gz);
    const elev = cell ? cell.elev : 0;
    const wp = gridToWorld(gx, gz);
    this.armoryPos = { x: wp.x, y: elev, z: wp.z };

    const group = prefabs.instantiate('armory', 'player');
    group.position.set(wp.x, elev, wp.z);
    this.scene.add(group);
    this.totalVoxelCount += group.userData.voxelCount || 1400;
    if (cell) {
      const st = {
        id: 'armory_player',
        type: 'armory',
        team: 'player',
        gx,
        gz,
        hp: 800,
        maxHp: 800,
        height: 1.45,
        x: wp.x,
        y: elev,
        z: wp.z,
        mesh: group,
        garrison: [],
        maxGarrison: 0,
        cells: [cell],
      };
      cell.structure = st;
      this.structures.push(st);
    }
  }

  buildGranary(gx, gz) {
    const cell = this.getCell(gx, gz);
    const elev = cell ? cell.elev : 0;
    const wp = gridToWorld(gx, gz);
    this.granaryPos = { x: wp.x, y: elev, z: wp.z };

    const group = prefabs.instantiate('granary', 'player');
    group.position.set(wp.x, elev, wp.z);
    this.scene.add(group);
    this.totalVoxelCount += group.userData.voxelCount || 1600;
    if (cell) {
      const st = {
        id: 'granary_player',
        type: 'granary',
        team: 'player',
        gx,
        gz,
        hp: 700,
        maxHp: 700,
        height: 1.82,
        x: wp.x,
        y: elev,
        z: wp.z,
        mesh: group,
        garrison: [],
        maxGarrison: 0,
        cells: [cell],
      };
      cell.structure = st;
      this.structures.push(st);
    }
  }

  updateStockpileVisuals(res) {
    while (this.stockpileVisuals.children.length > 0) {
      this.stockpileVisuals.remove(this.stockpileVisuals.children[0]);
    }
    const baseElev = this.stockpilePos.y;
    const items = [
      { count: Math.min(8, Math.floor(res.wood / 10)), kind: 'wood', ox: -0.46, oz: -0.46, sy: 0.21 },
      { count: Math.min(8, Math.floor(res.stone / 10)), kind: 'stone', ox: 0.46, oz: -0.46, sy: 0.21 },
      { count: Math.min(6, Math.floor(res.iron / 3)), kind: 'iron', ox: -0.46, oz: 0.46, sy: 0.20 },
      { count: Math.min(6, Math.floor(res.oil / 3)), kind: 'oil', ox: 0.46, oz: 0.46, sy: 0.24 },
    ];
    items.forEach(({ count, kind, ox, oz, sy }) => {
      for (let i = 0; i < count; i++) {
        const itemMesh = prefabs.instantiateCargoItem(kind);
        const row = i % 2;
        const col = Math.floor(i / 2) % 2;
        const layer = Math.floor(i / 4);
        itemMesh.position.set(
          this.stockpilePos.x + ox + (row - 0.5) * 0.34,
          baseElev + 0.14 + layer * sy,
          this.stockpilePos.z + oz + (col - 0.5) * 0.34
        );
        this.stockpileVisuals.add(itemMesh);
      }
    });

    while (this.armoryVisuals.children.length > 0) {
      this.armoryVisuals.remove(this.armoryVisuals.children[0]);
    }
    const bowCount = Math.min(4, Math.floor(res.bows / 2));
    for (let i = 0; i < bowCount; i++) {
      const b = prefabs.instantiateCargoItem('bow');
      b.position.set(this.armoryPos.x - 0.30 + i * 0.20, this.armoryPos.y + 0.12, this.armoryPos.z + 0.08);
      this.armoryVisuals.add(b);
    }
    const armCount = Math.min(4, Math.floor(res.armor / 2));
    for (let i = 0; i < armCount; i++) {
      const a = prefabs.instantiateCargoItem('armor');
      a.position.set(this.armoryPos.x - 0.30 + i * 0.20, this.armoryPos.y + 0.12, this.armoryPos.z + 0.28);
      this.armoryVisuals.add(a);
    }

    while (this.granaryVisuals.children.length > 0) {
      this.granaryVisuals.remove(this.granaryVisuals.children[0]);
    }
    const foodSacks = Math.min(8, Math.floor((res.food || 0) / 14));
    for (let i = 0; i < foodSacks; i++) {
      const f = prefabs.instantiateCargoItem('food');
      const row = i % 4;
      const layer = Math.floor(i / 4);
      f.position.set(
        this.granaryPos.x - 0.32 + row * 0.21,
        this.granaryPos.y + 0.12 + layer * 0.20,
        this.granaryPos.z + 0.56
      );
      this.granaryVisuals.add(f);
    }
  }

  updateQuarryStagedVisuals(struct) {
    if (!struct || struct.type !== 'quarry' || !struct.mesh) return;
    if (!struct.stagedVisuals) {
      struct.stagedVisuals = new THREE.Group();
      struct.mesh.add(struct.stagedVisuals);
    }
    while (struct.stagedVisuals.children.length > 0) {
      struct.stagedVisuals.remove(struct.stagedVisuals.children[0]);
    }
    const blocks = Math.min(4, Math.floor((struct.stagedStone || 0) / 6));
    for (let i = 0; i < blocks; i++) {
      const b = prefabs.instantiateCargoItem('stone');
      b.scale.setScalar(0.82);
      b.position.set(0.24 + (i % 2) * 0.18, 0.14 + Math.floor(i / 2) * 0.16, 0.28);
      struct.stagedVisuals.add(b);
    }
  }

  hasNearbyBiome(gx, gz, reqBiome, radius = 2) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const c = this.getCell(gx + dx, gz + dz);
        if (c && c.biome === reqBiome) return true;
      }
    }
    return false;
  }

  showBiomeHints(buildType) {
    while (this.biomeHintGroup.children.length > 0) {
      this.biomeHintGroup.remove(this.biomeHintGroup.children[0]);
    }
    const spec = BUILDINGS[buildType];
    if (!spec || !spec.reqBiome) return;

    for (let x = 2; x <= 42; x++) {
      for (let z = 2; z < GRID_H - 2; z++) {
        if (this.canPlace(buildType, x, z)) {
          const c = this.cells[x][z];
          const wp = gridToWorld(x, z);
          const pad = new THREE.Mesh(boxGeo, this.mats.biomeHighlight);
          pad.scale.set(0.92, 0.08, 0.92);
          pad.position.set(wp.x, c.elev + 0.06, wp.z);
          this.biomeHintGroup.add(pad);
        }
      }
    }
  }

  isGateCellCandidate(gx, gz, team = 'player', freeInit = false) {
    if (!this.inBounds(gx, gz)) return false;
    if (!freeInit && (gx < 2 || gx > 42 || gz < 2 || gz >= GRID_H - 2)) return false;
    const c = this.getCell(gx, gz);
    if (!c || c.ground === 'water' || c.biome === 'cliff' || c.isFord || c.elev > 1.80) return false;
    if (c.tree || c.resourceNode) return false;
    if (c.structure && !(c.structure.team === team && c.structure.type === 'wall')) return false;
    return true;
  }

  // Resolves a 2-tile (2-body-width = 1.50m clear arch!) footprint for Gatehouse, honoring player rotation (`rotSteps`)!
  resolveGateFootprint(gx, gz, team = 'player', freeInit = false, rotSteps = null) {
    if (!this.isGateCellCandidate(gx, gz, team, freeInit)) return null;
    const c0 = this.getCell(gx, gz);

    const hasFortAt = (tx, tz) => {
      const nc = this.getCell(tx, tz);
      return Boolean(
        nc &&
        nc.structure &&
        nc.structure.hp > 0 &&
        nc.structure.team === team &&
        ['wall', 'tower', 'gate', 'ballista'].includes(nc.structure.type)
      );
    };

    const nsScore = (hasFortAt(gx, gz - 1) ? 1 : 0) + (hasFortAt(gx, gz + 1) ? 1 : 0) + (hasFortAt(gx, gz + 2) ? 1 : 0);
    const ewScore = (hasFortAt(gx - 1, gz) ? 1 : 0) + (hasFortAt(gx + 1, gz) ? 1 : 0) + (hasFortAt(gx + 2, gz) ? 1 : 0);
    let preferEW = ewScore > nsScore;
    if (rotSteps !== null && rotSteps !== undefined && nsScore === ewScore) {
      preferEW = (((rotSteps % 4) + 4) % 4) % 2 === 1;
    } else if (rotSteps !== null && rotSteps !== undefined) {
      // Explicit player rotation takes priority whenever that 2-tile span is valid!
      preferEW = (((rotSteps % 4) + 4) % 4) % 2 === 1;
    }

    const tryAxis = (axis) => {
      const dirs = axis === 'ns' ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      for (let i = 0; i < dirs.length; i++) {
        const nx = gx + dirs[i][0];
        const nz = gz + dirs[i][1];
        if (!this.isGateCellCandidate(nx, nz, team, freeInit)) continue;
        const c1 = this.getCell(nx, nz);
        if (Math.abs(c1.elev - c0.elev) <= 0.30) {
          const ordered = (nx < gx || nz < gz) ? [c1, c0] : [c0, c1];
          return { axis, cells: ordered };
        }
      }
      return null;
    };

    return (preferEW ? (tryAxis('ew') || tryAxis('ns')) : (tryAxis('ns') || tryAxis('ew')));
  }

  canPlace(type, gx, gz, rotSteps = 0) {
    if (!this.inBounds(gx, gz)) return false;
    if (gx < 2 || gx > 42 || gz < 2 || gz >= GRID_H - 2) return false;
    const cell = this.getCell(gx, gz);
    if (!cell || cell.ground === 'water' || cell.biome === 'cliff' || cell.isFord) return false;

    if (type === 'demolish') {
      return Boolean(
        (cell.structure && cell.structure.team === 'player' && !['keep', 'campfire', 'stockpile', 'armory', 'granary'].includes(cell.structure.type)) ||
        cell.hasPitch
      );
    }

    if (type === 'gate') {
      return Boolean(this.resolveGateFootprint(gx, gz, 'player', false, rotSteps));
    }

    if (cell.tree || cell.resourceNode || cell.structure) return false;

    const spec = BUILDINGS[type];
    if (spec && spec.reqBiome) {
      if (spec.reqBiome === 'oasis') return cell.biome === 'oasis';
      return this.hasNearbyBiome(gx, gz, spec.reqBiome, 2);
    }

    if (type === 'pitch') return !cell.hasPitch && cell.elev <= 1.35;
    return cell.elev <= 1.80;
  }

  placePitch(gx, gz) {
    const cell = this.getCell(gx, gz);
    if (!cell || cell.hasPitch || cell.structure) return false;
    const wp = gridToWorld(gx, gz);
    const vg = new VoxelGrid(7, 1, 7);
    for (let z = 0; z < 7; z++) {
      for (let x = 0; x < 7; x++) {
        if ((x === 0 || x === 6) && (z === 0 || z === 6)) continue;
        vg.set(x, 0, z, 0x262134, 0.03, false, VMAT.PITCH);
      }
    }
    const m = vg.buildMeshGroup(0.132, { x: -0.5, y: 0, z: -0.5 }, false, true, true);
    m.position.set(wp.x, cell.elev + 0.028, wp.z);
    this.scene.add(m);
    this.totalVoxelCount += 45;
    cell.hasPitch = true;
    cell.pitchMesh = m;
    this.clearFloraAtCell(gx, gz);
    return true;
  }

  ignitePitchAt(gx, gz) {
    const cell = this.getCell(gx, gz);
    if (!cell || !cell.hasPitch || cell.fireTimer > 0) return false;
    cell.fireTimer = 12.0;
    const wp = gridToWorld(gx, gz);
    const fireGroup = new THREE.Group();
    fireGroup.position.set(wp.x, cell.elev, wp.z);

    const fOuter = new THREE.Mesh(boxGeo, this.mats.fireOuter);
    fOuter.scale.set(0.84, 0.65, 0.84);
    fOuter.position.y = 0.32;
    const fMid = new THREE.Mesh(boxGeo, this.mats.fireMid);
    fMid.scale.set(0.55, 1.15, 0.55);
    fMid.position.y = 0.58;
    const fCore = new THREE.Mesh(boxGeo, this.mats.fireCore);
    fCore.scale.set(0.28, 0.85, 0.28);
    fCore.position.y = 0.45;
    fireGroup.add(fOuter, fMid, fCore);
    this.scene.add(fireGroup);

    cell.fireMesh = fireGroup;
    cell.hasPitch = false;
    if (cell.pitchMesh) {
      this.scene.remove(cell.pitchMesh);
      cell.pitchMesh = null;
    }
    this.pitchFires.push({ cell, gx, gz, spreadDelay: 0.14, spreadDone: false });
    return true;
  }

  placeStructure(type, gx, gz, team = 'player', freeInit = false, rotSteps = 0) {
    const normRot = ((rotSteps % 4) + 4) % 4;
    const cell = this.getCell(gx, gz);
    if (!cell) return null;
    if (!freeInit && !this.canPlace(type, gx, gz, normRot)) return null;

    let targetCells = [cell];
    let gateAxis = 'ns';
    if (type === 'gate') {
      const fp = this.resolveGateFootprint(gx, gz, team, freeInit, freeInit ? null : normRot);
      if (!fp) return null;
      targetCells = fp.cells;
      gateAxis = fp.axis;
      // Allow upgrading/cutting a 2-body-width Gatehouse straight into existing friendly walls!
      targetCells.forEach((tc) => {
        if (tc.structure && tc.structure.team === team && tc.structure.type === 'wall') {
          this.destroyStructure(tc.structure, true);
        }
      });
    }

    targetCells.forEach((tc) => {
      if (tc.hasPitch && tc.pitchMesh) {
        this.scene.remove(tc.pitchMesh);
        tc.hasPitch = false;
        tc.pitchMesh = null;
      }
      if (tc.rubbleMesh) {
        this.scene.remove(tc.rubbleMesh);
        tc.rubbleMesh = null;
      }
    });

    const spec = BUILDINGS[type];
    let posX = 0;
    let posZ = 0;
    let elev = -10;
    targetCells.forEach((tc) => {
      const twp = gridToWorld(tc.gx, tc.gz);
      posX += twp.x;
      posZ += twp.z;
      if (tc.elev > elev) elev = tc.elev;
    });
    posX /= targetCells.length;
    posZ /= targetCells.length;

    const group = prefabs.instantiate(type, team);
    group.position.set(posX, elev, posZ);
    if (type === 'gate') {
      const flip180 = normRot >= 2 ? Math.PI : 0;
      group.rotation.y = (gateAxis === 'ew' ? Math.PI * 0.5 : 0) + flip180;
    } else if (type !== 'wall') {
      group.rotation.y = normRot * (Math.PI * 0.5);
    }
    this.scene.add(group);
    this.layoutVersion++;

    const vCount = group.userData.voxelCount || 600;
    this.totalVoxelCount += vCount;

    if (group.userData.sails) {
      this.windmills.push(group.userData.sails);
    }

    const struct = {
      id: `${type}_${gx}_${gz}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      team,
      rotSteps: normRot,
      gx: targetCells[0].gx,
      gz: targetCells[0].gz,
      x: posX,
      y: elev,
      z: posZ,
      hp: spec.hp,
      maxHp: spec.hp,
      height: spec.height,
      voxelCount: vCount,
      mesh: group,
      gateLeaf: group.userData.gateLeaf || null,
      gateAxis,
      isOpen: false,
      garrison: [],
      maxGarrison: type === 'tower' ? 4 : (type === 'wall' ? 1 : 0),
      shootCooldown: 0,
      workerSpawned: false,
      oxSpawned: false,
      stagedStone: 0,
      cells: targetCells,
    };

    targetCells.forEach((tc) => {
      tc.structure = struct;
      this.clearFloraAtCell(tc.gx, tc.gz);
    });
    this.structures.push(struct);
    if (['wall', 'tower', 'gate', 'ballista'].includes(type)) {
      targetCells.forEach((tc) => this.refreshFortificationsAround(tc.gx, tc.gz));
    }
    return struct;
  }

  hasFortificationLink(struct, dx, dz) {
    const nc = this.getCell(struct.gx + dx, struct.gz + dz);
    if (!nc) return { link: false, step: false };
    if (
      nc.structure &&
      nc.structure.hp > 0 &&
      nc.structure.team === struct.team &&
      ['wall', 'tower', 'gate', 'ballista'].includes(nc.structure.type)
    ) {
      const diff = nc.structure.y - struct.y;
      return { link: true, step: diff >= 0.14 && diff <= 0.85 };
    }
    // Anchor curtain wall seamlessly into steep natural mountain rock cliffs!
    if (!nc.structure && nc.elev >= struct.y + 0.65) {
      return { link: true, step: true };
    }
    return { link: false, step: false };
  }

  refreshFortificationVisual(struct) {
    if (!struct || struct.hp <= 0 || !struct.mesh) return;

    if (struct.type === 'wall') {
      const n = this.hasFortificationLink(struct, 0, -1);
      const e = this.hasFortificationLink(struct, 1, 0);
      const s = this.hasFortificationLink(struct, 0, 1);
      const w = this.hasFortificationLink(struct, -1, 0);

      const mask = (n.link ? 1 : 0) | (e.link ? 2 : 0) | (s.link ? 4 : 0) | (w.link ? 8 : 0);
      const stepMask = (n.step ? 1 : 0) | (e.step ? 2 : 0) | (s.step ? 4 : 0) | (w.step ? 8 : 0);
      const variant = (struct.gx + struct.gz) & 1;
      const rotKey = mask === 0 ? ((struct.rotSteps || 0) % 4) : 0;
      const stateKey = `w_${mask}_${stepMask}_${variant}_r${rotKey}`;
      if (struct.fortStateKey === stateKey) return;
      struct.fortStateKey = stateKey;

      const fresh = prefabs.instantiateWall(struct.team, mask, stepMask, variant);
      struct.mesh.rotation.y = mask === 0 ? rotKey * (Math.PI * 0.5) : 0;
      const oldVox = struct.voxelCount || 0;
      const newVox = fresh.userData.voxelCount || 600;
      this.totalVoxelCount += newVox - oldVox;
      struct.voxelCount = newVox;

      while (struct.mesh.children.length > 0) {
        struct.mesh.remove(struct.mesh.children[0]);
      }
      while (fresh.children.length > 0) {
        struct.mesh.add(fresh.children[0]);
      }
      struct.mesh.userData.mainMesh = fresh.userData.mainMesh;
      struct.mesh.userData.voxelCount = newVox;
    } else if (struct.type === 'gate') {
      // Unified 2-tile Gatehouse orientation tracks its 2 cells + preserves 180° flip!
      const c0 = struct.cells[0];
      const c1 = struct.cells[1] || c0;
      const axis = c1.gx !== c0.gx ? 'ew' : 'ns';
      struct.gateAxis = axis;
      const flip180 = (struct.rotSteps || 0) >= 2 ? Math.PI : 0;
      struct.mesh.rotation.y = (axis === 'ew' ? Math.PI * 0.5 : 0) + flip180;
    }
  }

  refreshFortificationsAround(gx, gz) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const c = this.getCell(gx + dx, gz + dz);
        if (c && c.structure && (c.structure.type === 'wall' || c.structure.type === 'gate')) {
          this.refreshFortificationVisual(c.structure);
        }
      }
    }
  }

  getStructureHalfExtents(struct) {
    if (!struct) return { hx: 0.48, hz: 0.48 };
    if (struct.type === 'keep' || struct.type === 'stockpile') return { hx: 0.97, hz: 0.97 };
    if (struct.type === 'gate') {
      return struct.gateAxis === 'ew' ? { hx: 0.99, hz: 0.49 } : { hx: 0.49, hz: 0.99 };
    }
    if (struct.type === 'tower' || struct.type === 'ballista') return { hx: 0.52, hz: 0.52 };
    if (struct.type === 'wall') return { hx: 0.49, hz: 0.49 };
    return { hx: 0.48, hz: 0.48 };
  }

  getStructureHalfExtent(struct) {
    const { hx, hz } = this.getStructureHalfExtents(struct);
    return Math.max(hx, hz);
  }

  // Exact Euclidean distance from point (wx, wz) to the outer wall of a structure's AABB (0 if touching/inside)
  distanceToStructurePerimeter(wx, wz, struct) {
    if (!struct) return Infinity;
    if (struct.type === 'campfire') {
      return Math.max(0, Math.hypot(wx - struct.x, wz - struct.z) - 0.43);
    }
    const { hx, hz } = this.getStructureHalfExtents(struct);
    const dx = Math.max(0, Math.abs(wx - struct.x) - hx);
    const dz = Math.max(0, Math.abs(wz - struct.z) - hz);
    return Math.hypot(dx, dz);
  }

  // Finds a guaranteed walkable, obstacle-free doorway/perimeter point around a building for spawning or delivering!
  findClearApronPoint(struct, bodyRadius = 0.30, preferX = null, preferZ = null) {
    const { hx, hz } = this.getStructureHalfExtents(struct);
    const rx = hx + bodyRadius + 0.16;
    const rz = hz + bodyRadius + 0.16;
    const candidates = [
      [0, rz], [rx, 0], [0, -rz], [-rx, 0],
      [rx * 0.78, rz * 0.78], [-rx * 0.78, rz * 0.78],
      [rx * 0.78, -rz * 0.78], [-rx * 0.78, -rz * 0.78],
    ];
    let bestX = struct.x;
    let bestZ = struct.z + rz;
    let bestScore = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const tx = struct.x + candidates[i][0];
      const tz = struct.z + candidates[i][1];
      const g = worldToGrid(tx, tz);
      const c = this.getCell(g.gx, g.gz);
      if (!c || c.ground === 'water' || Math.abs(c.elev - struct.y) > 0.52) continue;
      if (c.structure && c.structure !== struct && c.structure.type !== 'stockpile' && c.structure.type !== 'campfire') continue;
      if (c.tree && c.tree.woodLeft > 0) continue;
      if (c.resourceNode) continue;

      const distPref = preferX !== null
        ? Math.hypot(tx - preferX, tz - preferZ)
        : (i === 0 ? 0 : i * 0.18);
      if (distPref < bestScore) {
        bestScore = distPref;
        bestX = tx;
        bestZ = tz;
      }
    }
    return { x: bestX, z: bestZ };
  }

  pushCircleFromAABB(ent, minX, maxX, minZ, maxZ, radius) {
    const cx = Math.max(minX, Math.min(ent.x, maxX));
    const cz = Math.max(minZ, Math.min(ent.z, maxZ));
    let dx = ent.x - cx;
    let dz = ent.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) return;

    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = radius - d;
      ent.x += (dx / d) * push;
      ent.z += (dz / d) * push;
    } else {
      // Center is strictly inside AABB: escape out nearest face!
      const midX = (minX + maxX) * 0.5;
      const midZ = (minZ + maxZ) * 0.5;
      const halfX = (maxX - minX) * 0.5;
      const halfZ = (maxZ - minZ) * 0.5;
      const ox = halfX + radius - Math.abs(ent.x - midX);
      const oz = halfZ + radius - Math.abs(ent.z - midZ);
      if (ox < oz) {
        ent.x = ent.x >= midX ? maxX + radius : minX - radius;
      } else {
        ent.z = ent.z >= midZ ? maxZ + radius : minZ - radius;
      }
    }
  }

  pushCircleFromCircle(ent, cx, cz, obsR, entR) {
    let dx = ent.x - cx;
    let dz = ent.z - cz;
    const minDist = obsR + entR;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minDist * minDist) return;
    let d = Math.sqrt(d2);
    if (d < 1e-4) {
      dx = 0.04;
      dz = 0.04;
      d = Math.hypot(dx, dz);
    }
    const push = minDist - d;
    ent.x += (dx / d) * push;
    ent.z += (dz / d) * push;
  }

  /**
   * O(1) Local 5x5 Grid Hard Depenetration Solver:
   * Resolves Circle-vs-AABB & Circle-vs-Circle collisions against ALL Buildings, Gate Piers,
   * Campfire Hearth, Stockpile Pallets, Trees, Boulders, Deep Water & Steep Cliffs!
   */
  projectOutOfObstacles(ent, radius, team = 'player') {
    this._projVisitId = (this._projVisitId || 0) + 1;
    const visitId = this._projVisitId;

    const cg = worldToGrid(ent.x, ent.z);
    const curCell = this.getCell(cg.gx, cg.gz);
    const footElev = (curCell && curCell.ground !== 'water') ? curCell.elev : (ent.y || 0);
    const terrainClearance = Math.min(radius, 0.35);

    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const nx = cg.gx + dx;
        const nz = cg.gz + dz;
        const nc = this.getCell(nx, nz);
        if (!nc) continue;
        const wp = gridToWorld(nx, nz);

        // 1. Impassable Terrain Colliders (Deep River Water & Unclimbable Mountain Cliff Steps!)
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && (dx !== 0 || dz !== 0)) {
          const isWater = nc.ground === 'water';
          const isSteepCliff = !isWater && Math.abs(nc.elev - footElev) > 0.52;
          if (isWater || isSteepCliff) {
            this.pushCircleFromAABB(
              ent,
              wp.x - 0.5,
              wp.x + 0.5,
              wp.z - 0.5,
              wp.z + 0.5,
              terrainClearance
            );
          }
        }

        // 2. Living Tree Trunk Collider
        if (nc.tree && nc.tree.woodLeft > 0) {
          this.pushCircleFromCircle(ent, nc.tree.x, nc.tree.z, 0.27, radius);
        }

        // 3. Geological Boulder Outcrop Collider
        if (nc.resourceNode) {
          this.pushCircleFromCircle(ent, nc.resourceNode.x, nc.resourceNode.z, 0.43, radius);
        }

        // 4. All Structure Colliders (NEVER bypassed — units stay strictly outside building walls!)
        const s = nc.structure;
        if (!s || s.hp <= 0 || s._projVisit === visitId) continue;
        s._projVisit = visitId;

        if (s.type === 'campfire') {
          this.pushCircleFromCircle(ent, s.x, s.z, 0.42, radius);
        } else if (s.type === 'stockpile') {
          if (this.stockpileVisuals && this.stockpileVisuals.children.length > 0) {
            const pOff = [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]];
            for (let k = 0; k < 4; k++) {
              const px = s.x + pOff[k][0];
              const pz = s.z + pOff[k][1];
              this.pushCircleFromAABB(ent, px - 0.24, px + 0.24, pz - 0.24, pz + 0.24, radius * 0.85);
            }
          }
        } else if (s.type === 'gate' && (s.isOpen || s.team === team)) {
          // Open / friendly 2-Tile Gatehouse: outer 0.24m piers leave a wide 1.52m (>2 body-widths!) central passage!
          const axis = s.gateAxis || 'ns';
          const pierW = 0.24;
          if (axis === 'ns') {
            this.pushCircleFromAABB(ent, s.x - 0.48, s.x + 0.48, s.z - 1.00, s.z - 1.00 + pierW, radius * 0.85);
            this.pushCircleFromAABB(ent, s.x - 0.48, s.x + 0.48, s.z + 1.00 - pierW, s.z + 1.00, radius * 0.85);
          } else {
            this.pushCircleFromAABB(ent, s.x - 1.00, s.x - 1.00 + pierW, s.z - 0.48, s.z + 0.48, radius * 0.85);
            this.pushCircleFromAABB(ent, s.x + 1.00 - pierW, s.x + 1.00, s.z - 0.48, s.z + 0.48, radius * 0.85);
          }
        } else {
          const { hx, hz } = this.getStructureHalfExtents(s);
          this.pushCircleFromAABB(ent, s.x - hx, s.x + hx, s.z - hz, s.z + hz, radius);
        }
      }
    }

    ent.x = THREE.MathUtils.clamp(ent.x, -GRID_W * 0.5 + 1.2, GRID_W * 0.5 - 1.2);
    ent.z = THREE.MathUtils.clamp(ent.z, -GRID_H * 0.5 + 1.2, GRID_H * 0.5 - 1.2);
  }

  damageStructure(struct, dmg) {
    if (!struct || struct.hp <= 0) return;
    struct.hp -= dmg;
    if (Math.random() < 0.65) {
      const col = struct.team === 'enemy' ? 0x596273 : 0xe6ded0;
      this.debris.burst(struct.x, struct.y + struct.height * 0.55, struct.z, col, 6, 0.85, 0.14);
    }
    if (struct.hp <= 0) {
      this.destroyStructure(struct);
    }
  }

  destroyStructure(struct, isDemolish = false) {
    struct.hp = 0;
    if (this.onStructureDestroyed) {
      this.onStructureDestroyed(struct, isDemolish);
    }
    this.scene.remove(struct.mesh);
    this.layoutVersion++;
    this.totalVoxelCount = Math.max(0, this.totalVoxelCount - (struct.voxelCount || 500));

    if (struct.garrison && struct.garrison.length) {
      struct.garrison.forEach((u) => {
        u.garrisonWall = null;
        u.pendingGarrisonWall = null;
      });
      struct.garrison = [];
    }

    if (!isDemolish) {
      const col = struct.team === 'enemy' ? 0x596273 : 0xe6ded0;
      this.debris.burst(struct.x, struct.y + struct.height * 0.6, struct.z, col, 32, 1.35, 0.16);
    }

    const freedCoords = [];
    struct.cells.forEach((c) => {
      c.structure = null;
      freedCoords.push({ gx: c.gx, gz: c.gz });
      if (!isDemolish && ['wall', 'tower', 'gate'].includes(struct.type)) {
        const wp = gridToWorld(c.gx, c.gz);
        const rg = new VoxelGrid(8, 3, 8);
        const rCol = struct.team === 'enemy' ? 0x454d5c : 0xc9bfb0;
        for (let z = 0; z < 8; z++) {
          for (let x = 0; x < 8; x++) {
            const h = Math.floor(voxelHash(x, c.gx, z, c.gz) * 3);
            for (let y = 0; y < h; y++) rg.set(x, y, z, rCol, 0.04, false, VMAT.ASHLAR);
          }
        }
        const rubble = rg.buildMeshGroup(0.124, { x: -0.5, y: 0, z: -0.5 }, true, true, true);
        rubble.position.set(wp.x, c.elev + 0.02, wp.z);
        this.scene.add(rubble);
        c.rubbleMesh = rubble;
      }
    });

    if (struct.mesh && struct.mesh.userData && struct.mesh.userData.sails) {
      const wIdx = this.windmills.indexOf(struct.mesh.userData.sails);
      if (wIdx !== -1) this.windmills.splice(wIdx, 1);
    }
    const idx = this.structures.indexOf(struct);
    if (idx !== -1) this.structures.splice(idx, 1);
    if (['wall', 'tower', 'gate', 'ballista'].includes(struct.type)) {
      freedCoords.forEach(({ gx, gz }) => this.refreshFortificationsAround(gx, gz));
    }
  }

  showBuildGhost(type, coords, rotSteps = 0) {
    while (this.ghostGroup.children.length > 0) {
      this.ghostGroup.remove(this.ghostGroup.children[0]);
    }
    if (!type || !coords.length) return;
    const normRot = ((rotSteps % 4) + 4) % 4;
    const h = Math.max(0.25, BUILDINGS[type]?.height || 1.0);

    if (type === 'gate') {
      const { gx, gz } = coords[0];
      const fp = this.resolveGateFootprint(gx, gz, 'player', false, normRot);
      const previewCells = fp ? fp.cells : [this.getCell(gx, gz)].filter(Boolean);
      const valid = Boolean(fp);
      const gMat = valid ? this.mats.ghostValid : this.mats.ghostInvalid;
      if (previewCells.length > 0) {
        let px = 0, pz = 0, elev = -10;
        previewCells.forEach((c) => {
          const wp = gridToWorld(c.gx, c.gz);
          px += wp.x;
          pz += wp.z;
          if (c.elev > elev) elev = c.elev;
          const pad = new THREE.Mesh(boxGeo, gMat);
          pad.scale.set(0.96, 0.08, 0.96);
          pad.position.set(wp.x, c.elev + 0.05, wp.z);
          this.ghostGroup.add(pad);
        });
        px /= previewCells.length;
        pz /= previewCells.length;
        const ghost = prefabs.instantiateGhost('gate', gMat);
        const axis = fp ? fp.axis : (normRot % 2 === 1 ? 'ew' : 'ns');
        const flip180 = normRot >= 2 ? Math.PI : 0;
        ghost.position.set(px, elev, pz);
        ghost.rotation.y = (axis === 'ew' ? Math.PI * 0.5 : 0) + flip180;
        this.ghostGroup.add(ghost);
      }
      return;
    }

    const useFull3DGhost = type !== 'pitch' && type !== 'demolish' && coords.length <= 8;
    coords.forEach(({ gx, gz }) => {
      const c = this.getCell(gx, gz);
      const elev = c ? c.elev : 0;
      const valid = this.canPlace(type, gx, gz, normRot);
      const gMat = valid ? this.mats.ghostValid : this.mats.ghostInvalid;
      const wp = gridToWorld(gx, gz);

      if (useFull3DGhost) {
        const pad = new THREE.Mesh(boxGeo, gMat);
        pad.scale.set(0.96, 0.08, 0.96);
        pad.position.set(wp.x, elev + 0.04, wp.z);
        this.ghostGroup.add(pad);

        const ghost = prefabs.instantiateGhost(type, gMat);
        ghost.position.set(wp.x, elev, wp.z);
        ghost.rotation.y = normRot * (Math.PI * 0.5);
        this.ghostGroup.add(ghost);
      } else {
        const m = new THREE.Mesh(boxGeo, gMat);
        const gh = type === 'demolish' ? 2.4 : (type === 'pitch' ? 0.16 : h);
        m.scale.set(0.96, gh, 0.96);
        m.position.set(wp.x, elev + gh * 0.5, wp.z);
        this.ghostGroup.add(m);
      }
    });
  }

  updateEnvironment(dt, units) {
    this.windmills.forEach((s) => { s.rotation.x += dt * 1.75; });
    const t = performance.now() * 0.011;

    this.trees.forEach((tr) => {
      if (tr.woodLeft <= 0) {
        tr.regrowTimer -= dt;
        if (tr.regrowTimer <= 0) {
          tr.woodLeft = 40;
          tr.mesh.visible = true;
          if (tr.stumpMesh) tr.stumpMesh.visible = false;
        }
      }
    });

    for (let i = this.pitchFires.length - 1; i >= 0; i--) {
      const pf = this.pitchFires[i];
      const cell = pf.cell;
      cell.fireTimer -= dt;

      if (cell.fireMesh) {
        cell.fireMesh.children[1].scale.y = 0.95 + Math.sin(t * 2.1 + pf.gx) * 0.35;
        cell.fireMesh.children[2].scale.y = 0.75 + Math.cos(t * 2.5 + pf.gz) * 0.25;
      }

      if (!pf.spreadDone) {
        pf.spreadDelay -= dt;
        if (pf.spreadDelay <= 0) {
          pf.spreadDone = true;
          [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]].forEach(([dx, dz]) => {
            this.ignitePitchAt(pf.gx + dx, pf.gz + dz);
          });
        }
      }

      const wp = gridToWorld(pf.gx, pf.gz);
      for (let uIdx = 0; uIdx < units.length; uIdx++) {
        const u = units[uIdx];
        if (u.hp <= 0 || u.garrisonWall || u.garrisonBuilding) continue;
        const dx = u.x - wp.x;
        const dz = u.z - wp.z;
        if (dx * dx + dz * dz < 0.9) {
          u.hp -= (u.isSiege ? 62 : 42) * dt;
        }
      }

      if (cell.fireTimer <= 0) {
        if (cell.fireMesh) {
          this.scene.remove(cell.fireMesh);
          cell.fireMesh = null;
        }
        this.pitchFires.splice(i, 1);
      }
    }
  }
}
