import * as THREE from 'three';
import {
  VoxelGrid,
  VMAT,
  getSharedVoxelMaterial,
  getSharedEmissiveMaterial,
} from './voxelEngine.js';
import { prefabs } from './voxelPrefabs.js';

const sharedBox = new THREE.BoxGeometry(1, 1, 1);

const stdCache = new Map();
function stdMat(hex, roughness = 0.78, metalness = 0.04) {
  const key = `${hex}_${roughness}_${metalness}`;
  if (!stdCache.has(key)) {
    stdCache.set(
      key,
      new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, flatShading: true })
    );
  }
  return stdCache.get(key);
}

// Geometry cache so spawning dozens of micro-voxel characters costs zero CPU!
const rigGeoCache = new Map();
function getCachedVoxelPart(cacheKey, builderFn) {
  if (!rigGeoCache.has(cacheKey)) {
    rigGeoCache.set(cacheKey, builderFn());
  }
  const entry = rigGeoCache.get(cacheKey);
  const group = new THREE.Group();
  if (entry.geo) {
    const m = new THREE.Mesh(entry.geo, getSharedVoxelMaterial());
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  if (entry.emissiveGeo) {
    const em = new THREE.Mesh(entry.emissiveGeo, getSharedEmissiveMaterial());
    em.userData.noOutline = true;
    group.add(em);
  }
  return group;
}

const V_CHAR = 0.036; // 3.6cm micro-voxel precision for crisp, zero-clipping characters!

function getRolePalette(role, isEnemy) {
  const primary = role === 'peasant'
    ? 0xc28e54
    : (isEnemy ? 0xc82828 : 0x2563eb);
  const secondary = role === 'peasant'
    ? 0x8c5e32
    : (isEnemy ? 0x7f1d1d : 0x1d4ed8);
  const armor = isEnemy ? 0x3b4454 : 0xdce5f0;
  const armorDark = isEnemy ? 0x252c38 : 0xaab8c8;
  const gold = isEnemy ? 0xf59e0b : 0xfacc15;
  return {
    skin: 0xf5c39e,
    skinShade: 0xe3aa82,
    primary,
    secondary,
    armor,
    armorDark,
    gold,
    leather: 0x543218,
    wood: 0x7c4d28,
    steel: 0xe2e8f0,
  };
}

// 1. Watertight Micro-Voxel Head + Helmet/Hat/Crown + 3D Eyes & Brows (Zero internal overlap!)
function buildHeadPart(role, isEnemy) {
  return getCachedVoxelPart(`head_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const vg = new VoxelGrid(12, 14, 12);
    const isHeavyHelm = role === 'swordsman' || role === 'knight';

    if (isHeavyHelm) {
      // Enclosed Crusader Great-Helm / Wolf Bascinet (x:2..9, y:0..7, z:2..9)
      vg.box(2, 0, 2, 9, 7, 9, pal.armor, 0.02, false, VMAT.METAL);
      vg.box(2, 0, 2, 9, 1, 9, pal.armorDark, 0.02, false, VMAT.METAL);
      // Dark eye slit carved into front visor (z=9) + raised brass cross on z=10
      vg.box(3, 4, 9, 8, 4, 9, 0x0f172a, 0.0, false, VMAT.METAL);
      vg.box(5, 1, 10, 6, 6, 10, pal.gold, 0.02, false, VMAT.METAL);
      vg.box(3, 3, 10, 8, 3, 10, pal.gold, 0.02, false, VMAT.METAL);

      if (role === 'knight') {
        // Sweeping feather plume cleanly atop helmet (y:8..12)
        vg.box(5, 8, 5, 6, 10, 7, pal.gold, 0.02, false, VMAT.METAL);
        vg.box(5, 10, 2, 6, 12, 7, pal.primary, 0.03, false, VMAT.ROOF);
        vg.box(5, 8, 1, 6, 10, 3, pal.primary, 0.03, false, VMAT.ROOF);
      }
    } else {
      // Sculpted Skin Head (x:2..9, y:0..6, z:2..9)
      vg.box(2, 0, 2, 9, 6, 9, pal.skin, 0.02, false, VMAT.SAND);
      // Hair / Neck back
      vg.box(2, 1, 2, 9, 6, 4, 0x5c3a21, 0.02, false, VMAT.TIMBER);

      // Crisp 2-voxel tall MC-Animation Eyes on z=9 & 3D Eyebrows on z=10 (clearly visible under helmets/hats!)
      const eyeColor = isEnemy ? 0xdc2626 : 0x1e3a8a;
      vg.box(3, 2, 9, 3, 3, 9, 0xffffff, 0, false, VMAT.ASHLAR);
      vg.box(4, 2, 9, 4, 3, 9, eyeColor, 0, false, VMAT.ROOF);
      vg.box(7, 2, 9, 7, 3, 9, eyeColor, 0, false, VMAT.ROOF);
      vg.box(8, 2, 9, 8, 3, 9, 0xffffff, 0, false, VMAT.ASHLAR);
      vg.box(3, 4, 10, 4, 4, 10, 0x452612, 0, false, VMAT.TIMBER);
      vg.box(7, 4, 10, 8, 4, 10, 0x452612, 0, false, VMAT.TIMBER);

      if (role === 'peasant') {
        // Wide woven straw sun-hat cleanly on y:6..9
        vg.box(0, 6, 0, 11, 6, 11, 0xe8bc48, 0.03, false, VMAT.SAND);
        vg.box(2, 7, 2, 9, 9, 9, 0xd4a230, 0.03, false, VMAT.SAND);
      } else if (role === 'archer' || role === 'spearman') {
        // Steel Kettle-Helm cleanly on y:6..9 (above y=4 eyebrows!)
        const capCol = isEnemy ? 0x6b1d1d : 0x64748b;
        vg.box(1, 6, 1, 10, 6, 10, pal.armorDark, 0.02, false, VMAT.METAL);
        vg.box(2, 7, 2, 9, 9, 9, capCol, 0.02, false, VMAT.METAL);
      } else if (role === 'lord') {
        // Royal Beard + Crown!
        vg.box(3, 0, 9, 8, 1, 10, isEnemy ? 0x1e293b : 0x92400e, 0.02, false, VMAT.TIMBER);
        if (!isEnemy) {
          // Golden Crusader King Crown (y:7..11)
          vg.box(2, 7, 2, 9, 8, 9, 0xfacc15, 0.02, false, VMAT.METAL);
          vg.set(5, 7, 9, 0xef4444, 0, true);
          vg.set(6, 7, 9, 0xef4444, 0, true);
          [[2, 2], [9, 2], [2, 9], [9, 9], [5, 9], [6, 9], [2, 5], [9, 5]].forEach(([cx, cz]) => {
            vg.box(cx, 9, cz, cx, 10, cz, 0xfde047, 0.01, false, VMAT.METAL);
          });
        } else {
          // Wolf Duke Obsidian Crown + Curved Horns (y:7..12)
          vg.box(2, 7, 2, 9, 8, 9, 0x1e293b, 0.02, false, VMAT.METAL);
          vg.box(5, 7, 9, 6, 8, 10, 0xef4444, 0, true);
          // Left & Right curved horns cleanly outside head (x:0..1 & x:10..11)
          vg.box(0, 8, 5, 1, 10, 6, 0x0f172a, 0.02, false, VMAT.METAL);
          vg.box(0, 10, 6, 0, 12, 7, 0x334155, 0.02, false, VMAT.METAL);
          vg.box(10, 8, 5, 11, 10, 6, 0x0f172a, 0.02, false, VMAT.METAL);
          vg.box(11, 10, 6, 11, 12, 7, 0x334155, 0.02, false, VMAT.METAL);
        }
      }
    }

    return vg.buildGeometry(V_CHAR, { x: -0.5, y: 0, z: -0.5 });
  });
}

// 2. Watertight Micro-Voxel Torso + Belt + Tabard + Quiver/Cape (Zero Z-fighting!)
function buildTorsoPart(role, isEnemy) {
  return getCachedVoxelPart(`torso_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    // Width x:0..7 = 8 * 0.036 = 0.288m (-0.144m .. +0.144m)
    const vg = new VoxelGrid(8, 9, 8);
    const isArmored = role === 'swordsman' || role === 'knight' || role === 'lord';
    const baseCol = isArmored ? pal.armor : pal.primary;
    const baseMat = isArmored ? VMAT.METAL : VMAT.ROOF;

    // Core chest (x:0..7, y:0..8, z:2..5)
    vg.box(0, 0, 2, 7, 8, 5, baseCol, 0.02, false, baseMat);

    // Heraldic Surcoat & Cross baked directly into front chest (z=5) — zero overlap!
    if (role !== 'peasant') {
      vg.box(2, 2, 5, 5, 8, 5, pal.primary, 0.02, false, VMAT.ROOF);
      if (!isEnemy) {
        vg.box(3, 3, 5, 4, 7, 5, 0xffffff, 0.01, false, VMAT.ASHLAR);
        vg.box(2, 5, 5, 5, 6, 5, 0xffffff, 0.01, false, VMAT.ASHLAR);
      } else {
        vg.box(3, 4, 5, 4, 6, 5, pal.gold, 0.01, false, VMAT.METAL);
      }
    }

    // Leather Belt + Brass Buckle baked into y:0..1
    vg.box(0, 0, 2, 7, 1, 5, pal.leather, 0.02, false, VMAT.TIMBER);
    vg.box(3, 0, 6, 4, 1, 6, pal.gold, 0.01, false, VMAT.METAL);

    // Archer Quiver + Feathered Arrows baked onto back (z:0..1)
    if (role === 'archer') {
      vg.box(4, 2, 0, 6, 7, 1, pal.leather, 0.02, false, VMAT.TIMBER);
      vg.set(4, 8, 0, 0xffffff, 0, false, VMAT.ASHLAR);
      vg.set(6, 8, 1, 0xffffff, 0, false, VMAT.ASHLAR);
    }

    // Lord Flowing Royal Cloak baked onto back (z:0..1)
    if (role === 'lord') {
      vg.box(0, 0, 1, 7, 8, 1, pal.primary, 0.02, false, VMAT.ROOF);
      vg.box(0, 7, 1, 7, 8, 1, 0xf8fafc, 0.02, false, VMAT.ASHLAR);
      vg.box(0, 0, 0, 7, 2, 0, pal.secondary, 0.02, false, VMAT.ROOF);
    }

    return vg.buildGeometry(V_CHAR, { x: -0.5, y: 0, z: -0.5 });
  });
}

