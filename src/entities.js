import * as THREE from 'three';
import {
  PolyBuilder,
  getSharedVoxelMaterial,
  getSharedEmissiveMaterial,
} from './voxelEngine.js';
import { prefabs } from './voxelPrefabs.js';

const sharedDebrisGeo = new THREE.OctahedronGeometry(0.55, 0);

const stdCache = new Map();
function stdMat(hex, roughness = 0.76, metalness = 0.05) {
  const key = `${hex}_${roughness}_${metalness}`;
  if (!stdCache.has(key)) {
    stdCache.set(
      key,
      new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, flatShading: true })
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
    // East China Sea Wokou Raiders (黑紫具足 + 暗红战袍)
    return {
      skin: 0xebbfa0,
      cloth: 0x3b2d44,
      accent: 0x991b1b,
      armor: 0x272730,
      armorTrim: 0x7f1d1d,
      gold: 0xd97706,
      wood: 0x4a3222,
      steel: 0xcbd5e1,
    };
  }
  // Ming Dynasty Yongchang Militia & Qi-Style Troops (丹朱战袄 + 靛青甲裙 + 鎏金铜饰)
  return {
    skin: 0xf4c5a1,
    cloth: role === 'peasant' ? 0x47647d : 0xb91c1c,
    accent: role === 'peasant' ? 0x8c6239 : 0x1e3a8a,
    armor: 0xdbe2e8,
    armorTrim: 0x991b1b,
    gold: 0xfacc15,
    wood: 0x7c4d28,
    steel: 0xe2e8f0,
  };
}

