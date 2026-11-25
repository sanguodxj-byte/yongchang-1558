// High-Performance 2.5D RTS Navigation Engine:
// 1. Zero-Allocation Continuous-Gradient FlowField25D with Bilinear Sub-Cell Sampling & HP-Weighted Breach Cost
// 2. Zero-Allocation String-Pulled A* / Theta* Waypoint Planner (Pathfinder25D) for Workers, Ox-Carts, Squads & Lords
// 3. O(1) Linked-List SpatialHashGrid + Crowd Density Map for Context Steering & Separation

const MAX_CLIMB = 0.68;
const INF_COST = 1e9;

const DIRS_8 = [
  [1, 0, 1.0],
  [-1, 0, 1.0],
  [0, 1, 1.0],
  [0, -1, 1.0],
  [1, 1, 1.41421356],
  [1, -1, 1.41421356],
  [-1, 1, 1.41421356],
  [-1, -1, 1.41421356],
];

function isCellImpassableObstacle(cell, myTeam, strictFriendlyOnly = false) {
  if (!cell) return true;
  if (cell.ground === 'water' && !cell.isBridge && !cell.isFord) return true;
  if (cell.structure && cell.structure.hp > 0) {
    const st = cell.structure;
    if (st.type === 'gate' || st.type === 'campfire' || st.type === 'stockpile') return false;
    if (strictFriendlyOnly) return true;
    if (st.team === myTeam) return true;
  }
  return false;
}

// Compute exact traversal step cost from curCell(cx,cz) -> nCell(nx,nz), or -1 if impassable!
export function evaluateStepCost(world, cx, cz, nx, nz, baseDist, myTeam, opts = null) {
  if (!world.inBounds(cx, cz) || !world.inBounds(nx, nz)) return -1;
  const curCell = world.cells[cx][cz];
  const nCell = world.cells[nx][nz];
  if (!curCell || !nCell) return -1;

  // 1. Deep water & elevation step constraint (planner climb == mover climb!)
  if (nCell.ground === 'water' && !nCell.isBridge && !nCell.isFord) return -1;
  const elevDiff = Math.abs(nCell.elev - curCell.elev);
  if (elevDiff > MAX_CLIMB) return -1;

  const isDiag = cx !== nx && cz !== nz;
  const isLarge = opts ? Boolean(opts.isLarge) : false;
  const peaceful = opts ? Boolean(opts.peaceful) : false;
  const ignoreStruct = opts ? opts.ignoreStruct : null;
  const goalStruct = opts ? opts.goalStruct : null;

  // 2. Prevent diagonal corner-cutting across cliffs, water, walls, or (for large units) trees!
  if (isDiag) {
    const c1 = world.cells[nx][cz];
    const c2 = world.cells[cx][nz];
    if (!c1 || !c2) return -1;
    if (Math.abs(c1.elev - curCell.elev) > MAX_CLIMB || Math.abs(c2.elev - curCell.elev) > MAX_CLIMB) return -1;
    if (isCellImpassableObstacle(c1, myTeam, true) || isCellImpassableObstacle(c2, myTeam, true)) return -1;
    if (isLarge && (c1.tree || c1.resourceNode || c2.tree || c2.resourceNode)) return -1;
  }

  let cost = baseDist + elevDiff * 0.45; // Mildly prefer gentle ramps over steep steps
  if (nCell.isFord) cost += 0.25;
  if (nCell.isBridge) cost -= 0.08; // Slightly attract traffic onto stone bridges

  // 3. Trees & Ore Boulders
  if (nCell.tree && (!nCell.tree.mesh || nCell.tree.mesh.visible !== false)) {
    if (isLarge || peaceful) return -1;
    cost += 22.0;
  }
  if (nCell.resourceNode) {
    if (isLarge || peaceful) return -1;
    cost += 24.0;
  }

  // 4. Structures (Gates, Friendly Walls, Enemy Fortifications)
  if (nCell.structure && nCell.structure.hp > 0) {
    const st = nCell.structure;
    if (st === ignoreStruct || st === goalStruct) {
      cost += 0.1;
    } else if (st.type === 'campfire' || st.type === 'stockpile') {
      cost += 0.15;
    } else if (st.team === myTeam) {
      // Friendly 2-body-width openable gates actively funnel friendly troops & siege engines through the arch!
      if (st.type === 'gate') {
        cost = Math.max(0.15, cost - 0.14);
      } else {
        return -1;
      }
    } else {
      // Enemy structures: peaceful gatherers never bash walls; combat armies weigh breach cost by remaining HP!
      if (peaceful) return -1;
      const hpRatio = Math.max(0.12, st.hp / Math.max(1, st.maxHp));
      if (st.type === 'keep') cost += 1.6;
      else if (st.type === 'gate') cost += 5.5 + hpRatio * 9.5;
      else if (st.type === 'wall') cost += 7.5 + hpRatio * 15.5;
      else if (st.type === 'tower' || st.type === 'ballista') cost += 10.5 + hpRatio * 16.0;
      else cost += 4.5 + hpRatio * 5.5;
    }
  }

  // 5. Soft Shoulder Clearance Cost (keeps units centered in roads, gates & fords away from cliff/water edges!)
  let shoulder = 0;
  for (let i = 0; i < 4; i++) {
    const sx = nx + DIRS_8[i][0];
    const sz = nz + DIRS_8[i][1];
    if (!world.inBounds(sx, sz)) continue;
    const sc = world.cells[sx][sz];
    if ((sc.ground === 'water' && !sc.isBridge && !sc.isFord) || Math.abs(sc.elev - nCell.elev) > MAX_CLIMB) {
      shoulder += isLarge ? 0.45 : 0.22;
    } else if (sc.tree || sc.resourceNode) {
      shoulder += isLarge ? 0.35 : 0.14;
    }
  }
  cost += Math.min(isLarge ? 1.35 : 0.65, shoulder);

  // 6. Dynamic Crowd Congestion Penalty (routes reinforcements around jammed tiles!)
  if (opts && opts.crowdDensity) {
    const gw = world.cells.length;
    cost += opts.crowdDensity[nz * gw + nx] * 1.35;
  }

  return cost;
}

