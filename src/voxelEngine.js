import * as THREE from 'three';

export const VMAT = {
  GRASS: 0,
  ASHLAR: 1,
  CLIFF: 2,
  SAND: 3,
  TIMBER: 4,
  ROOF: 5,
  COBBLE: 6,
  LEAVES: 7,
  METAL: 8,
  PITCH: 9,
  PLASTER: 10,
};

let sharedLowPolyMat = null;
let sharedEmissiveMat = null;

export const voxelShaderTime = { value: 0 };

export function voxelHash(x, y, z, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(seed | 0, 1597334677)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function tintHex(hex, lumDelta) {
  let r = ((hex >> 16) & 255) / 255;
  let g = ((hex >> 8) & 255) / 255;
  let b = (hex & 255) / 255;
  const f = 1 + lumDelta;
  r = Math.min(1, Math.max(0, r * f));
  g = Math.min(1, Math.max(0, g * f));
  b = Math.min(1, Math.max(0, b * f));
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | (Math.round(b * 255));
}

const _tmpCol = new THREE.Color();
function hexToLinearRGB(hex, scale = 1.0) {
  _tmpCol.setHex(hex);
  return [_tmpCol.r * scale, _tmpCol.g * scale, _tmpCol.b * scale];
}

/**
 * Grounded Ming Historical Mid-Poly Material:
 * - Hybrid smooth/crisp explicit vertex normals (`flatShading: false`) — zero origami-cartoon faceting on curves!
 * - Procedural object/world-space triplanar material micro-detail (ashlar stone courses, bluestone flagstones,
 *   aged cedar wood grain, grey clay roof tile coursing, weathered Jiangnan lime-plaster patina & cloud sunlight dapple).
 */
export function getSharedVoxelMaterial() {
  if (!sharedLowPolyMat) {
    sharedLowPolyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: false,
      roughness: 0.82,
      metalness: 0.04,
    });
    sharedLowPolyMat.customProgramCacheKey = () => 'yongchang-historical-midpoly-v3';
    sharedLowPolyMat.onBeforeCompile = (shader) => {
      shader.uniforms.uDioramaTime = voxelShaderTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aMatId;
          varying vec3 vLpWorldPos;
          varying vec3 vLpObjPos;
          varying vec3 vLpWorldNorm;
          varying float vLpMatId;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vec4 lpw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            lpw = instanceMatrix * lpw;
          #endif
          vLpObjPos = transformed;
          lpw = modelMatrix * lpw;
          vLpWorldPos = lpw.xyz;
          vLpWorldNorm = normalize(mat3(modelMatrix) * objectNormal);
          vLpMatId = aMatId;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uDioramaTime;
          varying vec3 vLpWorldPos;
          varying vec3 vLpObjPos;
          varying vec3 vLpWorldNorm;
          varying float vLpMatId;
          float lpHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float lpNoise2(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(lpHash2(i), lpHash2(i + vec2(1.0, 0.0)), u.x),
                       mix(lpHash2(i + vec2(0.0, 1.0)), lpHash2(i + vec2(1.0, 1.0)), u.x), u.y);
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            int matId = int(floor(vLpMatId + 0.5));
            float upMask = clamp(vLpWorldNorm.y, 0.0, 1.0);
            float m1 = lpNoise2(vLpWorldPos.xz * 0.16);
            float m2 = lpNoise2(vLpWorldPos.xz * 0.58 + vec2(5.7, 2.9));
            float macro = (m1 * 0.65 + m2 * 0.35) - 0.5;

            // 1. Surface-Specific Historical Material Grain (faded cleanly with screen derivative to prevent shimmer!)
            float pxScale = clamp(1.0 - length(fwidth(vLpWorldPos)) * 5.5, 0.0, 1.0);
            if (matId == 1) {
              // ASHLAR: Staggered Ming granite block courses + mortar joints & damp base moss
              float row = floor(vLpObjPos.y * 5.5);
              float horizCoord = vLpObjPos.x + vLpObjPos.z + mod(row, 2.0) * 0.24;
              float col = floor(horizCoord * 2.6);
              float gy = abs(fract(vLpObjPos.y * 5.5) - 0.5);
              float gx = abs(fract(horizCoord * 2.6) - 0.5);
              float mortar = (1.0 - smoothstep(0.43, 0.49, max(gx, gy)));
              float blockVar = (lpHash2(vec2(col, row)) - 0.5) * 0.13;
              diffuseColor.rgb *= 1.0 + blockVar * pxScale;
              diffuseColor.rgb *= mix(0.76, 1.0, clamp(mortar + (1.0 - pxScale), 0.0, 1.0));
              float baseDamp = 1.0 - smoothstep(0.02, 0.42, vLpObjPos.y);
              diffuseColor.rgb *= mix(1.0, 0.84, baseDamp * 0.65);
            } else if (matId == 4) {
              // TIMBER: Aged cedar/walnut plank grain
              float grain = lpNoise2(vec2(vLpObjPos.y * 14.0 + vLpObjPos.x * 3.5, (vLpObjPos.x + vLpObjPos.z) * 22.0));
              diffuseColor.rgb *= 1.0 + (grain - 0.5) * 0.14 * pxScale;
            } else if (matId == 5) {
              // ROOF: Traditional grey clay tile (筒瓦) fine lapped courses & weathered patina
              float tileLap = sin((vLpObjPos.y * 18.0 + length(vLpObjPos.xz) * 14.0)) * 0.5 + 0.5;
              float soot = lpNoise2(vLpWorldPos.xz * 2.4);
              diffuseColor.rgb *= 1.0 - tileLap * 0.08 * pxScale + (soot - 0.5) * 0.10;
            } else if (matId == 6) {
              // COBBLE: Dressed Ming bluestone courtyard flagstones (青石条砖铺地)
              float rId = floor(vLpWorldPos.z * 2.2);
              float uCoord = vLpWorldPos.x * 1.4 + mod(rId, 2.0) * 0.5;
              float cId = floor(uCoord);
              float jx = abs(fract(uCoord) - 0.5);
              float jz = abs(fract(vLpWorldPos.z * 2.2) - 0.5);
              float seam = 1.0 - smoothstep(0.44, 0.495, max(jx, jz));
              float stoneTone = (lpHash2(vec2(cId, rId)) - 0.5) * 0.11;
              diffuseColor.rgb *= (1.0 + stoneTone * pxScale) * mix(0.80, 1.0, clamp(seam + (1.0 - pxScale), 0.0, 1.0));
            } else if (matId == 10) {
              // PLASTER: Aged Jiangnan warm lime-ochre wall mottling + lower damp brick base
              float stain = lpNoise2(vec2((vLpObjPos.x + vLpObjPos.z) * 4.2, vLpObjPos.y * 3.6));
              float damp = 1.0 - smoothstep(0.05, 0.45, vLpObjPos.y);
              diffuseColor.rgb *= (1.0 + (stain - 0.5) * 0.11) * mix(1.0, 0.82, damp * 0.7);
            } else {
              // GRASS / CLIFF / LEAVES: Natural earthy mottling
              float fine = lpNoise2(vLpWorldPos.xz * 2.8) - 0.5;
              diffuseColor.rgb *= vec3(
                1.0 + macro * 0.12 + fine * 0.05 * pxScale,
                1.0 + macro * 0.09 + fine * 0.05 * pxScale,
                1.0 - macro * 0.04
              );
            }

            // 2. Subtle Warm Drifting Cloud-Gap Sunlight Dapple
            float cloudPatch = lpNoise2(vLpWorldPos.xz * 0.048 + vec2(uDioramaTime * 0.024, -uDioramaTime * 0.014));
            float sunDapple = mix(0.93, 1.06, smoothstep(0.32, 0.72, cloudPatch));
            diffuseColor.rgb *= mix(1.0, sunDapple, upMask * 0.80);
          }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          {
            int rMat = int(floor(vLpMatId + 0.5));
            if (rMat == 8) roughnessFactor = 0.44;
            else if (rMat == 5) roughnessFactor = 0.70;
            else if (rMat == 4) roughnessFactor = 0.80;
            else if (rMat == 1 || rMat == 6) roughnessFactor = 0.86;
            else roughnessFactor = 0.90;
          }`
        );
    };
  }
  return sharedLowPolyMat;
}

export function getSharedEmissiveMaterial() {
  if (!sharedEmissiveMat) {
    sharedEmissiveMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.05, 1.82, 1.48),
      vertexColors: true,
    });
  }
  return sharedEmissiveMat;
}

/**
 * High-Detail Historical Mid-Poly Builder (`PolyBuilder`)
 * Supports both crisp architectural split normals AND smooth organic radial/lathe normals,
 * ribbed Chinese clay-tile roofs (`筒瓦瓦垄飞檐`), exposed timber rafters (`飞椽`), 3D lattice windows (`直棂花窗`),
 * cloth shop awnings (`布幌遮阳棚`), spoked wooden artillery wheels, and anatomical 6.5-head Ming figures!
 */
export class PolyBuilder {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.col = [];
    this.mat = [];

    this.emPos = [];
    this.emNorm = [];
    this.emCol = [];

    this.triCount = 0;
  }

  tri(p0, p1, p2, hexColor, s0 = 1.0, s1 = 1.0, s2 = 1.0, emissive = false, matId = VMAT.ASHLAR) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) return;
    nx /= len; ny /= len; nz /= len;

    const pArr = emissive ? this.emPos : this.pos;
    const nArr = emissive ? this.emNorm : this.norm;
    const cArr = emissive ? this.emCol : this.col;

    const dirShade = emissive ? 1.0 : (0.95 + ny * 0.05 + nx * 0.02 - nz * 0.01);
    const c0 = hexToLinearRGB(hexColor, s0 * dirShade);
    const c1 = hexToLinearRGB(hexColor, s1 * dirShade);
    const c2 = hexToLinearRGB(hexColor, s2 * dirShade);

    pArr.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    nArr.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    cArr.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
    if (!emissive) this.mat.push(matId, matId, matId);
    this.triCount++;
  }

  // Smooth vertex-normal triangle (auto-enforces FrontSide CCW winding matching outward normals!)
  triSmooth(p0, p1, p2, n0, n1, n2, hexColor, s0 = 1.0, s1 = 1.0, s2 = 1.0, emissive = false, matId = VMAT.TIMBER) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    const fnx = ay * bz - az * by;
    const fny = az * bx - ax * bz;
    const fnz = ax * by - ay * bx;
    if (Math.hypot(fnx, fny, fnz) < 1e-8) return;

    const avgNx = n0[0] + n1[0] + n2[0];
    const avgNy = n0[1] + n1[1] + n2[1];
    const avgNz = n0[2] + n1[2] + n2[2];
    const flip = (fnx * avgNx + fny * avgNy + fnz * avgNz) < 0;

    const aP = p0, bP = flip ? p2 : p1, cP = flip ? p1 : p2;
    const aN = n0, bN = flip ? n2 : n1, cN = flip ? n1 : n2;
    const aS = s0, bS = flip ? s2 : s1, cS = flip ? s1 : s2;

    const pArr = emissive ? this.emPos : this.pos;
    const nArr = emissive ? this.emNorm : this.norm;
    const cArr = emissive ? this.emCol : this.col;

    const c0 = hexToLinearRGB(hexColor, aS);
    const c1 = hexToLinearRGB(hexColor, bS);
    const c2 = hexToLinearRGB(hexColor, cS);

    pArr.push(aP[0], aP[1], aP[2], bP[0], bP[1], bP[2], cP[0], cP[1], cP[2]);
    nArr.push(aN[0], aN[1], aN[2], bN[0], bN[1], bN[2], cN[0], cN[1], cN[2]);
    cArr.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
    if (!emissive) this.mat.push(matId, matId, matId);
    this.triCount++;
  }

  quad(p0, p1, p2, p3, hexColor, s0 = 1, s1 = 1, s2 = 1, s3 = 1, emissive = false, matId = VMAT.ASHLAR) {
    this.tri(p0, p1, p2, hexColor, s0, s1, s2, emissive, matId);
    this.tri(p0, p2, p3, hexColor, s0, s2, s3, emissive, matId);
  }

  box(cx, cy, cz, sx, sy, sz, hexColor, opts = {}) {
    const tsx = opts.topScaleX !== undefined ? opts.topScaleX : 1.0;
    const tsz = opts.topScaleZ !== undefined ? opts.topScaleZ : 1.0;
    const tsy = opts.topScaleY !== undefined ? opts.topScaleY : 1.0;
    const aoBot = opts.aoBot !== undefined ? opts.aoBot : 0.86;
    const aoTop = opts.aoTop !== undefined ? opts.aoTop : 1.02;
    const em = Boolean(opts.emissive);
    const matId = opts.matId !== undefined ? opts.matId : VMAT.ASHLAR;

    const hx0 = sx * 0.5, hz0 = sz * 0.5;
    const hx1 = sx * 0.5 * tsx, hz1 = sz * 0.5 * tsz;
    const hy0 = sy * 0.5;
    const hy1 = sy * 0.5 * tsy;

    const verts = [
      [-hx0, -hy0, -hz0], [hx0, -hy0, -hz0], [hx0, -hy0, hz0], [-hx0, -hy0, hz0],
      [-hx1,  hy1, -hz1], [hx1,  hy1, -hz1], [hx1,  hy1, hz1], [-hx1,  hy1, hz1],
    ];

    if (opts.rotX || opts.rotY || opts.rotZ) {
      const eul = new THREE.Euler(opts.rotX || 0, opts.rotY || 0, opts.rotZ || 0, 'YXZ');
      const v3 = new THREE.Vector3();
      for (let i = 0; i < 8; i++) {
        v3.set(verts[i][0], verts[i][1], verts[i][2]).applyEuler(eul);
        verts[i] = [v3.x + cx, v3.y + cy, v3.z + cz];
      }
    } else {
      for (let i = 0; i < 8; i++) {
        verts[i][0] += cx;
        verts[i][1] += cy;
        verts[i][2] += cz;
      }
    }

    const [b0, b1, b2, b3, t0, t1, t2, t3] = verts;
    this.quad(b3, b2, t2, t3, hexColor, aoBot, aoBot, aoTop, aoTop, em, matId);
    this.quad(b1, b0, t0, t1, hexColor, aoBot, aoBot, aoTop, aoTop, em, matId);
    this.quad(b2, b1, t1, t2, hexColor, aoBot, aoBot, aoTop, aoTop, em, matId);
    this.quad(b0, b3, t3, t0, hexColor, aoBot, aoBot, aoTop, aoTop, em, matId);
    this.quad(t3, t2, t1, t0, hexColor, aoTop, aoTop, aoTop, aoTop, em, matId);
    if (!opts.skipBottom) {
      this.quad(b0, b1, b2, b3, hexColor, aoBot * 0.9, aoBot * 0.9, aoBot * 0.9, aoBot * 0.9, em, matId);
    }
  }

  boxY(cx, y0, cz, sx, sy, sz, hexColor, opts = {}) {
    this.box(cx, y0 + sy * 0.5, cz, sx, sy, sz, hexColor, opts);
  }

  prismY(cx, y0, cz, rBot, rTop, height, sides, hexColor, opts = {}) {
    const yawOff = opts.yawOffset || 0;
    const aoBot = opts.aoBot !== undefined ? opts.aoBot : 0.86;
    const aoTop = opts.aoTop !== undefined ? opts.aoTop : 1.02;
    const em = Boolean(opts.emissive);
    const sxScale = opts.scaleX || 1.0;
    const szScale = opts.scaleZ || 1.0;
    const smooth = opts.smooth !== undefined ? opts.smooth : (sides >= 10);
    const matId = opts.matId !== undefined ? opts.matId : VMAT.TIMBER;

    const ringBot = [];
    const ringTop = [];
    const radNorms = [];
    const slopeY = (rBot - rTop) / Math.max(1e-4, height);

    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + yawOff;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ringBot.push([cx + ca * sxScale * rBot, y0, cz + sa * szScale * rBot]);
      ringTop.push([cx + ca * sxScale * rTop, y0 + height, cz + sa * szScale * rTop]);
      const nl = Math.hypot(ca / sxScale, slopeY, sa / szScale) || 1;
      radNorms.push([(ca / sxScale) / nl, slopeY / nl, (sa / szScale) / nl]);
    }

    for (let i = 0; i < sides; i++) {
      const ni = (i + 1) % sides;
      if (rTop > 1e-4) {
        if (smooth) {
          this.triSmooth(ringBot[ni], ringBot[i], ringTop[i], radNorms[ni], radNorms[i], radNorms[i], hexColor, aoBot, aoBot, aoTop, em, matId);
          this.triSmooth(ringBot[ni], ringTop[i], ringTop[ni], radNorms[ni], radNorms[i], radNorms[ni], hexColor, aoBot, aoTop, aoTop, em, matId);
        } else {
          this.quad(ringBot[ni], ringBot[i], ringTop[i], ringTop[ni], hexColor, aoBot, aoBot, aoTop, aoTop, em, matId);
        }
      } else {
        if (smooth) {
          const apexN = [
            (radNorms[i][0] + radNorms[ni][0]) * 0.5,
            Math.max(0.25, (radNorms[i][1] + radNorms[ni][1]) * 0.5),
            (radNorms[i][2] + radNorms[ni][2]) * 0.5,
          ];
          const al = Math.hypot(apexN[0], apexN[1], apexN[2]) || 1;
          apexN[0] /= al; apexN[1] /= al; apexN[2] /= al;
          this.triSmooth(ringBot[ni], ringBot[i], [cx, y0 + height, cz], radNorms[ni], radNorms[i], apexN, hexColor, aoBot, aoBot, aoTop, em, matId);
        } else {
          this.tri(ringBot[ni], ringBot[i], [cx, y0 + height, cz], hexColor, aoBot, aoBot, aoTop, em, matId);
        }
      }
    }

    if (rTop > 1e-4 && !opts.openTop) {
      const topCenter = [cx, y0 + height, cz];
      const topHex = opts.topHex || hexColor;
      for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        this.tri(topCenter, ringTop[ni], ringTop[i], topHex, aoTop, aoTop, aoTop, em, matId);
      }
    }
    if (rBot > 1e-4 && opts.capBottom) {
      const botCenter = [cx, y0, cz];
      for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        this.tri(botCenter, ringBot[i], ringBot[ni], hexColor, aoBot * 0.9, aoBot * 0.9, aoBot * 0.9, em, matId);
      }
    }
  }

  cylinderAxis(cx, cy, cz, r0, r1, length, sides, axis, hexColor, opts = {}) {
    const em = Boolean(opts.emissive);
    const smooth = opts.smooth !== undefined ? opts.smooth : (sides >= 10);
    const matId = opts.matId !== undefined ? opts.matId : VMAT.TIMBER;
    const hl = length * 0.5;
    const ringA = [];
    const ringB = [];
    const norms = [];
    const slope = (r0 - r1) / Math.max(1e-4, length);

    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + (opts.phase || 0);
      const u = Math.cos(a);
      const v = Math.sin(a);
      if (axis === 'x') {
        ringA.push([cx - hl, cy + v * r0, cz + u * r0]);
        ringB.push([cx + hl, cy + v * r1, cz + u * r1]);
        const nl = Math.hypot(slope, v, u) || 1;
        norms.push([slope / nl, v / nl, u / nl]);
      } else {
        ringA.push([cx + u * r0, cy + v * r0, cz - hl]);
        ringB.push([cx + u * r1, cy + v * r1, cz + hl]);
        const nl = Math.hypot(u, v, slope) || 1;
        norms.push([u / nl, v / nl, slope / nl]);
      }
    }
    for (let i = 0; i < sides; i++) {
      const ni = (i + 1) % sides;
      if (smooth) {
        this.triSmooth(ringA[i], ringA[ni], ringB[ni], norms[i], norms[ni], norms[ni], hexColor, 0.92, 0.92, 1.0, em, matId);
        this.triSmooth(ringA[i], ringB[ni], ringB[i], norms[i], norms[ni], norms[i], hexColor, 0.92, 1.0, 1.0, em, matId);
      } else if (axis === 'x') {
        this.quad(ringA[ni], ringA[i], ringB[i], ringB[ni], hexColor, 0.92, 0.92, 1.0, 1.0, em, matId);
      } else {
        this.quad(ringA[i], ringA[ni], ringB[ni], ringB[i], hexColor, 0.92, 0.92, 1.0, 1.0, em, matId);
      }
    }
    if (!opts.openEnds) {
      const cA = axis === 'x' ? [cx - hl, cy, cz] : [cx, cy, cz - hl];
      const cB = axis === 'x' ? [cx + hl, cy, cz] : [cx, cy, cz + hl];
      const endHex = opts.endHex || hexColor;
      for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        if (axis === 'x') {
          this.tri(cA, ringA[i], ringA[ni], endHex, 0.95, 0.95, 0.95, em, matId);
          this.tri(cB, ringB[ni], ringB[i], endHex, 0.98, 0.98, 0.98, em, matId);
        } else {
          this.tri(cA, ringA[ni], ringA[i], endHex, 0.95, 0.95, 0.95, em, matId);
          this.tri(cB, ringB[i], ringB[ni], endHex, 0.98, 0.98, 0.98, em, matId);
        }
      }
    }
  }

  /**
   * Smooth Revolved Lathe Mesh (`profile`: array of `[radius, heightOffset]` from bottom to top)
   * Ideal for Ming iron helmets, woven Douli hats, ceramic wine/oil jars, bronze cauldrons & balusters!
   */
  latheY(cx, y0, cz, profile, sides = 14, hexColor = 0xffffff, opts = {}) {
    const matId = opts.matId !== undefined ? opts.matId : VMAT.METAL;
    const em = Boolean(opts.emissive);
    const sx = opts.scaleX || 1.0;
    const sz = opts.scaleZ || 1.0;
    for (let p = 0; p < profile.length - 1; p++) {
      const [r0, h0] = profile[p];
      const [r1, h1] = profile[p + 1];
      const segH = h1 - h0;
      if (Math.abs(segH) < 1e-4 && Math.abs(r1 - r0) > 1e-4) {
        // Horizontal annular lip/step
        for (let i = 0; i < sides; i++) {
          const a0 = (i / sides) * Math.PI * 2;
          const a1 = ((i + 1) / sides) * Math.PI * 2;
          const p00 = [cx + Math.cos(a0) * r0 * sx, y0 + h0, cz + Math.sin(a0) * r0 * sz];
          const p10 = [cx + Math.cos(a1) * r0 * sx, y0 + h0, cz + Math.sin(a1) * r0 * sz];
          const p11 = [cx + Math.cos(a1) * r1 * sx, y0 + h1, cz + Math.sin(a1) * r1 * sz];
          const p01 = [cx + Math.cos(a0) * r1 * sx, y0 + h1, cz + Math.sin(a0) * r1 * sz];
          if (r1 < r0) this.quad(p00, p01, p11, p10, hexColor, 0.96, 1.0, 1.0, 0.96, em, matId);
          else this.quad(p00, p10, p11, p01, hexColor, 0.85, 0.85, 0.90, 0.90, em, matId);
        }
        continue;
      }
      const col = Array.isArray(opts.bandColors) && opts.bandColors[p] !== undefined ? opts.bandColors[p] : hexColor;
      this.prismY(cx, y0 + h0, cz, r0, r1, segH, sides, col, {
        smooth: opts.smooth !== undefined ? opts.smooth : true,
        openTop: p < profile.length - 2 || Boolean(opts.openTop),
        capBottom: p === 0 && Boolean(opts.capBottom),
        scaleX: sx,
        scaleZ: sz,
        matId,
        emissive: em,
      });
    }
  }

  /**
   * High-Detail Smooth / Organic Ellipsoid (`uSegs × vSegs`, e.g. 12×8 = 192 tris!)
   * Used for lush layered tree foliage, guardian lions, geological boulders, heads & warhorse anatomy!
   */
  ellipsoid(cx, cy, cz, rx, ry, rz, hexColor, opts = {}) {
    const uSegs = opts.uSegs || 12;
    const vSegs = opts.vSegs || 8;
    const seed = opts.seed || 1;
    const jitter = opts.jitter || 0.0;
    const smooth = opts.smooth !== undefined ? opts.smooth : (jitter < 0.12);
    const matId = opts.matId !== undefined ? opts.matId : VMAT.LEAVES;

    const gridP = [];
    const gridN = [];
    for (let iv = 0; iv <= vSegs; iv++) {
      const v = iv / vSegs;
      const phi = v * Math.PI;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const rowP = [];
      const rowN = [];
      for (let iu = 0; iu < uSegs; iu++) {
        const theta = (iu / uSegs) * Math.PI * 2;
        const ux = Math.cos(theta) * sinP;
        const uy = cosP;
        const uz = Math.sin(theta) * sinP;
        const j = (iv === 0 || iv === vSegs || jitter <= 0)
          ? 1.0
          : (1.0 + (voxelHash(iu, iv, seed, 73) - 0.5) * 2.0 * jitter);
        rowP.push([cx + ux * rx * j, cy + uy * ry * j, cz + uz * rz * j]);
        const nx = ux / Math.max(0.02, rx);
        const ny = uy / Math.max(0.02, ry);
        const nz = uz / Math.max(0.02, rz);
        const nl = Math.hypot(nx, ny, nz) || 1;
        rowN.push([nx / nl, ny / nl, nz / nl]);
      }
      gridP.push(rowP);
      gridN.push(rowN);
    }

    for (let iv = 0; iv < vSegs; iv++) {
      const s0 = 0.84 + (1 - iv / vSegs) * 0.20;
      const s1 = 0.84 + (1 - (iv + 1) / vSegs) * 0.20;
      for (let iu = 0; iu < uSegs; iu++) {
        const niu = (iu + 1) % uSegs;
        const p00 = gridP[iv][iu], p10 = gridP[iv][niu];
        const p01 = gridP[iv + 1][iu], p11 = gridP[iv + 1][niu];
        const n00 = gridN[iv][iu], n10 = gridN[iv][niu];
        const n01 = gridN[iv + 1][iu], n11 = gridN[iv + 1][niu];
        const col = jitter > 0.05 && ((iu + iv) % 3 === 0) ? tintHex(hexColor, 0.035) : hexColor;

        if (iv === 0) {
          if (smooth) this.triSmooth(p00, p11, p01, n00, n11, n01, col, s0, s1, s1, false, matId);
          else this.tri(p00, p11, p01, col, s0, s1, s1, false, matId);
        } else if (iv === vSegs - 1) {
          if (smooth) this.triSmooth(p00, p10, p01, n00, n10, n01, col, s0, s0, s1, false, matId);
          else this.tri(p00, p10, p01, col, s0, s0, s1, false, matId);
        } else if (smooth) {
          this.triSmooth(p00, p10, p11, n00, n10, n11, col, s0, s0, s1, false, matId);
          this.triSmooth(p00, p11, p01, n00, n11, n01, col, s0, s1, s1, false, matId);
        } else {
          this.quad(p00, p10, p11, p01, col, s0, s0, s1, s1, false, matId);
        }
      }
    }
  }

  facetedBlob(cx, cy, cz, rx, ry, rz, hexColor, seed = 1, jitter = 0.14, matId = VMAT.LEAVES) {
    this.ellipsoid(cx, cy, cz, rx, ry, rz, hexColor, {
      uSegs: 11,
      vSegs: 7,
      seed,
      jitter,
      smooth: jitter < 0.15,
      matId,
    });
  }

  /**
   * True Spoked Ming Wooden Wheel with Iron Rim & Bronze Hub (for Siege Artillery & Buffalo Carts!)
   */
  spokedWheel(cx, cy, cz, radius = 0.18, width = 0.05, spokes = 10, tireHex = 0x3b424c, woodHex = 0x6b472b, hubHex = 0x8f6b32) {
    const rOuter = radius;
    const rInner = radius * 0.78;
    const hw = width * 0.5;

    // 1. Hollow Iron Tire + Wooden Felloe Ring (`spokes` segments around X axis)
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * Math.PI * 2;
      const a1 = ((i + 1) / spokes) * Math.PI * 2;
      const yO0 = cy + Math.sin(a0) * rOuter, zO0 = cz + Math.cos(a0) * rOuter;
      const yO1 = cy + Math.sin(a1) * rOuter, zO1 = cz + Math.cos(a1) * rOuter;
      const yI0 = cy + Math.sin(a0) * rInner, zI0 = cz + Math.cos(a0) * rInner;
      const yI1 = cy + Math.sin(a1) * rInner, zI1 = cz + Math.cos(a1) * rInner;

      // Outer iron tread
      this.quad([cx - hw, yO1, zO1], [cx - hw, yO0, zO0], [cx + hw, yO0, zO0], [cx + hw, yO1, zO1], tireHex, 0.94, 0.94, 1.0, 1.0, false, VMAT.METAL);
      // Inner wooden rim face
      this.quad([cx - hw * 0.85, yI0, zI0], [cx - hw * 0.85, yI1, zI1], [cx + hw * 0.85, yI1, zI1], [cx + hw * 0.85, yI0, zI0], woodHex, 0.84, 0.84, 0.9, 0.9, false, VMAT.TIMBER);
      // Left (-X) & Right (+X) wooden wheel cheeks
      this.quad([cx - hw, yI0, zI0], [cx - hw, yO0, zO0], [cx - hw, yO1, zO1], [cx - hw, yI1, zI1], woodHex, 0.92, 0.96, 0.96, 0.92, false, VMAT.TIMBER);
      this.quad([cx + hw, yI1, zI1], [cx + hw, yO1, zO1], [cx + hw, yO0, zO0], [cx + hw, yI0, zI0], woodHex, 0.92, 0.96, 0.96, 0.92, false, VMAT.TIMBER);

      // Radial wooden spoke!
      const aMid = (a0 + a1) * 0.5;
      const sy = cy + Math.sin(aMid) * (rInner * 0.52);
      const sz = cz + Math.cos(aMid) * (rInner * 0.52);
      this.box(cx, sy, sz, width * 0.42, rInner * 0.96, 0.022, woodHex, { rotX: -aMid, matId: VMAT.TIMBER });
    }
    // 2. Protruding Wooden Hub & Iron Linchpin Cap
    this.cylinderAxis(cx, cy, cz, radius * 0.24, radius * 0.24, width * 1.55, 10, 'x', hubHex, { matId: VMAT.METAL });
  }

  /**
   * 3D Recessed Ming Lattice Window (`直棂方格花窗`, directly matching the reference screenshot!)
   * `face`: `'z+'` | `'z-'` | `'x+'` | `'x-'`
   */
  latticeWindow(cx, cy, cz, w, h, face = 'z+', frameHex = 0x4a3321, paperHex = 0xe8c98e, lit = false) {
    const isZ = face === 'z+' || face === 'z-';
    const sgn = (face === 'z+' || face === 'x+') ? 1 : -1;
    const thick = 0.045;
    // Window backing paper/shutter
    if (isZ) {
      this.box(cx, cy, cz, w, h, 0.022, paperHex, { emissive: lit, matId: VMAT.PLASTER });
      // Top/bottom sill & side jambs
      this.box(cx, cy + h * 0.5, cz + sgn * 0.015, w + 0.05, 0.032, thick, frameHex, { matId: VMAT.TIMBER });
      this.box(cx, cy - h * 0.5, cz + sgn * 0.018, w + 0.06, 0.036, thick + 0.015, frameHex, { matId: VMAT.TIMBER });
      this.box(cx - w * 0.5, cy, cz + sgn * 0.015, 0.032, h, thick, frameHex, { matId: VMAT.TIMBER });
      this.box(cx + w * 0.5, cy, cz + sgn * 0.015, 0.032, h, thick, frameHex, { matId: VMAT.TIMBER });
      // Mullion grid bars (`木棂条`)
      const cols = Math.max(2, Math.round(w / 0.08));
      for (let i = 1; i < cols; i++) {
        const mx = cx - w * 0.5 + (i / cols) * w;
        this.box(mx, cy, cz + sgn * 0.015, 0.014, h, 0.025, frameHex, { matId: VMAT.TIMBER });
      }
      this.box(cx, cy, cz + sgn * 0.015, w, 0.015, 0.025, frameHex, { matId: VMAT.TIMBER });
    } else {
      this.box(cx, cy, cz, 0.022, h, w, paperHex, { emissive: lit, matId: VMAT.PLASTER });
      this.box(cx + sgn * 0.015, cy + h * 0.5, cz, thick, 0.032, w + 0.05, frameHex, { matId: VMAT.TIMBER });
      this.box(cx + sgn * 0.018, cy - h * 0.5, cz, thick + 0.015, 0.036, w + 0.06, frameHex, { matId: VMAT.TIMBER });
      this.box(cx + sgn * 0.015, cy, cz - w * 0.5, thick, h, 0.032, frameHex, { matId: VMAT.TIMBER });
      this.box(cx + sgn * 0.015, cy, cz + w * 0.5, thick, h, 0.032, frameHex, { matId: VMAT.TIMBER });
      const cols = Math.max(2, Math.round(w / 0.08));
      for (let i = 1; i < cols; i++) {
        const mz = cz - w * 0.5 + (i / cols) * w;
        this.box(cx + sgn * 0.015, cy, mz, 0.025, h, 0.014, frameHex, { matId: VMAT.TIMBER });
      }
      this.box(cx + sgn * 0.015, cy, cz, 0.025, 0.015, w, frameHex, { matId: VMAT.TIMBER });
    }
  }

  /**
   * Woven Hemp Cloth Workshop / Street Awning (`明代市井布幌凉棚`, matching reference stalls!)
   */
  clothAwning(cx, yTop, zAttach, widthX, dropY, projectZ, dirZ = 1, clothHex = 0xdcd0b8, poleHex = 0x5c3f28) {
    const segs = 4;
    const hw = widthX * 0.5;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const z0 = zAttach + dirZ * projectZ * t0;
      const z1 = zAttach + dirZ * projectZ * t1;
      // Natural catenary cloth sag
      const y0 = yTop - dropY * t0 - Math.sin(t0 * Math.PI) * 0.035;
      const y1 = yTop - dropY * t1 - Math.sin(t1 * Math.PI) * 0.035;
      const col = i % 2 === 0 ? clothHex : tintHex(clothHex, -0.04);
      if (dirZ > 0) {
        this.quad([cx - hw, y1, z1], [cx + hw, y1, z1], [cx + hw, y0, z0], [cx - hw, y0, z0], col, 0.96, 0.96, 1.02, 1.02, false, VMAT.PLASTER);
        this.quad([cx + hw, y1 - 0.012, z1], [cx - hw, y1 - 0.012, z1], [cx - hw, y0 - 0.012, z0], [cx + hw, y0 - 0.012, z0], col, 0.80, 0.80, 0.84, 0.84, false, VMAT.PLASTER);
      } else {
        this.quad([cx + hw, y1, z1], [cx - hw, y1, z1], [cx - hw, y0, z0], [cx + hw, y0, z0], col, 0.96, 0.96, 1.02, 1.02, false, VMAT.PLASTER);
        this.quad([cx - hw, y1 - 0.012, z1], [cx + hw, y1 - 0.012, z1], [cx + hw, y0 - 0.012, z0], [cx - hw, y0 - 0.012, z0], col, 0.80, 0.80, 0.84, 0.84, false, VMAT.PLASTER);
      }
    }
    const zEnd = zAttach + dirZ * projectZ;
    const yEnd = yTop - dropY;
    this.cylinderAxis(cx, yEnd, zEnd, 0.018, 0.018, widthX + 0.04, 8, 'x', poleHex, { matId: VMAT.TIMBER });
    for (const sx of [-hw + 0.03, hw - 0.03]) {
      this.prismY(cx + sx, 0.02, zEnd, 0.018, 0.016, Math.max(0.15, yEnd - 0.02), 8, poleHex, { matId: VMAT.TIMBER });
    }
  }

  /**
   * High-Detail Ming-Chinese Ribbed Clay-Tile Roof (`精雕筒瓦瓦垄歇山/悬山/攒尖顶`)
   * Includes curved `举折` roof deck, individual 3D `筒瓦` cylindrical tile ribs + round `瓦当` drip-caps,
   * exposed wooden eave rafters (`飞椽`), brick `正脊/垂脊` ridges, bargeboards (`博风板`), and `鸱吻` finials!
   */
  chineseRoof(cx, yBase, cz, spanX, spanZ, riseY, tileHex = 0x3b4048, ridgeHex = 0x525862, opts = {}) {
    const style = opts.style || 'hip';
    const cornerLift = opts.cornerLift !== undefined ? opts.cornerLift : riseY * 0.22;
    const soffitHex = opts.soffitHex || 0x452d1e;
    const finialHex = opts.finialHex || 0xc89d46;
    const ribTileHex = tintHex(tileHex, 0.07);

    if (style === 'pavilion') {
      const sides = opts.sides || 4;
      const rad = Math.max(spanX, spanZ) * 0.56;
      const rings = 5;
      const grid = [];
      for (let r = 0; r <= rings; r++) {
        const v = r / rings;
        const curR = rad * Math.pow(v, 0.94) * (1 + (v > 0.66 ? (v - 0.66) * 0.20 : 0));
        const curY = yBase + riseY * Math.pow(1 - v, 1.28) + (v > 0.72 ? Math.pow((v - 0.72) / 0.28, 1.5) * cornerLift : 0);
        const row = [];
        for (let s = 0; s < sides; s++) {
          const ang = (s / sides) * Math.PI * 2 + Math.PI / sides;
          row.push([
            cx + Math.cos(ang) * curR * (spanX / Math.max(spanX, spanZ)),
            curY,
            cz + Math.sin(ang) * curR * (spanZ / Math.max(spanX, spanZ)),
          ]);
        }
        grid.push(row);
      }
      for (let r = 0; r < rings; r++) {
        const col = r % 2 === 0 ? tileHex : tintHex(tileHex, -0.045);
        for (let s = 0; s < sides; s++) {
          const ns = (s + 1) % sides;
          if (r === 0) {
            this.tri([cx, yBase + riseY, cz], grid[1][ns], grid[1][s], col, 1.04, 0.98, 0.98, false, VMAT.ROOF);
          } else {
            this.quad(grid[r][s], grid[r][ns], grid[r + 1][ns], grid[r + 1][s], col, 1.0, 1.0, 0.95, 0.95, false, VMAT.ROOF);
          }
        }
      }
      // Sculpted Tile Ribs & Rafters along each pavilion facet!
      const outer = grid[rings];
      const soffitCenter = [cx, yBase + 0.02, cz];
      for (let s = 0; s < sides; s++) {
        const ns = (s + 1) % sides;
        this.tri(soffitCenter, outer[s], outer[ns], soffitHex, 0.75, 0.82, 0.82, false, VMAT.TIMBER);
        // 3 intermediate tile ribs per facet
        for (let k = 1; k <= 3; k++) {
          const t = k / 4;
          const ex = outer[s][0] + (outer[ns][0] - outer[s][0]) * t;
          const ey = outer[s][1] + (outer[ns][1] - outer[s][1]) * t;
          const ez = outer[s][2] + (outer[ns][2] - outer[s][2]) * t;
          const len = Math.hypot(ex - cx, ey - (yBase + riseY), ez - cz);
          this.box(
            (cx + ex) * 0.5, (yBase + riseY + ey) * 0.5 + 0.012, (cz + ez) * 0.5,
            0.022, 0.024, len * 0.94, ribTileHex,
            {
              rotY: Math.atan2(ex - cx, ez - cz),
              rotX: Math.atan2((yBase + riseY) - ey, Math.hypot(ex - cx, ez - cz)),
              matId: VMAT.ROOF,
            }
          );
        }
        // Main corner hip ridge (`戗脊`)
        this.box(
          (cx + outer[s][0]) * 0.5, (yBase + riseY + outer[s][1]) * 0.5 + 0.022, (cz + outer[s][2]) * 0.5,
          0.042, 0.046, Math.hypot(outer[s][0] - cx, outer[s][1] - (yBase + riseY), outer[s][2] - cz),
          ridgeHex,
          {
            rotY: Math.atan2(outer[s][0] - cx, outer[s][2] - cz),
            rotX: Math.atan2((yBase + riseY) - outer[s][1], Math.hypot(outer[s][0] - cx, outer[s][2] - cz)),
            matId: VMAT.ROOF,
          }
        );
      }
      if (!opts.noFinial) {
        this.latheY(cx, yBase + riseY - 0.02, cz, [[0.08, 0], [0.06, 0.06], [0.085, 0.11], [0.03, 0.18], [0.005, 0.24]], 10, finialHex, { matId: VMAT.METAL });
      }
      return;
    }

    // Gable or Hip-and-Gable (`歇山顶` / `悬山顶`) High-Detail Ribbed Tile Roof!
    const hx = spanX * 0.5;
    const hz = spanZ * 0.5;
    const ridgeHalfX = style === 'gable' ? hx * 0.98 : Math.max(0.12, hx - hz * 0.56);
    const uSteps = 8;
    const vSteps = 5;

    const evalRoofPt = (u, v, sideSignZ) => {
      const topX = u * ridgeHalfX;
      const botX = u * hx * (1 + (Math.abs(u) > 0.65 ? Math.pow((Math.abs(u) - 0.65) / 0.35, 1.4) * 0.06 : 0));
      const x = topX + (botX - topX) * Math.pow(v, 0.92);
      const eaveFlareZ = hz * (1 + (Math.abs(u) > 0.65 && v > 0.55 ? Math.pow((Math.abs(u) - 0.65) / 0.35, 1.4) * 0.06 : 0));
      const z = sideSignZ * v * eaveFlareZ;
      const baseCurveY = riseY * Math.pow(1 - v, 1.24);
      const lift = (Math.abs(u) > 0.52 && v > 0.48)
        ? Math.pow((Math.abs(u) - 0.52) / 0.48, 1.65) * Math.pow((v - 0.48) / 0.52, 1.35) * cornerLift
        : 0;
      return [cx + x, yBase + baseCurveY + lift, cz + z];
    };

    // 1. Curved Pan-Tile (`板瓦`) Base Slopes
    for (const szSign of [1, -1]) {
      for (let iv = 0; iv < vSteps; iv++) {
        const v0 = iv / vSteps, v1 = (iv + 1) / vSteps;
        const rowCol = iv % 2 === 0 ? tileHex : tintHex(tileHex, -0.04);
        for (let iu = 0; iu < uSteps; iu++) {
          const u0 = -1 + (iu / uSteps) * 2;
          const u1 = -1 + ((iu + 1) / uSteps) * 2;
          const p00 = evalRoofPt(u0, v0, szSign);
          const p10 = evalRoofPt(u1, v0, szSign);
          const p11 = evalRoofPt(u1, v1, szSign);
          const p01 = evalRoofPt(u0, v1, szSign);
          if (szSign > 0) {
            this.quad(p01, p11, p10, p00, rowCol, 0.94, 0.94, 1.02, 1.02, false, VMAT.ROOF);
          } else {
            this.quad(p11, p01, p00, p10, rowCol, 0.94, 0.94, 1.02, 1.02, false, VMAT.ROOF);
          }
        }
      }

      // 2. Individual 3D Cylindrical Cover-Tile Ribs (`筒瓦瓦垄`) + Eave Drip-Tiles (`瓦当`) + Exposed Wooden Rafters (`飞椽`)!
      const ribCount = Math.max(6, Math.min(20, Math.round(spanX / 0.115)));
      for (let ir = 0; ir <= ribCount; ir++) {
        const u = -0.96 + (ir / ribCount) * 1.92;
        const pTop = evalRoofPt(u, 0.04, szSign);
        const pMid = evalRoofPt(u, 0.52, szSign);
        const pBot = evalRoofPt(u, 1.00, szSign);

        for (const [a, b] of [[pTop, pMid], [pMid, pBot]]) {
          const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
          const segLen = Math.hypot(dx, dy, dz);
          this.box(
            (a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5 + 0.013, (a[2] + b[2]) * 0.5,
            0.024, 0.022, segLen, ribTileHex,
            {
              rotY: Math.atan2(dx, dz),
              rotX: -Math.atan2(dy, Math.hypot(dx, dz)),
              matId: VMAT.ROOF,
            }
          );
        }
        // Round Eave Wadang (`瓦当`) cap & Exposed Cedar Rafter (`椽头`) under eave!
        this.box(pBot[0], pBot[1] + 0.005, pBot[2], 0.030, 0.030, 0.025, ridgeHex, { matId: VMAT.ROOF });
        if (ir % 2 === 0) {
          this.box(pBot[0], pBot[1] - 0.022, pBot[2] - szSign * 0.04, 0.024, 0.024, 0.10, soffitHex, { matId: VMAT.TIMBER });
        }
      }
    }

    // 3. Left (-X) and Right (+X) Gables / Hipped Xieshan Skirts & Timber Bargeboards (`博风板`)!
    const gableFillHex = opts.gableWallHex || 0xdcd0bc;
    for (const sxSign of [-1, 1]) {
      const uEdge = sxSign;
      const frontEave = evalRoofPt(uEdge, 1, 1);
      const backEave = evalRoofPt(uEdge, 1, -1);
      if (style === 'hip') {
        const midF = evalRoofPt(uEdge, 0.52, 1);
        const midB = evalRoofPt(uEdge, 0.52, -1);
        const innerApex = [cx + sxSign * ridgeHalfX, yBase + riseY, cz];
        if (sxSign > 0) {
          this.tri(innerApex, midF, midB, soffitHex, 0.96, 0.90, 0.90, false, VMAT.TIMBER);
          this.quad(frontEave, backEave, midB, midF, tintHex(tileHex, -0.02), 0.93, 0.93, 1.0, 1.0, false, VMAT.ROOF);
        } else {
          this.tri(innerApex, midB, midF, soffitHex, 0.96, 0.90, 0.90, false, VMAT.TIMBER);
          this.quad(backEave, frontEave, midF, midB, tintHex(tileHex, -0.02), 0.93, 0.93, 1.0, 1.0, false, VMAT.ROOF);
        }
        // 4 Raised Hip Diagonal Ridges (`垂脊/戗脊`)!
        for (const ePt of [frontEave, backEave]) {
          const dx = ePt[0] - innerApex[0], dy = ePt[1] - innerApex[1], dz = ePt[2] - innerApex[2];
          this.box(
            (innerApex[0] + ePt[0]) * 0.5, (innerApex[1] + ePt[1]) * 0.5 + 0.022, (innerApex[2] + ePt[2]) * 0.5,
            0.038, 0.042, Math.hypot(dx, dy, dz), ridgeHex,
            { rotY: Math.atan2(dx, dz), rotX: -Math.atan2(dy, Math.hypot(dx, dz)), matId: VMAT.ROOF }
          );
        }
      } else {
        const gX = cx + sxSign * (hx * 0.88);
        const gApex = [gX, yBase + riseY * 0.97, cz];
        const gF = [gX, yBase, cz + hz * 0.88];
        const gB = [gX, yBase, cz - hz * 0.88];
        if (sxSign > 0) this.tri(gF, gB, gApex, gableFillHex, 0.92, 0.92, 1.0, false, VMAT.PLASTER);
        else this.tri(gB, gF, gApex, gableFillHex, 0.92, 0.92, 1.0, false, VMAT.PLASTER);
        // Sloped Wooden Bargeboards (`悬山博风板`) along gable edges!
        for (const ePt of [frontEave, backEave]) {
          const topP = [cx + sxSign * ridgeHalfX, yBase + riseY, cz];
          const dx = ePt[0] - topP[0], dy = ePt[1] - topP[1], dz = ePt[2] - topP[2];
          this.box(
            (topP[0] + ePt[0]) * 0.5, (topP[1] + ePt[1]) * 0.5 - 0.01, (topP[2] + ePt[2]) * 0.5,
            0.032, 0.048, Math.hypot(dx, dy, dz), soffitHex,
            { rotY: Math.atan2(dx, dz), rotX: -Math.atan2(dy, Math.hypot(dx, dz)), matId: VMAT.TIMBER }
          );
        }
      }
      if (sxSign > 0) this.tri([cx, yBase + 0.02, cz], backEave, frontEave, soffitHex, 0.74, 0.80, 0.80, false, VMAT.TIMBER);
      else this.tri([cx, yBase + 0.02, cz], frontEave, backEave, soffitHex, 0.74, 0.80, 0.80, false, VMAT.TIMBER);
    }

    const cFL = evalRoofPt(-1, 1, 1), cFR = evalRoofPt(1, 1, 1);
    const cBL = evalRoofPt(-1, 1, -1), cBR = evalRoofPt(1, 1, -1);
    this.tri([cx, yBase + 0.02, cz], cFL, cFR, soffitHex, 0.74, 0.80, 0.80, false, VMAT.TIMBER);
    this.tri([cx, yBase + 0.02, cz], cBR, cBL, soffitHex, 0.74, 0.80, 0.80, false, VMAT.TIMBER);

    // 4. Stepped Brick Main Ridge (`正脊`) + Chi-Wen (`鸱吻`) Upturned Dragon-Tail Finials!
    const rLen = ridgeHalfX * 2 + 0.06;
    this.boxY(cx, yBase + riseY - 0.02, cz, rLen, 0.065, 0.075, ridgeHex, { matId: VMAT.ROOF });
    this.boxY(cx, yBase + riseY + 0.045, cz, rLen + 0.04, 0.032, 0.09, tintHex(ridgeHex, 0.08), { matId: VMAT.ROOF });
    if (!opts.noFinial) {
      this.boxY(cx - ridgeHalfX - 0.02, yBase + riseY + 0.04, cz, 0.065, 0.13, 0.065, finialHex, { topScaleX: 0.45, rotZ: 0.24, matId: VMAT.METAL });
      this.boxY(cx + ridgeHalfX + 0.02, yBase + riseY + 0.04, cz, 0.065, 0.13, 0.065, finialHex, { topScaleX: 0.45, rotZ: -0.24, matId: VMAT.METAL });
    }
  }

  maTouQiang(xPos, yBase, cz, depthZ, baseWallH, ridgeH, steps = 3, wallHex = 0xdcd0bc, capHex = 0x383e47) {
    const thick = 0.09;
    const halfZ = depthZ * 0.5;
    for (let s = 0; s < steps; s++) {
      const frac0 = s / steps;
      const frac1 = (s + 1) / steps;
      const zSpan = halfZ * (1 - frac0 * 0.66);
      const stepTopY = yBase + baseWallH + (ridgeH - baseWallH) * frac1 + 0.08;
      this.boxY(xPos, yBase, cz, thick, stepTopY - yBase, zSpan * 2, wallHex, { matId: VMAT.PLASTER });
      this.boxY(xPos, stepTopY, cz, thick + 0.04, 0.045, zSpan * 2 + 0.07, capHex, { matId: VMAT.ROOF });
      this.boxY(xPos, stepTopY + 0.035, cz + zSpan + 0.015, thick + 0.03, 0.06, 0.055, capHex, { rotX: -0.30, matId: VMAT.ROOF });
      this.boxY(xPos, stepTopY + 0.035, cz - zSpan - 0.015, thick + 0.03, 0.06, 0.055, capHex, { rotX: 0.30, matId: VMAT.ROOF });
    }
  }

  /**
   * High-Detail Extruded Battered Wall with 14-Segment Radial Voussoir Stone Archway (`楔形条石拱券门洞`)
   */
  extrudedArchWallX(cx, y0, cz, thickX, totalZ, wallH, archHalfZ, archSpringY, archCrownY, stoneHex, trimHex, batter = 0.05) {
    const segs = 14;
    const hz = totalZ * 0.5;
    const hxBot = thickX * 0.5;
    const hxTop = Math.max(0.14, hxBot - batter);
    const xAtY = (y) => {
      const t = Math.max(0, Math.min(1, (y - y0) / Math.max(0.01, wallH)));
      return hxBot + (hxTop - hxBot) * t;
    };

    const pierZ = hz - archHalfZ;
    if (pierZ > 0.02) {
      for (const sgn of [-1, 1]) {
        const pCz = cz + sgn * (archHalfZ + pierZ * 0.5);
        this.boxY(cx, y0, pCz, thickX, wallH, pierZ, stoneHex, {
          topScaleX: hxTop / hxBot,
          matId: VMAT.ASHLAR,
        });
      }
    }

    const topY = y0 + wallH;
    const rise = Math.max(0.05, archCrownY - archSpringY);
    const ringThick = 0.11;

    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI;
      const a1 = ((i + 1) / segs) * Math.PI;
      const z0 = cz + Math.cos(a0) * archHalfZ;
      const yA0 = archSpringY + Math.sin(a0) * rise;
      const z1 = cz + Math.cos(a1) * archHalfZ;
      const yA1 = archSpringY + Math.sin(a1) * rise;

      const zR0 = cz + Math.cos(a0) * (archHalfZ + ringThick);
      const yR0 = archSpringY + Math.sin(a0) * (rise + ringThick);
      const zR1 = cz + Math.cos(a1) * (archHalfZ + ringThick);
      const yR1 = archSpringY + Math.sin(a1) * (rise + ringThick);

      const xb0 = xAtY(yA0), xb1 = xAtY(yA1), xt = hxTop;
      // Spandrel wall above arch
      this.quad([cx + xb0, yA0, z0], [cx + xb1, yA1, z1], [cx + xt, topY, z1], [cx + xt, topY, z0], stoneHex, 0.94, 0.94, 1.02, 1.02, false, VMAT.ASHLAR);
      this.quad([cx - xb1, yA1, z1], [cx - xb0, yA0, z0], [cx - xt, topY, z0], [cx - xt, topY, z1], stoneHex, 0.94, 0.94, 1.02, 1.02, false, VMAT.ASHLAR);
      this.quad([cx - xt, topY, z0], [cx + xt, topY, z0], [cx + xt, topY, z1], [cx - xt, topY, z1], stoneHex, 1.02, 1.02, 1.02, 1.02, false, VMAT.ASHLAR);
      // Dark vaulted stone intrados inside tunnel
      this.quad([cx - xb0, yA0, z0], [cx - xb1, yA1, z1], [cx + xb1, yA1, z1], [cx + xb0, yA0, z0], trimHex, 0.68, 0.72, 0.72, 0.68, false, VMAT.ASHLAR);

      // Projecting Carved Voussoir Arch Ring (`雕石券脸`) on both +X and -X portals!
      const vCol = i % 2 === 0 ? tintHex(trimHex, 0.08) : trimHex;
      const xp0 = xb0 + 0.025, xp1 = xb1 + 0.025;
      this.quad([cx + xp0, yA0, z0], [cx + xp1, yA1, z1], [cx + xp1, Math.min(topY, yR1), zR1], [cx + xp0, Math.min(topY, yR0), zR0], vCol, 0.98, 0.98, 1.03, 1.03, false, VMAT.ASHLAR);
      this.quad([cx - xp1, yA1, z1], [cx - xp0, yA0, z0], [cx - xp0, Math.min(topY, yR0), zR0], [cx - xp1, Math.min(topY, yR1), zR1], vCol, 0.98, 0.98, 1.03, 1.03, false, VMAT.ASHLAR);
    }
  }

  buildGeometry() {
    let geo = null;
    if (this.pos.length > 0) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      geo.setAttribute('aMatId', new THREE.Float32BufferAttribute(this.mat, 1));
      geo.computeBoundingSphere();
    }
    let emissiveGeo = null;
    if (this.emPos.length > 0) {
      emissiveGeo = new THREE.BufferGeometry();
      emissiveGeo.setAttribute('position', new THREE.Float32BufferAttribute(this.emPos, 3));
      emissiveGeo.setAttribute('normal', new THREE.Float32BufferAttribute(this.emNorm, 3));
      emissiveGeo.setAttribute('color', new THREE.Float32BufferAttribute(this.emCol, 3));
      emissiveGeo.computeBoundingSphere();
    }
    return { geo, emissiveGeo, voxelCount: this.triCount };
  }

  buildMeshGroup(castShadow = true, receiveShadow = true) {
    const { geo, emissiveGeo, voxelCount } = this.buildGeometry();
    const group = new THREE.Group();
    if (geo) {
      const main = new THREE.Mesh(geo, getSharedVoxelMaterial());
      main.castShadow = castShadow;
      main.receiveShadow = receiveShadow;
      group.add(main);
      group.userData.mainMesh = main;
    }
    if (emissiveGeo) {
      const em = new THREE.Mesh(emissiveGeo, getSharedEmissiveMaterial());
      em.userData.noOutline = true;
      group.add(em);
    }
    group.userData.voxelCount = voxelCount;
    return group;
  }
}

export class VoxelGrid {
  constructor(sx = 8, sy = 8, sz = 8) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.cells = new Map();
  }
  set(x, y, z, hexColor, jitter = 0, emissive = false) {
    if (x < 0 || x >= this.sx || y < 0 || y >= this.sy || z < 0 || z >= this.sz) return;
    if (!hexColor && !emissive) { this.cells.delete(`${x | 0},${y | 0},${z | 0}`); return; }
    const c = jitter > 0 ? tintHex(hexColor, (voxelHash(x, y, z) - 0.5) * 2 * jitter) : hexColor;
    this.cells.set(`${x | 0},${y | 0},${z | 0}`, { x: x | 0, y: y | 0, z: z | 0, c, em: Boolean(emissive) });
  }
  clear(x, y, z) { this.cells.delete(`${x | 0},${y | 0},${z | 0}`); }
  box(x0, y0, z0, x1, y1, z1, hexColor, jitter = 0.02, emissive = false) {
    for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(this.sy - 1, Math.max(y0, y1)); y++) {
      for (let z = Math.max(0, Math.min(z0, z1)); z <= Math.min(this.sz - 1, Math.max(z0, z1)); z++) {
        for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(this.sx - 1, Math.max(x0, x1)); x++) {
          this.set(x, y, z, hexColor, jitter, emissive);
        }
      }
    }
  }
  countSolidVoxels() { return this.cells.size; }
  buildGeometry(unit = 0.1, originOffset = { x: -0.5, y: 0, z: -0.5 }, splitEmissive = false) {
    const pb = new PolyBuilder();
    const ox = (originOffset.x || 0) * this.sx * unit;
    const oy = (originOffset.y || 0) * this.sy * unit;
    const oz = (originOffset.z || 0) * this.sz * unit;
    this.cells.forEach(({ x, y, z, c, em }) => {
      pb.box(ox + (x + 0.5) * unit, oy + (y + 0.5) * unit, oz + (z + 0.5) * unit, unit, unit, unit, c, { emissive: splitEmissive && em });
    });
    const built = pb.buildGeometry();
    return splitEmissive ? built : (built.geo || new THREE.BufferGeometry());
  }
  buildMeshGroup(unit = 0.1, originOffset = { x: -0.5, y: 0, z: -0.5 }, castShadow = true, receiveShadow = true) {
    const res = this.buildGeometry(unit, originOffset, true);
    const group = new THREE.Group();
    if (res.geo) {
      const m = new THREE.Mesh(res.geo, getSharedVoxelMaterial());
      m.castShadow = castShadow;
      m.receiveShadow = receiveShadow;
      group.add(m);
      group.userData.mainMesh = m;
    }
    group.userData.voxelCount = res.voxelCount;
    return group;
  }
}