// 1. Low-Poly Faceted Head + Ming Li-Kui Conical Helmet / Douli Bamboo Hat / Wokou Jingasa & Kabuto!
function buildHeadPart(role, isEnemy) {
  return getCachedLowPolyPart(`lp_head_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const pb = new PolyBuilder();

    // Sculpted octagonal low-poly head (y = 0..0.21) + eyes on +Z!
    pb.prismY(0, 0.01, 0, 0.105, 0.112, 0.19, 8, pal.skin);
    pb.boxY(0, 0.03, -0.05, 0.19, 0.16, 0.11, 0x29201b); // Dark hair at back
    const eyeHex = isEnemy ? 0xef4444 : 0x1e293b;
    pb.boxY(-0.045, 0.09, 0.105, 0.032, 0.032, 0.02, eyeHex);
    pb.boxY(0.045, 0.09, 0.105, 0.032, 0.032, 0.02, eyeHex);

    if (role === 'peasant') {
      // Wide Jiangnan Conical Woven-Bamboo Douli Hat (`江南竹编斗笠`)!
      pb.prismY(0, 0.17, 0, 0.24, 0.02, 0.13, 8, 0xdca842);
      pb.prismY(0, 0.16, 0, 0.245, 0.24, 0.018, 8, 0xb88628);
    } else if (role === 'lord') {
      if (!isEnemy) {
        // Clan Commander Wang Shuguo: Scholar-General Beard + Golden-Winged Ming Helmet (`乌纱鎏金翼善武冠`)!
        pb.boxY(0, -0.02, 0.09, 0.09, 0.08, 0.04, 0x1e293b, { topScaleX: 1.2 });
        pb.prismY(0, 0.18, 0, 0.13, 0.10, 0.12, 8, 0x1e293b);
        pb.prismY(0, 0.18, 0, 0.138, 0.132, 0.04, 8, pal.gold);
        pb.prismY(0, 0.30, 0, 0.05, 0.01, 0.12, 6, 0xdc2626); // Crimson general's tassel!
        // Upturned golden side wings (`乌纱展翅`)
        pb.box(-0.15, 0.25, -0.03, 0.10, 0.05, 0.03, pal.gold, { rotZ: 0.35 });
        pb.box(0.15, 0.25, -0.03, 0.10, 0.05, 0.03, pal.gold, { rotZ: -0.35 });
      } else {
        // Wokou Pirate Warlord Onimaru: Black-Lacquer Kabuto + Golden Crescent Kuwa-gata Horns!
        pb.prismY(0, 0.16, 0, 0.16, 0.09, 0.14, 8, 0x181820);
        pb.box(-0.12, 0.31, 0.08, 0.04, 0.18, 0.03, pal.gold, { rotZ: 0.42 });
        pb.box(0.12, 0.31, 0.08, 0.04, 0.18, 0.03, pal.gold, { rotZ: -0.42 });
        pb.boxY(0, 0.04, 0.105, 0.13, 0.08, 0.03, 0x991b1b); // Demon mask!
      }
    } else if (!isEnemy) {
      // Ming Soldiers: Iconic Conical Iron/Rattan Li-Kui (`明军红缨笠盔 / 铁兜鍪`)!
      const isHeavy = role === 'swordsman' || role === 'knight';
      const helmCol = isHeavy ? 0x94a3b8 : 0x475569;
      pb.prismY(0, 0.16, 0, isHeavy ? 0.18 : 0.22, 0.03, 0.13, 8, helmCol);
      pb.prismY(0, 0.16, 0, isHeavy ? 0.185 : 0.225, isHeavy ? 0.18 : 0.22, 0.02, 8, pal.gold);
      // Vibrant Red-Horsehair Tassel Plume (`大明朱缨`)!
      pb.prismY(0, 0.28, 0, 0.055, 0.015, 0.10, 6, 0xdc2626);
      if (isHeavy) {
        // Neck & cheek lamellar guards (`顿项护耳`)
        pb.boxY(-0.11, 0.03, -0.01, 0.03, 0.13, 0.14, 0x991b1b);
        pb.boxY(0.11, 0.03, -0.01, 0.03, 0.13, 0.14, 0x991b1b);
      }
    } else {
      // Enemy Wokou Raiders: Ronin Topknot (`swordsman`), Horned Kabuto (`knight`), or Black Jingasa (`spearman`/`archer`)!
      if (role === 'swordsman') {
        // Bareheaded Ronin topknot (`浪人月代头发髻`) + headband!
        pb.boxY(0, 0.16, 0, 0.21, 0.03, 0.21, 0x991b1b);
        pb.cylinderAxis(0, 0.23, -0.02, 0.032, 0.028, 0.12, 6, 'z', 0x18181b);
      } else if (role === 'knight') {
        pb.prismY(0, 0.16, 0, 0.17, 0.08, 0.13, 8, 0x7f1d1d);
        pb.box(-0.10, 0.29, 0.07, 0.03, 0.14, 0.03, pal.gold, { rotZ: 0.4 });
        pb.box(0.10, 0.29, 0.07, 0.03, 0.14, 0.03, pal.gold, { rotZ: -0.4 });
      } else {
        // Wide black-lacquered Ashigaru Jingasa cone (`足轻黑漆阵笠`)
        pb.prismY(0, 0.16, 0, 0.23, 0.02, 0.11, 8, 0x1e1e28);
        pb.boxY(0, 0.18, 0.10, 0.06, 0.04, 0.04, pal.gold);
      }
    }
    return pb.buildGeometry();
  });
}

// 2. Low-Poly Tapered Torso + Ming Brigandine / Breastplate Mirror (`护心镜`) / Wokou Sashimono Flag!
function buildTorsoPart(role, isEnemy) {
  return getCachedLowPolyPart(`lp_torso_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const pb = new PolyBuilder();

    // Flared Armored Skirt Tassets (`甲裙`, y = 0..0.11) + Tapered Chest (`胸甲`, y = 0.10..0.32)
    const skirtCol = role === 'peasant' ? pal.cloth : pal.accent;
    pb.boxY(0, 0.0, 0, 0.26, 0.11, 0.19, skirtCol, { topScaleX: 0.88, topScaleZ: 0.88 });
    pb.boxY(0, 0.10, 0, 0.23, 0.22, 0.17, pal.cloth, { topScaleX: 1.12, topScaleZ: 1.06 });
    // Waist belt + brass buckle
    pb.boxY(0, 0.09, 0, 0.25, 0.04, 0.185, 0x3b2314);
    pb.boxY(0, 0.09, 0.095, 0.05, 0.045, 0.02, pal.gold);

    if (!isEnemy && role !== 'peasant') {
      // Gleaming Ming Round Brass Heart-Protecting Mirror (`明军鎏金护心镜`) on chest!
      pb.cylinderAxis(0, 0.22, 0.092, 0.058, 0.058, 0.02, 8, 'z', pal.gold);
      if (role === 'knight' || role === 'lord') {
        // Flowing Ming Heroic Cape / Command Back-Pennant (`靠背旗 / 披风`)!
        pb.box(0, 0.14, -0.11, 0.24, 0.28, 0.03, 0x991b1b, { rotX: 0.14 });
      }
    } else if (isEnemy && (role === 'spearman' || role === 'knight')) {
      // Iconic Wokou Back Sashimono Banner (`倭寇背插指物旗`)!
      pb.prismY(0.0, 0.12, -0.11, 0.014, 0.012, 0.44, 5, pal.wood);
      pb.boxY(0.0, 0.32, -0.17, 0.02, 0.22, 0.13, pal.accent);
    }
    return pb.buildGeometry();
  });
}