// ============================================================================
// 1. CONTINUOUS BILINEAR 2.5D FLOW FIELD (Zero-Allocation Typed Binary Heap)
// ============================================================================
export class FlowField25D {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const N = w * h;
    this.cost = new Float32Array(N);
    this.dirX = new Float32Array(N);
    this.dirZ = new Float32Array(N);
    this.heapIdx = new Int32Array(N * 2);
    this.heapCost = new Float32Array(N * 2);
  }

  idx(gx, gz) {
    return gz * this.w + gx;
  }

  compute(world, tgx, tgz, myTeam, crowdDensity = null) {
    const w = this.w;
    const h = this.h;
    this.cost.fill(INF_COST);
    this.dirX.fill(0);
    this.dirZ.fill(0);

    if (!world.inBounds(tgx, tgz)) return;

    let heapSize = 0;
    const heapIdx = this.heapIdx;
    const heapCost = this.heapCost;

    const push = (id, c) => {
      let i = heapSize++;
      heapIdx[i] = id;
      heapCost[i] = c;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heapCost[p] <= heapCost[i]) break;
        const ti = heapIdx[p]; heapIdx[p] = heapIdx[i]; heapIdx[i] = ti;
        const tc = heapCost[p]; heapCost[p] = heapCost[i]; heapCost[i] = tc;
        i = p;
      }
    };

    const popId = () => {
      const topId = heapIdx[0];
      heapSize--;
      if (heapSize > 0) {
        heapIdx[0] = heapIdx[heapSize];
        heapCost[0] = heapCost[heapSize];
        let i = 0;
        while (true) {
          const l = (i << 1) + 1;
          const r = l + 1;
          let s = i;
          if (l < heapSize && heapCost[l] < heapCost[s]) s = l;
          if (r < heapSize && heapCost[r] < heapCost[s]) s = r;
          if (s === i) break;
          const ti = heapIdx[i]; heapIdx[i] = heapIdx[s]; heapIdx[s] = ti;
          const tc = heapCost[i]; heapCost[i] = heapCost[s]; heapCost[s] = tc;
          i = s;
        }
      }
      return topId;
    };

    const centerElev = world.cells[tgx][tgz].elev;
    let seeded = 0;
    // Seed reachable 3x3 neighborhood around target (Keep / Lord) connected in elevation!
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const sx = tgx + dx;
        const sz = tgz + dz;
        if (!world.inBounds(sx, sz)) continue;
        const sc = world.cells[sx][sz];
        if (sc.ground === 'water' && !sc.isBridge && !sc.isFord) continue;
        if (Math.abs(sc.elev - centerElev) > MAX_CLIMB * 1.4) continue;
        const id = sz * w + sx;
        const seedCost = (dx === 0 && dz === 0) ? 0 : 0.35;
        this.cost[id] = seedCost;
        push(id, seedCost);
        seeded++;
      }
    }
    if (seeded === 0) {
      const id = tgz * w + tgx;
      this.cost[id] = 0;
      push(id, 0);
    }

    const opts = { crowdDensity };

    while (heapSize > 0) {
      const cid = popId();
      const curC = this.cost[cid];
      const cx = cid % w;
      const cz = (cid / w) | 0;

      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS_8[d][0];
        const nz = cz + DIRS_8[d][1];
        // Note: Dijkstra integrates backwards FROM goal TO agent, so forward move is (nx,nz) -> (cx,cz)!
        const stepC = evaluateStepCost(world, nx, nz, cx, cz, DIRS_8[d][2], myTeam, opts);
        if (stepC < 0) continue;

        const nid = nz * w + nx;
        const newCost = curC + stepC;
        if (newCost < this.cost[nid]) {
          this.cost[nid] = newCost;
          push(nid, newCost);
        }
      }
    }

    // Build Continuous Eikonal Finite-Difference Gradient + Wall-Tangent Repulsion!
    for (let gz = 0; gz < h; gz++) {
      for (let gx = 0; gx < w; gx++) {
        const id = gz * w + gx;
        const c0 = this.cost[id];
        if (c0 >= INF_COST * 0.5) continue;
        const cCell = world.cells[gx][gz];

        // Sample valid cardinal neighbors for smooth (-dCost/dx, -dCost/dz) gradient
        const validCost = (nx, nz) => {
          if (!world.inBounds(nx, nz)) return -1;
          const nc = this.cost[nz * w + nx];
          if (nc >= INF_COST * 0.5) return -1;
          const nCell = world.cells[nx][nz];
          if (Math.abs(nCell.elev - cCell.elev) > MAX_CLIMB) return -1;
          if (isCellImpassableObstacle(nCell, myTeam, false) && nc > c0) return -1;
          return nc;
        };

        const cL = validCost(gx - 1, gz);
        const cR = validCost(gx + 1, gz);
        const cD = validCost(gx, gz - 1);
        const cU = validCost(gx, gz + 1);

        let vx = 0;
        let vz = 0;
        if (cL >= 0 && cR >= 0) vx = (cL - cR) * 0.5;
        else if (cL >= 0) vx = cL - c0;
        else if (cR >= 0) vx = c0 - cR;

        if (cD >= 0 && cU >= 0) vz = (cD - cU) * 0.5;
        else if (cD >= 0) vz = cD - c0;
        else if (cU >= 0) vz = c0 - cU;

        // Steepest 8-neighbor fallback at diagonal bottlenecks / narrow ramps
        let bestDrop = 0;
        let bestDx = 0;
        let bestDz = 0;
        let repelX = 0;
        let repelZ = 0;

        for (let d = 0; d < 8; d++) {
          const dx = DIRS_8[d][0];
          const dz = DIRS_8[d][1];
          const nx = gx + dx;
          const nz = gz + dz;
          if (!world.inBounds(nx, nz)) continue;
          const stepCheck = evaluateStepCost(world, gx, gz, nx, nz, DIRS_8[d][2], myTeam, null);
          if (stepCheck < 0) {
            if (d < 4) {
              repelX -= dx * 0.16;
              repelZ -= dz * 0.16;
            }
            continue;
          }
          const nc = this.cost[nz * w + nx];
          const drop = (c0 - nc) / DIRS_8[d][2];
          if (drop > bestDrop) {
            bestDrop = drop;
            bestDx = dx / DIRS_8[d][2];
            bestDz = dz / DIRS_8[d][2];
          }
        }

        // Blend smooth finite-difference gradient (70%) with steepest valid direction (30%) + subtle wall push
        let fx = vx * 0.7 + bestDx * 0.3;
        let fz = vz * 0.7 + bestDz * 0.3;
        if (Math.hypot(fx, fz) < 0.05) {
          fx = bestDx;
          fz = bestDz;
        } else {
          // Only apply perpendicular component of wall repulsion so we never push backwards!
          const gLen = Math.hypot(fx, fz) || 1;
          const gxN = fx / gLen;
          const gzN = fz / gLen;
          const dot = repelX * gxN + repelZ * gzN;
          fx = gxN + (repelX - dot * gxN);
          fz = gzN + (repelZ - dot * gzN);
        }

        const len = Math.hypot(fx, fz);
        if (len > 1e-4) {
          this.dirX[id] = fx / len;
          this.dirZ[id] = fz / len;
        }
      }
    }
  }

  sample(gx, gz) {
    if (gx < 0 || gx >= this.w || gz < 0 || gz >= this.h) return { x: 0, z: 0 };
    const id = gz * this.w + gx;
    return { x: this.dirX[id], z: this.dirZ[id] };
  }

  // Reachability-masked Bilinear Sub-Cell World Sampling: smooth curved motion without wall bleed!
  sampleWorld(wx, wz, world = null) {
    const fx = wx + this.w * 0.5 - 0.5;
    const fz = wz + this.h * 0.5 - 0.5;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;

    const cgx = Math.max(0, Math.min(this.w - 1, Math.round(fx)));
    const cgz = Math.max(0, Math.min(this.h - 1, Math.round(fz)));
    const refElev = world ? world.cells[cgx][cgz].elev : 0;

    let sumX = 0;
    let sumZ = 0;
    let sumW = 0;

    const accum = (gx, gz, weight) => {
      if (gx < 0 || gx >= this.w || gz < 0 || gz >= this.h) return;
      const id = gz * this.w + gx;
      if (this.cost[id] >= INF_COST * 0.5) return;
      if (world && Math.abs(world.cells[gx][gz].elev - refElev) > MAX_CLIMB) return;
      const dx = this.dirX[id];
      const dz = this.dirZ[id];
      if (dx === 0 && dz === 0) return;
      sumX += dx * weight;
      sumZ += dz * weight;
      sumW += weight;
    };

    accum(x0, z0, (1 - tx) * (1 - tz));
    accum(x0 + 1, z0, tx * (1 - tz));
    accum(x0, z0 + 1, (1 - tx) * tz);
    accum(x0 + 1, z0 + 1, tx * tz);

    if (sumW <= 1e-4) {
      return this.sample(cgx, cgz);
    }
    const len = Math.hypot(sumX, sumZ);
    if (len <= 1e-4) return { x: 0, z: 0 };
    return { x: sumX / len, z: sumZ / len };
  }
}

