import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { DIORAMA_LOOK } from './renderStyle.js';

export const atmosphereTime = { value: 0 };

const QUAD_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function createNormalDepthMaterial() {
  return new THREE.ShaderMaterial({
    name: 'ToonNormalDepthMaterial',
    uniforms: {
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 180.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vViewNormal;
      varying float vViewDepth;
      vec3 safeNorm3(vec3 v) {
        float l = length(v);
        return l > 1e-5 ? (v / l) : vec3(0.0, 0.0, 1.0);
      }
      void main() {
        vec3 transformedNormal = vec3(normal);
        #ifdef USE_INSTANCING
          mat3 im = mat3(instanceMatrix);
          vec3 colLenSq = vec3(
            max(dot(im[0], im[0]), 1e-6),
            max(dot(im[1], im[1]), 1e-6),
            max(dot(im[2], im[2]), 1e-6)
          );
          transformedNormal = im * (transformedNormal / colLenSq);
        #endif
        transformedNormal = normalMatrix * transformedNormal;
        vViewNormal = safeNorm3(transformedNormal);

        vec4 mvPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        vViewDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uCameraNear;
      uniform float uCameraFar;
      varying vec3 vViewNormal;
      varying float vViewDepth;
      vec3 safeNorm3(vec3 v) {
        float l = length(v);
        return l > 1e-5 ? (v / l) : vec3(0.0, 0.0, 1.0);
      }
      vec2 octEncode(vec3 n) {
        float denom = max(abs(n.x) + abs(n.y) + abs(n.z), 1e-5);
        vec2 p = n.xy / denom;
        if (n.z < 0.0) {
          vec2 s = vec2(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0);
          p = (1.0 - abs(p.yx)) * s;
        }
        return p * 0.5 + 0.5;
      }
      void main() {
        vec3 n = safeNorm3(vViewNormal);
        if (!gl_FrontFacing) n = -n;
        vec2 encN = clamp(octEncode(n), 0.0, 1.0);
        float span = max(0.001, uCameraFar - uCameraNear);
        float dNorm = clamp((vViewDepth - uCameraNear) / span, 0.0, 1.0);
        float d16 = floor(dNorm * 65533.0 + 2.5);
        float hi = floor(d16 / 256.0);
        float lo = d16 - hi * 256.0;
        gl_FragColor = vec4(encN, hi / 255.0, lo / 255.0);
      }
    `,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: true,
  });
}

function createDepthMaskMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      void main() {
        vec4 mvPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      void main() {
        gl_FragColor = vec4(0.5, 0.5, 0.0, 1.0 / 255.0);
      }
    `,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: true,
  });
}

function visitExcludedForOutline(obj, hidden, depthMasks) {
  if (!obj.visible) return;
  if (obj.userData.outlineDepthMask) {
    depthMasks.push(obj);
    obj.visible = false;
    hidden.push(obj);
    return;
  }
  if (obj.userData.noOutline) {
    obj.visible = false;
    hidden.push(obj);
    return;
  }
  if (obj.isPoints || obj.isSprite || obj.isLine || obj.isLineSegments) {
    obj.visible = false;
    hidden.push(obj);
    return;
  }
  if (obj.isMesh && obj.material && !Array.isArray(obj.material)) {
    const mat = obj.material;
    if ((mat.transparent && (mat.opacity < 0.75 || !mat.depthWrite)) || mat.isMeshBasicMaterial) {
      obj.visible = false;
      hidden.push(obj);
      return;
    }
  }
  for (let i = 0; i < obj.children.length; i++) {
    visitExcludedForOutline(obj.children[i], hidden, depthMasks);
  }
}

export class ToonOutlinePass extends Pass {
  constructor(scene, camera, width, height, pixelRatio) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.pixelRatio = pixelRatio;
    this.normalDepthMat = createNormalDepthMaterial();
    this.depthMaskMat = createDepthMaskMaterial();

    const bw = Math.max(1, Math.round(width * pixelRatio));
    const bh = Math.max(1, Math.round(height * pixelRatio));
    this.rtNormalDepth = new THREE.WebGLRenderTarget(bw, bh, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.outlineMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tNormalDepth: { value: null },
        uTexel: { value: new THREE.Vector2(1 / bw, 1 / bh) },
        uStepPx: { value: 1.0 },
        uCameraNear: { value: 0.1 },
        uCameraFar: { value: 180.0 },
        uIsOrtho: { value: 1.0 },
        uWorldScale: { value: 0.02 },
        // Subtle Gongbi/Woodblock silhouette crease (grounded historical look — NOT heavy comic-book ink!)
        uDepthBase: { value: 0.58 },
        uDepthStrength: { value: DIORAMA_LOOK.post.outline },
        uNormalStrength: { value: 0.0 },
        uCreaseFade: { value: 0.0 },
        uInkBase: { value: new THREE.Vector3(0.085, 0.062, 0.045) },
        uProjectionInverse: { value: new THREE.Matrix4() },
        uContactRadius: { value: DIORAMA_LOOK.post.contactRadius },
        uContactStrength: { value: DIORAMA_LOOK.post.contactStrength },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tNormalDepth;
        uniform vec2 uTexel;
        uniform float uStepPx;
        uniform float uCameraNear;
        uniform float uCameraFar;
        uniform float uIsOrtho;
        uniform float uWorldScale;
        uniform float uDepthBase;
        uniform float uDepthStrength;
        uniform float uNormalStrength;
        uniform float uCreaseFade;
        uniform vec3 uInkBase;
        uniform mat4 uProjectionInverse;
        uniform float uContactRadius;
        uniform float uContactStrength;
        varying vec2 vUv;

        vec3 safeNorm3(vec3 v) {
          float l = length(v);
          return l > 1e-5 ? (v / l) : vec3(0.0, 0.0, 1.0);
        }
        vec3 octDecode(vec2 e) {
          vec2 p = e * 2.0 - 1.0;
          vec3 n = vec3(p.x, p.y, 1.0 - abs(p.x) - abs(p.y));
          if (n.z < 0.0) {
            vec2 s = vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
            n.xy = (1.0 - abs(n.yx)) * s;
          }
          return safeNorm3(n);
        }
        float unpackDepth16(vec2 ba) {
          return floor(ba.x * 255.0 + 0.5) * 256.0 + floor(ba.y * 255.0 + 0.5);
        }
        float decodeLinearDepth(float d16) {
          float dNorm = clamp((d16 - 2.0) / 65533.0, 0.0, 1.0);
          return uCameraNear + dNorm * (uCameraFar - uCameraNear);
        }
        vec3 viewPosition(vec2 uv, float depth) {
          vec4 p = uProjectionInverse * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
          p.xyz /= p.w;
          return uIsOrtho > 0.5 ? vec3(p.xy, -depth) : p.xyz * (depth / -p.z);
        }
        // Reuse the outline depth/normal prepass. A fixed world-space radius
        // keeps contact shading the same size through zoom and high-DPI resize.
        float contactOcclusion(vec3 position, vec3 normal, float worldPerPixel) {
          float radiusPx = max(uContactRadius / max(worldPerPixel, 0.0001), 1.0);
          float occlusion = 0.0;
          for (int i = 0; i < 8; i++) {
            float angle = float(i) * 2.39996323;
            float reach = sqrt((float(i) + 0.5) / 8.0);
            vec2 uv = vUv + vec2(cos(angle), sin(angle)) * reach * radiusPx * uTexel;
            if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) continue;
            float packed = unpackDepth16(texture2D(tNormalDepth, uv).ba);
            if (packed < 1.5) continue;
            vec3 delta = viewPosition(uv, decodeLinearDepth(packed)) - position;
            float distance = length(delta);
            float horizon = max(dot(normal, delta) / max(distance, 0.001) - 0.12, 0.0);
            float falloff = 1.0 - smoothstep(uContactRadius * 0.15, uContactRadius, distance);
            occlusion += horizon * falloff;
          }
          return min(0.36, occlusion * (uContactStrength / 8.0));
        }
        vec3 sanitizeHdr(vec3 c) {
          vec3 safe = vec3(
            (c.r == c.r && abs(c.r) < 65000.0) ? c.r : 0.0,
            (c.g == c.g && abs(c.g) < 65000.0) ? c.g : 0.0,
            (c.b == c.b && abs(c.b) < 65000.0) ? c.b : 0.0
          );
          return max(safe, vec3(0.0));
        }

        void main() {
          vec4 src = texture2D(tDiffuse, vUv);
          vec3 baseRgb = sanitizeHdr(src.rgb);

          vec2 ox = vec2(uTexel.x * uStepPx, 0.0);
          vec2 oy = vec2(0.0, uTexel.y * uStepPx);
          vec4 sC = texture2D(tNormalDepth, vUv);
          float kC = unpackDepth16(sC.ba);

          // Cloud border depth mask: never draw ink outlines on billowy clouds!
          if (kC > 0.5 && kC < 1.5) {
            gl_FragColor = vec4(baseRgb, 1.0);
            return;
          }

          vec4 sL = texture2D(tNormalDepth, vUv - ox);
          vec4 sR = texture2D(tNormalDepth, vUv + ox);
          vec4 sT = texture2D(tNormalDepth, vUv + oy);
          vec4 sB = texture2D(tNormalDepth, vUv - oy);

          float kL = unpackDepth16(sL.ba);
          float kR = unpackDepth16(sR.ba);
          float kT = unpackDepth16(sT.ba);
          float kB = unpackDepth16(sB.ba);

          float mC = kC > 1.5 ? 1.0 : 0.0;
          float mL = kL > 1.5 ? 1.0 : 0.0;
          float mR = kR > 1.5 ? 1.0 : 0.0;
          float mT = kT > 1.5 ? 1.0 : 0.0;
          float mB = kB > 1.5 ? 1.0 : 0.0;

          float dC = decodeLinearDepth(kC);
          float dL = decodeLinearDepth(kL);
          float dR = decodeLinearDepth(kR);
          float dT = decodeLinearDepth(kT);
          float dB = decodeLinearDepth(kB);

          if (mC > 0.5 && uContactStrength > 0.0) {
            float wpp = uIsOrtho > 0.5 ? uWorldScale : dC * uWorldScale;
            float contact = contactOcclusion(viewPosition(vUv, dC), octDecode(sC.rg), wpp);
            baseRgb *= vec3(1.0) - contact * vec3(1.0, 0.94, 0.85);
          }

          float minD = mC > 0.5 ? dC : 1e6;
          vec2 fgUv = vUv;
          if (mL > 0.5 && dL < minD) { minD = dL; fgUv = vUv - ox; }
          if (mR > 0.5 && dR < minD) { minD = dR; fgUv = vUv + ox; }
          if (mT > 0.5 && dT < minD) { minD = dT; fgUv = vUv + oy; }
          if (mB > 0.5 && dB < minD) { minD = dB; fgUv = vUv - oy; }

          float edge = 0.0;
          if (mC < 0.5) {
            float anyFg = max(max(mL, mR), max(mT, mB));
            edge = anyFg > 0.5 ? uDepthStrength : 0.0;
          } else {
            vec3 nC = octDecode(sC.rg);
            vec3 nL = mL > 0.5 ? octDecode(sL.rg) : nC;
            vec3 nR = mR > 0.5 ? octDecode(sR.rg) : nC;
            vec3 nT = mT > 0.5 ? octDecode(sT.rg) : nC;
            vec3 nB = mB > 0.5 ? octDecode(sB.rg) : nC;

            float wpp = uIsOrtho > 0.5 ? uWorldScale : (minD * uWorldScale);
            float stepWorld = uStepPx * wpp;
            float slopeXC = abs(nC.x) / max(abs(nC.z), 0.22);
            float slopeYC = abs(nC.y) / max(abs(nC.z), 0.22);
            float slopeXL = abs(nL.x) / max(abs(nL.z), 0.22);
            float slopeXR = abs(nR.x) / max(abs(nR.z), 0.22);
            float slopeYT = abs(nT.y) / max(abs(nT.z), 0.22);
            float slopeYB = abs(nB.y) / max(abs(nB.z), 0.22);

            float baseMargin = max(uDepthBase, stepWorld * 2.6);
            float threshL = baseMargin + stepWorld * max(slopeXC, slopeXL) * 1.5;
            float threshR = baseMargin + stepWorld * max(slopeXC, slopeXR) * 1.5;
            float threshT = baseMargin + stepWorld * max(slopeYC, slopeYT) * 1.5;
            float threshB = baseMargin + stepWorld * max(slopeYC, slopeYB) * 1.5;

            float eL = mL > 0.5 ? smoothstep(threshL, threshL * 1.9, dC - dL) : 0.0;
            float eR = mR > 0.5 ? smoothstep(threshR, threshR * 1.9, dC - dR) : 0.0;
            float eT = mT > 0.5 ? smoothstep(threshT, threshT * 1.9, dC - dT) : 0.0;
            float eB = mB > 0.5 ? smoothstep(threshB, threshB * 1.9, dC - dB) : 0.0;
            float depthEdge = max(max(eL, eR), max(eT, eB));

            float sameR = mR > 0.5 ? (1.0 - smoothstep(threshR * 0.7, threshR * 1.3, abs(dC - dR))) : 0.0;
            float sameB = mB > 0.5 ? (1.0 - smoothstep(threshB * 0.7, threshB * 1.3, abs(dC - dB))) : 0.0;
            float nDiffR = (1.0 - clamp(dot(nC, nR), -1.0, 1.0)) * sameR;
            float nDiffB = (1.0 - clamp(dot(nC, nB), -1.0, 1.0)) * sameB;
            float normalEdge = smoothstep(0.28, 0.55, max(nDiffR, nDiffB)) * uCreaseFade;

            edge = max(depthEdge * uDepthStrength, normalEdge * uNormalStrength);
          }

          if (edge < 0.005) {
            gl_FragColor = vec4(baseRgb, 1.0);
            return;
          }
          vec3 fgCol = clamp(sanitizeHdr(texture2D(tDiffuse, fgUv).rgb), 0.0, 1.8);
          vec3 inkCol = mix(fgCol * 0.22, uInkBase, 0.50);
          gl_FragColor = vec4(mix(baseRgb, inkCol, clamp(edge, 0.0, 0.88)), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quadMesh = new THREE.Mesh(this.quadGeo, this.outlineMat);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quadMesh);
    this.hiddenList = [];
    this.maskList = [];
    this.savedClearColor = new THREE.Color();
  }

  setSize(width, height) {
    // EffectComposer passes physical pixels, including device pixel ratio.
    const bw = Math.max(1, Math.round(width));
    const bh = Math.max(1, Math.round(height));
    this.rtNormalDepth.setSize(bw, bh);
    this.outlineMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
  }

  render(renderer, writeBuffer, readBuffer) {
    const bw = this.rtNormalDepth.width;
    const bh = this.rtNormalDepth.height;

    if (this.camera.isOrthographicCamera) {
      const frustumH = Math.abs(this.camera.top - this.camera.bottom) / Math.max(0.001, this.camera.zoom);
      const wpp = frustumH / Math.max(1, bh);
      this.outlineMat.uniforms.uIsOrtho.value = 1.0;
      this.outlineMat.uniforms.uWorldScale.value = wpp;
      const t = Math.max(0, Math.min(1, (wpp - 0.015) / 0.03));
      this.outlineMat.uniforms.uCreaseFade.value = 0.85 * (1.0 - t * 0.55);
    } else {
      const halfFovRad = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
      this.outlineMat.uniforms.uIsOrtho.value = 0.0;
      this.outlineMat.uniforms.uWorldScale.value = (2.0 * Math.tan(halfFovRad)) / Math.max(1, bh);
    }
    this.outlineMat.uniforms.uCameraNear.value = this.camera.near;
    this.outlineMat.uniforms.uCameraFar.value = this.camera.far;
    this.outlineMat.uniforms.uProjectionInverse.value.copy(this.camera.projectionMatrixInverse);
    this.normalDepthMat.uniforms.uCameraNear.value = this.camera.near;
    this.normalDepthMat.uniforms.uCameraFar.value = this.camera.far;

    const prevOverride = this.scene.overrideMaterial;
    const prevBg = this.scene.background;
    renderer.getClearColor(this.savedClearColor);
    const prevClearAlpha = renderer.getClearAlpha();
    const prevShadowAuto = renderer.shadowMap.autoUpdate;

    visitExcludedForOutline(this.scene, this.hiddenList, this.maskList);

    renderer.shadowMap.autoUpdate = false;
    this.scene.background = null;
    this.scene.overrideMaterial = this.normalDepthMat;
    renderer.setRenderTarget(this.rtNormalDepth);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);

    if (this.maskList.length > 0) {
      const maskScene = new THREE.Scene();
      maskScene.overrideMaterial = this.depthMaskMat;
      const prevParents = this.maskList.map((m) => m.parent);
      this.maskList.forEach((m) => {
        m.visible = true;
        maskScene.add(m);
      });
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(maskScene, this.camera);
      renderer.autoClear = prevAutoClear;
      this.maskList.forEach((m, idx) => {
        if (prevParents[idx]) prevParents[idx].add(m);
      });
      this.maskList.length = 0;
    }

    for (let i = 0; i < this.hiddenList.length; i++) {
      this.hiddenList[i].visible = true;
    }
    this.hiddenList.length = 0;

    this.scene.overrideMaterial = prevOverride;
    this.scene.background = prevBg;
    renderer.setClearColor(this.savedClearColor, prevClearAlpha);
    renderer.shadowMap.autoUpdate = prevShadowAuto;

    this.outlineMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.outlineMat.uniforms.tNormalDepth.value = this.rtNormalDepth.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    renderer.render(this.quadScene, QUAD_CAMERA);
  }
}

// Fused ACES + Saturation + Split-Toning + Soft Vignette Grade (from My Civilization postfx.ts!)
const DioramaFinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: DIORAMA_LOOK.day.exposure },
    uTime: { value: 0 },
    uSaturation: { value: DIORAMA_LOOK.day.saturation },
    uContrast: { value: DIORAMA_LOOK.day.contrast },
    uVignette: { value: DIORAMA_LOOK.post.vignette },
    uGrain: { value: DIORAMA_LOOK.post.grain },
    uShadowTint: { value: new THREE.Vector3(...DIORAMA_LOOK.day.shadowTint) },
    uHighlightTint: { value: new THREE.Vector3(...DIORAMA_LOOK.day.highlightTint) },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uTime;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAspect;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    varying vec2 vUv;

    vec3 rrtOdtFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 acesTone(vec3 color) {
      const mat3 dInMat = mat3(
        vec3(0.59719, 0.07600, 0.02840),
        vec3(0.35458, 0.90834, 0.13383),
        vec3(0.04823, 0.01566, 0.83777));
      const mat3 dOutMat = mat3(
        vec3( 1.60475, -0.10208, -0.00327),
        vec3(-0.53108,  1.10813, -0.07276),
        vec3(-0.07367, -0.00605,  1.07602));
      color *= uExposure / 0.6;
      color = dInMat * color;
      color = rrtOdtFit(color);
      color = dOutMat * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c));
    }
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 safeRgb = max(src.rgb, vec3(0.0));
      vec3 c = toSRGB(acesTone(safeRgb));
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      c += mix(uShadowTint, uHighlightTint, smoothstep(0.15, 0.85, luma));
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0) / max(uAspect, 1.0);
      float vig = smoothstep(0.35, 0.96, length(q) * 1.15);
      c = mix(c, c * vec3(0.68, 0.74, 0.85), vig * uVignette * 1.4);
      c += (hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 913.0) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export class DioramaPostFx {
  constructor(renderer, scene, camera, width, height) {
    this.renderer = renderer;
    const pr = renderer.getPixelRatio();
    const bw = Math.max(1, Math.floor(width * pr));
    const bh = Math.max(1, Math.floor(height * pr));

    const rt = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: Math.min(DIORAMA_LOOK.post.samples, renderer.capabilities.maxSamples),
    });
    this.composer = new EffectComposer(renderer, rt);
    // A supplied target sets the composer's logical size. Apply DPR once here.
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(scene, camera));

    this.outlinePass = new ToonOutlinePass(scene, camera, width, height, pr);
    this.composer.addPass(this.outlinePass);

    // Selective HDR Bloom: threshold 1.72 linear so ONLY true HDR emissives (fire, braziers, stained-glass & sun sparkles) glow!
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(bw, bh),
      DIORAMA_LOOK.post.bloomStrength,
      DIORAMA_LOOK.post.bloomRadius,
      DIORAMA_LOOK.post.bloomThreshold
    );
    this.composer.addPass(this.bloomPass);

    this.finalPass = new ShaderPass(DioramaFinalShader);
    this.finalPass.uniforms.uAspect.value = width / Math.max(1, height);
    this.composer.addPass(this.finalPass);
  }

  setSize(width, height) {
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(width, height);
    this.finalPass.uniforms.uAspect.value = width / Math.max(1, height);
  }

  render(dt) {
    this.finalPass.uniforms.uTime.value += dt;
    const prevTone = this.renderer.toneMapping;
    const prevOutput = this.renderer.outputColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    try {
      this.composer.render(dt);
    } finally {
      this.renderer.toneMapping = prevTone;
      this.renderer.outputColorSpace = prevOutput;
    }
  }
}