function buildLegPart(role, isEnemy) {
  return getCachedLowPolyPart(`lp_leg_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const pb = new PolyBuilder();
    const legCol = role === 'peasant' ? 0x57534e : (isEnemy ? 0x27272a : 0x1e293b);
    // Hip pivot at y = 0 hanging down to y = -0.265
    pb.prismY(0, -0.22, 0, 0.042, 0.052, 0.22, 6, legCol);
    pb.boxY(0, -0.265, 0.015, 0.075, 0.05, 0.11, 0x291d14);
    return pb.buildGeometry();
  });
}

function buildLeftArmPart(role, isEnemy) {
  return getCachedLowPolyPart(`lp_larm_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const pb = new PolyBuilder();
    // Shoulder pivot at y = 0 hanging down to y = -0.23
    pb.prismY(0, -0.20, 0, 0.038, 0.046, 0.20, 6, pal.cloth);
    pb.prismY(0, -0.24, 0, 0.034, 0.036, 0.05, 6, pal.skin);

    if (!isEnemy && role === 'swordsman') {
      // Iconic Wenzhou Domed Woven-Rattan Shield (`温州圆弧黄藤牌`) held on left arm!
      pb.cylinderAxis(-0.04, -0.14, 0.08, 0.19, 0.14, 0.04, 8, 'x', 0xd49b38, { endHex: 0xb87e22 });
      pb.cylinderAxis(-0.065, -0.14, 0.08, 0.07, 0.03, 0.03, 8, 'x', 0xb91c1c);
    } else if (role === 'lord' && !isEnemy) {
      // Golden Bracer & Ancestral Seal
      pb.boxY(-0.02, -0.18, 0.03, 0.06, 0.09, 0.08, pal.gold);
    }
    return pb.buildGeometry();
  });
}

