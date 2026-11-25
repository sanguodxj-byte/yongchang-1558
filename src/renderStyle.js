// Shared art direction for the live world. Colours are authored in sRGB;
// THREE.Color converts them to linear light before shading.
export const DIORAMA_LOOK = {
  day: {
    horizon: '#b0a695', keyColor: '#ffe8c2', skyColor: '#dfd6c5', groundColor: '#6d694b',
    key: 2.55, hemisphere: 0.48, ambient: 0.11, rim: 0.28, environment: 0.20,
    exposure: 1.02, saturation: 0.99, contrast: 1.06,
    shadowTint: [-0.012, 0.002, 0.016], highlightTint: [0.022, 0.009, -0.014],
    fogNear: 54, fogFar: 116,
  },
  night: {
    horizon: '#16202e', keyColor: '#94b8e4', skyColor: '#829cc8', groundColor: '#3a4949',
    key: 0.82, hemisphere: 0.42, ambient: 0.065, rim: 0.20, environment: 0.12,
    exposure: 1.02, saturation: 0.94, contrast: 1.035,
    shadowTint: [-0.008, 0.002, 0.016], highlightTint: [0.002, 0.006, 0.012],
    fogNear: 50, fogFar: 105,
  },
  post: {
    samples: 4, bloomStrength: 0.26, bloomRadius: 0.40, bloomThreshold: 1.72,
    vignette: 0.13, grain: 0, outline: 0.20,
    contactRadius: 0.64, contactStrength: 1.65,
  },
  water: { shallow: '#67978a', deep: '#244e56', roughness: 0.38, environment: 0.45 },
  shadow: { mapSize: 2048, extent: 26, radius: 2.4, bias: -0.00025, normalBias: 0.028 },
};