// ============================================================================
// 2. STRING-PULLED 2.5D A* / THETA* WAYPOINT PLANNER (Workers, Squads & Lords)
// ============================================================================
export class Pathfinder25D {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const N = w * h;
    this.gScore = new Float32Array(N);
    this.cameFrom = new Int32Array(N);
    this.visitTag = new Int32Array(N);
    this.closedTag = new Int32Array(N);
    this.heapIdx = new Int32Array(N * 2);
    this.heapF = new Float32Array(N * 2);
    this.searchId = 1;
    this.totalQueries = 0;
    this.lastFrameMs = 0;
  }

  // Find closest walkable cell around (gx, gz) so trees, mines & building footprints always have a clean doorstep!
  resolveWalkableCell(world, gx, gz, myTeam, opts, refX, refZ) {
    gx = Math.max(0, Math.min(this.w - 1, gx));
    gz = Math.max(0, Math.min(this.h - 1, gz));

    const isCellStandable = (cx, cz) => {
      if (!world.inBounds(cx, cz)) return false;
      const c = world.cells[cx][cz];
      if (c.ground === 'water' && !c.isBridge && !c.isFord) return false;
      if (opts?.peaceful && (c.tree || c.resourceNode)) return false;
      if (opts?.isLarge && (c.tree || c.resourceNode)) return false;
      if (c.structure && c.structure.hp > 0) {
        const st = c.structure;
        if (st === opts?.ignoreStruct || st === opts?.goalStruct) return true;
        if (st.type === 'gate' || st.type === 'campfire' || st.type === 'stockpile') return true;
        return false;
      }
      return true;
    };

    if (isCellStandable(gx, gz)) return { gx, gz };

    let best = null;
    let bestScore = Infinity;
    for (let r = 1; r <= 3; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = gx + dx;
          const nz = gz + dz;
          if (!isCellStandable(nx, nz)) continue;
          const wx = nx - this.w * 0.5 + 0.5;
          const wz = nz - this.h * 0.5 + 0.5;
          const d = Math.hypot(wx - refX, wz - refZ);
          if (d < bestScore) {
            bestScore = d;
            best = { gx: nx, gz: nz };
          }
        }
      }
      if (best) return best;
    }
    return { gx, gz };
  }

  // Check 2.5D Line-of-Sight with body-radius clearance between two world points for Theta* String-Pulling!
  hasLineOfSight(world, x0, z0, x1, z1, myTeam, opts) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) return true;

    const steps = Math.ceil(dist / 0.32);
    const nx = -dz / dist;
    const nz = dx / dist;
    const clearance = opts?.isLarge ? 0.34 : 0.22;

    let prevElev = null;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x0 + dx * t;
      const pz = z0 + dz * t;

      // Check center ray + left/right shoulder rays so units never clip wall/cliff corners!
      for (let side = -1; side <= 1; side++) {
        const rx = px + nx * (side * clearance);
        const rz = pz + nz * (side * clearance);
        const gx = Math.floor(rx + this.w * 0.5);
        const gz = Math.floor(rz + this.h * 0.5);
        if (!world.inBounds(gx, gz)) return false;
        const c = world.cells[gx][gz];
        if (c.ground === 'water' && !c.isBridge && !c.isFord) return false;
        if (c.tree && (!c.tree.mesh || c.tree.mesh.visible !== false)) return false;
        if (c.resourceNode) return false;
        if (c.structure && c.structure.hp > 0) {
          const st = c.structure;
          if (st !== opts?.ignoreStruct && st !== opts?.goalStruct) {
            if (st.type !== 'gate' && st.type !== 'campfire' && st.type !== 'stockpile') return false;
            if (st.team !== myTeam) return false;
          }
        }
        if (side === 0) {
          if (prevElev !== null && Math.abs(c.elev - prevElev) > MAX_CLIMB) return false;
          prevElev = c.elev;
        } else if (prevElev !== null && Math.abs(c.elev - prevElev) > MAX_CLIMB) {
          return false;
        }
      }
    }
    return true;
  }

  // Returns smooth array of { x, z } world waypoints from (startX, startZ) -> (goalX, goalZ)!
  findPathWorld(world, startX, startZ, goalX, goalZ, myTeam = 'player', opts = {}) {
    const t0 = performance.now();
    this.totalQueries++;

    // Fast path: direct clear line-of-sight!
    if (this.hasLineOfSight(world, startX, startZ, goalX, goalZ, myTeam, opts)) {
      this.lastFrameMs += performance.now() - t0;
      return [{ x: goalX, z: goalZ }];
    }

    const w = this.w;
    const rawSx = Math.floor(startX + w * 0.5);
    const rawSz = Math.floor(startZ + this.h * 0.5);
    const rawGx = Math.floor(goalX + w * 0.5);
    const rawGz = Math.floor(goalZ + this.h * 0.5);

    const startCell = this.resolveWalkableCell(world, rawSx, rawSz, myTeam, opts, startX, startZ);
    const goalCell = this.resolveWalkableCell(world, rawGx, rawGz, myTeam, opts, startX, startZ);

    const startId = startCell.gz * w + startCell.gx;
    const goalId = goalCell.gz * w + goalCell.gx;
    if (startId === goalId) {
      this.lastFrameMs += performance.now() - t0;
      return [{ x: goalX, z: goalZ }];
    }

    const tag = ++this.searchId;
    const gScore = this.gScore;
    const cameFrom = this.cameFrom;
    const visitTag = this.visitTag;
    const closedTag = this.closedTag;
    const heapIdx = this.heapIdx;
    const heapF = this.heapF;

    let heapSize = 0;
    const push = (id, f) => {
      let i = heapSize++;
      heapIdx[i] = id;
      heapF[i] = f;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heapF[p] <= heapF[i]) break;
        const ti = heapIdx[p]; heapIdx[p] = heapIdx[i]; heapIdx[i] = ti;
        const tf = heapF[p]; heapF[p] = heapF[i]; heapF[i] = tf;
        i = p;
      }
    };

    const pop = () => {
      const top = heapIdx[0];
      heapSize--;
      if (heapSize > 0) {
        heapIdx[0] = heapIdx[heapSize];
        heapF[0] = heapF[heapSize];
        let i = 0;
        while (true) {
          const l = (i << 1) + 1;
          const r = l + 1;
          let s = i;
          if (l < heapSize && heapF[l] < heapF[s]) s = l;
          if (r < heapSize && heapF[r] < heapF[s]) s = r;
          if (s === i) break;
          const ti = heapIdx[i]; heapIdx[i] = heapIdx[s]; heapIdx[s] = ti;
          const tf = heapF[i]; heapF[i] = heapF[s]; heapF[s] = tf;
          i = s;
        }
      }
      return top;
    };

    const octile = (ax, az) => {
      const dx = Math.abs(ax - goalCell.gx);
      const dz = Math.abs(az - goalCell.gz);
      return (dx + dz) + (1.41421356 - 2) * Math.min(dx, dz);
    };

    visitTag[startId] = tag;
    gScore[startId] = 0;
    cameFrom[startId] = -1;
    push(startId, octile(startCell.gx, startCell.gz));

    let reachedId = -1;
    let closestId = startId;
    let closestH = octile(startCell.gx, startCell.gz);

    while (heapSize > 0) {
      const cid = pop();
      if (closedTag[cid] === tag) continue;
      closedTag[cid] = tag;

      if (cid === goalId) {
        reachedId = cid;
        break;
      }

      const cx = cid % w;
      const cz = (cid / w) | 0;
      const curG = gScore[cid];
      const curH = octile(cx, cz);
      if (curH < closestH) {
        closestH = curH;
        closestId = cid;
      }

      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS_8[d][0];
        const nz = cz + DIRS_8[d][1];
        if (!world.inBounds(nx, nz)) continue;
        const nid = nz * w + nx;
        if (closedTag[nid] === tag) continue;

        const stepC = evaluateStepCost(world, cx, cz, nx, nz, DIRS_8[d][2], myTeam, opts);
        if (stepC < 0) continue;

        const tentG = curG + stepC;
        if (visitTag[nid] !== tag || tentG < gScore[nid]) {
          visitTag[nid] = tag;
          gScore[nid] = tentG;
          cameFrom[nid] = cid;
          push(nid, tentG + octile(nx, nz) * 1.04);
        }
      }
    }

    const finalNode = reachedId !== -1 ? reachedId : closestId;
    if (finalNode === startId) {
      this.lastFrameMs += performance.now() - t0;
      return [{ x: goalX, z: goalZ }];
    }

    // Reconstruct raw grid centers
    const rawPts = [];
    let curr = finalNode;
    let guard = 0;
    while (curr !== -1 && curr !== startId && guard++ < 600) {
      const gx = curr % w;
      const gz = (curr / w) | 0;
      rawPts.push({ x: gx - w * 0.5 + 0.5, z: gz - this.h * 0.5 + 0.5 });
      curr = cameFrom[curr];
    }
    rawPts.reverse();

    // Append exact world destination if goal was reached cleanly (and goal itself is standable)
    if (reachedId !== -1 && rawGx === goalCell.gx && rawGz === goalCell.gz) {
      rawPts[rawPts.length - 1] = { x: goalX, z: goalZ };
    }

    // String-Pulling / Funnel LOS Smoothing: collapse collinear & clear-LOS segments into natural straight lines!
    const smooth = [];
    let anchor = { x: startX, z: startZ };
    let idx = 0;
    while (idx < rawPts.length) {
      let furthest = idx;
      // Probe ahead greedily for the furthest visible waypoint
      for (let probe = rawPts.length - 1; probe > idx; probe--) {
        if (this.hasLineOfSight(world, anchor.x, anchor.z, rawPts[probe].x, rawPts[probe].z, myTeam, opts)) {
          furthest = probe;
          break;
        }
      }
      smooth.push(rawPts[furthest]);
      anchor = rawPts[furthest];
      idx = furthest + 1;
    }

    this.lastFrameMs += performance.now() - t0;
    return smooth;
  }
}

