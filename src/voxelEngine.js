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
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

const _tmpCol = new THREE.Color();
function hexToLinearRGB(hex, scale = 1.0) {
  _tmpCol.setHex(hex);
  return [_tmpCol.r * scale, _tmpCol.g * scale, _tmpCol.b * scale];
}

/**
 * Shared Stylized Low-Poly Material (Flat-Shaded Facets + Vertex AO + Drifting Cloud Sunlight Dapple)
 * Zero voxel grid lines — pure crisp polygonal facets in the style of Thronefall / Bad North!
 */
export function getSharedVoxelMaterial() {
  if (!sharedLowPolyMat) {
    sharedLowPolyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.78,
      metalness: 0.05,
    });
    sharedLowPolyMat.customProgramCacheKey = () => 'yongchang-lowpoly-faceted-v1';
    sharedLowPolyMat.onBeforeCompile = (shader) => {
      shader.uniforms.uDioramaTime = voxelShaderTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLpWorldPos;\nvarying vec3 vLpWorldNorm;')
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vec4 lpw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            lpw = instanceMatrix * lpw;
          #endif
          lpw = modelMatrix * lpw;
          vLpWorldPos = lpw.xyz;
          vLpWorldNorm = normalize(mat3(modelMatrix) * objectNormal);`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uDioramaTime;
          varying vec3 vLpWorldPos;
          varying vec3 vLpWorldNorm;
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
            float m1 = lpNoise2(vLpWorldPos.xz * 0.13);
            float m2 = lpNoise2(vLpWorldPos.xz * 0.39 + vec2(5.7, 2.9));
            float macro = (m1 * 0.65 + m2 * 0.35) - 0.5;
            float upMask = clamp(vLpWorldNorm.y, 0.0, 1.0);
            diffuseColor.rgb *= vec3(
              1.0 + macro * (0.10 * upMask + 0.03),
              1.0 + macro * (0.07 * upMask + 0.03),
              1.0 - macro * (0.06 * upMask)
            );
            float cloudPatch = lpNoise2(vLpWorldPos.xz * 0.052 + vec2(uDioramaTime * 0.030, -uDioramaTime * 0.017));
            float sunDapple = mix(0.92, 1.07, smoothstep(0.32, 0.72, cloudPatch));
            diffuseColor.rgb *= mix(1.0, sunDapple, upMask * 0.85);
          }`
        );
    };
  }
  return sharedLowPolyMat;
}

export function getSharedEmissiveMaterial() {
  if (!sharedEmissiveMat) {
    // Selective HDR glow (>1.72 bloom threshold) for red lanterns, beacon braziers, forge coals & LingShu AI scan!
    sharedEmissiveMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.28, 2.08, 1.78),
      vertexColors: true,
    });
  }
  return sharedEmissiveMat;
}

/**
 * Procedural Stylized Low-Poly Builder (`PolyBuilder`)
 * Supports battered trapezoidal walls, swept Chinese upturned-eave roofs (飞檐翘角歇山/攒尖顶),
 * Jiangnan horse-head gables (马头墙), polygonal stone archways (石拱券门洞), faceted boulders & characters!
 */
export class PolyBuilder {
  constructor() {
    this.pos = [];
    this.norm = [];
    this.col = [];

    this.emPos = [];
    this.emNorm = [];
    this.emCol = [];

    this.triCount = 0;
  }

  tri(p0, p1, p2, hexColor, s0 = 1.0, s1 = 1.0, s2 = 1.0, emissive = false) {
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

    // Subtle directional facet crispness + baked ambient occlusion
    const dirShade = emissive ? 1.0 : (0.94 + ny * 0.06 + nx * 0.025 - nz * 0.015);
    const c0 = hexToLinearRGB(hexColor, s0 * dirShade);
    const c1 = hexToLinearRGB(hexColor, s1 * dirShade);
    const c2 = hexToLinearRGB(hexColor, s2 * dirShade);

    pArr.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    nArr.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    cArr.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
    this.triCount++;
  }

