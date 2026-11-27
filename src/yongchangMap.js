// Historical relationships and deliberate gameplay compression are documented
// in docs/yongchang-map.md. All terrain, navigation and landmark positions use
// this grid (north = -Z, east = +X); coordinates are not historical metres.
export const YONGCHANG_MAP = {
  width: 160, height: 96,
  fort: { west: 28, east: 64, north: 18, south: 78 },
  // A possible future settlement footprint, never a prebuilt defence ring.
  village: { homes:[[41,42],[41,46],[49,43],[50,47]] },
  playerKeep: [43, 43], campfire: [48, 45], stockpile: [43, 39],
  armory: [49, 40], granary: [49, 51],
  enemyKeep: [130,45], enemyTowers: [[123,43],[123,55]], enemyGuard: [127,50],
  island: { x:130,z:48,rx:16,rz:19 },
  ports: {
    mainland:{ pier:[94,48,102,51],rally:[100,49],landing:[99,49],boat:[104.5,49.5] },
    island:{ pier:[114,48,121,51],rally:[117,49],landing:[117,49],boat:[111.5,49.5] },
    north:{pier:[94,21,103,24],landing:[100,22],boat:[105.5,22.5]},
  },
  attacks: { east:[95,49], north:[95,22], artillery:[95,50] },
  gates: [
    { id: 'east', name: '环海门', gx: 64, gz: 48, rotation: 0, outside: [77, 51] },
    { id: 'south', name: '迎川门', gx: 45, gz: 78, rotation: 1, outside: [45, 86] },
    { id: 'west', name: '镇山门', gx: 28, gz: 48, rotation: 0, outside: [21, 48] },
    { id: 'north', name: '通市门', gx: 45, gz: 18, rotation: 1, outside: [45, 11] },
  ],
  canals: [{ name: '上河', x0: 37, x1: 39, crossings: [28,48,68] },
    { name: '下河', x0: 53, x1: 55, crossings: [48,68] }],
  fields: [[30,57,36,73],[40,59,44,74],[48,59,52,74],[57,64,62,74],
    [30,23,35,31],[78,66,93,79],[78,27,91,39]],
  deposits: { stone: [[20,39],[21,41],[20,43],[22,40]],
    iron: [[20,62],[21,64],[23,63]], pitch: [[80,65],[82,65]] },
  camera: { home:[46,47],overview:[76,48],zoom:26,overviewZoom:115,maxZoom:135 },
  buildLimitX: 83,
};

export const insideRect = (x, z, [x0,z0,x1,z1], margin = 0) =>
  x >= x0 - margin && x < x1 + margin && z >= z0 - margin && z < z1 + margin;

export function insideFort(x, z, margin = 0) {
  const f = YONGCHANG_MAP.fort;
  return insideRect(x,z,[f.west,f.north,f.east+1,f.south+1],margin);
}

export const MAP_BRIDGES = [
  ...YONGCHANG_MAP.canals.flatMap(c => c.crossings.map(z => ({
    name: `${c.name}·乡桥`,
    rect: [c.x0-1,z,c.x1+1,z+2], axis: 'x',
  }))),
];

export function bridgeAt(x,z) {
  return MAP_BRIDGES.find(b => insideRect(x,z,b.rect))
    || Object.values(YONGCHANG_MAP.ports).find(p=>p.pier && insideRect(x,z,p.pier));
}

export function islandRadius(x,z) {
  const i=YONGCHANG_MAP.island,dx=(x-i.x)/i.rx,dz=(z-i.z)/i.rz;
  const angle=Math.atan2(dz,dx);
  return Math.hypot(dx,dz)/(1+0.07*Math.sin(angle*3+.8)+.035*Math.cos(angle*7));
}

export function canalAt(x,z) {
  if (z < 14 || z >= 84) return false;
  if (YONGCHANG_MAP.canals.some(c => x >= c.x0 && x < c.x1)) return true;
  // Irrigation offshoots, not the fully developed historical ten-branch town.
  return [32,62].some(bz => z >= bz && z < bz+1 && x >= 33 && x < 37)
    || [58,73].some(bz => z >= bz && z < bz+1 && x >= 55 && x < 60);
}

const roadRects = [
  [18,48,96,50], [45,8,47,88],
  [35,27,37,70], [55,47,57,72],
  [92,21,97,51], [82,21,97,24], [80,10,83,24], [45,9,83,12],
  [19,38,23,65], [19,39,28,42], [19,62,28,65],
  [76,62,84,65], [76,51,79,66],
];

export function isMapRoad(x,z) {
  if (bridgeAt(x,z)) return true;
  if(insideRect(x,z,[118,48,139,52]) || insideRect(x,z,[125,37,128,61]))return true;
  if (roadRects.some(r => insideRect(x,z,r))) return true;
  return YONGCHANG_MAP.canals.some(c => c.crossings.some(bz =>
    insideRect(x,z,[c.x0-3,bz,c.x1+3,bz+2])));
}

export function isMapPlaza(x,z) {
  return insideRect(x,z,[42,42,50,48]) || insideRect(x,z,[123,40,138,59]);
}

export function isMapField(x,z) {
  return YONGCHANG_MAP.fields.some(r => insideRect(x,z,r));
}

export function mapWaterAt(x,z) {
  const coast = 100 + Math.sin(z * 0.085) * 2.2;
  const island=islandRadius(x,z)<1;
  return { water:canalAt(x,z)||(x>coast&&!island),coast,island };
}

export function reservedForAccess(x,z) {
  if (isMapPlaza(x,z) || isMapField(x,z) || bridgeAt(x,z)) return true;
  if (roadRects.some(r => insideRect(x,z,r,0.8))) return true;
  if(x>108)return true; // Island planting is authored around its harbour lanes.
  return insideRect(x,z,[39,36,52,53]);
}
