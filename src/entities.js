import * as THREE from 'three';
import {
  PolyBuilder,
  VMAT,
  getSharedVoxelMaterial,
  getSharedEmissiveMaterial,
} from './voxelEngine.js';
import { prefabs } from './voxelPrefabs.js';

const sharedDebrisGeo = new THREE.OctahedronGeometry(0.50, 0);

const stdCache = new Map();
function stdMat(hex, roughness = 0.80, metalness = 0.04) {
  const key = `${hex}_${roughness}_${metalness}`;
  if (!stdCache.has(key)) {
    stdCache.set(
      key,
      new THREE.MeshStandardMaterial({ color: hex, roughness, metalness })
    );
  }
  return stdCache.get(key);
}

const rigGeoCache = new Map();
function getCachedLowPolyPart(cacheKey, builderFn) {
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

function getRolePalette(role, isEnemy) {
  if (isEnemy) {
    // East China Sea Wokou Raiders (黑漆胴丸具足 + 暗褐/绛紫浪人战衣)
    return {
      skin: 0xd9ad8b,
      cloth: role === 'swordsman' ? 0x453548 : 0x36323b,
      skirt: 0x28242b,
      accent: 0x7f1e1d,
      armor: 0x24252c,
      gold: 0xb8842e,
      wood: 0x473121,
      steel: 0xb8c2cc,
    };
  }
  // Grounded Ming Yongchang Militia & Qi-Army Palette (靛青/赭石交领短打 + 茜红号衣胖袄 + 熟铁甲片)
  if (role === 'peasant') {
    return {
      skin: 0xdfb18e,
      cloth: 0x5c6e7a,   // 江南青灰麻布短褐 (exact match to townsfolk in reference!)
      skirt: 0x424b54,
      accent: 0xd8cdb8,  // 素白交领中衣
      armor: 0x6e5a44,
      gold: 0xa67c38,
      wood: 0x6b472b,
      steel: 0xb8c2cc,
    };
  }
  return {
    skin: 0xdfb18e,
    cloth: role === 'archer' ? 0x364d63 : 0x8f2922, // 神机铳手靛蓝战袄 / 鸳鸯阵茜红胖袄
    skirt: 0x2b394a,                                // 靛青战裙
    accent: 0xcfc2ab,
    armor: 0x565e69,                                // 明代熟铁臂缚/甲叶
    gold: 0xc89a3c,
    wood: 0x694528,
    steel: 0xc7d0d9,
  };
}

// 1. Realistic Proportioned Ming / Wokou Head (`~0.15m` cranial height -> 6.5-head figure, NOT chibi!)
function buildHeadPart(role, isEnemy) {
  return getCachedLowPolyPart(`mp_head_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const pb = new PolyBuilder();

    // Neck + Smooth 12-segment anatomical head (y = 0..0.155)
    pb.prismY(0, -0.02, 0, 0.035, 0.033, 0.045, 10, pal.skin, { matId: VMAT.PLASTER });
    pb.ellipsoid(0, 0.085, 0, 0.064, 0.076, 0.068, pal.skin, { uSegs: 12, vSegs: 8, matId: VMAT.PLASTER });
    // Subtle nose bridge, dark brows & eyes on +Z
    pb.box(0, 0.082, 0.068, 0.016, 0.028, 0.016, pal.skin, { matId: VMAT.PLASTER });
    pb.box(-0.024, 0.095, 0.063, 0.018, 0.012, 0.010, 0x1e1b18);
    pb.box( 0.024, 0.095, 0.063, 0.018, 0.012, 0.010, 0x1e1b18);
    // Back hair wrap
    pb.ellipsoid(0, 0.095, -0.018, 0.066, 0.068, 0.058, 0x1f1a17, { uSegs: 10, vSegs: 7, matId: VMAT.TIMBER });

    if (role === 'peasant') {
      // Curved Lathe-Turned Jiangnan Woven Bamboo Douli (`江南弧面竹斗笠`)!
      pb.latheY(0, 0.115, 0, [[0.19, 0], [0.13, 0.035], [0.06, 0.075], [0.008, 0.105]], 14, 0xc49a52, { matId: VMAT.TIMBER });
      pb.prismY(0, 0.112, 0, 0.192, 0.188, 0.012, 14, 0x8f6b32, { openTop: true, matId: VMAT.TIMBER });
    } else if (role === 'lord') {
      if (!isEnemy) {
        // Clan Commander Wang Shuguo: Scholar-General Beard + Ming Gilded Winged Helmet (`乌纱鎏金翼善武冠`)
        pb.boxY(0, 0.00, 0.052, 0.052, 0.055, 0.025, 0x1c1917, { topScaleX: 1.25 });
        pb.latheY(0, 0.115, 0, [[0.076, 0], [0.078, 0.045], [0.062, 0.095], [0.015, 0.125]], 12, 0x22252c, { matId: VMAT.METAL });
        pb.prismY(0, 0.115, 0, 0.080, 0.078, 0.024, 12, pal.gold, { openTop: true, matId: VMAT.METAL });
        pb.latheY(0, 0.23, 0, [[0.032, 0], [0.015, 0.06], [0.004, 0.09]], 8, 0xa8201a, { matId: VMAT.PLASTER });
        pb.box(-0.095, 0.17, -0.02, 0.075, 0.032, 0.018, pal.gold, { rotZ: 0.30, matId: VMAT.METAL });
        pb.box( 0.095, 0.17, -0.02, 0.075, 0.032, 0.018, pal.gold, { rotZ: -0.30, matId: VMAT.METAL });
      } else {
        // Wokou Warlord Onimaru: Flared Shikoro Kabuto + Golden Kuwa-gata Crescent Horns + Menpo Mask!
        pb.latheY(0, 0.11, 0, [[0.115, 0], [0.082, 0.03], [0.072, 0.085], [0.02, 0.115]], 12, 0x1c1c22, { matId: VMAT.METAL });
        pb.box(-0.085, 0.22, 0.055, 0.026, 0.13, 0.016, pal.gold, { rotZ: 0.42, matId: VMAT.METAL });
        pb.box( 0.085, 0.22, 0.055, 0.026, 0.13, 0.016, pal.gold, { rotZ: -0.42, matId: VMAT.METAL });
        pb.boxY(0, 0.035, 0.062, 0.085, 0.052, 0.022, 0x7f1d1d, { matId: VMAT.METAL });
      }
    } else if (!isEnemy) {
      // Ming Soldiers: Lathe-Sculpted Curved Iron/Lacquer Li-Kui (`明军红缨铁笠盔 / 勇字兜鍪`)
      const isHeavy = role === 'swordsman' || role === 'knight';
      const helmCol = isHeavy ? 0x4b535e : 0x3b424c;
      const brimR = isHeavy ? 0.125 : 0.155;
      pb.latheY(0, 0.112, 0, [[brimR, 0], [0.095, 0.032], [0.062, 0.082], [0.018, 0.105]], 14, helmCol, { matId: VMAT.METAL });
      pb.prismY(0, 0.110, 0, brimR + 0.004, brimR, 0.012, 14, pal.gold, { openTop: true, matId: VMAT.METAL });
      pb.latheY(0, 0.21, 0, [[0.034, 0], [0.018, 0.055], [0.005, 0.08]], 8, 0xa8241c, { matId: VMAT.PLASTER });
      if (isHeavy) {
        // Curved cheek & neck lamellar flaps (`顿项护耳`)
        pb.boxY(-0.072, 0.03, -0.01, 0.022, 0.09, 0.095, 0x6e241d, { matId: VMAT.PLASTER });
        pb.boxY( 0.072, 0.03, -0.01, 0.022, 0.09, 0.095, 0x6e241d, { matId: VMAT.PLASTER });
      }
    } else {
      if (role === 'swordsman') {
        // Bareheaded Wokou Ronin with Chondai Topknot (`月代头武士髻`) & Headband
        pb.prismY(0, 0.115, 0, 0.068, 0.066, 0.020, 12, 0x7f1d1d, { openTop: true, matId: VMAT.PLASTER });
        pb.cylinderAxis(0, 0.165, -0.01, 0.020, 0.016, 0.085, 8, 'z', 0x18181b, { matId: VMAT.TIMBER });
      } else if (role === 'knight') {
        pb.latheY(0, 0.11, 0, [[0.11, 0], [0.078, 0.03], [0.068, 0.08], [0.02, 0.105]], 12, 0x5c1919, { matId: VMAT.METAL });
        pb.box(-0.075, 0.20, 0.05, 0.022, 0.10, 0.015, pal.gold, { rotZ: 0.4, matId: VMAT.METAL });
        pb.box( 0.075, 0.20, 0.05, 0.022, 0.10, 0.015, pal.gold, { rotZ: -0.4, matId: VMAT.METAL });
      } else {
        // Wokou Ashigaru Black-Lacquer Jingasa (`足轻阵笠`)
        pb.latheY(0, 0.115, 0, [[0.165, 0], [0.10, 0.032], [0.01, 0.078]], 14, 0x202026, { matId: VMAT.METAL });
        pb.boxY(0, 0.13, 0.08, 0.035, 0.028, 0.02, pal.gold, { matId: VMAT.METAL });
      }
    }
    return pb.buildGeometry();
  });
}

// 2. Anatomical Ming Robe / Brigandine Torso (`y = 0..0.38`, seated at hip `y = 0.40`!)
function buildTorsoPart(role, isEnemy) {
  return getCachedLowPolyPart(`mp_torso_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const pb = new PolyBuilder();

    // Pleated Lower Robe Hem / Armored Tassets (`战裙/甲裙`, y = -0.04..0.14)
    pb.latheY(0, -0.04, 0, [[0.138, 0], [0.118, 0.10], [0.098, 0.18]], 12, pal.skirt, { scaleZ: 0.78, matId: VMAT.PLASTER });
    // Upper Chest Tunic / Brigandine (`胸甲/交领战袄`, y = 0.12..0.37)
    pb.latheY(0, 0.12, 0, [[0.096, 0], [0.118, 0.14], [0.126, 0.22], [0.085, 0.26]], 12, pal.cloth, { scaleZ: 0.74, matId: VMAT.PLASTER });

    // Crossed Ming Hanfu Collar Lapel (`交领右衽`) + Leather Waist Sash & Brass Plaque!
    pb.box(0.015, 0.30, 0.078, 0.032, 0.12, 0.018, pal.accent, { rotZ: -0.45, matId: VMAT.PLASTER });
    pb.box(-0.015, 0.31, 0.080, 0.032, 0.11, 0.018, pal.accent, { rotZ: 0.45, matId: VMAT.PLASTER });
    pb.prismY(0, 0.115, 0, 0.106, 0.104, 0.038, 12, 0x332216, { scaleZ: 0.78, openTop: true, matId: VMAT.TIMBER });
    pb.boxY(0, 0.118, 0.082, 0.042, 0.036, 0.018, pal.gold, { matId: VMAT.METAL });

    if (!isEnemy && role !== 'peasant') {
      // Ming Brass Heart-Mirror (`护心镜`) + Shoulder Pauldrons (`披膊`)
      pb.cylinderAxis(0, 0.25, 0.088, 0.046, 0.046, 0.016, 12, 'z', pal.gold, { matId: VMAT.METAL });
      if (role === 'swordsman' || role === 'knight' || role === 'lord') {
        pb.ellipsoid(-0.135, 0.32, 0, 0.052, 0.048, 0.058, pal.armor, { uSegs: 9, vSegs: 6, matId: VMAT.METAL });
        pb.ellipsoid( 0.135, 0.32, 0, 0.052, 0.048, 0.058, pal.armor, { uSegs: 9, vSegs: 6, matId: VMAT.METAL });
      }
      if (role === 'knight' || role === 'lord') {
        pb.box(0, 0.16, -0.095, 0.22, 0.34, 0.022, 0x7d1e19, { rotX: 0.15, matId: VMAT.PLASTER });
      }
    } else if (isEnemy && (role === 'spearman' || role === 'knight')) {
      // Wokou Back Sashimono Banner (`背插指物旗`)
      pb.prismY(0, 0.14, -0.09, 0.011, 0.009, 0.48, 8, pal.wood, { matId: VMAT.TIMBER });
      pb.boxY(0, 0.36, -0.15, 0.015, 0.24, 0.12, pal.accent, { matId: VMAT.PLASTER });
    }
    return pb.buildGeometry();
  });
}

