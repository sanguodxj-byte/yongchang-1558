import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sfx } from './audio.js';
import { createVoxelMaterials } from './voxelTextures.js';
import { voxelShaderTime } from './voxelEngine.js';
import { DioramaPostFx, atmosphereTime } from './dioramaRenderer.js';
import { generateAll3DIcons } from './iconStudio.js';
import {
  createVoxelHumanoid,
  createBuildingLordCrown,
  createQuarryOxCart,
  createSiegeEngine,
  createSquadBanner,
  setWorkerCarryItem,
  VoxelDebrisSystem,
} from './entities.js';
import {
  GRID_W,
  GRID_H,
  BUILDINGS,
  gridToWorld,
  worldToGrid,
  getGridLine,
  VoxelWorld,
} from './mapAndBuild.js';
import {
  FlowField25D,
  Pathfinder25D,
  SpatialHashGrid,
  evaluateStepCost,
} from './flowField.js';

function lerpAngle(cur, target, t) {
  let diff = ((target - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return cur + diff * Math.min(1, t);
}

export const UNIT_SPECS = {
  spearman: {
    name: '毛竹狼筅乡勇', count: 4, popCost: 2,
    cost: { wood: 4, gold: 18 },
    hp: 96, dmg: 16, range: 1.45, speed: 3.4, cooldown: 0.92,
    siegeDmg: 11,
  },
  archer: {
    name: '神机鸟铳手', count: 4, popCost: 2,
    cost: { bows: 2, gold: 28 },
    hp: 74, dmg: 17, range: 8.5, speed: 3.1, cooldown: 1.18,
    siegeDmg: 5, isRanged: true,
  },
  swordsman: {
    name: '温州藤牌刀兵', count: 4, popCost: 2,
    cost: { armor: 2, gold: 44 },
    hp: 195, dmg: 26, range: 1.32, speed: 2.7, cooldown: 0.90,
    siegeDmg: 20, arrowResist: 0.45,
  },
  knight: {
    name: '武状元宗族铁骑', count: 3, popCost: 2,
    cost: { armor: 2, gold: 68 },
    hp: 245, dmg: 35, range: 1.55, speed: 5.0, cooldown: 0.84,
    siegeDmg: 25,
  },
  trebuchet: {
    name: '明军虎蹲炮车', count: 1, popCost: 1,
    cost: { wood: 14, stone: 12, gold: 82 },
    hp: 380, dmg: 75, range: 16.5, speed: 1.6, cooldown: 3.9,
    siegeDmg: 180, isRanged: true, isSiege: true,
  },
  ram: {
    name: '乌龟包铁冲车', count: 1, popCost: 1,
    cost: { wood: 12, armor: 1, gold: 58 },
    hp: 650, dmg: 24, range: 1.75, speed: 1.98, cooldown: 1.7,
    siegeDmg: 140, isSiege: true, arrowResist: 0.78,
  },
};

const WOLF_TAUNTS = {
  start: '【嘉靖戊午·1558】宗长王叔果：“先叔王沛、堂兄王德殉国卫乡！今合族筑永昌石堡、开堡内水田，誓与父老死守桑梓！”',
  wave1: '【第一幕·戊午初警】倭酋黑鲨鬼丸：“东海浪人听令！趁他们永昌石垣未合，涉过浅滩洗劫永嘉场！”',
  wave2: '【第二幕·水陆合围】黑鲨鬼丸：“推旱船破城槌猛撞迎川谯楼，奇兵自北湾水道偷袭侧翼！”',
  wave3: '【第三幕·困城观稼】史载名局：倭寇架焙烙大筒窥探堡内——若水田充盈，则敌胆寒而我军士气倍增！',
  wave4: '【第四幕·烽火平海】宗长王叔果：“燃空心敌台烽火！狼筅居前、藤牌护翼、鸟铳齐发，焚毁东海倭寇安宅船寨！”',
  underAttack: '黑鲨鬼丸：“怎么可能？！小小民间乡堡竟练出如此精兵反攻我的安宅巨舰本阵？！死守水寨！！”',
};

class VoxelStrongholdGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    // Offscreen HalfFloat MSAA Composer handles antialiasing cleanly (same architecture as My Civilization!)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.dayHorizon = new THREE.Color('#2a7aa3');
    this.nightHorizon = new THREE.Color('#182a46');
    this.scene.background = this.dayHorizon.clone();
    this.scene.fog = new THREE.Fog('#3889b0', 68, 128);

    // Studio PMREM sky sheen (exact match to My Civilization scene.ts!)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    roomEnv.dispose();
    pmrem.dispose();

    // 2.5D Orthographic Isometric Diorama Camera (Clash of Clans + My Civilization feel!)
    this.frustumSize = 15.8;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera = new THREE.OrthographicCamera(
      (-this.frustumSize * aspect) / 2,
      (this.frustumSize * aspect) / 2,
      this.frustumSize / 2,
      -this.frustumSize / 2,
      0.5,
      155
    );
    this.camTarget = new THREE.Vector3(-16.5, 0.5, 0.2);
    this.camDesiredTarget = this.camTarget.clone();
    this.camYaw = -0.52;
    this.camDesiredYaw = this.camYaw;

    // Calibrated 3/4 Golden-Hour Diorama Key-to-Fill Lighting Rig (opengame-lighting: crisp sunlit vs cool sky shade!)
    this.ambientLight = new THREE.AmbientLight('#fff4e3', 0.13);
    this.hemiLight = new THREE.HemisphereLight('#cfeaff', '#5d7a49', 0.46);
    this.sunLight = new THREE.DirectionalLight('#fff0d2', 1.82);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.radius = 2.8;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 98;
    const d = 26;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.046;

    this.rimLight = new THREE.DirectionalLight('#bde0ff', 0.55);
    this.rimLight.position.set(16, 18, -18);

    this.scene.add(this.ambientLight, this.hemiLight, this.sunLight, this.sunLight.target, this.rimLight);

    // Fixed Pool of 6 Practical Warm Torch/Brazier PointLights created at boot (zero shader recompiles!)
    this.practicalLights = [];
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight('#ff9436', 0.0, 9.5, 1.8);
      pl.position.set(0, -20, 0);
      this.scene.add(pl);
      this.practicalLights.push(pl);
    }
    this.camShake = 0;
    this.floatTexts = [];

    this.postFx = new DioramaPostFx(this.renderer, this.scene, this.camera, window.innerWidth, window.innerHeight);

    this.mats = createVoxelMaterials();
    this.debris = new VoxelDebrisSystem(this.scene, 320);
    this.world = new VoxelWorld(this.scene, this.mats, this.debris);
    this.world.onStructureDestroyed = (struct) => this.handleStructureDestroyed(struct);
    this.icons = generateAll3DIcons(this.renderer, this.mats);

    // High-DPI 2D Overlay Canvas for Crisp Non-Clipping Floating Health Bars!
    this.hudCanvas = document.getElementById('world-hud-canvas');
    this.hudCtx = this.hudCanvas ? this.hudCanvas.getContext('2d') : null;
    this.projVec = new THREE.Vector3();
    this.resizeHudCanvas();
    this.devMode = new URLSearchParams(window.location.search).get('dev') === '1';
    this.fpsSmoothed = 60;

    // 2.5D Hybrid RTS Navigation Engine: Continuous FlowFields + String-Pulled A* + SpatialHashGrid!
    this.flowToPlayer = new FlowField25D(GRID_W, GRID_H);
    this.flowToEnemy = new FlowField25D(GRID_W, GRID_H);
    this.pathfinder = new Pathfinder25D(GRID_W, GRID_H);
    this.spatialGrid = new SpatialHashGrid(-GRID_W / 2 - 2, -GRID_H / 2 - 2, GRID_W + 4, GRID_H + 4, 2.0, 512);
    this.crowdDensity = new Float32Array(GRID_W * GRID_H);
    this.flowCrowdRefreshTimer = 0;
    this.navStats = { frameMs: 0, repaths: 0, sidesteps: 0, stuckNow: 0 };
    this.cachedLayoutVer = -1;

    // Generous starter stockpile for building up from a single basic castle!
    this.res = {
      wood: 92,
      stone: 85,
      food: 70,
      iron: 18,
      oil: 16,
      gold: 210,
      bows: 6,
      armor: 4,
      peasants: 8,
      maxPop: 28,
    };
    this.taxPolicy = 'balanced';
    this.peasantSpawnTimer = 3.2;
    this.econTickTimer = 1.0;

    // 75s Day 1 preparation timer so players can comfortably build workshops & walls from scratch!
    this.wave = 1;
    this.isNight = false;
    this.phaseTimer = 75.0;
    this.dayDuration = 70.0;
    this.nightDuration = 36.0;
    this.timeScale = 1.0;
    this.tacticalSlowMo = false;
    this.gameOver = false;

    this.workers = [];
    this.campfirePeasantMeshes = [];
    this.squads = [];
    this.units = [];
    this.projectiles = [];
    this.playerLord = null;
    this.enemyLord = null;
    this.stance = 'defend';
    this.wolfPanicked = false;

    this.selectedBuild = null;
    this.buildRotSteps = 0;
    this.lastHoverCoords = [];
    this.isPointerDown = false;
    this.isRightPanning = false;
    this.rightDownScreen = { x: 0, y: 0 };
    this.lastPointerScreen = { x: 0, y: 0 };
    this.dragStartGrid = null;
    this.dragCurrentGrid = null;
    this.draggingSquad = null;
    this.draggingLord = false;
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.dragLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
    this.dragLine.visible = false;
    this.scene.add(this.dragLine);

    this.airdropsUsed = 0;
    this.emergencyGuardUsed = false;
    this.clanSteleWallsUnlocked = false;
    this.clanSteleMartialUnlocked = false;
    this.fortressPaddyUnlocked = false;
    this.scoutLines = [];

    // Menu flow: 'title' -> 'main' -> 'play' <-> 'pause'. While not 'play', simulation dt is 0
    // (ambient life / camera keep breathing via rawDt so the backdrop stays alive).
    this.menuState = 'title';
    this.pendingIntroTaunt = true;

    this.spawnInitialForces();
    this.syncCampfirePeasants();
    this.initDioramaAmbientLife();
    this.world.updateStockpileVisuals(this.res);
    this.refreshFlowFields();
    this.bindUI();
    this.bindMenus();
    this.bindInput();
    this.updateHUD();

    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  refreshFlowFields(dt = 0) {
    this.flowCrowdRefreshTimer -= dt;
    const periodicDue = this.flowCrowdRefreshTimer <= 0;

    const pGoal = this.playerLord && this.playerLord.hp > 0
      ? worldToGrid(this.playerLord.x, this.playerLord.z)
      : (this.world.playerKeep ? { gx: this.world.playerKeep.gx + 1, gz: this.world.playerKeep.gz + 1 } : null);
    const eGoal = this.enemyLord && this.enemyLord.hp > 0
      ? worldToGrid(this.enemyLord.x, this.enemyLord.z)
      : (this.world.enemyKeep ? { gx: this.world.enemyKeep.gx, gz: this.world.enemyKeep.gz + 1 } : null);

    const pKey = pGoal ? `${this.world.layoutVersion}_${pGoal.gx >> 1}_${pGoal.gz >> 1}` : '';
    const eKey = eGoal ? `${this.world.layoutVersion}_${eGoal.gx >> 1}_${eGoal.gz >> 1}` : '';

    if (pGoal && (this.cachedPlayerFlowKey !== pKey || (periodicDue && this.isNight))) {
      const t0 = performance.now();
      this.cachedPlayerFlowKey = pKey;
      this.flowToPlayer.compute(this.world, pGoal.gx, pGoal.gz, 'enemy', this.crowdDensity);
      this.pathfinder.lastFrameMs += performance.now() - t0;
    }
    if (eGoal && (this.cachedEnemyFlowKey !== eKey || (periodicDue && this.stance === 'attack'))) {
      const t0 = performance.now();
      this.cachedEnemyFlowKey = eKey;
      this.flowToEnemy.compute(this.world, eGoal.gx, eGoal.gz, 'player', this.crowdDensity);
      this.pathfinder.lastFrameMs += performance.now() - t0;
    }
    if (periodicDue) {
      this.flowCrowdRefreshTimer = 0.75;
    }
  }

  // Calibrated to Unified Body-Width Spec (1 body-width = 0.48m, largest unit <= 2 body-widths = 0.88m!)
  getEntityRadius(ent) {
    if (!ent) return 0.24;
    if (ent.isSiege) return 0.44;     // Diameter 0.88m (<= 2 body-widths! Passes 1.52m gate with +0.64m room!)
    if (ent.isOx) return 0.36;        // Diameter 0.72m (~1.5 body-widths)
    if (ent.role === 'knight') return 0.34;
    if (ent.isLord) return 0.31;
    if (ent.isPeasantIdle) return 0.22;
    if (ent.isCivilian) return 0.23;
    return 0.24;                      // Infantry diameter 0.48m (= 1.0 body-width!)
  }

  // Smoothly aligns wide units (Siege Ram, Trebuchet, Ox-Cart, Knights) with the center of a friendly 2-body-width Gatehouse!
  applyGateFunnelSteering(ent, nx, nz) {
    const team = ent.team || 'player';
    for (let i = 0; i < this.world.structures.length; i++) {
      const s = this.world.structures[i];
      if (!s || s.hp <= 0 || s.type !== 'gate' || s.team !== team) continue;
      const dx = s.x - ent.x;
      const dz = s.z - ent.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.85) continue;
      if (dx * nx + dz * nz < -0.15) continue; // Already passed the gate center!

      const axis = s.gateAxis || 'ns';
      if (axis === 'ns') {
        // Passage runs along X; gently center Z toward s.z
        const zErr = THREE.MathUtils.clamp(dz, -0.75, 0.75);
        nz += zErr * 0.85;
      } else {
        // Passage runs along Z; gently center X toward s.x
        const xErr = THREE.MathUtils.clamp(dx, -0.75, 0.75);
        nx += xErr * 0.85;
      }
      const l = Math.hypot(nx, nz) || 1;
      return { nx: nx / l, nz: nz / l };
    }
    return { nx, nz };
  }

  getEntityInvMass(ent) {
    if (!ent) return 1.0;
    if (ent.isSiege) return 0.14;
    if (ent.isLord) return 0.30;
    if (ent.role === 'knight') return 0.36;
    if (ent.isOx) return 0.38;
    if (ent.isPeasantIdle) return 1.35;
    if (ent.isCivilian) return 1.05;
    return 0.85;
  }

  snapEntityGroundY(ent, radius, dt) {
    const gy = this.world.getElevationAtWorld(ent.x, ent.z, radius);
    if (gy > ent.y) {
      // Snap upward briskly on steps so feet/hooves/wheels NEVER clip into uphill risers!
      ent.y = Math.max(gy - 0.015, THREE.MathUtils.lerp(ent.y, gy, Math.min(1, dt * 26)));
    } else {
      ent.y = THREE.MathUtils.lerp(ent.y, gy, Math.min(1, dt * 15));
    }
  }

  rebuildSpatialAndCrowdGrids() {
    this.spatialGrid.clear();
    this.crowdDensity.fill(0);
    const addBody = (b, weight) => {
      this.spatialGrid.insert(b, b.x, b.z);
      const gx = Math.floor(b.x + GRID_W * 0.5);
      const gz = Math.floor(b.z + GRID_H * 0.5);
      if (gx >= 0 && gx < GRID_W && gz >= 0 && gz < GRID_H) {
        this.crowdDensity[gz * GRID_W + gx] += weight;
      }
    };
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.hp <= 0 || u.garrisonBuilding || u.garrisonWall) continue;
      addBody(u, u.isSiege ? 2.2 : 1.0);
    }
    for (let i = 0; i < this.workers.length; i++) {
      const w = this.workers[i];
      if (!w.home || w.home.hp <= 0) continue;
      addBody(w, w.isOx ? 1.5 : 0.7);
    }
    if (this.campfirePeasants) {
      for (let i = 0; i < this.campfirePeasants.length; i++) {
        addBody(this.campfirePeasants[i], 0.5);
      }
    }
  }

  spawnFloatText(wx, wy, wz, text, color = '#fef08a') {
    if (this.floatTexts.length > 24) this.floatTexts.shift();
    this.floatTexts.push({ wx, wy, wz, text, color, age: 0, maxAge: 1.45 });
  }

  initDioramaAmbientLife() {
    // 1. Soft Billowy Chimney Smoke & Campfire Rising Embers Pool!
    this.smokeParticles = [];
    const smokeGeo = new THREE.BoxGeometry(1, 1, 1);
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.95,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.5, 0.35) });

    for (let i = 0; i < 42; i++) {
      const isEmber = i < 14;
      const m = new THREE.Mesh(smokeGeo, isEmber ? emberMat : smokeMat);
      m.visible = false;
      m.userData.noOutline = true;
      this.scene.add(m);
      this.smokeParticles.push({
        mesh: m,
        isEmber,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        age: 0, life: 0, baseSize: 0.1,
      });
    }
    this.smokeCursor = 0;
    this.smokeEmitTimer = 0;

    // 2. Graceful Soaring Valley White Birds (casting soft moving shadows across the river valley!)
    this.birds = [];
    const wingGeo = new THREE.BoxGeometry(0.28, 0.035, 0.11);
    wingGeo.translate(0.14, 0, 0);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });

    for (let i = 0; i < 6; i++) {
      const bird = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.24), wingMat);
      const wingL = new THREE.Mesh(wingGeo, wingMat);
      wingL.scale.x = -1;
      const wingR = new THREE.Mesh(wingGeo, wingMat);
      body.castShadow = true;
      bird.add(body, wingL, wingR);
      bird.userData = { wingL, wingR, noOutline: true };
      bird.traverse((c) => { c.userData.noOutline = true; });
      this.scene.add(bird);
      this.birds.push({
        group: bird,
        cx: -6 + (i % 3) * 10,
        cz: -5 + Math.floor(i / 3) * 9,
        rx: 7.5 + (i % 2) * 3.5,
        rz: 5.5 + (i % 3) * 2.2,
        alt: 8.2 + (i % 3) * 1.1,
        angle: (i / 6) * Math.PI * 2,
        speed: 0.34 + (i % 3) * 0.06,
        flapPhase: i * 1.3,
      });
    }
  }

  updateDioramaAmbientLife(rawDt) {
    const now = performance.now() * 0.001;

    // 1. Update Soaring Valley Birds
    if (this.birds) {
      for (let i = 0; i < this.birds.length; i++) {
        const b = this.birds[i];
        b.angle += rawDt * b.speed;
        b.flapPhase += rawDt * 8.5;
        const bx = b.cx + Math.cos(b.angle) * b.rx;
        const bz = b.cz + Math.sin(b.angle) * b.rz;
        const by = b.alt + Math.sin(b.angle * 2.0) * 0.45;
        const tx = -Math.sin(b.angle) * b.rx;
        const tz = Math.cos(b.angle) * b.rz;
        b.group.position.set(bx, by, bz);
        b.group.rotation.y = Math.atan2(tx, tz);
        const flap = Math.sin(b.flapPhase) * 0.48;
        b.group.userData.wingL.rotation.z = -flap;
        b.group.userData.wingR.rotation.z = flap;
      }
    }

    // 2. Emit Chimney Smoke & Campfire Embers
    if (this.smokeParticles) {
      this.smokeEmitTimer -= rawDt;
      if (this.smokeEmitTimer <= 0) {
        this.smokeEmitTimer = 0.14;
        const spawnPuff = (x, y, z, wantEmber, baseSize) => {
          for (let tries = 0; tries < this.smokeParticles.length; tries++) {
            const p = this.smokeParticles[this.smokeCursor];
            this.smokeCursor = (this.smokeCursor + 1) % this.smokeParticles.length;
            if (p.isEmber === wantEmber && p.life <= 0) {
              p.x = x + (Math.random() - 0.5) * 0.16;
              p.y = y;
              p.z = z + (Math.random() - 0.5) * 0.16;
              p.vx = 0.22 + Math.random() * 0.16; // gentle wind drift!
              p.vy = wantEmber ? (0.85 + Math.random() * 0.55) : (0.58 + Math.random() * 0.25);
              p.vz = (Math.random() - 0.5) * 0.14;
              p.age = 0;
              p.life = wantEmber ? (1.1 + Math.random() * 0.6) : (2.1 + Math.random() * 0.8);
              p.baseSize = baseSize;
              p.mesh.visible = true;
              break;
            }
          }
        };

        // Campfire embers + light smoke
        if (this.world.campfirePos) {
          spawnPuff(this.world.campfirePos.x, this.world.campfirePos.y + 0.52, this.world.campfirePos.z, true, 0.065);
          if (Math.random() < 0.45) {
            spawnPuff(this.world.campfirePos.x, this.world.campfirePos.y + 0.65, this.world.campfirePos.z, false, 0.13);
          }
        }
        // Chimney workshops & Tower braziers (aligned to exact rotated chimney flues)!
        for (let i = 0; i < this.world.structures.length; i++) {
          const s = this.world.structures[i];
          if (!s || s.hp <= 0) continue;
          const yaw = s.mesh ? (s.mesh.rotation.y || 0) : 0;
          const cy = Math.cos(yaw);
          const sy = Math.sin(yaw);
          const emitRot = (ox, oy, oz, ember, sz) => {
            spawnPuff(s.x + ox * cy + oz * sy, s.y + oy, s.z - ox * sy + oz * cy, ember, sz);
          };
          if (s.type === 'blacksmith' && Math.random() < 0.38) {
            emitRot(-0.22, 1.66, -0.22, false, 0.16);
          } else if (s.type === 'hovel' && Math.random() < 0.32) {
            emitRot(0.34, 1.66, -0.22, false, 0.14);
          } else if (s.type === 'pitchRig' && Math.random() < 0.35) {
            emitRot(-0.18, 1.60, -0.18, false, 0.15);
          } else if (s.type === 'tower' && Math.random() < 0.35) {
            emitRot(0.23, 2.72, 0.0, true, 0.06);
          }
        }
      }

      for (let i = 0; i < this.smokeParticles.length; i++) {
        const p = this.smokeParticles[i];
        if (p.life <= 0) continue;
        p.age += rawDt;
        if (p.age >= p.life) {
          p.life = 0;
          p.mesh.visible = false;
          continue;
        }
        const t = p.age / p.life;
        p.x += p.vx * rawDt;
        p.y += p.vy * rawDt;
        p.z += p.vz * rawDt;
        const sc = p.isEmber
          ? p.baseSize * (1.0 - t * 0.75)
          : p.baseSize * (0.75 + t * 1.65) * (1.0 - Math.pow(t, 3) * 0.6);
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.rotation.y += rawDt * 1.2;
        p.mesh.scale.setScalar(Math.max(0.01, sc));
      }
    }

    // 3. Dynamic Ranked Pool of 6 Practical Warm Torch/Campfire PointLights (Zero shader recompile!)
    if (this.practicalLights && this.practicalLights.length > 0) {
      const sources = [];
      if (this.world.playerKeep && this.world.playerKeep.hp > 0) {
        sources.push({ x: this.world.playerKeep.x + 1.1, y: this.world.playerKeep.y + 1.2, z: this.world.playerKeep.z, p: 2.2 });
      }
      if (this.world.enemyKeep && this.world.enemyKeep.hp > 0) {
        sources.push({ x: this.world.enemyKeep.x - 1.1, y: this.world.enemyKeep.y + 1.2, z: this.world.enemyKeep.z, p: 2.0 });
      }
      for (let i = 0; i < this.world.structures.length; i++) {
        const s = this.world.structures[i];
        if (!s || s.hp <= 0) continue;
        if (s.type === 'tower') sources.push({ x: s.x, y: s.y + 2.75, z: s.z, p: 2.4 });
        else if (s.type === 'blacksmith') sources.push({ x: s.x + 0.4, y: s.y + 0.7, z: s.z + 0.4, p: 1.9 });
        else if (s.type === 'gate') sources.push({ x: s.x, y: s.y + 1.5, z: s.z, p: 1.6 });
      }
      for (let i = 0; i < this.world.pitchFires.length; i++) {
        const pf = this.world.pitchFires[i];
        const wp = gridToWorld(pf.gx, pf.gz);
        sources.push({ x: wp.x, y: pf.cell.elev + 0.85, z: wp.z, p: 3.4 });
      }

      // Rank nearest practicals to camera target!
      sources.sort((a, b) => {
        const da = Math.hypot(a.x - this.camTarget.x, a.z - this.camTarget.z) - a.p * 2.5;
        const db = Math.hypot(b.x - this.camTarget.x, b.z - this.camTarget.z) - b.p * 2.5;
        return da - db;
      });

      const nightBoost = this.isNight ? 1.55 : 0.65;
      for (let i = 0; i < this.practicalLights.length; i++) {
        const pl = this.practicalLights[i];
        const src = sources[i];
        if (src) {
          pl.position.set(src.x, src.y, src.z);
          const flicker = 0.88 + 0.12 * Math.sin(now * 9.5 + i * 2.1) * Math.cos(now * 6.3 + i);
          pl.intensity = src.p * nightBoost * flicker;
        } else {
          pl.intensity = 0.0;
        }
      }
    }
  }
  syncCampfirePeasants() {
    if (!this.campfirePeasants) this.campfirePeasants = [];
    while (this.campfirePeasants.length < this.res.peasants) {
      const idx = this.campfirePeasants.length;
      const ringIdx = Math.floor(idx / 6);
      const slot = idx % 6;
      const angle = (slot / 6) * Math.PI * 2 + ringIdx * 0.52;
      const r = 1.25 + ringIdx * 0.62;
      const m = createVoxelHumanoid('peasant', 'player');
      const px = this.world.campfirePos.x + Math.cos(angle) * r;
      const pz = this.world.campfirePos.z + Math.sin(angle) * r;
      const pObj = {
        isCivilian: true,
        isPeasantIdle: true,
        team: 'player',
        hp: 100,
        x: px,
        y: this.world.getElevationAtWorld(px, pz, 0.25),
        z: pz,
        homeX: px,
        homeZ: pz,
        mesh: m,
        animPhase: idx * 1.1,
      };
      this.world.projectOutOfObstacles(pObj, 0.25, 'player');
      pObj.y = this.world.getElevationAtWorld(pObj.x, pObj.z, 0.25);
      m.position.set(pObj.x, pObj.y, pObj.z);
      m.lookAt(this.world.campfirePos.x, pObj.y, this.world.campfirePos.z);
      this.scene.add(m);
      this.campfirePeasants.push(pObj);
      this.campfirePeasantMeshes.push(m);
    }
    while (this.campfirePeasants.length > this.res.peasants) {
      const pObj = this.campfirePeasants.pop();
      this.campfirePeasantMeshes.pop();
      if (pObj && pObj.mesh) this.scene.remove(pObj.mesh);
    }
  }

  spawnInitialForces() {
    const pk = this.world.playerKeep;
    // Player Crusader Lord starts as an actual physical unit in the courtyard outside the Keep!
    // Drag him onto ANY friendly building (or tap "驻堡") to enter it and display a 3D Royal Crown above that building!
    this.playerLord = this.spawnSingleUnit('lord', 'player', pk.x + 2.0, pk.z + 0.35, null);
    this.playerLord.hp = 1550;
    this.playerLord.maxHp = 1550;
    this.playerLord.dmg = 46;
    this.playerLord.siegeDmg = 30;
    this.playerLord.range = 1.55;
    this.playerLord.speed = 3.1;
    this.playerLord.cooldown = 0.75;
    this.playerLord.arrowResist = 0.35;
    this.playerLord.isLord = true;
    this.playerLord.garrisonBuilding = null;
    this.playerLord.pendingEnterBuilding = null;
    this.playerLord.orderTarget = null;
    this.playerLord.crownMarker = createBuildingLordCrown('player');
    this.playerLord.crownMarker.visible = false;
    this.scene.add(this.playerLord.crownMarker);

    const ek = this.world.enemyKeep;
    // Enemy Wolf Duke is ALSO a physical unit, initially garrisoned inside the East Wolf Keep (with overhead Crown!)
    this.enemyLord = this.spawnSingleUnit('lord', 'enemy', ek.x - 1.9, ek.z, null);
    this.enemyLord.hp = 1750;
    this.enemyLord.maxHp = 1750;
    this.enemyLord.dmg = 48;
    this.enemyLord.siegeDmg = 30;
    this.enemyLord.range = 1.6;
    this.enemyLord.speed = 2.9;
    this.enemyLord.cooldown = 0.78;
    this.enemyLord.arrowResist = 0.35;
    this.enemyLord.isLord = true;
    this.enemyLord.garrisonBuilding = null;
    this.enemyLord.pendingEnterBuilding = null;
    this.enemyLord.orderTarget = null;
    this.enemyLord.crownMarker = createBuildingLordCrown('enemy');
    this.enemyLord.crownMarker.visible = false;
    this.scene.add(this.enemyLord.crownMarker);
    this.enterBuildingWithLord(this.enemyLord, ek, true);

    // Enemy Wolf Foothill Castle Garrison
    const wt1 = gridToWorld(48, 15);
    const wt2 = gridToWorld(48, 24);
    const e1 = this.createSquad('archer', 'enemy', wt1.x, wt1.z, true);
    const e2 = this.createSquad('archer', 'enemy', wt2.x, wt2.z, true);
    const courtyardPos = gridToWorld(50, 19);
    const eGuard = this.createSquad('swordsman', 'enemy', courtyardPos.x, courtyardPos.z, true);
    e1.isGarrisonGuard = e2.isGarrisonGuard = eGuard.isGarrisonGuard = true;
  }

  getStructureDisplayName(st) {
    if (!st) return '建筑';
    const special = {
      keep: st.team === 'enemy' ? '倭寇安宅船寨' : '英桥王氏大宗祠',
      granary: '永昌义仓',
      armory: '演武军器厅',
    };
    return special[st.type] || BUILDINGS[st.type]?.name || '永昌城防';
  }

  findGarrisonableBuildingAt(wx, wz, team) {
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.world.structures.length; i++) {
      const s = this.world.structures[i];
      if (!s || s.hp <= 0 || s.team !== team) continue;
      if (['campfire', 'stockpile', 'pitch'].includes(s.type)) continue;
      const pickR = s.type === 'keep' ? 1.55 : 0.92;
      const d = Math.hypot(s.x - wx, s.z - wz);
      if (d <= pickR && d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  orderLordToBuilding(lord, struct) {
    if (!lord || lord.hp <= 0 || !struct || struct.hp <= 0) return;
    if (lord.garrisonBuilding === struct) return;
    if (lord.garrisonBuilding) {
      this.exitBuildingWithLord(lord, struct.x, struct.z, true);
    }
    lord.pendingEnterBuilding = struct;
    lord.orderTarget = null;
    sfx.playPlaceBlock('stone');
    if (lord.team === 'player') {
      this.toast(`宗长王叔果正前往进驻【${this.getStructureDisplayName(struct)}】督战！`);
    }
  }

  enterBuildingWithLord(lord, struct, silent = false) {
    if (!lord || lord.hp <= 0 || !struct || struct.hp <= 0) return;
    lord.pendingEnterBuilding = null;
    lord.orderTarget = null;
    lord.garrisonBuilding = struct;
    lord.x = struct.x;
    lord.y = struct.y;
    lord.z = struct.z;
    lord.mesh.visible = false;
    if (lord.crownMarker) {
      lord.crownMarker.visible = true;
      const lift = struct.type === 'tower' ? 0.94 : 0.62;
      lord.crownMarker.position.set(struct.x, struct.y + struct.height + lift, struct.z);
    }
    if (lord.team === 'player') {
      this.syncLordGarrisonButton();
      if (!silent) {
        sfx.playPlaceBlock('stone');
        this.toast(`宗长王叔果已驻入【${this.getStructureDisplayName(struct)}】，升起永昌鎏金帅印！`);
      }
    }
  }

  exitBuildingWithLord(lord, towardX = null, towardZ = null, silent = false) {
    if (!lord || !lord.garrisonBuilding) return;
    const st = lord.garrisonBuilding;
    lord.garrisonBuilding = null;
    if (lord.crownMarker) lord.crownMarker.visible = false;

    const defPrefX = towardX !== null ? towardX : (st.x + (lord.team === 'enemy' ? -2.2 : 2.2));
    const defPrefZ = towardZ !== null ? towardZ : (st.z + 0.35);
    const apron = this.world.findClearApronPoint(st, 0.38, defPrefX, defPrefZ);
    lord.x = apron.x;
    lord.z = apron.z;
    this.world.projectOutOfObstacles(lord, 0.38, lord.team);
    lord.y = this.world.getElevationAtWorld(lord.x, lord.z, 0.38);
    lord.mesh.position.set(lord.x, lord.y, lord.z);
    lord.mesh.rotation.y = Math.atan2(lord.x - st.x, lord.z - st.z);
    lord.mesh.visible = true;

    if (lord.team === 'player') {
      this.syncLordGarrisonButton();
      if (!silent) {
        sfx.playPlaceBlock('wood');
        this.toast('宗长王叔果已走出建筑，执剑亲率乡兵迎敌！');
      }
    }
  }

  handleStructureDestroyed(struct) {
    [this.playerLord, this.enemyLord].forEach((lord) => {
      if (lord && lord.hp > 0 && lord.garrisonBuilding === struct) {
        this.exitBuildingWithLord(lord, lord.team === 'enemy' ? struct.x - 2 : struct.x + 2, struct.z, true);
        lord.hp = Math.max(180, lord.hp - 120);
        if (lord.team === 'enemy') {
          sfx.playHorn(true);
          this.showTaunt('倭酋黑鲨鬼丸：“安宅巨舰虽毁，本头目尚在！浪人死战到底！！”');
        } else {
          this.toast('驻守建筑受损坍塌！王叔果已突围至地面继续督战！');
        }
      }
      if (lord && lord.pendingEnterBuilding === struct) {
        lord.pendingEnterBuilding = null;
      }
    });
  }

  syncLordGarrisonButton() {
    const lbl = document.getElementById('lord-garrison-lbl');
    const btn = document.getElementById('btn-lord-garrison');
    if (!lbl || !btn || !this.playerLord) return;
    if (this.playerLord.garrisonBuilding) {
      lbl.textContent = '出战';
      btn.className = 'game-btn-wood mini-orb-btn g-txt';
    } else {
      lbl.textContent = '驻祠';
      btn.className = 'game-btn-blue mini-orb-btn g-txt';
    }
  }

  spawnSingleUnit(role, team, x, z, squad) {
    const spec = UNIT_SPECS[role] || {
      hp: 100, dmg: 20, range: 1.4, speed: 2.5, cooldown: 1.0, siegeDmg: 15,
    };
    const mesh = spec.isSiege
      ? createSiegeEngine(role, team, this.mats)
      : createVoxelHumanoid(role, team);
    const groundY = this.world.getElevationAtWorld(x, z);
    mesh.position.set(x, groundY, z);
    this.scene.add(mesh);

    const unit = {
      role,
      team,
      squad,
      mesh,
      x,
      y: groundY,
      z,
      hp: spec.hp,
      maxHp: spec.hp,
      dmg: spec.dmg,
      siegeDmg: spec.siegeDmg || 12,
      range: spec.range,
      speed: spec.speed,
      cooldown: spec.cooldown,
      atkTimer: Math.random() * 0.4,
      isRanged: Boolean(spec.isRanged),
      isSiege: Boolean(spec.isSiege),
      arrowResist: spec.arrowResist || 0,
      garrisonWall: null,
      animPhase: Math.random() * Math.PI * 2,
      swingTimer: 0,
    };
    this.units.push(unit);
    return unit;
  }

  createSquad(role, team, spawnX, spawnZ, free = false) {
    const spec = UNIT_SPECS[role];
    if (!free && team === 'player') {
      if (this.res.peasants < spec.popCost) {
        this.toast('宗祠社火坛待命乡民不足！保持义仓稻米充盈可吸引流民归附');
        return null;
      }
      if (this.getTotalPop() + spec.count > this.res.maxPop) {
        this.toast('丁口已达上限！请增建【江南粉墙民居】扩容');
        return null;
      }
      const discount = (this.clanSteleMartialUnlocked && (role === 'knight' || role === 'swordsman')) ? 0.8 : 1.0;
      for (const [k, rawV] of Object.entries(spec.cost)) {
        const v = k === 'gold' ? Math.floor(rawV * discount) : rawV;
        if ((this.res[k] || 0) < v) {
          const labels = { wood: '楠竹杉木', stone: '花岗条石', gold: '饷银', bows: '鸟铳强弩(建神机军器局)', armor: '明光山文甲(建百炼甲仗铺)' };
          this.toast(`缺少 ${labels[k] || k}！需要 ${v}`);
          return null;
        }
      }
      this.res.peasants -= spec.popCost;
      for (const [k, rawV] of Object.entries(spec.cost)) {
        const v = k === 'gold' ? Math.floor(rawV * discount) : rawV;
        this.res[k] -= v;
      }
      this.syncCampfirePeasants();
      this.world.updateStockpileVisuals(this.res);
      sfx.playPlaceBlock('wood');
    }

    const banner = createSquadBanner(role, team);
    const gy = this.world.getElevationAtWorld(spawnX, spawnZ);
    banner.position.set(spawnX, gy, spawnZ);
    if (team === 'enemy') banner.scale.setScalar(0.82);
    this.scene.add(banner);

    const squad = {
      id: `sq_${Math.random().toString(36).slice(2, 7)}`,
      role,
      team,
      banner,
      targetX: spawnX,
      targetZ: spawnZ,
      hasCustomOrder: false,
      members: [],
      isGarrisonGuard: false,
    };

    for (let i = 0; i < spec.count; i++) {
      const angle = (i / Math.max(1, spec.count)) * Math.PI * 2;
      const dist = spec.count === 1 ? 0 : (role === 'knight' ? 0.72 : 0.56);
      const ux = spawnX + Math.cos(angle) * dist;
      const uz = spawnZ + Math.sin(angle) * dist;
      const u = this.spawnSingleUnit(role, team, ux, uz, squad);
      const rU = this.getEntityRadius(u);
      this.world.projectOutOfObstacles(u, rU, team);
      u.y = this.world.getElevationAtWorld(u.x, u.z, rU);
      u.mesh.position.set(u.x, u.y, u.z);
      squad.members.push(u);
    }

    this.squads.push(squad);

    if (role === 'archer') {
      this.tryAssignArchersToWalls(squad);
    }
    this.updateHUD();
    return squad;
  }

  tryAssignArchersToWalls(squad, nearWorldX = null, nearWorldZ = null) {
    const cx = nearWorldX !== null ? nearWorldX : squad.targetX;
    const cz = nearWorldZ !== null ? nearWorldZ : squad.targetZ;

    const candidates = this.world.structures
      .filter((s) => s.team === squad.team && (s.type === 'tower' || s.type === 'wall') && s.garrison.length < s.maxGarrison)
      .sort((a, b) => {
        const scoreA = Math.hypot(a.x - cx, a.z - cz) - (a.type === 'tower' ? 4.0 : 0);
        const scoreB = Math.hypot(b.x - cx, b.z - cz) - (b.type === 'tower' ? 4.0 : 0);
        return scoreA - scoreB;
      });

      squad.members.forEach((u) => {
      if (u.hp <= 0) return;
      const oldWall = u.garrisonWall || u.pendingGarrisonWall;
      if (oldWall) {
        const idx = oldWall.garrison.indexOf(u);
        if (idx !== -1) oldWall.garrison.splice(idx, 1);
        u.garrisonWall = null;
        u.pendingGarrisonWall = null;
      }
      for (const wall of candidates) {
        if (wall.garrison.length < wall.maxGarrison && Math.hypot(wall.x - cx, wall.z - cz) < 14) {
          wall.garrison.push(u);
          const slotIdx = wall.garrison.length - 1;
          u.slotOffset = wall.type === 'wall'
            ? { ox: 0, oz: 0 }
            : {
                ox: ((slotIdx % 2) - 0.5) * 0.36,
                oz: ((Math.floor(slotIdx / 2) % 2) - 0.5) * 0.36,
              };
          // Pre-spawned enemy castle guards or archers already beside the wall mount immediately;
          // otherwise archers pathfind on the ground via A* to the wall base before climbing!
          if (squad.team === 'enemy' || Math.hypot(wall.x - u.x, wall.z - u.z) <= 1.38) {
            u.garrisonWall = wall;
            u.pendingGarrisonWall = null;
          } else {
            u.pendingGarrisonWall = wall;
            u.garrisonWall = null;
            u.waypoints = null;
          }
          squad.targetX = wall.x;
          squad.targetZ = wall.z;
          break;
        }
      }
    });
  }

  // Shared Waypoint Follower + 3-Stage Escalating Progress Watchdog for Workers, Lords & Units!
  computeAgentDirection(ent, goalX, goalZ, stopDist, dt, opts) {
    const distToGoal = Math.hypot(goalX - ent.x, goalZ - ent.z);
    if (distToGoal <= stopDist) {
      ent.waypoints = null;
      ent.noProgressTime = 0;
      return { arrived: true, dx: 0, dz: 0 };
    }

    const goalMoved = Math.hypot((ent.pathGoalX ?? 1e5) - goalX, (ent.pathGoalZ ?? 1e5) - goalZ) > 0.65;
    if (!ent.waypoints || ent.pathVer !== this.world.layoutVersion || goalMoved) {
      ent.waypoints = this.pathfinder.findPathWorld(
        this.world,
        ent.x,
        ent.z,
        goalX,
        goalZ,
        ent.team || 'player',
        opts
      );
      ent.wpIdx = 0;
      ent.pathVer = this.world.layoutVersion;
      ent.pathGoalX = goalX;
      ent.pathGoalZ = goalZ;
    }

    // Advance along string-pulled waypoints with smooth corner lookahead!
    while (ent.waypoints && ent.wpIdx < ent.waypoints.length - 1) {
      const wp = ent.waypoints[ent.wpIdx];
      if (Math.hypot(wp.x - ent.x, wp.z - ent.z) < 0.52) {
        ent.wpIdx++;
      } else {
        break;
      }
    }

    const curWp = (ent.waypoints && ent.waypoints[ent.wpIdx]) || { x: goalX, z: goalZ };
    const isFinal = !ent.waypoints || ent.wpIdx >= ent.waypoints.length - 1;
    const dx = curWp.x - ent.x;
    const dz = curWp.z - ent.z;
    if (isFinal && Math.hypot(dx, dz) <= stopDist) {
      ent.waypoints = null;
      ent.noProgressTime = 0;
      return { arrived: true, dx: 0, dz: 0 };
    }
    return { arrived: false, dx, dz };
  }

  // 3-Stage Escalating Stuck Watchdog (Repath -> Committed Flank Side-Step -> Walkable Cell Nudge)
  updateStuckWatchdog(ent, dirX, dirZ, dt, opts) {
    if (ent.anchorX === undefined) {
      ent.anchorX = ent.x;
      ent.anchorZ = ent.z;
      ent.noProgressTime = 0;
      ent.sideStepTimer = 0;
      ent.sideStepSign = (Math.random() < 0.5) ? 1 : -1;
    }

    const moved = Math.hypot(ent.x - ent.anchorX, ent.z - ent.anchorZ);
    if (moved >= 0.36) {
      ent.anchorX = ent.x;
      ent.anchorZ = ent.z;
      ent.noProgressTime = 0;
      if (ent.sideStepTimer <= 0) ent.isCurrentlyStuck = false;
    } else {
      ent.noProgressTime += dt;
    }

    // Stage 1 (1.15s stalled): Invalidate A* waypoints to compute fresh detour around dynamic blockers!
    if (ent.noProgressTime >= 1.15 && !ent.repathedThisStall) {
      ent.repathedThisStall = true;
      ent.waypoints = null;
      if (ent.squad) ent.squad.waypoints = null;
      this.navStats.repaths++;
    }
    if (ent.noProgressTime < 0.5) {
      ent.repathedThisStall = false;
    }

    // Stage 2 (2.2s stalled): Commit to a 0.85s clearest-feeler lateral side-step!
    if (ent.noProgressTime >= 2.2 && ent.sideStepTimer <= 0) {
      ent.sideStepTimer = 0.85;
      ent.isCurrentlyStuck = true;
      this.navStats.sidesteps++;
      // Pick left vs right normal with lower traversal cost
      const cg = worldToGrid(ent.x, ent.z);
      const len = Math.hypot(dirX, dirZ) || 1;
      const lx = -dirZ / len, lz = dirX / len;
      const gL = worldToGrid(ent.x + lx * 1.1, ent.z + lz * 1.1);
      const gR = worldToGrid(ent.x - lx * 1.1, ent.z - lz * 1.1);
      const cL = evaluateStepCost(this.world, cg.gx, cg.gz, gL.gx, gL.gz, 1.0, ent.team || 'player', opts);
      const cR = evaluateStepCost(this.world, cg.gx, cg.gz, gR.gx, gR.gz, 1.0, ent.team || 'player', opts);
      if (cL >= 0 && (cR < 0 || cL <= cR)) ent.sideStepSign = 1;
      else if (cR >= 0) ent.sideStepSign = -1;
      else ent.sideStepSign *= -1;
    }

    // Stage 3 (3.6s wedged on corner): Smoothly nudge onto nearest standable grid cell center!
    if (ent.noProgressTime >= 3.6) {
      const cg = worldToGrid(ent.x, ent.z);
      const safe = this.pathfinder.resolveWalkableCell(
        this.world,
        cg.gx,
        cg.gz,
        ent.team || 'player',
        opts,
        ent.x,
        ent.z
      );
      const wp = gridToWorld(safe.gx, safe.gz);
      ent.x = THREE.MathUtils.lerp(ent.x, wp.x, Math.min(1, dt * 8));
      ent.z = THREE.MathUtils.lerp(ent.z, wp.z, Math.min(1, dt * 8));
      ent.noProgressTime = 1.2;
      ent.waypoints = null;
    }

    if (ent.sideStepTimer > 0) {
      ent.sideStepTimer -= dt;
      const len = Math.hypot(dirX, dirZ) || 1;
      const nx = dirX / len;
      const nz = dirZ / len;
      const sx = -nz * ent.sideStepSign;
      const sz = nx * ent.sideStepSign;
      return { dx: nx * 0.35 + sx * 0.92, dz: nz * 0.35 + sz * 0.92 };
    }

    return { dx: dirX, dz: dirZ };
  }

  getTotalPop() {
    let count = this.res.peasants;
    this.workers.forEach((w) => {
      if (!w.isOx && w.hp > 0) count++;
    });
    this.units.forEach((u) => {
      if (u.team === 'player' && u.hp > 0 && !u.isLord) count++;
    });
    return count;
  }

  // Authentic Stronghold Worker Recruitment:
  // Human peasants walk from the Campfire to staff their new workshop; Quarry also spawns a dedicated Ox-Tether Cart!
  spawnWorkerForStructure(struct, isOx = false, fromCampfire = true) {
    const rW = isOx ? 0.48 : 0.26;
    let spawnPt;
    if (!isOx && fromCampfire && this.world.campfirePos) {
      const ang = Math.random() * Math.PI * 2;
      spawnPt = {
        x: this.world.campfirePos.x + Math.cos(ang) * 0.95,
        z: this.world.campfirePos.z + Math.sin(ang) * 0.95,
      };
    } else {
      spawnPt = this.world.findClearApronPoint(struct, rW);
    }

    const mesh = isOx ? createQuarryOxCart() : createVoxelHumanoid('peasant', 'player');
    const wy = this.world.getElevationAtWorld(spawnPt.x, spawnPt.z, rW);
    mesh.position.set(spawnPt.x, wy, spawnPt.z);
    this.scene.add(mesh);

    this.workers.push({
      isCivilian: true,
      team: 'player',
      hp: 100,
      job: struct.type,
      isOx,
      home: struct,
      mesh,
      x: spawnPt.x,
      y: wy,
      z: spawnPt.z,
      state: isOx ? 'wait_at_quarry' : 'to_home_init',
      timer: 0.4,
      carriedAmount: 0,
      harvestStep: Math.floor(Math.random() * 4),
      targetPos: null,
      targetTree: null,
      targetNode: null,
      sourceStruct: null,
      dropStruct: null,
      animPhase: Math.random() * 6,
    });
  }

  makeStockpileTargetFor(wx, wz) {
    const dx = wx - this.world.stockpilePos.x;
    const dz = wz - this.world.stockpilePos.z;
    const l = Math.hypot(dx, dz) || 1;
    return {
      x: this.world.stockpilePos.x + (dx / l) * 1.12,
      z: this.world.stockpilePos.z + (dz / l) * 1.12,
    };
  }

  animateWorkerAction(w, lookObj, dt, speed = 11) {
    w.timer -= dt;
    w.animPhase += dt * speed;
    if (lookObj && w.mesh) {
      const aimYaw = Math.atan2(lookObj.x - w.x, lookObj.z - w.z);
      w.mesh.rotation.y = lerpAngle(w.mesh.rotation.y, aimYaw, Math.min(1, dt * 10));
    }
    const ud = w.mesh?.userData;
    if (ud && ud.rightArm) {
      ud.rightArm.rotation.x = Math.sin(w.animPhase) * 0.92;
      if (ud.leftArm) ud.leftArm.rotation.x = -0.35 + Math.cos(w.animPhase) * 0.25;
      if (ud.leftLeg) ud.leftLeg.rotation.x = 0;
      if (ud.rightLeg) ud.rightLeg.rotation.x = 0;
    }
  }

  updateWorkers(dt) {
    const WORKER_JOBS = ['woodcutter', 'quarry', 'farm', 'ironMine', 'pitchRig', 'fletcher', 'blacksmith'];
    for (const s of this.world.structures) {
      if (s.team === 'player' && !s.workerSpawned && WORKER_JOBS.includes(s.type)) {
        if (this.res.peasants >= 1) {
          this.res.peasants -= 1;
          this.syncCampfirePeasants();
          s.workerSpawned = true;
          this.spawnWorkerForStructure(s, false, true);
          if (s.type === 'quarry' && !s.oxSpawned) {
            s.oxSpawned = true;
            this.spawnWorkerForStructure(s, true, false);
          }
        }
      }
    }

    for (let i = this.workers.length - 1; i >= 0; i--) {
      const w = this.workers[i];
      if (!w.home || w.home.hp <= 0) {
        this.scene.remove(w.mesh);
        this.workers.splice(i, 1);
        if (!w.isOx && this.getTotalPop() < this.res.maxPop) {
          this.res.peasants += 1;
          this.syncCampfirePeasants();
        }
        continue;
      }

      const rW = this.getEntityRadius(w);
      const walkSpd = w.isOx ? 2.05 : 2.85;
      const haulSpd = w.isOx ? 1.82 : 2.62;

      // 1. Recruited peasant walks from Campfire to newly built Workshop to report for duty!
      if (w.state === 'to_home_init') {
        setWorkerCarryItem(w.mesh, null);
        if (!w.targetPos) {
          w.targetPos = this.world.findClearApronPoint(w.home, rW, w.x, w.z);
        }
        if (this.moveWorkerTowards(w, w.targetPos.x, w.targetPos.z, walkSpd, dt, w.home)) {
          w.targetPos = null;
          w.waypoints = null;
          w.state = (w.job === 'fletcher' || w.job === 'blacksmith') ? 'wait_raw_at_home' : 'to_source';
        }
      }
      // 2. Quarry Ox-Tether Cart: Waits at Quarry until Mason stacks cut limestone blocks, then loads & hauls to Stockpile!
      else if (w.state === 'wait_at_quarry') {
        setWorkerCarryItem(w.mesh, null);
        if (!w.targetPos) {
          w.targetPos = this.world.findClearApronPoint(w.home, rW, w.x, w.z);
        }
        if (Math.hypot(w.targetPos.x - w.x, w.targetPos.z - w.z) > 0.45) {
          this.moveWorkerTowards(w, w.targetPos.x, w.targetPos.z, walkSpd, dt, w.home);
        }
        if ((w.home.stagedStone || 0) >= 6) {
          const load = Math.min(12, w.home.stagedStone);
          w.home.stagedStone -= load;
          w.carriedAmount = load;
          this.world.updateQuarryStagedVisuals(w.home);
          setWorkerCarryItem(w.mesh, 'stone');
          w.dropStruct = null;
          w.targetPos = this.makeStockpileTargetFor(w.x, w.z);
          w.waypoints = null;
          w.state = 'to_drop';
        }
      }
      else if (w.state === 'to_home_wait') {
        setWorkerCarryItem(w.mesh, null);
        if (!w.targetPos) {
          w.targetPos = this.world.findClearApronPoint(w.home, rW, w.x, w.z);
        }
        if (this.moveWorkerTowards(w, w.targetPos.x, w.targetPos.z, walkSpd, dt, w.home)) {
          w.targetPos = null;
          w.waypoints = null;
          w.state = 'wait_at_quarry';
        }
      }
      // 3. Craftsmen (Fletcher / Blacksmith): Wait at Workshop -> Fetch Wood/Iron at Stockpile -> Return to Workshop -> Craft -> Deliver to Armory!
      else if (w.state === 'wait_raw_at_home') {
        setWorkerCarryItem(w.mesh, null);
        const hasRaw = w.job === 'fletcher' ? (this.res.wood >= 2) : (this.res.iron >= 1);
        if (hasRaw) {
          w.targetPos = this.makeStockpileTargetFor(w.x, w.z);
          w.waypoints = null;
          w.state = 'to_stockpile_raw';
        } else {
          const homePt = this.world.findClearApronPoint(w.home, rW, w.x, w.z);
          if (Math.hypot(homePt.x - w.x, homePt.z - w.z) > 0.55) {
            this.moveWorkerTowards(w, homePt.x, homePt.z, walkSpd, dt, w.home);
          } else {
            this.animateWorkerAction(w, w.home, dt, 4);
          }
        }
      }
      else if (w.state === 'to_stockpile_raw') {
        if (!w.targetPos) w.targetPos = this.makeStockpileTargetFor(w.x, w.z);
        let atStock = this.moveWorkerTowards(w, w.targetPos.x, w.targetPos.z, walkSpd, dt, null);
        if (
          !atStock &&
          Math.max(Math.abs(w.x - this.world.stockpilePos.x), Math.abs(w.z - this.world.stockpilePos.z)) <= 1.18 + rW
        ) {
          atStock = true;
        }
        if (atStock) {
          if (w.job === 'fletcher' && this.res.wood >= 2) {
            this.res.wood -= 2;
            w.hasCraftMat = true;
            this.world.updateStockpileVisuals(this.res);
            setWorkerCarryItem(w.mesh, 'wood');
            w.targetPos = this.world.findClearApronPoint(w.home, rW, w.x, w.z);
            w.waypoints = null;
            w.state = 'to_home_craft';
          } else if (w.job === 'blacksmith' && this.res.iron >= 1) {
            this.res.iron -= 1;
            w.hasCraftMat = true;
            this.world.updateStockpileVisuals(this.res);
            setWorkerCarryItem(w.mesh, 'iron');
            w.targetPos = this.world.findClearApronPoint(w.home, rW, w.x, w.z);
            w.waypoints = null;
            w.state = 'to_home_craft';
          } else {
            w.targetPos = null;
            w.waypoints = null;
            w.state = 'wait_raw_at_home';
          }
        }
      }
      else if (w.state === 'to_home_craft') {
        if (!w.targetPos) w.targetPos = this.world.findClearApronPoint(w.home, rW, w.x, w.z);
        if (this.moveWorkerTowards(w, w.targetPos.x, w.targetPos.z, haulSpd, dt, w.home)) {
          w.targetPos = null;
          w.waypoints = null;
          w.timer = 1.9;
          w.state = 'craft_at_home';
        }
      }
      else if (w.state === 'craft_at_home') {
        this.animateWorkerAction(w, w.home, dt, 13);
        if (w.job === 'blacksmith' && Math.random() < dt * 5.0) {
          this.debris.burst(w.home.x, w.home.y + 0.65, w.home.z, 0xff9922, 2, 0.36, 0.08);
        }
        if (w.timer <= 0) {
          setWorkerCarryItem(w.mesh, w.job === 'fletcher' ? 'bow' : 'armor');
          w.dropStruct = this.world.structures.find((s) => s.type === 'armory' && s.team === 'player') || null;
          w.targetPos = w.dropStruct
            ? this.world.findClearApronPoint(w.dropStruct, rW, w.x, w.z)
            : { x: this.world.armoryPos.x, z: this.world.armoryPos.z + 0.85 };
          w.waypoints = null;
          w.state = 'to_drop';
        }
      }
      // 4. Primary Gatherers: Walk from Workshop -> Natural Resource / Crop -> Gather Raw -> Return to Workshop -> Process -> Deliver!
      else if (w.state === 'to_source') {
        setWorkerCarryItem(w.mesh, null);
        if (!w.targetPos) {
          w.targetTree = null;
          w.targetNode = null;
          w.sourceStruct = null;
          if (w.job === 'woodcutter') {
            const avail = this.world.trees
              .filter((t) => t.woodLeft > 0)
              .sort((a, b) => Math.hypot(a.x - w.home.x, a.z - w.home.z) - Math.hypot(b.x - w.home.x, b.z - w.home.z));
            if (avail.length > 0) {
              const pick = avail[Math.min(avail.length - 1, i % 2)];
              w.targetTree = pick;
              const dx = w.home.x - pick.x;
              const dz = w.home.z - pick.z;
              const l = Math.hypot(dx, dz) || 1;
              w.targetPos = { x: pick.x + (dx / l) * 0.62, z: pick.z + (dz / l) * 0.62 };
            } else {
              w.sourceStruct = w.home;
              w.targetPos = this.world.findClearApronPoint(w.home, rW, w.x, w.z);
            }
          } else if (w.job === 'quarry') {
            const sorted = [...this.world.stoneNodes].sort(
              (a, b) => Math.hypot(a.x - w.home.x, a.z - w.home.z) - Math.hypot(b.x - w.home.x, b.z - w.home.z)
            );
            const node = sorted[i % Math.max(1, sorted.length)] || null;
            w.targetNode = node;
            w.targetPos = node ? { x: node.x, z: node.z + 0.88 } : this.world.findClearApronPoint(w.home, rW);
          } else if (w.job === 'ironMine') {
            const sorted = [...this.world.ironNodes].sort(
              (a, b) => Math.hypot(a.x - w.home.x, a.z - w.home.z) - Math.hypot(b.x - w.home.x, b.z - w.home.z)
            );
            const node = sorted[i % Math.max(1, sorted.length)] || null;
            w.targetNode = node;
            w.targetPos = node ? { x: node.x, z: node.z - 0.85 } : this.world.findClearApronPoint(w.home, rW);
          } else if (w.job === 'pitchRig') {
            const sorted = [...this.world.pitchNodes].sort(
              (a, b) => Math.hypot(a.x - w.home.x, a.z - w.home.z) - Math.hypot(b.x - w.home.x, b.z - w.home.z)
            );
            const node = sorted[i % Math.max(1, sorted.length)] || null;
            w.targetNode = node;
            w.targetPos = node ? { x: node.x - 0.85, z: node.z } : this.world.findClearApronPoint(w.home, rW);
          } else if (w.job === 'farm') {
            const ang = (w.harvestStep || 0) * (Math.PI * 0.5) + 0.78;
            w.harvestStep = ((w.harvestStep || 0) + 1) % 4;
            w.targetPos = {
              x: w.home.x + Math.cos(ang) * 0.84,
              z: w.home.z + Math.sin(ang) * 0.84,
            };
          }
        }

        let reachedSource = this.moveWorkerTowards(w, w.targetPos.x, w.targetPos.z, walkSpd, dt, w.sourceStruct);
        if (!reachedSource && w.targetTree && Math.hypot(w.targetTree.x - w.x, w.targetTree.z - w.z) <= rW + 0.58) {
          reachedSource = true;
        }
        if (!reachedSource && w.targetNode && Math.hypot(w.targetNode.x - w.x, w.targetNode.z - w.z) <= rW + 0.74) {
          reachedSource = true;
        }
        if (reachedSource) {
          w.state = 'gather_raw';
          w.timer = 1.65;
          w.waypoints = null;
        }
      }
      else if (w.state === 'gather_raw') {
        this.animateWorkerAction(w, w.targetTree || w.targetNode || w.home, dt, 11);
        if (w.timer <= 0) {
          if (w.job === 'woodcutter') {
            if (w.targetTree && w.targetTree.woodLeft > 0) {
              w.targetTree.woodLeft -= 20;
              this.debris.burst(w.targetTree.x, w.targetTree.y + 0.8, w.targetTree.z, 0x634124, 5, 0.55, 0.14);
              if (w.targetTree.woodLeft <= 0) {
                this.world.fellTree(w.targetTree);
              }
            }
            setWorkerCarryItem(w.mesh, 'log');
          } else if (w.job === 'quarry') {
            if (w.targetNode) {
              this.debris.burst(w.targetNode.x, w.targetNode.y + 0.45, w.targetNode.z, 0xeae4d7, 4, 0.45, 0.11);
            }
            setWorkerCarryItem(w.mesh, 'stone');
          } else if (w.job === 'ironMine') {
            if (w.targetNode) {
              this.debris.burst(w.targetNode.x, w.targetNode.y + 0.45, w.targetNode.z, 0xe07838, 4, 0.45, 0.11);
            }
            setWorkerCarryItem(w.mesh, 'ore');
          } else if (w.job === 'pitchRig') {
            setWorkerCarryItem(w.mesh, 'oil');
          } else if (w.job === 'farm') {
            this.debris.burst(w.x, w.y + 0.32, w.z, 0xfacc15, 4, 0.32, 0.09);
            setWorkerCarryItem(w.mesh, 'wheat');
          }
          w.targetPos = this.world.findClearApronPoint(w.home, rW, w.x, w.z);
          w.waypoints = null;
          w.state = 'to_home_process';
        }
      }
      else if (w.state === 'to_home_process') {
        if (!w.targetPos) w.targetPos = this.world.findClearApronPoint(w.home, rW, w.x, w.z);
        if (this.moveWorkerTowards(w, w.targetPos.x, w.targetPos.z, haulSpd, dt, w.home)) {
          w.targetPos = null;
          w.waypoints = null;
          w.timer = w.job === 'quarry' ? 1.05 : 1.35;
          w.state = 'process_at_home';
        }
      }
      else if (w.state === 'process_at_home') {
        this.animateWorkerAction(w, w.home, dt, 12);
        if (w.timer <= 0) {
          if (w.job === 'quarry') {
            // Classic Stronghold: Quarry Mason stacks dressed stone under crane for the Ox-Tether Cart to haul!
            w.home.stagedStone = Math.min(36, (w.home.stagedStone || 0) + 6);
            this.world.updateQuarryStagedVisuals(w.home);
            setWorkerCarryItem(w.mesh, null);
            w.targetPos = null;
            w.targetNode = null;
            w.waypoints = null;
            w.state = 'to_source';
            continue;
          }

          if (w.job === 'woodcutter') {
            this.debris.burst(w.home.x, w.home.y + 0.55, w.home.z, 0xdba86c, 4, 0.35, 0.09);
            setWorkerCarryItem(w.mesh, 'wood');
            w.dropStruct = null;
            w.targetPos = this.makeStockpileTargetFor(w.x, w.z);
          } else if (w.job === 'ironMine') {
            setWorkerCarryItem(w.mesh, 'iron');
            w.dropStruct = null;
            w.targetPos = this.makeStockpileTargetFor(w.x, w.z);
          } else if (w.job === 'pitchRig') {
            setWorkerCarryItem(w.mesh, 'oil');
            w.dropStruct = null;
            w.targetPos = this.makeStockpileTargetFor(w.x, w.z);
          } else if (w.job === 'farm') {
            setWorkerCarryItem(w.mesh, 'food');
            w.dropStruct = this.world.structures.find((s) => s.type === 'granary' && s.team === 'player') || null;
            w.targetPos = w.dropStruct
              ? this.world.findClearApronPoint(w.dropStruct, rW, w.x, w.z)
              : { x: this.world.granaryPos.x, z: this.world.granaryPos.z + 0.85 };
          }
          w.waypoints = null;
          w.state = 'to_drop';
        }
      }
      // 5. Final Delivery to Stockpile (Wood/Stone/Iron/Oil), Granary (Food), or Armory (Bows/Armor)!
      else if (w.state === 'to_drop') {
        let reachedDrop = this.moveWorkerTowards(w, w.targetPos.x, w.targetPos.z, haulSpd, dt, w.dropStruct);
        if (
          !reachedDrop &&
          !w.dropStruct &&
          Math.max(Math.abs(w.x - this.world.stockpilePos.x), Math.abs(w.z - this.world.stockpilePos.z)) <= 1.18 + rW
        ) {
          reachedDrop = true;
        }
        if (reachedDrop) {
          setWorkerCarryItem(w.mesh, null);
          const popX = w.dropStruct ? w.dropStruct.x : this.world.stockpilePos.x;
          const popZ = w.dropStruct ? w.dropStruct.z : this.world.stockpilePos.z;
          if (w.job === 'woodcutter') {
            this.res.wood += 8;
            this.spawnFloatText(popX, 0.9, popZ, '+8 木', '#fde68a');
          } else if (w.job === 'quarry') {
            const amt = w.carriedAmount || 12;
            w.carriedAmount = 0;
            this.res.stone += amt;
            this.spawnFloatText(popX, 0.9, popZ, `+${amt} 石`, '#e2e8f0');
          } else if (w.job === 'farm') {
            const paddyAmt = this.fortressPaddyUnlocked ? 15 : 12;
            this.res.food += paddyAmt;
            this.spawnFloatText(popX, 1.9, popZ, `+${paddyAmt} 粮`, '#fef08a');
          } else if (w.job === 'ironMine') {
            this.res.iron += 4;
            this.spawnFloatText(popX, 0.9, popZ, '+4 铁', '#fdba74');
          } else if (w.job === 'pitchRig') {
            this.res.oil += 4;
            this.spawnFloatText(popX, 0.9, popZ, '+4 油', '#c4b5fd');
          } else if (w.job === 'fletcher' && w.hasCraftMat) {
            this.res.bows += 2;
            w.hasCraftMat = false;
            this.spawnFloatText(popX, 1.5, popZ, '+2 铳弓', '#93c5fd');
          } else if (w.job === 'blacksmith' && w.hasCraftMat) {
            this.res.armor += 2;
            w.hasCraftMat = false;
            this.spawnFloatText(popX, 1.5, popZ, '+2 明甲', '#cbd5e1');
          }

          this.world.updateStockpileVisuals(this.res);
          w.targetPos = null;
          w.targetTree = null;
          w.targetNode = null;
          w.dropStruct = null;
          w.waypoints = null;
          if (w.isOx) {
            w.state = 'to_home_wait';
          } else if (w.job === 'fletcher' || w.job === 'blacksmith') {
            w.state = 'wait_raw_at_home';
          } else {
            w.state = 'to_source';
          }
        }
      }

      this.snapEntityGroundY(w, rW, dt);
      w.mesh.position.set(w.x, w.y, w.z);
    }
  }

  moveWorkerTowards(ent, tx, tz, speed, dt, goalStruct = null) {
    const rW = this.getEntityRadius(ent);
    // Arrival at building outer perimeter so workers NEVER clip inside workshops/granaries!
    if (goalStruct && this.world.distanceToStructurePerimeter(ent.x, ent.z, goalStruct) <= rW + 0.28) {
      ent.waypoints = null;
      ent.noProgressTime = 0;
      return true;
    }
    const stopDist = goalStruct ? (rW + 0.42) : 0.48;
    const opts = {
      peaceful: true,
      isLarge: Boolean(ent.isOx),
      goalStruct,
      crowdDensity: this.crowdDensity,
    };
    const nav = this.computeAgentDirection(ent, tx, tz, stopDist, dt, opts);
    if (nav.arrived) return true;

    const steered = this.updateStuckWatchdog(ent, nav.dx, nav.dz, dt, opts);
    const len = Math.hypot(steered.dx, steered.dz);
    if (len < 1e-4) return false;

    const nx = steered.dx / len;
    const nz = steered.dz / len;
    const smoothT = Math.min(1, dt * 11);
    ent.vx = ent.vx === undefined ? nx : THREE.MathUtils.lerp(ent.vx, nx, smoothT);
    ent.vz = ent.vz === undefined ? nz : THREE.MathUtils.lerp(ent.vz, nz, smoothT);
    const vLen = Math.hypot(ent.vx, ent.vz) || 1;
    const fx = ent.vx / vLen;
    const fz = ent.vz / vLen;

    const step = speed * dt;
    ent.x = THREE.MathUtils.clamp(ent.x + fx * step, -GRID_W / 2 + 1.2, GRID_W / 2 - 1.2);
    ent.z = THREE.MathUtils.clamp(ent.z + fz * step, -GRID_H / 2 + 1.2, GRID_H / 2 - 1.2);

    ent.animPhase += dt * speed * 3.8;
    if (ent.mesh) {
      const targetYaw = Math.atan2(fx, fz);
      ent.mesh.rotation.y = lerpAngle(ent.mesh.rotation.y, targetYaw, Math.min(1, dt * 11));
      const ud = ent.mesh.userData;
      if (ud.leftLeg) {
        const swing = Math.sin(ent.animPhase) * 0.52;
        ud.leftLeg.rotation.x = swing;
        ud.rightLeg.rotation.x = -swing;
        if (ud.carryMesh && ud.carryMesh.visible) {
          ud.leftArm.rotation.x = -0.95;
          ud.rightArm.rotation.x = -0.95;
        } else {
          ud.leftArm.rotation.x = -swing * 0.48;
          ud.rightArm.rotation.x = swing * 0.48;
        }
      } else if (ud.oxLegs) {
        ud.oxLegs.forEach((l, idx) => {
          l.rotation.x = Math.sin(ent.animPhase + (idx % 2) * Math.PI) * 0.5;
        });
      }
    }
    return false;
  }

  updateEconomy(dt) {
    this.econTickTimer -= dt;
    if (this.econTickTimer <= 0) {
      this.econTickTimer = 1.0;
      const popFactor = Math.max(1, this.getTotalPop() * 0.08);
      if (this.taxPolicy === 'generous') {
        if (this.res.food > 0) this.res.food = Math.max(0, this.res.food - popFactor * 1.1);
        this.res.gold += 0.9;
      } else if (this.taxPolicy === 'balanced') {
        if (this.res.food > 0) this.res.food = Math.max(0, this.res.food - popFactor * 0.65);
        this.res.gold += 2.8;
      } else {
        if (this.res.food > 0) this.res.food = Math.max(0, this.res.food - popFactor * 0.3);
        this.res.gold += 5.8;
      }
      this.world.updateStockpileVisuals(this.res);
    }

    if (this.res.peasants < 12 && this.getTotalPop() < this.res.maxPop && this.res.food >= 2) {
      const interval = this.taxPolicy === 'generous' ? 3.2 : (this.taxPolicy === 'balanced' ? 5.0 : 8.2);
      this.peasantSpawnTimer -= dt;
      if (this.peasantSpawnTimer <= 0) {
        this.peasantSpawnTimer = interval;
        this.res.peasants += 1;
        this.syncCampfirePeasants();
      }
    }
  }

  updateWaveCycle(dt) {
    this.phaseTimer -= dt;

    // Smooth day/night atmospheric grade & lighting transition!
    const targetHorizon = this.isNight ? this.nightHorizon : this.dayHorizon;
    this.scene.background.lerp(targetHorizon, dt * 1.8);
    this.scene.fog.color.copy(this.scene.background);

    this.hemiLight.intensity = THREE.MathUtils.lerp(this.hemiLight.intensity, this.isNight ? 0.28 : 0.46, dt * 2);
    this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, this.isNight ? 1.12 : 1.82, dt * 2);
    this.sunLight.color.lerp(new THREE.Color(this.isNight ? 0x8bb6ff : 0xfff0d2), dt * 2);

    if (this.phaseTimer <= 0) {
      if (!this.isNight) {
        this.triggerNightSiege();
      } else {
        this.isNight = false;
        this.wave += 1;
        this.phaseTimer = this.dayDuration;
        if (!this.clanSteleMartialUnlocked) {
          this.clanSteleMartialUnlocked = true;
          sfx.playScan();
          this.toast('📜 击退首夜倭袭！点亮王氏家风碑【文武世泽·武状元王名世】（铁骑/藤牌募饷 -20%）！');
        } else {
          this.toast(`☀️ 海日破晓！永昌堡守住第 ${this.wave - 1} 夜，速铸佛郎机与虎蹲炮荡平东海倭寨！`);
        }
      }
    }
  }

  // Multi-Lane Anti-Wokou Siege Waves: Central River Ford + Northern Creek Flanking!
  triggerNightSiege() {
    this.isNight = true;
    this.phaseTimer = this.nightDuration;
    sfx.playBell();

    const mainGateOut = gridToWorld(46, 19);
    const northFlankEntry = gridToWorld(38, 10);
    const w = this.wave;

    if (w === 1) {
      this.showTaunt(WOLF_TAUNTS.wave1);
      this.createSquad('spearman', 'enemy', mainGateOut.x, mainGateOut.z - 1.0, true);
      this.createSquad('spearman', 'enemy', mainGateOut.x, mainGateOut.z + 1.0, true);
      this.createSquad('archer', 'enemy', mainGateOut.x + 1.2, mainGateOut.z, true);
    } else if (w === 2) {
      this.showTaunt(WOLF_TAUNTS.wave2);
      this.createSquad('ram', 'enemy', mainGateOut.x - 0.5, mainGateOut.z, true);
      this.createSquad('swordsman', 'enemy', mainGateOut.x, mainGateOut.z + 1.5, true);
      this.createSquad('spearman', 'enemy', northFlankEntry.x, northFlankEntry.z, true);
    } else if (w === 3) {
      if (this.fortressPaddyUnlocked) {
        this.showTaunt('【史载·困城观稼】倭寇登台窥见永昌堡内水田稻浪井然，军心震骇！我军全员战力提升！');
      } else {
        this.showTaunt(WOLF_TAUNTS.wave3);
      }
      const eastBank = gridToWorld(38, 20);
      this.createSquad('trebuchet', 'enemy', eastBank.x, eastBank.z, true);
      this.createSquad('swordsman', 'enemy', mainGateOut.x, mainGateOut.z - 1.5, true);
      this.createSquad('swordsman', 'enemy', northFlankEntry.x, northFlankEntry.z, true);
      this.createSquad('archer', 'enemy', mainGateOut.x + 1.0, mainGateOut.z, true);
    } else {
      this.showTaunt(WOLF_TAUNTS.wave4);
      const eastBank = gridToWorld(38, 20);
      this.createSquad('trebuchet', 'enemy', eastBank.x, eastBank.z, true);
      this.createSquad('ram', 'enemy', mainGateOut.x - 0.6, mainGateOut.z, true);
      this.createSquad('knight', 'enemy', mainGateOut.x, mainGateOut.z + 2.0, true);
      this.createSquad('knight', 'enemy', northFlankEntry.x, northFlankEntry.z, true);
    }
  }

  updateCombat(dt) {
    this.refreshFlowFields(dt);
    const paddyBoost = this.fortressPaddyUnlocked ? 1.15 : 1.0;
    const moraleMult = (this.taxPolicy === 'generous' ? 1.2 : (this.taxPolicy === 'harsh' ? 0.92 : 1.0)) * paddyBoost;

    // 1. Update Portcullis Gates (opens for friendly troops AND gatherer workers/ox-carts!) & Ballistas
    for (const s of this.world.structures) {
      if (s.hp <= 0) continue;
      if (s.type === 'gate' && s.gateLeaf) {
        let friendlyNear = false;
        let enemyNear = false;
        for (const u of this.units) {
          if (u.hp <= 0 || u.garrisonBuilding) continue;
          const d = Math.hypot(u.x - s.x, u.z - s.z);
          if (d < 3.2) {
            if (u.team === s.team) friendlyNear = true;
            else if (d < 2.6) enemyNear = true;
          }
        }
        if (!friendlyNear && !enemyNear && s.team === 'player') {
          for (const w of this.workers) {
            if (Math.hypot(w.x - s.x, w.z - s.z) < 3.2) {
              friendlyNear = true;
              break;
            }
          }
        }
        s.isOpen = friendlyNear && !enemyNear;
        const targetY = s.isOpen ? 1.38 : 0.0;
        s.gateLeaf.position.y = THREE.MathUtils.lerp(s.gateLeaf.position.y, targetY, Math.min(1, dt * 12));
      } else if (s.type === 'ballista') {
        s.shootCooldown -= dt;
        if (s.shootCooldown <= 0) {
          const elevBonus = Math.max(0, s.y) * 1.5;
          const target = this.findNearestEnemyUnit(s.x, s.z, s.team, 13.0 + elevBonus, true);
          if (target) {
            s.shootCooldown = 1.6;
            if (s.mesh.userData.turretGroup) {
              s.mesh.userData.turretGroup.rotation.y =
                Math.atan2(target.x - s.x, target.z - s.z) - (s.mesh.rotation.y || 0);
            }
            this.spawnProjectile({
              fromX: s.x, fromY: s.y + 2.45, fromZ: s.z,
              toX: target.x, toY: target.y + 0.5, toZ: target.z,
              team: s.team, dmg: 55, siegeDmg: 48, kind: 'bolt',
            });
            sfx.playArrow(false);
          }
        }
      }
    }

    // 2. Squad Banners, Shared A* Corridors & Strategic Orders
    for (let sIdx = this.squads.length - 1; sIdx >= 0; sIdx--) {
      const sq = this.squads[sIdx];
      sq.members = sq.members.filter((m) => m.hp > 0);
      if (sq.members.length === 0) {
        this.scene.remove(sq.banner);
        this.squads.splice(sIdx, 1);
        continue;
      }

      if (sq.team === 'player' && !sq.hasCustomOrder && !sq.members.some((m) => m.garrisonWall || m.pendingGarrisonWall)) {
        if (this.stance === 'sally') {
          const siegeTarget = this.units.find((u) => u.team === 'enemy' && u.hp > 0 && u.isSiege);
          const anyEnemy = siegeTarget || this.findNearestEnemyUnit(sq.banner.position.x, sq.banner.position.z, 'player', 30);
          if (anyEnemy) {
            sq.targetX = anyEnemy.x;
            sq.targetZ = anyEnemy.z;
          }
        }
      }

      let avgX = 0, avgZ = 0, maxY = -10;
      sq.members.forEach((m) => {
        avgX += m.x;
        avgZ += m.z;
        if (m.y > maxY) maxY = m.y;
      });
      avgX /= sq.members.length;
      avgZ /= sq.members.length;
      sq.centroidX = avgX;
      sq.centroidZ = avgZ;
      sq.banner.position.x = THREE.MathUtils.lerp(sq.banner.position.x, avgX, dt * 6);
      sq.banner.position.z = THREE.MathUtils.lerp(sq.banner.position.z, avgZ, dt * 6);
      sq.banner.position.y = maxY;
      if (sq.banner.userData.ring) {
        sq.banner.userData.ring.visible = !sq.members.some((m) => m.garrisonWall);
      }
      sq.banner.userData.cloth.rotation.y = Math.sin(performance.now() * 0.006 + sIdx) * 0.22;

      // Maintain shared string-pulled A* corridor on squad when moving to custom/sally/rally anchor!
      const usesGlobalFlow =
        (sq.team === 'enemy' && !sq.isGarrisonGuard) ||
        (sq.team === 'player' && this.stance === 'attack' && !sq.hasCustomOrder);
      if (!usesGlobalFlow && !sq.members.every((m) => m.garrisonWall || m.pendingGarrisonWall)) {
        const goalMoved = Math.hypot((sq.pathGoalX ?? 1e5) - sq.targetX, (sq.pathGoalZ ?? 1e5) - sq.targetZ) > 0.75;
        if (Math.hypot(sq.targetX - avgX, sq.targetZ - avgZ) > 1.1 && (!sq.waypoints || sq.pathVer !== this.world.layoutVersion || goalMoved)) {
          sq.waypoints = this.pathfinder.findPathWorld(
            this.world,
            avgX,
            avgZ,
            sq.targetX,
            sq.targetZ,
            sq.team,
            { isLarge: sq.role === 'trebuchet' || sq.role === 'ram', crowdDensity: this.crowdDensity }
          );
          sq.wpIdx = 0;
          sq.pathVer = this.world.layoutVersion;
          sq.pathGoalX = sq.targetX;
          sq.pathGoalZ = sq.targetZ;
        }
        while (sq.waypoints && sq.wpIdx < sq.waypoints.length - 1) {
          const wp = sq.waypoints[sq.wpIdx];
          if (Math.hypot(wp.x - avgX, wp.z - avgZ) < 1.15) sq.wpIdx++;
          else break;
        }
      }
    }

    // 3. Individual Units Combat + Elevation Bonus + Hybrid FlowField / String-Pulled A* Navigation!
    let stuckUnitsNow = 0;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.hp <= 0) {
        const wSlot = u.garrisonWall || u.pendingGarrisonWall;
        if (wSlot) {
          const gIdx = wSlot.garrison.indexOf(u);
          if (gIdx !== -1) wSlot.garrison.splice(gIdx, 1);
        }
        if (u.crownMarker) this.scene.remove(u.crownMarker);
        this.debris.burst(u.x, u.y + 0.5, u.z, u.team === 'enemy' ? 0xb91c1c : 0x2563eb, u.isSiege ? 22 : 14, 0.95, 0.2);
        this.scene.remove(u.mesh);
        this.units.splice(i, 1);
        if (u === this.playerLord) this.endGame(false);
        if (u === this.enemyLord) this.endGame(true);
        continue;
      }

      u.atkTimer = Math.max(0, u.atkTimer - dt);

      // Physical Controllable / Garrisonable Sovereign Lord (True String-Pulled A* Pathing!)
      if (u.isLord) {
        if (u.garrisonBuilding) {
          const st = u.garrisonBuilding;
          if (st.hp <= 0) {
            this.exitBuildingWithLord(u, null, null, true);
          } else {
            u.x = st.x;
            u.y = st.y;
            u.z = st.z;
            u.mesh.visible = false;
            if (u.crownMarker) {
              u.crownMarker.visible = true;
              const lift = st.type === 'tower' ? 0.94 : 0.62;
              const bob = Math.sin(performance.now() * 0.0042) * 0.08;
              u.crownMarker.position.set(st.x, st.y + st.height + lift + bob, st.z);
              u.crownMarker.rotation.y += dt * 1.4;
            }
            u.hp = Math.min(u.maxHp, u.hp + 3.5 * dt);
            if (['keep', 'tower', 'gate', 'ballista'].includes(st.type) && u.atkTimer <= 0) {
              const target = this.findNearestEnemyUnit(st.x, st.z, u.team, 10.5 + Math.max(0, st.y) * 1.2);
              if (target) {
                u.atkTimer = 1.15;
                this.spawnProjectile({
                  fromX: st.x, fromY: st.y + st.height + 0.35, fromZ: st.z,
                  toX: target.x, toY: target.y + 0.45, toZ: target.z,
                  team: u.team, dmg: 34, siegeDmg: 18, kind: 'bolt',
                });
                sfx.playArrow(false);
              }
            }
            continue;
          }
        }

        u.mesh.visible = true;
        if (u.crownMarker) u.crownMarker.visible = false;

        if (u.pendingEnterBuilding) {
          const st = u.pendingEnterBuilding;
          if (!st || st.hp <= 0) {
            u.pendingEnterBuilding = null;
            u.waypoints = null;
          } else {
            const rU = this.getEntityRadius(u);
            const perimDist = this.world.distanceToStructurePerimeter(u.x, u.z, st);
            if (perimDist <= rU + 0.30) {
              this.enterBuildingWithLord(u, st, false);
              continue;
            }
            const apron = this.world.findClearApronPoint(st, rU, u.x, u.z);
            const navOpts = { goalStruct: st, crowdDensity: this.crowdDensity };
            const nav = this.computeAgentDirection(u, apron.x, apron.z, 0.38, dt, navOpts);
            if (nav.arrived) {
              this.enterBuildingWithLord(u, st, false);
              continue;
            }
            const steered = this.updateStuckWatchdog(u, nav.dx, nav.dz, dt, navOpts);
            this.stepUnitSmart(u, steered.dx, steered.dz, dt, moraleMult);
            continue;
          }
        }

        if (u.orderTarget) {
          const navOpts = { crowdDensity: this.crowdDensity };
          const nav = this.computeAgentDirection(u, u.orderTarget.x, u.orderTarget.z, 0.36, dt, navOpts);
          if (!nav.arrived) {
            const steered = this.updateStuckWatchdog(u, nav.dx, nav.dz, dt, navOpts);
            this.stepUnitSmart(u, steered.dx, steered.dz, dt, moraleMult);
            continue;
          }
          u.orderTarget = null;
        }
        // Otherwise fall through to close-quarters heroic melee defense!
      }

      if (!this.wolfPanicked && u.team === 'player' && u.x > 6.5) {
        this.wolfPanicked = true;
        this.showTaunt(WOLF_TAUNTS.underAttack);
      }

      // Archers running on the ground via A* to climb onto their assigned Wall / Tower (mount at outer perimeter — zero wall clipping!)
      if (u.pendingGarrisonWall) {
        const w = u.pendingGarrisonWall;
        if (!w || w.hp <= 0) {
          u.pendingGarrisonWall = null;
          u.waypoints = null;
        } else {
          const rU = this.getEntityRadius(u);
          if (this.world.distanceToStructurePerimeter(u.x, u.z, w) <= rU + 0.34) {
            u.garrisonWall = w;
            u.pendingGarrisonWall = null;
            u.waypoints = null;
          } else {
            const apron = this.world.findClearApronPoint(w, rU, u.x, u.z);
            const navOpts = { goalStruct: w, crowdDensity: this.crowdDensity };
            const nav = this.computeAgentDirection(u, apron.x, apron.z, 0.42, dt, navOpts);
            if (nav.arrived) {
              u.garrisonWall = w;
              u.pendingGarrisonWall = null;
              u.waypoints = null;
            } else {
              const steered = this.updateStuckWatchdog(u, nav.dx, nav.dz, dt, navOpts);
              this.stepUnitSmart(u, steered.dx, steered.dz, dt, moraleMult);
              continue;
            }
          }
        }
      }

      // Garrisoned Wall / Tower Archers (True Elevation + Tower Range Bonus!)
      if (u.garrisonWall && u.garrisonWall.hp > 0) {
        const w = u.garrisonWall;
        const ox = u.slotOffset ? u.slotOffset.ox : 0;
        const oz = u.slotOffset ? u.slotOffset.oz : 0;
        u.x = THREE.MathUtils.lerp(u.x, w.x + ox, dt * 10);
        u.z = THREE.MathUtils.lerp(u.z, w.z + oz, dt * 10);
        u.y = THREE.MathUtils.lerp(u.y, w.y + w.height, Math.min(1, dt * 16));

        const heightBonus = Math.max(0, u.y) * 1.15;
        const effRange = u.range + heightBonus;
        const isFireArrow = w.type === 'tower';
        const target = this.findNearestEnemyUnit(u.x, u.z, u.team, effRange);
        if (target) {
          const aimYaw = Math.atan2(target.x - u.x, target.z - u.z);
          u.mesh.rotation.y = lerpAngle(u.mesh.rotation.y, aimYaw, Math.min(1, dt * 12));
          if (u.atkTimer <= 0) {
            u.atkTimer = u.cooldown;
            u.swingTimer = 0.26;
            const dmgMult = (u.team === 'player' ? moraleMult : 1.0) * (w.type === 'tower' ? 1.28 : 1.1);
            this.spawnProjectile({
              fromX: u.x, fromY: u.y + 0.65, fromZ: u.z,
              toX: target.x, toY: target.y + 0.45, toZ: target.z,
              team: u.team,
              dmg: u.dmg * dmgMult,
              siegeDmg: u.siegeDmg,
              kind: isFireArrow ? 'fire_arrow' : 'arrow',
            });
            sfx.playArrow(isFireArrow);
          }
        }
        this.syncUnitVisuals(u, dt, false);
        continue;
      }

      // Ranged & Trebuchet Siege Targeting
      if (u.isRanged) {
        const heightAdv = Math.max(0, u.y) * 1.1;
        const effRange = u.range + heightAdv;
        const structTarget = u.role === 'trebuchet'
          ? this.findEnemyCastleTarget(u.x, u.z, u.team, effRange)
          : null;
        const unitTarget = u.role === 'trebuchet' && structTarget
          ? null
          : this.findNearestEnemyUnit(u.x, u.z, u.team, effRange);

        const chosen = structTarget || unitTarget;
        if (chosen) {
          const aimYaw = Math.atan2(chosen.x - u.x, chosen.z - u.z);
          u.mesh.rotation.y = lerpAngle(u.mesh.rotation.y, aimYaw, Math.min(1, dt * 10));
          if (u.atkTimer <= 0) {
            u.atkTimer = u.cooldown;
            u.swingTimer = 0.45;
            const dmgMult = u.team === 'player' ? moraleMult : 1.0;
            const targetY = chosen.height ? (chosen.y || 0) + chosen.height * 0.6 : (chosen.y || 0) + 0.4;
            this.spawnProjectile({
              fromX: u.x, fromY: u.y + (u.isSiege ? 1.85 : 0.75), fromZ: u.z,
              toX: chosen.x + (Math.random() - 0.5) * 0.35,
              toY: targetY,
              toZ: chosen.z + (Math.random() - 0.5) * 0.35,
              team: u.team,
              dmg: u.dmg * dmgMult,
              siegeDmg: u.siegeDmg * dmgMult,
              kind: u.role === 'trebuchet' ? 'boulder' : 'arrow',
            });
            if (u.role === 'trebuchet') sfx.playPlaceBlock('wood');
            else sfx.playArrow(false);
          }
          u.noProgressTime = 0;
          this.syncUnitVisuals(u, dt, false);
          continue;
        }
      }

      // Close-quarters Engagement + Melee Surround Flanking (Engage reach respects hard body radii!)
      const nearEnemy = u.role === 'ram' ? null : this.findNearestEnemyUnit(u.x, u.z, u.team, 4.1);
      if (nearEnemy && Math.abs(nearEnemy.y - u.y) < 1.35) {
        const edx = nearEnemy.x - u.x;
        const edz = nearEnemy.z - u.z;
        const dist = Math.hypot(edx, edz);
        const engageReach = Math.max(u.range, this.getEntityRadius(u) + this.getEntityRadius(nearEnemy) + 0.24);
        if (dist <= engageReach) {
          const aimYaw = Math.atan2(edx, edz);
          u.mesh.rotation.y = lerpAngle(u.mesh.rotation.y, aimYaw, Math.min(1, dt * 14));
          if (u.atkTimer <= 0) {
            u.atkTimer = u.cooldown;
            u.swingTimer = 0.28;
            const langxianBonus = (u.team === 'player' && u.role === 'spearman' && !nearEnemy.isRanged && !nearEnemy.isSiege) ? 1.25 : 1.0;
            nearEnemy.hp -= u.dmg * (u.team === 'player' ? moraleMult : 1.0) * langxianBonus;
            this.debris.burst((u.x + nearEnemy.x) * 0.5, u.y + 0.55, (u.z + nearEnemy.z) * 0.5, 0xffaa00, 4, 0.52, 0.09);
            sfx.playHit();
          }
          u.noProgressTime = 0;
          this.syncUnitVisuals(u, dt, false);
          continue;
        }

        // Melee Surround Steering: if an ally is directly ahead blocking the target, curve around to flank!
        let fdx = edx / (dist || 1);
        let fdz = edz / (dist || 1);
        let allyAhead = false;
        this.spatialGrid.queryRadius(u.x + fdx * 0.58, u.z + fdz * 0.58, 0.58, (other) => {
          if (other !== u && !other.isCivilian && other.team === u.team) allyAhead = true;
        });
        if (allyAhead) {
          if (!u.flankSign) u.flankSign = (i % 2 === 0) ? 1 : -1;
          fdx += -fdz * u.flankSign * 0.65;
          fdz += (edx / (dist || 1)) * u.flankSign * 0.65;
        }
        const steered = this.updateStuckWatchdog(u, fdx, fdz, dt, { isLarge: u.isSiege });
        this.stepUnitSmart(u, steered.dx, steered.dz, dt, moraleMult);
        continue;
      }

      // Navigate via Continuous Bilinear 2.5D FlowField OR Shared Squad String-Pulled A* Corridor!
      if (u.squad) {
        const sq = u.squad;
        const useEnemyFlow = u.team === 'enemy' && !sq.isGarrisonGuard;
        const usePlayerAttackFlow = u.team === 'player' && this.stance === 'attack' && !sq.hasCustomOrder;

        if (useEnemyFlow || usePlayerAttackFlow) {
          const flow = useEnemyFlow ? this.flowToPlayer : this.flowToEnemy;
          const dir = flow.sampleWorld(u.x, u.z, this.world);
          if (dir.x !== 0 || dir.z !== 0) {
            const steered = this.updateStuckWatchdog(u, dir.x, dir.z, dt, { isLarge: u.isSiege });
            if (u.isCurrentlyStuck) stuckUnitsNow++;
            this.stepUnitSmart(u, steered.dx, steered.dz, dt, moraleMult);
            continue;
          }
        }

        const memberIdx = sq.members.indexOf(u);
        const spreadAngle = (memberIdx / Math.max(1, sq.members.length)) * Math.PI * 2;
        const spreadR = sq.members.length > 1 ? Math.max(0.66, this.getEntityRadius(u) * 2.05) : 0;
        const slotX = sq.targetX + Math.cos(spreadAngle) * spreadR;
        const slotZ = sq.targetZ + Math.sin(spreadAngle) * spreadR;

        // Follow shared squad A* corridor waypoint until final approach leg!
        let goalX = slotX;
        let goalZ = slotZ;
        if (sq.waypoints && sq.wpIdx < sq.waypoints.length - 1) {
          goalX = sq.waypoints[sq.wpIdx].x + Math.cos(spreadAngle) * (spreadR * 0.5);
          goalZ = sq.waypoints[sq.wpIdx].z + Math.sin(spreadAngle) * (spreadR * 0.5);
        }

        const dx = goalX - u.x;
        const dz = goalZ - u.z;
        if (Math.hypot(slotX - u.x, slotZ - u.z) > 0.32) {
          const steered = this.updateStuckWatchdog(u, dx, dz, dt, { isLarge: u.isSiege });
          if (u.isCurrentlyStuck) stuckUnitsNow++;
          this.stepUnitSmart(u, steered.dx, steered.dz, dt, moraleMult);
        } else {
          u.noProgressTime = 0;
          this.syncUnitVisuals(u, dt, false);
        }
      } else {
        u.noProgressTime = 0;
        this.syncUnitVisuals(u, dt, false);
      }
    }
    this.navStats.stuckNow = stuckUnitsNow;

    // 4. Multi-Pass PBD Crowd Separation + Hard Static Building/Terrain/Tree/Water Depenetration!
    this.resolveCollisions(dt);

    this.updateProjectiles(dt);
  }

  resolveCollisions(dt) {
    // 1. Gently return idle campfire peasants toward their hearth ring when clear
    if (this.campfirePeasants) {
      for (let i = 0; i < this.campfirePeasants.length; i++) {
        const p = this.campfirePeasants[i];
        const dx = p.homeX - p.x;
        const dz = p.homeZ - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.04) {
          const step = Math.min(d, 1.45 * dt);
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
        }
      }
    }

    // 2. Collect ALL physical ground bodies (soldiers, knights, siege, Lords, workers, ox-carts, idle peasants!)
    if (!this._groundBodies) this._groundBodies = [];
    const bodies = this._groundBodies;
    bodies.length = 0;

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.hp <= 0 || u.garrisonWall || u.garrisonBuilding) continue;
      u._bodyOrder = bodies.length;
      bodies.push(u);
    }
    for (let i = 0; i < this.workers.length; i++) {
      const w = this.workers[i];
      if (!w.home || w.home.hp <= 0) continue;
      w._bodyOrder = bodies.length;
      bodies.push(w);
    }
    if (this.campfirePeasants) {
      for (let i = 0; i < this.campfirePeasants.length; i++) {
        const p = this.campfirePeasants[i];
        p._bodyOrder = bodies.length;
        bodies.push(p);
      }
    }

    // 3. Run 3 Deterministic PBD Passes: Mass-Weighted Circle Separation -> Hard World Obstacle Projection!
    for (let iter = 0; iter < 3; iter++) {
      this.spatialGrid.clear();
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        this.spatialGrid.insert(b, b.x, b.z);
      }

      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        const rA = this.getEntityRadius(a);
        const wA = this.getEntityInvMass(a);

        this.spatialGrid.queryRadius(a.x, a.z, rA + 0.72, (b) => {
          if (a._bodyOrder >= b._bodyOrder) return;
          const rB = this.getEntityRadius(b);
          const minDist = rA + rB;
          let dx = b.x - a.x;
          let dz = b.z - a.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= minDist * minDist) return;

          let d = Math.sqrt(d2);
          if (d < 1e-4) {
            const ang = (a._bodyOrder * 2.39996) % (Math.PI * 2);
            dx = Math.cos(ang) * 0.05;
            dz = Math.sin(ang) * 0.05;
            d = 0.05;
          }

          const wB = this.getEntityInvMass(b);
          const wSum = wA + wB || 1.0;
          const overlap = (minDist - d) * 0.85;
          const nx = dx / d;
          const nz = dz / d;

          a.x -= nx * overlap * (wA / wSum);
          a.z -= nz * overlap * (wA / wSum);
          b.x += nx * overlap * (wB / wSum);
          b.z += nz * overlap * (wB / wSum);
        });
      }

      // Immediately enforce hard static colliders (buildings, gate piers, trees, boulders, cliffs, water!)
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        this.world.projectOutOfObstacles(b, this.getEntityRadius(b), b.team || 'player');
      }
    }

    // 4. Sync exact micro-voxel foot height & mesh transform on every body!
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const rB = this.getEntityRadius(b);
      this.snapEntityGroundY(b, rB, dt);
      if (b.mesh) {
        b.mesh.position.set(b.x, b.y, b.z);
        if (b.isPeasantIdle) {
          b.mesh.lookAt(this.world.campfirePos.x, b.y, this.world.campfirePos.z);
        }
      }
    }
  }

  findBlockingEnemyStructure(u, nx, nz) {
    const rU = this.getEntityRadius(u);
    const probeDist = rU + 0.48;
    const probeG = worldToGrid(u.x + nx * probeDist, u.z + nz * probeDist);
    const aheadCell = this.world.getCell(probeG.gx, probeG.gz);
    if (aheadCell && aheadCell.structure && aheadCell.structure.hp > 0 && aheadCell.structure.team !== u.team) {
      return aheadCell.structure;
    }
    // Also check perimeter contact in local 3x3 cells so wide siege rams engage cleanly at wall surface!
    const cg = worldToGrid(u.x, u.z);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const nc = this.world.getCell(cg.gx + dx, cg.gz + dz);
        const st = nc && nc.structure;
        if (!st || st.hp <= 0 || st.team === u.team) continue;
        if (this.world.distanceToStructurePerimeter(u.x, u.z, st) <= rU + 0.22) {
          const toX = st.x - u.x;
          const toZ = st.z - u.z;
          if (toX * nx + toZ * nz > -0.15) return st;
        }
      }
    }
    return null;
  }

  // Context-Steering + Multi-Angle Feeler Obstacle Slide + Smooth Velocity/Yaw Damping!
  stepUnitSmart(u, dirX, dirZ, dt, moraleMult) {
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.001) {
      this.syncUnitVisuals(u, dt, false);
      return;
    }
    let nx = dirX / len;
    let nz = dirZ / len;
    const rU = this.getEntityRadius(u);

    // 1. Attack blocking enemy wall / gate / tower / keep from outside its stone perimeter!
    const enemySt = this.findBlockingEnemyStructure(u, nx, nz);
    if (enemySt) {
      const aimYaw = Math.atan2(enemySt.x - u.x, enemySt.z - u.z);
      u.mesh.rotation.y = lerpAngle(u.mesh.rotation.y, aimYaw, Math.min(1, dt * 13));
      if (u.atkTimer <= 0) {
        u.atkTimer = u.cooldown;
        u.swingTimer = 0.32;
        const sDmg = u.siegeDmg * (u.team === 'player' ? moraleMult : 1.0);
        this.world.damageStructure(enemySt, sDmg);
        if (u.role === 'ram') {
          sfx.playExplosion();
          this.debris.burst(enemySt.x, enemySt.y + 0.9, enemySt.z, enemySt.team === 'enemy' ? 0x3f434e : 0xd6d3cd, 10, 0.95, 0.22);
        } else {
          sfx.playHit();
        }
      }
      u.noProgressTime = 0;
      this.syncUnitVisuals(u, dt, false);
      return;
    }

    const curG = worldToGrid(u.x, u.z);
    const probeDist = rU + 0.45;
    const probeG = worldToGrid(u.x + nx * probeDist, u.z + nz * probeDist);
    const aheadCell = this.world.getCell(probeG.gx, probeG.gz);

    if (aheadCell) {
      // Check unified traversal rules; if blocked, probe 6 symmetric feeler rays (±28°, ±58°, ±88°)!
      const ignoreSt = u.pendingEnterBuilding || u.pendingGarrisonWall || null;
      const directCost = evaluateStepCost(
        this.world,
        curG.gx,
        curG.gz,
        probeG.gx,
        probeG.gz,
        1.0,
        u.team,
        { isLarge: u.isSiege, ignoreStruct: ignoreSt }
      );

      if (directCost < 0 || directCost > 18) {
        const baseAng = Math.atan2(nx, nz);
        const testAngles = [0.49, -0.49, 1.01, -1.01, 1.54, -1.54];
        let bestAng = null;
        let bestScore = Infinity;
        for (let k = 0; k < testAngles.length; k++) {
          const ang = baseAng + testAngles[k];
          const tx = Math.sin(ang);
          const tz = Math.cos(ang);
          const tg = worldToGrid(u.x + tx * (rU + 0.52), u.z + tz * (rU + 0.52));
          const sc = evaluateStepCost(
            this.world,
            curG.gx,
            curG.gz,
            tg.gx,
            tg.gz,
            1.0,
            u.team,
            { isLarge: u.isSiege, ignoreStruct: ignoreSt }
          );
          if (sc >= 0 && sc + Math.abs(testAngles[k]) * 1.4 < bestScore) {
            bestScore = sc + Math.abs(testAngles[k]) * 1.4;
            bestAng = ang;
          }
        }
        if (bestAng !== null) {
          nx = Math.sin(bestAng);
          nz = Math.cos(bestAng);
        }
      }
    }

    // Smoothly align wide units with friendly 2-body-width Gatehouse archway centerlines!
    const funneled = this.applyGateFunnelSteering(u, nx, nz);
    nx = funneled.nx;
    nz = funneled.nz;

    // Smooth velocity & shortest-arc heading spring so units glide around bends without 1-frame yaw snaps!
    const smoothT = Math.min(1, dt * 11);
    u.vx = u.vx === undefined ? nx : THREE.MathUtils.lerp(u.vx, nx, smoothT);
    u.vz = u.vz === undefined ? nz : THREE.MathUtils.lerp(u.vz, nz, smoothT);
    const vLen = Math.hypot(u.vx, u.vz) || 1;
    const fx = u.vx / vLen;
    const fz = u.vz / vLen;

    u.x = THREE.MathUtils.clamp(u.x + fx * u.speed * dt, -GRID_W / 2 + 1.5, GRID_W / 2 - 1.5);
    u.z = THREE.MathUtils.clamp(u.z + fz * u.speed * dt, -GRID_H / 2 + 1.5, GRID_H / 2 - 1.5);
    this.snapEntityGroundY(u, rU, dt);

    const targetYaw = Math.atan2(fx, fz);
    u.mesh.rotation.y = lerpAngle(u.mesh.rotation.y, targetYaw, Math.min(1, dt * 13));
    this.syncUnitVisuals(u, dt, true);
  }

  syncUnitVisuals(u, dt, moving) {
    u.mesh.position.set(u.x, u.y, u.z);
    if (moving) u.animPhase += dt * u.speed * 3.7;

    const ud = u.mesh.userData;
    if (ud.leftLeg) {
      const legAngle = moving ? Math.sin(u.animPhase) * 0.48 : 0;
      if (ud.isMounted) {
        // Mounted Knight keeps armored legs firmly in stirrups outside horse flanks — zero horse clipping!
        ud.leftLeg.rotation.x = -0.42;
        ud.rightLeg.rotation.x = -0.42;
      } else {
        ud.leftLeg.rotation.x = legAngle;
        ud.rightLeg.rotation.x = -legAngle;
      }
      ud.leftArm.rotation.x = ud.isArmored ? (-0.38 - legAngle * 0.18) : (-legAngle * 0.45);
      if (u.swingTimer > 0) {
        u.swingTimer -= dt;
        ud.rightArm.rotation.x = -1.25 * Math.sin((u.swingTimer / 0.3) * Math.PI);
      } else {
        ud.rightArm.rotation.x = legAngle * 0.45;
      }
      if (ud.horseGroup && ud.horseGroup.userData.legs) {
        ud.horseGroup.userData.legs.forEach((l, idx) => {
          l.rotation.x = moving ? Math.sin(u.animPhase * 1.4 + (idx % 2) * Math.PI) * 0.58 : 0;
        });
      }
    } else if (ud.armPivot) {
      if (u.swingTimer > 0) {
        u.swingTimer -= dt;
        ud.armPivot.rotation.x = THREE.MathUtils.lerp(0.95, -0.35, 1 - u.swingTimer / 0.45);
      } else {
        ud.armPivot.rotation.x = THREE.MathUtils.lerp(ud.armPivot.rotation.x, -0.35, dt * 3);
      }
    } else if (ud.ramLog) {
      if (u.swingTimer > 0) {
        u.swingTimer -= dt;
        ud.ramLog.position.z = Math.sin((u.swingTimer / 0.32) * Math.PI) * 0.44;
      } else {
        ud.ramLog.position.z = 0;
      }
    }
  }

  findNearestEnemyUnit(x, z, myTeam, maxRange, preferSiege = false) {
    let best = null;
    let bestScore = Infinity;

    // Fast O(1) SpatialHashGrid query for ground combat enemies (skipping civilian workers/peasants!)
    this.spatialGrid.queryRadius(x, z, maxRange, (u) => {
      if (u.isCivilian || u.team === myTeam || u.hp <= 0 || u.garrisonBuilding) return;
      const d = Math.hypot(u.x - x, u.z - z);
      if (d > maxRange) return;
      const score = preferSiege && u.isSiege ? d * 0.35 : d;
      if (score < bestScore) {
        bestScore = score;
        best = u;
      }
    });

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u.garrisonWall || u.team === myTeam || u.hp <= 0 || u.garrisonBuilding) continue;
      const d = Math.hypot(u.x - x, u.z - z);
      if (d <= maxRange && d < bestScore) {
        bestScore = d;
        best = u;
      }
    }
    return best;
  }

  findEnemyCastleTarget(x, z, myTeam, maxRange) {
    let best = null;
    let bestDist = maxRange;
    for (const s of this.world.structures) {
      if (s.team === myTeam || s.hp <= 0 || ['campfire', 'stockpile', 'armory'].includes(s.type)) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  spawnProjectile(cfg) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    let mat = this.mats.timberDark;
    let scale = [0.08, 0.08, 0.44];
    if (cfg.kind === 'fire_arrow') {
      mat = this.mats.fireCore;
      scale = [0.12, 0.12, 0.50];
    } else if (cfg.kind === 'boulder') {
      mat = this.mats.fireMid;
      scale = [0.46, 0.46, 0.46];
    } else if (cfg.kind === 'bolt') {
      mat = this.mats.steelBright;
      scale = [0.12, 0.12, 0.60];
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(...scale);
    mesh.position.set(cfg.fromX, cfg.fromY, cfg.fromZ);
    this.scene.add(mesh);

    const dist = Math.hypot(cfg.toX - cfg.fromX, cfg.toZ - cfg.fromZ);
    const speed = cfg.kind === 'boulder' ? 10.2 : (cfg.kind === 'bolt' ? 19 : 14.5);
    const duration = Math.max(0.18, dist / speed);
    const arcHeight = cfg.kind === 'boulder' ? Math.max(2.8, dist * 0.32) : (cfg.kind === 'bolt' ? 0.35 : Math.max(0.95, dist * 0.16));

    this.projectiles.push({ ...cfg, mesh, elapsed: 0, duration, arcHeight });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.elapsed += dt;
      const t = Math.min(1, p.elapsed / p.duration);
      const cx = THREE.MathUtils.lerp(p.fromX, p.toX, t);
      const cz = THREE.MathUtils.lerp(p.fromZ, p.toZ, t);
      const baseY = THREE.MathUtils.lerp(p.fromY, p.toY, t);
      const cy = baseY + Math.sin(t * Math.PI) * p.arcHeight;

      p.mesh.lookAt(cx + (p.toX - p.fromX) * 0.1, cy, cz + (p.toZ - p.fromZ) * 0.1);
      p.mesh.position.set(cx, cy, cz);

      if (t >= 1) {
        this.onProjectileImpact(p);
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  onProjectileImpact(p) {
    const g = worldToGrid(p.toX, p.toZ);

    if (p.kind === 'fire_arrow' || p.kind === 'boulder') {
      let ignited = false;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (this.world.ignitePitchAt(g.gx + dx, g.gz + dz)) ignited = true;
        }
      }
      if (ignited) sfx.playFireIgnite();
    }

    if (p.kind === 'boulder') {
      sfx.playExplosion();
      this.camShake = Math.min(0.28, (this.camShake || 0) + 0.16);
      this.debris.burst(p.toX, p.toY + 0.3, p.toZ, 0xff7700, 18, 1.4, 0.26);

      for (let sIdx = this.world.structures.length - 1; sIdx >= 0; sIdx--) {
        const s = this.world.structures[sIdx];
        if (s.team === p.team || s.hp <= 0) continue;
        if (Math.hypot(s.x - p.toX, s.z - p.toZ) < 1.75) {
          this.world.damageStructure(s, p.siegeDmg);
        }
      }
      for (const u of this.units) {
        if (u.team === p.team || u.hp <= 0 || u.garrisonBuilding) continue;
        if (Math.hypot(u.x - p.toX, u.z - p.toZ) < 1.95) {
          u.hp -= p.dmg;
        }
      }
    } else {
      const victim = this.findNearestEnemyUnit(p.toX, p.toZ, p.team, 1.2);
      if (victim) {
        let finalDmg = p.dmg;
        if (victim.garrisonWall) finalDmg *= 0.55;
        if (victim.arrowResist) finalDmg *= (1 - victim.arrowResist);
        victim.hp -= finalDmg;
      }
    }
  }

  manualIgniteAllPitch() {
    let any = false;
    for (let x = 0; x < GRID_W; x++) {
      for (let z = 0; z < GRID_H; z++) {
        if (this.world.cells[x][z].hasPitch) {
          if (this.world.ignitePitchAt(x, z)) any = true;
        }
      }
    }
    if (any) {
      sfx.playFireIgnite();
      this.toast('🔥 城前猛火油伏火壕全线轰燃，烈焰阻断倭寇！！');
    } else {
      this.toast('地面暂无未引燃的【猛火油伏火壕】，可在永昌城防栏铺设！');
    }
  }

  repairAllWalls() {
    let repaired = 0;
    const freeEveryTwo = this.clanSteleWallsUnlocked;
    for (const s of this.world.structures) {
      if (s.team === 'player' && s.hp > 0 && s.hp < s.maxHp && ['wall', 'tower', 'gate', 'ballista'].includes(s.type)) {
        const needStone = (freeEveryTwo && repaired % 2 === 1) ? 0 : 1;
        if (this.res.stone >= needStone) {
          this.res.stone -= needStone;
          s.hp = s.maxHp;
          repaired++;
        }
      }
    }
    if (repaired > 0) {
      sfx.playPlaceBlock('stone');
      this.world.updateStockpileVisuals(this.res);
      this.toast(`🔨 永昌工匠已修缮 ${repaired} 处受损花岗城垣与敌台！`);
    } else {
      this.toast('当前没有受损城防，或花岗条石不足');
    }
  }

  // Scout Patrol Inspection (`斥候巡防`): Checks breach paths from East Ford & North Ford to the Wang Ancestral Hall!
  runScoutPatrolCheck() {
    sfx.playScan();
    this.scoutLines.forEach((sl) => this.scene.remove(sl.mesh));
    this.scoutLines = [];

    const goal = this.world.playerKeep || { x: -22, z: 0 };
    const probes = [
      { label: '东门迎川道', start: gridToWorld(35, 20), col: 0xfacc15 },
      { label: '北湾环海道', start: gridToWorld(33, 10), col: 0xf97316 },
    ];
    const openLanes = [];

    probes.forEach((pr) => {
      const wps = this.pathfinder.findPathWorld(this.world, pr.start.x, pr.start.z, goal.x + 1.4, goal.z, 'enemy', {
        peaceful: true,
      });
      if (wps && wps.length > 1) {
        const last = wps[wps.length - 1];
        const distToKeep = Math.hypot(last.x - (goal.x + 1.4), last.z - goal.z);
        if (distToKeep < 2.3) openLanes.push(pr.label);

        const pts3D = wps.map((p) => new THREE.Vector3(p.x, this.world.getElevationAtWorld(p.x, p.z) + 0.24, p.z));
        const curve = new THREE.CatmullRomCurve3(pts3D);
        const tubeGeo = new THREE.TubeGeometry(curve, Math.min(64, pts3D.length * 4), 0.075, 5, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: distToKeep < 2.3 ? 0xf59e0b : 0x4ade80,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(tubeGeo, tubeMat);
        mesh.userData.noOutline = true;
        this.scene.add(mesh);
        this.scoutLines.push({ mesh, life: 4.5, maxLife: 4.5 });
      }
    });

    const farms = this.world.structures.filter((s) => s.team === 'player' && s.type === 'farm' && s.hp > 0).length;
    const paddyHint = farms < 3 ? `（另：堡内再垦 ${3 - farms} 块水田即可触发【堡内有田】耕战增益）` : '（堡内水田充盈，粮道无忧）';

    if (openLanes.length > 0) {
      this.showTaunt(`【永昌斥候禀报】${openLanes.join('、')}尚有缺口直通王氏大宗祠！请速筑花岗城墙与谯楼铁闸封堵${paddyHint}`);
    } else {
      this.showTaunt(`【永昌斥候禀报】四门石垣与铁闸已形成严密合围！可在城前增设空心敌台与猛火油伏火壕聚歼来犯倭寇${paddyHint}`);
    }
  }

  triggerRewardedAd(kind) {
    const modal = document.getElementById('ad-modal');
    const titleEl = document.getElementById('ad-title');
    const descEl = document.getElementById('ad-desc');
    const barEl = document.getElementById('ad-progress-fill');
    const skipBtn = document.getElementById('ad-claim-btn');

    if (kind === 'airdrop') {
      if (this.airdropsUsed >= 2) {
        this.toast('本局英桥王氏合族义捐已尽数调拨 (2/2)');
        return;
      }
      titleEl.textContent = '📜 英桥王氏 · 合族输财助边';
      if (descEl) descEl.textContent = '王叔果、王叔杲兄弟毁家纾难，四乡王氏族人正将楠竹杉木、大罗山条石与军饷运抵宗祠！';
    } else {
      titleEl.textContent = '🔥 烽火传讯 · 戚家军精锐驰援';
      if (descEl) descEl.textContent = '永昌空心敌台狼烟升腾，浙南抗倭义军铁骑与温州藤牌营正星夜驰援大宗祠！';
    }

    modal.classList.remove('hidden');
    barEl.style.width = '0%';
    skipBtn.disabled = true;
    skipBtn.textContent = '义军粮械集结中...';

    const prevScale = this.timeScale;
    this.timeScale = 0;

    let p = 0;
    const iv = setInterval(() => {
      p += 50;
      barEl.style.width = `${Math.min(100, p)}%`;
      if (p >= 100) {
        clearInterval(iv);
        skipBtn.disabled = false;
        skipBtn.textContent = '✅ 开门接应义捐粮械！';
      }
    }, 220);

    skipBtn.onclick = () => {
      clearInterval(iv);
      modal.classList.add('hidden');
      this.timeScale = prevScale || 1;

      if (kind === 'airdrop') {
        this.airdropsUsed++;
        this.res.wood += 55;
        this.res.stone += 50;
        this.res.gold += 120;
        this.res.oil += 10;
        this.world.updateStockpileVisuals(this.res);
        this.debris.burst(this.world.campfirePos.x, this.world.campfirePos.y + 2.0, this.world.campfirePos.z, 0xfacc15, 20, 1.0, 0.22);
        sfx.playHorn(false);
        this.toast('📜 宗族义捐运抵！竹木+55 条石+50 饷银+120 火油+10');
      } else if (kind === 'guard') {
        this.emergencyGuardUsed = true;
        this.createSquad('knight', 'player', this.world.playerKeep.x + 2.5, this.world.playerKeep.z - 1.5, true);
        this.createSquad('swordsman', 'player', this.world.playerKeep.x + 2.5, this.world.playerKeep.z + 1.5, true);
        if (this.playerLord) this.playerLord.hp = Math.min(this.playerLord.maxHp, this.playerLord.hp + 580);
        sfx.playHorn(true);
        this.toast('🛡️ 浙南抗倭铁骑与藤牌营已抵达王氏宗祠护驾！');
      }
      this.updateHUD();
    };
  }

  endGame(victory) {
    if (this.gameOver) return;
    this.gameOver = true;
    if (victory) sfx.playHorn(true);
    else sfx.playBell();

    const fortCount = this.world.structures.filter((s) => s.team === 'player' && ['wall', 'tower', 'gate', 'ballista'].includes(s.type)).length;
    const farmCount = this.world.structures.filter((s) => s.team === 'player' && s.type === 'farm').length;
    const modal = document.getElementById('gameover-modal');
    document.getElementById('go-title').textContent = victory
      ? '🏯 海波平定 · 永昌千秋！！'
      : '💀 宗祠失守 · 戊午泣血...';
    document.getElementById('go-desc').textContent = victory
      ? `嘉靖戊午大捷！你在第 ${this.wave} 幕率永昌义军渡河焚毁东海倭寇安宅巨舰，斩首倭酋黑鲨鬼丸！本局共筑城垣敌台 ${fortCount} 座、开垦堡内水田 ${farmCount} 亩、护佑乡民丁口 ${this.getTotalPop()} 人，英桥王氏「守望相助、保境安民」家风永载史册！`
      : '永昌防线被破！兵法建言：可在东渡口与北湾水道筑起花岗城墙与双格谯楼城门，并在城内开垦3块水田实现耕战自给！';
    modal.classList.remove('hidden');
    const toMenuBtn = document.getElementById('btn-gameover-menu');
    if (toMenuBtn) toMenuBtn.classList.remove('hidden');
  }

  bindUI() {
    this.activeTray = null; // 'build' | 'army' | null
    this.activeBuildCat = 'castle';
    this.camZoneIdx = 0;

    const trayDrawer = document.getElementById('card-tray-drawer');
    const buildTabsRow = document.getElementById('build-tabs-row');
    const armyTabsRow = document.getElementById('army-tabs-row');
    const stampBuild = document.getElementById('stamp-build');
    const stampArmy = document.getElementById('stamp-army');
    const stampBuildImg = document.getElementById('stamp-build-img');
    const stampArmyImg = document.getElementById('stamp-army-img');
    if (stampBuildImg && this.icons?.buildings?.tower) {
      stampBuildImg.src = this.icons.buildings.tower;
    }
    if (stampArmyImg && this.icons?.units?.knight) {
      stampArmyImg.src = this.icons.units.knight;
    }

    this.setTrayMode = (mode) => {
      this.activeTray = mode;
      stampBuild.classList.toggle('active', mode === 'build');
      stampArmy.classList.toggle('active', mode === 'army');
      if (!mode) {
        trayDrawer.classList.add('hidden');
        return;
      }
      trayDrawer.classList.remove('hidden');
      buildTabsRow.classList.toggle('hidden', mode !== 'build');
      armyTabsRow.classList.toggle('hidden', mode !== 'army');
      if (mode === 'build') this.renderBuildBar(this.activeBuildCat);
      else this.renderArmyBar();
    };

    stampBuild.addEventListener('click', () => {
      this.setTrayMode(this.activeTray === 'build' ? null : 'build');
    });
    stampArmy.addEventListener('click', () => {
      this.selectBuildTool(null);
      this.setTrayMode(this.activeTray === 'army' ? null : 'army');
    });
    document.getElementById('btn-close-tray').addEventListener('click', () => this.setTrayMode(null));
    document.getElementById('btn-close-army-tray').addEventListener('click', () => this.setTrayMode(null));

    document.querySelectorAll('#build-tabs-row .tray-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#build-tabs-row .tray-tab').forEach((b) => {
          b.classList.remove('active', 'game-btn-blue');
        });
        btn.classList.add('active', 'game-btn-blue');
        this.activeBuildCat = btn.dataset.cat;
        this.renderBuildBar(this.activeBuildCat);
      });
    });

    // Right-Bottom Thumb Radial Stance Horn (Cycles Defend -> Sally -> All-Out Attack!)
    const stanceWheel = document.getElementById('btn-stance-wheel');
    const stanceIco = document.getElementById('stance-ico');
    const stanceLbl = document.getElementById('stance-lbl');
    const stanceSvgs = {
      defend: `<svg class="hud-svg" viewBox="0 0 28 28"><path d="M14 2L4 6.5v7c0 6.5 4.3 10.8 10 12.5 5.7-1.7 10-6 10-12.5v-7L14 2z" fill="#eff6ff" stroke="#172554" stroke-width="2.4"/><path d="M14 5.5v17M7.5 12.5h13" stroke="#dc2626" stroke-width="3.2" stroke-linecap="round"/></svg>`,
      sally: `<svg class="hud-svg" viewBox="0 0 28 28"><path d="M5 22L22 5m-3 0h3v3M23 22L6 5m3 0H6v3" stroke="#fef3c7" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 23l3-3M24 23l-3-3" stroke="#92400e" stroke-width="3.6" stroke-linecap="round"/></svg>`,
      attack: `<svg class="hud-svg" viewBox="0 0 28 28"><path d="M4 17c5 0 11-3 16-9l4 4c-6 5-9 11-9 12-3-2-7-4-11-4v-3z" fill="#fde047" stroke="#450a0a" stroke-width="2.3" stroke-linejoin="round"/><circle cx="21" cy="9" r="2.2" fill="#fef08a"/></svg>`,
    };
    stanceWheel.addEventListener('click', () => {
      const order = ['defend', 'sally', 'attack'];
      this.stance = order[(order.indexOf(this.stance) + 1) % order.length];
      this.squads.forEach((sq) => {
        if (sq.team === 'player') sq.hasCustomOrder = false;
      });
      stanceWheel.className = this.stance === 'attack'
        ? 'game-btn-red'
        : (this.stance === 'sally' ? 'game-btn-wood' : 'game-btn-blue');
      stanceIco.innerHTML = stanceSvgs[this.stance];
      if (this.stance === 'attack') {
        stanceLbl.textContent = '总攻!';
        sfx.playHorn(false);
        this.toast('全军总攻！！渡过河湾浅滩，焚毁东海倭寇安宅船寨！');
        this.camDesiredTarget.set(10, 0.6, 0.2);
      } else if (this.stance === 'sally') {
        stanceLbl.textContent = '迎击';
        sfx.playHorn(false);
        this.toast('出城迎击！主动清剿河岸倭寇攻城器！');
      } else {
        stanceLbl.textContent = '固守';
        this.toast('全军固守永昌卫城防线！');
      }
    });

    const lordGarrisonBtn = document.getElementById('btn-lord-garrison');
    if (lordGarrisonBtn) {
      lordGarrisonBtn.addEventListener('click', () => {
        if (!this.playerLord || this.playerLord.hp <= 0) return;
        if (this.playerLord.garrisonBuilding) {
          this.exitBuildingWithLord(this.playerLord, this.world.campfirePos.x, this.world.campfirePos.z, false);
        } else {
          // Prefer Keep if standing, else nearest friendly castle defense or building!
          let target = (this.world.playerKeep && this.world.playerKeep.hp > 0) ? this.world.playerKeep : null;
          if (!target) {
            target = this.world.structures.find(
              (s) => s.team === 'player' && s.hp > 0 && !['campfire', 'stockpile', 'pitch'].includes(s.type)
            );
          }
          if (target) this.orderLordToBuilding(this.playerLord, target);
        }
      });
    }
    this.syncLordGarrisonButton();

    document.getElementById('tax-btn').addEventListener('click', () => {
      const order = ['balanced', 'harsh', 'generous'];
      this.taxPolicy = order[(order.indexOf(this.taxPolicy) + 1) % order.length];
      const names = {
        balanced: '耕读',
        harsh: '纾难',
        generous: '赈乡',
      };
      const policyTips = {
        balanced: '📜 切换宗族乡约：【耕读传家】（赋饷均衡，丁口稳步归附）',
        harsh: '📜 切换宗族乡约：【毁家纾难】（合族捐输饷银翻倍，乡民归附放缓）',
        generous: '📜 切换宗族乡约：【义仓赈乡】（开仓双粮赈济，全军抗倭士气战力 +20%！）',
      };
      const lbl = document.getElementById('tax-lbl');
      if (lbl) lbl.textContent = names[this.taxPolicy];
      sfx.playPlaceBlock('wood');
      this.toast(policyTips[this.taxPolicy]);
    });

    const scoutBtn = document.getElementById('btn-scout-check');
    if (scoutBtn) {
      scoutBtn.addEventListener('click', () => this.runScoutPatrolCheck());
    }

    document.getElementById('btn-ignite').addEventListener('click', () => this.manualIgniteAllPitch());
    document.getElementById('btn-repair').addEventListener('click', () => this.repairAllWalls());
    document.getElementById('btn-cancel-build').addEventListener('click', () => this.selectBuildTool(null));
    const rotateBuildBtn = document.getElementById('btn-rotate-build');
    if (rotateBuildBtn) {
      rotateBuildBtn.addEventListener('click', () => this.rotateBuildDirection());
    }

    const dismissPortrait = document.getElementById('btn-dismiss-portrait');
    if (dismissPortrait) {
      dismissPortrait.addEventListener('click', () => {
        document.getElementById('portrait-guard').classList.add('dismissed');
      });
    }

    document.getElementById('btn-speed').addEventListener('click', (e) => {
      this.timeScale = this.timeScale === 1 ? 2 : 1;
      e.currentTarget.textContent = this.timeScale === 2 ? '2x' : '1x';
    });

    // Camera Zone Cycle Orb (Yongchang Fortress -> River Ford -> Wokou Stronghold) + 90° Rotate!
    const zones = [
      { lbl: '永昌', x: -19.5, y: 0.5, z: 0.0 },
      { lbl: '渡口', x: -1.5, y: 0.2, z: 0.8 },
      { lbl: '倭寨', x: 19.5, y: 0.7, z: 0.0 },
    ];
    document.getElementById('btn-cam-cycle').addEventListener('click', () => {
      this.camZoneIdx = (this.camZoneIdx + 1) % zones.length;
      const z = zones[this.camZoneIdx];
      this.camDesiredTarget.set(z.x, z.y, z.z);
      document.getElementById('cam-zone-lbl').textContent = z.lbl;
    });
    document.getElementById('cam-rotate').addEventListener('click', () => {
      this.camDesiredYaw += Math.PI / 2;
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'q' || e.key === 'Q') this.camDesiredYaw -= Math.PI / 4;
      if (e.key === 'e' || e.key === 'E') this.camDesiredYaw += Math.PI / 4;
      if (e.key === 't' || e.key === 'T') this.runScoutPatrolCheck();
      if ((e.key === 'r' || e.key === 'R') && this.selectedBuild) {
        this.rotateBuildDirection();
      }
      if (e.key === 'Escape') {
        if (this.selectedBuild) {
          this.selectBuildTool(null);
        } else if (this.menuState === 'play') {
          this.togglePause(true);
        } else if (this.menuState === 'pause' && document.getElementById('info-panel').classList.contains('hidden')) {
          this.togglePause(false);
        }
      }
    });

    // Hidden Dev / QA Panel: Triple-tap Crown Shield OR press F2 / `?dev=1`!
    const devPanel = document.getElementById('dev-qa-panel');
    const applyDevVisibility = () => devPanel.classList.toggle('hidden', !this.devMode);
    applyDevVisibility();

    let crestTapCount = 0;
    let crestTapTimer = null;
    document.getElementById('lord-crest-shield').addEventListener('click', () => {
      if (this.playerLord && this.playerLord.hp > 0) {
        this.camDesiredTarget.set(this.playerLord.x, 0.5, this.playerLord.z);
      } else {
        this.camDesiredTarget.set(-19.5, 0.5, 0.0);
      }
      crestTapCount++;
      clearTimeout(crestTapTimer);
      if (crestTapCount >= 3) {
        crestTapCount = 0;
        this.devMode = !this.devMode;
        applyDevVisibility();
      } else {
        crestTapTimer = setTimeout(() => { crestTapCount = 0; }, 600);
      }
    });
    document.getElementById('btn-close-dev').addEventListener('click', () => {
      this.devMode = false;
      applyDevVisibility();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2' || e.key === '`') {
        this.devMode = !this.devMode;
        applyDevVisibility();
      }
    });

    document.getElementById('btn-force-night').addEventListener('click', () => {
      if (!this.isNight) this.phaseTimer = 0.05;
      else this.toast('当前已在黑夜攻城战中！');
    });
    document.getElementById('dev-add-res').addEventListener('click', () => {
      this.res.wood += 300;
      this.res.stone += 300;
      this.res.food += 300;
      this.res.iron += 100;
      this.res.oil += 100;
      this.res.gold += 500;
      this.res.bows += 20;
      this.res.armor += 20;
      this.res.peasants = Math.min(10, this.res.peasants + 6);
      this.syncCampfirePeasants();
      this.world.updateStockpileVisuals(this.res);
      this.updateHUD();
      if (this.activeTray === 'army') this.renderArmyBar();
      this.toast('🛠️ [QA] 已注入测试物资');
    });
    document.getElementById('dev-spawn-siege').addEventListener('click', () => {
      const front = gridToWorld(23, 20);
      this.createSquad('trebuchet', 'player', front.x, front.z - 1.5, true);
      this.createSquad('trebuchet', 'player', front.x, front.z + 1.5, true);
      this.createSquad('knight', 'player', front.x + 1.8, front.z, true);
      this.toast('🛠️ [QA] 已生成反攻军团');
    });
    document.getElementById('dev-win').addEventListener('click', () => this.endGame(true));

    document.getElementById('btn-ad-airdrop').addEventListener('click', () => this.triggerRewardedAd('airdrop'));
    document.getElementById('btn-restart').addEventListener('click', () => window.location.reload());
    document.getElementById('btn-double-medal').addEventListener('click', (e) => {
      e.currentTarget.textContent = '📜 已镌刻入《英桥王氏抗倭守望碑》！';
      e.currentTarget.disabled = true;
    });
  }

  // =====================================================================
  // TITLE SCREEN / MAIN MENU / PAUSE MENU CONTROLLER
  // =====================================================================
  bindMenus() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      title: $('title-screen'),
      titleShowcase: $('title-showcase'),
      titleEnter: $('btn-title-enter'),
      mainMenu: $('main-menu'),
      menuHeadSub: $('menu-head-sub'),
      pause: $('pause-menu'),
      info: $('info-panel'),
      infoTitle: $('info-title'),
      infoBody: $('info-body'),
      soundLbl: $('sound-lbl'),
      soundWaves: $('sound-waves'),
    };

    // Decorate the title with live 3D icons rendered by the icon studio (same assets as the card tray).
    if (this.el.titleShowcase && this.icons) {
      const picks = [
        this.icons.units?.knight,
        this.icons.buildings?.tower,
        this.icons.units?.trebuchet,
        this.icons.buildings?.gate,
      ].filter(Boolean);
      picks.forEach((src, i) => {
        const img = document.createElement('img');
        img.className = 'show-ico';
        img.src = src;
        img.alt = '';
        img.style.setProperty('--delay', `${-i * 0.6}s`);
        this.el.titleShowcase.appendChild(img);
      });
    }

    this.el.titleEnter.addEventListener('click', (e) => {
      e.stopPropagation();
      this.enterFromTitle();
    });
    this.el.title.addEventListener('click', () => this.enterFromTitle());

    $('btn-menu-start').addEventListener('click', () => this.startGameFromMenu());
    $('btn-menu-controls').addEventListener('click', () => this.openInfo('controls'));
    // index.html labels this entry「王氏族谱与堡志」; it opens the gameplay guide panel.
    const clanBtn = $('btn-menu-clan') || $('btn-menu-guide');
    if (clanBtn) clanBtn.addEventListener('click', () => this.openInfo('guide'));
    $('btn-menu-sound').addEventListener('click', () => {
      sfx.enabled = !sfx.enabled;
      if (sfx.enabled) {
        sfx.init();
        sfx.playPlaceBlock('wood');
      }
      this.syncSoundLabel();
    });
    $('btn-menu-back-title').addEventListener('click', () => this.showTitle());

    $('btn-pause-resume').addEventListener('click', () => this.togglePause(false));
    const pauseClanBtn = $('btn-pause-clan');
    if (pauseClanBtn) pauseClanBtn.addEventListener('click', () => this.openInfo('guide'));
    $('btn-pause-controls').addEventListener('click', () => this.openInfo('controls'));
    $('btn-pause-mainmenu').addEventListener('click', () => this.returnToMainMenu());

    $('btn-info-close').addEventListener('click', () => this.closeInfo());
    this.el.info.addEventListener('click', (e) => {
      if (e.target === this.el.info) this.closeInfo();
    });

    // Game-over modal: "返回主菜单" reloads straight into the main menu (skips title).
    const goMenuBtn = $('btn-gameover-menu');
    if (goMenuBtn) {
      goMenuBtn.addEventListener('click', () => {
        try { sessionStorage.setItem('voxel-stronghold.skipTitle', '1'); } catch (err) { /* storage unavailable */ }
        window.location.reload();
      });
    }

    // Boot path: when returning from a finished match we land on the main menu instead of the title.
    let skipTitle = false;
    try { skipTitle = sessionStorage.getItem('voxel-stronghold.skipTitle') === '1'; } catch (err) { /* ignore */ }
    if (skipTitle) {
      try { sessionStorage.removeItem('voxel-stronghold.skipTitle'); } catch (err) { /* ignore */ }
      this.menuState = 'main';
    }

    this.syncSoundLabel();
    this.applyMenuState();
  }

  applyMenuState() {
    const s = this.menuState;
    this.el.title.classList.toggle('hidden', s !== 'title');
    this.el.mainMenu.classList.toggle('hidden', s !== 'main');
    this.el.pause.classList.toggle('hidden', s !== 'pause');
    if (s !== 'pause' && s !== 'main') this.closeInfo();
    // Hide the in-game HUD chrome while a full-screen shell is up so it never bleeds through.
    const hideHud = s !== 'play' && s !== 'pause';
    for (const id of ['top-hud', 'left-thumb-stamps', 'right-thumb-wheel', 'card-tray-drawer', 'active-build-floating']) {
      const el = document.getElementById(id);
      if (el) el.style.visibility = hideHud ? 'hidden' : '';
    }
    if (this.el.menuHeadSub) {
      const dayLabel = this.isNight ? `第 ${this.wave} 幕 · 倭寇夜袭` : `嘉靖戊午 · 第 ${this.wave} 幕备战`;
      this.el.menuHeadSub.textContent = `${dayLabel} · 倭船游弋东海，永昌宗族乡勇整备中`;
    }
  }

  enterFromTitle() {
    if (this.menuState !== 'title') return;
    sfx.init();
    sfx.playHorn(false);
    this.menuState = 'main';
    this.applyMenuState();
  }

  showTitle() {
    this.menuState = 'title';
    this.applyMenuState();
  }

  startGameFromMenu() {
    this.menuState = 'play';
    this.applyMenuState();
    sfx.init();
    sfx.playHorn(false);
    if (this.pendingIntroTaunt) {
      this.pendingIntroTaunt = false;
      this.showTaunt(WOLF_TAUNTS.start);
    }
  }

  togglePause(open) {
    if (open) {
      if (this.menuState !== 'play' || this.gameOver) return;
      this.selectBuildTool(null);
      this.setTrayMode(null);
      this.menuState = 'pause';
    } else {
      if (this.menuState !== 'pause') return;
      this.closeInfo();
      this.menuState = 'play';
    }
    this.applyMenuState();
  }

  returnToMainMenu() {
    // The running match cannot be rewound safely (workers, squads, debris), so reload and
    // let the boot path skip the title screen when the flag is present.
    try { sessionStorage.setItem('voxel-stronghold.skipTitle', '1'); } catch (err) { /* ignore */ }
    window.location.reload();
  }

  syncSoundLabel() {
    if (this.el.soundLbl) this.el.soundLbl.textContent = sfx.enabled ? '已开启' : '已静音';
    if (this.el.soundWaves) this.el.soundWaves.style.opacity = sfx.enabled ? '1' : '0.25';
  }

  openInfo(kind) {
    this.infoReturnState = this.menuState;
    this.infoKind = kind;
    const body = this.el.infoBody;
    if (kind === 'controls') {
      this.el.infoTitle.textContent = '营造与兵法 · 操作说明';
      body.innerHTML = `
        <h4>筑城与委任</h4>
        <ul>
          <li>左下角「筑城」/「募兵」打开卡牌托盘；点选卡牌后托盘自动收起，腾出整屏触控空间。</li>
          <li>建造模式下<b>点击地面</b>放置，<b>按住拖拽</b>沿直线连建石墙 / 铺设火油沟；城门与敌台只能单点放置。</li>
          <li>右下角浮动条的「转向」或 <kbd>R</kbd> 可将建筑顺时针旋转 90°。</li>
          <li>拖拽<b>宗长</b>到任意我方建筑即可入驻（头顶升起宗祠印记）；拖到空地则出阵督战。</li>
          <li>拖拽<b>小队旗帜</b>下达军令；鸟铳手拖到城墙 / 敌台附近会自动登墙驻守。</li>
        </ul>
        <h4>镜头</h4>
        <ul>
          <li><b>右键拖拽</b>平移镜头；<b>右键单击</b>（未拖动）退出建造模式。</li>
          <li><b>滚轮</b>缩放；移动端<b>双指捏合</b>缩放、双指拖动平移。</li>
          <li><kbd>Q</kbd> / <kbd>E</kbd> 旋转视角 45°；右下角罗盘按钮轮切战区。</li>
        </ul>
        <h4>快捷键</h4>
        <ul>
          <li><kbd>Esc</kbd> 退出建造模式；无建造工具时打开 / 关闭暂停菜单。</li>
          <li><kbd>F2</kbd> 或 <kbd>\`</kbd> 开关 QA 调试面板；连点左上角盾徽 3 次亦可。</li>
          <li>左上角盾徽单击：镜头回到宗长身边。</li>
        </ul>
      `;
    } else {
      const s2 = this.clanSteleWallsUnlocked ? '✅ 已点亮（城防耐久+15%，修城减半耗石）' : '⏳ 待解锁（累计修筑10座城垣/敌台/城门）';
      const s3 = this.clanSteleMartialUnlocked ? '✅ 已点亮（宗族铁骑/藤牌募饷 -20%）' : '⏳ 待解锁（击退首幕倭寇夜袭）';
      const s4 = this.fortressPaddyUnlocked ? '✅ 已达成（稻谷产率+25%，全军士气+15%）' : '⏳ 待达成（堡内开垦3块江南水车稻田）';
      this.el.infoTitle.textContent = '英桥王氏族谱与永昌堡志';
      body.innerHTML = `
        <h4>一、抗倭叙事 · 嘉靖戊午保卫战（1558）</h4>
        <p>明嘉靖三十一年至三十七年，温州永嘉场屡遭东海倭寇劫掠，英桥王氏族长<b>王沛</b>、名将<b>王德</b>叔侄先后壮烈殉国。王叔果、王叔杲兄弟遂倡议合族集资筑起<b>永昌堡</b>，南北长二百六十八丈、引河水入护城壕与城内水渠，护佑一方百姓数百年。</p>
        <h4>二、永昌城防 · 明代海防卫城规制</h4>
        <ul>
          <li><b>斜垒花岗城垣与空心敌台</b>：条石收分斜筑，神机鸟铳手登墙驻防射程大增；空心敌台可发射火箭引燃城前<b>猛火油伏火壕</b>。</li>
          <li><b>重檐谯楼城门与佛郎机炮台</b>：双身位石拱城门对我方乡民水牛车及虎蹲炮自动启闭，对倭寇千斤闸落锁；八角炮台优先轰击大筒与冲车。</li>
          <li><b>斥候巡防（快捷键 T）</b>：派遣塘骑勘验东门迎川道与北湾环海道，即时标示防线缺口或合围状态。</li>
        </ul>
        <h4>三、家族传承 · 《英桥王氏家风碑》实时进度</h4>
        <ul>
          <li><b>【先烈忠魂 · 王沛王德】</b>：✅ 已铭刻 —— 宗长王叔果亲驻祠堂或敌台督战，自动恢复气血并射击来犯倭寇。</li>
          <li><b>【双贤筑堡 · 王叔果王叔杲】</b>：${s2}</li>
          <li><b>【文武世泽 · 武状元王名世】</b>：${s3}</li>
          <li><b>【堡内有田 · 围困不惊】</b>：${s4}</li>
        </ul>
      `;
    }
    this.el.info.classList.remove('hidden');
  }

  closeInfo() {
    if (this.el.info) this.el.info.classList.add('hidden');
  }

  renderBuildBar(cat) {
    const bar = document.getElementById('tray-cards-box');
    bar.innerHTML = '';
    Object.values(BUILDINGS)
      .filter((b) => b.cat === cat)
      .forEach((b) => {
        const costStr = Object.entries(b.cost)
          .map(([k, v]) => `${{ wood: '木', stone: '石', gold: '金', oil: '油' }[k] || k}${v}`)
          .join(' ') || '返50%';
        const card = document.createElement('button');
        card.className = `game-card-3d ${this.selectedBuild === b.id ? 'selected' : ''}`;
        card.dataset.id = b.id;
        card.innerHTML = `
          <div class="card-portrait-wrap"><img src="${this.icons.buildings[b.id]}" alt="${b.name}" /></div>
          <span class="card-title">${b.name}</span>
          <span class="card-cost-ribbon">${costStr}</span>
        `;
        card.addEventListener('click', () => {
          this.selectBuildTool(b.id);
          // Auto-minimize card tray so the player has a 100% unobstructed touch screen to place/draw walls!
          this.setTrayMode(null);
        });
        bar.appendChild(card);
      });
  }

  renderArmyBar() {
    const bar = document.getElementById('tray-cards-box');
    bar.innerHTML = '';
    Object.entries(UNIT_SPECS).forEach(([key, spec]) => {
      const costText = Object.entries(spec.cost)
        .map(([k, v]) => `${{ wood: '木', stone: '石', gold: '饷', bows: '铳', armor: '甲' }[k] || k}${v}`)
        .join(' ');
      let badgeHtml = '';
      if (spec.cost.bows) badgeHtml = `<span class="stock-corner-badge">铳:${Math.floor(this.res.bows)}</span>`;
      else if (spec.cost.armor) badgeHtml = `<span class="stock-corner-badge">甲:${Math.floor(this.res.armor)}</span>`;

      const card = document.createElement('button');
      card.className = 'game-card-3d';
      card.innerHTML = `
        ${badgeHtml}
        <div class="card-portrait-wrap"><img src="${this.icons.units[key]}" alt="${spec.name}" /></div>
        <span class="card-title">${spec.name}</span>
        <span class="card-cost-ribbon">${costText}</span>
      `;
      card.addEventListener('click', () => {
        const angle = Math.random() * Math.PI * 2;
        const spawnX = this.world.campfirePos.x + 2.4 + Math.cos(angle) * 0.8;
        const spawnZ = this.world.campfirePos.z + Math.sin(angle) * 1.8;
        this.createSquad(key, 'player', spawnX, spawnZ, false);
        this.renderArmyBar();
      });
      bar.appendChild(card);
    });
  }

  updateBuildFloatingBar() {
    const floatBar = document.getElementById('active-build-floating');
    const tipEl = document.getElementById('build-mode-tip');
    const rotBtn = document.getElementById('btn-rotate-build');
    if (!this.selectedBuild) {
      floatBar.classList.add('hidden');
      return;
    }
    const spec = BUILDINGS[this.selectedBuild];
    const deg = ((this.buildRotSteps % 4) + 4) % 4 * 90;
    const canRot = this.selectedBuild !== 'pitch' && this.selectedBuild !== 'demolish';
    if (rotBtn) {
      rotBtn.textContent = `↻ 转向 ${deg}°`;
      rotBtn.classList.toggle('hidden', !canRot);
    }
    tipEl.textContent = `${spec.name} · 点地/拖拽连续建造`;
    floatBar.classList.remove('hidden');
  }

  rotateBuildDirection() {
    if (!this.selectedBuild) return;
    this.buildRotSteps = (this.buildRotSteps + 1) % 4;
    sfx.playPlaceBlock('wood');
    this.updateBuildFloatingBar();
    this.world.showBiomeHints(this.selectedBuild);
    if (this.lastHoverCoords && this.lastHoverCoords.length > 0) {
      this.world.showBuildGhost(this.selectedBuild, this.lastHoverCoords, this.buildRotSteps);
    } else if (this.playerKeep || this.world.playerKeep) {
      const cg = worldToGrid(this.camDesiredTarget.x, this.camDesiredTarget.z);
      this.lastHoverCoords = [cg];
      this.world.showBuildGhost(this.selectedBuild, this.lastHoverCoords, this.buildRotSteps);
    }
  }

  selectBuildTool(id) {
    this.selectedBuild = id;
    this.world.showBiomeHints(id);
    if (id) {
      this.updateBuildFloatingBar();
      const cg = worldToGrid(this.camDesiredTarget.x, this.camDesiredTarget.z);
      this.lastHoverCoords = [cg];
      this.world.showBuildGhost(id, this.lastHoverCoords, this.buildRotSteps);
    } else {
      this.lastHoverCoords = [];
      this.updateBuildFloatingBar();
      this.world.showBuildGhost(null, []);
    }
  }

  screenToWorldGround(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const orig = ray.origin;
    const dir = ray.direction;

    // 2.5D Micro-Voxel Heightfield Ray-March + 6-Step Bisection:
    // Guarantees sub-centimeter grid picking on hills (+3.5m), terraces (+0.5m), valley plains (0m) & riverbeds (-0.35m)!
    if (this.world && dir.y < -1e-4) {
      const yMax = 5.6;
      const yMin = -0.75;
      const tStart = Math.max(0, (yMax - orig.y) / dir.y);
      const tEnd = Math.max(tStart, (yMin - orig.y) / dir.y);
      const stepT = 0.12;
      const halfW = GRID_W * 0.5;
      const halfH = GRID_H * 0.5;

      let prevT = tStart;
      for (let t = tStart; t <= tEnd + stepT; t += stepT) {
        const ct = Math.min(t, tEnd);
        const wx = orig.x + dir.x * ct;
        const wy = orig.y + dir.y * ct;
        const wz = orig.z + dir.z * ct;

        if (wx >= -halfW && wx <= halfW && wz >= -halfH && wz <= halfH) {
          const surfY = this.world.sampleSubElevAt(wx, wz);
          if (wy <= surfY) {
            let lo = prevT;
            let hi = ct;
            for (let k = 0; k < 6; k++) {
              const mid = (lo + hi) * 0.5;
              const mx = orig.x + dir.x * mid;
              const my = orig.y + dir.y * mid;
              const mz = orig.z + dir.z * mid;
              const ms = this.world.sampleSubElevAt(mx, mz);
              if (my <= ms) hi = mid;
              else lo = mid;
            }
            const hx = orig.x + dir.x * hi;
            const hz = orig.z + dir.z * hi;
            const hy = this.world.sampleSubElevAt(hx, hz);
            return new THREE.Vector3(hx, hy, hz);
          }
        }
        prevT = ct;
        if (ct >= tEnd) break;
      }
    }

    const hit = new THREE.Vector3();
    if (ray.intersectPlane(this.groundPlane, hit)) {
      return hit;
    }
    return null;
  }

  updateOrthoProjection() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera.left = (-this.frustumSize * aspect) / 2;
    this.camera.right = (this.frustumSize * aspect) / 2;
    this.camera.top = this.frustumSize / 2;
    this.camera.bottom = -this.frustumSize / 2;
    this.camera.updateProjectionMatrix();
  }

  bindInput() {
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.updateOrthoProjection();
      this.postFx.setSize(window.innerWidth, window.innerHeight);
      this.resizeHudCanvas();
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.frustumSize = THREE.MathUtils.clamp(this.frustumSize + e.deltaY * 0.014, 7.5, 29.0);
      this.updateOrthoProjection();
    }, { passive: false });

    this.activePointers = new Map();
    this.prevPinchDist = null;
    this.prevTwoFingerMid = null;

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const panCameraByScreenDelta = (dx, dy) => {
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      const sinPitch = Math.max(0.25, Math.abs(forward.y));
      const groundFwd = new THREE.Vector3(forward.x, 0, forward.z).normalize();
      const groundRight = new THREE.Vector3(-groundFwd.z, 0, groundFwd.x);
      const wpp = this.frustumSize / Math.max(1, window.innerHeight);
      this.camDesiredTarget.addScaledVector(groundRight, -dx * wpp);
      this.camDesiredTarget.addScaledVector(groundFwd, (dy * wpp) / sinPitch);
      this.camDesiredTarget.x = THREE.MathUtils.clamp(this.camDesiredTarget.x, -26, 26);
      this.camDesiredTarget.z = THREE.MathUtils.clamp(this.camDesiredTarget.z, -15, 15);
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      sfx.init();

      // Right-mouse drag pans camera even in build mode; right-click (no drag) exits build mode!
      if (e.button === 2) {
        this.isRightPanning = true;
        this.rightDownScreen = { x: e.clientX, y: e.clientY };
        this.lastPointerScreen = { x: e.clientX, y: e.clientY };
        return;
      }

      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger mobile pinch-to-zoom + pan cancels single-finger drag/build cleanly!
      if (this.activePointers.size >= 2) {
        const pts = Array.from(this.activePointers.values());
        this.prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.prevTwoFingerMid = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
        this.isPointerDown = false;
        this.dragStartGrid = null;
        this.world.showBuildGhost(null, []);
        return;
      }

      this.isPointerDown = true;
      this.lastPointerScreen = { x: e.clientX, y: e.clientY };

      const hit = this.screenToWorldGround(e.clientX, e.clientY);
      if (!hit) return;

      if (this.selectedBuild) {
        const g = worldToGrid(hit.x, hit.z);
        this.dragStartGrid = g;
        this.dragCurrentGrid = g;
        this.lastHoverCoords = [g];
        this.world.showBuildGhost(this.selectedBuild, [g], this.buildRotSteps);
        return;
      }

      let pickedSquad = null;
      let bestDist = 1.65;
      for (const sq of this.squads) {
        if (sq.team !== 'player') continue;
        const d = Math.hypot(sq.banner.position.x - hit.x, sq.banner.position.z - hit.z);
        if (d < bestDist) {
          bestDist = d;
          pickedSquad = sq;
        }
      }

      // Check if touching the physical Player Lord OR the building where the Player Lord is garrisoned!
      let lordDist = Infinity;
      if (this.playerLord && this.playerLord.hp > 0) {
        const lPickR = this.playerLord.garrisonBuilding
          ? (this.playerLord.garrisonBuilding.type === 'keep' ? 1.85 : 1.35)
          : 1.55;
        const dL = Math.hypot(this.playerLord.x - hit.x, this.playerLord.z - hit.z);
        if (dL <= lPickR) lordDist = dL;
      }

      if (lordDist < bestDist) {
        this.draggingLord = true;
        this.tacticalSlowMo = true;
        this.dragLine.material.color.setHex(0xfacc15);
        this.dragLine.visible = true;
        const startY = this.playerLord.garrisonBuilding
          ? this.playerLord.garrisonBuilding.y + this.playerLord.garrisonBuilding.height
          : this.playerLord.y;
        this.updateDragLine(new THREE.Vector3(this.playerLord.x, startY, this.playerLord.z), hit);
        return;
      }

      if (pickedSquad) {
        this.draggingSquad = pickedSquad;
        this.tacticalSlowMo = true;
        this.dragLine.material.color.setHex(0x38bdf8);
        this.dragLine.visible = true;
        this.updateDragLine(pickedSquad.banner.position, hit);
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.isRightPanning) {
        const dx = e.clientX - this.lastPointerScreen.x;
        const dy = e.clientY - this.lastPointerScreen.y;
        this.lastPointerScreen = { x: e.clientX, y: e.clientY };
        panCameraByScreenDelta(dx, dy);
        return;
      }

      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Handle smooth mobile two-finger pinch zoom + pan (even while in build mode)!
      if (this.activePointers.size >= 2) {
        const pts = Array.from(this.activePointers.values());
        const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) * 0.5;
        const midY = (pts[0].y + pts[1].y) * 0.5;
        if (this.prevPinchDist && curDist > 10) {
          const ratio = this.prevPinchDist / curDist;
          this.frustumSize = THREE.MathUtils.clamp(this.frustumSize * ratio, 7.5, 29.0);
          this.updateOrthoProjection();
        }
        if (this.prevTwoFingerMid) {
          panCameraByScreenDelta(midX - this.prevTwoFingerMid.x, midY - this.prevTwoFingerMid.y);
        }
        this.prevPinchDist = curDist;
        this.prevTwoFingerMid = { x: midX, y: midY };
        return;
      }
      const hit = this.screenToWorldGround(e.clientX, e.clientY);

      if (this.selectedBuild && hit) {
        const g = worldToGrid(hit.x, hit.z);
        this.dragCurrentGrid = g;
        // ALL buildings support continuous drag-line preview (1x1 row/line) & tap-to-place!
        if (this.isPointerDown && this.dragStartGrid && this.selectedBuild !== 'gate') {
          const pts = getGridLine(this.dragStartGrid.gx, this.dragStartGrid.gz, g.gx, g.gz);
          this.lastHoverCoords = pts;
          this.world.showBuildGhost(this.selectedBuild, pts, this.buildRotSteps);
        } else {
          this.lastHoverCoords = [g];
          this.world.showBuildGhost(this.selectedBuild, [g], this.buildRotSteps);
        }
        return;
      }

      if (!this.isPointerDown) return;

      if (this.draggingLord && hit && this.playerLord) {
        const startY = this.playerLord.garrisonBuilding
          ? this.playerLord.garrisonBuilding.y + this.playerLord.garrisonBuilding.height
          : this.playerLord.y;
        this.updateDragLine(new THREE.Vector3(this.playerLord.x, startY, this.playerLord.z), hit);
        return;
      }

      if (this.draggingSquad && hit) {
        this.updateDragLine(this.draggingSquad.banner.position, hit);
        return;
      }

      const dx = e.clientX - this.lastPointerScreen.x;
      const dy = e.clientY - this.lastPointerScreen.y;
      this.lastPointerScreen = { x: e.clientX, y: e.clientY };
      panCameraByScreenDelta(dx, dy);
    });

    const clearPointer = (e) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) {
        this.prevPinchDist = null;
        this.prevTwoFingerMid = null;
      }
    };
    window.addEventListener('pointercancel', clearPointer);

    window.addEventListener('pointerup', (e) => {
      if (e.button === 2 && this.isRightPanning) {
        this.isRightPanning = false;
        const rDist = Math.hypot(e.clientX - this.rightDownScreen.x, e.clientY - this.rightDownScreen.y);
        if (rDist < 7 && this.selectedBuild) {
          this.selectBuildTool(null);
        }
        return;
      }

      clearPointer(e);
      if (!this.isPointerDown) return;
      this.isPointerDown = false;

      const hit = this.screenToWorldGround(e.clientX, e.clientY);

      if (this.selectedBuild && this.dragStartGrid) {
        const endG = hit ? worldToGrid(hit.x, hit.z) : this.dragCurrentGrid || this.dragStartGrid;
        const coords = this.selectedBuild !== 'gate'
          ? getGridLine(this.dragStartGrid.gx, this.dragStartGrid.gz, endG.gx, endG.gz)
          : [endG];
        this.commitBuild(this.selectedBuild, coords);
        this.dragStartGrid = null;
        if (this.selectedBuild) {
          this.lastHoverCoords = [endG];
          this.world.showBuildGhost(this.selectedBuild, [endG], this.buildRotSteps);
        } else {
          this.world.showBuildGhost(null, []);
        }
        return;
      }

      if (this.draggingLord) {
        if (hit && this.playerLord && this.playerLord.hp > 0) {
          const targetBldg = this.findGarrisonableBuildingAt(hit.x, hit.z, 'player');
          if (targetBldg && targetBldg !== this.playerLord.garrisonBuilding) {
            this.orderLordToBuilding(this.playerLord, targetBldg);
          } else if (!targetBldg) {
            const moveDist = Math.hypot(hit.x - this.playerLord.x, hit.z - this.playerLord.z);
            if (moveDist > 0.65) {
              if (this.playerLord.garrisonBuilding) {
                this.exitBuildingWithLord(this.playerLord, hit.x, hit.z, false);
              }
              this.playerLord.pendingEnterBuilding = null;
              this.playerLord.orderTarget = {
                x: THREE.MathUtils.clamp(hit.x, -GRID_W / 2 + 1.5, GRID_W / 2 - 1.5),
                z: THREE.MathUtils.clamp(hit.z, -GRID_H / 2 + 1.5, GRID_H / 2 - 1.5),
              };
              sfx.playPlaceBlock('wood');
            }
          }
        }
        this.draggingLord = false;
        this.tacticalSlowMo = false;
        this.dragLine.visible = false;
        this.dragLine.material.color.setHex(0x38bdf8);
        return;
      }

      if (this.draggingSquad) {
        if (hit) {
          this.draggingSquad.targetX = THREE.MathUtils.clamp(hit.x, -GRID_W / 2 + 1.5, GRID_W / 2 - 1.5);
          this.draggingSquad.targetZ = THREE.MathUtils.clamp(hit.z, -GRID_H / 2 + 1.5, GRID_H / 2 - 1.5);
          this.draggingSquad.hasCustomOrder = true;
          if (this.draggingSquad.role === 'archer') {
            this.tryAssignArchersToWalls(this.draggingSquad, hit.x, hit.z);
          }
          sfx.playPlaceBlock('wood');
        }
        this.draggingSquad = null;
        this.tacticalSlowMo = false;
        this.dragLine.visible = false;
      }
    });
  }

  updateDragLine(startVec, endVec) {
    const pos = this.dragLine.geometry.attributes.position;
    const endElev = this.world.getElevationAtWorld(endVec.x, endVec.z);
    pos.setXYZ(0, startVec.x, startVec.y + 0.35, startVec.z);
    pos.setXYZ(1, endVec.x, endElev + 0.35, endVec.z);
    pos.needsUpdate = true;
  }

  commitBuild(type, coords) {
    const spec = BUILDINGS[type];
    let placedCount = 0;

    for (const { gx, gz } of coords) {
      if (!this.world.canPlace(type, gx, gz, this.buildRotSteps)) {
        if (coords.length === 1 && spec.reqBiome) {
          const hintMap = {
            limestone: '北麓大罗山【花岗岩矿带】',
            iron: '南麓发光赤褐【赤铁矿脉】',
            pitchBog: '河湾发光【猛火油泉湿地】',
          };
          this.toast(`⚠️ 【${spec.name}】须建在 ${hintMap[spec.reqBiome] || '对应资源带'} 绿色高亮格上！`);
        }
        continue;
      }

      if (type === 'demolish') {
        const cell = this.world.getCell(gx, gz);
        if (cell.hasPitch && cell.pitchMesh) {
          this.scene.remove(cell.pitchMesh);
          cell.hasPitch = false;
          cell.pitchMesh = null;
          placedCount++;
        } else if (cell.structure && cell.structure.team === 'player') {
          const oldType = cell.structure.type;
          const oldSpec = BUILDINGS[oldType];
          if (oldSpec && oldSpec.cost) {
            if (oldSpec.cost.wood) this.res.wood += Math.floor(oldSpec.cost.wood * 0.5);
            if (oldSpec.cost.stone) this.res.stone += Math.floor(oldSpec.cost.stone * 0.5);
          }
          if (oldType === 'hovel') this.res.maxPop = Math.max(16, this.res.maxPop - 8);
          this.world.destroyStructure(cell.structure, true);
          placedCount++;
        }
        continue;
      }

      let affordable = true;
      for (const [k, v] of Object.entries(spec.cost)) {
        if ((this.res[k] || 0) < v) affordable = false;
      }
      if (!affordable) {
        this.toast(`物资不足以营造【${spec.name}】！可点左上「义捐」筹集宗族助饷`);
        break;
      }

      for (const [k, v] of Object.entries(spec.cost)) {
        this.res[k] -= v;
      }

      if (type === 'pitch') {
        this.world.placePitch(gx, gz);
      } else {
        const built = this.world.placeStructure(type, gx, gz, 'player', false, this.buildRotSteps);
        if (built && this.clanSteleWallsUnlocked && ['wall', 'tower', 'gate', 'ballista'].includes(type)) {
          built.maxHp = Math.round(built.maxHp * 1.15);
          built.hp = built.maxHp;
        }
        if (type === 'hovel') this.res.maxPop += 8;
        if (
          ['woodcutter', 'quarry', 'farm', 'ironMine', 'pitchRig', 'fletcher', 'blacksmith'].includes(type) &&
          this.res.peasants <= 0
        ) {
          this.toast(`已建成【${spec.name}】，等待社火坛空闲乡民前往上岗！`);
        }
      }
      placedCount++;
    }

    if (placedCount > 0) {
      sfx.playPlaceBlock(type === 'pitch' ? 'pitch' : (spec.cost.stone ? 'stone' : 'wood'));
      this.world.updateStockpileVisuals(this.res);
      if (this.selectedBuild && spec.reqBiome) {
        this.world.showBiomeHints(this.selectedBuild);
      }
      if (!this.clanSteleWallsUnlocked) {
        const fortCount = this.world.structures.filter(
          (s) => s.team === 'player' && s.hp > 0 && ['wall', 'tower', 'gate', 'ballista'].includes(s.type)
        ).length;
        if (fortCount >= 10) {
          this.clanSteleWallsUnlocked = true;
          this.world.structures.forEach((s) => {
            if (s.team === 'player' && s.hp > 0 && ['wall', 'tower', 'gate', 'ballista'].includes(s.type)) {
              s.maxHp = Math.round(s.maxHp * 1.15);
              s.hp = Math.min(s.maxHp, Math.round(s.hp * 1.15));
            }
          });
          sfx.playScan();
          this.toast('📜 永昌城垣初具规模！点亮家风碑【双贤筑堡·王叔果王叔杲】（城防耐久+15%，修城省石）！');
        }
      }
      if (!this.fortressPaddyUnlocked) {
        const paddyCount = this.world.structures.filter((s) => s.team === 'player' && s.hp > 0 && s.type === 'farm').length;
        if (paddyCount >= 3) {
          this.fortressPaddyUnlocked = true;
          sfx.playScan();
          this.toast('🌾 达成永昌史实【堡内有田·围困不惊】！水田产粮+25%，全军士气战力+15%！');
        }
      }
      // Keep build mode active for ALL buildings so player can continuously place & rotate!
      this.updateHUD();
    }
  }

  showTaunt(text) {
    const box = document.getElementById('taunt-banner');
    box.textContent = text;
    box.classList.remove('hidden');
    clearTimeout(this.tauntTimeout);
    this.tauntTimeout = setTimeout(() => box.classList.add('hidden'), 6000);
  }

  toast(msg) {
    const el = document.getElementById('toast-msg');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  updateHUD() {
    document.getElementById('r-wood').textContent = Math.floor(this.res.wood);
    document.getElementById('r-stone').textContent = Math.floor(this.res.stone);
    document.getElementById('r-food').textContent = Math.floor(this.res.food);
    document.getElementById('r-gold').textContent = Math.floor(this.res.gold);
    document.getElementById('r-peasants').textContent = `${this.res.peasants}/${this.res.maxPop}`;

    const stockPill = document.getElementById('armory-stock-pill');
    if (stockPill) {
      stockPill.textContent = `演武军备：铳弓${Math.floor(this.res.bows)} · 明甲${Math.floor(this.res.armor)} · 生铁${Math.floor(this.res.iron)} · 火油${Math.floor(this.res.oil)}`;
    }

    if (this.devMode) {
      document.getElementById('dev-fps').textContent = `FPS: ${Math.round(this.fpsSmoothed)}`;
      document.getElementById('dev-draws').textContent = `Draws: ${this.renderer.info.render.calls}`;
      document.getElementById('voxel-stat').textContent = `低模三角面: ${this.world.totalVoxelCount.toLocaleString()}`;
      const navEl = document.getElementById('dev-nav');
      if (navEl) {
        const audit = this.runNavAudit ? this.runNavAudit() : null;
        const reachStr = audit ? `可达:${audit.reachRate} (${audit.avgRouteMs}ms) | 穿模:${audit.clipCount}` : '';
        navEl.textContent = `寻路:${this.navStats.frameMs.toFixed(2)}ms | ${reachStr} | 重算:${this.navStats.repaths} | 卡滞:${this.navStats.stuckNow}`;
      }
    }

    const secs = Math.max(0, Math.ceil(this.phaseTimer));
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    const timerBadge = document.getElementById('wave-timer');
    if (this.isNight) {
      timerBadge.textContent = `第${this.wave}幕 · 倭袭 ${mm}:${ss}`;
      timerBadge.className = 'wave-banner night g-txt';
    } else {
      timerBadge.textContent = `第${this.wave}幕 · 备战 ${mm}:${ss}`;
      timerBadge.className = secs <= 12 ? 'wave-banner urgent g-txt' : 'wave-banner day g-txt';
    }

    const pRatio = this.playerLord ? Math.max(0, this.playerLord.hp / this.playerLord.maxHp) : 0;
    const eRatio = this.enemyLord ? Math.max(0, this.enemyLord.hp / this.enemyLord.maxHp) : 0;
    document.getElementById('player-lord-bar').style.width = `${Math.round(pRatio * 100)}%`;
    document.getElementById('enemy-lord-bar').style.width = `${Math.round(eRatio * 100)}%`;

    const guardBtn = document.getElementById('btn-ad-guard');
    if (!this.emergencyGuardUsed && pRatio < 0.55) {
      guardBtn.classList.remove('hidden');
    } else {
      guardBtn.classList.add('hidden');
    }
    guardBtn.onclick = () => this.triggerRewardedAd('guard');
  }

  resizeHudCanvas() {
    if (!this.hudCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.hudCanvas.width = Math.floor(window.innerWidth * dpr);
    this.hudCanvas.height = Math.floor(window.innerHeight * dpr);
    this.hudDpr = dpr;
  }

  drawGlossyBar(ctx, cx, cy, w, h, ratio, lagRatio, isEnemy, isBoss = false, labelText = '') {
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);
    const r = Math.min(h / 2, 4);

    // Outer dark bevel capsule
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, r + 1.5);
    ctx.fillStyle = isBoss ? '#451a03' : 'rgba(18, 12, 8, 0.92)';
    ctx.fill();
    if (isBoss) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#facc15';
      ctx.stroke();
    }

    // Dark empty track
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = '#1f1610';
    ctx.fill();

    // White damage flash catch-up bar!
    const clampedLag = Math.max(ratio, Math.min(1, lagRatio));
    if (clampedLag > ratio + 0.005) {
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(2, w * clampedLag), h, r);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fill();
    }

    // Active HP fill
    const clamped = Math.max(0, Math.min(1, ratio));
    if (clamped > 0) {
      const fillW = Math.max(2, w * clamped);
      let fillCol = '#ef4444';
      if (!isEnemy) {
        fillCol = clamped > 0.52 ? '#22c55e' : (clamped > 0.26 ? '#f59e0b' : '#ef4444');
      } else {
        fillCol = clamped > 0.4 ? '#ef4444' : '#dc2626';
      }
      ctx.beginPath();
      ctx.roundRect(x, y, fillW, h, r);
      ctx.fillStyle = fillCol;
      ctx.fill();

      // Top glossy specular highlight
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 0.8, Math.max(1, fillW - 2), Math.max(1.2, h * 0.36), r);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.fill();
    }

    if (labelText) {
      ctx.font = '900 10px "Microsoft YaHei UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#291507';
      ctx.strokeText(labelText, cx, y - 2.5);
      ctx.fillStyle = isBoss ? '#fef08a' : '#ffffff';
      ctx.fillText(labelText, cx, y - 2.5);
    }
    ctx.restore();
  }

  renderWorldHUD(rawDt) {
    if (!this.hudCtx || !this.hudCanvas) return;
    const ctx = this.hudCtx;
    const dpr = this.hudDpr || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    this.camera.updateMatrixWorld();

    const projectToScreen = (wx, wy, wz) => {
      this.projVec.set(wx, wy, wz).project(this.camera);
      if (this.projVec.z < -1 || this.projVec.z > 1) return null;
      const sx = (this.projVec.x * 0.5 + 0.5) * W;
      const sy = (-this.projVec.y * 0.5 + 0.5) * H;
      if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) return null;
      return { sx, sy };
    };

    const lerpRate = Math.min(1, rawDt * 7.5);

    // 1. Damaged Structures (0 < hp < maxHp) + Garrisoned Building Crown Tag!
    for (let i = 0; i < this.world.structures.length; i++) {
      const s = this.world.structures[i];
      if (!s || s.hp <= 0 || ['campfire', 'stockpile', 'pitch'].includes(s.type)) continue;

      const hasPlayerLord = this.playerLord && this.playerLord.hp > 0 && this.playerLord.garrisonBuilding === s;
      const hasEnemyLord = this.enemyLord && this.enemyLord.hp > 0 && this.enemyLord.garrisonBuilding === s;
      const isDamaged = s.hp < s.maxHp - 0.5;

      if (!isDamaged && !hasPlayerLord && !hasEnemyLord) {
        s.visHp = s.hp;
        continue;
      }

      s.visHp = s.visHp === undefined ? s.hp : THREE.MathUtils.lerp(s.visHp, s.hp, lerpRate);

      if (isDamaged) {
        const scr = projectToScreen(s.x, s.y + (s.height || 1.8) + 0.28, s.z);
        if (scr) {
          const isMajor = ['keep', 'tower', 'gate', 'ballista', 'granary', 'armory'].includes(s.type);
          const barW = s.type === 'keep' ? 60 : (isMajor ? 44 : 30);
          const barH = s.type === 'keep' ? 7.5 : (isMajor ? 6 : 5);
          const lbl = isMajor ? `${Math.ceil(s.hp)}` : '';
          this.drawGlossyBar(
            ctx,
            scr.sx,
            scr.sy,
            barW,
            barH,
            s.hp / s.maxHp,
            s.visHp / s.maxHp,
            s.team === 'enemy',
            s.type === 'keep',
            lbl
          );
        }
      }

      // Subtle Royal Garrison Tag above the 3D Spinning Voxel Crown!
      if (hasPlayerLord || hasEnemyLord) {
        const tagLift = s.type === 'tower' ? 1.62 : 1.32;
        const crownScr = projectToScreen(s.x, s.y + (s.height || 1.8) + tagLift, s.z);
        if (crownScr) {
          ctx.save();
          ctx.font = '900 10.5px "Microsoft YaHei UI", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#291507';
          const tag = hasPlayerLord ? '王叔果驻防' : '黑鲨酋驻防';
          ctx.strokeText(tag, crownScr.sx, crownScr.sy);
          ctx.fillStyle = hasPlayerLord ? '#fde047' : '#fca5a5';
          ctx.fillText(tag, crownScr.sx, crownScr.sy);
          ctx.restore();
        }
      }
    }

    // 2. Damaged Units, Siege Engines & Field Lords (0 < hp < maxHp)!
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u || u.hp <= 0 || u.garrisonBuilding) continue;

      const isDamaged = u.hp < u.maxHp - 0.5;
      if (!isDamaged && !u.isLord) {
        u.visHp = u.hp;
        continue;
      }

      u.visHp = u.visHp === undefined ? u.hp : THREE.MathUtils.lerp(u.visHp, u.hp, lerpRate);

      const headY = u.isLord ? 1.65 : (u.isSiege ? 2.02 : (u.role === 'knight' ? 1.56 : 1.18));
      const scr = projectToScreen(u.x, u.y + headY, u.z);
      if (!scr) continue;

      if (u.isLord && !isDamaged) {
        // Clean royal title above undamaged field Lord so player always spots their Commander!
        ctx.save();
        ctx.font = '900 10.5px "Microsoft YaHei UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#291507';
        const name = u.team === 'enemy' ? '倭酋·黑鲨鬼丸' : '宗长·王叔果';
        ctx.strokeText(name, scr.sx, scr.sy);
        ctx.fillStyle = u.team === 'enemy' ? '#fca5a5' : '#fde047';
        ctx.fillText(name, scr.sx, scr.sy);
        ctx.restore();
      } else {
        const barW = u.isLord ? 50 : (u.isSiege ? 42 : (u.role === 'knight' ? 32 : 26));
        const barH = u.isLord ? 7 : (u.isSiege ? 6 : 4.8);
        const lbl = u.isLord ? `${Math.ceil(u.hp)}` : '';
        this.drawGlossyBar(
          ctx,
          scr.sx,
          scr.sy,
          barW,
          barH,
          u.hp / u.maxHp,
          u.visHp / u.maxHp,
          u.team === 'enemy',
          Boolean(u.isLord),
          lbl
        );
      }
    }

    // 3. Floating Economy Delivery Popups (+7 木, +10 石, +10 粮...)
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const ft = this.floatTexts[i];
      ft.age += rawDt;
      if (ft.age >= ft.maxAge) {
        this.floatTexts.splice(i, 1);
        continue;
      }
      const p = ft.age / ft.maxAge;
      const scr = projectToScreen(ft.wx, ft.wy + p * 1.15, ft.wz);
      if (!scr) continue;
      ctx.save();
      ctx.globalAlpha = 1.0 - Math.pow(p, 2.2);
      ctx.font = '900 12px "Microsoft YaHei UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = '#291507';
      ctx.strokeText(ft.text, scr.sx, scr.sy);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, scr.sx, scr.sy);
      ctx.restore();
    }
  }

  animate(now) {
    requestAnimationFrame(this.animate);
    const rawDt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (rawDt > 0.001) {
      this.fpsSmoothed = this.fpsSmoothed * 0.9 + (1 / rawDt) * 0.1;
    }

    const menuFrozen = this.menuState !== 'play';
    const effectiveScale = (this.gameOver || menuFrozen) ? 0 : (this.tacticalSlowMo ? 0.3 : this.timeScale);
    const dt = rawDt * effectiveScale;

    // Automated multi-route reachability & navigation benchmark (opengame-enemies pursuit test!)
    this.runNavAudit = () => {
      const pk = this.world.playerKeep || { x: -22, z: 0 };
      const ek = this.world.enemyKeep || { x: 22, z: 0 };
      const fordMain = gridToWorld(30, 19);
      const fordNorth = gridToWorld(31, 10);
      const stoneMine = this.world.stoneNodes[0] || gridToWorld(14, 9);
      const ironMine = this.world.ironNodes[0] || gridToWorld(16, 29);

      const routes = [
        { name: 'Campfire -> Main River Ford', ax: this.world.campfirePos.x, az: this.world.campfirePos.z, bx: fordMain.x, bz: fordMain.z, peaceful: false },
        { name: 'Campfire -> North Ford', ax: this.world.campfirePos.x, az: this.world.campfirePos.z, bx: fordNorth.x, bz: fordNorth.z, peaceful: false },
        { name: 'Main Ford -> East Wolf Courtyard', ax: fordMain.x, az: fordMain.z, bx: ek.x - 4, bz: ek.z, peaceful: false },
        { name: 'North Quarry -> Stockpile (Ox-Cart)', ax: stoneMine.x, az: stoneMine.z + 0.8, bx: this.world.stockpilePos.x, bz: this.world.stockpilePos.z, peaceful: true, isLarge: true },
        { name: 'South Iron -> Armory (Miner)', ax: ironMine.x, az: ironMine.z - 0.8, bx: this.world.armoryPos.x, bz: this.world.armoryPos.z, peaceful: true },
        { name: 'Player Lord -> Granary', ax: pk.x + 2, az: pk.z, bx: this.world.granaryPos.x, bz: this.world.granaryPos.z, peaceful: false },
      ];

      const t0 = performance.now();
      const details = routes.map((r) => {
        const wps = this.pathfinder.findPathWorld(this.world, r.ax, r.az, r.bx, r.bz, 'player', {
          peaceful: r.peaceful,
          isLarge: Boolean(r.isLarge),
        });
        const last = wps[wps.length - 1];
        const err = Math.hypot(last.x - r.bx, last.z - r.bz);
        return { route: r.name, waypoints: wps.length, goalDistErr: Number(err.toFixed(2)), reached: err < 2.2 };
      });
      const totalMs = Number((performance.now() - t0).toFixed(3));
      const stuckWorkers = this.workers.filter((w) => (w.noProgressTime || 0) > 2.2).length;
      const stuckUnits = this.units.filter((u) => u.hp > 0 && (u.noProgressTime || 0) > 2.2).length;
      let clipCount = 0;
      const bodies = this._groundBodies || [];
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const rB = this.getEntityRadius(b);
        const cg = worldToGrid(b.x, b.z);
        const c = this.world.getCell(cg.gx, cg.gz);
        if (c && c.ground === 'water') clipCount++;
        for (let sIdx = 0; sIdx < this.world.structures.length; sIdx++) {
          const st = this.world.structures[sIdx];
          if (!st || st.hp <= 0 || st.type === 'stockpile' || (st.type === 'gate' && (st.isOpen || st.team === b.team))) continue;
          if (this.world.distanceToStructurePerimeter(b.x, b.z, st) < rB - 0.06 && Math.hypot(b.x - st.x, b.z - st.z) < this.world.getStructureHalfExtent(st) + rB - 0.06) {
            clipCount++;
            break;
          }
        }
        for (let j = i + 1; j < bodies.length; j++) {
          const o = bodies[j];
          const minD = (rB + this.getEntityRadius(o)) * 0.68;
          if (Math.hypot(b.x - o.x, b.z - o.z) < minD) clipCount++;
        }
      }
      return {
        reachRate: `${details.filter((d) => d.reached).length}/${details.length}`,
        auditTotalMs: totalMs,
        avgRouteMs: Number((totalMs / routes.length).toFixed(3)),
        liveFrameNavMs: Number(this.navStats.frameMs.toFixed(3)),
        stuckWorkers,
        stuckUnits,
        clipCount,
        repathsTriggered: this.navStats.repaths,
        sidestepsTriggered: this.navStats.sidesteps,
        details,
      };
    };

    if (dt > 0) {
      this.pathfinder.lastFrameMs = 0;
      this.rebuildSpatialAndCrowdGrids();
      this.updateEconomy(dt);
      this.updateWorkers(dt);
      this.updateWaveCycle(dt);
      this.updateCombat(dt);
      this.world.updateEnvironment(dt, this.units);
      this.debris.update(dt);
      this.navStats.frameMs = this.navStats.frameMs * 0.85 + this.pathfinder.lastFrameMs * 0.15;
    }

    atmosphereTime.value += rawDt;
    voxelShaderTime.value = atmosphereTime.value;
    this.updateDioramaAmbientLife(rawDt);

    for (let i = this.scoutLines.length - 1; i >= 0; i--) {
      const sl = this.scoutLines[i];
      sl.life -= rawDt;
      if (sl.life <= 0) {
        this.scene.remove(sl.mesh);
        this.scoutLines.splice(i, 1);
      } else {
        sl.mesh.material.opacity = Math.min(0.92, (sl.life / sl.maxLife) * 1.3);
      }
    }

    this.camTarget.lerp(this.camDesiredTarget, Math.min(1, rawDt * 12));
    this.camYaw = THREE.MathUtils.lerp(this.camYaw, this.camDesiredYaw, Math.min(1, rawDt * 10));
    if (this.camShake > 0.001) {
      this.camShake = Math.max(0, this.camShake - rawDt * 0.85);
    }
    const shakeX = this.camShake > 0 ? (Math.random() - 0.5) * this.camShake : 0;
    const shakeZ = this.camShake > 0 ? (Math.random() - 0.5) * this.camShake : 0;

    // Orbit offset at constant 27m height & 27m horizontal radius using live camYaw!
    const horizDist = 27.0;
    this.camera.position.set(
      this.camTarget.x + shakeX + Math.sin(this.camYaw) * horizDist,
      27.0,
      this.camTarget.z + shakeZ + Math.cos(this.camYaw) * horizDist
    );
    this.camera.lookAt(this.camTarget.x + shakeX, this.camTarget.y, this.camTarget.z + shakeZ);

    // Three-quarter side-angled sun (top-right cross-lighting like Clash of Clans & My Civilization!)
    const snap = 52 / 2048;
    const sx = Math.round(this.camTarget.x / snap) * snap;
    const sz = Math.round(this.camTarget.z / snap) * snap;
    this.sunLight.target.position.set(sx, 0, sz);
    this.sunLight.position.set(sx + 25, 29, sz + 11);

    this.hudTick = (this.hudTick || 0) + rawDt;
    if (this.hudTick > 0.18) {
      this.hudTick = 0;
      this.updateHUD();
    }

    this.postFx.render(rawDt);
    this.renderWorldHUD(rawDt);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new VoxelStrongholdGame();
});