function buildRightArmPart(role, isEnemy) {
  return getCachedLowPolyPart(`lp_rarm_${role}_${isEnemy ? 'e' : 'p'}`, () => {
    const pal = getRolePalette(role, isEnemy);
    const pb = new PolyBuilder();
    pb.prismY(0, -0.20, 0, 0.038, 0.046, 0.20, 6, pal.cloth);
    pb.prismY(0, -0.24, 0, 0.034, 0.036, 0.05, 6, pal.skin);

    if (role === 'spearman') {
      if (!isEnemy) {
        // Qi Jiguang's Multi-Pronged Green Bamboo Langxian (`毛竹多枝狼筅`)!
        pb.cylinderAxis(0.02, -0.18, 0.34, 0.022, 0.016, 1.06, 6, 'z', 0x5c9e38);
        pb.cylinderAxis(0.02, -0.18, 0.89, 0.028, 0.004, 0.16, 5, 'z', pal.steel);
        // Bristling angled bamboo branches that tangle Wokou katanas!
        for (const [bz, rx, ry] of [[0.46, 0.45, 0.3], [0.58, -0.45, -0.3], [0.70, 0.42, -0.35], [0.78, -0.42, 0.35]]) {
          pb.box(0.02, -0.18, bz, 0.018, 0.26, 0.018, 0x74b843, { rotX: rx, rotZ: ry });
        }
      } else {
        // Wokou Yari Long Spear
        pb.cylinderAxis(0.02, -0.18, 0.32, 0.020, 0.018, 0.96, 6, 'z', pal.wood);
        pb.cylinderAxis(0.02, -0.18, 0.84, 0.028, 0.004, 0.18, 4, 'z', pal.steel);
      }
    } else if (role === 'archer') {
      if (!isEnemy) {
        // Ming Shenji Matchlock Arquebus (`大明神机火绳鸟铳`)!
        pb.boxY(0.01, -0.22, 0.06, 0.045, 0.06, 0.26, pal.wood);
        pb.cylinderAxis(0.01, -0.18, 0.30, 0.022, 0.018, 0.48, 6, 'z', 0x334155);
        pb.boxY(0.01, -0.15, 0.18, 0.025, 0.03, 0.03, 0xff8811, { emissive: true }); // Lit matchcord!
      } else {
        // Wokou Long Yumi Bow
        pb.box(0.02, -0.16, 0.18, 0.025, 0.56, 0.035, 0x7f1d1d, { rotX: 0.12 });
      }
    } else if (role === 'swordsman' || role === 'lord') {
      // Ming Curved Yanling Saber (`雁翎腰刀`) / Commander Jian vs Wokou Long Katana (`野太刀`)!
      const bladeLen = role === 'lord' ? 0.56 : (isEnemy ? 0.54 : 0.46);
      pb.boxY(0.01, -0.22, 0.06, 0.06, 0.05, 0.06, pal.gold); // Guard
      pb.box(0.01, -0.16, 0.08 + bladeLen * 0.5, 0.024, 0.052, bladeLen, pal.steel, {
        topScaleY: 0.5,
        rotX: -0.18,
      });
    } else if (role === 'knight') {
      // Ming Red-Tasseled Heavy Cavalry Lance (`红缨马槊`) vs Wokou Cavalry Naginata!
      pb.cylinderAxis(0.02, -0.18, 0.38, 0.024, 0.018, 1.12, 6, 'z', isEnemy ? pal.wood : 0x991b1b);
      pb.cylinderAxis(0.02, -0.18, 0.96, 0.036, 0.005, 0.20, 5, 'z', pal.steel);
      if (!isEnemy) {
        pb.prismY(0.02, -0.22, 0.84, 0.045, 0.02, 0.09, 6, 0xdc2626);
      }
    }
    return pb.buildGeometry();
  });
}

function buildWarhorseBodyPart(isEnemy) {
  return getCachedLowPolyPart(`lp_horse_${isEnemy ? 'e' : 'p'}`, () => {
    const pb = new PolyBuilder();
    const coat = isEnemy ? 0x27242c : 0xf1ede4; // Ming White-Dragon Steed vs Wokou Dark Steed!
    const cloth = isEnemy ? 0x7f1d1d : 0xb91c1c;
    // Faceted low-poly horse barrel, angled neck, chamfered muzzle, saddlecloth & tail!
    pb.boxY(0, 0.06, 0, 0.28, 0.26, 0.64, coat, { topScaleX: 0.92 });
    pb.boxY(0, 0.14, -0.02, 0.31, 0.20, 0.34, cloth);
    pb.box(0, 0.38, 0.28, 0.16, 0.32, 0.18, coat, { rotX: 0.42 });
    pb.box(0, 0.48, 0.42, 0.13, 0.13, 0.24, coat, { rotX: 0.28, topScaleX: 0.75 });
    pb.box(0, 0.56, 0.34, 0.15, 0.08, 0.14, isEnemy ? 0xd97706 : 0xfacc15, { rotX: 0.28 }); // Chamfron!
    pb.box(0, 0.18, -0.38, 0.08, 0.26, 0.10, 0x1e293b, { rotX: -0.35 });
    return pb.buildGeometry();
  });
}