// 3. Articulated Thigh + Wrapped Puttee Shin (`绑腿`) + Ming Cloth/Leather Boot (`y = 0..-0.41`)
function buildLegPart(role, isEnemy) {
  return getCachedLowPolyPart(`mp_leg_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pb = new PolyBuilder();
    const trouserCol = role === 'peasant' ? 0x454d54 : (isEnemy ? 0x26242b : 0x253242);
    const putteeCol  = role === 'peasant' ? 0xbdb29d : (isEnemy ? 0x3f3a36 : 0xc8bca6);
    // Thigh (0..-0.19) + Wrapped Puttee Shin (-0.19..-0.36) + Boot (-0.41..-0.35)
    pb.prismY(0, -0.19, 0, 0.036, 0.048, 0.19, 10, trouserCol, { matId: VMAT.PLASTER });
    pb.prismY(0, -0.36, 0, 0.028, 0.036, 0.17, 10, putteeCol, { matId: VMAT.PLASTER });
    pb.boxY(0, -0.41, 0.020, 0.058, 0.052, 0.115, 0x241b15, { topScaleX: 0.88, matId: VMAT.TIMBER });
    return pb.buildGeometry();
  });
}

// 4. Left Arm + Cuffed Sleeve / Bracer + Domed Wenzhou Rattan Shield (`温州圆弧藤牌`)
function buildLeftArmPart(role, isEnemy) {
  return getCachedLowPolyPart(`mp_larm_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const pb = new PolyBuilder();
    pb.prismY(0, -0.15, 0, 0.034, 0.042, 0.15, 10, pal.cloth, { matId: VMAT.PLASTER });
    pb.prismY(0, -0.27, 0, 0.026, 0.033, 0.12, 10, role === 'peasant' ? pal.skin : pal.armor, { matId: VMAT.METAL });
    pb.ellipsoid(0, -0.29, 0.01, 0.026, 0.028, 0.028, pal.skin, { uSegs: 8, vSegs: 6, matId: VMAT.PLASTER });

    if (!isEnemy && role === 'swordsman') {
      // Authentic Convex Woven Wenzhou Rattan Shield (`温州旋编圆藤牌`) held on left forearm!
      const shieldGrp = new PolyBuilder();
      shieldGrp.latheY(0, 0, 0, [[0.23, 0], [0.19, 0.03], [0.11, 0.065], [0.02, 0.09]], 14, 0xb88635, {
        bandColors: [0x966923, 0xbd8b38, 0x8f241e],
        matId: VMAT.TIMBER,
      });
      // Rotate shield vertical on outer -X forearm
      const sGeo = shieldGrp.buildGeometry().geo;
      if (sGeo) {
        sGeo.rotateZ(Math.PI * 0.5);
        sGeo.rotateY(0.25);
        sGeo.translate(-0.05, -0.19, 0.09);
        const pos = sGeo.getAttribute('position');
        const nrm = sGeo.getAttribute('normal');
        const col = sGeo.getAttribute('color');
        for (let i = 0; i < pos.count; i += 3) {
          pb.triSmooth(
            [pos.getX(i), pos.getY(i), pos.getZ(i)],
            [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)],
            [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)],
            [nrm.getX(i), nrm.getY(i), nrm.getZ(i)],
            [nrm.getX(i + 1), nrm.getY(i + 1), nrm.getZ(i + 1)],
            [nrm.getX(i + 2), nrm.getY(i + 2), nrm.getZ(i + 2)],
            0xb88635, 1, 1, 1, false, VMAT.TIMBER
          );
          // Preserve baked rattan band colors!
          const base = pb.col.length - 9;
          for (let k = 0; k < 3; k++) {
            pb.col[base + k * 3] = col.getX(i + k);
            pb.col[base + k * 3 + 1] = col.getY(i + k);
            pb.col[base + k * 3 + 2] = col.getZ(i + k);
          }
        }
        sGeo.dispose();
      }
    }
    return pb.buildGeometry();
  });
}