// 3. Hip-Pivoted Leg (Top of thigh is y=-0.018 below hip socket so swinging NEVER touches belt!)
function buildLegPart(role, isEnemy) {
  return getCachedVoxelPart(`leg_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const vg = new VoxelGrid(3, 7, 4);
    const isArmored = role === 'swordsman' || role === 'knight' || role === 'lord';
    const legCol = role === 'peasant' ? 0x6e4b30 : (isArmored ? pal.armorDark : 0x475569);
    const legMat = isArmored ? VMAT.METAL : VMAT.TIMBER;

    // Thigh & Shin (x:0..2, y:2..6, z:0..2)
    vg.box(0, 2, 0, 2, 6, 2, legCol, 0.02, false, legMat);
    // Boot + forward toe (y:0..1, z:0..3)
    vg.box(0, 0, 0, 2, 1, 3, pal.leather, 0.02, false, VMAT.TIMBER);

    // Pivot at top of leg (y = -1.05 -> mesh spans -0.265 .. -0.013 downward from hip to ground y=0!)
    return vg.buildGeometry(V_CHAR, { x: -0.5, y: -1.05, z: -0.38 });
  });
}

// 4. Right Arm + Integrated Non-Clipping Weapon in ONE VoxelGrid!
// All voxels live at local x >= 0 (world x >= +0.156m > torso +0.144m), so 360° X-swing NEVER clips torso/head!
function buildRightArmPart(role, isEnemy) {
  return getCachedVoxelPart(`rarm_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const isArmored = role === 'swordsman' || role === 'knight' || role === 'lord';
    // Grid: x:0..5, y:0..24, z:0..22; Arm itself sits at x:0..2, y:4..11, z:3..5 (shoulder at y=10, z=4)
    const vg = new VoxelGrid(6, 26, 24);

    // Forearm & Sleeve (x:0..2, y:5..10, z:3..5) + Skin/Gauntlet Fist (y:4, z:3..5)
    const sleeveCol = role === 'peasant' ? pal.skin : (isArmored ? pal.armor : pal.primary);
    vg.box(0, 5, 3, 2, 10, 5, sleeveCol, 0.02, false, isArmored ? VMAT.METAL : VMAT.ROOF);
    vg.box(0, 4, 3, 2, 4, 5, isArmored ? pal.armorDark : pal.skin, 0.02, false, isArmored ? VMAT.METAL : VMAT.SAND);

    if (isArmored) {
      // Shoulder pauldron cap extending outward (x:0..3, y:9..11, z:2..6) — inner face stays at x=0!
      vg.box(0, 9, 2, 3, 11, 6, pal.armor, 0.02, false, VMAT.METAL);
      vg.box(3, 9, 3, 3, 10, 5, pal.gold, 0.01, false, VMAT.METAL);
    }

    // Weapons sculpted cleanly in front/outside of fist (z >= 6 or x >= 3) — ZERO arm/body intersection!
    if (role === 'spearman') {
      // Long wooden pike held cleanly on outer side of fist (x=3, z:0..21, angled upward)
      for (let s = 0; s < 19; s++) {
        const py = 2 + Math.floor(s * 0.55);
        const pz = 1 + s;
        vg.set(3, py, pz, pal.wood, 0.02, false, VMAT.TIMBER);
        vg.set(3, py + 1, pz, pal.wood, 0.02, false, VMAT.TIMBER);
      }
      // Gleaming steel spearhead at tip
      vg.box(3, 12, 20, 3, 14, 22, pal.steel, 0.01, false, VMAT.METAL);
    } else if (role === 'archer') {
      // Curved Yew Longbow held cleanly in front of fist (x=1, z:6..10, y:0..11)
      vg.box(1, 3, 6, 1, 7, 7, pal.wood, 0.02, false, VMAT.TIMBER);
      vg.box(1, 1, 5, 1, 3, 6, pal.wood, 0.02, false, VMAT.TIMBER);
      vg.box(1, 7, 5, 1, 9, 6, pal.wood, 0.02, false, VMAT.TIMBER);
      // Bowstring
      vg.box(1, 2, 4, 1, 8, 4, 0xe2e8f0, 0.0, false, VMAT.ASHLAR);
    } else if (isArmored) {
      // Broadsword / Greatsword / Knight Lance-Sword extending strictly forward-upward from fist (z >= 6)!
      // Pommel at z=2 (behind fist z=3..5), Hilt grip inside fist, Crossguard at z=6, Blade at z=7..20!
      vg.set(1, 4, 2, pal.gold, 0.01, false, VMAT.METAL);
      vg.box(1, 2, 6, 1, 6, 6, pal.gold, 0.01, false, VMAT.METAL); // Crossguard
      const bladeLen = role === 'knight' ? 15 : (role === 'lord' ? 13 : 11);
      const bladeCol = (isEnemy && role === 'lord') ? 0xef4444 : pal.steel;
      for (let b = 0; b < bladeLen; b++) {
        const by = 4 + Math.floor(b * 0.65);
        const bz = 7 + b;
        if (by < 25 && bz < 23) {
          vg.box(1, by, bz, 1, Math.min(25, by + 1), bz, bladeCol, 0.01, false, VMAT.METAL);
        }
      }
    }

    // Shoulder joint at x=0 (inner face), y=-10/26 (arm hangs downward!), z=-4.5/24
    return vg.buildGeometry(V_CHAR, { x: 0.0, y: -10 / 26, z: -4.5 / 24 });
  });
}