function buildHorseLegPart(isEnemy) {
  return getCachedLowPolyPart(`lp_hleg_${isEnemy ? 'e' : 'p'}`, () => {
    const pb = new PolyBuilder();
    const coat = isEnemy ? 0x27242c : 0xe2dcd0;
    pb.prismY(0, -0.28, 0, 0.036, 0.046, 0.28, 5, coat);
    pb.prismY(0, -0.33, 0, 0.042, 0.038, 0.05, 5, 0x1e293b);
    return pb.buildGeometry();
  });
}

export function createVoxelHumanoid(role = 'peasant', team = 'player') {
  const root = new THREE.Group();
  const isEnemy = team === 'enemy';
  const scale = role === 'lord' ? 1.36 : 0.98;

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  let horseGroup = null;
  if (role === 'knight') {
    horseGroup = new THREE.Group();
    const horseBody = buildWarhorseBodyPart(isEnemy);
    horseBody.position.set(0, 0.28, 0);
    horseGroup.add(horseBody);

    const legs = [];
    [[-0.11, 0.22], [0.11, 0.22], [-0.11, -0.24], [0.11, -0.24]].forEach(([lx, lz]) => {
      const leg = buildHorseLegPart(isEnemy);
      leg.position.set(lx, 0.33, lz);
      horseGroup.add(leg);
      legs.push(leg);
    });
    horseGroup.userData.legs = legs;
    root.add(horseGroup);
    bodyGroup.position.set(0, 0.33, -0.02);
  }

  const torso = buildTorsoPart(role, isEnemy);
  torso.position.set(0, 0.28, 0);
  bodyGroup.add(torso);

  const head = buildHeadPart(role, isEnemy);
  head.position.set(0, 0.61, 0);
  bodyGroup.add(head);

  const leftLeg = buildLegPart(role, isEnemy);
  const rightLeg = buildLegPart(role, isEnemy);
  if (role === 'knight') {
    leftLeg.position.set(-0.20, 0.29, 0.01);
    rightLeg.position.set(0.20, 0.29, 0.01);
    leftLeg.rotation.x = -0.42;
    rightLeg.rotation.x = -0.42;
  } else {
    leftLeg.position.set(-0.076, 0.265, 0);
    rightLeg.position.set(0.076, 0.265, 0);
  }
  bodyGroup.add(leftLeg, rightLeg);

  const leftArm = buildLeftArmPart(role, isEnemy);
  leftArm.position.set(-0.16, 0.56, 0);
  const rightArm = buildRightArmPart(role, isEnemy);
  rightArm.position.set(0.16, 0.56, 0);
  bodyGroup.add(leftArm, rightArm);

  let carryMesh = null;
  if (role === 'peasant') {
    carryMesh = new THREE.Mesh(prefabs.getCargoGeometryEntry('wood').geo, getSharedVoxelMaterial());
    carryMesh.scale.setScalar(0.82);
    carryMesh.position.set(0, 0.36, 0.22);
    carryMesh.castShadow = true;
    carryMesh.visible = false;
    bodyGroup.add(carryMesh);
  }

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

// Floating Ming Golden Commander's Seal & Canopy (`永昌鎏金帅印宝盖`) above garrisoned buildings!
export function createBuildingLordCrown(team = 'player') {
  const isEnemy = team === 'enemy';
  return getCachedLowPolyPart(`lp_lord_seal_${isEnemy ? 'e' : 'p'}`, () => {
    const pb = new PolyBuilder();
    const gold = isEnemy ? 0xf59e0b : 0xfacc15;
    const crimson = isEnemy ? 0x7f1d1d : 0xdc2626;
    // Square Ming Jade-and-Gold Commander Seal (`大明将军金印`) + Mini Swept Pavilion Canopy!
    pb.boxY(0, 0.0, 0, 0.36, 0.14, 0.36, gold);
    pb.boxY(0, 0.14, 0, 0.22, 0.10, 0.22, crimson);
    pb.chineseRoof(0, 0.24, 0, 0.52, 0.52, 0.22, gold, crimson, {
      style: 'pavilion',
      sides: 4,
      cornerLift: 0.08,
      finialHex: 0xfff3b0,
    });
    pb.prismY(0, 0.44, 0, 0.06, 0.01, 0.12, 6, 0xfff3b0, { emissive: true });
    return pb.buildGeometry();
  });
}

// Low-Poly Jiangnan Slate-Grey Water Buffalo & Flatbed Stone Cart (`江南青水牛拉石车`)!
export function createQuarryOxCart() {
  const root = new THREE.Group();

  const oxBody = getCachedLowPolyPart('lp_water_buffalo', () => {
    const pb = new PolyBuilder();
    // Muscular slate-grey water buffalo barrel, lowered head & wide sweeping crescent horns!
    pb.boxY(0, 0.0, 0.38, 0.28, 0.25, 0.52, 0x475569, { topScaleX: 0.92 });
    pb.boxY(0, 0.04, 0.68, 0.20, 0.18, 0.20, 0x334155);
    pb.boxY(0, 0.02, 0.80, 0.16, 0.11, 0.10, 0x64748b);
    // Iconic wide curved Chinese water-buffalo horns (`弯月水牛角`)!
    pb.box(-0.16, 0.18, 0.68, 0.18, 0.04, 0.05, 0xe2e8f0, { rotZ: -0.28, rotY: 0.25 });
    pb.box(0.16, 0.18, 0.68, 0.18, 0.04, 0.05, 0xe2e8f0, { rotZ: 0.28, rotY: -0.25 });
    return pb.buildGeometry();
  });
  oxBody.position.set(0, 0.25, 0.0);
  root.add(oxBody);

  const legs = [];
  [[-0.12, 0.58], [0.12, 0.58], [-0.12, 0.20], [0.12, 0.20]].forEach(([lx, lz]) => {
    const leg = getCachedLowPolyPart('lp_buffalo_leg', () => {
      const pb = new PolyBuilder();
      pb.prismY(0, -0.25, 0, 0.036, 0.044, 0.25, 5, 0x334155);
      return pb.buildGeometry();
    });
    leg.position.set(lx, 0.25, lz);
    root.add(leg);
    legs.push(leg);
  });

  const wagon = getCachedLowPolyPart('lp_stone_wagon', () => {
    const pb = new PolyBuilder();
    pb.boxY(0, 0.15, -0.24, 0.46, 0.05, 0.64, 0x9c6b3b);
    pb.boxY(-0.21, 0.20, -0.24, 0.04, 0.07, 0.64, 0x7c4d28);
    pb.boxY(0.21, 0.20, -0.24, 0.04, 0.07, 0.64, 0x7c4d28);
    // Twin wooden shafts extending forward to buffalo yoke
    pb.boxY(-0.15, 0.22, 0.24, 0.035, 0.035, 0.44, 0x6e4228);
    pb.boxY(0.15, 0.22, 0.24, 0.035, 0.035, 0.44, 0x6e4228);
    for (const [wx, wz] of [[-0.26, -0.06], [0.26, -0.06], [-0.26, -0.42], [0.26, -0.42]]) {
      pb.cylinderAxis(wx, 0.14, wz, 0.14, 0.14, 0.045, 8, 'x', 0x5c3a21, { endHex: 0x94a3b8 });
    }
    return pb.buildGeometry();
  });
  root.add(wagon);

  const carryMesh = getCachedLowPolyPart('lp_ox_granite_load', () => {
    const pb = new PolyBuilder();
    pb.boxY(-0.09, 0.0, -0.10, 0.16, 0.12, 0.22, 0xdbe2e8);
    pb.boxY(0.09, 0.0, -0.10, 0.16, 0.12, 0.22, 0xcbd5e1);
    pb.boxY(0.0, 0.0, 0.13, 0.30, 0.12, 0.20, 0xe2e8f0);
    pb.boxY(0.0, 0.12, 0.0, 0.24, 0.11, 0.28, 0xf1f5f9);
    return pb.buildGeometry();
  });
  carryMesh.position.set(0, 0.20, -0.24);
  carryMesh.visible = false;
  root.add(carryMesh);

  root.userData = { oxLegs: legs, carryMesh };
  return root;
}

/**
 * 2-Body-Width Low-Poly Siege Engines (`<= 0.89m` wide -> passes 1.50m Yongchang Qiaolou Gate with ease!):
 * - `trebuchet`: 明军红衣/虎蹲重炮车 (Player) vs 倭寇焙烙大筒车 (Enemy)
 * - `ram`: 明军乌龟包铁冲车 (Player) vs 倭寇安宅旱船破城槌 (Enemy)
 */
export function createSiegeEngine(type = 'trebuchet', team = 'player') {
  const root = new THREE.Group();
  const isEnemy = team === 'enemy';
  const bannerHex = isEnemy ? 0x991b1b : 0xdc2626;
  const woodHex = isEnemy ? 0x3f2b1d : 0x8c5830;

  if (type === 'trebuchet') {
    const pb = new PolyBuilder();
    // 4 Iron-Rimmed Low-Poly Artillery Wheels (total width = 0.86m <= 2 body-widths!)
    for (const [wx, wz] of [[-0.40, 0.38], [0.40, 0.38], [-0.40, -0.38], [0.40, -0.38]]) {
      pb.cylinderAxis(wx, 0.18, wz, 0.18, 0.18, 0.055, 8, 'x', 0x475569, { endHex: woodHex });
    }
    pb.boxY(0, 0.16, 0, 0.72, 0.10, 1.18, woodHex);
    pb.boxY(-0.24, 0.26, 0, 0.08, 0.34, 0.76, isEnemy ? 0x272730 : 0x991b1b, { topScaleZ: 0.7 });
    pb.boxY(0.24, 0.26, 0, 0.08, 0.34, 0.76, isEnemy ? 0x272730 : 0x991b1b, { topScaleZ: 0.7 });
    // Stacked iron shells on rear rack + war banner!
    pb.facetedBlob(0, 0.32, -0.44, 0.11, 0.11, 0.11, 0x334155, 7, 0.05);
    pb.prismY(0.28, 0.26, -0.46, 0.02, 0.016, 0.85, 5, woodHex);
    pb.boxY(0.28, 0.82, -0.58, 0.02, 0.26, 0.22, bannerHex);
    root.add(pb.buildMeshGroup(true, true));

    // Pivoting Heavy Cast-Bronze Ming Cannon / Wokou Ozutsu Mortar (`armPivot`)!
    const ag = new PolyBuilder();
    const barrelHex = isEnemy ? 0x334155 : 0xc98a2c;
    ag.cylinderAxis(0, 0.0, 0.16, 0.15, 0.11, 0.96, 8, 'z', barrelHex, { endHex: 0x0f172a });
    ag.cylinderAxis(0, 0.0, -0.14, 0.168, 0.168, 0.07, 8, 'z', 0xfacc15);
    ag.cylinderAxis(0, 0.0, 0.22, 0.148, 0.148, 0.06, 8, 'z', 0xfacc15);
    ag.cylinderAxis(0, 0.0, 0.54, 0.132, 0.132, 0.06, 8, 'z', 0xfacc15);
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 0.56, 0.0);
    armPivot.add(ag.buildMeshGroup(true, true));
    armPivot.rotation.x = -0.22;
    root.add(armPivot);
    root.userData.armPivot = armPivot;
  } else {
    // Swept-Roof Armored Siege Ram (`明军包铁冲车` vs `倭寇旱船撞槌`, 0.88m wide!)
    const pb = new PolyBuilder();
    for (const [wx, wz] of [[-0.41, 0.40], [0.41, 0.40], [-0.41, -0.40], [0.41, -0.40]]) {
      pb.cylinderAxis(wx, 0.17, wz, 0.17, 0.17, 0.05, 8, 'x', 0x334155, { endHex: woodHex });
    }
    pb.boxY(0, 0.16, 0, 0.76, 0.08, 1.24, woodHex);
    for (const [px, pz] of [[-0.32, -0.46], [0.32, -0.46], [-0.32, 0.46], [0.32, 0.46]]) {
      pb.prismY(px, 0.24, pz, 0.036, 0.032, 0.46, 5, isEnemy ? woodHex : 0x991b1b);
    }
    // Swept Chinese Iron-Clad Shed Roof!
    pb.chineseRoof(0, 0.68, 0, 0.88, 1.34, 0.34, isEnemy ? 0x262833 : 0x334155, 0xfacc15, {
      style: 'gable',
      cornerLift: 0.08,
      noFinial: true,
      gableWallHex: bannerHex,
    });
    root.add(pb.buildMeshGroup(true, true));

    // Swinging Bronze-Headed Battering Log (`铜首破城撞木`)!
    const rg = new PolyBuilder();
    rg.cylinderAxis(0, 0, 0.05, 0.09, 0.09, 1.16, 7, 'z', 0x6e472b);
    rg.cylinderAxis(0, 0, 0.68, 0.125, 0.09, 0.22, 8, 'z', isEnemy ? 0x94a3b8 : 0xfacc15);
    const ramLog = rg.buildMeshGroup(true, true);
    ramLog.position.set(0, 0.42, 0);
    root.add(ramLog);
    root.userData.ramLog = ramLog;
  }

  return root;
}