// ============================================================================
// 3. O(1) ZERO-ALLOCATION SPATIAL HASH GRID (Collisions, Separation & Target Search)
// ============================================================================
export class SpatialHashGrid {
  constructor(minX, minZ, width, height, cellSize = 2.0, maxEntities = 512) {
    this.minX = minX;
    this.minZ = minZ;
    this.invCell = 1 / cellSize;
    this.cols = Math.ceil(width / cellSize) + 2;
    this.rows = Math.ceil(height / cellSize) + 2;
    this.head = new Int32Array(this.cols * this.rows);
    this.next = new Int32Array(maxEntities);
    this.items = new Array(maxEntities);
    this.count = 0;
  }

  clear() {
    this.head.fill(-1);
    this.count = 0;
  }

  insert(ent, x, z) {
    if (this.count >= this.next.length) return;
    const cx = Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) * this.invCell)));
    const cz = Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) * this.invCell)));
    const bucket = cz * this.cols + cx;
    const id = this.count++;
    this.items[id] = ent;
    this.next[id] = this.head[bucket];
    this.head[bucket] = id;
  }

  queryRadius(x, z, radius, callback) {
    const x0 = Math.max(0, Math.floor((x - radius - this.minX) * this.invCell));
    const x1 = Math.min(this.cols - 1, Math.floor((x + radius - this.minX) * this.invCell));
    const z0 = Math.max(0, Math.floor((z - radius - this.minZ) * this.invCell));
    const z1 = Math.min(this.rows - 1, Math.floor((z + radius - this.minZ) * this.invCell));

    for (let cz = z0; cz <= z1; cz++) {
      const rowOff = cz * this.cols;
      for (let cx = x0; cx <= x1; cx++) {
        let cur = this.head[rowOff + cx];
        while (cur !== -1) {
          callback(this.items[cur]);
          cur = this.next[cur];
        }
      }
    }
  }
}