// 5. Left Arm + Integrated Non-Clipping Heater Shield in ONE VoxelGrid!
// All voxels live at local x <= 0 (world x <= -0.156m < torso -0.144m), so swinging NEVER clips torso!
function buildLeftArmPart(role, isEnemy) {
  return getCachedVoxelPart(`larm_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const isArmored = role === 'swordsman' || role === 'knight' || role === 'lord';
    // Grid x:0..5 where x=5 is inner shoulder face (pivot x = -1.0 -> local x spans -0.216 .. 0.0)
    const vg = new VoxelGrid(6, 14, 12);

    // Forearm at x:3..5, y:3..8, z:4..6 + Fist at y:2
    const sleeveCol = role === 'peasant' ? pal.skin : (isArmored ? pal.armor : pal.primary);
    vg.box(3, 3, 4, 5, 8, 6, sleeveCol, 0.02, false, isArmored ? VMAT.METAL : VMAT.ROOF);
    vg.box(3, 2, 4, 5, 2, 6, isArmored ? pal.armorDark : pal.skin, 0.02, false, isArmored ? VMAT.METAL : VMAT.SAND);

    if (isArmored) {
      // Shoulder pauldron cap extending outward (x:2..5, y:7..9, z:3..7)
      vg.box(2, 7, 3, 5, 9, 7, pal.armor, 0.02, false, VMAT.METAL);
      vg.box(2, 7, 4, 2, 8, 6, pal.gold, 0.01, false, VMAT.METAL);

      // Curved Heater Shield mounted strictly OUTSIDE forearm at x:0..1 (z:2..9, y:0..8)!
      vg.box(1, 2, 2, 1, 8, 9, pal.primary, 0.02, false, VMAT.ROOF);
      vg.box(1, 0, 4, 1, 1, 7, pal.primary, 0.02, false, VMAT.ROOF); // Pointed shield tip
      vg.box(2, 4, 4, 2, 5, 6, pal.leather, 0.02, false, VMAT.TIMBER); // Shield strap to forearm
      // Raised Heraldic Cross / Wolf Boss on outer shield face x=0
      if (!isEnemy) {
        vg.box(0, 1, 5, 0, 7, 6, pal.gold, 0.01, false, VMAT.METAL);
        vg.box(0, 4, 3, 0, 5, 8, pal.gold, 0.01, false, VMAT.METAL);
      } else {
        vg.box(0, 3, 4, 0, 6, 7, pal.gold, 0.01, false, VMAT.METAL);
      }
    }

    // Shoulder joint at x=-1.0 (inner face), y=-9/14 (arm & shield hang downward!), z=-5.5/12
    return vg.buildGeometry(V_CHAR, { x: -1.0, y: -9 / 14, z: -5.5 / 12 });
  });
}

// 6. Watertight Micro-Voxel Warhorse Body + Armored Barding + Saddle + Neck/Head!
function buildWarhorseBodyPart(isEnemy) {
  return getCachedVoxelPart(`horse_body_${isEnemy ? 'e' : 'p'}`, () => {
    const coat = isEnemy ? 0x2a2421 : 0xf8fafc;
    const mane = isEnemy ? 0x111111 : 0xdbe4ee;
    const cloth = isEnemy ? 0xb91c1c : 0x2563eb;
    const trim = 0xfacc15;
    // Grid: 8 wide (x:0..7 -> 0.32m wide = -0.16m .. +0.16m), 18 tall, 22 long (V = 0.040m)
    const vg = new VoxelGrid(8, 18, 22);

    // Horse barrel (x:1..6, y:2..7, z:3..16) & central saddlecloth barding (x:0..7, y:1..6, z:7..13 between front/rear legs!)
    vg.box(1, 2, 3, 6, 7, 16, coat, 0.02, false, VMAT.ASHLAR);
    vg.box(0, 1, 7, 7, 6, 13, cloth, 0.02, false, VMAT.ROOF);
    vg.box(0, 1, 7, 7, 1, 13, trim, 0.02, false, VMAT.METAL); // Golden barding hem
    // Leather Saddle seat at y=8 (world y = 0.28 + 8*0.04 = 0.60m!)
    vg.box(1, 7, 8, 6, 8, 13, 0x5c3618, 0.02, false, VMAT.TIMBER);

    // Stepped Sculpted Neck & Armored Chamfron Head (z:14..21, y:6..15) — zero rotated box clipping!
    vg.box(2, 6, 15, 5, 11, 18, coat, 0.02, false, VMAT.ASHLAR);
    vg.box(2, 10, 16, 5, 14, 20, coat, 0.02, false, VMAT.ASHLAR);
    vg.box(2, 10, 19, 5, 12, 21, coat, 0.02, false, VMAT.ASHLAR); // Muzzle
    // Steel Chamfron faceplate + ears + mane
    vg.box(2, 12, 18, 5, 14, 21, isEnemy ? 0x334155 : 0xdbe4ee, 0.02, false, VMAT.METAL);
    vg.set(2, 15, 17, coat, 0.02, false, VMAT.ASHLAR);
    vg.set(5, 15, 17, coat, 0.02, false, VMAT.ASHLAR);
    vg.box(3, 8, 14, 4, 14, 15, mane, 0.02, false, VMAT.ASHLAR);

    // Flowing Tail cleanly behind rump (z:0..2, y:2..6)
    vg.box(3, 4, 2, 4, 6, 3, mane, 0.02, false, VMAT.ASHLAR);
    vg.box(3, 1, 0, 4, 4, 2, mane, 0.02, false, VMAT.ASHLAR);

    return vg.buildGeometry(0.040, { x: -0.5, y: 0, z: -0.5 });
  });
}

function buildHorseLegPart(isEnemy) {
  return getCachedVoxelPart(`horse_leg_${isEnemy ? 'e' : 'p'}`, () => {
    const coat = isEnemy ? 0x2a2421 : 0xe2e8f0;
    const vg = new VoxelGrid(2, 8, 2);
    vg.box(0, 2, 0, 1, 7, 1, coat, 0.02, false, VMAT.ASHLAR);
    vg.box(0, 0, 0, 1, 1, 1, 0x1e293b, 0.02, false, VMAT.METAL); // Iron hoof
    return vg.buildGeometry(0.040, { x: -0.5, y: -1.0, z: -0.5 });
  });
}

export function createVoxelHumanoid(role = 'peasant', team = 'player') {
  const root = new THREE.Group();
  const isEnemy = team === 'enemy';
  const scale = role === 'lord' ? 1.38 : 0.98;

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  let horseGroup = null;
  if (role === 'knight') {
    horseGroup = new THREE.Group();
    const horseBody = buildWarhorseBodyPart(isEnemy);
    horseBody.position.set(0, 0.28, 0);
    horseGroup.add(horseBody);

    // 4 Warhorse legs naturally beneath shoulders & hindquarters (y=0.33 < barrel bottom 0.36 -> zero clipping!)
    const legs = [];
    [[-0.11, 0.22], [0.11, 0.22], [-0.11, -0.24], [0.11, -0.24]].forEach(([lx, lz]) => {
      const leg = buildHorseLegPart(isEnemy);
      leg.position.set(lx, 0.33, lz);
      horseGroup.add(leg);
      legs.push(leg);
    });
    horseGroup.userData.legs = legs;
    root.add(horseGroup);

    // Rider sits cleanly ON TOP of the 0.60m saddle (torso bottom at 0.33 + 0.28 = 0.61m!)
    bodyGroup.position.set(0, 0.33, -0.02);
  }

  // Torso (spans x: -0.144..+0.144, y: 0.280..0.604)
  const torso = buildTorsoPart(role, isEnemy);
  torso.position.set(0, 0.28, 0);
  bodyGroup.add(torso);

  // Head (sits at y = 0.615, leaving clean neck clearance above torso!)
  const head = buildHeadPart(role, isEnemy);
  head.position.set(0, 0.615, 0);
  bodyGroup.add(head);

  // Legs: on foot -> beneath hips (±0.080); on horseback -> straddling OUTSIDE horse saddlecloth (±0.215)!
  const leftLeg = buildLegPart(role, isEnemy);
  const rightLeg = buildLegPart(role, isEnemy);
  if (role === 'knight') {
    leftLeg.position.set(-0.215, 0.29, 0.01);
    rightLeg.position.set(0.215, 0.29, 0.01);
    leftLeg.rotation.x = -0.42;
    rightLeg.rotation.x = -0.42;
  } else {
    leftLeg.position.set(-0.080, 0.265, 0);
    rightLeg.position.set(0.080, 0.265, 0);
  }
  bodyGroup.add(leftLeg, rightLeg);

  // Arms: inner faces at |x| = 0.156m > torso 0.144m -> sagittal plane NEVER intersects torso/head!
  const leftArm = buildLeftArmPart(role, isEnemy);
  leftArm.position.set(-0.156, 0.565, 0);
  const rightArm = buildRightArmPart(role, isEnemy);
  rightArm.position.set(0.156, 0.565, 0);
  bodyGroup.add(leftArm, rightArm);

  // Peasant Resource Item held cleanly IN FRONT of chest (z = 0.22) & BETWEEN arms!
  let carryMesh = null;
  if (role === 'peasant') {
    carryMesh = new THREE.Mesh(prefabs.getCargoGeometryEntry('wood').geo, getSharedVoxelMaterial());
    carryMesh.scale.setScalar(0.76);
    carryMesh.position.set(0, 0.36, 0.22);
    carryMesh.castShadow = true;
    carryMesh.visible = false;
    bodyGroup.add(carryMesh);
  }

  // Subtle Heroic Golden Ground Halo for Physical Field Lords!
  if (role === 'lord') {
    const auraGeo = new THREE.RingGeometry(0.42, 0.56, 24);
    auraGeo.rotateX(-Math.PI / 2);
    const auraMat = new THREE.MeshBasicMaterial({
      color: isEnemy ? 0xef4444 : 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.position.y = 0.04;
    aura.userData.noOutline = true;
    root.add(aura);
  }

  root.scale.setScalar(scale);
  root.userData = {
    isMounted: role === 'knight',
    isArmored: role === 'swordsman' || role === 'knight' || role === 'lord',
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    horseGroup,
    carryMesh,
    torso,
    head,
  };
  return root;
}

// 7. 3D Floating Royal Crown Marker displayed above any building where a Lord is garrisoned!
export function createBuildingLordCrown(team = 'player') {
  const isEnemy = team === 'enemy';
  return getCachedVoxelPart(`bldg_crown_${isEnemy ? 'e' : 'p'}`, () => {
    const vg = new VoxelGrid(12, 9, 12);
    const gold = isEnemy ? 0xf59e0b : 0xfacc15;
    const goldBright = 0xfef08a;
    const velvet = isEnemy ? 0xb91c1c : 0x2563eb;
    const gem = isEnemy ? 0xef4444 : 0x38bdf8;

    // Royal Crown Base Circlet (x:2..9, y:0..2, z:2..9) + Velvet Cushion Core
    vg.box(2, 0, 2, 9, 2, 9, gold, 0.02, false, VMAT.METAL);
    vg.box(3, 1, 3, 8, 4, 8, velvet, 0.02, false, VMAT.ROOF);

    // 4 Glowing Gems set into the 4 faces of the crown band!
    vg.box(5, 1, 9, 6, 1, 9, gem, 0, true);
    vg.box(5, 1, 2, 6, 1, 2, gem, 0, true);
    vg.box(2, 1, 5, 2, 1, 6, gem, 0, true);
    vg.box(9, 1, 5, 9, 1, 6, gem, 0, true);

    // 8 Tall Golden Crown Points + Glowing Tips + Central Sovereign Cross!
    [[2, 2], [9, 2], [2, 9], [9, 9], [5, 2], [6, 9], [2, 6], [9, 5]].forEach(([px, pz]) => {
      vg.box(px, 3, pz, px, 5, pz, goldBright, 0.01, false, VMAT.METAL);
    });
    vg.box(5, 5, 5, 6, 8, 6, goldBright, 0, true);
    vg.box(4, 6, 5, 7, 7, 6, goldBright, 0, true);

    return vg.buildGeometry(0.068, { x: -0.5, y: 0, z: -0.5 });
  });
}

// 8. Watertight Non-Clipping Quarry Ox-Cart!
export function createQuarryOxCart() {
  const root = new THREE.Group();

  // Seamless Micro-Voxel Ox Body + Head + Snout + White Horns
  const oxBody = getCachedVoxelPart('ox_body', () => {
    const vg = new VoxelGrid(12, 10, 18);
    // Barrel (x:3..8 -> width 0.27m = ±0.135m)
    vg.box(3, 0, 0, 8, 6, 11, 0x8c583a, 0.03, false, VMAT.TIMBER);
    // Head & Pink Snout (z:11..17)
    vg.box(4, 2, 12, 7, 7, 15, 0x6e4228, 0.02, false, VMAT.TIMBER);
    vg.box(4, 2, 16, 7, 4, 17, 0xdfa890, 0.02, false, VMAT.SAND);
    // Curved White Horns cleanly outside head (x:1..3 & x:8..10)
    vg.box(1, 6, 13, 3, 7, 14, 0xfef3c7, 0.01, false, VMAT.ASHLAR);
    vg.box(1, 7, 14, 1, 8, 14, 0xfef3c7, 0.01, false, VMAT.ASHLAR);
    vg.box(8, 6, 13, 10, 7, 14, 0xfef3c7, 0.01, false, VMAT.ASHLAR);
    vg.box(10, 7, 14, 10, 8, 14, 0xfef3c7, 0.01, false, VMAT.ASHLAR);
    return vg.buildGeometry(0.045, { x: -0.5, y: 0, z: 0 });
  });
  oxBody.position.set(0, 0.27, 0.16);
  root.add(oxBody);

  // 4 Hip-Pivoted Ox Legs strictly outside body (|x| = 0.175m > 0.135m)
  const legs = [];
  [[-0.175, 0.62], [0.175, 0.62], [-0.175, 0.24], [0.175, 0.24]].forEach(([lx, lz]) => {
    const leg = getCachedVoxelPart('ox_leg', () => {
      const vg = new VoxelGrid(2, 6, 2);
      vg.box(0, 1, 0, 1, 5, 1, 0x5c3822, 0.02, false, VMAT.TIMBER);
      vg.box(0, 0, 0, 1, 0, 1, 0x1e293b, 0.02, false, VMAT.METAL);
      return vg.buildGeometry(0.045, { x: -0.5, y: -1.0, z: -0.5 });
    });
    leg.position.set(lx, 0.27, lz);
    root.add(leg);
    legs.push(leg);
  });

  // Seamless Wooden Flatbed Wagon + Yoke Shafts + Outer Wheels (Compact <= 1.5 body-width = 0.63m wide!)
  const wagon = getCachedVoxelPart('ox_wagon', () => {
    const vg = new VoxelGrid(14, 8, 22);
    // Flatbed planks (x:2..11, y:3..4, z:0..14) + low side rails
    vg.box(2, 3, 0, 11, 3, 14, 0x9c6b3b, 0.03, false, VMAT.TIMBER);
    vg.box(2, 4, 0, 2, 5, 14, 0x7c4d28, 0.03, false, VMAT.TIMBER);
    vg.box(11, 4, 0, 11, 5, 14, 0x7c4d28, 0.03, false, VMAT.TIMBER);
    // Twin wooden yoke shafts extending forward (z:14..21)
    vg.box(4, 4, 14, 4, 4, 21, 0x6e4228, 0.02, false, VMAT.TIMBER);
    vg.box(9, 4, 14, 9, 4, 21, 0x6e4228, 0.02, false, VMAT.TIMBER);
    // 4 Round Voxel Wheels strictly outside bed at x=0 and x=13!
    [[0, 3], [13, 3], [0, 11], [13, 11]].forEach(([wx, wz]) => {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dy * dy + dz * dz <= 5) {
            vg.set(wx, 2 + dy, wz + dz, (dy === 0 && dz === 0) ? 0x94a3b8 : 0x452714, 0.02, false, VMAT.TIMBER);
          }
        }
      }
    });
    return vg.buildGeometry(0.045, { x: -0.5, y: 0, z: -0.82 });
  });
  wagon.position.set(0, 0.01, 0.16);
  root.add(wagon);

  // Heavy Multi-Block Dressed Ashlar Limestone Payload sitting cleanly ON TOP of flatbed
  const carryMesh = getCachedVoxelPart('ox_stone_payload', () => {
    const vg = new VoxelGrid(8, 6, 11);
    vg.box(0, 0, 0, 3, 2, 4, 0xede6d6, 0.02, false, VMAT.ASHLAR);
    vg.box(4, 0, 0, 7, 2, 4, 0xe2dac9, 0.02, false, VMAT.ASHLAR);
    vg.box(0, 0, 5, 3, 2, 10, 0xe5ddd0, 0.02, false, VMAT.ASHLAR);
    vg.box(4, 0, 5, 7, 2, 10, 0xf2ece0, 0.02, false, VMAT.ASHLAR);
    vg.box(1, 3, 2, 6, 5, 8, 0xf5efe2, 0.02, false, VMAT.ASHLAR);
    vg.box(0, 1, 4, 7, 3, 5, 0x7c4d28, 0.01, false, VMAT.TIMBER); // Rope lashing!
    return vg.buildGeometry(0.044, { x: -0.5, y: 0, z: -0.5 }, true);
  });
  carryMesh.position.set(0, 0.20, -0.24);
  carryMesh.castShadow = true;
  carryMesh.visible = false;
  root.add(carryMesh);

  root.userData = { oxLegs: legs, carryMesh };
  return root;
}

export function setWorkerCarryItem(workerMesh, kind = null) {
  if (!workerMesh || !workerMesh.userData || !workerMesh.userData.carryMesh) return;
  const cm = workerMesh.userData.carryMesh;
  if (!kind) {
    cm.visible = false;
    return;
  }
  if (!workerMesh.userData.oxLegs && cm.isMesh) {
    cm.geometry = prefabs.getCargoGeometryEntry(kind).geo;
  }
  cm.visible = true;
}

export function createSiegeEngine(type = 'trebuchet', team = 'player') {
  const root = new THREE.Group();
  const isEnemy = team === 'enemy';
  const bannerHex = isEnemy ? 0xdc2626 : 0x2563eb;
  // Exact 2-body-width siege scale: 14 * 0.064m = 0.896m wide (< 2 body-widths, passes 1.50m gatehouse with ease!)
  const SIEGE_VOX = 0.064;

  if (type === 'trebuchet') {
    const vg = new VoxelGrid(14, 22, 22);
    // 4 Iron-Rimmed Siege Wheels (x=0..1 and x=12..13 -> total width 0.896m)
    [[0, 4], [13, 4], [0, 17], [13, 17]].forEach(([wx, wz]) => {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dz = -3; dz <= 3; dz++) {
          const r2 = dy * dy + dz * dz;
          if (r2 <= 9) {
            const isRim = r2 >= 6;
            const isHub = dy === 0 && dz === 0;
            const col = isHub ? 0xcbd5e1 : (isRim ? 0x475569 : 0x6b472c);
            vg.set(wx, 3 + dy, wz + dz, col, 0.02, false, (isHub || isRim) ? VMAT.METAL : VMAT.TIMBER);
          }
        }
      }
    });
    // Heavy Oak Sills & Iron-Braced Crossbeams
    vg.box(1, 3, 1, 3, 4, 20, 0x9c6b3b, 0.025, false, VMAT.TIMBER);
    vg.box(10, 3, 1, 12, 4, 20, 0x9c6b3b, 0.025, false, VMAT.TIMBER);
    vg.box(1, 4, 4, 12, 4, 6, 0x784b2a, 0.025, false, VMAT.TIMBER);
    vg.box(1, 4, 15, 12, 4, 17, 0x784b2a, 0.025, false, VMAT.TIMBER);

    // Tall A-Frame Trestle Uprights (y=5..19) + Diagonal Struts
    for (let h = 0; h < 15; h++) {
      vg.box(3, 5 + h, 10, 4, 5 + h, 11, 0x734b2b, 0.025, false, VMAT.TIMBER);
      vg.box(9, 5 + h, 10, 10, 5 + h, 11, 0x734b2b, 0.025, false, VMAT.TIMBER);
      const off = Math.floor((14 - h) * 0.45);
      vg.set(3, 5 + h, 10 - off, 0x8f5e36, 0.02, false, VMAT.TIMBER);
      vg.set(10, 5 + h, 10 - off, 0x8f5e36, 0.02, false, VMAT.TIMBER);
      vg.set(3, 5 + h, 11 + off, 0x8f5e36, 0.02, false, VMAT.TIMBER);
      vg.set(10, 5 + h, 11 + off, 0x8f5e36, 0.02, false, VMAT.TIMBER);
    }
    // Forged steel main axle + heraldic pennant
    vg.box(2, 19, 10, 11, 19, 11, 0x64748b, 0.015, false, VMAT.METAL);
    vg.box(10, 16, 12, 10, 20, 16, bannerHex, 0.02, false, VMAT.ROOF);

    const chassis = vg.buildMeshGroup(SIEGE_VOX, { x: -0.5, y: 0.01, z: -0.5 }, true, true, true);
    root.add(chassis);

    // Throwing Arm & Swinging Iron-Banded Counterweight Box (strictly between x=5..8!)
    const ag = new VoxelGrid(4, 10, 24);
    ag.box(1, 6, 0, 2, 7, 21, 0xc8965e, 0.025, false, VMAT.TIMBER);
    ag.box(0, 0, 16, 3, 5, 22, 0x475569, 0.02, false, VMAT.METAL);
    ag.box(1, 1, 17, 2, 4, 21, 0x784b2a, 0.02, false, VMAT.TIMBER);
    ag.box(1, 7, 0, 2, 8, 2, 0xe2e8f0, 0.01, false, VMAT.ASHLAR); // Sling pouch
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 1.24, 0);
    const armMesh = ag.buildMeshGroup(SIEGE_VOX, { x: -0.5, y: -0.68, z: -0.72 });
    armPivot.add(armMesh);
    armPivot.rotation.x = -0.35;
    root.add(armPivot);
    root.userData.armPivot = armPivot;
  } else {
    // Compact 2-Body-Width Tortoise Battering Ram (14x19x22 -> 0.896m wide x 1.41m long!)
    const vg = new VoxelGrid(14, 19, 22);
    [[0, 4], [13, 4], [0, 17], [13, 17]].forEach(([wx, wz]) => {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dz = -3; dz <= 3; dz++) {
          const r2 = dy * dy + dz * dz;
          if (r2 <= 9) {
            const isRim = r2 >= 6;
            vg.set(wx, 3 + dy, wz + dz, isRim ? 0x475569 : 0x6b472c, 0.02, false, isRim ? VMAT.METAL : VMAT.TIMBER);
          }
        }
      }
    });
    // Timber chassis posts & iron-reinforced armored tortoise shed roof!
    vg.box(1, 3, 2, 12, 4, 19, 0x7c4e2b, 0.025, false, VMAT.TIMBER);
    [[2, 3], [11, 3], [2, 18], [11, 18], [2, 10], [11, 10]].forEach(([px, pz]) => {
      vg.box(px, 5, pz, px, 10, pz, 0x6b4223, 0.02, false, VMAT.TIMBER);
    });
    for (let s = 0; s <= 5; s++) {
      const isRidge = s === 5;
      const isBand = s === 2;
      const col = isRidge ? bannerHex : (isBand ? 0x475569 : (s % 2 === 0 ? 0xa67648 : 0x8a5c34));
      const mId = isRidge ? VMAT.ROOF : (isBand ? VMAT.METAL : VMAT.TIMBER);
      vg.box(1 + s, 10 + s, 1, 2 + s, 11 + s, 20, col, 0.025, false, mId);
      vg.box(11 - s, 10 + s, 1, 12 - s, 11 + s, 20, col, 0.025, false, mId);
    }
    // Front & rear heraldic shield bosses on roof gable
    vg.box(6, 13, 20, 7, 15, 20, bannerHex, 0.02, false, VMAT.ROOF);
    root.add(vg.buildMeshGroup(SIEGE_VOX, { x: -0.5, y: 0.01, z: -0.5 }, true, true, true));

    // Suspended Iron-Headed Oak Battering Log (swings forward cleanly along Z!)
    const rg = new VoxelGrid(4, 4, 22);
    rg.box(1, 1, 1, 2, 2, 17, 0x734b2b, 0.025, false, VMAT.TIMBER);
    rg.box(0, 0, 18, 3, 3, 21, 0xdbe4ee, 0.015, false, VMAT.METAL);
    rg.box(1, 1, 21, 2, 2, 21, 0xfacc15, 0.01, false, VMAT.METAL);
    const ramLog = rg.buildMeshGroup(SIEGE_VOX, { x: -0.5, y: 0, z: -0.45 });
    ramLog.position.set(0, 0.36, 0);
    root.add(ramLog);
    root.userData.ramLog = ramLog;
  }

  return root;
}

export function createSquadBanner(unitType, team = 'player') {
  const group = new THREE.Group();
  const isEnemy = team === 'enemy';
  const pole = new THREE.Mesh(sharedBox, stdMat(0x78350f, 0.85, 0));
  pole.scale.set(0.065, 1.85, 0.065);
  pole.position.set(0, 0.92, 0);
  pole.castShadow = true;

  const clothColors = {
    spearman: 0x16a34a,
    archer: 0x0284c7,
    swordsman: 0x2563eb,
    knight: 0xf59e0b,
    trebuchet: 0x9333ea,
    ram: 0xea580c,
  };
  const clothHex = isEnemy ? 0xdc2626 : (clothColors[unitType] || 0x2563eb);
  const cloth = new THREE.Mesh(sharedBox, stdMat(clothHex, 0.65, 0.05));
  cloth.scale.set(0.05, 0.44, 0.60);
  cloth.position.set(0, 1.62, 0.34);
  cloth.castShadow = true;

  if (!isEnemy) {
    // Non-overlapping raised white cross emblem on outer faces of banner cloth
    const cross = new THREE.Mesh(sharedBox, stdMat(0xffffff, 0.7, 0));
    cross.scale.set(0.068, 0.26, 0.14);
    cross.position.set(0, 1.62, 0.34);
    group.add(cross);
  }

  const ringGeo = new THREE.RingGeometry(0.46, 0.62, 20);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isEnemy ? 0xef4444 : 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05 + (Math.random() * 0.015);
  ring.userData.noOutline = true;

  group.add(pole, cloth, ring);
  group.userData = { cloth, ring };
  return group;
}

export class VoxelDebrisSystem {
  constructor(scene, maxParticles = 300) {
    this.pool = [];
    for (let i = 0; i < maxParticles; i++) {
      const m = new THREE.Mesh(sharedBox, stdMat(0xd6d3cd, 0.82, 0.02));
      m.castShadow = true;
      m.receiveShadow = true;
      m.visible = false;
      scene.add(m);
      this.pool.push({
        mesh: m,
        vx: 0, vy: 0, vz: 0,
        rx: 0, rz: 0,
        floorY: 0.1,
        life: 0,
      });
    }
    this.cursor = 0;
  }

  burst(x, y, z, hexColor = 0xd6d3cd, count = 16, force = 1.0, size = 0.25) {
    const isEmissiveFire = hexColor === 0xff7700 || hexColor === 0xff8811;
    const mat = isEmissiveFire
      ? new THREE.MeshBasicMaterial({ color: hexColor })
      : stdMat(hexColor, 0.82, 0.04);

    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
      p.mesh.material = mat;
      const s = size * (0.65 + Math.random() * 0.65);
      p.mesh.scale.set(s, s, s);
      p.mesh.position.set(
        x + (Math.random() - 0.5) * 0.65,
        y + Math.random() * 0.55,
        z + (Math.random() - 0.5) * 0.65
      );
      const angle = Math.random() * Math.PI * 2;
      const spd = (1.6 + Math.random() * 4.0) * force;
      p.vx = Math.cos(angle) * spd;
      p.vz = Math.sin(angle) * spd;
      p.vy = (3.0 + Math.random() * 4.4) * force;
      p.rx = (Math.random() - 0.5) * 11;
      p.rz = (Math.random() - 0.5) * 11;
      p.floorY = Math.max(0.08, y - 1.2);
      p.life = 0.9 + Math.random() * 0.7;
      p.mesh.visible = true;
    }
  }

  update(dt) {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vy -= 14.0 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.z += p.rz * dt;

      if (p.mesh.position.y < p.floorY) {
        p.mesh.position.y = p.floorY;
        p.vy = Math.abs(p.vy) * 0.34;
        p.vx *= 0.65;
        p.vz *= 0.65;
      }
      if (p.life < 0.25) {
        p.mesh.scale.setScalar(Math.max(0.02, (p.life / 0.25) * 0.22));
      }
    }
  }
}