export function createSquadBanner(unitType, team = 'player') {
  const group = new THREE.Group();
  const isEnemy = team === 'enemy';

  // Low-Poly Ming Serrated Command Flag (`大明军旗`) vs Wokou Sashimono!
  const bpb = new PolyBuilder();
  bpb.prismY(0, 0, 0, 0.032, 0.024, 1.82, 6, isEnemy ? 0x38281e : 0x991b1b);
  bpb.prismY(0, 1.82, 0, 0.05, 0.008, 0.14, 5, 0xfacc15);
  const poleMesh = bpb.buildMeshGroup(true, false);

  const clothColors = {
    spearman: 0x15803d,
    archer: 0x0369a1,
    swordsman: 0xb91c1c,
    knight: 0xd97706,
    trebuchet: 0x7e22ce,
    ram: 0xc2410c,
  };
  const clothHex = isEnemy ? 0x7f1d1d : (clothColors[unitType] || 0xb91c1c);
  const cpb = new PolyBuilder();
  cpb.boxY(0, 1.34, 0.28, 0.035, 0.44, 0.54, clothHex);
  cpb.boxY(0, 1.44, 0.26, 0.048, 0.22, 0.22, isEnemy ? 0x18181b : 0xfacc15);
  const cloth = cpb.buildMeshGroup(true, false);

  const ringGeo = new THREE.RingGeometry(0.46, 0.62, 20);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isEnemy ? 0xef4444 : 0xfacc15,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05 + Math.random() * 0.015;
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
      const m = new THREE.Mesh(sharedDebrisGeo, stdMat(0xd6d3cd, 0.80, 0.02));
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

  burst(x, y, z, hexColor = 0xd6d3cd, count = 14, force = 1.0, size = 0.22) {
    const isEmissiveFire = hexColor === 0xff7700 || hexColor === 0xff8811 || hexColor === 0xff9922;
    const mat = isEmissiveFire
      ? new THREE.MeshBasicMaterial({ color: hexColor })
      : stdMat(hexColor, 0.80, 0.04);

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
        p.mesh.scale.setScalar(Math.max(0.02, (p.life / 0.25) * 0.20));
      }
    }
  }
}