// Curved, moving ripple contours retain the original illustrated water language.
// Filter the contours before shading; highlights still follow the scene lights.
export function applyStylizedWaterShader(mat) {
  mat.customProgramCacheKey = () => 'yongchang-water-v5';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = atmosphereTime;
    shader.uniforms.uDeepColor = { value: new THREE.Color(DIORAMA_LOOK.water.deep) };
    shader.uniforms.uShallowColor = { value: new THREE.Color(DIORAMA_LOOK.water.shallow) };
    shader.uniforms.uContourStrength = { value: DIORAMA_LOOK.water.contourStrength };
    shader.uniforms.uNormalStrength = { value: DIORAMA_LOOK.water.normalStrength };
    shader.uniforms.uFoamStrength = { value: DIORAMA_LOOK.water.foamStrength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aShore;\nvarying vec3 vWaterWorld;\nvarying float vShore;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 wWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wWorld = instanceMatrix * wWorld;
        #endif
        vWaterWorld = (modelMatrix * wWorld).xyz;
        vShore = aShore;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWaterTime;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform float uContourStrength;
        uniform float uNormalStrength;
        uniform float uFoamStrength;
        varying vec3 vWaterWorld;
        varying float vShore;
        float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x),
                     mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float waterHeight(vec2 p, float t) {
          return wNoise(p * 0.72 + vec2(t * 0.16, -t * 0.11)) * 0.62
               + wNoise(p * 1.85 - vec2(t * 0.22, t * 0.09)) * 0.38;
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 wP = vWaterWorld.xz;
        float wT = uWaterTime;
        float wN = waterHeight(wP, wT);
        float depthWave = smoothstep(0.22, 0.8, wNoise(wP * 0.18));
        float shallow = clamp(vShore * 0.85 + 0.16 + (1.0 - depthWave) * 0.22, 0.0, 1.0);
        diffuseColor.rgb = mix(uDeepColor, uShallowColor, shallow);
        float contourPhase = wN * 3.6 + wT * 0.06;
        float contourWidth = fwidth(contourPhase);
        float contour = abs(fract(contourPhase) - 0.5);
        float ripple = 1.0 - smoothstep(0.018, 0.048 + contourWidth, contour);
        float rippleFilter = 1.0 - smoothstep(0.16, 0.55, contourWidth);
        // Open sea has broad quiet patches. Narrow canals retain the legible
        // continuous contours of the original style at the normal play zoom.
        float openWater = smoothstep(0.28, 0.70, wNoise(wP * 0.23 + vec2(wT * 0.025, 0.0)));
        float rippleCoverage = mix(0.16 + openWater * 0.65, 1.0, vShore);
        diffuseColor.rgb += vec3(0.76, 0.80, 0.75) * ripple * rippleFilter * rippleCoverage * uContourStrength;
        if (vShore > 0.02) {
          float lap = 0.5 + 0.5 * sin(wT * 1.3 - vShore * 9.0 + wN * 4.0);
          float foam = smoothstep(0.40, 0.90, vShore) * (0.55 + lap * 0.45) * uFoamStrength;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.60, 0.68, 0.61), foam);
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Normals come from the same curved wave field, avoiding the old
          // map-wide pair of straight specular stripes.
          float sampleSpan = max(0.09, length(fwidth(wP)));
          vec2 slope = vec2(
            waterHeight(wP + vec2(sampleSpan, 0.0), wT) - waterHeight(wP - vec2(sampleSpan, 0.0), wT),
            waterHeight(wP + vec2(0.0, sampleSpan), wT) - waterHeight(wP - vec2(0.0, sampleSpan), wT)
          ) * (uNormalStrength / (2.0 * sampleSpan));
          vec3 waveNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
          normal = normalize((viewMatrix * vec4(waveNormal, 0.0)).xyz);
        }`
      );
  };
  mat.needsUpdate = true;
}

// My Civilization's Billowy Sea-of-Clouds Framing Border & Non-Overlapping Outer Azure Ocean!
export function createDioramaCloudSeaAndOcean(scene, mapW, mapH, { eastOnly = false } = {}) {
  // 4-piece collar East China Sea strictly OUTSIDE map bounds (natural slate-jade sea, no toy cotton-ball clouds!)
  const oceanMat = new THREE.MeshStandardMaterial({
    color: '#2b474d',
    roughness: DIORAMA_LOOK.water.roughness,
    envMapIntensity: DIORAMA_LOOK.water.environment,
    metalness: 0.0,
  });
  applyStylizedWaterShader(oceanMat);

  const hw = mapW / 2 + 0.25;
  const hh = mapH / 2 + 0.25;
  const pad = 110;
  const oceanStrips = eastOnly ? [
    [mapW / 2 + pad / 2, 0, pad, mapH + pad * 2],
  ] : [
    [0, -(hh + pad / 2), mapW + pad * 2, pad],
    [0, hh + pad / 2, mapW + pad * 2, pad],
    [-(hw + pad / 2), 0, pad, mapH + 0.5],
    [hw + pad / 2, 0, pad, mapH + 0.5],
  ];
  oceanStrips.forEach(([ox, oz, w, h]) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateX(-Math.PI / 2);
    g.setAttribute('aShore', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    const m = new THREE.Mesh(g, oceanMat);
    m.position.set(ox, -0.34, oz);
    m.receiveShadow = true;
    m.userData.noOutline = true;
    scene.add(m);
  });
}