  // CCW quad (p0 -> p1 -> p2 -> p3 viewed from outside)
  quad(p0, p1, p2, p3, hexColor, s0 = 1, s1 = 1, s2 = 1, s3 = 1, emissive = false) {
    this.tri(p0, p1, p2, hexColor, s0, s1, s2, emissive);
    this.tri(p0, p2, p3, hexColor, s0, s2, s3, emissive);
  }

  /**
   * Tapered / Rotated Box or Battered Trapezoid (`opts`: topScaleX, topScaleZ, rotX, rotY, rotZ, aoBot, aoTop, emissive)
   * Note: `cy` is the BOTTOM Y (`y0`) if `opts.anchorBottom` is true, else CENTER Y (`cy`)!
   * Default: `cy` is CENTER Y unless `boxY` is called!
   */
  box(cx, cy, cz, sx, sy, sz, hexColor, opts = {}) {
    const tsx = opts.topScaleX !== undefined ? opts.topScaleX : 1.0;
    const tsz = opts.topScaleZ !== undefined ? opts.topScaleZ : 1.0;
    const aoBot = opts.aoBot !== undefined ? opts.aoBot : 0.86;
    const aoTop = opts.aoTop !== undefined ? opts.aoTop : 1.03;
    const em = Boolean(opts.emissive);

    const hx0 = sx * 0.5, hz0 = sz * 0.5;
    const hx1 = sx * 0.5 * tsx, hz1 = sz * 0.5 * tsz;
    const hy = sy * 0.5;

    const verts = [
      [-hx0, -hy, -hz0], [hx0, -hy, -hz0], [hx0, -hy, hz0], [-hx0, -hy, hz0],
      [-hx1, hy, -hz1],  [hx1, hy, -hz1],  [hx1, hy, hz1],  [-hx1, hy, hz1],
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
    // +Z front, -Z back, +X right, -X left, +Y top, -Y bottom
    this.quad(b3, b2, t2, t3, hexColor, aoBot, aoBot, aoTop, aoTop, em);
    this.quad(b1, b0, t0, t1, hexColor, aoBot, aoBot, aoTop, aoTop, em);
    this.quad(b2, b1, t1, t2, hexColor, aoBot, aoBot, aoTop, aoTop, em);
    this.quad(b0, b3, t3, t0, hexColor, aoBot, aoBot, aoTop, aoTop, em);
    this.quad(t3, t2, t1, t0, hexColor, aoTop, aoTop, aoTop, aoTop, em);
    if (!opts.skipBottom) {
      this.quad(b0, b1, b2, b3, hexColor, aoBot * 0.9, aoBot * 0.9, aoBot * 0.9, aoBot * 0.9, em);
    }
  }

  // Convenience box seated with bottom at `y0`!
  boxY(cx, y0, cz, sx, sy, sz, hexColor, opts = {}) {
    this.box(cx, y0 + sy * 0.5, cz, sx, sy, sz, hexColor, opts);
  }

  // Faceted prism / cylinder / cone seated at bottom `y0` (great for columns, bamboo, hats, towers, cannons!)
  prismY(cx, y0, cz, rBot, rTop, height, sides, hexColor, opts = {}) {
    const yawOff = opts.yawOffset || 0;
    const aoBot = opts.aoBot !== undefined ? opts.aoBot : 0.86;
    const aoTop = opts.aoTop !== undefined ? opts.aoTop : 1.03;
    const em = Boolean(opts.emissive);
    const sxScale = opts.scaleX || 1.0;
    const szScale = opts.scaleZ || 1.0;

    const ringBot = [];
    const ringTop = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + yawOff;
      const ca = Math.cos(a) * sxScale;
      const sa = Math.sin(a) * szScale;
      ringBot.push([cx + ca * rBot, y0, cz + sa * rBot]);
      ringTop.push([cx + ca * rTop, y0 + height, cz + sa * rTop]);
    }

    for (let i = 0; i < sides; i++) {
      const ni = (i + 1) % sides;
      if (rTop > 1e-4) {
        this.quad(ringBot[ni], ringBot[i], ringTop[i], ringTop[ni], hexColor, aoBot, aoBot, aoTop, aoTop, em);
      } else {
        this.tri(ringBot[ni], ringBot[i], [cx, y0 + height, cz], hexColor, aoBot, aoBot, aoTop, em);
      }
    }

    if (rTop > 1e-4 && !opts.openTop) {
      const topCenter = [cx, y0 + height, cz];
      for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        this.tri(topCenter, ringTop[ni], ringTop[i], hexColor, aoTop, aoTop, aoTop, em);
      }
    }
    if (rBot > 1e-4 && opts.capBottom) {
      const botCenter = [cx, y0, cz];
      for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        this.tri(botCenter, ringBot[i], ringBot[ni], hexColor, aoBot * 0.9, aoBot * 0.9, aoBot * 0.9, em);
      }
    }
  }

  // Horizontal cylinder/prism along Z or X axis (logs, barrels, cannon barrels, wheels!)
  cylinderAxis(cx, cy, cz, r0, r1, length, sides, axis, hexColor, opts = {}) {
    const em = Boolean(opts.emissive);
    const hl = length * 0.5;
    const ringA = [];
    const ringB = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + (opts.phase || 0);
      const u = Math.cos(a);
      const v = Math.sin(a);
      if (axis === 'x') {
        ringA.push([cx - hl, cy + v * r0, cz + u * r0]);
        ringB.push([cx + hl, cy + v * r1, cz + u * r1]);
      } else {
        ringA.push([cx + u * r0, cy + v * r0, cz - hl]);
        ringB.push([cx + u * r1, cy + v * r1, cz + hl]);
      }
    }
    for (let i = 0; i < sides; i++) {
      const ni = (i + 1) % sides;
      if (axis === 'x') {
        this.quad(ringA[ni], ringA[i], ringB[i], ringB[ni], hexColor, 0.92, 0.92, 1.0, 1.0, em);
      } else {
        this.quad(ringA[i], ringA[ni], ringB[ni], ringB[i], hexColor, 0.92, 0.92, 1.0, 1.0, em);
      }
    }
    const cA = axis === 'x' ? [cx - hl, cy, cz] : [cx, cy, cz - hl];
    const cB = axis === 'x' ? [cx + hl, cy, cz] : [cx, cy, cz + hl];
    const endHex = opts.endHex || hexColor;
    for (let i = 0; i < sides; i++) {
      const ni = (i + 1) % sides;
      if (axis === 'x') {
        this.tri(cA, ringA[i], ringA[ni], endHex, 0.95, 0.95, 0.95, em);
        this.tri(cB, ringB[ni], ringB[i], endHex, 0.98, 0.98, 0.98, em);
      } else {
        this.tri(cA, ringA[ni], ringA[i], endHex, 0.95, 0.95, 0.95, em);
        this.tri(cB, ringB[i], ringB[ni], endHex, 0.98, 0.98, 0.98, em);
      }
    }
  }

  /**
   * Authentic Ming-Chinese Swept Upturned-Eave Roof (`飞檐翘角坡屋顶 / 歇山顶 / 攒尖顶`)
   * - `style`: `'hip'` (歇山/庑殿四坡飞檐), `'gable'` (悬山双坡飞檐), `'pavilion'` (四角/八角攒尖飞檐塔顶)
   */
  chineseRoof(cx, yBase, cz, spanX, spanZ, riseY, tileHex = 0x2f3b4a, ridgeHex = 0x4b5868, opts = {}) {
    const style = opts.style || 'hip';
    const cornerLift = opts.cornerLift !== undefined ? opts.cornerLift : riseY * 0.28;
    const soffitHex = opts.soffitHex || 0x5c2822;
    const finialHex = opts.finialHex || 0xeab308;

    if (style === 'pavilion') {
      const sides = opts.sides || 4;
      const rad = Math.max(spanX, spanZ) * 0.56;
      const rings = 3;
      const grid = [];
      for (let r = 0; r <= rings; r++) {
        const v = r / rings; // 0 = apex, 1 = eave
        // Chinese concave ju-zhe curve + upturned flying eave tip!
        const curR = rad * Math.pow(v, 0.94) * (1 + (v > 0.66 ? (v - 0.66) * 0.22 : 0));
        const curY = yBase + riseY * Math.pow(1 - v, 1.32) + (v > 0.7 ? Math.pow((v - 0.7) / 0.3, 1.6) * cornerLift : 0);
        const row = [];
        for (let s = 0; s < sides; s++) {
          const ang = (s / sides) * Math.PI * 2 + Math.PI / sides;
          row.push([cx + Math.cos(ang) * curR * (spanX / Math.max(spanX, spanZ)), curY, cz + Math.sin(ang) * curR * (spanZ / Math.max(spanX, spanZ))]);
        }
        grid.push(row);
      }
      for (let r = 0; r < rings; r++) {
        const col = r % 2 === 0 ? tileHex : tintHex(tileHex, -0.05);
        for (let s = 0; s < sides; s++) {
          const ns = (s + 1) % sides;
          if (r === 0) {
            this.tri([cx, yBase + riseY, cz], grid[1][ns], grid[1][s], col, 1.06, 0.98, 0.98);
          } else {
            this.quad(grid[r][s], grid[r][ns], grid[r + 1][ns], grid[r + 1][s], col, 1.0, 1.0, 0.95, 0.95);
          }
        }
      }
      // Underside soffit skirt + eave fascia
      const outer = grid[rings];
      const soffitCenter = [cx, yBase + 0.02, cz];
      for (let s = 0; s < sides; s++) {
        const ns = (s + 1) % sides;
        this.tri(soffitCenter, outer[s], outer[ns], soffitHex, 0.75, 0.82, 0.82);
        // Hip ridge ribs!
        this.box(
          (cx + outer[s][0]) * 0.5,
          (yBase + riseY + outer[s][1]) * 0.5 + 0.015,
          (cz + outer[s][2]) * 0.5,
          0.045,
          0.045,
          Math.hypot(outer[s][0] - cx, outer[s][1] - (yBase + riseY), outer[s][2] - cz),
          ridgeHex,
          {
            rotY: Math.atan2(outer[s][0] - cx, outer[s][2] - cz),
            rotX: Math.atan2((yBase + riseY) - outer[s][1], Math.hypot(outer[s][0] - cx, outer[s][2] - cz)),
          }
        );
      }
      // Golden Bao-Ding (宝顶) finial at apex!
      if (!opts.noFinial) {
        this.prismY(cx, yBase + riseY - 0.02, cz, 0.075, 0.015, 0.17, 6, finialHex);
      }
      return;
    }

    // Gable or Hip-and-Gable (歇山/悬山) Swept Roof with Curved Ju-Zhe & Upturned Corners!
    const hx = spanX * 0.5;
    const hz = spanZ * 0.5;
    const ridgeHalfX = style === 'gable' ? hx * 0.98 : Math.max(0.12, hx - hz * 0.58);
    const uSteps = 4;
    const vSteps = 3;

    const evalRoofPt = (u, v, sideSignZ) => {
      // u in [-1, 1] along X; v in [0, 1] from ridge (0) to eave (1)
      const topX = u * ridgeHalfX;
      const botX = u * hx * (1 + (Math.abs(u) > 0.65 ? Math.pow((Math.abs(u) - 0.65) / 0.35, 1.4) * 0.07 : 0));
      const x = topX + (botX - topX) * Math.pow(v, 0.92);
      const eaveFlareZ = hz * (1 + (Math.abs(u) > 0.65 && v > 0.55 ? Math.pow((Math.abs(u) - 0.65) / 0.35, 1.4) * 0.07 : 0));
      const z = sideSignZ * v * eaveFlareZ;
      const baseCurveY = riseY * Math.pow(1 - v, 1.28);
      const lift = (Math.abs(u) > 0.5 && v > 0.45)
        ? Math.pow((Math.abs(u) - 0.5) / 0.5, 1.65) * Math.pow((v - 0.45) / 0.55, 1.35) * cornerLift
        : 0;
      return [cx + x, yBase + baseCurveY + lift, cz + z];
    };

    // Front (+Z) and Back (-Z) main swept slopes
    for (const szSign of [1, -1]) {
      for (let iv = 0; iv < vSteps; iv++) {
        const v0 = iv / vSteps, v1 = (iv + 1) / vSteps;
        const rowCol = iv % 2 === 0 ? tileHex : tintHex(tileHex, -0.05);
        for (let iu = 0; iu < uSteps; iu++) {
          const u0 = -1 + (iu / uSteps) * 2;
          const u1 = -1 + ((iu + 1) / uSteps) * 2;
          const p00 = evalRoofPt(u0, v0, szSign);
          const p10 = evalRoofPt(u1, v0, szSign);
          const p11 = evalRoofPt(u1, v1, szSign);
          const p01 = evalRoofPt(u0, v1, szSign);
          if (szSign > 0) {
            this.quad(p01, p11, p10, p00, rowCol, 0.94, 0.94, 1.03, 1.03);
          } else {
            this.quad(p11, p01, p00, p10, rowCol, 0.94, 0.94, 1.03, 1.03);
          }
        }
      }
    }

    // Left (-X) and Right (+X) gables / hipped Xieshan skirts!
    const gableFillHex = opts.gableWallHex || 0xf2ece0;
    for (const sxSign of [-1, 1]) {
      const uEdge = sxSign;
      const apex = evalRoofPt(uEdge, 0, 1);
      const frontEave = evalRoofPt(uEdge, 1, 1);
      const backEave = evalRoofPt(uEdge, 1, -1);
      if (style === 'hip') {
        // Sloped side hip facet + decorative upper wooden gablet triangle (歇山山花)!
        const midF = evalRoofPt(uEdge, 0.52, 1);
        const midB = evalRoofPt(uEdge, 0.52, -1);
        const innerApex = [cx + sxSign * ridgeHalfX, yBase + riseY, cz];
        if (sxSign > 0) {
          this.tri(innerApex, midF, midB, gableFillHex, 1.0, 0.92, 0.92);
          this.quad(frontEave, backEave, midB, midF, tintHex(tileHex, -0.03), 0.93, 0.93, 1.0, 1.0);
        } else {
          this.tri(innerApex, midB, midF, gableFillHex, 1.0, 0.92, 0.92);
          this.quad(backEave, frontEave, midF, midB, tintHex(tileHex, -0.03), 0.93, 0.93, 1.0, 1.0);
        }
      } else {
        // Classic Jiangnan white-wall gable triangle under overhanging eave
        const gX = cx + sxSign * (hx * 0.86);
        const gApex = [gX, yBase + riseY * 0.96, cz];
        const gF = [gX, yBase, cz + hz * 0.86];
        const gB = [gX, yBase, cz - hz * 0.86];
        if (sxSign > 0) this.tri(gF, gB, gApex, gableFillHex, 0.92, 0.92, 1.0);
        else this.tri(gB, gF, gApex, gableFillHex, 0.92, 0.92, 1.0);
      }
      // Underside soffit seal
      if (sxSign > 0) this.tri([cx, yBase + 0.02, cz], backEave, frontEave, soffitHex, 0.76, 0.82, 0.82);
      else this.tri([cx, yBase + 0.02, cz], frontEave, backEave, soffitHex, 0.76, 0.82, 0.82);
    }

    // Seal front/back underside soffit
    const cFL = evalRoofPt(-1, 1, 1), cFR = evalRoofPt(1, 1, 1);
    const cBL = evalRoofPt(-1, 1, -1), cBR = evalRoofPt(1, 1, -1);
    this.tri([cx, yBase + 0.02, cz], cFL, cFR, soffitHex, 0.76, 0.82, 0.82);
    this.tri([cx, yBase + 0.02, cz], cBR, cBL, soffitHex, 0.76, 0.82, 0.82);

    // Main Horizontal Zheng-Ji (正脊) Ridge Beam + Twin Golden Chi-Wen (鸱吻) Upturned Finials!
    const rLen = ridgeHalfX * 2 + 0.06;
    this.boxY(cx, yBase + riseY - 0.02, cz, rLen, 0.075, 0.075, ridgeHex);
    if (!opts.noFinial) {
      this.boxY(cx - ridgeHalfX - 0.02, yBase + riseY + 0.03, cz, 0.06, 0.11, 0.06, finialHex, { topScaleX: 0.5, rotZ: 0.22 });
      this.boxY(cx + ridgeHalfX + 0.02, yBase + riseY + 0.03, cz, 0.06, 0.11, 0.06, finialHex, { topScaleX: 0.5, rotZ: -0.22 });
    }
  }

  /**
   * Stepped Jiangnan / Wenzhou Horse-Head Fire-Gable Wall (`五岳朝天马头墙`)
   */
  maTouQiang(xPos, yBase, cz, depthZ, baseWallH, ridgeH, steps = 3, wallHex = 0xf4efe4, capHex = 0x2b3544) {
    const thick = 0.085;
    const halfZ = depthZ * 0.5;
    for (let s = 0; s < steps; s++) {
      const frac0 = s / steps;
      const frac1 = (s + 1) / steps;
      const zSpan = halfZ * (1 - frac0 * 0.68);
      const zPrev = s === 0 ? halfZ : halfZ * (1 - (s - 1) / steps * 0.68);
      const stepTopY = yBase + baseWallH + (ridgeH - baseWallH) * frac1 + 0.09;

      // Stepped white masonry tier
      this.boxY(xPos, yBase, cz, thick, stepTopY - yBase, zSpan * 2, wallHex);
      // Dark tile coping cap + upturned Que-Wei (鹊尾) tips at both ends!
      this.boxY(xPos, stepTopY, cz, thick + 0.035, 0.045, zSpan * 2 + 0.06, capHex);
      if (zPrev >= zSpan) {
        this.boxY(xPos, stepTopY + 0.035, cz + zSpan + 0.01, thick + 0.03, 0.055, 0.05, capHex, { rotX: -0.28 });
        this.boxY(xPos, stepTopY + 0.035, cz - zSpan - 0.01, thick + 0.03, 0.055, 0.05, capHex, { rotX: 0.28 });
      }
    }
  }

  /**
   * Extruded Battered Wall with a True Polygonal Semicircular Stone Archway (`石拱券门洞`)
   * Archway runs through X (`-thickX/2 .. +thickX/2`), spanning `archSpanZ` along Z!
   */
  extrudedArchWallX(cx, y0, cz, thickX, totalZ, wallH, archHalfZ, archSpringY, archCrownY, stoneHex, trimHex, batter = 0.06) {
    const segs = 8;
    const hz = totalZ * 0.5;
    const hxBot = thickX * 0.5;
    const hxTop = Math.max(0.12, hxBot - batter);
    const xAtY = (y) => {
      const t = Math.max(0, Math.min(1, (y - y0) / Math.max(0.01, wallH)));
      return hxBot + (hxTop - hxBot) * t;
    };

    // 1. Left (-Z) and Right (+Z) solid battered piers flanking the archway
    const pierZ = (hz - archHalfZ);
    if (pierZ > 0.02) {
      for (const sgn of [-1, 1]) {
        const pCz = cz + sgn * (archHalfZ + pierZ * 0.5);
        this.boxY(cx, y0, pCz, thickX, wallH, pierZ, stoneHex, {
          topScaleX: hxTop / hxBot,
        });
      }
    }

    // 2. Spandrel wall above the arch curve (`archSpringY .. y0 + wallH`) + inner barrel vault!
    const topY = y0 + wallH;
    const rise = Math.max(0.05, archCrownY - archSpringY);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI; // 0 (+Z) -> PI (-Z)
      const a1 = ((i + 1) / segs) * Math.PI;
      const z0 = cz + Math.cos(a0) * archHalfZ;
      const yA0 = archSpringY + Math.sin(a0) * rise;
      const z1 = cz + Math.cos(a1) * archHalfZ;
      const yA1 = archSpringY + Math.sin(a1) * rise;

      const xb0 = xAtY(yA0), xb1 = xAtY(yA1), xt = hxTop;
      // +X face spandrel quad
      this.quad(
        [cx + xb0, yA0, z0], [cx + xb1, yA1, z1], [cx + xt, topY, z1], [cx + xt, topY, z0],
        stoneHex, 0.94, 0.94, 1.02, 1.02
      );
      // -X face spandrel quad
      this.quad(
        [cx - xb1, yA1, z1], [cx - xb0, yA0, z0], [cx - xt, topY, z0], [cx - xt, topY, z1],
        stoneHex, 0.94, 0.94, 1.02, 1.02
      );
      // Top deck strip over arch
      this.quad(
        [cx - xt, topY, z0], [cx + xt, topY, z0], [cx + xt, topY, z1], [cx - xt, topY, z1],
        stoneHex, 1.03, 1.03, 1.03, 1.03
      );
      // Vaulted stone intrados (underside of arch tunnel!)
      this.quad(
        [cx - xb0, yA0, z0], [cx - xb1, yA1, z1], [cx + xb1, yA1, z1], [cx + xb0, yA0, z0],
        trimHex, 0.78, 0.82, 0.82, 0.78
      );
    }
  }

  /**
   * Sculpted Low-Poly Faceted Rock / Foliage Cluster (12-vertex icosahedron with deterministic organic jitter!)
   */
  facetedBlob(cx, cy, cz, rx, ry, rz, hexColor, seed = 1, jitter = 0.16) {
    const t = (1 + Math.sqrt(5)) / 2;
    const rawVerts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];
    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    const pts = rawVerts.map(([vx, vy, vz], idx) => {
      const len = Math.hypot(vx, vy, vz);
      const j = 1 + (voxelHash(idx, seed, 13, 37) - 0.5) * 2 * jitter;
      return [
        cx + (vx / len) * rx * j,
        cy + (vy / len) * ry * j,
        cz + (vz / len) * rz * j,
      ];
    });
    for (let i = 0; i < faces.length; i++) {
      const [a, b, c] = faces[i];
      const fCol = i % 3 === 0 ? tintHex(hexColor, 0.04) : (i % 3 === 1 ? hexColor : tintHex(hexColor, -0.05));
      const s0 = pts[a][1] < cy ? 0.88 : 1.03;
      const s1 = pts[b][1] < cy ? 0.88 : 1.03;
      const s2 = pts[c][1] < cy ? 0.88 : 1.03;
      this.tri(pts[a], pts[b], pts[c], fCol, s0, s1, s2, false);
    }
  }

  buildGeometry() {
    let geo = null;
    if (this.pos.length > 0) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
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

// Full compatibility wrapper for any grid-indexed helper while Low-Poly modules coexist or transition
export class VoxelGrid {
  constructor(sx = 8, sy = 8, sz = 8) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.cells = new Map();
  }

  set(x, y, z, hexColor, jitter = 0, emissive = false) {
    if (x < 0 || x >= this.sx || y < 0 || y >= this.sy || z < 0 || z >= this.sz) return;
    if (!hexColor && !emissive) {
      this.cells.delete(`${x | 0},${y | 0},${z | 0}`);
      return;
    }
    const c = jitter > 0 ? tintHex(hexColor, (voxelHash(x, y, z) - 0.5) * 2 * jitter) : hexColor;
    this.cells.set(`${x | 0},${y | 0},${z | 0}`, { x: x | 0, y: y | 0, z: z | 0, c, em: Boolean(emissive) });
  }

  clear(x, y, z) {
    this.cells.delete(`${x | 0},${y | 0},${z | 0}`);
  }

  box(x0, y0, z0, x1, y1, z1, hexColor, jitter = 0.02, emissive = false) {
    const ax = Math.max(0, Math.min(x0, x1)), bx = Math.min(this.sx - 1, Math.max(x0, x1));
    const ay = Math.max(0, Math.min(y0, y1)), by = Math.min(this.sy - 1, Math.max(y0, y1));
    const az = Math.max(0, Math.min(z0, z1)), bz = Math.min(this.sz - 1, Math.max(z0, z1));
    for (let y = ay; y <= by; y++) {
      for (let z = az; z <= bz; z++) {
        for (let x = ax; x <= bx; x++) this.set(x, y, z, hexColor, jitter, emissive);
      }
    }
  }

  carveBox(x0, y0, z0, x1, y1, z1) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.clear(x, y, z);
      }
    }
  }

  cylinderY(cx, cz, y0, y1, r, hexColor, jitter = 0.02) {
    const r2 = r * r;
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.sy - 1, Math.ceil(y1)); y++) {
      for (let z = Math.max(0, Math.floor(cz - r)); z <= Math.min(this.sz - 1, Math.ceil(cz + r)); z++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(this.sx - 1, Math.ceil(cx + r)); x++) {
          if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= r2) this.set(x, y, z, hexColor, jitter, false);
        }
      }
    }
  }

  sphere(cx, cy, cz, rx, ry, rz, hexColor, jitter = 0.02, thresh = 1.0) {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.sy - 1, Math.ceil(cy + ry)); y++) {
      for (let z = Math.max(0, Math.floor(cz - rz)); z <= Math.min(this.sz - 1, Math.ceil(cz + rz)); z++) {
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(this.sx - 1, Math.ceil(cx + rx)); x++) {
          const d = Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2) + Math.pow((z - cz) / rz, 2);
          if (d <= thresh) this.set(x, y, z, hexColor, jitter, false);
        }
      }
    }
  }

  countSolidVoxels() {
    return this.cells.size;
  }

  buildGeometry(unit = 0.1, originOffset = { x: -0.5, y: 0, z: -0.5 }, splitEmissive = false) {
    const pb = new PolyBuilder();
    const ox = (originOffset.x || 0) * this.sx * unit;
    const oy = (originOffset.y || 0) * this.sy * unit;
    const oz = (originOffset.z || 0) * this.sz * unit;
    this.cells.forEach(({ x, y, z, c, em }) => {
      if (
        !em &&
        this.cells.has(`${x - 1},${y},${z}`) &&
        this.cells.has(`${x + 1},${y},${z}`) &&
        this.cells.has(`${x},${y - 1},${z}`) &&
        this.cells.has(`${x},${y + 1},${z}`) &&
        this.cells.has(`${x},${y},${z - 1}`) &&
        this.cells.has(`${x},${y},${z + 1}`)
      ) {
        return;
      }
      pb.box(
        ox + (x + 0.5) * unit,
        oy + (y + 0.5) * unit,
        oz + (z + 0.5) * unit,
        unit,
        unit,
        unit,
        c,
        { emissive: splitEmissive && em }
      );
    });
    const built = pb.buildGeometry();
    return splitEmissive ? built : (built.geo || new THREE.BufferGeometry());
  }

  buildMeshGroup(unit = 0.1, originOffset = { x: -0.5, y: 0, z: -0.5 }, castShadow = true, receiveShadow = true, splitEmissive = true) {
    const res = this.buildGeometry(unit, originOffset, true);
    const group = new THREE.Group();
    if (res.geo) {
      const m = new THREE.Mesh(res.geo, getSharedVoxelMaterial());
      m.castShadow = castShadow;
      m.receiveShadow = receiveShadow;
      group.add(m);
      group.userData.mainMesh = m;
    }
    if (splitEmissive && res.emissiveGeo) {
      const em = new THREE.Mesh(res.emissiveGeo, getSharedEmissiveMaterial());
      em.userData.noOutline = true;
      group.add(em);
    }
    group.userData.voxelCount = res.voxelCount;
    return group;
  }
}