// 5. Right Arm + High-Detail Historical Ming & Wokou Weapons!
function buildRightArmPart(role, isEnemy) {
  return getCachedLowPolyPart(`mp_rarm_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const pb = new PolyBuilder();
    pb.prismY(0, -0.15, 0, 0.034, 0.042, 0.15, 10, pal.cloth, { matId: VMAT.PLASTER });
    pb.prismY(0, -0.27, 0, 0.026, 0.033, 0.12, 10, role === 'peasant' ? pal.skin : pal.armor, { matId: VMAT.METAL });
    pb.ellipsoid(0, -0.29, 0.01, 0.026, 0.028, 0.028, pal.skin, { uSegs: 8, vSegs: 6, matId: VMAT.PLASTER });

    if (role === 'spearman') {
      if (!isEnemy) {
        // Qi Jiguang's Multi-Branch Moso Bamboo Langxian (`戚家军多枝毛竹狼筅`, 1.36m long + 8 pronged branches!)
        pb.cylinderAxis(0.01, -0.26, 0.42, 0.020, 0.013, 1.24, 10, 'z', 0x5c7d38, { matId: VMAT.TIMBER });
        pb.cylinderAxis(0.01, -0.26, 1.08, 0.024, 0.003, 0.16, 8, 'z', pal.steel, { matId: VMAT.METAL });
        const prongs = [
          [0.48,  0.50,  0.32], [0.56, -0.50, -0.32], [0.66,  0.46, -0.38], [0.74, -0.46,  0.38],
          [0.82,  0.42,  0.28], [0.89, -0.42, -0.28], [0.95,  0.36, -0.34], [1.00, -0.36,  0.34],
        ];
        prongs.forEach(([bz, rx, rz]) => {
          pb.box(0.01, -0.26, bz, 0.014, 0.28, 0.014, 0x6b8f42, { rotX: rx, rotZ: rz, matId: VMAT.LEAVES });
        });
      } else {
        pb.cylinderAxis(0.01, -0.26, 0.38, 0.018, 0.015, 1.12, 10, 'z', pal.wood, { matId: VMAT.TIMBER });
        pb.cylinderAxis(0.01, -0.26, 0.98, 0.024, 0.003, 0.20, 6, 'z', pal.steel, { matId: VMAT.METAL });
      }
    } else if (role === 'archer') {
      if (!isEnemy) {
        // Ming Shenji Matchlock Arquebus (`大明神机火绳鸟铳`)
        pb.box(0.01, -0.28, 0.06, 0.036, 0.065, 0.28, pal.wood, { rotX: 0.14, matId: VMAT.TIMBER });
        pb.cylinderAxis(0.01, -0.25, 0.36, 0.020, 0.016, 0.56, 10, 'z', 0x333a42, { matId: VMAT.METAL });
        pb.cylinderAxis(0.01, -0.25, 0.64, 0.023, 0.020, 0.03, 10, 'z', pal.gold, { matId: VMAT.METAL });
        pb.boxY(0.01, -0.23, 0.20, 0.022, 0.025, 0.025, 0xff881a, { emissive: true });
      } else {
        // Asymmetric Japanese Yumi Longbow (`倭寇大弓`)
        pb.box(0.02, -0.20, 0.18, 0.020, 0.68, 0.028, 0x6e1d1b, { rotX: 0.10, matId: VMAT.TIMBER });
      }
    } else if (role === 'swordsman' || role === 'lord') {
      // Curved Ming Yanling Saber (`雁翎腰刀`) / Nodachi Katana (`野太刀`) built with 2-stage blade curve!
      pb.cylinderAxis(0.01, -0.27, 0.08, 0.042, 0.042, 0.018, 10, 'z', pal.gold, { matId: VMAT.METAL });
      pb.box(0.01, -0.25, 0.23, 0.014, 0.038, 0.28, pal.steel, { rotX: -0.12, matId: VMAT.METAL });
      pb.box(0.01, -0.20, 0.48, 0.012, 0.034, 0.26, pal.steel, { topScaleY: 0.35, rotX: -0.26, matId: VMAT.METAL });
    } else if (role === 'knight') {
      // Ming Red-Tasseled Heavy Cavalry Lance (`红缨长枪`)
      pb.cylinderAxis(0.02, -0.25, 0.44, 0.020, 0.015, 1.28, 10, 'z', isEnemy ? pal.wood : 0x7d1e19, { matId: VMAT.TIMBER });
      pb.cylinderAxis(0.02, -0.25, 1.14, 0.030, 0.004, 0.22, 8, 'z', pal.steel, { matId: VMAT.METAL });
      if (!isEnemy) {
        pb.latheY(0.02, -0.29, 0.98, [[0.038, 0], [0.018, 0.08]], 8, 0xa8201a, { matId: VMAT.PLASTER });
      }
    }
    return pb.buildGeometry();
  });
}

// 6. Anatomical Ming Warhorse (`参考图写实比例战马` — Muscular Chest, Barrel, Croup, Arched Neck, Saddle & Stirrups!)
function buildWarhorseBodyPart(isEnemy) {
  return getCachedLowPolyPart(`mp_horse_${isEnemy ? 'e' : 'p'}`, () => {
    const pb = new PolyBuilder();
    const coat  = isEnemy ? 0x242024 : 0x382d26; // Sleek Dark Chestnut/Black Ming Steed (like reference!)
    const mane  = 0x171412;
    const cloth = isEnemy ? 0x6e1a1a : 0x2b4560; // Indigo Ming Saddlecloth (matching rider in reference!)
    const gold  = isEnemy ? 0xb8822e : 0xc89a3c;

    // Smooth Anatomical Chest, Ribcage Barrel & Rounded Hindquarters (croup)
    pb.ellipsoid(0, 0.20,  0.22, 0.155, 0.165, 0.18, coat, { uSegs: 12, vSegs: 8, matId: VMAT.TIMBER });
    pb.ellipsoid(0, 0.21,  0.00, 0.160, 0.155, 0.28, coat, { uSegs: 12, vSegs: 8, matId: VMAT.TIMBER });
    pb.ellipsoid(0, 0.22, -0.24, 0.152, 0.162, 0.19, coat, { uSegs: 12, vSegs: 8, matId: VMAT.TIMBER });

    // Layered Indigo Saddlecloth + Carved Leather Saddle Pommel/Cantle + Brass Stirrups!
    pb.boxY(0, 0.14, -0.02, 0.34, 0.22, 0.34, cloth, { topScaleX: 0.92, matId: VMAT.PLASTER });
    pb.boxY(0, 0.33,  0.10, 0.20, 0.08, 0.06, 0x4f321d, { matId: VMAT.TIMBER });
    pb.boxY(0, 0.33, -0.14, 0.22, 0.09, 0.07, 0x4f321d, { matId: VMAT.TIMBER });

    // Arched Muscular Neck, Sculpted Equine Head, Tapered Muzzle, Twin Ears, Mane & Flowing Tail!
    pb.box(0, 0.40, 0.30, 0.13, 0.34, 0.17, coat, { topScaleX: 0.78, topScaleZ: 0.78, rotX: 0.48, matId: VMAT.TIMBER });
    pb.box(0, 0.43, 0.24, 0.035, 0.32, 0.07, mane, { rotX: 0.48, matId: VMAT.TIMBER });
    pb.ellipsoid(0, 0.54, 0.41, 0.075, 0.080, 0.11, coat, { uSegs: 10, vSegs: 7, matId: VMAT.TIMBER });
    pb.box(0, 0.48, 0.50, 0.085, 0.085, 0.16, coat, { topScaleX: 0.72, rotX: 0.42, matId: VMAT.TIMBER });
    pb.box(-0.045, 0.63, 0.38, 0.024, 0.065, 0.024, coat, { rotX: 0.2, matId: VMAT.TIMBER });
    pb.box( 0.045, 0.63, 0.38, 0.024, 0.065, 0.024, coat, { rotX: 0.2, matId: VMAT.TIMBER });
    // Bridle brass boss & flowing horsehair tail
    pb.box(0, 0.55, 0.46, 0.10, 0.022, 0.12, gold, { rotX: 0.42, matId: VMAT.METAL });
    pb.box(0, 0.14, -0.44, 0.065, 0.32, 0.08, mane, { topScaleX: 0.5, rotX: -0.34, matId: VMAT.TIMBER });
    return pb.buildGeometry();
  });
}

function buildHorseLegPart(isEnemy) {
  return getCachedLowPolyPart(`mp_hleg_${isEnemy ? 'e' : 'p'}`, () => {
    const pb = new PolyBuilder();
    const coat = isEnemy ? 0x201c20 : 0x2e241e;
    // Muscular upper leg (0..-0.20) + slender cannon bone (-0.20..-0.38) + iron-shod hoof (-0.42..-0.37)
    pb.prismY(0, -0.20, 0, 0.036, 0.055, 0.20, 10, coat, { matId: VMAT.TIMBER });
    pb.prismY(0, -0.38, 0, 0.026, 0.035, 0.18, 10, coat, { matId: VMAT.TIMBER });
    pb.prismY(0, -0.42, 0.01, 0.035, 0.030, 0.045, 10, 0x17171a, { matId: VMAT.METAL });
    return pb.buildGeometry();
  });
}

export function createVoxelHumanoid(role = 'peasant', team = 'player') {
  const root = new THREE.Group();
  const isEnemy = team === 'enemy';
  const scale = role === 'lord' ? 1.18 : 0.96;

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  let horseGroup = null;
  if (role === 'knight') {
    horseGroup = new THREE.Group();
    const horseBody = buildWarhorseBodyPart(isEnemy);
    horseBody.position.set(0, 0.38, 0);
    horseGroup.add(horseBody);

    const legs = [];
    [[-0.105, 0.24], [0.105, 0.24], [-0.105, -0.24], [0.105, -0.24]].forEach(([lx, lz]) => {
      const leg = buildHorseLegPart(isEnemy);
      leg.position.set(lx, 0.42, lz);
      horseGroup.add(leg);
      legs.push(leg);
    });
    horseGroup.userData.legs = legs;
    root.add(horseGroup);
    bodyGroup.position.set(0, 0.34, -0.02);
  }

  const torso = buildTorsoPart(role, isEnemy);
  torso.position.set(0, 0.40, 0);
  bodyGroup.add(torso);

  const head = buildHeadPart(role, isEnemy);
  head.position.set(0, 0.77, 0);
  bodyGroup.add(head);

  const leftLeg = buildLegPart(role, isEnemy);
  const rightLeg = buildLegPart(role, isEnemy);
  if (role === 'knight') {
    leftLeg.position.set(-0.18, 0.40, 0.02);
    rightLeg.position.set(0.18, 0.40, 0.02);
    leftLeg.rotation.x = -0.38;
    rightLeg.rotation.x = -0.38;
  } else {
    leftLeg.position.set(-0.062, 0.41, 0);
    rightLeg.position.set(0.062, 0.41, 0);
  }
  bodyGroup.add(leftLeg, rightLeg);

  const leftArm = buildLeftArmPart(role, isEnemy);
  leftArm.position.set(-0.148, 0.73, 0);
  const rightArm = buildRightArmPart(role, isEnemy);
  rightArm.position.set(0.148, 0.73, 0);
  bodyGroup.add(leftArm, rightArm);

  let carryMesh = null;
  if (role === 'peasant') {
    carryMesh = new THREE.Mesh(prefabs.getCargoGeometryEntry('wood').geo, getSharedVoxelMaterial());
    carryMesh.scale.setScalar(0.84);
    carryMesh.position.set(0, 0.48, 0.22);
    carryMesh.castShadow = true;
    carryMesh.visible = false;
    bodyGroup.add(carryMesh);
  }

  if (role === 'lord') {
    const auraGeo = new THREE.RingGeometry(0.40, 0.52, 28);
    auraGeo.rotateX(-Math.PI / 2);
    const auraMat = new THREE.MeshBasicMaterial({
      color: isEnemy ? 0xb91c1c : 0xc89a3c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.position.y = 0.03;
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

// Floating Ming Commander Seal & Silk Canopy (`永昌鎏金帅印华盖`)
export function createBuildingLordCrown(team = 'player') {
  const isEnemy = team === 'enemy';
  return getCachedLowPolyPart(`mp_lord_seal_${isEnemy ? 'e' : 'p'}`, () => {
    const pb = new PolyBuilder();
    const gold = isEnemy ? 0xb8822e : 0xd4a644;
    const crimson = isEnemy ? 0x6e1a1a : 0x99241c;
    pb.boxY(0, 0.0, 0, 0.34, 0.13, 0.34, gold, { matId: VMAT.METAL });
    pb.boxY(0, 0.13, 0, 0.20, 0.10, 0.20, crimson, { matId: VMAT.PLASTER });
    pb.chineseRoof(0, 0.23, 0, 0.50, 0.50, 0.22, gold, crimson, {
      style: 'pavilion',
      sides: 8,
      cornerLift: 0.07,
      finialHex: 0xfff0aa,
    });
    return pb.buildGeometry();
  });
}

// Anatomical Jiangnan Slate-Grey Water Buffalo & Spoked Flatbed Stone Cart (`江南青水牛拉石车`)
export function createQuarryOxCart() {
  const root = new THREE.Group();

  const oxBody = getCachedLowPolyPart('mp_water_buffalo', () => {
    const pb = new PolyBuilder();
    const hide = 0x4b5259;
    pb.ellipsoid(0, 0.14, 0.52, 0.165, 0.155, 0.17, hide, { uSegs: 12, vSegs: 8, matId: VMAT.TIMBER });
    pb.ellipsoid(0, 0.13, 0.34, 0.175, 0.150, 0.24, hide, { uSegs: 12, vSegs: 8, matId: VMAT.TIMBER });
    pb.ellipsoid(0, 0.14, 0.16, 0.155, 0.145, 0.16, hide, { uSegs: 10, vSegs: 7, matId: VMAT.TIMBER });
    // Lowered buffalo head, broad muzzle & sweeping curved crescent horns!
    pb.ellipsoid(0, 0.16, 0.70, 0.105, 0.095, 0.11, 0x3d434a, { uSegs: 10, vSegs: 7, matId: VMAT.TIMBER });
    pb.box(0, 0.12, 0.81, 0.13, 0.09, 0.10, 0x5c646d, { topScaleX: 0.85, matId: VMAT.TIMBER });
    for (const sgn of [-1, 1]) {
      pb.box(sgn * 0.14, 0.21, 0.68, 0.15, 0.036, 0.042, 0xd4cfc5, { rotZ: sgn * 0.24, rotY: -sgn * 0.28, matId: VMAT.ASHLAR });
      pb.box(sgn * 0.24, 0.26, 0.62, 0.11, 0.028, 0.032, 0xe2ddd3, { rotZ: sgn * 0.58, rotY: -sgn * 0.52, matId: VMAT.ASHLAR });
    }
    // Wooden shoulder yoke (`牛轭`)
    pb.boxY(0, 0.26, 0.54, 0.34, 0.045, 0.06, 0x6b472b, { matId: VMAT.TIMBER });
    return pb.buildGeometry();
  });
  oxBody.position.set(0, 0.24, 0.0);
  root.add(oxBody);

  const legs = [];
  [[-0.12, 0.58], [0.12, 0.58], [-0.12, 0.20], [0.12, 0.20]].forEach(([lx, lz]) => {
    const leg = getCachedLowPolyPart('mp_buffalo_leg', () => {
      const pb = new PolyBuilder();
      pb.prismY(0, -0.26, 0, 0.034, 0.048, 0.26, 10, 0x3a4047, { matId: VMAT.TIMBER });
      return pb.buildGeometry();
    });
    leg.position.set(lx, 0.26, lz);
    root.add(leg);
    legs.push(leg);
  });

  const wagon = getCachedLowPolyPart('mp_stone_wagon_bed', () => {
    const pb = new PolyBuilder();
    pb.boxY(0, 0.17, -0.24, 0.46, 0.05, 0.66, 0x8c6239, { matId: VMAT.TIMBER });
    pb.boxY(-0.21, 0.22, -0.24, 0.04, 0.08, 0.66, 0x5c3e24, { matId: VMAT.TIMBER });
    pb.boxY( 0.21, 0.22, -0.24, 0.04, 0.08, 0.66, 0x5c3e24, { matId: VMAT.TIMBER });
    pb.boxY(-0.15, 0.24, 0.25, 0.035, 0.035, 0.46, 0x5c3e24, { matId: VMAT.TIMBER });
    pb.boxY( 0.15, 0.24, 0.25, 0.035, 0.035, 0.46, 0x5c3e24, { matId: VMAT.TIMBER });
    return pb.buildGeometry();
  });
  root.add(wagon);

  const wheels = [];
  const wheelProto = () => getCachedLowPolyPart('mp_cart_wheel', () => {
    const pb = new PolyBuilder();
    pb.spokedWheel(0, 0, 0, 0.15, 0.04, 8, 0x333840, 0x6b472b, 0x8f6b32);
    return pb.buildGeometry();
  });
  for (const [wx, wz] of [[-0.26, -0.06], [0.26, -0.06], [-0.26, -0.42], [0.26, -0.42]]) {
    const w = wheelProto();
    w.position.set(wx, 0.15, wz);
    root.add(w);
    wheels.push(w);
  }

  const carryMesh = getCachedLowPolyPart('mp_ox_granite_load', () => {
    const pb = new PolyBuilder();
    pb.boxY(-0.09, 0.0, -0.10, 0.16, 0.12, 0.22, 0x9e988e, { matId: VMAT.ASHLAR });
    pb.boxY( 0.09, 0.0, -0.10, 0.16, 0.12, 0.22, 0x8f8980, { matId: VMAT.ASHLAR });
    pb.boxY( 0.00, 0.0,  0.13, 0.30, 0.12, 0.20, 0xa8a298, { matId: VMAT.ASHLAR });
    pb.boxY( 0.00, 0.12, 0.00, 0.24, 0.11, 0.28, 0xb5afa5, { matId: VMAT.ASHLAR });
    return pb.buildGeometry();
  });
  carryMesh.position.set(0, 0.22, -0.24);
  carryMesh.visible = false;
  root.add(carryMesh);

  root.userData = { oxLegs: legs, wheels, carryMesh };
  return root;
}

/**
 * High-Detail 2-Body-Width Ming & Wokou Siege Machinery (`<= 0.88m` wide -> passes 1.46m Gatehouse Archway!):
 * - `trebuchet`: 明军神机红衣/虎蹲炮车 (4 Spoked Artillery Wheels + Bronze Cannon + Ammo Chest)
 * - `ram`: 明军乌龟包铁冲车 (4 Spoked Wheels + Ribbed Iron-Tile Tortoise Shed + Swinging Bronze Ram)
 */
export function createSiegeEngine(type = 'trebuchet', team = 'player') {
  const root = new THREE.Group();
  const isEnemy = team === 'enemy';
  const bannerHex = isEnemy ? 0x7f1d1d : 0x94231d;
  const woodHex = isEnemy ? 0x3b281c : 0x6b4628;
  const wheels = [];

  const makeWheel = (r) => getCachedLowPolyPart(`mp_siege_wheel_${isEnemy ? 'e' : 'p'}_${r}`, () => {
    const pb = new PolyBuilder();
    pb.spokedWheel(0, 0, 0, r, 0.052, 10, 0x2c323a, woodHex, 0xa67c38);
    return pb.buildGeometry();
  });

  if (type === 'trebuchet') {
    for (const [wx, wz] of [[-0.40, 0.38], [0.40, 0.38], [-0.40, -0.38], [0.40, -0.38]]) {
      const w = makeWheel(0.19);
      w.position.set(wx, 0.19, wz);
      root.add(w);
      wheels.push(w);
    }

    const pb = new PolyBuilder();
    // Heavy Mortised Artillery Chassis + Iron Axle Straps + Twin Stepped Gun Cheeks!
    pb.boxY(0, 0.17, 0, 0.72, 0.09, 1.22, woodHex, { matId: VMAT.TIMBER });
    pb.cylinderAxis(0, 0.19,  0.38, 0.032, 0.032, 0.84, 8, 'x', 0x333840, { matId: VMAT.METAL });
    pb.cylinderAxis(0, 0.19, -0.38, 0.032, 0.032, 0.84, 8, 'x', 0x333840, { matId: VMAT.METAL });
    for (const sx of [-0.20, 0.20]) {
      pb.boxY(sx, 0.26, 0.04, 0.08, 0.32, 0.78, isEnemy ? 0x28262e : 0x73241d, { topScaleZ: 0.68, matId: VMAT.TIMBER });
      pb.boxY(sx, 0.56, 0.10, 0.095, 0.04, 0.18, 0x2c323a, { matId: VMAT.METAL }); // Trunnion capsquare
    }
    // Rear Ammunition Box, Stacked Iron Cannonballs & Command Pennant!
    pb.boxY(-0.16, 0.26, -0.44, 0.24, 0.16, 0.22, woodHex, { matId: VMAT.TIMBER });
    for (const [bx, by, bz] of [[0.14, 0.31, -0.42], [0.22, 0.31, -0.42], [0.18, 0.31, -0.49], [0.18, 0.38, -0.45]]) {
      pb.ellipsoid(bx, by, bz, 0.048, 0.048, 0.048, 0x2a2f36, { uSegs: 8, vSegs: 6, matId: VMAT.METAL });
    }
    pb.prismY(0.28, 0.26, -0.50, 0.020, 0.016, 0.90, 8, woodHex, { matId: VMAT.TIMBER });
    pb.boxY(0.28, 0.84, -0.62, 0.020, 0.28, 0.22, bannerHex, { matId: VMAT.PLASTER });
    root.add(pb.buildMeshGroup(true, true));

    // Pivoting 14-Segment Cast-Bronze Ming Cannon / Wokou Heavy Ozutsu (`armPivot`)!
    const ag = new PolyBuilder();
    const barrelHex = isEnemy ? 0x383e47 : 0xb5802c;
    const ringHex   = isEnemy ? 0x8f6624 : 0xd4a442;
    ag.ellipsoid(0, 0, -0.40, 0.055, 0.055, 0.065, barrelHex, { uSegs: 10, vSegs: 7, matId: VMAT.METAL }); // Cascabel knob
    ag.cylinderAxis(0, 0, 0.12, 0.145, 0.105, 1.02, 14, 'z', barrelHex, { endHex: 0x111317, matId: VMAT.METAL });
    ag.cylinderAxis(0, 0, 0.62, 0.105, 0.128, 0.08, 14, 'z', ringHex, { endHex: 0x111317, matId: VMAT.METAL }); // Flared muzzle swell!
    ag.cylinderAxis(0, 0, 0.06, 0.040, 0.040, 0.48, 10, 'x', ringHex, { matId: VMAT.METAL }); // Trunnions
    for (const rz of [-0.26, -0.02, 0.22, 0.44]) {
      const rr = 0.154 - (rz + 0.26) * 0.045;
      ag.cylinderAxis(0, 0, rz, rr, rr, 0.048, 14, 'z', ringHex, { matId: VMAT.METAL });
    }
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 0.56, 0.04);
    armPivot.add(ag.buildMeshGroup(true, true));
    armPivot.rotation.x = -0.20;
    root.add(armPivot);
    root.userData = { armPivot, wheels };
  } else {
    for (const [wx, wz] of [[-0.41, 0.40], [0.41, 0.40], [-0.41, -0.40], [0.41, -0.40]]) {
      const w = makeWheel(0.17);
      w.position.set(wx, 0.17, wz);
      root.add(w);
      wheels.push(w);
    }

    const pb = new PolyBuilder();
    pb.boxY(0, 0.16, 0, 0.76, 0.08, 1.28, woodHex, { matId: VMAT.TIMBER });
    for (const [px, pz] of [[-0.33, -0.48], [0.33, -0.48], [-0.33, 0.0], [0.33, 0.0], [-0.33, 0.48], [0.33, 0.48]]) {
      pb.prismY(px, 0.24, pz, 0.036, 0.033, 0.48, 10, isEnemy ? woodHex : 0x6e2920, { matId: VMAT.TIMBER });
    }
    // Sloped Armored Side-Skirts + High-Detail Ribbed Tortoise Roof!
    for (const sx of [-0.36, 0.36]) {
      pb.box(sx, 0.46, 0, 0.05, 0.38, 1.22, 0x3b424c, { rotZ: sx > 0 ? 0.16 : -0.16, matId: VMAT.METAL });
    }
    pb.chineseRoof(0, 0.70, 0, 0.88, 1.38, 0.34, isEnemy ? 0x262830 : 0x383e47, 0xb88636, {
      style: 'gable',
      cornerLift: 0.07,
      noFinial: true,
      gableWallHex: bannerHex,
    });
    root.add(pb.buildMeshGroup(true, true));

    // Swinging Iron-Hoop Battering Trunk + Sculpted Bronze Ram Head (`铜铸兽首撞木`)!
    const rg = new PolyBuilder();
    rg.cylinderAxis(0, 0, 0.04, 0.095, 0.095, 1.22, 12, 'z', 0x5c3e24, { matId: VMAT.TIMBER });
    for (const hz of [-0.32, 0.05, 0.40]) {
      rg.cylinderAxis(0, 0, hz, 0.104, 0.104, 0.045, 12, 'z', 0x2c323a, { matId: VMAT.METAL });
    }
    rg.cylinderAxis(0, 0, 0.72, 0.135, 0.095, 0.24, 12, 'z', isEnemy ? 0x64748b : 0xc89a3c, { matId: VMAT.METAL });
    // Suspension iron chains
    rg.prismY(0, 0.08, -0.26, 0.014, 0.014, 0.26, 6, 0x64748b, { matId: VMAT.METAL });
    rg.prismY(0, 0.08,  0.34, 0.014, 0.014, 0.26, 6, 0x64748b, { matId: VMAT.METAL });
    const ramLog = rg.buildMeshGroup(true, true);
    ramLog.position.set(0, 0.42, 0);
    root.add(ramLog);
    root.userData = { ramLog, wheels };
  }

  return root;
}

export function createSquadBanner(unitType, team = 'player') {
  const group = new THREE.Group();
  const isEnemy = team === 'enemy';

  const bpb = new PolyBuilder();
  bpb.prismY(0, 0, 0, 0.028, 0.020, 1.88, 10, isEnemy ? 0x38281e : 0x6e2920, { matId: VMAT.TIMBER });
  bpb.latheY(0, 1.88, 0, [[0.045, 0], [0.015, 0.09], [0.004, 0.15]], 8, 0xc89a3c, { matId: VMAT.METAL });
  const poleMesh = bpb.buildMeshGroup(true, false);

  const clothColors = {
    spearman: 0x3f6232,
    archer:   0x2b4c6b,
    swordsman: 0x8f241e,
    knight:   0xa86b24,
    trebuchet: 0x5b3256,
    ram:      0x8c3b22,
  };
  const clothHex = isEnemy ? 0x6e1a1a : (clothColors[unitType] || 0x8f241e);
  const cpb = new PolyBuilder();
  cpb.boxY(0, 1.38, 0.26, 0.028, 0.44, 0.50, clothHex, { matId: VMAT.PLASTER });
  cpb.boxY(0, 1.48, 0.24, 0.038, 0.22, 0.22, isEnemy ? 0x18181b : 0xc89a3c, { matId: VMAT.PLASTER });
  const cloth = cpb.buildMeshGroup(true, false);

  const ringGeo = new THREE.RingGeometry(0.44, 0.58, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isEnemy ? 0xb91c1c : 0xc89a3c,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.04 + Math.random() * 0.015;
  ring.userData.noOutline = true;

  group.add(poleMesh, cloth, ring);
  group.userData = { cloth, ring };
  return group;
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

export class VoxelDebrisSystem {
  constructor(scene, maxParticles = 260) {
    this.pool = [];
    for (let i = 0; i < maxParticles; i++) {
      const m = new THREE.Mesh(sharedDebrisGeo, stdMat(0xc4b9a5, 0.84, 0.02));
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

  burst(x, y, z, hexColor = 0xc4b9a5, count = 14, force = 1.0, size = 0.20) {
    const isEmissiveFire = hexColor === 0xff7700 || hexColor === 0xff8811 || hexColor === 0xff9922;
    const mat = isEmissiveFire
      ? new THREE.MeshBasicMaterial({ color: hexColor })
      : stdMat(hexColor, 0.84, 0.04);

    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
      p.mesh.material = mat;
      const s = size * (0.65 + Math.random() * 0.65);
      p.mesh.scale.set(s, s, s);
      p.mesh.position.set(
        x + (Math.random() - 0.5) * 0.55,
        y + Math.random() * 0.45,
        z + (Math.random() - 0.5) * 0.55
      );
      const angle = Math.random() * Math.PI * 2;
      const spd = (1.5 + Math.random() * 3.8) * force;
      p.vx = Math.cos(angle) * spd;
      p.vz = Math.sin(angle) * spd;
      p.vy = (2.8 + Math.random() * 4.2) * force;
      p.rx = (Math.random() - 0.5) * 11;
      p.rz = (Math.random() - 0.5) * 11;
      p.floorY = Math.max(0.08, y - 1.2);
      p.life = 0.85 + Math.random() * 0.65;
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
        p.mesh.scale.setScalar(Math.max(0.02, (p.life / 0.25) * 0.18));
      }
    }
  }
}
