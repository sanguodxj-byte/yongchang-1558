import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PolyBuilder, VoxelGrid, VMAT, voxelHash, tintHex, getSharedVoxelMaterial } from './voxelEngine.js';
import { prefabs } from './voxelPrefabs.js';
import { buildRaiderHarbor } from './raiderHarbor.js';
import { createDioramaCloudSeaAndOcean, atmosphereTime } from './dioramaRenderer.js';
import { DIORAMA_LOOK } from './renderStyle.js';
import { YONGCHANG_MAP, MAP_BRIDGES, insideFort, bridgeAt, islandRadius,
  mapWaterAt, isMapRoad, isMapPlaza, isMapField, reservedForAccess } from './yongchangMap.js';

export const GRID_W = YONGCHANG_MAP.width;
export const GRID_H = YONGCHANG_MAP.height;
const T_SUB = 4;        // Four collision/shore samples per logical map cell.
const T_VOX = 0.25;     // 0.25m micro-voxel step

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export const BUILDINGS = {
  wall: {
    id: 'wall', name: '永昌花岗城墙', cat: 'castle', mode: 'line',
    cost: { stone: 2 }, hp: 380, height: 1.76,
    desc: '【考据：条石斜垒夹夯土】划线连续筑城，铳手登墙+25%射程',
  },
  tower: {
    id: 'tower', name: '永昌空心敌台', cat: 'castle', mode: 'single',
    cost: { stone: 10, wood: 4 }, hp: 700, height: 1.98,
    desc: '【考据：突出城垣双层敌楼】驻4名铳手，昼烟夜火射火箭引燃火壕',
  },
  gate: {
    id: 'gate', name: '重檐谯楼城门', cat: 'castle', mode: 'single',
    cost: { stone: 6, wood: 4 }, hp: 580, height: 1.85,
    desc: '【考据：迎川/环海双重铁闸】2身位石拱门洞，友军与炮车自由通行',
  },
  pitch: {
    id: 'pitch', name: '猛火油伏火壕', cat: 'castle', mode: 'line',
    cost: { oil: 1, gold: 4 }, hp: 999, height: 0.1,
    desc: '【明代守城火器】铺设猛火油硫磺槽，火箭或点【引燃】化作火海',
  },
  ballista: {
    id: 'ballista', name: '佛郎机火炮台', cat: 'castle', mode: 'single',
    cost: { wood: 12, stone: 8, gold: 35 }, hp: 480, height: 2.15,
    desc: '【明代铜铸子母火炮】八角石台360°轰击倭寇大筒车与旱船槌',
  },
  woodcutter: {
    id: 'woodcutter', name: '楠竹松木作坊', cat: 'econ', mode: 'single',
    cost: { wood: 6 }, hp: 190, height: 1.4,
    desc: '社火乡民上岗：入林伐竹木→回坊锯杉板→送入营造场',
  },
  quarry: {
    id: 'quarry', name: '大罗山采石场', cat: 'econ', mode: 'single',
    reqBiome: 'limestone',
    cost: { wood: 10 }, hp: 240, height: 1.6,
    desc: '石匠持镐采石并运往可达堆放场；附近独立建造绑牛桩可增产',
  },
  stockpile: {
    id: 'stockpile', name: '营造物资堆放场', cat: 'econ', mode: 'single', footprint: [2, 2],
    cost: { wood: 8, stone: 4 }, hp: 280, height: 0.45,
    desc: '占地2×2；收存木、石、铁、油。工人选择可达的最近堆场，缩短运送路程',
  },
  oxPost: {
    id: 'oxPost', name: '水牛绑牛桩', cat: 'econ', mode: 'single', footprint: [2, 2],
    cost: { wood: 12, gold: 25 }, hp: 220, height: 0.85, boostRadius: 7,
    desc: '为7格内一座可达采石场提供牛车，石料产量+50%，每车运12石；同一石场不叠加',
  },
  farm: {
    id: 'farm', name: '江南水车稻田', cat: 'econ', mode: 'single',
    cost: { wood: 10 }, hp: 190, height: 1.2,
    desc: '【全陆地/堡内随处可建】收割金稻→水碓舂米→送入永昌义仓',
  },
  ironMine: {
    id: 'ironMine', name: '天工铁冶高炉', cat: 'econ', mode: 'single',
    reqBiome: 'iron',
    cost: { wood: 12, stone: 4 }, hp: 240, height: 1.5,
    desc: '【南麓赤铁矿旁】采掘铁矿→竖炉鼓风炼生铁锭→送入营造场',
  },
  pitchRig: {
    id: 'pitchRig', name: '猛火油熬制坊', cat: 'econ', mode: 'single',
    reqBiome: 'pitchBog',
    cost: { wood: 10 }, hp: 200, height: 1.4,
    desc: '【河湾油泉旁】舀取原浆→铁釜熬制封坛→送入营造场',
  },
  fletcher: {
    id: 'fletcher', name: '神机军器局', cat: 'military', mode: 'single',
    cost: { wood: 12, gold: 20 }, hp: 210, height: 1.5,
    desc: '赴营造场领竹木→回局精制鸟铳强弩→存入演武厅',
  },
  blacksmith: {
    id: 'blacksmith', name: '百炼甲仗锻局', cat: 'military', mode: 'single',
    cost: { wood: 14, stone: 8, gold: 30 }, hp: 250, height: 1.6,
    desc: '赴营造场领生铁→回炉锻打明光山文甲→存入演武厅',
  },
  hovel: {
    id: 'hovel', name: '江南粉墙民居', cat: 'econ', mode: 'single',
    cost: { wood: 8 }, hp: 180, height: 1.5,
    desc: '粉墙黛瓦小院，+8乡民上限，吸引四乡百姓归附社火坛',
  },
  demolish: {
    id: 'demolish', name: '拆建营造锤', cat: 'castle', mode: 'line',
    cost: {}, hp: 0, height: 0,
    desc: '拆除我方城防或工坊并返还50%竹木条石',
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
    this.maxTerrainHeight = 0.4;
    this.cellFloraRefs = new Map();
    this._zeroDummy = new THREE.Matrix4().makeScale(0, 0, 0);

    this.compileRealisticBasinTerrain();
    createDioramaCloudSeaAndOcean(this.scene, GRID_W, GRID_H, { eastOnly: true });
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

  // West mountain foothills descend to the coastal plain. The fortified town
  // occupies the plain; it is not an island encircled by invented ridgelines.
  evaluateRawElevation(fx, fz) {
    const macroN = fbm2D(fx * 0.065, fz * 0.065, 101);
    const midN = fbm2D(fx * 0.16, fz * 0.16, 203);
    const westRidge = 14 + Math.sin(fz * 0.09) * 2.5 + (macroN - 0.5) * 3;
    const mountain = 1 - smoothstep(westRidge - 5, westRidge + 10, fx);
    let h = 0.40 + mountain * (5.5 + midN * 5.5);
    if (fx > 22) h += (macroN - 0.45) * 0.12;
    const hydro = mapWaterAt(fx, fz);
    const bridge = bridgeAt(fx, fz);
    const road = isMapRoad(fx, fz);
    const plaza = isMapPlaza(fx, fz);
    const field = isMapField(fx, fz);
    if (insideFort(fx,fz,3) || road || plaza || field) h = 0.40;
    // Shore slopes into the eastern sea; the navigable supply road remains flat.
    if (fx > hydro.coast - 3 && !road && !plaza) h = 0.4 - smoothstep(hydro.coast-3,hydro.coast,fx)*0.32;
    if(hydro.island) {
      const radius=islandRadius(fx,fz);
      const ridge=Math.exp(-((fx-139)**2/20+(fz-38)**2/48))*2.4;
      h=0.4+ridge;
      if(road||plaza)h=0.4;
      else h=0.4+ridge*smoothstep(.57,.8,radius);
      if(radius>.88)h=THREE.MathUtils.lerp(h,.08,smoothstep(.88,1,radius));
    }
    if(bridge)h=0.4;
    if (hydro.water && !bridge) h = -0.64;
    return { h, isWater: hydro.water, bridge, road, plaza, field, macroN, midN,
      coast: hydro.coast, island:hydro.island,isFord:false };
  }

  sampleTopography(fx, fz) {
    const c = this.evaluateRawElevation(fx, fz);
    const hx = this.evaluateRawElevation(fx+0.5,fz).h - c.h;
    const hz = this.evaluateRawElevation(fx,fz+0.5).h - c.h;
    const slope = Math.hypot(hx,hz) / 0.5;
    let matType = 'upland_grass', biome = 'plains';
    if (c.bridge) { matType = 'bridge'; biome = 'road'; }
    else if (c.isWater) { matType = 'water'; biome = 'river'; }
    else if (c.road || c.plaza) { matType = 'dirt_road'; biome = 'road'; }
    else if (c.field) { matType = 'paddy'; biome = 'paddy'; }
    else if (Math.hypot(fx-21,fz-41)<3.3) { matType='limestone'; biome='limestone'; }
    else if (Math.hypot(fx-21,fz-63)<3.1) { matType='iron'; biome='iron'; }
    else if (Math.hypot(fx-81,fz-65)<2.5) { matType='pitchBog'; biome='pitchBog'; }
    else if(c.island) {
      if(c.h>1.1){matType='bedrock';biome='cliff';}
      else if(islandRadius(fx,fz)>.82){matType='river_sand';biome='beach';}
      else {matType='oasis';biome='oasis';}
    }
    else if (fx > c.coast - 3.5) { matType='river_sand'; biome='beach'; }
    else if (c.h > 2.35 || (slope > 0.52 && fx < 23)) {
      matType = c.h > 4 && slope < 0.48 ? 'alpine_grass' : 'bedrock'; biome='cliff';
    } else if (insideFort(fx,fz)) { matType='oasis'; biome='oasis'; }
    return { elev:c.bridge ? 0.4 : c.h, matType, biome, isBridge:!!c.bridge,
      isFord:false, slope, isWater:c.isWater, inPlaza:c.plaza };
  }

  compileRealisticBasinTerrain() {
    // Logical navigation and building data share the historical layout sampler.
    for (let gx = 0; gx < GRID_W; gx++) {
      this.cells[gx] = [];
      for (let gz = 0; gz < GRID_H; gz++) {
        const s = this.sampleTopography(gx + 0.5, gz + 0.5);
        const smoothElev = s.matType === 'water' ? -0.35 : Math.round(s.elev * 20) / 20;
        this.cells[gx][gz] = {
          gx,
          gz,
          elev: smoothElev,
          ground: s.matType === 'water' ? 'water' : s.matType,
          biome: s.biome,
          isBridge: s.isBridge,
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

    // Continuous height lookup and water mask, sized from the logical map.
    const totalSubX = GRID_W * T_SUB;
    const totalSubZ = GRID_H * T_SUB;
    const waterColumns = [];
    const waterMask = new Uint8Array(totalSubX * totalSubZ);
    this.subElev = new Float32Array(totalSubX * totalSubZ);

    for (let lz = 0; lz < totalSubZ; lz++) {
      const fz = (lz + 0.5) / T_SUB;
      for (let vx = 0; vx < totalSubX; vx++) {
        const fx = (vx + 0.5) / T_SUB;
        const s = this.sampleTopography(fx, fz);
        const idx = lz * totalSubX + vx;
        if (s.matType === 'water' || s.isBridge) {
          waterMask[idx] = 1;
          this.subElev[idx] = s.isBridge ? s.elev : -0.35;
          waterColumns.push({ vx, vz: lz });
        } else {
          this.subElev[idx] = s.elev;
        }
      }
    }

    // Three vertices per map unit preserve the existing terrain detail scale.
    const NX = GRID_W * 3;
    const NZ = GRID_H * 3;
    const stepX = GRID_W / NX;
    const stepZ = GRID_H / NZ;
    const vertPos = new Array((NX + 1) * (NZ + 1));
    const vertNorm = new Array((NX + 1) * (NZ + 1));
    const vertInfo = new Array((NX + 1) * (NZ + 1));

    for (let iz = 0; iz <= NZ; iz++) {
      for (let ix = 0; ix <= NX; ix++) {
        const fx = ix * stepX;
        const fz = iz * stepZ;
        const s = this.sampleTopography(Math.min(GRID_W - 0.01, fx), Math.min(GRID_H - 0.01, fz));
        const isEdge = ix === 0 || ix === NX || iz === 0 || iz === NZ;
        const inPlayerPlaza = s.inPlaza && insideFort(fx,fz);
        const inEnemyPlaza = s.inPlaza && !insideFort(fx,fz);
        // Straight stone embankments remain aligned with the water/bridge grid.
        const jitScale = (isEdge || fx > 22 || s.isBridge) ? 0.0 : 0.055;
        const jx = (voxelHash(ix, 11, iz, 307) - 0.5) * 2 * jitScale;
        const jz = (voxelHash(ix, 23, iz, 311) - 0.5) * 2 * jitScale;

        let vy = s.elev;
        if (s.matType === 'water' || s.isBridge) {
          vy = -0.64;
        }
        const wx = -GRID_W * 0.5 + fx + jx;
        const wz = -GRID_H * 0.5 + fz + jz;
        const vIdx = iz * (NX + 1) + ix;
        vertPos[vIdx] = [wx, vy, wz];
        this.maxTerrainHeight = Math.max(this.maxTerrainHeight,vy);
        vertInfo[vIdx] = { ...s, inPlayerPlaza, inEnemyPlaza };
      }
    }

    // Compute smooth central-difference vertex normals for natural rolling terrain!
    for (let iz = 0; iz <= NZ; iz++) {
      for (let ix = 0; ix <= NX; ix++) {
        const xm = Math.max(0, ix - 1), xp = Math.min(NX, ix + 1);
        const zm = Math.max(0, iz - 1), zp = Math.min(NZ, iz + 1);
        const pL = vertPos[iz * (NX + 1) + xm], pR = vertPos[iz * (NX + 1) + xp];
        const pD = vertPos[zm * (NX + 1) + ix], pU = vertPos[zp * (NX + 1) + ix];
        const dx = (pR[1] - pL[1]) / Math.max(0.1, pR[0] - pL[0]);
        const dz = (pU[1] - pD[1]) / Math.max(0.1, pU[2] - pD[2]);
        const nl = Math.hypot(-dx, 1.0, -dz) || 1;
        vertNorm[iz * (NX + 1) + ix] = [-dx / nl, 1.0 / nl, -dz / nl];
      }
    }

    const mixHex = (hA, hB, t) => {
      const rA = (hA >> 16) & 255, gA = (hA >> 8) & 255, bA = hA & 255;
      const rB = (hB >> 16) & 255, gB = (hB >> 8) & 255, bB = hB & 255;
      return (Math.round(rA + (rB - rA) * t) << 16) | (Math.round(gA + (gB - gA) * t) << 8) | Math.round(bA + (bB - bA) * t);
    };

    const pickTerrainSurface = (s, cx, cz, slopeY) => {
      const gxF = cx + GRID_W * 0.5;
      const gzF = cz + GRID_H * 0.5;
      const mTone = fbm2D(gxF * 0.25, gzF * 0.25, 733);
      if (s.matType === 'water' || s.isBridge) return { hex: 0x8f7e63, mat: VMAT.SAND };
      if (s.matType === 'paddy') return { hex: mTone > 0.48 ? 0x89905b : 0x7d8552, mat: VMAT.GRASS };

      // Smoothly feathered bluestone courtyard border (eliminates sawtooth triangle edges!)
      const pDistX = Math.max(42 - gxF, 0, gxF - 50);
      const pDistZ = Math.max(42 - gzF, 0, gzF - 48);
      const pEdge = Math.hypot(pDistX, pDistZ) + (mTone - 0.5) * 0.55;
      const plazaBlend = 1.0 - smoothstep(0.0, 1.35, pEdge);

      let base = { hex: mTone > 0.55 ? 0x73864b : (mTone < 0.40 ? 0x5f733e : 0x697d45), mat: VMAT.GRASS };
      if (s.inEnemyPlaza) base = { hex: mTone > 0.5 ? 0xa28f6b : 0x938360, mat: VMAT.SAND };
      else if (s.matType === 'pitchBog') base = { hex: mTone > 0.5 ? 0x6b6252 : 0x5d5547, mat: VMAT.SAND };
      else if (s.matType === 'limestone') base = { hex: mTone > 0.5 ? 0xa8a399 : 0x99948a, mat: VMAT.CLIFF };
      else if (s.matType === 'iron') base = { hex: mTone > 0.60 ? 0xa6653c : 0x78685c, mat: VMAT.CLIFF };
      else if (s.matType === 'ford' || s.matType === 'river_sand') {
        base = { hex: s.isFord ? (mTone > 0.5 ? 0xa89f90 : 0x999082) : 0xbdae8e, mat: VMAT.SAND };
      } else if (s.matType === 'dirt_road') {
        base = { hex: mTone > 0.45 ? 0xa79573 : 0x9d8d6c, mat: VMAT.SAND };
      } else if (slopeY < 0.80 || s.matType === 'bedrock') {
        if (slopeY > 0.90 && s.elev < 2.6) base = { hex: mTone > 0.5 ? 0x657842 : 0x6e8249, mat: VMAT.GRASS };
        else base = { hex: mTone > 0.55 ? 0x8a847b : (mTone < 0.38 ? 0x6e6962 : 0x7c776e), mat: VMAT.CLIFF };
      } else if (s.matType === 'oasis') {
        base = { hex: mTone > 0.52 ? 0x586f3b : 0x627a42, mat: VMAT.GRASS };
      } else if (s.matType === 'dry_steppe') {
        base = { hex: mTone > 0.5 ? 0xb5a484 : 0xa69678, mat: VMAT.SAND };
      } else if (s.matType === 'alpine_grass') {
        base = { hex: mTone > 0.5 ? 0x647842 : 0x596b3a, mat: VMAT.GRASS };
      }

      if (plazaBlend > 0.02 && slopeY > 0.85) {
        const pCol = mTone > 0.5 ? 0xb3a17e : 0xa69573;
        return {
          hex: mixHex(base.hex, pCol, plazaBlend),
          mat: plazaBlend > 0.48 ? VMAT.SAND : base.mat,
        };
      }
      return base;
    };

    // Shared vertex colours blend meadow, path and rock boundaries without
    // changing the height field or the build/navigation masks.
    const surfaceColors = vertInfo.map((info, i) => {
      const p = vertPos[i];
      return new THREE.Color(pickTerrainSurface(info, p[0], p[2], vertNorm[i][1]).hex);
    });
    const blendedColors = surfaceColors.map((color, i) => {
      const ix = i % (NX + 1), iz = Math.floor(i / (NX + 1));
      const blend = color.clone().multiplyScalar(14);
      let weight = 14;
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const x = ix + dx, z = iz + dz;
        if (x < 0 || x > NX || z < 0 || z > NZ) continue;
        blend.add(surfaceColors[z * (NX + 1) + x]);
        weight++;
      }
      return blend.multiplyScalar(1 / weight);
    });

    const pb = new PolyBuilder();
    for (let iz = 0; iz < NZ; iz++) {
      for (let ix = 0; ix < NX; ix++) {
        const i00 = iz * (NX + 1) + ix;
        const i10 = i00 + 1;
        const i01 = (iz + 1) * (NX + 1) + ix;
        const i11 = i01 + 1;

        const p00 = vertPos[i00], p10 = vertPos[i10], p01 = vertPos[i01], p11 = vertPos[i11];
        const n00 = vertNorm[i00], n10 = vertNorm[i10], n01 = vertNorm[i01], n11 = vertNorm[i11];
        const flipDiag = ((ix + iz) & 1) === 1;
        const tris = flipDiag
          ? [[p00, p01, p11, n00, n01, n11, vertInfo[i00]], [p00, p11, p10, n00, n11, n10, vertInfo[i10]]]
          : [[p00, p01, p10, n00, n01, n10, vertInfo[i00]], [p10, p01, p11, n10, n01, n11, vertInfo[i11]]];

        for (let t = 0; t < 2; t++) {
          const [a, b, c, na, nb, nc, sInfo] = tris[t];
          const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
          const bx = c[0] - a[0], by = c[1] - a[1], bz = c[2] - a[2];
          const nx = ay * bz - az * by;
          const ny = az * bx - ax * bz;
          const nz = ax * by - ay * bx;
          const slopeY = ny / (Math.hypot(nx, ny, nz) || 1);
          const cx = (a[0] + b[0] + c[0]) / 3;
          const cz = (a[2] + b[2] + c[2]) / 3;
          const surf = pickTerrainSurface(sInfo, cx, cz, slopeY);
          const jHex = tintHex(surf.hex, (voxelHash(ix * 2 + t, 5, iz, 911) - 0.5) * 0.032);
          // Smooth normals on gentle meadows & plazas; crisp rock cleavage on steep granite cliffs!
          if (slopeY > 0.83 && surf.mat !== VMAT.CLIFF) {
            pb.triSmooth(a, b, c, na, nb, nc, jHex, 1.0, 1.0, 1.0, false, surf.mat);
          } else {
            pb.tri(a, b, c, jHex, 1.0, 1.0, 1.0, false, surf.mat);
          }
        }
      }
    }

    // Shared corners use the same base colour with restrained face variation.
    // Keep the authored normals: cliffs remain faceted, meadows roll smoothly.
    for (let i = 0; i < pb.pos.length; i += 3) {
      const ix = Math.round((pb.pos[i] + GRID_W * 0.5) / stepX);
      const iz = Math.round((pb.pos[i + 2] + GRID_H * 0.5) / stepZ);
      const color = blendedColors[iz * (NX + 1) + ix];
      const face = Math.floor(i / 9);
      const mat = pb.mat[i / 3];
      const variation = mat === VMAT.CLIFF ? DIORAMA_LOOK.terrain.rockFacet
        : mat === VMAT.SAND ? DIORAMA_LOOK.terrain.sandFacet : DIORAMA_LOOK.terrain.grassFacet;
      const facet = 1 + (voxelHash(face, 3, 7, 911) - 0.5) * variation;
      pb.col[i] = color.r * facet;
      pb.col[i + 1] = color.g * facet;
      pb.col[i + 2] = color.b * facet;
    }

    // 4. Outer Diorama Island Faceted Granite Skirt (seals edges cleanly down to y = -1.3m!)
    const skirtY = -1.30;
    const skirtHex = 0x6b7580;
    for (let ix = 0; ix < NX; ix++) {
      const n0 = vertPos[ix], n1 = vertPos[ix + 1];
      pb.quad([n1[0], skirtY, n1[2]], [n0[0], skirtY, n0[2]], n0, n1, skirtHex, 0.72, 0.72, 0.94, 0.94);
      const s0 = vertPos[NZ * (NX + 1) + ix], s1 = vertPos[NZ * (NX + 1) + ix + 1];
      pb.quad([s0[0], skirtY, s0[2]], [s1[0], skirtY, s1[2]], s1, s0, skirtHex, 0.72, 0.72, 0.94, 0.94);
    }
    for (let iz = 0; iz < NZ; iz++) {
      const w0 = vertPos[iz * (NX + 1)], w1 = vertPos[(iz + 1) * (NX + 1)];
      pb.quad([w0[0], skirtY, w0[2]], [w1[0], skirtY, w1[2]], w1, w0, skirtHex, 0.72, 0.72, 0.94, 0.94);
      const e0 = vertPos[iz * (NX + 1) + NX], e1 = vertPos[(iz + 1) * (NX + 1) + NX];
      pb.quad([e1[0], skirtY, e1[2]], [e0[0], skirtY, e0[2]], e0, e1, skirtHex, 0.72, 0.72, 0.94, 0.94);
    }

    const terrainGroup = pb.buildMeshGroup(true, true);
    this.totalVoxelCount += pb.triCount;
    this.scene.add(terrainGroup);

    // 5. Seamless Animated Water Surface Mesh with Shoreline Foam!
    if (waterColumns.length > 0) {
      const wPos = [];
      const wNorm = [];
      const wShore = [];
      const wIdx = [];
      const wy = -0.32;
      const shoreDistance = Float32Array.from(waterMask, (water) => water ? 8 : 0);
      for (let z = 0; z < totalSubZ; z++) {
        for (let x = 0; x < totalSubX; x++) {
          const i = z * totalSubX + x;
          if (x > 0) shoreDistance[i] = Math.min(shoreDistance[i], shoreDistance[i - 1] + 1);
          if (z > 0) shoreDistance[i] = Math.min(shoreDistance[i], shoreDistance[i - totalSubX] + 1);
        }
      }
      for (let z = totalSubZ - 1; z >= 0; z--) {
        for (let x = totalSubX - 1; x >= 0; x--) {
          const i = z * totalSubX + x;
          if (x + 1 < totalSubX) shoreDistance[i] = Math.min(shoreDistance[i], shoreDistance[i + 1] + 1);
          if (z + 1 < totalSubZ) shoreDistance[i] = Math.min(shoreDistance[i], shoreDistance[i + totalSubX] + 1);
        }
      }
      const shoreAtCorner = (vx, vz) => {
        let sum = 0, count = 0;
        for (const dz of [-1, 0]) for (const dx of [-1, 0]) {
          const x = vx + dx, z = vz + dz;
          if (x < 0 || x >= totalSubX || z < 0 || z >= totalSubZ) continue;
          sum += shoreDistance[z * totalSubX + x];
          count++;
        }
        return 1 - smoothstep(0, 3.5, sum / Math.max(1, count));
      };
      waterColumns.forEach(({ vx, vz }, i) => {
        const x0 = -GRID_W / 2 + vx * T_VOX;
        const x1 = x0 + T_VOX;
        const z0 = -GRID_H / 2 + vz * T_VOX;
        const z1 = z0 + T_VOX;
        wPos.push(x0, wy, z1, x1, wy, z1, x1, wy, z0, x0, wy, z0);
        wNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
        const s01 = shoreAtCorner(vx, vz + 1);
        const s11 = shoreAtCorner(vx + 1, vz + 1);
        const s10 = shoreAtCorner(vx + 1, vz);
        const s00 = shoreAtCorner(vx, vz);
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
    }
  }

  initNaturalForestsDepositsAndCastles() {
    const map = YONGCHANG_MAP;
    this.playerKeep = this.buildGrandKeep(...map.playerKeep, 'player');
    this.buildCampfire(...map.campfire);
    this.buildStockpilePad(...map.stockpile);
    this.buildArmoryRack(...map.armory);
    this.buildGranary(...map.granary);
    this.buildVillageBridges();
    this.buildStartingVillage();

    this.enemyKeep = buildRaiderHarbor(this);
    for (const [kind, points] of Object.entries(map.deposits)) {
      for (const [x,z] of points) this.spawnDeposit(x,z,kind);
    }

    // 4. Multi-Species Organic Forest Groves (Spruce/Pine ridges, Silver Birch foothills, Broadleaf Oak woods, Weeping Willows by the river!)
    for (let x = 3; x < GRID_W - 4; x++) {
      for (let z = 3; z < GRID_H - 3; z++) {
        const c = this.cells[x][z];
        if (!c || c.structure || c.resourceNode || c.ground === 'water' || c.isFord || c.biome === 'road') continue;
        if (reservedForAccess(x+0.5,z+0.5)) continue;
        if (Math.hypot(x-map.enemyKeep[0],z-map.enemyKeep[1]) < 8) continue;
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
        } else if (c.biome === 'oasis' && groveNoise > 0.50 && jitter > 0.61) {
          this.spawnTree(x, z, jitter > 0.84 ? 'willow' : 'oak');
        }
      }
    }

    // 5. Lush Multi-Layer Dynamic Vegetation (Auto-clears whenever player builds over any cell!)
    this.initDioramaFlora();
  }

  buildVillageBridges() {
    const pb = new PolyBuilder();
    this.bridges = MAP_BRIDGES.map(b => ({ ...b, rect:[...b.rect] }));
    for (const b of this.bridges) {
      const [x0,z0,x1,z1]=b.rect;
      const x=(x0+x1)/2-GRID_W/2, z=(z0+z1)/2-GRID_H/2;
      const w=x1-x0, h=z1-z0;
      pb.boxY(x,0.24,z,w,0.16,h,0xb2a795,{matId:VMAT.COBBLE});
      // Low parapets leave at least 1.68 units of clear deck for 0.96-wide carts.
      for (const sign of [-1,1]) {
        if (b.axis==='x') {
          pb.boxY(x,0.4,z+sign*(h/2-0.07),w,0.22,0.14,0x9c9485,{matId:VMAT.ASHLAR});
          for (const off of [-w/2+0.12,w/2-0.12]) pb.boxY(x+off,0.4,z+sign*(h/2-0.08),0.24,0.38,0.24,0xc0b6a1,{matId:VMAT.ASHLAR});
        } else {
          pb.boxY(x+sign*(w/2-0.07),0.4,z,0.14,0.22,h,0x9c9485,{matId:VMAT.ASHLAR});
          for (const off of [-h/2+0.12,h/2-0.12]) pb.boxY(x+sign*(w/2-0.08),0.4,z+off,0.24,0.38,0.24,0xc0b6a1,{matId:VMAT.ASHLAR});
        }
      }
    }
    const bridgeMesh=pb.buildMeshGroup(true,true);
    bridgeMesh.name='Yongchang stone bridges'; this.scene.add(bridgeMesh); this.totalVoxelCount+=pb.triCount;
  }

  buildStartingVillage() {
    this.villageDwellings=[];
    for (const [x,z] of YONGCHANG_MAP.village.homes) {
      const c=this.getCell(x,z);
      if (!c || c.structure || c.ground==='water' || c.isBridge) {
        throw new Error(`Village dwelling overlaps terrain or another building: ${x},${z}`);
      }
      const wp=gridToWorld(x,z),mesh=prefabs.instantiate('hovel','player');
      mesh.position.set(wp.x,c.elev,wp.z);mesh.rotation.y=x<46?0:Math.PI;
      this.scene.add(mesh);
      const st={id:`dwelling_${x}_${z}`,type:'dwelling',label:'村民旧居',team:'player',gx:x,gz:z,
        x:wp.x,y:c.elev,z:wp.z,hp:220,maxHp:220,height:1.5,mesh,cells:[c],voxelCount:mesh.userData.voxelCount||500};
      this.totalVoxelCount+=st.voxelCount;
      c.structure=st;this.structures.push(st);this.villageDwellings.push(st);
    }
    for (const [x,z] of [[41,50],[50,36],[32,46]]) {
      const c=this.getCell(x,z);
      if(c && !c.structure && c.ground!=='water' && !isMapRoad(x+0.5,z+0.5)) this.spawnTree(x,z,'willow');
    }
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
    // Build a 3-blade tapered Low-Poly grass tuft geometry!
    const b1 = new THREE.ConeGeometry(0.028, 0.28, 4);
    b1.translate(0, 0.14, 0);
    const b2 = new THREE.ConeGeometry(0.025, 0.24, 4);
    b2.translate(0, 0.12, 0);
    b2.rotateZ(0.32);
    b2.rotateY(1.05);
    const b3 = new THREE.ConeGeometry(0.025, 0.22, 4);
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
        if (!c || c.structure || c.isFord || c.biome === 'road' || c.biome === 'paddy') continue;
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
        if (isMapPlaza(x+0.5,z+0.5)) continue;

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
              ? (k % 2 === 0 ? 0x577039 : 0x678044)
              : (k % 2 === 0 ? 0x667c43 : 0x7b8f4f);
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

    // 4. Batched Floating Jiangnan River Lotus Pads & Blossoms
    if (lilyTransforms.length > 0) {
      const padGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.024, 7);
      const padMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, flatShading: true });
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

    for (let x = 2; x <= YONGCHANG_MAP.buildLimitX; x++) {
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

  isBuildableSlope(gx, gz, maxStep = 0.72) {
    const c = this.getCell(gx, gz);
    if (!c) return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = this.getCell(gx + dx, gz + dz);
      if (nc && nc.ground !== 'water' && Math.abs(nc.elev - c.elev) > maxStep) return false;
    }
    return true;
  }

  isGateCellCandidate(gx, gz, team = 'player', freeInit = false) {
    if (!this.inBounds(gx, gz)) return false;
    if (!freeInit && (gx < 2 || gx > YONGCHANG_MAP.buildLimitX || gz < 2 || gz >= GRID_H - 2)) return false;
    const c = this.getCell(gx, gz);
    if (!c || c.ground === 'water' || c.biome === 'cliff' || c.isFord || c.isBridge || c.elev > 2.65) return false;
    if (!freeInit && !this.isBuildableSlope(gx, gz, 0.72)) return false;
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
    if (gx < 2 || gx > YONGCHANG_MAP.buildLimitX || gz < 2 || gz >= GRID_H - 2) return false;
    const cell = this.getCell(gx, gz);
    if (!cell || cell.ground === 'water' || cell.biome === 'cliff' || cell.isFord || cell.isBridge) return false;

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

    if (type === 'pitch') return !cell.hasPitch && cell.elev <= 1.85;
    if (['wall', 'tower', 'ballista'].includes(type)) {
      return cell.elev <= 2.95 && this.isBuildableSlope(gx, gz, 0.85);
    }
    return cell.elev <= 2.20 && this.isBuildableSlope(gx, gz, 0.65);
  }

  placePitch(gx, gz) {
    const cell = this.getCell(gx, gz);
    if (!cell || cell.hasPitch || cell.structure) return false;
    const wp = gridToWorld(gx, gz);
    const pb = new PolyBuilder();
    pb.prismY(0, 0, 0, 0.44, 0.40, 0.04, 8, 0x241f33);
    pb.boxY(0, 0.04, 0, 0.56, 0.02, 0.14, 0xfacc15); // Sulfur fuse powder streak!
    const m = pb.buildMeshGroup(false, true);
    m.position.set(wp.x, cell.elev + 0.015, wp.z);
    this.scene.add(m);
    this.totalVoxelCount += pb.triCount;
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

    const coneGeo = this._fireConeGeo || (this._fireConeGeo = new THREE.ConeGeometry(0.45, 1.0, 6));
    const fOuter = new THREE.Mesh(coneGeo, this.mats.fireOuter);
    fOuter.scale.set(0.95, 0.72, 0.95);
    fOuter.position.y = 0.34;
    const fMid = new THREE.Mesh(coneGeo, this.mats.fireMid);
    fMid.scale.set(0.66, 1.18, 0.66);
    fMid.position.y = 0.56;
    const fCore = new THREE.Mesh(coneGeo, this.mats.fireCore);
    fCore.scale.set(0.36, 0.90, 0.36);
    fCore.position.y = 0.44;
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
      const fp = this.resolveGateFootprint(gx, gz, team, freeInit, normRot);
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
      gateLeafL: group.userData.gateLeafL || null,
      gateLeafR: group.userData.gateLeafR || null,
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
    if(struct?.customAppearance)return;
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
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const c = this.getCell(gx + dx, gz + dz);
        if (c && c.structure && (c.structure.type === 'wall' || c.structure.type === 'gate')) {
          this.refreshFortificationVisual(c.structure);
        }
      }
    }
  }

  getStructureHalfExtents(struct) {
    if (!struct) return { hx: 0.48, hz: 0.48 };
    if (struct.halfExtents) return struct.halfExtents;
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
    // Bridge parapets and end posts use the same rectangles as their mesh.
    // The water mask alone cannot stop a shoulder clipping the low stone rail.
    for (const bridge of this.bridges) {
      const [gx0,gz0,gx1,gz1]=bridge.rect;
      const x0=gx0-GRID_W/2,x1=gx1-GRID_W/2,z0=gz0-GRID_H/2,z1=gz1-GRID_H/2;
      if(ent.x<x0-radius || ent.x>x1+radius || ent.z<z0-radius || ent.z>z1+radius)continue;
      if(bridge.axis==='x') {
        this.pushCircleFromAABB(ent,x0,x1,z0,z0+.14,radius);
        this.pushCircleFromAABB(ent,x0,x1,z1-.14,z1,radius);
      } else {
        this.pushCircleFromAABB(ent,x0,x0+.14,z0,z1,radius);
        this.pushCircleFromAABB(ent,x1-.14,x1,z0,z1,radius);
      }
      for(const x of [x0+.12,x1-.12]) for(const z of [z0+.08,z1-.08]) {
        this.pushCircleFromAABB(ent,x-.12,x+.12,z-.12,z+.12,radius);
      }
    }
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
        const rpb = new PolyBuilder();
        const rCol = struct.team === 'enemy' ? 0x454d5c : 0x8b959e;
        rpb.facetedBlob(-0.14, 0.08, 0.08, 0.24, 0.14, 0.22, rCol, c.gx * 7 + c.gz, 0.22);
        rpb.facetedBlob(0.16, 0.07, -0.10, 0.20, 0.12, 0.18, rCol, c.gx + c.gz * 13, 0.22);
        const rubble = rpb.buildMeshGroup(true, true);
        rubble.position.set(wp.x, c.elev + 0.01, wp.z);
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
